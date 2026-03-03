/**
 * OAuth 登录流程
 * 封装 pi-ai 的 OAuth 提供商接口，提供统一的登录体验
 */
import { getOAuthProvider } from "@mariozechner/pi-ai";
import { createInterface } from "node:readline";
import { exec } from "node:child_process";
import { platform } from "node:os";
import type { AuthStore, LoginOptions, OAuthCredentials } from "./types.js";

/**
 * 尝试在默认浏览器中打开 URL
 */
function openBrowser(url: string): void {
  const os = platform();
  const cmd = os === "darwin" ? "open" : os === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`, () => {
    // 忽略打开失败（SSH/VPS 环境无桌面）
  });
}

/**
 * 通过 readline 提示用户输入
 */
async function promptInput(message: string, placeholder?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const hint = placeholder ? ` (${placeholder})` : "";
  return new Promise<string>((resolve) => {
    rl.question(`${message}${hint}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * 获取 OAuth 提供商的显示名称
 */
const PROVIDER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "openai-codex": "OpenAI Codex (ChatGPT Plus/Pro)",
  anthropic: "Anthropic",
  "github-copilot": "GitHub Copilot",
  "google-gemini-cli": "Google Gemini CLI",
  "google-antigravity": "Google Antigravity",
};

/**
 * 执行 OAuth 登录
 *
 * @param providerId - OAuth 提供商 ID（如 "openai-codex", "anthropic"）
 * @param store - 凭据存储
 * @param options - 登录选项
 * @returns 登录成功的凭据
 */
export async function loginProvider(
  providerId: string,
  store: AuthStore,
  options?: LoginOptions,
): Promise<OAuthCredentials> {
  const provider = getOAuthProvider(providerId);
  if (!provider) {
    throw new Error(`不支持的 OAuth 提供商: ${providerId}`);
  }

  const displayName = PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;
  console.log(`\n🔑 正在登录 ${displayName}...\n`);

  const credentials = await provider.login({
    onAuth: (info) => {
      console.log(`请在浏览器中打开以下链接完成授权:\n`);
      console.log(`  ${info.url}\n`);
      if (info.instructions) {
        console.log(`  ${info.instructions}\n`);
      }
      if (!options?.silent) {
        openBrowser(info.url);
      }
      // 提示 SSH/VPS 用户的替代方式
      console.log(`本地浏览器授权后会自动完成。`);
      console.log(`如果在远程服务器上，授权完成后浏览器会跳转到 localhost 地址，`);
      console.log(`请复制浏览器地址栏中的完整 URL 粘贴到下方输入框。\n`);
    },
    onPrompt: async (prompt) => {
      return promptInput(prompt.message ?? "请粘贴完整的重定向 URL 或授权码", prompt.placeholder);
    },
    onProgress: (message) => {
      console.log(`  ${message}`);
    },
    onManualCodeInput: async () => {
      // 立即显示输入提示，与本地回调服务器 race
      // pi-ai 内部会自动解析 URL 提取 code 参数
      return promptInput("粘贴重定向 URL 或授权码（浏览器自动回调则无需输入）");
    },
    signal: options?.signal,
  });

  // 持久化凭据
  await store.saveCredentials(providerId, credentials);
  console.log(`\n✅ ${displayName} 登录成功！凭据已保存。\n`);

  return credentials;
}

/**
 * 获取所有支持的 OAuth 提供商 ID 列表
 */
export function getSupportedOAuthProviders(): readonly string[] {
  return Object.keys(PROVIDER_DISPLAY_NAMES);
}

/**
 * 获取提供商显示名称
 */
export function getProviderDisplayName(providerId: string): string {
  return PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;
}
