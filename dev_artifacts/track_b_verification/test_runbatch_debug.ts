/**
 * Track B Move 1.5: Debug run — find exact error during AAPL evaluation
 * Directly calls evaluateSingleWatch to capture the error
 */

import { TriggerEvaluationService, WatchService, SchedulerService } from './server/watchService';
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
      macro_change_detected:
        sig.event_signal.type === 'policy' ||
        Math.abs(sig.signals.macro_exposure) >= 0.5,
      macro_change_magnitude: Math.abs(sig.signals.macro_exposure),
      evaluated_at: Date.now(),
    }];
  }));
}

async function main() {
  console.log('=== Track B Move 1.5: Debug Run ===');
  console.log('Finding exact error during AAPL evaluation\n');

  // Get AAPL watch item
  // Use SchedulerService internal path - get watches via direct DB query
  const mysql2 = await import('mysql2/promise');
  const url = new URL(process.env.DATABASE_URL!);
  const conn = await mysql2.createConnection({
    host: url.hostname, port: parseInt(url.port||'3306'),
    user: url.username, password: url.password,
    database: url.pathname.slice(1), ssl: {rejectUnauthorized: false}
  });
  const [watchRows] = await conn.execute('SELECT * FROM watch_items WHERE watch_status = ? AND primary_ticker = ?', ['active', 'AAPL']) as any;
  await conn.end();
  const rawWatch = watchRows[0];
  if (!rawWatch) { console.error('AAPL watch not found'); process.exit(1); }
  
  // Map to WatchItemRow format (camelCase)
  const aaplWatch = {
    watchId: rawWatch.watch_id,
    userId: rawWatch.user_id,
    primaryTicker: rawWatch.primary_ticker,
    watchType: rawWatch.watch_type,
    watchStatus: rawWatch.watch_status,
    currentActionBias: rawWatch.current_action_bias,
    thesisSummary: rawWatch.thesis_summary,
    triggerConditions: rawWatch.trigger_conditions ?? [],
    riskConditions: rawWatch.risk_conditions ?? [],
    priority: rawWatch.priority ?? 'medium',
    linkedMemoryIds: rawWatch.linked_memory_ids ?? [],
    linkedLoopIds: rawWatch.linked_loop_ids ?? [],
    notes: rawWatch.notes ?? '',
    lastEvaluatedAt: rawWatch.last_evaluated_at,
    lastTriggeredAt: rawWatch.last_triggered_at,
    createdAt: rawWatch.created_at,
    updatedAt: rawWatch.updated_at,
  };
  
  if (!aaplWatch) {
    console.error('AAPL watch not found');
    process.exit(1);
  }
  
  console.log('AAPL watch_id:', aaplWatch.watchId);
  console.log('trigger_conditions:', JSON.stringify(aaplWatch.triggerConditions));
  console.log('');

  // Get snapshot for AAPL
  console.log('Building snapshot for AAPL...');
  const snapshots = await realSnapshotProvider(['AAPL']);
  const aaplSnapshot = snapshots['AAPL'];
  console.log('AAPL snapshot:', JSON.stringify(aaplSnapshot, null, 2));
  console.log('');

  // Call evaluateSingleWatch directly with dry_run=false
  console.log('Calling evaluateSingleWatch (dry_run=false)...');
  try {
    const result = await TriggerEvaluationService.evaluateSingleWatch(
      aaplWatch,
      aaplSnapshot,
      'debug_run_001',
      false  // dry_run = false
    );
    console.log('=== RESULT ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('=== ERROR CAUGHT ===');
    console.error('Message:', (err as Error).message);
    console.error('Stack:', (err as Error).stack);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
