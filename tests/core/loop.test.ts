/**
 * ReAct 核心循环单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runReactLoop } from "../../src/core/loop.js";
import { TreeState, type ReactLoopConfig, type ReactDependencies } from "../../src/core/types.js";
import type { ModelResponse, TokenUsage } from "../../src/model/types.js";
import type {
  ToolCallResponse,
  OuroborosTool,
  ToolRegistry,
  CallModelFn,
} from "../../src/tool/types.js";
import type { ToolExecutor } from "../../src/tool/executor.js";
import type { Logger } from "../../src/logger/types.js";
import { EntityStatus, EntityType } from "../../src/tool/types.js";

/** 创建 mock Logger */
function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/** 创建 mock 工具 */
function createMockTool(id: string, name: string): OuroborosTool {
  return {
    id,
    type: EntityType.Tool,
    name,
    description: `${name} 工具`,
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

/** 创建 mock ToolExecutor */
function createMockExecutor(responses: Map<string, ToolCallResponse>): ToolExecutor {
  return {
    execute: vi.fn().mockImplementation(async (req) => {
      const resp = responses.get(req.toolId);
      if (resp) return resp;
      return {
        requestId: req.requestId,
        success: true,
        output: { result: "default" },
        duration: 10,
      };
    }),
  };
}

/** 创建 mock ToolRegistry */
function createMockRegistry(tools: readonly OuroborosTool[]): ToolRegistry {
  const map = new Map(tools.map((t) => [t.id, t]));
  return {
    get: (id) => map.get(id),
    has: (id) => map.has(id),
    list: () => [...map.values()],
    listCustom: () => [],
    register: vi.fn(),
    updateStatus: vi.fn(),
  };
}

/** 默认配置 */
const defaultConfig: ReactLoopConfig = {
  maxIterations: 20,
  stepTimeout: 60000,
  parallelToolCalls: true,
  compressionThreshold: 50,
  agentId: "agent:test",
};

/** 创建默认用量 */
function defaultUsage(): TokenUsage {
  return { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
}

describe("ReAct 核心循环", () => {
  describe("直接回答（无工具调用）", () => {
    it("模型直接回答时应返回单步结果", async () => {
      const callModel = vi.fn().mockResolvedValue({
        content: "今天是 2026 年 3 月 2 日",
        toolCalls: [],
        stopReason: "end_turn",
        usage: defaultUsage(),
        model: "test",
      } satisfies ModelResponse);

      const tools: OuroborosTool[] = [];
      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry(tools),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("今天几号？", "你是助手", tools, defaultConfig, deps);

      expect(result.answer).toContain("2026");
      expect(result.stopReason).toBe("completed");
      expect(result.totalIterations).toBe(1);
      expect(result.steps.length).toBe(1);
      expect(result.executionTree.state).toBe(TreeState.Completed);
    });
  });

  describe("工具调用", () => {
    it("应执行工具调用并返回结果", async () => {
      const getDateTool = createMockTool("tool:get-date", "获取日期");

      // 第一次调用：模型请求工具
      // 第二次调用：模型给出最终回答
      const callModel = vi
        .fn()
        .mockResolvedValueOnce({
          content: "让我查询日期",
          toolCalls: [
            {
              id: "tc-1",
              name: "tool:get-date",
              arguments: "{}",
            },
          ],
          stopReason: "tool_use",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse)
        .mockResolvedValueOnce({
          content: "今天是 2026-03-02",
          toolCalls: [],
          stopReason: "end_turn",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse);

      const executor = createMockExecutor(
        new Map([
          [
            "tool:get-date",
            {
              requestId: "tc-1",
              success: true,
              output: { date: "2026-03-02" },
              duration: 5,
            },
          ],
        ]),
      );

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: executor,
        toolRegistry: createMockRegistry([getDateTool]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("查询日期", "你是助手", [getDateTool], defaultConfig, deps);

      expect(result.stopReason).toBe("completed");
      expect(result.totalIterations).toBe(2);
      expect(result.steps.length).toBe(2);
      expect(result.steps[0]!.toolCalls.length).toBe(1);
      expect(result.steps[0]!.toolCalls[0]!.success).toBe(true);
      expect(executor.execute).toHaveBeenCalledTimes(1);
    });

    it("多个工具调用应并行执行（parallelToolCalls=true）", async () => {
      const tool1 = createMockTool("tool:a", "工具A");
      const tool2 = createMockTool("tool:b", "工具B");

      const callModel = vi
        .fn()
        .mockResolvedValueOnce({
          content: "需要调用两个工具",
          toolCalls: [
            { id: "tc-1", name: "tool:a", arguments: '{"x":1}' },
            { id: "tc-2", name: "tool:b", arguments: '{"y":2}' },
          ],
          stopReason: "tool_use",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse)
        .mockResolvedValueOnce({
          content: "完成",
          toolCalls: [],
          stopReason: "end_turn",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse);

      const executor = createMockExecutor(new Map());

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: executor,
        toolRegistry: createMockRegistry([tool1, tool2]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop(
        "任务",
        "系统提示",
        [tool1, tool2],
        { ...defaultConfig, parallelToolCalls: true },
        deps,
      );

      expect(result.steps[0]!.toolCalls.length).toBe(2);
      expect(executor.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe("最大迭代次数", () => {
    it("达到最大迭代次数应停止循环", async () => {
      // 模型每次都请求工具调用，永不结束
      const callModel = vi.fn().mockResolvedValue({
        content: "继续",
        toolCalls: [{ id: "tc-loop", name: "tool:a", arguments: "{}" }],
        stopReason: "tool_use",
        usage: defaultUsage(),
        model: "test",
      } satisfies ModelResponse);

      const tool = createMockTool("tool:a", "工具A");
      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([tool]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop(
        "任务",
        "系统",
        [tool],
        { ...defaultConfig, maxIterations: 3 },
        deps,
      );

      expect(result.stopReason).toBe("max_iterations");
      expect(result.totalIterations).toBe(3);
    });
  });

  describe("错误处理", () => {
    it("模型调用失败应返回 error 状态", async () => {
      const callModel = vi.fn().mockRejectedValue(new Error("API 限流"));

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("任务", "系统", [], defaultConfig, deps);

      expect(result.stopReason).toBe("error");
      expect(result.answer).toContain("模型调用失败");
      expect(result.executionTree.state).toBe(TreeState.Failed);
    });

    it("工具调用失败不应中断循环", async () => {
      const tool = createMockTool("tool:fail", "失败工具");

      const callModel = vi
        .fn()
        .mockResolvedValueOnce({
          content: "调用工具",
          toolCalls: [{ id: "tc-1", name: "tool:fail", arguments: "{}" }],
          stopReason: "tool_use",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse)
        .mockResolvedValueOnce({
          content: "工具失败了，已处理",
          toolCalls: [],
          stopReason: "end_turn",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse);

      const executor: ToolExecutor = {
        execute: vi.fn().mockResolvedValue({
          requestId: "tc-1",
          success: false,
          error: { code: "RUNTIME_ERROR", message: "执行失败", retryable: false },
          duration: 10,
        } satisfies ToolCallResponse),
      };

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: executor,
        toolRegistry: createMockRegistry([tool]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("任务", "系统", [tool], defaultConfig, deps);

      expect(result.stopReason).toBe("completed");
      expect(result.steps[0]!.toolCalls[0]!.success).toBe(false);
    });
  });

  describe("执行树", () => {
    it("应记录正确的节点结构", async () => {
      const tool = createMockTool("tool:test", "测试工具");

      const callModel = vi
        .fn()
        .mockResolvedValueOnce({
          content: "调用工具",
          toolCalls: [{ id: "tc-1", name: "tool:test", arguments: "{}" }],
          stopReason: "tool_use",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse)
        .mockResolvedValueOnce({
          content: "完成",
          toolCalls: [],
          stopReason: "end_turn",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse);

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([tool]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("任务", "系统", [tool], defaultConfig, deps);

      const { executionTree } = result;
      const nodeCount = Object.keys(executionTree.nodes).length;
      // root + model-call(1) + tool-call(1) + model-call(2) = 4
      expect(nodeCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe("onStep 回调", () => {
    it("直接回答时应调用 onStep 一次", async () => {
      const onStep = vi.fn();
      const callModel = vi.fn().mockResolvedValue({
        content: "回答",
        toolCalls: [],
        stopReason: "end_turn",
        usage: defaultUsage(),
        model: "test",
      } satisfies ModelResponse);

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
        onStep,
      };

      await runReactLoop("任务", "", [], defaultConfig, deps);

      expect(onStep).toHaveBeenCalledTimes(1);
      const [step, tree] = onStep.mock.calls[0];
      expect(step.stepIndex).toBe(0);
      expect(step.toolCalls).toHaveLength(0);
      expect(tree).toBeDefined();
      expect(tree.rootNodeId).toBeTruthy();
    });

    it("工具调用时应调用 onStep 传递步骤和执行树", async () => {
      const onStep = vi.fn();
      const tool = createMockTool("tool:t", "测试");

      const callModel = vi
        .fn()
        .mockResolvedValueOnce({
          content: "调用工具",
          toolCalls: [{ id: "tc-1", name: "tool:t", arguments: "{}" }],
          stopReason: "tool_use",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse)
        .mockResolvedValueOnce({
          content: "完成",
          toolCalls: [],
          stopReason: "end_turn",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse);

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([tool]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
        onStep,
      };

      await runReactLoop("任务", "", [tool], defaultConfig, deps);

      // 两步：工具调用 + 最终回答
      expect(onStep).toHaveBeenCalledTimes(2);

      // 第一步应包含工具调用
      const [step1] = onStep.mock.calls[0];
      expect(step1.toolCalls).toHaveLength(1);
      expect(step1.toolCalls[0].toolId).toBe("tool:t");
    });

    it("不提供 onStep 时应正常运行", async () => {
      const callModel = vi.fn().mockResolvedValue({
        content: "回答",
        toolCalls: [],
        stopReason: "end_turn",
        usage: defaultUsage(),
        model: "test",
      } satisfies ModelResponse);

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
        // 不提供 onStep
      };

      const result = await runReactLoop("任务", "", [], defaultConfig, deps);
      expect(result.stopReason).toBe("completed");
    });
  });

  describe("Usage 累加", () => {
    it("应累加所有迭代的 token 用量", async () => {
      const usage: TokenUsage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
      const callModel = vi
        .fn()
        .mockResolvedValueOnce({
          content: "调用",
          toolCalls: [{ id: "tc-1", name: "tool:a", arguments: "{}" }],
          stopReason: "tool_use",
          usage,
          model: "test",
        } satisfies ModelResponse)
        .mockResolvedValueOnce({
          content: "完成",
          toolCalls: [],
          stopReason: "end_turn",
          usage,
          model: "test",
        } satisfies ModelResponse);

      const tool = createMockTool("tool:a", "A");
      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([tool]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("任务", "系统", [tool], defaultConfig, deps);

      expect(result.totalUsage.promptTokens).toBe(20);
      expect(result.totalUsage.completionTokens).toBe(10);
      expect(result.totalUsage.totalTokens).toBe(30);
    });
  });

  describe("thinking 容错", () => {
    it("空响应但有 thinking 时应重试并成功", async () => {
      const callModel = vi
        .fn()
        // 第一次：空内容 + thinking
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [],
          stopReason: "end_turn",
          usage: defaultUsage(),
          model: "test",
          thinking: "让我思考一下这个问题...",
        } satisfies ModelResponse)
        // 重试：返回实际内容
        .mockResolvedValueOnce({
          content: "根据思考，答案是42",
          toolCalls: [],
          stopReason: "end_turn",
          usage: defaultUsage(),
          model: "test",
        } satisfies ModelResponse);

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("问题", "", [], defaultConfig, deps);

      expect(result.answer).toBe("根据思考，答案是42");
      expect(result.stopReason).toBe("completed");
      // 原始调用 + 重试 = 2 次
      expect(callModel).toHaveBeenCalledTimes(2);
    });

    it("重试仍失败时应降级使用 thinking 内容", async () => {
      const callModel = vi.fn().mockResolvedValue({
        content: "",
        toolCalls: [],
        stopReason: "end_turn",
        usage: defaultUsage(),
        model: "test",
        thinking: "我一直在思考但无法得出结论",
      } satisfies ModelResponse);

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("问题", "", [], defaultConfig, deps);

      // 降级使用 thinking 内容
      expect(result.answer).toBe("我一直在思考但无法得出结论");
      expect(result.stopReason).toBe("completed");
      // 原始调用 + 最多 2 次重试 = 3 次
      expect(callModel).toHaveBeenCalledTimes(3);
    });

    it("无 thinking 的空响应不应重试", async () => {
      const callModel = vi.fn().mockResolvedValue({
        content: "",
        toolCalls: [],
        stopReason: "end_turn",
        usage: defaultUsage(),
        model: "test",
      } satisfies ModelResponse);

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("问题", "", [], defaultConfig, deps);

      expect(result.answer).toBe("");
      expect(callModel).toHaveBeenCalledTimes(1);
    });

    it("有内容时即使有 thinking 也不应重试", async () => {
      const callModel = vi.fn().mockResolvedValue({
        content: "正常回答",
        toolCalls: [],
        stopReason: "end_turn",
        usage: defaultUsage(),
        model: "test",
        thinking: "思考过程...",
      } satisfies ModelResponse);

      const deps: ReactDependencies = {
        callModel: callModel as CallModelFn,
        toolExecutor: createMockExecutor(new Map()),
        toolRegistry: createMockRegistry([]),
        logger: createMockLogger(),
        workspacePath: "/workspace",
      };

      const result = await runReactLoop("问题", "", [], defaultConfig, deps);

      expect(result.answer).toBe("正常回答");
      expect(callModel).toHaveBeenCalledTimes(1);
    });
  });
});
