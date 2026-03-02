/**
 * 技能执行器
 *
 * 负责技能的执行流程：
 * 1. 查找技能定义
 * 2. 校验和渲染模板变量
 * 3. 筛选 requiredTools
 * 4. 通过 ReAct 循环执行任务
 * 5. 收集工具调用记录
 * 6. 返回 SkillExecuteResponse
 */

import { renderTemplate, validateVariables } from "../prompt/template.js";
import type { OuroborosTool, CallModelFn, ToolRegistry } from "../tool/types.js";
import type { ToolExecutor } from "../tool/executor.js";
import type { Logger } from "../logger/types.js";
import { runReactLoop, type ReactLoopConfig } from "../core/index.js";
import type { SchemaProvider } from "../schema/schema-provider.js";
import {
  EntityStatus,
  type SkillDefinition,
  type SkillExecuteRequest,
  type SkillExecuteResponse,
  type SkillRegistry,
  type ToolCallRecord,
} from "./types.js";

/** 技能执行器接口 */
export interface SkillExecutor {
  execute(request: SkillExecuteRequest): Promise<SkillExecuteResponse>;
}

/** 技能执行器依赖 */
export interface SkillExecutorDeps {
  readonly skillRegistry: SkillRegistry;
  readonly toolRegistry: ToolRegistry;
  readonly toolExecutor: ToolExecutor;
  readonly callModel: CallModelFn;
  readonly logger: Logger;
  readonly workspacePath: string;
  readonly reactConfig?: Partial<ReactLoopConfig>;
  /** 自我图式提供者（用于注入运行环境信息） */
  readonly schemaProvider?: SchemaProvider;
}

/**
 * 创建技能执行器
 *
 * @param deps - 执行依赖
 * @returns 技能执行器实例
 */
export function createSkillExecutor(deps: SkillExecutorDeps): SkillExecutor {
  return {
    async execute(request: SkillExecuteRequest): Promise<SkillExecuteResponse> {
      const startTime = Date.now();

      try {
        // 1. 查找技能
        const skill = deps.skillRegistry.get(request.skillId);
        if (!skill) {
          return buildErrorResponse(
            request.requestId,
            "NOT_FOUND",
            `技能 "${request.skillId}" 不存在`,
            startTime,
          );
        }

        // 2. 校验状态
        if (skill.status !== EntityStatus.Active) {
          return buildErrorResponse(
            request.requestId,
            "INVALID_STATUS",
            `技能 "${request.skillId}" 当前状态为 ${skill.status}，仅 active 状态可执行`,
            startTime,
          );
        }

        // 3. 校验并渲染模板变量
        const renderedTemplate = renderSkillTemplate(skill, request.variables);
        if (renderedTemplate.error) {
          return buildErrorResponse(
            request.requestId,
            "INVALID_INPUT",
            renderedTemplate.error,
            startTime,
          );
        }

        // 4. 构建任务描述
        const task = buildTask(renderedTemplate.content!, request.context);

        // 5. 筛选 requiredTools
        const tools = resolveTools(skill, deps.toolRegistry);

        // 6. 运行 ReAct 循环
        const reactConfig: ReactLoopConfig = {
          maxIterations: deps.reactConfig?.maxIterations ?? 20,
          stepTimeout: deps.reactConfig?.stepTimeout ?? 60000,
          parallelToolCalls: deps.reactConfig?.parallelToolCalls ?? true,
          compressionThreshold: deps.reactConfig?.compressionThreshold ?? 10,
          agentId: request.caller.entityId,
        };

        const contextPrompt = buildContextPrompt(skill, deps.schemaProvider);

        const result = await runReactLoop(task, contextPrompt, tools, reactConfig, {
          callModel: deps.callModel,
          toolExecutor: deps.toolExecutor,
          toolRegistry: deps.toolRegistry,
          logger: deps.logger,
          workspacePath: deps.workspacePath,
        });

        // 7. 收集工具调用记录
        const toolCalls = extractToolCalls(result.steps);

        deps.logger.info("skill-executor", `技能 ${request.skillId} 执行完成`, {
          stopReason: result.stopReason,
          steps: result.totalIterations,
          toolCalls: toolCalls.length,
        });

        return {
          requestId: request.requestId,
          success: result.stopReason === "completed",
          result: result.answer,
          toolCalls,
          duration: Date.now() - startTime,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.logger.error("skill-executor", `技能 ${request.skillId} 执行失败: ${message}`);
        return buildErrorResponse(request.requestId, "RUNTIME_ERROR", message, startTime);
      }
    },
  };
}

// ─── 内部函数 ──────────────────────────────────────────────────

/** 渲染技能模板 */
function renderSkillTemplate(
  skill: SkillDefinition,
  variables: Readonly<Record<string, string>>,
): { content: string; error?: undefined } | { content?: undefined; error: string } {
  try {
    // 校验必填变量
    if (skill.variables && skill.variables.length > 0) {
      const missing = validateVariables(skill.variables, variables as Record<string, string>);
      if (missing.length > 0) {
        return { error: `缺少必填变量: ${missing.join(", ")}` };
      }
    }

    const content = renderTemplate(
      skill.promptTemplate,
      variables,
      skill.variables ? [...skill.variables] : undefined,
    );
    return { content };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** 构建完整任务描述 */
function buildTask(renderedTemplate: string, context?: string): string {
  if (context) {
    return `${renderedTemplate}\n\n## 附加上下文\n${context}`;
  }
  return renderedTemplate;
}

/** 构建上下文提示词（运行环境 + 技能身份描述） */
function buildContextPrompt(skill: SkillDefinition, schemaProvider?: SchemaProvider): string {
  const parts: string[] = [];

  // 注入身体图式（资源感知）
  if (schemaProvider) {
    const vars = schemaProvider.getVariables();
    parts.push(
      `## 运行环境\n- 平台: ${vars.platform}\n- 可用内存: ${vars.availableMemory}\n- 工作目录: ${vars.workspacePath}\n`,
    );
  }

  parts.push(`你正在执行技能「${skill.name}」。`);
  parts.push(`技能描述：${skill.description}`);

  if (skill.outputDescription) {
    parts.push(`预期输出：${skill.outputDescription}`);
  }

  return parts.join("\n");
}

/** 解析技能依赖的工具列表 */
function resolveTools(
  skill: SkillDefinition,
  toolRegistry: ToolRegistry,
): readonly OuroborosTool[] {
  if (skill.requiredTools.length === 0) {
    // 没有指定 requiredTools 时，使用所有可用工具
    return toolRegistry.list();
  }

  const tools: OuroborosTool[] = [];
  for (const toolId of skill.requiredTools) {
    const tool = toolRegistry.get(toolId);
    if (tool) {
      tools.push(tool);
    }
  }

  // 始终包含基础工具
  const essentialIds = ["tool:call-model", "tool:search-tool"];
  for (const id of essentialIds) {
    if (!tools.some((t) => t.id === id)) {
      const tool = toolRegistry.get(id);
      if (tool) tools.push(tool);
    }
  }

  return tools;
}

/** 从 ReactResult 步骤中提取工具调用记录 */
function extractToolCalls(
  steps: readonly {
    readonly toolCalls: readonly {
      readonly toolId: string;
      readonly input: Readonly<Record<string, unknown>>;
      readonly output?: Readonly<Record<string, unknown>>;
      readonly success: boolean;
      readonly duration: number;
    }[];
  }[],
): readonly ToolCallRecord[] {
  const records: ToolCallRecord[] = [];
  for (const step of steps) {
    for (const tc of step.toolCalls) {
      records.push({
        toolId: tc.toolId,
        input: tc.input,
        output: tc.output,
        success: tc.success,
        duration: tc.duration,
      });
    }
  }
  return records;
}

/** 构建错误响应 */
function buildErrorResponse(
  requestId: string,
  code: string,
  message: string,
  startTime: number,
): SkillExecuteResponse {
  return {
    requestId,
    success: false,
    error: { code, message, retryable: false },
    toolCalls: [],
    duration: Date.now() - startTime,
  };
}
