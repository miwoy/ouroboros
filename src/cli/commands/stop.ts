/**
 * ouroboros stop — 停止正在运行的服务
 *
 * 读取 PID 文件并发送 SIGTERM 信号。
 */

import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { expandTilde, OUROBOROS_HOME } from "../../config/resolver.js";

/**
 * 获取 PID 文件路径
 */
export function getPidPath(): string {
  return join(expandTilde(OUROBOROS_HOME), "ouroboros.pid");
}

/**
 * stop 命令入口
 */
export async function runStop(): Promise<void> {
  const pidPath = getPidPath();

  let pidStr: string;
  try {
    pidStr = await readFile(pidPath, "utf-8");
  } catch {
    console.log("Ouroboros 未在运行（未找到 PID 文件）");
    return;
  }

  const pid = parseInt(pidStr.trim(), 10);
  if (isNaN(pid)) {
    console.error("PID 文件内容无效");
    try {
      await unlink(pidPath);
    } catch { /* ignore */ }
    process.exitCode = 1;
    return;
  }

  // 检查进程是否存在
  try {
    process.kill(pid, 0);
  } catch {
    console.log(`Ouroboros 进程已终止 (PID: ${pid})，清理 PID 文件`);
    try {
      await unlink(pidPath);
    } catch { /* ignore */ }
    return;
  }

  // 发送 SIGTERM
  try {
    process.kill(pid, "SIGTERM");
    console.log(`已发送 SIGTERM 信号到 Ouroboros (PID: ${pid})`);
  } catch (err) {
    console.error(`无法停止 Ouroboros (PID: ${pid}):`, err);
    process.exitCode = 1;
  }
}
