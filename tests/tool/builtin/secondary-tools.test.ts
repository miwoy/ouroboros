/**
 * 二级工具单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleBash } from "../../../src/tool/builtin/bash.js";
import { handleRead } from "../../../src/tool/builtin/read.js";
import { handleWrite } from "../../../src/tool/builtin/write.js";
import { handleEdit } from "../../../src/tool/builtin/edit.js";
import { handleFind } from "../../../src/tool/builtin/find.js";
import { handleWebFetch } from "../../../src/tool/builtin/web-fetch.js";
import { handleSearchSkill } from "../../../src/tool/builtin/search-skill.js";
import { handleCreateSkill } from "../../../src/tool/builtin/create-skill.js";
import { handleWebSearch } from "../../../src/tool/builtin/web-search.js";
import type { ToolExecutionContext } from "../../../src/tool/types.js";

/** 创建测试上下文 */
function createTestContext(workspacePath: string): ToolExecutionContext {
  return {
    workspacePath,
    callModel: vi.fn().mockResolvedValue({
      content: '[{"title":"Test","url":"https://example.com","snippet":"test result"}]',
      toolCalls: [],
      stopReason: "end_turn",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: "test",
    }),
    registry: {
      get: vi.fn(),
      has: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      listCustom: vi.fn().mockReturnValue([]),
      register: vi.fn(),
      updateStatus: vi.fn(),
    },
    caller: { entityId: "test" },
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "ouroboros-test-"));
  await mkdir(join(tmpDir, "prompts"), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("tool:bash", () => {
  it("应执行命令并返回 stdout", async () => {
    const ctx = createTestContext(tmpDir);
    const result = await handleBash({ command: "echo hello" }, ctx);
    expect(result["success"]).toBe(true);
    expect((result["stdout"] as string).trim()).toBe("hello");
  });

  it("命令失败应返回 success=false", async () => {
    const ctx = createTestContext(tmpDir);
    const result = await handleBash({ command: "exit 1" }, ctx);
    expect(result["success"]).toBe(false);
    expect(result["exitCode"]).toBe(1);
  });

  it("应使用指定的工作目录", async () => {
    const ctx = createTestContext(tmpDir);
    const result = await handleBash({ command: "pwd", cwd: tmpDir }, ctx);
    expect(result["success"]).toBe(true);
    expect((result["stdout"] as string).trim()).toBe(tmpDir);
  });
});

describe("tool:read", () => {
  it("应读取文件内容", async () => {
    await writeFile(join(tmpDir, "test.txt"), "line1\nline2\nline3", "utf-8");
    const ctx = createTestContext(tmpDir);
    const result = await handleRead({ path: "test.txt" }, ctx);
    expect(result["content"]).toBe("line1\nline2\nline3");
    expect(result["totalLines"]).toBe(3);
  });

  it("支持行范围限制", async () => {
    await writeFile(join(tmpDir, "test.txt"), "a\nb\nc\nd\ne", "utf-8");
    const ctx = createTestContext(tmpDir);
    const result = await handleRead({ path: "test.txt", offset: 1, limit: 2 }, ctx);
    expect(result["content"]).toBe("b\nc");
    expect(result["startLine"]).toBe(1);
    expect(result["endLine"]).toBe(3);
  });
});

describe("tool:write", () => {
  it("应创建文件并写入内容", async () => {
    const ctx = createTestContext(tmpDir);
    const result = await handleWrite({ path: "output.txt", content: "hello world" }, ctx);
    expect(result["success"]).toBe(true);
    const content = await readFile(join(tmpDir, "output.txt"), "utf-8");
    expect(content).toBe("hello world");
  });

  it("应自动创建父目录", async () => {
    const ctx = createTestContext(tmpDir);
    await handleWrite({ path: "sub/dir/file.txt", content: "nested" }, ctx);
    const content = await readFile(join(tmpDir, "sub/dir/file.txt"), "utf-8");
    expect(content).toBe("nested");
  });
});

describe("tool:edit", () => {
  it("应替换文件中的文本", async () => {
    await writeFile(join(tmpDir, "edit.txt"), "hello world", "utf-8");
    const ctx = createTestContext(tmpDir);
    const result = await handleEdit(
      {
        path: "edit.txt",
        oldString: "world",
        newString: "ouroboros",
      },
      ctx,
    );
    expect(result["success"]).toBe(true);
    expect(result["replacements"]).toBe(1);
    const content = await readFile(join(tmpDir, "edit.txt"), "utf-8");
    expect(content).toBe("hello ouroboros");
  });

  it("文本不唯一时应返回错误", async () => {
    await writeFile(join(tmpDir, "dup.txt"), "aaa bbb aaa", "utf-8");
    const ctx = createTestContext(tmpDir);
    const result = await handleEdit(
      {
        path: "dup.txt",
        oldString: "aaa",
        newString: "ccc",
      },
      ctx,
    );
    expect(result["success"]).toBe(false);
    expect(result["error"]).toContain("不唯一");
  });

  it("replaceAll 应替换所有匹配", async () => {
    await writeFile(join(tmpDir, "all.txt"), "aaa bbb aaa", "utf-8");
    const ctx = createTestContext(tmpDir);
    const result = await handleEdit(
      {
        path: "all.txt",
        oldString: "aaa",
        newString: "ccc",
        replaceAll: true,
      },
      ctx,
    );
    expect(result["success"]).toBe(true);
    expect(result["replacements"]).toBe(2);
    const content = await readFile(join(tmpDir, "all.txt"), "utf-8");
    expect(content).toBe("ccc bbb ccc");
  });

  it("未找到文本应返回错误", async () => {
    await writeFile(join(tmpDir, "miss.txt"), "hello", "utf-8");
    const ctx = createTestContext(tmpDir);
    const result = await handleEdit(
      {
        path: "miss.txt",
        oldString: "xyz",
        newString: "abc",
      },
      ctx,
    );
    expect(result["success"]).toBe(false);
  });
});

describe("tool:find", () => {
  it("应查找匹配 glob 模式的文件", async () => {
    await writeFile(join(tmpDir, "a.ts"), "", "utf-8");
    await writeFile(join(tmpDir, "b.ts"), "", "utf-8");
    await writeFile(join(tmpDir, "c.js"), "", "utf-8");
    const ctx = createTestContext(tmpDir);
    const result = await handleFind({ pattern: "*.ts" }, ctx);
    const files = result["files"] as string[];
    expect(files.length).toBe(2);
    expect(files).toContain("a.ts");
    expect(files).toContain("b.ts");
  });

  it("应支持递归搜索", async () => {
    await mkdir(join(tmpDir, "sub"), { recursive: true });
    await writeFile(join(tmpDir, "sub/nested.ts"), "", "utf-8");
    const ctx = createTestContext(tmpDir);
    const result = await handleFind({ pattern: "**/*.ts" }, ctx);
    const files = result["files"] as string[];
    expect(files.some((f) => f.includes("nested.ts"))).toBe(true);
  });

  it("应限制结果数量", async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(join(tmpDir, `file${i}.txt`), "", "utf-8");
    }
    const ctx = createTestContext(tmpDir);
    const result = await handleFind({ pattern: "*.txt", limit: 2 }, ctx);
    expect((result["files"] as string[]).length).toBe(2);
    expect(result["truncated"]).toBe(true);
  });
});

describe("tool:web-search", () => {
  it("应使用搜索 Provider 返回结果", async () => {
    const bingHtml = `<html><body><ol><li class="b_algo"><h2><a href="https://example.com">Test Result</a></h2><p>Test snippet</p></li></ol></body></html>`;
    const mockHttpFetch = vi.fn().mockResolvedValue(new Response(bingHtml, { status: 200 }));
    const ctx = {
      ...createTestContext(tmpDir),
      httpFetch: mockHttpFetch as unknown as typeof globalThis.fetch,
      config: { webSearch: { provider: "bing" } },
    };
    const result = await handleWebSearch({ query: "test query" }, ctx);
    expect(result["query"]).toBe("test query");
    expect(mockHttpFetch).toHaveBeenCalledTimes(1);
    const results = result["results"] as Record<string, unknown>[];
    expect(results.length).toBe(1);
    expect(results[0]["title"]).toBe("Test Result");
  });

  it("搜索失败应返回空结果和 error 字段", async () => {
    const mockHttpFetch = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    const ctx = {
      ...createTestContext(tmpDir),
      httpFetch: mockHttpFetch as unknown as typeof globalThis.fetch,
      config: { webSearch: { provider: "bing" } },
    };
    const result = await handleWebSearch({ query: "fail" }, ctx);
    expect(result["results"]).toEqual([]);
    expect(result["error"]).toBeDefined();
  });
});

describe("tool:web-fetch", () => {
  it("URL 获取失败应返回错误信息", async () => {
    const ctx = createTestContext(tmpDir);
    const result = await handleWebFetch(
      { url: "http://localhost:1/nonexistent", timeout: 1000 },
      ctx,
    );
    expect(result["success"]).toBe(false);
    expect(result["error"]).toBeDefined();
  });
});

describe("tool:search-skill", () => {
  it("应返回技能搜索结果", async () => {
    // 创建 skill.md
    const skillContent = [
      "---",
      "type: skill",
      'name: "技能注册表"',
      'description: "技能名称、id、描述、路径"',
      'version: "1.0.0"',
      "---",
      "| 名称 | ID | 描述 | 路径 |",
    ].join("\n");
    await writeFile(join(tmpDir, "prompts", "skill.md"), skillContent, "utf-8");

    const ctx = createTestContext(tmpDir);
    const result = await handleSearchSkill({ query: "技能" }, ctx);
    expect(result["query"]).toBe("技能");
  });
});

describe("tool:create-skill", () => {
  it("应创建技能模板文件", async () => {
    // 创建 skill.md 用于追加
    const skillContent = [
      "---",
      "type: skill",
      'name: "技能注册表"',
      'description: "技能注册表"',
      'version: "1.0.0"',
      "---",
      "| 名称 | ID | 描述 | 路径 |",
    ].join("\n");
    await writeFile(join(tmpDir, "prompts", "skill.md"), skillContent, "utf-8");

    const ctx = createTestContext(tmpDir);
    const result = await handleCreateSkill(
      {
        name: "文件摘要",
        description: "读取文件并生成摘要",
        promptTemplate: "请读取文件 {{path}} 并生成摘要",
        tags: ["摘要", "文件"],
      },
      ctx,
    );
    expect(result["skillId"]).toBe("skill:文件摘要");
    const templatePath = result["templatePath"] as string;
    const content = await readFile(templatePath, "utf-8");
    expect(content).toContain("文件摘要");
    expect(content).toContain("请读取文件");
  });
});

describe("二级工具 Zod 校验", () => {
  it("所有 schema 应正确导出", async () => {
    const schemas = await import("../../../src/tool/schema.js");
    expect(schemas.bashInputSchema).toBeDefined();
    expect(schemas.readInputSchema).toBeDefined();
    expect(schemas.writeInputSchema).toBeDefined();
    expect(schemas.editInputSchema).toBeDefined();
    expect(schemas.findInputSchema).toBeDefined();
    expect(schemas.webSearchInputSchema).toBeDefined();
    expect(schemas.webFetchInputSchema).toBeDefined();
    expect(schemas.searchSkillInputSchema).toBeDefined();
    expect(schemas.createSkillInputSchema).toBeDefined();
  });
});
