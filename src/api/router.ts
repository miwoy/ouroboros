/**
 * 简易 HTTP 路由器
 *
 * 基于路径模式匹配，支持路径参数（:param 格式）。
 * 不引入第三方依赖，使用 Node.js 原生 http 模块。
 */

import type { HttpMethod, RouteHandler, RequestContext, SSEEvent } from "./types.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

/** 路由条目 */
interface Route {
  readonly method: HttpMethod;
  readonly pattern: string;
  readonly segments: readonly string[];
  readonly handler: RouteHandler;
}

/**
 * 创建路由器
 */
export function createRouter() {
  const routes: Route[] = [];

  function addRoute(method: HttpMethod, pattern: string, handler: RouteHandler): void {
    const segments = pattern.split("/").filter(Boolean);
    routes.push({ method, pattern, segments, handler });
  }

  function get(pattern: string, handler: RouteHandler): void {
    addRoute("GET", pattern, handler);
  }

  function post(pattern: string, handler: RouteHandler): void {
    addRoute("POST", pattern, handler);
  }

  /**
   * 匹配路由
   */
  function matchRoute(
    method: HttpMethod,
    path: string,
  ): { route: Route; params: Record<string, string> } | null {
    const pathSegments = path.split("/").filter(Boolean);

    for (const route of routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== pathSegments.length) continue;

      const params: Record<string, string> = {};
      let matched = true;

      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(":")) {
          params[seg.slice(1)] = pathSegments[i];
        } else if (seg !== pathSegments[i]) {
          matched = false;
          break;
        }
      }

      if (matched) return { route, params };
    }

    return null;
  }

  /**
   * 处理请求
   */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method || "GET").toUpperCase() as HttpMethod;
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());

    // CORS 预检
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const match = matchRoute(method, path);
    if (!match) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, data: null, error: { code: "NOT_FOUND", message: "路由不存在" } }));
      return;
    }

    // 解析请求体
    const body = method === "POST" || method === "PUT" ? await parseBody(req) : undefined;

    // 构建请求上下文
    const ctx: RequestContext = {
      method,
      path,
      params: match.params,
      query,
      headers: req.headers as Record<string, string | string[] | undefined>,
      body,
      respond(status: number, data: unknown) {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      },
      respondSSE(events: AsyncIterable<SSEEvent>) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        void (async () => {
          for await (const event of events) {
            res.write(`event: ${event.event}\ndata: ${event.data}\n\n`);
          }
          res.end();
        })();
      },
    };

    await match.route.handler(ctx);
  }

  return { get, post, handle, matchRoute };
}

/**
 * 解析请求体 JSON
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("无效的 JSON 请求体"));
      }
    });
    req.on("error", reject);
  });
}

export type Router = ReturnType<typeof createRouter>;
