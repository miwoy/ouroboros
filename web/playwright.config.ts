/**
 * Playwright E2E 测试配置
 *
 * 启动轻量级后端 API 服务器 + Vite dev server，测试 Web UI 关键用户流程。
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/test-server.ts"],
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: [
    {
      // 轻量级后端 API 测试服务器
      command: "npx tsx e2e/test-server.ts",
      port: 3000,
      timeout: 15_000,
      reuseExistingServer: true,
    },
    {
      // 前端 Vite dev server
      command: "npm run dev",
      port: 5173,
      timeout: 15_000,
      reuseExistingServer: true,
    },
  ],
});
