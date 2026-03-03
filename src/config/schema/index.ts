/**
 * Ouroboros v2 配置 Schema
 *
 * 顶层结构：
 *   system     — 系统级配置（含 api/model/tool/react/memory/self/inspector/reflection）
 *   provider   — 模型提供商（单数，增强模型定义）
 *   agents     — Agent 配置（thinkLevel 含 off）
 *   tools      — 外部工具服务（web.search/fetch）
 *   channels   — 多通道（web/tui/telegram）
 *   persistence — 状态持久化
 */
import { z } from "zod/v4";
import { systemConfigSchema } from "./system.js";
import { providerBlockSchema } from "./provider.js";
import { agentsBlockSchema } from "./agents.js";
import { toolsBlockSchema } from "./tools.js";
import { channelsBlockSchema } from "./channels.js";
import { persistenceConfigSchema } from "./persistence.js";
import { type ProviderConfig, getModelIds } from "./provider.js";

// ─── 顶层 Schema ──────────────────────────────────────────────

export const configSchema = z.object({
  system: systemConfigSchema.default({
    logLevel: "info",
    cwd: "~/.ouroboros",
    proxy: undefined,
    api: {
      port: 3000,
      host: "127.0.0.1",
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 60,
      corsOrigin: "*",
    },
    model: { timeout: 30000, maxRetries: 3, retryBaseDelay: 1000 },
    tool: { defaultTimeout: 30000, defaultMaxRetries: 0 },
    react: {
      maxIterations: 20,
      stepTimeout: 60000,
      parallelToolCalls: true,
      compressionThreshold: 10,
    },
    memory: { shortTerm: true, longTerm: true, hotSessionMaxTokens: 4000 },
    self: { focusLevel: 60, cautionLevel: 50, creativityLevel: 50 },
    inspector: {
      enabled: true,
      checkInterval: 180000,
      loopDetectionThreshold: 3,
      maxRetryThreshold: 5,
      minAvailableMemoryMB: 100,
      maxExecutionTimeSecs: 3600,
    },
    reflection: { enabled: true, minSkillConfidence: 0.7 },
  }),
  provider: providerBlockSchema.default({}),
  agents: agentsBlockSchema,
  tools: toolsBlockSchema.default({
    web: {
      search: { enabled: true, provider: "bing", maxResults: 5, timeoutSeconds: 30 },
      fetch: { enabled: true },
    },
  }),
  channels: channelsBlockSchema.default({
    web: { enabled: true, port: 8517, host: "127.0.0.1" },
    tui: { enabled: true },
    telegram: {
      enabled: false,
      dmPolicy: "pairing",
      groupPolicy: "allowlist",
      streaming: "partial",
    },
  }),
  persistence: persistenceConfigSchema.default({
    enabled: true,
    checkpointIntervalMs: 60000,
    snapshotDir: "state",
    enableAutoRecovery: true,
    recoveryTTLSecs: 86400,
    maxSnapshots: 10,
  }),
});

// ─── 辅助函数 ──────────────────────────────────────────────

/**
 * 解析 "provider/model" 格式的模型引用
 * @returns { provider, model } 或 null（格式无效）
 */
export function parseModelRef(
  ref: string,
): { readonly provider: string; readonly model: string } | null {
  const slashIdx = ref.indexOf("/");
  if (slashIdx <= 0 || slashIdx >= ref.length - 1) {
    return null;
  }
  return {
    provider: ref.slice(0, slashIdx),
    model: ref.slice(slashIdx + 1),
  };
}

/**
 * 从 provider 配置中提取所有可用模型（虚拟模型列表）
 * 格式: "provider/model"
 */
export function extractAvailableModels(
  providers: Readonly<Record<string, ProviderConfig>>,
): readonly string[] {
  const models: string[] = [];
  for (const [name, config] of Object.entries(providers)) {
    const ids = getModelIds(config);
    if (ids.length > 0) {
      for (const m of ids) {
        models.push(`${name}/${m}`);
      }
    } else if (config.defaultModel) {
      models.push(`${name}/${config.defaultModel}`);
    }
  }
  return models;
}

// ─── 类型导出（集中） ──────────────────────────────────────────────

/** 顶层配置类型 */
export type Config = z.infer<typeof configSchema>;

// 从子模块重导出
export type {
  SystemConfig,
  ModelCallConfig,
  ReactConfig,
  MemorySchemaConfig,
  SelfSchemaSchemaConfig,
  InspectorSchemaConfig,
  ReflectionSchemaConfig,
  ApiSchemaConfig,
} from "./system.js";
export type { ToolExecConfig } from "./system.js";
export type { ProviderConfig, ModelDefinition } from "./provider.js";
export type { AgentConfig } from "./agents.js";
export type { WebSearchConfig, WebFetchConfig, ToolsBlockConfig } from "./tools.js";
export type {
  WebChannelConfig,
  TuiChannelConfig,
  TelegramChannelConfig,
  ChannelsConfig,
} from "./channels.js";
export type { PersistenceConfig } from "./persistence.js";

// 重导出提供商辅助
export {
  OAUTH_PROVIDER_TYPES,
  PROVIDER_OAUTH_MAP,
  isOAuthProvider,
  getModelIds,
} from "./provider.js";
