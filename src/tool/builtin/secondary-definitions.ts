/**
 * 二级工具定义
 *
 * 定义 9 个二级工具的 OuroborosTool 元数据。
 * 二级工具基于一级工具能力构建，提供常用操作。
 */

import { EntityStatus, EntityType, type OuroborosTool } from "../types.js";

const now = "2026-01-01T00:00:00Z";

/** tool:bash — 命令执行 */
export const BASH_TOOL: OuroborosTool = {
  id: "tool:bash",
  type: EntityType.Tool,
  name: "命令执行",
  description: "在子进程中执行 shell 命令，支持超时控制",
  tags: ["bash", "shell", "命令", "执行"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { shellExec: true },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:bash",
  timeout: 30000,
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "要执行的 shell 命令" },
      cwd: { type: "string", description: "工作目录（默认 workspace 根目录）" },
      timeout: { type: "number", description: "超时时间（毫秒），默认 30000" },
    },
    required: ["command"],
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      exitCode: { type: "number" },
      stdout: { type: "string" },
      stderr: { type: "string" },
    },
  },
};

/** tool:read — 文件读取 */
export const READ_TOOL: OuroborosTool = {
  id: "tool:read",
  type: EntityType.Tool,
  name: "文件读取",
  description: "读取指定文件内容，支持行范围限制",
  tags: ["read", "文件", "读取"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { filesystem: ["workspace/**"] },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:read",
  timeout: 10000,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（相对于 workspace）" },
      offset: { type: "number", description: "起始行号（0-based）" },
      limit: { type: "number", description: "读取行数" },
    },
    required: ["path"],
  },
  outputSchema: {
    type: "object",
    properties: {
      content: { type: "string" },
      totalLines: { type: "number" },
    },
  },
};

/** tool:write — 文件创建/覆写 */
export const WRITE_TOOL: OuroborosTool = {
  id: "tool:write",
  type: EntityType.Tool,
  name: "文件写入",
  description: "将内容写入指定路径的文件（覆盖原内容），自动创建父目录",
  tags: ["write", "文件", "写入", "创建"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { filesystem: ["workspace/**"] },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:write",
  timeout: 10000,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（相对于 workspace）" },
      content: { type: "string", description: "文件内容" },
    },
    required: ["path", "content"],
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      path: { type: "string" },
      bytesWritten: { type: "number" },
    },
  },
};

/** tool:edit — 文件编辑 */
export const EDIT_TOOL: OuroborosTool = {
  id: "tool:edit",
  type: EntityType.Tool,
  name: "文件编辑",
  description: "对文件内容进行精确字符串替换（差异修改）",
  tags: ["edit", "文件", "编辑", "替换"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { filesystem: ["workspace/**"] },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:edit",
  timeout: 10000,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（相对于 workspace）" },
      oldString: { type: "string", description: "要替换的文本" },
      newString: { type: "string", description: "替换后的文本" },
      replaceAll: { type: "boolean", description: "是否替换所有匹配项，默认 false" },
    },
    required: ["path", "oldString", "newString"],
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      replacements: { type: "number" },
      path: { type: "string" },
    },
  },
};

/** tool:find — 文件查找 */
export const FIND_TOOL: OuroborosTool = {
  id: "tool:find",
  type: EntityType.Tool,
  name: "文件查找",
  description: "使用 glob 模式在 workspace 中查找文件",
  tags: ["find", "文件", "查找", "搜索", "glob"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { filesystem: ["workspace/**"] },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:find",
  timeout: 15000,
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "glob 模式（如 **/*.ts）" },
      path: { type: "string", description: "搜索基础路径（相对于 workspace），默认 '.'" },
      limit: { type: "number", description: "最大返回数量，默认 100" },
    },
    required: ["pattern"],
  },
  outputSchema: {
    type: "object",
    properties: {
      files: { type: "array", items: { type: "string" } },
      total: { type: "number" },
      truncated: { type: "boolean" },
    },
  },
};

/** tool:web-search — 搜索引擎 */
export const WEB_SEARCH_TOOL: OuroborosTool = {
  id: "tool:web-search",
  type: EntityType.Tool,
  name: "搜索引擎",
  description: "使用搜索引擎检索互联网信息，返回相关网页的标题、摘要和链接",
  tags: ["search", "web", "internet", "搜索", "网络"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { network: true, modelAccess: true },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:web-search",
  timeout: 30000,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词" },
      limit: { type: "number", description: "返回结果数量，默认 5" },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            snippet: { type: "string" },
          },
        },
      },
      total: { type: "number" },
      query: { type: "string" },
    },
  },
};

/** tool:web-fetch — URL 内容抓取 */
export const WEB_FETCH_TOOL: OuroborosTool = {
  id: "tool:web-fetch",
  type: EntityType.Tool,
  name: "URL 抓取",
  description: "获取指定 URL 的网页内容，支持超时和内容长度限制",
  tags: ["fetch", "url", "http", "网页", "抓取"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { network: true },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:web-fetch",
  timeout: 15000,
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "要获取的 URL" },
      timeout: { type: "number", description: "超时时间（毫秒），默认 15000" },
    },
    required: ["url"],
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      status: { type: "number" },
      contentType: { type: "string" },
      content: { type: "string" },
      truncated: { type: "boolean" },
    },
  },
};

/** tool:search-skill — 技能库检索 */
export const SEARCH_SKILL_TOOL: OuroborosTool = {
  id: "tool:search-skill",
  type: EntityType.Tool,
  name: "技能检索",
  description: "在技能库中搜索匹配的技能，结合向量语义检索和关键词匹配",
  tags: ["search", "skill", "检索", "技能"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: {},
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:search-skill",
  timeout: 15000,
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
      skills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            content: { type: "string" },
            score: { type: "number" },
          },
        },
      },
      total: { type: "number" },
    },
  },
};

/** tool:create-skill — 技能创建 */
export const CREATE_SKILL_TOOL: OuroborosTool = {
  id: "tool:create-skill",
  type: EntityType.Tool,
  name: "技能创建",
  description: "创建新的自定义技能：生成定义、写入模板、注册到技能库",
  tags: ["create", "skill", "创建", "技能"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { filesystem: ["workspace/skills/**"], createEntity: true },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  entrypoint: "builtin:create-skill",
  timeout: 30000,
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "技能名称" },
      description: { type: "string", description: "技能功能描述" },
      promptTemplate: { type: "string", description: "任务编排提示词模板" },
      requiredTools: { type: "array", description: "依赖的工具 ID 列表", items: { type: "string" } },
      variables: {
        type: "array",
        description: "模板变量声明",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            required: { type: "boolean" },
            defaultValue: { type: "string" },
          },
        },
      },
      tags: { type: "array", description: "语义标签", items: { type: "string" } },
    },
    required: ["name", "description", "promptTemplate"],
  },
  outputSchema: {
    type: "object",
    properties: {
      skillId: { type: "string" },
      templatePath: { type: "string" },
    },
  },
};

/** 获取所有二级工具定义 */
export function getSecondaryToolDefinitions(): readonly OuroborosTool[] {
  return [
    BASH_TOOL,
    READ_TOOL,
    WRITE_TOOL,
    EDIT_TOOL,
    FIND_TOOL,
    WEB_SEARCH_TOOL,
    WEB_FETCH_TOOL,
    SEARCH_SKILL_TOOL,
    CREATE_SKILL_TOOL,
  ];
}
