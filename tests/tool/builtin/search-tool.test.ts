/**
 * tool:search-tool 内置工具单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSearchTool } from "../../../src/tool/builtin/search-tool.js";
import {
  EntityStatus,
  EntityType,
  type OuroborosTool,
  type ToolExecutionContext,
  type CallModelFn,
  type ToolRegistry,
} from "../../../src/tool/types.js";

// Mock 语义搜索（默认不可用）
vi.mock("../../../src/prompt/loader.js", () => ({
  searchBySemantic: vi.fn().mockResolvedValue([]),
}));

function createMockRegistry(tools: OuroborosTool[]): ToolRegistry {
  const map = new Map(tools.map((t) => [t.id, t]));
  return {
    get: (id: string) => map.get(id),
    has: (id: string) => map.has(id),
    list: () => [...map.values()],
    listCustom: () => [...map.values()].filter((t) => t.origin !== "system"),
    register: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockContext(tools: OuroborosTool[] = []): ToolExecutionContext {
  return {
    workspacePath: "/mock/workspace",
    callModel: vi.fn() as CallModelFn,
    registry: createMockRegistry(tools),
    caller: { entityId: "agent:main" },
  };
}

const calcTool: OuroborosTool = {
  id: "tool:calculator",
  type: EntityType.Tool,
  name: "加法计算器",
  description: "计算两个数字的和，支持数学计算",
  tags: ["数学", "计算", "加法"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: {},
  origin: "generated",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  entrypoint: "scripts/calculator.js",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};

describe("handleSearchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回匹配的工具", async () => {
    const ctx = createMockContext([calcTool]);

    const result = (await handleSearchTool({ query: "数学计算" }, ctx)) as {
      tools: readonly { id: string; score: number }[];
      total: number;
    };

    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools[0].id).toBe("tool:calculator");
  });

  it("应匹配 name", async () => {
    const ctx = createMockContext([calcTool]);

    const result = (await handleSearchTool({ query: "计算器" }, ctx)) as {
      tools: readonly { id: string; score: number }[];
      total: number;
    };

    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools[0].id).toBe("tool:calculator");
  });

  it("应匹配 tags", async () => {
    const ctx = createMockContext([calcTool]);

    const result = (await handleSearchTool({ query: "加法" }, ctx)) as {
      tools: readonly { id: string; score: number }[];
      total: number;
    };

    expect(result.tools.length).toBeGreaterThan(0);
  });

  it("应在没有匹配时返回空", async () => {
    const ctx = createMockContext([calcTool]);

    const result = (await handleSearchTool({ query: "完全不相关的东西xyz" }, ctx)) as {
      tools: readonly { id: string }[];
      total: number;
    };

    expect(result.tools).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("应遵守 limit 参数", async () => {
    const tools = Array.from({ length: 10 }, (_, i) => ({
      ...calcTool,
      id: `tool:calc-${i}`,
      name: `数学计算器 ${i}`,
    }));
    const ctx = createMockContext(tools);

    const result = (await handleSearchTool({ query: "数学", limit: 3 }, ctx)) as {
      tools: readonly { id: string }[];
      total: number;
    };

    expect(result.tools.length).toBeLessThanOrEqual(3);
  });

  it("应拒绝无效输入", async () => {
    const ctx = createMockContext([]);

    await expect(handleSearchTool({ query: "" }, ctx)).rejects.toThrow("输入校验失败");
  });

  it("应匹配 description 中的关键词", async () => {
    const tool: OuroborosTool = {
      ...calcTool,
      id: "tool:special",
      name: "特殊工具",
      description: "这是一个处理文本翻译的工具",
      tags: [],
    };
    const ctx = createMockContext([tool]);

    const result = (await handleSearchTool({ query: "翻译" }, ctx)) as {
      tools: readonly { id: string }[];
      total: number;
    };

    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools[0].id).toBe("tool:special");
  });

  it("应处理 qmd 语义搜索结果", async () => {
    const { searchBySemantic } = await import("../../../src/prompt/loader.js");
    vi.mocked(searchBySemantic).mockResolvedValueOnce([
      {
        fileType: "tool",
        fileName: "tool.md",
        content: "| 加法计算器 | tool:calculator | 计算两个数字的和 | scripts/calc.js |",
        score: 0.95,
      },
    ]);

    const ctx = createMockContext([calcTool]);

    const result = (await handleSearchTool({ query: "计算" }, ctx)) as {
      tools: readonly { id: string; score: number }[];
      total: number;
    };

    expect(result.tools.length).toBeGreaterThan(0);
    // qmd 结果应被包含（通过 extractToolsFromContent）
    expect(result.tools.some((t) => t.id === "tool:calculator")).toBe(true);
  });

  it("应优雅处理 qmd 搜索失败", async () => {
    const { searchBySemantic } = await import("../../../src/prompt/loader.js");
    vi.mocked(searchBySemantic).mockRejectedValueOnce(new Error("qmd 失败"));

    const ctx = createMockContext([calcTool]);

    // 应回退到内存搜索
    const result = (await handleSearchTool({ query: "数学" }, ctx)) as {
      tools: readonly { id: string }[];
      total: number;
    };

    expect(result.tools.length).toBeGreaterThan(0);
  });

  it("应处理非 tool 类型的 qmd 结果", async () => {
    const { searchBySemantic } = await import("../../../src/prompt/loader.js");
    vi.mocked(searchBySemantic).mockResolvedValueOnce([
      {
        fileType: "skill",
        fileName: "skill.md",
        content: "一些技能内容",
        score: 0.9,
      },
    ]);

    const ctx = createMockContext([]);

    const result = (await handleSearchTool({ query: "技能" }, ctx)) as {
      tools: readonly { id: string }[];
      total: number;
    };

    // 非 tool 类型不应包含在结果中
    expect(result.tools).toHaveLength(0);
  });
});
