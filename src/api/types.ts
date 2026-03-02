/**
 * Chat API 类型定义
 *
 * 统一的 API 请求/响应格式、会话管理、配置等。
 */

import type { Logger } from "../logger/types.js";

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

/** 会话信息 */
export interface SessionInfo {
  readonly sessionId: string;
  readonly agentId: string;
  readonly description: string;
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
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
export type SSEEventType = "text_delta" | "tool_call" | "thinking" | "done" | "error";

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
