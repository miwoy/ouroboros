/**
 * OAuth 认证系统类型定义
 * 复用 pi-ai 的 OAuthCredentials 类型，定义持久化存储接口
 */
import type { OAuthCredentials } from "@mariozechner/pi-ai";

/** 重新导出 pi-ai 类型 */
export type { OAuthCredentials };

/**
 * OAuth 凭据持久化存储接口
 * 管理多个提供商的 OAuth 凭据
 */
export interface AuthStore {
  /** 加载指定提供商的凭据 */
  readonly loadCredentials: (providerId: string) => Promise<OAuthCredentials | null>;
  /** 保存指定提供商的凭据 */
  readonly saveCredentials: (providerId: string, creds: OAuthCredentials) => Promise<void>;
  /** 清除指定提供商的凭据 */
  readonly clearCredentials: (providerId: string) => Promise<void>;
  /** 列出所有已存储凭据的提供商 ID */
  readonly listProviders: () => Promise<readonly string[]>;
}

/**
 * OAuth 登录回调选项
 */
export interface LoginOptions {
  /** 静默模式（不打开浏览器） */
  readonly silent?: boolean;
  /** 中止信号 */
  readonly signal?: AbortSignal;
}
