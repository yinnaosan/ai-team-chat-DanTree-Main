/**
 * Phase 4C Stage 3 — DB Verification Script (v2 — fixed procedure name)
 * Usage: JWT_SECRET=xxx VITE_APP_ID=yyy node verify_phase4c_stage3.mjs
 *
 * Verifies structured_analysis flows LLM → validateFinalOutput → DELIVERABLE → DB
 * Gates:
 *   G1: structured_analysis present in metadata top-level field
 *   G2: structured_analysis present inside metadata.answerObject
 *   G3: all 5 subfields non-empty
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

async function trpcQuery(procedure, input) {
  const enc = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const res = await fetch(`${BASE_URL}/api/trpc/${procedure}?batch=1&input=${enc}`, {
    headers: { Cookie: COOKIE },
  });
  return (await res.json())[0];
}

async function trpcMutation(procedure, input) {
  const res = await fetch(`${BASE_URL}/api/trpc/${procedure}?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
    body: JSON.stringify({ "0": { json: input } }),
  });
  return (await res.json())[0];
}

// ─── Step 1: Get baseline message count ──────────────────────────────────────
console.log("\n[Phase 4C Stage 3 — DB Verification v2]");
console.log("SHA under test: 2be1a7d (Fix A+B+C)\n");

const CONV_ID = 990007;  // AAPL existing conv
console.log(`Step 1: Baseline message count for convId=${CONV_ID}...`);

const convData0 = await trpcQuery("chat.getConversationMessages", { conversationId: CONV_ID });
const msgsBefore = convData0?.result?.data?.json ?? [];
const assistantCountBefore = msgsBefore.filter(m => m.role === "assistant").length;
console.log(`  Baseline: ${assistantCountBefore} assistant messages`);

// ─── Step 2: Submit via chat.submitTask (correct procedure) ───────────────────
console.log("\nStep 2: Submitting AAPL analysis via chat.submitTask...");
const submitResult = await trpcMutation("chat.submitTask", {
  title: "分析AAPL近期基本面，给出投资建议",
  analysisMode: "standard",
  conversationId: CONV_ID,
});

const taskId = submitResult?.result?.data?.json?.taskId;
const convId = submitResult?.result?.data?.json?.conversationId ?? CONV_ID;
console.log(`  taskId=${taskId}  conversationId=${convId}`);

if (!taskId) {
  console.error("  WARN: taskId undefined — checking submit response:");
  console.error("  ", JSON.stringify(submitResult).slice(0, 300));
}

// ─── Step 3: Poll for new qualifying assistant message ────────────────────────
console.log("\nStep 3: Polling for new assistant message with decisionObject (max 7 min)...");
const maxWait = 420_000;
const start = Date.now();
let resultMsg = null;

while (Date.now() - start < maxWait) {
  await sleep(12_000);
  const d = await trpcQuery("chat.getConversationMessages", { conversationId: convId });
  const msgs = d?.result?.data?.json ?? [];
  const newMsgs = msgs.filter(m => m.role === "assistant").slice(assistantCountBefore);
  for (const msg of newMsgs) {
    const meta = msg.metadata;
    if (meta?.decisionObject && meta?.answerObject?.bull_case?.[0]) {
      resultMsg = msg;
      break;
    }
  }
  if (resultMsg) break;
  const elapsed = Math.round((Date.now() - start) / 1000);
  if (elapsed % 30 < 13) console.log(`  [${elapsed}s] waiting for decisionObject...`);
}

if (!resultMsg) {
  console.error("\nFAIL: Timed out — no qualifying assistant message within 7 min");
  process.exit(1);
}
const elapsed = Math.round((Date.now() - start) / 1000);
console.log(`  Got qualifying message (msgId=${resultMsg.id}) in ${elapsed}s`);

// ─── Step 4: Verify structured_analysis in DB metadata ───────────────────────
console.log("\nStep 4: Checking structured_analysis in metadata...");
const meta = resultMsg.metadata;
const sa_top   = meta?.structured_analysis;
const sa_inner = meta?.answerObject?.structured_analysis;

const G1 = !!sa_top;
const G2 = !!sa_inner;
const SUBFIELDS = ["primary_bull","primary_bear","primary_risk_condition","confidence_summary","stance_rationale"];
const G3 = G1 && SUBFIELDS.every(f => typeof sa_top[f] === "string" && sa_top[f].trim().length > 0);

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  Phase 4C Stage 3 — DB Verification Result");
console.log("  SHA 2be1a7d | Fix A (validator) + Fix B (DELIVERABLE) + Fix C (metadata)");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`  convId=${convId}  taskId=${taskId}  msgId=${resultMsg.id}  elapsed=${elapsed}s`);
console.log("───────────────────────────────────────────────────────────────");
console.log(`  G1  structured_analysis in metadata top-level:  ${G1 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  G2  structured_analysis in answerObject:         ${G2 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  G3  all 5 subfields present & non-empty:         ${G3 ? "PASS ✓" : "FAIL ✗"}`);
console.log("───────────────────────────────────────────────────────────────");
if (G1) {
  for (const f of SUBFIELDS) {
    const v = sa_top[f] ?? "";
    const ok = typeof v === "string" && v.trim().length > 0;
    console.log(`    ${ok ? "✓" : "✗"}  ${f}:`);
    console.log(`       "${v.slice(0, 80)}"`);
  }
} else {
  console.log("  meta.structured_analysis: null/undefined");
  console.log("  meta keys:", Object.keys(meta ?? {}).join(", "));
  if (meta?.answerObject) {
    console.log("  answerObject keys:", Object.keys(meta.answerObject).join(", "));
  }
}
console.log("───────────────────────────────────────────────────────────────");
const PASS = G1 && G2 && G3;
console.log(`\n  FINAL: ${PASS ? "PASS ✓ — structured_analysis confirmed in DB" : "FAIL ✗"}`);
console.log("═══════════════════════════════════════════════════════════════\n");
process.exit(PASS ? 0 : 1);
