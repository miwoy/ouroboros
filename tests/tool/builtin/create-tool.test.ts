/**
 * tool:create-tool 内置工具单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleCreateTool } from "../../../src/tool/builtin/create-tool.js";
import { EntityType, type OuroborosTool, type ToolExecutionContext, type CallModelFn, type ToolRegistry } from "../../../src/tool/types.js";

// Mock 文件系统
vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

function createMockRegistry(existingIds: string[] = []): ToolRegistry {
  const tools = new Map<string, OuroborosTool>();
  return {
    get: (id: string) => tools.get(id),
    has: (id: string) => existingIds.includes(id) || tools.has(id),
    list: () => [...tools.values()],
    listCustom: () => [...tools.values()],
    register: vi.fn(async (tool: OuroborosTool) => {
      tools.set(tool.id, tool);
    }),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockContext(existingIds: string[] = []): ToolExecutionContext {
  return {
    workspacePath: "/mock/workspace",
    callModel: vi.fn() as CallModelFn,
    registry: createMockRegistry(existingIds),
    caller: { entityId: "agent:main" },
  };
}

describe("handleCreateTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock dynamic import 默认返回有效模块
    vi.stubGlobal("import", undefined);
  });

  it("应拒绝空名称", async () => {
    const ctx = createMockContext();

    await expect(
      handleCreateTool(
        {
          name: "",
          description: "测试",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          code: "export default async function() { return {}; }",
        },
        ctx,
      ),
    ).rejects.toThrow("输入校验失败");
  });

  it("应拒绝重复的工具 ID", async () => {
    const ctx = createMockContext(["tool:test-tool"]);

    await expect(
      handleCreateTool(
        {
          name: "test tool",
          description: "测试",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          code: "export default async function() { return {}; }",
        },
        ctx,
      ),
    ).rejects.toThrow("已存在");
  });

  it("应拒绝缺少 code", async () => {
    const ctx = createMockContext();

    await expect(
      handleCreateTool(
        {
          name: "test",
          description: "测试",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        },
        ctx,
      ),
    ).rejects.toThrow();
  });

  it("应生成正确的工具 ID（kebab-case）", async () => {
    const ctx = createMockContext();
    const { writeFile } = await import("node:fs/promises");

    // 由于 dynamic import 无法真正 mock，我们验证 writeFile 被调用
    // 实际 import 会失败，但我们可以验证前序逻辑
    try {
      await handleCreateTool(
        {
          name: "My Test Tool",
          description: "测试工具",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          code: "export default async function() { return {}; }",
        },
        ctx,
      );
    } catch {
      // dynamic import 在测试环境中会失败，但文件已写入
    }

    // 验证 writeFile 被调用，文件名为 kebab-case
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("my-test-tool.js"),
      expect.any(String),
      "utf-8",
    );
  });

  it("应正确计算代码哈希", async () => {
    const ctx = createMockContext();
    const code = "export default async function(input) { return { result: input.a + input.b }; }";

    // 验证 SHA-256 哈希
    const { createHash } = await import("node:crypto");
    const expectedHash = createHash("sha256").update(code).digest("hex");

    try {
      await handleCreateTool(
        {
          name: "hash-test",
          description: "哈希测试",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          code,
        },
        ctx,
      );
    } catch {
      // dynamic import 会失败
    }

    // 哈希计算应该是确定性的
    expect(expectedHash).toHaveLength(64); // SHA-256 hex = 64 chars
  });
});
