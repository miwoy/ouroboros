import { describe, it, expect } from "vitest";
import { assemblePrompt } from "../../src/prompt/assembler.js";
import type { RenderedPrompt } from "../../src/prompt/types.js";

describe("assemblePrompt", () => {
  it("应该按优先级排序拼装提示词", () => {
    const parts: readonly RenderedPrompt[] = [
      { fileType: "skill", content: "技能提示词" },
      { fileType: "core", content: "核心提示词" },
      { fileType: "self", content: "自我图式" },
    ];

    const result = assemblePrompt(parts);

    // 应该按优先级排序：core → self → skill
    expect(result.systemPrompt).toBe(
      "核心提示词\n\n---\n\n自我图式\n\n---\n\n技能提示词",
    );
  });

  it("应该将上下文片段按顺序保存", () => {
    const parts: readonly RenderedPrompt[] = [
      { fileType: "memory", content: "记忆内容" },
      { fileType: "agent", content: "Agent 提示词" },
    ];

    const result = assemblePrompt(parts);
    expect(result.contextPrompts).toHaveLength(2);
    // 按优先级排序后的顺序：agent → memory
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
      { fileType: "core", content: "唯一的提示词" },
    ];

    const result = assemblePrompt(parts);
    expect(result.systemPrompt).toBe("唯一的提示词");
    expect(result.systemPrompt).not.toContain("---");
  });

  it("相同优先级的提示词应保持原始顺序", () => {
    const parts: readonly RenderedPrompt[] = [
      { fileType: "skill", content: "技能 A" },
      { fileType: "skill", content: "技能 B" },
      { fileType: "skill", content: "技能 C" },
    ];

    const result = assemblePrompt(parts);
    expect(result.systemPrompt).toBe("技能 A\n\n---\n\n技能 B\n\n---\n\n技能 C");
  });

  it("应该覆盖所有文件类型的优先级排序", () => {
    const parts: readonly RenderedPrompt[] = [
      { fileType: "memory", content: "记忆" },
      { fileType: "tool", content: "工具" },
      { fileType: "skill", content: "技能" },
      { fileType: "agent", content: "Agent" },
      { fileType: "self", content: "图式" },
      { fileType: "core", content: "核心" },
    ];

    const result = assemblePrompt(parts);

    // 验证顺序: core → self → agent → skill → tool → memory
    const expected = "核心\n\n---\n\n图式\n\n---\n\nAgent\n\n---\n\n技能\n\n---\n\n工具\n\n---\n\n记忆";
    expect(result.systemPrompt).toBe(expected);
  });
});
