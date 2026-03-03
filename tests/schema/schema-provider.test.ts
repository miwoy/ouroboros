/**
 * 自我图式提供者测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSchemaProvider } from "../../src/schema/schema-provider.js";
import { mkdtemp, rm, readFile } from "node:fs/promises";
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
  it("应返回完整的模板变量（含 soul 变量）", async () => {
    const provider = await createSchemaProvider(tempDir);
    const vars = provider.getVariables();

    expect(vars.platform).toBeTruthy();
    expect(vars.availableMemory).toContain("GB");
    expect(vars.workspacePath).toBe(tempDir);
    expect(vars.gpu).toBeTruthy();
    expect(vars.currentDateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    expect(vars.focusLevel).toBeTruthy();
    expect(vars.cautionLevel).toBeTruthy();
    expect(vars.creativityLevel).toBeTruthy();
    // soul 变量
    expect(vars.worldModel).toContain("自我指涉");
    expect(vars.selfAwareness).toContain("Identity");
    expect(vars.userModel).toBe("Not yet known.");
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

  it("getSoulSchema 应返回灵魂图式", async () => {
    const provider = await createSchemaProvider(tempDir);
    const soul = provider.getSoulSchema();

    expect(soul.worldModel.principles.length).toBe(5);
    expect(soul.selfAwareness.identity).toBeTruthy();
    expect(soul.selfAwareness.name).toBe("");
    expect(soul.userModel.name).toBe("");
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

  it("updateSoul 应更新灵魂图式并持久化", async () => {
    const provider = await createSchemaProvider(tempDir);

    await provider.updateSoul({
      selfAwareness: { name: "小助手" },
      userModel: { name: "张三", preferences: ["简洁"] },
    });

    // 内存态更新
    const soul = provider.getSoulSchema();
    expect(soul.selfAwareness.name).toBe("小助手");
    expect(soul.userModel.name).toBe("张三");
    expect(soul.userModel.preferences).toEqual(["简洁"]);

    // 变量更新
    const vars = provider.getVariables();
    expect(vars.selfAwareness).toContain("**Name**: 小助手");
    expect(vars.userModel).toContain("**Name**: 张三");

    // 持久化验证
    const raw = await readFile(join(tempDir, "schema", "soul.json"), "utf-8");
    const persisted = JSON.parse(raw);
    expect(persisted.selfAwareness.name).toBe("小助手");
    expect(persisted.userModel.name).toBe("张三");
  });

  it("updateSoul 应只更新指定字段，保留其他字段", async () => {
    const provider = await createSchemaProvider(tempDir);

    // 第一次更新 name
    await provider.updateSoul({ selfAwareness: { name: "小明" } });
    expect(provider.getSoulSchema().selfAwareness.name).toBe("小明");

    // 第二次更新 purpose，name 应保留
    await provider.updateSoul({ selfAwareness: { purpose: "帮助用户" } });
    const soul = provider.getSoulSchema();
    expect(soul.selfAwareness.name).toBe("小明");
    expect(soul.selfAwareness.purpose).toBe("帮助用户");
  });

  it("重新创建 provider 应从 soul.json 加载持久化数据", async () => {
    const provider1 = await createSchemaProvider(tempDir);
    await provider1.updateSoul({
      selfAwareness: { name: "持久化测试" },
      userModel: { name: "用户A" },
    });

    // 重新创建 provider
    const provider2 = await createSchemaProvider(tempDir);
    const soul = provider2.getSoulSchema();
    expect(soul.selfAwareness.name).toBe("持久化测试");
    expect(soul.userModel.name).toBe("用户A");
  });
});
