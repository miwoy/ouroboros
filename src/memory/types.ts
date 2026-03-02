/**
 * 记忆系统类型定义
 *
 * 分层记忆：
 * - Session Hot：内存常驻，每次 callModel 完整注入
 * - Session Cold：临时文件缓存，按需加载，任务结束清理
 * - 短期记忆：完整交互记录，按日期分隔，持久化
 * - 长期记忆：压缩摘要，持续累积
 */

import type { CallModelFn } from "../tool/types.js";

// ─── 记忆条目 ──────────────────────────────────────────────────

/** 记忆条目类型 */
export type MemoryEntryType = "conversation" | "tool-call" | "observation" | "decision" | "summary";

/** 单条记忆 */
export interface MemoryEntry {
  readonly timestamp: string;
  readonly type: MemoryEntryType;
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ─── Session 记忆 ──────────────────────────────────────────────

/** Session Hot Memory：内存常驻 */
export interface HotMemory {
  /** 获取所有热记忆（用于注入到 callModel） */
  getEntries(): readonly MemoryEntry[];
  /** 添加记忆条目 */
  add(entry: MemoryEntry): void;
  /** 获取当前 token 估计量 */
  estimateTokens(): number;
  /** 获取格式化的记忆文本（用于注入 system prompt） */
  toPromptText(): string;
  /** 清空 */
  clear(): void;
}

/** Session Cold Memory：临时文件缓存 */
export interface ColdMemory {
  /** 缓存步骤结果到临时文件 */
  cache(stepId: string, content: string): Promise<void>;
  /** 按需加载某步骤的缓存 */
  load(stepId: string): Promise<string | null>;
  /** 列出所有缓存的步骤 ID */
  listSteps(): Promise<readonly string[]>;
  /** 清理所有临时文件（任务结束时调用） */
  cleanup(): Promise<void>;
}

// ─── 持久记忆 ──────────────────────────────────────────────────

/** 短期记忆管理器 */
export interface ShortTermMemory {
  /** 追加交互记录到当天的记忆文件 */
  append(entry: MemoryEntry): Promise<void>;
  /** 读取指定日期的记忆 */
  loadByDate(date: string): Promise<readonly MemoryEntry[]>;
  /** 读取今天的记忆 */
  loadToday(): Promise<readonly MemoryEntry[]>;
  /** 列出所有有记忆的日期 */
  listDates(): Promise<readonly string[]>;
}

/** 长期记忆管理器 */
export interface LongTermMemory {
  /** 读取长期记忆内容 */
  load(): Promise<string>;
  /** 追加知识摘要 */
  appendKnowledge(content: string): Promise<void>;
  /** 追加行为模式 */
  appendPattern(content: string): Promise<void>;
  /** 追加重要决策 */
  appendDecision(content: string): Promise<void>;
  /** 从短期记忆压缩生成长期记忆（使用模型） */
  compressFromShortTerm(date: string, callModel: CallModelFn): Promise<string>;
}

// ─── 记忆管理器 ──────────────────────────────────────────────────

/** 记忆系统配置 */
export interface MemoryConfig {
  readonly shortTerm: boolean;
  readonly longTerm: boolean;
  readonly hotSessionMaxTokens: number;
}

/** 记忆管理器（统一入口） */
export interface MemoryManager {
  readonly hot: HotMemory;
  readonly cold: ColdMemory;
  readonly shortTerm: ShortTermMemory;
  readonly longTerm: LongTermMemory;
  /** 获取记忆配置 */
  readonly config: MemoryConfig;
  /** 清理会话临时数据 */
  cleanup(): Promise<void>;
}
