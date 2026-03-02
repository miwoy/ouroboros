/**
 * API 服务器测试
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createApiServer } from "../../src/api/server.js";
import type { ApiDeps } from "../../src/api/types.js";
import type { Logger } from "../../src/logger/types.js";

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createDeps(overrides?: Partial<ApiDeps>): ApiDeps {
  return {
    logger: createMockLogger(),
    workspacePath: "/tmp/test-workspace",
    config: {
      port: 0, // 随机端口
      host: "127.0.0.1",
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      corsOrigin: "*",
    },
    ...overrides,
  };
}

describe("createApiServer", () => {
  let server: ReturnType<typeof createApiServer> | null = null;

  afterEach(async () => {
    if (server && server.getHttpServer().listening) {
      await server.stop();
    }
    server = null;
  });

  it("应创建服务器实例", () => {
    const deps = createDeps();
    const s = createApiServer(deps);

    expect(s).toBeDefined();
    expect(s.start).toBeInstanceOf(Function);
    expect(s.stop).toBeInstanceOf(Function);
    expect(s.getHttpServer).toBeInstanceOf(Function);
    expect(s.getSessionManager).toBeInstanceOf(Function);
  });

  it("应成功启动和停止", async () => {
    const deps = createDeps();
    server = createApiServer(deps);

    await server.start();
    const httpServer = server.getHttpServer();
    expect(httpServer.listening).toBe(true);

    await server.stop();
    expect(httpServer.listening).toBe(false);
    server = null;
  });

  it("应返回 SessionManager 实例", () => {
    const deps = createDeps();
    const s = createApiServer(deps);

    const sm = s.getSessionManager();
    expect(sm.createSession).toBeInstanceOf(Function);
    expect(sm.getSession).toBeInstanceOf(Function);
    expect(sm.listSessions).toBeInstanceOf(Function);
  });

  it("应能处理 HTTP 请求", async () => {
    const deps = createDeps();
    server = createApiServer(deps);

    await server.start();
    const addr = server.getHttpServer().address();
    if (!addr || typeof addr === "string") throw new Error("无效地址");

    const res = await fetch(`http://127.0.0.1:${addr.port}/api/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
  });

  it("应返回 404 对不存在的路由", async () => {
    const deps = createDeps();
    server = createApiServer(deps);

    await server.start();
    const addr = server.getHttpServer().address();
    if (!addr || typeof addr === "string") throw new Error("无效地址");

    const res = await fetch(`http://127.0.0.1:${addr.port}/api/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("应支持 API Key 认证", async () => {
    const deps = createDeps({
      config: {
        port: 0,
        host: "127.0.0.1",
        apiKey: "secret-key",
        rateLimit: { windowMs: 60000, maxRequests: 100 },
        corsOrigin: "*",
      },
    });
    server = createApiServer(deps);

    await server.start();
    const addr = server.getHttpServer().address();
    if (!addr || typeof addr === "string") throw new Error("无效地址");

    // 无认证应返回 401
    const res1 = await fetch(`http://127.0.0.1:${addr.port}/api/health`);
    expect(res1.status).toBe(401);

    // 有正确认证应通过
    const res2 = await fetch(`http://127.0.0.1:${addr.port}/api/health`, {
      headers: { Authorization: "Bearer secret-key" },
    });
    expect(res2.status).toBe(200);
  });
});
