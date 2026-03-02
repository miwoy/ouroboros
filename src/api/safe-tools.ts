/**
 * 安全工具过滤
 *
 * 过滤掉不适合 Web Chat 暴露的危险工具。
 * 通过的工具仅限文件操作、搜索、网络检索等安全工具。
 */

import type { OuroborosTool } from "../tool/types.js";

/** 在 Web Chat 中屏蔽的工具 ID 集合 */
const BLOCKED_TOOL_IDS: ReadonlySet<string> = new Set([
  "tool:bash",
  "tool:create-tool",
  "tool:call-model",
  "tool:run-agent",
  "tool:create-skill",
]);

/**
 * 过滤出安全工具
 *
 * 移除 bash、create-tool、call-model、run-agent、create-skill 等危险工具。
 * 保留 read、write、edit、find、web-search、web-fetch、search-tool、search-skill 等安全工具。
 */
export function filterSafeTools(tools: readonly OuroborosTool[]): readonly OuroborosTool[] {
  return tools.filter((t) => !BLOCKED_TOOL_IDS.has(t.id));
}
