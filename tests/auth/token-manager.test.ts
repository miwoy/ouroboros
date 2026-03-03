import { describe, it, expect, vi, beforeEach } from "vitest";
import { getApiKey } from "../../src/auth/token-manager.js";
import type { AuthStore, OAuthCredentials } from "../../src/auth/types.js";

// Mock pi-ai 的 getOAuthApiKey
vi.mock("@mariozechner/pi-ai", () => ({
  getOAuthApiKey: vi.fn(),
  registerBuiltInApiProviders: vi.fn(),
}));

import { getOAuthApiKey } from "@mariozechner/pi-ai";

const mockedGetOAuthApiKey = vi.mocked(getOAuthApiKey);

describe("TokenManager", () => {
  let mockStore: AuthStore;
  let savedCredentials: Record<string, OAuthCredentials>;

  beforeEach(() => {
    vi.clearAllMocks();
    savedCredentials = {};

    mockStore = {
      loadCredentials: vi.fn(async (id: string) => savedCredentials[id] ?? null),
      saveCredentials: vi.fn(async (id: string, creds: OAuthCredentials) => {
        savedCredentials[id] = creds;
      }),
      clearCredentials: vi.fn(),
      listProviders: vi.fn(async () => Object.keys(savedCredentials)),
    };
  });

  const validCreds: OAuthCredentials = {
    refresh: "refresh-123",
    access: "access-456",
    expires: Date.now() + 3600000,
  };

  it("应该在无凭据时返回 null", async () => {
    const result = await getApiKey("openai-codex", mockStore);

    expect(result).toBeNull();
    expect(mockedGetOAuthApiKey).not.toHaveBeenCalled();
  });

  it("应该通过 pi-ai 获取有效的 API Key", async () => {
    savedCredentials["openai-codex"] = validCreds;
    mockedGetOAuthApiKey.mockResolvedValue({
      newCredentials: validCreds,
      apiKey: "sk-oauth-token",
    });

    const result = await getApiKey("openai-codex", mockStore);

    expect(result).toBe("sk-oauth-token");
    expect(mockedGetOAuthApiKey).toHaveBeenCalledWith("openai-codex", {
      "openai-codex": validCreds,
    });
  });

  it("应该在 token 刷新后更新持久化", async () => {
    savedCredentials["openai-codex"] = validCreds;
    const refreshedCreds: OAuthCredentials = {
      refresh: "new-refresh",
      access: "new-access",
      expires: Date.now() + 7200000,
    };
    mockedGetOAuthApiKey.mockResolvedValue({
      newCredentials: refreshedCreds,
      apiKey: "sk-refreshed-token",
    });

    const result = await getApiKey("openai-codex", mockStore);

    expect(result).toBe("sk-refreshed-token");
    expect(mockStore.saveCredentials).toHaveBeenCalledWith("openai-codex", refreshedCreds);
  });

  it("应该在 pi-ai 返回 null 时返回 null", async () => {
    savedCredentials["openai-codex"] = validCreds;
    mockedGetOAuthApiKey.mockResolvedValue(null);

    const result = await getApiKey("openai-codex", mockStore);

    expect(result).toBeNull();
  });

  it("应该在 token 未刷新时不更新持久化", async () => {
    savedCredentials["anthropic"] = validCreds;
    mockedGetOAuthApiKey.mockResolvedValue({
      newCredentials: validCreds, // 同一引用，未刷新
      apiKey: "sk-same-token",
    });

    await getApiKey("anthropic", mockStore);

    expect(mockStore.saveCredentials).not.toHaveBeenCalled();
  });
});
