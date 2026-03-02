/**
 * 阶段十二集成测试 — Chat API 层
 *
 * 验证 HTTP API 服务器的完整工作流程：
 * 健康检查、会话管理、消息发送、SSE 流式、认证、Agent 查询。
 */

import { createApiServer } from "../api/server.js";
import { createLogger } from "../logger/logger.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/* eslint-disable @typescript-eslint/no-explicit-any */

let passed = 0;
let failed = 0;

/** 解析 JSON 响应并返回 any 类型 */
async function json(res: Response): Promise<any> {
  return res.json();
}

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ [${passed + failed}] ${message}`);
  } else {
    failed++;
    console.error(`  ❌ [${passed + failed}] ${message}`);
  }
}

async function main() {
  console.log("🚀 阶段十二集成测试 — Chat API 层\n");

  const workDir = await mkdtemp(join(tmpdir(), "phase12-"));
  const logger = createLogger(workDir, "info");

  const server = createApiServer({
    logger,
    workspacePath: workDir,
    config: {
      port: 0, // 随机端口
      host: "127.0.0.1",
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      corsOrigin: "*",
    },
  });

  await server.start();
  const addr = server.getHttpServer().address();
  if (!addr || typeof addr === "string") throw new Error("无效地址");
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`  服务器已启动: ${baseUrl}\n`);

  try {
    // [1] 健康检查
    {
      const res = await fetch(`${baseUrl}/api/health`);
      const body = await json(res);
      assert(res.status === 200, "健康检查返回 200");
      assert(body.success === true && body.data.status === "ok", "健康检查数据正确");
    }

    // [2] 创建会话
    let sessionId: string;
    {
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "集成测试会话" }),
      });
      const body = await json(res);
      assert(res.status === 201, "创建会话返回 201");
      assert(!!body.data.sessionId, "会话 ID 已生成");
      sessionId = body.data.sessionId;
    }

    // [3] 列出会话
    {
      const res = await fetch(`${baseUrl}/api/sessions`);
      const body = await json(res);
      assert(body.data.length === 1, "会话列表包含 1 个会话");
    }

    // [4] 获取会话详情
    {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
      const body = await json(res);
      assert(body.data.sessionId === sessionId, "会话详情匹配");
      assert(body.data.description === "集成测试会话", "会话描述正确");
    }

    // [5] 发送消息（非流式）
    {
      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: "你好，Ouroboros" }),
      });
      const body = await json(res);
      assert(res.status === 200, "发送消息返回 200");
      assert(body.data.response.includes("你好，Ouroboros"), "响应包含原始消息");
      assert(body.data.sessionId === sessionId, "响应会话 ID 匹配");
    }

    // [6] 获取消息历史
    {
      const res = await fetch(`${baseUrl}/api/chat/messages/${sessionId}`);
      const body = await json(res);
      assert(body.data.length >= 2, "消息历史至少包含 2 条（用户 + Agent）");
      assert(body.metadata.total >= 2, "消息总数正确");
    }

    // [7] SSE 流式消息
    {
      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "流式测试", stream: true }),
      });
      assert(
        res.headers.get("content-type") === "text/event-stream",
        "SSE 流式返回正确的 Content-Type",
      );
      const text = await res.text();
      assert(text.includes("event: thinking"), "SSE 包含 thinking 事件");
      assert(text.includes("event: done"), "SSE 包含 done 事件");
    }

    // [8] Agent 列表
    {
      const res = await fetch(`${baseUrl}/api/agents`);
      const body = await json(res);
      assert(body.data.length >= 1, "Agent 列表至少包含 1 个");
      assert(body.data[0].id === "agent:core", "默认 Agent 为 agent:core");
    }

    // [9] 删除会话
    {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/delete`, { method: "POST" });
      const body = await json(res);
      assert(body.data.deleted === true, "会话删除成功");

      // 验证已删除
      const getRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
      assert(getRes.status === 404, "已删除的会话返回 404");
    }

    // [10] 错误处理 — 无消息体
    {
      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert(res.status === 400, "无消息体返回 400");
    }
  } finally {
    await server.stop();
    await rm(workDir, { recursive: true, force: true });
  }

  console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败 / 共 ${passed + failed} 项`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("集成测试异常:", err);
  process.exit(1);
});
