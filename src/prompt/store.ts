/**
 * 提示词存储
 *
 * 基于扁平 .md 文件的存储模型。每个提示词文件使用 YAML frontmatter 存储元数据，
 * markdown 正文存储实际内容（含 {{variable}} 占位符）。
 *
 * 目录结构:
 *   workspace/prompts/self.md      — 自我图式
 *   workspace/prompts/tool.md      — 工具注册表
 *   workspace/prompts/skill.md     — 技能注册表
 *   workspace/prompts/agent.md     — Agent 注册表
 *   workspace/prompts/memory.md    — 长期记忆
 *   workspace/prompts/memory/      — 短期记忆（按日期）
 *
 * 注意: core.md 不存于 workspace，直接引用 src/prompt/template/core.md
 */

import { readFile, writeFile, readdir, copyFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OuroborosError } from "../errors/index.js";
import type { PromptFile, PromptFileType, PromptMetadata } from "./types.js";

/** src/prompt/template/ 目录路径（模板源码所在） */
const SRC_TEMPLATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "template");

/** 需要复制到 workspace 的模板文件（core 不复制，直接引用） */
const TEMPLATE_FILES: readonly PromptFileType[] = ["self", "tool", "skill", "agent", "memory"];

/**
 * 读取提示词文件
 *
 * @param filePath - .md 文件的完整路径
 * @returns 解析后的 PromptFile，文件不存在返回 null
 */
export async function readPromptFile(filePath: string): Promise<PromptFile | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return parseFrontmatter(raw);
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return null;
    }
    throw new PromptStoreError(`读取提示词文件失败: ${filePath}`, err);
  }
}

/**
 * 写入提示词文件
 *
 * @param filePath - .md 文件的完整路径
 * @param promptFile - 提示词文件内容
 */
export async function writePromptFile(filePath: string, promptFile: PromptFile): Promise<void> {
  const raw = serializeFrontmatter(promptFile);
  await writeFile(filePath, raw, "utf-8");
}

/**
 * 追加内容到提示词文件末尾
 *
 * @param filePath - .md 文件的完整路径
 * @param content - 要追加的内容
 */
export async function appendToPromptFile(filePath: string, content: string): Promise<void> {
  const existing = await readPromptFile(filePath);
  if (!existing) {
    throw new PromptStoreError(`提示词文件不存在: ${filePath}`);
  }

  const updated: PromptFile = {
    metadata: existing.metadata,
    content: existing.content + "\n" + content,
  };
  await writePromptFile(filePath, updated);
}

/**
 * 获取 core.md 的源码路径（直接引用，不复制）
 */
export function getCorePath(): string {
  return join(SRC_TEMPLATE_DIR, "core.md");
}

/**
 * 加载核心系统提示词内容
 *
 * core.md 是系统内置的不可修改提示词，直接从源码引用。
 * 返回 markdown 正文内容。
 *
 * @returns core.md 的内容
 */
export async function loadCorePrompt(): Promise<string> {
  const corePath = getCorePath();
  const raw = await readFile(corePath, "utf-8");
  return raw;
}

/**
 * 获取 workspace 中提示词文件的路径
 *
 * @param workspacePath - workspace 根目录
 * @param fileType - 提示词文件类型
 * @returns 文件完整路径
 */
export function getPromptFilePath(workspacePath: string, fileType: PromptFileType): string {
  if (fileType === "core") {
    return getCorePath();
  }
  return join(workspacePath, "prompts", `${fileType}.md`);
}

/**
 * 将默认模板复制到 workspace/prompts/
 *
 * 只复制尚未存在的文件（幂等操作）。
 * core.md 不复制，直接从源码引用。
 *
 * @param workspacePath - workspace 根目录
 * @returns 实际复制的文件列表
 */
export async function copyDefaultTemplates(workspacePath: string): Promise<readonly string[]> {
  const promptsDir = join(workspacePath, "prompts");
  const copied: string[] = [];

  for (const fileType of TEMPLATE_FILES) {
    const src = join(SRC_TEMPLATE_DIR, `${fileType}.md`);
    const dest = join(promptsDir, `${fileType}.md`);

    // 只在目标文件不存在时复制
    const exists = await fileExists(dest);
    if (!exists) {
      await copyFile(src, dest);
      copied.push(dest);
    }
  }

  return copied;
}

/**
 * 列出 workspace/prompts/ 下的所有 .md 文件
 *
 * @param workspacePath - workspace 根目录
 * @returns 文件名列表（如 ["self.md", "tool.md", ...]）
 */
export async function listPromptFiles(workspacePath: string): Promise<readonly string[]> {
  const promptsDir = join(workspacePath, "prompts");
  try {
    const entries = await readdir(promptsDir);
    return entries.filter((f) => f.endsWith(".md"));
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return [];
    }
    throw new PromptStoreError(`列出提示词文件失败: ${promptsDir}`, err);
  }
}

/**
 * 列出 workspace/prompts/memory/ 下的短期记忆文件
 *
 * @param workspacePath - workspace 根目录
 * @returns 文件名列表（如 ["2026-01-01.md", "2026-01-02.md", ...]）
 */
export async function listMemoryFiles(workspacePath: string): Promise<readonly string[]> {
  const memoryDir = join(workspacePath, "prompts", "memory");
  try {
    const entries = await readdir(memoryDir);
    return entries.filter((f) => f.endsWith(".md")).sort();
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return [];
    }
    throw new PromptStoreError(`列出短期记忆文件失败: ${memoryDir}`, err);
  }
}

// ─── Frontmatter 解析与序列化 ───────────────────────────────────────

/** frontmatter 分隔符 */
const FRONTMATTER_DELIMITER = "---";

/**
 * 解析 YAML frontmatter + markdown 正文
 *
 * 格式:
 * ```
 * ---
 * type: skill
 * name: 技能注册表
 * description: 技能名称、id、描述、路径
 * tags: [技能, 注册表]
 * version: "1.0.0"
 * ---
 * # 正文内容...
 * ```
 */
export function parseFrontmatter(raw: string): PromptFile {
  const trimmed = raw.trimStart();

  // 没有 frontmatter，返回默认元数据
  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return {
      metadata: {
        type: "memory",
        name: "",
        description: "",
        version: "1.0.0",
      },
      content: raw,
    };
  }

  const secondDelimiterIdx = trimmed.indexOf(
    `\n${FRONTMATTER_DELIMITER}`,
    FRONTMATTER_DELIMITER.length,
  );
  if (secondDelimiterIdx === -1) {
    // 未闭合的 frontmatter，视为无 frontmatter
    return {
      metadata: {
        type: "memory",
        name: "",
        description: "",
        version: "1.0.0",
      },
      content: raw,
    };
  }

  const yamlStr = trimmed.slice(FRONTMATTER_DELIMITER.length + 1, secondDelimiterIdx);
  const content = trimmed.slice(secondDelimiterIdx + FRONTMATTER_DELIMITER.length + 2); // +2 for \n---\n

  return {
    metadata: parseYamlSimple(yamlStr),
    content,
  };
}

/**
 * 序列化 PromptFile 为 frontmatter + markdown 内容
 */
export function serializeFrontmatter(promptFile: PromptFile): string {
  const { metadata, content } = promptFile;
  const lines: string[] = [FRONTMATTER_DELIMITER];

  lines.push(`type: ${metadata.type}`);
  lines.push(`name: "${escapeYamlString(metadata.name)}"`);
  lines.push(`description: "${escapeYamlString(metadata.description)}"`);

  if (metadata.tags && metadata.tags.length > 0) {
    lines.push(`tags: [${metadata.tags.map((t) => `"${escapeYamlString(t)}"`).join(", ")}]`);
  }

  lines.push(`version: "${metadata.version}"`);

  if (metadata.variables && metadata.variables.length > 0) {
    lines.push("variables:");
    for (const v of metadata.variables) {
      lines.push(`  - name: "${escapeYamlString(v.name)}"`);
      lines.push(`    description: "${escapeYamlString(v.description)}"`);
      lines.push(`    required: ${v.required}`);
      if (v.defaultValue !== undefined) {
        lines.push(`    defaultValue: "${escapeYamlString(v.defaultValue)}"`);
      }
    }
  }

  lines.push(FRONTMATTER_DELIMITER);
  lines.push(content);

  return lines.join("\n");
}

// ─── 内部工具函数 ───────────────────────────────────────────────────

/**
 * 简单 YAML 解析器（只处理我们需要的字段）
 * 不依赖外部 YAML 库，保持轻量
 */
function parseYamlSimple(yaml: string): PromptMetadata {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  let currentArrayKey: string | null = null;
  let currentArray: unknown[] = [];
  let currentObj: Record<string, unknown> | null = null;

  for (const line of lines) {
    const trimmedLine = line.trimEnd();

    // 数组项（以 "  - " 开头）
    if (trimmedLine.startsWith("  - ") && currentArrayKey) {
      const value = trimmedLine.slice(4);
      // 检查是否是对象的开始（name: "xxx"）
      if (value.includes(":")) {
        currentObj = {};
        const [key, ...rest] = value.split(":");
        currentObj[key.trim()] = unquote(rest.join(":").trim());
        currentArray.push(currentObj);
      } else {
        currentObj = null;
        currentArray.push(unquote(value));
      }
      continue;
    }

    // 对象属性缩进（以 "    " 开头）
    if (trimmedLine.startsWith("    ") && currentObj) {
      const propLine = trimmedLine.trim();
      const colonIdx = propLine.indexOf(":");
      if (colonIdx !== -1) {
        const key = propLine.slice(0, colonIdx).trim();
        const val = propLine.slice(colonIdx + 1).trim();
        currentObj[key] = val === "true" ? true : val === "false" ? false : unquote(val);
      }
      continue;
    }

    // 保存之前的数组
    if (currentArrayKey && currentArray.length > 0) {
      result[currentArrayKey] = currentArray;
      currentArrayKey = null;
      currentArray = [];
      currentObj = null;
    }

    // 顶层 key: value
    const colonIdx = trimmedLine.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmedLine.slice(0, colonIdx).trim();
    const rawValue = trimmedLine.slice(colonIdx + 1).trim();

    if (!rawValue || rawValue === "") {
      // 下一行可能是数组
      currentArrayKey = key;
      currentArray = [];
      continue;
    }

    // 内联数组 [a, b, c]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const inner = rawValue.slice(1, -1);
      result[key] = inner
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter((s) => s.length > 0);
      continue;
    }

    result[key] = unquote(rawValue);
  }

  // 保存最后一个数组
  if (currentArrayKey && currentArray.length > 0) {
    result[currentArrayKey] = currentArray;
  }

  return {
    type: (result["type"] as PromptFileType) ?? "memory",
    name: (result["name"] as string) ?? "",
    description: (result["description"] as string) ?? "",
    tags: result["tags"] as string[] | undefined,
    version: (result["version"] as string) ?? "1.0.0",
    variables: result["variables"] as PromptMetadata["variables"],
  };
}

/** 去除引号 */
function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** 转义 YAML 字符串中的特殊字符 */
function escapeYamlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 检查文件是否存在 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
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
