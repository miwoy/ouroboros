import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  extractVariables,
  validateVariables,
} from "../../src/prompt/template.js";
import type { TemplateVariable } from "../../src/prompt/types.js";

describe("extractVariables", () => {
  it("应该提取所有模板变量名", () => {
    const content = "你好 {{userName}}，欢迎来到 {{systemName}}";
    const vars = extractVariables(content);
    expect(vars).toEqual(["userName", "systemName"]);
  });

  it("应该去重", () => {
    const content = "{{name}} 说：{{name}} 你好";
    const vars = extractVariables(content);
    expect(vars).toEqual(["name"]);
  });

  it("没有变量时返回空数组", () => {
    const content = "普通文本，没有变量";
    const vars = extractVariables(content);
    expect(vars).toEqual([]);
  });

  it("应该处理含空格的变量名（忽略）", () => {
    const content = "{{ name }} 和 {{valid}}";
    const vars = extractVariables(content);
    // 只匹配严格格式 {{varName}}，不含空格
    expect(vars).toEqual(["valid"]);
  });

  it("应该处理嵌套花括号（不匹配）", () => {
    const content = "{{{nested}}} 和 {{normal}}";
    const vars = extractVariables(content);
    expect(vars).toContain("normal");
  });
});

describe("validateVariables", () => {
  const declarations: readonly TemplateVariable[] = [
    { name: "userName", description: "用户名", required: true },
    { name: "greeting", description: "问候语", required: true },
    { name: "suffix", description: "后缀", required: false, defaultValue: "！" },
  ];

  it("所有必填变量都提供时返回空数组", () => {
    const missing = validateVariables(declarations, {
      userName: "张三",
      greeting: "你好",
    });
    expect(missing).toEqual([]);
  });

  it("缺少必填变量时返回缺失列表", () => {
    const missing = validateVariables(declarations, { userName: "张三" });
    expect(missing).toEqual(["greeting"]);
  });

  it("缺少多个必填变量时全部返回", () => {
    const missing = validateVariables(declarations, {});
    expect(missing).toEqual(["userName", "greeting"]);
  });

  it("可选变量不需要提供", () => {
    const missing = validateVariables(declarations, {
      userName: "张三",
      greeting: "你好",
    });
    expect(missing).toEqual([]);
  });

  it("空声明列表返回空数组", () => {
    const missing = validateVariables([], {});
    expect(missing).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("应该替换模板变量", () => {
    const result = renderTemplate("你好 {{userName}}", { userName: "张三" });
    expect(result).toBe("你好 张三");
  });

  it("应该替换多个不同变量", () => {
    const result = renderTemplate(
      "{{greeting}} {{userName}}",
      { greeting: "你好", userName: "张三" },
    );
    expect(result).toBe("你好 张三");
  });

  it("应该替换同一变量的多次出现", () => {
    const result = renderTemplate(
      "{{name}} 说：{{name}} 你好",
      { name: "张三" },
    );
    expect(result).toBe("张三 说：张三 你好");
  });

  it("未声明的变量保持原样", () => {
    const result = renderTemplate("{{known}} 和 {{unknown}}", { known: "已知" });
    expect(result).toBe("已知 和 {{unknown}}");
  });

  it("应该使用 defaultValue 替换未提供的可选变量", () => {
    const declarations: readonly TemplateVariable[] = [
      { name: "name", description: "名称", required: true },
      { name: "suffix", description: "后缀", required: false, defaultValue: "！" },
    ];
    const result = renderTemplate(
      "你好 {{name}}{{suffix}}",
      { name: "张三" },
      declarations,
    );
    expect(result).toBe("你好 张三！");
  });

  it("没有 defaultValue 的可选变量使用空字符串", () => {
    const declarations: readonly TemplateVariable[] = [
      { name: "name", description: "名称", required: true },
      { name: "extra", description: "额外", required: false },
    ];
    const result = renderTemplate(
      "你好 {{name}}{{extra}}",
      { name: "张三" },
      declarations,
    );
    expect(result).toBe("你好 张三");
  });

  it("缺少必填变量时应抛出错误", () => {
    const declarations: readonly TemplateVariable[] = [
      { name: "name", description: "名称", required: true },
    ];
    expect(() =>
      renderTemplate("你好 {{name}}", {}, declarations),
    ).toThrow("缺少必填模板变量: name");
  });

  it("应该支持 Map 类型的变量值", () => {
    const vars = new Map([["name", "张三"]]);
    const result = renderTemplate("你好 {{name}}", vars);
    expect(result).toBe("你好 张三");
  });

  it("空模板返回空字符串", () => {
    const result = renderTemplate("", {});
    expect(result).toBe("");
  });
});
