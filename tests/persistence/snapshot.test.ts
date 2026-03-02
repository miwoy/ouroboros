import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createSnapshot,
  serializeSnapshot,
  deserializeSnapshot,
  isCompatibleVersion,
  isWithinTTL,
  countActiveAgents,
  countCompletedSteps,
} from "../../src/persistence/snapshot.js";
import { SNAPSHOT_SCHEMA_VERSION } from "../../src/persistence/types.js";
import type { SystemStateSnapshot, AgentStateNode } from "../../src/persistence/types.js";
import type { SnapshotBuildParams } from "../../src/persistence/snapshot.js";
import { TreeState, TaskState, NodeType } from "../../src/core/types.js";
import type { ExecutionTree } from "../../src/core/types.js";

/** 创建测试用执行树 */
function makeTestTree(nodes: Record<string, { state: string }>): ExecutionTree {
  const treeNodes: Record<string, any> = {};
  const firstId = Object.keys(nodes)[0] || "root";

  for (const [id, data] of Object.entries(nodes)) {
    treeNodes[id] = {
      id,
      parentId: null,
      taskId: "task-1",
      state: data.state,
      nodeType: NodeType.Root,
      summary: `节点 ${id}`,
      children: [],
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    id: "tree-1",
    agentId: "agent-1",
    rootNodeId: firstId,
    nodes: treeNodes,
    activeNodeId: firstId,
    state: TreeState.Running,
    createdAt: new Date().toISOString(),
  };
}

describe("状态快照", () => {
  describe("createSnapshot", () => {
    it("应创建完整的快照", () => {
      const params: SnapshotBuildParams = {
        trigger: "tool-completed",
        startTime: Date.now() - 5000,
        taskDescription: "测试任务",
        agents: [
          {
            agentId: "agent-1",
            name: "测试 Agent",
            executionTree: null,
            hotSessionSnapshot: ["记录1"],
            childAgentIds: [],
            status: "running",
          },
        ],
        rootAgentIds: ["agent-1"],
      };

      const snapshot = createSnapshot(params);

      expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
      expect(snapshot.snapshotId).toBeTruthy();
      expect(snapshot.timestamp).toBeTruthy();
      expect(snapshot.taskDescription).toBe("测试任务");
      expect(snapshot.rootAgentIds).toEqual(["agent-1"]);
      expect(snapshot.agentTree["agent-1"]).toBeDefined();
      expect(snapshot.agentTree["agent-1"].name).toBe("测试 Agent");
      expect(snapshot.metadata.trigger).toBe("tool-completed");
      expect(snapshot.metadata.uptimeMs).toBeGreaterThan(0);
      expect(snapshot.metadata.nodeVersion).toBeTruthy();
    });

    it("应支持多个 Agent", () => {
      const params: SnapshotBuildParams = {
        trigger: "periodic",
        startTime: Date.now(),
        taskDescription: "多 Agent 任务",
        agents: [
          {
            agentId: "agent-1",
            name: "A1",
            executionTree: null,
            hotSessionSnapshot: [],
            childAgentIds: ["agent-2"],
            status: "running",
          },
          {
            agentId: "agent-2",
            name: "A2",
            executionTree: null,
            hotSessionSnapshot: [],
            childAgentIds: [],
            status: "paused",
          },
        ],
        rootAgentIds: ["agent-1"],
      };

      const snapshot = createSnapshot(params);
      expect(Object.keys(snapshot.agentTree)).toHaveLength(2);
      expect(snapshot.agentTree["agent-1"].childAgentIds).toEqual(["agent-2"]);
    });
  });

  describe("serializeSnapshot / deserializeSnapshot", () => {
    it("应正确序列化和反序列化", () => {
      const params: SnapshotBuildParams = {
        trigger: "user-requested",
        startTime: Date.now(),
        taskDescription: "序列化测试",
        agents: [
          {
            agentId: "a1",
            name: "Agent1",
            executionTree: null,
            hotSessionSnapshot: ["test"],
            childAgentIds: [],
            status: "completed",
          },
        ],
        rootAgentIds: ["a1"],
      };

      const original = createSnapshot(params);
      const json = serializeSnapshot(original);
      const restored = deserializeSnapshot(json);

      expect(restored.schemaVersion).toBe(original.schemaVersion);
      expect(restored.snapshotId).toBe(original.snapshotId);
      expect(restored.taskDescription).toBe(original.taskDescription);
    });

    it("无效 JSON 应抛出错误", () => {
      expect(() => deserializeSnapshot("not json")).toThrow();
    });

    it("缺少必需字段应抛出错误", () => {
      expect(() => deserializeSnapshot('{"foo":"bar"}')).toThrow("快照格式无效");
    });

    it("agentTree 格式错误应抛出错误", () => {
      const bad = JSON.stringify({
        schemaVersion: "1.0.0",
        snapshotId: "id-1",
        timestamp: new Date().toISOString(),
        agentTree: "not-object",
      });
      expect(() => deserializeSnapshot(bad)).toThrow("agentTree");
    });
  });

  describe("isCompatibleVersion", () => {
    it("主版本匹配时返回 true", () => {
      const snapshot = { schemaVersion: "1.2.3" } as SystemStateSnapshot;
      expect(isCompatibleVersion(snapshot)).toBe(true);
    });

    it("主版本不匹配时返回 false", () => {
      const snapshot = { schemaVersion: "2.0.0" } as SystemStateSnapshot;
      expect(isCompatibleVersion(snapshot)).toBe(false);
    });
  });

  describe("isWithinTTL", () => {
    it("未过期时返回 true", () => {
      const snapshot = { timestamp: new Date().toISOString() } as SystemStateSnapshot;
      expect(isWithinTTL(snapshot, 3600)).toBe(true);
    });

    it("已过期时返回 false", () => {
      const pastDate = new Date(Date.now() - 100000 * 1000).toISOString();
      const snapshot = { timestamp: pastDate } as SystemStateSnapshot;
      expect(isWithinTTL(snapshot, 60)).toBe(false);
    });
  });

  describe("countActiveAgents", () => {
    it("应统计运行和暂停状态的 Agent", () => {
      const snapshot = {
        agentTree: {
          a1: { status: "running" } as AgentStateNode,
          a2: { status: "paused" } as AgentStateNode,
          a3: { status: "completed" } as AgentStateNode,
          a4: { status: "failed" } as AgentStateNode,
        },
      } as SystemStateSnapshot;

      expect(countActiveAgents(snapshot)).toBe(2);
    });
  });

  describe("countCompletedSteps", () => {
    it("应统计所有 Agent 中已完成的节点数", () => {
      const tree = makeTestTree({
        n1: { state: TaskState.Completed },
        n2: { state: TaskState.Completed },
        n3: { state: TaskState.Working },
      });

      const snapshot = {
        agentTree: {
          a1: { executionTree: tree } as AgentStateNode,
        },
      } as SystemStateSnapshot;

      expect(countCompletedSteps(snapshot)).toBe(2);
    });

    it("无执行树时返回 0", () => {
      const snapshot = {
        agentTree: {
          a1: { executionTree: null } as AgentStateNode,
        },
      } as SystemStateSnapshot;

      expect(countCompletedSteps(snapshot)).toBe(0);
    });
  });
});
