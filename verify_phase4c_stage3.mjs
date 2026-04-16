/**
 * Phase 4C Stage 3 — Verification Script
 * Purpose: Prove structured_analysis flows end-to-end into DB metadata
 * Usage: JWT_SECRET=xxx VITE_APP_ID=yyy node verify_phase4c_stage3.mjs
 *
 * What this checks:
 *   1. Submit a new analysis on AAPL (convId 990007, existing conv)
 *   2. Wait for assistant response with decisionObject
 *   3. Check metadata for:
 *      - structured_analysis present in answerObject (Fix B path)
 *      - structured_analysis present as top-level metadata key (Fix C path)
 *      - All 5 subfields non-empty
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

// ─── Step 1: Get current message count ───────────────────────────────────────
console.log("\n[Phase 4C Stage 3 Verification]");
console.log("SHA under test: 2be1a7d\n");

const CONV_ID = 990007;  // AAPL — existing conv
console.log(`Step 1: Getting baseline message count for convId=${CONV_ID}...`);

const convData = await trpcQuery("chat.getConversationMessages", { conversationId: CONV_ID });
const messages = convData?.result?.data?.json ?? [];
const assistantMsgsBefore = messages.filter(m => m.role === "assistant").length;
console.log(`  Baseline: ${assistantMsgsBefore} existing assistant messages`);

// ─── Step 2: Submit one analysis task ────────────────────────────────────────
console.log("\nStep 2: Submitting AAPL analysis task...");
const submitResult = await trpcMutation("chat.submitMessage", {
  conversationId: CONV_ID,
  content: "分析AAPL当前基本面和技术面，给出投资建议",
  role: "user",
});
const taskId = submitResult?.result?.data?.json?.taskId;
console.log(`  taskId=${taskId}  OK`);

// ─── Step 3: Poll for new assistant message ───────────────────────────────────
console.log("\nStep 3: Polling for new assistant message (max 7 min)...");
const maxWait = 420_000;
const start = Date.now();
let resultMsg = null;

while (Date.now() - start < maxWait) {
  await sleep(12_000);
  const d = await trpcQuery("chat.getConversationMessages", { conversationId: CONV_ID });
  const msgs = d?.result?.data?.json ?? [];
  const newAssistant = msgs.filter(m => m.role === "assistant").slice(assistantMsgsBefore);
  for (const msg of newAssistant) {
    const meta = msg.metadata;
    if (meta?.decisionObject && meta?.answerObject?.bull_case?.[0]) {
      resultMsg = msg;
      break;
    }
  }
  if (resultMsg) break;
  const elapsed = Math.round((Date.now() - start) / 1000);
  if (elapsed % 30 === 0) console.log(`  [${elapsed}s] waiting...`);
}

if (!resultMsg) {
  console.error("\nFAIL: Timed out waiting for qualifying assistant message");
  process.exit(1);
}

const elapsed = Math.round((Date.now() - start) / 1000);
console.log(`  Got result message (msgId=${resultMsg.id}) in ${elapsed}s`);

// ─── Step 4: Verify structured_analysis in DB metadata ───────────────────────
console.log("\nStep 4: Checking structured_analysis in metadata...");

const meta = resultMsg.metadata;
const sa_in_answerObject = meta?.answerObject?.structured_analysis;
const sa_toplevel = meta?.structured_analysis;

const G1 = !!sa_toplevel;
const G2 = !!sa_in_answerObject;

const REQUIRED_SUBFIELDS = [
  "primary_bull",
  "primary_bear",
  "primary_risk_condition",
  "confidence_summary",
  "stance_rationale",
];
const G3 = G1 && REQUIRED_SUBFIELDS.every(f => {
  const v = sa_toplevel[f];
  return typeof v === "string" && v.trim().length > 0;
});
const G3_detail = G1 ? REQUIRED_SUBFIELDS.map(f => ({
  field: f,
  present: !!(sa_toplevel[f]?.trim()),
  preview: (sa_toplevel[f] ?? "").slice(0, 60),
})) : [];

console.log("\n═══════════════════════════════════════════════════════");
console.log("  Phase 4C Stage 3 — DB Verification Result");
console.log("═══════════════════════════════════════════════════════");
console.log(`  convId:    ${CONV_ID}`);
console.log(`  taskId:    ${taskId}`);
console.log(`  msgId:     ${resultMsg.id}`);
console.log(`  elapsed:   ${elapsed}s`);
console.log("───────────────────────────────────────────────────────");
console.log(`  G1  structured_analysis in top-level metadata:  ${G1 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  G2  structured_analysis in answerObject:        ${G2 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  G3  all 5 subfields present & non-empty:        ${G3 ? "PASS ✓" : "FAIL ✗"}`);
console.log("───────────────────────────────────────────────────────");

if (G3_detail.length > 0) {
  for (const d of G3_detail) {
    console.log(`    ${d.present ? "✓" : "✗"}  ${d.field}: "${d.preview}"`);
  }
}

console.log("───────────────────────────────────────────────────────");
const PASS = G1 && G2 && G3;
console.log(`  FINAL: ${PASS ? "PASS — structured_analysis flows end-to-end into DB" : "FAIL"}`);
console.log("═══════════════════════════════════════════════════════\n");

process.exit(PASS ? 0 : 1);
