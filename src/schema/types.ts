/**
 * 自我图式类型定义
 *
 * 包含身体图式（系统资源）、灵魂图式（世界模型+自我认知+用户模型）、激素系统。
 */

// ─── 身体图式 ──────────────────────────────────────────────────

/** 内存使用信息 */
export interface MemoryInfo {
  readonly totalGB: string;
  readonly availableGB: string;
  readonly usagePercent: number;
}

/** 磁盘使用信息 */
export interface DiskInfo {
  readonly availableGB: string;
  readonly totalGB: string;
}

/** GPU 信息 */
export interface GpuInfo {
  readonly name: string;
  readonly memoryMB: number;
  /** 利用率 0-100 */
  readonly utilization: number;
}

/** 身体图式 */
export interface BodySchema {
  readonly platform: string;
  readonly cpuCores: number;
  readonly memory: MemoryInfo;
  readonly disk: DiskInfo;
  readonly gpu: readonly GpuInfo[];
  readonly nodeVersion: string;
  readonly workspacePath: string;
  readonly timestamp: string;
}

// ─── 灵魂图式 ──────────────────────────────────────────────────

/** 世界模型 — 普适性逻辑规律，作为决策基础公理 */
export interface WorldModel {
  readonly principles: readonly string[];
  readonly knowledge: string;
}

/** 自我认知 */
export interface SelfAwareness {
  readonly name: string;
  readonly identity: string;
  readonly purpose: string;
  readonly capabilities: readonly string[];
  readonly limitations: readonly string[];
}

/** 用户模型 — 通过对话逐步了解用户 */
export interface UserModel {
  readonly name: string;
  readonly preferences: readonly string[];
  readonly context: string;
}

/** 灵魂图式 */
export interface SoulSchema {
  readonly worldModel: WorldModel;
  readonly selfAwareness: SelfAwareness;
  readonly userModel: UserModel;
}

// ─── 灵魂图式更新 ──────────────────────────────────────────────

/** 灵魂图式更新请求 */
export interface SoulUpdate {
  readonly worldModel?: Partial<WorldModel>;
  readonly selfAwareness?: Partial<SelfAwareness>;
  readonly userModel?: Partial<UserModel>;
}

// ─── 激素系统 ──────────────────────────────────────────────────

/** 激素状态 */
export interface HormoneState {
  readonly focusLevel: number;
  readonly cautionLevel: number;
  readonly creativityLevel: number;
}

/** 激素默认值 */
export interface HormoneDefaults {
  readonly focusLevel: number;
  readonly cautionLevel: number;
  readonly creativityLevel: number;
}

/** 激素管理器 */
export interface HormoneManager {
  getState(): HormoneState;
  adjustFocus(delta: number): void;
  adjustCaution(delta: number): void;
  adjustCreativity(delta: number): void;
  reset(): void;
}

// ─── 自我图式总览 ──────────────────────────────────────────────

/** 自我图式变量（供模板渲染） */
export interface SelfSchemaVariables {
  readonly platform: string;
  readonly availableMemory: string;
  readonly gpu: string;
  readonly workspacePath: string;
  readonly currentDateTime: string;
  readonly focusLevel: string;
  readonly cautionLevel: string;
  readonly creativityLevel: string;
  readonly worldModel: string;
  readonly selfAwareness: string;
  readonly userModel: string;
}

/** 自我图式配置 */
export interface SelfSchemaConfig {
  readonly hormoneDefaults: HormoneDefaults;
}
