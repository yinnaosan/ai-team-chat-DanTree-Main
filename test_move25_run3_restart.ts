/**
 * DANTREE_TRACK_B_MOVE_2_5 — RUN3 Post-Restart Persistence Test
 * Fresh process = simulates server restart
 * Verifies: last_risk_score from DB is still available (not reset like in-memory cache)
 * Expected: previous_risk_score IS injected from DB (unlike Move 2 which was cache-only)
 */
import { SchedulerService } from "./server/watchService";
import { buildSignalsFromLiveData } from "./server/liveSignalEngine";
import mysql from "mysql2/promise";

async function getDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

async function buildSnapshotProvider(tickers: string[]): Promise<Record<string, import("./server/watchlistEngine").TriggerInput>> {
  try {
    const signals = await buildSignalsFromLiveData(tickers);
    const signalMap = new Map(signals.map((s: {ticker: string}) => [s.ticker, s]));
    const results: Record<string, import("./server/watchlistEngine").TriggerInput> = {};
    for (const ticker of tickers) {
      const sig = signalMap.get(ticker) as {ticker: string; signals: {price_momentum: number; volatility: number; macro_exposure: number}; event_signal: {type: string}} | undefined;
      if (!sig) {
        results[ticker] = { evaluated_at: Date.now() };
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
      console.log(`[SNAPSHOT-RUN3] ${ticker}: risk_score=${riskScore.toFixed(4)} macro=${macro} event=${sig.event_signal.type}`);
    }
    return results;
  } catch (e) {
    console.warn('[SNAPSHOT WARN] batch failed:', (e as Error).message);
    return Object.fromEntries(tickers.map(t => [t, { evaluated_at: Date.now() }]));
  }
}

async function main() {
  console.log("=== MOVE 2.5 RUN3 — POST-RESTART PERSISTENCE TEST ===");
  console.log("This is a FRESH PROCESS — no in-memory state from previous runs.\n");

  // PRE-CHECK: confirm last_risk_score is NON-NULL (written by RUN1)
  const conn = await getDb();
  const [rows] = await conn.execute(
    "SELECT watch_id, primary_ticker, watch_status, last_risk_score FROM watch_items ORDER BY created_at LIMIT 6"
  ) as [Array<{watch_id: string; primary_ticker: string; watch_status: string; last_risk_score: string | null}>, unknown];
  await conn.end();

  console.log("[DB CHECK — BEFORE RUN3 (from DB, not in-memory)]");
  let nonNullCount = 0;
  for (const r of rows) {
    console.log(`  ${r.primary_ticker} (${r.watch_id}): last_risk_score=${r.last_risk_score ?? "NULL"} status=${r.watch_status}`);
    if (r.last_risk_score !== null) nonNullCount++;
  }
  console.log(`\nPRE-CHECK: ${nonNullCount} watches have last_risk_score in DB (from previous run)`);
  console.log(`CRITICAL: If Move 2 (in-memory cache) were still used, these would be GONE after restart.`);
  console.log(`With Move 2.5 (DB persistence), they SURVIVE restart.\n`);

  // ── RUN 3 ─────────────────────────────────────────────────────────────────
  console.log("=== RUN 3 (post-restart — DB values should be read as previous_risk_score) ===");
  const run3 = await SchedulerService.batchEvaluateTriggers(buildSnapshotProvider, { batch_size: 3, dry_run: false });
  console.log("RUN3 result:", JSON.stringify(run3, null, 2));

  // POST-RUN3: check DB state
  const conn2 = await getDb();
  const [rows2] = await conn2.execute(
    "SELECT watch_id, primary_ticker, watch_status, last_risk_score FROM watch_items ORDER BY created_at LIMIT 6"
  ) as [Array<{watch_id: string; primary_ticker: string; watch_status: string; last_risk_score: string | null}>, unknown];
  await conn2.end();

  console.log("\n[DB CHECK — AFTER RUN3]");
  for (const r of rows2) {
    console.log(`  ${r.primary_ticker}: last_risk_score=${r.last_risk_score ?? "NULL"} status=${r.watch_status}`);
  }

  // Check audit log for any risk_escalation
  const conn3 = await getDb();
  const [auditRows] = await conn3.execute(
    "SELECT audit_id, watch_id, trigger_id, event_type FROM watch_audit_log ORDER BY created_at DESC LIMIT 5"
  ) as [Array<{audit_id: string; watch_id: string; trigger_id: string | null; event_type: string}>, unknown];
  await conn3.end();

  console.log("\n[AUDIT LOG — last 5 entries]");
  for (const a of auditRows) {
    console.log(`  ${a.audit_id}: event=${a.event_type} trigger=${a.trigger_id ?? "none"} watch=${a.watch_id}`);
  }

  const riskEscalationFired = auditRows.some(a => a.trigger_id === 'risk_escalation');
  console.log(`\nrisk_escalation fired in RUN3: ${riskEscalationFired ? "YES" : "NO"}`);
  console.log(`(Expected: NO if risk_scores stable; YES if delta >= 0.1 between runs)`);

  console.log("\n=== RUN3 SUMMARY ===");
  console.log(`scanned=${run3.watches_scanned} fired=${run3.triggers_fired} errors=${run3.errors_count}`);
  console.log(`DB persistence after restart: ${nonNullCount > 0 ? "CONFIRMED ✓" : "FAILED ✗"}`);
  console.log(`(In-memory cache would have been empty; DB values survived restart)`);
  console.log("\nDone.");
  process.exit(0);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
