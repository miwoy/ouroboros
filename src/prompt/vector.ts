/**
 * qmd 向量索引集成
 *
 * 封装 qmd CLI 实现提示词模板的向量化索引与语义检索。
 * qmd 是一个本地搜索引擎，支持 BM25 全文检索、向量语义匹配和 LLM 重排序。
 *
 * 设计：
 * - 使用独立的 qmd 索引（--index ouroboros），避免污染用户默认索引
 * - 将 workspace/prompts 注册为 qmd collection
 * - JSON 模板文件中的 name/description/tags/content 均可被索引
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { OuroborosError } from "../errors/index.js";
import type { PromptTemplate, SearchResult } from "./types.js";

/** qmd 索引名称 */
const QMD_INDEX = "ouroboros";

/** qmd collection 名称 */
const QMD_COLLECTION = "prompts";

/** qmd 搜索 JSON 输出的单条结果 */
interface QmdSearchResult {
  readonly docid: string;
  readonly score: number;
  readonly file: string;
  readonly title: string;
  readonly snippet: string;
}

/**
 * 检测 qmd 是否可用
 *
 * @returns qmd CLI 是否已安装且可执行
 */
export async function isQmdAvailable(): Promise<boolean> {
  try {
    await execQmd(["status"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 初始化向量索引
 *
 * 将 workspace/prompts 注册为 qmd collection，然后执行索引和向量嵌入。
 * 如果 collection 已存在，会先移除再重新创建。
 *
 * @param workspacePath - workspace 根目录
 */
export async function initVectorIndex(workspacePath: string): Promise<void> {
  const promptsDir = resolve(workspacePath, "prompts");

  // 先尝试移除已有的 collection（忽略错误）
  try {
    await execQmd(["collection", "remove", QMD_COLLECTION]);
  } catch {
    // collection 不存在时忽略
  }

  // 注册 collection
  await execQmd(["collection", "add", promptsDir, "--name", QMD_COLLECTION, "--mask", "**/*.json"]);

  // 为 collection 添加上下文描述（帮助搜索理解内容）
  try {
    await execQmd([
      "context",
      "add",
      `qmd://${QMD_COLLECTION}`,
      "Ouroboros 提示词模板库，包含系统提示词、Agent 提示词、技能提示词等分类模板。每个 JSON 文件是一个提示词模板，含 id、name、description、content、tags 等字段。",
    ]);
  } catch {
    // context 已存在时忽略
  }

  // 执行索引更新和向量嵌入
  await execQmd(["update"]);
  await execQmd(["embed"]);
}

/**
 * 更新向量索引
 *
 * 当模板文件有变动后调用，重新索引并更新向量嵌入。
 *
 * @param workspacePath - workspace 根目录
 */
export async function updateVectorIndex(_workspacePath: string): Promise<void> {
  await execQmd(["update"]);
  await execQmd(["embed"]);
}

/**
 * 向量语义搜索
 *
 * 使用 qmd query（混合检索 + 重排序）搜索提示词模板。
 * 返回结果包含模板对象和相关性分数。
 *
 * @param workspacePath - workspace 根目录
 * @param query - 搜索查询
 * @param options - 搜索选项
 * @returns 匹配结果列表（按相关性降序）
 */
export async function vectorSearch(
  workspacePath: string,
  query: string,
  options?: VectorSearchOptions,
): Promise<readonly SearchResult[]> {
  const args = [
    options?.mode === "keyword" ? "search" : options?.mode === "vector" ? "vsearch" : "query",
    query,
    "--json",
    "-c",
    QMD_COLLECTION,
  ];

  if (options?.limit) {
    args.push("-n", String(options.limit));
  }

  if (options?.minScore) {
    args.push("--min-score", String(options.minScore));
  }

  const output = await execQmd(args);

  // 解析 JSON 输出
  let qmdResults: QmdSearchResult[];
  try {
    qmdResults = JSON.parse(output) as QmdSearchResult[];
  } catch {
    return [];
  }

  // 将 qmd 结果转换为 SearchResult
  // 读取对应的 JSON 文件获取完整模板
  const results: SearchResult[] = [];

  for (const qr of qmdResults) {
    try {
      // qmd 返回的 file 格式: qmd://prompts/category/id.json
      // 需要转换为实际文件路径
      const filePath = qmdFileToLocalPath(workspacePath, qr.file);
      const content = await readFile(filePath, "utf-8");
      const template = JSON.parse(content) as PromptTemplate;
      results.push({ template, score: qr.score });
    } catch {
      // 文件读取失败，跳过
    }
  }

  return results;
}

/**
 * 移除向量索引
 *
 * 从 qmd 中移除 prompts collection 及其关联的上下文。
 *
 * @param workspacePath - workspace 根目录
 */
export async function removeVectorIndex(_workspacePath: string): Promise<void> {
  try {
    await execQmd(["context", "rm", `qmd://${QMD_COLLECTION}`]);
  } catch {
    // 忽略
  }

  try {
    await execQmd(["collection", "remove", QMD_COLLECTION]);
  } catch {
    // 忽略
  }
}

/** 向量搜索选项 */
export interface VectorSearchOptions {
  /** 搜索模式: query（混合+重排序）、keyword（BM25）、vector（纯向量） */
  readonly mode?: "query" | "keyword" | "vector";
  /** 结果数量限制 */
  readonly limit?: number;
  /** 最低相关性分数（0-1） */
  readonly minScore?: number;
}

/**
 * 将 qmd 文件路径转换为本地文件路径
 *
 * qmd 路径格式: qmd://prompts/skills/skill:greeting.json
 * 本地路径格式: {workspacePath}/prompts/skills/skill:greeting.json
 */
function qmdFileToLocalPath(workspacePath: string, qmdFile: string): string {
  // 移除 qmd://prompts/ 前缀，获取相对路径
  const prefix = `qmd://${QMD_COLLECTION}/`;
  const relativePath = qmdFile.startsWith(prefix) ? qmdFile.slice(prefix.length) : qmdFile;

  return resolve(workspacePath, "prompts", relativePath);
}

/**
 * 执行 qmd CLI 命令
 *
 * @param args - 命令参数
 * @returns stdout 输出
 */
function execQmd(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "qmd",
      ["--index", QMD_INDEX, ...args],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new VectorIndexError(
              `qmd 命令执行失败: qmd ${args.join(" ")} — ${stderr || error.message}`,
              error,
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** 向量索引相关错误 */
export class VectorIndexError extends OuroborosError {
  constructor(message: string, cause?: unknown) {
    super(message, "VECTOR_INDEX_ERROR", cause);
    this.name = "VectorIndexError";
  }
}
