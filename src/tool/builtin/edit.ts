/**
 * tool:edit — 文件编辑
 *
 * 对文件内容进行精确字符串替换（差异修改），不覆盖整个文件。
 * 支持 replaceAll 模式。
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ToolHandler } from "../types.js";

/** edit 工具处理函数 */
export const handleEdit: ToolHandler = async (input, context) => {
  const filePath = input["path"] as string;
  const oldString = input["oldString"] as string;
  const newString = input["newString"] as string;
  const replaceAll = (input["replaceAll"] as boolean | undefined) ?? false;

  const fullPath = resolve(context.workspacePath, filePath);
  const content = await readFile(fullPath, "utf-8");

  if (!content.includes(oldString)) {
    return {
      success: false,
      error: "未找到要替换的文本",
    };
  }

  let updated: string;
  let count: number;

  if (replaceAll) {
    count = content.split(oldString).length - 1;
    updated = content.replaceAll(oldString, newString);
  } else {
    // 检查唯一性
    const firstIdx = content.indexOf(oldString);
    const secondIdx = content.indexOf(oldString, firstIdx + 1);
    if (secondIdx !== -1) {
      return {
        success: false,
        error: "要替换的文本不唯一，请提供更多上下文或使用 replaceAll",
      };
    }
    updated = content.replace(oldString, newString);
    count = 1;
  }

  await writeFile(fullPath, updated, "utf-8");

  return {
    success: true,
    replacements: count,
    path: fullPath,
  };
};
