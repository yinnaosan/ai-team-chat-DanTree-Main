/**
 * DANTREE Track B Move 2 — RUN3 Post-Restart Cache Reset Verification
 * 
 * This script runs AFTER a server restart.
 * _watchRiskScoreCache should be EMPTY (new Map<string, number>() at module load).
 * Therefore, previous_risk_score should NOT be injected into any snapshot.
 * risk_escalation CANNOT fire on this first post-restart run.
 */
import { SchedulerService } from "./server/watchService";
import { buildSignalsFromLiveData } from "./server/liveSignalEngine";
import type { TriggerInput } from "./server/watchlistEngine";

async function realSnapshotProvider(tickers: string[]): Promise<Record<string, TriggerInput>> {
  console.log(`[SNAPSHOT-RUN3] Building for tickers: ${tickers.join(', ')}`);
  try {
    const signals = await buildSignalsFromLiveData(tickers);
    const signalMap = new Map(signals.map(s => [s.ticker, s]));
    const result: Record<string, TriggerInput> = {};
    for (const ticker of tickers) {
      const sig = signalMap.get(ticker);
      if (!sig) {
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
      console.log(`[SNAPSHOT-RUN3] ${ticker}: risk_score=${riskScore.toFixed(4)} macro=${result[ticker].macro_change_detected}`);
    }
    return result;
  } catch (err) {
    console.warn('[SNAPSHOT-RUN3] batch signal build failed:', (err as Error).message);
    return Object.fromEntries(tickers.map(t => [t, { evaluated_at: Date.now() }]));
  }
}

async function main() {
  console.log('\n========== RUN 3 (POST-RESTART — cache should be EMPTY) ==========');
  console.log('[INFO] This is a fresh process — _watchRiskScoreCache = new Map() (empty)');
  console.log('[INFO] previous_risk_score should NOT be injected into any snapshot');
  console.log('[INFO] risk_escalation CANNOT fire on this run (no previous values)');
  
  const run3 = await SchedulerService.batchEvaluateTriggers(
    realSnapshotProvider,
    { batch_size: 3, evaluation_interval_minutes: 0, dry_run: false }
  );
  
  console.log('RUN3 result:', JSON.stringify(run3, null, 2));
  console.log('\n========== RUN3 CACHE RESET VERIFICATION ==========');
  console.log('EXPECTED: risk_escalation NOT fired (cache was empty, no previous_risk_score)');
  console.log('ACTUAL triggers_fired:', run3.triggers_fired);
  
  // Check if any trigger was risk_escalation (would be a bug)
  // Note: macro_change can still fire if AAPL has policy event
  // risk_escalation specifically requires previous_risk_score, which requires cache
  console.log('');
  console.log('NOTE: If triggers_fired > 0, check trigger_type in audit log.');
  console.log('      macro_change firing is OK (does not require cache).');
  console.log('      risk_escalation firing would be a BUG (cache was empty).');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
