/**
 * start 命令 — 启动 API 服务器
 * 从 main.ts 抽取的服务器启动逻辑
 */
export async function runStart(): Promise<void> {
  // 动态导入 main.ts 的 startServer，避免循环依赖
  const { startServer } = await import("../../main.js");
  await startServer();
}
