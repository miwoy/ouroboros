/**
 * Brave Search API Provider
 *
 * 使用 Brave Search API 进行搜索。
 * 需要 API Key（X-Subscription-Token）。
 */

import type { SearchProvider, SearchResponse, SearchResult } from "./types.js";

/** Brave API 响应中的 web 结果 */
interface BraveWebResult {
  readonly title?: string;
  readonly url?: string;
  readonly description?: string;
}

/** Brave API 响应结构 */
interface BraveApiResponse {
  readonly web?: {
    readonly results?: readonly BraveWebResult[];
  };
}

/**
 * 创建 Brave 搜索 Provider
 *
 * @param fetchFn - fetch 函数（支持代理注入）
 * @param apiKey - Brave Search API Key
 * @param baseUrl - 自定义 API 地址（可选）
 * @returns Brave SearchProvider 实例
 */
export function createBraveProvider(
  fetchFn: typeof globalThis.fetch,
  apiKey: string,
  baseUrl?: string,
): SearchProvider {
  const apiBase = baseUrl ?? "https://api.search.brave.com/res/v1/web/search";

  return {
    name: "brave",
    async search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResponse> {
      const url = `${apiBase}?q=${encodeURIComponent(query)}&count=${limit}`;
      const response = await fetchFn(url, {
        signal,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Brave 搜索失败: HTTP ${response.status}`);
      }

      const data = (await response.json()) as BraveApiResponse;
      const webResults = data.web?.results ?? [];

      const results: readonly SearchResult[] = webResults
        .filter((r): r is BraveWebResult & { title: string; url: string } =>
          Boolean(r.title && r.url),
        )
        .slice(0, limit)
        .map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.description ?? "",
        }));

      return {
        results,
        total: results.length,
        query,
      };
    },
  };
}
