/**
 * 响应格式化测试
 */

import { describe, it, expect } from "vitest";
import {
  formatAgentResponse,
  formatToolCall,
  formatStepsSummary,
  truncateText,
} from "../../src/api/formatter.js";
import type { ReactStep } from "../../src/core/types.js";

describe("formatAgentResponse", () => {
  it("无工具调用时应只返回回答", () => {
    const result = formatAgentResponse("这是回答", []);
    expect(result).toBe("这是回答");
  });

  it("有工具调用时应附加执行摘要", () => {
    const steps: ReactStep[] = [
      {
        stepIndex: 0,
        thought: "思考",
        toolCalls: [
          { toolId: "tool:read", requestId: "r1", input: {}, success: true, duration: 100 },
        ],
        duration: 200,
      },
      {
        stepIndex: 1,
        thought: "继续",
        toolCalls: [
          { toolId: "tool:write", requestId: "r2", input: {}, success: true, duration: 150 },
        ],
        duration: 250,
      },
    ];

    const result = formatAgentResponse("任务完成", steps);
    expect(result).toContain("任务完成");
    expect(result).toContain("2 个步骤");
    expect(result).toContain("2 次工具");
  });

  it("无工具调用的步骤不应计入摘要", () => {
    const steps: ReactStep[] = [
      { stepIndex: 0, thought: "纯思考", toolCalls: [], duration: 100 },
    ];

    const result = formatAgentResponse("回答", steps);
    expect(result).toBe("回答");
  });
});

describe("formatToolCall", () => {
  it("应格式化成功的工具调用", () => {
    const result = formatToolCall(
      "tool:read",
      { filePath: "/tmp/test.txt" },
      { content: "hello" },
      true,
    );

    expect(result).toContain("**tool:read** (success)");
    expect(result).toContain("输入:");
    expect(result).toContain("filePath");
    expect(result).toContain("输出:");
    expect(result).toContain("content");
  });

  it("应格式化失败的工具调用", () => {
    const result = formatToolCall(
      "tool:bash",
      { command: "ls" },
      undefined,
      false,
    );

    expect(result).toContain("(failed)");
    expect(result).not.toContain("输出:");
  });
});

describe("formatStepsSummary", () => {
  it("无步骤时应返回提示文本", () => {
    expect(formatStepsSummary([])).toBe("无执行步骤");
  });

  it("应格式化步骤列表", () => {
    const steps: ReactStep[] = [
      {
        stepIndex: 0,
        thought: "思考",
        toolCalls: [
          { toolId: "tool:read", requestId: "r1", input: {}, success: true, duration: 100 },
        ],
        duration: 200,
      },
      {
        stepIndex: 1,
        thought: "继续",
        toolCalls: [
          { toolId: "tool:write", requestId: "r2", input: {}, success: false, duration: 150 },
        ],
        duration: 250,
      },
    ];

    const result = formatStepsSummary(steps);
    expect(result).toContain("1. [ok] tool:read (200ms)");
    expect(result).toContain("2. [部分失败] tool:write (250ms)");
  });

  it("纯思考步骤应标记为思考", () => {
    const steps: ReactStep[] = [
      { stepIndex: 0, thought: "纯思考", toolCalls: [], duration: 100 },
    ];

    const result = formatStepsSummary(steps);
    expect(result).toContain("思考");
  });
});

describe("truncateText", () => {
  it("短文本应原样返回", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("长文本应截断并添加省略号", () => {
    const result = truncateText("abcdefghij", 8);
    expect(result).toBe("abcde...");
    expect(result.length).toBe(8);
  });

  it("刚好等于限制时不应截断", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });
});
