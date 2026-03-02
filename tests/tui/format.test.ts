/**
 * TUI 格式化工具测试
 */

import { describe, it, expect } from "vitest";
import {
  bold,
  dim,
  green,
  red,
  yellow,
  cyan,
  gray,
  blue,
  magenta,
  separator,
  formatTime,
} from "../../src/tui/format.js";

describe("ANSI 格式化", () => {
  it("bold 应包含加粗控制码", () => {
    const result = bold("test");
    expect(result).toContain("\x1b[1m");
    expect(result).toContain("test");
    expect(result).toContain("\x1b[0m");
  });

  it("dim 应包含暗淡控制码", () => {
    const result = dim("text");
    expect(result).toContain("\x1b[2m");
    expect(result).toContain("text");
  });

  it("各颜色函数应包含对应控制码", () => {
    expect(green("g")).toContain("\x1b[32m");
    expect(red("r")).toContain("\x1b[31m");
    expect(yellow("y")).toContain("\x1b[33m");
    expect(cyan("c")).toContain("\x1b[36m");
    expect(gray("g")).toContain("\x1b[90m");
    expect(blue("b")).toContain("\x1b[34m");
    expect(magenta("m")).toContain("\x1b[35m");
  });

  it("所有格式化函数应以 reset 结尾", () => {
    const reset = "\x1b[0m";
    expect(bold("x").endsWith(reset)).toBe(true);
    expect(dim("x").endsWith(reset)).toBe(true);
    expect(green("x").endsWith(reset)).toBe(true);
    expect(red("x").endsWith(reset)).toBe(true);
    expect(yellow("x").endsWith(reset)).toBe(true);
    expect(cyan("x").endsWith(reset)).toBe(true);
  });
});

describe("separator", () => {
  it("应返回由横线组成的字符串", () => {
    const result = separator();
    expect(result).toContain("─");
  });
});

describe("formatTime", () => {
  it("应将 ISO 字符串转换为本地时间", () => {
    const result = formatTime("2026-01-01T12:30:45Z");
    // 不同时区输出不同，只验证格式包含数字和冒号
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});
