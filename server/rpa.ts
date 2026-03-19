/**
 * RPA Module — 通过 Playwright 操控用户已登录的 ChatGPT 浏览器
 *
 * 核心逻辑：
 * 1. 连接到沙盒中已运行的 Chromium（CDP 9222端口）
 * 2. 在 ChatGPT 侧边栏中搜索并定位名为「投资」的对话框（可配置）
 * 3. 每次任务前先导航到该对话框，确保 ChatGPT 的训练记忆完整保留
 * 4. 向该对话框输入 Manus 的分析结果，等待 ChatGPT 主管回复
 * 5. 抓取回复内容并返回
 */

import { chromium, type Browser, type Page } from "playwright";

let browser: Browser | null = null;
let chatPage: Page | null = null;

export type RpaStatus = "idle" | "connecting" | "ready" | "working" | "error";
let rpaStatus: RpaStatus = "idle";
let rpaError: string | null = null;
// 当前锁定的对话框名称
let lockedConversationName: string | null = null;

export function getRpaStatus(): { status: RpaStatus; error: string | null; lockedConversation: string | null } {
  return { status: rpaStatus, error: rpaError, lockedConversation: lockedConversationName };
}

/**
 * 连接到用户已登录的 ChatGPT 浏览器（通过 CDP）
 */
export async function connectToChatGPT(): Promise<boolean> {
  try {
    rpaStatus = "connecting";
    rpaError = null;

    browser = await chromium.connectOverCDP("http://localhost:9222");
    const contexts = browser.contexts();

    if (contexts.length === 0) {
      throw new Error("未找到浏览器上下文，请先在浏览器中打开 ChatGPT。");
    }

    const context = contexts[0];
    const pages = context.pages();

    chatPage = pages.find(p => p.url().includes("chatgpt.com")) || null;

    if (!chatPage) {
      chatPage = await context.newPage();
      await chatPage.goto("https://chatgpt.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // 等待页面加载完成
    await chatPage.waitForTimeout(2000);

    const isLoggedIn = await chatPage.locator('#prompt-textarea').isVisible().catch(() => false);

    if (!isLoggedIn) {
      rpaStatus = "error";
      rpaError = "ChatGPT 未登录，请先在浏览器中登录 ChatGPT。";
      return false;
    }

    rpaStatus = "ready";
    console.log("[RPA] 已成功连接到 ChatGPT 浏览器");
    return true;
  } catch (err) {
    rpaStatus = "error";
    rpaError = err instanceof Error ? err.message : String(err);
    console.error("[RPA] 连接失败:", rpaError);
    return false;
  }
}

/**
 * 在 ChatGPT 侧边栏中定位并导航到指定名称的对话框
 * @param conversationName 目标对话框名称，如「投资」
 * @returns 是否成功导航到目标对话框
 */
export async function navigateToConversation(conversationName: string): Promise<boolean> {
  if (!chatPage) {
    throw new Error("RPA 未连接，请先调用 connectToChatGPT()");
  }

  const page = chatPage;

  try {
    console.log(`[RPA] 正在定位对话框「${conversationName}」...`);

    // 确保侧边栏可见（有时需要展开）
    const sidebarToggle = page.locator('[data-testid="open-sidebar-button"], button[aria-label*="sidebar"], button[aria-label*="Open"]').first();
    const isSidebarToggleVisible = await sidebarToggle.isVisible().catch(() => false);
    if (isSidebarToggleVisible) {
      await sidebarToggle.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // 方法1：直接在侧边栏搜索对话框名称
    // ChatGPT 侧边栏的对话列表项通常是 <a> 或 <li> 包含对话标题
    const conversationLinks = page.locator(`nav a, [data-testid*="conversation"], aside a`);
    const allLinks = await conversationLinks.all();

    for (const link of allLinks) {
      const text = await link.innerText().catch(() => "");
      if (text.trim().includes(conversationName)) {
        await link.click();
        await page.waitForTimeout(1500);
        // 等待输入框出现，确认已进入对话
        await page.locator('#prompt-textarea').waitFor({ state: "visible", timeout: 10000 });
        lockedConversationName = conversationName;
        console.log(`[RPA] 已成功导航到对话框「${conversationName}」`);
        return true;
      }
    }

    // 方法2：使用搜索功能（如果方法1未找到）
    const searchBtn = page.locator('button[aria-label*="Search"], [data-testid*="search"]').first();
    const isSearchVisible = await searchBtn.isVisible().catch(() => false);

    if (isSearchVisible) {
      await searchBtn.click();
      await page.waitForTimeout(500);
      const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill(conversationName);
        await page.waitForTimeout(800);

        // 点击搜索结果中的第一个匹配项
        const searchResult = page.locator(`[data-testid*="result"] a, .search-result a`).first();
        if (await searchResult.isVisible().catch(() => false)) {
          await searchResult.click();
          await page.waitForTimeout(1500);
          await page.locator('#prompt-textarea').waitFor({ state: "visible", timeout: 10000 });
          lockedConversationName = conversationName;
          console.log(`[RPA] 通过搜索找到并导航到对话框「${conversationName}」`);
          return true;
        }
      }
    }

    // 方法3：直接文本匹配（更宽泛的选择器）
    const anyMatchingElement = page.locator(`text="${conversationName}"`).first();
    if (await anyMatchingElement.isVisible().catch(() => false)) {
      await anyMatchingElement.click();
      await page.waitForTimeout(1500);
      lockedConversationName = conversationName;
      console.log(`[RPA] 通过文本匹配找到对话框「${conversationName}」`);
      return true;
    }

    console.warn(`[RPA] 未找到名为「${conversationName}」的对话框，将使用当前对话框`);
    lockedConversationName = null;
    return false;
  } catch (err) {
    console.error(`[RPA] 导航到对话框「${conversationName}」失败:`, err);
    return false;
  }
}

/**
 * 向 ChatGPT 指定对话框发送消息并等待回复
 * @param prompt 要发送的消息内容
 * @param conversationName 目标对话框名称（每次都会先导航到该对话框）
 */
// ★ ChatGPT 始终使用「投资manus」对话框，该默认值硬编码
export async function sendToChatGPT(prompt: string, conversationName = "投资manus"): Promise<string> {
  // 确保已连接
  if (!chatPage || rpaStatus === "idle" || rpaStatus === "error") {
    const connected = await connectToChatGPT();
    if (!connected) {
      throw new Error(rpaError || "ChatGPT RPA 未就绪");
    }
  }

  rpaStatus = "working";

  try {
    const page = chatPage!;
    await page.bringToFront();

    // ★ 核心：每次发送前先导航到「投资」对话框
    const navigated = await navigateToConversation(conversationName);
    if (!navigated) {
      console.warn(`[RPA] 未能定位到「${conversationName}」对话框，将在当前对话框中发送`);
    }

    // 等待输入框可用
    const textarea = page.locator('#prompt-textarea');
    await textarea.waitFor({ state: "visible", timeout: 15000 });

    // 输入内容
    await textarea.click();
    await textarea.fill(prompt);
    await page.waitForTimeout(500);

    // 发送消息
    const sendBtn = page.locator('[data-testid="send-button"]');
    const isSendVisible = await sendBtn.isVisible().catch(() => false);
    if (isSendVisible) {
      await sendBtn.click();
    } else {
      await textarea.press("Enter");
    }

    // 等待回复开始（停止按钮出现）
    await page.waitForSelector('[data-testid="stop-button"]', { timeout: 15000 }).catch(() => {});

    // 等待回复完成（停止按钮消失）
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="stop-button"]'),
      { timeout: 120000, polling: 1000 }
    );

    // 抓取最后一条 assistant 回复
    const responseElements = await page.locator('[data-message-author-role="assistant"]').all();

    if (responseElements.length === 0) {
      throw new Error("未获取到 ChatGPT 的回复");
    }

    const lastResponse = responseElements[responseElements.length - 1];
    const responseText = await lastResponse.innerText();

    rpaStatus = "ready";
    return responseText.trim();
  } catch (err) {
    rpaStatus = "ready";
    throw err;
  }
}

/**
 * 断开 RPA 连接
 */
export async function disconnectRpa(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    chatPage = null;
  }
  rpaStatus = "idle";
  lockedConversationName = null;
}
