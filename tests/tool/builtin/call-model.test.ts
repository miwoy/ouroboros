/**
 * tool:call-model 内置工具单元测试
 */

import { describe, it, expect, vi } from "vitest";
import { handleCallModel } from "../../../src/tool/builtin/call-model.js";
import type { ToolExecutionContext, CallModelFn, ToolRegistry } from "../../../src/tool/types.js";

function createMockContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  const mockCallModel: CallModelFn = vi.fn().mockResolvedValue({
    content: "你好，世界",
    model: "test-model",
    stopReason: "end_turn",
    toolCalls: [],
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  });

  return {
    workspacePath: "/mock/workspace",
    callModel: mockCallModel,
    registry: {} as ToolRegistry,
    caller: { entityId: "agent:main" },
    ...overrides,
  };
}

describe("handleCallModel", () => {
  it("应正确调用模型并返回结果", async () => {
    const ctx = createMockContext();
    const result = await handleCallModel(
      { messages: [{ role: "user", content: "你好" }] },
      ctx,
    );

    expect(result.content).toBe("你好，世界");
    expect(result.model).toBe("test-model");
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it("应传递 provider 参数", async () => {
    const mockCallModel = vi.fn().mockResolvedValue({
      content: "ok",
      model: "gpt-4o",
      stopReason: "end_turn",
      toolCalls: [],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    const ctx = createMockContext({ callModel: mockCallModel });

    await handleCallModel(
      {
        messages: [{ role: "user", content: "test" }],
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.5,
        maxTokens: 100,
      },
      ctx,
    );

    expect(mockCallModel).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "test" }],
        model: "gpt-4o",
        temperature: 0.5,
        maxTokens: 100,
      }),
      expect.objectContaining({ provider: "openai" }),
    );
  });

  it("应拒绝无效输入", async () => {
    const ctx = createMockContext();

    await expect(handleCallModel({}, ctx)).rejects.toThrow("输入校验失败");
  });

  it("应拒绝空消息列表", async () => {
    const ctx = createMockContext();

    await expect(
      handleCallModel({ messages: [] }, ctx),
    ).rejects.toThrow();
  });
});
