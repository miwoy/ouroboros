/**
 * 长期记忆测试
 *
 * 压缩摘要管理 + section 追加
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLongTermMemory } from "../../src/memory/long-term.js";
import { createShortTermMemory } from "../../src/memory/short-term.js";

describe("createLongTermMemory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "long-mem-"));
    await mkdir(join(tmpDir, "prompts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("文件不存在时 load 应返回空字符串", async () => {
    const mem = createLongTermMemory(tmpDir);
    const content = await mem.load();
    expect(content).toBe("");
  });

  it("load 应读取 memory.md 内容", async () => {
    const memPath = join(tmpDir, "prompts", "memory.md");
    await writeFile(memPath, "# 长期记忆\n\n已有内容", "utf-8");

    const mem = createLongTermMemory(tmpDir);
    const content = await mem.load();
    expect(content).toContain("已有内容");
  });

  it("appendKnowledge 应在知识摘要 section 追加", async () => {
    const mem = createLongTermMemory(tmpDir);
    await mem.appendKnowledge("TypeScript 使用 readonly 保持不可变");

    const memPath = join(tmpDir, "prompts", "memory.md");
    const content = await readFile(memPath, "utf-8");
    expect(content).toContain("## 知识摘要");
    expect(content).toContain("- TypeScript 使用 readonly 保持不可变");
  });

  it("appendPattern 应在行为模式 section 追加", async () => {
    const mem = createLongTermMemory(tmpDir);
    await mem.appendPattern("先写测试再写实现");

    const memPath = join(tmpDir, "prompts", "memory.md");
    const content = await readFile(memPath, "utf-8");
    expect(content).toContain("## 行为模式");
    expect(content).toContain("- 先写测试再写实现");
  });

  it("appendDecision 应在重要决策 section 追加", async () => {
    const mem = createLongTermMemory(tmpDir);
    await mem.appendDecision("选择 Vitest 作为测试框架");

    const memPath = join(tmpDir, "prompts", "memory.md");
    const content = await readFile(memPath, "utf-8");
    expect(content).toContain("## 重要决策");
    expect(content).toContain("- 选择 Vitest 作为测试框架");
  });

  it("多次追加应在同一 section 中累积", async () => {
    const mem = createLongTermMemory(tmpDir);
    await mem.appendKnowledge("知识一");
    await mem.appendKnowledge("知识二");

    const memPath = join(tmpDir, "prompts", "memory.md");
    const content = await readFile(memPath, "utf-8");
    expect(content).toContain("- 知识一");
    expect(content).toContain("- 知识二");
  });

  it("已有文件时应在对应 section 追加而非覆盖", async () => {
    const memPath = join(tmpDir, "prompts", "memory.md");
    const existing = [
      "# 长期记忆",
      "",
      "## 知识摘要",
      "",
      "- 已有知识",
      "",
      "## 行为模式",
      "",
      "- 已有模式",
      "",
      "## 重要决策",
      "",
      "- 已有决策",
    ].join("\n");
    await writeFile(memPath, existing, "utf-8");

    const mem = createLongTermMemory(tmpDir);
    await mem.appendKnowledge("新知识");

    const content = await readFile(memPath, "utf-8");
    expect(content).toContain("- 已有知识");
    expect(content).toContain("- 新知识");
    expect(content).toContain("- 已有模式");
    expect(content).toContain("- 已有决策");
  });

  it("compressFromShortTerm 无记忆时应返回空字符串", async () => {
    const mem = createLongTermMemory(tmpDir);
    const mockCallModel = async () => ({ content: "", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
    const result = await mem.compressFromShortTerm("2026-01-01", mockCallModel);
    expect(result).toBe("");
  });

  it("compressFromShortTerm 应调用模型压缩短期记忆", async () => {
    // 先写入短期记忆
    const shortTerm = createShortTermMemory(tmpDir);
    await shortTerm.append({
      timestamp: "2026-03-02T10:00:00",
      type: "conversation",
      content: "讨论了项目架构",
    });

    let calledPrompt = "";
    const mockCallModel = async (req: { messages: Array<{ content: string }> }) => {
      calledPrompt = req.messages[0]!.content;
      return {
        content: "## 知识摘要\n- 项目采用分层架构",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };
    };

    const mem = createLongTermMemory(tmpDir);
    const result = await mem.compressFromShortTerm("2026-03-02", mockCallModel);

    expect(result).toContain("项目采用分层架构");
    expect(calledPrompt).toContain("交互记录");
    expect(calledPrompt).toContain("讨论了项目架构");
  });

  it("compressFromShortTerm 模型调用失败时应返回空字符串", async () => {
    const shortTerm = createShortTermMemory(tmpDir);
    await shortTerm.append({
      timestamp: "2026-03-02T10:00:00",
      type: "observation",
      content: "测试内容",
    });

    const mockCallModel = async () => {
      throw new Error("模型调用失败");
    };

    const mem = createLongTermMemory(tmpDir);
    const result = await mem.compressFromShortTerm("2026-03-02", mockCallModel);
    expect(result).toBe("");
  });

  it("compressFromShortTerm 应将摘要追加到 memory.md", async () => {
    const shortTerm = createShortTermMemory(tmpDir);
    await shortTerm.append({
      timestamp: "2026-03-02T10:00:00",
      type: "conversation",
      content: "讨论内容",
    });

    const mockCallModel = async () => ({
      content: "压缩后的摘要内容",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const mem = createLongTermMemory(tmpDir);
    await mem.compressFromShortTerm("2026-03-02", mockCallModel);

    const memPath = join(tmpDir, "prompts", "memory.md");
    const content = await readFile(memPath, "utf-8");
    expect(content).toContain("2026-03-02 摘要");
    expect(content).toContain("压缩后的摘要内容");
  });
});
