/**
 * TUI 客户端测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTuiClient } from "../../src/tui/client.js";

/** 创建 mock fetch 响应 */
function mockJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: () => Promise.resolve(data),
    body: null,
    headers: new Headers(),
  } as unknown as Response;
}

describe("createTuiClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("health 应返回服务器信息", async () => {
    const mockData = { success: true, data: { status: "ok", version: "0.1.0", uptime: 120 }, error: null };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockJsonResponse(mockData));

    const client = createTuiClient({ baseUrl: "http://localhost:3000" });
    const result = await client.health();

    expect(result).toEqual({ status: "ok", version: "0.1.0", uptime: 120 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("health 应在 data 为 null 时返回 null", async () => {
    const mockData = { success: false, data: null, error: { code: "ERR", message: "fail" } };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockJsonResponse(mockData));

    const client = createTuiClient({ baseUrl: "http://localhost:3000" });
    const result = await client.health();

    expect(result).toBeNull();
  });

  it("createSession 应发送 POST 请求", async () => {
    const session = { sessionId: "s1", agentId: "agent:main", description: "test", messageCount: 0, createdAt: "", updatedAt: "" };
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockJsonResponse({ success: true, data: session, error: null }),
    );

    const client = createTuiClient({ baseUrl: "http://localhost:3000" });
    const result = await client.createSession("test");

    expect(result).toEqual(session);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ description: "test" }),
      }),
    );
  });

  it("listSessions 应返回会话列表", async () => {
    const sessions = [{ sessionId: "s1" }, { sessionId: "s2" }];
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockJsonResponse({ success: true, data: sessions, error: null }),
    );

    const client = createTuiClient({ baseUrl: "http://localhost:3000" });
    const result = await client.listSessions();

    expect(result).toHaveLength(2);
  });

  it("listSessions data 为 null 时应返回空数组", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockJsonResponse({ success: false, data: null, error: null }),
    );

    const client = createTuiClient({ baseUrl: "http://localhost:3000" });
    const result = await client.listSessions();

    expect(result).toEqual([]);
  });

  it("应在有 apiKey 时设置 Authorization 头", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockJsonResponse({ success: true, data: null, error: null }),
    );

    const client = createTuiClient({ baseUrl: "http://localhost:3000", apiKey: "secret" });
    await client.health();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
        }),
      }),
    );
  });

  it("sendMessageStream 应在 HTTP 错误时调用 onError", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      body: null,
    } as unknown as Response);

    const client = createTuiClient({ baseUrl: "http://localhost:3000" });
    const onError = vi.fn();

    await client.sendMessageStream("s1", "hello", { onError });

    expect(onError).toHaveBeenCalledWith("HTTP 500: Internal Server Error");
  });

  it("getMessages 应返回消息列表", async () => {
    const messages = [
      { id: "m1", role: "user", content: "hi", timestamp: "2026-01-01" },
      { id: "m2", role: "agent", content: "hello", timestamp: "2026-01-01" },
    ];
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockJsonResponse({ success: true, data: messages, error: null }),
    );

    const client = createTuiClient({ baseUrl: "http://localhost:3000" });
    const result = await client.getMessages("s1");

    expect(result).toHaveLength(2);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/chat/messages/s1",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
