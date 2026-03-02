/**
 * E2E 测试 — 设置面板与连接状态
 *
 * 验证设置面板打开/关闭，API Key 设置，连接状态指示器。
 */

import { test, expect } from "@playwright/test";

test.describe("设置与连接状态", () => {
  test("应显示连接状态指示器", async ({ page }) => {
    await page.goto("/");

    // 连接状态应为 "已连接"（后端在运行）
    await expect(page.locator(".status-text")).toHaveText("已连接", { timeout: 10_000 });
    await expect(page.locator(".status-dot.connected")).toBeVisible();
  });

  test("点击设置按钮应打开设置面板", async ({ page }) => {
    await page.goto("/");

    await page.locator(".settings-btn").click();
    await expect(page.locator(".settings-panel")).toBeVisible();
    await expect(page.locator(".settings-panel h3")).toHaveText("Settings");
  });

  test("设置面板应有 API Key 输入框", async ({ page }) => {
    await page.goto("/");

    await page.locator(".settings-btn").click();
    const input = page.locator('.settings-panel input[type="password"]');
    await expect(input).toBeVisible();
  });

  test("点击 Cancel 应关闭设置面板", async ({ page }) => {
    await page.goto("/");

    await page.locator(".settings-btn").click();
    await expect(page.locator(".settings-panel")).toBeVisible();

    await page.locator("button:has-text('Cancel')").click();
    await expect(page.locator(".settings-panel")).not.toBeVisible();
  });

  test("点击遮罩层应关闭设置面板", async ({ page }) => {
    await page.goto("/");

    await page.locator(".settings-btn").click();
    await expect(page.locator(".settings-panel")).toBeVisible();

    // 点击遮罩层（settings-overlay）
    await page.locator(".settings-overlay").click({ position: { x: 10, y: 10 } });
    await expect(page.locator(".settings-panel")).not.toBeVisible();
  });
});
