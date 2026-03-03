/**
 * init 向导步骤函数
 *
 * 分离向导逻辑为独立步骤，便于测试和复用。
 * 每个步骤接受 readline 的 ask 函数，返回收集到的数据。
 */

import { OUROBOROS_HOME } from "../../config/resolver.js";

/** 提供商选项 */
export interface ProviderOption {
  readonly label: string;
  readonly type: string;
  readonly auth: "oauth" | "apikey" | "local";
  readonly oauthId?: string;
  readonly api: string;
  readonly defaultModel: string;
  readonly models: readonly string[];
  readonly baseUrl?: string;
}

/** 安装模式 */
export type InstallMode = "quickstart" | "advanced";

/** 向导收集到的完整数据 */
export interface InitWizardData {
  readonly mode: InstallMode;
  readonly provider: ProviderOption;
  readonly providerName: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly selectedModel: string;
  /** Advanced 模式额外配置 */
  readonly proxy?: string;
  readonly apiPort?: number;
  readonly logLevel?: string;
}

/** 可选提供商列表 */
export const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  // ── OAuth 提供商 ──
  {
    label: "OpenAI Codex — ChatGPT 订阅 (OAuth)",
    type: "openai-codex",
    auth: "oauth",
    oauthId: "openai-codex",
    api: "openai-completions",
    defaultModel: "gpt-5.3-codex",
    models: ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-mini"],
  },
  {
    label: "GitHub Copilot — GitHub 订阅 (OAuth)",
    type: "github-copilot",
    auth: "oauth",
    oauthId: "github-copilot",
    api: "openai-completions",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "claude-sonnet-4", "gemini-2.5-pro"],
  },
  {
    label: "Anthropic — OAuth",
    type: "anthropic",
    auth: "oauth",
    oauthId: "anthropic",
    api: "anthropic-messages",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
  },
  {
    label: "Google Gemini CLI — OAuth",
    type: "google-gemini-cli",
    auth: "oauth",
    oauthId: "google-gemini-cli",
    api: "google-generative-ai",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  {
    label: "Google Antigravity — OAuth",
    type: "google-antigravity",
    auth: "oauth",
    oauthId: "google-antigravity",
    api: "google-generative-ai",
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "claude-opus-4-5-thinking", "claude-sonnet-4-6-thinking"],
  },
  // ── API Key 提供商 ──
  {
    label: "OpenAI — API Key",
    type: "openai",
    auth: "apikey",
    api: "openai-completions",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
  },
  {
    label: "Anthropic — API Key",
    type: "anthropic",
    auth: "apikey",
    api: "anthropic-messages",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
  },
  {
    label: "Google — API Key",
    type: "google",
    auth: "apikey",
    api: "google-generative-ai",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.5-pro"],
  },
  // ── 本地提供商 ──
  {
    label: "Ollama — 本地运行",
    type: "openai-compatible",
    auth: "local",
    api: "openai-completions",
    defaultModel: "llama3",
    models: ["llama3", "qwen2.5", "deepseek-r1"],
    baseUrl: "http://localhost:11434/v1",
  },
];

/**
 * [1/5] 选择安装模式
 */
export async function stepSelectMode(
  ask: (q: string) => Promise<string>,
): Promise<InstallMode> {
  console.log("  [1/5] 安装模式\n");
  console.log("    1. QuickStart — 快速开始（推荐）");
  console.log("    2. Advanced  — 自定义配置\n");

  const choice = await ask("  请选择 (1): ");
  return choice === "2" ? "advanced" : "quickstart";
}

/**
 * [2/5] 选择模型提供商
 */
export async function stepSelectProvider(
  ask: (q: string) => Promise<string>,
): Promise<ProviderOption> {
  console.log("\n  [2/5] 选择模型提供商\n");

  // 按认证方式分组
  const oauthProviders = PROVIDER_OPTIONS.filter((p) => p.auth === "oauth");
  const apikeyProviders = PROVIDER_OPTIONS.filter((p) => p.auth === "apikey");
  const localProviders = PROVIDER_OPTIONS.filter((p) => p.auth === "local");

  let idx = 0;
  console.log("    ── OAuth 登录 ──");
  for (const p of oauthProviders) {
    idx++;
    console.log(`    ${idx}. ${p.label}`);
  }
  console.log("    ── API Key ──");
  for (const p of apikeyProviders) {
    idx++;
    console.log(`    ${idx}. ${p.label}`);
  }
  console.log("    ── 本地 ──");
  for (const p of localProviders) {
    idx++;
    console.log(`    ${idx}. ${p.label}`);
  }
  console.log();

  const choiceStr = await ask(`  请选择 (1-${PROVIDER_OPTIONS.length}): `);
  const choiceIdx = parseInt(choiceStr, 10) - 1;

  if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= PROVIDER_OPTIONS.length) {
    console.log("  ⚠️ 无效选择，使用默认（OpenAI Codex）");
    return PROVIDER_OPTIONS[0];
  }

  return PROVIDER_OPTIONS[choiceIdx];
}

/**
 * [3/5] 认证（OAuth / API Key / 本地地址）
 */
export async function stepAuthenticate(
  ask: (q: string) => Promise<string>,
  provider: ProviderOption,
): Promise<{ apiKey?: string; baseUrl?: string }> {
  console.log("\n  [3/5] 认证配置\n");

  if (provider.auth === "oauth") {
    // OAuth 登录由调用方处理（需要 authStore）
    return {};
  }

  if (provider.auth === "apikey") {
    const apiKey = await ask("  请输入 API Key: ");
    if (!apiKey) {
      throw new Error("API Key 不能为空");
    }
    return { apiKey };
  }

  // local
  const defaultUrl = provider.baseUrl ?? "http://localhost:11434/v1";
  const baseUrl = await ask(`  API 地址 (默认 ${defaultUrl}): `);
  return {
    apiKey: "ollama",
    baseUrl: baseUrl || defaultUrl,
  };
}

/**
 * [4/5] 选择默认模型
 */
export async function stepSelectModel(
  ask: (q: string) => Promise<string>,
  models: readonly string[],
  defaultModel: string,
): Promise<string> {
  console.log("\n  [4/5] 选择默认模型\n");

  models.forEach((m, i) => {
    const tag = m === defaultModel ? " (默认)" : "";
    console.log(`    ${i + 1}. ${m}${tag}`);
  });
  console.log();

  const answer = await ask("  请选择 (默认 1): ");
  if (!answer) return defaultModel;

  const idx = parseInt(answer, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= models.length) {
    console.log("  ⚠️ 无效选择，使用默认模型");
    return defaultModel;
  }

  return models[idx];
}

/**
 * Advanced 模式额外步骤：代理、端口、日志级别
 */
export async function stepAdvancedConfig(
  ask: (q: string) => Promise<string>,
): Promise<{ proxy?: string; apiPort?: number; logLevel?: string }> {
  console.log("\n  [Advanced] 额外配置\n");

  const proxy = await ask("  HTTP 代理地址（留空跳过）: ");
  const portStr = await ask("  API 端口（默认 3000）: ");
  const logLevel = await ask("  日志级别 [debug/info/warn/error]（默认 info）: ");

  const port = portStr ? parseInt(portStr, 10) : undefined;
  const validPort = port && !isNaN(port) && port > 0 && port < 65536 ? port : undefined;

  const validLogLevels = ["debug", "info", "warn", "error"];
  const validLevel = logLevel && validLogLevels.includes(logLevel) ? logLevel : undefined;

  return {
    proxy: proxy || undefined,
    apiPort: validPort,
    logLevel: validLevel,
  };
}

/**
 * 生成 v1 格式配置对象（Phase 2 后切换为 v2）
 */
export function buildConfigObject(data: InitWizardData): Record<string, unknown> {
  const providerName = data.providerName;
  const modelRef = `${providerName}/${data.selectedModel}`;

  // 构建提供商配置
  const providerConfig: Record<string, unknown> = {
    type: data.provider.type,
    defaultModel: data.selectedModel,
    models: [...data.provider.models],
  };
  if (data.apiKey) providerConfig.apiKey = data.apiKey;
  if (data.baseUrl) providerConfig.baseUrl = data.baseUrl;

  // 构建系统配置
  const system: Record<string, unknown> = {};
  if (data.proxy) system.proxy = data.proxy;
  if (data.logLevel) system.logLevel = data.logLevel;

  // 构建 API 配置
  const api: Record<string, unknown> = {};
  if (data.apiPort) api.port = data.apiPort;

  const config: Record<string, unknown> = {
    system,
    providers: { [providerName]: providerConfig },
    agents: { default: { model: modelRef } },
  };

  if (Object.keys(api).length > 0) {
    config.api = api;
  }

  return config;
}

/** 数据目录路径 */
export { OUROBOROS_HOME };
