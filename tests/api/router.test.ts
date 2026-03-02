/**
 * HTTP 路由器测试
 */

import { describe, it, expect, vi } from "vitest";
import { createRouter } from "../../src/api/router.js";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

/** 创建模拟请求 */
function createMockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000" };

  // 模拟 body 数据
  if (body) {
    const json = JSON.stringify(body);
    process.nextTick(() => {
      req.emit("data", Buffer.from(json));
      req.emit("end");
    });
  } else {
    process.nextTick(() => {
      req.emit("end");
    });
  }

  return req;
}

/** 创建模拟响应 */
function createMockRes(): ServerResponse & { _body: string; _statusCode: number; _headers: Record<string, string> } {
  const socket = new Socket();
  const res = new ServerResponse(new IncomingMessage(socket)) as ServerResponse & {
    _body: string;
    _statusCode: number;
    _headers: Record<string, string>;
  };

  res._body = "";
  res._statusCode = 200;
  res._headers = {};

  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = vi.fn(((statusCode: number, headers?: Record<string, string>) => {
    res._statusCode = statusCode;
    if (headers) {
      Object.assign(res._headers, headers);
    }
    return originalWriteHead(statusCode, headers);
  }) as typeof res.writeHead);

  const originalEnd = res.end.bind(res);
  res.end = vi.fn(((data?: string | Buffer) => {
    if (data) res._body = data.toString();
    return originalEnd(data);
  }) as typeof res.end);

  return res;
}

describe("createRouter", () => {
  it("应成功匹配 GET 路由", async () => {
    const router = createRouter();
    const handler = vi.fn(async (ctx) => {
      ctx.respond(200, { ok: true });
    });

    router.get("/api/health", handler);

    const req = createMockReq("GET", "/api/health");
    const res = createMockRes();

    await router.handle(req, res);

    expect(handler).toHaveBeenCalled();
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body).toEqual({ ok: true });
  });

  it("应成功匹配 POST 路由并解析 body", async () => {
    const router = createRouter();
    const handler = vi.fn(async (ctx) => {
      ctx.respond(200, { received: ctx.body });
    });

    router.post("/api/messages", handler);

    const req = createMockReq("POST", "/api/messages", { message: "hello" });
    const res = createMockRes();

    await router.handle(req, res);

    expect(handler).toHaveBeenCalled();
    const body = JSON.parse(res._body);
    expect(body.received).toEqual({ message: "hello" });
  });

  it("应正确提取路径参数", async () => {
    const router = createRouter();
    const handler = vi.fn(async (ctx) => {
      ctx.respond(200, { id: ctx.params.sessionId });
    });

    router.get("/api/sessions/:sessionId", handler);

    const req = createMockReq("GET", "/api/sessions/abc-123");
    const res = createMockRes();

    await router.handle(req, res);

    const body = JSON.parse(res._body);
    expect(body.id).toBe("abc-123");
  });

  it("应返回 404 当路由不存在", async () => {
    const router = createRouter();
    router.get("/api/health", async (ctx) => ctx.respond(200, {}));

    const req = createMockReq("GET", "/api/nonexistent");
    const res = createMockRes();

    await router.handle(req, res);

    expect(res._statusCode).toBe(404);
    const body = JSON.parse(res._body);
    expect(body.success).toBe(false);
  });

  it("应处理 OPTIONS 预检请求", async () => {
    const router = createRouter();

    const req = createMockReq("OPTIONS", "/api/health");
    const res = createMockRes();

    await router.handle(req, res);

    expect(res._statusCode).toBe(204);
  });

  it("应正确解析 query 参数", async () => {
    const router = createRouter();
    const handler = vi.fn(async (ctx) => {
      ctx.respond(200, { page: ctx.query.page, limit: ctx.query.limit });
    });

    router.get("/api/items", handler);

    const req = createMockReq("GET", "/api/items?page=2&limit=10");
    const res = createMockRes();

    await router.handle(req, res);

    const body = JSON.parse(res._body);
    expect(body.page).toBe("2");
    expect(body.limit).toBe("10");
  });
});

describe("matchRoute", () => {
  it("应正确匹配简单路由", () => {
    const router = createRouter();
    router.get("/api/health", async () => {});

    const result = router.matchRoute("GET", "/api/health");
    expect(result).not.toBeNull();
    expect(result!.params).toEqual({});
  });

  it("应正确匹配带参数路由", () => {
    const router = createRouter();
    router.get("/api/sessions/:sessionId/messages/:messageId", async () => {});

    const result = router.matchRoute("GET", "/api/sessions/s1/messages/m1");
    expect(result).not.toBeNull();
    expect(result!.params).toEqual({ sessionId: "s1", messageId: "m1" });
  });

  it("方法不匹配时返回 null", () => {
    const router = createRouter();
    router.get("/api/health", async () => {});

    const result = router.matchRoute("POST", "/api/health");
    expect(result).toBeNull();
  });

  it("路径段数不匹配时返回 null", () => {
    const router = createRouter();
    router.get("/api/health", async () => {});

    const result = router.matchRoute("GET", "/api/health/extra");
    expect(result).toBeNull();
  });
});
