/**
 * Super Agent 执行器测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSuperAgentExecutor } from "../../src/super-agent/executor.js";
import { buildSuperAgent } from "../../src/super-agent/builder.js";
import type {
  SuperAgentDefinition,
  SuperAgentExecutorDeps,
  SuperAgentTaskRequest,
} from "../../src/super-agent/types.js";
import { EntityStatus, EntityType } from "../../src/tool/types.js";
import type { Logger } from "../../src/logger/types.js";

// mock solution/executor 和 core/loop
vi.mock("../../src/solution/executor.js", () => ({
  createAgentExecutor: () => ({
    execute: vi.fn().mockResolvedValue({
      result: "模拟 Agent 执行结果",
      task: { state: "completed" },
      executionTree: { id: "tree-1" },
      steps: [],
      totalDuration: 100,
    }),
  }),
}));

describe("createSuperAgentExecutor", () => {
  let tmpDir: string;
  let mockLogger: Logger;
  let deps: SuperAgentExecutorDeps;

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
    responsibilityPrompt: `负责 ${name} 领域`,
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
    ],
    collaboration: {
      mode,
      conflictResolution: { strategy: "orchestrator-decides", timeout: 60 },
      constraints: { maxParallelAgents: 3 },
    },
    workspacePath: `workspace/super-agents/${name}`,
  });

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "sa-exec-"));
    await mkdir(join(tmpDir, "super-agents"), { recursive: true });

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    deps = {
      parentWorkspacePath: tmpDir,
      callModel: vi.fn(),
      toolExecutor: { execute: vi.fn() } as any,
      toolRegistry: { list: vi.fn().mockReturnValue([]) } as any,
      logger: mockLogger,
      workspacePath: tmpDir,
    };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("应执行串行模式的 Super Agent", async () => {
    const definition = makeDefinition("seq-test", "sequential");
    await buildSuperAgent(definition, tmpDir);

    const executor = createSuperAgentExecutor(deps);
    const request: SuperAgentTaskRequest = {
      superAgentId: "super-agent:seq-test",
      task: "写一篇文章",
    };

    const response = await executor.execute(request);

    expect(response.success).toBe(true);
    expect(response.roleResults).toHaveLength(2);
    expect(response.roleResults[0]!.roleName).toBe("researcher");
    expect(response.roleResults[1]!.roleName).toBe("writer");
    expect(response.result).toContain("researcher");
    expect(response.duration).toBeGreaterThanOrEqual(0);
  });

  it("应执行并行模式的 Super Agent", async () => {
    const definition = makeDefinition("par-test", "parallel");
    await buildSuperAgent(definition, tmpDir);

    const executor = createSuperAgentExecutor(deps);
    const request: SuperAgentTaskRequest = {
      superAgentId: "super-agent:par-test",
      task: "并行任务",
    };

    const response = await executor.execute(request);

    expect(response.success).toBe(true);
    expect(response.roleResults).toHaveLength(2);
  });

  it("不存在的 Super Agent 未注册时应抛出错误", async () => {
    const executor = createSuperAgentExecutor(deps);
    const request: SuperAgentTaskRequest = {
      superAgentId: "super-agent:nonexistent",
      task: "测试",
    };

    await expect(executor.execute(request)).rejects.toThrow("不存在");
  });

  it("编排模式无 orchestratorAgentId 应回退到串行", async () => {
    const definition = makeDefinition("orch-fallback", "orchestrated");
    await buildSuperAgent(definition, tmpDir);

    const executor = createSuperAgentExecutor(deps);
    const request: SuperAgentTaskRequest = {
      superAgentId: "super-agent:orch-fallback",
      task: "编排任务",
    };

    const response = await executor.execute(request);

    // 无 orchestratorAgentId，应回退到串行执行
    expect(response.success).toBe(true);
    expect(response.roleResults).toHaveLength(2);
  });

  it("应记录执行日志", async () => {
    const definition = makeDefinition("log-test", "sequential");
    await buildSuperAgent(definition, tmpDir);

    const executor = createSuperAgentExecutor(deps);
    await executor.execute({
      superAgentId: "super-agent:log-test",
      task: "日志测试",
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      "super-agent",
      "开始协作执行",
      expect.objectContaining({ id: "super-agent:log-test" }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "super-agent",
      "协作执行完成",
      expect.objectContaining({ success: true }),
    );
  });

  it("应收集所有角色的 artifacts", async () => {
    const definition = makeDefinition("artifact-test", "sequential");
    await buildSuperAgent(definition, tmpDir);

    const executor = createSuperAgentExecutor(deps);
    const response = await executor.execute({
      superAgentId: "super-agent:artifact-test",
      task: "artifact 测试",
    });

    expect(response.artifacts).toEqual([]);
  });

  it("返回的 taskId 应包含时间戳", async () => {
    const definition = makeDefinition("taskid-test", "sequential");
    await buildSuperAgent(definition, tmpDir);

    const executor = createSuperAgentExecutor(deps);
    const response = await executor.execute({
      superAgentId: "super-agent:taskid-test",
      task: "taskId 测试",
    });

    expect(response.taskId).toMatch(/^super-task-\d+$/);
  });

  it("带 context 的请求应传递给角色", async () => {
    const definition = makeDefinition("ctx-test", "sequential");
    await buildSuperAgent(definition, tmpDir);

    const executor = createSuperAgentExecutor(deps);
    const response = await executor.execute({
      superAgentId: "super-agent:ctx-test",
      task: "上下文测试",
      context: "额外的上下文信息",
    });

    expect(response.success).toBe(true);
  });

  it("从注册表加载未构建的 Super Agent", async () => {
    // 先构建一个 Super Agent，确保注册表有数据
    const definition = makeDefinition("from-reg", "sequential");

    // 写入 registry.json 但不构建实例
    const registryPath = join(tmpDir, "super-agents", "registry.json");
    const registryData = {
      version: "1.0.0",
      updatedAt: new Date().toISOString(),
      superAgents: [definition],
    };
    await writeFile(registryPath, JSON.stringify(registryData), "utf-8");

    const executor = createSuperAgentExecutor(deps);
    const response = await executor.execute({
      superAgentId: "super-agent:from-reg",
      task: "从注册表加载",
    });

    expect(response.success).toBe(true);
  });
});
