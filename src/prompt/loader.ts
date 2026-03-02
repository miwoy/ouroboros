/**
 * 提示词加载器
 *
 * 提供提示词文件加载、关键词搜索和语义搜索功能。
 * 语义搜索通过 qmd 向量索引实现，不可用时自动回退到关键词搜索。
 */

import { join } from "node:path";
import { readPromptFile, getPromptFilePath, listPromptFiles, listMemoryFiles } from "./store.js";
import { isQmdAvailable, vectorSearch, type VectorSearchOptions } from "./vector.js";
import type { PromptFile, PromptFileType, SearchOptions, PromptSearchResult } from "./types.js";

/**
 * 加载指定类型的提示词文件
 *
 * @param workspacePath - workspace 根目录
 * @param fileType - 提示词文件类型
 * @returns 提示词文件内容，不存在返回 null
 */
export async function loadPromptFile(
  workspacePath: string,
  fileType: PromptFileType,
): Promise<PromptFile | null> {
  const filePath = getPromptFilePath(workspacePath, fileType);
  return readPromptFile(filePath);
}

/** 用户级提示词文件类型（不含 core） */
const USER_PROMPT_TYPES: readonly PromptFileType[] = ["self", "tool", "skill", "agent", "memory"];

/**
 * 加载用户级提示词文件（不含 core）
 *
 * core.md 由 runReactLoop 内部通过 loadCorePrompt() 加载，
 * API 层只需拼装用户级部分。
 *
 * @param workspacePath - workspace 根目录
 * @returns 用户级提示词文件（按类型索引）
 */
export async function loadUserPromptFiles(
  workspacePath: string,
): Promise<ReadonlyMap<PromptFileType, PromptFile>> {
  const result = new Map<PromptFileType, PromptFile>();
  for (const fileType of USER_PROMPT_TYPES) {
    const file = await loadPromptFile(workspacePath, fileType);
    if (file) {
      result.set(fileType, file);
    }
  }
  return result;
}

/**
 * 加载所有提示词文件
 *
 * @param workspacePath - workspace 根目录
 * @returns 所有已加载的提示词文件（按类型索引）
 */
export async function loadAllPromptFiles(
  workspacePath: string,
): Promise<ReadonlyMap<PromptFileType, PromptFile>> {
  const result = new Map<PromptFileType, PromptFile>();

  const fileTypes: readonly PromptFileType[] = ["core", "self", "tool", "skill", "agent", "memory"];
  for (const fileType of fileTypes) {
    const file = await loadPromptFile(workspacePath, fileType);
    if (file) {
      result.set(fileType, file);
    }
  }

  return result;
}

/**
 * 语义搜索提示词文件
 *
 * 优先使用 qmd 向量索引进行语义检索（混合检索 + LLM 重排序），
 * qmd 不可用时自动回退到关键词搜索。
 *
 * @param workspacePath - workspace 根目录
 * @param query - 搜索查询
 * @param options - 搜索选项
 * @returns 匹配结果列表（按相关性降序）
 */
export async function searchBySemantic(
  workspacePath: string,
  query: string,
  options?: SearchOptions & { readonly mode?: VectorSearchOptions["mode"] },
): Promise<readonly PromptSearchResult[]> {
  const qmdReady = await isQmdAvailable(workspacePath);
  if (!qmdReady) {
    return searchByKeyword(workspacePath, query, options);
  }

  try {
    return await vectorSearch(workspacePath, query, {
      mode: options?.mode ?? "query",
      limit: options?.limit,
      minScore: options?.threshold,
    });
  } catch {
    // qmd 执行失败时回退到关键词搜索
    return searchByKeyword(workspacePath, query, options);
  }
}

/**
 * 关键词搜索提示词文件
 *
 * 在提示词文件的元数据（name、description、tags）和正文中匹配关键词。
 *
 * @param workspacePath - workspace 根目录
 * @param query - 搜索关键词
 * @param options - 搜索选项
 * @returns 匹配结果列表（按分数降序）
 */
export async function searchByKeyword(
  workspacePath: string,
  query: string,
  options?: SearchOptions,
): Promise<readonly PromptSearchResult[]> {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const scored: PromptSearchResult[] = [];

  // 搜索主提示词文件
  const files = await listPromptFiles(workspacePath);
  for (const fileName of files) {
    const filePath = join(workspacePath, "prompts", fileName);
    const promptFile = await readPromptFile(filePath);
    if (!promptFile) continue;

    const score = calculateScore(promptFile, queryTerms);
    if (score > 0) {
      scored.push({
        fileType: promptFile.metadata.type,
        fileName,
        content: promptFile.content.slice(0, 200), // 截取前 200 字符作为摘要
        score,
      });
    }
  }

  // 搜索短期记忆文件
  const memoryFiles = await listMemoryFiles(workspacePath);
  for (const fileName of memoryFiles) {
    const filePath = join(workspacePath, "prompts", "memory", fileName);
    const promptFile = await readPromptFile(filePath);
    if (!promptFile) continue;

    const score = calculateScore(promptFile, queryTerms);
    if (score > 0) {
      scored.push({
        fileType: "memory",
        fileName: `memory/${fileName}`,
        content: promptFile.content.slice(0, 200),
        score,
      });
    }
  }

  // 按分数降序排列
  scored.sort((a, b) => b.score - a.score);

  // 应用 limit
  const limit = options?.limit ?? scored.length;
  return scored.slice(0, limit);
}

// ─── 内部工具函数 ───────────────────────────────────────────────────

/**
 * 分词：中文按字符拆分，英文按空格拆分
 * 同时保留完整查询作为一个 term（用于完整匹配加分）
 */
function tokenize(text: string): readonly string[] {
  const terms = new Set<string>();

  const trimmed = text.trim();
  if (trimmed.length > 0) {
    terms.add(trimmed);
  }

  for (const word of trimmed.split(/\s+/)) {
    if (word.length > 0) {
      terms.add(word);
    }
  }

  return [...terms];
}

/**
 * 计算提示词文件与查询词的匹配分数
 *
 * 评分规则：
 * - name 完整匹配: +3
 * - name 部分匹配: +2（每个 term）
 * - description 匹配: +1（每个 term）
 * - tags 匹配: +2（每个 tag 命中）
 * - 正文匹配: +1（每个 term）
 */
function calculateScore(promptFile: PromptFile, queryTerms: readonly string[]): number {
  const { metadata, content } = promptFile;
  let score = 0;

  for (const term of queryTerms) {
    // name 匹配
    if (metadata.name === term) {
      score += 3;
    } else if (metadata.name.includes(term)) {
      score += 2;
    }

    // description 匹配
    if (metadata.description.includes(term)) {
      score += 1;
    }

    // tags 匹配
    if (metadata.tags) {
      for (const tag of metadata.tags) {
        if (tag === term || tag.includes(term) || term.includes(tag)) {
          score += 2;
        }
      }
    }

    // 正文匹配
    if (content.includes(term)) {
      score += 1;
    }
  }

  return score;
}
