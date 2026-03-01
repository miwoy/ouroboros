import type { ModelProviderConfig } from "../config/schema.js";
import { ProviderNotFoundError } from "../errors/index.js";
import type { ModelProvider } from "./types.js";
import { createPiAiProvider } from "./providers/adapter.js";

/**
 * 模型提供商注册表
 * 管理所有已注册的提供商实例，支持按名称检索
 */
export interface ProviderRegistry {
  /** 获取指定名称的提供商 */
  get(name: string): ModelProvider;
  /** 检查提供商是否已注册 */
  has(name: string): boolean;
  /** 获取所有已注册的提供商名称 */
  names(): readonly string[];
}

/**
 * 根据配置创建提供商注册表
 * @param providers - 提供商配置映射（名称 → 配置）
 * @returns 不可变的提供商注册表
 */
export function createProviderRegistry(
  providers: Readonly<Record<string, ModelProviderConfig>>,
): ProviderRegistry {
  const instances = new Map<string, ModelProvider>();

  // 懒初始化：按需创建提供商实例
  function getOrCreate(name: string): ModelProvider {
    const existing = instances.get(name);
    if (existing) return existing;

    const config = providers[name];
    if (!config) {
      throw new ProviderNotFoundError(name);
    }

    const provider = createPiAiProvider(config);
    instances.set(name, provider);
    return provider;
  }

  return {
    get: getOrCreate,
    has: (name: string) => name in providers,
    names: () => Object.keys(providers),
  };
}
