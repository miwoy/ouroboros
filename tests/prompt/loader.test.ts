import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadPromptFile,
  loadAllPromptFiles,
  searchByKeyword,
  searchBySemantic,
} from "../../src/prompt/loader.js";
import * as vectorModule from "../../src/prompt/vector.js";
import { writePromptFile } from "../../src/prompt/store.js";
import { initWorkspace } from "../../src/workspace/init.js";
import type { PromptFile } from "../../src/prompt/types.js";

const TEST_WORKSPACE = join(process.cwd(), ".test-prompt-loader-tmp");

/** 创建带 frontmatter 的测试用提示词文件 */
function createTestMd(type: string, name: string, description: string, tags: string[], content: string): string {
  const tagsStr = tags.map((t) => `"${t}"`).join(", ");
  return `---
type: ${type}
name: "${name}"
description: "${description}"
tags: [${tagsStr}]
version: "1.0.0"
---
${content}`;
}

describe("loadPromptFile", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该加载指定类型的提示词文件", async () => {
    const file = await loadPromptFile(TEST_WORKSPACE, "skill");
    expect(file).not.toBeNull();
    expect(file!.content).toContain("技能注册表");
  });

  it("core 类型应该从源码目录加载", async () => {
    const file = await loadPromptFile(TEST_WORKSPACE, "core");
    expect(file).not.toBeNull();
    expect(file!.content).toContain("Ouroboros");
  });

  it("文件不存在时返回 null", async () => {
    // 删除 agent.md 后测试
    const agentPath = join(TEST_WORKSPACE, "prompts", "agent.md");
    await rm(agentPath, { force: true });
    const file = await loadPromptFile(TEST_WORKSPACE, "agent");
    expect(file).toBeNull();
  });
});

describe("loadAllPromptFiles", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该加载所有提示词文件", async () => {
    const files = await loadAllPromptFiles(TEST_WORKSPACE);
    // core + self + tool + skill + agent + memory
    expect(files.size).toBeGreaterThanOrEqual(5);
    expect(files.has("core")).toBe(true);
    expect(files.has("skill")).toBe(true);
  });
});

describe("searchByKeyword", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);

    // 追加一条技能到 skill.md
    const skillContent = createTestMd(
      "skill",
      "技能注册表",
      "技能名称、id、描述、路径",
      ["技能", "注册表"],
      `# 技能注册表

| 名称 | ID | 描述 | 路径 |
|------|-----|------|------|
| 用户问候 | skill:greeting | 用友好的方式问候用户 | workspace/skills/greeting |`,
    );
    await writeFile(
      join(TEST_WORKSPACE, "prompts", "skill.md"),
      skillContent,
      "utf-8",
    );
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该通过名称匹配搜索", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "技能注册表");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fileType).toBe("skill");
  });

  it("应该通过正文内容搜索", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "用户问候");
    expect(results.length).toBeGreaterThan(0);
    // skill.md 的正文包含 "用户问候"
    expect(results.some((r) => r.fileName === "skill.md")).toBe(true);
  });

  it("应该按匹配分数降序排列", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "技能");
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it("应该支持 limit 限制结果数量", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "技能", { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("无匹配时返回空数组", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "完全不相关的词汇xyz");
    expect(results).toEqual([]);
  });

  it("应该搜索短期记忆文件", async () => {
    // 创建短期记忆文件
    const memoryPath = join(TEST_WORKSPACE, "prompts", "memory", "2026-03-01.md");
    await writeFile(memoryPath, "今天学会了搜索功能", "utf-8");

    const results = await searchByKeyword(TEST_WORKSPACE, "搜索功能");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.fileName.includes("memory/"))).toBe(true);
  });
});

describe("searchBySemantic", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);

    const skillContent = createTestMd(
      "skill",
      "技能注册表",
      "技能名称、id、描述、路径",
      ["技能", "注册表"],
      `# 技能注册表

| 名称 | ID | 描述 |
|------|-----|------|
| 用户问候 | skill:greeting | 友好问候 |`,
    );
    await writeFile(
      join(TEST_WORKSPACE, "prompts", "skill.md"),
      skillContent,
      "utf-8",
    );
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("qmd 不可用时应回退到关键词搜索", async () => {
    vi.spyOn(vectorModule, "isQmdAvailable").mockResolvedValue(false);

    const results = await searchBySemantic(TEST_WORKSPACE, "用户问候");
    expect(results.length).toBeGreaterThan(0);
  });

  it("qmd 可用时应调用 vectorSearch", async () => {
    vi.spyOn(vectorModule, "isQmdAvailable").mockResolvedValue(true);
    const mockVectorSearch = vi
      .spyOn(vectorModule, "vectorSearch")
      .mockResolvedValue([{
        fileType: "skill",
        fileName: "skill.md",
        content: "用户问候",
        score: 0.9,
      }]);

    const results = await searchBySemantic(TEST_WORKSPACE, "用户问候");

    expect(mockVectorSearch).toHaveBeenCalledWith(TEST_WORKSPACE, "用户问候", {
      mode: "query",
      limit: undefined,
      minScore: undefined,
    });
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.9);
  });

  it("vectorSearch 失败时应回退到关键词搜索", async () => {
    vi.spyOn(vectorModule, "isQmdAvailable").mockResolvedValue(true);
    vi.spyOn(vectorModule, "vectorSearch").mockRejectedValue(new Error("qmd error"));

    const results = await searchBySemantic(TEST_WORKSPACE, "技能");
    expect(results.length).toBeGreaterThan(0);
  });

  it("应该传递搜索选项给 vectorSearch", async () => {
    vi.spyOn(vectorModule, "isQmdAvailable").mockResolvedValue(true);
    const mockVectorSearch = vi.spyOn(vectorModule, "vectorSearch").mockResolvedValue([]);

    await searchBySemantic(TEST_WORKSPACE, "test", {
      limit: 5,
      threshold: 0.3,
      mode: "vector",
    });

    expect(mockVectorSearch).toHaveBeenCalledWith(TEST_WORKSPACE, "test", {
      mode: "vector",
      limit: 5,
      minScore: 0.3,
    });
  });
});
