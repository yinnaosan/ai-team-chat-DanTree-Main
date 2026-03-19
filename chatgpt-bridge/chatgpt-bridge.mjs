/**
 * ChatGPT 本地浏览器中转服务
 * 
 * 功能：监听 HTTP 请求，用 Playwright 控制本地 Chrome 的 ChatGPT 页面，
 *       将消息发送到指定对话框并返回 ChatGPT 的回复。
 * 
 * 使用方法：
 *   1. 安装依赖：npm install playwright
 *   2. 安装浏览器：npx playwright install chromium
 *   3. 启动服务：node chatgpt-bridge.mjs
 *   4. 在平台设置页填入代理地址：http://localhost:7788
 * 
 * 注意：启动后会自动打开 Chrome，请在浏览器中登录 ChatGPT 并导航到「投资manus」对话框
 */

import { createServer } from "http";
import { chromium } from "playwright";

const PORT = 7788;
const STARTUP_TIMEOUT = 60000;   // 等待登录的超时时间（60秒）
const REPLY_TIMEOUT = 120000;    // 等待 ChatGPT 回复的超时时间（120秒）

let browser = null;
let page = null;
let isReady = false;
let initError = null;

// ─── 初始化浏览器 ──────────────────────────────────────────────────────────────
async function initBrowser() {
  console.log("🚀 正在启动 Chrome 浏览器...");
  
  browser = await chromium.launch({
    headless: false,  // 显示浏览器窗口，方便登录
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  page = await context.newPage();
  
  console.log("🌐 正在打开 ChatGPT...");
  await page.goto("https://chatgpt.com", { waitUntil: "domcontentloaded", timeout: 30000 });

  // 等待用户登录（检测输入框出现）
  console.log("⏳ 请在浏览器中登录 ChatGPT，并导航到「投资manus」对话框...");
  
  try {
    await page.waitForSelector('div[contenteditable="true"], textarea[data-id], #prompt-textarea', {
      timeout: STARTUP_TIMEOUT,
    });
    console.log("✅ ChatGPT 已就绪！");
    isReady = true;
  } catch (e) {
    initError = "等待登录超时，请重新启动脚本并在 60 秒内完成登录";
    console.error("❌", initError);
  }
}

// ─── 发送消息并等待回复 ────────────────────────────────────────────────────────
async function sendMessage(message, conversationName) {
  if (!isReady || !page) {
    throw new Error("浏览器未就绪，请重启中转服务");
  }

  // 如果指定了对话框名称，尝试导航到该对话框
  if (conversationName) {
    try {
      // 在侧边栏搜索对话框
      const sidebarLink = page.locator(`a[href*="/c/"]:has-text("${conversationName}")`).first();
      const exists = await sidebarLink.count();
      if (exists > 0) {
        await sidebarLink.click();
        await page.waitForTimeout(1500);
      }
    } catch (e) {
      // 找不到对话框时继续使用当前页面
      console.warn(`⚠️ 未找到对话框「${conversationName}」，使用当前页面`);
    }
  }

  // 定位输入框
  const inputSelector = '#prompt-textarea, div[contenteditable="true"][data-id], textarea[data-id]';
  await page.waitForSelector(inputSelector, { timeout: 10000 });
  const input = page.locator(inputSelector).first();

  // 清空并输入消息
  await input.click();
  await input.fill("");
  
  // 分段输入长消息（避免粘贴触发安全检测）
  const chunks = message.match(/.{1,500}/gs) || [message];
  for (const chunk of chunks) {
    await input.type(chunk, { delay: 5 });
  }

  // 记录发送前的消息数量
  const beforeCount = await page.locator('[data-message-id]').count();

  // 点击发送按钮
  const sendBtn = page.locator('button[data-testid="send-button"], button[aria-label="Send message"]').first();
  const btnExists = await sendBtn.count();
  if (btnExists > 0) {
    await sendBtn.click();
  } else {
    await input.press("Enter");
  }

  console.log(`📤 消息已发送（${message.length} 字符），等待回复...`);

  // 等待新消息出现并完成
  const startTime = Date.now();
  let lastContent = "";
  let stableCount = 0;
  const STABLE_THRESHOLD = 4; // 连续 4 次检查内容不变，认为回复完成

  while (Date.now() - startTime < REPLY_TIMEOUT) {
    await page.waitForTimeout(1500);

    // 检查是否还在生成中（停止按钮存在）
    const stopBtn = await page.locator('button[aria-label="Stop streaming"], button[data-testid="stop-button"]').count();
    
    // 获取最新的 assistant 消息
    const messages = await page.locator('[data-message-author-role="assistant"]').all();
    if (messages.length === 0) continue;
    
    const lastMsg = messages[messages.length - 1];
    const content = await lastMsg.innerText().catch(() => "");
    
    if (content && content !== lastContent) {
      lastContent = content;
      stableCount = 0;
    } else if (content && stopBtn === 0) {
      stableCount++;
      if (stableCount >= STABLE_THRESHOLD) {
        console.log(`✅ 收到回复（${content.length} 字符）`);
        return content;
      }
    }
  }

  if (lastContent) {
    console.log(`⚠️ 超时但已获取部分回复（${lastContent.length} 字符）`);
    return lastContent;
  }

  throw new Error("等待 ChatGPT 回复超时（120秒）");
}

// ─── HTTP 服务器 ───────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  // CORS 头（允许平台服务器跨域调用）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // 健康检查
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: isReady ? "ready" : (initError ? "error" : "initializing"),
      error: initError,
    }));
    return;
  }

  // 发送消息
  if (req.method === "POST" && req.url === "/send") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { message, conversation } = JSON.parse(body);
        if (!message) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "缺少 message 参数" }));
          return;
        }

        const reply = await sendMessage(message, conversation || "投资manus");
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, reply }));
      } catch (e) {
        console.error("❌ 发送消息失败:", e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

// ─── 启动 ──────────────────────────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ChatGPT 本地中转服务`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  监听地址: http://localhost:${PORT}`);
  console.log(`  健康检查: http://localhost:${PORT}/health`);
  console.log(`${"=".repeat(60)}\n`);
  
  await initBrowser().catch(e => {
    initError = e.message;
    console.error("❌ 浏览器初始化失败:", e.message);
  });
});

// 优雅退出
process.on("SIGINT", async () => {
  console.log("\n正在关闭...");
  if (browser) await browser.close();
  server.close();
  process.exit(0);
});
