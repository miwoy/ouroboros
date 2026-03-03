import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { configSchema, parseModelRef, getModelIds, type Config } from "./schema/index.js";
import { ConfigError } from "../errors/index.js";
import { resolveConfigPath, type ResolvedConfig } from "./resolver.js";
import { isV1Config, migrateV1ToV2 } from "./migration.js";

/** loadConfig 返回结果 */
export interface LoadConfigResult {
  /** 经过验证的配置对象 */
  readonly config: Readonly<Config>;
  /** 配置文件所在目录（绝对路径），用于解析相对路径 */
  readonly configDir: string;
}

/**
 * 替换字符串中的环境变量引用
 * 支持 ${ENV_VAR} 格式，未找到的环境变量保留原始字符串不替换
 */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, envName: string) => {
    const envValue = process.env[envName];
    return envValue ?? match;
  });
}

/**
 * 递归替换对象中所有字符串值的环境变量引用
 */
function resolveEnvVarsInObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return resolveEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVarsInObject);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVarsInObject(value);
    }
    return result;
  }
  return obj;
}

/**
 * 从文件加载并验证配置
 *
 * 查找顺序（无显式路径时）：
 *   1. $OUROBOROS_CONFIG 环境变量
 *   2. ./ouroboros.json（当前目录）
 *   3. ./config.json（兼容旧版）
 *   4. ~/.ouroboros/config.json（用户级默认）
 *
 * 自动检测 v1 格式并迁移为 v2。
 *
 * @param configPath - 配置文件路径（显式指定则跳过查找链）
 * @returns 经过验证的配置对象（不可变）
 */
export async function loadConfig(configPath?: string): Promise<LoadConfigResult> {
  const resolved: ResolvedConfig = await resolveConfigPath(configPath);
  const filePath = resolved.path;

  if (resolved.source === "none") {
    throw new ConfigError(
      `未找到配置文件。请运行 "ouroboros init" 初始化配置，或使用 --config 指定路径。\n` +
        `  查找路径：./ouroboros.json → ./config.json → ~/.ouroboros/config.json`,
    );
  }

  let rawContent: string;
  try {
    rawContent = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new ConfigError(`无法读取配置文件: ${filePath}`, err);
  }

  let rawJson: unknown;
  try {
    // 支持 JSONC（移除注释）
    const cleaned = rawContent.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    rawJson = JSON.parse(cleaned);
  } catch (err) {
    throw new ConfigError(`配置文件 JSON 格式错误: ${filePath}`, err);
  }

  // 替换环境变量
  let resolvedJson = resolveEnvVarsInObject(rawJson) as Record<string, unknown>;

  // 自动检测 v1 格式并迁移
  if (isV1Config(resolvedJson)) {
    console.log(`  [config] 检测到 v1 格式配置，自动迁移为 v2...`);
    resolvedJson = migrateV1ToV2(resolvedJson);
  }

  // 使用 Zod 验证
  const result = configSchema.safeParse(resolvedJson);
  if (!result.success) {
    const messages = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`配置验证失败:\n${messages.join("\n")}`);
  }

  const config = result.data;

  // 验证每个 agent 的 model 引用
  for (const [agentName, agentConfig] of Object.entries(config.agents)) {
    const ref = parseModelRef(agentConfig.model);
    if (!ref) {
      throw new ConfigError(
        `Agent "${agentName}" 的 model "${agentConfig.model}" 格式无效，应为 "provider/model"`,
      );
    }
    // 验证引用的提供商存在
    if (!(ref.provider in config.provider)) {
      throw new ConfigError(
        `Agent "${agentName}" 引用了不存在的提供商 "${ref.provider}"（model: "${agentConfig.model}"）`,
      );
    }
    // 验证引用的模型在提供商的 models 列表中（如果提供商定义了 models）
    const providerConfig = config.provider[ref.provider];
    const modelIds = getModelIds(providerConfig);
    if (modelIds.length > 0) {
      if (!modelIds.includes(ref.model)) {
        throw new ConfigError(
          `Agent "${agentName}" 引用的模型 "${ref.model}" 不在提供商 "${ref.provider}" 的可用模型列表中。` +
            `\n  可用模型: ${modelIds.join(", ")}`,
        );
      }
    }
  }

  return { config: Object.freeze(config), configDir: dirname(filePath) };
}
