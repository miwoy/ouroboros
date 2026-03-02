/**
 * 终端格式化工具
 *
 * ANSI 转义码封装，用于 TUI 颜色和样式。
 */

/** ANSI 颜色码 */
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  // 前景色
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
} as const;

/** 加粗文本 */
export function bold(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`;
}

/** 暗淡文本 */
export function dim(text: string): string {
  return `${ANSI.dim}${text}${ANSI.reset}`;
}

/** 绿色文本 */
export function green(text: string): string {
  return `${ANSI.green}${text}${ANSI.reset}`;
}

/** 红色文本 */
export function red(text: string): string {
  return `${ANSI.red}${text}${ANSI.reset}`;
}

/** 黄色文本 */
export function yellow(text: string): string {
  return `${ANSI.yellow}${text}${ANSI.reset}`;
}

/** 青色文本 */
export function cyan(text: string): string {
  return `${ANSI.cyan}${text}${ANSI.reset}`;
}

/** 灰色文本 */
export function gray(text: string): string {
  return `${ANSI.gray}${text}${ANSI.reset}`;
}

/** 蓝色文本 */
export function blue(text: string): string {
  return `${ANSI.blue}${text}${ANSI.reset}`;
}

/** 洋红色文本 */
export function magenta(text: string): string {
  return `${ANSI.magenta}${text}${ANSI.reset}`;
}

/** 打印分隔线 */
export function separator(): string {
  return dim("─".repeat(Math.min(process.stdout.columns || 80, 80)));
}

/** 格式化时间戳为本地时间 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-CN", { hour12: false });
}
