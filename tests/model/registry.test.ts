import { describe, it, expect, vi } from "vitest";
import { createProviderRegistry } from "../../src/model/registry.js";
import { ProviderNotFoundError } from "../../src/errors/index.js";
import type { ModelProviderConfig } from "../../src/config/schema.js";

// Mock pi-ai 以避免实际的网络调用和注册
vi.mock("@mariozechner/pi-ai", () => ({
  registerBuiltInApiProviders: vi.fn(),
  stream: vi.fn(),
  complete: vi.fn(),
}));

describe("createProviderRegistry", () => {
  const testProviders: Record<string, ModelProviderConfig> = {
    "my-openai": {
      type: "openai",
      apiKey: "sk-test",
      defaultModel: "gpt-4o",
    },
    "my-anthropic": {
      type: "anthropic",
      apiKey: "sk-ant-test",
      defaultModel: "claude-sonnet-4-20250514",
    },
  };

  it("应该创建注册表并列出所有提供商名称", () => {
    const registry = createProviderRegistry(testProviders);
    const names = registry.names();
    expect(names).toContain("my-openai");
    expect(names).toContain("my-anthropic");
  });

  it("has() 应该正确判断提供商是否存在", () => {
    const registry = createProviderRegistry(testProviders);
    expect(registry.has("my-openai")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("get() 应该返回对应的提供商实例", () => {
    const registry = createProviderRegistry(testProviders);
    const provider = registry.get("my-openai");
    expect(provider).toBeDefined();
    expect(provider.name).toBe("openai");
  });

  it("get() 多次调用应返回同一实例（懒初始化缓存）", () => {
    const registry = createProviderRegistry(testProviders);
    const p1 = registry.get("my-openai");
    const p2 = registry.get("my-openai");
    expect(p1).toBe(p2);
  });

  it("get() 应该为 Anthropic 类型返回正确提供商", () => {
    const registry = createProviderRegistry(testProviders);
    const provider = registry.get("my-anthropic");
    expect(provider.name).toBe("anthropic");
  });

  it("get() 应该在提供商不存在时抛出 ProviderNotFoundError", () => {
    const registry = createProviderRegistry(testProviders);
    expect(() => registry.get("nonexistent")).toThrow(ProviderNotFoundError);
  });

  it("应该支持 openai-compatible 类型", () => {
    const registry = createProviderRegistry({
      ollama: {
        type: "openai-compatible",
        apiKey: "ollama",
        baseUrl: "http://localhost:11434/v1",
        defaultModel: "llama3",
      },
    });
    const provider = registry.get("ollama");
    expect(provider.name).toBe("openai-compatible");
  });

  it("应该支持新增的 provider 类型", () => {
    const registry = createProviderRegistry({
      google: {
        type: "google",
        apiKey: "test-key",
        defaultModel: "gemini-2.0-flash",
      },
      groq: {
        type: "groq",
        apiKey: "test-key",
        defaultModel: "llama-3.3-70b-versatile",
      },
    });

    const googleProvider = registry.get("google");
    expect(googleProvider.name).toBe("google");

    const groqProvider = registry.get("groq");
    expect(groqProvider.name).toBe("groq");
  });
});
