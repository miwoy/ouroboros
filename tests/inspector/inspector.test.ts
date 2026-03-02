/**
 * 审查程序核心测试
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createInspector, DEFAULT_INSPECTOR_CONFIG } from "../../src/inspector/inspector.js";
import { NodeType, TaskState, TreeState, ExceptionType } from "../../src/core/types.js";
import type { ExecutionTree, ExecutionNode } from "../../src/core/types.js";
import type { InspectionContext } from "../../src/inspector/types.js";
import type { Logger } from "../../src/logger/types.js";
import type { BodySchema } from "../../src/schema/types.js";

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeNode(
  id: string,
  type: string,
  summary: string,
  retryCount = 0,
  createdAtOffset = 0,
): ExecutionNode {
  return {
    id,
    parentId: "root",
    taskId: "task-1",
    state: TaskState.Completed,
    nodeType: type as any,
    summary,
    children: [],
    retryCount,
    createdAt: new Date(Date.now() + createdAtOffset).toISOString(),
  };
}

function makeContext(nodes: ExecutionNode[]): InspectionContext {
  const nodeMap: Record<string, ExecutionNode> = {};
  for (const n of nodes) {
    nodeMap[n.id] = n;
  }

  const tree: ExecutionTree = {
    id: "tree-1",
    agentId: "agent:test",
    rootNodeId: "root",
    nodes: {
      root: makeNode("root", NodeType.Root, "root task"),
      ...nodeMap,
    },
    activeNodeId: nodes.length > 0 ? nodes[nodes.length - 1]!.id : "root",
    state: TreeState.Running,
    createdAt: new Date().toISOString(),
  };

  const bodySchema: BodySchema = {
    platform: "linux x64",
    cpuCores: 4,
    memory: { totalGB: "16.0", availableGB: "8.0", usagePercent: 50 },
    disk: { availableGB: "100", totalGB: "500" },
    nodeVersion: "v20.0.0",
    workspacePath: "/tmp",
    timestamp: new Date().toISOString(),
  };

  return {
    tree,
    bodySchema,
    startTime: Date.now(),
    config: DEFAULT_INSPECTOR_CONFIG,
  };
}

describe("createInspector", () => {
  let inspector: ReturnType<typeof createInspector>;

  afterEach(() => {
    inspector?.stop();
  });

  it("无异常时 inspect 应返回空结果", () => {
    const logger = makeLogger();
    inspector = createInspector(logger);
    const context = makeContext([]);

    const result = inspector.inspect(context);

    expect(result.hasAnomalies).toBe(false);
    expect(result.reports).toHaveLength(0);
    expect(result.suggestedActions).toHaveLength(0);
  });

  it("有死循环时应检测到异常", () => {
    const logger = makeLogger();
    inspector = createInspector(logger);

    const nodes = [
      makeNode("n1", NodeType.ToolCall, "tool:read /tmp/a.txt", 0, -3000),
      makeNode("n2", NodeType.ToolCall, "tool:read /tmp/a.txt", 0, -2000),
      makeNode("n3", NodeType.ToolCall, "tool:read /tmp/a.txt", 0, -1000),
    ];

    const result = inspector.inspect(makeContext(nodes));

    expect(result.hasAnomalies).toBe(true);
    expect(result.reports.length).toBeGreaterThan(0);
    expect(result.suggestedActions.length).toBeGreaterThan(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("getLatestResult 应返回最新审查结果", () => {
    const logger = makeLogger();
    inspector = createInspector(logger);

    expect(inspector.getLatestResult()).toBeNull();

    const context = makeContext([]);
    inspector.inspect(context);

    expect(inspector.getLatestResult()).not.toBeNull();
    expect(inspector.getLatestResult()!.hasAnomalies).toBe(false);
  });

  it("start 和 stop 应正确管理定时器", () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    inspector = createInspector(logger);

    const context = makeContext([]);
    inspector.start(() => context);

    expect(logger.info).toHaveBeenCalledWith(
      "inspector",
      "审查程序启动",
      expect.any(Object),
    );

    inspector.stop();

    expect(logger.info).toHaveBeenCalledWith("inspector", "审查程序停止");
    vi.useRealTimers();
  });

  it("多次 start 不应创建多个定时器", () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    inspector = createInspector(logger);

    const context = makeContext([]);
    inspector.start(() => context);
    inspector.start(() => context); // 重复 start

    // 只应启动一次
    const startCalls = (logger.info as any).mock.calls.filter(
      (c: any[]) => c[1] === "审查程序启动",
    );
    expect(startCalls).toHaveLength(1);

    inspector.stop();
    vi.useRealTimers();
  });

  it("disabled 配置不应启动定时器", () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    inspector = createInspector(logger);

    const context = makeContext([]);
    const disabledContext = {
      ...context,
      config: { ...DEFAULT_INSPECTOR_CONFIG, enabled: false },
    };
    inspector.start(() => disabledContext);

    const startCalls = (logger.info as any).mock.calls.filter(
      (c: any[]) => c[1] === "审查程序启动",
    );
    expect(startCalls).toHaveLength(0);
    vi.useRealTimers();
  });
});
