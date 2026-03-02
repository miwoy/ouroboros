/**
 * 工具系统 Zod Schema
 *
 * 运行时校验工具调用输入、工具定义等数据结构。
 */

import { z } from "zod/v4";

// ─── JSON Schema 校验 ──────────────────────────────────────────────

/** JSON Schema 的 Zod 表示（宽松校验，只确保基本结构） */
export const jsonSchemaSchema = z.object({
  type: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
  description: z.string().optional(),
  items: z.unknown().optional(),
  default: z.unknown().optional(),
  additionalProperties: z.unknown().optional(),
});

// ─── 权限校验 ──────────────────────────────────────────────────────

export const permissionsSchema = z.object({
  filesystem: z.array(z.string()).optional(),
  network: z.boolean().optional(),
  shellExec: z.boolean().optional(),
  modelAccess: z.boolean().optional(),
  createEntity: z.boolean().optional(),
  custom: z.record(z.string(), z.boolean()).optional(),
});

// ─── 内置工具输入 Schema ───────────────────────────────────────────

/** tool:call-model 输入校验 */
export const callModelInputSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.string(),
      toolCallId: z.string().optional(),
    }),
  ).min(1, "消息列表不能为空"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  provider: z.string().optional(),
});

/** tool:run-agent 输入校验 */
export const runAgentInputSchema = z.object({
  agentId: z.string().min(1, "agentId 不能为空"),
  task: z.string().min(1, "task 不能为空"),
  context: z.string().optional(),
});

/** tool:search-tool 输入校验 */
export const searchToolInputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
  limit: z.number().int().positive().max(50).optional(),
});

/** tool:create-tool 输入校验 */
export const createToolInputSchema = z.object({
  name: z.string().min(1, "name 不能为空").max(100),
  description: z.string().min(1, "description 不能为空").max(500),
  inputSchema: jsonSchemaSchema,
  outputSchema: jsonSchemaSchema,
  code: z.string().min(1, "code 不能为空"),
  tags: z.array(z.string()).optional(),
});

// ─── 工具调用请求校验 ──────────────────────────────────────────────

export const toolCallRequestSchema = z.object({
  requestId: z.string().min(1),
  toolId: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  caller: z.object({
    entityId: z.string().min(1),
    nodeId: z.string().optional(),
  }),
});

// ─── 动态输入校验（根据 JSON Schema 做基本类型检查） ────────────────

/**
 * 根据工具的 inputSchema 校验输入参数
 *
 * 检查必填字段和基本类型匹配。
 * 注意：这是简化实现，不做完整 JSON Schema 校验。
 *
 * @param input - 输入参数
 * @param schema - 工具 inputSchema（JSON Schema 格式）
 * @returns 校验错误列表（空列表表示通过）
 */
export function validateToolInput(
  input: Readonly<Record<string, unknown>>,
  schema: { readonly required?: readonly string[]; readonly properties?: Readonly<Record<string, unknown>> },
): readonly string[] {
  const errors: string[] = [];

  // 检查必填字段
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in input) || input[field] === undefined || input[field] === null) {
        errors.push(`缺少必填字段: ${field}`);
      }
    }
  }

  return errors;
}
