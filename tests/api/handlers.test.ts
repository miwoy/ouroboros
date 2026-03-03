/**
 * API 路由处理器测试
 *
 * 通过启动真实服务器进行 HTTP 集成测试。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { createApiServer } from "../../src/api/server.js";
import type { ApiDeps } from "../../src/api/types.js";
import type { Logger } from "../../src/logger/types.js";
import type { ToolRegistry, OuroborosTool } from "../../src/tool/types.js";
import { EntityType, EntityStatus } from "../../src/tool/types.js";
import { createExecutionTree } from "../../src/core/execution-tree.js";

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/** 每次测试使用独立临时目录，避免持久化文件干扰 */
function uniqueWorkspacePath(): string {
  return join(tmpdir(), `ouroboros-handler-test-${randomUUID()}`);
}

function createDeps(): ApiDeps {
  return {
    logger: createMockLogger(),
    workspacePath: uniqueWorkspacePath(),
    config: {
      port: 0,
      host: "127.0.0.1",
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      corsOrigin: "*",
    },
  };
}

function createMockTool(id: string): OuroborosTool {
  return {
    id,
    type: EntityType.Tool,
    name: id.replace("tool:", ""),
    description: `${id} 工具`,
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

function createMockToolRegistry(tools: OuroborosTool[]): ToolRegistry {
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

function createDepsWithReact(): ApiDeps {
  const mockProvider = {
    name: "test",
    complete: vi.fn().mockResolvedValue({
      content: "ReAct 回答",
      toolCalls: [],
      stopReason: "end_turn",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: "test",
    }),
    stream: vi.fn(),
  };

  const providerRegistry = {
    get: async () => mockProvider,
    has: () => true,
    names: () => ["test"],
  };

  return {
    logger: createMockLogger(),
    workspacePath: uniqueWorkspacePath(),
    config: {
      port: 0,
      host: "127.0.0.1",
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      corsOrigin: "*",
    },
    providerRegistry: providerRegistry as any,
    defaultProvider: "test",
    toolRegistry: createMockToolRegistry([
      createMockTool("tool:read"),
      createMockTool("tool:web-search"),
    ]),
    reactConfig: {
      maxIterations: 5,
      stepTimeout: 30000,
      parallelToolCalls: true,
      compressionThreshold: 50,
    },
  };
}

describe("API 路由处理器", () => {
  let server: ReturnType<typeof createApiServer> | null = null;
  let baseUrl: string;
  let currentWorkspacePath: string | null = null;

  async function startServer() {
    const deps = createDeps();
    currentWorkspacePath = deps.workspacePath;
    server = createApiServer(deps);
    await server.start();
    const addr = server.getHttpServer().address();
    if (!addr || typeof addr === "string") throw new Error("无效地址");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    if (currentWorkspacePath) {
      await rm(currentWorkspacePath, { recursive: true, force: true }).catch(() => {});
      currentWorkspacePath = null;
    }
  });

  describe("GET /api/health", () => {
    it("应返回健康状态", async () => {
      await startServer();
      const res = await fetch(`${baseUrl}/api/health`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("ok");
      expect(body.data.version).toBe("0.1.0");
      expect(body.data.uptime).toBeGreaterThan(0);
    });
  });

  describe("会话管理", () => {
    it("POST /api/sessions 应创建会话", async () => {
      await startServer();
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "测试会话" }),
      });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.sessionId).toBeTruthy();
      expect(body.data.description).toBe("测试会话");
    });

    it("GET /api/sessions 应列出会话", async () => {
      await startServer();

      // 创建两个会话
      await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await fetch(`${baseUrl}/api/sessions`);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it("GET /api/sessions/:id 应返回会话详情", async () => {
      await startServer();

      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "详情测试" }),
      });
      const { data: session } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/sessions/${session.sessionId}`);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.sessionId).toBe(session.sessionId);
    });

    it("GET /api/sessions/:id 不存在时应返回 404", async () => {
      await startServer();
      const res = await fetch(`${baseUrl}/api/sessions/nonexistent`);
      expect(res.status).toBe(404);
    });

    it("POST /api/sessions/:id/delete 应删除会话", async () => {
      await startServer();

      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { data: session } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/sessions/${session.sessionId}/delete`, {
        method: "POST",
      });
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(true);

      // 验证已删除
      const getRes = await fetch(`${baseUrl}/api/sessions/${session.sessionId}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe("消息", () => {
    it("POST /api/chat/message 应发送消息", async () => {
      await startServer();

      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "你好" }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.sessionId).toBeTruthy();
      expect(body.data.response).toContain("你好");
    });

    it("POST /api/chat/message 无消息应返回 400", async () => {
      await startServer();

      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it("POST /api/chat/message 应支持指定会话", async () => {
      await startServer();

      // 先创建会话
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { data: session } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, message: "测试" }),
      });
      const body = await res.json();

      expect(body.data.sessionId).toBe(session.sessionId);
    });

    it("GET /api/chat/messages/:sessionId 应返回消息历史", async () => {
      await startServer();

      // 发送消息（自动创建会话）
      const msgRes = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });
      const { data } = await msgRes.json();

      const res = await fetch(`${baseUrl}/api/chat/messages/${data.sessionId}`);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2); // user + agent
      expect(body.metadata?.total).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Agent 信息", () => {
    it("GET /api/agents 应返回 Agent 列表", async () => {
      await startServer();
      const res = await fetch(`${baseUrl}/api/agents`);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("agent:main");
    });

    it("GET /api/agents/:agentId 已知 agent 应返回详情", async () => {
      await startServer();
      const res = await fetch(`${baseUrl}/api/agents/agent:main`);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.id).toBe("agent:main");
    });

    it("GET /api/agents/:agentId 未知 agent 应返回 404", async () => {
      await startServer();
      const res = await fetch(`${baseUrl}/api/agents/agent:unknown`);
      expect(res.status).toBe(404);
    });
  });

  describe("执行树", () => {
    it("GET /api/sessions/:id/execution-tree 有执行树时应返回树", async () => {
      await startServer();

      // 创建会话
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "树测试" }),
      });
      const { data: session } = await createRes.json();

      // 设置执行树
      const tree = createExecutionTree("agent:main", "测试任务");
      server!.getSessionManager().setExecutionTree(session.sessionId, tree);

      const res = await fetch(`${baseUrl}/api/sessions/${session.sessionId}/execution-tree`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).not.toBeNull();
      expect(body.data.agentId).toBe("agent:main");
      expect(body.data.rootNodeId).toBeTruthy();
    });

    it("GET /api/sessions/:id/execution-tree 无执行树时应返回 null", async () => {
      await startServer();

      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { data: session } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/sessions/${session.sessionId}/execution-tree`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    });

    it("GET /api/sessions/:id/execution-tree 会话不存在时应返回 404", async () => {
      await startServer();

      const res = await fetch(`${baseUrl}/api/sessions/nonexistent/execution-tree`);
      expect(res.status).toBe(404);
    });
  });

  describe("SSE 流式", () => {
    it("POST /api/chat/message?stream=true 应返回 SSE 流（占位符模式）", async () => {
      await startServer();

      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello", stream: true }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/event-stream");

      const text = await res.text();
      expect(text).toContain("event: thinking");
      expect(text).toContain("event: text_delta");
      expect(text).toContain("event: done");
    });
  });

  describe("ReAct SSE 流式", () => {
    async function startReactServer() {
      const deps = createDepsWithReact();
      currentWorkspacePath = deps.workspacePath;
      server = createApiServer(deps);
      await server.start();
      const addr = server.getHttpServer().address();
      if (!addr || typeof addr === "string") throw new Error("无效地址");
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }

    it("ReAct SSE 应包含 react_step 和 text_delta 和 done 事件", async () => {
      await startReactServer();

      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "你好", stream: true }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/event-stream");

      const text = await res.text();
      expect(text).toContain("event: thinking");
      expect(text).toContain("event: react_step");
      expect(text).toContain("event: text_delta");
      expect(text).toContain("event: done");
    });

    it("ReAct 非流式应返回 ReAct 回答", async () => {
      await startReactServer();

      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "你好", stream: false }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.response).toBe("ReAct 回答");
    });
  });
});
