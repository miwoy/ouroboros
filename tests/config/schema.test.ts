import { describe, it, expect } from "vitest";
import { configSchema } from "../../src/config/schema.js";

describe("configSchema", () => {
  // 最小有效配置
  const validConfig = {
    system: {},
    model: {
      defaultProvider: "test",
      providers: {
        test: {
          type: "openai" as const,
          apiKey: "sk-test-key",
        },
      },
    },
  };

  it("应该通过最小有效配置的验证", () => {
    const result = configSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("应该填充默认值", () => {
    const result = configSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.system.logLevel).toBe("info");
      expect(result.data.system.workspacePath).toBe("./workspace");
      expect(result.data.model.timeout).toBe(30000);
      expect(result.data.model.maxRetries).toBe(3);
      expect(result.data.model.retryBaseDelay).toBe(1000);
    }
  });

  it("应该接受完整配置", () => {
    const fullConfig = {
      system: { logLevel: "debug", workspacePath: "/tmp/ws" },
      model: {
        defaultProvider: "anthropic",
        timeout: 60000,
        maxRetries: 5,
        retryBaseDelay: 2000,
        providers: {
          anthropic: {
            type: "anthropic" as const,
            apiKey: "sk-ant-xxx",
            baseUrl: "https://api.anthropic.com",
            defaultModel: "claude-sonnet-4-20250514",
          },
          openai: {
            type: "openai" as const,
            apiKey: "sk-xxx",
            defaultModel: "gpt-4o",
          },
        },
      },
    };
    const result = configSchema.safeParse(fullConfig);
    expect(result.success).toBe(true);
  });

  it("应该拒绝缺少 model 字段的配置", () => {
    const result = configSchema.safeParse({ system: {} });
    expect(result.success).toBe(false);
  });

  it("应该拒绝空 apiKey", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "test",
        providers: { test: { type: "openai", apiKey: "" } },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝无效的 logLevel", () => {
    const config = {
      system: { logLevel: "verbose" },
      model: {
        defaultProvider: "test",
        providers: { test: { type: "openai", apiKey: "key" } },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝无效的提供商类型", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "test",
        providers: { test: { type: "invalid-type", apiKey: "key" } },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝超出范围的 maxRetries", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "test",
        maxRetries: 15,
        providers: { test: { type: "openai", apiKey: "key" } },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该接受包含 models 列表的提供商配置", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "test",
        providers: {
          test: {
            type: "openai" as const,
            apiKey: "sk-test",
            defaultModel: "gpt-4o",
            models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
          },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model.providers.test.models).toEqual(["gpt-4o", "gpt-4o-mini", "gpt-4.1"]);
    }
  });

  it("应该拒绝 models 中的空字符串", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "test",
        providers: {
          test: { type: "openai", apiKey: "key", models: ["gpt-4o", ""] },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝无效的 baseUrl", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "test",
        providers: {
          test: { type: "openai", apiKey: "key", baseUrl: "not-a-url" },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  // ─── OAuth 提供商类型测试 ──────────────────────────

  it("应该接受 openai-codex 类型且无 apiKey", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "codex",
        providers: {
          codex: {
            type: "openai-codex",
            defaultModel: "gpt-5.3-codex",
          },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受 github-copilot 类型且无 apiKey", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "copilot",
        providers: {
          copilot: {
            type: "github-copilot",
            defaultModel: "gpt-4o",
          },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受 anthropic 类型且无 apiKey（OAuth 模式）", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "ant",
        providers: {
          ant: {
            type: "anthropic",
          },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受 google-gemini-cli 类型且无 apiKey", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "gemini",
        providers: {
          gemini: {
            type: "google-gemini-cli",
            defaultModel: "gemini-2.5-flash",
          },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受 google-antigravity 类型且无 apiKey", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "ag",
        providers: {
          ag: {
            type: "google-antigravity",
          },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该拒绝非 OAuth 类型缺少 apiKey（openai）", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "test",
        providers: {
          test: { type: "openai" },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝非 OAuth 类型缺少 apiKey（google）", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "test",
        providers: {
          test: { type: "google" },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该接受 OAuth 类型带有 apiKey（也支持 API Key 模式）", () => {
    const config = {
      system: {},
      model: {
        defaultProvider: "codex",
        providers: {
          codex: {
            type: "openai-codex",
            apiKey: "sk-explicit-key",
            defaultModel: "gpt-5.3-codex",
          },
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
