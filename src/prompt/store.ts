/**
 * 提示词存储
 *
 * 提供提示词模板的 CRUD 操作，以文件系统为存储后端。
 * 每个模板保存为独立 JSON 文件，路径: workspace/prompts/{categoryDir}/{id}.json
 */

import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { OuroborosError } from "../errors/index.js";
import type { PromptCategory, PromptTemplate } from "./types.js";

/**
 * PromptCategory → 文件系统目录名的映射
 * 注意: workspace 目录使用复数形式（如 "skills"），与 category 值（如 "skill"）不同
 */
const CATEGORY_DIR_MAP: Readonly<Record<PromptCategory, string>> = {
  system: "system",
  agent: "agents",
  skill: "skills",
  tool: "tools",
  memory: "memory",
  schema: "schema",
  core: "core",
} as const;

/**
 * 获取指定分类的 prompts 目录路径
 */
function getCategoryDir(workspacePath: string, category: PromptCategory): string {
  return join(workspacePath, "prompts", CATEGORY_DIR_MAP[category]);
}

/**
 * 获取模板文件路径
 */
function getTemplatePath(
  workspacePath: string,
  category: PromptCategory,
  id: string,
): string {
  return join(getCategoryDir(workspacePath, category), `${id}.json`);
}

/**
 * 保存提示词模板到文件系统
 *
 * @param workspacePath - workspace 根目录
 * @param template - 提示词模板
 */
export async function savePromptTemplate(
  workspacePath: string,
  template: PromptTemplate,
): Promise<void> {
  const dirPath = getCategoryDir(workspacePath, template.category);
  await mkdir(dirPath, { recursive: true });

  const filePath = getTemplatePath(workspacePath, template.category, template.id);
  await writeFile(filePath, JSON.stringify(template, null, 2), "utf-8");
}

/**
 * 加载单个提示词模板
 *
 * @param workspacePath - workspace 根目录
 * @param category - 提示词分类
 * @param id - 模板 ID
 * @returns 模板对象，不存在时返回 null
 */
export async function loadPromptTemplate(
  workspacePath: string,
  category: PromptCategory,
  id: string,
): Promise<PromptTemplate | null> {
  const filePath = getTemplatePath(workspacePath, category, id);
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as PromptTemplate;
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return null;
    }
    throw new PromptStoreError(`加载提示词模板失败: ${id}`, err);
  }
}

/**
 * 列出指定分类（或全部分类）的所有模板
 *
 * @param workspacePath - workspace 根目录
 * @param category - 指定分类（不指定则列出所有）
 * @returns 模板列表
 */
export async function listPromptTemplates(
  workspacePath: string,
  category?: PromptCategory,
): Promise<readonly PromptTemplate[]> {
  const categories: PromptCategory[] = category
    ? [category]
    : ["system", "agent", "skill", "tool", "memory", "schema", "core"];

  const results: PromptTemplate[] = [];

  for (const cat of categories) {
    const dirPath = getCategoryDir(workspacePath, cat);
    try {
      const files = await readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = await readFile(join(dirPath, file), "utf-8");
          results.push(JSON.parse(content) as PromptTemplate);
        } catch {
          // 跳过无法解析的文件
        }
      }
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") {
        continue; // 目录不存在，跳过
      }
      throw new PromptStoreError(`列出提示词模板失败: ${cat}`, err);
    }
  }

  return results;
}

/**
 * 删除提示词模板
 *
 * @param workspacePath - workspace 根目录
 * @param category - 提示词分类
 * @param id - 模板 ID
 * @returns 是否成功删除（不存在返回 false）
 */
export async function deletePromptTemplate(
  workspacePath: string,
  category: PromptCategory,
  id: string,
): Promise<boolean> {
  const filePath = getTemplatePath(workspacePath, category, id);
  try {
    await unlink(filePath);
    return true;
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return false;
    }
    throw new PromptStoreError(`删除提示词模板失败: ${id}`, err);
  }
}

/** Node.js 错误类型守卫 */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/** 提示词存储错误 */
export class PromptStoreError extends OuroborosError {
  constructor(message: string, cause?: unknown) {
    super(message, "PROMPT_STORE_ERROR", cause);
    this.name = "PromptStoreError";
  }
}
