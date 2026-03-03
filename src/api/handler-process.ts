/**
 * 消息处理 + 流式事件生成
 *
 * 从 handlers.ts 抽取的核心消息处理逻辑：
 * - processMessage（非流式三层处理）
 * - createStreamEvents / createReactStreamEvents / createDirectStreamEvents（SSE 流式）
 * - createTreeStreamEvents（执行树实时推送）
 * - 共享辅助函数
 */

import type { SessionManager } from "./session.js";
import type { ApiDeps, SSEEvent } from "./types.js";
import type { TreeState, ReactStep, ExecutionTree, ReactLoopConfig } from "../core/types.js";
import type { CallModelFn, OuroborosTool } from "../tool/types.js";
import type { ToolExecutor } from "../tool/executor.js";
import { treeToJSON } from "../core/execution-tree.js";
import { runReactLoop } from "../core/loop.js";
import { createToolExecutor } from "../tool/executor.js";
import { filterSafeTools } from "./safe-tools.js";
import { DEFAULT_INSPECTOR_CONFIG } from "../inspector/inspector.js";
import { formatAgentResponse } from "./formatter.js";
import { createEventQueue } from "./handler-utils.js";
import {
  DEFAULT_AGENT_ID,
  buildModelMessages,
  buildContextPrompt,
  writebackMemory,
  triggerReflection,
} from "./handler-context.js";

/**
 * 处理非流式消息（三层逻辑）
 */
export async function processMessage(
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
    if (deps.fullConfig?.agents?.default?.trackTokenUsage !== false) {
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
export async function* createStreamEvents(
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
          config: deps.fullConfig?.system.inspector ?? DEFAULT_INSPECTOR_CONFIG,
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
      if (deps.fullConfig?.agents?.default?.trackTokenUsage !== false) {
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
export async function* createTreeStreamEvents(
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
export function applyModelOverrides(deps: ApiDeps, provider?: string, model?: string): ApiDeps {
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
  safeTools: readonly OuroborosTool[];
  toolExecutor: ToolExecutor;
  reactConfig: ReactLoopConfig;
} {
  const safeTools = filterSafeTools(deps.toolRegistry!.list());
  const toolExecutor = createToolExecutor(deps.toolRegistry!, {
    workspacePath: deps.workspacePath,
    callModel: callModelFn,
    httpFetch: deps.httpFetch,
    config: deps.fullConfig ? { webSearch: deps.fullConfig.tools.web.search } : undefined,
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
