import { describe, it, expect, vi, afterEach } from "vitest";
import { createShutdownHandler } from "../../src/persistence/shutdown.js";

describe("关闭处理器", () => {
  afterEach(() => {
    // 清理可能残留的监听器
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  it("初始状态 isShuttingDown 为 false", () => {
    const handler = createShutdownHandler();
    expect(handler.isShuttingDown()).toBe(false);
  });

  it("register 应注册信号处理函数", () => {
    const handler = createShutdownHandler();
    const onShutdown = vi.fn().mockResolvedValue(undefined);

    const originalCount = process.listenerCount("SIGINT");
    handler.register(onShutdown);
    expect(process.listenerCount("SIGINT")).toBe(originalCount + 1);
    expect(process.listenerCount("SIGTERM")).toBeGreaterThan(0);

    handler.unregister();
  });

  it("unregister 应移除信号处理函数", () => {
    const handler = createShutdownHandler();
    const onShutdown = vi.fn().mockResolvedValue(undefined);

    handler.register(onShutdown);
    const countAfterRegister = process.listenerCount("SIGINT");

    handler.unregister();
    expect(process.listenerCount("SIGINT")).toBe(countAfterRegister - 1);
  });

  it("重复 register 应先清除旧的监听器", () => {
    const handler = createShutdownHandler();
    const onShutdown1 = vi.fn().mockResolvedValue(undefined);
    const onShutdown2 = vi.fn().mockResolvedValue(undefined);

    const baseCount = process.listenerCount("SIGINT");
    handler.register(onShutdown1);
    handler.register(onShutdown2);
    // 应该只增加1个（先清除旧的，再注册新的）
    expect(process.listenerCount("SIGINT")).toBe(baseCount + 1);

    handler.unregister();
  });
});
