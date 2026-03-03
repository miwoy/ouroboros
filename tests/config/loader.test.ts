import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../../src/config/loader.js";
import { ConfigError } from "../../src/errors/index.js";

const TEST_DIR = join(process.cwd(), ".test-config-tmp");

describe("loadConfig", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    // 清除可能设置的环境变量
    delete process.env.TEST_API_KEY;
  });

  /** 创建测试配置文件 */
  async function writeTestConfig(content: unknown, filename = "config.json"): Promise<string> {
    const filePath = join(TEST_DIR, filename);
    await writeFile(filePath, JSON.stringify(content, null, 2));
    return filePath;
  }

  it("应该成功加载有效配置文件", async () => {
    const path = await writeTestConfig({
      system: {},
      provider: { test: { type: "openai", apiKey: "sk-xxx" } },
      agents: { default: { model: "test/gpt-4o" } },
    });

    const { config } = await loadConfig(path);
    expect(config.provider.test.apiKey).toBe("sk-xxx");
    expect(config.agents.default.model).toBe("test/gpt-4o");
  });

  it("应该替换环境变量", async () => {
    process.env.TEST_API_KEY = "sk-from-env";
    const path = await writeTestConfig({
      system: {},
      provider: { test: { type: "openai", apiKey: "${TEST_API_KEY}" } },
      agents: { default: { model: "test/gpt-4o" } },
    });

    const { config } = await loadConfig(path);
    expect(config.provider.test.apiKey).toBe("sk-from-env");
  });

  it("环境变量未设置时应保留原始字符串", async () => {
    delete process.env.NONEXISTENT_VAR;
    const path = await writeTestConfig({
      system: {},
      provider: { test: { type: "openai", apiKey: "${NONEXISTENT_VAR}" } },
      agents: { default: { model: "test/gpt-4o" } },
    });

    const { config } = await loadConfig(path);
    expect(config.provider.test.apiKey).toBe("${NONEXISTENT_VAR}");
  });

  it("应该在文件不存在时抛出 ConfigError", async () => {
    await expect(loadConfig("/nonexistent/path/config.json")).rejects.toThrow(ConfigError);
    await expect(loadConfig("/nonexistent/path/config.json")).rejects.toThrow("无法读取");
  });

  it("应该在 JSON 格式错误时抛出 ConfigError", async () => {
    const filePath = join(TEST_DIR, "bad.json");
    await writeFile(filePath, "{ invalid json }");
    await expect(loadConfig(filePath)).rejects.toThrow(ConfigError);
    await expect(loadConfig(filePath)).rejects.toThrow("JSON 格式错误");
  });

  it("应该在验证失败时抛出 ConfigError（含详细信息）", async () => {
    const path = await writeTestConfig({
      system: {},
      provider: {},
      agents: {},
    });

    await expect(loadConfig(path)).rejects.toThrow(ConfigError);
  });

  it("应该在 agent model 引用不存在的提供商时抛出 ConfigError", async () => {
    const path = await writeTestConfig({
      system: {},
      provider: { test: { type: "openai", apiKey: "sk-xxx" } },
      agents: { default: { model: "nonexistent/gpt-4o" } },
    });

    await expect(loadConfig(path)).rejects.toThrow(ConfigError);
    await expect(loadConfig(path)).rejects.toThrow("nonexistent");
  });

  it("返回的配置应该是冻结的（不可变）", async () => {
    const path = await writeTestConfig({
      system: {},
      provider: { test: { type: "openai", apiKey: "sk-xxx" } },
      agents: { default: { model: "test/gpt-4o" } },
    });

    const { config } = await loadConfig(path);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("应该正确填充默认值", async () => {
    const path = await writeTestConfig({
      system: {},
      provider: { test: { type: "openai", apiKey: "sk-xxx" } },
      agents: { default: { model: "test/gpt-4o" } },
    });

    const { config } = await loadConfig(path);
    expect(config.system.logLevel).toBe("info");
    expect(config.system.model.timeout).toBe(30000);
    expect(config.system.model.maxRetries).toBe(3);
  });

  it("应该自动迁移 v1 格式的配置", async () => {
    const path = await writeTestConfig({
      system: {},
      providers: { test: { type: "openai", apiKey: "sk-v1" } },
      agents: { default: { model: "test/gpt-4o" } },
      model: { timeout: 60000 },
    });

    const { config } = await loadConfig(path);
    // v1 的 providers 应该迁移为 provider
    expect(config.provider.test.apiKey).toBe("sk-v1");
    // v1 的 model 应该迁移到 system.model
    expect(config.system.model.timeout).toBe(60000);
  });
});
