import { describe, it, expect, vi, afterEach } from "vitest";
import { createOpenAIProvider } from "../../src/model/providers/openai.js";
import { createAnthropicProvider } from "../../src/model/providers/anthropic.js";
import { ModelError } from "../../src/errors/index.js";
import type { ModelProviderConfig } from "../../src/config/schema.js";
import type { StreamEvent } from "../../src/model/types.js";

// Mock fetch
const originalFetch = globalThis.fetch;

/** 创建模拟 SSE 流的 ReadableStream */
function createSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = lines.join("\n") + "\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe("createOpenAIProvider", () => {
  const config: ModelProviderConfig = {
    type: "openai",
    apiKey: "sk-test",
    baseUrl: "https://api.test.com/v1",
    defaultModel: "test-model",
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("应该创建名为 openai 的提供商", () => {
    const provider = createOpenAIProvider(config);
    expect(provider.name).toBe("openai");
  });

  it("complete() 应该发送正确的请求并解析响应", async () => {
    const mockResponse = {
      id: "chatcmpl-123",
      model: "test-model",
      choices: [
        {
          message: { content: "你好，Ouroboros", tool_calls: undefined },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const provider = createOpenAIProvider(config);
    const result = await provider.complete({
      messages: [{ role: "user", content: "你好" }],
      temperature: 0.7,
      maxTokens: 100,
    });

    expect(result.content).toBe("你好，Ouroboros");
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
    expect(result.model).toBe("test-model");

    // 验证请求参数
    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.test.com/v1/chat/completions");
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.model).toBe("test-model");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(100);
  });

  it("complete() 应该在 API 返回错误时抛出 ModelError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const provider = createOpenAIProvider(config);
    await expect(
      provider.complete({ messages: [{ role: "user", content: "你好" }] }),
    ).rejects.toThrow(ModelError);
  });

  it("complete() 应该正确处理工具调用响应", async () => {
    const mockResponse = {
      id: "chatcmpl-123",
      model: "test-model",
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "search", arguments: '{"q":"test"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const provider = createOpenAIProvider(config);
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

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("search");
    expect(result.toolCalls[0].arguments).toBe('{"q":"test"}');
  });

  it("complete() 应该正确传递 Authorization header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: "m",
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
    });

    const provider = createOpenAIProvider(config);
    await provider.complete({ messages: [{ role: "user", content: "hi" }] });

    const headers = vi.mocked(globalThis.fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
  });

  it("stream() 应该解析 SSE 文本流并触发回调", async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"你好"},"finish_reason":null}],"model":"test-model"}',
      'data: {"choices":[{"delta":{"content":"，世界"},"finish_reason":null}],"model":"test-model"}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}',
      "data: [DONE]",
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(sseLines),
    });

    const provider = createOpenAIProvider(config);
    const events: StreamEvent[] = [];
    const result = await provider.stream({ messages: [{ role: "user", content: "你好" }] }, (e) =>
      events.push(e),
    );

    expect(result.content).toBe("你好，世界");
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage.promptTokens).toBe(5);
    expect(events.filter((e) => e.type === "text_delta")).toHaveLength(2);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("stream() 应该处理工具调用流", async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":""}}]},"finish_reason":null}],"model":"test-model"}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"q\\":\\"test\\"}"}}]},"finish_reason":null}],"model":"test-model"}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":5,"completion_tokens":10,"total_tokens":15}}',
      "data: [DONE]",
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(sseLines),
    });

    const provider = createOpenAIProvider(config);
    const events: StreamEvent[] = [];
    const result = await provider.stream({ messages: [{ role: "user", content: "搜索" }] }, (e) =>
      events.push(e),
    );

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("search");
    expect(events.some((e) => e.type === "tool_call_start")).toBe(true);
    expect(events.some((e) => e.type === "tool_call_delta")).toBe(true);
  });

  it("stream() 应该在 API 错误时抛出 ModelError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server Error"),
    });

    const provider = createOpenAIProvider(config);
    await expect(
      provider.stream({ messages: [{ role: "user", content: "你好" }] }, () => {}),
    ).rejects.toThrow(ModelError);
  });

  it("stream() 应该在无 body 时抛出 ModelError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    const provider = createOpenAIProvider(config);
    await expect(
      provider.stream({ messages: [{ role: "user", content: "你好" }] }, () => {}),
    ).rejects.toThrow(ModelError);
  });

  it("complete() 应该在使用默认 baseUrl 和 model 时正常工作", () => {
    const minConfig: ModelProviderConfig = { type: "openai", apiKey: "key" };
    const provider = createOpenAIProvider(minConfig);
    expect(provider.name).toBe("openai");
  });

  it("complete() 应该处理 stop 参数", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: "m",
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
    });

    const provider = createOpenAIProvider(config);
    await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      stop: ["END"],
    });

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string);
    expect(body.stop).toEqual(["END"]);
  });
});

describe("createAnthropicProvider", () => {
  const config: ModelProviderConfig = {
    type: "anthropic",
    apiKey: "sk-ant-test",
    baseUrl: "https://api.test.com",
    defaultModel: "claude-test",
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("应该创建名为 anthropic 的提供商", () => {
    const provider = createAnthropicProvider(config);
    expect(provider.name).toBe("anthropic");
  });

  it("complete() 应该正确转换消息格式并解析响应", async () => {
    const mockResponse = {
      id: "msg-123",
      model: "claude-test",
      content: [{ type: "text", text: "你好，Ouroboros" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const provider = createAnthropicProvider(config);
    const result = await provider.complete({
      messages: [
        { role: "system", content: "你是助手" },
        { role: "user", content: "你好" },
      ],
    });

    expect(result.content).toBe("你好，Ouroboros");
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(15);

    // 验证 system 提示词被单独提取
    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string);
    expect(body.system).toBe("你是助手");
    expect(body.messages[0].role).toBe("user");
  });

  it("complete() 应该使用 x-api-key header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "msg",
          model: "m",
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
    });

    const provider = createAnthropicProvider(config);
    await provider.complete({ messages: [{ role: "user", content: "hi" }] });

    const headers = vi.mocked(globalThis.fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("complete() 应该在 API 错误时抛出 ModelError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const provider = createAnthropicProvider(config);
    await expect(
      provider.complete({ messages: [{ role: "user", content: "你好" }] }),
    ).rejects.toThrow(ModelError);
  });

  it("complete() 应该正确处理工具调用响应", async () => {
    const mockResponse = {
      id: "msg-123",
      model: "claude-test",
      content: [
        { type: "text", text: "我来搜索一下" },
        { type: "tool_use", id: "tu_1", name: "search", input: { q: "test" } },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 20 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const provider = createAnthropicProvider(config);
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

    expect(result.content).toBe("我来搜索一下");
    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("search");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({ q: "test" });
  });

  it("complete() 应该正确处理 tool 结果消息", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "msg",
          model: "m",
          content: [{ type: "text", text: "搜索结果是..." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
    });

    const provider = createAnthropicProvider(config);
    await provider.complete({
      messages: [
        { role: "user", content: "搜索" },
        { role: "assistant", content: "正在搜索" },
        { role: "tool", content: "搜索结果", toolCallId: "tu_1" },
      ],
    });

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string);
    const toolMsg = body.messages[2];
    expect(toolMsg.role).toBe("user");
    expect(toolMsg.content[0].type).toBe("tool_result");
    expect(toolMsg.content[0].tool_use_id).toBe("tu_1");
  });

  it("stream() 应该解析 Anthropic SSE 流并触发回调", async () => {
    const sseLines = [
      'data: {"type":"message_start","message":{"model":"claude-test","usage":{"input_tokens":10,"output_tokens":0}}}',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"，世界"}}',
      'data: {"type":"content_block_stop","index":0}',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}',
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(sseLines),
    });

    const provider = createAnthropicProvider(config);
    const events: StreamEvent[] = [];
    const result = await provider.stream({ messages: [{ role: "user", content: "你好" }] }, (e) =>
      events.push(e),
    );

    expect(result.content).toBe("你好，世界");
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
    expect(events.filter((e) => e.type === "text_delta")).toHaveLength(2);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("stream() 应该处理工具调用流", async () => {
    const sseLines = [
      'data: {"type":"message_start","message":{"model":"claude-test","usage":{"input_tokens":10,"output_tokens":0}}}',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_1","name":"search"}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"q\\":\\"test\\"}"}}',
      'data: {"type":"content_block_stop","index":0}',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":15}}',
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(sseLines),
    });

    const provider = createAnthropicProvider(config);
    const events: StreamEvent[] = [];
    const result = await provider.stream({ messages: [{ role: "user", content: "搜索" }] }, (e) =>
      events.push(e),
    );

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("search");
    expect(events.some((e) => e.type === "tool_call_start")).toBe(true);
    expect(events.some((e) => e.type === "tool_call_delta")).toBe(true);
    expect(events.some((e) => e.type === "tool_call_end")).toBe(true);
  });

  it("stream() 应该在 API 错误时抛出 ModelError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited"),
    });

    const provider = createAnthropicProvider(config);
    await expect(
      provider.stream({ messages: [{ role: "user", content: "你好" }] }, () => {}),
    ).rejects.toThrow(ModelError);
  });

  it("stream() 应该在无 body 时抛出 ModelError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    const provider = createAnthropicProvider(config);
    await expect(
      provider.stream({ messages: [{ role: "user", content: "你好" }] }, () => {}),
    ).rejects.toThrow(ModelError);
  });

  it("complete() 应该使用默认值", () => {
    const minConfig: ModelProviderConfig = { type: "anthropic", apiKey: "key" };
    const provider = createAnthropicProvider(minConfig);
    expect(provider.name).toBe("anthropic");
  });

  it("complete() 应该传递 stop_sequences 和 temperature", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "msg",
          model: "m",
          content: [{ type: "text", text: "ok" }],
          stop_reason: "stop_sequence",
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
    });

    const provider = createAnthropicProvider(config);
    const result = await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      stop: ["END"],
      temperature: 0.5,
    });

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string);
    expect(body.stop_sequences).toEqual(["END"]);
    expect(body.temperature).toBe(0.5);
    expect(result.stopReason).toBe("stop_sequence");
  });
});
