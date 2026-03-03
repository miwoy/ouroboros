/**
 * 配置 Schema 兼容层
 *
 * 重导出 schema/index.ts 的所有内容，保持旧 import 路径兼容。
 * 旧路径: import { ... } from "./config/schema.js"
 * 新路径: import { ... } from "./config/schema/index.js"
 */
export {
  configSchema,
  parseModelRef,
  extractAvailableModels,
  OAUTH_PROVIDER_TYPES,
  PROVIDER_OAUTH_MAP,
  isOAuthProvider,
  getModelIds,
} from "./schema/index.js";

export type {
  Config,
  SystemConfig,
  ModelCallConfig,
  ReactConfig,
  MemorySchemaConfig,
  SelfSchemaSchemaConfig,
  InspectorSchemaConfig,
  ReflectionSchemaConfig,
  ApiSchemaConfig,
  ToolExecConfig,
  ProviderConfig,
  ModelDefinition,
  AgentConfig,
  WebSearchConfig,
  WebFetchConfig,
  ToolsBlockConfig,
  WebChannelConfig,
  TuiChannelConfig,
  TelegramChannelConfig,
  ChannelsConfig,
  PersistenceConfig,
} from "./schema/index.js";

// ─── 旧类型别名（向后兼容） ──────────────────────────────────────────────

/** @deprecated 使用 ProviderConfig 替代 */
export type { ProviderConfig as ModelProviderConfig } from "./schema/index.js";

/** @deprecated 使用 ToolExecConfig 替代 */
export type { ToolExecConfig as ToolConfig } from "./schema/index.js";

/** @deprecated 使用 PersistenceConfig 替代 */
export type { PersistenceConfig as PersistenceSchemaConfig } from "./schema/index.js";
