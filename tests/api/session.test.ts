/**
 * 会话管理器测试
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createSessionManager } from "../../src/api/session.js";
import { createExecutionTree } from "../../src/core/execution-tree.js";
import { writeFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

/** 创建临时 workspace */
async function createTempWorkspace(): Promise<string> {
  const dir = join(tmpdir(), `ouroboros-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** 清理临时 workspace */
async function cleanupWorkspace(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // 忽略
  }
}

describe("createSessionManager", () => {
  describe("createSession", () => {
    it("应创建新会话并返回会话信息", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");

      expect(session.sessionId).toBeTruthy();
      expect(session.agentId).toBe("agent:main");
      expect(session.messageCount).toBe(0);
      expect(session.createdAt).toBeTruthy();
      expect(session.updatedAt).toBeTruthy();
    });

    it("应支持自定义描述", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main", "测试会话");

      expect(session.description).toBe("测试会话");
    });

    it("无描述时应生成默认描述", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");

      expect(session.description).toContain("会话");
    });
  });

  describe("getSession", () => {
    it("应返回已存在的会话", () => {
      const manager = createSessionManager();
      const created = manager.createSession("agent:main");
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
      manager.createSession("agent:main", "会话1");
      manager.createSession("agent:main", "会话2");

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
      const session = manager.createSession("agent:main");

      const msg = manager.addMessage(session.sessionId, "user", "你好");
      expect(msg).not.toBeNull();
      expect(msg!.role).toBe("user");
      expect(msg!.content).toBe("你好");
      expect(msg!.sessionId).toBe(session.sessionId);
    });

    it("应更新消息计数", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");

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
      const session = manager.createSession("agent:main");

      const msg = manager.addMessage(session.sessionId, "user", "hello", { source: "api" });
      expect(msg!.metadata).toEqual({ source: "api" });
    });
  });

  describe("getMessages", () => {
    it("应返回分页消息", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");

      for (let i = 0; i < 10; i++) {
        manager.addMessage(session.sessionId, "user", `消息${i}`);
      }

      const result = manager.getMessages(session.sessionId, 1, 5);
      expect(result.messages).toHaveLength(5);
      expect(result.total).toBe(10);
    });

    it("应支持翻页", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");

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
      const session = manager.createSession("agent:main");

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
      const session = manager.createSession("agent:main");
      const tree = createExecutionTree("agent:main", "测试任务");

      expect(manager.setExecutionTree(session.sessionId, tree)).toBe(true);
      const fetched = manager.getExecutionTree(session.sessionId);
      expect(fetched).not.toBeNull();
      expect(fetched!.agentId).toBe("agent:main");
    });

    it("setExecutionTree 应覆盖已有的执行树", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");
      const tree1 = createExecutionTree("agent:main", "任务1");
      const tree2 = createExecutionTree("agent:main", "任务2");

      manager.setExecutionTree(session.sessionId, tree1);
      manager.setExecutionTree(session.sessionId, tree2);

      const fetched = manager.getExecutionTree(session.sessionId);
      expect(fetched!.id).toBe(tree2.id);
    });

    it("setExecutionTree 会话不存在时应返回 false", () => {
      const manager = createSessionManager();
      const tree = createExecutionTree("agent:main", "测试任务");
      expect(manager.setExecutionTree("nonexistent", tree)).toBe(false);
    });

    it("getExecutionTree 无执行树时应返回 null", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");
      expect(manager.getExecutionTree(session.sessionId)).toBeNull();
    });

    it("getExecutionTree 会话不存在时应返回 null", () => {
      const manager = createSessionManager();
      expect(manager.getExecutionTree("nonexistent")).toBeNull();
    });

    it("toSessionInfo 应包含 hasExecutionTree 字段", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");

      // 初始无执行树
      expect(session.hasExecutionTree).toBe(false);

      // 设置后有执行树
      const tree = createExecutionTree("agent:main", "测试任务");
      manager.setExecutionTree(session.sessionId, tree);
      const updated = manager.getSession(session.sessionId);
      expect(updated!.hasExecutionTree).toBe(true);
    });
  });

  describe("持久化", () => {
    let workspacePath: string;

    afterEach(async () => {
      if (workspacePath) await cleanupWorkspace(workspacePath);
    });

    it("init() 应加载持久化文件", async () => {
      workspacePath = await createTempWorkspace();
      const sessionsDir = join(workspacePath, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      // 写入一个持久化文件
      const sessionData = {
        sessionId: "test-session-1",
        agentId: "agent:main",
        description: "持久化测试",
        messages: [
          {
            id: "msg-1",
            sessionId: "test-session-1",
            role: "user",
            content: "你好",
            timestamp: "2026-01-01T00:00:00Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };
      await writeFile(join(sessionsDir, "test-session-1.json"), JSON.stringify(sessionData));

      const manager = createSessionManager(workspacePath);
      await manager.init();

      const session = manager.getSession("test-session-1");
      expect(session).not.toBeNull();
      expect(session!.description).toBe("持久化测试");
      expect(session!.messageCount).toBe(1);
    });

    it("createSession 应触发写盘", async () => {
      workspacePath = await createTempWorkspace();
      const manager = createSessionManager(workspacePath);
      await manager.init();

      const session = manager.createSession("agent:main", "写盘测试");

      // 等待异步写盘完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await readdir(join(workspacePath, "sessions"));
      expect(files).toContain(`${session.sessionId}.json`);
    });

    it("addMessage 应防抖写盘", async () => {
      workspacePath = await createTempWorkspace();
      const manager = createSessionManager(workspacePath);
      await manager.init();

      const session = manager.createSession("agent:main");

      // 快速添加多条消息
      manager.addMessage(session.sessionId, "user", "消息1");
      manager.addMessage(session.sessionId, "user", "消息2");
      manager.addMessage(session.sessionId, "user", "消息3");

      // 等待防抖完成
      await new Promise((resolve) => setTimeout(resolve, 700));

      const filePath = join(workspacePath, "sessions", `${session.sessionId}.json`);
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw);

      // 应包含所有 3 条消息
      expect(data.messages).toHaveLength(3);
    });

    it("deleteSession 应删除文件", async () => {
      workspacePath = await createTempWorkspace();
      const manager = createSessionManager(workspacePath);
      await manager.init();

      const session = manager.createSession("agent:main");

      // 等待初始写盘
      await new Promise((resolve) => setTimeout(resolve, 100));

      manager.deleteSession(session.sessionId);

      // 等待删除完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = await readdir(join(workspacePath, "sessions"));
      expect(files).not.toContain(`${session.sessionId}.json`);
    });

    it("损坏的文件应跳过", async () => {
      workspacePath = await createTempWorkspace();
      const sessionsDir = join(workspacePath, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      // 写入损坏的 JSON
      await writeFile(join(sessionsDir, "bad.json"), "not valid json{{{");

      // 写入缺少必要字段的 JSON
      await writeFile(join(sessionsDir, "incomplete.json"), JSON.stringify({ foo: "bar" }));

      // 写入正常文件
      const goodData = {
        sessionId: "good-session",
        agentId: "agent:main",
        description: "正常会话",
        messages: [],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };
      await writeFile(join(sessionsDir, "good-session.json"), JSON.stringify(goodData));

      const manager = createSessionManager(workspacePath);
      await manager.init();

      // 只加载了正常文件
      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe("good-session");
    });

    it("无 workspacePath 时不持久化", async () => {
      const manager = createSessionManager();
      await manager.init(); // 不应报错

      manager.createSession("agent:main");
      // 不应有任何文件操作
    });

    it("executionTree 应持久化和恢复", async () => {
      workspacePath = await createTempWorkspace();
      const manager = createSessionManager(workspacePath);
      await manager.init();

      const session = manager.createSession("agent:main");
      const tree = createExecutionTree("agent:main", "持久化测试任务");

      manager.setExecutionTree(session.sessionId, tree);

      // 等待防抖写盘
      await new Promise((resolve) => setTimeout(resolve, 700));

      // 创建新 manager 从磁盘恢复
      const manager2 = createSessionManager(workspacePath);
      await manager2.init();

      const restored = manager2.getExecutionTree(session.sessionId);
      expect(restored).not.toBeNull();
      expect(restored!.agentId).toBe("agent:main");
      expect(restored!.id).toBe(tree.id);
    });

    it("tokenUsage 应持久化和恢复", async () => {
      workspacePath = await createTempWorkspace();
      const manager = createSessionManager(workspacePath);
      await manager.init();

      const session = manager.createSession("agent:main");

      manager.addTokenUsage(session.sessionId, { promptTokens: 100, completionTokens: 50 });
      manager.addTokenUsage(session.sessionId, { promptTokens: 200, completionTokens: 100 });

      // 等待防抖写盘
      await new Promise((resolve) => setTimeout(resolve, 700));

      // 创建新 manager 从磁盘恢复
      const manager2 = createSessionManager(workspacePath);
      await manager2.init();

      const usage = manager2.getTokenUsage(session.sessionId);
      expect(usage).not.toBeNull();
      expect(usage!.totalPromptTokens).toBe(300);
      expect(usage!.totalCompletionTokens).toBe(150);
      expect(usage!.totalTokens).toBe(450);
      expect(usage!.messageCount).toBe(2);
    });
  });

  describe("tokenUsage", () => {
    it("addTokenUsage 应累加用量", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");

      manager.addTokenUsage(session.sessionId, { promptTokens: 10, completionTokens: 5 });
      manager.addTokenUsage(session.sessionId, { promptTokens: 20, completionTokens: 10 });

      const usage = manager.getTokenUsage(session.sessionId);
      expect(usage!.totalPromptTokens).toBe(30);
      expect(usage!.totalCompletionTokens).toBe(15);
      expect(usage!.totalTokens).toBe(45);
      expect(usage!.messageCount).toBe(2);
    });

    it("addTokenUsage 会话不存在时返回 false", () => {
      const manager = createSessionManager();
      expect(manager.addTokenUsage("nonexistent", { promptTokens: 10 })).toBe(false);
    });

    it("getTokenUsage 初始为零", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");

      const usage = manager.getTokenUsage(session.sessionId);
      expect(usage!.totalTokens).toBe(0);
      expect(usage!.messageCount).toBe(0);
    });

    it("getTokenUsage 会话不存在时返回 null", () => {
      const manager = createSessionManager();
      expect(manager.getTokenUsage("nonexistent")).toBeNull();
    });

    it("toSessionInfo 应包含 tokenUsage", () => {
      const manager = createSessionManager();
      const session = manager.createSession("agent:main");

      manager.addTokenUsage(session.sessionId, { promptTokens: 50, completionTokens: 25 });
      const info = manager.getSession(session.sessionId);
      expect(info!.tokenUsage).toBeDefined();
      expect(info!.tokenUsage!.totalTokens).toBe(75);
    });
  });
});
