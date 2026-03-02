/**
 * 工具系统 Schema 单元测试
 */

import { describe, it, expect } from "vitest";
import {
  callModelInputSchema,
  runAgentInputSchema,
  searchToolInputSchema,
  createToolInputSchema,
  toolCallRequestSchema,
  validateToolInput,
  jsonSchemaSchema,
} from "../../src/tool/schema.js";

describe("callModelInputSchema", () => {
  it("应接受合法输入", () => {
    const result = callModelInputSchema.safeParse({
      messages: [{ role: "user", content: "你好" }],
    });
    expect(result.success).toBe(true);
  });

  it("应接受完整输入", () => {
    const result = callModelInputSchema.safeParse({
      messages: [{ role: "user", content: "你好" }],
      model: "gpt-4o",
      temperature: 0.7,
      maxTokens: 1000,
      provider: "openai",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝空消息列表", () => {
    const result = callModelInputSchema.safeParse({
      messages: [],
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝无 messages 字段", () => {
    const result = callModelInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("应拒绝无效角色", () => {
    const result = callModelInputSchema.safeParse({
      messages: [{ role: "invalid", content: "test" }],
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝超出范围的温度", () => {
    const result = callModelInputSchema.safeParse({
      messages: [{ role: "user", content: "test" }],
      temperature: 3,
    });
    expect(result.success).toBe(false);
  });
});

describe("runAgentInputSchema", () => {
  it("应接受合法输入", () => {
    const result = runAgentInputSchema.safeParse({
      agentId: "agent:test",
      task: "执行测试",
    });
    expect(result.success).toBe(true);
  });

  it("应接受包含 context 的输入", () => {
    const result = runAgentInputSchema.safeParse({
      agentId: "agent:test",
      task: "执行测试",
      context: "上下文信息",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝空 agentId", () => {
    const result = runAgentInputSchema.safeParse({
      agentId: "",
      task: "执行测试",
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝缺少 task", () => {
    const result = runAgentInputSchema.safeParse({
      agentId: "agent:test",
    });
    expect(result.success).toBe(false);
  });
});

describe("searchToolInputSchema", () => {
  it("应接受合法输入", () => {
    const result = searchToolInputSchema.safeParse({
      query: "数学计算",
    });
    expect(result.success).toBe(true);
  });

  it("应接受包含 limit 的输入", () => {
    const result = searchToolInputSchema.safeParse({
      query: "数学计算",
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝空 query", () => {
    const result = searchToolInputSchema.safeParse({
      query: "",
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝超出范围的 limit", () => {
    const result = searchToolInputSchema.safeParse({
      query: "test",
      limit: 100,
    });
    expect(result.success).toBe(false);
  });
});

describe("createToolInputSchema", () => {
  it("应接受合法输入", () => {
    const result = createToolInputSchema.safeParse({
      name: "加法计算器",
      description: "计算两个数字的和",
      inputSchema: { type: "object", properties: { a: { type: "number" } }, required: ["a"] },
      outputSchema: { type: "object", properties: { result: { type: "number" } } },
      code: "export default async function(input) { return { result: input.a + input.b }; }",
    });
    expect(result.success).toBe(true);
  });

  it("应接受包含 tags 的输入", () => {
    const result = createToolInputSchema.safeParse({
      name: "加法计算器",
      description: "计算",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      code: "export default async function() {}",
      tags: ["数学", "计算"],
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝空名称", () => {
    const result = createToolInputSchema.safeParse({
      name: "",
      description: "计算",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      code: "export default async function() {}",
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝缺少 code", () => {
    const result = createToolInputSchema.safeParse({
      name: "test",
      description: "test",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    });
    expect(result.success).toBe(false);
  });
});

describe("toolCallRequestSchema", () => {
  it("应接受合法请求", () => {
    const result = toolCallRequestSchema.safeParse({
      requestId: "req-001",
      toolId: "tool:call-model",
      input: { messages: [{ role: "user", content: "hello" }] },
      caller: { entityId: "agent:main" },
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少 requestId", () => {
    const result = toolCallRequestSchema.safeParse({
      toolId: "tool:call-model",
      input: {},
      caller: { entityId: "agent:main" },
    });
    expect(result.success).toBe(false);
  });
});

describe("validateToolInput", () => {
  it("应通过有效输入", () => {
    const errors = validateToolInput(
      { query: "test", limit: 5 },
      { required: ["query"], properties: { query: { type: "string" } } },
    );
    expect(errors).toHaveLength(0);
  });

  it("应检测缺少必填字段", () => {
    const errors = validateToolInput(
      { limit: 5 },
      { required: ["query"], properties: { query: { type: "string" } } },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("query");
  });

  it("应检测多个缺失字段", () => {
    const errors = validateToolInput(
      {},
      { required: ["a", "b"] },
    );
    expect(errors).toHaveLength(2);
  });

  it("应通过无 required 的 schema", () => {
    const errors = validateToolInput(
      { foo: "bar" },
      { properties: { foo: { type: "string" } } },
    );
    expect(errors).toHaveLength(0);
  });
});

describe("jsonSchemaSchema", () => {
  it("应接受基本 JSON Schema", () => {
    const result = jsonSchemaSchema.safeParse({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少 type 的 schema", () => {
    const result = jsonSchemaSchema.safeParse({
      properties: { name: { type: "string" } },
    });
    expect(result.success).toBe(false);
  });
});
