/**
 * 响应格式化
 *
 * 将 Agent 响应格式化为人类可读的 Markdown 格式。
 */

import type { ReactStep } from "../core/types.js";

/**
 * 格式化 Agent 回答为 Markdown
 *
 * 包含最终回答和工具调用摘要。
 */
export function formatAgentResponse(
  answer: string,
  steps: readonly ReactStep[],
): string {
  const parts: string[] = [];

  // 主回答
  parts.push(answer);

  // 如果有工具调用，添加执行摘要
  const toolSteps = steps.filter((s) => s.toolCalls.length > 0);
  if (toolSteps.length > 0) {
    parts.push("");
    parts.push("---");
    parts.push(`*共执行 ${toolSteps.length} 个步骤，调用 ${countToolCalls(steps)} 次工具*`);
  }

  return parts.join("\n");
}

/**
 * 格式化工具调用为 Markdown 块
 */
export function formatToolCall(
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  output: Readonly<Record<string, unknown>> | undefined,
  success: boolean,
): string {
  const parts: string[] = [];
  const status = success ? "success" : "failed";

  parts.push(`**${toolId}** (${status})`);
  parts.push("");
  parts.push("输入:");
  parts.push("```json");
  parts.push(JSON.stringify(input, null, 2));
  parts.push("```");

  if (output) {
    parts.push("");
    parts.push("输出:");
    parts.push("```json");
    parts.push(JSON.stringify(output, null, 2));
    parts.push("```");
  }

  return parts.join("\n");
}

/**
 * 格式化执行步骤摘要
 */
export function formatStepsSummary(steps: readonly ReactStep[]): string {
  if (steps.length === 0) return "无执行步骤";

  const lines: string[] = [];
  for (const step of steps) {
    const toolNames = step.toolCalls.map((tc) => tc.toolId).join(", ");
    const duration = `${step.duration}ms`;
    const status = step.toolCalls.every((tc) => tc.success) ? "ok" : "部分失败";
    lines.push(`${step.stepIndex + 1}. [${status}] ${toolNames || "思考"} (${duration})`);
  }

  return lines.join("\n");
}

/**
 * 统计总工具调用次数
 */
function countToolCalls(steps: readonly ReactStep[]): number {
  return steps.reduce((sum, step) => sum + step.toolCalls.length, 0);
}

/**
 * 截断长文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
