/**
 * tool:web-search — 搜索引擎
 *
 * 使用模型能力模拟搜索引擎（实际项目中可替换为真实搜索 API）。
 * 当前实现通过 callModel 让模型基于知识回答搜索查询。
 */

import type { ToolHandler } from "../types.js";

/** web-search 工具处理函数 */
export const handleWebSearch: ToolHandler = async (input, context) => {
  const query = input["query"] as string;
  const limit = (input["limit"] as number | undefined) ?? 5;

  // 使用模型能力模拟搜索结果
  const response = await context.callModel({
    messages: [
      {
        role: "system",
        content:
          "你是一个搜索引擎助手。根据用户的搜索查询，返回相关的搜索结果。" +
          "以 JSON 数组格式返回结果，每个结果包含 title、url、snippet 字段。" +
          `最多返回 ${limit} 条结果。只返回 JSON，不要其他文字。`,
      },
      { role: "user", content: `搜索: ${query}` },
    ],
  });

  try {
    // 尝试解析模型返回的 JSON
    const content = response.content.trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]) as readonly Record<string, unknown>[];
      return {
        results: results.slice(0, limit),
        total: results.length,
        query,
      };
    }
  } catch {
    // 解析失败时返回原始内容
  }

  return {
    results: [{ title: "搜索结果", url: "", snippet: response.content }],
    total: 1,
    query,
  };
};
