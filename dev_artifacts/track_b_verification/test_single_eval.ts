/**
 * Track B Move 1.5: Test evaluateSingleWatch directly with error capture
 * This replicates exactly what batchEvaluateTriggers does for AAPL
 */
import { TriggerEvaluationService } from './server/watchService';
import { buildSignalsFromLiveData } from './server/liveSignalEngine';
import type { TriggerInput } from './server/watchlistEngine';
import mysql2 from 'mysql2/promise';

async function main() {
  console.log('=== Single Watch Eval Debug ===');
  
  // Get AAPL watch row from DB
  const url = new URL(process.env.DATABASE_URL!);
  const conn = await mysql2.createConnection({
    host: url.hostname, port: parseInt(url.port || '3306'),
    user: url.username, password: url.password,
    database: url.pathname.slice(1), ssl: { rejectUnauthorized: false }
  });
  const [rows] = await conn.execute('SELECT * FROM watch_items WHERE primary_ticker = ?', ['AAPL']) as any;
  await conn.end();
  
  const raw = rows[0];
  console.log('AAPL watch_status:', raw.watch_status);
  console.log('AAPL last_triggered_at:', raw.last_triggered_at);
  
  // Build WatchItemRow (camelCase)
  const watchRow = {
    watchId: raw.watch_id,
    userId: raw.user_id,
    primaryTicker: raw.primary_ticker,
    watchType: raw.watch_type,
    watchStatus: raw.watch_status,
    currentActionBias: raw.current_action_bias,
    thesisSummary: raw.thesis_summary,
    triggerConditions: raw.trigger_conditions ?? [],
    riskConditions: raw.risk_conditions ?? [],
    priority: raw.priority ?? 'medium',
    linkedMemoryIds: raw.linked_memory_ids ?? [],
    linkedLoopIds: raw.linked_loop_ids ?? [],
    notes: raw.notes ?? '',
    lastEvaluatedAt: raw.last_evaluated_at,
    lastTriggeredAt: raw.last_triggered_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
  
  // Build snapshot
  console.log('\nBuilding AAPL snapshot...');
  const signals = await buildSignalsFromLiveData(['AAPL']);
  const sig = signals[0];
  const riskScore = Math.max(0, Math.min(1,
    0.5 * Math.abs(sig.signals.price_momentum) + 0.5 * sig.signals.volatility
  ));
  const snapshot: TriggerInput = {
    risk_score: riskScore,
    earnings_event_detected: sig.event_signal.type === 'earnings',
    macro_change_detected: sig.event_signal.type === 'policy' || Math.abs(sig.signals.macro_exposure) >= 0.5,
    macro_change_magnitude: Math.abs(sig.signals.macro_exposure),
    evaluated_at: Date.now(),
  };
  console.log('Snapshot:', JSON.stringify(snapshot));
  
  // Call evaluateSingleWatch with dry_run=true first to see what would happen
  console.log('\n--- dry_run=true ---');
  try {
    const dryResult = await TriggerEvaluationService.evaluateSingleWatch(
      watchRow, snapshot, 'debug_dry_001', true
    );
    console.log('dry result:', JSON.stringify(dryResult, null, 2));
  } catch (err) {
    console.error('DRY ERROR:', (err as Error).message);
    console.error('STACK:', (err as Error).stack?.split('\n').slice(0, 8).join('\n'));
  }
  
  // Now with dry_run=false
  console.log('\n--- dry_run=false ---');
  try {
    const realResult = await TriggerEvaluationService.evaluateSingleWatch(
      watchRow, snapshot, 'debug_real_001', false
    );
    console.log('real result:', JSON.stringify(realResult, null, 2));
  } catch (err) {
    console.error('REAL ERROR:', (err as Error).message);
    console.error('STACK:', (err as Error).stack?.split('\n').slice(0, 10).join('\n'));
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
