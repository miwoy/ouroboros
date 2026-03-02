/**
 * Agent (Solution) 系统类型定义
 *
 * 定义 Solution 标准协议接口：
 * - SolutionDefinition：Agent 定义（EntityCard 扩展）
 * - Task：任务接口（状态机）
 * - Agent：运行时实例
 * - KnowledgeBase：知识库接口
 */

import type { EntityCard, EntityStatus, ToolRegistry, CallModelFn } from "../tool/types.js";
import type { SkillRegistry } from "../skill/types.js";
import type { MemoryManager, MemoryConfig } from "../memory/types.js";
import type { Logger } from "../logger/types.js";
import type { Artifact } from "../skill/types.js";
import type { ExecutionTree } from "../core/types.js";

// ─── Solution 定义 ──────────────────────────────────────────────

/** 知识库配置 */
export interface KnowledgeConfig {
  /** 静态知识文件路径列表（相对 workspace） */
  readonly staticFiles?: readonly string[];
  /** qmd 向量库中的知识前缀（按需加载） */
  readonly vectorPrefix?: string;
  /** 最大知识加载 token 数 */
  readonly maxTokens?: number;
}

/** 交互模式配置 */
export interface InteractionConfig {
  /** 是否支持多轮对话 */
  readonly multiTurn: boolean;
  /** 最大交互轮次（默认 50） */
  readonly maxTurns?: number;
  /** 是否需要人工参与 */
  readonly humanInLoop: boolean;
  /** 输入模式 */
  readonly inputModes: readonly ("text" | "file" | "data")[];
  /** 输出模式 */
  readonly outputModes: readonly ("text" | "file" | "data")[];
}

/**
 * Solution 定义（PROTOCOL.md SolutionDefinition）
 *
 * Agent 的完整定义，包括身份、知识库、技能组、交互模式。
 */
export interface SolutionDefinition extends EntityCard {
  /** 身份定义提示词 */
  readonly identityPrompt: string;

  /** 知识库配置 */
  readonly knowledge?: KnowledgeConfig;

  /** 绑定的技能 ID 列表 */
  readonly skills: readonly string[];

  /** 额外授权的工具 ID 列表 */
  readonly additionalTools?: readonly string[];

  /** 交互模式 */
  readonly interaction: InteractionConfig;

  /** Agent 工作空间路径（相对于父级 workspace） */
  readonly workspacePath: string;

  /** 记忆配置 */
  readonly memory?: Partial<MemoryConfig>;
}

// ─── 任务协议 ──────────────────────────────────────────────────

/** 任务消息部分 */
export type MessagePart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "file"; readonly filePath: string; readonly mimeType: string }
  | { readonly type: "data"; readonly data: Readonly<Record<string, unknown>> };

/** 任务消息 */
export interface TaskMessage {
  readonly id: string;
  readonly role: "user" | "agent" | "system" | "inspector";
  readonly parts: readonly MessagePart[];
  readonly timestamp: string;
}

/** 任务状态历史记录 */
export interface TaskStateChange {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly timestamp: string;
  readonly triggeredBy: "agent" | "inspector" | "user";
}

/** Agent 任务 */
export interface AgentTask {
  readonly id: string;
  readonly agentId: string;
  readonly parentTaskId?: string;
  readonly state: string;
  readonly description: string;
  readonly messages: readonly TaskMessage[];
  readonly artifacts: readonly Artifact[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stateHistory: readonly TaskStateChange[];
}

// ─── Agent 运行时实例 ──────────────────────────────────────────

/** 知识库接口 */
export interface KnowledgeBase {
  /** 加载所有知识（用于注入提示词），token 预算限制 */
  loadAll(maxTokens?: number): Promise<string>;
  /** 添加知识文件 */
  addFile(filePath: string, content: string): Promise<void>;
  /** 列出知识文件 */
  listFiles(): Promise<readonly string[]>;
}

/** Agent 运行时实例 */
export interface Agent {
  /** Agent ID (solution:xxx) */
  readonly id: string;
  /** 实例名称 */
  readonly name: string;
  /** 对应的 Solution 定义 */
  readonly definition: SolutionDefinition;
  /** Agent 工作空间路径 */
  readonly workspacePath: string;
  /** 记忆管理器 */
  readonly memoryManager: MemoryManager;
  /** 知识库 */
  readonly knowledgeBase: KnowledgeBase;
  /** 创建时间 */
  readonly createdAt: string;
}

// ─── 通信协议 ──────────────────────────────────────────────────

/** 发送任务请求 */
export interface SendTaskRequest {
  readonly agentId: string;
  readonly task: string;
  readonly context?: string;
  readonly attachments?: readonly Artifact[];
  readonly parentTaskId?: string;
}

/** 发送任务响应 */
export interface SendTaskResponse {
  readonly task: AgentTask;
  readonly result: string;
  readonly executionTree: ExecutionTree;
}

// ─── 注册表 ──────────────────────────────────────────────────

/** Solution 注册表接口 */
export interface SolutionRegistry {
  /** 获取 Solution 定义 */
  get(solutionId: string): SolutionDefinition | undefined;
  /** 检查是否存在 */
  has(solutionId: string): boolean;
  /** 列出所有 Solution */
  list(): readonly SolutionDefinition[];
  /** 按来源筛选 */
  listByOrigin(origin: "system" | "user" | "generated"): readonly SolutionDefinition[];
  /** 注册 Solution（持久化 + 追加 agent.md） */
  register(solution: SolutionDefinition): Promise<void>;
  /** 更新状态 */
  updateStatus(solutionId: string, status: EntityStatus): Promise<SolutionDefinition>;
}

/** Solution 注册表持久化数据 */
export interface SolutionRegistryData {
  readonly version: string;
  readonly updatedAt: string;
  readonly solutions: readonly SolutionDefinition[];
}

// ─── 配置 ──────────────────────────────────────────────────

/** Agent 系统配置 */
export interface AgentSystemConfig {
  /** 默认最大交互轮次 */
  readonly defaultMaxTurns: number;
  /** 知识库默认最大 token 数 */
  readonly knowledgeMaxTokens: number;
}

// ─── 依赖注入 ──────────────────────────────────────────────

/** Agent 执行器依赖 */
export interface AgentExecutorDeps {
  readonly callModel: CallModelFn;
  readonly toolRegistry: ToolRegistry;
  readonly toolExecutor: {
    readonly execute: (request: import("../tool/types.js").ToolCallRequest) => Promise<import("../tool/types.js").ToolCallResponse>;
  };
  readonly skillRegistry: SkillRegistry;
  readonly logger: Logger;
  readonly workspacePath: string;
}
