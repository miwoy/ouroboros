/**
 * pi-ai 适配器
 * 将 Ouroboros 的 ModelProvider 接口适配到 @mariozechner/pi-ai 的统一 API
 *
 * 使用 pi-ai 的 completeSimple / streamSimple 统一接口，
 * 通过 reasoning 选项和 model.compat 自动适配不同提供商的 thinking/reasoning 协议：
 * - OpenAI: reasoning_effort
 * - Anthropic: thinkingEnabled + thinkingBudgetTokens（或 adaptive）
 * - Google: thinking.enabled + thinking.budgetTokens
 * - Qwen (openai-compatible): enable_thinking: boolean
 * - Codex: reasoningEffort
 */
import {
  streamSimple as piStream,
  completeSimple as piComplete,
  registerBuiltInApiProviders,
} from "@mariozechner/pi-ai";
import type {
  Model as PiModel,
  Api as PiApi,
  Context as PiContext,
  UserMessage as PiUserMessage,
  ToolResultMessage as PiToolResultMessage,
  AssistantMessage as PiAssistantMessage,
  TextContent,
  ToolCall as PiToolCall,
  AssistantMessageEvent,
  SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import type { ProviderConfig } from "../../config/schema.js";
import { ModelError } from "../../errors/index.js";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  StreamCallback,
  StopReason,
  ToolCall,
  TokenUsage,
} from "../types.js";

// 确保 pi-ai 内置提供商已注册
registerBuiltInApiProviders();

/**
 * Ouroboros provider type → pi-ai API 类型映射
 */
const API_TYPE_MAP: Readonly<Record<string, PiApi>> = {
  openai: "openai-completions",
  anthropic: "anthropic-messages",
  "openai-compatible": "openai-completions",
  google: "google-generative-ai",
  mistral: "openai-completions",
  groq: "openai-completions",
  bedrock: "bedrock-converse-stream",
  "openai-codex": "openai-codex-responses",
  "github-copilot": "openai-completions",
  "google-gemini-cli": "google-gemini-cli",
  "google-antigravity": "google-gemini-cli",
};

/**
 * GitHub Copilot 中使用 anthropic-messages API 的模型前缀
 */
const COPILOT_ANTHROPIC_PREFIXES = ["claude-"] as const;

/**
 * 默认 baseUrl 映射
 */
const DEFAULT_BASE_URLS: Readonly<Record<string, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  mistral: "https://api.mistral.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  "openai-codex": "https://api.openai.com/v1",
  "github-copilot": "https://api.individual.githubcopilot.com",
  "google-gemini-cli": "https://cloudcode-pa.googleapis.com",
  "google-antigravity": "https://daily-cloudcode-pa.sandbox.googleapis.com",
};

/**
 * 默认模型 ID 映射
 */
const DEFAULT_MODELS: Readonly<Record<string, string>> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  "openai-compatible": "gpt-4o",
  google: "gemini-2.0-flash",
  mistral: "mistral-large-latest",
  groq: "llama-3.3-70b-versatile",
  bedrock: "anthropic.claude-sonnet-4-20250514-v2:0",
  "openai-codex": "gpt-5.3-codex",
  "github-copilot": "gpt-4o",
  "google-gemini-cli": "gemini-2.5-flash",
  "google-antigravity": "gemini-2.5-pro",
};

/**
 * 推断 GitHub Copilot 的实际 API 类型
 * Claude 模型使用 anthropic-messages，其他使用 openai-completions
 */
function inferCopilotApi(modelId: string): PiApi {
  const lower = modelId.toLowerCase();
  if (COPILOT_ANTHROPIC_PREFIXES.some((p) => lower.startsWith(p))) {
    return "anthropic-messages";
  }
  return "openai-completions";
}

/**
 * 根据配置创建 pi-ai Model 对象
 *
 * model.reasoning 标记告诉 pi-ai 该模型支持 thinking/reasoning 能力，
 * pi-ai 据此决定是否发送 thinking 相关参数（enable_thinking / reasoning_effort 等）
 */
function createPiModel(
  config: ProviderConfig,
  modelOverride?: string,
  reasoning = false,
): PiModel<PiApi> {
  const providerType = config.type ?? config.api ?? "";
  let api = API_TYPE_MAP[providerType];
  if (!api) {
    throw new ModelError(`不支持的提供商类型: ${providerType}`);
  }

  const modelId = modelOverride ?? config.defaultModel ?? DEFAULT_MODELS[providerType] ?? "unknown";
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URLS[providerType] ?? "";

  // GitHub Copilot 根据模型名称推断 API 类型
  if (providerType === "github-copilot") {
    api = inferCopilotApi(modelId);
  }

  // openai-compatible / mistral / groq：不发送 reasoning 参数
  // 这些提供商的模型自行处理 thinking（如 qwen3 的 <think> 标签 / reasoning 字段），
  // pi-ai 会自动解析响应中的 reasoning 字段为 thinking block，无需额外参数
  const NATIVE_REASONING_PROVIDERS = new Set([
    "openai",
    "anthropic",
    "google",
    "bedrock",
    "openai-codex",
    "github-copilot",
    "google-gemini-cli",
    "google-antigravity",
  ]);
  if (!NATIVE_REASONING_PROVIDERS.has(providerType)) {
    reasoning = false;
  }

  return {
    id: modelId,
    name: modelId,
    api,
    provider: providerType,
    baseUrl,
    reasoning,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };
}

/**
 * 转换 Ouroboros Message[] → pi-ai Context
 */
function toContext(request: ModelRequest): PiContext {
  let systemPrompt: string | undefined;
  const messages: PiContext["messages"] = [];
  const now = Date.now();

  for (const msg of request.messages) {
    switch (msg.role) {
      case "system":
        systemPrompt = systemPrompt ? `${systemPrompt}\n${msg.content}` : msg.content;
        break;
      case "user":
        messages.push({
          role: "user",
          content: msg.content,
          timestamp: now,
        } satisfies PiUserMessage);
        break;
      case "assistant": {
        const content: (TextContent | PiToolCall)[] = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: "toolCall",
              id: tc.id,
              name: tc.name,
              arguments: JSON.parse(tc.arguments),
            } as PiToolCall);
          }
        }
        messages.push({
          role: "assistant",
          content: content.length > 0 ? content : [{ type: "text", text: "" }],
          api: "openai-completions",
          provider: "openai",
          model: "",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: msg.toolCalls?.length ? "toolUse" : "stop",
          timestamp: now,
        } satisfies PiAssistantMessage);
        break;
      }
      case "tool":
        messages.push({
          role: "toolResult",
          toolCallId: msg.toolCallId ?? "",
          toolName: "",
          content: [{ type: "text", text: msg.content }],
          isError: false,
          timestamp: now,
        } satisfies PiToolResultMessage);
        break;
    }
  }

  const context: PiContext = { messages };
  if (systemPrompt) {
    context.systemPrompt = systemPrompt;
  }

  // 转换工具定义（pi-ai 使用 TypeBox TSchema，但 JSON Schema 对象在运行时兼容）
  if (request.tools && request.tools.length > 0) {
    context.tools = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: t.parameters.properties ?? {},
        required: t.parameters.required ? [...t.parameters.required] : [],
      } as unknown as import("@sinclair/typebox").TSchema,
    }));
  }

  return context;
}

/**
 * 转换 pi-ai StopReason → Ouroboros StopReason
 */
function toStopReason(reason: string): StopReason {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "toolUse":
      return "tool_use";
    default:
      return "end_turn";
  }
}

/**
 * 解析最终 stopReason（兼容 pi-ai openai-completions 的 tool_calls 检测缺陷）
 *
 * pi-ai 的 openai-completions provider 在收到 tool_calls 时可能仍返回 stopReason="stop"，
 * 而非正确的 "toolUse"（openai-responses-shared 中有兜底但 openai-completions 中遗漏）。
 * 这里根据实际 toolCalls 数量做二次修正。
 */
function resolveStopReason(piStopReason: string, toolCalls: readonly ToolCall[]): StopReason {
  const mapped = toStopReason(piStopReason);
  if (toolCalls.length > 0 && mapped !== "tool_use") {
    return "tool_use";
  }
  return mapped;
}

/**
 * 从 pi-ai AssistantMessage 提取文本、工具调用和 thinking 内容
 *
 * pi-ai 统一解析响应中的 reasoning/reasoning_content 字段为 type:"thinking" block，
 * 部分模型（如 qwen3）可能只产生 thinking 内容而无文本或工具调用，
 * 此时 thinking 内容可用于容错降级。
 */
function extractFromAssistantMessage(msg: PiAssistantMessage): {
  content: string;
  toolCalls: readonly ToolCall[];
  thinking: string;
} {
  let content = "";
  let thinking = "";
  const toolCalls: ToolCall[] = [];

  for (const block of msg.content) {
    if (block.type === "text") {
      content += (block as TextContent).text;
    } else if (block.type === "toolCall") {
      const tc = block as PiToolCall;
      toolCalls.push({
        id: tc.id,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      });
    } else if (block.type === "thinking") {
      // pi-ai 将 reasoning_content / reasoning 字段解析为 ThinkingContent block
      const tb = block as import("@mariozechner/pi-ai").ThinkingContent;
      if (!tb.redacted) {
        thinking += tb.thinking;
      }
    }
  }

  return { content, toolCalls, thinking };
}

/**
 * 从 pi-ai AssistantMessage 提取 TokenUsage
 */
function toUsage(msg: PiAssistantMessage): TokenUsage {
  return {
    promptTokens: msg.usage.input,
    completionTokens: msg.usage.output,
    totalTokens: msg.usage.totalTokens,
  };
}

/**
 * 构建 pi-ai SimpleStreamOptions
 *
 * 使用 SimpleStreamOptions 的 reasoning 字段作为统一接口，
 * pi-ai 内部根据 model.api 和 model.compat 自动映射到各提供商的具体参数
 */
function toSimpleOptions(
  config: ProviderConfig,
  request: ModelRequest,
  signal?: AbortSignal,
): SimpleStreamOptions {
  const options: SimpleStreamOptions = {
    apiKey: config.apiKey ?? "",
    maxRetryDelayMs: 0, // 禁用 pi-ai 内部重试，由 Ouroboros retry.ts 处理
  };

  if (request.temperature !== undefined) {
    options.temperature = request.temperature;
  }
  if (request.maxTokens !== undefined) {
    options.maxTokens = request.maxTokens;
  }
  if (signal) {
    options.signal = signal;
  }

  // 统一 reasoning 接口 — pi-ai 根据 model.compat.thinkingFormat 自动映射
  // qwen: enable_thinking: true
  // openai: reasoning_effort: level
  // anthropic: thinkingEnabled + thinkingBudgetTokens
  // codex: reasoningEffort
  if (request.think) {
    options.reasoning = request.thinkLevel ?? "medium";
  }

  return options;
}

/**
 * 创建基于 pi-ai 的 ModelProvider
 *
 * @param config - 提供商配置
 * @returns ModelProvider 接口实现
 */
export function createPiAiProvider(config: ProviderConfig): ModelProvider {
  return {
    name: config.type ?? config.api ?? "unknown",

    async complete(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
      const model = createPiModel(config, request.model, request.think ?? false);
      const context = toContext(request);
      const options = toSimpleOptions(config, request, signal);

      try {
        const assistantMsg = await piComplete(model, context, options);
        const { content, toolCalls, thinking } = extractFromAssistantMessage(assistantMsg);
        const usage = toUsage(assistantMsg);

        // 空响应校验：内容、工具调用、thinking 都为空且 token 用量为零 → 上游返回了无效响应
        validateNonEmptyResponse(content, toolCalls, thinking, usage, model.id);

        return {
          content,
          toolCalls,
          stopReason: resolveStopReason(assistantMsg.stopReason, toolCalls),
          usage,
          model: assistantMsg.model,
          ...(thinking ? { thinking } : {}),
        };
      } catch (error) {
        throw toModelError(error);
      }
    },

    async stream(
      request: ModelRequest,
      callback: StreamCallback,
      signal?: AbortSignal,
    ): Promise<ModelResponse> {
      const model = createPiModel(config, request.model, request.think ?? false);
      const context = toContext(request);
      const options = toSimpleOptions(config, request, signal);

      let fullContent = "";
      const toolCalls: ToolCall[] = [];
      let finalResponse: ModelResponse | undefined;

      try {
        const eventStream = piStream(model, context, options);

        for await (const event of eventStream) {
          handleStreamEvent(event, callback, toolCalls, (text) => {
            fullContent += text;
          });

          if (event.type === "done") {
            const assistantMsg = event.message;
            const {
              content,
              toolCalls: msgToolCalls,
              thinking,
            } = extractFromAssistantMessage(assistantMsg);
            const resolvedContent = content || fullContent;
            const resolvedToolCalls = msgToolCalls.length > 0 ? msgToolCalls : toolCalls;
            const usage = toUsage(assistantMsg);

            // 空响应校验
            validateNonEmptyResponse(resolvedContent, resolvedToolCalls, thinking, usage, model.id);

            finalResponse = {
              content: resolvedContent,
              toolCalls: resolvedToolCalls,
              stopReason: resolveStopReason(assistantMsg.stopReason, resolvedToolCalls),
              usage,
              model: assistantMsg.model,
              ...(thinking ? { thinking } : {}),
            };

            callback({ type: "done", response: finalResponse });
          }

          if (event.type === "error") {
            const errMsg = event.error;
            throw new ModelError(errMsg.errorMessage ?? `模型调用失败: ${errMsg.stopReason}`);
          }
        }

        if (!finalResponse) {
          // 流正常结束但未收到 done 事件，从累积数据构建响应
          finalResponse = {
            content: fullContent,
            toolCalls,
            stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            model: model.id,
          };
          callback({ type: "done", response: finalResponse });
        }

        return finalResponse;
      } catch (error) {
        throw toModelError(error);
      }
    },
  };
}

/**
 * 处理单个流式事件，转发为 Ouroboros StreamEvent
 */
function handleStreamEvent(
  event: AssistantMessageEvent,
  callback: StreamCallback,
  toolCalls: ToolCall[],
  onText: (text: string) => void,
): void {
  switch (event.type) {
    case "text_delta":
      onText(event.delta);
      callback({ type: "text_delta", text: event.delta });
      break;
    case "toolcall_start": {
      const partial = event.partial;
      const currentBlock = partial.content[event.contentIndex] as PiToolCall | undefined;
      callback({
        type: "tool_call_start",
        toolCall: {
          id: currentBlock?.id ?? "",
          name: currentBlock?.name ?? "",
        },
      });
      break;
    }
    case "toolcall_delta":
      callback({ type: "tool_call_delta", arguments: event.delta });
      break;
    case "toolcall_end": {
      const tc = event.toolCall;
      toolCalls.push({
        id: tc.id,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      });
      callback({ type: "tool_call_end" });
      break;
    }
    // start, text_start, text_end, thinking_*, done, error 不需要额外处理
  }
}

/**
 * 校验模型响应非空
 *
 * 当内容、工具调用、thinking 都为空且 token 用量为零时，
 * 说明上游返回了无效响应（如模型不存在的 404）。
 *
 * 如果模型只返回了 thinking 内容（无文本、无工具调用），
 * 不抛出错误 — 由上层（ReAct loop）决定是否重试或降级。
 */
function validateNonEmptyResponse(
  content: string,
  toolCalls: readonly ToolCall[],
  thinking: string,
  usage: TokenUsage,
  modelId: string,
): void {
  const hasContent = content.length > 0;
  const hasToolCalls = toolCalls.length > 0;
  const hasThinking = thinking.length > 0;
  const hasUsage = usage.totalTokens > 0 || usage.promptTokens > 0;

  if (!hasContent && !hasToolCalls && !hasThinking && !hasUsage) {
    throw new ModelError(
      `模型 "${modelId}" 返回空响应（无内容、无工具调用、无 token 消耗）。` +
        `请检查模型是否存在、API 密钥是否有效。`,
    );
  }
}

/**
 * 将 pi-ai 错误转换为 ModelError
 */
function toModelError(error: unknown): ModelError {
  if (error instanceof ModelError) {
    return error;
  }
  if (error instanceof Error) {
    return new ModelError(error.message, error);
  }
  return new ModelError(String(error));
}
