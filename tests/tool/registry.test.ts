/**
 * 工具注册表单元测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createToolRegistry } from "../../src/tool/registry.js";
import { EntityStatus, EntityType, type OuroborosTool } from "../../src/tool/types.js";

// Mock 文件系统操作
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock prompt store（appendToPromptFile）
vi.mock("../../src/prompt/store.js", () => ({
  appendToPromptFile: vi.fn().mockResolvedValue(undefined),
  getPromptFilePath: vi.fn().mockReturnValue("/mock/workspace/prompts/tool.md"),
}));

// Mock vector（isQmdAvailable、updateVectorIndex）
vi.mock("../../src/prompt/vector.js", () => ({
  isQmdAvailable: vi.fn().mockResolvedValue(false),
  updateVectorIndex: vi.fn().mockResolvedValue(undefined),
}));

describe("createToolRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应注册 4 个内置工具", async () => {
    const registry = await createToolRegistry("/mock/workspace");
    const tools = registry.list();

    expect(tools.length).toBeGreaterThanOrEqual(4);
    expect(registry.has("tool:call-model")).toBe(true);
    expect(registry.has("tool:run-agent")).toBe(true);
    expect(registry.has("tool:search-tool")).toBe(true);
    expect(registry.has("tool:create-tool")).toBe(true);
  });

  it("应能获取工具定义", async () => {
    const registry = await createToolRegistry("/mock/workspace");
    const tool = registry.get("tool:call-model");

    expect(tool).toBeDefined();
    expect(tool!.name).toBe("模型调用");
    expect(tool!.type).toBe(EntityType.Tool);
    expect(tool!.origin).toBe("system");
  });

  it("获取不存在的工具应返回 undefined", async () => {
    const registry = await createToolRegistry("/mock/workspace");
    expect(registry.get("tool:nonexistent")).toBeUndefined();
  });

  it("has 应正确检测工具存在性", async () => {
    const registry = await createToolRegistry("/mock/workspace");
    expect(registry.has("tool:call-model")).toBe(true);
    expect(registry.has("tool:nonexistent")).toBe(false);
  });

  it("listCustom 应排除内置工具", async () => {
    const registry = await createToolRegistry("/mock/workspace");
    const custom = registry.listCustom();
    expect(custom.every((t) => t.origin !== "system")).toBe(true);
  });
});

describe("registry.register", () => {
  it("应注册自定义工具", async () => {
    const registry = await createToolRegistry("/mock/workspace");

    const customTool: OuroborosTool = {
      id: "tool:custom-test",
      type: EntityType.Tool,
      name: "自定义测试",
      description: "测试用自定义工具",
      version: "1.0.0",
      status: EntityStatus.Active,
      permissions: {},
      origin: "generated",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entrypoint: "scripts/custom-test.js",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    };

    await registry.register(customTool);

    expect(registry.has("tool:custom-test")).toBe(true);
    expect(registry.get("tool:custom-test")!.name).toBe("自定义测试");
    expect(registry.listCustom()).toHaveLength(1);
  });

  it("内置工具注册不应持久化", async () => {
    const { writeFile } = await import("node:fs/promises");
    const registry = await createToolRegistry("/mock/workspace");

    const builtinTool: OuroborosTool = {
      id: "tool:builtin-test",
      type: EntityType.Tool,
      name: "内置测试",
      description: "测试",
      version: "1.0.0",
      status: EntityStatus.Active,
      permissions: {},
      origin: "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entrypoint: "builtin:test",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    };

    vi.mocked(writeFile).mockClear();
    await registry.register(builtinTool);

    // 内置工具不触发写文件
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("registry.updateStatus", () => {
  it("应更新工具状态", async () => {
    const registry = await createToolRegistry("/mock/workspace");

    const updated = await registry.updateStatus("tool:call-model", EntityStatus.Deprecated);
    expect(updated.status).toBe(EntityStatus.Deprecated);
    expect(registry.get("tool:call-model")!.status).toBe(EntityStatus.Deprecated);
  });

  it("更新不存在的工具应抛出错误", async () => {
    const registry = await createToolRegistry("/mock/workspace");

    await expect(
      registry.updateStatus("tool:nonexistent", EntityStatus.Active),
    ).rejects.toThrow("不存在");
  });
});
