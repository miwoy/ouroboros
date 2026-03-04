/**
 * Chat API 类型定义
 *
 * 统一的 API 请求/响应格式、会话管理、配置等。
 */

import type { Logger } from "../logger/types.js";
import type { ProviderRegistry } from "../model/registry.js";
import type { ToolRegistry, CallModelFn } from "../tool/types.js";
import type { ReactLoopConfig } from "../core/types.js";
import type { SchemaProvider } from "../schema/schema-provider.js";
import type { MemoryManager } from "../memory/types.js";
import type { Inspector } from "../inspector/types.js";
import type { Reflector } from "../reflection/types.js";
import type { Config } from "../config/schema.js";
import type { SkillRegistry } from "../skill/types.js";
import type { WsServer } from "./ws-server.js";

// ─── 统一响应格式 ──────────────────────────────────────────────

/** API 统一响应体 */
export interface ApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: ApiError | null;
  readonly metadata?: ResponseMetadata;
}

/** API 错误信息 */
export interface ApiError {
  readonly code: string;
  readonly message: string;
}

/** 响应元数据（分页等） */
export interface ResponseMetadata {
  readonly total?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly [key: string]: unknown;
}

// ─── 请求类型 ──────────────────────────────────────────────

/** 发送消息请求 */
export interface SendMessageRequest {
  readonly sessionId?: string;
  readonly message: string;
  readonly agentId?: string;
  readonly stream?: boolean;
  /** 指定使用的提供商名称（覆盖 config 中的 defaultProvider） */
  readonly provider?: string;
  /** 指定使用的模型 ID（覆盖提供商的 defaultModel） */
  readonly model?: string;
}

/** 创建会话请求 */
export interface CreateSessionRequest {
  readonly agentId?: string;
  readonly description?: string;
}

// ─── 响应类型 ──────────────────────────────────────────────

/** 聊天消息 */
export interface ChatMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly role: "user" | "agent" | "system";
  readonly content: string;
  readonly timestamp: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Token 用量统计 */
export interface TokenUsageSummary {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly totalTokens: number;
  readonly messageCount: number;
}

/** 会话信息 */
export interface SessionInfo {
  readonly sessionId: string;
  readonly agentId: string;
  readonly description: string;
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly hasExecutionTree?: boolean;
  readonly tokenUsage?: TokenUsageSummary;
}

/** Agent 信息 */
export interface AgentInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly skills: readonly string[];
}

/** 任务信息 */
export interface TaskInfo {
  readonly taskId: string;
  readonly agentId: string;
  readonly state: string;
  readonly description: string;
  readonly progress: number;
  readonly createdAt: string;
}

// ─── SSE 事件 ──────────────────────────────────────────────

/** SSE 事件类型 */
export type SSEEventType =
  | "text_delta"
  | "tool_call"
  | "tool_result"
  | "react_step"
  | "thinking"
  | "done"
  | "error"
  | "tree_update"
  | "execution_log";

/** 执行日志级别 */
export type ExecutionLogLevel = "step" | "model" | "tool" | "error";

/** 执行日志条目（WS + SSE 推送） */
export interface ExecutionLogEntry {
  readonly timestamp: string;
  readonly level: ExecutionLogLevel;
  readonly message: string;
  readonly stepIndex?: number;
  readonly toolId?: string;
  readonly duration?: number;
}

/** SSE 事件 */
export interface SSEEvent {
  readonly event: SSEEventType;
  readonly data: string;
}

// ─── 配置 ──────────────────────────────────────────────

/** API 配置 */
export interface ApiConfig {
  /** HTTP 端口 */
  readonly port: number;
  /** 绑定主机 */
  readonly host: string;
  /** API 密钥（空则无认证） */
  readonly apiKey?: string;
  /** 速率限制 */
  readonly rateLimit: RateLimitConfig;
  /** CORS 来源 */
  readonly corsOrigin: string;
  /** 静态文件目录（绝对路径），存在则托管 Web UI 静态文件 */
  readonly staticDir?: string;
}

/** 速率限制配置 */
export interface RateLimitConfig {
  /** 时间窗口（毫秒） */
  readonly windowMs: number;
  /** 窗口内最大请求数 */
  readonly maxRequests: number;
}

/** 默认 API 配置 */
export const DEFAULT_API_CONFIG: ApiConfig = {
  port: 3000,
  host: "127.0.0.1",
  rateLimit: { windowMs: 60000, maxRequests: 60 },
  corsOrigin: "*",
};

// ─── 依赖注入 ──────────────────────────────────────────────

/** API 层依赖 */
export interface ApiDeps {
  readonly logger: Logger;
  readonly workspacePath: string;
  readonly config: ApiConfig;
  /** 模型提供商注册表（可选，无则 chat 使用占位符响应） */
  readonly providerRegistry?: ProviderRegistry;
  /** 默认提供商名称 */
  readonly defaultProvider?: string;
  /** 工具注册表（可选，有则启用 ReAct 循环） */
  readonly toolRegistry?: ToolRegistry;
  /** 统一 callModel 函数（含超时+重试，优先于从 providerRegistry 裸包装） */
  readonly callModel?: CallModelFn;
  /** ReAct 循环配置 */
  readonly reactConfig?: Omit<ReactLoopConfig, "agentId">;
  /** HTTP 代理 fetch（传给 ToolExecutor） */
  readonly httpFetch?: typeof globalThis.fetch;
  /** 自我图式提供者 */
  readonly schemaProvider?: SchemaProvider;
  /** 记忆管理器 */
  readonly memoryManager?: MemoryManager;
  /** 完整配置（webSearch 等子配置） */
  readonly fullConfig?: Config;
  /** 审查程序 */
  readonly inspector?: Inspector;
  /** 反思器 */
  readonly reflector?: Reflector;
  /** 技能注册表 */
  readonly skillRegistry?: SkillRegistry;
  /** WebSocket 服务器（可选，由 server.ts 启动后注入） */
  readonly wsServer?: WsServer;
}

// ─── 路由 ──────────────────────────────────────────────

/** HTTP 方法 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS";

/** 路由处理函数 */
export type RouteHandler = (ctx: RequestContext) => Promise<void>;

/** 请求上下文 */
export interface RequestContext {
  readonly method: HttpMethod;
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: unknown;
  respond(status: number, body: unknown): void;
  respondSSE(events: AsyncIterable<SSEEvent>): void;
}
