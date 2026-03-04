/**
 * Bing 搜索 Provider 单元测试
 */

import { describe, it, expect, vi } from "vitest";
import { createBingProvider } from "../../src/search/bing.js";

/** 构造 Bing HTML 响应 */
function makeBingHtml(items: Array<{ title: string; url: string; snippet: string }>): string {
  const blocks = items
    .map(
      (item) =>
        `<li class="b_algo"><h2><a href="${item.url}">${item.title}</a></h2><p>${item.snippet}</p></li>`,
    )
    .join("");
  return `<html><body><ol id="b_results">${blocks}</ol></body></html>`;
}

describe("createBingProvider", () => {
  it("应解析 Bing HTML 并返回搜索结果", async () => {
    const html = makeBingHtml([
      {
        title: "TypeScript 官网",
        url: "https://typescriptlang.org",
        snippet: "TypeScript 是一种语言",
      },
      { title: "MDN", url: "https://mdn.org", snippet: "Web 开发文档" },
    ]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    const provider = createBingProvider(mockFetch as unknown as typeof globalThis.fetch);

    const result = await provider.search("TypeScript", 5);

    expect(result.query).toBe("TypeScript");
    expect(result.results.length).toBe(2);
    expect(result.results[0].title).toBe("TypeScript 官网");
    expect(result.results[0].url).toBe("https://typescriptlang.org");
    expect(result.results[0].snippet).toBe("TypeScript 是一种语言");
    expect(result.results[1].title).toBe("MDN");
  });

  it("应正确处理 HTML 实体", async () => {
    const html = makeBingHtml([
      { title: "A &amp; B", url: "https://example.com", snippet: "&lt;tag&gt; &quot;text&quot;" },
    ]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    const provider = createBingProvider(mockFetch as unknown as typeof globalThis.fetch);

    const result = await provider.search("test", 5);

    expect(result.results[0].title).toBe("A & B");
    expect(result.results[0].snippet).toBe('<tag> "text"');
  });

  it("无结果时应返回空数组", async () => {
    const html = "<html><body><ol id='b_results'></ol></body></html>";
    const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    const provider = createBingProvider(mockFetch as unknown as typeof globalThis.fetch);

    const result = await provider.search("xyznonexistent", 5);

    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("应限制返回数量", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      snippet: `Snippet ${i}`,
    }));
    const html = makeBingHtml(items);
    const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    const provider = createBingProvider(mockFetch as unknown as typeof globalThis.fetch);

    const result = await provider.search("test", 3);

    expect(result.results.length).toBe(3);
  });

  it("HTTP 错误应抛出异常", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    const provider = createBingProvider(mockFetch as unknown as typeof globalThis.fetch);

    await expect(provider.search("test", 5)).rejects.toThrow("Bing 搜索失败: HTTP 429");
  });

  it("应传递 AbortSignal", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 }));
    const provider = createBingProvider(mockFetch as unknown as typeof globalThis.fetch);
    const controller = new AbortController();

    await provider.search("test", 5, controller.signal);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].signal).toBe(controller.signal);
  });

  it("应构造正确的搜索 URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 }));
    const provider = createBingProvider(mockFetch as unknown as typeof globalThis.fetch);

    await provider.search("hello world", 3);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe("https://www.bing.com/search?q=hello%20world&count=3&ensearch=1");
  });
});
