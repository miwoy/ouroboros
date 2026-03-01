import { describe, it, expect } from "vitest";
import { assemblePrompt } from "../../src/prompt/assembler.js";
import type { RenderedPrompt } from "../../src/prompt/types.js";

describe("assemblePrompt", () => {
  it("应该按优先级排序拼装提示词", () => {
    const parts: readonly RenderedPrompt[] = [
      { templateId: "skill:greeting", content: "技能提示词", category: "skill" },
      { templateId: "core:base", content: "核心提示词", category: "core" },
      { templateId: "system:main", content: "系统提示词", category: "system" },
    ];

    const result = assemblePrompt(parts);

    // 应该按优先级排序：core → system → skill
    expect(result.systemPrompt).toBe(
      "核心提示词\n\n---\n\n系统提示词\n\n---\n\n技能提示词",
    );
  });

  it("应该将上下文片段按顺序保存", () => {
    const parts: readonly RenderedPrompt[] = [
      { templateId: "memory:session", content: "记忆内容", category: "memory" },
      { templateId: "agent:main", content: "Agent 提示词", category: "agent" },
    ];

    const result = assemblePrompt(parts);
    expect(result.contextPrompts).toHaveLength(2);
    // 按优先级排序后的顺序
    expect(result.contextPrompts[0]).toBe("Agent 提示词");
    expect(result.contextPrompts[1]).toBe("记忆内容");
  });

  it("空输入应返回空结果", () => {
    const result = assemblePrompt([]);
    expect(result.systemPrompt).toBe("");
    expect(result.contextPrompts).toEqual([]);
  });

  it("单个提示词不应有分隔符", () => {
    const parts: readonly RenderedPrompt[] = [
      { templateId: "core:only", content: "唯一的提示词", category: "core" },
    ];

    const result = assemblePrompt(parts);
    expect(result.systemPrompt).toBe("唯一的提示词");
    expect(result.systemPrompt).not.toContain("---");
  });

  it("相同优先级的提示词应保持原始顺序", () => {
    const parts: readonly RenderedPrompt[] = [
      { templateId: "skill:a", content: "技能 A", category: "skill" },
      { templateId: "skill:b", content: "技能 B", category: "skill" },
      { templateId: "skill:c", content: "技能 C", category: "skill" },
    ];

    const result = assemblePrompt(parts);
    expect(result.systemPrompt).toBe("技能 A\n\n---\n\n技能 B\n\n---\n\n技能 C");
  });

  it("应该覆盖所有分类的优先级排序", () => {
    const parts: readonly RenderedPrompt[] = [
      { templateId: "memory:m", content: "记忆", category: "memory" },
      { templateId: "tool:t", content: "工具", category: "tool" },
      { templateId: "skill:s", content: "技能", category: "skill" },
      { templateId: "agent:a", content: "Agent", category: "agent" },
      { templateId: "schema:sc", content: "图式", category: "schema" },
      { templateId: "system:sys", content: "系统", category: "system" },
      { templateId: "core:c", content: "核心", category: "core" },
    ];

    const result = assemblePrompt(parts);

    // 验证顺序: core → system → schema → agent → skill → tool → memory
    const expected = "核心\n\n---\n\n系统\n\n---\n\n图式\n\n---\n\nAgent\n\n---\n\n技能\n\n---\n\n工具\n\n---\n\n记忆";
    expect(result.systemPrompt).toBe(expected);
  });
});
