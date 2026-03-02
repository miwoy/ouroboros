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
import type { ModelProviderConfig } from "../../config/schema.js";
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
};

/**
 * 默认 baseUrl 映射
 */
const DEFAULT_BASE_URLS: Readonly<Record<string, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  mistral: "https://api.mistral.ai/v1",
  groq: "https://api.groq.com/openai/v1",
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
};

/**
 * 根据配置创建 pi-ai Model 对象
 */
function createPiModel(config: ModelProviderConfig, modelOverride?: string): PiModel<PiApi> {
  const api = API_TYPE_MAP[config.type];
  if (!api) {
    throw new ModelError(`不支持的提供商类型: ${config.type}`);
  }

  const modelId = modelOverride ?? config.defaultModel ?? DEFAULT_MODELS[config.type] ?? "unknown";
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URLS[config.type] ?? "";

  return {
    id: modelId,
    name: modelId,
    api,
    provider: config.type,
    baseUrl,
    reasoning: false,
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
  config: ModelProviderConfig,
  request: ModelRequest,
  signal?: AbortSignal,
): ProviderStreamOptions {
  const options: Record<string, unknown> & { apiKey: string } = {
    apiKey: config.apiKey,
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
  return options;
}

/**
 * 创建基于 pi-ai 的 ModelProvider
 *
 * @param config - 提供商配置
 * @returns ModelProvider 接口实现
 */
export function createPiAiProvider(config: ModelProviderConfig): ModelProvider {
  return {
    name: config.type,

    async complete(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
      const model = createPiModel(config, request.model);
      const context = toContext(request);
      const options = toStreamOptions(config, request, signal);

      try {
        const assistantMsg = await piComplete(model, context, options);
        const { content, toolCalls } = extractFromAssistantMessage(assistantMsg);

        return {
          content,
          toolCalls,
          stopReason: toStopReason(assistantMsg.stopReason),
          usage: toUsage(assistantMsg),
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
      const model = createPiModel(config, request.model);
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

            finalResponse = {
              content: content || fullContent,
              toolCalls: msgToolCalls.length > 0 ? msgToolCalls : toolCalls,
              stopReason: toStopReason(assistantMsg.stopReason),
              usage: toUsage(assistantMsg),
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
            stopReason: "end_turn",
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
