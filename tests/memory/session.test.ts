/**
 * Session 记忆测试
 *
 * Hot Memory（内存） + Cold Memory（临时文件）
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHotMemory, createColdMemory } from "../../src/memory/session.js";
import type { MemoryEntry } from "../../src/memory/types.js";

// ─── Hot Memory ──────────────────────────────────────────────────

describe("createHotMemory", () => {
  const entry = (content: string, type: MemoryEntry["type"] = "observation"): MemoryEntry => ({
    timestamp: "2026-03-02T10:00:00",
    type,
    content,
  });

  it("初始状态应为空", () => {
    const hot = createHotMemory();
    expect(hot.getEntries()).toEqual([]);
    expect(hot.estimateTokens()).toBe(0);
    expect(hot.toPromptText()).toBe("");
  });

  it("应添加条目并保留", () => {
    const hot = createHotMemory();
    hot.add(entry("测试内容"));
    expect(hot.getEntries()).toHaveLength(1);
    expect(hot.getEntries()[0]!.content).toBe("测试内容");
  });

  it("应估算 token 数（每 4 字符约 1 token）", () => {
    const hot = createHotMemory();
    // "a".repeat(40) + timestamp(19) + type(11) + 格式化开销(10) = 80 chars → 20 tokens
    hot.add(entry("a".repeat(40)));
    expect(hot.estimateTokens()).toBeGreaterThan(0);
  });

  it("超出 maxTokens 时应丢弃旧条目", () => {
    const hot = createHotMemory(50); // 50 tokens ≈ 200 chars
    // 添加足够多条目超出限制
    for (let i = 0; i < 20; i++) {
      hot.add(entry(`长内容条目 ${i} ${"x".repeat(50)}`));
    }
    expect(hot.estimateTokens()).toBeLessThanOrEqual(50);
    expect(hot.getEntries().length).toBeLessThan(20);
  });

  it("toPromptText 应格式化所有条目", () => {
    const hot = createHotMemory();
    hot.add(entry("条目一", "conversation"));
    hot.add(entry("条目二", "decision"));
    const text = hot.toPromptText();
    expect(text).toContain("[conversation]");
    expect(text).toContain("[decision]");
    expect(text).toContain("条目一");
    expect(text).toContain("条目二");
  });

  it("clear 应清空所有条目", () => {
    const hot = createHotMemory();
    hot.add(entry("内容"));
    hot.clear();
    expect(hot.getEntries()).toEqual([]);
    expect(hot.estimateTokens()).toBe(0);
  });

  it("只剩一条时不再淘汰", () => {
    const hot = createHotMemory(1); // 极小限制
    hot.add(entry("x".repeat(100)));
    expect(hot.getEntries()).toHaveLength(1);
  });
});

// ─── Cold Memory ──────────────────────────────────────────────────

describe("createColdMemory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cold-mem-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("应缓存并加载内容", async () => {
    const cold = createColdMemory(tmpDir);
    await cold.cache("step-1", "步骤一的结果");
    const loaded = await cold.load("step-1");
    expect(loaded).toBe("步骤一的结果");
  });

  it("加载不存在的步骤应返回 null", async () => {
    const cold = createColdMemory(tmpDir);
    const loaded = await cold.load("nonexistent");
    expect(loaded).toBeNull();
  });

  it("应列出所有缓存的步骤", async () => {
    const cold = createColdMemory(tmpDir);
    await cold.cache("step-a", "A");
    await cold.cache("step-b", "B");
    const steps = await cold.listSteps();
    expect(steps).toContain("step-a");
    expect(steps).toContain("step-b");
    expect(steps).toHaveLength(2);
  });

  it("目录不存在时 listSteps 应返回空数组", async () => {
    const cold = createColdMemory(join(tmpDir, "nonexistent"));
    const steps = await cold.listSteps();
    expect(steps).toEqual([]);
  });

  it("cleanup 应删除所有缓存文件", async () => {
    const cold = createColdMemory(tmpDir);
    await cold.cache("step-1", "数据");
    await cold.cleanup();
    const loaded = await cold.load("step-1");
    expect(loaded).toBeNull();
  });

  it("应清理文件名中的特殊字符", async () => {
    const cold = createColdMemory(tmpDir);
    await cold.cache("step/with:special", "内容");
    const loaded = await cold.load("step/with:special");
    expect(loaded).toBe("内容");
  });

  it("cleanup 在目录不存在时不应报错", async () => {
    const cold = createColdMemory(join(tmpDir, "nonexistent"));
    await expect(cold.cleanup()).resolves.not.toThrow();
  });
});
