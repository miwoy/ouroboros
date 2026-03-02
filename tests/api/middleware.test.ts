/**
 * API 中间件测试
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  authenticateRequest,
  createRateLimiter,
  setCorsHeaders,
  applyMiddleware,
} from "../../src/api/middleware.js";
import type { ApiConfig } from "../../src/api/types.js";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

/** 创建模拟请求 */
function createMockReq(headers: Record<string, string> = {}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.headers = { host: "localhost:3000", ...headers };
  req.method = "GET";
  return req;
}

/** 创建模拟响应 */
function createMockRes(): ServerResponse {
  const socket = new Socket();
  const res = new ServerResponse(new IncomingMessage(socket));
  res.writeHead = vi.fn(() => res) as unknown as typeof res.writeHead;
  res.end = vi.fn(() => res) as unknown as typeof res.end;
  res.setHeader = vi.fn() as unknown as typeof res.setHeader;
  return res;
}

const baseConfig: ApiConfig = {
  port: 3000,
  host: "127.0.0.1",
  apiKey: "test-key-123",
  rateLimit: { windowMs: 60000, maxRequests: 5 },
  corsOrigin: "*",
};

describe("authenticateRequest", () => {
  it("无 apiKey 配置时应跳过认证", () => {
    const req = createMockReq();
    const config = { ...baseConfig, apiKey: undefined };
    expect(authenticateRequest(req, config)).toBe(true);
  });

  it("Bearer token 正确时应通过认证", () => {
    const req = createMockReq({ authorization: "Bearer test-key-123" });
    expect(authenticateRequest(req, baseConfig)).toBe(true);
  });

  it("Bearer token 错误时应拒绝认证", () => {
    const req = createMockReq({ authorization: "Bearer wrong-key" });
    expect(authenticateRequest(req, baseConfig)).toBe(false);
  });

  it("X-API-Key 正确时应通过认证", () => {
    const req = createMockReq({ "x-api-key": "test-key-123" });
    expect(authenticateRequest(req, baseConfig)).toBe(true);
  });

  it("X-API-Key 错误时应拒绝认证", () => {
    const req = createMockReq({ "x-api-key": "wrong-key" });
    expect(authenticateRequest(req, baseConfig)).toBe(false);
  });

  it("无认证头时应拒绝认证", () => {
    const req = createMockReq();
    expect(authenticateRequest(req, baseConfig)).toBe(false);
  });
});

describe("createRateLimiter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("应在限制内允许请求", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 3 });
    expect(limiter.checkLimit("client-1")).toBe(true);
    expect(limiter.checkLimit("client-1")).toBe(true);
    expect(limiter.checkLimit("client-1")).toBe(true);
    limiter.destroy();
  });

  it("应在超出限制时拒绝请求", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
    limiter.checkLimit("client-1"); // 1
    limiter.checkLimit("client-1"); // 2
    expect(limiter.checkLimit("client-1")).toBe(false); // 3 = 被拒绝
    limiter.destroy();
  });

  it("不同客户端应独立计数", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    expect(limiter.checkLimit("client-1")).toBe(true);
    expect(limiter.checkLimit("client-2")).toBe(true);
    expect(limiter.checkLimit("client-1")).toBe(false);
    limiter.destroy();
  });

  it("getRemaining 应返回剩余请求数", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 });
    expect(limiter.getRemaining("client-1")).toBe(5);
    limiter.checkLimit("client-1");
    expect(limiter.getRemaining("client-1")).toBe(4);
    limiter.destroy();
  });

  it("窗口过期后应重置计数", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 });

    expect(limiter.checkLimit("client-1")).toBe(true);
    expect(limiter.checkLimit("client-1")).toBe(false);

    vi.advanceTimersByTime(1100);

    expect(limiter.checkLimit("client-1")).toBe(true);

    limiter.destroy();
    vi.useRealTimers();
  });
});

describe("setCorsHeaders", () => {
  it("应设置正确的 CORS 头", () => {
    const res = createMockRes();
    setCorsHeaders(res, "https://example.com");

    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "https://example.com",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-API-Key",
    );
  });
});

describe("applyMiddleware", () => {
  it("认证通过时应返回 true", () => {
    const req = createMockReq({
      authorization: "Bearer test-key-123",
      "x-forwarded-for": "127.0.0.1",
    });
    const res = createMockRes();
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 100 });

    const result = applyMiddleware(req, res, baseConfig, limiter);
    expect(result).toBe(true);

    limiter.destroy();
  });

  it("认证失败时应返回 false 并响应 401", () => {
    const req = createMockReq();
    const res = createMockRes();
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 100 });

    const result = applyMiddleware(req, res, baseConfig, limiter);
    expect(result).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(401, { "Content-Type": "application/json" });

    limiter.destroy();
  });

  it("OPTIONS 请求应返回 false 并响应 204", () => {
    const req = createMockReq();
    req.method = "OPTIONS";
    const res = createMockRes();
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 100 });

    const result = applyMiddleware(req, res, baseConfig, limiter);
    expect(result).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(204);

    limiter.destroy();
  });

  it("速率超限时应返回 false 并响应 429", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    const config = { ...baseConfig, apiKey: undefined }; // 跳过认证

    const req1 = createMockReq({ "x-forwarded-for": "1.2.3.4" });
    const res1 = createMockRes();
    applyMiddleware(req1, res1, config, limiter); // 第一次

    const req2 = createMockReq({ "x-forwarded-for": "1.2.3.4" });
    const res2 = createMockRes();
    const result = applyMiddleware(req2, res2, config, limiter); // 超限

    expect(result).toBe(false);
    expect(res2.writeHead).toHaveBeenCalledWith(429, { "Content-Type": "application/json" });

    limiter.destroy();
  });
});
