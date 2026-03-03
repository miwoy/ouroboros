/**
 * provider 配置块 Schema（单数）
 *
 * 支持 OAuth 认证的提供商类型、模型定义增强（结构化模型信息）。
 * api 字段取代旧的 type，值为 API 协议标识。
 */
import { z } from "zod/v4";

/**
 * 支持 OAuth 认证的提供商类型（无需手动配置 apiKey）
 */
export const OAUTH_PROVIDER_TYPES = [
  "openai-codex",
  "anthropic",
  "github-copilot",
  "google-gemini-cli",
  "google-antigravity",
] as const;

/**
 * 提供商类型 → OAuth Provider ID 映射
 */
export const PROVIDER_OAUTH_MAP: Readonly<Record<string, string>> = {
  "openai-codex": "openai-codex",
  anthropic: "anthropic",
  "github-copilot": "github-copilot",
  "google-gemini-cli": "google-gemini-cli",
  "google-antigravity": "google-antigravity",
};

/**
 * API 协议类型（取代旧的 type 字段）
 * 与 pi-ai 的 API 类型对齐
 */
const apiProtocolValues = [
  "openai-completions",
  "anthropic-messages",
  "google-generative-ai",
  "mistral-completions",
  "groq-completions",
  "bedrock-converse",
] as const;

/**
 * 增强的模型定义（结构化信息）
 */
const modelDefinitionSchema = z.object({
  /** 模型 ID（用于 API 调用） */
  id: z.string().min(1),
  /** 显示名称 */
  name: z.string().min(1).optional(),
  /** 是否支持推理/thinking */
  reasoning: z.boolean().default(false),
  /** 支持的输入类型 */
  input: z.array(z.enum(["text", "image", "audio", "video"])).default(["text"]),
  /** 费用信息（每百万 token） */
  cost: z
    .object({
      input: z.number().min(0).default(0),
      output: z.number().min(0).default(0),
      cacheRead: z.number().min(0).default(0),
      cacheWrite: z.number().min(0).default(0),
    })
    .default({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
  /** 上下文窗口大小 */
  contextWindow: z.number().int().positive().optional(),
  /** 最大输出 token */
  maxTokens: z.number().int().positive().optional(),
});

/**
 * 单个提供商配置 Schema
 * 同时兼容旧格式（type + string[] models）和新格式（api + ModelDefinition[] models）
 */
export const providerConfigSchema = z
  .object({
    /** API 协议标识（新格式，取代 type） */
    api: z.enum(apiProtocolValues).optional(),
    /** 旧格式兼容：提供商类型（将被 migration 转为 api） */
    type: z.string().optional(),
    /** API 密钥（OAuth 类型可选） */
    apiKey: z.string().min(1, "API 密钥不能为空").optional(),
    /** API 基础 URL（可选，用于自定义端点或兼容 API） */
    baseUrl: z.string().url().optional(),
    /** 默认模型 ID */
    defaultModel: z.string().min(1).optional(),
    /** 模型列表（支持新旧两种格式） */
    models: z
      .union([
        z.array(modelDefinitionSchema), // 新格式：结构化模型定义
        z.array(z.string().min(1)), // 旧格式：字符串列表（兼容）
      ])
      .optional(),
  })
  .refine(
    (data) => {
      // 必须有 api 或 type（至少一个）
      return data.api !== undefined || data.type !== undefined;
    },
    { message: "提供商必须指定 api 或 type 字段" },
  );

/**
 * 顶层 provider 配置（单数，Record）
 */
export const providerBlockSchema = z.record(z.string(), providerConfigSchema);

// ─── 类型导出 ──────────────────────────────────────────────

/** 模型定义 */
export type ModelDefinition = z.infer<typeof modelDefinitionSchema>;

/** 单个提供商配置 */
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/**
 * 判断提供商是否为 OAuth 类型
 * 同时检查 api 和 type 字段（兼容旧格式）
 */
export function isOAuthProvider(config: ProviderConfig): boolean {
  const typeOrApi = config.type ?? "";
  return (OAUTH_PROVIDER_TYPES as readonly string[]).includes(typeOrApi);
}

/**
 * 获取提供商的模型 ID 列表（兼容新旧格式）
 */
export function getModelIds(config: ProviderConfig): readonly string[] {
  if (!config.models) return [];
  return config.models.map((m) => (typeof m === "string" ? m : m.id));
}
