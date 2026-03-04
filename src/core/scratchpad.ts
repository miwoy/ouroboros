/**
 * Scratchpad — 步骤日志注入
 *
 * 在每次模型调用前，将历史步骤摘要注入到消息中，
 * 防止模型在长任务中遗忘早期工具调用结果。
 */

import type { ToolCallResult } from "./types.js";

/** 步骤日志条目 */
export interface StepLogEntry {
  readonly stepIndex: number;
  readonly toolId: string;
  readonly inputSummary: string;
  readonly outputSummary: string;
  readonly success: boolean;
}

/** 截断展示阈值 */
const MAX_FULL_ENTRIES = 30;
/** 截断时保留头部条数 */
const HEAD_ENTRIES = 5;
/** 截断时保留尾部条数 */
const TAIL_ENTRIES = 25;

/**
 * 将字符串截断到指定长度
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}

/**
 * 格式化单条日志
 */
function formatEntry(entry: StepLogEntry): string {
  const status = entry.success ? "成功" : "失败";
  const summary = entry.success ? entry.outputSummary : entry.outputSummary || "无输出";
  return `[步骤 ${entry.stepIndex + 1}] ${entry.toolId} → ${status}: ${summary}`;
}

/**
 * 构建 scratchpad 文本
 *
 * - 空列表返回空字符串
 * - ≤30 条全部展示
 * - >30 条：前 5 条 + 省略提示 + 最后 25 条
 */
export function buildScratchpad(entries: readonly StepLogEntry[]): string {
  if (entries.length === 0) return "";

  if (entries.length <= MAX_FULL_ENTRIES) {
    return entries.map(formatEntry).join("\n");
  }

  const head = entries.slice(0, HEAD_ENTRIES).map(formatEntry);
  const tail = entries.slice(-TAIL_ENTRIES).map(formatEntry);
  const omitted = entries.length - HEAD_ENTRIES - TAIL_ENTRIES;

  return [...head, `...省略 ${omitted} 条...`, ...tail].join("\n");
}

/**
 * 从 ToolCallResult 创建日志条目
 */
export function toStepLogEntry(stepIndex: number, tcr: ToolCallResult): StepLogEntry {
  const inputSummary = truncate(JSON.stringify(tcr.input), 100);
  const outputSummary = tcr.success
    ? truncate(tcr.output ? JSON.stringify(tcr.output) : "成功", 200)
    : truncate(tcr.error ?? "未知错误", 200);

  return {
    stepIndex,
    toolId: tcr.toolId,
    inputSummary,
    outputSummary,
    success: tcr.success,
  };
}
