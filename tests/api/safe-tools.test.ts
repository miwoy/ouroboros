/**
 * 安全工具过滤测试
 */

import { describe, it, expect } from "vitest";
import { filterSafeTools } from "../../src/api/safe-tools.js";
import type { OuroborosTool } from "../../src/tool/types.js";
import { EntityType, EntityStatus } from "../../src/tool/types.js";

/** 创建测试工具 */
function makeTool(id: string): OuroborosTool {
  return {
    id,
    type: EntityType.Tool,
    name: id.replace("tool:", ""),
    description: `${id} 工具`,
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "system",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    entrypoint: `builtin:${id}`,
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
  };
}

describe("filterSafeTools", () => {
  it("应过滤掉 5 个危险工具", () => {
    const blocked = [
      "tool:bash",
      "tool:create-tool",
      "tool:call-model",
      "tool:run-agent",
      "tool:create-skill",
    ];
    const tools = blocked.map(makeTool);
    const result = filterSafeTools(tools);

    expect(result).toHaveLength(0);
  });

  it("应保留安全工具", () => {
    const safe = [
      "tool:read",
      "tool:write",
      "tool:edit",
      "tool:find",
      "tool:web-search",
      "tool:web-fetch",
      "tool:search-tool",
      "tool:search-skill",
    ];
    const tools = safe.map(makeTool);
    const result = filterSafeTools(tools);

    expect(result).toHaveLength(8);
  });

  it("混合工具列表应正确过滤", () => {
    const tools = [
      makeTool("tool:read"),
      makeTool("tool:bash"),
      makeTool("tool:write"),
      makeTool("tool:call-model"),
      makeTool("tool:web-search"),
    ];
    const result = filterSafeTools(tools);

    expect(result).toHaveLength(3);
    expect(result.map((t) => t.id)).toEqual([
      "tool:read",
      "tool:write",
      "tool:web-search",
    ]);
  });

  it("空列表应返回空列表", () => {
    expect(filterSafeTools([])).toHaveLength(0);
  });
});
