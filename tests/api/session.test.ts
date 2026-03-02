/**
 * 会话管理器测试
 */

import { describe, it, expect } from "vitest";
import { createSessionManager } from "../../src/api/session.js";
import { createExecutionTree } from "../../src/core/execution-tree.js";

describe("createSessionManager", () => {
  describe("createSession", () => {
    it("应创建新会话并返回会话信息", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");

      expect(session.sessionId).toBeTruthy();
      expect(session.agentId).toBe("agent:core");
      expect(session.messageCount).toBe(0);
      expect(session.createdAt).toBeTruthy();
      expect(session.updatedAt).toBeTruthy();
    });

    it("应支持自定义描述", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core", "测试会话");

      expect(session.description).toBe("测试会话");
    });

    it("无描述时应生成默认描述", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");

      expect(session.description).toContain("会话");
    });
  });

  describe("getSession", () => {
    it("应返回已存在的会话", () => {
      const manager = createSessionManager();
      const created = manager.createSession("agent:core");
      const fetched = manager.getSession(created.sessionId);

      expect(fetched).not.toBeNull();
      expect(fetched!.sessionId).toBe(created.sessionId);
    });

    it("不存在时应返回 null", () => {
      const manager = createSessionManager();
      expect(manager.getSession("nonexistent")).toBeNull();
    });
  });

  describe("listSessions", () => {
    it("应列出所有会话", () => {
      const manager = createSessionManager();
      manager.createSession("agent:core", "会话1");
      manager.createSession("agent:core", "会话2");

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it("无会话时应返回空数组", () => {
      const manager = createSessionManager();
      expect(manager.listSessions()).toHaveLength(0);
    });
  });

  describe("addMessage", () => {
    it("应添加消息到会话", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");

      const msg = manager.addMessage(session.sessionId, "user", "你好");
      expect(msg).not.toBeNull();
      expect(msg!.role).toBe("user");
      expect(msg!.content).toBe("你好");
      expect(msg!.sessionId).toBe(session.sessionId);
    });

    it("应更新消息计数", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");

      manager.addMessage(session.sessionId, "user", "消息1");
      manager.addMessage(session.sessionId, "agent", "消息2");

      const updated = manager.getSession(session.sessionId);
      expect(updated!.messageCount).toBe(2);
    });

    it("会话不存在时应返回 null", () => {
      const manager = createSessionManager();
      expect(manager.addMessage("nonexistent", "user", "hello")).toBeNull();
    });

    it("应支持元数据", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");

      const msg = manager.addMessage(session.sessionId, "user", "hello", { source: "api" });
      expect(msg!.metadata).toEqual({ source: "api" });
    });
  });

  describe("getMessages", () => {
    it("应返回分页消息", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");

      for (let i = 0; i < 10; i++) {
        manager.addMessage(session.sessionId, "user", `消息${i}`);
      }

      const result = manager.getMessages(session.sessionId, 1, 5);
      expect(result.messages).toHaveLength(5);
      expect(result.total).toBe(10);
    });

    it("应支持翻页", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");

      for (let i = 0; i < 10; i++) {
        manager.addMessage(session.sessionId, "user", `消息${i}`);
      }

      const page2 = manager.getMessages(session.sessionId, 2, 5);
      expect(page2.messages).toHaveLength(5);
      expect(page2.messages[0].content).toBe("消息5");
    });

    it("会话不存在时应返回空结果", () => {
      const manager = createSessionManager();
      const result = manager.getMessages("nonexistent");
      expect(result.messages).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe("deleteSession", () => {
    it("应成功删除会话", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");

      expect(manager.deleteSession(session.sessionId)).toBe(true);
      expect(manager.getSession(session.sessionId)).toBeNull();
    });

    it("删除不存在的会话应返回 false", () => {
      const manager = createSessionManager();
      expect(manager.deleteSession("nonexistent")).toBe(false);
    });
  });

  describe("executionTree", () => {
    it("setExecutionTree 应设置执行树", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");
      const tree = createExecutionTree("agent:core", "测试任务");

      expect(manager.setExecutionTree(session.sessionId, tree)).toBe(true);
      const fetched = manager.getExecutionTree(session.sessionId);
      expect(fetched).not.toBeNull();
      expect(fetched!.agentId).toBe("agent:core");
    });

    it("setExecutionTree 应覆盖已有的执行树", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");
      const tree1 = createExecutionTree("agent:core", "任务1");
      const tree2 = createExecutionTree("agent:core", "任务2");

      manager.setExecutionTree(session.sessionId, tree1);
      manager.setExecutionTree(session.sessionId, tree2);

      const fetched = manager.getExecutionTree(session.sessionId);
      expect(fetched!.id).toBe(tree2.id);
    });

    it("setExecutionTree 会话不存在时应返回 false", () => {
      const manager = createSessionManager();
      const tree = createExecutionTree("agent:core", "测试任务");
      expect(manager.setExecutionTree("nonexistent", tree)).toBe(false);
    });

    it("getExecutionTree 无执行树时应返回 null", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");
      expect(manager.getExecutionTree(session.sessionId)).toBeNull();
    });

    it("getExecutionTree 会话不存在时应返回 null", () => {
      const manager = createSessionManager();
      expect(manager.getExecutionTree("nonexistent")).toBeNull();
    });

    it("toSessionInfo 应包含 hasExecutionTree 字段", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:core");

      // 初始无执行树
      expect(session.hasExecutionTree).toBe(false);

      // 设置后有执行树
      const tree = createExecutionTree("agent:core", "测试任务");
      manager.setExecutionTree(session.sessionId, tree);
      const updated = manager.getSession(session.sessionId);
      expect(updated!.hasExecutionTree).toBe(true);
    });
  });
});
