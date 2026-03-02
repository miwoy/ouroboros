/**
 * 上下文压缩单元测试
 */

import { describe, it, expect, vi } from "vitest";
import { compressContext, fallbackCompression } from "../../src/core/context-compression.js";
import type { Message, ModelResponse } from "../../src/model/types.js";
import type { CallModelFn } from "../../src/tool/types.js";

/** 创建 mock callModel */
function createMockCallModel(summaryContent: string = "这是摘要"): CallModelFn {
  return vi.fn().mockResolvedValue({
    content: summaryContent,
    toolCalls: [],
    stopReason: "end_turn",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model: "test",
  } satisfies ModelResponse);
}

/** 创建测试消息 */
function createMessages(count: number, includeSystem: boolean = true): Message[] {
  const messages: Message[] = [];
  if (includeSystem) {
    messages.push({ role: "system", content: "系统提示词" });
  }
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    messages.push({ role, content: `消息 ${i + 1}` } as Message);
  }
  return messages;
}

describe("上下文压缩", () => {
  describe("compressContext", () => {
    it("消息数未超阈值应原样返回", async () => {
      const messages = createMessages(5);
      const callModel = createMockCallModel();

      const result = await compressContext(messages, 10, callModel);

      expect(result).toEqual(messages);
      expect(callModel).not.toHaveBeenCalled();
    });

    it("超阈值应调用模型生成摘要", async () => {
      const messages = createMessages(12);
      const callModel = createMockCallModel("对话摘要内容");

      const result = await compressContext(messages, 8, callModel);

      expect(callModel).toHaveBeenCalledTimes(1);
      // 结果应包含 system + 摘要 + 最近 4 条
      expect(result.length).toBeLessThan(messages.length);

      // 第一条应是 system
      expect(result[0]!.role).toBe("system");
      // 第二条应是摘要
      expect(result[1]!.content).toContain("对话摘要");

      // 最后 4 条应保留
      const last4 = messages.filter((m) => m.role !== "system").slice(-4);
      for (const msg of last4) {
        expect(result.some((r) => r.content === msg.content)).toBe(true);
      }
    });

    it("压缩失败应回退到截断", async () => {
      const messages = createMessages(12);
      const callModel = vi.fn().mockRejectedValue(new Error("模型调用失败"));

      const result = await compressContext(messages, 8, callModel as CallModelFn);

      // 不应抛出异常
      expect(result.length).toBeLessThan(messages.length);
      // 应保留 system 消息
      expect(result[0]!.role).toBe("system");
    });

    it("应保留 system 消息", async () => {
      const messages: Message[] = [
        { role: "system", content: "系统1" },
        { role: "system", content: "系统2" },
        ...createMessages(10, false),
      ];
      const callModel = createMockCallModel();

      const result = await compressContext(messages, 8, callModel);

      const systemMsgs = result.filter((m) => m.role === "system");
      expect(systemMsgs.length).toBe(2);
    });

    it("非 system 消息不足 keepCount 时应原样返回", async () => {
      const messages: Message[] = [
        { role: "system", content: "系统" },
        { role: "user", content: "消息1" },
        { role: "assistant", content: "消息2" },
      ];
      const callModel = createMockCallModel();

      const result = await compressContext(messages, 2, callModel);

      expect(result).toEqual(messages);
    });
  });

  describe("fallbackCompression", () => {
    it("应保留 system + 首条 + 最近 keepCount 条", () => {
      const messages = createMessages(10);

      const result = fallbackCompression(messages, 3);

      // system + 首条用户消息 + 最近 3 条
      expect(result[0]!.role).toBe("system");
      expect(result[1]!.content).toBe("消息 1"); // 首条非 system
      expect(result.length).toBe(5); // system + first + 3 recent
    });

    it("消息数不足时应原样返回", () => {
      const messages = createMessages(3);

      const result = fallbackCompression(messages, 4);

      expect(result).toEqual(messages);
    });

    it("无 system 消息时也应正常工作", () => {
      const messages = createMessages(8, false);

      const result = fallbackCompression(messages, 3);

      // 首条 + 最近 3 条
      expect(result.length).toBe(4);
      expect(result[0]!.content).toBe("消息 1");
    });
  });
});
