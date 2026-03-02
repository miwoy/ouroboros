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

// ─── 工具系统错误 ──────────────────────────────────────────────────

/** 工具相关错误基类 */
export class ToolError extends OuroborosError {
  constructor(
    message: string,
    public readonly toolErrorCode: string,
    cause?: unknown,
  ) {
    super(message, "TOOL_ERROR", cause);
    this.name = "ToolError";
  }
}

/** 工具未找到 */
export class ToolNotFoundError extends ToolError {
  constructor(toolId: string) {
    super(`工具 "${toolId}" 不存在`, "NOT_FOUND");
    this.name = "ToolNotFoundError";
  }
}

/** 工具输入校验失败 */
export class ToolValidationError extends ToolError {
  constructor(message: string, cause?: unknown) {
    super(message, "INVALID_INPUT", cause);
    this.name = "ToolValidationError";
  }
}

/** 工具执行超时 */
export class ToolTimeoutError extends ToolError {
  constructor(toolId: string, timeoutMs: number) {
    super(`工具 "${toolId}" 执行超时（${timeoutMs}ms）`, "TIMEOUT");
    this.name = "ToolTimeoutError";
  }
}

/** 工具运行时错误 */
export class ToolExecutionError extends ToolError {
  constructor(message: string, cause?: unknown) {
    super(message, "RUNTIME_ERROR", cause);
    this.name = "ToolExecutionError";
  }
}

/** 工具未实现（stub） */
export class ToolNotImplementedError extends ToolError {
  constructor(toolId: string, reason: string) {
    super(`${toolId} ${reason}`, "RUNTIME_ERROR");
    this.name = "ToolNotImplementedError";
  }
}

// ─── ReAct 循环错误 ──────────────────────────────────────────────────

/** ReAct 循环相关错误基类 */
export class ReactError extends OuroborosError {
  constructor(message: string, cause?: unknown) {
    super(message, "REACT_ERROR", cause);
    this.name = "ReactError";
  }
}

/** 达到最大迭代次数 */
export class MaxIterationsError extends ReactError {
  constructor(maxIterations: number) {
    super(`ReAct 循环达到最大迭代次数（${maxIterations}）`);
    this.name = "MaxIterationsError";
  }
}

/** 执行树操作错误 */
export class ExecutionTreeError extends ReactError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ExecutionTreeError";
  }
}

// ─── 持久化系统错误 ──────────────────────────────────────────────────

/** 持久化相关错误基类 */
export class PersistenceError extends OuroborosError {
  constructor(message: string, cause?: unknown) {
    super(message, "PERSISTENCE_ERROR", cause);
    this.name = "PersistenceError";
  }
}

/** 状态文件损坏 */
export class StateCorruptedError extends PersistenceError {
  constructor(filePath: string, cause?: unknown) {
    super(`状态文件损坏: ${filePath}`, cause);
    this.name = "StateCorruptedError";
  }
}

/** 状态恢复失败 */
export class StateRecoveryError extends PersistenceError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "StateRecoveryError";
  }
}
