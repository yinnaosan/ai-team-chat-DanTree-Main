/**
 * RPA Module — 通过 Playwright 操控用户已登录的 ChatGPT 浏览器
 * 
 * 工作原理：
 * 1. 连接到用户在沙盒中已登录的 ChatGPT 浏览器（CDP 9222端口）
 * 2. 找到 ChatGPT 对话页面
 * 3. 向对话框输入 Manus 的分析结果，请求 ChatGPT 进行二次检查和汇总
 * 4. 等待 ChatGPT 回复完成后，抓取回复内容
 * 5. 返回 ChatGPT 的汇总报告
 */

import { chromium, type Browser, type Page } from "playwright";

let browser: Browser | null = null;
let chatPage: Page | null = null;

// RPA状态
export type RpaStatus = "idle" | "connecting" | "ready" | "working" | "error";
let rpaStatus: RpaStatus = "idle";
let rpaError: string | null = null;

export function getRpaStatus(): { status: RpaStatus; error: string | null } {
  return { status: rpaStatus, error: rpaError };
}

/**
 * 连接到用户已登录的 ChatGPT 浏览器（通过 CDP）
 */
export async function connectToChatGPT(): Promise<boolean> {
  try {
    rpaStatus = "connecting";
    rpaError = null;

    // 连接到沙盒中已运行的 Chromium（CDP 端口 9222）
    browser = await chromium.connectOverCDP("http://localhost:9222");
    const contexts = browser.contexts();
    
    if (contexts.length === 0) {
      throw new Error("No browser context found. Please open ChatGPT in the browser first.");
    }

    const context = contexts[0];
    const pages = context.pages();
    
    // 查找 ChatGPT 页面
    chatPage = pages.find(p => p.url().includes("chatgpt.com")) || null;
    
    if (!chatPage) {
      // 如果没有找到 ChatGPT 页面，打开一个新的
      chatPage = await context.newPage();
      await chatPage.goto("https://chatgpt.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // 检查是否已登录（查找对话输入框）
    const isLoggedIn = await chatPage.locator('#prompt-textarea').isVisible().catch(() => false);
    
    if (!isLoggedIn) {
      rpaStatus = "error";
      rpaError = "ChatGPT not logged in. Please log in to ChatGPT in the browser first.";
      return false;
    }

    rpaStatus = "ready";
    console.log("[RPA] Successfully connected to ChatGPT browser");
    return true;
  } catch (err) {
    rpaStatus = "error";
    rpaError = err instanceof Error ? err.message : String(err);
    console.error("[RPA] Connection failed:", rpaError);
    return false;
  }
}

/**
 * 向 ChatGPT 发送消息并等待回复
 */
export async function sendToChatGPT(prompt: string): Promise<string> {
  if (!chatPage || rpaStatus !== "ready") {
    // 尝试重新连接
    const connected = await connectToChatGPT();
    if (!connected) {
      throw new Error(rpaError || "ChatGPT RPA not ready");
    }
  }

  rpaStatus = "working";
  
  try {
    const page = chatPage!;
    
    // 确保页面可见
    await page.bringToFront();
    
    // 等待输入框可用
    const textarea = page.locator('#prompt-textarea');
    await textarea.waitFor({ state: "visible", timeout: 15000 });
    
    // 清空并输入内容
    await textarea.click();
    await textarea.fill(prompt);
    
    // 等待一小段时间确保内容已输入
    await page.waitForTimeout(500);
    
    // 点击发送按钮
    const sendBtn = page.locator('[data-testid="send-button"]');
    const isSendVisible = await sendBtn.isVisible().catch(() => false);
    
    if (isSendVisible) {
      await sendBtn.click();
    } else {
      // 备用：按 Enter 发送
      await textarea.press("Enter");
    }
    
    // 等待回复开始生成（等待停止按钮出现）
    await page.waitForSelector('[data-testid="stop-button"]', { timeout: 15000 }).catch(() => {});
    
    // 等待回复完成（停止按钮消失）
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="stop-button"]'),
      { timeout: 120000, polling: 1000 }
    );
    
    // 抓取最后一条 ChatGPT 回复
    const responseElements = await page.locator('[data-message-author-role="assistant"]').all();
    
    if (responseElements.length === 0) {
      throw new Error("No response found from ChatGPT");
    }
    
    const lastResponse = responseElements[responseElements.length - 1];
    const responseText = await lastResponse.innerText();
    
    rpaStatus = "ready";
    return responseText.trim();
  } catch (err) {
    rpaStatus = "ready"; // 恢复就绪状态，允许重试
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
}
