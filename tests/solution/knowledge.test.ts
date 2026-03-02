/**
 * 知识库测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createKnowledgeBase } from "../../src/solution/knowledge.js";

describe("createKnowledgeBase", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "kb-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("空知识库 loadAll 应返回空字符串", async () => {
    const kb = createKnowledgeBase(tmpDir);
    const content = await kb.loadAll();
    expect(content).toBe("");
  });

  it("空知识库 listFiles 应返回空数组", async () => {
    const kb = createKnowledgeBase(tmpDir);
    const files = await kb.listFiles();
    expect(files).toEqual([]);
  });

  it("应添加并加载知识文件", async () => {
    const kb = createKnowledgeBase(tmpDir);
    await kb.addFile("readme.md", "# 项目说明\n\n这是一个测试项目");

    const files = await kb.listFiles();
    expect(files).toContain("readme.md");

    const content = await kb.loadAll();
    expect(content).toContain("项目说明");
    expect(content).toContain("测试项目");
  });

  it("应加载多个知识文件", async () => {
    const kb = createKnowledgeBase(tmpDir);
    await kb.addFile("file1.md", "文件一内容");
    await kb.addFile("file2.md", "文件二内容");

    const content = await kb.loadAll();
    expect(content).toContain("文件一内容");
    expect(content).toContain("文件二内容");
  });

  it("应遵守 maxTokens 限制", async () => {
    const kb = createKnowledgeBase(tmpDir, { maxTokens: 10 });
    // 10 tokens ≈ 40 chars，添加超过限制的内容
    // 文件按字母排序：a-small.md 在 b-large.md 前面
    await kb.addFile("a-small.md", "短内容");
    await kb.addFile("b-large.md", "x".repeat(200));

    const content = await kb.loadAll();
    // 应只加载第一个文件（a-small.md 先加载，b-large.md 超出限制）
    expect(content).toContain("短内容");
    expect(content).not.toContain("x".repeat(200));
  });

  it("listFiles 应排除隐藏文件", async () => {
    const kb = createKnowledgeBase(tmpDir);
    await kb.addFile("visible.md", "可见");
    await mkdir(join(tmpDir, "knowledge"), { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tmpDir, "knowledge", ".hidden"), "隐藏", "utf-8");

    const files = await kb.listFiles();
    expect(files).toContain("visible.md");
    expect(files).not.toContain(".hidden");
  });

  it("addFile 应自动创建知识目录", async () => {
    const kb = createKnowledgeBase(join(tmpDir, "nonexistent"));
    await kb.addFile("test.md", "测试");

    const fullPath = join(tmpDir, "nonexistent", "knowledge", "test.md");
    const content = await readFile(fullPath, "utf-8");
    expect(content).toBe("测试");
  });
});
