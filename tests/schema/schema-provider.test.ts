/**
 * 自我图式提供者测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSchemaProvider } from "../../src/schema/schema-provider.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "schema-provider-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("createSchemaProvider", () => {
  it("应返回 8 个动态模板变量", async () => {
    const provider = await createSchemaProvider(tempDir);
    const vars = provider.getVariables();

    // Body 变量
    expect(vars.platform).toBeTruthy();
    expect(vars.availableMemory).toContain("GB");
    expect(vars.workspacePath).toBe(tempDir);
    expect(vars.gpu).toBeTruthy();
    expect(vars.currentDateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

    // Hormones 变量
    expect(vars.focusLevel).toBeTruthy();
    expect(vars.cautionLevel).toBeTruthy();
    expect(vars.creativityLevel).toBeTruthy();

    // 不应存在 soul 变量
    expect(vars).not.toHaveProperty("worldModel");
    expect(vars).not.toHaveProperty("selfAwareness");
    expect(vars).not.toHaveProperty("userModel");
  });

  it("应使用自定义激素默认值", async () => {
    const provider = await createSchemaProvider(tempDir, {
      hormoneDefaults: { focusLevel: 90, cautionLevel: 10, creativityLevel: 80 },
    });
    const vars = provider.getVariables();

    expect(vars.focusLevel).toBe("90");
    expect(vars.cautionLevel).toBe("10");
    expect(vars.creativityLevel).toBe("80");
  });

  it("getBodySchema 应返回身体图式", async () => {
    const provider = await createSchemaProvider(tempDir);
    const body = provider.getBodySchema();

    expect(body.platform).toBeTruthy();
    expect(body.cpuCores).toBeGreaterThan(0);
  });

  it("getHormoneManager 应返回激素管理器", async () => {
    const provider = await createSchemaProvider(tempDir);
    const manager = provider.getHormoneManager();

    expect(manager.getState().focusLevel).toBe(60);
    manager.adjustFocus(10);
    expect(manager.getState().focusLevel).toBe(70);

    // 变量应反映更新
    const vars = provider.getVariables();
    expect(vars.focusLevel).toBe("70");
  });

  it("refresh 应更新身体图式", async () => {
    const provider = await createSchemaProvider(tempDir);
    await expect(provider.refresh()).resolves.toBeUndefined();
  });

  it("不再提供 getSoulSchema 和 updateSoul 方法", async () => {
    const provider = await createSchemaProvider(tempDir);

    expect(provider).not.toHaveProperty("getSoulSchema");
    expect(provider).not.toHaveProperty("updateSoul");
  });
});
