import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { configSchema, parseModelRef, type Config } from "./schema.js";
import { ConfigError } from "../errors/index.js";

/** 默认配置文件路径 */
const DEFAULT_CONFIG_PATH = "./config.json";

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
 * @param configPath - 配置文件路径（默认 ./config.json）
 * @returns 经过验证的配置对象（不可变）
 */
export async function loadConfig(configPath?: string): Promise<Readonly<Config>> {
  const filePath = resolve(configPath ?? DEFAULT_CONFIG_PATH);

  let rawContent: string;
  try {
    rawContent = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new ConfigError(`无法读取配置文件: ${filePath}`, err);
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawContent);
  } catch (err) {
    throw new ConfigError(`配置文件 JSON 格式错误: ${filePath}`, err);
  }

  // 替换环境变量
  const resolvedJson = resolveEnvVarsInObject(rawJson);

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
    if (!(ref.provider in config.providers)) {
      throw new ConfigError(
        `Agent "${agentName}" 引用了不存在的提供商 "${ref.provider}"（model: "${agentConfig.model}"）`,
      );
    }
    // 验证引用的模型在提供商的 models 列表中（如果提供商定义了 models）
    const providerConfig = config.providers[ref.provider];
    if (providerConfig.models && providerConfig.models.length > 0) {
      if (!providerConfig.models.includes(ref.model)) {
        throw new ConfigError(
          `Agent "${agentName}" 引用的模型 "${ref.model}" 不在提供商 "${ref.provider}" 的可用模型列表中。` +
            `\n  可用模型: ${providerConfig.models.join(", ")}`,
        );
      }
    }
  }

  return Object.freeze(config);
}
