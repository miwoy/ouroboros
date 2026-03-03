import type { Config } from "../config/schema.js";
import { ModelTimeoutError } from "../errors/index.js";
import type { ProviderRegistry } from "./registry.js";
import { withRetry } from "./retry.js";
import type { ModelRequest, ModelResponse, StreamCallback } from "./types.js";

/** callModel 额外选项 */
export interface CallModelOptions {
  /** 指定使用的提供商名称（覆盖默认提供商） */
  readonly provider?: string;
  /** 是否使用流式输出 */
  readonly stream?: boolean;
  /** 流式事件回调 */
  readonly onStream?: StreamCallback;
  /** 取消信号 */
  readonly signal?: AbortSignal;
}

/**
 * 创建 callModel 函数
 * 这是模型调用的统一入口，封装了提供商选择、超时控制和重试逻辑
 *
 * @param config - 全局配置
 * @param registry - 提供商注册表
 * @param defaultProvider - 默认提供商名称（从 agents.default.model 解析）
 * @returns callModel 函数
 */
export function createCallModel(
  config: Readonly<Config>,
  registry: ProviderRegistry,
  defaultProvider: string,
): (request: ModelRequest, options?: CallModelOptions) => Promise<ModelResponse> {
  const { timeout, maxRetries, retryBaseDelay } = config.system.model;

  // 全局 think 配置（从默认 Agent 获取）
  const defaultAgent = config.agents.default;
  const globalThinkLevel = defaultAgent.thinkLevel;
  // thinkLevel !== "off" 表示启用 thinking
  const globalThink = globalThinkLevel !== "off";

  return async function callModel(
    request: ModelRequest,
    options?: CallModelOptions,
  ): Promise<ModelResponse> {
    const providerName = options?.provider ?? defaultProvider;
    const provider = await registry.get(providerName);

    // 注入全局 think 默认值（request 中显式设置时优先）
    const resolvedThinkLevel = globalThinkLevel !== "off" ? globalThinkLevel : undefined;
    const finalRequest: ModelRequest = {
      ...request,
      think: request.think ?? globalThink,
      thinkLevel: request.thinkLevel ?? resolvedThinkLevel,
    };

    // 创建超时控制
    const controller = new AbortController();
    const externalSignal = options?.signal;

    // 合并外部取消信号
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener(
          "abort",
          () => {
            controller.abort(externalSignal.reason);
          },
          { once: true },
        );
      }
    }

    // 超时定时器
    const timer = setTimeout(() => {
      controller.abort(new ModelTimeoutError(timeout));
    }, timeout);

    try {
      const result = await withRetry(
        async () => {
          if (options?.stream && options.onStream) {
            return provider.stream(finalRequest, options.onStream, controller.signal);
          }
          return provider.complete(finalRequest, controller.signal);
        },
        {
          maxRetries,
          baseDelay: retryBaseDelay,
          signal: controller.signal,
        },
      );
      return result;
    } finally {
      clearTimeout(timer);
    }
  };
}
