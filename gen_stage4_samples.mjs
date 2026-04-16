/**
 * Phase 4C Stage 4 — Sample Generator
 * 8 tickers × 4 runs = 32 tasks
 * All submitted to EXISTING conversations (no new convs created)
 * Baseline commit: 6c3835d
 */
import { SignJWT } from "jose";

const BASE_URL = "http://127.0.0.1:8001";
const JWT_SECRET = process.env.JWT_SECRET;
const VITE_APP_ID = process.env.VITE_APP_ID;

if (!JWT_SECRET || !VITE_APP_ID) {
  console.error("ERROR: JWT_SECRET and VITE_APP_ID must be set");
  process.exit(1);
}

const secretKey = new TextEncoder().encode(JWT_SECRET);
const SESSION_TOKEN = await new SignJWT({
  openId: "VZHcqHCKffcABgBykVaBHA",
  appId: VITE_APP_ID,
  name: "睿 王",
})
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setExpirationTime(Math.floor((Date.now() + 365 * 24 * 60 * 60 * 1000) / 1000))
  .sign(secretKey);

const COOKIE = `app_session_id=${SESSION_TOKEN}`;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function submitTask(title, conversationId) {
  const res = await fetch(`${BASE_URL}/api/trpc/chat.submitTask?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
    body: JSON.stringify({ "0": { json: { title, conversationId, analysisMode: "standard" } } }),
  });
  const json = await res.json();
  return json[0]?.result?.data?.json;
}

// 8 tickers × 4 runs = 32 tasks
// Using existing conversation IDs
const TASKS = [
  // AAPL — convId 990007
  { title: "AAPL基本面与技术面综合分析 Stage4-run1", convId: 990007 },
  { title: "AAPL近期估值与风险评估 Stage4-run2", convId: 990007 },
  { title: "AAPL投资价值深度分析 Stage4-run3", convId: 990007 },
  { title: "AAPL当前市场定位与投资建议 Stage4-run4", convId: 990007 },
  // MSFT — convId 990009
  { title: "MSFT基本面与技术面综合分析 Stage4-run1", convId: 990009 },
  { title: "MSFT近期估值与风险评估 Stage4-run2", convId: 990009 },
  { title: "MSFT投资价值深度分析 Stage4-run3", convId: 990009 },
  { title: "MSFT当前市场定位与投资建议 Stage4-run4", convId: 990009 },
  // NVDA — convId 1020001
  { title: "NVDA基本面与技术面综合分析 Stage4-run1", convId: 1020001 },
  { title: "NVDA近期估值与风险评估 Stage4-run2", convId: 1020001 },
  { title: "NVDA投资价值深度分析 Stage4-run3", convId: 1020001 },
  { title: "NVDA当前市场定位与投资建议 Stage4-run4", convId: 1020001 },
  // QQQ — convId 1020002
  { title: "QQQ基本面与技术面综合分析 Stage4-run1", convId: 1020002 },
  { title: "QQQ近期估值与风险评估 Stage4-run2", convId: 1020002 },
  { title: "QQQ投资价值深度分析 Stage4-run3", convId: 1020002 },
  { title: "QQQ当前市场定位与投资建议 Stage4-run4", convId: 1020002 },
  // TSLA — convId 990012
  { title: "TSLA基本面与技术面综合分析 Stage4-run1", convId: 990012 },
  { title: "TSLA近期估值与风险评估 Stage4-run2", convId: 990012 },
  { title: "TSLA投资价值深度分析 Stage4-run3", convId: 990012 },
  { title: "TSLA当前市场定位与投资建议 Stage4-run4", convId: 990012 },
  // GOOGL — convId 990013 (will create if not exists)
  { title: "GOOGL基本面与技术面综合分析 Stage4-run1", convId: null },
  { title: "GOOGL近期估值与风险评估 Stage4-run2", convId: null },
  { title: "GOOGL投资价值深度分析 Stage4-run3", convId: null },
  { title: "GOOGL当前市场定位与投资建议 Stage4-run4", convId: null },
  // AMZN
  { title: "AMZN基本面与技术面综合分析 Stage4-run1", convId: null },
  { title: "AMZN近期估值与风险评估 Stage4-run2", convId: null },
  { title: "AMZN投资价值深度分析 Stage4-run3", convId: null },
  { title: "AMZN当前市场定位与投资建议 Stage4-run4", convId: null },
  // META
  { title: "META基本面与技术面综合分析 Stage4-run1", convId: null },
  { title: "META近期估值与风险评估 Stage4-run2", convId: null },
  { title: "META投资价值深度分析 Stage4-run3", convId: null },
  { title: "META当前市场定位与投资建议 Stage4-run4", convId: null },
];

console.log(`[Stage 4 Sample Generator] Submitting ${TASKS.length} tasks...`);
console.log(`Baseline commit: 6c3835d\n`);

let submitted = 0;
let failed = 0;

for (const task of TASKS) {
  try {
    const result = await submitTask(task.title, task.convId);
    const taskId = result?.taskId;
    const convId = result?.conversationId;
    if (taskId) {
      submitted++;
      console.log(`  [${submitted}/${TASKS.length}] taskId=${taskId} convId=${convId} title="${task.title.slice(0, 40)}"`);
    } else {
      failed++;
      console.error(`  FAIL: no taskId for "${task.title}" — response: ${JSON.stringify(result)}`);
    }
  } catch (e) {
    failed++;
    console.error(`  ERROR: ${task.title} — ${e.message}`);
  }
  // 每提交4个任务后等待2秒，避免过载
  if (submitted % 4 === 0) await sleep(2000);
}

console.log(`\nDone: submitted=${submitted} failed=${failed}`);
console.log(`Expected: ${TASKS.length} tasks → ~${Math.ceil(TASKS.length * 1.5)} min processing time`);
