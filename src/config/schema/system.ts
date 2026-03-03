/**
 * system 配置块 Schema
 *
 * 包含所有系统级配置：日志、代理、用户数据目录、
 * 模型调用参数、工具执行参数、ReAct 循环、记忆、自我图式、审查、反思、API。
 */
import { z } from "zod/v4";

/** 模型调用参数 */
const modelCallConfigSchema = z.object({
  /** 模型调用超时时间（毫秒） */
  timeout: z.number().int().positive().default(30000),
  /** 最大重试次数 */
  maxRetries: z.number().int().min(0).max(10).default(3),
  /** 重试基础延迟（毫秒），实际延迟 = baseDelay * 2^attempt */
  retryBaseDelay: z.number().int().positive().default(1000),
});

/** 工具执行参数 */
const toolExecConfigSchema = z.object({
  /** 工具执行默认超时时间（毫秒） */
  defaultTimeout: z.number().int().positive().default(30000),
  /** 工具执行默认最大重试次数 */
  defaultMaxRetries: z.number().int().min(0).max(5).default(0),
  /** 代码生成使用的提供商名称（createTool 时使用） */
  codeGenerationProvider: z.string().optional(),
  /** 代码生成使用的模型 ID */
  codeGenerationModel: z.string().optional(),
});

/** ReAct 循环参数 */
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

/** 记忆系统参数 */
const memoryConfigSchema = z.object({
  /** 是否启用短期记忆（每日交互记录） */
  shortTerm: z.boolean().default(true),
  /** 是否启用长期记忆（压缩摘要） */
  longTerm: z.boolean().default(true),
  /** Hot Session 最大 token 数 */
  hotSessionMaxTokens: z.number().int().positive().default(4000),
});

/** 自我图式参数（激素默认值） */
const selfSchemaConfigSchema = z.object({
  /** 激素默认值 - 专注度 */
  focusLevel: z.number().int().min(0).max(100).default(60),
  /** 激素默认值 - 谨慎度 */
  cautionLevel: z.number().int().min(0).max(100).default(50),
  /** 激素默认值 - 创造力 */
  creativityLevel: z.number().int().min(0).max(100).default(50),
});

/** 审查程序参数 */
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

/** 反思程序参数 */
const reflectionConfigSchema = z.object({
  /** 是否启用反思 */
  enabled: z.boolean().default(true),
  /** Skill 建议最低置信度 */
  minSkillConfidence: z.number().min(0).max(1).default(0.7),
});

/** API 服务器参数 */
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
 * 顶层 system 配置 Schema
 */
export const systemConfigSchema = z.object({
  /** 日志级别 */
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** 用户数据根目录（取代 workspacePath 硬编码路径） */
  cwd: z.string().default("~/.ouroboros"),
  /** HTTP 代理地址，配置后系统所有对外请求使用此代理 */
  proxy: z
    .union([z.literal(""), z.string().url()])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  /** API 服务器 */
  api: apiConfigSchema.default({
    port: 3000,
    host: "127.0.0.1",
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 60,
    corsOrigin: "*",
  }),
  /** 全局模型调用参数 */
  model: modelCallConfigSchema.default({
    timeout: 30000,
    maxRetries: 3,
    retryBaseDelay: 1000,
  }),
  /** 工具执行参数 */
  tool: toolExecConfigSchema.default({
    defaultTimeout: 30000,
    defaultMaxRetries: 0,
  }),
  /** ReAct 循环参数 */
  react: reactConfigSchema.default({
    maxIterations: 20,
    stepTimeout: 60000,
    parallelToolCalls: true,
    compressionThreshold: 10,
  }),
  /** 记忆系统 */
  memory: memoryConfigSchema.default({
    shortTerm: true,
    longTerm: true,
    hotSessionMaxTokens: 4000,
  }),
  /** 自我图式（激素默认值） */
  self: selfSchemaConfigSchema.default({
    focusLevel: 60,
    cautionLevel: 50,
    creativityLevel: 50,
  }),
  /** 审查程序 */
  inspector: inspectorConfigSchema.default({
    enabled: true,
    checkInterval: 180000,
    loopDetectionThreshold: 3,
    maxRetryThreshold: 5,
    minAvailableMemoryMB: 100,
    maxExecutionTimeSecs: 3600,
  }),
  /** 反思程序 */
  reflection: reflectionConfigSchema.default({
    enabled: true,
    minSkillConfidence: 0.7,
  }),
});

// ─── 类型导出 ──────────────────────────────────────────────

/** system 配置完整类型 */
export type SystemConfig = z.infer<typeof systemConfigSchema>;

/** 模型调用配置 */
export type ModelCallConfig = z.infer<typeof modelCallConfigSchema>;

/** 工具执行配置 */
export type ToolExecConfig = z.infer<typeof toolExecConfigSchema>;

/** ReAct 循环配置 */
export type ReactConfig = z.infer<typeof reactConfigSchema>;

/** 记忆系统配置 */
export type MemorySchemaConfig = z.infer<typeof memoryConfigSchema>;

/** 自我图式配置 */
export type SelfSchemaSchemaConfig = z.infer<typeof selfSchemaConfigSchema>;

/** 审查程序配置 */
export type InspectorSchemaConfig = z.infer<typeof inspectorConfigSchema>;

/** 反思程序配置 */
export type ReflectionSchemaConfig = z.infer<typeof reflectionConfigSchema>;

/** API 配置 */
export type ApiSchemaConfig = z.infer<typeof apiConfigSchema>;
