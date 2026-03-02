/**
 * tool:run-agent 内置工具单元测试
 *
 * run-agent 在阶段八已激活为完整实现，使用动态导入加载 solution/executor。
 * 测试验证基本的参数传递和错误处理。
 */

import { describe, it, expect, vi } from "vitest";
import { handleRunAgent } from "../../../src/tool/builtin/run-agent.js";
import type { ToolExecutionContext, CallModelFn, ToolRegistry } from "../../../src/tool/types.js";

// mock 动态导入的模块
vi.mock("../../../src/solution/executor.js", () => ({
  createAgentExecutor: () => ({
    execute: vi.fn().mockResolvedValue({
      result: "Agent 执行结果",
      task: { id: "task-1", state: "completed" },
      executionTree: { id: "tree-1" },
      steps: [],
      totalDuration: 100,
    }),
  }),
}));

vi.mock("../../../src/tool/executor.js", () => ({
  createToolExecutor: vi.fn().mockReturnValue({
    execute: vi.fn(),
  }),
}));

vi.mock("../../../src/skill/registry.js", () => ({
  createSkillRegistry: vi.fn().mockResolvedValue({
    list: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    has: vi.fn().mockReturnValue(false),
  }),
}));

function createMockContext(): ToolExecutionContext {
  return {
    workspacePath: "/mock/workspace",
    callModel: vi.fn() as CallModelFn,
    registry: {
      list: vi.fn().mockReturnValue([]),
      get: vi.fn(),
      has: vi.fn().mockReturnValue(false),
      register: vi.fn(),
      updateStatus: vi.fn(),
      listByOrigin: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry,
    caller: { entityId: "agent:main" },
  };
}

describe("handleRunAgent", () => {
  it("应成功执行 Agent 任务", async () => {
    const ctx = createMockContext();
    const result = await handleRunAgent(
      { agentId: "solution:test", task: "执行测试" },
      ctx,
    );

    expect(result).toHaveProperty("result", "Agent 执行结果");
    expect(result).toHaveProperty("agentId", "solution:test");
    expect(result).toHaveProperty("state", "completed");
  });

  it("应传递 context 参数", async () => {
    const ctx = createMockContext();
    const result = await handleRunAgent(
      { agentId: "solution:test", task: "测试", context: "额外上下文" },
      ctx,
    );

    expect(result).toHaveProperty("result");
  });
});
