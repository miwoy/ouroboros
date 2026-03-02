/**
 * 提示词装配器
 *
 * 将多个渲染后的提示词片段按优先级拼装为最终的 AssembledPrompt。
 * 拼装顺序: core → self → agent → skill → tool → memory
 */

import { FILE_TYPE_PRIORITY } from "./types.js";
import type { AssembledPrompt, RenderedPrompt } from "./types.js";

/** 片段间分隔符 */
const SEPARATOR = "\n\n---\n\n";

/**
 * 将多个 RenderedPrompt 按优先级拼装为 AssembledPrompt
 *
 * 排序规则：按 FILE_TYPE_PRIORITY 定义的优先级升序排列（数值越小越靠前）。
 * 相同优先级的片段保持原始输入顺序（稳定排序）。
 *
 * @param parts - 渲染后的提示词片段列表
 * @returns 装配结果
 */
export function assemblePrompt(
  parts: readonly RenderedPrompt[],
): AssembledPrompt {
  if (parts.length === 0) {
    return { systemPrompt: "", contextPrompts: [] };
  }

  // 稳定排序：按优先级升序
  const sorted = [...parts].sort(
    (a, b) => FILE_TYPE_PRIORITY[a.fileType] - FILE_TYPE_PRIORITY[b.fileType],
  );

  // 拼装 systemPrompt
  const systemPrompt = sorted.map((p) => p.content).join(SEPARATOR);

  // contextPrompts 保存每个片段的独立内容（按排序后顺序）
  const contextPrompts = sorted.map((p) => p.content);

  return { systemPrompt, contextPrompts };
}
