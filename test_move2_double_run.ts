/**
 * DANTREE Track B Move 2 — Double Run Verification
 * Tests _watchRiskScoreCache delta logic: RUN1 (no previous) → RUN2 (with previous)
 */
import { SchedulerService } from "./server/watchService";
import { buildSignalsFromLiveData } from "./server/liveSignalEngine";
import type { TriggerInput } from "./server/watchlistEngine";

// Build snapshotProvider using real liveSignalEngine
// CORRECT: accepts string[] (batch), calls buildSignalsFromLiveData(tickers) with full array
async function buildSnapshotProvider(tickers: string[]): Promise<Record<string, TriggerInput>> {
  console.log(`[SNAPSHOT] Building for tickers: ${tickers.join(', ')}`);
  try {
    const signals = await buildSignalsFromLiveData(tickers);
    const signalMap = new Map(signals.map(s => [s.ticker, s]));
    const result: Record<string, TriggerInput> = {};
    for (const ticker of tickers) {
      const sig = signalMap.get(ticker);
      if (!sig) {
        console.warn(`[SNAPSHOT] ${ticker}: no signal returned, using empty snapshot`);
        result[ticker] = { evaluated_at: Date.now() };
        continue;
      }
      const riskScore = Math.max(0, Math.min(1,
        0.5 * Math.abs(sig.signals.price_momentum) + 0.5 * sig.signals.volatility
      ));
      result[ticker] = {
        risk_score: riskScore,
        earnings_event_detected: sig.event_signal.type === 'earnings',
        macro_change_detected:
          sig.event_signal.type === 'policy' ||
          Math.abs(sig.signals.macro_exposure) >= 0.5,
        macro_change_magnitude: Math.abs(sig.signals.macro_exposure),
        evaluated_at: Date.now(),
      };
      console.log(`[SNAPSHOT] ${ticker}: risk_score=${riskScore.toFixed(4)} macro=${result[ticker].macro_change_detected} event=${sig.event_signal.type}`);
    }
    return result;
  } catch (err) {
    console.warn('[SNAPSHOT] batch signal build failed:', (err as Error).message);
    return Object.fromEntries(tickers.map(t => [t, { evaluated_at: Date.now() }]));
  }
}

async function main() {
  const BATCH_SIZE = 3;

  console.log('\n========== RUN 1 (BASELINE — no previous_risk_score in cache) ==========');
  console.log('[INFO] _watchRiskScoreCache should be EMPTY at start of RUN1');
  console.log('[INFO] previous_risk_score should NOT be injected into any snapshot');
  const run1 = await SchedulerService.batchEvaluateTriggers(
    buildSnapshotProvider,
    { batch_size: BATCH_SIZE, evaluation_interval_minutes: 0, dry_run: false }
  );
  console.log('RUN1 result:', JSON.stringify(run1, null, 2));

  // Small pause to let any async writes settle
  await new Promise(r => setTimeout(r, 1500));

  console.log('\n========== RUN 2 (DELTA CHECK — previous_risk_score should be injected from cache) ==========');
  console.log('[INFO] _watchRiskScoreCache should contain RUN1 risk_scores now');
  console.log('[INFO] previous_risk_score should be injected into snapshots BEFORE evaluation');
  const run2 = await SchedulerService.batchEvaluateTriggers(
    buildSnapshotProvider,
    { batch_size: BATCH_SIZE, evaluation_interval_minutes: 0, dry_run: false }
  );
  console.log('RUN2 result:', JSON.stringify(run2, null, 2));

  console.log('\n========== SUMMARY ==========');
  console.log('RUN1: watches_scanned=%d triggers_fired=%d errors=%d', run1.watches_scanned, run1.triggers_fired, run1.errors_count);
  console.log('RUN2: watches_scanned=%d triggers_fired=%d errors=%d', run2.watches_scanned, run2.triggers_fired, run2.errors_count);
  console.log('');
  console.log('EXPECTED BEHAVIOR:');
  console.log('  RUN1: risk_escalation CANNOT fire (no previous_risk_score in cache)');
  console.log('  RUN2: risk_escalation CAN fire IF delta >= 0.1 between RUN1 and RUN2 risk_scores');
  console.log('  RUN2: risk_escalation NOT fired = stable risk_score (delta < 0.1) — also valid');
  console.log('');
  console.log('CACHE BEHAVIOR:');
  console.log('  After RUN1: cache written with RUN1 risk_scores');
  console.log('  Before RUN2 eval: cache read, previous_risk_score injected into snapshot');
  console.log('  After RUN2: cache overwritten with RUN2 risk_scores');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
