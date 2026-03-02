/**
 * E2E 测试 — Agent 管理面板
 *
 * 验证 Agent 列表加载与展示。
 */

import { test, expect } from "@playwright/test";

test.describe("Agent 管理面板", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click("button.nav-btn:has-text('Agents')");
  });

  test("应显示 Agent 页面标题", async ({ page }) => {
    await expect(page.locator(".agents-header h2")).toHaveText("Agents");
    await expect(page.locator(".agents-subtitle")).toBeVisible();
  });

  test("应加载并显示 Agent 列表", async ({ page }) => {
    // 等待加载完成
    await expect(page.locator(".agent-card").first()).toBeVisible({ timeout: 5_000 });

    // 至少有 agent:core
    const cards = page.locator(".agent-card");
    await expect(cards).toHaveCount(1);

    // 检查 agent:core 卡片内容
    await expect(page.locator(".agent-name")).toHaveText("Core Agent");
    await expect(page.locator(".agent-id")).toHaveText("agent:core");
    await expect(page.locator(".agent-status")).toContainText("active");
  });

  test("Agent 卡片应有头像", async ({ page }) => {
    await expect(page.locator(".agent-card").first()).toBeVisible({ timeout: 5_000 });
    const avatar = page.locator(".agent-avatar");
    await expect(avatar).toHaveText("C"); // Core Agent 的首字母
  });
});
