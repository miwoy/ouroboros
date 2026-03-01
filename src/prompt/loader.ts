/**
 * 提示词加载器
 *
 * 提供分类加载、ID 加载、关键词搜索和语义搜索功能。
 * 语义搜索通过 qmd 向量索引实现，不可用时自动回退到关键词搜索。
 */

import { listPromptTemplates, loadPromptTemplate } from "./store.js";
import { isQmdAvailable, vectorSearch, type VectorSearchOptions } from "./vector.js";
import type { PromptCategory, PromptTemplate, SearchOptions, SearchResult } from "./types.js";

/** 所有分类（用于遍历查找） */
const ALL_CATEGORIES: readonly PromptCategory[] = [
  "system",
  "agent",
  "skill",
  "tool",
  "memory",
  "schema",
  "core",
];

/**
 * 加载指定分类下的所有模板
 *
 * @param workspacePath - workspace 根目录
 * @param category - 提示词分类
 * @returns 该分类下的所有模板
 */
export async function loadByCategory(
  workspacePath: string,
  category: PromptCategory,
): Promise<readonly PromptTemplate[]> {
  return listPromptTemplates(workspacePath, category);
}

/**
 * 通过 ID 加载模板（遍历所有分类目录查找）
 *
 * 优化：先尝试从 ID 前缀推断分类（如 "skill:greeting" → skill），
 * 失败后再遍历所有分类。
 *
 * @param workspacePath - workspace 根目录
 * @param id - 模板 ID
 * @returns 模板对象，不存在时返回 null
 */
export async function loadById(workspacePath: string, id: string): Promise<PromptTemplate | null> {
  // 尝试从 ID 前缀推断分类
  const prefixCategory = inferCategoryFromId(id);
  if (prefixCategory) {
    const template = await loadPromptTemplate(workspacePath, prefixCategory, id);
    if (template) return template;
  }

  // 遍历所有分类查找
  for (const category of ALL_CATEGORIES) {
    if (category === prefixCategory) continue; // 已经尝试过
    const template = await loadPromptTemplate(workspacePath, category, id);
    if (template) return template;
  }

  return null;
}

/**
 * 语义搜索模板
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
): Promise<readonly SearchResult[]> {
  // 检测 qmd 是否可用
  const qmdReady = await isQmdAvailable();
  if (!qmdReady) {
    // 回退到关键词搜索
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
 * 关键词搜索模板
 *
 * 在模板的 name、description、tags 中匹配关键词，
 * 计算简单的命中率分数。适用于 qmd 不可用时的回退方案。
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
): Promise<readonly SearchResult[]> {
  const templates = await listPromptTemplates(workspacePath, options?.category);

  // 将查询拆分为字符（中文）或词（英文空格分隔）
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const scored: SearchResult[] = [];

  for (const template of templates) {
    const score = calculateScore(template, queryTerms);
    if (score > 0) {
      scored.push({ template, score });
    }
  }

  // 按分数降序排列
  scored.sort((a, b) => b.score - a.score);

  // 应用 limit
  const limit = options?.limit ?? scored.length;
  return scored.slice(0, limit);
}

/**
 * 从 ID 前缀推断分类
 * 例如 "skill:greeting" → "skill", "system:base" → "system"
 */
function inferCategoryFromId(id: string): PromptCategory | null {
  const colonIdx = id.indexOf(":");
  if (colonIdx === -1) return null;

  const prefix = id.slice(0, colonIdx);
  if (ALL_CATEGORIES.includes(prefix as PromptCategory)) {
    return prefix as PromptCategory;
  }
  return null;
}

/**
 * 分词：中文按字符拆分，英文按空格拆分
 * 同时保留完整查询作为一个 term（用于完整匹配加分）
 */
function tokenize(text: string): readonly string[] {
  const terms = new Set<string>();

  // 完整查询
  const trimmed = text.trim();
  if (trimmed.length > 0) {
    terms.add(trimmed);
  }

  // 按空格拆分
  for (const word of trimmed.split(/\s+/)) {
    if (word.length > 0) {
      terms.add(word);
    }
  }

  return [...terms];
}

/**
 * 计算模板与查询词的匹配分数
 *
 * 评分规则：
 * - name 完整匹配: +3
 * - name 部分匹配: +2（每个 term）
 * - description 匹配: +1（每个 term）
 * - tags 匹配: +2（每个 tag 命中）
 */
function calculateScore(template: PromptTemplate, queryTerms: readonly string[]): number {
  let score = 0;

  for (const term of queryTerms) {
    // name 匹配
    if (template.name === term) {
      score += 3;
    } else if (template.name.includes(term)) {
      score += 2;
    }

    // description 匹配
    if (template.description.includes(term)) {
      score += 1;
    }

    // tags 匹配
    if (template.tags) {
      for (const tag of template.tags) {
        if (tag === term || tag.includes(term) || term.includes(tag)) {
          score += 2;
        }
      }
    }
  }

  return score;
}
