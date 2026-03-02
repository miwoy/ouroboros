/**
 * OuroborosTool → 模型层 ToolDefinition 转换器
 *
 * 将系统工具定义转换为模型层可理解的工具定义格式，
 * 供 callModel 时注入 tools 参数使用。
 */

import type { ToolDefinition, ToolParameterSchema } from "../model/types.js";
import type { OuroborosTool } from "./types.js";

/**
 * 将 OuroborosTool 转换为模型层 ToolDefinition
 *
 * @param tool - 系统工具定义
 * @returns 模型层工具定义
 */
export function toModelToolDefinition(tool: OuroborosTool): ToolDefinition {
  return {
    name: tool.id,
    description: tool.description,
    parameters: toToolParameterSchema(tool.inputSchema),
  };
}

/**
 * 批量转换 OuroborosTool 为模型层 ToolDefinition
 *
 * @param tools - 系统工具定义列表
 * @returns 模型层工具定义列表
 */
export function toModelToolDefinitions(tools: readonly OuroborosTool[]): readonly ToolDefinition[] {
  return tools.map(toModelToolDefinition);
}

/**
 * 将 JSONSchema 转换为模型层 ToolParameterSchema
 */
function toToolParameterSchema(schema: OuroborosTool["inputSchema"]): ToolParameterSchema {
  return {
    type: schema.type,
    properties: schema.properties as Readonly<Record<string, unknown>> | undefined,
    required: schema.required as readonly string[] | undefined,
  };
}
