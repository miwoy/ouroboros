/**
 * E2E 测试用后端服务器
 *
 * 轻量级启动，仅需 API 层，不依赖模型/workspace。
 */

import { createApiServer } from "../../src/api/server.js";
import type { Logger } from "../../src/logger/types.js";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const logger: Logger = {
  debug: () => {},
  info: (scope: string, msg: string) => console.log(`[${scope}] ${msg}`),
  warn: (scope: string, msg: string) => console.warn(`[${scope}] ${msg}`),
  error: (scope: string, msg: string) => console.error(`[${scope}] ${msg}`),
};

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), "e2e-server-"));

  const server = createApiServer({
    logger,
    workspacePath: workDir,
    config: {
      port: 3000,
      host: "127.0.0.1",
      rateLimit: { windowMs: 60000, maxRequests: 10000 },
      corsOrigin: "*",
    },
  });

  await server.start();
  console.log("[e2e] 测试后端已启动: http://127.0.0.1:3000");

  process.on("SIGINT", async () => {
    await server.stop();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await server.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[e2e] 测试后端启动失败:", err);
  process.exit(1);
});
