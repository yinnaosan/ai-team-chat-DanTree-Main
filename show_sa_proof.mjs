/**
 * Phase 4C Stage 3 — 5行输出 DB 证明
 * 输出恰好 5 行：msgId + 5个子字段各1行 + FINAL
 */
import Database from "better-sqlite3";
const db = new Database("./.manus/db/sqlite.db");
const row = db.prepare(`
  SELECT m.id, json_extract(m.metadata,'$.structured_analysis') as sa
  FROM messages m
  WHERE m.role='assistant'
    AND json_extract(m.metadata,'$.structured_analysis') IS NOT NULL
  ORDER BY m.id DESC LIMIT 1
`).get();

if (!row) { console.log("FAIL: no structured_analysis in DB"); process.exit(1); }
const sa = JSON.parse(row.sa);
console.log(`msgId=${row.id}`);
console.log(`primary_bull       = "${sa.primary_bull?.slice(0,60)}"`);
console.log(`primary_bear       = "${sa.primary_bear?.slice(0,60)}"`);
console.log(`primary_risk       = "${sa.primary_risk_condition?.slice(0,55)}"`);
console.log(`confidence_summary = "${sa.confidence_summary?.slice(0,55)}"`);
console.log(`stance_rationale   = "${sa.stance_rationale?.slice(0,60)}"`);
const ok = ['primary_bull','primary_bear','primary_risk_condition','confidence_summary','stance_rationale'].every(f=>sa[f]?.trim()?.length>0);
console.log(`FINAL: ${ok?"PASS ✓ — all 5 subfields in DB":"FAIL ✗"}`);
process.exit(ok ? 0 : 1);
