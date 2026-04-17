/**
 * Stage 5 Gate Re-run — Round 2 sample generator
 * 3 tickers × 5 runs = 15 new samples
 * Uses existing conversations: MSFT=990007, NVDA=990009, SPY=990012
 */
import { SignJWT } from "jose";
import http from "http";

const JWT_SECRET = process.env.JWT_SECRET;
const VITE_APP_ID = process.env.VITE_APP_ID;
if (!JWT_SECRET) throw new Error("JWT_SECRET not set");
if (!VITE_APP_ID) throw new Error("VITE_APP_ID not set");

// Generate session token (same format as gen_4c_v2_samples.mjs)
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
          try { resolve(JSON.parse(d)); }
          catch (e) { reject(new Error("JSON parse error: " + d.slice(0, 200))); }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const TASKS = [
  // MSFT × 5
  { ticker: "MSFT", convId: 990007, title: "Stage5-Run2 MSFT analysis run 1" },
  { ticker: "MSFT", convId: 990007, title: "Stage5-Run2 MSFT analysis run 2" },
  { ticker: "MSFT", convId: 990007, title: "Stage5-Run2 MSFT analysis run 3" },
  { ticker: "MSFT", convId: 990007, title: "Stage5-Run2 MSFT analysis run 4" },
  { ticker: "MSFT", convId: 990007, title: "Stage5-Run2 MSFT analysis run 5" },
  // NVDA × 5
  { ticker: "NVDA", convId: 990009, title: "Stage5-Run2 NVDA analysis run 1" },
  { ticker: "NVDA", convId: 990009, title: "Stage5-Run2 NVDA analysis run 2" },
  { ticker: "NVDA", convId: 990009, title: "Stage5-Run2 NVDA analysis run 3" },
  { ticker: "NVDA", convId: 990009, title: "Stage5-Run2 NVDA analysis run 4" },
  { ticker: "NVDA", convId: 990009, title: "Stage5-Run2 NVDA analysis run 5" },
  // SPY × 5
  { ticker: "SPY",  convId: 990012, title: "Stage5-Run2 SPY analysis run 1" },
  { ticker: "SPY",  convId: 990012, title: "Stage5-Run2 SPY analysis run 2" },
  { ticker: "SPY",  convId: 990012, title: "Stage5-Run2 SPY analysis run 3" },
  { ticker: "SPY",  convId: 990012, title: "Stage5-Run2 SPY analysis run 4" },
  { ticker: "SPY",  convId: 990012, title: "Stage5-Run2 SPY analysis run 5" },
];

console.log(`Submitting ${TASKS.length} tasks...`);
const results = [];

for (let i = 0; i < TASKS.length; i++) {
  const task = TASKS[i];
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
      console.error(`  [${i+1}/${TASKS.length}] ${task.ticker} ERROR: ${JSON.stringify(result.error).slice(0, 150)}`);
      results.push({ ...task, taskId: null, error: result.error.json?.message });
    } else {
      const data = result.result?.data?.json;
      console.log(`  [${i+1}/${TASKS.length}] ${task.ticker} convId=${task.convId} taskId=${data?.taskId} msgId=${data?.messageId}`);
      results.push({ ...task, taskId: data?.taskId, msgId: data?.messageId });
    }
  } catch (e) {
    console.error(`  [${i+1}/${TASKS.length}] ${task.ticker} EXCEPTION: ${e.message}`);
    results.push({ ...task, taskId: null, error: e.message });
  }
  if (i < TASKS.length - 1) await sleep(3000);
}

console.log(`\nSubmitted: ${results.filter(r => r.taskId).length}/${results.length}`);
console.log("taskIds:", results.filter(r => r.taskId).map(r => r.taskId).join(", "));
