/**
 * API 客户端
 *
 * 封装与后端 Chat API 的通信。
 */

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:3000";

/** API 统一响应体 */
export interface ApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: { code: string; message: string } | null;
  readonly metadata?: { total?: number; page?: number; limit?: number };
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

/** 聊天消息 */
export interface ChatMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly role: "user" | "agent" | "system";
  readonly content: string;
  readonly timestamp: string;
}

/** Agent 信息 */
export interface AgentInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly skills: readonly string[];
}

/** 健康检查响应 */
export interface HealthData {
  readonly status: string;
  readonly version: string;
  readonly uptime: number;
}

/** SSE 事件回调 */
export interface StreamCallbacks {
  onThinking?: () => void;
  onTextDelta?: (text: string) => void;
  onDone?: (data: { sessionId: string }) => void;
  onError?: (error: string) => void;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = localStorage.getItem("ouroboros_api_key");
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...options?.headers },
  });
  return res.json();
}

// ─── 健康检查 ──────────────────────────────────────

export async function getHealth(): Promise<ApiResponse<HealthData>> {
  return request("/api/health");
}

// ─── 会话管理 ──────────────────────────────────────

export async function createSession(description?: string, agentId?: string): Promise<ApiResponse<SessionInfo>> {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ description, agentId }),
  });
}

export async function listSessions(): Promise<ApiResponse<SessionInfo[]>> {
  return request("/api/sessions");
}

export async function getSession(sessionId: string): Promise<ApiResponse<SessionInfo>> {
  return request(`/api/sessions/${sessionId}`);
}

export async function deleteSession(sessionId: string): Promise<ApiResponse<{ deleted: boolean }>> {
  return request(`/api/sessions/${sessionId}/delete`, { method: "POST" });
}

// ─── 消息 ──────────────────────────────────────

export async function sendMessage(
  message: string,
  sessionId?: string,
  agentId?: string,
): Promise<ApiResponse<{ sessionId: string; response: string; formatted: string }>> {
  return request("/api/chat/message", {
    method: "POST",
    body: JSON.stringify({ message, sessionId, agentId, stream: false }),
  });
}

export async function getMessages(
  sessionId: string,
  page = 1,
  limit = 50,
): Promise<ApiResponse<ChatMessage[]>> {
  return request(`/api/chat/messages/${sessionId}?page=${page}&limit=${limit}`);
}

/** SSE 流式发送消息 */
export function streamMessage(
  message: string,
  callbacks: StreamCallbacks,
  sessionId?: string,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/api/chat/message`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ message, sessionId, stream: true }),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const event = line.slice(7).trim();
            const nextLine = lines[lines.indexOf(line) + 1];
            if (nextLine?.startsWith("data: ")) {
              const data = JSON.parse(nextLine.slice(6));
              switch (event) {
                case "thinking":
                  callbacks.onThinking?.();
                  break;
                case "text_delta":
                  callbacks.onTextDelta?.(data.text);
                  break;
                case "done":
                  callbacks.onDone?.(data);
                  break;
                case "error":
                  callbacks.onError?.(data.message);
                  break;
              }
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError?.(err.message);
      }
    });

  return controller;
}

// ─── Agent ──────────────────────────────────────

export async function listAgents(): Promise<ApiResponse<AgentInfo[]>> {
  return request("/api/agents");
}

export async function getAgent(agentId: string): Promise<ApiResponse<AgentInfo>> {
  return request(`/api/agents/${agentId}`);
}
