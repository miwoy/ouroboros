export { loadConfig } from "./loader.js";
export {
  configSchema,
  parseModelRef,
  extractAvailableModels,
  OAUTH_PROVIDER_TYPES,
  PROVIDER_OAUTH_MAP,
  getModelIds,
} from "./schema/index.js";
export {
  resolveConfigPath,
  resolveDataDir,
  expandTilde,
  OUROBOROS_HOME,
  USER_CONFIG_PATH,
} from "./resolver.js";
export { isV1Config, migrateV1ToV2 } from "./migration.js";
export type { ResolvedConfig } from "./resolver.js";
export type {
  Config,
  ModelCallConfig,
  ProviderConfig,
  AgentConfig,
  SystemConfig,
  ReactConfig,
  ToolExecConfig,
  WebSearchConfig,
  ChannelsConfig,
  PersistenceConfig,
} from "./schema/index.js";

// 旧类型别名
export type { ProviderConfig as ModelProviderConfig } from "./schema/index.js";
export type { ToolExecConfig as ToolConfig } from "./schema/index.js";
