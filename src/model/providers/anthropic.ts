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

/** Anthropic API 消息格式 */
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

/** Anthropic 内容块 */
type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

/** Anthropic API 响应 */
interface AnthropicResponse {
  id: string;
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/** Anthropic 流式事件 */
interface AnthropicStreamEvent {
  type: string;
  message?: AnthropicResponse;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: { output_tokens: number };
}

/**
 * 转换内部消息为 Anthropic API 格式
 * Anthropic 使用 system 参数而非 system 消息角色
 */
function toAnthropicMessages(messages: readonly Message[]): {
  system: string | undefined;
  messages: AnthropicMessage[];
} {
  let system: string | undefined;
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        // Anthropic 使用顶层 system 参数
        system = system ? `${system}\n${msg.content}` : msg.content;
        break;
      case "user":
        result.push({ role: "user", content: msg.content });
        break;
      case "assistant":
        result.push({ role: "assistant", content: msg.content });
        break;
      case "tool":
        // 工具结果作为 user 消息发送
        result.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId ?? "",
              content: msg.content,
            },
          ],
        });
        break;
    }
  }

  return { system, messages: result };
}

/**
 * 转换 Anthropic stop_reason 为统一格式
 */
function toStopReason(stopReason: string): StopReason {
  switch (stopReason) {
    case "end_turn":
      return "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "tool_use":
      return "tool_use";
    case "stop_sequence":
      return "stop_sequence";
    default:
      return "end_turn";
  }
}

/**
 * 从 Anthropic 响应内容块中提取工具调用和文本
 */
function extractContent(blocks: AnthropicContentBlock[]): {
  text: string;
  toolCalls: ToolCall[];
} {
  let text = "";
  const toolCalls: ToolCall[] = [];

  for (const block of blocks) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input),
      });
    }
  }

  return { text, toolCalls };
}

/**
 * Anthropic 模型提供商
 * 支持 Claude 系列模型
 */
export function createAnthropicProvider(config: ModelProviderConfig): ModelProvider {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com";
  const defaultModel = config.defaultModel ?? "claude-sonnet-4-20250514";

  return {
    name: "anthropic",

    async complete(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
      const model = request.model ?? defaultModel;
      const { system, messages } = toAnthropicMessages(request.messages);

      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: request.maxTokens ?? 4096,
      };

      if (system) body.system = system;
      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
      }
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.stop) body.stop_sequences = request.stop;

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new ModelError(
          `Anthropic API 错误 (${response.status}): ${errorText}`,
        );
      }

      const data = (await response.json()) as AnthropicResponse;
      const { text, toolCalls } = extractContent(data.content);

      return {
        content: text,
        toolCalls,
        stopReason: toStopReason(data.stop_reason),
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
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
      const { system, messages } = toAnthropicMessages(request.messages);

      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: request.maxTokens ?? 4096,
        stream: true,
      };

      if (system) body.system = system;
      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
      }
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.stop) body.stop_sequences = request.stop;

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new ModelError(
          `Anthropic API 流式错误 (${response.status}): ${errorText}`,
        );
      }

      if (!response.body) {
        throw new ModelError("Anthropic API 未返回流式数据");
      }

      let fullContent = "";
      let responseModel = model;
      let stopReason: StopReason = "end_turn";
      let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const toolCalls: ToolCall[] = [];
      let currentToolId = "";
      let currentToolName = "";
      let currentToolArgs = "";

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);

            let event: AnthropicStreamEvent;
            try {
              event = JSON.parse(data) as AnthropicStreamEvent;
            } catch {
              continue;
            }

            switch (event.type) {
              case "message_start":
                if (event.message) {
                  responseModel = event.message.model;
                  usage = {
                    promptTokens: event.message.usage.input_tokens,
                    completionTokens: 0,
                    totalTokens: event.message.usage.input_tokens,
                  };
                }
                break;

              case "content_block_start":
                if (event.content_block?.type === "tool_use") {
                  currentToolId = event.content_block.id;
                  currentToolName = event.content_block.name;
                  currentToolArgs = "";
                  callback({
                    type: "tool_call_start",
                    toolCall: { id: currentToolId, name: currentToolName },
                  });
                }
                break;

              case "content_block_delta":
                if (event.delta?.type === "text_delta" && event.delta.text) {
                  fullContent += event.delta.text;
                  callback({ type: "text_delta", text: event.delta.text });
                } else if (
                  event.delta?.type === "input_json_delta" &&
                  event.delta.partial_json
                ) {
                  currentToolArgs += event.delta.partial_json;
                  callback({ type: "tool_call_delta", arguments: event.delta.partial_json });
                }
                break;

              case "content_block_stop":
                if (currentToolId) {
                  toolCalls.push({
                    id: currentToolId,
                    name: currentToolName,
                    arguments: currentToolArgs,
                  });
                  callback({ type: "tool_call_end" });
                  currentToolId = "";
                  currentToolName = "";
                  currentToolArgs = "";
                }
                break;

              case "message_delta":
                if (event.delta?.stop_reason) {
                  stopReason = toStopReason(event.delta.stop_reason);
                }
                if (event.usage) {
                  usage = {
                    promptTokens: usage.promptTokens,
                    completionTokens: event.usage.output_tokens,
                    totalTokens: usage.promptTokens + event.usage.output_tokens,
                  };
                }
                break;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const result: ModelResponse = {
        content: fullContent,
        toolCalls,
        stopReason,
        usage,
        model: responseModel,
      };

      callback({ type: "done", response: result });
      return result;
    },
  };
}
