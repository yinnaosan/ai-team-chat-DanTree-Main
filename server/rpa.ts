/**
 * RPA Module — ChatGPT 通信层
 *
 * 优先级：
 *   1. 本地中转服务（HTTP proxy）— 用户本地运行 chatgpt-bridge.mjs
 *   2. CDP 直连（沙盒内 Chrome 9222 端口）— 旧方案，保留兼容
 *   3. 降级：抛出错误，由调用方使用内置 LLM 兜底
 */

import { chromium, type Browser, type Page } from "playwright";

let browser: Browser | null = null;
let chatPage: Page | null = null;

export type RpaStatus = "idle" | "connecting" | "ready" | "working" | "error";
let rpaStatus: RpaStatus = "idle";
let rpaError: string | null = null;
let lockedConversationName: string | null = null;

// 本地中转服务 URL（由用户在设置页配置）
let localProxyUrl: string | null = null;

export function setLocalProxyUrl(url: string | null) {
  localProxyUrl = url ? url.replace(/\/$/, "") : null;
  if (localProxyUrl) {
    console.log(`[RPA] 本地中转服务已配置: ${localProxyUrl}`);
  }
}

export function getLocalProxyUrl() {
  return localProxyUrl;
}

export function getRpaStatus(): { status: RpaStatus; error: string | null; lockedConversation: string | null; mode: string } {
  const mode = localProxyUrl ? "local-proxy" : (rpaStatus === "ready" ? "cdp" : "none");
  return { status: localProxyUrl ? "ready" : rpaStatus, error: rpaError, lockedConversation: lockedConversationName, mode };
}

/**
 * 通过本地中转服务检查健康状态
 */
export async function checkLocalProxy(proxyUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = proxyUrl.replace(/\/$/, "");
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { status: string; error?: string };
    if (data.status === "ready") return { ok: true };
    return { ok: false, error: data.error || `状态: ${data.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 通过本地中转服务发送消息
 */
async function sendViaLocalProxy(prompt: string, conversationName: string): Promise<string> {
  const url = localProxyUrl!;
  const res = await fetch(`${url}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt, conversation: conversationName }),
    signal: AbortSignal.timeout(150000), // 150秒超时
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error: string };
    throw new Error(err.error || `本地中转服务返回错误: ${res.status}`);
  }

  const data = await res.json() as { success: boolean; reply?: string; error?: string };
  if (!data.success || !data.reply) {
    throw new Error(data.error || "本地中转服务未返回回复内容");
  }
  return data.reply;
}

/**
 * 连接到用户已登录的 ChatGPT 浏览器（CDP，旧方案）
 */
export async function connectToChatGPT(): Promise<boolean> {
  // 如果已配置本地中转服务，直接返回成功
  if (localProxyUrl) {
    const check = await checkLocalProxy(localProxyUrl);
    if (check.ok) {
      rpaStatus = "ready";
      rpaError = null;
      return true;
    }
    rpaStatus = "error";
    rpaError = `本地中转服务不可用: ${check.error}`;
    return false;
  }

  // 旧 CDP 方案
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

    await chatPage.waitForTimeout(2000);
    const isLoggedIn = await chatPage.locator('#prompt-textarea').isVisible().catch(() => false);

    if (!isLoggedIn) {
      rpaStatus = "error";
      rpaError = "ChatGPT 未登录，请先在浏览器中登录 ChatGPT。";
      return false;
    }

    rpaStatus = "ready";
    console.log("[RPA] 已成功连接到 ChatGPT 浏览器（CDP）");
    return true;
  } catch (err) {
    rpaStatus = "error";
    rpaError = err instanceof Error ? err.message : String(err);
    console.error("[RPA] 连接失败:", rpaError);
    return false;
  }
}

/**
 * 在 ChatGPT 侧边栏中定位并导航到指定名称的对话框（CDP 模式）
 */
export async function navigateToConversation(conversationName: string): Promise<boolean> {
  if (!chatPage) throw new Error("RPA 未连接，请先调用 connectToChatGPT()");
  const page = chatPage;

  try {
    const sidebarToggle = page.locator('[data-testid="open-sidebar-button"], button[aria-label*="sidebar"]').first();
    if (await sidebarToggle.isVisible().catch(() => false)) {
      await sidebarToggle.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    const exactMatch = page.locator(`text="${conversationName}"`);
    if (await exactMatch.count().catch(() => 0) > 0) {
      await exactMatch.first().click();
      await page.waitForTimeout(1500);
      lockedConversationName = conversationName;
      return true;
    }

    const allClickable = page.locator(`nav a, aside a, [role="listitem"] a, li a`);
    for (const item of await allClickable.all()) {
      const text = await item.innerText().catch(() => "");
      if (text.trim().includes(conversationName)) {
        await item.click();
        await page.waitForTimeout(1500);
        lockedConversationName = conversationName;
        return true;
      }
    }

    console.warn(`[RPA] 未找到对话框「${conversationName}」，使用当前对话框`);
    return false;
  } catch (err) {
    console.error(`[RPA] 导航失败:`, err);
    return false;
  }
}

/**
 * 向 ChatGPT 发送消息并等待回复
 * 优先使用本地中转服务，其次 CDP 直连
 */
// ★ ChatGPT 始终使用「投资manus」对话框
export async function sendToChatGPT(prompt: string, conversationName = "投资manus"): Promise<string> {
  // 优先：本地中转服务
  if (localProxyUrl) {
    console.log(`[RPA] 通过本地中转服务发送消息到「${conversationName}」`);
    return sendViaLocalProxy(prompt, conversationName);
  }

  // 备用：CDP 直连
  if (!chatPage || rpaStatus === "idle" || rpaStatus === "error") {
    const connected = await connectToChatGPT();
    if (!connected) throw new Error(rpaError || "ChatGPT RPA 未就绪");
  }

  rpaStatus = "working";
  try {
    const page = chatPage!;
    await page.bringToFront();
    await navigateToConversation(conversationName);

    const textarea = page.locator('#prompt-textarea');
    await textarea.waitFor({ state: "visible", timeout: 15000 });
    await textarea.click();
    await textarea.fill(prompt);
    await page.waitForTimeout(500);

    const sendBtn = page.locator('[data-testid="send-button"]');
    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();
    } else {
      await textarea.press("Enter");
    }

    await page.waitForSelector('[data-testid="stop-button"]', { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="stop-button"]'),
      { timeout: 120000, polling: 1000 }
    );

    const responseElements = await page.locator('[data-message-author-role="assistant"]').all();
    if (responseElements.length === 0) throw new Error("未获取到 ChatGPT 的回复");

    const lastResponse = responseElements[responseElements.length - 1];
    const responseText = await lastResponse.innerText();
    rpaStatus = "ready";
    return responseText.trim();
  } catch (err) {
    rpaStatus = "ready";
    throw err;
  }
}

export async function disconnectRpa(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    chatPage = null;
  }
  rpaStatus = "idle";
  lockedConversationName = null;
}
