/**
 * config-writer 共享模块测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  PROVIDER_MODELS,
  selectModel,
  readExistingConfig,
  writeProviderConfig,
} from "../../src/cli/commands/config-writer.js";

// mock fs
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// mock readline
vi.mock("node:readline", () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (ans: string) => void) => cb("")),
    close: vi.fn(),
  })),
}));

describe("PROVIDER_MODELS", () => {
  it("包含所有 OAuth 提供商", () => {
    expect(PROVIDER_MODELS["openai-codex"]).toBeDefined();
    expect(PROVIDER_MODELS["github-copilot"]).toBeDefined();
    expect(PROVIDER_MODELS["anthropic"]).toBeDefined();
    expect(PROVIDER_MODELS["google-gemini-cli"]).toBeDefined();
    expect(PROVIDER_MODELS["google-antigravity"]).toBeDefined();
  });

  it("包含 API Key 提供商", () => {
    expect(PROVIDER_MODELS["openai"]).toBeDefined();
    expect(PROVIDER_MODELS["google"]).toBeDefined();
    expect(PROVIDER_MODELS["openai-compatible"]).toBeDefined();
  });

  it("每个提供商都有 models 和 defaultModel", () => {
    for (const [name, info] of Object.entries(PROVIDER_MODELS)) {
      expect(info.models.length, `${name} 应有模型列表`).toBeGreaterThan(0);
      expect(info.defaultModel, `${name} 应有默认模型`).toBeTruthy();
      expect(
        info.models.includes(info.defaultModel),
        `${name} 的 defaultModel 应在 models 列表中`,
      ).toBe(true);
    }
  });
});

describe("selectModel", () => {
  it("无输入时返回默认模型", async () => {
    const { createInterface } = await import("node:readline");
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn((_q: string, cb: (ans: string) => void) => cb("")),
      close: vi.fn(),
    } as any);

    const result = await selectModel(["model-a", "model-b"], "model-a");
    expect(result).toBe("model-a");
  });

  it("输入编号选择对应模型", async () => {
    const { createInterface } = await import("node:readline");
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn((_q: string, cb: (ans: string) => void) => cb("2")),
      close: vi.fn(),
    } as any);

    const result = await selectModel(["model-a", "model-b", "model-c"], "model-a");
    expect(result).toBe("model-b");
  });

  it("无效编号返回默认模型", async () => {
    const { createInterface } = await import("node:readline");
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn((_q: string, cb: (ans: string) => void) => cb("99")),
      close: vi.fn(),
    } as any);

    const result = await selectModel(["model-a", "model-b"], "model-a");
    expect(result).toBe("model-a");
  });
});

describe("readExistingConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("文件存在时返回解析后的对象", async () => {
    const mockConfig = { providers: {}, agents: { default: { model: "x/y" } } };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

    const result = await readExistingConfig("/tmp/config.json");
    expect(result).toEqual(mockConfig);
  });

  it("文件不存在时返回 null", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const result = await readExistingConfig("/tmp/nonexistent.json");
    expect(result).toBeNull();
  });
});

describe("writeProviderConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("无现有配置时创建新 config.json", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(writeFile).mockResolvedValue();

    await writeProviderConfig({
      providerName: "openai-codex",
      providerType: "openai-codex",
      selectedModel: "gpt-5.3-codex",
      models: ["gpt-5.3-codex", "gpt-5.2-codex"],
      configPath: "/tmp/config.json",
    });

    expect(writeFile).toHaveBeenCalledOnce();
    const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string);
    expect(written.providers["openai-codex"].type).toBe("openai-codex");
    expect(written.providers["openai-codex"].defaultModel).toBe("gpt-5.3-codex");
    expect(written.agents.default.model).toBe("openai-codex/gpt-5.3-codex");
  });

  it("有现有配置时合并", async () => {
    const existing = {
      system: { logLevel: "debug" },
      providers: {
        other: { type: "openai", apiKey: "sk-xxx" },
      },
      agents: {
        default: { model: "other/gpt-4o", workspacePath: "./ws" },
      },
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(existing));
    vi.mocked(writeFile).mockResolvedValue();

    await writeProviderConfig({
      providerName: "anthropic",
      providerType: "anthropic",
      selectedModel: "claude-sonnet-4-20250514",
      models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514"],
      configPath: "/tmp/config.json",
    });

    expect(writeFile).toHaveBeenCalledOnce();
    const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string);
    // 保留原有提供商
    expect(written.providers.other).toBeDefined();
    // 新增提供商
    expect(written.providers.anthropic.type).toBe("anthropic");
    // 默认 Agent 更新
    expect(written.agents.default.model).toBe("anthropic/claude-sonnet-4-20250514");
    // 保留原有 workspacePath
    expect(written.agents.default.workspacePath).toBe("./ws");
    // 保留系统配置
    expect(written.system.logLevel).toBe("debug");
  });

  it("包含 apiKey 和 baseUrl", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(writeFile).mockResolvedValue();

    await writeProviderConfig({
      providerName: "ollama",
      providerType: "openai-compatible",
      selectedModel: "llama3",
      models: ["llama3"],
      apiKey: "ollama",
      baseUrl: "http://localhost:11434/v1",
      configPath: "/tmp/config.json",
    });

    const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string);
    expect(written.providers.ollama.apiKey).toBe("ollama");
    expect(written.providers.ollama.baseUrl).toBe("http://localhost:11434/v1");
  });
});
