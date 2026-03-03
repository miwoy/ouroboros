import { describe, it, expect } from "vitest";
import { configSchema, parseModelRef, extractAvailableModels } from "../../src/config/schema.js";

describe("configSchema", () => {
  // 最小有效配置（v2 结构：provider(单数) + agents 在根级别）
  const validConfig = {
    system: {},
    provider: {
      test: {
        type: "openai",
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
      expect(result.data.system.model.timeout).toBe(30000);
      expect(result.data.system.model.maxRetries).toBe(3);
      expect(result.data.system.model.retryBaseDelay).toBe(1000);
    }
  });

  it("应该接受完整配置", () => {
    const fullConfig = {
      system: {
        logLevel: "debug",
        model: {
          timeout: 60000,
          maxRetries: 5,
          retryBaseDelay: 2000,
        },
      },
      provider: {
        anthropic: {
          type: "anthropic",
          apiKey: "sk-ant-xxx",
          baseUrl: "https://api.anthropic.com",
          defaultModel: "claude-sonnet-4-20250514",
        },
        openai: {
          type: "openai",
          apiKey: "sk-xxx",
          defaultModel: "gpt-4o",
        },
      },
      agents: {
        default: {
          model: "anthropic/claude-sonnet-4-20250514",
          workspacePath: "/tmp/ws",
          maxTurns: 100,
          thinkLevel: "high" as const,
        },
      },
    };
    const result = configSchema.safeParse(fullConfig);
    expect(result.success).toBe(true);
  });

  it("应该拒绝提供商缺少 api 和 type 字段", () => {
    const result = configSchema.safeParse({
      system: {},
      provider: {
        test: { apiKey: "key" },
      },
      agents: { default: { model: "test/gpt-4o" } },
    });
    expect(result.success).toBe(false);
  });

  it("应该拒绝缺少 agents.default 的配置", () => {
    const result = configSchema.safeParse({
      system: {},
      provider: { test: { type: "openai", apiKey: "key" } },
      agents: {},
    });
    expect(result.success).toBe(false);
  });

  it("应该拒绝空 apiKey", () => {
    const config = {
      system: {},
      provider: { test: { type: "openai", apiKey: "" } },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝无效的 logLevel", () => {
    const config = {
      system: { logLevel: "verbose" },
      provider: { test: { type: "openai", apiKey: "key" } },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该拒绝超出范围的 maxRetries", () => {
    const config = {
      system: {
        model: { maxRetries: 15 },
      },
      provider: { test: { type: "openai", apiKey: "key" } },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("应该接受包含 models 列表的提供商配置", () => {
    const config = {
      system: {},
      provider: {
        test: {
          type: "openai",
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
      expect(result.data.provider.test.models).toEqual(["gpt-4o", "gpt-4o-mini", "gpt-4.1"]);
    }
  });

  it("应该拒绝 models 中的空字符串", () => {
    const config = {
      system: {},
      provider: {
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
      provider: {
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
      provider: {
        openai: { type: "openai", apiKey: "key", models: ["gpt-4o"] },
        ollama: { type: "openai-compatible", apiKey: "ollama", models: ["llama3"] },
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
      provider: {
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
      provider: {
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
      provider: {
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
      provider: {
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
      provider: {
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

  it("应该接受任意类型无 apiKey（v2 中 apiKey 对所有类型可选）", () => {
    const config = {
      system: {},
      provider: {
        test: { type: "openai" },
      },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受 OAuth 类型带有 apiKey（也支持 API Key 模式）", () => {
    const config = {
      system: {},
      provider: {
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

  it("应该接受使用 api 字段的提供商配置", () => {
    const config = {
      system: {},
      provider: {
        test: {
          api: "openai-completions" as const,
          apiKey: "sk-test",
          defaultModel: "gpt-4o",
        },
      },
      agents: { default: { model: "test/gpt-4o" } },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("应该接受增强的模型定义格式", () => {
    const config = {
      system: {},
      provider: {
        test: {
          type: "openai",
          apiKey: "sk-test",
          models: [
            {
              id: "gpt-4o",
              name: "GPT-4o",
              reasoning: false,
              input: ["text", "image"],
              cost: { input: 2.5, output: 10 },
              contextWindow: 128000,
              maxTokens: 16384,
            },
          ],
        },
      },
      agents: { default: { model: "test/gpt-4o" } },
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
  it("应该从 provider 提取所有可用模型", () => {
    const providers = {
      openai: {
        type: "openai",
        apiKey: "key",
        models: ["gpt-4o", "gpt-4o-mini"],
      },
      ollama: {
        type: "openai-compatible",
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
        type: "openai",
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
        type: "openai",
        apiKey: "key",
      },
    };
    const models = extractAvailableModels(providers);
    expect(models).toEqual([]);
  });
});
