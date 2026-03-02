/**
 * 工具执行器单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createToolExecutor, type ToolExecutor } from "../../src/tool/executor.js";
import {
  EntityStatus,
  EntityType,
  type OuroborosTool,
  type ToolRegistry,
  type CallModelFn,
} from "../../src/tool/types.js";
import { ToolErrorCode } from "../../src/tool/types.js";

// Mock 内置工具 handler
vi.mock("../../src/tool/builtin/call-model.js", () => ({
  handleCallModel: vi.fn().mockResolvedValue({
    content: "模型响应",
    model: "test-model",
    stopReason: "end_turn",
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  }),
}));

vi.mock("../../src/tool/builtin/run-agent.js", () => ({
  handleRunAgent: vi.fn().mockRejectedValue(new Error("tool:run-agent 尚未实现")),
}));

vi.mock("../../src/tool/builtin/search-tool.js", () => ({
  handleSearchTool: vi.fn().mockResolvedValue({ tools: [], total: 0 }),
}));

vi.mock("../../src/tool/builtin/create-tool.js", () => ({
  handleCreateTool: vi.fn().mockResolvedValue({
    toolId: "tool:test",
    entrypoint: "scripts/test.js",
    codeHash: "abc123",
  }),
}));

// 创建 mock 工具
function createMockTool(overrides: Partial<OuroborosTool> = {}): OuroborosTool {
  return {
    id: "tool:call-model",
    type: EntityType.Tool,
    name: "测试工具",
    description: "测试",
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "system",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    entrypoint: "builtin:call-model",
    timeout: 5000,
    inputSchema: {
      type: "object",
      properties: {
        messages: { type: "array" },
      },
      required: ["messages"],
    },
    outputSchema: { type: "object" },
    ...overrides,
  };
}

// 创建 mock 注册表
function createMockRegistry(tools: OuroborosTool[]): ToolRegistry {
  const map = new Map(tools.map((t) => [t.id, t]));
  return {
    get: (id: string) => map.get(id),
    has: (id: string) => map.has(id),
    list: () => [...map.values()],
    listCustom: () => [...map.values()].filter((t) => t.origin !== "system"),
    register: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createToolExecutor", () => {
  let executor: ToolExecutor;
  let mockCallModel: CallModelFn;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallModel = vi.fn().mockResolvedValue({
      content: "test",
      model: "test-model",
      stopReason: "end_turn",
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });

    const registry = createMockRegistry([createMockTool()]);
    executor = createToolExecutor(registry, {
      workspacePath: "/mock/workspace",
      callModel: mockCallModel,
    });
  });

  it("应成功执行内置工具", async () => {
    const response = await executor.execute({
      requestId: "req-001",
      toolId: "tool:call-model",
      input: { messages: [{ role: "user", content: "你好" }] },
      caller: { entityId: "agent:main" },
    });

    expect(response.requestId).toBe("req-001");
    expect(response.success).toBe(true);
    expect(response.output).toBeDefined();
    expect(response.duration).toBeGreaterThanOrEqual(0);
  });

  it("应返回 NOT_FOUND 错误当工具不存在", async () => {
    const response = await executor.execute({
      requestId: "req-002",
      toolId: "tool:nonexistent",
      input: {},
      caller: { entityId: "agent:main" },
    });

    expect(response.success).toBe(false);
    expect(response.error!.code).toBe(ToolErrorCode.NotFound);
    expect(response.error!.retryable).toBe(false);
  });

  it("应返回 INVALID_INPUT 错误当状态非 active", async () => {
    const deprecatedTool = createMockTool({
      id: "tool:deprecated",
      status: EntityStatus.Deprecated,
    });
    const registry = createMockRegistry([deprecatedTool]);
    const exec = createToolExecutor(registry, {
      workspacePath: "/mock/workspace",
      callModel: mockCallModel,
    });

    const response = await exec.execute({
      requestId: "req-003",
      toolId: "tool:deprecated",
      input: { messages: [] },
      caller: { entityId: "agent:main" },
    });

    expect(response.success).toBe(false);
    expect(response.error!.code).toBe(ToolErrorCode.InvalidInput);
  });

  it("应返回 INVALID_INPUT 错误当缺少必填字段", async () => {
    const response = await executor.execute({
      requestId: "req-004",
      toolId: "tool:call-model",
      input: {}, // 缺少 messages
      caller: { entityId: "agent:main" },
    });

    expect(response.success).toBe(false);
    expect(response.error!.code).toBe(ToolErrorCode.InvalidInput);
  });

  it("应正确测量执行时间", async () => {
    const response = await executor.execute({
      requestId: "req-005",
      toolId: "tool:call-model",
      input: { messages: [{ role: "user", content: "test" }] },
      caller: { entityId: "agent:main" },
    });

    expect(response.duration).toBeGreaterThanOrEqual(0);
    expect(typeof response.duration).toBe("number");
  });
});

describe("executor 错误处理", () => {
  it("应返回 RUNTIME_ERROR 当入口未知", async () => {
    const unknownTool = createMockTool({
      id: "tool:unknown-entry",
      entrypoint: "unknown:handler",
    });
    const registry = createMockRegistry([unknownTool]);
    const mockCallModel = vi.fn();
    const executor = createToolExecutor(registry, {
      workspacePath: "/mock/workspace",
      callModel: mockCallModel,
    });

    const response = await executor.execute({
      requestId: "req-006",
      toolId: "tool:unknown-entry",
      input: { messages: [{ role: "user", content: "test" }] },
      caller: { entityId: "agent:main" },
    });

    expect(response.success).toBe(false);
    expect(response.error!.code).toBe(ToolErrorCode.RuntimeError);
  });

  it("应返回 RUNTIME_ERROR 当未知内置入口", async () => {
    const unknownBuiltin = createMockTool({
      id: "tool:unknown-builtin",
      entrypoint: "builtin:nonexistent",
    });
    const registry = createMockRegistry([unknownBuiltin]);
    const exec = createToolExecutor(registry, {
      workspacePath: "/mock/workspace",
      callModel: vi.fn(),
    });

    const response = await exec.execute({
      requestId: "req-007",
      toolId: "tool:unknown-builtin",
      input: { messages: [{ role: "user", content: "test" }] },
      caller: { entityId: "agent:main" },
    });

    expect(response.success).toBe(false);
    expect(response.error!.code).toBe(ToolErrorCode.RuntimeError);
    expect(response.error!.message).toContain("未知的内置工具入口");
  });

  it("应返回 RUNTIME_ERROR 当脚本不存在", async () => {
    const scriptTool = createMockTool({
      id: "tool:missing-script",
      entrypoint: "scripts/nonexistent.js",
    });
    const registry = createMockRegistry([scriptTool]);
    const exec = createToolExecutor(registry, {
      workspacePath: "/mock/workspace",
      callModel: vi.fn(),
    });

    const response = await exec.execute({
      requestId: "req-008",
      toolId: "tool:missing-script",
      input: { messages: [{ role: "user", content: "test" }] },
      caller: { entityId: "agent:main" },
    });

    expect(response.success).toBe(false);
    expect(response.error!.code).toBe(ToolErrorCode.RuntimeError);
  });

  it("应返回 INVALID_INPUT 当工具已归档", async () => {
    const archivedTool = createMockTool({
      id: "tool:archived",
      status: EntityStatus.Archived,
    });
    const registry = createMockRegistry([archivedTool]);
    const exec = createToolExecutor(registry, {
      workspacePath: "/mock/workspace",
      callModel: vi.fn(),
    });

    const response = await exec.execute({
      requestId: "req-009",
      toolId: "tool:archived",
      input: { messages: [{ role: "user", content: "test" }] },
      caller: { entityId: "agent:main" },
    });

    expect(response.success).toBe(false);
    expect(response.error!.code).toBe(ToolErrorCode.InvalidInput);
  });
});
