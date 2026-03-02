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
import { createCallModel } from "./model/call-model.js";
import { createToolRegistry } from "./tool/registry.js";
import { createSchemaProvider } from "./schema/schema-provider.js";
import { createMemoryManager } from "./memory/manager.js";
import { createInspector } from "./inspector/inspector.js";
import { createReflector } from "./reflection/reflector.js";
import { createPersistenceManager } from "./persistence/manager.js";
import { createSkillRegistry } from "./skill/registry.js";

async function main(): Promise<void> {
  // 1. 加载配置
  const config = await loadConfig();

  // 2. 初始化 workspace
  await initWorkspace(config.system.workspacePath);

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

  // 5. 创建自我图式提供者
  const schemaProvider = createSchemaProvider(config.system.workspacePath, {
    hormoneDefaults: config.self,
  });
  await schemaProvider.refresh();
  logger.info("main", "自我图式提供者已创建");

  // 6. 创建记忆管理器
  const memoryManager = createMemoryManager(config.system.workspacePath, config.memory);
  logger.info("main", "记忆管理器已创建");

  // 7. 启动 API 服务器
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

  // 8. 创建技能注册表
  const skillRegistry = await createSkillRegistry(config.system.workspacePath);
  logger.info("main", `技能注册表已加载: ${skillRegistry.list().length} 个技能`);

  // 10. 创建审查程序
  const inspector = createInspector(logger);
  logger.info("main", "审查程序已创建");

  // 11. 创建统一 callModel 函数（含超时 + 重试）
  const callModelFn = createCallModel(config, providerRegistry);

  // 12. 创建反思器
  const reflector = createReflector(
    {
      callModel: callModelFn,
      longTermMemory: memoryManager.longTerm,
      logger,
    },
    config.reflection,
  );
  logger.info("main", "反思器已创建");

  // 13. 创建持久化管理器
  const persistenceManager = createPersistenceManager({
    logger,
    workspacePath: config.system.workspacePath,
    config: config.persistence,
  });

  // 尝试恢复（如启用）
  if (config.persistence.enableAutoRecovery) {
    const latestSnapshot = await persistenceManager.loadLatestSnapshot();
    if (latestSnapshot) {
      logger.info("main", `发现快照: ${latestSnapshot.snapshotId}`, {
        trigger: latestSnapshot.metadata.trigger,
      });
    }
  }
  logger.info("main", "持久化管理器已创建");

  const server: ApiServer = createApiServer({
    logger,
    workspacePath: config.system.workspacePath,
    config: apiConfig,
    providerRegistry,
    defaultProvider: config.model.defaultProvider,
    toolRegistry,
    reactConfig: config.react,
    httpFetch: httpClient.fetch,
    schemaProvider,
    memoryManager,
    fullConfig: config,
    inspector,
    reflector,
    callModel: callModelFn,
    skillRegistry,
  });

  await server.start();

  // 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info("main", `收到 ${signal} 信号，正在关闭...`);
    try {
      inspector.stop();
      await persistenceManager.cleanup();
      await server.stop();
      await memoryManager.cleanup();
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
