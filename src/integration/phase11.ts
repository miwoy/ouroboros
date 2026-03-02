/**
 * 阶段十一集成测试 — 系统状态持久化与恢复
 *
 * 验证：
 * 1. 状态快照创建与保存
 * 2. 快照完整性校验
 * 3. 状态恢复（模拟中断恢复场景）
 * 4. 优雅关闭处理器
 * 5. 过期快照清理
 * 6. 5步任务中断与恢复（核心场景）
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  createSnapshot,
  serializeSnapshot,
  deserializeSnapshot,
  isCompatibleVersion,
  isWithinTTL,
  countActiveAgents,
  countCompletedSteps,
} from "../persistence/snapshot.js";
import {
  computeChecksum,
  verifyChecksum,
  createIntegrityRecord,
  verifySnapshotIntegrity,
} from "../persistence/integrity.js";
import { createPersistenceManager } from "../persistence/manager.js";
import { createRecoveryManager, pauseWorkingNodes } from "../persistence/recovery.js";
import { createShutdownHandler } from "../persistence/shutdown.js";
import {
  DEFAULT_PERSISTENCE_CONFIG,
  SNAPSHOT_SCHEMA_VERSION,
  type PersistenceDeps,
  type PersistenceConfig,
} from "../persistence/types.js";
import { createExecutionTree, addNode, completeNode } from "../core/execution-tree.js";
import { NodeType, TaskState, TreeState } from "../core/types.js";
import type { Logger } from "../logger/types.js";

// ─── 辅助函数 ──────────────────────────────────────────────

const logs: string[] = [];

function createTestLogger(): Logger {
  return {
    debug: (_s, m) => logs.push(`[DEBUG] ${m}`),
    info: (_s, m) => logs.push(`[INFO] ${m}`),
    warn: (_s, m) => logs.push(`[WARN] ${m}`),
    error: (_s, m) => logs.push(`[ERROR] ${m}`),
  };
}

function ok(label: string): void {
  console.log(`  ✅ ${label}`);
}

function fail(label: string, err: unknown): void {
  console.error(`  ❌ ${label}: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  console.log("\n🧪 阶段十一集成测试 — 系统状态持久化与恢复\n");

  const workDir = join(tmpdir(), `ouro-phase11-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const logger = createTestLogger();
  const deps: PersistenceDeps = {
    logger,
    workspacePath: workDir,
    config: DEFAULT_PERSISTENCE_CONFIG,
  };

  try {
    // ─── [1] 快照创建与序列化 ──────────────────────
    try {
      const snapshot = createSnapshot({
        trigger: "tool-completed",
        startTime: Date.now() - 10000,
        taskDescription: "5步文件创建任务",
        agents: [
          {
            agentId: "agent-writer",
            name: "FileWriter",
            executionTree: null,
            hotSessionSnapshot: ["创建文件1", "创建文件2"],
            childAgentIds: [],
            status: "running",
          },
        ],
        rootAgentIds: ["agent-writer"],
      });

      if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error("版本不匹配");
      if (!snapshot.snapshotId) throw new Error("无快照 ID");
      if (snapshot.metadata.uptimeMs <= 0) throw new Error("运行时长异常");

      const json = serializeSnapshot(snapshot);
      const restored = deserializeSnapshot(json);
      if (restored.snapshotId !== snapshot.snapshotId) throw new Error("序列化/反序列化不一致");
      if (!isCompatibleVersion(snapshot)) throw new Error("版本兼容性检查失败");

      ok("[1] 快照创建与序列化");
    } catch (e) {
      fail("[1] 快照创建与序列化", e);
    }

    // ─── [2] 完整性校验 ──────────────────────
    try {
      const data = '{"test":"integrity"}';
      const checksum = computeChecksum(data);
      if (!verifyChecksum(data, checksum)) throw new Error("校验和验证失败");
      if (verifyChecksum("tampered", checksum)) throw new Error("篡改数据应失败");

      const record = createIntegrityRecord("test.json", data);
      if (record.checksum !== checksum) throw new Error("记录校验和不匹配");
      if (record.fileSize !== Buffer.byteLength(data, "utf-8")) throw new Error("文件大小不匹配");

      ok("[2] 完整性校验");
    } catch (e) {
      fail("[2] 完整性校验", e);
    }

    // ─── [3] 持久化管理器 CRUD ──────────────────────
    try {
      const pm = createPersistenceManager(deps);

      // 保存
      const snap1 = createSnapshot({
        trigger: "periodic",
        startTime: Date.now(),
        taskDescription: "CRUD测试1",
        agents: [],
        rootAgentIds: [],
      });
      await pm.saveSnapshot(snap1);

      await new Promise((r) => setTimeout(r, 20));

      const snap2 = createSnapshot({
        trigger: "tool-completed",
        startTime: Date.now(),
        taskDescription: "CRUD测试2",
        agents: [
          {
            agentId: "a1",
            name: "A1",
            executionTree: null,
            hotSessionSnapshot: [],
            childAgentIds: [],
            status: "running",
          },
        ],
        rootAgentIds: ["a1"],
      });
      await pm.saveSnapshot(snap2);

      // 加载最新
      const latest = await pm.loadLatestSnapshot();
      if (!latest) throw new Error("未加载到快照");
      if (latest.snapshotId !== snap2.snapshotId) throw new Error("未返回最新快照");

      // 列出
      const records = await pm.listSnapshots();
      if (records.length !== 2) throw new Error(`快照数量错误: ${records.length}`);

      // 删除
      await pm.deleteSnapshot(snap1.snapshotId);
      const afterDelete = await pm.listSnapshots();
      if (afterDelete.length !== 1) throw new Error("删除后数量错误");

      ok("[3] 持久化管理器 CRUD");
    } catch (e) {
      fail("[3] 持久化管理器 CRUD", e);
    }

    // ─── [4] 快照清理 ──────────────────────
    try {
      const cleanConfig: PersistenceConfig = { ...DEFAULT_PERSISTENCE_CONFIG, maxSnapshots: 2 };
      const cleanDeps: PersistenceDeps = {
        logger,
        workspacePath: join(workDir, "cleanup-test"),
        config: cleanConfig,
      };
      const pm = createPersistenceManager(cleanDeps);

      for (let i = 0; i < 5; i++) {
        await pm.saveSnapshot(
          createSnapshot({
            trigger: "periodic",
            startTime: Date.now(),
            taskDescription: `清理测试${i}`,
            agents: [],
            rootAgentIds: [],
          }),
        );
        await new Promise((r) => setTimeout(r, 10));
      }

      const deleted = await pm.cleanup();
      if (deleted !== 3) throw new Error(`清理数量错误: ${deleted}`);

      const remaining = await pm.listSnapshots();
      if (remaining.length !== 2) throw new Error(`剩余数量错误: ${remaining.length}`);

      ok("[4] 快照清理");
    } catch (e) {
      fail("[4] 快照清理", e);
    }

    // ─── [5] 5步任务中断与恢复 ──────────────────────
    try {
      // 模拟 5 步任务：步骤1、2已完成，步骤3正在执行时中断
      let tree = createExecutionTree("agent-task", "顺序创建5个文件");
      const rootId = tree.rootNodeId;

      // 步骤 1：已完成
      const step1 = addNode(tree, rootId, { nodeType: NodeType.ToolCall, summary: "创建文件1" });
      tree = completeNode(step1.tree, step1.nodeId, "文件1已创建");

      // 步骤 2：已完成
      const step2 = addNode(tree, rootId, { nodeType: NodeType.ToolCall, summary: "创建文件2" });
      tree = completeNode(step2.tree, step2.nodeId, "文件2已创建");

      // 步骤 3：正在执行（中断点）
      const step3 = addNode(tree, rootId, { nodeType: NodeType.ToolCall, summary: "创建文件3" });
      tree = step3.tree;
      // step3 状态为 working（未完成）

      // 保存快照（模拟中断前保存）
      const recDeps: PersistenceDeps = {
        logger,
        workspacePath: join(workDir, "recovery-test"),
        config: DEFAULT_PERSISTENCE_CONFIG,
      };
      const pm = createPersistenceManager(recDeps);
      const snapshot = createSnapshot({
        trigger: "graceful-shutdown",
        startTime: Date.now() - 30000,
        taskDescription: "顺序创建5个文件",
        agents: [
          {
            agentId: "agent-task",
            name: "TaskAgent",
            executionTree: tree,
            hotSessionSnapshot: ["步骤1完成", "步骤2完成", "步骤3进行中"],
            childAgentIds: [],
            status: "running",
          },
        ],
        rootAgentIds: ["agent-task"],
      });
      await pm.saveSnapshot(snapshot);

      // 模拟重启：检查恢复
      const recovery = createRecoveryManager(pm, recDeps);
      const hasRecoverable = await recovery.hasRecoverableSnapshot();
      if (!hasRecoverable) throw new Error("应检测到可恢复快照");

      // 执行恢复
      const result = await recovery.recover();
      if (!result.success) throw new Error(`恢复失败: ${result.message}`);
      if (result.restoredAgentCount !== 1) throw new Error("恢复 Agent 数量错误");

      // 验证恢复后的状态
      const restoredAgent = result.snapshot!.agentTree["agent-task"];
      if (restoredAgent.status !== "paused") throw new Error("Agent 应为 paused");

      const restoredTree = restoredAgent.executionTree!;
      // 步骤1和2应保持 completed
      if (restoredTree.nodes[step1.nodeId].state !== TaskState.Completed)
        throw new Error("步骤1应保持 completed");
      if (restoredTree.nodes[step2.nodeId].state !== TaskState.Completed)
        throw new Error("步骤2应保持 completed");
      // 步骤3应从 working 转为 paused
      if (restoredTree.nodes[step3.nodeId].state !== TaskState.Paused)
        throw new Error("步骤3应为 paused");

      // 标记恢复完成
      await recovery.markRecovered(snapshot.snapshotId);
      const afterRecover = await pm.loadLatestSnapshot();
      if (afterRecover !== null) throw new Error("恢复后快照应已清除");

      ok("[5] 5步任务中断与恢复（核心场景）");
    } catch (e) {
      fail("[5] 5步任务中断与恢复（核心场景）", e);
    }

    // ─── [6] 快照完整性校验（端到端） ──────────────────────
    try {
      const e2eDeps: PersistenceDeps = {
        logger,
        workspacePath: join(workDir, "integrity-e2e"),
        config: DEFAULT_PERSISTENCE_CONFIG,
      };
      const pm = createPersistenceManager(e2eDeps);

      const snap = createSnapshot({
        trigger: "user-requested",
        startTime: Date.now(),
        taskDescription: "完整性端到端",
        agents: [],
        rootAgentIds: [],
      });
      await pm.saveSnapshot(snap);

      // 验证完整性
      const stateDir = join(workDir, "integrity-e2e", "state");
      const fileName = `snapshot-${snap.snapshotId}.json`;
      const isValid = await verifySnapshotIntegrity(stateDir, fileName);
      if (!isValid) throw new Error("完整性校验应通过");

      ok("[6] 快照完整性校验（端到端）");
    } catch (e) {
      fail("[6] 快照完整性校验（端到端）", e);
    }

    // ─── [7] 优雅关闭处理器 ──────────────────────
    try {
      const handler = createShutdownHandler();
      if (handler.isShuttingDown()) throw new Error("初始不应为关闭状态");

      handler.register(async () => {
        // 关闭回调（不实际触发信号）
      });

      // 验证注册成功（不触发信号）
      if (handler.isShuttingDown()) throw new Error("注册后不应为关闭状态");

      handler.unregister();
      if (handler.isShuttingDown()) throw new Error("取消注册后不应为关闭状态");

      ok("[7] 优雅关闭处理器");
    } catch (e) {
      fail("[7] 优雅关闭处理器", e);
    }

    // ─── [8] TTL 过期检查 ──────────────────────
    try {
      const now = new Date().toISOString();
      const recentSnap = { timestamp: now } as any;
      if (!isWithinTTL(recentSnap, 3600)) throw new Error("近期快照应在 TTL 内");

      const oldSnap = { timestamp: new Date(Date.now() - 200000 * 1000).toISOString() } as any;
      if (isWithinTTL(oldSnap, 60)) throw new Error("过期快照不应在 TTL 内");

      ok("[8] TTL 过期检查");
    } catch (e) {
      fail("[8] TTL 过期检查", e);
    }

    // ─── [9] pauseWorkingNodes ──────────────────────
    try {
      let tree = createExecutionTree("test", "暂停测试");
      const r = tree.rootNodeId;
      const n1 = addNode(tree, r, { nodeType: NodeType.ToolCall, summary: "工具1" });
      tree = completeNode(n1.tree, n1.nodeId, "完成");
      const n2 = addNode(tree, r, { nodeType: NodeType.ToolCall, summary: "工具2" });
      tree = n2.tree; // working 状态

      const paused = pauseWorkingNodes(tree);
      if (paused.nodes[n1.nodeId].state !== TaskState.Completed)
        throw new Error("已完成节点不应变化");
      if (paused.nodes[n2.nodeId].state !== TaskState.Paused)
        throw new Error("working 节点应变为 paused");
      if (paused.state !== TreeState.Paused) throw new Error("树状态应变为 paused");

      ok("[9] pauseWorkingNodes");
    } catch (e) {
      fail("[9] pauseWorkingNodes", e);
    }

    // ─── [10] countActiveAgents / countCompletedSteps ──────────────────────
    try {
      let tree = createExecutionTree("test", "统计测试");
      const r = tree.rootNodeId;
      const n1 = addNode(tree, r, { nodeType: NodeType.ToolCall, summary: "t1" });
      tree = completeNode(n1.tree, n1.nodeId, "ok");
      const n2 = addNode(tree, r, { nodeType: NodeType.ToolCall, summary: "t2" });
      tree = completeNode(n2.tree, n2.nodeId, "ok");

      const snap = createSnapshot({
        trigger: "periodic",
        startTime: Date.now(),
        taskDescription: "统计测试",
        agents: [
          {
            agentId: "a1",
            name: "A1",
            executionTree: tree,
            hotSessionSnapshot: [],
            childAgentIds: [],
            status: "running",
          },
          {
            agentId: "a2",
            name: "A2",
            executionTree: null,
            hotSessionSnapshot: [],
            childAgentIds: [],
            status: "completed",
          },
        ],
        rootAgentIds: ["a1"],
      });

      if (countActiveAgents(snap) !== 1) throw new Error("活跃 Agent 计数错误");
      if (countCompletedSteps(snap) !== 2) throw new Error("已完成步骤计数错误");

      ok("[10] countActiveAgents / countCompletedSteps");
    } catch (e) {
      fail("[10] countActiveAgents / countCompletedSteps", e);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  console.log("\n✅ 阶段十一集成测试完成\n");
}

main().catch((err) => {
  console.error("集成测试异常:", err);
  process.exitCode = 1;
});
