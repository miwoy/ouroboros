/**
 * Scratchpad 步骤日志注入 — 单元测试
 */

import { describe, it, expect } from "vitest";
import { buildScratchpad, toStepLogEntry, type StepLogEntry } from "../../src/core/scratchpad.js";
import type { ToolCallResult } from "../../src/core/types.js";

// ─── 辅助函数 ────────────────────────────────────────────────

function makeEntry(overrides: Partial<StepLogEntry> = {}): StepLogEntry {
  return {
    stepIndex: 0,
    toolId: "tool:test",
    inputSummary: '{"query":"hello"}',
    outputSummary: '{"result":"world"}',
    success: true,
    ...overrides,
  };
}

function makeEntries(count: number): StepLogEntry[] {
  return Array.from({ length: count }, (_, i) => makeEntry({ stepIndex: i, toolId: `tool:t${i}` }));
}

// ─── buildScratchpad ─────────────────────────────────────────

describe("buildScratchpad", () => {
  it("空输入返回空字符串", () => {
    expect(buildScratchpad([])).toBe("");
  });

  it("单条条目正确格式化", () => {
    const entries = [makeEntry({ stepIndex: 0, toolId: "tool:bash", outputSummary: "ok" })];
    const result = buildScratchpad(entries);
    expect(result).toBe("[步骤 1] tool:bash → 成功: ok");
  });

  it("失败条目显示失败状态", () => {
    const entries = [makeEntry({ success: false, outputSummary: "超时" })];
    const result = buildScratchpad(entries);
    expect(result).toContain("失败: 超时");
  });

  it("多条条目逐行展示", () => {
    const entries = makeEntries(5);
    const result = buildScratchpad(entries);
    const lines = result.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("[步骤 1]");
    expect(lines[4]).toContain("[步骤 5]");
  });

  it("≤30 条全部展示", () => {
    const entries = makeEntries(30);
    const result = buildScratchpad(entries);
    const lines = result.split("\n");
    expect(lines).toHaveLength(30);
    expect(result).not.toContain("省略");
  });

  it(">30 条截断：前 5 + 省略 + 后 25", () => {
    const entries = makeEntries(40);
    const result = buildScratchpad(entries);
    const lines = result.split("\n");
    // 5（头）+ 1（省略）+ 25（尾）= 31
    expect(lines).toHaveLength(31);
    expect(lines[0]).toContain("[步骤 1]");
    expect(lines[4]).toContain("[步骤 5]");
    expect(lines[5]).toBe("...省略 10 条...");
    expect(lines[6]).toContain("[步骤 16]");
    expect(lines[30]).toContain("[步骤 40]");
  });

  it(">30 条省略数量正确", () => {
    const entries = makeEntries(50);
    const result = buildScratchpad(entries);
    expect(result).toContain("...省略 20 条...");
  });
});

// ─── toStepLogEntry ──────────────────────────────────────────

describe("toStepLogEntry", () => {
  it("成功调用正确转换", () => {
    const tcr: ToolCallResult = {
      toolId: "tool:bash",
      requestId: "req-1",
      input: { command: "ls -la" },
      output: { stdout: "file1\nfile2" },
      success: true,
      duration: 100,
    };
    const entry = toStepLogEntry(3, tcr);
    expect(entry.stepIndex).toBe(3);
    expect(entry.toolId).toBe("tool:bash");
    expect(entry.success).toBe(true);
    expect(entry.inputSummary).toContain("ls -la");
    expect(entry.outputSummary).toContain("file1");
  });

  it("失败调用使用 error 作为 outputSummary", () => {
    const tcr: ToolCallResult = {
      toolId: "tool:bash",
      requestId: "req-2",
      input: { command: "bad" },
      success: false,
      error: "命令执行失败",
      duration: 50,
    };
    const entry = toStepLogEntry(1, tcr);
    expect(entry.success).toBe(false);
    expect(entry.outputSummary).toBe("命令执行失败");
  });

  it('无 output 时显示"成功"', () => {
    const tcr: ToolCallResult = {
      toolId: "tool:noop",
      requestId: "req-3",
      input: {},
      success: true,
      duration: 10,
    };
    const entry = toStepLogEntry(0, tcr);
    expect(entry.outputSummary).toBe("成功");
  });

  it("长输入截断到 100 字符", () => {
    const longInput = { data: "x".repeat(200) };
    const tcr: ToolCallResult = {
      toolId: "tool:test",
      requestId: "req-4",
      input: longInput,
      output: { ok: true },
      success: true,
      duration: 10,
    };
    const entry = toStepLogEntry(0, tcr);
    // 100 字符 + "..."
    expect(entry.inputSummary.length).toBeLessThanOrEqual(103);
    expect(entry.inputSummary).toContain("...");
  });

  it("长输出截断到 200 字符", () => {
    const tcr: ToolCallResult = {
      toolId: "tool:test",
      requestId: "req-5",
      input: {},
      output: { data: "y".repeat(300) },
      success: true,
      duration: 10,
    };
    const entry = toStepLogEntry(0, tcr);
    expect(entry.outputSummary.length).toBeLessThanOrEqual(203);
  });
});
