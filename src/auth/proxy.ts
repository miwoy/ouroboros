/**
 * 全局代理设置
 *
 * Node.js v21+ 的 globalThis.fetch 不再使用 undici 的 global dispatcher，
 * 因此 setGlobalDispatcher 无法让 pi-ai 内部的 fetch 走代理。
 * 解决方案：直接替换 globalThis.fetch 为走代理的 undici fetch。
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * 从多个来源解析代理地址（优先级从高到低）：
 * 1. 显式传入的 proxyUrl
 * 2. 环境变量 HTTPS_PROXY / HTTP_PROXY / ALL_PROXY
 * 3. config.json 中的 system.proxy
 */
export async function resolveProxyUrl(explicitUrl?: string): Promise<string | undefined> {
  // 1. 显式传入
  if (explicitUrl) return explicitUrl;

  // 2. 环境变量
  const envProxy =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy;
  if (envProxy) return envProxy;

  // 3. config.json
  try {
    const configPath = resolve(process.cwd(), "config.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as { system?: { proxy?: string } };
    if (config.system?.proxy) return config.system.proxy;
  } catch {
    // config.json 不存在或解析失败，忽略
  }

  return undefined;
}

/**
 * 设置全局代理
 *
 * 替换 globalThis.fetch 为使用 ProxyAgent 的 undici fetch，
 * 确保所有第三方库（如 pi-ai）的 fetch 调用都走代理。
 * 返回清理函数（恢复原始 fetch）。
 */
export async function setupGlobalProxy(proxyUrl?: string): Promise<() => void> {
  const resolved = await resolveProxyUrl(proxyUrl);
  if (!resolved) return () => {};

  const agent = new ProxyAgent(resolved);
  const originalFetch = globalThis.fetch;

  // 替换全局 fetch
  globalThis.fetch = ((
    input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1],
  ) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      {
        ...init,
        dispatcher: agent,
      } as Parameters<typeof undiciFetch>[1],
    )) as typeof globalThis.fetch;

  console.log(`  代理已启用: ${resolved}`);

  return () => {
    globalThis.fetch = originalFetch;
    agent.close();
  };
}
