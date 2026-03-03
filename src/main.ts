/**
 * Ouroboros 应用启动入口
 *
 * 按顺序初始化：配置 → workspace → 日志 → HTTP 客户端 → API 服务器
 * 注册 SIGINT/SIGTERM 优雅关闭。
 */

import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./config/loader.js";
import { parseModelRef } from "./config/schema.js";
import { expandTilde, OUROBOROS_HOME } from "./config/resolver.js";
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
import { isQmdAvailable, initVectorIndex } from "./prompt/vector.js";
import { createAuthStore } from "./auth/store.js";

/**
 * 启动 Ouroboros 服务器
 * 抽取为独立函数，供 CLI start 命令和直接运行使用
 */
export async function startServer(): Promise<void> {
  // 1. 加载配置（支持 CLI --config 参数注入）
  const cliConfigPath = process.env.__OUROBOROS_CLI_CONFIG;
  const config = await loadConfig(cliConfigPath);

  // 2. 解析默认 Agent 的模型引用
  const defaultAgent = config.agents.default;
  const modelRef = parseModelRef(defaultAgent.model);
  if (!modelRef) {
    throw new Error(`默认 Agent 的 model 格式无效: "${defaultAgent.model}"`);
  }
  const defaultProvider = modelRef.provider;
  const workspacePath = defaultAgent.workspacePath;

  // 3. 初始化 workspace
  await initWorkspace(workspacePath);

  // 4. 创建日志器
  const logger = createLogger(workspacePath, config.system.logLevel);
  logger.info("main", "Ouroboros 启动中...");

  // 4.5 初始化 qmd 向量索引（语义搜索）
  const qmdAvailable = await isQmdAvailable(workspacePath);
  if (qmdAvailable) {
    try {
      await initVectorIndex(workspacePath);
      logger.info("main", "qmd 向量索引已初始化（语义搜索可用）");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn("main", `qmd 向量索引初始化失败，回退到关键词搜索: ${errMsg}`);
    }
  } else {
    logger.info("main", "qmd 不可用，语义搜索将回退到关键词搜索");
  }

  // 5. 创建 HTTP 客户端（含代理支持）
  const httpClient: HttpClient = createHttpClient({
    proxyUrl: config.system.proxy,
  });
  if (config.system.proxy) {
    logger.info("main", `HTTP 代理已配置: ${config.system.proxy}`);
  }

  // 6. 创建自我图式提供者
  const schemaProvider = await createSchemaProvider(workspacePath, {
    hormoneDefaults: config.system.self,
  });
  await schemaProvider.refresh();
  logger.info("main", "自我图式提供者已创建");

  // 7. 创建记忆管理器
  const memoryManager = createMemoryManager(workspacePath, config.system.memory);
  logger.info("main", "记忆管理器已创建");

  // 8. 创建 OAuth 凭据存储
  const authStore = createAuthStore();

  // 9. 启动 API 服务器配置
  const apiConfig: ApiConfig = {
    port: config.system.api.port,
    host: config.system.api.host,
    apiKey: config.system.api.apiKey,
    rateLimit: {
      windowMs: config.system.api.rateLimitWindowMs,
      maxRequests: config.system.api.rateLimitMaxRequests,
    },
    corsOrigin: config.system.api.corsOrigin,
  };

  // 10. 创建模型提供商注册表（含 OAuth 支持）
  const providerRegistry = createProviderRegistry(config.provider, authStore);
  logger.info("main", `模型提供商已加载: ${providerRegistry.names().join(", ")}`);

  // 11. 创建工具注册表
  const toolRegistry = await createToolRegistry(workspacePath);
  logger.info("main", `工具注册表已加载: ${toolRegistry.list().length} 个工具`);

  // 12. 创建技能注册表
  const skillRegistry = await createSkillRegistry(workspacePath);
  logger.info("main", `技能注册表已加载: ${skillRegistry.list().length} 个技能`);

  // 13. 创建审查程序
  const inspector = createInspector(logger);
  logger.info("main", "审查程序已创建");

  // 14. 创建统一 callModel 函数（含超时 + 重试）
  const callModelFn = createCallModel(config, providerRegistry, defaultProvider);

  // 15. 创建反思器
  const reflector = createReflector(
    {
      callModel: callModelFn,
      longTermMemory: memoryManager.longTerm,
      logger,
      workspacePath,
    },
    config.system.reflection,
  );
  logger.info("main", "反思器已创建");

  // 16. 创建持久化管理器
  const persistenceManager = createPersistenceManager({
    logger,
    workspacePath,
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
    workspacePath,
    config: apiConfig,
    providerRegistry,
    defaultProvider,
    toolRegistry,
    reactConfig: config.system.react,
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

  // 写入 PID 文件
  const pidDir = expandTilde(OUROBOROS_HOME);
  const pidPath = join(pidDir, "ouroboros.pid");
  try {
    await mkdir(pidDir, { recursive: true });
    await writeFile(pidPath, String(process.pid));
    logger.info("main", `PID 文件已写入: ${pidPath}`);
  } catch (err) {
    logger.warn("main", "PID 文件写入失败", { error: err });
  }

  // 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info("main", `收到 ${signal} 信号，正在关闭...`);
    try {
      // 清理 PID 文件
      try {
        await unlink(pidPath);
      } catch {
        /* ignore */
      }
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

// 直接运行时启动服务器
startServer().catch((err) => {
  console.error("[ouroboros] 启动失败:", err);
  process.exit(1);
});
