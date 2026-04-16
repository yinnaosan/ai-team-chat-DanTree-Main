/**
 * Phase 2I Sample Generator
 * Generates 20 DanTree analysis runs: 5 tickers × 4 runs each
 * Uses chat.submitTask tRPC endpoint with correct batch format
 */
import { SignJWT } from "jose";

const BASE_URL = "http://127.0.0.1:8001";
const JWT_SECRET = process.env.JWT_SECRET;
const VITE_APP_ID = process.env.VITE_APP_ID;

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

const COOKIE = `app_session_id=${SESSION_TOKEN}`;

const TICKERS = ["AAPL", "NVDA", "TSLA", "1810.HK", "QQQ"];
const RUNS_PER_TICKER = 4;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Correct tRPC batch mutation format
async function trpcBatchMutation(procedure, input) {
  const url = `${BASE_URL}/api/trpc/${procedure}?batch=1`;
  const body = JSON.stringify({ "0": { json: input } });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": COOKIE,
    },
    body,
  });
  const text = await res.text();
  try {
    const arr = JSON.parse(text);
    return arr[0]; // batch response is array
  } catch {
    return { raw: text };
  }
}

// tRPC batch query format
async function trpcBatchQuery(procedure, input) {
  const inputEncoded = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const url = `${BASE_URL}/api/trpc/${procedure}?batch=1&input=${inputEncoded}`;
  const res = await fetch(url, {
    headers: { "Cookie": COOKIE },
  });
  const text = await res.text();
  try {
    const arr = JSON.parse(text);
    return arr[0];
  } catch {
    return { raw: text };
  }
}

async function waitForQualifyingMessage(conversationId, maxWaitMs = 360000) {
  const startTime = Date.now();
  const pollInterval = 8000;
  let lastLogTime = 0;
  
  while (Date.now() - startTime < maxWaitMs) {
    await sleep(pollInterval);
    
    try {
      const convData = await trpcBatchQuery("chat.getConversationMessages", { conversationId });
      
      if (convData?.result?.data?.json) {
        const messages = convData.result.data.json;
        const assistantMsgs = messages.filter(m => m.role === "assistant");
        
        for (const msg of assistantMsgs) {
          const meta = msg.metadata;
          if (meta && meta.decisionObject && meta.answerObject?.bull_case?.[0]) {
            return { success: true, messageId: msg.id, elapsed: Date.now() - startTime };
          }
        }
      }
    } catch (err) {
      // ignore poll errors, keep waiting
    }
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (elapsed - lastLogTime >= 30) {
      console.log(`    [${elapsed}s] Waiting for decisionObject...`);
      lastLogTime = elapsed;
    }
  }
  
  return { success: false, elapsed: maxWaitMs };
}

// Main execution
console.log("=".repeat(80));
console.log("Phase 2I Sample Generator — 20 DanTree Analysis Runs");
console.log(`Start time: ${new Date().toISOString()}`);
console.log("=".repeat(80));
console.log(`Tickers: ${TICKERS.join(", ")}`);
console.log(`Runs per ticker: ${RUNS_PER_TICKER}`);
console.log(`Total: ${TICKERS.length * RUNS_PER_TICKER}`);
console.log();

const results = [];
let totalSuccess = 0;
let runNumber = 0;

for (const ticker of TICKERS) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`TICKER: ${ticker}`);
  console.log(`${"─".repeat(60)}`);
  
  for (let run = 1; run <= RUNS_PER_TICKER; run++) {
    runNumber++;
    const title = `请对 ${ticker} 做一次完整 DanTree 分析，输出完整 thesis、bull case、bear case、reasoning、risks、next steps。`;
    
    console.log(`\n[Run ${runNumber}/20] ${ticker} × Run ${run} — ${new Date().toISOString()}`);
    console.log(`  Submitting task...`);
    
    try {
      const submitResult = await trpcBatchMutation("chat.submitTask", {
        title,
        analysisMode: "standard",
      });
      
      if (submitResult?.result?.data?.json) {
        const { taskId, conversationId } = submitResult.result.data.json;
        console.log(`  Task created: taskId=${taskId}, conversationId=${conversationId}`);
        console.log(`  Waiting for qualifying assistant message (max 6min)...`);
        
        const waitResult = await waitForQualifyingMessage(conversationId, 360000);
        
        if (waitResult.success) {
          console.log(`  ✅ SUCCESS: messageId=${waitResult.messageId}, elapsed=${Math.round(waitResult.elapsed/1000)}s`);
          results.push({ ticker, run, taskId, conversationId, messageId: waitResult.messageId, success: true });
          totalSuccess++;
        } else {
          console.log(`  ⚠️  TIMEOUT after ${Math.round(waitResult.elapsed/1000)}s`);
          results.push({ ticker, run, taskId, conversationId, success: false, reason: "timeout" });
        }
      } else {
        const errMsg = JSON.stringify(submitResult).slice(0, 300);
        console.log(`  ❌ Submit failed: ${errMsg}`);
        results.push({ ticker, run, success: false, reason: "submit_failed", detail: errMsg });
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
      results.push({ ticker, run, success: false, reason: err.message });
    }
    
    // Brief pause between runs
    if (runNumber < TICKERS.length * RUNS_PER_TICKER) {
      console.log(`  Pausing 5s before next run...`);
      await sleep(5000);
    }
  }
}

console.log("\n" + "=".repeat(80));
console.log("SUMMARY");
console.log(`End time: ${new Date().toISOString()}`);
console.log("=".repeat(80));
console.log(`Total runs: ${runNumber}`);
console.log(`Successful (qualifying): ${totalSuccess}`);
console.log(`Failed/timeout: ${runNumber - totalSuccess}`);
console.log();

for (const r of results) {
  const status = r.success ? "✅" : "❌";
  const detail = r.success ? `msgId=${r.messageId}` : `reason=${r.reason}`;
  console.log(`  ${status} ${r.ticker} run${r.run}: taskId=${r.taskId} ${detail}`);
}

if (totalSuccess >= 20) {
  console.log("\n✅ READY: 20+ qualifying messages generated. Phase 2I gate can run.");
} else {
  console.log(`\n⏳ INSUFFICIENT: Only ${totalSuccess}/20 qualifying messages.`);
}
