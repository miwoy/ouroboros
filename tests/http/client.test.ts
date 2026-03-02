/**
 * HTTP 客户端单元测试
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// 使用 vi.hoisted 确保变量在 mock 工厂之前可用
const { mockClose, mockUndiciFetch } = vi.hoisted(() => ({
  mockClose: vi.fn(),
  mockUndiciFetch: vi.fn().mockResolvedValue(new Response("proxy response")),
}));

vi.mock("undici", () => {
  return {
    ProxyAgent: class MockProxyAgent {
      uri: string;
      constructor(uri: string) {
        this.uri = uri;
      }
      close() {
        mockClose();
      }
    },
    fetch: mockUndiciFetch,
  };
});

import { createHttpClient } from "../../src/http/client.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("createHttpClient", () => {
  it("无代理时应使用 globalThis.fetch", () => {
    const client = createHttpClient();
    expect(client.fetch).toBe(globalThis.fetch);
    // dispose 不报错
    client.dispose();
  });

  it("无代理配置（空对象）应使用 globalThis.fetch", () => {
    const client = createHttpClient({});
    expect(client.fetch).toBe(globalThis.fetch);
  });

  it("有代理时 fetch 不应为 globalThis.fetch", () => {
    const client = createHttpClient({ proxyUrl: "http://proxy.example.com:8080" });
    expect(client.fetch).not.toBe(globalThis.fetch);
  });

  it("有代理时 fetch 应调用 undici fetch 并传入 dispatcher", async () => {
    const client = createHttpClient({ proxyUrl: "http://proxy.example.com:8080" });
    await client.fetch("https://example.com");

    expect(mockUndiciFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockUndiciFetch.mock.calls[0];
    expect(callArgs[0]).toBe("https://example.com");
    expect(callArgs[1]).toHaveProperty("dispatcher");
  });

  it("有代理时 dispose 应关闭 ProxyAgent", () => {
    const client = createHttpClient({ proxyUrl: "http://proxy.example.com:8080" });
    client.dispose();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
