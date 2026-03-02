/**
 * HTTP 服务器
 *
 * 基于 Node.js 原生 http 模块，组装路由器、中间件、处理器。
 */

import { createServer, type Server } from "node:http";
import type { ApiConfig, ApiDeps } from "./types.js";
import { DEFAULT_API_CONFIG } from "./types.js";
import { createRouter } from "./router.js";
import { createRateLimiter, applyMiddleware } from "./middleware.js";
import { createSessionManager } from "./session.js";
import { registerHandlers } from "./handlers.js";
import { internalError } from "./response.js";
import { createWsServer, type WsServer } from "./ws-server.js";
import { startBodyPush, type BodyPush } from "./ws-body-push.js";

/** 服务器实例 */
export interface ApiServer {
  /** 启动监听 */
  start(): Promise<void>;
  /** 停止服务 */
  stop(): Promise<void>;
  /** 获取底层 HTTP 服务器 */
  getHttpServer(): Server;
  /** 获取会话管理器 */
  getSessionManager(): ReturnType<typeof createSessionManager>;
  /** 获取 WebSocket 服务器 */
  getWsServer(): WsServer | null;
}

/**
 * 创建 API 服务器
 */
export function createApiServer(deps: ApiDeps): ApiServer {
  const config: ApiConfig = { ...DEFAULT_API_CONFIG, ...deps.config };
  const router = createRouter();
  const rateLimiter = createRateLimiter(config.rateLimit);
  const sessionManager = createSessionManager(deps.workspacePath);

  // 将 wsServer 注入到 deps（后续注册路由需要）
  let wsServer: WsServer | null = null;
  let bodyPush: BodyPush | null = null;

  // 注册路由
  registerHandlers(router, sessionManager, deps);

  // 创建 HTTP 服务器
  const server = createServer(async (req, res) => {
    // 应用中间件（认证、速率限制、CORS）
    const canProceed = applyMiddleware(req, res, config, rateLimiter);
    if (!canProceed) return;

    try {
      await router.handle(req, res);
    } catch (err) {
      deps.logger.error("api", "请求处理异常", { error: err });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify(internalError("服务器内部错误")));
      }
    }
  });

  async function start(): Promise<void> {
    // 加载持久化会话
    await sessionManager.init();

    // 创建 WebSocket 服务器
    wsServer = createWsServer(server, deps.logger, config.apiKey);
    deps.logger.info("api", "WebSocket 服务器已挂载: /ws");

    // 启动身体图式定时推送
    if (deps.schemaProvider) {
      bodyPush = startBodyPush(deps.schemaProvider, wsServer);
      deps.logger.info("api", "身体图式定时推送已启动（5s 间隔）");
    }

    return new Promise((resolve) => {
      server.listen(config.port, config.host, () => {
        deps.logger.info("api", `API 服务器已启动: http://${config.host}:${config.port}`);
        resolve();
      });
    });
  }

  async function stop(): Promise<void> {
    bodyPush?.stop();
    wsServer?.close();
    rateLimiter.destroy();
    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          deps.logger.info("api", "API 服务器已停止");
          resolve();
        }
      });
    });
  }

  function getHttpServer(): Server {
    return server;
  }

  function getSessionManager() {
    return sessionManager;
  }

  function getWsServerInstance(): WsServer | null {
    return wsServer;
  }

  return { start, stop, getHttpServer, getSessionManager, getWsServer: getWsServerInstance };
}
