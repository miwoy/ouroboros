/**
 * API 路由处理器
 *
 * 定义所有 REST API 端点的处理逻辑。
 */

import type { Router } from "./router.js";
import type { SessionManager } from "./session.js";
import type { ApiDeps, SendMessageRequest, CreateSessionRequest, SSEEvent } from "./types.js";
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
      const events = createStreamEvents(sessionId, body.message, deps);
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
  // 当前阶段返回 placeholder 响应
  // 完整实现需要集成 ReAct 循环 + Agent 执行器
  const responseText = `收到消息: "${message}"。Agent 处理功能将在完整集成后可用。`;

  sessionManager.addMessage(sessionId, "agent", responseText);

  deps.logger.info("api", `消息已处理: session=${sessionId}`);

  return {
    sessionId,
    response: responseText,
    formatted: formatAgentResponse(responseText, []),
  };
}

/**
 * 创建 SSE 流式事件
 */
async function* createStreamEvents(
  sessionId: string,
  message: string,
  _deps: ApiDeps,
): AsyncIterable<SSEEvent> {
  // 模拟流式输出
  yield { event: "thinking", data: JSON.stringify({ sessionId }) };

  const words = `收到消息: "${message}"。Agent 处理功能将在完整集成后可用。`.split("");

  for (const char of words) {
    yield { event: "text_delta", data: JSON.stringify({ text: char }) };
  }

  yield { event: "done", data: JSON.stringify({ sessionId, complete: true }) };
}
