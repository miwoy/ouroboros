/**
 * 日志系统类型定义
 */

/** 日志级别 */
export const LogLevel = {
  Debug: "debug",
  Info: "info",
  Warn: "warn",
  Error: "error",
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** 日志级别优先级（数值越大优先级越高） */
export const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 日志条目 */
export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly source: string;
  readonly message: string;
  readonly data?: unknown;
}

/** 日志接口 */
export interface Logger {
  debug(source: string, message: string, data?: unknown): void;
  info(source: string, message: string, data?: unknown): void;
  warn(source: string, message: string, data?: unknown): void;
  error(source: string, message: string, data?: unknown): void;
}
