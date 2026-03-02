/**
 * 搜索引擎公共导出
 */

export type { SearchResult, SearchResponse, SearchProvider, SearchProviderType } from "./types.js";
export { createBingProvider } from "./bing.js";
export { createBraveProvider } from "./brave.js";

import type { SearchProvider, SearchProviderType } from "./types.js";
import { createBingProvider } from "./bing.js";
import { createBraveProvider } from "./brave.js";

/** 创建搜索 Provider 的选项 */
export interface CreateSearchProviderOptions {
  readonly provider: SearchProviderType;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly fetchFn: typeof globalThis.fetch;
}

/**
 * 搜索 Provider 工厂函数
 *
 * @param options - Provider 配置
 * @returns SearchProvider 实例
 */
export function createSearchProvider(options: CreateSearchProviderOptions): SearchProvider {
  switch (options.provider) {
    case "bing":
      return createBingProvider(options.fetchFn);
    case "brave": {
      if (!options.apiKey) {
        throw new Error("Brave 搜索需要 apiKey 配置");
      }
      return createBraveProvider(options.fetchFn, options.apiKey, options.baseUrl);
    }
    default:
      throw new Error(`不支持的搜索引擎: ${options.provider as string}`);
  }
}
