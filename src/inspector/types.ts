/**
 * 审查程序类型定义
 *
 * 定时审查执行树，检测死循环、偏执行为、资源耗尽等异常，
 * 并生成干预建议。
 */

import type { ExceptionReport, InspectorAction, ExecutionTree } from "../core/types.js";
import type { BodySchema } from "../schema/types.js";

/** 审查配置 */
export interface InspectorConfig {
  /** 是否启用审查 */
  readonly enabled: boolean;
  /** 审查间隔（毫秒），默认 180000（3 分钟） */
  readonly checkInterval: number;
  /** 死循环检测阈值（连续重复次数），默认 3 */
  readonly loopDetectionThreshold: number;
  /** 单节点最大重试次数，默认 5 */
  readonly maxRetryThreshold: number;
  /** 最小可用内存（MB），低于此值触发资源告警 */
  readonly minAvailableMemoryMB: number;
  /** 最大执行时间（秒），超过触发超时告警 */
  readonly maxExecutionTimeSecs: number;
}

/** 审查结果 */
export interface InspectionResult {
  readonly hasAnomalies: boolean;
  readonly reports: readonly ExceptionReport[];
  readonly suggestedActions: readonly InspectorAction[];
  readonly timestamp: string;
}

/** 审查上下文 */
export interface InspectionContext {
  readonly tree: ExecutionTree;
  readonly bodySchema: BodySchema;
  readonly startTime: number;
  readonly config: InspectorConfig;
}

/** 审查器接口 */
export interface Inspector {
  /** 执行一次审查 */
  inspect(context: InspectionContext): InspectionResult;
  /** 启动定时审查 */
  start(getContext: () => InspectionContext): void;
  /** 停止定时审查 */
  stop(): void;
  /** 获取最新审查结果 */
  getLatestResult(): InspectionResult | null;
}
