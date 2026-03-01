/**
 * Ouroboros 错误基类
 */
export class OuroborosError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OuroborosError";
  }
}

/** 配置相关错误 */
export class ConfigError extends OuroborosError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONFIG_ERROR", cause);
    this.name = "ConfigError";
  }
}

/** 模型调用相关错误 */
export class ModelError extends OuroborosError {
  constructor(message: string, cause?: unknown) {
    super(message, "MODEL_ERROR", cause);
    this.name = "ModelError";
  }
}

/** 模型提供商未找到 */
export class ProviderNotFoundError extends OuroborosError {
  constructor(provider: string) {
    super(`模型提供商 "${provider}" 未注册`, "PROVIDER_NOT_FOUND");
    this.name = "ProviderNotFoundError";
  }
}

/** 模型调用超时 */
export class ModelTimeoutError extends ModelError {
  constructor(timeoutMs: number) {
    super(`模型调用超时（${timeoutMs}ms）`);
    this.name = "ModelTimeoutError";
  }
}

/** 重试耗尽 */
export class RetryExhaustedError extends ModelError {
  constructor(attempts: number, lastError: unknown) {
    super(`重试 ${attempts} 次后仍然失败`, lastError);
    this.name = "RetryExhaustedError";
  }
}
