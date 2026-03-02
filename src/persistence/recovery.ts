/**
 * 状态恢复管理器
 *
 * 检测状态文件 → 校验版本和 TTL → 重建状态。
 * 恢复时将 working 状态的节点转为 paused，防止重复执行。
 */

import type {
  RecoveryManager,
  RecoveryResult,
  PersistenceManager,
  PersistenceDeps,
} from "./types.js";
import { isCompatibleVersion, isWithinTTL, countActiveAgents, countCompletedSteps } from "./snapshot.js";
import { TreeState, TaskState } from "../core/types.js";
import type { ExecutionTree, ExecutionNode } from "../core/types.js";

/**
 * 将执行树中正在运行的节点转为暂停
 *
 * 恢复时，working 状态的节点说明在中断时正在执行，
 * 需要转为 paused 以便系统决定是否重新执行。
 */
export function pauseWorkingNodes(tree: ExecutionTree): ExecutionTree {
  const updatedNodes: Record<string, ExecutionNode> = {};
  let hasChanges = false;

  for (const [id, node] of Object.entries(tree.nodes)) {
    if (node.state === TaskState.Working) {
      updatedNodes[id] = { ...node, state: TaskState.Paused };
      hasChanges = true;
    } else {
      updatedNodes[id] = node;
    }
  }

  if (!hasChanges) return tree;

  return {
    ...tree,
    nodes: updatedNodes,
    state: tree.state === TreeState.Running ? TreeState.Paused : tree.state,
  };
}

/**
 * 统计已完成的步骤数（用于恢复报告）
 */
export function countCompletedNodes(tree: ExecutionTree): number {
  return Object.values(tree.nodes).filter(
    (node) => node.state === TaskState.Completed,
  ).length;
}

/**
 * 创建恢复管理器
 */
export function createRecoveryManager(
  persistenceManager: PersistenceManager,
  deps: PersistenceDeps,
): RecoveryManager {
  const config = deps.config;

  async function hasRecoverableSnapshot(): Promise<boolean> {
    if (!config.enableAutoRecovery) return false;

    const snapshot = await persistenceManager.loadLatestSnapshot();
    if (!snapshot) return false;

    // 版本兼容性检查
    if (!isCompatibleVersion(snapshot)) {
      deps.logger.warn("recovery", "快照版本不兼容", {
        snapshotVersion: snapshot.schemaVersion,
      });
      return false;
    }

    // TTL 检查
    if (!isWithinTTL(snapshot, config.recoveryTTLSecs)) {
      deps.logger.warn("recovery", "快照已过期", {
        timestamp: snapshot.timestamp,
        ttlSecs: config.recoveryTTLSecs,
      });
      return false;
    }

    // 检查是否有活跃 Agent
    const activeCount = countActiveAgents(snapshot);
    return activeCount > 0;
  }

  async function recover(): Promise<RecoveryResult> {
    const snapshot = await persistenceManager.loadLatestSnapshot();

    if (!snapshot) {
      return {
        success: false,
        snapshot: null,
        message: "未找到可恢复的状态快照",
        restoredAgentCount: 0,
        skippedStepCount: 0,
      };
    }

    // 版本检查
    if (!isCompatibleVersion(snapshot)) {
      return {
        success: false,
        snapshot,
        message: `快照版本不兼容: ${snapshot.schemaVersion}`,
        restoredAgentCount: 0,
        skippedStepCount: 0,
      };
    }

    // TTL 检查
    if (!isWithinTTL(snapshot, config.recoveryTTLSecs)) {
      return {
        success: false,
        snapshot,
        message: `快照已过期: ${snapshot.timestamp}`,
        restoredAgentCount: 0,
        skippedStepCount: 0,
      };
    }

    // 暂停所有 working 节点
    const restoredAgentTree = { ...snapshot.agentTree };
    let totalSkippedSteps = 0;
    let restoredCount = 0;

    for (const [agentId, agentNode] of Object.entries(snapshot.agentTree)) {
      if (agentNode.status === "running" || agentNode.status === "paused") {
        restoredCount++;

        if (agentNode.executionTree) {
          const pausedTree = pauseWorkingNodes(agentNode.executionTree);
          totalSkippedSteps += countCompletedNodes(pausedTree);

          restoredAgentTree[agentId] = {
            ...agentNode,
            executionTree: pausedTree,
            status: "paused",
          };
        } else {
          restoredAgentTree[agentId] = {
            ...agentNode,
            status: "paused",
          };
        }
      } else {
        // 已完成/失败的 Agent 跳过已完成步骤
        if (agentNode.executionTree) {
          totalSkippedSteps += countCompletedSteps(snapshot);
        }
      }
    }

    deps.logger.info("recovery", "状态恢复完成", {
      snapshotId: snapshot.snapshotId,
      restoredAgents: restoredCount,
      skippedSteps: totalSkippedSteps,
    });

    return {
      success: true,
      snapshot: { ...snapshot, agentTree: restoredAgentTree },
      message: `成功恢复 ${restoredCount} 个 Agent，跳过 ${totalSkippedSteps} 个已完成步骤`,
      restoredAgentCount: restoredCount,
      skippedStepCount: totalSkippedSteps,
    };
  }

  async function markRecovered(snapshotId: string): Promise<void> {
    // 恢复完成后删除已使用的快照
    await persistenceManager.deleteSnapshot(snapshotId);
    deps.logger.info("recovery", `已标记快照为已恢复: ${snapshotId}`);
  }

  return { hasRecoverableSnapshot, recover, markRecovered };
}
