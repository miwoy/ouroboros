/**
 * API 中间件
 *
 * - API Key 认证
 * - 速率限制（滑动窗口）
 * - CORS 头注入
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiConfig, RateLimitConfig } from "./types.js";
import { unauthorizedError, rateLimitedError } from "./response.js";

// ─── 认证中间件 ──────────────────────────────────────────────

/**
 * 验证 API Key
 *
 * 从 Authorization: Bearer <key> 或 X-API-Key 头获取密钥。
 * 配置中未设置 apiKey 则跳过认证。
 */
export function authenticateRequest(
  req: IncomingMessage,
  config: ApiConfig,
): boolean {
  if (!config.apiKey) return true; // 未配置则无认证

  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers["x-api-key"];

  // Bearer token
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    return token === config.apiKey;
  }

  // X-API-Key header
  if (typeof apiKeyHeader === "string") {
    return apiKeyHeader === config.apiKey;
  }

  return false;
}

// ─── 速率限制 ──────────────────────────────────────────────

/** 速率限制记录 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * 创建速率限制器
 *
 * 基于 IP 地址的滑动窗口速率限制。
 */
export function createRateLimiter(config: RateLimitConfig) {
  const entries = new Map<string, RateLimitEntry>();

  // 定期清理过期条目
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
  }, config.windowMs);

  // 防止阻止进程退出
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  /**
   * 检查请求是否在限制内
   *
   * @returns true 表示请求被允许，false 表示被限制
   */
  function checkLimit(clientId: string): boolean {
    const now = Date.now();
    const entry = entries.get(clientId);

    if (!entry || entry.resetAt <= now) {
      entries.set(clientId, { count: 1, resetAt: now + config.windowMs });
      return true;
    }

    entry.count++;
    return entry.count <= config.maxRequests;
  }

  /**
   * 获取客户端剩余请求数
   */
  function getRemaining(clientId: string): number {
    const entry = entries.get(clientId);
    if (!entry || entry.resetAt <= Date.now()) return config.maxRequests;
    return Math.max(0, config.maxRequests - entry.count);
  }

  function destroy(): void {
    clearInterval(cleanupInterval);
    entries.clear();
  }

  return { checkLimit, getRemaining, destroy };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

// ─── CORS 头 ──────────────────────────────────────────────

/**
 * 设置 CORS 响应头
 */
export function setCorsHeaders(res: ServerResponse, origin: string): void {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ─── 中间件链 ──────────────────────────────────────────────

/**
 * 应用请求中间件
 *
 * @returns true 表示请求可以继续处理，false 表示已被中间件拦截
 */
export function applyMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  config: ApiConfig,
  rateLimiter: RateLimiter,
): boolean {
  // CORS
  setCorsHeaders(res, config.corsOrigin);

  // OPTIONS 预检
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return false;
  }

  // 认证
  if (!authenticateRequest(req, config)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify(unauthorizedError()));
    return false;
  }

  // 速率限制
  const clientId = getClientId(req);
  if (!rateLimiter.checkLimit(clientId)) {
    const remaining = rateLimiter.getRemaining(clientId);
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rateLimitedError()));
    return false;
  }

  return true;
}

/**
 * 获取客户端标识（用于速率限制）
 */
function getClientId(req: IncomingMessage): string {
  // 优先使用 X-Forwarded-For
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
