/**
 * Track B Move 1.5: Real Run Verification
 * Calls batchEvaluateTriggers with dry_run=false, batchSize=3
 * This is a REAL run — it will write to DB if triggers fire.
 * 
 * Run with: npx tsx test_runbatch_real.ts
 */

import { SchedulerService } from './server/watchService';

// Import the real snapshotProvider (same as _buildRealSnapshotProvider_impl in routers.ts)
import { buildSignalsFromLiveData } from './server/liveSignalEngine';
import type { TriggerInput } from './server/watchlistEngine';

async function realSnapshotProvider(tickers: string[]): Promise<Record<string, TriggerInput>> {
  try {
    const signals = await buildSignalsFromLiveData(tickers);
    const signalMap = new Map(signals.map(s => [s.ticker, s]));
    return Object.fromEntries(tickers.map(ticker => {
      const sig = signalMap.get(ticker);
      if (!sig) return [ticker, { evaluated_at: Date.now() }];
      const riskScore = Math.max(0, Math.min(1,
        0.5 * Math.abs(sig.signals.price_momentum) + 0.5 * sig.signals.volatility
      ));
      return [ticker, {
        risk_score: riskScore,
        earnings_event_detected: sig.event_signal.type === 'earnings',
        macro_change_detected:
          sig.event_signal.type === 'policy' ||
          Math.abs(sig.signals.macro_exposure) >= 0.5,
        macro_change_magnitude: Math.abs(sig.signals.macro_exposure),
        evaluated_at: Date.now(),
      }];
    }));
  } catch (err) {
    console.warn('[B1] snapshotProvider signal build failed (non-fatal):', (err as Error).message);
    return Object.fromEntries(tickers.map(t => [t, { evaluated_at: Date.now() }]));
  }
}

async function main() {
  console.log('=== Track B Move 1.5: REAL RUN VERIFICATION ===');
  console.log('dry_run: false | batchSize: 3');
  console.log('Timestamp:', new Date().toISOString());
  console.log('');

  const startTime = Date.now();
  
  try {
    const result = await SchedulerService.batchEvaluateTriggers(
      realSnapshotProvider,
      { dry_run: false, batch_size: 3 }
    );
    
    const elapsed = Date.now() - startTime;
    
    console.log('=== RESULT PAYLOAD ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    console.log(`Elapsed: ${elapsed}ms`);
    
    // Summary
    console.log('=== SUMMARY ===');
    console.log(`run_id: ${result.run_id}`);
    console.log(`watches_scanned: ${result.watches_scanned}`);
    console.log(`triggers_fired: ${result.triggers_fired}`);
    console.log(`actions_created: ${result.actions_created}`);
    console.log(`alerts_created: ${result.alerts_created}`);
    console.log(`errors: ${result.errors}`);
    console.log(`aborted_early: ${result.aborted_early}`);
    console.log(`dry_run: ${result.dry_run}`);
    
  } catch (err) {
    console.error('=== RUN FAILED ===');
    console.error((err as Error).message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
