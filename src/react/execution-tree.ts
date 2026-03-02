/**
 * 执行树管理（纯函数，不可变操作）
 *
 * 所有操作返回新的不可变对象，不修改输入。
 * 提供创建、添加节点、状态变更、序列化等功能。
 */

import { randomUUID } from "node:crypto";
import { ExecutionTreeError } from "../errors/index.js";
import { TaskState, TreeState, NodeType, type ExecutionNode, type ExecutionTree } from "./types.js";

/** 终态集合：节点处于这些状态时不可再变更 */
const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  TaskState.Completed,
  TaskState.Failed,
  TaskState.Cancelled,
]);

/**
 * 创建执行树
 *
 * @param agentId - Agent ID
 * @param taskDescription - 任务描述（作为 root 节点 summary）
 * @returns 新的执行树
 */
export function createExecutionTree(agentId: string, taskDescription: string): ExecutionTree {
  const treeId = randomUUID();
  const rootNodeId = randomUUID();
  const now = new Date().toISOString();

  const rootNode: ExecutionNode = {
    id: rootNodeId,
    parentId: null,
    taskId: treeId,
    state: TaskState.Working,
    nodeType: NodeType.Root,
    summary: taskDescription,
    children: [],
    retryCount: 0,
    createdAt: now,
  };

  return {
    id: treeId,
    agentId,
    rootNodeId,
    nodes: { [rootNodeId]: rootNode },
    activeNodeId: rootNodeId,
    state: TreeState.Running,
    createdAt: now,
  };
}

/**
 * 添加子节点
 *
 * @param tree - 当前执行树
 * @param parentId - 父节点 ID
 * @param nodeData - 节点数据（nodeType, summary）
 * @returns 包含新树和新节点 ID 的对象
 */
export function addNode(
  tree: ExecutionTree,
  parentId: string,
  nodeData: { readonly nodeType: NodeType; readonly summary: string },
): { readonly tree: ExecutionTree; readonly nodeId: string } {
  const parent = tree.nodes[parentId];
  if (!parent) {
    throw new ExecutionTreeError(`父节点 "${parentId}" 不存在`);
  }

  const nodeId = randomUUID();
  const now = new Date().toISOString();

  const newNode: ExecutionNode = {
    id: nodeId,
    parentId,
    taskId: tree.id,
    state: TaskState.Working,
    nodeType: nodeData.nodeType,
    summary: nodeData.summary,
    children: [],
    retryCount: 0,
    createdAt: now,
  };

  // 更新父节点的 children
  const updatedParent: ExecutionNode = {
    ...parent,
    children: [...parent.children, nodeId],
  };

  return {
    tree: {
      ...tree,
      nodes: {
        ...tree.nodes,
        [parentId]: updatedParent,
        [nodeId]: newNode,
      },
      activeNodeId: nodeId,
    },
    nodeId,
  };
}

/**
 * 更新节点状态
 */
export function updateNodeState(
  tree: ExecutionTree,
  nodeId: string,
  state: TaskState,
  resultSummary?: string,
): ExecutionTree {
  const node = tree.nodes[nodeId];
  if (!node) {
    throw new ExecutionTreeError(`节点 "${nodeId}" 不存在`);
  }

  if (TERMINAL_STATES.has(node.state)) {
    throw new ExecutionTreeError(`节点 "${nodeId}" 已处于终态 "${node.state}"，不可变更`);
  }

  const updatedNode: ExecutionNode = {
    ...node,
    state,
    ...(resultSummary !== undefined ? { resultSummary } : {}),
    ...(TERMINAL_STATES.has(state) ? { completedAt: new Date().toISOString() } : {}),
  };

  return {
    ...tree,
    nodes: { ...tree.nodes, [nodeId]: updatedNode },
  };
}

/**
 * 完成节点
 */
export function completeNode(
  tree: ExecutionTree,
  nodeId: string,
  resultSummary: string,
): ExecutionTree {
  return updateNodeState(tree, nodeId, TaskState.Completed, resultSummary);
}

/**
 * 标记节点失败
 */
export function failNode(tree: ExecutionTree, nodeId: string, errorSummary: string): ExecutionTree {
  return updateNodeState(tree, nodeId, TaskState.Failed, errorSummary);
}

/**
 * 设置活跃节点
 */
export function setActiveNode(tree: ExecutionTree, nodeId: string): ExecutionTree {
  if (!tree.nodes[nodeId]) {
    throw new ExecutionTreeError(`节点 "${nodeId}" 不存在`);
  }
  return { ...tree, activeNodeId: nodeId };
}

/**
 * 更新执行树状态
 */
export function updateTreeState(tree: ExecutionTree, state: TreeState): ExecutionTree {
  return { ...tree, state };
}

/**
 * 获取从根到指定节点的路径
 */
export function getNodePath(tree: ExecutionTree, nodeId: string): readonly ExecutionNode[] {
  const path: ExecutionNode[] = [];
  let currentId: string | null = nodeId;

  while (currentId !== null) {
    const found: ExecutionNode | undefined = tree.nodes[currentId];
    if (!found) break;
    path.unshift(found);
    currentId = found.parentId;
  }

  return path;
}

/**
 * 获取节点的所有后代 ID（递归）
 */
export function getDescendantIds(tree: ExecutionTree, nodeId: string): readonly string[] {
  const node = tree.nodes[nodeId];
  if (!node) return [];

  const descendants: string[] = [];
  const queue = [...node.children];

  while (queue.length > 0) {
    const childId = queue.shift()!;
    descendants.push(childId);
    const child = tree.nodes[childId];
    if (child) {
      queue.push(...child.children);
    }
  }

  return descendants;
}

/**
 * 序列化执行树为 JSON 字符串
 */
export function treeToJSON(tree: ExecutionTree): string {
  return JSON.stringify(tree, null, 2);
}

/**
 * 从 JSON 字符串反序列化执行树
 */
export function treeFromJSON(json: string): ExecutionTree {
  try {
    return JSON.parse(json) as ExecutionTree;
  } catch (err) {
    throw new ExecutionTreeError(
      `执行树反序列化失败: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
