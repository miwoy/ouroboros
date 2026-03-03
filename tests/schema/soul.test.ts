/**
 * Soul schema tests
 */

import { describe, it, expect } from "vitest";
import {
  getDefaultSoulSchema,
  createSoulSchema,
  formatWorldModel,
  formatSelfAwareness,
} from "../../src/schema/soul.js";

describe("getDefaultSoulSchema", () => {
  it("应返回完整的默认灵魂图式", () => {
    const schema = getDefaultSoulSchema();

    expect(schema.worldModel.rules.length).toBeGreaterThan(0);
    expect(schema.worldModel.constraints.length).toBeGreaterThan(0);
    expect(schema.worldModel.knowledge).toBeTruthy();
    expect(schema.selfAwareness.identity).toBeTruthy();
    expect(schema.selfAwareness.purpose).toBeTruthy();
    expect(schema.selfAwareness.capabilities.length).toBeGreaterThan(0);
    expect(schema.selfAwareness.limitations.length).toBeGreaterThan(0);
  });
});

describe("createSoulSchema", () => {
  it("应合并自定义世界模型", () => {
    const schema = createSoulSchema({ rules: ["Custom rule"] });

    expect(schema.worldModel.rules).toEqual(["Custom rule"]);
    // 其他字段使用默认值
    expect(schema.worldModel.constraints.length).toBeGreaterThan(0);
    expect(schema.selfAwareness.identity).toBeTruthy();
  });

  it("应合并自定义自我认知", () => {
    const schema = createSoulSchema(undefined, { identity: "I am a test agent" });

    expect(schema.selfAwareness.identity).toBe("I am a test agent");
    expect(schema.selfAwareness.purpose).toBeTruthy(); // 默认值
  });

  it("无参数应返回默认值", () => {
    const schema = createSoulSchema();
    const defaultSchema = getDefaultSoulSchema();

    expect(schema.worldModel.rules).toEqual(defaultSchema.worldModel.rules);
    expect(schema.selfAwareness.identity).toBe(defaultSchema.selfAwareness.identity);
  });
});

describe("formatWorldModel", () => {
  it("应格式化为可读文本", () => {
    const schema = getDefaultSoulSchema();
    const text = formatWorldModel(schema.worldModel);

    expect(text).toContain("World Rules");
    expect(text).toContain("Constraints");
    expect(text).toContain("Knowledge");
  });
});

describe("formatSelfAwareness", () => {
  it("应格式化为可读文本", () => {
    const schema = getDefaultSoulSchema();
    const text = formatSelfAwareness(schema.selfAwareness);

    expect(text).toContain("Identity");
    expect(text).toContain("Purpose");
    expect(text).toContain("Capabilities");
    expect(text).toContain("Limitations");
  });
});
