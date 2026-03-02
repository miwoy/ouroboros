/**
 * Logger 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../../src/logger/logger.js";
import { LOG_LEVEL_PRIORITY, type LogLevel } from "../../src/logger/types.js";

// Mock fs 模块
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
}));

import { mkdir, appendFile } from "node:fs/promises";

const mockMkdir = vi.mocked(mkdir);
const mockAppendFile = vi.mocked(appendFile);

describe("Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createLogger", () => {
    it("应创建包含 debug/info/warn/error 方法的 Logger", () => {
      const logger = createLogger("/workspace", "info");
      expect(logger.debug).toBeTypeOf("function");
      expect(logger.info).toBeTypeOf("function");
      expect(logger.warn).toBeTypeOf("function");
      expect(logger.error).toBeTypeOf("function");
    });
  });

  describe("日志级别过滤", () => {
    it("minLevel=info 时应过滤 debug 日志", async () => {
      const logger = createLogger("/workspace", "info");
      logger.debug("test", "debug message");

      // fire-and-forget，给一点时间
      await vi.waitFor(() => {
        // debug 不应触发写入
      });

      // mkdir 不应被调用（因为 debug 被过滤）
      expect(mockMkdir).not.toHaveBeenCalled();
    });

    it("minLevel=info 时应写入 info 日志", async () => {
      const logger = createLogger("/workspace", "info");
      logger.info("react-loop", "开始循环");

      // 等待异步写入
      await vi.waitFor(() => {
        expect(mockMkdir).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalled();
      });

      const writtenData = mockAppendFile.mock.calls[0]?.[1] as string;
      const entry = JSON.parse(writtenData.trim());
      expect(entry.level).toBe("info");
      expect(entry.source).toBe("react-loop");
      expect(entry.message).toBe("开始循环");
      expect(entry.timestamp).toBeDefined();
    });

    it("minLevel=warn 时应过滤 info 日志", async () => {
      const logger = createLogger("/workspace", "warn");
      logger.info("test", "info message");

      await vi.waitFor(() => {
        // info 不应触发写入
      });

      expect(mockMkdir).not.toHaveBeenCalled();
    });

    it("minLevel=error 时只写入 error 日志", async () => {
      const logger = createLogger("/workspace", "error");
      logger.debug("test", "debug");
      logger.info("test", "info");
      logger.warn("test", "warn");
      logger.error("test", "error message");

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const writtenData = mockAppendFile.mock.calls[0]?.[1] as string;
      const entry = JSON.parse(writtenData.trim());
      expect(entry.level).toBe("error");
    });

    it("minLevel=debug 时应写入所有级别", async () => {
      const logger = createLogger("/workspace", "debug");
      logger.debug("test", "debug");
      logger.info("test", "info");
      logger.warn("test", "warn");
      logger.error("test", "error");

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(4);
      });
    });
  });

  describe("日志内容", () => {
    it("应包含 data 字段", async () => {
      const logger = createLogger("/workspace", "info");
      logger.info("tool-executor", "工具执行", { toolId: "tool:call-model", duration: 150 });

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalled();
      });

      const writtenData = mockAppendFile.mock.calls[0]?.[1] as string;
      const entry = JSON.parse(writtenData.trim());
      expect(entry.data).toEqual({ toolId: "tool:call-model", duration: 150 });
    });

    it("无 data 时不应包含 data 字段", async () => {
      const logger = createLogger("/workspace", "info");
      logger.info("test", "简单消息");

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalled();
      });

      const writtenData = mockAppendFile.mock.calls[0]?.[1] as string;
      const entry = JSON.parse(writtenData.trim());
      expect(entry).not.toHaveProperty("data");
    });

    it("日志文件路径应包含日期", async () => {
      const logger = createLogger("/workspace", "info");
      logger.info("test", "message");

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalled();
      });

      const filePath = mockAppendFile.mock.calls[0]?.[0] as string;
      // 路径应匹配 /workspace/logs/yyyy-MM-dd.log
      expect(filePath).toMatch(/\/workspace\/logs\/\d{4}-\d{2}-\d{2}\.log$/);
    });

    it("应先创建 logs 目录", async () => {
      const logger = createLogger("/workspace", "info");
      logger.info("test", "message");

      await vi.waitFor(() => {
        expect(mockMkdir).toHaveBeenCalledWith(
          expect.stringContaining("/workspace/logs"),
          { recursive: true },
        );
      });
    });
  });

  describe("错误处理", () => {
    it("日志写入失败不应抛出异常", async () => {
      mockMkdir.mockRejectedValueOnce(new Error("权限不足"));

      const logger = createLogger("/workspace", "info");
      // 不应抛出
      expect(() => logger.error("test", "error message")).not.toThrow();
    });
  });

  describe("LOG_LEVEL_PRIORITY", () => {
    it("优先级应递增：debug < info < warn < error", () => {
      expect(LOG_LEVEL_PRIORITY.debug).toBeLessThan(LOG_LEVEL_PRIORITY.info);
      expect(LOG_LEVEL_PRIORITY.info).toBeLessThan(LOG_LEVEL_PRIORITY.warn);
      expect(LOG_LEVEL_PRIORITY.warn).toBeLessThan(LOG_LEVEL_PRIORITY.error);
    });
  });
});
