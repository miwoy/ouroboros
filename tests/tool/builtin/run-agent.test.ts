/**
 * tool:run-agent 内置工具单元测试
 */

import { describe, it, expect, vi } from "vitest";
import { handleRunAgent } from "../../../src/tool/builtin/run-agent.js";
import { ToolNotImplementedError } from "../../../src/errors/index.js";
import type { ToolExecutionContext, CallModelFn, ToolRegistry } from "../../../src/tool/types.js";

function createMockContext(): ToolExecutionContext {
  return {
    workspacePath: "/mock/workspace",
    callModel: vi.fn() as CallModelFn,
    registry: {} as ToolRegistry,
    caller: { entityId: "agent:core" },
  };
}

describe("handleRunAgent", () => {
  it("应抛出 ToolNotImplementedError", async () => {
    const ctx = createMockContext();

    await expect(
      handleRunAgent({ agentId: "agent:test", task: "执行测试" }, ctx),
    ).rejects.toThrow(ToolNotImplementedError);
  });

  it("错误消息应包含阶段四信息", async () => {
    const ctx = createMockContext();

    try {
      await handleRunAgent({ agentId: "agent:test", task: "测试" }, ctx);
      expect.fail("应该抛出错误");
    } catch (err) {
      expect(err).toBeInstanceOf(ToolNotImplementedError);
      expect((err as ToolNotImplementedError).message).toContain("阶段四");
    }
  });
});
