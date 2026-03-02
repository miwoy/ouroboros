/**
 * tool:read — 文件读取
 *
 * 读取指定文件内容，支持行范围限制。
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ToolHandler } from "../types.js";

/** read 工具处理函数 */
export const handleRead: ToolHandler = async (input, context) => {
  const filePath = input["path"] as string;
  const offset = input["offset"] as number | undefined;
  const limit = input["limit"] as number | undefined;

  const fullPath = resolve(context.workspacePath, filePath);

  const content = await readFile(fullPath, "utf-8");
  const lines = content.split("\n");

  if (offset !== undefined || limit !== undefined) {
    const start = offset ?? 0;
    const end = limit !== undefined ? start + limit : lines.length;
    const sliced = lines.slice(start, end);
    return {
      content: sliced.join("\n"),
      totalLines: lines.length,
      startLine: start,
      endLine: Math.min(end, lines.length),
    };
  }

  return {
    content,
    totalLines: lines.length,
  };
};
