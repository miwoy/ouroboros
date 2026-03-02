/**
 * 审查规则测试
 */

import { describe, it, expect } from "vitest";
import {
  checkDeadLoop,
  checkHighRetry,
  checkTimeout,
  checkResourceExhausted,
} from "../../src/inspector/rules.js";
import { NodeType, TaskState, TreeState, ExceptionType } from "../../src/core/types.js";
import type { ExecutionTree, ExecutionNode } from "../../src/core/types.js";
import type { InspectionContext } from "../../src/inspector/types.js";
import type { BodySchema } from "../../src/schema/types.js";
import { DEFAULT_INSPECTOR_CONFIG } from "../../src/inspector/inspector.js";

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

function makeTree(nodes: ExecutionNode[]): ExecutionTree {
  const nodeMap: Record<string, ExecutionNode> = {};
  for (const n of nodes) {
    nodeMap[n.id] = n;
  }
  return {
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
}

function makeContext(tree: ExecutionTree, overrides?: Partial<InspectionContext>): InspectionContext {
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
    ...overrides,
  };
}

describe("checkDeadLoop", () => {
  it("无 tool-call 节点时应返回 null", () => {
    const tree = makeTree([]);
    const result = checkDeadLoop(makeContext(tree));
    expect(result).toBeNull();
  });

  it("不足 3 个 tool-call 节点时应返回 null", () => {
    const tree = makeTree([
      makeNode("n1", NodeType.ToolCall, "tool:read {}", 0, -2000),
      makeNode("n2", NodeType.ToolCall, "tool:read {}", 0, -1000),
    ]);
    const result = checkDeadLoop(makeContext(tree));
    expect(result).toBeNull();
  });

  it("连续 3 次相同工具调用应检测到死循环", () => {
    const tree = makeTree([
      makeNode("n1", NodeType.ToolCall, "tool:read /tmp/a.txt", 0, -3000),
      makeNode("n2", NodeType.ToolCall, "tool:read /tmp/a.txt", 0, -2000),
      makeNode("n3", NodeType.ToolCall, "tool:read /tmp/a.txt", 0, -1000),
    ]);
    const result = checkDeadLoop(makeContext(tree));
    expect(result).not.toBeNull();
    expect(result!.exceptionType).toBe(ExceptionType.PossibleLoop);
  });

  it("不连续的相同调用不应检测为循环", () => {
    const tree = makeTree([
      makeNode("n1", NodeType.ToolCall, "tool:read /tmp/a.txt", 0, -4000),
      makeNode("n2", NodeType.ToolCall, "tool:write /tmp/b.txt", 0, -3000),
      makeNode("n3", NodeType.ToolCall, "tool:read /tmp/a.txt", 0, -2000),
      makeNode("n4", NodeType.ToolCall, "tool:write /tmp/b.txt", 0, -1000),
    ]);
    const result = checkDeadLoop(makeContext(tree));
    expect(result).toBeNull();
  });
});

describe("checkHighRetry", () => {
  it("正常节点应返回 null", () => {
    const tree = makeTree([makeNode("n1", NodeType.ToolCall, "tool:read", 2)]);
    const result = checkHighRetry(makeContext(tree));
    expect(result).toBeNull();
  });

  it("超过重试阈值应检测到异常", () => {
    const tree = makeTree([makeNode("n1", NodeType.ToolCall, "tool:read", 10)]);
    const result = checkHighRetry(makeContext(tree));
    expect(result).not.toBeNull();
    expect(result!.exceptionType).toBe(ExceptionType.ToolFailure);
  });
});

describe("checkTimeout", () => {
  it("未超时应返回 null", () => {
    const tree = makeTree([]);
    const result = checkTimeout(makeContext(tree, { startTime: Date.now() }));
    expect(result).toBeNull();
  });

  it("超过执行时间应检测到超时", () => {
    const tree = makeTree([]);
    const result = checkTimeout(
      makeContext(tree, { startTime: Date.now() - 4000 * 1000 }),
    );
    expect(result).not.toBeNull();
    expect(result!.exceptionType).toBe(ExceptionType.Timeout);
  });
});

describe("checkResourceExhausted", () => {
  it("资源充足应返回 null", () => {
    const tree = makeTree([]);
    const result = checkResourceExhausted(makeContext(tree));
    expect(result).toBeNull();
  });

  it("内存不足应检测到资源耗尽", () => {
    const bodySchema: BodySchema = {
      platform: "linux x64",
      cpuCores: 4,
      memory: { totalGB: "16.0", availableGB: "0.05", usagePercent: 99 },
      disk: { availableGB: "100", totalGB: "500" },
      nodeVersion: "v20.0.0",
      workspacePath: "/tmp",
      timestamp: new Date().toISOString(),
    };

    const tree = makeTree([]);
    const result = checkResourceExhausted(makeContext(tree, { bodySchema }));
    expect(result).not.toBeNull();
    expect(result!.exceptionType).toBe(ExceptionType.ResourceExhausted);
  });
});
