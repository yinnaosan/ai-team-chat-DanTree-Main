/**
 * Phase 4C Stage 2 — Sample Generation Script
 * 5 tickers × 4 runs = 20 qualifying messages
 * Each ticker uses its own dedicated conversation (reuse existing or create new)
 */

import { SignJWT } from 'jose';

const BASE_URL = 'http://127.0.0.1:8001';
const JWT_SECRET = process.env.JWT_SECRET;
const LOG_FILE = '/tmp/gen_4c.log';

import { appendFileSync, writeFileSync } from 'fs';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

// Generate session token for user id=1 (admin)
// JWT payload must match sdk.ts verifySession: { openId, appId, name }
async function makeSessionToken() {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const expirationSeconds = Math.floor((Date.now() + 2 * 3600 * 1000) / 1000);
  return await new SignJWT({
    openId: process.env.OWNER_OPEN_ID,
    appId: process.env.VITE_APP_ID,
    name: process.env.OWNER_NAME || 'owner',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(expirationSeconds)
    .sign(secret);
}

async function trpcMutation(procedure, input, sessionToken) {
  const url = `${BASE_URL}/api/trpc/${procedure}?batch=1`;
  const body = JSON.stringify({ "0": { json: input } });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `app_session_id=${sessionToken}`,
    },
    body,
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return data[0]?.result?.data?.json ?? data[0]?.error ?? data;
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

async function trpcQuery(procedure, input, sessionToken) {
  const params = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const url = `${BASE_URL}/api/trpc/${procedure}?batch=1&input=${params}`;
  const res = await fetch(url, {
    headers: { 'Cookie': `app_session_id=${sessionToken}` },
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return data[0]?.result?.data?.json ?? data[0]?.error ?? data;
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForResult(conversationId, taskId, sessionToken, maxWait = 360000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await sleep(8000);
    const msgs = await trpcQuery('chat.getConversationMessages', { conversationId }, sessionToken);
    if (Array.isArray(msgs)) {
      const assistantMsgs = msgs.filter(m => m.role === 'assistant' && m.metadata?.decisionObject);
      if (assistantMsgs.length > 0) {
        const latest = assistantMsgs[assistantMsgs.length - 1];
        const hasSA = !!latest.metadata?.structured_analysis;
        return { messageId: latest.id, hasSA, metadata: latest.metadata };
      }
    }
    log(`  Waiting... elapsed=${Math.round((Date.now()-start)/1000)}s`);
  }
  return null;
}

// Ticker configs: reuse existing conv or create new
const TICKERS = [
  { ticker: 'AAPL', convId: 990007 },
  { ticker: 'NVDA', convId: 990009 },
  { ticker: 'TSLA', convId: null },       // new
  { ticker: '1810.HK', convId: null },    // new (old one has no decisionObject)
  { ticker: 'QQQ',  convId: 990012 },
];

const RUNS_PER_TICKER = 4;

async function main() {
  writeFileSync(LOG_FILE, '');
  log('=== Phase 4C Stage 2 Sample Generation START ===');
  const token = await makeSessionToken();
  let totalSuccess = 0;
  const results = [];

  for (const { ticker, convId: existingConvId } of TICKERS) {
    log(`\n=== TICKER: ${ticker} ===`);
    let convId = existingConvId;

    for (let run = 1; run <= RUNS_PER_TICKER; run++) {
      log(`  Run ${run}/${RUNS_PER_TICKER}...`);
      const prompt = `请对 ${ticker} 做一次完整 DanTree 分析，输出完整 thesis、bull case、bear case、reasoning、risks、next steps。`;

      const submitResult = await trpcMutation('chat.submitTask', {
        title: prompt,
        description: prompt,
        conversationId: convId ?? undefined,
      }, token);

      if (!submitResult || submitResult.error) {
        log(`  FAIL: submitTask error: ${JSON.stringify(submitResult)}`);
        continue;
      }

      const taskId = submitResult.taskId;
      const newConvId = submitResult.conversationId;
      if (!convId) convId = newConvId;
      log(`  Submitted: taskId=${taskId}, convId=${newConvId}`);

      const result = await waitForResult(newConvId, taskId, token);
      if (result) {
        totalSuccess++;
        results.push({ ticker, run, convId: newConvId, messageId: result.messageId, hasSA: result.hasSA });
        log(`  SUCCESS: msgId=${result.messageId}, hasSA=${result.hasSA}`);
      } else {
        log(`  TIMEOUT after 360s`);
        results.push({ ticker, run, convId: newConvId, messageId: null, hasSA: false });
      }
    }
  }

  log(`\n=== SUMMARY ===`);
  log(`Total success: ${totalSuccess}/20`);
  for (const r of results) {
    log(`  ${r.ticker} Run${r.run}: convId=${r.convId} msgId=${r.messageId} hasSA=${r.hasSA}`);
  }
  log('=== DONE ===');
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
