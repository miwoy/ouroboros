/**
 * 统一 HTTP 客户端
 *
 * 封装代理支持：有 proxyUrl 时使用 undici ProxyAgent，无则使用 globalThis.fetch。
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";

/** HTTP 客户端配置 */
export interface HttpClientConfig {
  /** HTTP 代理地址 */
  readonly proxyUrl?: string;
}

/** HTTP 客户端接口 */
export interface HttpClient {
  /** 统一 fetch 函数 */
  readonly fetch: typeof globalThis.fetch;
  /** 释放连接资源 */
  dispose(): void;
}

/**
 * 创建 HTTP 客户端
 *
 * @param config - 客户端配置
 * @returns HTTP 客户端实例
 */
export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
  if (config.proxyUrl) {
    const agent = new ProxyAgent(config.proxyUrl);

    const proxiedFetch: typeof globalThis.fetch = (input, init) =>
      undiciFetch(input as Parameters<typeof undiciFetch>[0], {
        ...init,
        dispatcher: agent,
      } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;

    return {
      fetch: proxiedFetch,
      dispose() {
        agent.close();
      },
    };
  }

  return {
    fetch: globalThis.fetch,
    dispose() {
      // 无代理时无需清理
    },
  };
}
