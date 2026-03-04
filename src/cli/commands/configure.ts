/**
 * configure 命令 — 交互式配置向导
 * 引导用户选择提供商、完成认证、选择模型、生成 config.json
 */
import { createInterface } from "node:readline";
import { createAuthStore } from "../../auth/store.js";
import { resolveHome } from "../../config/resolver.js";
import { loginProvider } from "../../auth/login.js";
import { setupGlobalProxy } from "../../auth/proxy.js";
import { selectModel, writeProviderConfig } from "./config-writer.js";

/** 提供商选项 */
interface ProviderOption {
  readonly label: string;
  readonly type: string;
  readonly auth: "oauth" | "apikey" | "local";
  readonly oauthId?: string;
  readonly defaultModel: string;
  readonly models: readonly string[];
  readonly baseUrl?: string;
}

/** 可选提供商列表 */
const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  {
    label: "OpenAI Codex — ChatGPT 订阅 (OAuth 登录)",
    type: "openai-codex",
    auth: "oauth",
    oauthId: "openai-codex",
    defaultModel: "gpt-5.3-codex",
    models: ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-mini"],
  },
  {
    label: "GitHub Copilot — GitHub 订阅 (OAuth 登录)",
    type: "github-copilot",
    auth: "oauth",
    oauthId: "github-copilot",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "claude-sonnet-4", "gemini-2.5-pro"],
  },
  {
    label: "Anthropic — OAuth 登录",
    type: "anthropic",
    auth: "oauth",
    oauthId: "anthropic",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
  },
  {
    label: "Google Gemini CLI — OAuth 登录",
    type: "google-gemini-cli",
    auth: "oauth",
    oauthId: "google-gemini-cli",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  {
    label: "Google Antigravity — OAuth 登录",
    type: "google-antigravity",
    auth: "oauth",
    oauthId: "google-antigravity",
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "claude-opus-4-5-thinking", "claude-sonnet-4-6-thinking"],
  },
  {
    label: "OpenAI — API Key",
    type: "openai",
    auth: "apikey",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
  },
  {
    label: "Anthropic — API Key",
    type: "anthropic",
    auth: "apikey",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
  },
  {
    label: "Google — API Key",
    type: "google",
    auth: "apikey",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.5-pro"],
  },
  {
    label: "Ollama — 本地运行",
    type: "openai-compatible",
    auth: "local",
    defaultModel: "llama3",
    models: ["llama3", "qwen2.5", "deepseek-r1"],
    baseUrl: "http://localhost:11434/v1",
  },
];

/**
 * 创建 readline 提示
 */
function createPrompt(): {
  ask: (question: string) => Promise<string>;
  close: () => void;
} {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return {
    ask: (question: string) =>
      new Promise<string>((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
      }),
    close: () => rl.close(),
  };
}

/**
 * 执行交互式配置向导
 */
export async function runConfigure(): Promise<void> {
  console.log("\n🐍 Ouroboros 配置向导\n");

  const prompt = createPrompt();

  try {
    // [1/4] 选择提供商
    console.log("[1/4] 选择默认模型提供商\n");
    PROVIDER_OPTIONS.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt.label}`);
    });
    console.log();

    const choiceStr = await prompt.ask("请输入编号 (1-9): ");
    const choiceIdx = parseInt(choiceStr, 10) - 1;

    if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= PROVIDER_OPTIONS.length) {
      console.error("❌ 无效的选择");
      process.exit(1);
    }

    const selected = PROVIDER_OPTIONS[choiceIdx];
    console.log(`\n✓ 已选择: ${selected.label}\n`);

    // [2/4] 认证
    console.log("[2/4] 认证配置\n");

    let apiKey: string | undefined;
    let baseUrl: string | undefined;
    const providerName = selected.oauthId ?? selected.type;

    if (selected.auth === "oauth") {
      const store = createAuthStore(resolveHome());
      const existingCreds = await store.loadCredentials(selected.oauthId!);

      if (existingCreds && existingCreds.expires > Date.now()) {
        console.log(`✓ 已检测到 ${selected.oauthId} 的有效 OAuth 凭据，跳过登录\n`);
      } else {
        if (existingCreds) {
          console.log("⚠️  OAuth 凭据已过期，重新登录...\n");
        } else {
          console.log("即将启动 OAuth 登录流程...\n");
        }
        const cleanupProxy = await setupGlobalProxy();
        try {
          await loginProvider(selected.oauthId!, store);
        } finally {
          cleanupProxy();
        }
      }
    } else if (selected.auth === "apikey") {
      apiKey = await prompt.ask("请输入 API Key: ");
      if (!apiKey) {
        console.error("❌ API Key 不能为空");
        process.exit(1);
      }
    } else if (selected.auth === "local") {
      baseUrl = await prompt.ask(`请输入 API 地址 (默认 ${selected.baseUrl}): `);
      if (!baseUrl) {
        baseUrl = selected.baseUrl;
      }
      apiKey = "ollama"; // Ollama 不需要真正的 key
    }

    // [3/4] 选择模型
    console.log("\n[3/4] 选择默认模型");

    // 关闭当前 readline 避免与 selectModel 的 readline 冲突
    prompt.close();

    const selectedModel = await selectModel(selected.models, selected.defaultModel);
    console.log(`\n✓ 已选择模型: ${selectedModel}`);

    // [4/4] 生成配置文件
    console.log("\n[4/4] 生成配置\n");

    await writeProviderConfig({
      providerName,
      providerType: selected.type,
      selectedModel,
      models: selected.models,
      apiKey,
      baseUrl,
    });

    console.log("\n启动: npm run dev\n");
  } catch (err) {
    prompt.close();
    throw err;
  }
}
