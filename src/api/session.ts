/**
 * 会话管理
 *
 * 内存中维护聊天会话，管理消息历史。
 * 每个会话绑定一个 Agent，支持多轮对话。
 */

import { randomUUID } from "node:crypto";
import type { ChatMessage, SessionInfo } from "./types.js";
import type { ExecutionTree } from "../core/types.js";

/** 内部会话结构 */
interface Session {
  readonly sessionId: string;
  readonly agentId: string;
  readonly description: string;
  readonly messages: ChatMessage[];
  readonly createdAt: string;
  updatedAt: string;
  executionTree: ExecutionTree | null;
}

/**
 * 创建会话管理器
 */
export function createSessionManager() {
  const sessions = new Map<string, Session>();

  /**
   * 创建新会话
   */
  function createSession(agentId: string, description?: string): SessionInfo {
    const sessionId = randomUUID();
    const now = new Date().toISOString();

    const session: Session = {
      sessionId,
      agentId,
      description: description || `会话 ${sessionId.slice(0, 8)}`,
      messages: [],
      createdAt: now,
      updatedAt: now,
      executionTree: null,
    };

    sessions.set(sessionId, session);
    return toSessionInfo(session);
  }

  /**
   * 获取会话信息
   */
  function getSession(sessionId: string): SessionInfo | null {
    const session = sessions.get(sessionId);
    return session ? toSessionInfo(session) : null;
  }

  /**
   * 列出所有会话
   */
  function listSessions(): readonly SessionInfo[] {
    return Array.from(sessions.values()).map(toSessionInfo);
  }

  /**
   * 添加消息到会话
   */
  function addMessage(
    sessionId: string,
    role: ChatMessage["role"],
    content: string,
    metadata?: Record<string, unknown>,
  ): ChatMessage | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    const message: ChatMessage = {
      id: randomUUID(),
      sessionId,
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata,
    };

    session.messages.push(message);
    session.updatedAt = new Date().toISOString();

    return message;
  }

  /**
   * 获取会话消息历史
   */
  function getMessages(
    sessionId: string,
    page = 1,
    limit = 50,
  ): { messages: readonly ChatMessage[]; total: number } {
    const session = sessions.get(sessionId);
    if (!session) return { messages: [], total: 0 };

    const total = session.messages.length;
    const start = (page - 1) * limit;
    const messages = session.messages.slice(start, start + limit);

    return { messages, total };
  }

  /**
   * 设置/更新会话的执行树
   */
  function setExecutionTree(sessionId: string, tree: ExecutionTree): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;
    session.executionTree = tree;
    session.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * 获取会话的执行树
   */
  function getExecutionTree(sessionId: string): ExecutionTree | null {
    const session = sessions.get(sessionId);
    return session?.executionTree ?? null;
  }

  /**
   * 删除会话
   */
  function deleteSession(sessionId: string): boolean {
    return sessions.delete(sessionId);
  }

  return {
    createSession,
    getSession,
    listSessions,
    addMessage,
    getMessages,
    setExecutionTree,
    getExecutionTree,
    deleteSession,
  };
}

function toSessionInfo(session: Session): SessionInfo {
  return {
    sessionId: session.sessionId,
    agentId: session.agentId,
    description: session.description,
    messageCount: session.messages.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    hasExecutionTree: session.executionTree !== null,
  };
}

export type SessionManager = ReturnType<typeof createSessionManager>;
