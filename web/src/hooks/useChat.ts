/**
 * 聊天状态管理 Hook
 */

import { useState, useCallback, useRef } from "react";
import * as api from "../services/api";
import type { ExecutionTree, TokenUsageSummary } from "../services/api";

/** 工具调用展示信息 */
export interface ToolCallDisplay {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly output?: Record<string, unknown>;
  readonly success?: boolean;
  readonly error?: string;
  readonly status: "pending" | "done";
}

export interface DisplayMessage {
  readonly id: string;
  readonly role: "user" | "agent" | "system";
  readonly content: string;
  readonly timestamp: string;
  readonly streaming?: boolean;
  /** 模型思考内容（ReAct 步骤） */
  readonly thought?: string;
  /** 工具调用列表 */
  readonly toolCalls?: readonly ToolCallDisplay[];
  /** 执行树快照（完成后附加） */
  readonly executionTree?: ExecutionTree;
  /** 附加元数据（如 totalUsage） */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function useChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** 加载会话消息历史 */
  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid);
    setError(null);
    const res = await api.getMessages(sid);
    if (res.success && res.data) {
      const displayMsgs: DisplayMessage[] = res.data.map((m) => {
        const base: DisplayMessage = {
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        };
        if (m.role === "agent" && m.metadata) {
          const thought = m.metadata.thought as string | undefined;
          const rawCalls = m.metadata.toolCalls as readonly Record<string, unknown>[] | undefined;
          const toolCalls: ToolCallDisplay[] | undefined = rawCalls?.map((tc) => ({
            toolCallId: String(tc.toolId ?? tc.requestId ?? ""),
            toolName: String(tc.toolId ?? ""),
            input: (tc.input as Record<string, unknown>) ?? {},
            output: tc.output as Record<string, unknown> | undefined,
            success: tc.success as boolean | undefined,
            error: tc.error as string | undefined,
            status: "done" as const,
          }));
          const totalUsage = m.metadata.totalUsage as Record<string, unknown> | undefined;
          return { ...base, thought: thought || undefined, toolCalls, metadata: totalUsage ? { totalUsage } : undefined };
        }
        return base;
      });
      setMessages(displayMsgs);

      // 获取执行树，附加到最后一条 agent 消息
      const treeRes = await api.getExecutionTree(sid).catch(() => null);
      if (treeRes?.success && treeRes.data) {
        setMessages((prev) => {
          const lastAgentIdx = prev.findLastIndex((m) => m.role === "agent");
          if (lastAgentIdx < 0) return prev;
          return prev.map((m, i) => (i === lastAgentIdx ? { ...m, executionTree: treeRes.data! } : m));
        });
      }

      // 获取 token 用量
      const usageRes = await api.getSessionUsage(sid).catch(() => null);
      if (usageRes?.success && usageRes.data) {
        setTokenUsage(usageRes.data);
      }
    }
  }, []);

  /** 创建新会话 */
  const newSession = useCallback(async (description?: string) => {
    setError(null);
    const res = await api.createSession(description);
    if (res.success && res.data) {
      setSessionId(res.data.sessionId);
      setMessages([]);
      return res.data.sessionId;
    }
    return null;
  }, []);

  /** 发送消息（流式） */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      setError(null);

      // 添加用户消息
      const userMsg: DisplayMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // 添加 Agent 占位消息
      const agentMsgId = `agent-${Date.now()}`;
      const agentMsg: DisplayMessage = {
        id: agentMsgId,
        role: "agent",
        content: "",
        timestamp: new Date().toISOString(),
        streaming: true,
        toolCalls: [],
      };
      setMessages((prev) => [...prev, agentMsg]);
      setLoading(true);

      const controller = api.streamMessage(
        text,
        {
          onTextDelta: (delta) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === agentMsgId ? { ...m, content: m.content + delta } : m)),
            );
          },
          onReactStep: (data) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId ? { ...m, thought: data.thought } : m,
              ),
            );
          },
          onToolCall: (data) => {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== agentMsgId) return m;
                const newToolCall: ToolCallDisplay = {
                  toolCallId: data.toolCallId,
                  toolName: data.toolName,
                  input: data.input,
                  status: "pending",
                };
                return { ...m, toolCalls: [...(m.toolCalls || []), newToolCall] };
              }),
            );
          },
          onToolResult: (data) => {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== agentMsgId) return m;
                const updatedCalls = (m.toolCalls || []).map((tc) =>
                  tc.toolCallId === data.toolCallId
                    ? { ...tc, output: data.output, success: data.success, error: data.error, status: "done" as const }
                    : tc,
                );
                return { ...m, toolCalls: updatedCalls };
              }),
            );
          },
          onDone: (data) => {
            const donePayload = data as { sessionId: string; totalUsage?: Record<string, unknown> };
            // 将 totalUsage 附加到 agent 消息 metadata
            const msgMetadata = donePayload.totalUsage ? { totalUsage: donePayload.totalUsage } : undefined;
            setMessages((prev) =>
              prev.map((m) => (m.id === agentMsgId ? { ...m, streaming: false, metadata: msgMetadata } : m)),
            );
            const resolvedSessionId = sessionId || donePayload.sessionId;
            if (!sessionId && donePayload.sessionId) {
              setSessionId(donePayload.sessionId);
            }
            setLoading(false);

            // 异步拉取执行树快照 + token 用量
            if (resolvedSessionId) {
              api.getExecutionTree(resolvedSessionId).then((treeRes) => {
                if (treeRes.success && treeRes.data) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === agentMsgId ? { ...m, executionTree: treeRes.data! } : m,
                    ),
                  );
                }
              }).catch(() => {});
              api.getSessionUsage(resolvedSessionId).then((usageRes) => {
                if (usageRes.success && usageRes.data) {
                  setTokenUsage(usageRes.data);
                }
              }).catch(() => {});
            }
          },
          onError: (err) => {
            setError(err);
            // 清除 agent 占位消息的 streaming 状态，避免 typing indicator 残留
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId && m.streaming
                  ? { ...m, streaming: false, content: m.content || "" }
                  : m,
              ),
            );
            setLoading(false);
          },
        },
        sessionId || undefined,
      );
      abortRef.current = controller;
    },
    [sessionId, loading],
  );

  /** 非流式发送（回退方案） */
  const sendMessageSync = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      setError(null);
      setLoading(true);

      const userMsg: DisplayMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const res = await api.sendMessage(text, sessionId || undefined);
        if (res.success && res.data) {
          if (!sessionId) setSessionId(res.data.sessionId);
          setMessages((prev) => [
            ...prev,
            {
              id: `agent-${Date.now()}`,
              role: "agent",
              content: res.data!.response,
              timestamp: new Date().toISOString(),
            },
          ]);
        } else {
          setError(res.error?.message || "发送失败");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "请求失败");
      }
      setLoading(false);
    },
    [sessionId, loading],
  );

  /** 停止流式生成 */
  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  /** 清除当前会话 */
  const clearChat = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setError(null);
    setTokenUsage(null);
  }, []);

  return {
    sessionId,
    messages,
    loading,
    error,
    tokenUsage,
    sendMessage,
    sendMessageSync,
    stopGeneration,
    loadSession,
    newSession,
    clearChat,
  };
}
