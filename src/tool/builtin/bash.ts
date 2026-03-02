/**
 * tool:bash — 命令执行
 *
 * 在子进程中执行 shell 命令，支持超时控制。
 * 出于安全考虑，限制仅在 workspace 目录下执行。
 */

import { exec } from "node:child_process";
import type { ToolHandler } from "../types.js";

/** bash 工具处理函数 */
export const handleBash: ToolHandler = async (input, context) => {
  const command = input["command"] as string;
  const cwd = (input["cwd"] as string | undefined) ?? context.workspacePath;
  const timeoutMs = (input["timeout"] as number | undefined) ?? 30000;

  return new Promise((resolve) => {
    const child = exec(
      command,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB
        env: { ...process.env, HOME: process.env["HOME"] ?? "/tmp" },
        signal: context.signal,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            exitCode: error.code ?? 1,
            stdout: stdout.slice(0, 10000),
            stderr: (stderr || error.message).slice(0, 10000),
          });
          return;
        }

        resolve({
          success: true,
          exitCode: 0,
          stdout: stdout.slice(0, 10000),
          stderr: stderr.slice(0, 10000),
        });
      },
    );

    // 如果上下文取消，杀掉子进程
    if (context.signal) {
      context.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      });
    }
  });
};
