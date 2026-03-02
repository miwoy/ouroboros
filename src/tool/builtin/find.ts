/**
 * tool:find — 文件查找
 *
 * 使用 glob 模式在 workspace 中查找文件。
 */

import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ToolHandler } from "../types.js";

/** find 工具处理函数 */
export const handleFind: ToolHandler = async (input, context) => {
  const pattern = input["pattern"] as string;
  const basePath = (input["path"] as string | undefined) ?? ".";
  const maxResults = (input["limit"] as number | undefined) ?? 100;

  const searchDir = join(context.workspacePath, basePath);
  const results: string[] = [];

  await walkDir(searchDir, context.workspacePath, pattern, results, maxResults);

  return {
    files: results,
    total: results.length,
    truncated: results.length >= maxResults,
  };
};

/**
 * 递归遍历目录，匹配 glob 模式
 *
 * 简化实现：支持 * 和 ** 通配符
 */
async function walkDir(
  dir: string,
  rootDir: string,
  pattern: string,
  results: string[],
  maxResults: number,
): Promise<void> {
  if (results.length >= maxResults) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break;

    const fullPath = join(dir, entry.name);
    const relPath = relative(rootDir, fullPath);

    // 跳过隐藏目录和 node_modules
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    if (entry.isDirectory()) {
      await walkDir(fullPath, rootDir, pattern, results, maxResults);
    } else if (matchGlob(relPath, pattern)) {
      results.push(relPath);
    }
  }
}

/**
 * 简化的 glob 匹配
 *
 * 支持: * (任意非/字符), ** (任意路径), ? (单字符)
 */
function matchGlob(path: string, pattern: string): boolean {
  // 转换 glob 到正则
  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "*" && pattern[i + 1] === "*") {
      regex += ".*";
      i += 2;
      if (pattern[i] === "/") i++; // 跳过 **/
    } else if (pattern[i] === "*") {
      regex += "[^/]*";
      i++;
    } else if (pattern[i] === "?") {
      regex += "[^/]";
      i++;
    } else if (pattern[i] === ".") {
      regex += "\\.";
      i++;
    } else {
      regex += pattern[i];
      i++;
    }
  }
  regex += "$";

  try {
    return new RegExp(regex).test(path);
  } catch {
    // 正则构建失败时回退到简单包含匹配
    return path.includes(pattern.replace(/\*/g, ""));
  }
}
