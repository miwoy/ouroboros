/**
 * Ouroboros 应用启动入口
 *
 * 按顺序初始化：配置 → workspace → 日志 → HTTP 客户端 → API 服务器
 * 注册 SIGINT/SIGTERM 优雅关闭。
 */

import { loadConfig } from "./config/loader.js";
import { initWorkspace } from "./workspace/init.js";
import { createLogger } from "./logger/logger.js";
import { createHttpClient, type HttpClient } from "./http/index.js";
import { createApiServer, type ApiServer } from "./api/server.js";
import type { ApiConfig } from "./api/types.js";
import { createProviderRegistry } from "./model/registry.js";
import { createToolRegistry } from "./tool/registry.js";

async function main(): Promise<void> {
  // 1. 加载配置
  const config = await loadConfig();
  console.log("[ouroboros] 配置加载完成");

  // 2. 初始化 workspace
  await initWorkspace(config.system.workspacePath);
  console.log("[ouroboros] workspace 初始化完成");

  // 3. 创建日志器
  const logger = createLogger(config.system.workspacePath, config.system.logLevel);
  logger.info("main", "Ouroboros 启动中...");

  // 4. 创建 HTTP 客户端（含代理支持）
  const httpClient: HttpClient = createHttpClient({
    proxyUrl: config.system.proxy,
  });
  if (config.system.proxy) {
    logger.info("main", `HTTP 代理已配置: ${config.system.proxy}`);
  }

  // 5. 启动 API 服务器
  const apiConfig: ApiConfig = {
    port: config.api.port,
    host: config.api.host,
    apiKey: config.api.apiKey,
    rateLimit: {
      windowMs: config.api.rateLimitWindowMs,
      maxRequests: config.api.rateLimitMaxRequests,
    },
    corsOrigin: config.api.corsOrigin,
  };

  // 6. 创建模型提供商注册表
  const providerRegistry = createProviderRegistry(config.model.providers);
  logger.info("main", `模型提供商已加载: ${providerRegistry.names().join(", ")}`);

  // 7. 创建工具注册表
  const toolRegistry = await createToolRegistry(config.system.workspacePath);
  logger.info("main", `工具注册表已加载: ${toolRegistry.list().length} 个工具`);

  const server: ApiServer = createApiServer({
    logger,
    workspacePath: config.system.workspacePath,
    config: apiConfig,
    providerRegistry,
    defaultProvider: config.model.defaultProvider,
    toolRegistry,
    reactConfig: config.react,
  });

  await server.start();

  // 6. 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info("main", `收到 ${signal} 信号，正在关闭...`);
    try {
      await server.stop();
      httpClient.dispose();
      logger.info("main", "Ouroboros 已停止");
    } catch (err) {
      logger.error("main", "关闭过程出错", { error: err });
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[ouroboros] 启动失败:", err);
  process.exit(1);
});
