/**
 * 静态文件服务
 *
 * 从指定目录提供静态文件，支持 SPA fallback（非文件路径返回 index.html）。
 * 仅使用 Node.js 原生模块，不引入第三方依赖。
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

/** MIME 类型映射 */
const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

/** 默认 MIME 类型 */
const DEFAULT_MIME = "application/octet-stream";

/**
 * 尝试提供静态文件
 *
 * @returns true 表示已处理请求，false 表示未命中（交给后续处理）
 */
export async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string,
): Promise<boolean> {
  // 仅处理 GET/HEAD
  const method = req.method?.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;

  // 解析路径
  const urlPath = new URL(req.url || "/", "http://localhost").pathname;
  const decodedPath = decodeURIComponent(urlPath);

  // 拼接并规范化文件路径
  const resolvedDir = resolve(staticDir);
  const filePath = resolve(resolvedDir, decodedPath === "/" ? "index.html" : "." + decodedPath);

  // 安全检查：防止目录遍历
  if (!filePath.startsWith(resolvedDir)) return false;

  // 尝试读取目标文件
  const served = await tryServeFile(res, filePath, method === "HEAD");
  if (served) return true;

  // SPA fallback：无扩展名的路径返回 index.html
  const ext = extname(decodedPath);
  if (!ext) {
    const indexPath = join(resolvedDir, "index.html");
    return tryServeFile(res, indexPath, method === "HEAD");
  }

  // 有扩展名但文件不存在 → 交给 404 处理
  return false;
}

/**
 * 尝试提供单个文件
 */
async function tryServeFile(
  res: ServerResponse,
  filePath: string,
  headOnly: boolean,
): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;

    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || DEFAULT_MIME;
    const cacheControl = getCacheControl(filePath);

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": fileStat.size,
      "Cache-Control": cacheControl,
    });

    if (headOnly) {
      res.end();
    } else {
      createReadStream(filePath).pipe(res);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 根据文件路径确定 Cache-Control 策略
 *
 * - assets/ 下的文件（带 hash 文件名）：长期缓存
 * - index.html：不缓存（确保拿到最新版本）
 * - 其他：短期缓存
 */
function getCacheControl(filePath: string): string {
  if (filePath.endsWith("index.html") || filePath.endsWith(".html")) {
    return "no-cache, no-store, must-revalidate";
  }
  if (filePath.includes("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}
