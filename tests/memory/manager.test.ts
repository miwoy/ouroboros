/**
 * 记忆管理器测试
 *
 * 统一管理四层记忆
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryManager } from "../../src/memory/manager.js";

describe("createMemoryManager", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mem-mgr-"));
    await mkdir(join(tmpDir, "prompts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("应创建包含四层记忆的管理器", () => {
    const mgr = createMemoryManager(tmpDir);
    expect(mgr.hot).toBeDefined();
    expect(mgr.cold).toBeDefined();
    expect(mgr.shortTerm).toBeDefined();
    expect(mgr.longTerm).toBeDefined();
  });

  it("应使用默认配置", () => {
    const mgr = createMemoryManager(tmpDir);
    expect(mgr.config.shortTerm).toBe(true);
    expect(mgr.config.longTerm).toBe(true);
    expect(mgr.config.hotSessionMaxTokens).toBe(4000);
  });

  it("应支持自定义配置", () => {
    const mgr = createMemoryManager(tmpDir, {
      shortTerm: false,
      hotSessionMaxTokens: 8000,
    });
    expect(mgr.config.shortTerm).toBe(false);
    expect(mgr.config.longTerm).toBe(true); // 默认值
    expect(mgr.config.hotSessionMaxTokens).toBe(8000);
  });

  it("cleanup 应清理 hot 和 cold 记忆", async () => {
    const mgr = createMemoryManager(tmpDir);

    // 添加 hot 记忆
    mgr.hot.add({
      timestamp: "2026-03-02T10:00:00",
      type: "observation",
      content: "测试",
    });
    expect(mgr.hot.getEntries()).toHaveLength(1);

    // 添加 cold 记忆
    await mgr.cold.cache("step-1", "缓存内容");
    const cached = await mgr.cold.load("step-1");
    expect(cached).toBe("缓存内容");

    // 执行 cleanup
    await mgr.cleanup();

    // hot 应被清空
    expect(mgr.hot.getEntries()).toEqual([]);

    // cold 应被清理
    const afterCleanup = await mgr.cold.load("step-1");
    expect(afterCleanup).toBeNull();
  });

  it("四层记忆应独立工作", async () => {
    const mgr = createMemoryManager(tmpDir);

    // hot
    mgr.hot.add({
      timestamp: "2026-03-02T10:00:00",
      type: "observation",
      content: "hot 记忆",
    });

    // cold
    await mgr.cold.cache("s1", "cold 数据");

    // shortTerm
    await mgr.shortTerm.append({
      timestamp: "2026-03-02T10:00:00",
      type: "conversation",
      content: "短期记忆",
    });

    // longTerm
    await mgr.longTerm.appendKnowledge("长期知识");

    // 各层独立验证
    expect(mgr.hot.getEntries()).toHaveLength(1);
    expect(await mgr.cold.load("s1")).toBe("cold 数据");
    expect(await mgr.shortTerm.loadByDate("2026-03-02")).toHaveLength(1);
    expect(await mgr.longTerm.load()).toContain("长期知识");
  });
});
