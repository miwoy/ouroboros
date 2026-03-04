/**
 * DuckDuckGo 搜索 Provider 单元测试
 */

import { describe, it, expect, vi } from "vitest";
import { createDuckDuckGoProvider } from "../../src/search/duckduckgo.js";

/** 构造 DuckDuckGo HTML 测试数据 */
function makeDdgHtml(
  items: Array<{ title: string; url: string; snippet: string }>,
): string {
  const results = items
    .map(
      (item) =>
        `<div class="result results_links results_links_deep web-result">
          <h2 class="result__title">
            <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(item.url)}&rut=abc">
              ${item.title}
            </a>
          </h2>
          <a class="result__snippet" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(item.url)}">
            ${item.snippet}
          </a>
        </div>`,
    )
    .join("");
  return `<html><body><div id="links">${results}</div></body></html>`;
}

describe("createDuckDuckGoProvider", () => {
  it("应解析 DDG HTML 并返回搜索结果", async () => {
    const html = makeDdgHtml([
      {
        title: "TypeScript 官网",
        url: "https://typescriptlang.org",
        snippet: "TypeScript 是一种语言",
      },
      { title: "MDN", url: "https://mdn.org", snippet: "Web 开发文档" },
    ]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    const provider = createDuckDuckGoProvider(mockFetch as unknown as typeof globalThis.fetch);

    const result = await provider.search("TypeScript", 5);

    expect(result.query).toBe("TypeScript");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].title).toBe("TypeScript 官网");
    expect(result.results[0].url).toBe("https://typescriptlang.org");
    expect(result.results[0].snippet).toBe("TypeScript 是一种语言");
    expect(result.results[1].title).toBe("MDN");
  });

  it("应正确解析 DDG 重定向 URL", async () => {
    const html = makeDdgHtml([
      {
        title: "Test",
        url: "https://example.com/path?key=value&foo=bar",
        snippet: "description",
      },
    ]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    const provider = createDuckDuckGoProvider(mockFetch as unknown as typeof globalThis.fetch);

    const result = await provider.search("test", 5);

    expect(result.results[0].url).toBe("https://example.com/path?key=value&foo=bar");
  });

  it("应限制返回数量", async () => {
    const html = makeDdgHtml([
      { title: "A", url: "https://a.com", snippet: "a" },
      { title: "B", url: "https://b.com", snippet: "b" },
      { title: "C", url: "https://c.com", snippet: "c" },
    ]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    const provider = createDuckDuckGoProvider(mockFetch as unknown as typeof globalThis.fetch);

    const result = await provider.search("test", 2);

    expect(result.results).toHaveLength(2);
  });

  it("无结果时应返回空数组", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("<html><body></body></html>", { status: 200 }));
    const provider = createDuckDuckGoProvider(mockFetch as unknown as typeof globalThis.fetch);

    const result = await provider.search("nothing", 5);

    expect(result.results).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("HTTP 错误应抛出异常", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
    const provider = createDuckDuckGoProvider(mockFetch as unknown as typeof globalThis.fetch);

    await expect(provider.search("test", 5)).rejects.toThrow("DuckDuckGo 搜索失败: HTTP 403");
  });

  it("应构造正确的搜索 URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 }));
    const provider = createDuckDuckGoProvider(mockFetch as unknown as typeof globalThis.fetch);

    await provider.search("hello world", 3);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe("https://html.duckduckgo.com/html/?q=hello%20world");
  });

  it("应跳过 DDG 内部链接", async () => {
    const html = `<html><body>
      <a class="result__a" href="//duckduckgo.com/some-internal-page">Internal</a>
      <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent("https://example.com")}">External</a>
      <a class="result__snippet" href="#">External snippet</a>
    </body></html>`;
    const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    const provider = createDuckDuckGoProvider(mockFetch as unknown as typeof globalThis.fetch);

    const result = await provider.search("test", 5);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("External");
  });
});
