/**
 * 工具执行器
 *
 * 负责分发工具调用、校验、超时控制和错误处理。
 *
 * 执行流程：
 * 1. 查找工具（NotFound 检查）
 * 2. 校验状态（必须 active）
 * 3. 校验 input vs inputSchema
 * 4. 路由 entrypoint：builtin:* → 内置 handler，scripts/* → 动态 import
 * 5. 超时控制（AbortController）
 * 6. 重试包装（如配置了 retry）
 * 7. 计时，构建 ToolCallResponse
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ToolNotFoundError,
  ToolValidationError,
  ToolTimeoutError,
  ToolExecutionError,
} from "../errors/index.js";
import { validateToolInput } from "./schema.js";
import { handleCallModel } from "./builtin/call-model.js";
import { handleRunAgent } from "./builtin/run-agent.js";
import { handleSearchTool } from "./builtin/search-tool.js";
import { handleCreateTool } from "./builtin/create-tool.js";
import { handleBash } from "./builtin/bash.js";
import { handleRead } from "./builtin/read.js";
import { handleWrite } from "./builtin/write.js";
import { handleEdit } from "./builtin/edit.js";
import { handleFind } from "./builtin/find.js";
import { handleWebSearch } from "./builtin/web-search.js";
import { handleWebFetch } from "./builtin/web-fetch.js";
import { handleSearchSkill } from "./builtin/search-skill.js";
import { handleCreateSkill } from "./builtin/create-skill.js";
import {
  EntityStatus,
  ToolErrorCode,
  type CallModelFn,
  type ToolCallRequest,
  type ToolCallResponse,
  type ToolExecutionContext,
  type ToolHandler,
  type ToolRegistry,
} from "./types.js";

/** 工具执行器接口 */
export interface ToolExecutor {
  execute(request: ToolCallRequest): Promise<ToolCallResponse>;
}

/** 内置工具 handler 映射 */
const BUILTIN_HANDLERS: Readonly<Record<string, ToolHandler>> = {
  // 一级工具
  "builtin:call-model": handleCallModel,
  "builtin:run-agent": handleRunAgent,
  "builtin:search-tool": handleSearchTool,
  "builtin:create-tool": handleCreateTool,
  // 二级工具
  "builtin:bash": handleBash,
  "builtin:read": handleRead,
  "builtin:write": handleWrite,
  "builtin:edit": handleEdit,
  "builtin:find": handleFind,
  "builtin:web-search": handleWebSearch,
  "builtin:web-fetch": handleWebFetch,
  "builtin:search-skill": handleSearchSkill,
  "builtin:create-skill": handleCreateSkill,
};

/**
 * 创建工具执行器
 *
 * @param registry - 工具注册表
 * @param baseContext - 基础执行上下文（不含 caller 和 signal）
 * @returns 工具执行器实例
 */
export function createToolExecutor(
  registry: ToolRegistry,
  baseContext: {
    readonly workspacePath: string;
    readonly callModel: CallModelFn;
    readonly httpFetch?: typeof globalThis.fetch;
    readonly config?: ToolExecutionContext["config"];
  },
): ToolExecutor {
  return {
    async execute(request: ToolCallRequest): Promise<ToolCallResponse> {
      const startTime = Date.now();

      try {
        // 1. 查找工具
        const tool = registry.get(request.toolId);
        if (!tool) {
          throw new ToolNotFoundError(request.toolId);
        }

        // 2. 校验状态
        if (tool.status !== EntityStatus.Active) {
          throw new ToolValidationError(
            `工具 "${request.toolId}" 当前状态为 ${tool.status}，仅 active 状态可执行`,
          );
        }

        // 3. 校验输入
        const validationErrors = validateToolInput(request.input, tool.inputSchema);
        if (validationErrors.length > 0) {
          throw new ToolValidationError(
            `工具 "${request.toolId}" 输入校验失败: ${validationErrors.join("; ")}`,
          );
        }

        // 4. 路由并执行
        const timeout = tool.timeout ?? 30000;
        const output = await executeWithTimeout(
          tool.entrypoint,
          request.input,
          {
            workspacePath: baseContext.workspacePath,
            callModel: baseContext.callModel,
            registry,
            caller: request.caller,
            httpFetch: baseContext.httpFetch,
            config: baseContext.config,
          },
          timeout,
          request.toolId,
        );

        return {
          requestId: request.requestId,
          success: true,
          output,
          duration: Date.now() - startTime,
        };
      } catch (err) {
        return buildErrorResponse(request.requestId, err, Date.now() - startTime);
      }
    },
  };
}

/**
 * 带超时控制的工具执行
 */
async function executeWithTimeout(
  entrypoint: string,
  input: Readonly<Record<string, unknown>>,
  context: Omit<ToolExecutionContext, "signal">,
  timeoutMs: number,
  toolId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new ToolTimeoutError(toolId, timeoutMs));
  }, timeoutMs);

  const fullContext: ToolExecutionContext = {
    ...context,
    signal: controller.signal,
  };

  try {
    const handler = await resolveHandler(entrypoint, context.workspacePath);
    return await handler(input, fullContext);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析入口为 handler 函数
 * - builtin:* → 内置 handler
 * - scripts/* → 动态 import
 */
async function resolveHandler(entrypoint: string, workspacePath: string): Promise<ToolHandler> {
  // 内置工具
  if (entrypoint.startsWith("builtin:")) {
    const handler = BUILTIN_HANDLERS[entrypoint];
    if (!handler) {
      throw new ToolExecutionError(`未知的内置工具入口: ${entrypoint}`);
    }
    return handler;
  }

  // 自定义脚本
  if (entrypoint.startsWith("scripts/")) {
    const scriptPath = resolve(workspacePath, "tools", entrypoint);
    const moduleUrl = pathToFileURL(scriptPath).href;
    try {
      const mod = await import(moduleUrl);
      if (typeof mod.default !== "function") {
        throw new ToolExecutionError(
          `脚本 ${entrypoint} 必须导出默认函数，实际类型: ${typeof mod.default}`,
        );
      }
      return mod.default as ToolHandler;
    } catch (err) {
      if (err instanceof ToolExecutionError) throw err;
      throw new ToolExecutionError(
        `加载脚本 ${entrypoint} 失败: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  throw new ToolExecutionError(`不支持的入口类型: ${entrypoint}`);
}

/**
 * 构建错误响应
 */
function buildErrorResponse(requestId: string, err: unknown, duration: number): ToolCallResponse {
  if (err instanceof ToolNotFoundError) {
    return {
      requestId,
      success: false,
      error: {
        code: ToolErrorCode.NotFound,
        message: err.message,
        retryable: false,
      },
      duration,
    };
  }

  if (err instanceof ToolValidationError) {
    return {
      requestId,
      success: false,
      error: {
        code: ToolErrorCode.InvalidInput,
        message: err.message,
        retryable: false,
      },
      duration,
    };
  }

  if (err instanceof ToolTimeoutError) {
    return {
      requestId,
      success: false,
      error: {
        code: ToolErrorCode.Timeout,
        message: err.message,
        retryable: true,
      },
      duration,
    };
  }

  // 通用运行时错误
  const message = err instanceof Error ? err.message : String(err);
  return {
    requestId,
    success: false,
    error: {
      code: ToolErrorCode.RuntimeError,
      message,
      retryable: false,
    },
    duration,
  };
}
