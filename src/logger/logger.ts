/**
 * 文件日志实现
 *
 * - 写入 workspace/logs/yyyy-MM-dd.log，JSONL 格式
 * - 异步写入（fire-and-forget），不阻塞主循环
 * - 日志级别过滤
 */

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { LOG_LEVEL_PRIORITY, type LogEntry, type LogLevel, type Logger } from "./types.js";

/**
 * 获取当前日期字符串 yyyy-MM-dd
 */
function getDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 获取日志文件路径
 */
function getLogFilePath(workspacePath: string): string {
  return join(workspacePath, "logs", `${getDateString()}.log`);
}

/**
 * 异步写入日志条目到文件（fire-and-forget）
 */
function writeEntry(workspacePath: string, entry: LogEntry): void {
  const logDir = join(workspacePath, "logs");
  const filePath = getLogFilePath(workspacePath);
  const line = JSON.stringify(entry) + "\n";

  // fire-and-forget：先确保目录存在，然后追加
  void mkdir(logDir, { recursive: true })
    .then(() => appendFile(filePath, line, "utf-8"))
    .catch(() => {
      // 日志写入失败不应影响主流程
    });
}

/**
 * 创建日志实例
 *
 * @param workspacePath - workspace 根目录
 * @param minLevel - 最低日志级别
 * @returns Logger 实例
 */
export function createLogger(workspacePath: string, minLevel: LogLevel = "info"): Logger {
  const minPriority = LOG_LEVEL_PRIORITY[minLevel];

  function log(level: LogLevel, source: string, message: string, data?: unknown): void {
    if (LOG_LEVEL_PRIORITY[level] < minPriority) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      ...(data !== undefined ? { data } : {}),
    };

    writeEntry(workspacePath, entry);
  }

  return {
    debug(source, message, data?) {
      log("debug", source, message, data);
    },
    info(source, message, data?) {
      log("info", source, message, data);
    },
    warn(source, message, data?) {
      log("warn", source, message, data);
    },
    error(source, message, data?) {
      log("error", source, message, data);
    },
  };
}
