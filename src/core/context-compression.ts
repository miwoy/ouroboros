/**
 * 上下文压缩
 *
 * 当消息历史超过阈值时，将旧消息压缩为摘要。
 * - 保留首条 system 消息 + 最近 keepCount 条消息
 * - 中间部分用 callModel 生成摘要
 * - 压缩失败时回退到截断（保留首尾消息）
 */

import type { Message } from "../model/types.js";
import type { CallModelFn } from "../tool/types.js";

/** 默认保留最近消息条数 */
const DEFAULT_KEEP_COUNT = 4;

/** 摘要生成的系统提示词 */
const SUMMARY_SYSTEM_PROMPT =
  "你是对话摘要助手。请将以下对话内容压缩为简洁的摘要，" +
  "保留关键信息（已完成的步骤、重要结果、待处理的任务），" +
  "删除冗余细节。输出纯文本摘要，不要使用 markdown 格式。";

/**
 * 压缩上下文消息
 *
 * @param messages - 当前消息列表
 * @param threshold - 触发压缩的消息数阈值
 * @param callModel - 模型调用函数（用于生成摘要）
 * @returns 压缩后的消息列表
 */
export async function compressContext(
  messages: readonly Message[],
  threshold: number,
  callModel: CallModelFn,
): Promise<readonly Message[]> {
  // 未超阈值，原样返回
  if (messages.length <= threshold) {
    return messages;
  }

  // 分离 system 消息和非 system 消息
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  if (nonSystemMessages.length <= DEFAULT_KEEP_COUNT) {
    return messages;
  }

  // 需要压缩的消息（中间部分）
  const toCompress = nonSystemMessages.slice(0, -DEFAULT_KEEP_COUNT);
  // 保留的最近消息
  const toKeep = nonSystemMessages.slice(-DEFAULT_KEEP_COUNT);

  try {
    // 用模型生成摘要
    const compressText = toCompress
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");

    const response = await callModel({
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: compressText },
      ],
      temperature: 0,
      maxTokens: 500,
    });

    const summaryMessage: Message = {
      role: "user",
      content: `[对话摘要] ${response.content}`,
    };

    return [...systemMessages, summaryMessage, ...toKeep];
  } catch {
    // 压缩失败，回退到截断
    return fallbackCompression(messages, DEFAULT_KEEP_COUNT);
  }
}

/**
 * 回退压缩策略：保留 system + 首条用户消息 + 最近 keepCount 条消息
 *
 * @param messages - 当前消息列表
 * @param keepCount - 保留最近消息条数
 * @returns 截断后的消息列表
 */
export function fallbackCompression(
  messages: readonly Message[],
  keepCount: number,
): readonly Message[] {
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  if (nonSystemMessages.length <= keepCount + 1) {
    return messages;
  }

  // 保留首条非 system 消息（通常是用户任务）+ 最近 keepCount 条
  const first = nonSystemMessages[0]!;
  const recent = nonSystemMessages.slice(-keepCount);

  return [...systemMessages, first, ...recent];
}
