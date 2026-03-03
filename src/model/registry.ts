import type { ModelProviderConfig } from "../config/schema.js";
import { PROVIDER_OAUTH_MAP } from "../config/schema.js";
import { ProviderNotFoundError } from "../errors/index.js";
import type { AuthStore } from "../auth/types.js";
import type { ModelProvider } from "./types.js";
import { createPiAiProvider } from "./providers/adapter.js";
import { getApiKey } from "../auth/token-manager.js";

/**
 * 模型提供商注册表
 * 管理所有已注册的提供商实例，支持按名称检索
 */
export interface ProviderRegistry {
  /** 获取指定名称的提供商（OAuth 类型会自动注入 token） */
  get(name: string): Promise<ModelProvider>;
  /** 检查提供商是否已注册 */
  has(name: string): boolean;
  /** 获取所有已注册的提供商名称 */
  names(): readonly string[];
}

/**
 * 为 OAuth 类型提供商注入 API Key
 * 如果配置已有 apiKey 则直接返回；否则从 authStore 获取
 */
async function resolveConfig(
  config: ModelProviderConfig,
  authStore?: AuthStore,
): Promise<ModelProviderConfig> {
  // 已有 apiKey，无需 OAuth
  if (config.apiKey) {
    return config;
  }

  // 检查是否为 OAuth 类型
  const oauthId = PROVIDER_OAUTH_MAP[config.type];
  if (!oauthId || !authStore) {
    return config;
  }

  // 从 authStore 获取 OAuth token
  const apiKey = await getApiKey(oauthId, authStore);
  if (!apiKey) {
    throw new ProviderNotFoundError(
      `提供商 "${config.type}" 需要 OAuth 认证，请先运行 npm run login -- ${oauthId}`,
    );
  }

  // 返回注入 apiKey 的新配置（不可变）
  return { ...config, apiKey };
}

/**
 * 根据配置创建提供商注册表
 * @param providers - 提供商配置映射（名称 → 配置）
 * @param authStore - 可选的 OAuth 凭据存储（支持自动注入 token）
 * @returns 不可变的提供商注册表
 */
export function createProviderRegistry(
  providers: Readonly<Record<string, ModelProviderConfig>>,
  authStore?: AuthStore,
): ProviderRegistry {
  const instances = new Map<string, ModelProvider>();

  // 懒初始化：按需创建提供商实例（OAuth 类型需要异步获取 token）
  async function getOrCreate(name: string): Promise<ModelProvider> {
    const existing = instances.get(name);
    if (existing) return existing;

    const config = providers[name];
    if (!config) {
      throw new ProviderNotFoundError(name);
    }

    // 解析配置（可能需要 OAuth token 注入）
    const resolved = await resolveConfig(config, authStore);
    const provider = createPiAiProvider(resolved);
    instances.set(name, provider);
    return provider;
  }

  return {
    get: getOrCreate,
    has: (name: string) => name in providers,
    names: () => Object.keys(providers),
  };
}
