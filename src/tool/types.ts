/**
 * 工具系统类型定义
 *
 * 定义 EntityCard 基座、OuroborosTool 工具定义、调用请求/响应、处理函数签名等核心类型。
 * 遵循 PROTOCOL.md 规范，使用常量对象模式（非 enum）利于 tree-shaking。
 */

import type { ModelRequest, ModelResponse } from "../model/types.js";

// ─── 常量枚举 ──────────────────────────────────────────────────────

/** 实体类型 */
export const EntityType = {
  Tool: "tool",
  Skill: "skill",
  Solution: "solution",
  SuperAgent: "super-agent",
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

/** 实体生命周期状态 */
export const EntityStatus = {
  Created: "created",
  Active: "active",
  Deprecated: "deprecated",
  Archived: "archived",
} as const;
export type EntityStatus = (typeof EntityStatus)[keyof typeof EntityStatus];

/** 工具错误码 */
export const ToolErrorCode = {
  InvalidInput: "INVALID_INPUT",
  Timeout: "TIMEOUT",
  PermissionDenied: "PERMISSION_DENIED",
  RuntimeError: "RUNTIME_ERROR",
  NotFound: "NOT_FOUND",
  ResourceExhausted: "RESOURCE_EXHAUSTED",
} as const;
export type ToolErrorCode = (typeof ToolErrorCode)[keyof typeof ToolErrorCode];

// ─── 基础接口 ──────────────────────────────────────────────────────

/** 权限声明 */
export interface Permissions {
  /** 允许的文件系统访问路径（glob 模式） */
  readonly filesystem?: readonly string[];
  /** 是否允许网络访问 */
  readonly network?: boolean;
  /** 是否允许执行系统命令 */
  readonly shellExec?: boolean;
  /** 是否允许调用模型 */
  readonly modelAccess?: boolean;
  /** 是否允许创建子实体 */
  readonly createEntity?: boolean;
  /** 自定义权限键值对 */
  readonly custom?: Readonly<Record<string, boolean>>;
}

/** JSON Schema（简化表示，用于 inputSchema/outputSchema） */
export interface JSONSchema {
  readonly type: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly description?: string;
  readonly items?: unknown;
  readonly default?: unknown;
  readonly additionalProperties?: boolean | unknown;
}

/** 实体基座卡片——所有层级共享 */
export interface EntityCard {
  /** 唯一标识符，格式: {type}:{kebab-case-name} */
  readonly id: string;
  /** 实体类型 */
  readonly type: EntityType;
  /** 人类可读名称 */
  readonly name: string;
  /** 功能描述，同时作为向量检索的语义文本 */
  readonly description: string;
  /** 语义标签，辅助检索 */
  readonly tags?: readonly string[];
  /** 语义化版本号 */
  readonly version: string;
  /** 当前状态 */
  readonly status: EntityStatus;
  /** 权限声明 */
  readonly permissions: Permissions;
  /** 创建来源 */
  readonly origin: "system" | "user" | "generated";
  /** 创建时间 ISO 8601 */
  readonly createdAt: string;
  /** 最后更新时间 ISO 8601 */
  readonly updatedAt: string;
  /** 扩展元数据 */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** OuroborosTool — 系统工具定义（区别于模型层 ToolDefinition） */
export interface OuroborosTool extends EntityCard {
  readonly type: typeof EntityType.Tool;
  /** 输入参数 JSON Schema */
  readonly inputSchema: JSONSchema;
  /** 输出结果 JSON Schema */
  readonly outputSchema: JSONSchema;
  /**
   * 工具执行入口
   * - 内置工具: "builtin:call-model" | "builtin:run-agent" | "builtin:search-tool" | "builtin:create-tool"
   * - 自定义工具: "scripts/xxx.js"
   */
  readonly entrypoint: string;
  /** 执行超时时间（毫秒），默认 30000 */
  readonly timeout?: number;
  /** 是否支持异步执行 */
  readonly async?: boolean;
  /** 重试策略 */
  readonly retry?: {
    readonly maxRetries: number;
    readonly delay: number;
  };
}

// ─── 调用协议 ──────────────────────────────────────────────────────

/** 工具调用请求 */
export interface ToolCallRequest {
  /** 请求唯一 ID */
  readonly requestId: string;
  /** 目标工具 ID */
  readonly toolId: string;
  /** 输入参数 */
  readonly input: Readonly<Record<string, unknown>>;
  /** 调用来源（审计追踪） */
  readonly caller: {
    readonly entityId: string;
    readonly nodeId?: string;
  };
}

/** 工具调用响应 */
export interface ToolCallResponse {
  /** 对应的请求 ID */
  readonly requestId: string;
  /** 执行是否成功 */
  readonly success: boolean;
  /** 输出结果 */
  readonly output?: Readonly<Record<string, unknown>>;
  /** 错误信息 */
  readonly error?: {
    readonly code: ToolErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  };
  /** 执行耗时（毫秒） */
  readonly duration: number;
}

// ─── 处理函数与上下文 ──────────────────────────────────────────────

/** callModel 函数签名（从 model 层注入） */
export type CallModelFn = (
  request: ModelRequest,
  options?: { readonly provider?: string; readonly signal?: AbortSignal },
) => Promise<ModelResponse>;

/** 工具注册表接口（避免循环依赖，此处定义接口） */
export interface ToolRegistry {
  /** 获取工具定义 */
  get(toolId: string): OuroborosTool | undefined;
  /** 检查工具是否存在 */
  has(toolId: string): boolean;
  /** 列出所有工具 */
  list(): readonly OuroborosTool[];
  /** 列出自定义工具（排除 builtin） */
  listCustom(): readonly OuroborosTool[];
  /** 注册工具（持久化 + 索引） */
  register(tool: OuroborosTool): Promise<void>;
  /** 更新工具状态 */
  updateStatus(toolId: string, status: EntityStatus): Promise<OuroborosTool>;
}

/** 工具执行上下文（注入依赖） */
export interface ToolExecutionContext {
  /** workspace 根目录 */
  readonly workspacePath: string;
  /** callModel 函数（从 model 层注入） */
  readonly callModel: CallModelFn;
  /** 注册表引用（searchTool/createTool 需要） */
  readonly registry: ToolRegistry;
  /** 调用来源 */
  readonly caller: ToolCallRequest["caller"];
  /** 取消信号 */
  readonly signal?: AbortSignal;
}

/** 工具处理函数签名 */
export type ToolHandler = (
  input: Readonly<Record<string, unknown>>,
  context: ToolExecutionContext,
) => Promise<Readonly<Record<string, unknown>>>;

// ─── 注册表文件格式 ────────────────────────────────────────────────

/** 注册表持久化数据结构 */
export interface ToolRegistryData {
  readonly version: string;
  readonly updatedAt: string;
  readonly tools: readonly OuroborosTool[];
}
