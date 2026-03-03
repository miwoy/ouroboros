/**
 * tools 配置块 Schema
 *
 * 外部工具服务配置（独立于 system.tool 的执行参数）。
 * 包含 web.search（搜索引擎）和 web.fetch（URL 抓取）。
 */
import { z } from "zod/v4";

/** Web 搜索配置 */
const webSearchConfigSchema = z.object({
  /** 是否启用搜索 */
  enabled: z.boolean().default(true),
  /** 搜索引擎提供商 */
  provider: z.enum(["bing", "brave"]).default("bing"),
  /** API Key（Brave 必须，Bing 不需要） */
  apiKey: z.string().optional(),
  /** 自定义搜索 API 地址 */
  baseUrl: z.string().url().optional(),
  /** 最大返回结果数 */
  maxResults: z.number().int().positive().default(5),
  /** 超时时间（秒） */
  timeoutSeconds: z.number().int().positive().default(30),
});

/** Web Fetch 配置 */
const webFetchConfigSchema = z.object({
  /** 是否启用 URL 抓取 */
  enabled: z.boolean().default(true),
});

/** Web 工具块 */
const webToolsConfigSchema = z.object({
  search: webSearchConfigSchema.default({
    enabled: true,
    provider: "bing",
    maxResults: 5,
    timeoutSeconds: 30,
  }),
  fetch: webFetchConfigSchema.default({ enabled: true }),
});

/**
 * 顶层 tools 配置 Schema
 */
export const toolsBlockSchema = z.object({
  web: webToolsConfigSchema.default({
    search: {
      enabled: true,
      provider: "bing",
      maxResults: 5,
      timeoutSeconds: 30,
    },
    fetch: { enabled: true },
  }),
});

// ─── 类型导出 ──────────────────────────────────────────────

/** Web 搜索配置 */
export type WebSearchConfig = z.infer<typeof webSearchConfigSchema>;

/** Web Fetch 配置 */
export type WebFetchConfig = z.infer<typeof webFetchConfigSchema>;

/** 外部工具块配置 */
export type ToolsBlockConfig = z.infer<typeof toolsBlockSchema>;
