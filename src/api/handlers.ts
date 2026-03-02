/**
 * API 路由处理器
 *
 * 定义所有 REST API 端点的处理逻辑。
 */

import type { Router } from "./router.js";
import type { SessionManager } from "./session.js";
import type { ApiDeps, SendMessageRequest, CreateSessionRequest, SSEEvent } from "./types.js";
import type { TreeState } from "../core/types.js";
import type { Message } from "../model/types.js";
import { treeToJSON } from "../core/execution-tree.js";
import {
  successResponse,
  notFoundError,
  badRequestError,
  internalError,
  paginatedResponse,
} from "./response.js";
import { formatAgentResponse } from "./formatter.js";

/**
 * 注册所有路由处理器
 */
export function registerHandlers(
  router: Router,
  sessionManager: SessionManager,
  deps: ApiDeps,
): void {
  // ─── 健康检查 ──────────────────────────────────
  router.get("/api/health", async (ctx) => {
    ctx.respond(
      200,
      successResponse({
        status: "ok",
        version: "0.12.0",
        uptime: process.uptime(),
      }),
    );
  });

  // ─── 会话管理 ──────────────────────────────────

  // 创建会话
  router.post("/api/sessions", async (ctx) => {
    const body = ctx.body as CreateSessionRequest | undefined;
    const agentId = body?.agentId || "agent:core";
    const description = body?.description;

    const session = sessionManager.createSession(agentId, description);
    deps.logger.info("api", `会话已创建: ${session.sessionId}`);
    ctx.respond(201, successResponse(session));
  });

  // 列出会话
  router.get("/api/sessions", async (ctx) => {
    const sessions = sessionManager.listSessions();
    ctx.respond(200, successResponse(sessions));
  });

  // 获取会话详情
  router.get("/api/sessions/:sessionId", async (ctx) => {
    const session = sessionManager.getSession(ctx.params.sessionId);
    if (!session) {
      ctx.respond(404, notFoundError("会话"));
      return;
    }
    ctx.respond(200, successResponse(session));
  });

  // 删除会话
  router.post("/api/sessions/:sessionId/delete", async (ctx) => {
    const deleted = sessionManager.deleteSession(ctx.params.sessionId);
    if (!deleted) {
      ctx.respond(404, notFoundError("会话"));
      return;
    }
    ctx.respond(200, successResponse({ deleted: true }));
  });

  // ─── 执行树 ──────────────────────────────────

  // 获取执行树快照
  router.get("/api/sessions/:sessionId/execution-tree", async (ctx) => {
    const session = sessionManager.getSession(ctx.params.sessionId);
    if (!session) {
      ctx.respond(404, notFoundError("会话"));
      return;
    }
    const tree = sessionManager.getExecutionTree(ctx.params.sessionId);
    ctx.respond(200, successResponse(tree));
  });

  // 执行树 SSE 实时更新
  router.get("/api/sessions/:sessionId/execution-tree/stream", async (ctx) => {
    const session = sessionManager.getSession(ctx.params.sessionId);
    if (!session) {
      ctx.respond(404, notFoundError("会话"));
      return;
    }
    const events = createTreeStreamEvents(ctx.params.sessionId, sessionManager);
    ctx.respondSSE(events);
  });

  // ─── 消息 ──────────────────────────────────

  // 发送消息
  router.post("/api/chat/message", async (ctx) => {
    const body = ctx.body as SendMessageRequest | undefined;
    if (!body?.message) {
      ctx.respond(400, badRequestError("message 字段为必填"));
      return;
    }

    // 获取或创建会话
    let sessionId = body.sessionId;
    if (!sessionId) {
      const session = sessionManager.createSession(body.agentId || "agent:core");
      sessionId = session.sessionId;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      ctx.respond(404, notFoundError("会话"));
      return;
    }

    // 记录用户消息
    sessionManager.addMessage(sessionId, "user", body.message);

    // 流式响应
    if (body.stream) {
      const events = createStreamEvents(sessionId, body.message, deps, sessionManager);
      ctx.respondSSE(events);
      return;
    }

    // 非流式：模拟 Agent 处理（实际应集成 ReAct 循环）
    try {
      const response = await processMessage(sessionId, body.message, sessionManager, deps);
      ctx.respond(200, successResponse(response));
    } catch (err) {
      deps.logger.error("api", "消息处理失败", { error: err });
      ctx.respond(500, internalError("消息处理失败"));
    }
  });

  // 获取消息历史
  router.get("/api/chat/messages/:sessionId", async (ctx) => {
    const page = parseInt(ctx.query.page || "1", 10);
    const limit = parseInt(ctx.query.limit || "50", 10);

    const { messages, total } = sessionManager.getMessages(ctx.params.sessionId, page, limit);
    if (total === 0 && !sessionManager.getSession(ctx.params.sessionId)) {
      ctx.respond(404, notFoundError("会话"));
      return;
    }

    ctx.respond(200, paginatedResponse(messages, total, page, limit));
  });

  // ─── Agent 信息 ──────────────────────────────────

  // 列出 Agent
  router.get("/api/agents", async (ctx) => {
    // 返回系统默认 Agent（实际应从 SolutionRegistry 获取）
    const agents = [
      {
        id: "agent:core",
        name: "Core Agent",
        description: "默认系统 Agent",
        status: "active",
        skills: [],
      },
    ];
    ctx.respond(200, successResponse(agents));
  });

  // 获取 Agent 详情
  router.get("/api/agents/:agentId", async (ctx) => {
    if (ctx.params.agentId === "agent:core") {
      ctx.respond(
        200,
        successResponse({
          id: "agent:core",
          name: "Core Agent",
          description: "默认系统 Agent",
          status: "active",
          skills: [],
        }),
      );
      return;
    }
    ctx.respond(404, notFoundError("Agent"));
  });
}

/** 系统提示词 */
const CHAT_SYSTEM_PROMPT = "你是 Ouroboros，一个智能助手。请用简洁、有帮助的方式回答用户的问题。";

/**
 * 从会话历史构建模型消息列表
 */
function buildModelMessages(sessionManager: SessionManager, sessionId: string): readonly Message[] {
  const { messages } = sessionManager.getMessages(sessionId, 1, 200);
  const modelMessages: Message[] = [{ role: "system", content: CHAT_SYSTEM_PROMPT }];
  for (const m of messages) {
    modelMessages.push({
      role: m.role === "agent" ? "assistant" : (m.role as "user" | "system"),
      content: m.content,
    });
  }
  return modelMessages;
}

/**
 * 处理非流式消息
 */
async function processMessage(
  sessionId: string,
  message: string,
  sessionManager: SessionManager,
  deps: ApiDeps,
): Promise<{
  readonly sessionId: string;
  readonly response: string;
  readonly formatted: string;
}> {
  // 无模型提供商时回退到占位符
  if (!deps.providerRegistry || !deps.defaultProvider) {
    const responseText = `收到消息: "${message}"。请在 config.json 中配置模型提供商以启用 AI 对话。`;
    sessionManager.addMessage(sessionId, "agent", responseText);
    return {
      sessionId,
      response: responseText,
      formatted: formatAgentResponse(responseText, []),
    };
  }

  const provider = deps.providerRegistry.get(deps.defaultProvider);
  const messages = buildModelMessages(sessionManager, sessionId);
  const response = await provider.complete({ messages });

  sessionManager.addMessage(sessionId, "agent", response.content);
  deps.logger.info("api", `消息已处理: session=${sessionId}`);

  return {
    sessionId,
    response: response.content,
    formatted: formatAgentResponse(response.content, []),
  };
}

/**
 * 创建 SSE 流式事件
 *
 * 有模型提供商时调用真实模型流式输出，否则回退到占位符。
 * 使用事件队列桥接回调式 stream API → async generator。
 */
async function* createStreamEvents(
  sessionId: string,
  message: string,
  deps: ApiDeps,
  sessionManager: SessionManager,
): AsyncIterable<SSEEvent> {
  // 无模型提供商时回退到占位符
  if (!deps.providerRegistry || !deps.defaultProvider) {
    yield { event: "thinking", data: JSON.stringify({ sessionId }) };
    const text = `收到消息: "${message}"。请在 config.json 中配置模型提供商以启用 AI 对话。`;
    yield { event: "text_delta", data: JSON.stringify({ text }) };
    yield { event: "done", data: JSON.stringify({ sessionId, complete: true }) };
    return;
  }

  yield { event: "thinking", data: JSON.stringify({ sessionId }) };

  const provider = deps.providerRegistry.get(deps.defaultProvider);
  const messages = buildModelMessages(sessionManager, sessionId);

  // 事件队列：桥接回调式 stream → async generator
  const eventQueue: Array<SSEEvent | null> = [];
  let notifier: (() => void) | null = null;

  function pushEvent(event: SSEEvent | null): void {
    eventQueue.push(event);
    if (notifier) {
      notifier();
      notifier = null;
    }
  }

  function waitForEvent(): Promise<void> {
    return new Promise((resolve) => {
      notifier = resolve;
    });
  }

  let fullContent = "";

  // 启动模型流式调用（后台执行）
  const streamPromise = provider
    .stream({ messages }, (event) => {
      if (event.type === "text_delta") {
        fullContent += event.text;
        pushEvent({
          event: "text_delta",
          data: JSON.stringify({ text: event.text }),
        });
      }
    })
    .then(() => {
      sessionManager.addMessage(sessionId, "agent", fullContent);
      pushEvent({
        event: "done",
        data: JSON.stringify({ sessionId, complete: true }),
      });
      pushEvent(null); // 终止信号
    })
    .catch((err: Error) => {
      deps.logger.error("api", `流式调用失败: ${err.message}`);
      pushEvent({
        event: "error",
        data: JSON.stringify({ message: err.message }),
      });
      pushEvent(null);
    });

  // 从队列消费事件
  while (true) {
    while (eventQueue.length === 0) {
      await waitForEvent();
    }
    const event = eventQueue.shift()!;
    if (event === null) break;
    yield event;
  }

  await streamPromise;
}

/** 执行树终态集合 */
const TREE_TERMINAL_STATES: ReadonlySet<string> = new Set(["completed", "failed", "cancelled"]);

/**
 * 创建执行树 SSE 流式事件
 *
 * 500ms 轮询 SessionManager，JSON 变化时推送 tree_update 事件。
 * 树进入终态时发送 done 并关闭。60s 无变化自动关闭。
 */
async function* createTreeStreamEvents(
  sessionId: string,
  sessionManager: SessionManager,
): AsyncIterable<SSEEvent> {
  const POLL_INTERVAL = 500;
  const IDLE_TIMEOUT = 60_000;
  let lastJson = "";
  let idleStart = Date.now();

  while (true) {
    const tree = sessionManager.getExecutionTree(sessionId);
    const currentJson = tree ? treeToJSON(tree) : "";

    if (currentJson !== lastJson) {
      lastJson = currentJson;
      idleStart = Date.now();
      yield {
        event: "tree_update",
        data: currentJson || JSON.stringify(null),
      };

      // 树进入终态，发送 done 并关闭
      if (tree && TREE_TERMINAL_STATES.has(tree.state as TreeState)) {
        yield { event: "done", data: JSON.stringify({ sessionId, complete: true }) };
        return;
      }
    }

    // 60s 无变化自动关闭
    if (Date.now() - idleStart >= IDLE_TIMEOUT) {
      yield { event: "done", data: JSON.stringify({ sessionId, reason: "idle_timeout" }) };
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}
