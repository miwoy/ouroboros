/**
 * 反思程序类型定义
 *
 * 任务完成后进行反思：
 * - 提取知识和行为模式
 * - 建议 Skill/Solution 封装
 * - 更新长期记忆
 * - 评估是否需要更新 self.md 章节
 */

import type { ExecutionTree, ReactStep } from "../core/types.js";
import type { CallModelFn } from "../tool/types.js";
import type { LongTermMemory } from "../memory/types.js";
import type { Logger } from "../logger/types.js";

/** 反思输入 */
export interface ReflectionInput {
  readonly taskDescription: string;
  readonly agentId: string;
  readonly executionTree: ExecutionTree;
  readonly steps: readonly ReactStep[];
  readonly result: string;
  readonly totalDuration: number;
  readonly success: boolean;
  readonly errors: readonly string[];
}

/** Skill 封装建议 */
export interface SkillSuggestion {
  readonly name: string;
  readonly description: string;
  readonly toolsUsed: readonly string[];
  readonly confidence: number;
}

/**
 * self.md 章节更新（反思系统产出）
 *
 * 反思通过 replaceSection() 直接编辑 self.md 对应章节，
 * 不再通过 soul.json 间接影响提示词。
 */
export interface SelfUpdates {
  /** ### Identity 新内容 */
  readonly identityUpdate?: string;
  /** ### User 新内容 */
  readonly userUpdate?: string;
  /** ### World Model 追加内容 */
  readonly worldModelUpdate?: string;
}

/** 反思输出 */
export interface ReflectionOutput {
  readonly insights: readonly string[];
  readonly patterns: readonly string[];
  readonly skillSuggestions: readonly SkillSuggestion[];
  readonly memorySummary: string;
  readonly selfUpdates?: SelfUpdates;
}

/** 反思器接口 */
export interface Reflector {
  reflect(input: ReflectionInput): Promise<ReflectionOutput>;
}

/** 反思依赖 */
export interface ReflectionDeps {
  readonly callModel: CallModelFn;
  readonly longTermMemory: LongTermMemory;
  readonly logger: Logger;
  /** workspace 路径，用于定位 self.md 进行 section 编辑 */
  readonly workspacePath: string;
}

/** 反思配置 */
export interface ReflectionConfig {
  /** 是否启用反思 */
  readonly enabled: boolean;
  /** Skill 建议最低置信度 */
  readonly minSkillConfidence: number;
}
