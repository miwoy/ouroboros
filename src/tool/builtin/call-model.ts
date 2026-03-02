/**
 * tool:call-model — 内置模型调用工具
 *
 * 包装现有 callModel 函数为标准工具接口。
 * 从 context.callModel 调用，将 ModelResponse 映射为工具输出。
 */

import type { Message, ModelRequest } from "../../model/types.js";
import { ToolExecutionError } from "../../errors/index.js";
import { callModelInputSchema } from "../schema.js";
import type { ToolHandler } from "../types.js";

/** call-model 工具处理函数 */
export const handleCallModel: ToolHandler = async (input, context) => {
  // 校验输入
  const parsed = callModelInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ToolExecutionError(`call-model 输入校验失败: ${parsed.error.message}`);
  }

  const { messages, model, temperature, maxTokens, provider } = parsed.data;

  // 构建 ModelRequest
  const request: ModelRequest = {
    messages: messages as readonly Message[],
    model,
    temperature,
    maxTokens,
  };

  // 调用模型
  const response = await context.callModel(request, {
    provider,
    signal: context.signal,
  });

  return {
    content: response.content,
    model: response.model,
    stopReason: response.stopReason,
    toolCalls: response.toolCalls,
    usage: {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    },
  };
};
