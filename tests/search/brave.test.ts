/**
 * Brave 搜索 Provider 单元测试
 */

import { describe, it, expect, vi } from "vitest";
import { createBraveProvider } from "../../src/search/brave.js";

/** 构造 Brave API 响应 */
function makeBraveResponse(
  items: Array<{ title: string; url: string; description?: string }>,
): string {
  return JSON.stringify({
    web: {
      results: items,
    },
  });
}

describe("createBraveProvider", () => {
  it("应解析 Brave API JSON 并返回搜索结果", async () => {
    const json = makeBraveResponse([
      { title: "Result 1", url: "https://example.com/1", description: "Snippet 1" },
      { title: "Result 2", url: "https://example.com/2", description: "Snippet 2" },
    ]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(json, { status: 200 }));
    const provider = createBraveProvider(mockFetch as unknown as typeof globalThis.fetch, "test-key");

    const result = await provider.search("test", 5);

    expect(result.query).toBe("test");
    expect(result.results.length).toBe(2);
    expect(result.results[0].title).toBe("Result 1");
    expect(result.results[0].url).toBe("https://example.com/1");
    expect(result.results[0].snippet).toBe("Snippet 1");
  });

  it("description 为空时 snippet 应为空字符串", async () => {
    const json = makeBraveResponse([{ title: "No Desc", url: "https://example.com" }]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(json, { status: 200 }));
    const provider = createBraveProvider(mockFetch as unknown as typeof globalThis.fetch, "test-key");

    const result = await provider.search("test", 5);

    expect(result.results[0].snippet).toBe("");
  });

  it("应发送正确的请求头", async () => {
    const json = makeBraveResponse([]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(json, { status: 200 }));
    const provider = createBraveProvider(mockFetch as unknown as typeof globalThis.fetch, "my-api-key");

    await provider.search("test", 5);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Subscription-Token"]).toBe("my-api-key");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("HTTP 401 应抛出异常", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const provider = createBraveProvider(mockFetch as unknown as typeof globalThis.fetch, "bad-key");

    await expect(provider.search("test", 5)).rejects.toThrow("Brave 搜索失败: HTTP 401");
  });

  it("应支持自定义 baseUrl", async () => {
    const json = makeBraveResponse([]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(json, { status: 200 }));
    const provider = createBraveProvider(
      mockFetch as unknown as typeof globalThis.fetch,
      "key",
      "https://custom.api.com/search",
    );

    await provider.search("hello", 3);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("https://custom.api.com/search?q=hello&count=3");
  });

  it("应限制返回数量", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
    }));
    const json = makeBraveResponse(items);
    const mockFetch = vi.fn().mockResolvedValue(new Response(json, { status: 200 }));
    const provider = createBraveProvider(mockFetch as unknown as typeof globalThis.fetch, "key");

    const result = await provider.search("test", 3);

    expect(result.results.length).toBe(3);
  });

  it("过滤无 title 或 url 的结果", async () => {
    const json = JSON.stringify({
      web: {
        results: [
          { title: "Valid", url: "https://example.com" },
          { title: "", url: "https://example.com/2" },
          { title: "No URL" },
        ],
      },
    });
    const mockFetch = vi.fn().mockResolvedValue(new Response(json, { status: 200 }));
    const provider = createBraveProvider(mockFetch as unknown as typeof globalThis.fetch, "key");

    const result = await provider.search("test", 10);

    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe("Valid");
  });
});
