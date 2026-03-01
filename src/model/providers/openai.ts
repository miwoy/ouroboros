import type { ModelProviderConfig } from "../../config/schema.js";
import { ModelError } from "../../errors/index.js";
import type {
  Message,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  StreamCallback,
  StopReason,
  ToolCall,
  TokenUsage,
} from "../types.js";

/** OpenAI API 消息格式 */
interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

/** OpenAI 工具调用格式 */
interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** OpenAI API 响应格式 */
interface OpenAIResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/** OpenAI 流式数据块 */
interface OpenAIStreamChunk {
  choices: Array<{
    delta: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model?: string;
}

/**
 * 转换内部消息格式为 OpenAI API 格式
 */
function toOpenAIMessages(messages: readonly Message[]): OpenAIMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
  }));
}

/**
 * 转换 OpenAI finish_reason 为统一的 StopReason
 */
function toStopReason(finishReason: string): StopReason {
  switch (finishReason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    default:
      return "end_turn";
  }
}

/**
 * 转换 OpenAI 工具调用为统一格式
 */
function toToolCalls(toolCalls?: OpenAIToolCall[]): ToolCall[] {
  if (!toolCalls) return [];
  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));
}

/**
 * OpenAI 模型提供商
 * 支持 OpenAI API 及兼容 API（如 Ollama、vLLM）
 */
export function createOpenAIProvider(config: ModelProviderConfig): ModelProvider {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  const defaultModel = config.defaultModel ?? "gpt-4o";

  return {
    name: "openai",

    async complete(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
      const model = request.model ?? defaultModel;
      const body: Record<string, unknown> = {
        model,
        messages: toOpenAIMessages(request.messages),
      };

      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
      if (request.stop) body.stop = request.stop;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new ModelError(
          `OpenAI API 错误 (${response.status}): ${errorText}`,
        );
      }

      const data = (await response.json()) as OpenAIResponse;
      const choice = data.choices[0];
      if (!choice) {
        throw new ModelError("OpenAI 返回空响应");
      }

      return {
        content: choice.message.content ?? "",
        toolCalls: toToolCalls(choice.message.tool_calls),
        stopReason: toStopReason(choice.finish_reason),
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        model: data.model,
      };
    },

    async stream(
      request: ModelRequest,
      callback: StreamCallback,
      signal?: AbortSignal,
    ): Promise<ModelResponse> {
      const model = request.model ?? defaultModel;
      const body: Record<string, unknown> = {
        model,
        messages: toOpenAIMessages(request.messages),
        stream: true,
        stream_options: { include_usage: true },
      };

      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
      if (request.stop) body.stop = request.stop;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new ModelError(
          `OpenAI API 流式错误 (${response.status}): ${errorText}`,
        );
      }

      if (!response.body) {
        throw new ModelError("OpenAI API 未返回流式数据");
      }

      // 解析 SSE 流
      let fullContent = "";
      const toolCallsAccum: Map<number, { id: string; name: string; arguments: string }> =
        new Map();
      let finishReason = "stop";
      let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      let responseModel = model;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // 保留最后一行（可能不完整）
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            let chunk: OpenAIStreamChunk;
            try {
              chunk = JSON.parse(data) as OpenAIStreamChunk;
            } catch {
              continue;
            }

            if (chunk.model) responseModel = chunk.model;

            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              fullContent += delta.content;
              callback({ type: "text_delta", text: delta.content });
            }

            // 处理工具调用流
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCallsAccum.get(tc.index);
                if (!existing) {
                  const id = tc.id ?? "";
                  const name = tc.function?.name ?? "";
                  toolCallsAccum.set(tc.index, { id, name, arguments: tc.function?.arguments ?? "" });
                  callback({ type: "tool_call_start", toolCall: { id, name } });
                } else {
                  if (tc.function?.arguments) {
                    existing.arguments += tc.function.arguments;
                    callback({ type: "tool_call_delta", arguments: tc.function.arguments });
                  }
                }
              }
            }

            if (chunk.choices?.[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason;
              // 结束所有工具调用
              if (finishReason === "tool_calls") {
                for (const [_idx] of toolCallsAccum) {
                  callback({ type: "tool_call_end" });
                }
              }
            }

            if (chunk.usage) {
              usage = {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              };
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const toolCalls: ToolCall[] = Array.from(toolCallsAccum.values()).map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      }));

      const result: ModelResponse = {
        content: fullContent,
        toolCalls,
        stopReason: toStopReason(finishReason),
        usage,
        model: responseModel,
      };

      callback({ type: "done", response: result });
      return result;
    },
  };
}
