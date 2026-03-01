import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  savePromptTemplate,
  loadPromptTemplate,
  listPromptTemplates,
  deletePromptTemplate,
} from "../../src/prompt/store.js";
import { initWorkspace } from "../../src/workspace/init.js";
import type { PromptTemplate } from "../../src/prompt/types.js";

const TEST_WORKSPACE = join(process.cwd(), ".test-prompt-store-tmp");

const sampleTemplate: PromptTemplate = {
  id: "skill:greeting",
  category: "skill",
  name: "用户问候",
  description: "用友好的方式问候用户",
  content: "你好 {{userName}}，欢迎使用 Ouroboros",
  variables: [
    { name: "userName", description: "用户名", required: true },
  ],
  tags: ["问候", "用户"],
  version: "1.0.0",
};

describe("savePromptTemplate", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该将模板保存为 JSON 文件", async () => {
    await savePromptTemplate(TEST_WORKSPACE, sampleTemplate);

    const filePath = join(
      TEST_WORKSPACE,
      "prompts",
      "skills",
      "skill:greeting.json",
    );
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as PromptTemplate;

    expect(parsed.id).toBe("skill:greeting");
    expect(parsed.category).toBe("skill");
    expect(parsed.content).toBe("你好 {{userName}}，欢迎使用 Ouroboros");
  });

  it("应该覆盖已存在的同名模板", async () => {
    await savePromptTemplate(TEST_WORKSPACE, sampleTemplate);

    const updated: PromptTemplate = {
      ...sampleTemplate,
      content: "更新后的内容 {{userName}}",
      version: "2.0.0",
    };
    await savePromptTemplate(TEST_WORKSPACE, updated);

    const loaded = await loadPromptTemplate(
      TEST_WORKSPACE,
      "skill",
      "skill:greeting",
    );
    expect(loaded?.content).toBe("更新后的内容 {{userName}}");
    expect(loaded?.version).toBe("2.0.0");
  });
});

describe("loadPromptTemplate", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
    await savePromptTemplate(TEST_WORKSPACE, sampleTemplate);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该加载已保存的模板", async () => {
    const loaded = await loadPromptTemplate(
      TEST_WORKSPACE,
      "skill",
      "skill:greeting",
    );

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe("skill:greeting");
    expect(loaded?.name).toBe("用户问候");
  });

  it("模板不存在时返回 null", async () => {
    const loaded = await loadPromptTemplate(
      TEST_WORKSPACE,
      "skill",
      "nonexistent",
    );
    expect(loaded).toBeNull();
  });

  it("分类不存在时返回 null", async () => {
    const loaded = await loadPromptTemplate(
      TEST_WORKSPACE,
      "core",
      "skill:greeting",
    );
    expect(loaded).toBeNull();
  });
});

describe("listPromptTemplates", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该列出指定分类下的所有模板", async () => {
    await savePromptTemplate(TEST_WORKSPACE, sampleTemplate);

    const anotherTemplate: PromptTemplate = {
      ...sampleTemplate,
      id: "skill:farewell",
      name: "用户告别",
      description: "友好地告别",
    };
    await savePromptTemplate(TEST_WORKSPACE, anotherTemplate);

    const templates = await listPromptTemplates(TEST_WORKSPACE, "skill");
    expect(templates).toHaveLength(2);

    const ids = templates.map((t) => t.id);
    expect(ids).toContain("skill:greeting");
    expect(ids).toContain("skill:farewell");
  });

  it("分类为空时返回空数组", async () => {
    const templates = await listPromptTemplates(TEST_WORKSPACE, "core");
    expect(templates).toEqual([]);
  });

  it("不指定分类时列出所有模板", async () => {
    await savePromptTemplate(TEST_WORKSPACE, sampleTemplate);

    const systemTemplate: PromptTemplate = {
      ...sampleTemplate,
      id: "system:base",
      category: "system",
      name: "基础系统提示词",
    };
    await savePromptTemplate(TEST_WORKSPACE, systemTemplate);

    const all = await listPromptTemplates(TEST_WORKSPACE);
    expect(all).toHaveLength(2);
  });
});

describe("deletePromptTemplate", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
    await savePromptTemplate(TEST_WORKSPACE, sampleTemplate);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该删除指定模板", async () => {
    const deleted = await deletePromptTemplate(
      TEST_WORKSPACE,
      "skill",
      "skill:greeting",
    );
    expect(deleted).toBe(true);

    const loaded = await loadPromptTemplate(
      TEST_WORKSPACE,
      "skill",
      "skill:greeting",
    );
    expect(loaded).toBeNull();
  });

  it("删除不存在的模板返回 false", async () => {
    const deleted = await deletePromptTemplate(
      TEST_WORKSPACE,
      "skill",
      "nonexistent",
    );
    expect(deleted).toBe(false);
  });
});
