/**
 * 自我图式提供者测试
 */

import { describe, it, expect } from "vitest";
import { createSchemaProvider } from "../../src/schema/schema-provider.js";

describe("createSchemaProvider", () => {
  it("应返回完整的模板变量", () => {
    const provider = createSchemaProvider("/tmp/workspace");
    const vars = provider.getVariables();

    expect(vars.platform).toBeTruthy();
    expect(vars.availableMemory).toContain("GB");
    expect(vars.workspacePath).toBe("/tmp/workspace");
    expect(vars.gpu).toBeTruthy();
    expect(vars.currentDateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    expect(vars.focusLevel).toBeTruthy();
    expect(vars.cautionLevel).toBeTruthy();
    expect(vars.creativityLevel).toBeTruthy();
  });

  it("应使用自定义激素默认值", () => {
    const provider = createSchemaProvider("/tmp/workspace", {
      hormoneDefaults: { focusLevel: 90, cautionLevel: 10, creativityLevel: 80 },
    });
    const vars = provider.getVariables();

    expect(vars.focusLevel).toBe("90");
    expect(vars.cautionLevel).toBe("10");
    expect(vars.creativityLevel).toBe("80");
  });

  it("getBodySchema 应返回身体图式", () => {
    const provider = createSchemaProvider("/tmp/workspace");
    const body = provider.getBodySchema();

    expect(body.platform).toBeTruthy();
    expect(body.cpuCores).toBeGreaterThan(0);
  });

  it("getSoulSchema 应返回灵魂图式", () => {
    const provider = createSchemaProvider("/tmp/workspace");
    const soul = provider.getSoulSchema();

    expect(soul.worldModel.rules.length).toBeGreaterThan(0);
    expect(soul.selfAwareness.identity).toBeTruthy();
  });

  it("getHormoneManager 应返回激素管理器", () => {
    const provider = createSchemaProvider("/tmp/workspace");
    const manager = provider.getHormoneManager();

    expect(manager.getState().focusLevel).toBe(60);
    manager.adjustFocus(10);
    expect(manager.getState().focusLevel).toBe(70);

    // 变量应反映更新
    const vars = provider.getVariables();
    expect(vars.focusLevel).toBe("70");
  });

  it("refresh 应更新身体图式", async () => {
    const provider = createSchemaProvider("/tmp/workspace");
    await expect(provider.refresh()).resolves.toBeUndefined();
  });
});
