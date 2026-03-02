/**
 * 阶段八集成测试 — Agent (Solution) 系统
 *
 * 测试场景：
 * [1] 创建 Solution 注册表
 * [2] 注册 SolutionDefinition
 * [3] 构建 Agent 实例（目录结构、配置文件、元数据）
 * [4] 知识库管理（添加、加载、token 限制）
 * [5] 加载已有 Agent
 * [6] Agent 执行器（通过 ReAct 循环执行任务）
 * [7] 配置系统验证
 *
 * 用法：npx tsx src/integration/phase8.ts
 */

import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initWorkspace } from "../workspace/init.js";
import { createSolutionRegistry } from "../solution/registry.js";
import { buildAgent, loadAgent, listAgents } from "../solution/builder.js";
import { createKnowledgeBase } from "../solution/knowledge.js";
import { createAgentExecutor } from "../solution/executor.js";
import { EntityStatus, EntityType } from "../tool/types.js";
import type { SolutionDefinition } from "../solution/types.js";
import { configSchema } from "../config/schema.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`断言失败: ${message}`);
}

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════");
  console.log("  阶段八集成测试 — Agent (Solution) 系统");
  console.log("═══════════════════════════════════════════════════\n");

  const tmpDir = await mkdtemp(join(tmpdir(), "phase8-"));
  await initWorkspace(tmpDir);

  const codeReviewer: SolutionDefinition = {
    id: "solution:code-reviewer",
    type: EntityType.Solution,
    name: "代码审查专家",
    description: "分析代码质量，提出改进建议",
    tags: ["code-review", "分析"],
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    identityPrompt:
      "你是一位代码审查专家。你的职责是分析代码质量、发现潜在问题并提出改进建议。",
    skills: ["skill:read-file"],
    additionalTools: [],
    interaction: {
      multiTurn: true,
      maxTurns: 10,
      humanInLoop: false,
      inputModes: ["text", "file"],
      outputModes: ["text"],
    },
    workspacePath: "agents/code-reviewer/workspace",
    memory: { shortTerm: true, longTerm: true, hotSessionMaxTokens: 2000 },
    knowledge: { maxTokens: 4000 },
  };

  try {
    // ─── [1] 创建 Solution 注册表 ──────────────────────────────
    console.log("[1] 创建 Solution 注册表...");
    const registry = await createSolutionRegistry(tmpDir);
    assert(registry.list().length === 0, "初始应为空");
    console.log("  ✓ 注册表创建成功\n");

    // ─── [2] 注册 SolutionDefinition ──────────────────────────
    console.log("[2] 注册 SolutionDefinition...");
    await registry.register(codeReviewer);
    assert(registry.has("solution:code-reviewer"), "应能查到注册的 Solution");
    assert(registry.list().length === 1, "应有 1 个 Solution");

    const regData = await readFile(
      join(tmpDir, "solutions", "registry.json"),
      "utf-8",
    );
    const parsed = JSON.parse(regData);
    assert(parsed.solutions.length === 1, "registry.json 应有 1 条");

    const agentMd = await readFile(join(tmpDir, "prompts", "agent.md"), "utf-8");
    assert(agentMd.includes("代码审查专家"), "agent.md 应包含 Agent 名称");
    console.log("  ✓ SolutionDefinition 注册成功\n");

    // ─── [3] 构建 Agent 实例 ──────────────────────────────────
    console.log("[3] 构建 Agent 实例...");
    const agent = await buildAgent(codeReviewer, tmpDir);
    assert(agent.id === "solution:code-reviewer", "Agent ID 正确");
    assert(agent.name === "code-reviewer", "Agent 名称正确");

    // 验证目录结构
    await access(join(tmpDir, "agents", "code-reviewer", "config.json"));
    await access(join(tmpDir, "agents", "code-reviewer", "metadata.json"));
    await access(join(tmpDir, "agents", "code-reviewer", "workspace", "prompts"));

    const configJson = await readFile(
      join(tmpDir, "agents", "code-reviewer", "config.json"),
      "utf-8",
    );
    const agentConfig = JSON.parse(configJson);
    assert(agentConfig.identityPrompt.includes("代码审查"), "config.json 包含身份定义");

    const metaJson = await readFile(
      join(tmpDir, "agents", "code-reviewer", "metadata.json"),
      "utf-8",
    );
    const meta = JSON.parse(metaJson);
    assert(meta.name === "code-reviewer", "metadata 名称正确");
    console.log("  ✓ Agent 实例构建成功\n");

    // ─── [4] 知识库管理 ──────────────────────────────────────
    console.log("[4] 知识库管理...");
    const kb = createKnowledgeBase(agent.workspacePath, codeReviewer.knowledge);
    await kb.addFile("coding-style.md", "# 代码风格指南\n\n- 使用 readonly 保持不可变");
    await kb.addFile("patterns.md", "# 设计模式\n\n- 观察者模式\n- 策略模式");

    const files = await kb.listFiles();
    assert(files.length === 2, "应有 2 个知识文件");

    const knowledge = await kb.loadAll();
    assert(knowledge.includes("代码风格指南"), "知识应包含风格指南");
    assert(knowledge.includes("设计模式"), "知识应包含设计模式");
    console.log("  ✓ 知识库管理正常\n");

    // ─── [5] 加载已有 Agent ──────────────────────────────────
    console.log("[5] 加载已有 Agent...");
    const loaded = await loadAgent("code-reviewer", tmpDir);
    assert(loaded !== null, "应能加载已创建的 Agent");
    assert(loaded!.id === "solution:code-reviewer", "加载的 Agent ID 正确");
    assert(loaded!.definition.identityPrompt.includes("代码审查"), "身份定义正确");

    const agentNames = await listAgents(tmpDir);
    assert(agentNames.includes("code-reviewer"), "Agent 列表应包含 code-reviewer");

    const notFound = await loadAgent("nonexistent", tmpDir);
    assert(notFound === null, "不存在的 Agent 应返回 null");
    console.log("  ✓ Agent 加载正常\n");

    // ─── [6] Agent 执行器 ──────────────────────────────────────
    console.log("[6] Agent 执行器...");
    const executor = createAgentExecutor({
      callModel: async () => ({
        content: "代码质量良好，建议增加类型注解",
        toolCalls: [],
        stopReason: "end_turn" as const,
        model: "mock",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      }),
      toolRegistry: {
        get: () => undefined,
        has: () => false,
        list: () => [],
        listCustom: () => [],
        register: async () => {},
        updateStatus: async () => ({}) as never,
      },
      toolExecutor: {
        execute: async () => ({
          requestId: "r1",
          success: true,
          output: {},
          duration: 10,
        }),
      },
      skillRegistry: {
        get: () => undefined,
        has: () => false,
        list: () => [],
        listByOrigin: () => [],
        register: async () => {},
        updateStatus: async () => ({}) as never,
      },
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      workspacePath: tmpDir,
    });

    const response = await executor.execute({
      agentId: "solution:code-reviewer",
      task: "审查以下代码的质量",
    });

    assert(response.result.includes("代码质量"), "执行结果应包含审查内容");
    assert(response.task.state === "completed", "任务状态应为 completed");
    assert(response.task.agentId === "solution:code-reviewer", "任务 agentId 正确");
    assert(response.task.messages.length === 2, "应有用户和 Agent 两条消息");
    assert(response.executionTree !== undefined, "应有执行树");
    console.log("  ✓ Agent 执行器工作正常\n");

    // ─── [7] 配置系统 ──────────────────────────────────────────
    console.log("[7] 配置系统验证...");
    const config = configSchema.parse({
      system: {},
      model: {
        defaultProvider: "test",
        providers: { test: { type: "openai", apiKey: "key" } },
      },
      agents: { defaultMaxTurns: 30, knowledgeMaxTokens: 16000 },
    });
    assert(config.agents.defaultMaxTurns === 30, "defaultMaxTurns 应为 30");
    assert(config.agents.knowledgeMaxTokens === 16000, "knowledgeMaxTokens 应为 16000");

    const defaultConfig = configSchema.parse({
      system: {},
      model: {
        defaultProvider: "test",
        providers: { test: { type: "openai", apiKey: "key" } },
      },
    });
    assert(defaultConfig.agents.defaultMaxTurns === 50, "默认 defaultMaxTurns 应为 50");
    assert(
      defaultConfig.agents.knowledgeMaxTokens === 8000,
      "默认 knowledgeMaxTokens 应为 8000",
    );
    console.log("  ✓ 配置系统验证通过\n");

    // ─── 结果汇总 ────────────────────────────────────────────
    console.log("═══════════════════════════════════════════════════");
    console.log("  所有测试通过！Agent (Solution) 系统集成验证完成");
    console.log("═══════════════════════════════════════════════════");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("集成测试失败:", err);
  process.exit(1);
});
