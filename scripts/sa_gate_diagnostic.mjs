/**
 * sa_gate_diagnostic.mjs
 * DANTREE_EVAL_MOVE2_SA_GATE_TESTS_AND_DIAGNOSTIC
 *
 * Read-only baseline diagnostic for structured_analysis_gate distribution.
 * Queries the messages table for assistant messages that have a
 * structured_analysis_gate entry in their metadata JSON.
 *
 * READ-ONLY: SELECT only. No writes. No schema changes.
 * Uses mysql2/promise + DATABASE_URL — same pattern as scripts/check_p1b.mjs.
 *
 * Usage:
 *   node scripts/sa_gate_diagnostic.mjs           # last 30 days, up to 1000 samples
 *   node scripts/sa_gate_diagnostic.mjs --days 7  # last 7 days
 *   node scripts/sa_gate_diagnostic.mjs --limit 200  # limit to 200 samples
 *   node scripts/sa_gate_diagnostic.mjs --days 7 --limit 200
 *
 * Output:
 *   - Sample count + parse errors
 *   - ID range (oldest → newest)
 *   - HARD_FAIL / SOFT_FAIL / PASS / FULL_PASS distribution with ASCII bar charts
 *   - Score distribution buckets (0-49 / 50-64 / 65-74 / 75-84 / 85-100)
 *   - Per-field fail count (which fields fail most often)
 *   - PASS+FULL_PASS rate (overall quality pass rate)
 *   - HARD_FAIL rate (primary baseline metric)
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

// ── CLI argument parsing ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
let days = 30;
let limit = 1000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--days" && args[i + 1]) {
    const parsed = parseInt(args[i + 1], 10);
    if (!isNaN(parsed) && parsed > 0) days = parsed;
    i++;
  } else if (args[i] === "--limit" && args[i + 1]) {
    const parsed = parseInt(args[i + 1], 10);
    if (!isNaN(parsed) && parsed > 0) limit = parsed;
    i++;
  }
}

// ── ASCII bar chart helper ─────────────────────────────────────────────────────
function bar(count, total, width = 30) {
  if (total === 0) return "[" + " ".repeat(width) + "]";
  const filled = Math.round((count / total) * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

function pct(count, total) {
  if (total === 0) return "0.0%";
  return ((count / total) * 100).toFixed(1) + "%";
}

// ── Main ───────────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

let conn;
try {
  conn = await mysql.createConnection(DATABASE_URL);
} catch (err) {
  console.error("ERROR: Failed to connect to database:", err.message);
  process.exit(1);
}

console.log("=".repeat(60));
console.log("SA Gate Baseline Diagnostic");
console.log(`Window: last ${days} days | Limit: ${limit} samples`);
console.log("=".repeat(60));

// ── Query — READ ONLY ─────────────────────────────────────────────────────────
// Targets metadata.structured_analysis_gate
// No writes, no schema changes, no side effects.

const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const cutoffStr = cutoff.toISOString().replace("T", " ").slice(0, 19);

const [rows] = await conn.execute(
  `SELECT id, createdAt,
     JSON_EXTRACT(metadata, '$.structured_analysis_gate') AS gate_json
   FROM messages
   WHERE role = 'assistant'
     AND JSON_EXTRACT(metadata, '$.structured_analysis_gate') IS NOT NULL
     AND (createdAt IS NULL OR createdAt >= ?)
   ORDER BY id DESC
   LIMIT ?`,
  [cutoffStr, limit]
);

await conn.end();

// ── Parse results ─────────────────────────────────────────────────────────────
if (!rows || rows.length === 0) {
  console.log("\nNO DATA FOUND");
  console.log(`No messages with structured_analysis_gate in metadata found in the last ${days} days.`);
  console.log("This is expected if the SA gate has not yet been active in production.");
  process.exit(0);
}

const samples = [];
let parseErrors = 0;

for (const row of rows) {
  try {
    const raw = typeof row.gate_json === "string" ? JSON.parse(row.gate_json) : row.gate_json;
    if (raw && typeof raw === "object" && raw.overall) {
      samples.push({
        id: row.id,
        createdAt: row.createdAt,
        overall: raw.overall,
        weighted_score: typeof raw.weighted_score === "number" ? raw.weighted_score : null,
        hard_fail_fields: Array.isArray(raw.hard_fail_fields) ? raw.hard_fail_fields : [],
      });
    } else {
      parseErrors++;
    }
  } catch {
    parseErrors++;
  }
}

const total = samples.length;
const ids = samples.map(s => s.id).filter(Boolean);
const minId = ids.length > 0 ? Math.min(...ids) : null;
const maxId = ids.length > 0 ? Math.max(...ids) : null;

// ── Distribution counts ───────────────────────────────────────────────────────
const counts = { HARD_FAIL: 0, SOFT_FAIL: 0, PASS: 0, FULL_PASS: 0 };
for (const s of samples) {
  if (counts[s.overall] !== undefined) counts[s.overall]++;
}

// ── Score distribution ────────────────────────────────────────────────────────
const scoreBuckets = { "0-49": 0, "50-64": 0, "65-74": 0, "75-84": 0, "85-100": 0 };
for (const s of samples) {
  const sc = s.weighted_score;
  if (sc === null) continue;
  if (sc <= 49) scoreBuckets["0-49"]++;
  else if (sc <= 64) scoreBuckets["50-64"]++;
  else if (sc <= 74) scoreBuckets["65-74"]++;
  else if (sc <= 84) scoreBuckets["75-84"]++;
  else scoreBuckets["85-100"]++;
}

// ── Per-field fail count ──────────────────────────────────────────────────────
const fieldFailCounts = {
  primary_risk_condition: 0,
  confidence_summary: 0,
  primary_bull: 0,
  primary_bear: 0,
  stance_rationale: 0,
};
for (const s of samples) {
  for (const entry of s.hard_fail_fields) {
    for (const field of Object.keys(fieldFailCounts)) {
      if (entry.includes(field)) fieldFailCounts[field]++;
    }
  }
}

// ── Print report ──────────────────────────────────────────────────────────────
console.log(`\nSample count:  ${total} valid | ${parseErrors} parse errors`);
if (minId !== null && maxId !== null) {
  console.log(`ID range:      ${minId} → ${maxId}`);
}

console.log("\n── Verdict Distribution ─────────────────────────────────────");
for (const [label, count] of Object.entries(counts)) {
  const b = bar(count, total);
  console.log(`  ${label.padEnd(12)} ${String(count).padStart(5)}  ${pct(count, total).padStart(6)}  ${b}`);
}

console.log("\n── Score Distribution ───────────────────────────────────────");
for (const [bucket, count] of Object.entries(scoreBuckets)) {
  const b = bar(count, total);
  console.log(`  ${bucket.padEnd(8)} ${String(count).padStart(5)}  ${pct(count, total).padStart(6)}  ${b}`);
}

console.log("\n── Per-Field HARD_FAIL Count ────────────────────────────────");
const hardFailTotal = counts.HARD_FAIL;
for (const [field, count] of Object.entries(fieldFailCounts)) {
  const b = bar(count, hardFailTotal || 1);
  console.log(`  ${field.padEnd(26)} ${String(count).padStart(5)}  ${pct(count, hardFailTotal || 1).padStart(6)}  ${b}`);
}

const passRate = pct(counts.PASS + counts.FULL_PASS, total);
const hardFailRate = pct(counts.HARD_FAIL, total);

console.log("\n── Summary Metrics ──────────────────────────────────────────");
console.log(`  PASS + FULL_PASS rate:  ${passRate}  (overall quality pass rate)`);
console.log(`  HARD_FAIL rate:         ${hardFailRate}  (primary baseline metric)`);
console.log(`  SOFT_FAIL rate:         ${pct(counts.SOFT_FAIL, total)}  (expected: 0% — structurally unreachable)`);

console.log("\n" + "=".repeat(60));
console.log("Diagnostic complete. READ-ONLY — no writes performed.");
console.log("=".repeat(60));
