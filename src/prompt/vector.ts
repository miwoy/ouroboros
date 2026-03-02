/**
 * qmd 向量索引集成
 *
 * 封装 npx qmd 实现提示词文件的向量化索引与语义检索。
 *
 * 设计：
 * - 使用 npx qmd 调用（项目依赖，不需要全局安装）
 * - 环境变量 XDG_CACHE_HOME={workspace}/vectors 实现索引隔离
 * - 独立索引名称 ouroboros，避免污染用户索引
 * - 只索引 tool.md、skill.md、memory.md、memory/ 目录
 * - collection add 后需显式 embed（add 不自动 embed）
 * - initVectorIndex 幂等（检查 collection 是否存在）
 */

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { OuroborosError } from "../errors/index.js";
import type { PromptFileType, PromptSearchResult } from "./types.js";

/** qmd 索引名称 */
const QMD_INDEX = "ouroboros";

/** qmd collection 配置：需要索引的提示词文件和目录 */
const QMD_COLLECTIONS: readonly QmdCollectionConfig[] = [
  {
    name: "prompts",
    path: "prompts",
    mask: "*.md",
    description: "提示词注册表（tool/skill/memory）",
  },
  { name: "memory", path: "prompts/memory", mask: "*.md", description: "短期记忆（按日期文件）" },
];

/** collection 配置 */
interface QmdCollectionConfig {
  readonly name: string;
  readonly path: string;
  readonly mask: string;
  readonly description: string;
}

/** qmd 搜索 JSON 输出的单条结果 */
interface QmdSearchResult {
  readonly docid: string;
  readonly score: number;
  readonly file: string;
  readonly title: string;
  readonly snippet: string;
}

/**
 * 检测 qmd 是否可用（通过 npx qmd status）
 *
 * @param workspacePath - workspace 根目录（用于设置 XDG_CACHE_HOME）
 * @returns qmd 是否可用
 */
export async function isQmdAvailable(workspacePath: string): Promise<boolean> {
  try {
    await execQmd(workspacePath, ["status"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 初始化向量索引（幂等）
 *
 * 检查 collection 是否存在，不存在则创建。已存在的 collection 不受影响。
 * 创建后执行 update + embed。
 *
 * @param workspacePath - workspace 根目录
 */
export async function initVectorIndex(workspacePath: string): Promise<void> {
  const root = resolve(workspacePath);

  for (const col of QMD_COLLECTIONS) {
    const collectionPath = resolve(root, col.path);

    // 检查 collection 是否已存在
    const exists = await collectionExists(workspacePath, col.name);
    if (!exists) {
      // 注册 collection
      await execQmd(workspacePath, [
        "collection",
        "add",
        collectionPath,
        "--name",
        col.name,
        "--mask",
        col.mask,
      ]);

      // 添加上下文描述
      try {
        await execQmd(workspacePath, ["context", "add", `qmd://${col.name}`, col.description]);
      } catch {
        // context 已存在时忽略
      }
    }
  }

  // 执行索引更新和向量嵌入
  await execQmd(workspacePath, ["update"]);
  await execQmd(workspacePath, ["embed"]);
}

/**
 * 更新向量索引
 *
 * 当提示词文件有变动后调用，重新索引并更新向量嵌入。
 *
 * @param workspacePath - workspace 根目录
 */
export async function updateVectorIndex(workspacePath: string): Promise<void> {
  await execQmd(workspacePath, ["update"]);
  await execQmd(workspacePath, ["embed"]);
}

/**
 * 向量语义搜索
 *
 * 使用 qmd query（混合检索 + 重排序）搜索提示词文件。
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
): Promise<readonly PromptSearchResult[]> {
  const args = [
    options?.mode === "keyword" ? "search" : options?.mode === "vector" ? "vsearch" : "query",
    query,
    "--json",
  ];

  // 指定要搜索的 collection
  if (options?.collection) {
    args.push("-c", options.collection);
  }

  if (options?.limit) {
    args.push("-n", String(options.limit));
  }

  if (options?.minScore) {
    args.push("--min-score", String(options.minScore));
  }

  const output = await execQmd(workspacePath, args);

  // 解析 JSON 输出
  let qmdResults: QmdSearchResult[];
  try {
    qmdResults = JSON.parse(output) as QmdSearchResult[];
  } catch {
    return [];
  }

  // 将 qmd 结果转换为 PromptSearchResult
  return qmdResults.map((qr) => ({
    fileType: inferFileType(qr.file),
    fileName: extractFileName(qr.file),
    content: qr.snippet,
    score: qr.score,
  }));
}

/**
 * 移除向量索引
 *
 * 移除所有 collection 及其关联的上下文。
 *
 * @param workspacePath - workspace 根目录
 */
export async function removeVectorIndex(workspacePath: string): Promise<void> {
  for (const col of QMD_COLLECTIONS) {
    try {
      await execQmd(workspacePath, ["context", "rm", `qmd://${col.name}`]);
    } catch {
      // 忽略
    }

    try {
      await execQmd(workspacePath, ["collection", "remove", col.name]);
    } catch {
      // 忽略
    }
  }
}

/** 向量搜索选项 */
export interface VectorSearchOptions {
  /** 搜索模式: query（混合+重排序）、keyword（BM25）、vector（纯向量） */
  readonly mode?: "query" | "keyword" | "vector";
  /** 指定搜索的 collection 名称 */
  readonly collection?: string;
  /** 结果数量限制 */
  readonly limit?: number;
  /** 最低相关性分数（0-1） */
  readonly minScore?: number;
}

// ─── 内部工具函数 ───────────────────────────────────────────────────

/**
 * 检查 collection 是否存在
 */
async function collectionExists(workspacePath: string, name: string): Promise<boolean> {
  try {
    const output = await execQmd(workspacePath, ["collection", "list", "--json"]);
    const collections = JSON.parse(output) as readonly { name: string }[];
    return collections.some((c) => c.name === name);
  } catch {
    return false;
  }
}

/**
 * 从 qmd 文件路径推断文件类型
 * qmd 路径格式: qmd://prompts/skill.md 或 qmd://memory/2026-01-01.md
 */
function inferFileType(qmdFile: string): PromptFileType {
  if (qmdFile.includes("memory/")) return "memory";
  if (qmdFile.includes("tool")) return "tool";
  if (qmdFile.includes("skill")) return "skill";
  if (qmdFile.includes("agent")) return "agent";
  if (qmdFile.includes("self")) return "self";
  return "memory";
}

/**
 * 从 qmd 文件路径提取文件名
 */
function extractFileName(qmdFile: string): string {
  const parts = qmdFile.split("/");
  return parts[parts.length - 1] ?? qmdFile;
}

/**
 * 执行 qmd CLI 命令
 *
 * 使用 npx qmd 调用，通过 XDG_CACHE_HOME 实现索引隔离。
 *
 * @param workspacePath - workspace 根目录（用于设置环境变量）
 * @param args - 命令参数
 * @returns stdout 输出
 */
function execQmd(workspacePath: string, args: readonly string[]): Promise<string> {
  const vectorsDir = resolve(workspacePath, "vectors");

  return new Promise((resolve, reject) => {
    execFile(
      "npx",
      ["qmd", "--index", QMD_INDEX, ...args],
      {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          XDG_CACHE_HOME: vectorsDir,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new VectorIndexError(
              `qmd 命令执行失败: npx qmd ${args.join(" ")} — ${stderr || error.message}`,
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
