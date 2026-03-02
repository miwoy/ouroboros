/**
 * tool:web-fetch — URL 内容抓取
 *
 * 使用 Node.js fetch 获取指定 URL 的内容。
 * 支持超时控制和内容长度限制。
 */

import type { ToolHandler } from "../types.js";

/** 最大内容长度（字符） */
const MAX_CONTENT_LENGTH = 50000;

/** web-fetch 工具处理函数 */
export const handleWebFetch: ToolHandler = async (input, context) => {
  const url = input["url"] as string;
  const timeoutMs = (input["timeout"] as number | undefined) ?? 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 合并外部取消信号
  if (context.signal) {
    context.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Ouroboros/1.0",
        Accept: "text/html,application/json,text/plain,*/*",
      },
    });

    const contentType = response.headers.get("content-type") ?? "unknown";
    const text = await response.text();
    const content = text.slice(0, MAX_CONTENT_LENGTH);

    return {
      success: response.ok,
      status: response.status,
      contentType,
      content,
      truncated: text.length > MAX_CONTENT_LENGTH,
      url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      status: 0,
      contentType: "",
      content: "",
      error: message,
      url,
    };
  } finally {
    clearTimeout(timer);
  }
};
