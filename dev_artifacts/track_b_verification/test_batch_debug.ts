/**
 * Track B Move 1.5: Replicate batchEvaluateTriggers with detailed error logging
 * to find the exact source of errors_count:1
 */
import { TriggerEvaluationService } from './server/watchService';
import { WatchRepository, SchedulerRunRepository } from './server/watchRepository';
import { buildSignalsFromLiveData } from './server/liveSignalEngine';
import type { TriggerInput } from './server/watchlistEngine';

async function realSnapshotProvider(tickers: string[]): Promise<Record<string, TriggerInput>> {
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
      macro_change_detected: sig.event_signal.type === 'policy' || Math.abs(sig.signals.macro_exposure) >= 0.5,
      macro_change_magnitude: Math.abs(sig.signals.macro_exposure),
      evaluated_at: Date.now(),
    }];
  }));
}

async function main() {
  console.log('=== Batch Debug: Replicate batchEvaluateTriggers ===');
  console.log('Timestamp:', new Date().toISOString());
  
  // Step 1: Get active watches
  console.log('\n[STEP 1] listActiveWatches...');
  const activeWatches = await WatchRepository.listActiveWatches();
  console.log('Active watches:', activeWatches.map(w => `${w.primaryTicker}(${w.watchStatus})`).join(', '));
  
  const batch = activeWatches.slice(0, 3);
  console.log('Batch (first 3):', batch.map(w => w.primaryTicker).join(', '));
  
  // Step 2: Build snapshots
  console.log('\n[STEP 2] Building snapshots...');
  const tickerSet = new Set(batch.map(w => w.primaryTicker));
  const tickers = Array.from(tickerSet);
  console.log('Tickers:', tickers.join(', '));
  const snapshots = await realSnapshotProvider(tickers);
  console.log('Snapshots built:', Object.keys(snapshots).join(', '));
  
  // Step 3: Create run
  console.log('\n[STEP 3] Creating scheduler run...');
  const runRow = await SchedulerRunRepository.createRun(false);
  console.log('Run ID:', runRow.runId);
  
  // Step 4: Evaluate each watch
  let errorsCount = 0;
  for (const watch of batch) {
    console.log(`\n[EVAL] ${watch.primaryTicker} (watchId=${watch.watchId}, status=${watch.watchStatus})`);
    try {
      const snapshot: TriggerInput = snapshots[watch.primaryTicker] ?? { evaluated_at: Date.now() };
      console.log(`  snapshot: macro_change_detected=${snapshot.macro_change_detected}, risk_score=${snapshot.risk_score}`);
      
      const evalResult = await TriggerEvaluationService.evaluateSingleWatch(
        watch, snapshot, runRow.runId, false
      );
      console.log(`  result: triggered=${evalResult.triggered}, reason=${evalResult.evaluation_reason}, skipped=${evalResult.skipped}`);
      if (evalResult.triggered) {
        console.log(`  TRIGGERED! action_id=${evalResult.action_id}, alert_created=${evalResult.alert_created}`);
      }
    } catch (err) {
      errorsCount++;
      console.error(`  ERROR for ${watch.primaryTicker}:`, (err as Error).message);
      console.error('  STACK:', (err as Error).stack?.split('\n').slice(0, 10).join('\n  '));
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('errors_count:', errorsCount);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
