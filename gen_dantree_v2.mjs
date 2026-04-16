/**
 * Phase 2I Sample Generator v2
 * Rules:
 * - Each ticker has ONE dedicated conversation
 * - AAPL reuses conv 990007 (already has 1 qualifying msg)
 * - NVDA: create new (990008 has empty assistant msg, skip)
 * - TSLA: create new
 * - 1810.HK: create new (810001 has no decisionObject, skip)
 * - QQQ: create new
 * - 4 runs per ticker, all in the SAME conversation
 * - Total: 20 qualifying messages
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function trpcBatchMutation(procedure, input) {
  const url = `${BASE_URL}/api/trpc/${procedure}?batch=1`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": COOKIE },
    body: JSON.stringify({ "0": { json: input } }),
  });
  const arr = await res.json();
  return arr[0];
}

async function trpcBatchQuery(procedure, input) {
  const inputEncoded = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const res = await fetch(`${BASE_URL}/api/trpc/${procedure}?batch=1&input=${inputEncoded}`, {
    headers: { "Cookie": COOKIE },
  });
  const arr = await res.json();
  return arr[0];
}

// Wait for a NEW qualifying assistant message after a given message count
async function waitForNewQualifyingMessage(conversationId, prevMsgCount, maxWaitMs = 420000) {
  const startTime = Date.now();
  const pollInterval = 10000;
  let lastLogTime = 0;

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(pollInterval);
    try {
      const convData = await trpcBatchQuery("chat.getConversationMessages", { conversationId });
      if (convData?.result?.data?.json) {
        const messages = convData.result.data.json;
        const assistantMsgs = messages.filter(m => m.role === "assistant");
        // Only look at messages AFTER the previous count
        const newMsgs = assistantMsgs.slice(prevMsgCount);
        for (const msg of newMsgs) {
          const meta = msg.metadata;
          if (meta && meta.decisionObject && meta.answerObject?.bull_case?.[0]) {
            return { success: true, messageId: msg.id, elapsed: Date.now() - startTime };
          }
        }
      }
    } catch (err) { /* ignore poll errors */ }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (elapsed - lastLogTime >= 30) {
      console.log(`    [${elapsed}s] Waiting for decisionObject...`);
      lastLogTime = elapsed;
    }
  }
  return { success: false, elapsed: maxWaitMs };
}

// Get current qualifying assistant message count in a conversation
async function getQualifyingCount(conversationId) {
  try {
    const convData = await trpcBatchQuery("chat.getConversationMessages", { conversationId });
    if (convData?.result?.data?.json) {
      const messages = convData.result.data.json;
      return messages.filter(m =>
        m.role === "assistant" &&
        m.metadata?.decisionObject &&
        m.metadata?.answerObject?.bull_case?.[0]
      ).length;
    }
  } catch (err) {}
  return 0;
}

// ─────────────────────────────────────────────
// TICKER PLAN
// ─────────────────────────────────────────────
// AAPL: reuse conv 990007 (already has 1 qualifying msg → need 3 more)
// NVDA: create new
// TSLA: create new
// 1810.HK: create new
// QQQ: create new

const TICKER_PLAN = [
  { ticker: "AAPL",    existingConvId: 990007, runsNeeded: 3, prompt: "请对 AAPL 做一次完整 DanTree 分析，输出完整 thesis、bull case、bear case、reasoning、risks、next steps。" },
  { ticker: "NVDA",    existingConvId: null,   runsNeeded: 4, prompt: "请对 NVDA 做一次完整 DanTree 分析，输出完整 thesis、bull case、bear case、reasoning、risks、next steps。" },
  { ticker: "TSLA",    existingConvId: null,   runsNeeded: 4, prompt: "请对 TSLA 做一次完整 DanTree 分析，输出完整 thesis、bull case、bear case、reasoning、risks、next steps。" },
  { ticker: "1810.HK", existingConvId: null,   runsNeeded: 4, prompt: "请对 1810.HK（小米集团）做一次完整 DanTree 分析，输出完整 thesis、bull case、bear case、reasoning、risks、next steps。" },
  { ticker: "QQQ",     existingConvId: null,   runsNeeded: 4, prompt: "请对 QQQ 做一次完整 DanTree 分析，输出完整 thesis、bull case、bear case、reasoning、risks、next steps。" },
];

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
console.log("=".repeat(80));
console.log("Phase 2I Sample Generator v2 — Dedicated Conversations per Ticker");
console.log(`Start: ${new Date().toISOString()}`);
console.log("=".repeat(80));

const allResults = [];
let totalSuccess = 0;
let runNumber = 0;

for (const plan of TICKER_PLAN) {
  const { ticker, existingConvId, runsNeeded, prompt } = plan;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`TICKER: ${ticker}`);
  console.log(`${"─".repeat(60)}`);

  // Determine conversation ID
  let conversationId = existingConvId;
  if (!conversationId) {
    // Create new conversation by submitting first task
    console.log(`  No existing conversation — will create new one on first run`);
  } else {
    const existing = await getQualifyingCount(conversationId);
    console.log(`  Reusing conv ${conversationId} — existing qualifying msgs: ${existing}`);
  }

  for (let run = 1; run <= runsNeeded; run++) {
    runNumber++;
    console.log(`\n  [Run ${runNumber}] ${ticker} × Run ${run}/${runsNeeded} — ${new Date().toISOString()}`);
    console.log(`  Submitting task...`);

    try {
      // Get current assistant msg count before submitting
      let prevAssistantCount = 0;
      if (conversationId) {
        const convData = await trpcBatchQuery("chat.getConversationMessages", { conversationId });
        if (convData?.result?.data?.json) {
          prevAssistantCount = convData.result.data.json.filter(m => m.role === "assistant").length;
        }
      }

      const submitInput = { title: prompt, analysisMode: "standard" };
      if (conversationId) {
        submitInput.conversationId = conversationId;
      }

      const submitResult = await trpcBatchMutation("chat.submitTask", submitInput);

      if (submitResult?.result?.data?.json) {
        const { taskId, conversationId: newConvId } = submitResult.result.data.json;
        if (!conversationId) {
          conversationId = newConvId;
          console.log(`  New conversation created: ${conversationId}`);
        }
        console.log(`  Task submitted: taskId=${taskId}, conversationId=${conversationId}`);
        console.log(`  Waiting for qualifying assistant message (max 7min)...`);

        const waitResult = await waitForNewQualifyingMessage(conversationId, prevAssistantCount, 420000);

        if (waitResult.success) {
          console.log(`  ✅ SUCCESS: messageId=${waitResult.messageId}, elapsed=${Math.round(waitResult.elapsed/1000)}s`);
          allResults.push({ ticker, run, taskId, conversationId, messageId: waitResult.messageId, success: true });
          totalSuccess++;
        } else {
          console.log(`  ⚠️  TIMEOUT after ${Math.round(waitResult.elapsed/1000)}s`);
          allResults.push({ ticker, run, taskId, conversationId, success: false, reason: "timeout" });
        }
      } else {
        const errMsg = JSON.stringify(submitResult).slice(0, 300);
        console.log(`  ❌ Submit failed: ${errMsg}`);
        allResults.push({ ticker, run, conversationId, success: false, reason: "submit_failed" });
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
      allResults.push({ ticker, run, conversationId, success: false, reason: err.message });
    }

    // Pause between runs within same conversation
    if (run < runsNeeded) {
      console.log(`  Pausing 8s before next run in same conversation...`);
      await sleep(8000);
    }
  }

  // Pause between tickers
  console.log(`\n  ${ticker} done. Pausing 10s before next ticker...`);
  await sleep(10000);
}

// ─────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────
console.log("\n" + "=".repeat(80));
console.log("FINAL SUMMARY");
console.log(`End: ${new Date().toISOString()}`);
console.log("=".repeat(80));
console.log(`Total runs attempted: ${runNumber}`);
console.log(`Qualifying successes: ${totalSuccess}`);
console.log(`Failed/timeout: ${runNumber - totalSuccess}`);
console.log();

for (const r of allResults) {
  const status = r.success ? "✅" : "❌";
  const detail = r.success ? `msgId=${r.messageId}` : `reason=${r.reason}`;
  console.log(`  ${status} ${r.ticker} run${r.run} conv=${r.conversationId}: ${detail}`);
}

if (totalSuccess >= 19) {
  // AAPL already has 1 from before + 3 new = 4; others 4 each = 4×4=16; total=20
  console.log("\n✅ READY: Sufficient qualifying messages. Phase 2I gate can run.");
} else {
  console.log(`\n⏳ INSUFFICIENT: ${totalSuccess} new qualifying messages. Need more.`);
}
