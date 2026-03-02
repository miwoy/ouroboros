/**
 * 内置工具定义
 *
 * 定义四个一级工具的 OuroborosTool 元数据。
 * 这些工具是系统原语，不可删除或覆盖。
 */

import { EntityStatus, EntityType, type OuroborosTool } from "../types.js";

const now = "2026-01-01T00:00:00Z";

/** tool:call-model — 模型调用 */
export const CALL_MODEL_TOOL: OuroborosTool = {
  id: "tool:call-model",
  type: EntityType.Tool,
  name: "模型调用",
  description: "调用大语言模型进行推理、生成文本或工具调用",
  tags: ["model", "llm", "推理", "生成"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { modelAccess: true },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:call-model",
  timeout: 60000,
  inputSchema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        description: "对话消息列表",
        items: {
          type: "object",
          properties: {
            role: { type: "string", description: "消息角色: system | user | assistant | tool" },
            content: { type: "string", description: "消息内容" },
            toolCallId: { type: "string", description: "工具调用 ID（仅 role=tool 时）" },
          },
        },
      },
      model: { type: "string", description: "模型 ID（覆盖默认模型）" },
      temperature: { type: "number", description: "温度参数 (0-2)" },
      maxTokens: { type: "number", description: "最大输出 token 数" },
      provider: { type: "string", description: "指定提供商名称" },
    },
    required: ["messages"],
  },
  outputSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "生成的文本内容" },
      model: { type: "string", description: "使用的模型 ID" },
      stopReason: { type: "string", description: "停止原因" },
      usage: {
        type: "object",
        description: "Token 用量统计",
        properties: {
          promptTokens: { type: "number" },
          completionTokens: { type: "number" },
          totalTokens: { type: "number" },
        },
      },
    },
  },
};

/** tool:run-agent — Agent 调用 */
export const RUN_AGENT_TOOL: OuroborosTool = {
  id: "tool:run-agent",
  type: EntityType.Tool,
  name: "Agent 调用",
  description: "调用指定 Agent 执行任务（自指能力），支持参数传递与结果回收",
  tags: ["agent", "自指", "任务", "协作"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { modelAccess: true, createEntity: true },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:run-agent",
  timeout: 300000,
  inputSchema: {
    type: "object",
    properties: {
      agentId: { type: "string", description: "目标 Agent ID" },
      task: { type: "string", description: "任务描述" },
      context: { type: "string", description: "附加上下文" },
    },
    required: ["agentId", "task"],
  },
  outputSchema: {
    type: "object",
    properties: {
      result: { type: "string", description: "Agent 执行结果" },
      taskId: { type: "string", description: "任务 ID" },
    },
  },
};

/** tool:search-tool — 工具检索 */
export const SEARCH_TOOL_TOOL: OuroborosTool = {
  id: "tool:search-tool",
  type: EntityType.Tool,
  name: "工具检索",
  description: "基于向量语义检索和关键词匹配搜索可用工具",
  tags: ["search", "检索", "工具库", "发现"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: {},
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:search-tool",
  timeout: 30000,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索查询（自然语言）" },
      limit: { type: "number", description: "返回数量上限，默认 5" },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      tools: {
        type: "array",
        description: "匹配的工具列表",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            score: { type: "number" },
          },
        },
      },
      total: { type: "number", description: "匹配总数" },
    },
  },
};

/** tool:create-tool — 工具创建 */
export const CREATE_TOOL_TOOL: OuroborosTool = {
  id: "tool:create-tool",
  type: EntityType.Tool,
  name: "工具创建",
  description: "动态创建自定义工具：验证代码、写入脚本文件、注册到工具库、更新向量索引",
  tags: ["create", "创建", "生成", "工具", "代码"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { filesystem: ["workspace/tools/**"], createEntity: true },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:create-tool",
  timeout: 60000,
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "工具名称" },
      description: { type: "string", description: "工具功能描述" },
      inputSchema: { type: "object", description: "输入参数 JSON Schema" },
      outputSchema: { type: "object", description: "输出结果 JSON Schema" },
      code: {
        type: "string",
        description: "工具实现代码（ES Module，export default async function）",
      },
      tags: { type: "array", description: "语义标签", items: { type: "string" } },
    },
    required: ["name", "description", "inputSchema", "outputSchema", "code"],
  },
  outputSchema: {
    type: "object",
    properties: {
      toolId: { type: "string", description: "创建的工具 ID" },
      entrypoint: { type: "string", description: "脚本路径" },
      codeHash: { type: "string", description: "代码 SHA-256 哈希" },
    },
  },
};

/** 获取一级内置工具定义 */
export function getPrimaryToolDefinitions(): readonly OuroborosTool[] {
  return [CALL_MODEL_TOOL, RUN_AGENT_TOOL, SEARCH_TOOL_TOOL, CREATE_TOOL_TOOL];
}

/** 获取所有内置工具定义（一级 + 二级），当前等同于一级 */
export { getPrimaryToolDefinitions as getBuiltinToolDefinitions };
