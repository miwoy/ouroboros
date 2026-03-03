/**
 * 自我图式类型定义
 *
 * 包含身体图式（系统资源）和激素系统。
 * 灵魂内容（世界模型/身份/用户模型）已内联到 self.md 模板中，
 * 通过 replaceSection() 直接编辑，不再作为变量注入。
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

/**
 * 自我图式变量（供模板渲染）
 *
 * 仅包含外部动态属性（8 个变量）：
 * - Body: 时间、平台、内存、GPU、工作空间路径
 * - Hormones: 专注度、谨慎度、创造力
 *
 * 灵魂内容（世界模型、身份、用户模型）直接写在 self.md 中，
 * 不再作为模板变量注入。
 */
export interface SelfSchemaVariables {
  readonly platform: string;
  readonly availableMemory: string;
  readonly gpu: string;
  readonly workspacePath: string;
  readonly currentDateTime: string;
  readonly focusLevel: string;
  readonly cautionLevel: string;
  readonly creativityLevel: string;
}

/** 自我图式配置 */
export interface SelfSchemaConfig {
  readonly hormoneDefaults: HormoneDefaults;
}
