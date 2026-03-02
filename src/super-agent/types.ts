/**
 * Super Agent 系统类型定义
 *
 * Super Agent 是多 Agent 协作的编排体，用于实现垂直领域的完整解决方案。
 * 定义协作规范、角色分工、执行模式。
 */

import type { EntityCard, EntityStatus } from "../tool/types.js";
import type { MemoryManager } from "../memory/types.js";
import type { Artifact } from "../skill/types.js";
import type { AgentExecutorDeps } from "../solution/types.js";

// ─── 协作角色 ──────────────────────────────────────────────────

/** Agent 角色定义 */
export interface AgentRole {
  /** 角色名称 */
  readonly roleName: string;
  /** 角色职责描述 */
  readonly responsibility: string;
  /** 对应的 Solution ID */
  readonly agentId: string;
  /** 依赖的其他角色名称（用于拓扑排序） */
  readonly dependsOn?: readonly string[];
}

// ─── 协作规范 ──────────────────────────────────────────────────

/** 协作模式 */
export type CollaborationMode = "sequential" | "parallel" | "orchestrated";

/** 冲突解决策略 */
export type ConflictStrategy = "orchestrator-decides" | "voting" | "user-decides";

/** 冲突解决配置 */
export interface ConflictResolution {
  readonly strategy: ConflictStrategy;
  /** 超时秒数 */
  readonly timeout: number;
}

/** 协作约束 */
export interface CollaborationConstraints {
  /** 总执行时间上限（秒） */
  readonly maxDuration?: number;
  /** 总 token 预算 */
  readonly maxTokenBudget?: number;
  /** 最大并行 Agent 数 */
  readonly maxParallelAgents?: number;
}

/** 协作规范 */
export interface CollaborationSpec {
  /** 协作模式 */
  readonly mode: CollaborationMode;
  /** 编排者 Agent ID（仅 orchestrated 模式） */
  readonly orchestratorAgentId?: string;
  /** 冲突解决 */
  readonly conflictResolution: ConflictResolution;
  /** 约束 */
  readonly constraints?: CollaborationConstraints;
}

// ─── Super Agent 定义 ──────────────────────────────────────────

/** Super Agent 定义 */
export interface SuperAgentDefinition extends EntityCard {
  /** 整体职责描述 */
  readonly responsibilityPrompt: string;
  /** Agent 角色组 */
  readonly agents: readonly AgentRole[];
  /** 协作规范 */
  readonly collaboration: CollaborationSpec;
  /** Super Agent 工作空间路径 */
  readonly workspacePath: string;
}

// ─── 运行时实例 ──────────────────────────────────────────────────

/** Super Agent 运行时实例 */
export interface SuperAgentInstance {
  readonly id: string;
  readonly name: string;
  readonly definition: SuperAgentDefinition;
  readonly workspacePath: string;
  readonly memoryManager: MemoryManager;
  readonly createdAt: string;
}

// ─── 任务与结果 ──────────────────────────────────────────────────

/** 角色任务结果 */
export interface RoleResult {
  readonly roleName: string;
  readonly agentId: string;
  readonly output: string;
  readonly artifacts: readonly Artifact[];
  readonly duration: number;
  readonly success: boolean;
  readonly error?: string;
}

/** Super Agent 执行请求 */
export interface SuperAgentTaskRequest {
  readonly superAgentId: string;
  readonly task: string;
  readonly context?: string;
  readonly parentTaskId?: string;
}

/** Super Agent 执行响应 */
export interface SuperAgentTaskResponse {
  readonly taskId: string;
  readonly result: string;
  readonly roleResults: readonly RoleResult[];
  readonly artifacts: readonly Artifact[];
  readonly duration: number;
  readonly success: boolean;
  readonly error?: string;
}

// ─── 注册表 ──────────────────────────────────────────────────

/** Super Agent 注册表 */
export interface SuperAgentRegistry {
  get(superAgentId: string): SuperAgentDefinition | undefined;
  has(superAgentId: string): boolean;
  list(): readonly SuperAgentDefinition[];
  listByOrigin(origin: "system" | "user" | "generated"): readonly SuperAgentDefinition[];
  register(definition: SuperAgentDefinition): Promise<void>;
  updateStatus(id: string, status: EntityStatus): Promise<SuperAgentDefinition>;
}

/** 注册表持久化数据 */
export interface SuperAgentRegistryData {
  readonly version: string;
  readonly updatedAt: string;
  readonly superAgents: readonly SuperAgentDefinition[];
}

// ─── 依赖注入 ──────────────────────────────────────────────────

/** Super Agent 执行器依赖 */
export interface SuperAgentExecutorDeps extends AgentExecutorDeps {
  /** 父 workspace 路径（用于加载子 Agent） */
  readonly parentWorkspacePath: string;
}

// ─── 配置 ──────────────────────────────────────────────────

/** Super Agent 系统配置 */
export interface SuperAgentConfig {
  readonly defaultMaxDuration: number;
  readonly maxParallelAgents: number;
}
