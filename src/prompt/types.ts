/**
 * 提示词系统类型定义
 *
 * 定义了提示词模板、变量声明、渲染结果、装配结果等核心类型。
 * 对应 PROTOCOL.md 中 Skill 层的 promptTemplate + {{variable}} 模板引擎。
 */

/** 提示词类别（对应 DESIGN.md 中的 6 类提示词 + agent） */
export type PromptCategory =
  | "system"
  | "agent"
  | "skill"
  | "tool"
  | "memory"
  | "schema"
  | "core";

/** 装配优先级：数值越小优先级越高 */
export const CATEGORY_PRIORITY: Readonly<Record<PromptCategory, number>> = {
  core: 0,
  system: 1,
  schema: 2,
  agent: 3,
  skill: 4,
  tool: 5,
  memory: 6,
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

/** 提示词模板定义 */
export interface PromptTemplate {
  readonly id: string; // 唯一标识，如 "agent:greeting"
  readonly category: PromptCategory;
  readonly name: string; // 人类可读名称
  readonly description: string; // 功能描述（未来用于向量检索的语义文本）
  readonly content: string; // 模板内容，含 {{variable}} 占位符
  readonly variables: readonly TemplateVariable[];
  readonly tags?: readonly string[];
  readonly version: string;
}

/** 提示词渲染结果 */
export interface RenderedPrompt {
  readonly templateId: string;
  readonly content: string; // 替换变量后的最终内容
  readonly category: PromptCategory;
}

/** 提示词装配结果 — 可直接用于构建 callModel 的 messages */
export interface AssembledPrompt {
  readonly systemPrompt: string; // system message 拼接
  readonly contextPrompts: readonly string[]; // 按需加载的上下文片段
}

/** 关键词搜索选项 */
export interface SearchOptions {
  readonly category?: PromptCategory;
  readonly limit?: number;
  readonly threshold?: number; // 预留给向量检索
}

/** 搜索结果 */
export interface SearchResult {
  readonly template: PromptTemplate;
  readonly score: number; // 关键词匹配：简单的命中率分数
}
