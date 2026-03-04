/**
 * init 命令 — 首次安装向导
 *
 * 引导用户完成 Ouroboros 初始化：
 *   1. 选择安装模式（QuickStart / Advanced）
 *   2. 选择模型提供商
 *   3. 完成认证（OAuth / API Key / 本地地址）
 *   4. 选择默认模型
 *   5. 初始化目录结构 + 生成配置文件
 */

import { createInterface } from "node:readline";
import { writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { resolveHome, resolveConfigHome } from "../../config/resolver.js";
import {
  stepSelectMode,
  stepSelectProvider,
  stepAuthenticate,
  stepSelectModel,
  stepAdvancedConfig,
  buildConfigObject,
  type InitWizardData,
} from "./init-steps.js";
import { createAuthStore } from "../../auth/store.js";
import { loginProvider } from "../../auth/login.js";
import { setupGlobalProxy } from "../../auth/proxy.js";

/** ~/.ouroboros 下需要创建的子目录 */
const INIT_DIRS = [
  "workspace/prompts",
  "workspace/prompts/memory",
  "workspace/tools",
  "workspace/tools/scripts",
  "workspace/skills",
  "workspace/agents",
  "workspace/solutions",
  "workspace/super-agents",
  "workspace/state",
  "workspace/schema",
  "workspace/tmp",
  "workspace/vectors",
  "logs",
  "cache/qmd",
] as const;

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
 * 检查是否已初始化
 */
async function isAlreadyInitialized(): Promise<boolean> {
  try {
    await access(resolveConfigHome());
    return true;
  } catch {
    return false;
  }
}

/**
 * 初始化 home 目录结构
 */
async function initDirectories(): Promise<void> {
  const home = resolveHome();
  for (const dir of INIT_DIRS) {
    await mkdir(join(home, dir), { recursive: true });
  }
}

/**
 * 执行安装向导
 */
export async function runInit(): Promise<void> {
  // Banner
  console.log();
  console.log("  ╭─────────────────────────────────────╮");
  console.log("  │   Ouroboros 安装向导                  │");
  console.log("  │   The Serpent Devours Itself         │");
  console.log("  ╰─────────────────────────────────────╯");
  console.log();

  // 检查是否已初始化
  const configHomePath = resolveConfigHome();
  if (await isAlreadyInitialized()) {
    const prompt = createPrompt();
    try {
      const overwrite = await prompt.ask(`  已检测到 ${configHomePath}\n  是否覆盖？(y/N): `);
      if (overwrite.toLowerCase() !== "y") {
        console.log("\n  已取消。使用 'ouroboros configure' 修改已有配置。\n");
        return;
      }
    } finally {
      prompt.close();
    }
  }

  const prompt = createPrompt();

  try {
    // [1/5] 安装模式
    const mode = await stepSelectMode(prompt.ask);
    console.log(`  ✓ ${mode === "quickstart" ? "QuickStart" : "Advanced"} 模式`);

    // [2/5] 选择提供商
    const provider = await stepSelectProvider(prompt.ask);
    console.log(`  ✓ ${provider.label}`);

    // [3/5] 认证
    let apiKey: string | undefined;
    let baseUrl: string | undefined;

    if (provider.auth === "oauth") {
      console.log("\n  [3/5] OAuth 登录\n");

      const store = createAuthStore(resolveHome());
      const existingCreds = await store.loadCredentials(provider.oauthId!);

      if (existingCreds && existingCreds.expires > Date.now()) {
        console.log(`  ✓ 已检测到 ${provider.oauthId} 的有效 OAuth 凭据，跳过登录`);
        prompt.close();
      } else {
        if (existingCreds) {
          console.log("  ⚠️  OAuth 凭据已过期，重新登录...\n");
        } else {
          console.log("  即将启动浏览器进行 OAuth 登录...\n");
        }
        // 关闭 readline 避免与 OAuth 冲突
        prompt.close();

        const cleanupProxy = await setupGlobalProxy();
        try {
          await loginProvider(provider.oauthId!, store);
        } finally {
          cleanupProxy();
        }
        console.log("  ✓ OAuth 登录成功");
      }

      // 重新创建 prompt 用于后续步骤
      const newPrompt = createPrompt();
      try {
        await continueAfterAuth(newPrompt, mode, provider, apiKey, baseUrl);
      } finally {
        newPrompt.close();
      }
      return;
    }

    const authResult = await stepAuthenticate(prompt.ask, provider);
    apiKey = authResult.apiKey;
    baseUrl = authResult.baseUrl;
    console.log("  ✓ 认证配置完成");

    await continueAfterAuth(prompt, mode, provider, apiKey, baseUrl);
  } catch (err) {
    prompt.close();
    if (err instanceof Error && err.message === "API Key 不能为空") {
      console.error("\n  ❌ API Key 不能为空\n");
      process.exit(1);
    }
    throw err;
  }
}

/**
 * 认证后的续续步骤（避免 OAuth 流程中 readline 冲突）
 */
async function continueAfterAuth(
  prompt: { ask: (q: string) => Promise<string>; close: () => void },
  mode: "quickstart" | "advanced",
  provider: (typeof import("./init-steps.js"))["PROVIDER_OPTIONS"][number],
  apiKey?: string,
  baseUrl?: string,
): Promise<void> {
  try {
    // [4/5] 选择模型
    const selectedModel = await stepSelectModel(prompt.ask, provider.models, provider.defaultModel);
    console.log(`  ✓ 模型: ${selectedModel}`);

    // Advanced 模式额外配置
    let advancedConfig: { proxy?: string; apiPort?: number; logLevel?: string } = {};
    if (mode === "advanced") {
      advancedConfig = await stepAdvancedConfig(prompt.ask);
    }

    // [5/5] 初始化
    console.log("\n  [5/5] 初始化\n");

    const providerName = provider.oauthId ?? provider.type;
    const wizardData: InitWizardData = {
      mode,
      provider,
      providerName,
      apiKey,
      baseUrl,
      selectedModel,
      ...advancedConfig,
    };

    // 创建目录结构
    const home = resolveHome();
    const configPath = resolveConfigHome();
    await initDirectories();
    console.log(`    创建 ${home}/           ✓`);

    // 生成配置文件
    const configObj = buildConfigObject(wizardData);
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(configObj, null, 2) + "\n", "utf-8");
    console.log(`    写入 ${configPath}  ✓`);

    console.log("    初始化 workspace              ✓");

    // 完成
    console.log("\n  ✅ 安装完成！");
    console.log("  启动服务: ouroboros start\n");
  } finally {
    prompt.close();
  }
}
