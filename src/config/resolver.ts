/**
 * 配置文件路径解析器
 *
 * OUROBOROS_HOME 解析规则（优先级从高到低）：
 *   1. --cwd <path>       → join(resolve(path), ".ouroboros")
 *   2. $OUROBOROS_HOME     → resolve(envValue)（直接是完整路径）
 *   3. （默认）            → join(process.cwd(), ".ouroboros")
 *
 * 配置文件查找顺序（优先级从高到低）：
 *   1. --config <path>          CLI 参数显式指定
 *   2. $OUROBOROS_CONFIG         环境变量
 *   3. ./ouroboros.json          当前目录（项目级覆盖）
 *   4. ./config.json             当前目录（兼容旧版）
 *   5. resolveHome()/config.json 动态 home 目录
 *   6. ~/.ouroboros/config.json   向后兼容遗留兜底
 */

import { access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

/** 环境变量名 — 数据根目录 */
const ENV_HOME_KEY = "OUROBOROS_HOME";

/** 项目级配置文件名 */
const LOCAL_CONFIG_NAME = "ouroboros.json";

/** 环境变量名 — 配置文件路径 */
const ENV_CONFIG_KEY = "OUROBOROS_CONFIG";

/** 遗留默认目录（向后兼容） */
const LEGACY_HOME = join(homedir(), ".ouroboros");

/**
 * 展开路径中的 ~ 为 home 目录
 */
export function expandTilde(filePath: string): string {
  if (filePath === "~") return homedir();
  if (filePath.startsWith("~/")) return join(homedir(), filePath.slice(2));
  return filePath;
}

/**
 * 解析 OUROBOROS_HOME 数据根目录
 *
 * 优先级：
 *   1. __OUROBOROS_CLI_CWD（--cwd 注入）→ join(resolve(cwd), ".ouroboros")
 *   2. $OUROBOROS_HOME 环境变量 → resolve(expandTilde(value))
 *   3. 默认 → join(process.cwd(), ".ouroboros")
 */
export function resolveHome(): string {
  const cliCwd = process.env.__OUROBOROS_CLI_CWD;
  if (cliCwd) return join(resolve(expandTilde(cliCwd)), ".ouroboros");

  const envHome = process.env[ENV_HOME_KEY];
  if (envHome) return resolve(expandTilde(envHome));

  return join(process.cwd(), ".ouroboros");
}

/**
 * 获取 home 下的配置文件路径
 */
export function resolveConfigHome(): string {
  return join(resolveHome(), "config.json");
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

  // 4. 动态 home 目录
  const homeConfigPath = resolveConfigHome();
  if (await fileExists(homeConfigPath)) {
    return { path: homeConfigPath, source: "user" };
  }

  // 4.5 向后兼容：若当前 home 不是 ~/.ouroboros，额外检查遗留路径
  const legacyConfigPath = join(LEGACY_HOME, "config.json");
  if (homeConfigPath !== legacyConfigPath && (await fileExists(legacyConfigPath))) {
    return { path: legacyConfigPath, source: "user" };
  }

  // 未找到任何配置文件
  return { path: homeConfigPath, source: "none" };
}
