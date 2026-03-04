/**
 * pi-ai 适配器
 * 将 Ouroboros 的 ModelProvider 接口适配到 @mariozechner/pi-ai 的统一 API
 */
import {
  stream as piStream,
  complete as piComplete,
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
  ProviderStreamOptions,
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
 * 原生支持 reasoning/thinking 参数的提供商类型
 * openai-compatible / mistral / groq 等第三方兼容 API 不支持该参数
 */
const REASONING_SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "anthropic",
  "google",
  "bedrock",
  "github-copilot",
  "google-gemini-cli",
  "google-antigravity",
]);

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

  // 仅原生支持 reasoning 的提供商启用 model.reasoning 标记
  // openai-compatible / mistral / groq 等自行处理 thinking（如 qwen3 的 <think> 标签）
  const effectiveReasoning =
    reasoning &&
    (REASONING_SUPPORTED_PROVIDERS.has(providerType) || providerType === "openai-codex");

  return {
    id: modelId,
    name: modelId,
    api,
    provider: providerType,
    baseUrl,
    reasoning: effectiveReasoning,
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
 * 从 pi-ai AssistantMessage 提取文本和工具调用
 */
function extractFromAssistantMessage(msg: PiAssistantMessage): {
  content: string;
  toolCalls: readonly ToolCall[];
} {
  let content = "";
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
    }
  }

  return { content, toolCalls };
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
 * 构建 pi-ai StreamOptions
 */
function toStreamOptions(
  config: ProviderConfig,
  request: ModelRequest,
  signal?: AbortSignal,
): ProviderStreamOptions {
  const options: Record<string, unknown> & { apiKey: string } = {
    apiKey: config.apiKey ?? "",
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
  // 禁用 pi-ai 内部重试，由 Ouroboros retry.ts 处理
  options.maxRetryDelayMs = 0;

  // Thinking/Reasoning 支持（仅原生支持的提供商发送参数）
  if (request.think) {
    const level = request.thinkLevel ?? "medium";
    const providerType = config.type ?? config.api ?? "";

    if (providerType === "openai-codex") {
      // Codex 使用 reasoningEffort 参数
      options.reasoningEffort = level;
    } else if (REASONING_SUPPORTED_PROVIDERS.has(providerType)) {
      // 原生支持 reasoning 的提供商
      options.reasoning = level;
    }
    // openai-compatible / mistral / groq 等不支持 reasoning 参数，静默跳过
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
      const options = toStreamOptions(config, request, signal);

      try {
        const assistantMsg = await piComplete(model, context, options);

        const { content, toolCalls } = extractFromAssistantMessage(assistantMsg);
        const usage = toUsage(assistantMsg);

        // 空响应校验：内容和工具调用都为空 + token 用量为零 → 上游很可能返回了错误
        validateNonEmptyResponse(content, toolCalls, usage, model.id);

        return {
          content,
          toolCalls,
          stopReason: resolveStopReason(assistantMsg.stopReason, toolCalls),
          usage,
          model: assistantMsg.model,
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
      const options = toStreamOptions(config, request, signal);

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
            const { content, toolCalls: msgToolCalls } = extractFromAssistantMessage(assistantMsg);
            const resolvedContent = content || fullContent;
            const resolvedToolCalls = msgToolCalls.length > 0 ? msgToolCalls : toolCalls;
            const usage = toUsage(assistantMsg);

            // 空响应校验
            validateNonEmptyResponse(resolvedContent, resolvedToolCalls, usage, model.id);

            finalResponse = {
              content: resolvedContent,
              toolCalls: resolvedToolCalls,
              stopReason: resolveStopReason(assistantMsg.stopReason, resolvedToolCalls),
              usage,
              model: assistantMsg.model,
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
 * 当内容和工具调用都为空且 token 用量为零时，说明上游返回了无效响应（如模型不存在的 404）
 */
function validateNonEmptyResponse(
  content: string,
  toolCalls: readonly ToolCall[],
  usage: TokenUsage,
  modelId: string,
): void {
  const hasContent = content.length > 0;
  const hasToolCalls = toolCalls.length > 0;
  const hasUsage = usage.totalTokens > 0 || usage.promptTokens > 0;

  if (!hasContent && !hasToolCalls && !hasUsage) {
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
