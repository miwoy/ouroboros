import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCallModel } from "../../src/model/call-model.js";
import type { ProviderRegistry } from "../../src/model/registry.js";
import type { Config } from "../../src/config/schema.js";
import type { ModelProvider, ModelResponse } from "../../src/model/types.js";

/** 创建一个 mock 提供商 */
function createMockProvider(overrides?: Partial<ModelProvider>): ModelProvider {
  const defaultResponse: ModelResponse = {
    content: "你好，Ouroboros",
    toolCalls: [],
    stopReason: "end_turn",
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: "test-model",
  };

  return {
    name: "mock",
    complete: vi.fn().mockResolvedValue(defaultResponse),
    stream: vi.fn().mockImplementation(async (_req, callback) => {
      callback({ type: "text_delta", text: "你好" });
      callback({ type: "text_delta", text: "，Ouroboros" });
      callback({ type: "done", response: defaultResponse });
      return defaultResponse;
    }),
    ...overrides,
  };
}

/** 创建测试用配置 */
function createTestConfig(overrides?: Partial<Config["model"]>): Config {
  return {
    system: { logLevel: "info", workspacePath: "./workspace" },
    model: {
      defaultProvider: "mock",
      timeout: 5000,
      maxRetries: 1,
      retryBaseDelay: 10,
      providers: {},
      ...overrides,
    },
  };
}

/** 创建 mock 注册表 */
function createMockRegistry(providers: Record<string, ModelProvider>): ProviderRegistry {
  return {
    get: (name: string) => {
      const p = providers[name];
      if (!p) throw new Error(`Provider "${name}" not found`);
      return p;
    },
    has: (name: string) => name in providers,
    names: () => Object.keys(providers),
  };
}

describe("createCallModel", () => {
  let mockProvider: ModelProvider;
  let registry: ProviderRegistry;
  let config: Config;

  beforeEach(() => {
    mockProvider = createMockProvider();
    registry = createMockRegistry({ mock: mockProvider });
    config = createTestConfig();
  });

  it("应该使用默认提供商进行非流式调用", async () => {
    const callModel = createCallModel(config, registry);
    const result = await callModel({
      messages: [{ role: "user", content: "你好" }],
    });

    expect(result.content).toBe("你好，Ouroboros");
    expect(mockProvider.complete).toHaveBeenCalledTimes(1);
  });

  it("应该支持指定提供商", async () => {
    const anotherProvider = createMockProvider({
      name: "another",
      complete: vi.fn().mockResolvedValue({
        content: "来自另一个提供商",
        toolCalls: [],
        stopReason: "end_turn" as const,
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        model: "another-model",
      }),
    });
    registry = createMockRegistry({ mock: mockProvider, another: anotherProvider });
    const callModel = createCallModel(config, registry);

    const result = await callModel(
      { messages: [{ role: "user", content: "你好" }] },
      { provider: "another" },
    );

    expect(result.content).toBe("来自另一个提供商");
    expect(anotherProvider.complete).toHaveBeenCalledTimes(1);
    expect(mockProvider.complete).not.toHaveBeenCalled();
  });

  it("应该支持流式调用", async () => {
    const callModel = createCallModel(config, registry);
    const events: string[] = [];
    const onStream = vi.fn((event) => {
      events.push(event.type);
    });

    const result = await callModel(
      { messages: [{ role: "user", content: "你好" }] },
      { stream: true, onStream },
    );

    expect(result.content).toBe("你好，Ouroboros");
    expect(mockProvider.stream).toHaveBeenCalledTimes(1);
    expect(events).toContain("text_delta");
    expect(events).toContain("done");
  });

  it("应该在超时时抛出错误", async () => {
    const slowProvider = createMockProvider({
      complete: vi.fn().mockImplementation(
        (_req, signal) =>
          new Promise((_resolve, reject) => {
            const handler = () => reject(signal?.reason ?? new Error("aborted"));
            if (signal?.aborted) {
              handler();
              return;
            }
            signal?.addEventListener("abort", handler, { once: true });
          }),
      ),
    });
    registry = createMockRegistry({ mock: slowProvider });
    // 设置极短超时
    config = createTestConfig({ timeout: 50, maxRetries: 0 });
    const callModel = createCallModel(config, registry);

    await expect(
      callModel({ messages: [{ role: "user", content: "你好" }] }),
    ).rejects.toThrow();
  });

  it("应该支持通过外部 signal 取消", async () => {
    const controller = new AbortController();
    const hangProvider = createMockProvider({
      complete: vi.fn().mockImplementation(
        (_req, signal) =>
          new Promise((_resolve, reject) => {
            const handler = () => reject(new Error("cancelled"));
            if (signal?.aborted) {
              handler();
              return;
            }
            signal?.addEventListener("abort", handler, { once: true });
          }),
      ),
    });
    registry = createMockRegistry({ mock: hangProvider });
    const callModel = createCallModel(config, registry);

    // 立即取消
    controller.abort(new Error("user cancel"));
    await expect(
      callModel(
        { messages: [{ role: "user", content: "你好" }] },
        { signal: controller.signal },
      ),
    ).rejects.toThrow();
  });

  it("应该在遇到可重试错误时自动重试", async () => {
    const retryProvider = createMockProvider({
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error("429 rate limit"))
        .mockResolvedValue({
          content: "重试成功",
          toolCalls: [],
          stopReason: "end_turn" as const,
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: "test-model",
        }),
    });
    registry = createMockRegistry({ mock: retryProvider });
    config = createTestConfig({ maxRetries: 2, retryBaseDelay: 10 });
    const callModel = createCallModel(config, registry);

    const result = await callModel({
      messages: [{ role: "user", content: "你好" }],
    });

    expect(result.content).toBe("重试成功");
    expect(retryProvider.complete).toHaveBeenCalledTimes(2);
  });
});
