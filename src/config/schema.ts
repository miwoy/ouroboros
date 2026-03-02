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
});

/** 模型提供商配置类型 */
export type ModelProviderConfig = z.infer<typeof modelProviderSchema>;

/** 模型配置类型 */
export type ModelConfig = z.infer<typeof modelConfigSchema>;

/** 系统配置类型 */
export type SystemConfig = z.infer<typeof systemConfigSchema>;

/** 工具配置类型 */
export type ToolConfig = z.infer<typeof toolConfigSchema>;

/** 顶层配置类型 */
export type Config = z.infer<typeof configSchema>;
