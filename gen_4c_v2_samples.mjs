/**
 * Phase 4C Stage 2 Re-run — Sample Generator (post-patch v2, commit 0edf9d4)
 * Generates 20 qualifying assistant messages across 5 tickers × 4 runs
 * Uses existing conversations: AAPL=990007, NVDA=990009, TSLA=1020001, 1810.HK=1020002, QQQ=990012
 */
import { SignJWT } from "jose";
import http from "http";

const JWT_SECRET = process.env.JWT_SECRET;
const VITE_APP_ID = process.env.VITE_APP_ID;
if (!JWT_SECRET) throw new Error("JWT_SECRET not set");
if (!VITE_APP_ID) throw new Error("VITE_APP_ID not set");

// Generate session token
const secretKey = new TextEncoder().encode(JWT_SECRET);
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const expirationSeconds = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
const SESSION_TOKEN = await new SignJWT({
  openId: "VZHcqHCKffcABgBykVaBHA",
  appId: VITE_APP_ID,
  name: "睿 王",
})
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setExpirationTime(expirationSeconds)
  .sign(secretKey);

function trpcPost(path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 8001,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          Cookie: `app_session_id=${cookie}`,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(new Error(`Parse error: ${d.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Ticker → conversationId mapping (existing conversations)
const TASKS = [
  { ticker: "AAPL",    convId: 990007,  title: "AAPL深度分析 Phase4C-v2 run1" },
  { ticker: "AAPL",    convId: 990007,  title: "AAPL深度分析 Phase4C-v2 run2" },
  { ticker: "AAPL",    convId: 990007,  title: "AAPL深度分析 Phase4C-v2 run3" },
  { ticker: "AAPL",    convId: 990007,  title: "AAPL深度分析 Phase4C-v2 run4" },
  { ticker: "NVDA",    convId: 990009,  title: "NVDA深度分析 Phase4C-v2 run1" },
  { ticker: "NVDA",    convId: 990009,  title: "NVDA深度分析 Phase4C-v2 run2" },
  { ticker: "NVDA",    convId: 990009,  title: "NVDA深度分析 Phase4C-v2 run3" },
  { ticker: "NVDA",    convId: 990009,  title: "NVDA深度分析 Phase4C-v2 run4" },
  { ticker: "TSLA",    convId: 1020001, title: "TSLA深度分析 Phase4C-v2 run1" },
  { ticker: "TSLA",    convId: 1020001, title: "TSLA深度分析 Phase4C-v2 run2" },
  { ticker: "TSLA",    convId: 1020001, title: "TSLA深度分析 Phase4C-v2 run3" },
  { ticker: "TSLA",    convId: 1020001, title: "TSLA深度分析 Phase4C-v2 run4" },
  { ticker: "1810.HK", convId: 1020002, title: "小米集团深度分析 Phase4C-v2 run1" },
  { ticker: "1810.HK", convId: 1020002, title: "小米集团深度分析 Phase4C-v2 run2" },
  { ticker: "1810.HK", convId: 1020002, title: "小米集团深度分析 Phase4C-v2 run3" },
  { ticker: "1810.HK", convId: 1020002, title: "小米集团深度分析 Phase4C-v2 run4" },
  { ticker: "QQQ",     convId: 990012,  title: "QQQ深度分析 Phase4C-v2 run1" },
  { ticker: "QQQ",     convId: 990012,  title: "QQQ深度分析 Phase4C-v2 run2" },
  { ticker: "QQQ",     convId: 990012,  title: "QQQ深度分析 Phase4C-v2 run3" },
  { ticker: "QQQ",     convId: 990012,  title: "QQQ深度分析 Phase4C-v2 run4" },
];

console.log(`[${new Date().toISOString()}] Starting Phase 4C v2 sample generation`);
console.log(`Total tasks: ${TASKS.length}`);

const results = [];

for (let i = 0; i < TASKS.length; i++) {
  const task = TASKS[i];
  console.log(`\n[${i + 1}/${TASKS.length}] Submitting: ${task.ticker} — ${task.title}`);
  
  try {
    const resp = await trpcPost(
      "/api/trpc/chat.submitTask?batch=1",
      {
        0: {
          json: {
            title: task.title,
            conversationId: task.convId,
            analysisMode: "standard",
          },
        },
      },
      SESSION_TOKEN
    );
    
    const result = resp[0];
    if (result.error) {
      console.error(`  ERROR: ${JSON.stringify(result.error).slice(0, 200)}`);
      results.push({ ...task, taskId: null, error: result.error.json?.message });
    } else {
      const data = result.result?.data?.json;
      console.log(`  OK: taskId=${data?.taskId} msgId=${data?.messageId} convId=${data?.conversationId}`);
      results.push({ ...task, taskId: data?.taskId, msgId: data?.messageId, convId: data?.conversationId });
    }
  } catch (e) {
    console.error(`  EXCEPTION: ${e.message}`);
    results.push({ ...task, taskId: null, error: e.message });
  }
  
  // Stagger submissions: 3s between each to avoid overloading
  if (i < TASKS.length - 1) {
    await sleep(3000);
  }
}

console.log("\n=== SUBMISSION SUMMARY ===");
console.log(`Submitted: ${results.filter(r => r.taskId).length}/${results.length}`);
console.log(`Failed: ${results.filter(r => !r.taskId).length}`);
console.log("\nTask IDs:");
for (const r of results) {
  if (r.taskId) {
    console.log(`  ${r.ticker} taskId=${r.taskId} msgId=${r.msgId}`);
  } else {
    console.log(`  ${r.ticker} FAILED: ${r.error}`);
  }
}

console.log("\n[INFO] Tasks submitted. LLM processing will take 2-5 min per task.");
console.log("[INFO] Run phase4c_v2_gate_check.py after ~10 min to verify results.");
