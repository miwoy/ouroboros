/**
 * Bing 搜索 Provider
 *
 * 通过 HTML 抓取 Bing 搜索结果页面，正则解析结果。
 * 无需 API Key。
 */

import type { SearchProvider, SearchResponse, SearchResult } from "./types.js";

/** 清理 HTML 标签和实体 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** 从 Bing HTML 解析搜索结果 */
function parseBingResults(html: string, limit: number): readonly SearchResult[] {
  const results: SearchResult[] = [];
  // 匹配 <li class="b_algo"> 块
  const blockRegex = /<li\s+class="b_algo"[^>]*>([\s\S]*?)(?=<li\s+class="b_algo"|<\/ol>|$)/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(html)) !== null && results.length < limit) {
    const block = blockMatch[1];

    // 提取标题和 URL：<h2><a href="...">title</a></h2>
    const titleMatch = block.match(/<h2[^>]*>\s*<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const url = titleMatch[1];
    const title = stripHtmlTags(titleMatch[2]);

    // 提取摘要：<p> 或 <div class="b_caption"><p>
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? stripHtmlTags(snippetMatch[1]) : "";

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

/**
 * 创建 Bing 搜索 Provider
 *
 * @param fetchFn - fetch 函数（支持代理注入）
 * @returns Bing SearchProvider 实例
 */
export function createBingProvider(fetchFn: typeof globalThis.fetch): SearchProvider {
  return {
    name: "bing",
    async search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResponse> {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}&ensearch=1`;
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
        throw new Error(`Bing 搜索失败: HTTP ${response.status}`);
      }

      const html = await response.text();
      const results = parseBingResults(html, limit);

      return {
        results,
        total: results.length,
        query,
      };
    },
  };
}
