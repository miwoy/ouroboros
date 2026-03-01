import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { configSchema, type Config } from "./schema.js";
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

  // 验证 defaultProvider 引用的提供商是否存在
  const config = result.data;
  if (!(config.model.defaultProvider in config.model.providers)) {
    throw new ConfigError(`默认提供商 "${config.model.defaultProvider}" 未在 providers 中定义`);
  }

  return Object.freeze(config);
}
