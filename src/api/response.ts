/**
 * 统一响应构建器
 *
 * 所有 API 响应统一格式：{ success, data, error, metadata }
 */

import type { ApiResponse, ResponseMetadata } from "./types.js";

/**
 * 构建成功响应
 */
export function successResponse<T>(data: T, metadata?: ResponseMetadata): ApiResponse<T> {
  return { success: true, data, error: null, metadata };
}

/**
 * 构建错误响应
 */
export function errorResponse(code: string, message: string): ApiResponse<null> {
  return { success: false, data: null, error: { code, message } };
}

/**
 * 构建分页响应
 */
export function paginatedResponse<T>(
  data: T,
  total: number,
  page: number,
  limit: number,
): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    metadata: { total, page, limit },
  };
}

// ─── 常用错误 ──────────────────────────────────────────────

export function notFoundError(resource: string): ApiResponse<null> {
  return errorResponse("NOT_FOUND", `${resource} 不存在`);
}

export function badRequestError(message: string): ApiResponse<null> {
  return errorResponse("BAD_REQUEST", message);
}

export function unauthorizedError(): ApiResponse<null> {
  return errorResponse("UNAUTHORIZED", "未提供有效的 API 密钥");
}

export function rateLimitedError(): ApiResponse<null> {
  return errorResponse("RATE_LIMITED", "请求过于频繁，请稍后重试");
}

export function internalError(message: string): ApiResponse<null> {
  return errorResponse("INTERNAL_ERROR", message);
}
