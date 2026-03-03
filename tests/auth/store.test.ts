import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAuthStore } from "../../src/auth/store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("AuthStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ouroboros-auth-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const mockCredentials = {
    refresh: "refresh-token-123",
    access: "access-token-456",
    expires: Date.now() + 3600000,
  };

  it("应该保存并加载凭据", async () => {
    const store = createAuthStore(tempDir);

    await store.saveCredentials("openai-codex", mockCredentials);
    const loaded = await store.loadCredentials("openai-codex");

    expect(loaded).toEqual(mockCredentials);
  });

  it("应该对不存在的提供商返回 null", async () => {
    const store = createAuthStore(tempDir);

    const loaded = await store.loadCredentials("nonexistent");

    expect(loaded).toBeNull();
  });

  it("应该列出所有已存储的提供商", async () => {
    const store = createAuthStore(tempDir);

    await store.saveCredentials("openai-codex", mockCredentials);
    await store.saveCredentials("anthropic", {
      ...mockCredentials,
      refresh: "ant-refresh",
    });

    const providers = await store.listProviders();

    expect(providers).toContain("openai-codex");
    expect(providers).toContain("anthropic");
    expect(providers).toHaveLength(2);
  });

  it("应该清除指定提供商的凭据", async () => {
    const store = createAuthStore(tempDir);

    await store.saveCredentials("openai-codex", mockCredentials);
    await store.saveCredentials("anthropic", mockCredentials);
    await store.clearCredentials("openai-codex");

    const cleared = await store.loadCredentials("openai-codex");
    const remaining = await store.loadCredentials("anthropic");

    expect(cleared).toBeNull();
    expect(remaining).toEqual(mockCredentials);
  });

  it("应该不可变更新（覆盖已有凭据）", async () => {
    const store = createAuthStore(tempDir);

    await store.saveCredentials("openai-codex", mockCredentials);
    const newCreds = { ...mockCredentials, access: "new-access-token" };
    await store.saveCredentials("openai-codex", newCreds);

    const loaded = await store.loadCredentials("openai-codex");

    expect(loaded).toEqual(newCreds);
    expect(loaded!.access).toBe("new-access-token");
  });

  it("应该在目录不存在时自动创建", async () => {
    const nestedDir = join(tempDir, "nested", "deep");
    const store = createAuthStore(nestedDir);

    await store.saveCredentials("test", mockCredentials);
    const loaded = await store.loadCredentials("test");

    expect(loaded).toEqual(mockCredentials);
  });

  it("应该处理空文件优雅降级", async () => {
    const store = createAuthStore(tempDir);

    // 直接读取，文件不存在
    const providers = await store.listProviders();

    expect(providers).toHaveLength(0);
  });
});
