import { describe, it, expect } from "vitest";
import { configSchema, parseModelRef, extractAvailableModels } from "../../src/config/schema.js";

describe("configSchema", () => {
  // 最小有效配置（新结构：providers + agents 在根级别）
  const validConfig = {
    system: {},
    providers: {
      test: {
        type: "openai" as const,
        apiKey: "sk-test-key",
        defaultModel: "gpt-4o",
      },
    },
    agents: {
      default: {
        model: "test/gpt-4o",
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
      expect(result.data.agents.default.workspacePath).toBe("./workspace");
      expect(result.data.model.timeout).toBe(30000);
      expect(result.data.model.maxRetries).toBe(3);
      expect(result.data.model.retryBaseDelay).toBe(1000);
    }
  });

  it("应该接受完整配置", () => {
    const fullConfig = {
      system: { logLevel: "debug" },
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
      agents: {
        default: {
          model: "anthropic/claude-sonnet-4-20250514",
          workspacePath: "/tmp/ws",
          maxTurns: 100,
          think: true,
          thinkLevel: "high" as const,
        },
      },
      model: {
        timeout: 60000,
        maxRetries: 5,
        retryBaseDelay: 2000,
      },
    };
    const result = configSchema.safeParse(fullConfig);
    expect(result.success).toBe(true);
  });

  it("应该拒绝缺少 providers 字段的配置", () => {
    const result = configSchema.safeParse({
      system: {},
      agents: { default: { model: "test/gpt-4o" } },
    });
    expect(result.success).toBe(false);
  });

  it("应该拒绝缺少 agents.default 的配置", () => {
    const result = configSchema.safeParse({
      system: {},
      providers: { test: { type: "openai", apiKey: "key" } },
      agents: {},
    });
    expect(result.success).toBe(false);
  });

  it("应该拒绝空 apiKey", () => {
    const config = {
      system: {},
      providers: { test: { type: "openai", apiKey: "" } },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝无效的 logLevel", () => {
    const config = {
      system: { logLevel: "verbose" },
      providers: { test: { type: "openai", apiKey: "key" } },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝无效的提供商类型", () => {
    const config = {
      system: {},
      providers: { test: { type: "invalid-type", apiKey: "key" } },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝超出范围的 maxRetries", () => {
    const config = {
      system: {},
      providers: { test: { type: "openai", apiKey: "key" } },
      agents: { default: { model: "test/gpt-4o" } },
      model: { maxRetries: 15 },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该接受包含 models 列表的提供商配置", () => {
    const config = {
      system: {},
      providers: {
        test: {
          type: "openai" as const,
          apiKey: "sk-test",
          defaultModel: "gpt-4o",
          models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
        },
      },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providers.test.models).toEqual(["gpt-4o", "gpt-4o-mini", "gpt-4.1"]);
    }
  });

  it("应该拒绝 models 中的空字符串", () => {
    const config = {
      system: {},
      providers: {
        test: { type: "openai", apiKey: "key", models: ["gpt-4o", ""] },
      },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝无效的 baseUrl", () => {
    const config = {
      system: {},
      providers: {
        test: { type: "openai", apiKey: "key", baseUrl: "not-a-url" },
      },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该支持多个 Agent 配置", () => {
    const config = {
      system: {},
      providers: {
        openai: { type: "openai" as const, apiKey: "key", models: ["gpt-4o"] },
        ollama: { type: "openai-compatible" as const, apiKey: "ollama", models: ["llama3"] },
      },
      agents: {
        default: { model: "openai/gpt-4o" },
        coder: { model: "ollama/llama3", workspacePath: "/tmp/coder" },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents.coder.workspacePath).toBe("/tmp/coder");
      expect(result.data.agents.coder.model).toBe("ollama/llama3");
    }
  });

  // ─── OAuth 提供商类型测试 ──────────────────────────

  it("应该接受 openai-codex 类型且无 apiKey", () => {
    const config = {
      system: {},
      providers: {
        codex: {
          type: "openai-codex",
          defaultModel: "gpt-5.3-codex",
        },
      },
      agents: { default: { model: "codex/gpt-5.3-codex" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受 github-copilot 类型且无 apiKey", () => {
    const config = {
      system: {},
      providers: {
        copilot: {
          type: "github-copilot",
          defaultModel: "gpt-4o",
        },
      },
      agents: { default: { model: "copilot/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受 anthropic 类型且无 apiKey（OAuth 模式）", () => {
    const config = {
      system: {},
      providers: {
        ant: {
          type: "anthropic",
          defaultModel: "claude-sonnet-4-20250514",
        },
      },
      agents: { default: { model: "ant/claude-sonnet-4-20250514" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受 google-gemini-cli 类型且无 apiKey", () => {
    const config = {
      system: {},
      providers: {
        gemini: {
          type: "google-gemini-cli",
          defaultModel: "gemini-2.5-flash",
        },
      },
      agents: { default: { model: "gemini/gemini-2.5-flash" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受 google-antigravity 类型且无 apiKey", () => {
    const config = {
      system: {},
      providers: {
        ag: {
          type: "google-antigravity",
          defaultModel: "gemini-2.5-pro",
        },
      },
      agents: { default: { model: "ag/gemini-2.5-pro" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该拒绝非 OAuth 类型缺少 apiKey（openai）", () => {
    const config = {
      system: {},
      providers: {
        test: { type: "openai" },
      },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝非 OAuth 类型缺少 apiKey（google）", () => {
    const config = {
      system: {},
      providers: {
        test: { type: "google" },
      },
      agents: { default: { model: "test/gemini" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该接受 OAuth 类型带有 apiKey（也支持 API Key 模式）", () => {
    const config = {
      system: {},
      providers: {
        codex: {
          type: "openai-codex",
          apiKey: "sk-explicit-key",
          defaultModel: "gpt-5.3-codex",
        },
      },
      agents: { default: { model: "codex/gpt-5.3-codex" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

// ─── 辅助函数测试 ──────────────────────────

describe("parseModelRef", () => {
  it("应该解析有效的 provider/model 格式", () => {
    const result = parseModelRef("ollama/llama3");
    expect(result).toEqual({ provider: "ollama", model: "llama3" });
  });

  it("应该处理包含冒号的模型名称（如 ollama 模型）", () => {
    const result = parseModelRef("ollama/qwen3.5:27b-q4_K_M");
    expect(result).toEqual({ provider: "ollama", model: "qwen3.5:27b-q4_K_M" });
  });

  it("应该返回 null — 无斜杠", () => {
    expect(parseModelRef("no-slash")).toBeNull();
  });

  it("应该返回 null — 斜杠在开头", () => {
    expect(parseModelRef("/model")).toBeNull();
  });

  it("应该返回 null — 斜杠在末尾", () => {
    expect(parseModelRef("provider/")).toBeNull();
  });
});

describe("extractAvailableModels", () => {
  it("应该从 providers 提取所有可用模型", () => {
    const providers = {
      openai: {
        type: "openai" as const,
        apiKey: "key",
        models: ["gpt-4o", "gpt-4o-mini"],
      },
      ollama: {
        type: "openai-compatible" as const,
        apiKey: "ollama",
        models: ["llama3"],
      },
    };
    const models = extractAvailableModels(providers);
    expect(models).toEqual([
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "ollama/llama3",
    ]);
  });

  it("应该在没有 models 时回退到 defaultModel", () => {
    const providers = {
      test: {
        type: "openai" as const,
        apiKey: "key",
        defaultModel: "gpt-4o",
      },
    };
    const models = extractAvailableModels(providers);
    expect(models).toEqual(["test/gpt-4o"]);
  });

  it("应该跳过无 models 也无 defaultModel 的提供商", () => {
    const providers = {
      test: {
        type: "openai" as const,
        apiKey: "key",
      },
    };
    const models = extractAvailableModels(providers);
    expect(models).toEqual([]);
  });
});
