/**
 * 转换器单元测试
 */

import { describe, it, expect } from "vitest";
import { toModelToolDefinition, toModelToolDefinitions } from "../../src/tool/converter.js";
import { EntityStatus, EntityType, type OuroborosTool } from "../../src/tool/types.js";

const mockTool: OuroborosTool = {
  id: "tool:test-tool",
  type: EntityType.Tool,
  name: "测试工具",
  description: "用于测试的工具",
  tags: ["test"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: {},
  origin: "system",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  entrypoint: "builtin:test",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "查询" },
      limit: { type: "number", description: "限制" },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      result: { type: "string" },
    },
  },
};

describe("toModelToolDefinition", () => {
  it("应正确转换工具定义", () => {
    const result = toModelToolDefinition(mockTool);

    expect(result.name).toBe("tool:test-tool");
    expect(result.description).toBe("用于测试的工具");
    expect(result.parameters.type).toBe("object");
    expect(result.parameters.required).toEqual(["query"]);
    expect(result.parameters.properties).toBeDefined();
  });

  it("应使用工具 id 作为 name", () => {
    const result = toModelToolDefinition(mockTool);
    expect(result.name).toBe(mockTool.id);
  });
});

describe("toModelToolDefinitions", () => {
  it("应批量转换工具定义", () => {
    const results = toModelToolDefinitions([mockTool, { ...mockTool, id: "tool:other" }]);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("tool:test-tool");
    expect(results[1].name).toBe("tool:other");
  });

  it("应处理空列表", () => {
    const results = toModelToolDefinitions([]);
    expect(results).toHaveLength(0);
  });
});
