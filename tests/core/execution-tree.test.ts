/**
 * 执行树管理单元测试
 */

import { describe, it, expect } from "vitest";
import {
  createExecutionTree,
  addNode,
  updateNodeState,
  completeNode,
  failNode,
  setActiveNode,
  updateTreeState,
  getNodePath,
  getDescendantIds,
  treeToJSON,
  treeFromJSON,
} from "../../src/core/execution-tree.js";
import { TaskState, TreeState, NodeType } from "../../src/core/types.js";
import { ExecutionTreeError } from "../../src/errors/index.js";

describe("执行树管理", () => {
  describe("createExecutionTree", () => {
    it("应创建包含 root 节点的执行树", () => {
      const tree = createExecutionTree("agent:main", "测试任务");

      expect(tree.id).toBeDefined();
      expect(tree.agentId).toBe("agent:main");
      expect(tree.state).toBe(TreeState.Running);
      expect(tree.rootNodeId).toBeDefined();
      expect(tree.activeNodeId).toBe(tree.rootNodeId);

      const root = tree.nodes[tree.rootNodeId];
      expect(root).toBeDefined();
      expect(root!.nodeType).toBe(NodeType.Root);
      expect(root!.state).toBe(TaskState.Working);
      expect(root!.summary).toBe("测试任务");
      expect(root!.parentId).toBeNull();
      expect(root!.children).toEqual([]);
      expect(root!.retryCount).toBe(0);
    });
  });

  describe("addNode", () => {
    it("应在父节点下添加子节点", () => {
      const tree = createExecutionTree("agent:main", "测试任务");
      const result = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "调用 tool:call-model",
      });

      const newNode = result.tree.nodes[result.nodeId];
      expect(newNode).toBeDefined();
      expect(newNode!.parentId).toBe(tree.rootNodeId);
      expect(newNode!.nodeType).toBe(NodeType.ToolCall);
      expect(newNode!.state).toBe(TaskState.Working);

      // 父节点的 children 应包含新节点
      const parent = result.tree.nodes[tree.rootNodeId];
      expect(parent!.children).toContain(result.nodeId);

      // 活跃节点应更新
      expect(result.tree.activeNodeId).toBe(result.nodeId);
    });

    it("父节点不存在时应抛出 ExecutionTreeError", () => {
      const tree = createExecutionTree("agent:main", "测试");
      expect(() =>
        addNode(tree, "non-existent", {
          nodeType: NodeType.ToolCall,
          summary: "test",
        }),
      ).toThrow(ExecutionTreeError);
    });

    it("不应修改原始执行树（不可变性）", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const originalRoot = tree.nodes[tree.rootNodeId];
      const result = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "新节点",
      });

      // 原始树不应被修改
      expect(tree.nodes[tree.rootNodeId]!.children).toEqual([]);
      expect(result.tree.nodes[tree.rootNodeId]!.children.length).toBe(1);
    });
  });

  describe("updateNodeState", () => {
    it("应更新节点状态", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const updated = updateNodeState(tree, tree.rootNodeId, TaskState.Completed, "完成");

      const node = updated.nodes[tree.rootNodeId];
      expect(node!.state).toBe(TaskState.Completed);
      expect(node!.resultSummary).toBe("完成");
      expect(node!.completedAt).toBeDefined();
    });

    it("节点不存在时应抛出 ExecutionTreeError", () => {
      const tree = createExecutionTree("agent:main", "测试");
      expect(() => updateNodeState(tree, "non-existent", TaskState.Completed)).toThrow(
        ExecutionTreeError,
      );
    });

    it("终态节点不应允许状态变更", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const completed = completeNode(tree, tree.rootNodeId, "完成");
      expect(() => updateNodeState(completed, tree.rootNodeId, TaskState.Working)).toThrow(
        ExecutionTreeError,
      );
    });
  });

  describe("completeNode", () => {
    it("应将节点标记为完成", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const updated = completeNode(tree, tree.rootNodeId, "任务完成");

      const node = updated.nodes[tree.rootNodeId];
      expect(node!.state).toBe(TaskState.Completed);
      expect(node!.resultSummary).toBe("任务完成");
    });
  });

  describe("failNode", () => {
    it("应将节点标记为失败", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const updated = failNode(tree, tree.rootNodeId, "执行出错");

      const node = updated.nodes[tree.rootNodeId];
      expect(node!.state).toBe(TaskState.Failed);
      expect(node!.resultSummary).toBe("执行出错");
    });
  });

  describe("setActiveNode", () => {
    it("应设置活跃节点", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const { tree: tree2, nodeId } = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "子节点",
      });

      const updated = setActiveNode(tree2, tree.rootNodeId);
      expect(updated.activeNodeId).toBe(tree.rootNodeId);
    });

    it("节点不存在时应抛出 ExecutionTreeError", () => {
      const tree = createExecutionTree("agent:main", "测试");
      expect(() => setActiveNode(tree, "non-existent")).toThrow(ExecutionTreeError);
    });
  });

  describe("updateTreeState", () => {
    it("应更新执行树状态", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const updated = updateTreeState(tree, TreeState.Completed);
      expect(updated.state).toBe(TreeState.Completed);
    });
  });

  describe("getNodePath", () => {
    it("应返回从根到目标节点的路径", () => {
      let tree = createExecutionTree("agent:main", "测试");
      const { tree: tree2, nodeId: childId } = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "子节点",
      });
      const { tree: tree3, nodeId: grandchildId } = addNode(tree2, childId, {
        nodeType: NodeType.ModelCall,
        summary: "孙节点",
      });

      const path = getNodePath(tree3, grandchildId);
      expect(path.length).toBe(3);
      expect(path[0]!.nodeType).toBe(NodeType.Root);
      expect(path[1]!.id).toBe(childId);
      expect(path[2]!.id).toBe(grandchildId);
    });

    it("根节点路径应只有一个节点", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const path = getNodePath(tree, tree.rootNodeId);
      expect(path.length).toBe(1);
    });
  });

  describe("getDescendantIds", () => {
    it("应返回所有后代节点 ID", () => {
      let tree = createExecutionTree("agent:main", "测试");
      const { tree: tree2, nodeId: child1 } = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "子节点1",
      });
      const { tree: tree3, nodeId: child2 } = addNode(tree2, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "子节点2",
      });
      const { tree: tree4, nodeId: grandchild } = addNode(tree3, child1, {
        nodeType: NodeType.ModelCall,
        summary: "孙节点",
      });

      const descendants = getDescendantIds(tree4, tree.rootNodeId);
      expect(descendants).toContain(child1);
      expect(descendants).toContain(child2);
      expect(descendants).toContain(grandchild);
      expect(descendants.length).toBe(3);
    });

    it("叶子节点应返回空数组", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const { tree: tree2, nodeId } = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "叶子",
      });

      const descendants = getDescendantIds(tree2, nodeId);
      expect(descendants).toEqual([]);
    });

    it("不存在的节点应返回空数组", () => {
      const tree = createExecutionTree("agent:main", "测试");
      expect(getDescendantIds(tree, "non-existent")).toEqual([]);
    });
  });

  describe("序列化", () => {
    it("treeToJSON 应产出有效 JSON", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const json = treeToJSON(tree);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("treeFromJSON 应还原执行树", () => {
      const original = createExecutionTree("agent:main", "测试任务");
      const { tree: withChild } = addNode(original, original.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "子节点",
      });

      const json = treeToJSON(withChild);
      const restored = treeFromJSON(json);

      expect(restored.id).toBe(withChild.id);
      expect(restored.agentId).toBe(withChild.agentId);
      expect(Object.keys(restored.nodes).length).toBe(2);
    });

    it("无效 JSON 应抛出 ExecutionTreeError", () => {
      expect(() => treeFromJSON("invalid json")).toThrow(ExecutionTreeError);
    });
  });
});
