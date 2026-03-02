/**
 * 会话管理
 *
 * 内存中维护聊天会话，管理消息历史。
 * 支持持久化到 workspace/sessions/*.json，重启后恢复。
 * 每个会话绑定一个 Agent，支持多轮对话。
 */

import { randomUUID } from "node:crypto";
import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage, SessionInfo, TokenUsageSummary } from "./types.js";
import type { ExecutionTree } from "../core/types.js";
import { treeToJSON, treeFromJSON } from "../core/execution-tree.js";

/** 内部会话结构 */
interface Session {
  readonly sessionId: string;
  readonly agentId: string;
  readonly description: string;
  readonly messages: ChatMessage[];
  readonly createdAt: string;
  updatedAt: string;
  executionTree: ExecutionTree | null;
  tokenUsage: TokenUsageSummary;
}

/** 持久化文件格式 */
interface PersistedSession {
  readonly sessionId: string;
  readonly agentId: string;
  readonly description: string;
  readonly messages: readonly ChatMessage[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly executionTree?: unknown;
  readonly tokenUsage?: TokenUsageSummary;
}

/** 空 Token 用量 */
function emptyTokenUsage(): TokenUsageSummary {
  return { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, messageCount: 0 };
}

/** 防抖定时器集合 */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 防抖间隔（毫秒） */
const DEBOUNCE_MS = 500;

/**
 * 创建会话管理器
 *
 * @param workspacePath - 可选 workspace 路径，提供后启用持久化
 */
export function createSessionManager(workspacePath?: string) {
  const sessions = new Map<string, Session>();

  /** 获取 sessions 目录路径 */
  function getSessionsDir(): string | null {
    return workspacePath ? join(workspacePath, "sessions") : null;
  }

  /** 获取会话文件路径 */
  function getSessionFilePath(sessionId: string): string | null {
    const dir = getSessionsDir();
    return dir ? join(dir, `${sessionId}.json`) : null;
  }

  /**
   * 持久化会话到磁盘（fire-and-forget）
   */
  function persistSession(session: Session): void {
    const filePath = getSessionFilePath(session.sessionId);
    if (!filePath) return;

    const data: PersistedSession = {
      sessionId: session.sessionId,
      agentId: session.agentId,
      description: session.description,
      messages: session.messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      executionTree: session.executionTree
        ? JSON.parse(treeToJSON(session.executionTree))
        : undefined,
      tokenUsage: session.tokenUsage.totalTokens > 0 ? session.tokenUsage : undefined,
    };

    writeFile(filePath, JSON.stringify(data, null, 2), "utf-8").catch(() => {
      // 写盘失败静默处理，不影响内存中的会话
    });
  }

  /**
   * 防抖持久化（500ms 内多次调用只写最后一次）
   */
  function debouncedPersist(session: Session): void {
    const existing = debounceTimers.get(session.sessionId);
    if (existing) clearTimeout(existing);

    debounceTimers.set(
      session.sessionId,
      setTimeout(() => {
        debounceTimers.delete(session.sessionId);
        persistSession(session);
      }, DEBOUNCE_MS),
    );
  }

  /**
   * 删除持久化文件
   */
  function deletePersistedSession(sessionId: string): void {
    const filePath = getSessionFilePath(sessionId);
    if (!filePath) return;

    unlink(filePath).catch(() => {
      // 文件不存在时忽略
    });
  }

  /**
   * 初始化：从磁盘加载已持久化的会话
   */
  async function init(): Promise<void> {
    const dir = getSessionsDir();
    if (!dir) return;

    // 确保 sessions 目录存在
    await mkdir(dir, { recursive: true });

    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      try {
        const raw = await readFile(join(dir, file), "utf-8");
        const data = JSON.parse(raw) as PersistedSession;

        // 校验必要字段
        if (!data.sessionId || !data.agentId || !Array.isArray(data.messages)) continue;

        // 恢复执行树
        let executionTree: ExecutionTree | null = null;
        if (data.executionTree) {
          try {
            executionTree = treeFromJSON(JSON.stringify(data.executionTree));
          } catch {
            // 执行树反序列化失败，忽略
          }
        }

        const session: Session = {
          sessionId: data.sessionId,
          agentId: data.agentId,
          description: data.description || `会话 ${data.sessionId.slice(0, 8)}`,
          messages: [...data.messages],
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          executionTree,
          tokenUsage: data.tokenUsage ?? emptyTokenUsage(),
        };

        sessions.set(session.sessionId, session);
      } catch {
        // 损坏的文件跳过
      }
    }
  }

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
      tokenUsage: emptyTokenUsage(),
    };

    sessions.set(sessionId, session);
    persistSession(session);
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
    debouncedPersist(session);

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
    debouncedPersist(session);
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
   * 累加 Token 用量
   */
  function addTokenUsage(
    sessionId: string,
    usage: { promptTokens?: number; completionTokens?: number },
  ): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;

    const prompt = usage.promptTokens ?? 0;
    const completion = usage.completionTokens ?? 0;
    session.tokenUsage = {
      totalPromptTokens: session.tokenUsage.totalPromptTokens + prompt,
      totalCompletionTokens: session.tokenUsage.totalCompletionTokens + completion,
      totalTokens: session.tokenUsage.totalTokens + prompt + completion,
      messageCount: session.tokenUsage.messageCount + 1,
    };
    debouncedPersist(session);
    return true;
  }

  /**
   * 获取 Token 用量摘要
   */
  function getTokenUsage(sessionId: string): TokenUsageSummary | null {
    const session = sessions.get(sessionId);
    return session ? session.tokenUsage : null;
  }

  /**
   * 删除会话
   */
  function deleteSession(sessionId: string): boolean {
    const deleted = sessions.delete(sessionId);
    if (deleted) {
      // 清除防抖定时器
      const timer = debounceTimers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(sessionId);
      }
      deletePersistedSession(sessionId);
    }
    return deleted;
  }

  return {
    init,
    createSession,
    getSession,
    listSessions,
    addMessage,
    getMessages,
    setExecutionTree,
    getExecutionTree,
    addTokenUsage,
    getTokenUsage,
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
    tokenUsage: session.tokenUsage,
  };
}

export type SessionManager = ReturnType<typeof createSessionManager>;
