/**
 * tool:web-search — 搜索引擎
 *
 * 使用真实搜索引擎（Bing HTML 抓取 / Brave API）检索互联网信息。
 * 通过 context.httpFetch 支持代理，通过 context.config.webSearch 选择 Provider。
 */

import { createSearchProvider, type SearchProviderType } from "../../search/index.js";
import type { ToolHandler } from "../types.js";

/** web-search 工具处理函数 */
export const handleWebSearch: ToolHandler = async (input, context) => {
  const query = input["query"] as string;
  const limit = (input["limit"] as number | undefined) ?? 5;

  const fetchFn = context.httpFetch ?? globalThis.fetch;
  const providerType = (context.config?.webSearch?.provider ?? "bing") as SearchProviderType;
  const apiKey = context.config?.webSearch?.apiKey;
  const baseUrl = context.config?.webSearch?.baseUrl;

  try {
    const provider = createSearchProvider({
      provider: providerType,
      apiKey,
      baseUrl,
      fetchFn,
    });

    const response = await provider.search(query, limit, context.signal);

    return {
      results: response.results,
      total: response.total,
      query: response.query,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      results: [],
      total: 0,
      query,
      error: message,
    };
  }
};
