/**
 * 技能执行器单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSkillExecutor } from "../../src/skill/executor.js";
import { EntityStatus, type SkillDefinition, type SkillRegistry } from "../../src/skill/types.js";
import type { ToolRegistry, OuroborosTool, CallModelFn } from "../../src/tool/types.js";
import type { ToolExecutor } from "../../src/tool/executor.js";
import type { Logger } from "../../src/logger/types.js";

/** 创建 mock 技能 */
function createMockSkill(overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    id: "skill:test-skill",
    type: "skill",
    name: "测试技能",
    description: "测试用技能",
    tags: ["test"],
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "user",
    createdAt: "",
    updatedAt: "",
    promptTemplate: "请执行任务: {{task}}",
    variables: [{ name: "task", description: "任务描述", required: true }],
    requiredTools: ["tool:bash"],
    inputDescription: "任务描述",
    outputDescription: "执行结果",
    ...overrides,
  };
}

/** 创建 mock Logger */
function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/** 创建 mock callModel（返回直接回答，不调用工具） */
function createMockCallModel(): CallModelFn {
  return vi.fn().mockResolvedValue({
    content: "任务执行完成",
    toolCalls: [],
    stopReason: "end_turn",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    model: "test-model",
  });
}

/** 创建 mock 工具 */
function createMockTool(id: string): OuroborosTool {
  return {
    id,
    type: "tool",
    name: id,
    description: `Mock tool ${id}`,
    tags: [],
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "system",
    createdAt: "",
    updatedAt: "",
    entrypoint: `builtin:${id.replace("tool:", "")}`,
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: {} },
  };
}

describe("createSkillExecutor", () => {
  let mockSkill: SkillDefinition;
  let skillRegistry: SkillRegistry;
  let toolRegistry: ToolRegistry;
  let toolExecutor: ToolExecutor;
  let callModel: CallModelFn;
  let logger: Logger;

  beforeEach(() => {
    mockSkill = createMockSkill();
    callModel = createMockCallModel();
    logger = createMockLogger();

    skillRegistry = {
      get: vi.fn((id: string) => (id === mockSkill.id ? mockSkill : undefined)),
      has: vi.fn((id: string) => id === mockSkill.id),
      list: vi.fn().mockReturnValue([mockSkill]),
      listByOrigin: vi.fn().mockReturnValue([]),
      register: vi.fn(),
      updateStatus: vi.fn(),
    };

    const bashTool = createMockTool("tool:bash");
    const callModelTool = createMockTool("tool:call-model");
    const searchToolTool = createMockTool("tool:search-tool");

    toolRegistry = {
      get: vi.fn((id: string) => {
        const map: Record<string, OuroborosTool> = {
          "tool:bash": bashTool,
          "tool:call-model": callModelTool,
          "tool:search-tool": searchToolTool,
        };
        return map[id];
      }),
      has: vi.fn().mockReturnValue(true),
      list: vi.fn().mockReturnValue([bashTool, callModelTool, searchToolTool]),
      listCustom: vi.fn().mockReturnValue([]),
      register: vi.fn(),
      updateStatus: vi.fn(),
    };

    toolExecutor = {
      execute: vi.fn().mockResolvedValue({
        requestId: "test",
        success: true,
        output: { result: "ok" },
        duration: 100,
      }),
    };
  });

  it("应成功执行技能", async () => {
    const executor = createSkillExecutor({
      skillRegistry,
      toolRegistry,
      toolExecutor,
      callModel,
      logger,
      workspacePath: "/tmp/test",
    });

    const response = await executor.execute({
      requestId: "req-1",
      skillId: "skill:test-skill",
      variables: { task: "测试任务" },
      caller: { entityId: "test" },
    });

    expect(response.requestId).toBe("req-1");
    expect(response.success).toBe(true);
    expect(response.result).toBe("任务执行完成");
    expect(response.duration).toBeGreaterThan(0);
  });

  it("技能不存在应返回错误", async () => {
    const executor = createSkillExecutor({
      skillRegistry,
      toolRegistry,
      toolExecutor,
      callModel,
      logger,
      workspacePath: "/tmp/test",
    });

    const response = await executor.execute({
      requestId: "req-2",
      skillId: "skill:nonexistent",
      variables: {},
      caller: { entityId: "test" },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe("NOT_FOUND");
  });

  it("技能状态非 active 应返回错误", async () => {
    const inactiveSkill = createMockSkill({ status: EntityStatus.Deprecated });
    (skillRegistry.get as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === inactiveSkill.id ? inactiveSkill : undefined,
    );

    const executor = createSkillExecutor({
      skillRegistry,
      toolRegistry,
      toolExecutor,
      callModel,
      logger,
      workspacePath: "/tmp/test",
    });

    const response = await executor.execute({
      requestId: "req-3",
      skillId: "skill:test-skill",
      variables: { task: "test" },
      caller: { entityId: "test" },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe("INVALID_STATUS");
  });

  it("缺少必填变量应返回错误", async () => {
    const executor = createSkillExecutor({
      skillRegistry,
      toolRegistry,
      toolExecutor,
      callModel,
      logger,
      workspacePath: "/tmp/test",
    });

    const response = await executor.execute({
      requestId: "req-4",
      skillId: "skill:test-skill",
      variables: {}, // 缺少 task 变量
      caller: { entityId: "test" },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe("INVALID_INPUT");
    expect(response.error?.message).toContain("task");
  });

  it("无变量声明的技能应正常执行", async () => {
    const noVarsSkill = createMockSkill({
      promptTemplate: "执行固定任务",
      variables: [],
    });
    (skillRegistry.get as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === noVarsSkill.id ? noVarsSkill : undefined,
    );

    const executor = createSkillExecutor({
      skillRegistry,
      toolRegistry,
      toolExecutor,
      callModel,
      logger,
      workspacePath: "/tmp/test",
    });

    const response = await executor.execute({
      requestId: "req-5",
      skillId: "skill:test-skill",
      variables: {},
      caller: { entityId: "test" },
    });

    expect(response.success).toBe(true);
  });

  it("应传递附加上下文", async () => {
    const executor = createSkillExecutor({
      skillRegistry,
      toolRegistry,
      toolExecutor,
      callModel,
      logger,
      workspacePath: "/tmp/test",
    });

    await executor.execute({
      requestId: "req-6",
      skillId: "skill:test-skill",
      variables: { task: "测试" },
      context: "这是附加上下文",
      caller: { entityId: "test" },
    });

    // 验证 callModel 被调用（ReAct 循环内部）
    expect(callModel).toHaveBeenCalled();
    const firstCall = (callModel as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // 用户消息应包含附加上下文
    const userMsg = firstCall.messages.find((m: { role: string }) => m.role === "user");
    expect(userMsg?.content).toContain("附加上下文");
  });

  it("应记录日志", async () => {
    const executor = createSkillExecutor({
      skillRegistry,
      toolRegistry,
      toolExecutor,
      callModel,
      logger,
      workspacePath: "/tmp/test",
    });

    await executor.execute({
      requestId: "req-7",
      skillId: "skill:test-skill",
      variables: { task: "测试" },
      caller: { entityId: "test" },
    });

    expect(logger.info).toHaveBeenCalled();
  });

  it("callModel 失败应返回 success=false", async () => {
    // ReAct 循环内部捕获 callModel 错误，返回 stopReason: 'error'
    (callModel as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("模型调用失败"));

    const executor = createSkillExecutor({
      skillRegistry,
      toolRegistry,
      toolExecutor,
      callModel,
      logger,
      workspacePath: "/tmp/test",
    });

    const response = await executor.execute({
      requestId: "req-8",
      skillId: "skill:test-skill",
      variables: { task: "测试" },
      caller: { entityId: "test" },
    });

    // ReAct 循环返回 stopReason='error'，executor 判断为 success=false
    expect(response.success).toBe(false);
  });
});
