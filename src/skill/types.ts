/**
 * 技能系统类型定义
 *
 * 定义 Skill 标准协议接口：
 * - SkillDefinition：技能定义（EntityCard 扩展）
 * - SkillExecuteRequest/Response：技能调用协议
 * - SkillRegistry：技能注册表接口
 * - Artifact, ToolCallRecord：辅助类型
 */

import type { TemplateVariable } from "../prompt/types.js";
import { EntityStatus, EntityType } from "../tool/types.js";

export { EntityStatus, EntityType };

// ─── Skill 定义 ──────────────────────────────────────────────────

/** 使用示例 */
export interface SkillExample {
  readonly input: string;
  readonly expectedOutput: string;
}

/**
 * 技能定义（PROTOCOL.md SkillDefinition）
 *
 * Skill 是工具编排的逻辑封装，包含提示词模板和可选辅助脚本。
 */
export interface SkillDefinition {
  readonly id: string;
  readonly type: EntityType;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly version: string;
  readonly status: EntityStatus;
  readonly permissions: Readonly<Record<string, unknown>>;
  readonly origin: "system" | "user" | "generated";
  readonly createdAt: string;
  readonly updatedAt: string;

  /** 任务编排提示词模板，支持 {{variable}} 占位符 */
  readonly promptTemplate: string;

  /** 提示词模板中的变量声明 */
  readonly variables?: readonly TemplateVariable[];

  /** 此技能依赖的工具 ID 列表 */
  readonly requiredTools: readonly string[];

  /** 可选辅助脚本路径（相对于 workspace） */
  readonly scripts?: readonly string[];

  /** 输入描述：此技能接收什么样的任务 */
  readonly inputDescription: string;

  /** 输出描述：此技能的产出 */
  readonly outputDescription: string;

  /** 预估执行时间（秒） */
  readonly estimatedDuration?: number;

  /** 使用示例 */
  readonly examples?: readonly SkillExample[];
}

// ─── 调用协议 ──────────────────────────────────────────────────

/** 技能执行请求 */
export interface SkillExecuteRequest {
  readonly requestId: string;
  readonly skillId: string;
  /** 模板变量赋值 */
  readonly variables: Readonly<Record<string, string>>;
  /** 附加上下文 */
  readonly context?: string;
  readonly caller: {
    readonly entityId: string;
    readonly nodeId?: string;
  };
}

/** 产物类型 */
export type ArtifactType = "text" | "file" | "data";

/** 产物定义（A2A Artifact） */
export interface Artifact {
  readonly id: string;
  readonly type: ArtifactType;
  readonly name: string;
  readonly mimeType?: string;
  readonly text?: string;
  readonly filePath?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** 工具调用记录（审计用） */
export interface ToolCallRecord {
  readonly toolId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly success: boolean;
  readonly duration: number;
}

/** 技能执行响应 */
export interface SkillExecuteResponse {
  readonly requestId: string;
  readonly success: boolean;
  readonly result?: string;
  readonly artifacts?: readonly Artifact[];
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly toolCalls: readonly ToolCallRecord[];
  readonly duration: number;
}

// ─── 注册表 ──────────────────────────────────────────────────────

/** 技能注册表接口 */
export interface SkillRegistry {
  get(skillId: string): SkillDefinition | undefined;
  has(skillId: string): boolean;
  list(): readonly SkillDefinition[];
  listByOrigin(origin: "system" | "user" | "generated"): readonly SkillDefinition[];
  register(skill: SkillDefinition): Promise<void>;
  updateStatus(skillId: string, status: EntityStatus): Promise<SkillDefinition>;
}

/** 技能注册表持久化数据 */
export interface SkillRegistryData {
  readonly version: string;
  readonly updatedAt: string;
  readonly skills: readonly SkillDefinition[];
}
