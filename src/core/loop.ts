/**
 * ReAct 核心循环实现
 *
 * 执行流程：
 * 1. 创建执行树（root 节点 state=working）
 * 2. 构建初始消息列表
 * 3. 循环：callModel → 解析响应 → 执行工具 → 更新状态
 * 4. 达到终止条件时返回 ReactResult
 *
 * 支持并行工具调用、上下文压缩、死循环检测。
 */

import type { Message, ModelResponse, ToolCall, TokenUsage } from "../model/types.js";
import type { OuroborosTool, ToolCallRequest } from "../tool/types.js";
import { toModelToolDefinitions } from "../tool/converter.js";
import { loadCorePrompt } from "../prompt/store.js";
import {
  createExecutionTree,
  addNode,
  completeNode,
  failNode,
  updateTreeState,
} from "./execution-tree.js";
import { detectPossibleLoop, buildExceptionPrompt } from "./exception.js";
import { compressContext } from "./context-compression.js";
import {
  NodeType,
  TreeState,
  type ReactLoopConfig,
  type ReactDependencies,
  type ReactResult,
  type ReactStep,
  type ToolCallResult,
  type ExecutionTree,
} from "./types.js";

/**
 * 运行 ReAct 核心循环
 *
 * 内部自动加载 core.md 作为核心系统提示词，调用方只需传入用户级提示词（self/agent/skill/tool/memory）。
 * 最终的 system 消息 = core.md + "---" + contextPrompt。
 *
 * @param task - 用户任务描述
 * @param contextPrompt - 用户级提示词（self + agent + skill + tool + memory 拼装结果，可为空字符串）
 * @param tools - 可用工具列表
 * @param config - ReAct 配置
 * @param deps - 依赖注入
 * @returns ReAct 循环结果
 */
export async function runReactLoop(
  task: string,
  contextPrompt: string,
  tools: readonly OuroborosTool[],
  config: ReactLoopConfig,
  deps: ReactDependencies,
): Promise<ReactResult> {
  const startTime = Date.now();
  const { callModel, logger } = deps;

  // 1. 创建执行树
  let tree = createExecutionTree(config.agentId, task);
  logger.info("react-loop", "ReAct 循环开始", { task, agentId: config.agentId });

  // 2. 加载核心系统提示词 + 拼接用户上下文
  const corePrompt = await loadCorePrompt();
  const systemPrompt = contextPrompt ? `${corePrompt}\n\n---\n\n${contextPrompt}` : corePrompt;

  // 3. 构建初始消息
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ];

  // 4. 转换工具定义
  const toolDefinitions = toModelToolDefinitions(tools);

  // 5. 循环状态
  const steps: ReactStep[] = [];
  let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let answer = "";
  let stopReason: ReactResult["stopReason"] = "completed";
  let iteration = 0;

  try {
    while (iteration < config.maxIterations) {
      const stepStartTime = Date.now();
      logger.info("react-loop", `迭代 ${iteration + 1}`, { iteration: iteration + 1 });

      // a. 调用模型
      const modelNodeResult = addNode(tree, tree.activeNodeId, {
        nodeType: NodeType.ModelCall,
        summary: `模型调用 #${iteration + 1}`,
      });
      tree = modelNodeResult.tree;
      const modelNodeId = modelNodeResult.nodeId;

      let response: ModelResponse;
      try {
        response = await callModel({
          messages,
          tools: toolDefinitions.length > 0 ? [...toolDefinitions] : undefined,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        tree = failNode(tree, modelNodeId, errMsg);
        logger.error("react-loop", "模型调用失败", { error: errMsg });
        stopReason = "error";
        answer = `模型调用失败: ${errMsg}`;
        break;
      }

      // 累加 usage
      totalUsage = addUsage(totalUsage, response.usage);
      tree = completeNode(tree, modelNodeId, `模型响应: ${response.stopReason}`);

      // b. 检查停止原因
      if (response.stopReason === "end_turn" || response.stopReason === "stop_sequence") {
        // 空响应容错：模型只产生了 thinking 但未给出文本或工具调用
        // 注入重试提示让模型根据 thinking 内容直接回答（最多重试 2 次）
        if (!response.content.trim() && response.thinking) {
          const retried = await retryWithThinking(
            response.thinking,
            messages,
            toolDefinitions,
            callModel,
            logger,
          );
          if (retried) {
            totalUsage = addUsage(totalUsage, retried.usage);
            answer = retried.content;
            logger.info("react-loop", "thinking 重试成功", { contentLength: answer.length });
          } else {
            // 重试失败，降级使用 thinking 内容
            answer = response.thinking;
            logger.warn("react-loop", "thinking 重试失败，降级使用 thinking 内容", {
              thinkingLength: answer.length,
            });
          }
        } else {
          answer = response.content;
        }
        logger.info("react-loop", "模型给出最终回答", { contentLength: answer.length });

        steps.push({
          stepIndex: iteration,
          thought: response.thinking ?? response.content,
          toolCalls: [],
          duration: Date.now() - stepStartTime,
        });
        deps.onStep?.(steps[steps.length - 1]!, tree);
        iteration++;
        break;
      }

      if (response.stopReason === "tool_use" && response.toolCalls.length > 0) {
        // c. 添加 assistant 消息（含 toolCalls）到历史
        const assistantMessage: Message = {
          role: "assistant",
          content: response.content,
          toolCalls: response.toolCalls,
        };
        messages.push(assistantMessage);

        // 执行工具
        const toolCallResults = await executeToolCalls(response.toolCalls, config, deps, tree);

        // 更新执行树
        for (const tcr of toolCallResults.results) {
          const nodeResult = addNode(tree, tree.rootNodeId, {
            nodeType: NodeType.ToolCall,
            summary: `${tcr.toolId} ${JSON.stringify(tcr.input).slice(0, 80)}`,
          });
          tree = nodeResult.tree;

          if (tcr.success) {
            tree = completeNode(
              tree,
              nodeResult.nodeId,
              tcr.output ? JSON.stringify(tcr.output).slice(0, 200) : "成功",
            );
          } else {
            tree = failNode(tree, nodeResult.nodeId, tcr.error ?? "未知错误");
          }
        }
        tree = toolCallResults.tree;

        // 添加 tool result 消息到历史
        for (const tcr of toolCallResults.results) {
          const toolResultContent = tcr.success
            ? JSON.stringify(tcr.output ?? { success: true })
            : JSON.stringify({ error: tcr.error });

          const toolResultMessage: Message = {
            role: "tool",
            content: toolResultContent,
            toolCallId: tcr.requestId,
          };
          messages.push(toolResultMessage);
        }

        // 记录步骤
        steps.push({
          stepIndex: iteration,
          thought: response.content,
          toolCalls: toolCallResults.results,
          duration: Date.now() - stepStartTime,
        });
        deps.onStep?.(steps[steps.length - 1]!, tree);

        logger.info("react-loop", `步骤 ${iteration + 1} 完成`, {
          toolCallCount: toolCallResults.results.length,
          duration: Date.now() - stepStartTime,
        });

        // 检查上下文压缩
        if (messages.length > config.compressionThreshold) {
          try {
            const compressed = await compressContext(
              messages,
              config.compressionThreshold,
              callModel,
            );
            messages.length = 0;
            messages.push(...compressed);
            logger.info("react-loop", "上下文压缩完成", {
              before: messages.length,
              after: compressed.length,
            });
          } catch {
            // 压缩失败不影响循环
            logger.warn("react-loop", "上下文压缩失败，继续使用完整消息");
          }
        }

        // 检查死循环
        const loopReport = detectPossibleLoop(tree);
        if (loopReport) {
          logger.warn("react-loop", "检测到可能的死循环", { report: loopReport });
          const promptText = buildExceptionPrompt(loopReport);
          messages.push({ role: "user", content: promptText });
        }
      } else {
        // max_tokens 或其他原因
        answer = response.content;
        steps.push({
          stepIndex: iteration,
          thought: response.content,
          toolCalls: [],
          duration: Date.now() - stepStartTime,
        });
        iteration++;
        break;
      }

      iteration++;
    }

    // 检查是否因最大迭代次数退出
    if (iteration >= config.maxIterations && stopReason === "completed") {
      stopReason = "max_iterations";
      if (!answer) {
        answer = `达到最大迭代次数 (${config.maxIterations})，循环终止`;
      }
      logger.warn("react-loop", "达到最大迭代次数", { maxIterations: config.maxIterations });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    stopReason = "error";
    answer = `ReAct 循环异常: ${errMsg}`;
    logger.error("react-loop", "ReAct 循环异常", { error: errMsg });
  }

  // 更新执行树最终状态
  const finalTreeState =
    stopReason === "error"
      ? TreeState.Failed
      : (stopReason as string) === "terminated"
        ? TreeState.Cancelled
        : TreeState.Completed;

  tree = completeOrFailRoot(tree, stopReason, answer);
  tree = updateTreeState(tree, finalTreeState);

  logger.info("react-loop", "ReAct 循环结束", {
    totalIterations: iteration,
    totalDuration: Date.now() - startTime,
    stopReason,
  });

  return {
    answer,
    steps,
    totalIterations: iteration,
    totalDuration: Date.now() - startTime,
    executionTree: tree,
    totalUsage,
    stopReason,
  };
}

// ─── 内部函数 ──────────────────────────────────────────────────────

/**
 * 执行工具调用
 */
async function executeToolCalls(
  toolCalls: readonly ToolCall[],
  config: ReactLoopConfig,
  deps: ReactDependencies,
  tree: ExecutionTree,
): Promise<{ readonly results: readonly ToolCallResult[]; readonly tree: ExecutionTree }> {
  const requests: ToolCallRequest[] = toolCalls.map((tc) => ({
    requestId: tc.id,
    toolId: tc.name,
    input: parseToolArguments(tc.arguments),
    caller: { entityId: config.agentId },
  }));

  let results: ToolCallResult[];

  if (config.parallelToolCalls && requests.length > 1) {
    // 并行执行
    const responses = await Promise.all(
      requests.map((req) => executeWithTimeout(req, deps, config.stepTimeout)),
    );
    results = responses.map((res, i) => toToolCallResult(requests[i]!, res));
  } else {
    // 串行执行
    results = [];
    for (const req of requests) {
      const res = await executeWithTimeout(req, deps, config.stepTimeout);
      results.push(toToolCallResult(req, res));
    }
  }

  return { results, tree };
}

/**
 * 带超时的工具执行
 */
async function executeWithTimeout(
  request: ToolCallRequest,
  deps: ReactDependencies,
  _timeoutMs: number,
): Promise<{
  readonly success: boolean;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly error?: string;
  readonly duration: number;
}> {
  // 超时控制由 ToolExecutor 内部处理（tool.timeout），_timeoutMs 预留给未来
  const startTime = Date.now();

  try {
    const response = await deps.toolExecutor.execute(request);
    return {
      success: response.success,
      output: response.output,
      error: response.error?.message,
      duration: response.duration,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * 解析工具参数 JSON 字符串
 */
function parseToolArguments(args: string): Readonly<Record<string, unknown>> {
  try {
    return JSON.parse(args) as Record<string, unknown>;
  } catch {
    return { raw: args };
  }
}

/**
 * 构建 ToolCallResult
 */
function toToolCallResult(
  request: ToolCallRequest,
  response: {
    readonly success: boolean;
    readonly output?: Readonly<Record<string, unknown>>;
    readonly error?: string;
    readonly duration: number;
  },
): ToolCallResult {
  return {
    toolId: request.toolId,
    requestId: request.requestId,
    input: request.input,
    output: response.output,
    success: response.success,
    error: response.error,
    duration: response.duration,
  };
}

/**
 * 累加 TokenUsage
 */
function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/**
 * 完成或失败 root 节点
 */
function completeOrFailRoot(
  tree: ExecutionTree,
  stopReason: ReactResult["stopReason"],
  answer: string,
): ExecutionTree {
  const rootNode = tree.nodes[tree.rootNodeId];
  if (!rootNode) return tree;

  // 如果 root 已经在终态，不再更改
  const terminalStates = new Set(["completed", "failed", "cancelled"]);
  if (terminalStates.has(rootNode.state)) return tree;

  if (stopReason === "error") {
    return failNode(tree, tree.rootNodeId, answer);
  }
  return completeNode(tree, tree.rootNodeId, answer.slice(0, 200));
}

/** 空响应重试时注入的提示 */
const THINKING_RETRY_PROMPT =
  "你刚才进行了思考但没有给出回答。请根据你的思考内容直接给出回答，不要重复思考过程。";

/** 最大重试次数 */
const MAX_THINKING_RETRIES = 2;

/**
 * 当模型只产生了 thinking 但未输出文本/工具调用时，
 * 注入重试提示让模型根据已有 thinking 直接回答。
 *
 * @returns 成功时返回 ModelResponse，重试耗尽时返回 null
 */
async function retryWithThinking(
  _thinking: string,
  messages: readonly Message[],
  toolDefinitions: readonly import("../model/types.js").ToolDefinition[],
  callModel: ReactDependencies["callModel"],
  logger: ReactDependencies["logger"],
): Promise<ModelResponse | null> {
  // 构建带 thinking 上下文的重试消息
  const retryMessages: Message[] = [
    ...messages,
    { role: "assistant", content: "" },
    { role: "user", content: THINKING_RETRY_PROMPT },
  ];

  for (let attempt = 0; attempt < MAX_THINKING_RETRIES; attempt++) {
    try {
      logger.info("react-loop", `thinking 重试 ${attempt + 1}/${MAX_THINKING_RETRIES}`);
      const response = await callModel({
        messages: retryMessages,
        tools: toolDefinitions.length > 0 ? [...toolDefinitions] : undefined,
      });
      if (response.content.trim() || response.toolCalls.length > 0) {
        return response;
      }
      logger.warn("react-loop", `thinking 重试 ${attempt + 1} 仍为空响应`);
    } catch (err) {
      logger.warn("react-loop", `thinking 重试 ${attempt + 1} 失败`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}
