/**
 * 配置文件路径解析器
 *
 * 查找顺序（优先级从高到低）：
 *   1. --config <path>          CLI 参数显式指定
 *   2. $OUROBOROS_CONFIG         环境变量
 *   3. ./ouroboros.json          当前目录（项目级覆盖）
 *   4. ~/.ouroboros/config.json  用户级默认
 */

import { access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

/** 用户数据根目录 */
export const OUROBOROS_HOME = join(homedir(), ".ouroboros");

/** 用户级默认配置路径 */
export const USER_CONFIG_PATH = join(OUROBOROS_HOME, "config.json");

/** 项目级配置文件名 */
const LOCAL_CONFIG_NAME = "ouroboros.json";

/** 环境变量名 */
const ENV_CONFIG_KEY = "OUROBOROS_CONFIG";

/**
 * 展开路径中的 ~ 为 home 目录
 */
export function expandTilde(filePath: string): string {
  if (filePath === "~") return homedir();
  if (filePath.startsWith("~/")) return join(homedir(), filePath.slice(2));
  return filePath;
}

/**
 * 检查文件是否存在
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 配置路径解析结果
 */
export interface ResolvedConfig {
  /** 解析到的配置文件绝对路径 */
  readonly path: string;
  /** 解析来源 */
  readonly source: "cli" | "env" | "local" | "user" | "none";
}

/**
 * 解析配置文件路径
 *
 * @param cliConfigPath - CLI --config 参数传入的路径
 * @returns 解析结果（path + source），若找不到则 source 为 "none"
 */
export async function resolveConfigPath(cliConfigPath?: string): Promise<ResolvedConfig> {
  // 1. CLI 参数
  if (cliConfigPath) {
    const expanded = expandTilde(cliConfigPath);
    return { path: resolve(expanded), source: "cli" };
  }

  // 2. 环境变量
  const envPath = process.env[ENV_CONFIG_KEY];
  if (envPath) {
    const expanded = expandTilde(envPath);
    return { path: resolve(expanded), source: "env" };
  }

  // 3. 当前目录（项目级）
  const localPath = resolve(process.cwd(), LOCAL_CONFIG_NAME);
  if (await fileExists(localPath)) {
    return { path: localPath, source: "local" };
  }

  // 3.5 兼容旧的 ./config.json（过渡期）
  const legacyPath = resolve(process.cwd(), "config.json");
  if (await fileExists(legacyPath)) {
    return { path: legacyPath, source: "local" };
  }

  // 4. 用户级默认
  if (await fileExists(USER_CONFIG_PATH)) {
    return { path: USER_CONFIG_PATH, source: "user" };
  }

  // 未找到任何配置文件
  return { path: USER_CONFIG_PATH, source: "none" };
}

/**
 * 解析用户数据目录（system.cwd）
 * 支持 ~ 展开，默认 ~/.ouroboros
 */
export function resolveDataDir(cwd?: string): string {
  if (!cwd) return OUROBOROS_HOME;
  return resolve(expandTilde(cwd));
}
