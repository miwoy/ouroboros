/**
 * OAuth Token 自动刷新管理
 * 封装 pi-ai 的 getOAuthApiKey，自动刷新过期 token 并更新持久化
 */
import { getOAuthApiKey } from "@mariozechner/pi-ai";
import type { AuthStore, OAuthCredentials } from "./types.js";

/**
 * 获取指定提供商的 API Key
 * 自动刷新过期的 OAuth token，并更新持久化存储
 *
 * @param providerId - OAuth 提供商 ID
 * @param store - 凭据存储
 * @returns API Key 字符串，无凭据时返回 null
 */
export async function getApiKey(
  providerId: string,
  store: AuthStore,
): Promise<string | null> {
  const credentials = await store.loadCredentials(providerId);
  if (!credentials) {
    return null;
  }

  // pi-ai 的 getOAuthApiKey 需要 Record<string, OAuthCredentials> 格式
  const credentialsMap: Record<string, OAuthCredentials> = {
    [providerId]: credentials,
  };

  const result = await getOAuthApiKey(providerId, credentialsMap);
  if (!result) {
    return null;
  }

  // 如果 token 被刷新，更新持久化
  if (result.newCredentials !== credentials) {
    await store.saveCredentials(providerId, result.newCredentials);
  }

  return result.apiKey;
}
