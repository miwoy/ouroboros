/**
 * WebSocket 服务端测试
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { createWsServer, type WsServer } from "../../src/api/ws-server.js";
import type { Logger } from "../../src/logger/types.js";
import WebSocket from "ws";

/** 创建 mock logger */
function mockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/** 启动 HTTP 服务器并返回端口 */
function startServer(httpServer: Server): Promise<number> {
  return new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
}

/** 关闭 HTTP 服务器 */
function stopServer(httpServer: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
}

/** 等待 WebSocket 打开 */
function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
}

/** 等待收到一条消息 */
function waitMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once("message", (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

describe("WebSocket 服务器", () => {
  let httpServer: Server;
  let wsServer: WsServer;
  let port: number;
  const clients: WebSocket[] = [];

  afterEach(async () => {
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.close();
    }
    clients.length = 0;
    wsServer?.close();
    if (httpServer) await stopServer(httpServer);
  });

  async function setup(apiKey?: string): Promise<void> {
    httpServer = createServer();
    wsServer = createWsServer(httpServer, mockLogger(), apiKey);
    port = await startServer(httpServer);
  }

  function createClient(path = "/ws", token?: string): WebSocket {
    const url = `ws://127.0.0.1:${port}${path}${token ? `?token=${token}` : ""}`;
    const ws = new WebSocket(url);
    clients.push(ws);
    return ws;
  }

  it("应接受连接并响应 ping", async () => {
    await setup();
    const ws = createClient();
    await waitOpen(ws);

    ws.send(JSON.stringify({ type: "ping", payload: {} }));
    const msg = await waitMessage(ws) as { type: string };
    expect(msg.type).toBe("pong");
  });

  it("错误路径应拒绝连接", async () => {
    await setup();
    const ws = createClient("/not-ws");
    await new Promise<void>((resolve) => {
      ws.on("close", () => resolve());
      ws.on("error", () => resolve());
    });
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });

  it("有 apiKey 时应检查 token", async () => {
    await setup("secret-key");

    // 无 token → 拒绝
    const ws1 = createClient("/ws");
    await new Promise<void>((resolve) => {
      ws1.on("close", () => resolve());
      ws1.on("error", () => resolve());
    });
    expect(ws1.readyState).not.toBe(WebSocket.OPEN);

    // 错误 token → 拒绝
    const ws2 = createClient("/ws", "wrong");
    await new Promise<void>((resolve) => {
      ws2.on("close", () => resolve());
      ws2.on("error", () => resolve());
    });
    expect(ws2.readyState).not.toBe(WebSocket.OPEN);

    // 正确 token → 接受
    const ws3 = createClient("/ws", "secret-key");
    await waitOpen(ws3);
    expect(ws3.readyState).toBe(WebSocket.OPEN);
  });

  it("subscribe + broadcast 应推送到订阅者", async () => {
    await setup();
    const ws = createClient();
    await waitOpen(ws);

    // 订阅 body_schema
    ws.send(JSON.stringify({ type: "subscribe", payload: { channel: "body_schema" } }));
    // 等订阅消息处理
    await new Promise((r) => setTimeout(r, 50));

    // 广播
    wsServer.broadcast("body_schema", "body_schema_update", { platform: "test" });

    const msg = await waitMessage(ws) as { type: string; payload: { platform: string } };
    expect(msg.type).toBe("body_schema_update");
    expect(msg.payload.platform).toBe("test");
  });

  it("未订阅的客户端不应收到广播", async () => {
    await setup();
    const ws = createClient();
    await waitOpen(ws);
    // 不订阅

    wsServer.broadcast("body_schema", "body_schema_update", { platform: "test" });

    // 等一段时间确认没收到消息
    const received = await Promise.race([
      waitMessage(ws).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ]);
    expect(received).toBe(false);
  });

  it("sendToSession 应推送到匹配 session 的客户端", async () => {
    await setup();
    const ws1 = createClient();
    const ws2 = createClient();
    await Promise.all([waitOpen(ws1), waitOpen(ws2)]);

    ws1.send(JSON.stringify({ type: "subscribe", payload: { channel: "session", sessionId: "s1" } }));
    ws2.send(JSON.stringify({ type: "subscribe", payload: { channel: "session", sessionId: "s2" } }));
    await new Promise((r) => setTimeout(r, 50));

    wsServer.sendToSession("s1", "react_step", { step: 1 });

    const msg1 = await Promise.race([
      waitMessage(ws1).then((m) => m as { type: string }),
      new Promise<null>((r) => setTimeout(() => r(null), 200)),
    ]);
    const msg2 = await Promise.race([
      waitMessage(ws2).then((m) => m as { type: string }),
      new Promise<null>((r) => setTimeout(() => r(null), 200)),
    ]);

    expect(msg1).not.toBeNull();
    expect(msg1!.type).toBe("react_step");
    expect(msg2).toBeNull();
  });

  it("unsubscribe 后不应收到广播", async () => {
    await setup();
    const ws = createClient();
    await waitOpen(ws);

    ws.send(JSON.stringify({ type: "subscribe", payload: { channel: "body_schema" } }));
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: "unsubscribe", payload: { channel: "body_schema" } }));
    await new Promise((r) => setTimeout(r, 50));

    wsServer.broadcast("body_schema", "body_schema_update", { test: true });

    const received = await Promise.race([
      waitMessage(ws).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ]);
    expect(received).toBe(false);
  });
});
