/**
 * 配置写入共享模块
 * login 和 configure 共用的模型选择 + 配置文件写入逻辑
 */
import { createInterface } from "node:readline";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { USER_CONFIG_PATH } from "../../config/resolver.js";

/** 提供商模型信息 */
interface ProviderModelInfo {
  readonly models: readonly string[];
  readonly defaultModel: string;
}

/**
 * 提供商 → 模型列表映射
 * 从 configure.ts 的 PROVIDER_OPTIONS 提取
 */
export const PROVIDER_MODELS: Readonly<Record<string, ProviderModelInfo>> = {
  "openai-codex": {
    models: ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-mini"],
    defaultModel: "gpt-5.3-codex",
  },
  "github-copilot": {
    models: ["gpt-4o", "claude-sonnet-4", "gemini-2.5-pro"],
    defaultModel: "gpt-4o",
  },
  anthropic: {
    models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
    defaultModel: "claude-sonnet-4-20250514",
  },
  "google-gemini-cli": {
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    defaultModel: "gemini-2.5-flash",
  },
  "google-antigravity": {
    models: ["gemini-2.5-pro", "claude-opus-4-5-thinking", "claude-sonnet-4-6-thinking"],
    defaultModel: "gemini-2.5-pro",
  },
  openai: {
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
    defaultModel: "gpt-4o",
  },
  google: {
    models: ["gemini-2.0-flash", "gemini-2.5-pro"],
    defaultModel: "gemini-2.0-flash",
  },
  "openai-compatible": {
    models: ["llama3", "qwen2.5", "deepseek-r1"],
    defaultModel: "llama3",
  },
};

/**
 * 交互式选择模型（readline）
 *
 * @param models - 可选模型列表
 * @param defaultModel - 默认模型
 * @returns 用户选择的模型
 */
export async function selectModel(
  models: readonly string[],
  defaultModel: string,
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("\n选择默认模型:\n");
    models.forEach((m, i) => {
      const tag = m === defaultModel ? " (默认)" : "";
      console.log(`  ${i + 1}. ${m}${tag}`);
    });
    console.log();

    const answer = await new Promise<string>((res) => {
      rl.question("请输入编号 (默认 1): ", (ans) => res(ans.trim()));
    });

    if (!answer) {
      return defaultModel;
    }

    const idx = parseInt(answer, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= models.length) {
      console.log("⚠️  无效选择，使用默认模型");
      return defaultModel;
    }

    return models[idx];
  } finally {
    rl.close();
  }
}

/**
 * 读取现有 config.json 或返回 null
 */
export async function readExistingConfig(
  configPath?: string,
): Promise<Record<string, unknown> | null> {
  const path = configPath ?? USER_CONFIG_PATH;
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 写入/合并提供商到 config.json
 * 如果 config.json 已存在，则合并提供商配置并更新默认 Agent 模型
 * 否则创建新的 config.json
 */
export async function writeProviderConfig(options: {
  readonly providerName: string;
  readonly providerType: string;
  readonly selectedModel: string;
  readonly models: readonly string[];
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly configPath?: string;
}): Promise<void> {
  const configPath = options.configPath ?? USER_CONFIG_PATH;
  const defaultModelRef = `${options.providerName}/${options.selectedModel}`;

  // 构建提供商配置
  const providerConfig: Record<string, unknown> = {
    type: options.providerType,
    defaultModel: options.selectedModel,
    models: [...options.models],
  };
  if (options.apiKey) providerConfig.apiKey = options.apiKey;
  if (options.baseUrl) providerConfig.baseUrl = options.baseUrl;

  // 读取现有配置
  const existing = await readExistingConfig(configPath);

  // 确保目录存在
  await mkdir(dirname(configPath), { recursive: true });

  if (existing) {
    // 合并模式（v2 格式用 provider，兼容读取旧 providers）
    const existingProvider = (existing.provider ?? existing.providers ?? {}) as Record<
      string,
      unknown
    >;
    const existingAgents = (existing.agents ?? {}) as Record<string, unknown>;
    const existingDefault = (existingAgents.default ?? {}) as Record<string, unknown>;

    // 移除旧的 providers 键（如果存在）
    const { providers: _removed, ...rest } = existing as Record<string, unknown>;

    const merged = {
      ...rest,
      provider: {
        ...existingProvider,
        [options.providerName]: providerConfig,
      },
      agents: {
        ...existingAgents,
        default: {
          ...existingDefault,
          model: defaultModelRef,
        },
      },
    };
    await writeFile(configPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
    console.log(`\n✅ 已更新 ${configPath} — 默认模型: ${defaultModelRef}`);
  } else {
    // 新建模式（v2 格式）
    const config = {
      system: {},
      provider: {
        [options.providerName]: providerConfig,
      },
      agents: {
        default: {
          model: defaultModelRef,
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    console.log(`\n✅ 已生成 ${configPath} — 默认模型: ${defaultModelRef}`);
  }
}
