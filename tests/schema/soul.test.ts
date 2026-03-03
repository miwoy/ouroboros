/**
 * Soul schema tests
 */

import { describe, it, expect } from "vitest";
import {
  getDefaultSoulSchema,
  createSoulSchema,
  formatWorldModel,
  formatSelfAwareness,
  formatUserModel,
} from "../../src/schema/soul.js";

describe("getDefaultSoulSchema", () => {
  it("应返回完整的默认灵魂图式", () => {
    const schema = getDefaultSoulSchema();

    expect(schema.worldModel.principles.length).toBe(5);
    expect(schema.worldModel.knowledge).toBeTruthy();
    expect(schema.selfAwareness.name).toBe("");
    expect(schema.selfAwareness.identity).toBeTruthy();
    expect(schema.selfAwareness.purpose).toBeTruthy();
    expect(schema.selfAwareness.capabilities.length).toBeGreaterThan(0);
    expect(schema.selfAwareness.limitations.length).toBeGreaterThan(0);
    expect(schema.userModel.name).toBe("");
    expect(schema.userModel.preferences).toEqual([]);
    expect(schema.userModel.context).toBe("");
  });
});

describe("createSoulSchema", () => {
  it("应合并自定义世界模型", () => {
    const schema = createSoulSchema({ principles: ["自定义原则"] });

    expect(schema.worldModel.principles).toEqual(["自定义原则"]);
    expect(schema.worldModel.knowledge).toBeTruthy();
    expect(schema.selfAwareness.identity).toBeTruthy();
  });

  it("应合并自定义自我认知（含 name）", () => {
    const schema = createSoulSchema(undefined, {
      name: "小明",
      identity: "I am a test agent",
    });

    expect(schema.selfAwareness.name).toBe("小明");
    expect(schema.selfAwareness.identity).toBe("I am a test agent");
    expect(schema.selfAwareness.purpose).toBeTruthy(); // 默认值
  });

  it("应合并自定义用户模型", () => {
    const schema = createSoulSchema(undefined, undefined, {
      name: "张三",
      preferences: ["喜欢简洁"],
      context: "前端开发者",
    });

    expect(schema.userModel.name).toBe("张三");
    expect(schema.userModel.preferences).toEqual(["喜欢简洁"]);
    expect(schema.userModel.context).toBe("前端开发者");
  });

  it("无参数应返回默认值", () => {
    const schema = createSoulSchema();
    const defaultSchema = getDefaultSoulSchema();

    expect(schema.worldModel.principles).toEqual(defaultSchema.worldModel.principles);
    expect(schema.selfAwareness.identity).toBe(defaultSchema.selfAwareness.identity);
    expect(schema.userModel).toEqual(defaultSchema.userModel);
  });
});

describe("formatWorldModel", () => {
  it("应格式化为编号原则列表", () => {
    const schema = getDefaultSoulSchema();
    const text = formatWorldModel(schema.worldModel);

    expect(text).toContain("1. 自我指涉");
    expect(text).toContain("2. 最小作用量");
    expect(text).toContain("5. 均衡");
    expect(text).toContain("Knowledge");
  });
});

describe("formatSelfAwareness", () => {
  it("应格式化为可读文本（无 name 时不显示）", () => {
    const schema = getDefaultSoulSchema();
    const text = formatSelfAwareness(schema.selfAwareness);

    expect(text).not.toContain("**Name**");
    expect(text).toContain("Identity");
    expect(text).toContain("Purpose");
    expect(text).toContain("Capabilities");
    expect(text).toContain("Limitations");
  });

  it("有 name 时应显示", () => {
    const text = formatSelfAwareness({
      name: "小助手",
      identity: "I am a helper",
      purpose: "Help users",
      capabilities: ["cap1"],
      limitations: ["lim1"],
    });

    expect(text).toContain("**Name**: 小助手");
    expect(text).toContain("**Identity**: I am a helper");
  });
});

describe("formatUserModel", () => {
  it("无数据时应返回 Not yet known", () => {
    const text = formatUserModel({ name: "", preferences: [], context: "" });
    expect(text).toBe("Not yet known.");
  });

  it("有数据时应格式化", () => {
    const text = formatUserModel({
      name: "张三",
      preferences: ["简洁代码", "中文交流"],
      context: "全栈开发者",
    });

    expect(text).toContain("**Name**: 张三");
    expect(text).toContain("**Preferences**");
    expect(text).toContain("- 简洁代码");
    expect(text).toContain("- 中文交流");
    expect(text).toContain("**Context**: 全栈开发者");
  });

  it("仅有 name 时也应格式化", () => {
    const text = formatUserModel({ name: "李四", preferences: [], context: "" });
    expect(text).toContain("**Name**: 李四");
    expect(text).not.toContain("Not yet known.");
  });
});
