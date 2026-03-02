/**
 * tool:write — 文件创建/覆写
 *
 * 将内容写入指定路径的文件（覆盖原内容）。
 * 自动创建不存在的父目录。
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { ToolHandler } from "../types.js";

/** write 工具处理函数 */
export const handleWrite: ToolHandler = async (input, context) => {
  const filePath = input["path"] as string;
  const content = input["content"] as string;

  const fullPath = resolve(context.workspacePath, filePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");

  return {
    success: true,
    path: fullPath,
    bytesWritten: Buffer.byteLength(content, "utf-8"),
  };
};
