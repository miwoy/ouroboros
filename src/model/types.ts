/**
 * 模型抽象层类型定义
 * 提供统一的模型请求/响应接口，屏蔽不同提供商的差异
 */

/** 消息角色 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** 对话消息 */
export interface Message {
  readonly role: MessageRole;
  readonly content: string;
  /** 工具调用 ID（仅 role=tool 时使用） */
  readonly toolCallId?: string;
  /** 工具调用列表（仅 role=assistant 时使用，ReAct 循环中保留模型的工具调用） */
  readonly toolCalls?: readonly ToolCall[];
}

/** 工具参数 Schema（JSON Schema 格式） */
export interface ToolParameterSchema {
  readonly type: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
}

/** 工具定义 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameterSchema;
}

/** 工具调用（模型输出） */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/** Thinking 级别 */
export type ThinkLevel = "low" | "medium" | "high";

/** 模型调用请求参数 */
export interface ModelRequest {
  /** 使用的模型 ID（覆盖提供商默认模型） */
  readonly model?: string;
  /** 对话消息列表 */
  readonly messages: readonly Message[];
  /** 可用工具列表 */
  readonly tools?: readonly ToolDefinition[];
  /** 温度参数 (0-2) */
  readonly temperature?: number;
  /** 最大输出 token 数 */
  readonly maxTokens?: number;
  /** 停止序列 */
  readonly stop?: readonly string[];
  /** 是否启用 thinking/reasoning（覆盖全局配置） */
  readonly think?: boolean;
  /** thinking 级别 */
  readonly thinkLevel?: ThinkLevel;
}

/** 停止原因 */
export type StopReason = "end_turn" | "max_tokens" | "tool_use" | "stop_sequence";

/** Token 用量统计 */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

/** 模型调用响应（非流式） */
export interface ModelResponse {
  /** 生成的文本内容 */
  readonly content: string;
  /** 工具调用列表（可能为空） */
  readonly toolCalls: readonly ToolCall[];
  /** 停止原因 */
  readonly stopReason: StopReason;
  /** Token 用量 */
  readonly usage: TokenUsage;
  /** 使用的模型 ID */
  readonly model: string;
}

/** 流式事件类型 */
export type StreamEvent =
  | { readonly type: "text_delta"; readonly text: string }
  | {
      readonly type: "tool_call_start";
      readonly toolCall: { readonly id: string; readonly name: string };
    }
  | { readonly type: "tool_call_delta"; readonly arguments: string }
  | { readonly type: "tool_call_end" }
  | { readonly type: "done"; readonly response: ModelResponse };

/** 流式回调函数 */
export type StreamCallback = (event: StreamEvent) => void;

/** 模型提供商接口 */
export interface ModelProvider {
  /** 提供商名称标识 */
  readonly name: string;

  /**
   * 非流式调用模型
   * @param request - 请求参数
   * @param signal - 取消信号
   * @returns 完整响应
   */
  complete(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse>;

  /**
   * 流式调用模型
   * @param request - 请求参数
   * @param callback - 流式事件回调
   * @param signal - 取消信号
   * @returns 完整响应（流结束后返回）
   */
  stream(
    request: ModelRequest,
    callback: StreamCallback,
    signal?: AbortSignal,
  ): Promise<ModelResponse>;
}
