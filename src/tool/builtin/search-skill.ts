/**
 * tool:search-skill — 技能库检索
 *
 * 在技能库中搜索匹配的技能，结合向量语义检索和关键词匹配。
 */

import { searchBySemantic } from "../../prompt/loader.js";
import type { ToolHandler } from "../types.js";

/** search-skill 工具处理函数 */
export const handleSearchSkill: ToolHandler = async (input, context) => {
  const query = input["query"] as string;
  const limit = (input["limit"] as number | undefined) ?? 5;

  // 通过提示词系统的语义搜索查找技能
  const results = await searchBySemantic(context.workspacePath, query, {
    limit,
  });

  // 过滤只返回 skill 类型的结果
  const skillResults = results.filter((r) => r.fileType === "skill");

  return {
    skills: skillResults.map((r) => ({
      name: r.fileName,
      content: r.content,
      score: r.score,
    })),
    total: skillResults.length,
    query,
  };
};
