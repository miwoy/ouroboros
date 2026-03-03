import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  readPromptFile,
  writePromptFile,
  appendToPromptFile,
  copyDefaultTemplates,
  listPromptFiles,
  listMemoryFiles,
  getPromptFilePath,
  getCorePath,
  parseFrontmatter,
  serializeFrontmatter,
  readSection,
  replaceSection,
} from "../../src/prompt/store.js";
import { initWorkspace } from "../../src/workspace/init.js";
import type { PromptFile } from "../../src/prompt/types.js";

const TEST_WORKSPACE = join(process.cwd(), ".test-prompt-store-tmp");

const samplePromptFile: PromptFile = {
  metadata: {
    type: "skill",
    name: "技能注册表",
    description: "技能名称、id、描述、路径",
    tags: ["技能", "注册表"],
    version: "1.0.0",
  },
  content: "# 技能注册表\n\n| 名称 | ID | 描述 |\n|------|-----|------|\n",
};

describe("readPromptFile / writePromptFile", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该写入并读取提示词文件", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "skill.md");
    await writePromptFile(filePath, samplePromptFile);

    const loaded = await readPromptFile(filePath);
    expect(loaded).not.toBeNull();
    expect(loaded!.metadata.type).toBe("skill");
    expect(loaded!.metadata.name).toBe("技能注册表");
    expect(loaded!.content).toContain("# 技能注册表");
  });

  it("文件不存在时返回 null", async () => {
    const loaded = await readPromptFile(join(TEST_WORKSPACE, "prompts", "nonexistent.md"));
    expect(loaded).toBeNull();
  });

  it("应该覆盖已存在的文件", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "skill.md");
    await writePromptFile(filePath, samplePromptFile);

    const updated: PromptFile = {
      metadata: { ...samplePromptFile.metadata, version: "2.0.0" },
      content: "# 更新后的内容",
    };
    await writePromptFile(filePath, updated);

    const loaded = await readPromptFile(filePath);
    expect(loaded!.metadata.version).toBe("2.0.0");
    expect(loaded!.content).toContain("更新后的内容");
  });
});

describe("appendToPromptFile", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该追加内容到文件末尾", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "skill.md");
    await writePromptFile(filePath, samplePromptFile);

    await appendToPromptFile(filePath, "| 用户问候 | skill:greeting | 友好问候 |");

    const loaded = await readPromptFile(filePath);
    expect(loaded!.content).toContain("用户问候");
    expect(loaded!.content).toContain("skill:greeting");
  });

  it("文件不存在时应抛出错误", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "nonexistent.md");
    await expect(appendToPromptFile(filePath, "内容")).rejects.toThrow("提示词文件不存在");
  });
});

describe("copyDefaultTemplates", () => {
  beforeEach(async () => {
    await mkdir(join(TEST_WORKSPACE, "prompts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该将模板文件复制到 workspace/prompts/", async () => {
    const copied = await copyDefaultTemplates(TEST_WORKSPACE);

    expect(copied.length).toBeGreaterThan(0);

    // 检查 self.md 是否存在
    const selfStat = await stat(join(TEST_WORKSPACE, "prompts", "self.md"));
    expect(selfStat.isFile()).toBe(true);

    // 检查 skill.md 是否存在
    const skillStat = await stat(join(TEST_WORKSPACE, "prompts", "skill.md"));
    expect(skillStat.isFile()).toBe(true);
  });

  it("已存在的文件不应被覆盖（幂等）", async () => {
    // 先复制一次
    await copyDefaultTemplates(TEST_WORKSPACE);

    // 修改文件
    const skillPath = join(TEST_WORKSPACE, "prompts", "skill.md");
    await writeFile(skillPath, "用户自定义内容", "utf-8");

    // 再次复制
    const copied = await copyDefaultTemplates(TEST_WORKSPACE);

    // 不应覆盖
    const content = await readFile(skillPath, "utf-8");
    expect(content).toBe("用户自定义内容");
    expect(copied).not.toContain(skillPath);
  });

  it("core.md 不应被复制", async () => {
    await copyDefaultTemplates(TEST_WORKSPACE);

    // workspace 中不应有 core.md
    const files = await listPromptFiles(TEST_WORKSPACE);
    expect(files).not.toContain("core.md");
  });
});

describe("listPromptFiles", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该列出所有 .md 文件", async () => {
    const files = await listPromptFiles(TEST_WORKSPACE);
    expect(files).toContain("self.md");
    expect(files).toContain("tool.md");
    expect(files).toContain("skill.md");
    expect(files).toContain("agent.md");
    expect(files).toContain("memory.md");
  });

  it("目录不存在时返回空数组", async () => {
    const files = await listPromptFiles("/nonexistent/path");
    expect(files).toEqual([]);
  });
});

describe("listMemoryFiles", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("初始时返回空数组", async () => {
    const files = await listMemoryFiles(TEST_WORKSPACE);
    expect(files).toEqual([]);
  });

  it("应该列出短期记忆文件并排序", async () => {
    const memoryDir = join(TEST_WORKSPACE, "prompts", "memory");
    await writeFile(join(memoryDir, "2026-01-02.md"), "记忆2", "utf-8");
    await writeFile(join(memoryDir, "2026-01-01.md"), "记忆1", "utf-8");

    const files = await listMemoryFiles(TEST_WORKSPACE);
    expect(files).toEqual(["2026-01-01.md", "2026-01-02.md"]);
  });
});

describe("getPromptFilePath", () => {
  it("core 类型返回源码路径", () => {
    const path = getPromptFilePath("/workspace", "core");
    expect(path).toContain("src/prompt/template/core.md");
  });

  it("其他类型返回 workspace/prompts/ 路径", () => {
    const path = getPromptFilePath("/workspace", "skill");
    expect(path).toBe(join("/workspace", "prompts", "skill.md"));
  });
});

describe("getCorePath", () => {
  it("应该返回 src/prompt/core.md 的路径", () => {
    const path = getCorePath();
    expect(path).toContain("core.md");
  });
});

describe("parseFrontmatter", () => {
  it("应该解析标准 frontmatter", () => {
    const raw = `---
type: skill
name: "技能注册表"
description: "技能描述"
tags: ["技能", "注册表"]
version: "1.0.0"
---
# 正文内容`;

    const result = parseFrontmatter(raw);
    expect(result.metadata.type).toBe("skill");
    expect(result.metadata.name).toBe("技能注册表");
    expect(result.metadata.tags).toEqual(["技能", "注册表"]);
    expect(result.content).toContain("# 正文内容");
  });

  it("没有 frontmatter 时返回默认元数据", () => {
    const raw = "# 普通 markdown 内容";
    const result = parseFrontmatter(raw);
    expect(result.metadata.type).toBe("memory");
    expect(result.content).toBe(raw);
  });

  it("未闭合的 frontmatter 应视为无 frontmatter", () => {
    const raw = "---\ntype: skill\n# 没有结束标记";
    const result = parseFrontmatter(raw);
    expect(result.metadata.type).toBe("memory"); // 默认类型
    expect(result.content).toBe(raw);
  });

  it("应该解析不带引号的值", () => {
    const raw = `---
type: tool
name: 工具注册表
description: 工具描述
version: 1.0.0
---
内容`;
    const result = parseFrontmatter(raw);
    expect(result.metadata.type).toBe("tool");
    expect(result.metadata.name).toBe("工具注册表");
  });

  it("应该解析内联数组标签", () => {
    const raw = `---
type: skill
name: "测试"
description: "描述"
tags: ["a", "b", "c"]
version: "1.0.0"
---
内容`;
    const result = parseFrontmatter(raw);
    expect(result.metadata.tags).toEqual(["a", "b", "c"]);
  });

  it("应该解析简单数组（非对象项）", () => {
    const raw = `---
type: skill
name: "测试"
description: "描述"
tags:
  - "标签1"
  - "标签2"
version: "1.0.0"
---
内容`;
    const result = parseFrontmatter(raw);
    expect(result.metadata.tags).toEqual(["标签1", "标签2"]);
  });

  it("应该解析包含 variables 的 frontmatter", () => {
    const raw = `---
type: self
name: "自我图式"
description: "自我图式模板"
version: "1.0.0"
variables:
  - name: "platform"
    description: "运行平台"
    required: true
  - name: "greeting"
    description: "问候语"
    required: false
    defaultValue: "你好"
---
# 内容`;

    const result = parseFrontmatter(raw);
    expect(result.metadata.variables).toHaveLength(2);
    expect(result.metadata.variables![0].name).toBe("platform");
    expect(result.metadata.variables![0].required).toBe(true);
    expect(result.metadata.variables![1].defaultValue).toBe("你好");
  });
});

describe("readSection", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该读取指定标题下的内容", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "test.md");
    await writeFile(
      filePath,
      "# Title\n\n## Section A\n\n内容A\n\n## Section B\n\n内容B\n",
      "utf-8",
    );

    const content = await readSection(filePath, "Section A");
    expect(content).toBe("内容A");
  });

  it("三级标题也能读取", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "test.md");
    await writeFile(
      filePath,
      "## Soul\n\n### World Model\n\n原则1\n原则2\n\n### Identity\n\n身份\n",
      "utf-8",
    );

    const content = await readSection(filePath, "World Model", 3);
    expect(content).toBe("原则1\n原则2");
  });

  it("section 不存在时返回 null", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "test.md");
    await writeFile(filePath, "# Title\n\n## Section A\n\n内容A\n", "utf-8");

    const content = await readSection(filePath, "Not Exist");
    expect(content).toBeNull();
  });

  it("文件不存在时返回 null", async () => {
    const content = await readSection(join(TEST_WORKSPACE, "nonexistent.md"), "X");
    expect(content).toBeNull();
  });

  it("最后一个 section 读取到文件末尾", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "test.md");
    await writeFile(filePath, "## First\n\n内容1\n\n## Last\n\n最后内容\n", "utf-8");

    const content = await readSection(filePath, "Last");
    expect(content).toBe("最后内容");
  });
});

describe("replaceSection", () => {
  beforeEach(async () => {
    await initWorkspace(TEST_WORKSPACE);
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该替换指定 section 的内容", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "test.md");
    await writeFile(
      filePath,
      "# Title\n\n## Section A\n\n旧内容\n\n## Section B\n\n内容B\n",
      "utf-8",
    );

    await replaceSection(filePath, "Section A", "新内容");

    const raw = await readFile(filePath, "utf-8");
    expect(raw).toContain("## Section A");
    expect(raw).toContain("新内容");
    expect(raw).not.toContain("旧内容");
    expect(raw).toContain("## Section B");
    expect(raw).toContain("内容B");
  });

  it("section 不存在时追加新章节", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "test.md");
    await writeFile(filePath, "# Title\n\n## Existing\n\n内容\n", "utf-8");

    await replaceSection(filePath, "New Section", "新章节内容");

    const raw = await readFile(filePath, "utf-8");
    expect(raw).toContain("## Existing");
    expect(raw).toContain("## New Section");
    expect(raw).toContain("新章节内容");
  });

  it("替换三级标题 section", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "test.md");
    await writeFile(filePath, "## Soul\n\n### Identity\n\n旧身份\n\n### User\n\n用户\n", "utf-8");

    await replaceSection(filePath, "Identity", "新身份描述", 3);

    const raw = await readFile(filePath, "utf-8");
    expect(raw).toContain("### Identity");
    expect(raw).toContain("新身份描述");
    expect(raw).not.toContain("旧身份");
    expect(raw).toContain("### User");
    expect(raw).toContain("用户");
  });

  it("文件不存在时抛出错误", async () => {
    await expect(
      replaceSection(join(TEST_WORKSPACE, "nonexistent.md"), "X", "内容"),
    ).rejects.toThrow("文件不存在");
  });

  it("替换后 readSection 能正确读取", async () => {
    const filePath = join(TEST_WORKSPACE, "prompts", "test.md");
    await writeFile(
      filePath,
      "## Soul\n\n### World Model\n\n旧原则\n\n### Identity\n\n身份\n",
      "utf-8",
    );

    await replaceSection(filePath, "World Model", "新原则1\n新原则2", 3);

    const content = await readSection(filePath, "World Model", 3);
    expect(content).toBe("新原则1\n新原则2");

    // Identity 不受影响
    const identity = await readSection(filePath, "Identity", 3);
    expect(identity).toBe("身份");
  });
});

describe("serializeFrontmatter", () => {
  it("应该序列化 PromptFile 为 frontmatter + 正文", () => {
    const result = serializeFrontmatter(samplePromptFile);
    expect(result).toContain("---");
    expect(result).toContain("type: skill");
    expect(result).toContain('name: "技能注册表"');
    expect(result).toContain("# 技能注册表");
  });

  it("序列化后再解析应保持一致", () => {
    const serialized = serializeFrontmatter(samplePromptFile);
    const parsed = parseFrontmatter(serialized);

    expect(parsed.metadata.type).toBe(samplePromptFile.metadata.type);
    expect(parsed.metadata.name).toBe(samplePromptFile.metadata.name);
    expect(parsed.metadata.description).toBe(samplePromptFile.metadata.description);
    expect(parsed.content).toContain("# 技能注册表");
  });
});
