/**
 * 审查规则集
 *
 * 每个规则检查执行树的特定异常模式：
 * - 死循环：连续相同工具+参数调用
 * - 高重试率：单节点重试过多
 * - 超时：执行时间超过限制
 * - 资源耗尽：内存或磁盘不足
 */

import { ExceptionType, NodeType, type ExecutionNode } from "../core/types.js";
import type { ExceptionReport } from "../core/types.js";
import type { InspectionContext } from "./types.js";

/**
 * 检查死循环
 *
 * 检查最近 N 个 tool-call 节点，相同工具+相同 summary 连续出现 ≥ threshold 次则报告。
 */
export function checkDeadLoop(context: InspectionContext): ExceptionReport | null {
  const { tree, config } = context;
  const threshold = config.loopDetectionThreshold;

  const toolCallNodes = Object.values(tree.nodes)
    .filter((n): n is ExecutionNode => n.nodeType === NodeType.ToolCall)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (toolCallNodes.length < threshold) return null;

  const recent = toolCallNodes.slice(-(threshold * 2));
  let consecutiveCount = 1;
  let lastSig = nodeSignature(recent[0]!);

  for (let i = 1; i < recent.length; i++) {
    const sig = nodeSignature(recent[i]!);
    if (sig === lastSig) {
      consecutiveCount++;
      if (consecutiveCount >= threshold) {
        return {
          treeId: tree.id,
          nodeId: recent[i]!.id,
          exceptionType: ExceptionType.PossibleLoop,
          description: `死循环：工具 "${recent[i]!.summary}" 连续调用 ${consecutiveCount} 次`,
          suggestedAction: "terminate",
          timestamp: new Date().toISOString(),
        };
      }
    } else {
      consecutiveCount = 1;
      lastSig = sig;
    }
  }

  return null;
}

/**
 * 检查高重试率
 *
 * 任何节点 retryCount > maxRetryThreshold 则报告。
 */
export function checkHighRetry(context: InspectionContext): ExceptionReport | null {
  const { tree, config } = context;

  for (const node of Object.values(tree.nodes)) {
    if (node.retryCount > config.maxRetryThreshold) {
      return {
        treeId: tree.id,
        nodeId: node.id,
        exceptionType: ExceptionType.ToolFailure,
        description: `节点 "${node.summary}" 重试 ${node.retryCount} 次，超过阈值 ${config.maxRetryThreshold}`,
        suggestedAction: "terminate",
        timestamp: new Date().toISOString(),
      };
    }
  }

  return null;
}

/**
 * 检查执行超时
 */
export function checkTimeout(context: InspectionContext): ExceptionReport | null {
  const { tree, config, startTime } = context;
  const elapsed = (Date.now() - startTime) / 1000;

  if (elapsed > config.maxExecutionTimeSecs) {
    return {
      treeId: tree.id,
      nodeId: tree.activeNodeId,
      exceptionType: ExceptionType.Timeout,
      description: `执行时间 ${Math.round(elapsed)}s 超过限制 ${config.maxExecutionTimeSecs}s`,
      suggestedAction: "terminate",
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * 检查资源耗尽
 */
export function checkResourceExhausted(context: InspectionContext): ExceptionReport | null {
  const { tree, bodySchema, config } = context;
  const availableMB = parseFloat(bodySchema.memory.availableGB) * 1024;

  if (!isNaN(availableMB) && availableMB < config.minAvailableMemoryMB) {
    return {
      treeId: tree.id,
      nodeId: tree.activeNodeId,
      exceptionType: ExceptionType.ResourceExhausted,
      description: `可用内存 ${Math.round(availableMB)}MB 低于阈值 ${config.minAvailableMemoryMB}MB`,
      suggestedAction: "pause",
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

/** 节点签名（工具类型 + summary） */
function nodeSignature(node: ExecutionNode): string {
  return `${node.nodeType}:${node.summary}`;
}
