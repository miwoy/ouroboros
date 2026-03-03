/**
 * API 路由处理器
 *
 * 定义所有 REST API 端点的处理逻辑。
 * 支持三层模式：占位符 → 直连模型 → ReAct 循环。
 */

import type { Router } from "./router.js";
import type { SessionManager } from "./session.js";
import type { ApiDeps, SendMessageRequest, CreateSessionRequest, SSEEvent } from "./types.js";
import type { TreeState, ReactStep, ExecutionTree, ReactLoopConfig } from "../core/types.js";
import type { Message } from "../model/types.js";
import type { CallModelFn } from "../tool/types.js";
import type { RenderedPrompt, PromptFileType } from "../prompt/types.js";
import { treeToJSON } from "../core/execution-tree.js";
import { runReactLoop } from "../core/loop.js";
import { createToolExecutor, type ToolExecutor } from "../tool/executor.js";
import { filterSafeTools } from "./safe-tools.js";
import { loadUserPromptFiles, searchBySemantic } from "../prompt/loader.js";
import { renderTemplate } from "../prompt/template.js";
import { assemblePrompt } from "../prompt/assembler.js";
import { DEFAULT_INSPECTOR_CONFIG } from "../inspector/inspector.js";
import {
  successResponse,
  notFoundError,
  badRequestError,
  internalError,
  paginatedResponse,
} from "./response.js";
import { formatAgentResponse } from "./formatter.js";
import { createEventQueue, loadRegisteredAgents, readPackageVersion } from "./handler-utils.js";

/** 默认 Agent ID */
const DEFAULT_AGENT_ID = "agent:main";

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
      const config = deps.fullConfig!.model.providers[name];
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

/** 直连模式兜底提示词（schemaProvider 不可用时） */
const FALLBACK_SYSTEM_PROMPT =
  "你是 Ouroboros，一个智能助手。请用简洁、有帮助的方式回答用户的问题。";

/**
 * 从会话历史构建模型消息列表（直连模式用）
 */
async function buildModelMessages(
  sessionManager: SessionManager,
  sessionId: string,
  deps: ApiDeps,
  message?: string,
): Promise<readonly Message[]> {
  const systemPrompt = (await buildContextPrompt(deps, message)) || FALLBACK_SYSTEM_PROMPT;
  const { messages } = sessionManager.getMessages(sessionId, 1, 200);
  const modelMessages: Message[] = [{ role: "system", content: systemPrompt }];
  for (const m of messages) {
    modelMessages.push({
      role: m.role === "agent" ? "assistant" : (m.role as "user" | "system"),
      content: m.content,
    });
  }
  return modelMessages;
}

/**
 * 构建用户级上下文提示词（self + tool + skill + agent + memory）
 * core.md 由 runReactLoop 内部加载，这里只拼装用户级部分。
 *
 * @param deps - API 依赖
 * @param message - 用户消息（用于短期记忆语义搜索）
 */
async function buildContextPrompt(deps: ApiDeps, message?: string): Promise<string> {
  const promptFiles = await loadUserPromptFiles(deps.workspacePath);
  const parts: RenderedPrompt[] = [];

  // self.md — 需要 schemaProvider 渲染模板变量
  if (deps.schemaProvider) {
    const selfFile = promptFiles.get("self");
    if (selfFile) {
      const vars = deps.schemaProvider.getVariables();
      const rendered = renderTemplate(selfFile.content, vars as unknown as Record<string, string>);
      parts.push({ fileType: "self", content: rendered });
    }
  }

  // tool.md, skill.md, agent.md — 无模板变量，无条件加载
  for (const ft of ["tool", "skill", "agent"] as const) {
    const file = promptFiles.get(ft as PromptFileType);
    if (file) {
      parts.push({ fileType: ft as PromptFileType, content: file.content });
    }
  }

  // memory.md — 长期记忆
  const memoryFile = promptFiles.get("memory");
  if (memoryFile) {
    parts.push({ fileType: "memory", content: memoryFile.content });
  }

  // 追加 hot memory（内存中的会话记忆）
  if (deps.memoryManager) {
    const hotText = deps.memoryManager.hot.toPromptText();
    if (hotText) {
      parts.push({ fileType: "memory", content: hotText });
    }
  }

  // 短期记忆 — 基于用户消息语义搜索相关记忆片段
  if (message) {
    try {
      const memories = await searchBySemantic(deps.workspacePath, message, {
        limit: 3,
        threshold: 0.3,
      });
      for (const mem of memories) {
        if (mem.content) {
          parts.push({ fileType: "memory", content: `[记忆片段] ${mem.fileName}\n${mem.content}` });
        }
      }
    } catch {
      // 语义搜索失败不影响主流程
    }
  }

  if (parts.length === 0) return "";

  const assembled = assemblePrompt(parts);
  return assembled.systemPrompt;
}

/** 将对话记录写入记忆系统（fire-and-forget） */
function writebackMemory(deps: ApiDeps, message: string, answer: string): void {
  if (!deps.memoryManager) return;

  const entry = {
    timestamp: new Date().toISOString(),
    type: "conversation" as const,
    content: `用户: ${message}\n助手: ${answer.slice(0, 500)}`,
  };

  deps.memoryManager.hot.add(entry);
  deps.memoryManager.shortTerm.append(entry).catch(() => {});
}

/** 触发反思（fire-and-forget） */
function triggerReflection(
  deps: ApiDeps,
  message: string,
  result: {
    answer: string;
    executionTree: ExecutionTree;
    steps: readonly ReactStep[];
    totalDuration: number;
    stopReason: string;
  },
): void {
  if (!deps.reflector || result.stopReason !== "completed") return;

  deps.reflector
    .reflect({
      taskDescription: message,
      agentId: DEFAULT_AGENT_ID,
      executionTree: result.executionTree,
      steps: [...result.steps],
      result: result.answer,
      totalDuration: result.totalDuration,
      success: true,
      errors: [],
    })
    .catch((err: unknown) => {
      deps.logger.warn("api", "反思失败", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/**
 * 处理非流式消息（三层逻辑）
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
  // 第一层：无模型提供商 → 占位符
  if (!deps.providerRegistry || !deps.defaultProvider) {
    const responseText = `收到消息: "${message}"。请在 config.json 中配置模型提供商以启用 AI 对话。`;
    sessionManager.addMessage(sessionId, "agent", responseText);
    return {
      sessionId,
      response: responseText,
      formatted: formatAgentResponse(responseText, []),
    };
  }

  // 第三层：有 provider + toolRegistry → ReAct 循环
  const callModelFn = getCallModelFn(deps);
  if (callModelFn && deps.toolRegistry) {
    const { safeTools, toolExecutor, reactConfig } = prepareReactDeps(deps, callModelFn);

    const contextPrompt = await buildContextPrompt(deps, message);
    const result = await runReactLoop(message, contextPrompt, safeTools, reactConfig, {
      callModel: callModelFn,
      toolExecutor,
      toolRegistry: deps.toolRegistry,
      logger: deps.logger,
      workspacePath: deps.workspacePath,
    });

    sessionManager.setExecutionTree(sessionId, result.executionTree);
    sessionManager.addMessage(sessionId, "agent", result.answer, buildReactMetadata(result));
    if (deps.fullConfig?.agents?.trackTokenUsage !== false) {
      sessionManager.addTokenUsage(sessionId, result.totalUsage);
    }
    writebackMemory(deps, message, result.answer);
    triggerReflection(deps, message, result);

    return {
      sessionId,
      response: result.answer,
      formatted: formatAgentResponse(result.answer, [...result.steps]),
    };
  }

  // 第二层：有 provider 无 toolRegistry → 直连模型
  const provider = await deps.providerRegistry.get(deps.defaultProvider);
  const messages = await buildModelMessages(sessionManager, sessionId, deps, message);
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
 * 创建 SSE 流式事件（三层逻辑）
 */
async function* createStreamEvents(
  sessionId: string,
  message: string,
  deps: ApiDeps,
  sessionManager: SessionManager,
): AsyncIterable<SSEEvent> {
  try {
    // 第一层：无模型提供商 → 占位符
    if (!deps.providerRegistry || !deps.defaultProvider) {
      yield { event: "thinking", data: JSON.stringify({ sessionId }) };
      const text = `收到消息: "${message}"。请在 config.json 中配置模型提供商以启用 AI 对话。`;
      yield { event: "text_delta", data: JSON.stringify({ text }) };
      yield { event: "done", data: JSON.stringify({ sessionId, complete: true }) };
      return;
    }

    // 第三层：有 provider + toolRegistry → ReAct SSE
    const callModelFn = getCallModelFn(deps);
    if (callModelFn && deps.toolRegistry) {
      yield* createReactStreamEvents(sessionId, message, deps, sessionManager, callModelFn);
      return;
    }

    // 第二层：有 provider 无 toolRegistry → 直连流式
    yield* createDirectStreamEvents(sessionId, message, deps, sessionManager);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "未知错误";
    deps.logger.error("api", `SSE 流异常: ${errMsg}`);
    yield { event: "error", data: JSON.stringify({ message: errMsg }) };
  }
}

/**
 * ReAct 循环 SSE 流式事件
 */
async function* createReactStreamEvents(
  sessionId: string,
  message: string,
  deps: ApiDeps,
  sessionManager: SessionManager,
  callModelFn: CallModelFn,
): AsyncIterable<SSEEvent> {
  yield { event: "thinking", data: JSON.stringify({ sessionId }) };

  const { pushEvent, waitForEvent, drainQueue } = createEventQueue();
  const { safeTools, toolExecutor, reactConfig } = prepareReactDeps(deps, callModelFn);

  // 刷新自我图式（每次 SSE 请求前获取最新状态）
  if (deps.schemaProvider) {
    await deps.schemaProvider.refresh();
  }

  const contextPrompt = await buildContextPrompt(deps, message);
  const loopStartTime = Date.now();

  // 启动 ReAct 循环（后台执行）
  const reactPromise = runReactLoop(message, contextPrompt, safeTools, reactConfig, {
    callModel: callModelFn,
    toolExecutor,
    toolRegistry: deps.toolRegistry!,
    logger: deps.logger,
    workspacePath: deps.workspacePath,
    onStep: (step: ReactStep, tree: ExecutionTree) => {
      pushEvent({
        event: "react_step",
        data: JSON.stringify({ stepIndex: step.stepIndex, thought: step.thought }),
      });

      for (const tc of step.toolCalls) {
        pushEvent({
          event: "tool_call",
          data: JSON.stringify({ toolCallId: tc.requestId, toolName: tc.toolId, input: tc.input }),
        });
        pushEvent({
          event: "tool_result",
          data: JSON.stringify({
            toolCallId: tc.requestId,
            output: tc.output,
            success: tc.success,
            error: tc.error,
          }),
        });
      }

      sessionManager.setExecutionTree(sessionId, tree);

      // WS 实时推送（如有 WS 服务器）
      if (deps.wsServer) {
        deps.wsServer.sendToSession(sessionId, "react_step", {
          stepIndex: step.stepIndex,
          thought: step.thought,
        });
        for (const tc of step.toolCalls) {
          deps.wsServer.sendToSession(sessionId, "tool_call", {
            toolCallId: tc.requestId,
            toolName: tc.toolId,
            input: tc.input,
          });
          deps.wsServer.sendToSession(sessionId, "tool_result", {
            toolCallId: tc.requestId,
            output: tc.output,
            success: tc.success,
            error: tc.error,
          });
        }
        deps.wsServer.sendToSession(sessionId, "tree_update", tree);
      }

      // Inspector 检查
      if (deps.inspector && deps.schemaProvider) {
        const inspectResult = deps.inspector.inspect({
          tree,
          bodySchema: deps.schemaProvider.getBodySchema(),
          startTime: loopStartTime,
          config: deps.fullConfig?.inspector ?? DEFAULT_INSPECTOR_CONFIG,
        });
        if (inspectResult.hasAnomalies) {
          deps.logger.warn("api", "Inspector 检测到异常", {
            reports: inspectResult.reports.length,
          });
        }
      }
    },
  })
    .then((result) => {
      pushEvent({ event: "text_delta", data: JSON.stringify({ text: result.answer }) });
      sessionManager.setExecutionTree(sessionId, result.executionTree);
      sessionManager.addMessage(sessionId, "agent", result.answer, buildReactMetadata(result));
      if (deps.fullConfig?.agents?.trackTokenUsage !== false) {
        sessionManager.addTokenUsage(sessionId, result.totalUsage);
      }
      // WS 完成推送
      if (deps.wsServer) {
        deps.wsServer.sendToSession(sessionId, "tree_update", result.executionTree);
        deps.wsServer.sendToSession(sessionId, "done", {
          sessionId,
          stopReason: result.stopReason,
          totalUsage: result.totalUsage,
        });
      }
      writebackMemory(deps, message, result.answer);
      triggerReflection(deps, message, result);
      pushEvent({
        event: "done",
        data: JSON.stringify({
          sessionId,
          complete: true,
          stopReason: result.stopReason,
          totalUsage: result.totalUsage,
        }),
      });
      pushEvent(null);
    })
    .catch((err: Error) => {
      deps.logger.error("api", `ReAct 循环失败: ${err.message}`);
      pushEvent({ event: "error", data: JSON.stringify({ message: err.message }) });
      pushEvent(null);
    });

  yield* drainQueue(waitForEvent);
  await reactPromise;
}

/**
 * 直连模型流式 SSE（向后兼容，无 ReAct 循环时使用）
 */
async function* createDirectStreamEvents(
  sessionId: string,
  message: string,
  deps: ApiDeps,
  sessionManager: SessionManager,
): AsyncIterable<SSEEvent> {
  yield { event: "thinking", data: JSON.stringify({ sessionId }) };

  const provider = await deps.providerRegistry!.get(deps.defaultProvider!);
  const messages = await buildModelMessages(sessionManager, sessionId, deps, message);
  const { pushEvent, waitForEvent, drainQueue } = createEventQueue();

  let fullContent = "";

  const streamPromise = provider
    .stream({ messages }, (event) => {
      if (event.type === "text_delta") {
        fullContent += event.text;
        pushEvent({ event: "text_delta", data: JSON.stringify({ text: event.text }) });
      }
    })
    .then(() => {
      sessionManager.addMessage(sessionId, "agent", fullContent);
      pushEvent({ event: "done", data: JSON.stringify({ sessionId, complete: true }) });
      pushEvent(null);
    })
    .catch((err: Error) => {
      deps.logger.error("api", `流式调用失败: ${err.message}`);
      pushEvent({ event: "error", data: JSON.stringify({ message: err.message }) });
      pushEvent(null);
    });

  yield* drainQueue(waitForEvent);
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

// ─── 共享辅助函数 ──────────────────────────────────────────────────

/** 构建 ReAct 结果的消息元数据 */
function buildReactMetadata(result: {
  steps: readonly ReactStep[];
  totalUsage: unknown;
  stopReason: string;
}): Record<string, unknown> {
  return {
    thought: result.steps
      .map((s) => s.thought)
      .filter(Boolean)
      .join("\n"),
    toolCalls: result.steps.flatMap((s) =>
      s.toolCalls.map((tc) => ({
        toolId: tc.toolId,
        input: tc.input,
        output: tc.output,
        success: tc.success,
        error: tc.error,
        duration: tc.duration,
      })),
    ),
    totalUsage: result.totalUsage,
    stopReason: result.stopReason,
  };
}

/**
 * 构建请求级别的 deps 覆盖（provider/model）
 * 不修改原始 deps，返回新的浅拷贝
 */
function applyModelOverrides(deps: ApiDeps, provider?: string, model?: string): ApiDeps {
  if (!provider && !model) return deps;

  let result: ApiDeps = {
    ...deps,
    defaultProvider: provider ?? deps.defaultProvider,
  };

  // 如果指定了 model，包装 callModel 注入 model 参数
  if (model && deps.callModel) {
    const originalCallModel = deps.callModel;
    result = {
      ...result,
      callModel: async (request, options) => originalCallModel({ ...request, model }, options),
    };
  }

  return result;
}

/** 从 provider 获取 callModel 函数 */
function getCallModelFn(deps: ApiDeps): CallModelFn | null {
  if (!deps.providerRegistry || !deps.defaultProvider) return null;
  if (deps.callModel) return deps.callModel;
  const registry = deps.providerRegistry;
  const defaultProvider = deps.defaultProvider;
  return async (request, options) => {
    const provider = await registry.get(defaultProvider);
    return provider.complete(request, options?.signal);
  };
}

/** 准备 ReAct 循环共享依赖（工具 + 配置） */
function prepareReactDeps(
  deps: ApiDeps,
  callModelFn: CallModelFn,
): {
  safeTools: readonly import("../tool/types.js").OuroborosTool[];
  toolExecutor: ToolExecutor;
  reactConfig: ReactLoopConfig;
} {
  const safeTools = filterSafeTools(deps.toolRegistry!.list());
  const toolExecutor = createToolExecutor(deps.toolRegistry!, {
    workspacePath: deps.workspacePath,
    callModel: callModelFn,
    httpFetch: deps.httpFetch,
    config: deps.fullConfig ? { webSearch: deps.fullConfig.webSearch } : undefined,
  });
  const reactConfig: ReactLoopConfig = {
    maxIterations: deps.reactConfig?.maxIterations ?? 20,
    stepTimeout: deps.reactConfig?.stepTimeout ?? 60000,
    parallelToolCalls: deps.reactConfig?.parallelToolCalls ?? true,
    compressionThreshold: deps.reactConfig?.compressionThreshold ?? 10,
    agentId: DEFAULT_AGENT_ID,
  };
  return { safeTools, toolExecutor, reactConfig };
}
