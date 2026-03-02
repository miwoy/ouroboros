/**
 * 统一响应构建器测试
 */

import { describe, it, expect } from "vitest";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  notFoundError,
  badRequestError,
  unauthorizedError,
  rateLimitedError,
  internalError,
} from "../../src/api/response.js";

describe("successResponse", () => {
  it("应构建正确的成功响应", () => {
    const result = successResponse({ id: "1" });
    expect(result).toEqual({
      success: true,
      data: { id: "1" },
      error: null,
      metadata: undefined,
    });
  });

  it("应支持元数据", () => {
    const result = successResponse("ok", { total: 10 });
    expect(result.metadata).toEqual({ total: 10 });
  });
});

describe("errorResponse", () => {
  it("应构建正确的错误响应", () => {
    const result = errorResponse("ERR", "出错了");
    expect(result).toEqual({
      success: false,
      data: null,
      error: { code: "ERR", message: "出错了" },
    });
  });
});

describe("paginatedResponse", () => {
  it("应构建正确的分页响应", () => {
    const result = paginatedResponse([1, 2, 3], 100, 2, 10);
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.metadata).toEqual({ total: 100, page: 2, limit: 10 });
  });
});

describe("预定义错误", () => {
  it("notFoundError 应返回 NOT_FOUND 代码", () => {
    const result = notFoundError("用户");
    expect(result.error?.code).toBe("NOT_FOUND");
    expect(result.error?.message).toContain("用户");
  });

  it("badRequestError 应返回 BAD_REQUEST 代码", () => {
    const result = badRequestError("参数无效");
    expect(result.error?.code).toBe("BAD_REQUEST");
    expect(result.error?.message).toBe("参数无效");
  });

  it("unauthorizedError 应返回 UNAUTHORIZED 代码", () => {
    const result = unauthorizedError();
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("rateLimitedError 应返回 RATE_LIMITED 代码", () => {
    const result = rateLimitedError();
    expect(result.error?.code).toBe("RATE_LIMITED");
  });

  it("internalError 应返回 INTERNAL_ERROR 代码", () => {
    const result = internalError("服务异常");
    expect(result.error?.code).toBe("INTERNAL_ERROR");
    expect(result.error?.message).toBe("服务异常");
  });
});
