import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelError } from "../../src/errors/index.js";
import type { StreamEvent } from "../../src/model/types.js";

/**
 * 测试 pi-ai 适配器的转换逻辑
 * 通过 mock pi-ai 的 stream/complete 函数，验证 adapter 的输入/输出映射
 */

// Mock pi-ai 模块
vi.mock("@mariozechner/pi-ai", () => {
  return {
    registerBuiltInApiProviders: vi.fn(),
    stream: vi.fn(),
    complete: vi.fn(),
  };
});

// 动态引入以确保 mock 生效
const { createPiAiProvider } = await import("../../src/model/providers/adapter.js");
const piAi = await import("@mariozechner/pi-ai");

/** 创建 mock pi-ai AssistantMessage */
function createMockAssistantMessage(overrides?: Record<string, unknown>) {
  return {
    role: "assistant",
    content: [{ type: "text", text: "你好，Ouroboros" }],
    api: "openai-completions",
    provider: "openai",
    model: "test-model",
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
    ...overrides,
  };
}

/** 创建 mock 异步可迭代事件流 */
function createMockEventStream(events: Array<Record<string, unknown>>) {
  let idx = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (idx < events.length) {
            return { value: events[idx++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
    result: vi.fn(),
  };
}

describe("createPiAiProvider", () => {
  const config = {
    type: "openai" as const,
    apiKey: "sk-test",
    baseUrl: "https://api.test.com/v1",
    defaultModel: "test-model",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该创建正确名称的提供商", () => {
    const provider = createPiAiProvider(config);
    expect(provider.name).toBe("openai");
  });

  it("应该为 anthropic 类型创建正确名称的提供商", () => {
    const provider = createPiAiProvider({ ...config, type: "anthropic" });
    expect(provider.name).toBe("anthropic");
  });

  describe("complete()", () => {
    it("应该将 ModelRequest 转换为 pi-ai 格式并返回 ModelResponse", async () => {
      const mockMsg = createMockAssistantMessage();
      vi.mocked(piAi.complete).mockResolvedValue(mockMsg as any);

      const provider = createPiAiProvider(config);
      const result = await provider.complete({
        messages: [{ role: "user", content: "你好" }],
        temperature: 0.7,
        maxTokens: 100,
      });

      expect(result.content).toBe("你好，Ouroboros");
      expect(result.stopReason).toBe("end_turn");
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.usage.totalTokens).toBe(15);
      expect(result.model).toBe("test-model");

      // 验证传给 pi-ai 的参数
      const [model, context, options] = vi.mocked(piAi.complete).mock.calls[0];
      expect(model.id).toBe("test-model");
      expect(model.api).toBe("openai-completions");
      expect(model.baseUrl).toBe("https://api.test.com/v1");
      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].role).toBe("user");
      expect((options as any).apiKey).toBe("sk-test");
      expect((options as any).temperature).toBe(0.7);
      expect((options as any).maxTokens).toBe(100);
    });

    it("应该正确提取 system 消息为 systemPrompt", async () => {
      vi.mocked(piAi.complete).mockResolvedValue(createMockAssistantMessage() as any);

      const provider = createPiAiProvider(config);
      await provider.complete({
        messages: [
          { role: "system", content: "你是助手" },
          { role: "user", content: "你好" },
        ],
      });

      const [, context] = vi.mocked(piAi.complete).mock.calls[0];
      expect(context.systemPrompt).toBe("你是助手");
      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].role).toBe("user");
    });

    it("应该正确处理工具调用响应", async () => {
      const mockMsg = createMockAssistantMessage({
        content: [
          { type: "text", text: "我来搜索" },
          { type: "toolCall", id: "call_1", name: "search", arguments: { q: "test" } },
        ],
        stopReason: "toolUse",
      });
      vi.mocked(piAi.complete).mockResolvedValue(mockMsg as any);

      const provider = createPiAiProvider(config);
      const result = await provider.complete({
        messages: [{ role: "user", content: "搜索" }],
        tools: [
          {
            name: "search",
            description: "搜索工具",
            parameters: { type: "object", properties: { q: { type: "string" } } },
          },
        ],
      });

      expect(result.content).toBe("我来搜索");
      expect(result.stopReason).toBe("tool_use");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("search");
      expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({ q: "test" });

      // 验证工具定义传递
      const [, context] = vi.mocked(piAi.complete).mock.calls[0];
      expect(context.tools).toHaveLength(1);
      expect(context.tools![0].name).toBe("search");
    });

    it("应该正确处理 tool 结果消息", async () => {
      vi.mocked(piAi.complete).mockResolvedValue(createMockAssistantMessage() as any);

      const provider = createPiAiProvider(config);
      await provider.complete({
        messages: [
          { role: "user", content: "搜索" },
          { role: "assistant", content: "正在搜索" },
          { role: "tool", content: "搜索结果", toolCallId: "tu_1" },
        ],
      });

      const [, context] = vi.mocked(piAi.complete).mock.calls[0];
      expect(context.messages).toHaveLength(3);
      const toolMsg = context.messages[2] as any;
      expect(toolMsg.role).toBe("toolResult");
      expect(toolMsg.toolCallId).toBe("tu_1");
      expect(toolMsg.content[0].text).toBe("搜索结果");
    });

    it("应该在错误时抛出 ModelError", async () => {
      vi.mocked(piAi.complete).mockRejectedValue(new Error("API 错误"));

      const provider = createPiAiProvider(config);
      await expect(
        provider.complete({ messages: [{ role: "user", content: "你好" }] }),
      ).rejects.toThrow(ModelError);
    });

    it("应该传递 AbortSignal", async () => {
      vi.mocked(piAi.complete).mockResolvedValue(createMockAssistantMessage() as any);

      const controller = new AbortController();
      const provider = createPiAiProvider(config);
      await provider.complete(
        { messages: [{ role: "user", content: "你好" }] },
        controller.signal,
      );

      const [, , options] = vi.mocked(piAi.complete).mock.calls[0];
      expect((options as any).signal).toBe(controller.signal);
    });

    it("应该使用 request.model 覆盖默认模型", async () => {
      vi.mocked(piAi.complete).mockResolvedValue(createMockAssistantMessage() as any);

      const provider = createPiAiProvider(config);
      await provider.complete({
        messages: [{ role: "user", content: "你好" }],
        model: "gpt-4o-mini",
      });

      const [model] = vi.mocked(piAi.complete).mock.calls[0];
      expect(model.id).toBe("gpt-4o-mini");
    });

    it("应该正确映射 max_tokens 停止原因", async () => {
      vi.mocked(piAi.complete).mockResolvedValue(
        createMockAssistantMessage({ stopReason: "length" }) as any,
      );

      const provider = createPiAiProvider(config);
      const result = await provider.complete({
        messages: [{ role: "user", content: "你好" }],
      });

      expect(result.stopReason).toBe("max_tokens");
    });
  });

  describe("stream()", () => {
    it("应该正确转发文本流事件", async () => {
      const mockMsg = createMockAssistantMessage();
      const events = [
        { type: "start", partial: mockMsg },
        { type: "text_start", contentIndex: 0, partial: mockMsg },
        { type: "text_delta", contentIndex: 0, delta: "你好", partial: mockMsg },
        { type: "text_delta", contentIndex: 0, delta: "，世界", partial: mockMsg },
        { type: "text_end", contentIndex: 0, content: "你好，世界", partial: mockMsg },
        { type: "done", reason: "stop", message: mockMsg },
      ];

      vi.mocked(piAi.stream).mockReturnValue(createMockEventStream(events) as any);

      const provider = createPiAiProvider(config);
      const streamEvents: StreamEvent[] = [];
      const result = await provider.stream(
        { messages: [{ role: "user", content: "你好" }] },
        (e) => streamEvents.push(e),
      );

      expect(result.content).toBe("你好，Ouroboros"); // 从 done message 提取
      expect(streamEvents.filter((e) => e.type === "text_delta")).toHaveLength(2);
      expect(streamEvents.some((e) => e.type === "done")).toBe(true);
    });

    it("应该处理工具调用流", async () => {
      const toolCallMsg = createMockAssistantMessage({
        content: [
          { type: "toolCall", id: "call_1", name: "search", arguments: { q: "test" } },
        ],
        stopReason: "toolUse",
      });

      const partialWithToolStart = {
        ...toolCallMsg,
        content: [{ type: "toolCall", id: "call_1", name: "search", arguments: {} }],
      };

      const events = [
        { type: "start", partial: toolCallMsg },
        { type: "toolcall_start", contentIndex: 0, partial: partialWithToolStart },
        { type: "toolcall_delta", contentIndex: 0, delta: '{"q":', partial: toolCallMsg },
        { type: "toolcall_delta", contentIndex: 0, delta: '"test"}', partial: toolCallMsg },
        {
          type: "toolcall_end",
          contentIndex: 0,
          toolCall: { type: "toolCall", id: "call_1", name: "search", arguments: { q: "test" } },
          partial: toolCallMsg,
        },
        { type: "done", reason: "toolUse", message: toolCallMsg },
      ];

      vi.mocked(piAi.stream).mockReturnValue(createMockEventStream(events) as any);

      const provider = createPiAiProvider(config);
      const streamEvents: StreamEvent[] = [];
      const result = await provider.stream(
        { messages: [{ role: "user", content: "搜索" }] },
        (e) => streamEvents.push(e),
      );

      expect(result.stopReason).toBe("tool_use");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("search");
      expect(streamEvents.some((e) => e.type === "tool_call_start")).toBe(true);
      expect(streamEvents.some((e) => e.type === "tool_call_delta")).toBe(true);
      expect(streamEvents.some((e) => e.type === "tool_call_end")).toBe(true);
    });

    it("应该在流式错误时抛出 ModelError", async () => {
      const errorMsg = createMockAssistantMessage({
        stopReason: "error",
        errorMessage: "Rate limited",
      });
      const events = [
        { type: "error", reason: "error", error: errorMsg },
      ];

      vi.mocked(piAi.stream).mockReturnValue(createMockEventStream(events) as any);

      const provider = createPiAiProvider(config);
      await expect(
        provider.stream(
          { messages: [{ role: "user", content: "你好" }] },
          () => {},
        ),
      ).rejects.toThrow(ModelError);
    });

    it("应该在 pi-ai 抛出异常时转换为 ModelError", async () => {
      vi.mocked(piAi.stream).mockImplementation(() => {
        throw new Error("Connection failed");
      });

      const provider = createPiAiProvider(config);
      await expect(
        provider.stream(
          { messages: [{ role: "user", content: "你好" }] },
          () => {},
        ),
      ).rejects.toThrow(ModelError);
    });

    it("应该传递 AbortSignal", async () => {
      const mockMsg = createMockAssistantMessage();
      const events = [
        { type: "done", reason: "stop", message: mockMsg },
      ];
      vi.mocked(piAi.stream).mockReturnValue(createMockEventStream(events) as any);

      const controller = new AbortController();
      const provider = createPiAiProvider(config);
      await provider.stream(
        { messages: [{ role: "user", content: "你好" }] },
        () => {},
        controller.signal,
      );

      const [, , options] = vi.mocked(piAi.stream).mock.calls[0];
      expect((options as any).signal).toBe(controller.signal);
    });
  });
});

describe("provider type 映射", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["openai", "openai-completions"],
    ["anthropic", "anthropic-messages"],
    ["openai-compatible", "openai-completions"],
    ["google", "google-generative-ai"],
    ["mistral", "openai-completions"],
    ["groq", "openai-completions"],
    ["bedrock", "bedrock-converse-stream"],
  ] as const)("类型 %s 应该映射到 pi-ai API %s", async (type, expectedApi) => {
    vi.mocked(piAi.complete).mockResolvedValue(createMockAssistantMessage() as any);

    const provider = createPiAiProvider({
      type: type as any,
      apiKey: "test",
    });

    await provider.complete({
      messages: [{ role: "user", content: "test" }],
    });

    const [model] = vi.mocked(piAi.complete).mock.calls[0];
    expect(model.api).toBe(expectedApi);
  });
});

describe("stopReason 映射", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["stop", "end_turn"],
    ["length", "max_tokens"],
    ["toolUse", "tool_use"],
    ["unknown", "end_turn"],
  ] as const)("pi-ai '%s' 应该映射为 '%s'", async (piReason, expectedReason) => {
    vi.mocked(piAi.complete).mockResolvedValue(
      createMockAssistantMessage({ stopReason: piReason }) as any,
    );

    const provider = createPiAiProvider({
      type: "openai",
      apiKey: "test",
    });

    const result = await provider.complete({
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.stopReason).toBe(expectedReason);
  });
});
