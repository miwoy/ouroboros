/**
 * 身体图式定时推送
 *
 * 每 5 秒刷新身体图式并通过 WS 广播到 body_schema 频道。
 */

import type { SchemaProvider } from "../schema/schema-provider.js";
import type { WsServer } from "./ws-server.js";

/** 推送间隔（毫秒） */
const PUSH_INTERVAL = 5_000;

/** 定时推送句柄 */
export interface BodyPush {
  stop(): void;
}

/**
 * 启动身体图式定时推送
 */
export function startBodyPush(schemaProvider: SchemaProvider, wsServer: WsServer): BodyPush {
  const timer = setInterval(async () => {
    try {
      await schemaProvider.refresh();
      const body = schemaProvider.getBodySchema();
      wsServer.broadcast("body_schema", "body_schema_update", body);
    } catch {
      // 刷新失败静默处理
    }
  }, PUSH_INTERVAL);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
