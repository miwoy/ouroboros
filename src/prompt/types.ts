/**
 * 提示词系统类型定义
 *
 * 定义提示词文件类型、模板变量、渲染结果、装配结果等核心类型。
 * 重构后采用扁平 .md 文件模型，取代原有的分类子目录 + JSON 模式。
 */

/**
 * 提示词文件类型
 * - core: 系统提示词（不可修改，直接引用 src/prompt/core.md）
 * - self: 自我图式（运行时更新）
 * - tool: 工具注册表（随工具增长）
 * - skill: 技能注册表（随技能增长）
 * - agent: Agent 注册表（量小）
 * - memory: 长期记忆（持续累积）
 */
export type PromptFileType = "core" | "self" | "tool" | "skill" | "agent" | "memory";

/** 装配优先级：数值越小优先级越高 */
export const FILE_TYPE_PRIORITY: Readonly<Record<PromptFileType, number>> = {
  core: 0,
  self: 1,
  agent: 2,
  skill: 3,
  tool: 4,
  memory: 5,
} as const;

/**
 * 模板变量声明
 * 复用 PROTOCOL.md Skill 层的变量定义
 */
export interface TemplateVariable {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: string;
}

/**
 * 提示词文件元数据（frontmatter）
 * 存储在 .md 文件的 YAML frontmatter 中
 */
export interface PromptMetadata {
  readonly type: PromptFileType;
  readonly name: string;
  readonly description: string;
  readonly tags?: readonly string[];
  readonly version: string;
  readonly variables?: readonly TemplateVariable[];
}

/**
 * 提示词文件（完整内容 = 元数据 + markdown 正文）
 */
export interface PromptFile {
  readonly metadata: PromptMetadata;
  readonly content: string; // markdown 正文（含 {{variable}} 占位符）
}

/** 提示词渲染结果 */
export interface RenderedPrompt {
  readonly fileType: PromptFileType;
  readonly content: string; // 替换变量后的最终内容
}

/** 提示词装配结果 — 可直接用于构建 callModel 的 messages */
export interface AssembledPrompt {
  readonly systemPrompt: string; // system message 拼接
  readonly contextPrompts: readonly string[]; // 按需加载的上下文片段
}

/** 搜索选项 */
export interface SearchOptions {
  /** 结果数量限制 */
  readonly limit?: number;
  /** 最低相关性分数（0-1，预留给向量检索） */
  readonly threshold?: number;
}

/** 搜索结果 */
export interface SearchResult {
  readonly fileType: PromptFileType;
  readonly fileName: string; // 文件名（如 skill.md）
  readonly content: string; // 匹配的内容片段
  readonly score: number;
}
