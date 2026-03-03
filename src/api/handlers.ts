/**
 * API 路由处理器
 *
 * 定义所有 REST API 端点的处理逻辑。
 * 支持三层模式：占位符 → 直连模型 → ReAct 循环。
 *
 * 核心处理逻辑拆分到：
 * - handler-context.ts（提示词构建 + 记忆副作用）
 * - handler-process.ts（消息处理 + 流式事件）
 */

import type { Router } from "./router.js";
import type { SessionManager } from "./session.js";
import type { ApiDeps, SendMessageRequest, CreateSessionRequest } from "./types.js";
import {
  successResponse,
  notFoundError,
  badRequestError,
  internalError,
  paginatedResponse,
} from "./response.js";
import { loadRegisteredAgents, readPackageVersion } from "./handler-utils.js";
import {
  processMessage,
  createStreamEvents,
  createTreeStreamEvents,
  applyModelOverrides,
} from "./handler-process.js";
import { DEFAULT_AGENT_ID } from "./handler-context.js";

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
    const version = await readPackageVersion();
    ctx.respond(
      200,
      successResponse({
        status: "ok",
        version,
        uptime: process.uptime(),
      }),
    );
  });

  // ─── 会话管理 ──────────────────────────────────

  // 创建会话
  router.post("/api/sessions", async (ctx) => {
    const body = ctx.body as CreateSessionRequest | undefined;
    const agentId = body?.agentId || DEFAULT_AGENT_ID;
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

  // ─── Token 用量 ──────────────────────────────────

  // 获取会话 Token 用量
  router.get("/api/sessions/:sessionId/usage", async (ctx) => {
    const usage = sessionManager.getTokenUsage(ctx.params.sessionId);
    if (usage === null) {
      ctx.respond(404, notFoundError("会话"));
      return;
    }
    ctx.respond(200, successResponse(usage));
  });

  // ─── 模型 ──────────────────────────────────

  // 获取可用模型列表
  router.get("/api/models", async (ctx) => {
    if (!deps.providerRegistry || !deps.fullConfig) {
      ctx.respond(200, successResponse({ providers: [], defaultProvider: null }));
      return;
    }

    const providerNames = deps.providerRegistry.names();
    const providers = providerNames.map((name) => {
      const config = deps.fullConfig!.provider[name];
      return {
        name,
        type: config.type,
        defaultModel: config.defaultModel ?? null,
        models: config.models ?? [],
        isDefault: name === deps.defaultProvider,
      };
    });

    ctx.respond(
      200,
      successResponse({
        providers,
        defaultProvider: deps.defaultProvider,
      }),
    );
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
      const session = sessionManager.createSession(body.agentId || DEFAULT_AGENT_ID);
      sessionId = session.sessionId;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      ctx.respond(404, notFoundError("会话"));
      return;
    }

    // 记录用户消息
    sessionManager.addMessage(sessionId, "user", body.message);

    // 构建请求级覆盖的 deps（provider/model）
    const effectiveDeps = applyModelOverrides(deps, body.provider, body.model);

    // 流式响应
    if (body.stream) {
      const events = createStreamEvents(sessionId, body.message, effectiveDeps, sessionManager);
      ctx.respondSSE(events);
      return;
    }

    // 非流式
    try {
      const response = await processMessage(sessionId, body.message, sessionManager, effectiveDeps);
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
    const registered = await loadRegisteredAgents(deps.workspacePath);
    const coreAgent = {
      id: DEFAULT_AGENT_ID,
      name: "Main Agent",
      description: "默认系统 Agent",
      status: "active",
      skills: [] as readonly string[],
    };
    ctx.respond(200, successResponse([coreAgent, ...registered]));
  });

  // 获取 Agent 详情
  router.get("/api/agents/:agentId", async (ctx) => {
    if (ctx.params.agentId === DEFAULT_AGENT_ID) {
      ctx.respond(
        200,
        successResponse({
          id: DEFAULT_AGENT_ID,
          name: "Main Agent",
          description: "默认系统 Agent",
          status: "active",
          skills: [] as readonly string[],
        }),
      );
      return;
    }
    // 从 solution registry 查找
    const registered = await loadRegisteredAgents(deps.workspacePath);
    const agent = registered.find((a) => a.id === ctx.params.agentId);
    if (agent) {
      ctx.respond(200, successResponse(agent));
      return;
    }
    ctx.respond(404, notFoundError("Agent"));
  });

  // ─── 自我图式 / 技能 / 工具 ──────────────────────────────────

  // 获取自我图式数据
  router.get("/api/self-schema", async (ctx) => {
    if (!deps.schemaProvider) {
      ctx.respond(200, successResponse({ body: null, soul: null, hormones: null }));
      return;
    }
    const body = deps.schemaProvider.getBodySchema();
    const soul = deps.schemaProvider.getSoulSchema();
    const hormoneManager = deps.schemaProvider.getHormoneManager();
    const hormones = hormoneManager.getState();
    ctx.respond(200, successResponse({ body, soul, hormones }));
  });

  // 获取已注册技能列表
  router.get("/api/skills", async (ctx) => {
    if (!deps.skillRegistry) {
      ctx.respond(200, successResponse([]));
      return;
    }
    const skills = deps.skillRegistry.list().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      origin: s.origin,
      tags: s.tags,
      requiredTools: s.requiredTools,
    }));
    ctx.respond(200, successResponse(skills));
  });

  // 获取已注册工具列表
  router.get("/api/tools", async (ctx) => {
    if (!deps.toolRegistry) {
      ctx.respond(200, successResponse([]));
      return;
    }
    const tools = deps.toolRegistry.list().map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      tags: t.tags,
      entrypoint: t.entrypoint,
      timeout: t.timeout,
    }));
    ctx.respond(200, successResponse(tools));
  });
}
