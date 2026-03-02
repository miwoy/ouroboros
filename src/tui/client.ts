/**
 * TUI HTTP 客户端
 *
 * 封装对 Ouroboros API 的 HTTP 调用，包括 SSE 流式消息。
 */

/** API 客户端配置 */
export interface TuiClientConfig {
  readonly baseUrl: string;
  readonly apiKey?: string;
}

/** API 统一响应 */
interface ApiResponse<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: { readonly code: string; readonly message: string } | null;
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

/** 健康信息 */
export interface HealthInfo {
  readonly status: string;
  readonly version: string;
  readonly uptime: number;
}

/** 聊天消息 */
export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "agent" | "system";
  readonly content: string;
  readonly timestamp: string;
}

/** SSE 事件回调 */
export interface SSECallbacks {
  readonly onTextDelta?: (text: string) => void;
  readonly onToolCall?: (data: Record<string, unknown>) => void;
  readonly onToolResult?: (data: Record<string, unknown>) => void;
  readonly onThinking?: (text: string) => void;
  readonly onReactStep?: (data: Record<string, unknown>) => void;
  readonly onDone?: (data: Record<string, unknown>) => void;
  readonly onError?: (message: string) => void;
}

/**
 * 创建 TUI API 客户端
 */
export function createTuiClient(config: TuiClientConfig) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  /** 通用 JSON 请求 */
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as ApiResponse<T>;
  }

  return {
    /** 健康检查 */
    async health(): Promise<HealthInfo | null> {
      const res = await request<HealthInfo>("GET", "/api/health");
      return res.data;
    },

    /** 创建会话 */
    async createSession(description?: string): Promise<SessionInfo | null> {
      const res = await request<SessionInfo>("POST", "/api/sessions", {
        description,
      });
      return res.data;
    },

    /** 列出会话 */
    async listSessions(): Promise<readonly SessionInfo[]> {
      const res = await request<readonly SessionInfo[]>("GET", "/api/sessions");
      return res.data ?? [];
    },

    /** 获取消息历史 */
    async getMessages(sessionId: string): Promise<readonly ChatMessage[]> {
      const res = await request<readonly ChatMessage[]>(
        "GET",
        `/api/chat/messages/${sessionId}`,
      );
      return res.data ?? [];
    },

    /** 发送消息（SSE 流式） */
    async sendMessageStream(
      sessionId: string,
      message: string,
      callbacks: SSECallbacks,
    ): Promise<void> {
      const res = await fetch(`${config.baseUrl}/api/chat/message`, {
        method: "POST",
        headers,
        body: JSON.stringify({ sessionId, message, stream: true }),
      });

      if (!res.ok || !res.body) {
        callbacks.onError?.(`HTTP ${res.status}: ${res.statusText}`);
        return;
      }

      await parseSSEStream(res.body, callbacks);
    },
  };
}

/**
 * 解析 SSE 流并分发事件
 */
async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  callbacks: SSECallbacks,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6);
          dispatchSSEEvent(currentEvent, data, callbacks);
          currentEvent = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** 分发 SSE 事件到回调 */
function dispatchSSEEvent(
  event: string,
  data: string,
  callbacks: SSECallbacks,
): void {
  switch (event) {
    case "text_delta":
      callbacks.onTextDelta?.(data);
      break;
    case "thinking":
      callbacks.onThinking?.(data);
      break;
    case "tool_call":
      callbacks.onToolCall?.(safeParse(data));
      break;
    case "tool_result":
      callbacks.onToolResult?.(safeParse(data));
      break;
    case "react_step":
      callbacks.onReactStep?.(safeParse(data));
      break;
    case "done":
      callbacks.onDone?.(safeParse(data));
      break;
    case "error":
      callbacks.onError?.(data);
      break;
  }
}

/** 安全解析 JSON */
function safeParse(data: string): Record<string, unknown> {
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return { raw: data };
  }
}

export type TuiClient = ReturnType<typeof createTuiClient>;
