/**
 * E2E 测试 — Monitor 系统监控
 *
 * 验证健康检查指标、连接日志、执行树区域。
 */

import { test, expect } from "@playwright/test";

test.describe("Monitor 系统监控", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click("button.nav-btn:has-text('Monitor')");
  });

  test("应显示 System Monitor 标题", async ({ page }) => {
    await expect(page.locator("h2:has-text('System Monitor')")).toBeVisible();
  });

  test("应显示健康检查指标", async ({ page }) => {
    // 等待健康数据加载
    await expect(page.locator(".metric-value.text-success")).toBeVisible({ timeout: 10_000 });

    // 4 个指标卡片
    const cards = page.locator(".metric-card");
    await expect(cards).toHaveCount(4);

    // Status = ok
    await expect(page.locator(".metric-card").nth(0).locator(".metric-value")).toHaveText("ok");

    // Version 不为空
    const version = page.locator(".metric-card").nth(1).locator(".metric-value");
    await expect(version).not.toHaveText("-");
  });

  test("应显示 Connection Log", async ({ page }) => {
    await expect(page.locator("h3:has-text('Connection Log')")).toBeVisible();
    await expect(page.locator(".log-container")).toBeVisible();

    // 健康检查成功后应显示 INFO 日志
    await expect(page.locator(".level-info")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Health check passed")).toBeVisible();
  });

  test("应显示 Execution Tree 区域", async ({ page }) => {
    await expect(page.locator("h3:has-text('Execution Tree')")).toBeVisible();

    // 控制栏：会话选择器 + Live 按钮 + Refresh 按钮
    await expect(page.locator(".tree-session-select")).toBeVisible();
    await expect(page.locator(".tree-live-btn")).toBeVisible();
    await expect(page.locator(".tree-refresh-btn")).toBeVisible();
  });

  test("无选中会话时应显示提示文本", async ({ page }) => {
    await expect(page.locator("text=Select a session to view its execution tree")).toBeVisible();
  });

  test("Live 按钮无选中会话时应禁用", async ({ page }) => {
    const liveBtn = page.locator(".tree-live-btn");
    await expect(liveBtn).toBeDisabled();
  });

  test("Refresh 按钮应可点击", async ({ page }) => {
    const refreshBtn = page.locator(".tree-refresh-btn");
    await expect(refreshBtn).toBeEnabled();
    await refreshBtn.click();
    // 不崩溃即可
  });

  test("创建会话后选择器应有选项", async ({ page }) => {
    // 先通过 API 创建一个会话（通过 Chat 发消息）
    await page.click("button.nav-btn:has-text('Chat')");
    await page.locator(".chat-input").fill("monitor test");
    await page.locator(".chat-input").press("Enter");
    await expect(page.locator(".message-agent").first()).toBeVisible({ timeout: 10_000 });

    // 切回 Monitor
    await page.click("button.nav-btn:has-text('Monitor')");

    // 点 Refresh 刷新会话列表
    await page.locator(".tree-refresh-btn").click();
    await page.waitForTimeout(500);

    // 会话选择器应有选项（除 default option 外至少 1 个）
    const options = page.locator(".tree-session-select option");
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
  });
});
