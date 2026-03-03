/**
 * login 命令 — OAuth 登录
 * 支持所有 pi-ai OAuth 提供商，自动加载代理配置
 * 登录成功后自动选择模型并写入 config.json
 */
import { createAuthStore } from "../../auth/store.js";
import {
  loginProvider,
  getSupportedOAuthProviders,
  getProviderDisplayName,
} from "../../auth/login.js";
import { setupGlobalProxy } from "../../auth/proxy.js";
import { PROVIDER_MODELS, selectModel, writeProviderConfig } from "./config-writer.js";

/**
 * 执行 login 命令
 *
 * @param providerId - 要登录的 OAuth 提供商 ID（默认列出可选项）
 */
export async function runLogin(providerId?: string): Promise<void> {
  const store = createAuthStore();
  const supported = getSupportedOAuthProviders();

  if (!providerId) {
    // 未指定提供商，打印帮助
    console.log("\n🐍 Ouroboros OAuth 登录\n");
    console.log("用法: ouroboros login <provider>\n");
    console.log("支持的 OAuth 提供商:");
    for (const id of supported) {
      const name = getProviderDisplayName(id);
      const stored = await store.loadCredentials(id);
      const status = stored ? "✅ 已登录" : "⬚  未登录";
      console.log(`  ${status}  ${id.padEnd(20)} ${name}`);
    }
    console.log("\n示例: npm run login -- openai-codex\n");
    return;
  }

  if (!supported.includes(providerId)) {
    console.error(`❌ 不支持的 OAuth 提供商: ${providerId}`);
    console.error(`支持的提供商: ${supported.join(", ")}`);
    process.exit(1);
  }

  // 设置全局代理（从 config.json / 环境变量读取）
  const cleanupProxy = await setupGlobalProxy();
  try {
    await loginProvider(providerId, store);
  } finally {
    cleanupProxy();
  }

  // 登录成功后，自动选择模型并写入配置
  const modelInfo = PROVIDER_MODELS[providerId];
  if (!modelInfo) {
    console.log("\n⚠️  未找到该提供商的模型列表，跳过配置写入");
    return;
  }

  const selectedModel = await selectModel(modelInfo.models, modelInfo.defaultModel);

  await writeProviderConfig({
    providerName: providerId,
    providerType: providerId,
    selectedModel,
    models: modelInfo.models,
  });
}
