/**
 * 身体图式定时推送测试
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { startBodyPush } from "../../src/api/ws-body-push.js";
import type { SchemaProvider } from "../../src/schema/schema-provider.js";
import type { WsServer } from "../../src/api/ws-server.js";

describe("startBodyPush", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("应定时刷新并广播", async () => {
    vi.useFakeTimers();

    const mockBody = { platform: "test", cpuCores: 4, memory: { totalGB: "16", availableGB: "8", usagePercent: 50 }, disk: { availableGB: "100", totalGB: "500" }, gpu: [], nodeVersion: "v20.0.0", workspacePath: "/tmp", timestamp: "2026-01-01" };

    const schemaProvider = {
      refresh: vi.fn().mockResolvedValue(undefined),
      getBodySchema: vi.fn().mockReturnValue(mockBody),
    } as unknown as SchemaProvider;

    const wsServer = {
      broadcast: vi.fn(),
      sendToSession: vi.fn(),
      close: vi.fn(),
    } as WsServer;

    const push = startBodyPush(schemaProvider, wsServer);

    // 初始不应调用
    expect(schemaProvider.refresh).not.toHaveBeenCalled();

    // 推进 5 秒
    await vi.advanceTimersByTimeAsync(5_000);

    expect(schemaProvider.refresh).toHaveBeenCalledTimes(1);
    expect(wsServer.broadcast).toHaveBeenCalledWith("body_schema", "body_schema_update", mockBody);

    // 再推进 5 秒
    await vi.advanceTimersByTimeAsync(5_000);
    expect(schemaProvider.refresh).toHaveBeenCalledTimes(2);

    push.stop();
  });

  it("stop 后不应继续推送", async () => {
    vi.useFakeTimers();

    const schemaProvider = {
      refresh: vi.fn().mockResolvedValue(undefined),
      getBodySchema: vi.fn().mockReturnValue({}),
    } as unknown as SchemaProvider;

    const wsServer = {
      broadcast: vi.fn(),
      sendToSession: vi.fn(),
      close: vi.fn(),
    } as WsServer;

    const push = startBodyPush(schemaProvider, wsServer);
    push.stop();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(schemaProvider.refresh).not.toHaveBeenCalled();
  });

  it("refresh 失败不应阻止后续推送", async () => {
    vi.useFakeTimers();

    const schemaProvider = {
      refresh: vi.fn()
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValue(undefined),
      getBodySchema: vi.fn().mockReturnValue({ test: true }),
    } as unknown as SchemaProvider;

    const wsServer = {
      broadcast: vi.fn(),
      sendToSession: vi.fn(),
      close: vi.fn(),
    } as WsServer;

    const push = startBodyPush(schemaProvider, wsServer);

    // 第一次推送失败
    await vi.advanceTimersByTimeAsync(5_000);
    expect(schemaProvider.refresh).toHaveBeenCalledTimes(1);
    expect(wsServer.broadcast).not.toHaveBeenCalled();

    // 第二次推送成功
    await vi.advanceTimersByTimeAsync(5_000);
    expect(schemaProvider.refresh).toHaveBeenCalledTimes(2);
    expect(wsServer.broadcast).toHaveBeenCalledTimes(1);

    push.stop();
  });
});
