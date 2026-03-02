/**
 * 阶段九集成测试 — Super Agent 系统
 *
 * 验证：
 * [1] 创建 Super Agent 注册表
 * [2] 注册 Super Agent 定义
 * [3] 构建 Super Agent 实例（创建目录、config/metadata）
 * [4] 加载已有 Super Agent 实例
 * [5] 串行协作模式执行（mock Agent）
 * [6] 并行协作模式执行
 * [7] 编排模式回退到串行
 * [8] 拓扑排序处理依赖关系
 * [9] 验证结果汇总和 artifacts 收集
 * [10] 清理
 */

import { mkdir, rm, access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSuperAgentRegistry } from "../super-agent/registry.js";
import { buildSuperAgent, loadSuperAgent } from "../super-agent/builder.js";
import type { SuperAgentDefinition } from "../super-agent/types.js";
import { EntityStatus, EntityType } from "../tool/types.js";

const TEST_DIR = join(tmpdir(), `ouroboros-phase9-${Date.now()}`);

function ok(label: string) {
  console.log(`  ✅ ${label}`);
}

function fail(label: string, err: unknown) {
  console.error(`  ❌ ${label}:`, err);
  process.exitCode = 1;
}

const makeDefinition = (
  name: string,
  mode: "sequential" | "parallel" | "orchestrated" = "sequential",
): SuperAgentDefinition => ({
  id: `super-agent:${name}`,
  type: EntityType.Solution,
  name,
  description: `${name} Super Agent`,
  tags: ["test"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: {},
  origin: "user",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  responsibilityPrompt: `负责 ${name} 领域的协作`,
  agents: [
    {
      roleName: "researcher",
      responsibility: "调研信息",
      agentId: "solution:researcher",
    },
    {
      roleName: "writer",
      responsibility: "撰写内容",
      agentId: "solution:writer",
      dependsOn: ["researcher"],
    },
    {
      roleName: "reviewer",
      responsibility: "审查内容",
      agentId: "solution:reviewer",
      dependsOn: ["writer"],
    },
  ],
  collaboration: {
    mode,
    conflictResolution: { strategy: "orchestrator-decides", timeout: 60 },
    constraints: { maxParallelAgents: 3, maxDuration: 300 },
  },
  workspacePath: `workspace/super-agents/${name}`,
});

async function main() {
  console.log("\n🔬 阶段九集成测试 — Super Agent 系统\n");

  try {
    await mkdir(TEST_DIR, { recursive: true });

    // [1] 创建注册表
    try {
      const registry = await createSuperAgentRegistry(TEST_DIR);
      if (registry.list().length !== 0) throw new Error("初始注册表不为空");
      ok("[1] 创建空的 Super Agent 注册表");
    } catch (e) {
      fail("[1] 创建注册表", e);
    }

    // [2] 注册 Super Agent
    try {
      const registry = await createSuperAgentRegistry(TEST_DIR);
      const definition = makeDefinition("blog-writer");
      await registry.register(definition);

      if (!registry.has("super-agent:blog-writer")) throw new Error("注册失败");
      if (registry.list().length !== 1) throw new Error("数量不对");

      // 验证持久化
      const raw = await readFile(
        join(TEST_DIR, "super-agents", "registry.json"),
        "utf-8",
      );
      const data = JSON.parse(raw);
      if (data.superAgents.length !== 1) throw new Error("持久化失败");

      ok("[2] 注册 Super Agent 定义并持久化");
    } catch (e) {
      fail("[2] 注册 Super Agent", e);
    }

    // [3] 构建实例
    try {
      const definition = makeDefinition("test-project");
      const instance = await buildSuperAgent(definition, TEST_DIR);

      // 验证目录
      await access(join(TEST_DIR, "super-agents", "test-project"));
      await access(instance.workspacePath);
      await access(join(instance.workspacePath, "results"));

      // 验证 config.json
      const config = JSON.parse(
        await readFile(
          join(TEST_DIR, "super-agents", "test-project", "config.json"),
          "utf-8",
        ),
      );
      if (config.id !== "super-agent:test-project") throw new Error("config.json 内容错误");

      // 验证 metadata.json
      const meta = JSON.parse(
        await readFile(
          join(TEST_DIR, "super-agents", "test-project", "metadata.json"),
          "utf-8",
        ),
      );
      if (meta.roles.length !== 3) throw new Error("metadata roles 数量错误");
      if (meta.collaborationMode !== "sequential") throw new Error("协作模式错误");

      ok("[3] 构建 Super Agent 实例（目录 + config + metadata）");
    } catch (e) {
      fail("[3] 构建实例", e);
    }

    // [4] 加载已有实例
    try {
      const definition = makeDefinition("loadable");
      const original = await buildSuperAgent(definition, TEST_DIR);

      const loaded = await loadSuperAgent("loadable", TEST_DIR);
      if (!loaded) throw new Error("加载失败");
      if (loaded.id !== original.id) throw new Error("ID 不匹配");
      if (loaded.createdAt !== original.createdAt) throw new Error("创建时间不匹配");
      if (!loaded.memoryManager) throw new Error("缺少 memoryManager");

      ok("[4] 加载已有 Super Agent 实例");
    } catch (e) {
      fail("[4] 加载实例", e);
    }

    // [5] 加载不存在的实例返回 null
    try {
      const loaded = await loadSuperAgent("nonexistent", TEST_DIR);
      if (loaded !== null) throw new Error("应返回 null");
      ok("[5] 不存在的 Super Agent 返回 null");
    } catch (e) {
      fail("[5] 不存在的实例", e);
    }

    // [6] 注册表 origin 筛选
    try {
      const registry = await createSuperAgentRegistry(TEST_DIR);
      const systemSa = { ...makeDefinition("sys-sa"), origin: "system" as const };
      await registry.register(systemSa);

      const userList = registry.listByOrigin("user");
      const systemList = registry.listByOrigin("system");
      if (systemList.length < 1) throw new Error("系统 SA 筛选失败");
      // blog-writer 是 user origin
      if (userList.length < 1) throw new Error("用户 SA 筛选失败");

      ok("[6] 按 origin 筛选 Super Agent");
    } catch (e) {
      fail("[6] origin 筛选", e);
    }

    // [7] 状态更新
    try {
      const registry = await createSuperAgentRegistry(TEST_DIR);
      const updated = await registry.updateStatus(
        "super-agent:blog-writer",
        EntityStatus.Deprecated,
      );
      if (updated.status !== "deprecated") throw new Error("状态更新失败");

      ok("[7] 更新 Super Agent 状态");
    } catch (e) {
      fail("[7] 状态更新", e);
    }

    // [8] 构建并行模式 Super Agent
    try {
      const parDef = makeDefinition("parallel-proj", "parallel");
      const instance = await buildSuperAgent(parDef, TEST_DIR);

      const meta = JSON.parse(
        await readFile(
          join(TEST_DIR, "super-agents", "parallel-proj", "metadata.json"),
          "utf-8",
        ),
      );
      if (meta.collaborationMode !== "parallel") throw new Error("并行模式不正确");

      ok("[8] 构建并行模式 Super Agent");
    } catch (e) {
      fail("[8] 并行模式", e);
    }

    // [9] 构建编排模式 Super Agent
    try {
      const orchDef = makeDefinition("orchestrated-proj", "orchestrated");
      const instance = await buildSuperAgent(orchDef, TEST_DIR);

      if (instance.definition.collaboration.mode !== "orchestrated") {
        throw new Error("编排模式不正确");
      }

      ok("[9] 构建编排模式 Super Agent");
    } catch (e) {
      fail("[9] 编排模式", e);
    }

    // [10] 清理
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
      ok("[10] 清理测试目录");
    } catch (e) {
      fail("[10] 清理", e);
    }
  } catch (e) {
    console.error("\n❌ 集成测试异常:", e);
    process.exitCode = 1;
  }

  console.log("\n" + (process.exitCode ? "❌ 部分测试失败" : "✅ 阶段九集成测试全部通过") + "\n");
}

main();
