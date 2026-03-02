/**
 * 异常处理：回滚、终止、死循环检测
 *
 * 提供执行树的异常处理机制：
 * - 回滚到指定节点
 * - 终止子树或整棵树
 * - 检测可能的死循环（连续调用相同工具+相同参数）
 * - 构建异常提示词（用于 inject-prompt）
 * - 应用审查干预动作
 */

import { ExecutionTreeError } from "../errors/index.js";
import {
  updateNodeState,
  updateTreeState,
  setActiveNode,
  getDescendantIds,
} from "./execution-tree.js";
import {
  TaskState,
  TreeState,
  ExceptionType,
  NodeType,
  type ExecutionTree,
  type ExecutionNode,
  type ExceptionReport,
  type InspectorAction,
} from "./types.js";

/** 终态集合 */
const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  TaskState.Completed,
  TaskState.Failed,
  TaskState.Cancelled,
]);

/**
 * 回滚到指定节点
 *
 * 将 targetNodeId 之后创建的节点标记为 cancelled，活跃节点回退到 targetNodeId。
 *
 * @param tree - 执行树
 * @param targetNodeId - 目标回滚节点
 * @param reason - 回滚原因
 * @returns 更新后的执行树和异常报告
 */
export function rollbackToNode(
  tree: ExecutionTree,
  targetNodeId: string,
  reason: string,
): { readonly tree: ExecutionTree; readonly report: ExceptionReport } {
  const targetNode = tree.nodes[targetNodeId];
  if (!targetNode) {
    throw new ExecutionTreeError(`回滚目标节点 "${targetNodeId}" 不存在`);
  }

  // 获取 targetNodeId 的所有后代
  const descendantIds = getDescendantIds(tree, targetNodeId);

  // 将所有非终态后代标记为 cancelled
  let updatedTree = tree;
  for (const descId of descendantIds) {
    const node = updatedTree.nodes[descId];
    if (node && !TERMINAL_STATES.has(node.state)) {
      updatedTree = updateNodeState(updatedTree, descId, TaskState.Cancelled);
    }
  }

  // 将 targetNode 重置为 working（如果不在终态）
  if (!TERMINAL_STATES.has(updatedTree.nodes[targetNodeId]!.state)) {
    updatedTree = updateNodeState(updatedTree, targetNodeId, TaskState.Working);
  }

  // 设置活跃节点
  updatedTree = setActiveNode(updatedTree, targetNodeId);

  const report: ExceptionReport = {
    treeId: tree.id,
    nodeId: targetNodeId,
    exceptionType: ExceptionType.AgentDeviation,
    description: `回滚到节点 "${targetNodeId}": ${reason}`,
    suggestedAction: "rollback",
    timestamp: new Date().toISOString(),
  };

  return { tree: updatedTree, report };
}

/**
 * 终止子树
 *
 * 递归取消 nodeId 下所有非终态子节点。
 *
 * @param tree - 执行树
 * @param nodeId - 目标节点
 * @param reason - 终止原因
 * @returns 更新后的执行树和异常报告
 */
export function terminateSubtree(
  tree: ExecutionTree,
  nodeId: string,
  reason: string,
): { readonly tree: ExecutionTree; readonly report: ExceptionReport } {
  const node = tree.nodes[nodeId];
  if (!node) {
    throw new ExecutionTreeError(`终止目标节点 "${nodeId}" 不存在`);
  }

  let updatedTree = tree;

  // 终止自身（如果不在终态）
  if (!TERMINAL_STATES.has(node.state)) {
    updatedTree = updateNodeState(updatedTree, nodeId, TaskState.Cancelled);
  }

  // 终止所有后代
  const descendantIds = getDescendantIds(updatedTree, nodeId);
  for (const descId of descendantIds) {
    const descNode = updatedTree.nodes[descId];
    if (descNode && !TERMINAL_STATES.has(descNode.state)) {
      updatedTree = updateNodeState(updatedTree, descId, TaskState.Cancelled);
    }
  }

  const report: ExceptionReport = {
    treeId: tree.id,
    nodeId,
    exceptionType: ExceptionType.AgentDeviation,
    description: `子树终止 "${nodeId}": ${reason}`,
    suggestedAction: "terminate",
    timestamp: new Date().toISOString(),
  };

  return { tree: updatedTree, report };
}

/**
 * 终止整棵执行树
 */
export function terminateTree(
  tree: ExecutionTree,
  reason: string,
): { readonly tree: ExecutionTree; readonly report: ExceptionReport } {
  const result = terminateSubtree(tree, tree.rootNodeId, reason);
  const updatedTree = updateTreeState(result.tree, TreeState.Cancelled);

  const report: ExceptionReport = {
    ...result.report,
    description: `执行树终止: ${reason}`,
  };

  return { tree: updatedTree, report };
}

/**
 * 检测可能的死循环
 *
 * 检查最近 N 个 tool-call 节点，如果相同工具+相同 summary 连续出现 ≥3 次，
 * 则判定为可能的死循环。
 *
 * @param tree - 执行树
 * @param windowSize - 检查窗口大小（默认 6）
 * @returns 异常报告（无循环返回 null）
 */
export function detectPossibleLoop(
  tree: ExecutionTree,
  windowSize: number = 6,
): ExceptionReport | null {
  // 收集所有 tool-call 节点，按创建时间排序
  const toolCallNodes = Object.values(tree.nodes)
    .filter((n): n is ExecutionNode => n.nodeType === NodeType.ToolCall)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (toolCallNodes.length < 3) return null;

  // 取最近 windowSize 个
  const recentNodes = toolCallNodes.slice(-windowSize);

  // 检查连续重复模式
  let consecutiveCount = 1;
  let lastSignature = getNodeSignature(recentNodes[0]!);

  for (let i = 1; i < recentNodes.length; i++) {
    const sig = getNodeSignature(recentNodes[i]!);
    if (sig === lastSignature) {
      consecutiveCount++;
      if (consecutiveCount >= 3) {
        return {
          treeId: tree.id,
          nodeId: recentNodes[i]!.id,
          exceptionType: ExceptionType.PossibleLoop,
          description: `检测到可能的死循环：工具 "${recentNodes[i]!.summary}" 连续调用 ${consecutiveCount} 次`,
          suggestedAction: "terminate",
          timestamp: new Date().toISOString(),
        };
      }
    } else {
      consecutiveCount = 1;
      lastSignature = sig;
    }
  }

  return null;
}

/**
 * 获取节点签名（用于循环检测）
 */
function getNodeSignature(node: ExecutionNode): string {
  return `${node.nodeType}:${node.summary}`;
}

/**
 * 构建异常提示词
 *
 * 将异常报告转换为可注入对话的提示词文本。
 */
export function buildExceptionPrompt(report: ExceptionReport): string {
  const actionMap: Readonly<Record<string, string>> = {
    rollback: "请回退到之前的步骤重新尝试",
    terminate: "请停止当前操作并向用户报告",
    "inject-prompt": "请根据以下指导调整策略",
    pause: "请暂停当前操作等待进一步指示",
    resume: "请继续执行",
  };

  const action = actionMap[report.suggestedAction] ?? "请调整策略";

  return [
    `[系统异常通知]`,
    `异常类型: ${report.exceptionType}`,
    `描述: ${report.description}`,
    `建议操作: ${action}`,
    `请根据以上信息调整你的下一步行动。`,
  ].join("\n");
}

/**
 * 应用审查干预动作
 */
export function applyInspectorAction(tree: ExecutionTree, action: InspectorAction): ExecutionTree {
  switch (action.action) {
    case "rollback": {
      if (!action.targetNodeId) {
        throw new ExecutionTreeError("rollback 动作需要 targetNodeId");
      }
      return rollbackToNode(tree, action.targetNodeId, action.reason).tree;
    }
    case "terminate": {
      if (action.targetNodeId) {
        return terminateSubtree(tree, action.targetNodeId, action.reason).tree;
      }
      return terminateTree(tree, action.reason).tree;
    }
    case "pause": {
      return updateTreeState(tree, TreeState.Paused);
    }
    case "resume": {
      return updateTreeState(tree, TreeState.Running);
    }
    case "inject-prompt": {
      // inject-prompt 不直接修改树，由循环层处理
      return tree;
    }
    default:
      return tree;
  }
}
