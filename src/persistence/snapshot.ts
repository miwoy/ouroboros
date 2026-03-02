/**
 * 状态快照创建与序列化
 *
 * 从运行时状态构建 SystemStateSnapshot，
 * 支持序列化/反序列化。
 */

import { randomUUID } from "node:crypto";
import { platform } from "node:os";
import type {
  SystemStateSnapshot,
  AgentStateNode,
  CheckpointTrigger,
  SnapshotMetadata,
} from "./types.js";
import { SNAPSHOT_SCHEMA_VERSION } from "./types.js";
import type { ExecutionTree } from "../core/types.js";

/** 快照构建参数 */
export interface SnapshotBuildParams {
  /** 触发类型 */
  readonly trigger: CheckpointTrigger;
  /** 系统启动时间 */
  readonly startTime: number;
  /** 任务描述 */
  readonly taskDescription: string;
  /** Agent 状态列表 */
  readonly agents: readonly AgentStateInput[];
  /** 根 Agent ID 列表 */
  readonly rootAgentIds: readonly string[];
}

/** Agent 状态输入（用于构建快照） */
export interface AgentStateInput {
  readonly agentId: string;
  readonly name: string;
  readonly executionTree: ExecutionTree | null;
  readonly hotSessionSnapshot: readonly string[];
  readonly childAgentIds: readonly string[];
  readonly status: AgentStateNode["status"];
}

/**
 * 创建系统状态快照
 */
export function createSnapshot(params: SnapshotBuildParams): SystemStateSnapshot {
  const now = Date.now();
  const agentTree: Record<string, AgentStateNode> = {};

  for (const agent of params.agents) {
    agentTree[agent.agentId] = {
      agentId: agent.agentId,
      name: agent.name,
      executionTree: agent.executionTree,
      hotSessionSnapshot: agent.hotSessionSnapshot,
      childAgentIds: agent.childAgentIds,
      status: agent.status,
    };
  }

  const metadata: SnapshotMetadata = {
    trigger: params.trigger,
    uptimeMs: now - params.startTime,
    nodeVersion: process.version,
    platform: platform(),
  };

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    timestamp: new Date(now).toISOString(),
    snapshotId: randomUUID(),
    agentTree,
    rootAgentIds: params.rootAgentIds,
    taskDescription: params.taskDescription,
    metadata,
  };
}

/**
 * 序列化快照为 JSON 字符串
 */
export function serializeSnapshot(snapshot: SystemStateSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * 反序列化 JSON 字符串为快照
 *
 * @throws 解析失败时抛出错误
 */
export function deserializeSnapshot(json: string): SystemStateSnapshot {
  const parsed = JSON.parse(json) as SystemStateSnapshot;

  // 基本字段验证
  if (!parsed.schemaVersion || !parsed.snapshotId || !parsed.timestamp) {
    throw new Error("快照格式无效：缺少必需字段");
  }

  if (!parsed.agentTree || typeof parsed.agentTree !== "object") {
    throw new Error("快照格式无效：agentTree 缺失或格式错误");
  }

  return parsed;
}

/**
 * 检查快照 schema 版本是否兼容
 */
export function isCompatibleVersion(snapshot: SystemStateSnapshot): boolean {
  // 主版本号必须匹配
  const [snapshotMajor] = snapshot.schemaVersion.split(".");
  const [currentMajor] = SNAPSHOT_SCHEMA_VERSION.split(".");
  return snapshotMajor === currentMajor;
}

/**
 * 检查快照是否在 TTL 范围内
 *
 * @param snapshot - 快照
 * @param ttlSecs - TTL 秒数
 * @returns 是否在有效期内
 */
export function isWithinTTL(snapshot: SystemStateSnapshot, ttlSecs: number): boolean {
  const snapshotTime = new Date(snapshot.timestamp).getTime();
  const now = Date.now();
  const elapsed = (now - snapshotTime) / 1000;
  return elapsed <= ttlSecs;
}

/**
 * 获取快照中正在运行或暂停的 Agent 数量
 */
export function countActiveAgents(snapshot: SystemStateSnapshot): number {
  return Object.values(snapshot.agentTree).filter(
    (agent) => agent.status === "running" || agent.status === "paused",
  ).length;
}

/**
 * 获取快照中已完成步骤数
 */
export function countCompletedSteps(snapshot: SystemStateSnapshot): number {
  let count = 0;
  for (const agent of Object.values(snapshot.agentTree)) {
    if (agent.executionTree) {
      for (const node of Object.values(agent.executionTree.nodes)) {
        if (node.state === "completed") {
          count++;
        }
      }
    }
  }
  return count;
}
