/**
 * E2E 测试 — 页面导航
 *
 * 验证顶部导航栏切换 Chat / Agents / Monitor 视图。
 */

import { test, expect } from "@playwright/test";

test.describe("页面导航", () => {
  test("应加载首页并显示 Chat 视图", async ({ page }) => {
    await page.goto("/");

    // 顶部 logo
    await expect(page.locator(".header-logo")).toHaveText("Ouroboros");

    // 默认视图为 Chat
    await expect(page.locator(".chat-view")).toBeVisible();
  });

  test("应切换到 Agents 视图", async ({ page }) => {
    await page.goto("/");

    await page.click("button.nav-btn:has-text('Agents')");
    // 加载完成后显示 .agents-page
    await expect(page.locator(".agents-page")).toBeVisible({ timeout: 10_000 });

    // Chat 视图不可见
    await expect(page.locator(".chat-view")).not.toBeVisible();
  });

  test("应切换到 Monitor 视图", async ({ page }) => {
    await page.goto("/");

    await page.click("button.nav-btn:has-text('Monitor')");
    await expect(page.locator(".monitor-page")).toBeVisible();
    await expect(page.locator("text=System Monitor")).toBeVisible();
  });

  test("应从 Monitor 切回 Chat", async ({ page }) => {
    await page.goto("/");

    // 切到 Monitor
    await page.click("button.nav-btn:has-text('Monitor')");
    await expect(page.locator(".monitor-page")).toBeVisible();

    // 切回 Chat
    await page.click("button.nav-btn:has-text('Chat')");
    await expect(page.locator(".chat-view")).toBeVisible();
  });

  test("导航按钮应有 active 高亮", async ({ page }) => {
    await page.goto("/");

    // Chat 默认 active
    const chatBtn = page.locator("button.nav-btn:has-text('Chat')");
    await expect(chatBtn).toHaveClass(/active/);

    // 切到 Agents
    await page.click("button.nav-btn:has-text('Agents')");
    const agentsBtn = page.locator("button.nav-btn:has-text('Agents')");
    await expect(agentsBtn).toHaveClass(/active/);
    await expect(chatBtn).not.toHaveClass(/active/);
  });
});
