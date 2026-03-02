/**
 * 搜索引擎类型定义
 */

/** 单条搜索结果 */
export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

/** 搜索响应 */
export interface SearchResponse {
  readonly results: readonly SearchResult[];
  readonly total: number;
  readonly query: string;
}

/** 搜索引擎 Provider 接口 */
export interface SearchProvider {
  readonly name: string;
  search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResponse>;
}

/** 支持的搜索引擎类型 */
export type SearchProviderType = "bing" | "brave";
