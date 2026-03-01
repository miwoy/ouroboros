import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  loadByCategory,
  loadById,
  searchByKeyword,
  searchBySemantic,
} from "../../src/prompt/loader.js";
import * as vectorModule from "../../src/prompt/vector.js";
import { savePromptTemplate } from "../../src/prompt/store.js";
import { initWorkspace } from "../../src/workspace/init.js";
import type { PromptTemplate } from "../../src/prompt/types.js";

const TEST_WORKSPACE = join(process.cwd(), ".test-prompt-loader-tmp");

const greetingTemplate: PromptTemplate = {
  id: "skill:greeting",
  category: "skill",
  name: "用户问候",
  description: "用友好的方式问候用户，支持个性化称呼",
  content: "你好 {{userName}}，欢迎使用 Ouroboros",
  variables: [{ name: "userName", description: "用户名", required: true }],
  tags: ["问候", "用户", "欢迎"],
  version: "1.0.0",
};

const farewellTemplate: PromptTemplate = {
  id: "skill:farewell",
  category: "skill",
  name: "用户告别",
  description: "友好地与用户告别",
  content: "再见 {{userName}}，期待下次见面",
  variables: [{ name: "userName", description: "用户名", required: true }],
  tags: ["告别", "用户"],
  version: "1.0.0",
};

const systemTemplate: PromptTemplate = {
  id: "system:base",
  category: "system",
  name: "基础系统提示词",
  description: "定义 Agent 基本行为规范",
  content: "你是一个智能助手，请遵循以下规范...",
  variables: [],
  tags: ["系统", "基础"],
  version: "1.0.0",
};

describe("loadByCategory", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
    await savePromptTemplate(TEST_WORKSPACE, greetingTemplate);
    await savePromptTemplate(TEST_WORKSPACE, farewellTemplate);
    await savePromptTemplate(TEST_WORKSPACE, systemTemplate);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该加载指定分类的所有模板", async () => {
    const templates = await loadByCategory(TEST_WORKSPACE, "skill");
    expect(templates).toHaveLength(2);
    const ids = templates.map((t) => t.id);
    expect(ids).toContain("skill:greeting");
    expect(ids).toContain("skill:farewell");
  });

  it("空分类返回空数组", async () => {
    const templates = await loadByCategory(TEST_WORKSPACE, "core");
    expect(templates).toEqual([]);
  });
});

describe("loadById", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
    await savePromptTemplate(TEST_WORKSPACE, greetingTemplate);
    await savePromptTemplate(TEST_WORKSPACE, systemTemplate);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该通过 ID 加载模板（跨分类查找）", async () => {
    const template = await loadById(TEST_WORKSPACE, "system:base");
    expect(template).not.toBeNull();
    expect(template?.name).toBe("基础系统提示词");
  });

  it("应该通过 ID 加载 skill 模板", async () => {
    const template = await loadById(TEST_WORKSPACE, "skill:greeting");
    expect(template).not.toBeNull();
    expect(template?.category).toBe("skill");
  });

  it("ID 不存在时返回 null", async () => {
    const template = await loadById(TEST_WORKSPACE, "nonexistent:id");
    expect(template).toBeNull();
  });
});

describe("searchByKeyword", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
    await savePromptTemplate(TEST_WORKSPACE, greetingTemplate);
    await savePromptTemplate(TEST_WORKSPACE, farewellTemplate);
    await savePromptTemplate(TEST_WORKSPACE, systemTemplate);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该通过名称匹配搜索", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "用户问候");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].template.id).toBe("skill:greeting");
  });

  it("应该通过描述匹配搜索", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "友好");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("应该通过标签匹配搜索", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "问候");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].template.id).toBe("skill:greeting");
  });

  it("应该按匹配分数降序排列", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "用户");
    // 所有匹配结果的分数应该递减
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it("应该支持按分类过滤", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "用户", {
      category: "skill",
    });
    for (const r of results) {
      expect(r.template.category).toBe("skill");
    }
  });

  it("应该支持 limit 限制结果数量", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "用户", {
      limit: 1,
    });
    expect(results).toHaveLength(1);
  });

  it("无匹配时返回空数组", async () => {
    const results = await searchByKeyword(TEST_WORKSPACE, "完全不相关的词汇xyz");
    expect(results).toEqual([]);
  });
});

describe("searchBySemantic", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
    await savePromptTemplate(TEST_WORKSPACE, greetingTemplate);
    await savePromptTemplate(TEST_WORKSPACE, farewellTemplate);
    await savePromptTemplate(TEST_WORKSPACE, systemTemplate);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("qmd 不可用时应回退到关键词搜索", async () => {
    vi.spyOn(vectorModule, "isQmdAvailable").mockResolvedValue(false);

    const results = await searchBySemantic(TEST_WORKSPACE, "用户问候");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].template.id).toBe("skill:greeting");
  });

  it("qmd 可用时应调用 vectorSearch", async () => {
    vi.spyOn(vectorModule, "isQmdAvailable").mockResolvedValue(true);
    const mockVectorSearch = vi
      .spyOn(vectorModule, "vectorSearch")
      .mockResolvedValue([{ template: greetingTemplate, score: 0.9 }]);

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

    const results = await searchBySemantic(TEST_WORKSPACE, "用户问候");
    // 应该回退到关键词搜索，依然能返回结果
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].template.id).toBe("skill:greeting");
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
