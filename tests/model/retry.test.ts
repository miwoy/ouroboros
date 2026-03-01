import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/model/retry.js";
import { RetryExhaustedError } from "../../src/errors/index.js";

describe("withRetry", () => {
  it("应该在第一次成功时直接返回结果", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("应该在可重试错误后继续尝试", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("应该在不可重试错误时立即抛出", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelay: 10 }),
    ).rejects.toThrow("401 Unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("应该在重试耗尽后抛出 RetryExhaustedError", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("503 Service Unavailable"));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 10 }),
    ).rejects.toThrow(RetryExhaustedError);
    // 初始调用 + 2 次重试 = 3 次
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("应该在 maxRetries=0 时不重试", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("500 Internal Server Error"));

    await expect(
      withRetry(fn, { maxRetries: 0, baseDelay: 10 }),
    ).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("应该在 signal 被取消时立即停止", async () => {
    const controller = new AbortController();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockImplementation(async () => {
        // 第二次调用前取消
        controller.abort(new Error("cancelled"));
        throw new Error("429 rate limit");
      });

    await expect(
      withRetry(fn, { maxRetries: 5, baseDelay: 10, signal: controller.signal }),
    ).rejects.toThrow();
  });

  it("应该支持 timeout 相关错误的重试", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
