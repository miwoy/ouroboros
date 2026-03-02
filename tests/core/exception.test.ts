/**
 * 异常处理单元测试
 */

import { describe, it, expect } from "vitest";
import {
  rollbackToNode,
  terminateSubtree,
  terminateTree,
  detectPossibleLoop,
  buildExceptionPrompt,
  applyInspectorAction,
} from "../../src/core/exception.js";
import { createExecutionTree, addNode, completeNode } from "../../src/core/execution-tree.js";
import {
  TaskState,
  TreeState,
  NodeType,
  ExceptionType,
  type InspectorAction,
} from "../../src/core/types.js";
import { ExecutionTreeError } from "../../src/errors/index.js";

describe("异常处理", () => {
  describe("rollbackToNode", () => {
    it("应将后代节点标记为 cancelled 并回退活跃节点", () => {
      let tree = createExecutionTree("agent:main", "测试");
      const rootId = tree.rootNodeId;
      const { tree: t2, nodeId: child1 } = addNode(tree, rootId, {
        nodeType: NodeType.ToolCall,
        summary: "步骤1",
      });
      const { tree: t3, nodeId: child2 } = addNode(t2, rootId, {
        nodeType: NodeType.ToolCall,
        summary: "步骤2",
      });

      // 回滚到 root，child1 和 child2 应被取消
      const result = rollbackToNode(t3, rootId, "重新规划");

      expect(result.tree.nodes[child1]!.state).toBe(TaskState.Cancelled);
      expect(result.tree.nodes[child2]!.state).toBe(TaskState.Cancelled);
      expect(result.tree.activeNodeId).toBe(rootId);
      expect(result.report.suggestedAction).toBe("rollback");
    });

    it("不存在的节点应抛出 ExecutionTreeError", () => {
      const tree = createExecutionTree("agent:main", "测试");
      expect(() => rollbackToNode(tree, "non-existent", "test")).toThrow(ExecutionTreeError);
    });

    it("已完成的后代节点不应被回滚", () => {
      let tree = createExecutionTree("agent:main", "测试");
      const { tree: t2, nodeId: child1 } = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "已完成步骤",
      });
      const t3 = completeNode(t2, child1, "成功");
      const { tree: t4, nodeId: child2 } = addNode(t3, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "进行中步骤",
      });

      const result = rollbackToNode(t4, tree.rootNodeId, "重试");

      // child1 已完成，不应被修改
      expect(result.tree.nodes[child1]!.state).toBe(TaskState.Completed);
      // child2 应被取消
      expect(result.tree.nodes[child2]!.state).toBe(TaskState.Cancelled);
    });
  });

  describe("terminateSubtree", () => {
    it("应递归取消所有非终态子节点", () => {
      let tree = createExecutionTree("agent:main", "测试");
      const { tree: t2, nodeId: child1 } = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "子节点1",
      });
      const { tree: t3, nodeId: grandchild } = addNode(t2, child1, {
        nodeType: NodeType.ModelCall,
        summary: "孙节点",
      });

      const result = terminateSubtree(t3, child1, "资源耗尽");

      expect(result.tree.nodes[child1]!.state).toBe(TaskState.Cancelled);
      expect(result.tree.nodes[grandchild]!.state).toBe(TaskState.Cancelled);
      expect(result.report.exceptionType).toBe(ExceptionType.AgentDeviation);
    });

    it("不存在的节点应抛出 ExecutionTreeError", () => {
      const tree = createExecutionTree("agent:main", "测试");
      expect(() => terminateSubtree(tree, "non-existent", "test")).toThrow(ExecutionTreeError);
    });
  });

  describe("terminateTree", () => {
    it("应终止整棵树并将树状态设为 cancelled", () => {
      let tree = createExecutionTree("agent:main", "测试");
      const { tree: t2 } = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "子节点",
      });

      const result = terminateTree(t2, "用户取消");

      expect(result.tree.state).toBe(TreeState.Cancelled);
      // 所有节点应为 cancelled
      for (const node of Object.values(result.tree.nodes)) {
        expect(node.state).toBe(TaskState.Cancelled);
      }
    });
  });

  describe("detectPossibleLoop", () => {
    it("连续相同工具调用 ≥3 次应检测到循环", () => {
      let tree = createExecutionTree("agent:main", "测试");
      for (let i = 0; i < 3; i++) {
        const result = addNode(tree, tree.rootNodeId, {
          nodeType: NodeType.ToolCall,
          summary: "tool:search-tool 搜索数学",
        });
        tree = result.tree;
      }

      const report = detectPossibleLoop(tree);
      expect(report).not.toBeNull();
      expect(report!.exceptionType).toBe(ExceptionType.PossibleLoop);
    });

    it("不同工具调用不应检测到循环", () => {
      let tree = createExecutionTree("agent:main", "测试");
      const tools = ["tool:call-model 推理", "tool:search-tool 搜索", "tool:create-tool 创建"];
      for (const summary of tools) {
        const result = addNode(tree, tree.rootNodeId, {
          nodeType: NodeType.ToolCall,
          summary,
        });
        tree = result.tree;
      }

      expect(detectPossibleLoop(tree)).toBeNull();
    });

    it("少于 3 个工具调用不应检测到循环", () => {
      let tree = createExecutionTree("agent:main", "测试");
      for (let i = 0; i < 2; i++) {
        const result = addNode(tree, tree.rootNodeId, {
          nodeType: NodeType.ToolCall,
          summary: "tool:search-tool 搜索",
        });
        tree = result.tree;
      }

      expect(detectPossibleLoop(tree)).toBeNull();
    });

    it("窗口大小参数应限制检查范围", () => {
      let tree = createExecutionTree("agent:main", "测试");
      // 先加 3 个不同的
      for (let i = 0; i < 3; i++) {
        const result = addNode(tree, tree.rootNodeId, {
          nodeType: NodeType.ToolCall,
          summary: `tool:different-${i}`,
        });
        tree = result.tree;
      }
      // 再加 3 个相同的
      for (let i = 0; i < 3; i++) {
        const result = addNode(tree, tree.rootNodeId, {
          nodeType: NodeType.ToolCall,
          summary: "tool:same 重复",
        });
        tree = result.tree;
      }

      // 窗口为 3 应检测到
      expect(detectPossibleLoop(tree, 3)).not.toBeNull();
      // 窗口为 2 不够 3 次连续
      expect(detectPossibleLoop(tree, 2)).toBeNull();
    });
  });

  describe("buildExceptionPrompt", () => {
    it("应生成包含异常信息的提示词", () => {
      const prompt = buildExceptionPrompt({
        treeId: "tree-1",
        nodeId: "node-1",
        exceptionType: ExceptionType.PossibleLoop,
        description: "检测到死循环",
        suggestedAction: "terminate",
        timestamp: new Date().toISOString(),
      });

      expect(prompt).toContain("系统异常通知");
      expect(prompt).toContain("possible-loop");
      expect(prompt).toContain("检测到死循环");
      expect(prompt).toContain("停止当前操作");
    });
  });

  describe("applyInspectorAction", () => {
    it("rollback 应回滚到目标节点", () => {
      let tree = createExecutionTree("agent:main", "测试");
      const { tree: t2, nodeId: child } = addNode(tree, tree.rootNodeId, {
        nodeType: NodeType.ToolCall,
        summary: "子节点",
      });

      const action: InspectorAction = {
        treeId: tree.id,
        action: "rollback",
        targetNodeId: tree.rootNodeId,
        reason: "回滚测试",
        timestamp: new Date().toISOString(),
      };

      const result = applyInspectorAction(t2, action);
      expect(result.activeNodeId).toBe(tree.rootNodeId);
      expect(result.nodes[child]!.state).toBe(TaskState.Cancelled);
    });

    it("terminate 无 targetNodeId 应终止整棵树", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const action: InspectorAction = {
        treeId: tree.id,
        action: "terminate",
        reason: "终止测试",
        timestamp: new Date().toISOString(),
      };

      const result = applyInspectorAction(tree, action);
      expect(result.state).toBe(TreeState.Cancelled);
    });

    it("pause 应暂停执行树", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const action: InspectorAction = {
        treeId: tree.id,
        action: "pause",
        reason: "暂停测试",
        timestamp: new Date().toISOString(),
      };

      const result = applyInspectorAction(tree, action);
      expect(result.state).toBe(TreeState.Paused);
    });

    it("resume 应恢复执行树", () => {
      let tree = createExecutionTree("agent:main", "测试");
      tree = { ...tree, state: TreeState.Paused };

      const action: InspectorAction = {
        treeId: tree.id,
        action: "resume",
        reason: "恢复测试",
        timestamp: new Date().toISOString(),
      };

      const result = applyInspectorAction(tree, action);
      expect(result.state).toBe(TreeState.Running);
    });

    it("rollback 无 targetNodeId 应抛出错误", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const action: InspectorAction = {
        treeId: tree.id,
        action: "rollback",
        reason: "测试",
        timestamp: new Date().toISOString(),
      };

      expect(() => applyInspectorAction(tree, action)).toThrow(ExecutionTreeError);
    });

    it("inject-prompt 不应修改树", () => {
      const tree = createExecutionTree("agent:main", "测试");
      const action: InspectorAction = {
        treeId: tree.id,
        action: "inject-prompt",
        prompt: "请换一种策略",
        reason: "测试",
        timestamp: new Date().toISOString(),
      };

      const result = applyInspectorAction(tree, action);
      expect(result).toEqual(tree);
    });
  });
});
