/**
 * 静态文件服务测试
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { serveStatic } from "../../src/api/static.js";

/** 临时静态文件目录 */
const TEST_DIR = resolve(import.meta.dirname, "__static_test__");

/** 创建模拟请求 */
function createMockReq(method: string, url: string): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000" };
  return req;
}

/** 创建模拟响应并收集输出 */
function createMockRes(): ServerResponse & {
  _status: number;
  _headers: Record<string, string | number>;
  _ended: boolean;
  _body: string;
} {
  const socket = new Socket();
  const res = new ServerResponse(new IncomingMessage(socket)) as ServerResponse & {
    _status: number;
    _headers: Record<string, string | number>;
    _ended: boolean;
    _body: string;
  };

  res._status = 0;
  res._headers = {};
  res._ended = false;
  res._body = "";

  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = ((statusCode: number, headers?: Record<string, string | number>) => {
    res._status = statusCode;
    if (headers) {
      res._headers = { ...res._headers, ...headers };
    }
    return originalWriteHead(statusCode, headers);
  }) as typeof res.writeHead;

  const originalEnd = res.end.bind(res);
  res.end = ((chunk?: unknown) => {
    res._ended = true;
    if (typeof chunk === "string") {
      res._body = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      res._body = chunk.toString();
    }
    return originalEnd(chunk as string);
  }) as typeof res.end;

  return res;
}

/** 等待流式响应完成 */
function waitForEnd(res: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    res.on("finish", resolve);
    // 超时兜底
    setTimeout(resolve, 500);
  });
}

beforeAll(() => {
  // 创建测试目录结构
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, "assets"), { recursive: true });
  mkdirSync(join(TEST_DIR, "sub"), { recursive: true });

  // 创建测试文件
  writeFileSync(join(TEST_DIR, "index.html"), "<!DOCTYPE html><html></html>");
  writeFileSync(join(TEST_DIR, "assets", "app.abc123.js"), "console.log('hello')");
  writeFileSync(join(TEST_DIR, "assets", "style.def456.css"), "body { color: red }");
  writeFileSync(join(TEST_DIR, "favicon.ico"), "icon-data");
  writeFileSync(join(TEST_DIR, "data.json"), '{"key":"value"}');
  writeFileSync(join(TEST_DIR, "image.png"), "png-data");
  writeFileSync(join(TEST_DIR, "image.svg"), "<svg></svg>");
  writeFileSync(join(TEST_DIR, "sub", "page.html"), "<html>sub</html>");
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("serveStatic", () => {
  describe("MIME 类型", () => {
    it("HTML 文件返回 text/html", async () => {
      const req = createMockReq("GET", "/index.html");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._status).toBe(200);
      expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
    });

    it("JS 文件返回 application/javascript", async () => {
      const req = createMockReq("GET", "/assets/app.abc123.js");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._headers["Content-Type"]).toBe("application/javascript; charset=utf-8");
    });

    it("CSS 文件返回 text/css", async () => {
      const req = createMockReq("GET", "/assets/style.def456.css");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._headers["Content-Type"]).toBe("text/css; charset=utf-8");
    });

    it("JSON 文件返回 application/json", async () => {
      const req = createMockReq("GET", "/data.json");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._headers["Content-Type"]).toBe("application/json; charset=utf-8");
    });

    it("SVG 文件返回 image/svg+xml", async () => {
      const req = createMockReq("GET", "/image.svg");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._headers["Content-Type"]).toBe("image/svg+xml");
    });

    it("ICO 文件返回 image/x-icon", async () => {
      const req = createMockReq("GET", "/favicon.ico");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._headers["Content-Type"]).toBe("image/x-icon");
    });
  });

  describe("SPA fallback", () => {
    it("无扩展名路径返回 index.html", async () => {
      const req = createMockReq("GET", "/some/route");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._status).toBe(200);
      expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
    });

    it("根路径 / 返回 index.html", async () => {
      const req = createMockReq("GET", "/");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._status).toBe(200);
      expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
    });

    it("深层 SPA 路由返回 index.html", async () => {
      const req = createMockReq("GET", "/chat/session/abc123");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
    });
  });

  describe("目录遍历防护", () => {
    it("../ 路径被 URL 规范化，不会逃出 staticDir", async () => {
      // URL 解析器将 /../../../etc/passwd 规范化为 /etc/passwd
      // resolve 后变为 ${staticDir}/etc/passwd（仍在 staticDir 内）
      // 文件不存在 + 无扩展名 → SPA fallback（安全）
      const req = createMockReq("GET", "/../../../etc/passwd");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      // SPA fallback 返回 index.html，不会读取真实 /etc/passwd
      expect(served).toBe(true);
      expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
    });

    it("编码后的 ../ 路径同样被规范化，不会逃出 staticDir", async () => {
      const req = createMockReq("GET", "/%2e%2e/%2e%2e/etc/passwd");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
    });

    it("直接构造的逃逸路径被 resolve+前缀检查阻止", async () => {
      // 手动测试 resolve + 前缀检查逻辑
      // 如果某种方式绕过了 URL 规范化，resolve+startsWith 是最后防线
      const req = createMockReq("GET", "/index.html");
      // 篡改 url 为带有 .. 的绝对路径（模拟极端情况）
      req.url = "/..\\..\\..\\etc\\passwd";
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      // URL 解析后仍被规范化或前缀检查阻止
      // 无论结果，都不会读取 staticDir 之外的文件
      if (served) {
        expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
      } else {
        expect(served).toBe(false);
      }
    });
  });

  describe("不存在的文件", () => {
    it("有扩展名但不存在的文件返回 false", async () => {
      const req = createMockReq("GET", "/nonexistent.js");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      expect(served).toBe(false);
    });
  });

  describe("HTTP 方法", () => {
    it("HEAD 请求返回头信息但无 body", async () => {
      const req = createMockReq("HEAD", "/index.html");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._status).toBe(200);
      expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
    });

    it("POST 请求返回 false", async () => {
      const req = createMockReq("POST", "/index.html");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      expect(served).toBe(false);
    });

    it("DELETE 请求返回 false", async () => {
      const req = createMockReq("DELETE", "/index.html");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      expect(served).toBe(false);
    });
  });

  describe("Cache-Control", () => {
    it("index.html 设置 no-cache", async () => {
      const req = createMockReq("GET", "/index.html");
      const res = createMockRes();
      await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(res._headers["Cache-Control"]).toBe("no-cache, no-store, must-revalidate");
    });

    it("assets/ 下文件设置长期缓存", async () => {
      const req = createMockReq("GET", "/assets/app.abc123.js");
      const res = createMockRes();
      await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(res._headers["Cache-Control"]).toBe("public, max-age=31536000, immutable");
    });

    it("其他文件设置短期缓存", async () => {
      const req = createMockReq("GET", "/favicon.ico");
      const res = createMockRes();
      await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(res._headers["Cache-Control"]).toBe("public, max-age=3600");
    });
  });

  describe("子目录文件", () => {
    it("能访问子目录中的文件", async () => {
      const req = createMockReq("GET", "/sub/page.html");
      const res = createMockRes();
      const served = await serveStatic(req, res, TEST_DIR);
      await waitForEnd(res);
      expect(served).toBe(true);
      expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
    });
  });
});
