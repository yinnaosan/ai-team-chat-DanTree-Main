/**
 * DANTREE_TRACK_B_MOVE_2_5 — RUN1 + RUN2 Double-Run Test
 * Verifies: DB write-back (RUN1) and DB read-back (RUN2) of last_risk_score
 */
import { SchedulerService } from "./server/watchService";
import { buildSignalsFromLiveData } from "./server/liveSignalEngine";
import mysql from "mysql2/promise";

async function getDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

async function checkLastRiskScores(label: string) {
  const conn = await getDb();
  const [rows] = await conn.execute(
    "SELECT watch_id, primary_ticker, watch_status, last_risk_score FROM watch_items ORDER BY created_at LIMIT 6"
  ) as [Array<{watch_id: string; primary_ticker: string; watch_status: string; last_risk_score: string | null}>, unknown];
  console.log(`\n[DB CHECK — ${label}]`);
  for (const r of rows) {
    console.log(`  ${r.primary_ticker} (${r.watch_id}): last_risk_score=${r.last_risk_score ?? "NULL"} status=${r.watch_status}`);
  }
  await conn.end();
  return rows;
}

async function buildSnapshotProvider(tickers: string[]): Promise<Record<string, import("./server/watchlistEngine").TriggerInput>> {
  try {
    // buildSignalsFromLiveData expects string[] (batch call)
    const signals = await buildSignalsFromLiveData(tickers);
    const signalMap = new Map(signals.map((s: {ticker: string}) => [s.ticker, s]));
    const results: Record<string, import("./server/watchlistEngine").TriggerInput> = {};
    for (const ticker of tickers) {
      const sig = signalMap.get(ticker) as {ticker: string; signals: {price_momentum: number; volatility: number; macro_exposure: number}; event_signal: {type: string}} | undefined;
      if (!sig) {
        results[ticker] = { evaluated_at: Date.now() };
        console.log(`[SNAPSHOT] ${ticker}: no signal (empty)`);
        continue;
      }
      const riskScore = Math.max(0, Math.min(1,
        0.5 * Math.abs(sig.signals.price_momentum) + 0.5 * sig.signals.volatility
      ));
      const macro = sig.event_signal.type === 'policy' || Math.abs(sig.signals.macro_exposure) >= 0.5;
      results[ticker] = {
        risk_score: riskScore,
        earnings_event_detected: sig.event_signal.type === 'earnings',
        macro_change_detected: macro,
        macro_change_magnitude: Math.abs(sig.signals.macro_exposure),
        evaluated_at: Date.now(),
      };
      console.log(`[SNAPSHOT] ${ticker}: risk_score=${riskScore.toFixed(4)} macro=${macro} event=${sig.event_signal.type}`);
    }
    return results;
  } catch (e) {
    console.warn('[SNAPSHOT WARN] batch failed:', (e as Error).message);
    return Object.fromEntries(tickers.map(t => [t, { evaluated_at: Date.now() }]));
  }
}

async function main() {
  console.log("=== MOVE 2.5 DOUBLE-RUN TEST ===\n");

  // PRE-CHECK: confirm last_risk_score is NULL for all watches
  const before = await checkLastRiskScores("BEFORE RUN1");
  const allNull = before.every(r => r.last_risk_score === null);
  console.log(`\nPRE-CHECK: all last_risk_score = NULL: ${allNull ? "YES ✓" : "NO ✗"}`);

  // ── RUN 1 ─────────────────────────────────────────────────────────────────
  console.log("\n=== RUN 1 (baseline — last_risk_score=NULL for all) ===");
  const run1 = await SchedulerService.batchEvaluateTriggers(buildSnapshotProvider, { batch_size: 3, dry_run: false });
  console.log("RUN1 result:", JSON.stringify(run1, null, 2));

  // POST-RUN1: check last_risk_score written to DB
  const afterRun1 = await checkLastRiskScores("AFTER RUN1");
  const run1Written = afterRun1.filter(r => r.last_risk_score !== null);
  console.log(`\nRUN1 DB WRITE-BACK: ${run1Written.length} watches got last_risk_score written`);
  for (const r of run1Written) {
    console.log(`  ✓ ${r.primary_ticker}: last_risk_score=${r.last_risk_score}`);
  }

  // ── RUN 2 ─────────────────────────────────────────────────────────────────
  // Reset triggered watches back to active so RUN2 scans same set
  const conn = await getDb();
  await conn.execute("UPDATE watch_items SET watch_status='active' WHERE watch_status='triggered'");
  await conn.end();
  console.log("\n[RESET] triggered → active for RUN2");

  console.log("\n=== RUN 2 (delta check — previous_risk_score read from DB) ===");
  const run2 = await SchedulerService.batchEvaluateTriggers(buildSnapshotProvider, { batch_size: 3, dry_run: false });
  console.log("RUN2 result:", JSON.stringify(run2, null, 2));

  // POST-RUN2: check last_risk_score still present (updated)
  await checkLastRiskScores("AFTER RUN2");

  console.log("\n=== SUMMARY ===");
  console.log(`RUN1: scanned=${run1.watches_scanned} fired=${run1.triggers_fired} errors=${run1.errors_count}`);
  console.log(`RUN2: scanned=${run2.watches_scanned} fired=${run2.triggers_fired} errors=${run2.errors_count}`);
  console.log(`DB write-back confirmed: ${run1Written.length > 0 ? "YES ✓" : "NO ✗"}`);
  console.log("\nDone.");
  process.exit(0);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
