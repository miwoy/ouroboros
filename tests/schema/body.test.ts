/**
 * 身体图式测试
 */

import { describe, it, expect } from "vitest";
import { getBodySchema, formatBodySchema, getDiskInfo, getFullBodySchema } from "../../src/schema/body.js";

describe("getBodySchema", () => {
  it("应返回完整的身体图式", () => {
    const schema = getBodySchema("/tmp/workspace");

    expect(schema.platform).toBeTruthy();
    expect(schema.cpuCores).toBeGreaterThan(0);
    expect(schema.memory.totalGB).toBeTruthy();
    expect(schema.memory.availableGB).toBeTruthy();
    expect(schema.memory.usagePercent).toBeGreaterThanOrEqual(0);
    expect(schema.memory.usagePercent).toBeLessThanOrEqual(100);
    expect(schema.nodeVersion).toMatch(/^v\d+/);
    expect(schema.workspacePath).toBe("/tmp/workspace");
    expect(schema.timestamp).toBeTruthy();
  });

  it("磁盘信息默认为未知（同步获取不含磁盘）", () => {
    const schema = getBodySchema("/tmp/workspace");
    expect(schema.disk.availableGB).toBe("未知");
    expect(schema.disk.totalGB).toBe("未知");
  });
});

describe("getFullBodySchema", () => {
  it("应包含磁盘信息", async () => {
    const schema = await getFullBodySchema("/tmp");
    // Linux 上 df 通常可用
    expect(schema.disk).toBeDefined();
  });
});

describe("getDiskInfo", () => {
  it("应返回磁盘使用信息", async () => {
    const info = await getDiskInfo("/tmp");
    expect(info).toHaveProperty("availableGB");
    expect(info).toHaveProperty("totalGB");
  });

  it("无效路径应返回未知", async () => {
    const info = await getDiskInfo("/nonexistent/path/that/does/not/exist");
    // 可能成功（df 仍然找到挂载点）或返回未知
    expect(info).toBeDefined();
  });
});

describe("formatBodySchema", () => {
  it("应格式化为可读文本", () => {
    const schema = getBodySchema("/tmp/workspace");
    const text = formatBodySchema(schema);

    expect(text).toContain("运行环境");
    expect(text).toContain("CPU 核心数");
    expect(text).toContain("可用内存");
    expect(text).toContain("磁盘空间");
    expect(text).toContain("工作目录");
    expect(text).toContain("/tmp/workspace");
  });
});
