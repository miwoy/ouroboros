import { describe, it, expect, vi } from "vitest";
import {
  stepSelectMode,
  stepSelectProvider,
  stepSelectModel,
  stepAdvancedConfig,
  buildConfigObject,
  PROVIDER_OPTIONS,
  type InitWizardData,
  type InstallMode,
} from "../../src/cli/commands/init-steps.js";

/** 创建模拟 ask 函数，按顺序返回预设答案 */
function mockAsk(...answers: string[]): (q: string) => Promise<string> {
  let idx = 0;
  return async (_q: string) => {
    const answer = answers[idx] ?? "";
    idx++;
    return answer;
  };
}

describe("stepSelectMode", () => {
  it("默认选择 quickstart", async () => {
    const ask = mockAsk("");
    const result = await stepSelectMode(ask);
    expect(result).toBe("quickstart");
  });

  it("输入 1 选择 quickstart", async () => {
    const ask = mockAsk("1");
    const result = await stepSelectMode(ask);
    expect(result).toBe("quickstart");
  });

  it("输入 2 选择 advanced", async () => {
    const ask = mockAsk("2");
    const result = await stepSelectMode(ask);
    expect(result).toBe("advanced");
  });

  it("无效输入默认 quickstart", async () => {
    const ask = mockAsk("abc");
    const result = await stepSelectMode(ask);
    expect(result).toBe("quickstart");
  });
});

describe("stepSelectProvider", () => {
  it("选择第一个提供商", async () => {
    const ask = mockAsk("1");
    const result = await stepSelectProvider(ask);
    expect(result).toBe(PROVIDER_OPTIONS[0]);
  });

  it("选择最后一个提供商", async () => {
    const ask = mockAsk(String(PROVIDER_OPTIONS.length));
    const result = await stepSelectProvider(ask);
    expect(result).toBe(PROVIDER_OPTIONS[PROVIDER_OPTIONS.length - 1]);
  });

  it("无效选择使用默认", async () => {
    const ask = mockAsk("999");
    const result = await stepSelectProvider(ask);
    expect(result).toBe(PROVIDER_OPTIONS[0]);
  });

  it("非数字输入使用默认", async () => {
    const ask = mockAsk("abc");
    const result = await stepSelectProvider(ask);
    expect(result).toBe(PROVIDER_OPTIONS[0]);
  });
});

describe("stepSelectModel", () => {
  const models = ["model-a", "model-b", "model-c"];

  it("默认选择默认模型", async () => {
    const ask = mockAsk("");
    const result = await stepSelectModel(ask, models, "model-a");
    expect(result).toBe("model-a");
  });

  it("选择第二个模型", async () => {
    const ask = mockAsk("2");
    const result = await stepSelectModel(ask, models, "model-a");
    expect(result).toBe("model-b");
  });

  it("无效选择使用默认", async () => {
    const ask = mockAsk("999");
    const result = await stepSelectModel(ask, models, "model-a");
    expect(result).toBe("model-a");
  });
});

describe("stepAdvancedConfig", () => {
  it("全部留空返回 undefined", async () => {
    const ask = mockAsk("", "", "");
    const result = await stepAdvancedConfig(ask);
    expect(result.proxy).toBeUndefined();
    expect(result.apiPort).toBeUndefined();
    expect(result.logLevel).toBeUndefined();
  });

  it("填写有效值", async () => {
    const ask = mockAsk("http://proxy:8080", "8080", "debug");
    const result = await stepAdvancedConfig(ask);
    expect(result.proxy).toBe("http://proxy:8080");
    expect(result.apiPort).toBe(8080);
    expect(result.logLevel).toBe("debug");
  });

  it("无效端口和日志级别返回 undefined", async () => {
    const ask = mockAsk("", "abc", "invalid");
    const result = await stepAdvancedConfig(ask);
    expect(result.apiPort).toBeUndefined();
    expect(result.logLevel).toBeUndefined();
  });

  it("超出范围的端口返回 undefined", async () => {
    const ask = mockAsk("", "99999", "");
    const result = await stepAdvancedConfig(ask);
    expect(result.apiPort).toBeUndefined();
  });
});

describe("buildConfigObject", () => {
  const baseData: InitWizardData = {
    mode: "quickstart" as InstallMode,
    provider: PROVIDER_OPTIONS[5], // OpenAI API Key
    providerName: "openai",
    apiKey: "sk-test-key",
    selectedModel: "gpt-4o",
  };

  it("应生成正确的配置结构", () => {
    const config = buildConfigObject(baseData);

    expect(config).toHaveProperty("system");
    expect(config).toHaveProperty("providers");
    expect(config).toHaveProperty("agents");

    const providers = config.providers as Record<string, Record<string, unknown>>;
    expect(providers.openai.type).toBe("openai");
    expect(providers.openai.apiKey).toBe("sk-test-key");

    const agents = config.agents as Record<string, Record<string, unknown>>;
    expect(agents.default.model).toBe("openai/gpt-4o");
  });

  it("无 apiKey 时提供商配置中不包含 apiKey", () => {
    const data: InitWizardData = {
      ...baseData,
      apiKey: undefined,
      provider: PROVIDER_OPTIONS[0], // OAuth 类型
      providerName: "openai-codex",
    };
    const config = buildConfigObject(data);
    const providers = config.providers as Record<string, Record<string, unknown>>;
    expect(providers["openai-codex"].apiKey).toBeUndefined();
  });

  it("Advanced 模式包含额外配置", () => {
    const data: InitWizardData = {
      ...baseData,
      mode: "advanced",
      proxy: "http://proxy:8080",
      apiPort: 8080,
      logLevel: "debug",
    };
    const config = buildConfigObject(data);

    const system = config.system as Record<string, unknown>;
    expect(system.proxy).toBe("http://proxy:8080");
    expect(system.logLevel).toBe("debug");

    const api = config.api as Record<string, unknown>;
    expect(api.port).toBe(8080);
  });

  it("QuickStart 模式不包含 api 块", () => {
    const config = buildConfigObject(baseData);
    expect(config.api).toBeUndefined();
  });

  it("本地提供商包含 baseUrl", () => {
    const data: InitWizardData = {
      ...baseData,
      provider: PROVIDER_OPTIONS[8], // Ollama
      providerName: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "ollama",
      selectedModel: "llama3",
    };
    const config = buildConfigObject(data);
    const providers = config.providers as Record<string, Record<string, unknown>>;
    expect(providers["openai-compatible"].baseUrl).toBe("http://localhost:11434/v1");
  });
});

describe("PROVIDER_OPTIONS", () => {
  it("应至少有 9 个提供商选项", () => {
    expect(PROVIDER_OPTIONS.length).toBeGreaterThanOrEqual(9);
  });

  it("每个选项都有必需字段", () => {
    for (const opt of PROVIDER_OPTIONS) {
      expect(opt.label).toBeTruthy();
      expect(opt.type).toBeTruthy();
      expect(["oauth", "apikey", "local"]).toContain(opt.auth);
      expect(opt.api).toBeTruthy();
      expect(opt.defaultModel).toBeTruthy();
      expect(opt.models.length).toBeGreaterThan(0);
    }
  });

  it("OAuth 提供商都有 oauthId", () => {
    const oauthProviders = PROVIDER_OPTIONS.filter((p) => p.auth === "oauth");
    for (const p of oauthProviders) {
      expect(p.oauthId).toBeTruthy();
    }
  });

  it("本地提供商有默认 baseUrl", () => {
    const localProviders = PROVIDER_OPTIONS.filter((p) => p.auth === "local");
    for (const p of localProviders) {
      expect(p.baseUrl).toBeTruthy();
    }
  });
});
