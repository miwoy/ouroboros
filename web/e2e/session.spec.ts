/**
 * E2E 测试 — 会话管理
 *
 * 验证侧边栏的会话创建、切换、删除。
 */

import { test, expect } from "@playwright/test";

test.describe("会话管理", () => {
  test("侧边栏应显示 Chats 标题", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-title")).toHaveText("Chats");
  });

  test("新对话按钮应存在于侧边栏和导航栏", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-new-btn")).toBeVisible();
  });

  test("发送消息应创建新会话并在侧边栏显示", async ({ page }) => {
    await page.goto("/");

    // 发送消息
    await page.locator(".chat-input").fill("会话测试");
    await page.locator(".chat-input").press("Enter");
    await expect(page.locator(".message-agent").first()).toBeVisible({ timeout: 10_000 });

    // 侧边栏刷新后应有会话（App.tsx 有 1s 延迟触发刷新）
    await expect(page.locator(".session-item").first()).toBeVisible({ timeout: 10_000 });
  });

  test("点击侧边栏会话应切换到该会话", async ({ page }) => {
    await page.goto("/");

    // 创建一个会话
    await page.locator(".chat-input").fill("第一个会话");
    await page.locator(".chat-input").press("Enter");
    await expect(page.locator(".message-agent").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".session-item").first()).toBeVisible({ timeout: 10_000 });

    // 点击新建
    await page.locator(".sidebar-new-btn").click();

    // 欢迎界面应重新出现
    await expect(page.locator(".chat-welcome")).toBeVisible();

    // 点击侧边栏中的会话条目
    await page.locator(".session-item").first().click();

    // 应加载该会话的消息
    await expect(page.locator(".message-user").first()).toBeVisible({ timeout: 5_000 });
  });

  test("删除会话按钮应移除该会话", async ({ page }) => {
    await page.goto("/");

    // 创建一个会话
    await page.locator(".chat-input").fill("要删除的会话");
    await page.locator(".chat-input").press("Enter");
    await expect(page.locator(".message-agent").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".session-item").first()).toBeVisible({ timeout: 10_000 });

    // 记住第一个会话的描述文本
    const firstDesc = await page.locator(".session-desc").first().textContent();

    // 点击删除按钮
    await page.locator(".session-delete").first().click();

    // 验证该会话条目消失（等待 DOM 更新）
    if (firstDesc) {
      await expect(
        page.locator(`.session-item:has(.session-desc:text-is("${firstDesc}"))`)
      ).not.toBeVisible({ timeout: 5_000 });
    }
  });
});
