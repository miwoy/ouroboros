import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createRecoveryManager, pauseWorkingNodes, countCompletedNodes } from "../../src/persistence/recovery.js";
import { createPersistenceManager } from "../../src/persistence/manager.js";
import { createSnapshot } from "../../src/persistence/snapshot.js";
import type { PersistenceDeps, PersistenceConfig } from "../../src/persistence/types.js";
import { DEFAULT_PERSISTENCE_CONFIG } from "../../src/persistence/types.js";
import { TreeState, TaskState, NodeType } from "../../src/core/types.js";
import type { ExecutionTree, ExecutionNode } from "../../src/core/types.js";
import type { Logger } from "../../src/logger/types.js";

function createTestLogger(): Logger {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

/** 创建测试执行树 */
function makeTree(
  nodeStates: Record<string, string>,
  treeState: string = TreeState.Running,
): ExecutionTree {
  const nodes: Record<string, ExecutionNode> = {};
  const ids = Object.keys(nodeStates);

  for (const [id, state] of Object.entries(nodeStates)) {
    nodes[id] = {
      id,
      parentId: id === ids[0] ? null : ids[0],
      taskId: "task-1",
      state: state as TaskState,
      nodeType: id === ids[0] ? NodeType.Root : NodeType.ToolCall,
      summary: `节点 ${id}`,
      children: id === ids[0] ? ids.slice(1) : [],
      retryCount: 0,
      createdAt: new Date().toISOString(),
      ...(state === TaskState.Completed ? { completedAt: new Date().toISOString() } : {}),
    };
  }

  return {
    id: "tree-1",
    agentId: "agent-1",
    rootNodeId: ids[0],
    nodes,
    activeNodeId: ids[ids.length - 1],
    state: treeState as any,
    createdAt: new Date().toISOString(),
  };
}

describe("恢复管理器", () => {
  let tmpDir: string;
  let deps: PersistenceDeps;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `ouro-recovery-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
    deps = {
      logger: createTestLogger(),
      workspacePath: tmpDir,
      config: DEFAULT_PERSISTENCE_CONFIG,
    };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("pauseWorkingNodes", () => {
    it("应将 working 节点转为 paused", () => {
      const tree = makeTree({
        root: TaskState.Working,
        n1: TaskState.Completed,
        n2: TaskState.Working,
      });

      const paused = pauseWorkingNodes(tree);

      expect(paused.nodes["root"].state).toBe(TaskState.Paused);
      expect(paused.nodes["n1"].state).toBe(TaskState.Completed);
      expect(paused.nodes["n2"].state).toBe(TaskState.Paused);
      expect(paused.state).toBe(TreeState.Paused);
    });

    it("无 working 节点时返回原树", () => {
      const tree = makeTree({
        root: TaskState.Completed,
        n1: TaskState.Completed,
      }, TreeState.Completed);

      const result = pauseWorkingNodes(tree);
      expect(result).toBe(tree); // 同一引用
    });
  });

  describe("countCompletedNodes", () => {
    it("应统计已完成节点数", () => {
      const tree = makeTree({
        root: TaskState.Working,
        n1: TaskState.Completed,
        n2: TaskState.Completed,
        n3: TaskState.Failed,
      });

      expect(countCompletedNodes(tree)).toBe(2);
    });
  });

  describe("hasRecoverableSnapshot", () => {
    it("无快照时返回 false", async () => {
      const pm = createPersistenceManager(deps);
      const rm = createRecoveryManager(pm, deps);
      expect(await rm.hasRecoverableSnapshot()).toBe(false);
    });

    it("有活跃 Agent 的快照返回 true", async () => {
      const pm = createPersistenceManager(deps);
      const snapshot = createSnapshot({
        trigger: "tool-completed",
        startTime: Date.now(),
        taskDescription: "测试",
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
      await pm.saveSnapshot(snapshot);

      const recovery = createRecoveryManager(pm, deps);
      expect(await recovery.hasRecoverableSnapshot()).toBe(true);
    });

    it("所有 Agent 已完成时返回 false", async () => {
      const pm = createPersistenceManager(deps);
      const snapshot = createSnapshot({
        trigger: "tool-completed",
        startTime: Date.now(),
        taskDescription: "测试",
        agents: [
          {
            agentId: "a1",
            name: "A1",
            executionTree: null,
            hotSessionSnapshot: [],
            childAgentIds: [],
            status: "completed",
          },
        ],
        rootAgentIds: ["a1"],
      });
      await pm.saveSnapshot(snapshot);

      const recovery = createRecoveryManager(pm, deps);
      expect(await recovery.hasRecoverableSnapshot()).toBe(false);
    });

    it("自动恢复禁用时返回 false", async () => {
      const config: PersistenceConfig = { ...DEFAULT_PERSISTENCE_CONFIG, enableAutoRecovery: false };
      const customDeps = { ...deps, config };
      const pm = createPersistenceManager(customDeps);
      const snapshot = createSnapshot({
        trigger: "tool-completed",
        startTime: Date.now(),
        taskDescription: "测试",
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
      await pm.saveSnapshot(snapshot);

      const recovery = createRecoveryManager(pm, customDeps);
      expect(await recovery.hasRecoverableSnapshot()).toBe(false);
    });
  });

  describe("recover", () => {
    it("无快照时返回失败", async () => {
      const pm = createPersistenceManager(deps);
      const recovery = createRecoveryManager(pm, deps);

      const result = await recovery.recover();
      expect(result.success).toBe(false);
      expect(result.message).toContain("未找到");
    });

    it("应恢复快照并暂停 working 节点", async () => {
      const tree = makeTree({
        root: TaskState.Working,
        step1: TaskState.Completed,
        step2: TaskState.Completed,
        step3: TaskState.Working,
      });

      const pm = createPersistenceManager(deps);
      const snapshot = createSnapshot({
        trigger: "graceful-shutdown",
        startTime: Date.now(),
        taskDescription: "5步任务中断",
        agents: [
          {
            agentId: "a1",
            name: "Worker",
            executionTree: tree,
            hotSessionSnapshot: ["历史记录"],
            childAgentIds: [],
            status: "running",
          },
        ],
        rootAgentIds: ["a1"],
      });
      await pm.saveSnapshot(snapshot);

      const recovery = createRecoveryManager(pm, deps);
      const result = await recovery.recover();

      expect(result.success).toBe(true);
      expect(result.restoredAgentCount).toBe(1);

      // 恢复后 working 节点变为 paused
      const restoredAgent = result.snapshot!.agentTree["a1"];
      expect(restoredAgent.status).toBe("paused");
      expect(restoredAgent.executionTree!.nodes["step3"].state).toBe(TaskState.Paused);
      expect(restoredAgent.executionTree!.nodes["step1"].state).toBe(TaskState.Completed);
    });

    it("版本不兼容时返回失败", async () => {
      const pm = createPersistenceManager(deps);
      const snapshot = createSnapshot({
        trigger: "periodic",
        startTime: Date.now(),
        taskDescription: "版本测试",
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

      // 修改版本号
      const modified = { ...snapshot, schemaVersion: "9.0.0" };
      await pm.saveSnapshot(modified);

      const recovery = createRecoveryManager(pm, deps);
      const result = await recovery.recover();
      expect(result.success).toBe(false);
      expect(result.message).toContain("版本不兼容");
    });
  });

  describe("markRecovered", () => {
    it("应删除已使用的快照", async () => {
      const pm = createPersistenceManager(deps);
      const snapshot = createSnapshot({
        trigger: "periodic",
        startTime: Date.now(),
        taskDescription: "测试",
        agents: [],
        rootAgentIds: [],
      });
      await pm.saveSnapshot(snapshot);

      const recovery = createRecoveryManager(pm, deps);
      await recovery.markRecovered(snapshot.snapshotId);

      const latest = await pm.loadLatestSnapshot();
      expect(latest).toBeNull();
    });
  });
});
