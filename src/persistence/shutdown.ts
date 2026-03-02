/**
 * 优雅关闭处理器
 *
 * 监听 SIGINT/SIGTERM 信号，触发状态保存后退出。
 * 防止在工具调用过程中强制终止导致数据丢失。
 */

import type { ShutdownHandler } from "./types.js";

/**
 * 创建关闭处理器
 *
 * 注册 SIGINT 和 SIGTERM 信号处理函数，
 * 在收到信号时调用 onShutdown 回调保存状态，然后退出。
 */
export function createShutdownHandler(): ShutdownHandler {
  let shuttingDown = false;
  let handlers: { signal: string; handler: () => void }[] = [];

  function register(onShutdown: () => Promise<void>): void {
    // 防止重复注册
    unregister();

    const handleSignal = (signal: string) => {
      if (shuttingDown) return; // 防止重复触发
      shuttingDown = true;

      // 异步执行关闭回调
      onShutdown()
        .catch(() => {
          // 关闭回调失败也继续退出
        })
        .finally(() => {
          process.exit(signal === "SIGINT" ? 130 : 143);
        });
    };

    const sigintHandler = () => handleSignal("SIGINT");
    const sigtermHandler = () => handleSignal("SIGTERM");

    process.on("SIGINT", sigintHandler);
    process.on("SIGTERM", sigtermHandler);

    handlers = [
      { signal: "SIGINT", handler: sigintHandler },
      { signal: "SIGTERM", handler: sigtermHandler },
    ];
  }

  function unregister(): void {
    for (const { signal, handler } of handlers) {
      process.removeListener(signal, handler);
    }
    handlers = [];
    shuttingDown = false;
  }

  function isShuttingDown(): boolean {
    return shuttingDown;
  }

  return { register, unregister, isShuttingDown };
}
