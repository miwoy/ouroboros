/**
 * 全局代理设置
 * 在调用 pi-ai OAuth 前设置全局代理，使 pi-ai 内部的 fetch 也走代理
 */
import { ProxyAgent, setGlobalDispatcher } from "undici";
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
 * 设置全局代理（影响 Node.js 内置 fetch 和 undici）
 * 返回清理函数
 */
export async function setupGlobalProxy(proxyUrl?: string): Promise<() => void> {
  const resolved = await resolveProxyUrl(proxyUrl);
  if (!resolved) return () => {};

  const agent = new ProxyAgent(resolved);
  setGlobalDispatcher(agent);
  console.log(`  代理已启用: ${resolved}`);

  return () => {
    agent.close();
  };
}
