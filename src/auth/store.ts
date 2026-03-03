/**
 * OAuth 凭据持久化存储
 * 将凭据存储到 ~/.ouroboros/auth.json（权限 0600）
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AuthStore, OAuthCredentials } from "./types.js";

/** 默认存储目录 */
const DEFAULT_DIR = join(homedir(), ".ouroboros");

/** 默认存储文件名 */
const AUTH_FILE = "auth.json";

/**
 * 凭据文件结构
 */
interface AuthData {
  readonly [providerId: string]: OAuthCredentials;
}

/**
 * 读取凭据文件
 */
async function readAuthData(filePath: string): Promise<AuthData> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as AuthData;
  } catch {
    return {};
  }
}

/**
 * 写入凭据文件（不可变更新）
 */
async function writeAuthData(filePath: string, data: AuthData): Promise<void> {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), {
    mode: 0o600,
    encoding: "utf-8",
  });
}

/**
 * 创建 OAuth 凭据存储实例
 *
 * @param dir - 存储目录，默认 ~/.ouroboros
 * @returns AuthStore 接口实现
 */
export function createAuthStore(dir?: string): AuthStore {
  const filePath = join(dir ?? DEFAULT_DIR, AUTH_FILE);

  return {
    async loadCredentials(providerId: string): Promise<OAuthCredentials | null> {
      const data = await readAuthData(filePath);
      return data[providerId] ?? null;
    },

    async saveCredentials(providerId: string, creds: OAuthCredentials): Promise<void> {
      const data = await readAuthData(filePath);
      const updated: AuthData = { ...data, [providerId]: creds };
      await writeAuthData(filePath, updated);
    },

    async clearCredentials(providerId: string): Promise<void> {
      const data = await readAuthData(filePath);
      const { [providerId]: _, ...rest } = data;
      await writeAuthData(filePath, rest);
    },

    async listProviders(): Promise<readonly string[]> {
      const data = await readAuthData(filePath);
      return Object.keys(data);
    },
  };
}
