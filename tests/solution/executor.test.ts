/**
 * Agent 执行器测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAgentExecutor } from "../../src/solution/executor.js";
import { buildAgent } from "../../src/solution/builder.js";
import { initWorkspace } from "../../src/workspace/init.js";
import type { SolutionDefinition, AgentExecutorDeps } from "../../src/solution/types.js";
import { EntityStatus, EntityType } from "../../src/tool/types.js";

describe("createAgentExecutor", () => {
  let tmpDir: string;

  const makeSolution = (name: string): SolutionDefinition => ({
    id: `solution:${name}`,
    type: EntityType.Solution,
    name,
    description: `${name} Agent`,
    tags: ["test"],
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    identityPrompt: `你是一个 ${name}`,
    skills: [],
    interaction: {
      multiTurn: false,
      humanInLoop: false,
      inputModes: ["text"],
      outputModes: ["text"],
    },
    workspacePath: `agents/${name}/workspace`,
  });

  const createMockDeps = (): AgentExecutorDeps => ({
    callModel: vi.fn().mockResolvedValue({
      content: "任务完成",
      toolCalls: [],
      stopReason: "end_turn",
      model: "mock-model",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    toolRegistry: {
      get: vi.fn(),
      has: vi.fn().mockReturnValue(false),
      list: vi.fn().mockReturnValue([]),
      listCustom: vi.fn().mockReturnValue([]),
      register: vi.fn(),
      updateStatus: vi.fn(),
    },
    toolExecutor: {
      execute: vi.fn().mockResolvedValue({
        requestId: "req-1",
        success: true,
        output: {},
        duration: 10,
      }),
    },
    skillRegistry: {
      get: vi.fn(),
      has: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      listByOrigin: vi.fn().mockReturnValue([]),
      register: vi.fn(),
      updateStatus: vi.fn(),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    workspacePath: tmpDir,
  });

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "exec-"));
    await initWorkspace(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("应执行已创建的 Agent 任务", async () => {
    // 先创建 Agent
    await buildAgent(makeSolution("test-exec"), tmpDir);

    const deps = createMockDeps();
    const executor = createAgentExecutor(deps);

    const response = await executor.execute({
      agentId: "solution:test-exec",
      task: "测试任务",
    });

    expect(response.result).toBe("任务完成");
    expect(response.task.state).toBe("completed");
    expect(response.task.agentId).toBe("solution:test-exec");
    expect(response.task.description).toBe("测试任务");
  });

  it("Agent 不存在时应抛出错误", async () => {
    const deps = createMockDeps();
    const executor = createAgentExecutor(deps);

    await expect(
      executor.execute({
        agentId: "solution:nonexistent",
        task: "测试",
      }),
    ).rejects.toThrow("不存在");
  });

  it("应在任务消息中记录用户输入和 Agent 回答", async () => {
    await buildAgent(makeSolution("msg-test"), tmpDir);

    const deps = createMockDeps();
    const executor = createAgentExecutor(deps);

    const response = await executor.execute({
      agentId: "solution:msg-test",
      task: "分析代码质量",
    });

    expect(response.task.messages).toHaveLength(2);
    expect(response.task.messages[0]!.role).toBe("user");
    expect(response.task.messages[0]!.parts[0]).toEqual({
      type: "text",
      text: "分析代码质量",
    });
    expect(response.task.messages[1]!.role).toBe("agent");
  });

  it("模型调用失败时应返回 failed 状态", async () => {
    await buildAgent(makeSolution("fail-test"), tmpDir);

    const deps = createMockDeps();
    (deps.callModel as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("模型不可用"),
    );
    const executor = createAgentExecutor(deps);

    const response = await executor.execute({
      agentId: "solution:fail-test",
      task: "测试任务",
    });

    expect(response.task.state).toBe("failed");
  });

  it("应传递附加上下文", async () => {
    await buildAgent(makeSolution("ctx-test"), tmpDir);

    const deps = createMockDeps();
    const executor = createAgentExecutor(deps);

    await executor.execute({
      agentId: "solution:ctx-test",
      task: "分析文件",
      context: "文件路径: src/index.ts",
    });

    // 验证 callModel 被调用且消息包含上下文
    const callModelFn = deps.callModel as ReturnType<typeof vi.fn>;
    expect(callModelFn).toHaveBeenCalled();
    const userMessage = callModelFn.mock.calls[0]?.[0]?.messages?.find(
      (m: { role: string }) => m.role === "user",
    );
    expect(userMessage?.content).toContain("分析文件");
    expect(userMessage?.content).toContain("src/index.ts");
  });

  it("应记录状态变更历史", async () => {
    await buildAgent(makeSolution("history-test"), tmpDir);

    const deps = createMockDeps();
    const executor = createAgentExecutor(deps);

    const response = await executor.execute({
      agentId: "solution:history-test",
      task: "测试",
    });

    expect(response.task.stateHistory).toHaveLength(1);
    expect(response.task.stateHistory[0]!.from).toBe("submitted");
    expect(response.task.stateHistory[0]!.to).toBe("completed");
  });
});
