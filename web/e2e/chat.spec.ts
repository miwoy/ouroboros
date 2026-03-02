/**
 * E2E 测试 — Chat 对话流程
 *
 * 验证消息发送、流式响应显示、会话创建。
 */

import { test, expect } from "@playwright/test";

test.describe("Chat 对话", () => {
  test("应显示欢迎界面", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".chat-welcome")).toBeVisible();
    await expect(page.locator("text=Welcome to Ouroboros")).toBeVisible();
  });

  test("输入框应可聚焦和输入", async ({ page }) => {
    await page.goto("/");

    const input = page.locator(".chat-input");
    await expect(input).toBeVisible();
    await input.fill("测试消息");
    await expect(input).toHaveValue("测试消息");
  });

  test("空输入时发送按钮应禁用", async ({ page }) => {
    await page.goto("/");

    const sendBtn = page.locator(".chat-send-btn");
    await expect(sendBtn).toBeDisabled();
  });

  test("输入文字后发送按钮应启用", async ({ page }) => {
    await page.goto("/");

    const input = page.locator(".chat-input");
    await input.fill("你好");

    const sendBtn = page.locator(".chat-send-btn");
    await expect(sendBtn).toBeEnabled();
  });

  test("应发送消息并显示用户消息", async ({ page }) => {
    await page.goto("/");

    const input = page.locator(".chat-input");
    await input.fill("你好，Ouroboros");
    await input.press("Enter");

    // 用户消息应出现
    await expect(page.locator(".message-user").first()).toBeVisible();
    await expect(page.locator(".message-user .markdown-body")).toContainText("你好，Ouroboros");

    // Agent 响应应出现（等待流式完成）
    await expect(page.locator(".message-agent").first()).toBeVisible({ timeout: 10_000 });
  });

  test("发送消息后欢迎界面应消失", async ({ page }) => {
    await page.goto("/");

    await page.locator(".chat-input").fill("test");
    await page.locator(".chat-input").press("Enter");

    // 等待消息出现
    await expect(page.locator(".message-user").first()).toBeVisible();
    // 欢迎界面应消失
    await expect(page.locator(".chat-welcome")).not.toBeVisible();
  });

  test("发送消息后侧边栏应出现新会话", async ({ page }) => {
    await page.goto("/");

    // 初始侧边栏可能是空的
    await page.locator(".chat-input").fill("创建会话");
    await page.locator(".chat-input").press("Enter");

    // 等待消息处理
    await expect(page.locator(".message-agent").first()).toBeVisible({ timeout: 10_000 });

    // 等待侧边栏刷新（App.tsx 有 1s 延迟触发刷新）
    await expect(page.locator(".session-item").first()).toBeVisible({ timeout: 10_000 });
  });
});
