/**
 * WebSocket 服务端
 *
 * 基于 ws 库，挂载到已有 HTTP 服务器。
 * 支持频道订阅、心跳检测、认证。
 */

import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Logger } from "../logger/types.js";
import type {
  WsEnvelope,
  WsChannel,
  WsServerMessageType,
  WsClientMeta,
  WsSubscribePayload,
} from "./ws-types.js";

/** WsServer 接口 */
export interface WsServer {
  /** 向指定频道的所有订阅者广播 */
  broadcast(channel: WsChannel, type: WsServerMessageType, payload: unknown): void;
  /** 向指定 sessionId 的所有订阅者发送 */
  sendToSession(sessionId: string, type: WsServerMessageType, payload: unknown): void;
  /** 关闭 WS 服务器 */
  close(): void;
}

/** 心跳间隔（毫秒） */
const HEARTBEAT_INTERVAL = 30_000;

/**
 * 创建 WS 服务器并挂载到 HTTP 服务器
 */
export function createWsServer(
  httpServer: Server,
  logger: Logger,
  apiKey?: string,
): WsServer {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, WsClientMeta>();

  // ─── HTTP Upgrade 处理 ───────────────────────
  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // 路径匹配
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    // 认证检查
    if (apiKey) {
      const token = url.searchParams.get("token");
      if (token !== apiKey) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  // ─── 连接处理 ───────────────────────
  wss.on("connection", (ws: WebSocket) => {
    const meta: WsClientMeta = { subscriptions: new Set(), sessionId: undefined };
    clients.set(ws, meta);
    logger.debug("ws", "客户端已连接");

    // 标记存活
    let isAlive = true;
    ws.on("pong", () => {
      isAlive = true;
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const envelope = JSON.parse(raw.toString()) as WsEnvelope;
        handleClientMessage(ws, meta, envelope);
      } catch {
        sendToClient(ws, "error", { message: "无效的 JSON 消息" });
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      logger.debug("ws", "客户端已断开");
    });

    ws.on("error", (err) => {
      logger.warn("ws", `客户端连接异常: ${err.message}`);
      clients.delete(ws);
    });

    // 心跳检测
    const heartbeat = setInterval(() => {
      if (!isAlive) {
        ws.terminate();
        clearInterval(heartbeat);
        return;
      }
      isAlive = false;
      ws.ping();
    }, HEARTBEAT_INTERVAL);

    ws.on("close", () => clearInterval(heartbeat));
  });

  // ─── 消息处理 ───────────────────────
  function handleClientMessage(ws: WebSocket, meta: WsClientMeta, envelope: WsEnvelope): void {
    switch (envelope.type) {
      case "subscribe": {
        const payload = envelope.payload as WsSubscribePayload;
        if (payload.channel) {
          meta.subscriptions.add(payload.channel);
          if (payload.sessionId) {
            meta.sessionId = payload.sessionId;
          }
        }
        break;
      }
      case "unsubscribe": {
        const payload = envelope.payload as WsSubscribePayload;
        if (payload.channel) {
          meta.subscriptions.delete(payload.channel);
        }
        break;
      }
      case "ping":
        sendToClient(ws, "pong", {});
        break;
      default:
        sendToClient(ws, "error", { message: `未知消息类型: ${envelope.type}` });
    }
  }

  // ─── 发送辅助 ───────────────────────
  function sendToClient(ws: WebSocket, type: WsServerMessageType, payload: unknown): void {
    if (ws.readyState !== ws.OPEN) return;
    const envelope: WsEnvelope = { type, payload };
    ws.send(JSON.stringify(envelope));
  }

  function broadcast(channel: WsChannel, type: WsServerMessageType, payload: unknown): void {
    const envelope: WsEnvelope = { type, payload };
    const data = JSON.stringify(envelope);
    for (const [ws, meta] of clients) {
      if (meta.subscriptions.has(channel) && ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  function sendToSession(sessionId: string, type: WsServerMessageType, payload: unknown): void {
    const envelope: WsEnvelope = { type, payload };
    const data = JSON.stringify(envelope);
    for (const [ws, meta] of clients) {
      if (
        meta.subscriptions.has("session") &&
        meta.sessionId === sessionId &&
        ws.readyState === ws.OPEN
      ) {
        ws.send(data);
      }
    }
  }

  function close(): void {
    for (const ws of clients.keys()) {
      ws.terminate();
    }
    clients.clear();
    wss.close();
  }

  return { broadcast, sendToSession, close };
}
