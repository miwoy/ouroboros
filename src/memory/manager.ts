/**
 * 记忆管理器
 *
 * 统一管理 Hot/Cold Session + 短期记忆 + 长期记忆。
 */

import type { MemoryManager, MemoryConfig } from "./types.js";
import { createHotMemory, createColdMemory } from "./session.js";
import { createShortTermMemory } from "./short-term.js";
import { createLongTermMemory } from "./long-term.js";

/** 默认记忆配置 */
const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  shortTerm: true,
  longTerm: true,
  hotSessionMaxTokens: 4000,
};

/**
 * 创建记忆管理器
 *
 * @param workspacePath - workspace 根目录
 * @param config - 记忆配置（可选，使用默认值）
 * @returns 记忆管理器实例
 */
export function createMemoryManager(
  workspacePath: string,
  config?: Partial<MemoryConfig>,
): MemoryManager {
  const mergedConfig: MemoryConfig = {
    ...DEFAULT_MEMORY_CONFIG,
    ...config,
  };

  const hot = createHotMemory(mergedConfig.hotSessionMaxTokens);
  const cold = createColdMemory(workspacePath);
  const shortTerm = createShortTermMemory(workspacePath);
  const longTerm = createLongTermMemory(workspacePath);

  return {
    hot,
    cold,
    shortTerm,
    longTerm,
    config: mergedConfig,

    async cleanup(): Promise<void> {
      hot.clear();
      await cold.cleanup();
    },
  };
}
