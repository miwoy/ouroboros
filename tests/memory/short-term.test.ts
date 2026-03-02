/**
 * 短期记忆测试
 *
 * 按日期分隔的完整交互记录
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createShortTermMemory } from "../../src/memory/short-term.js";
import type { MemoryEntry } from "../../src/memory/types.js";

describe("createShortTermMemory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "short-mem-"));
    await mkdir(join(tmpDir, "prompts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const entry = (
    time: string,
    content: string,
    type: MemoryEntry["type"] = "observation",
    metadata?: Record<string, unknown>,
  ): MemoryEntry => ({
    timestamp: `2026-03-02T${time}`,
    type,
    content,
    metadata,
  });

  it("应追加条目并创建日期文件", async () => {
    const mem = createShortTermMemory(tmpDir);
    await mem.append(entry("10:00:00", "第一条记忆"));

    const filePath = join(tmpDir, "prompts", "memory", "2026-03-02.md");
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("第一条记忆");
    expect(content).toContain("10:00:00");
  });

  it("应在同一文件追加多条记忆", async () => {
    const mem = createShortTermMemory(tmpDir);
    await mem.append(entry("10:00:00", "第一条"));
    await mem.append(entry("11:00:00", "第二条"));

    const filePath = join(tmpDir, "prompts", "memory", "2026-03-02.md");
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("第一条");
    expect(content).toContain("第二条");
  });

  it("应按日期加载记忆", async () => {
    const mem = createShortTermMemory(tmpDir);
    await mem.append(entry("10:00:00", "测试内容", "conversation"));

    const entries = await mem.loadByDate("2026-03-02");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.content).toBe("测试内容");
    expect(entries[0]!.type).toBe("conversation");
    expect(entries[0]!.timestamp).toContain("10:00:00");
  });

  it("加载不存在的日期应返回空数组", async () => {
    const mem = createShortTermMemory(tmpDir);
    const entries = await mem.loadByDate("2020-01-01");
    expect(entries).toEqual([]);
  });

  it("应保存和解析元数据", async () => {
    const mem = createShortTermMemory(tmpDir);
    await mem.append(entry("10:00:00", "带元数据的记忆", "tool-call", { toolId: "test" }));

    const entries = await mem.loadByDate("2026-03-02");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.metadata).toEqual({ toolId: "test" });
  });

  it("应列出所有有记忆的日期", async () => {
    const mem = createShortTermMemory(tmpDir);
    await mem.append({
      timestamp: "2026-03-01T10:00:00",
      type: "observation",
      content: "三月一号",
    });
    await mem.append({
      timestamp: "2026-03-02T10:00:00",
      type: "observation",
      content: "三月二号",
    });

    const dates = await mem.listDates();
    expect(dates).toContain("2026-03-01");
    expect(dates).toContain("2026-03-02");
    expect(dates).toHaveLength(2);
  });

  it("目录不存在时 listDates 应返回空数组", async () => {
    const mem = createShortTermMemory(join(tmpDir, "nonexistent"));
    const dates = await mem.listDates();
    expect(dates).toEqual([]);
  });

  it("应正确解析多条不同类型的记忆", async () => {
    const mem = createShortTermMemory(tmpDir);
    await mem.append(entry("10:00:00", "对话内容", "conversation"));
    await mem.append(entry("10:05:00", "工具调用", "tool-call"));
    await mem.append(entry("10:10:00", "重要决策", "decision"));

    const entries = await mem.loadByDate("2026-03-02");
    expect(entries).toHaveLength(3);
    expect(entries[0]!.type).toBe("conversation");
    expect(entries[1]!.type).toBe("tool-call");
    expect(entries[2]!.type).toBe("decision");
  });

  it("loadToday 应加载今天的记忆", async () => {
    const mem = createShortTermMemory(tmpDir);
    // loadToday 使用 new Date() 生成今天日期
    // 直接测试空结果（不写入今天日期的文件）
    const entries = await mem.loadToday();
    expect(entries).toEqual([]);
  });

  it("应处理无效记忆格式（跳过无法解析的条目）", async () => {
    const mem = createShortTermMemory(tmpDir);
    // 先写入一条有效记忆
    await mem.append(entry("10:00:00", "有效记忆"));

    // 手动追加一段无法解析的内容
    const { writeFile } = await import("node:fs/promises");
    const filePath = join(tmpDir, "prompts", "memory", "2026-03-02.md");
    const raw = await readFile(filePath, "utf-8");
    await writeFile(filePath, raw + "\n\n### 无效格式的标题\n\n无效内容", "utf-8");

    const entries = await mem.loadByDate("2026-03-02");
    // 有效的那条应被解析，无效的被跳过
    expect(entries).toHaveLength(1);
    expect(entries[0]!.content).toBe("有效记忆");
  });
});
