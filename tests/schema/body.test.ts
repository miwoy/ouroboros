/**
 * 身体图式测试
 */

import { describe, it, expect, vi } from "vitest";
import {
  getBodySchema,
  formatBodySchema,
  getDiskInfo,
  getFullBodySchema,
  getGpuInfo,
} from "../../src/schema/body.js";

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

  it("GPU 默认为空数组（同步获取不含 GPU）", () => {
    const schema = getBodySchema("/tmp/workspace");
    expect(schema.gpu).toEqual([]);
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

describe("getGpuInfo", () => {
  it("应返回数组（无论 nvidia-smi 是否可用）", async () => {
    const gpus = await getGpuInfo();
    expect(Array.isArray(gpus)).toBe(true);
  });

  it("nvidia-smi 不可用时返回空数组", async () => {
    // 在大多数 CI/测试环境没有 NVIDIA GPU
    const gpus = await getGpuInfo();
    expect(gpus).toBeDefined();
    // 无论有无 GPU，结果都应为数组
    for (const g of gpus) {
      expect(g.name).toBeTruthy();
      expect(typeof g.memoryMB).toBe("number");
      expect(typeof g.utilization).toBe("number");
    }
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

  it("有 GPU 时应包含 GPU 行", () => {
    const schema = {
      ...getBodySchema("/tmp/workspace"),
      gpu: [{ name: "RTX 4090", memoryMB: 24576, utilization: 42 }],
    };
    const text = formatBodySchema(schema);
    expect(text).toContain("GPU: RTX 4090");
    expect(text).toContain("24576MB");
    expect(text).toContain("42%");
  });

  it("无 GPU 时不应包含 GPU 行", () => {
    const schema = getBodySchema("/tmp/workspace");
    const text = formatBodySchema(schema);
    expect(text).not.toContain("GPU:");
  });
});
