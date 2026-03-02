/**
 * ReAct 核心循环类型定义
 *
 * 定义执行树、任务状态、异常报告、审查干预等核心数据结构。
 * 遵循 PROTOCOL.md TaskState 规范。
 */

import type { CallModelFn, ToolRegistry } from "../tool/types.js";
import type { ToolExecutor } from "../tool/executor.js";
import type { Logger } from "../logger/types.js";
import type { TokenUsage } from "../model/types.js";

// ─── 状态常量 ──────────────────────────────────────────────────────

/** 任务状态（PROTOCOL.md TaskState） */
export const TaskState = {
  Submitted: "submitted",
  Working: "working",
  InputRequired: "input-required",
  Paused: "paused",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
export type TaskState = (typeof TaskState)[keyof typeof TaskState];

/** 节点类型 */
export const NodeType = {
  Root: "root",
  ToolCall: "tool-call",
  ModelCall: "model-call",
  AgentCall: "agent-call",
} as const;
export type NodeType = (typeof NodeType)[keyof typeof NodeType];

/** 执行树状态 */
export const TreeState = {
  Running: "running",
  Paused: "paused",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
export type TreeState = (typeof TreeState)[keyof typeof TreeState];

/** 异常类型 */
export const ExceptionType = {
  ToolFailure: "tool-failure",
  ModelOutputUnexpected: "model-output-unexpected",
  AgentDeviation: "agent-deviation",
  PossibleLoop: "possible-loop",
  Timeout: "timeout",
  ResourceExhausted: "resource-exhausted",
} as const;
export type ExceptionType = (typeof ExceptionType)[keyof typeof ExceptionType];

// ─── 执行树结构 ──────────────────────────────────────────────────────

/** 执行树节点 */
export interface ExecutionNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly taskId: string;
  readonly state: TaskState;
  readonly nodeType: NodeType;
  readonly summary: string;
  readonly resultSummary?: string;
  readonly children: readonly string[];
  readonly retryCount: number;
  readonly createdAt: string;
  readonly completedAt?: string;
}

/** 执行树 */
export interface ExecutionTree {
  readonly id: string;
  readonly agentId: string;
  readonly rootNodeId: string;
  readonly nodes: Readonly<Record<string, ExecutionNode>>;
  readonly activeNodeId: string;
  readonly state: TreeState;
  readonly createdAt: string;
}

// ─── 异常与审查 ──────────────────────────────────────────────────────

/** 异常报告 */
export interface ExceptionReport {
  readonly treeId: string;
  readonly nodeId: string;
  readonly exceptionType: ExceptionType;
  readonly description: string;
  readonly suggestedAction: InspectorAction["action"];
  readonly timestamp: string;
}

/** 审查干预动作 */
export interface InspectorAction {
  readonly treeId: string;
  readonly action: "rollback" | "terminate" | "inject-prompt" | "pause" | "resume";
  readonly targetNodeId?: string;
  readonly prompt?: string;
  readonly reason: string;
  readonly timestamp: string;
}

// ─── ReAct 循环 ──────────────────────────────────────────────────────

/** ReAct 循环配置 */
export interface ReactLoopConfig {
  readonly maxIterations: number;
  readonly stepTimeout: number;
  readonly parallelToolCalls: boolean;
  readonly compressionThreshold: number;
  readonly agentId: string;
}

/** 工具调用结果（ReAct 步骤中） */
export interface ToolCallResult {
  readonly toolId: string;
  readonly requestId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly success: boolean;
  readonly error?: string;
  readonly duration: number;
}

/** 单个 ReAct 步骤 */
export interface ReactStep {
  readonly stepIndex: number;
  readonly thought: string;
  readonly toolCalls: readonly ToolCallResult[];
  readonly duration: number;
}

/** ReAct 循环最终结果 */
export interface ReactResult {
  readonly answer: string;
  readonly steps: readonly ReactStep[];
  readonly totalIterations: number;
  readonly totalDuration: number;
  readonly executionTree: ExecutionTree;
  readonly totalUsage: TokenUsage;
  readonly stopReason: "completed" | "max_iterations" | "terminated" | "error";
}

/** ReAct 依赖注入 */
export interface ReactDependencies {
  readonly callModel: CallModelFn;
  readonly toolExecutor: ToolExecutor;
  readonly toolRegistry: ToolRegistry;
  readonly logger: Logger;
  readonly workspacePath: string;
  /** 每步完成回调（SSE 实时推送用） */
  readonly onStep?: (step: ReactStep, tree: ExecutionTree) => void;
}
