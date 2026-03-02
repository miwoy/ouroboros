/**
 * tool:search-tool — 内置工具检索工具
 *
 * 搜索策略：
 * 1. 尝试 qmd 语义搜索 workspace/prompts/tool.md
 * 2. 在内存注册表中关键词匹配
 * 3. 合并去重排序
 */

import { searchBySemantic } from "../../prompt/loader.js";
import { searchToolInputSchema } from "../schema.js";
import { ToolExecutionError } from "../../errors/index.js";
import type { ToolHandler } from "../types.js";

/** 搜索结果条目 */
interface ToolSearchHit {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly score: number;
}

/** search-tool 工具处理函数 */
export const handleSearchTool: ToolHandler = async (input, context) => {
  // 校验输入
  const parsed = searchToolInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ToolExecutionError(`search-tool 输入校验失败: ${parsed.error.message}`);
  }

  const { query, limit = 5 } = parsed.data;
  const hits: ToolSearchHit[] = [];
  const seenIds = new Set<string>();

  // 策略 1：qmd 语义搜索 tool.md
  try {
    const semanticResults = await searchBySemantic(context.workspacePath, query, { limit });
    for (const result of semanticResults) {
      if (result.fileType === "tool") {
        // 从搜索结果中提取工具信息
        const toolsFromContent = extractToolsFromContent(result.content, context);
        for (const tool of toolsFromContent) {
          if (!seenIds.has(tool.id)) {
            seenIds.add(tool.id);
            hits.push({ ...tool, score: result.score });
          }
        }
      }
    }
  } catch {
    // 语义搜索失败不影响后续流程
  }

  // 策略 2：在内存注册表中关键词匹配
  const allTools = context.registry.list();
  const queryTerms = query.split(/\s+/).filter((t) => t.length > 0);

  for (const tool of allTools) {
    if (seenIds.has(tool.id)) continue;

    let score = 0;
    const nameLower = tool.name.toLowerCase();
    const descLower = tool.description.toLowerCase();

    for (const term of queryTerms) {
      const termLower = term.toLowerCase();
      // name 匹配
      if (nameLower === termLower) score += 3;
      else if (nameLower.includes(termLower)) score += 2;
      // description 匹配
      if (descLower.includes(termLower)) score += 1;
      // tags 匹配
      if (tool.tags) {
        for (const tag of tool.tags) {
          if (tag.toLowerCase().includes(termLower) || termLower.includes(tag.toLowerCase())) {
            score += 2;
          }
        }
      }
    }

    if (score > 0) {
      seenIds.add(tool.id);
      hits.push({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        score,
      });
    }
  }

  // 排序（降序）并截取
  hits.sort((a, b) => b.score - a.score);
  const limited = hits.slice(0, limit);

  return {
    tools: limited,
    total: limited.length,
  };
};

/**
 * 从 tool.md 搜索结果内容中提取工具信息
 * tool.md 中工具条目格式：| 名称 | ID | 描述 | 入口 |
 */
function extractToolsFromContent(
  content: string,
  context: {
    readonly registry: {
      get(
        id: string,
      ): { readonly id: string; readonly name: string; readonly description: string } | undefined;
    };
  },
): ToolSearchHit[] {
  const results: ToolSearchHit[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // 匹配 markdown 表格行
    const match = line.match(/\|\s*(.+?)\s*\|\s*(tool:[a-z0-9-]+)\s*\|\s*(.+?)\s*\|/);
    if (match) {
      const id = match[2];
      // 优先从注册表获取完整信息
      const registered = context.registry.get(id);
      if (registered) {
        results.push({
          id: registered.id,
          name: registered.name,
          description: registered.description,
          score: 0,
        });
      } else {
        results.push({
          id,
          name: match[1],
          description: match[3],
          score: 0,
        });
      }
    }
  }

  return results;
}
