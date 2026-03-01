import { RetryExhaustedError } from "../errors/index.js";

/** 重试配置 */
export interface RetryOptions {
  /** 最大重试次数 */
  readonly maxRetries: number;
  /** 基础延迟（毫秒），实际延迟 = baseDelay * 2^attempt */
  readonly baseDelay: number;
  /** 取消信号 */
  readonly signal?: AbortSignal;
}

/**
 * 判断错误是否可重试
 * HTTP 429（限流）和 5xx（服务端错误）可重试
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // 限流或服务端临时错误
    if (message.includes("429") || message.includes("rate limit")) return true;
    if (message.includes("500") || message.includes("502") || message.includes("503")) return true;
    if (message.includes("timeout") || message.includes("econnreset")) return true;
  }
  return false;
}

/**
 * 计算指数退避延迟（带抖动）
 */
function calculateDelay(attempt: number, baseDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  // 添加 ±25% 的随机抖动，避免雷群效应
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(exponentialDelay + jitter);
}

/**
 * 延迟指定毫秒，支持取消
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * 带重试的异步函数执行器
 * 使用指数退避 + 抖动策略
 *
 * @param fn - 要执行的异步函数
 * @param options - 重试配置
 * @returns 函数执行结果
 * @throws RetryExhaustedError 当重试次数耗尽时抛出
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxRetries, baseDelay, signal } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 如果已取消，立即抛出
      if (signal?.aborted) {
        throw error;
      }

      // 不可重试的错误，直接抛出原始错误
      if (!isRetryableError(error)) {
        throw error;
      }

      // 最后一次尝试，跳出循环
      if (attempt === maxRetries) {
        break;
      }

      // 等待后重试
      const waitMs = calculateDelay(attempt, baseDelay);
      await delay(waitMs, signal);
    }
  }

  throw new RetryExhaustedError(maxRetries + 1, lastError);
}
