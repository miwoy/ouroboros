import { z } from "zod/v4";

/**
 * 模型提供商配置 Schema
 * 定义单个模型提供商的连接参数
 */
const modelProviderSchema = z.object({
  /** 提供商类型标识 */
  type: z.enum([
    "openai",
    "anthropic",
    "openai-compatible",
    "google",
    "mistral",
    "groq",
    "bedrock",
  ]),
  /** API 密钥（可通过环境变量注入） */
  apiKey: z.string().min(1, "API 密钥不能为空"),
  /** API 基础 URL（可选，用于自定义端点或兼容 API） */
  baseUrl: z.string().url().optional(),
  /** 默认模型 ID */
  defaultModel: z.string().min(1).optional(),
  /** 该提供商可用的模型列表（供 client 展示切换） */
  models: z.array(z.string().min(1)).optional(),
});

/**
 * 模型配置 Schema
 * 管理所有模型提供商和全局模型设置
 */
const modelConfigSchema = z.object({
  /** 默认使用的提供商名称 */
  defaultProvider: z.string().min(1),
  /** 模型调用超时时间（毫秒） */
  timeout: z.number().int().positive().default(30000),
  /** 最大重试次数 */
  maxRetries: z.number().int().min(0).max(10).default(3),
  /** 重试基础延迟（毫秒），实际延迟 = baseDelay * 2^attempt */
  retryBaseDelay: z.number().int().positive().default(1000),
  /** 已注册的提供商列表 */
  providers: z.record(z.string(), modelProviderSchema),
});

/**
 * 系统配置 Schema
 * 全局系统级配置
 */
const systemConfigSchema = z.object({
  /** 日志级别 */
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** workspace 根目录路径 */
  workspacePath: z.string().default("./workspace"),
  /** HTTP 代理地址，配置后系统所有对外请求使用此代理 */
  proxy: z
    .union([z.literal(""), z.string().url()])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

/**
 * Web 搜索配置 Schema
 * 搜索引擎设置
 */
const webSearchConfigSchema = z.object({
  /** 搜索引擎提供商 */
  provider: z.enum(["bing", "brave"]).default("bing"),
  /** API Key（Brave 必须，Bing 不需要） */
  apiKey: z.string().optional(),
  /** 自定义搜索 API 地址（可选） */
  baseUrl: z.string().url().optional(),
});

/**
 * 工具配置 Schema
 * 工具系统全局设置
 */
const toolConfigSchema = z.object({
  /** 工具执行默认超时时间（毫秒） */
  defaultTimeout: z.number().int().positive().default(30000),
  /** 工具执行默认最大重试次数 */
  defaultMaxRetries: z.number().int().min(0).max(5).default(0),
  /** 代码生成使用的提供商名称（createTool 时使用） */
  codeGenerationProvider: z.string().optional(),
  /** 代码生成使用的模型 ID */
  codeGenerationModel: z.string().optional(),
});

/**
 * ReAct 循环配置 Schema
 * 控制 Agent 核心循环的行为参数
 */
const reactConfigSchema = z.object({
  /** 最大迭代次数（防止无限循环） */
  maxIterations: z.number().int().positive().default(20),
  /** 单步超时时间（毫秒） */
  stepTimeout: z.number().int().positive().default(60000),
  /** 是否支持并行工具调用 */
  parallelToolCalls: z.boolean().default(true),
  /** 上下文压缩阈值（消息条数） */
  compressionThreshold: z.number().int().positive().default(10),
});

/**
 * 记忆系统配置 Schema
 * 控制记忆系统的行为参数
 */
const memoryConfigSchema = z.object({
  /** 是否启用短期记忆（每日交互记录） */
  shortTerm: z.boolean().default(true),
  /** 是否启用长期记忆（压缩摘要） */
  longTerm: z.boolean().default(true),
  /** Hot Session 最大 token 数 */
  hotSessionMaxTokens: z.number().int().positive().default(4000),
});

/**
 * Agent 系统配置 Schema
 * 控制 Agent (Solution) 系统的行为参数
 */
const agentConfigSchema = z.object({
  /** 默认最大交互轮次 */
  defaultMaxTurns: z.number().int().positive().default(50),
  /** 知识库默认最大 token 数 */
  knowledgeMaxTokens: z.number().int().positive().default(8000),
  /** 启用模型 thinking/reasoning 能力（默认关闭） */
  think: z.boolean().default(false),
  /** thinking 级别: low | medium | high（默认 medium） */
  thinkLevel: z.enum(["low", "medium", "high"]).default("medium"),
});

/**
 * 自我图式配置 Schema
 * 控制身体图式、灵魂图式和激素系统
 */
const selfSchemaConfigSchema = z.object({
  /** 激素默认值 - 专注度 */
  focusLevel: z.number().int().min(0).max(100).default(60),
  /** 激素默认值 - 谨慎度 */
  cautionLevel: z.number().int().min(0).max(100).default(50),
  /** 激素默认值 - 创造力 */
  creativityLevel: z.number().int().min(0).max(100).default(50),
});

/**
 * 审查程序配置 Schema
 * 控制审查程序的行为参数
 */
const inspectorConfigSchema = z.object({
  /** 是否启用审查 */
  enabled: z.boolean().default(true),
  /** 审查间隔（毫秒） */
  checkInterval: z.number().int().positive().default(180000),
  /** 死循环检测阈值（连续重复次数） */
  loopDetectionThreshold: z.number().int().positive().default(3),
  /** 单节点最大重试次数 */
  maxRetryThreshold: z.number().int().positive().default(5),
  /** 最小可用内存（MB） */
  minAvailableMemoryMB: z.number().int().positive().default(100),
  /** 最大执行时间（秒） */
  maxExecutionTimeSecs: z.number().int().positive().default(3600),
});

/**
 * 反思程序配置 Schema
 * 控制反思程序的行为参数
 */
const reflectionConfigSchema = z.object({
  /** 是否启用反思 */
  enabled: z.boolean().default(true),
  /** Skill 建议最低置信度 */
  minSkillConfidence: z.number().min(0).max(1).default(0.7),
});

/**
 * Super Agent 系统配置 Schema
 * 控制 Super Agent 协作系统的行为参数
 */
const superAgentConfigSchema = z.object({
  /** 默认总执行时间上限（秒） */
  defaultMaxDuration: z.number().int().positive().default(600),
  /** 最大并行 Agent 数 */
  maxParallelAgents: z.number().int().positive().default(5),
});

/**
 * API 配置 Schema
 * 控制 Chat API 层的行为参数
 */
const apiConfigSchema = z.object({
  /** HTTP 端口 */
  port: z.number().int().positive().default(3000),
  /** 绑定主机 */
  host: z.string().default("127.0.0.1"),
  /** API 密钥（空则无认证） */
  apiKey: z.string().optional(),
  /** 速率限制 — 时间窗口（毫秒） */
  rateLimitWindowMs: z.number().int().positive().default(60000),
  /** 速率限制 — 窗口内最大请求数 */
  rateLimitMaxRequests: z.number().int().positive().default(60),
  /** CORS 来源 */
  corsOrigin: z.string().default("*"),
});

/**
 * 持久化系统配置 Schema
 * 控制状态持久化与恢复的行为参数
 */
const persistenceConfigSchema = z.object({
  /** 是否启用持久化 */
  enabled: z.boolean().default(true),
  /** 检查点间隔（毫秒） */
  checkpointIntervalMs: z.number().int().positive().default(60000),
  /** 快照存储目录（相对 workspace） */
  snapshotDir: z.string().default("state"),
  /** 是否启用自动恢复 */
  enableAutoRecovery: z.boolean().default(true),
  /** 恢复 TTL（秒），超过此时间的快照不尝试恢复 */
  recoveryTTLSecs: z.number().int().positive().default(86400),
  /** 最大保留快照数 */
  maxSnapshots: z.number().int().positive().default(10),
});

/**
 * 顶层配置 Schema
 * Ouroboros 完整配置结构
 */
export const configSchema = z.object({
  system: systemConfigSchema,
  model: modelConfigSchema,
  tools: toolConfigSchema.default({
    defaultTimeout: 30000,
    defaultMaxRetries: 0,
  }),
  react: reactConfigSchema.default({
    maxIterations: 20,
    stepTimeout: 60000,
    parallelToolCalls: true,
    compressionThreshold: 10,
  }),
  memory: memoryConfigSchema.default({
    shortTerm: true,
    longTerm: true,
    hotSessionMaxTokens: 4000,
  }),
  agents: agentConfigSchema.default({
    defaultMaxTurns: 50,
    knowledgeMaxTokens: 8000,
    think: false,
    thinkLevel: "medium",
  }),
  superAgents: superAgentConfigSchema.default({
    defaultMaxDuration: 600,
    maxParallelAgents: 5,
  }),
  self: selfSchemaConfigSchema.default({
    focusLevel: 60,
    cautionLevel: 50,
    creativityLevel: 50,
  }),
  inspector: inspectorConfigSchema.default({
    enabled: true,
    checkInterval: 180000,
    loopDetectionThreshold: 3,
    maxRetryThreshold: 5,
    minAvailableMemoryMB: 100,
    maxExecutionTimeSecs: 3600,
  }),
  reflection: reflectionConfigSchema.default({
    enabled: true,
    minSkillConfidence: 0.7,
  }),
  api: apiConfigSchema.default({
    port: 3000,
    host: "127.0.0.1",
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 60,
    corsOrigin: "*",
  }),
  persistence: persistenceConfigSchema.default({
    enabled: true,
    checkpointIntervalMs: 60000,
    snapshotDir: "state",
    enableAutoRecovery: true,
    recoveryTTLSecs: 86400,
    maxSnapshots: 10,
  }),
  webSearch: webSearchConfigSchema.default({
    provider: "bing",
  }),
});

/** 模型提供商配置类型 */
export type ModelProviderConfig = z.infer<typeof modelProviderSchema>;

/** 模型配置类型 */
export type ModelConfig = z.infer<typeof modelConfigSchema>;

/** 系统配置类型 */
export type SystemConfig = z.infer<typeof systemConfigSchema>;

/** 工具配置类型 */
export type ToolConfig = z.infer<typeof toolConfigSchema>;

/** ReAct 循环配置类型 */
export type ReactConfig = z.infer<typeof reactConfigSchema>;

/** 记忆系统配置类型 */
export type MemorySchemaConfig = z.infer<typeof memoryConfigSchema>;

/** Agent 系统配置类型 */
export type AgentSchemaConfig = z.infer<typeof agentConfigSchema>;

/** Super Agent 系统配置类型 */
export type SuperAgentSchemaConfig = z.infer<typeof superAgentConfigSchema>;

/** 自我图式配置类型 */
export type SelfSchemaSchemaConfig = z.infer<typeof selfSchemaConfigSchema>;

/** 审查程序配置类型 */
export type InspectorSchemaConfig = z.infer<typeof inspectorConfigSchema>;

/** 反思程序配置类型 */
export type ReflectionSchemaConfig = z.infer<typeof reflectionConfigSchema>;

/** API 配置类型 */
export type ApiSchemaConfig = z.infer<typeof apiConfigSchema>;

/** 持久化系统配置类型 */
export type PersistenceSchemaConfig = z.infer<typeof persistenceConfigSchema>;

/** Web 搜索配置类型 */
export type WebSearchConfig = z.infer<typeof webSearchConfigSchema>;

/** 顶层配置类型 */
export type Config = z.infer<typeof configSchema>;
