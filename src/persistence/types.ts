/**
 * 系统状态持久化类型定义
 *
 * 定义状态快照、检查点触发、恢复结果等核心数据结构。
 * 状态树 = Agent 依赖树 + 每个 Agent 的执行树
 */

import type { ExecutionTree } from "../core/types.js";
import type { Logger } from "../logger/types.js";

// ─── 状态快照 ──────────────────────────────────────────────────

/** 状态快照 schema 版本 */
export const SNAPSHOT_SCHEMA_VERSION = "1.0.0";

/** Agent 状态节点（状态树中的一个 Agent） */
export interface AgentStateNode {
  /** Agent ID (solution:xxx) */
  readonly agentId: string;
  /** Agent 名称 */
  readonly name: string;
  /** 当前执行树 */
  readonly executionTree: ExecutionTree | null;
  /** 对话历史摘要（hot session 快照） */
  readonly hotSessionSnapshot: readonly string[];
  /** 子 Agent ID 列表（依赖关系） */
  readonly childAgentIds: readonly string[];
  /** Agent 状态 */
  readonly status: "running" | "paused" | "completed" | "failed";
}

/** 系统状态快照（整体状态树） */
export interface SystemStateSnapshot {
  /** Schema 版本号 */
  readonly schemaVersion: string;
  /** 快照创建时间 */
  readonly timestamp: string;
  /** 快照 ID */
  readonly snapshotId: string;
  /** Agent 状态树（以 Agent ID 为 key） */
  readonly agentTree: Readonly<Record<string, AgentStateNode>>;
  /** 根 Agent ID 列表（入口 Agent） */
  readonly rootAgentIds: readonly string[];
  /** 整体任务描述 */
  readonly taskDescription: string;
  /** 系统元数据 */
  readonly metadata: SnapshotMetadata;
}

/** 快照元数据 */
export interface SnapshotMetadata {
  /** 创建快照的原因 */
  readonly trigger: CheckpointTrigger;
  /** 系统运行时长（毫秒） */
  readonly uptimeMs: number;
  /** Node.js 版本 */
  readonly nodeVersion: string;
  /** 平台 */
  readonly platform: string;
}

// ─── 检查点触发 ──────────────────────────────────────────────────

/** 检查点触发类型 */
export const CheckpointTrigger = {
  /** 工具调用完成 */
  ToolCompleted: "tool-completed",
  /** Agent 创建 */
  AgentCreated: "agent-created",
  /** Agent 销毁 */
  AgentDestroyed: "agent-destroyed",
  /** 审查程序干预 */
  InspectorIntervened: "inspector-intervened",
  /** 定时检查点 */
  Periodic: "periodic",
  /** 用户请求 */
  UserRequested: "user-requested",
  /** 优雅关闭 */
  GracefulShutdown: "graceful-shutdown",
} as const;
export type CheckpointTrigger = (typeof CheckpointTrigger)[keyof typeof CheckpointTrigger];

// ─── 恢复 ──────────────────────────────────────────────────

/** 恢复结果 */
export interface RecoveryResult {
  /** 是否成功恢复 */
  readonly success: boolean;
  /** 恢复的快照 */
  readonly snapshot: SystemStateSnapshot | null;
  /** 恢复信息 */
  readonly message: string;
  /** 恢复的 Agent 数量 */
  readonly restoredAgentCount: number;
  /** 跳过的已完成步骤数 */
  readonly skippedStepCount: number;
}

// ─── 完整性校验 ──────────────────────────────────────────────

/** 完整性校验记录 */
export interface IntegrityRecord {
  /** 快照文件路径 */
  readonly filePath: string;
  /** SHA-256 校验和 */
  readonly checksum: string;
  /** 文件大小（字节） */
  readonly fileSize: number;
  /** 校验时间 */
  readonly timestamp: string;
}

// ─── 持久化管理器 ──────────────────────────────────────────────

/** 持久化配置 */
export interface PersistenceConfig {
  /** 是否启用持久化 */
  readonly enabled: boolean;
  /** 检查点间隔（毫秒） */
  readonly checkpointIntervalMs: number;
  /** 快照存储路径（相对 workspace） */
  readonly snapshotDir: string;
  /** 是否启用自动恢复 */
  readonly enableAutoRecovery: boolean;
  /** 恢复 TTL（秒），超过此时间的快照不尝试恢复 */
  readonly recoveryTTLSecs: number;
  /** 最大保留快照数 */
  readonly maxSnapshots: number;
}

/** 默认持久化配置 */
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  enabled: true,
  checkpointIntervalMs: 60000,
  snapshotDir: "state",
  enableAutoRecovery: true,
  recoveryTTLSecs: 86400,
  maxSnapshots: 10,
};

/** 持久化管理器接口 */
export interface PersistenceManager {
  /** 保存快照 */
  saveSnapshot(snapshot: SystemStateSnapshot): Promise<void>;
  /** 加载最新快照 */
  loadLatestSnapshot(): Promise<SystemStateSnapshot | null>;
  /** 列出所有快照 */
  listSnapshots(): Promise<readonly IntegrityRecord[]>;
  /** 删除快照 */
  deleteSnapshot(snapshotId: string): Promise<void>;
  /** 清理过期快照（保留最新 N 个） */
  cleanup(): Promise<number>;
  /** 获取配置 */
  getConfig(): PersistenceConfig;
}

/** 恢复管理器接口 */
export interface RecoveryManager {
  /** 检查是否有可恢复的快照 */
  hasRecoverableSnapshot(): Promise<boolean>;
  /** 尝试恢复 */
  recover(): Promise<RecoveryResult>;
  /** 标记恢复完成（清除活跃快照） */
  markRecovered(snapshotId: string): Promise<void>;
}

/** 关闭处理器接口 */
export interface ShutdownHandler {
  /** 注册信号处理 */
  register(onShutdown: () => Promise<void>): void;
  /** 取消注册 */
  unregister(): void;
  /** 是否已触发关闭 */
  isShuttingDown(): boolean;
}

/** 持久化系统依赖 */
export interface PersistenceDeps {
  readonly logger: Logger;
  readonly workspacePath: string;
  readonly config: PersistenceConfig;
}
