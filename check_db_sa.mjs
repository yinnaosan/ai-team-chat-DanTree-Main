/**
 * Phase 4C Stage 3 — 最简 DB 直查脚本
 * 直接查 conversations 表最近的 metadata，检查 structured_analysis 是否存在
 * 无需提交新任务，无需轮询 LLM
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";

// 找到数据库文件
const DB_PATHS = [
  "./.manus/db/sqlite.db",
  "./sqlite.db",
  "/home/ubuntu/ai-team-chat/.manus/db/sqlite.db",
];
let dbPath = null;
for (const p of DB_PATHS) {
  try { readFileSync(p); dbPath = p; break; } catch {}
}
if (!dbPath) { console.error("DB not found"); process.exit(1); }
console.log("DB:", dbPath);

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

// Query: 最近 30 条有 decisionObject 的 assistant 消息的 metadata
const rows = sqlite.prepare(`
  SELECT
    m.id,
    m.conversation_id,
    m.created_at,
    json_extract(m.metadata, '$.structured_analysis') AS sa_top,
    json_extract(m.metadata, '$.answerObject.structured_analysis') AS sa_inner,
    json_extract(m.metadata, '$.answerObject.verdict') AS verdict
  FROM messages m
  WHERE m.role = 'assistant'
    AND json_extract(m.metadata, '$.decisionObject') IS NOT NULL
    AND json_extract(m.metadata, '$.answerObject') IS NOT NULL
  ORDER BY m.id DESC
  LIMIT 30
`).all();

console.log(`\nFound ${rows.length} qualifying messages\n`);

let sa_present = 0;
let sa_absent = 0;
let latest_sa = null;

for (const r of rows) {
  const has_top = r.sa_top !== null;
  const has_inner = r.sa_inner !== null;
  if (has_top) {
    sa_present++;
    if (!latest_sa) latest_sa = r;
  } else {
    sa_absent++;
  }
  if (rows.indexOf(r) < 5) {
    console.log(`  msgId=${r.id} convId=${r.conversation_id} sa_top=${has_top ? "✓" : "✗"} sa_inner=${has_inner ? "✓" : "✗"} verdict="${(r.verdict||"").slice(0,40)}"`);
  }
}

console.log(`\nSummary: sa_present=${sa_present} sa_absent=${sa_absent} total=${rows.length}`);

if (latest_sa) {
  console.log("\nLatest message WITH structured_analysis:");
  const sa = JSON.parse(latest_sa.sa_top);
  const fields = ["primary_bull","primary_bear","primary_risk_condition","confidence_summary","stance_rationale"];
  for (const f of fields) {
    const v = sa[f] ?? "";
    console.log(`  ${f.padEnd(26)}: "${v.slice(0,70)}"`);
  }
}

// Gate evaluation
const G1 = sa_present > 0;
const G2 = latest_sa ? latest_sa.sa_inner !== null : false;
let G3 = false;
if (latest_sa && latest_sa.sa_top) {
  const sa = JSON.parse(latest_sa.sa_top);
  G3 = ["primary_bull","primary_bear","primary_risk_condition","confidence_summary","stance_rationale"]
    .every(f => typeof sa[f] === "string" && sa[f].trim().length > 0);
}

console.log("\n═══════════════════════════════════════════════════════");
console.log("  Phase 4C Stage 3 — DB Gate Results");
console.log("═══════════════════════════════════════════════════════");
console.log(`  G1  structured_analysis in ANY message (top-level):  ${G1 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  G2  structured_analysis in latest answerObject:       ${G2 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  G3  all 5 subfields non-empty in latest:              ${G3 ? "PASS ✓" : "FAIL ✗"}`);
const PASS = G1 && G2 && G3;
console.log(`\n  FINAL: ${PASS ? "PASS ✓" : "FAIL ✗ — structured_analysis not yet in DB"}`);
console.log("═══════════════════════════════════════════════════════\n");
process.exit(PASS ? 0 : 1);
