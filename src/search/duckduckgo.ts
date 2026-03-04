/**
 * DuckDuckGo 搜索 Provider
 *
 * 通过 HTML 抓取 DuckDuckGo HTML 版本结果。
 * 无需 API Key，但需要通过代理访问（中国大陆）。
 */

import type { SearchProvider, SearchResponse, SearchResult } from "./types.js";

/** 清理 HTML 标签和实体 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * 解析 DuckDuckGo 重定向 URL
 *
 * DDG HTML 版本的链接格式: //duckduckgo.com/l/?uddg=<encoded_url>&...
 * 需要提取 uddg 参数中的真实 URL。
 */
function resolveDdgUrl(rawUrl: string): string {
  const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
  if (uddgMatch) {
    return decodeURIComponent(uddgMatch[1]);
  }
  // 非重定向链接直接返回
  return rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
}

/** 从 DuckDuckGo HTML 解析搜索结果 */
function parseDdgResults(html: string, limit: number): readonly SearchResult[] {
  const results: SearchResult[] = [];

  // 主解析：class="result__a" 格式
  const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;

  while ((linkMatch = linkRegex.exec(html)) !== null && results.length < limit) {
    const rawUrl = linkMatch[1];
    const url = resolveDdgUrl(rawUrl);
    const title = stripHtml(linkMatch[2]);

    // 跳过 DDG 内部链接
    if (url.includes("duckduckgo.com")) continue;

    // 查找对应的 snippet（result__snippet 在同一个 result 块中）
    const afterLink = html.slice(linkMatch.index);
    const snippetMatch = afterLink.match(
      /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  // 备用解析：class="result-link" 格式（Lite 版本）
  if (results.length === 0) {
    const liteRegex = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let liteMatch: RegExpExecArray | null;

    while ((liteMatch = liteRegex.exec(html)) !== null && results.length < limit) {
      const url = resolveDdgUrl(liteMatch[1]);
      const title = stripHtml(liteMatch[2]);

      if (title && url && !url.includes("duckduckgo.com")) {
        results.push({ title, url, snippet: "" });
      }
    }
  }

  return results;
}

/**
 * 创建 DuckDuckGo 搜索 Provider
 *
 * @param fetchFn - fetch 函数（支持代理注入）
 * @returns DuckDuckGo SearchProvider 实例
 */
export function createDuckDuckGoProvider(fetchFn: typeof globalThis.fetch): SearchProvider {
  return {
    name: "duckduckgo",
    async search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResponse> {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetchFn(url, {
        signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo 搜索失败: HTTP ${response.status}`);
      }

      const html = await response.text();
      const results = parseDdgResults(html, limit);

      return {
        results,
        total: results.length,
        query,
      };
    },
  };
}
