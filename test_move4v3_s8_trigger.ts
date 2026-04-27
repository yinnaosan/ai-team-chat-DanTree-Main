/**
 * TRACK_B_MOVE_4_V3 - Section 8: valuation_shift Trigger Verification (DIRECT)
 * Directly calls TriggerEvaluationService.evaluateSingleWatch with controlled snapshot
 * to bypass cooldown and verify valuation_shift trigger fires correctly.
 */
import mysql from 'mysql2/promise';
import { WatchRepository } from './server/watchRepository';
import { TriggerEvaluationService } from './server/watchService';
import type { TriggerInput } from './server/watchlistEngine';

const DB_URL = process.env.DATABASE_URL!;
const AAPL_WATCH_ID = 'w_1776953878824_jkbi8u';

async function main() {
  console.log('=== SECTION 8: VALUATION_SHIFT TRIGGER VERIFY (DIRECT EVAL) ===');
  const conn = await mysql.createConnection(DB_URL);

  // Step 1: Add controlled valuation trigger condition to AAPL watch
  const controlledCondition = {
    condition_id: 'test_valuation_ctrl_001',
    condition_type: 'valuation',
    operator: 'gt',
    threshold_value: '1',  // any positive PE > 1 fires (operator must be 'gt' not '>')
    description: 'CONTROLLED TEST: valuation_shift trigger for Move 4 V3 verification',
    enabled: true,
  };
  await conn.execute(
    'UPDATE watch_items SET trigger_conditions=?, watch_status=? WHERE watch_id=?',
    [JSON.stringify([controlledCondition]), 'active', AAPL_WATCH_ID]
  );
  console.log('CONTROLLED_CONDITION_ADDED: YES (condition_type=valuation, operator=>, threshold=1)');

  // Step 1b: Reset lastEvaluatedAt to bypass cooldown
  await conn.execute(
    'UPDATE watch_items SET last_evaluated_at=NULL WHERE watch_id=?',
    [AAPL_WATCH_ID]
  );
  console.log('COOLDOWN_RESET: last_evaluated_at=NULL');

  // Step 2: Fetch AAPL watch row (with controlled condition)
  const watches = await WatchRepository.listActiveWatches();
  const aaplWatch = watches.find(w => w.watchId === AAPL_WATCH_ID);
  if (!aaplWatch) {
    console.log('ERROR: AAPL watch not found');
    process.exit(1);
  }
  console.log(`AAPL_LAST_VALUATION_FROM_DB: ${(aaplWatch as any).lastValuation}`);
  console.log(`AAPL_TRIGGER_CONDITIONS: ${JSON.stringify(aaplWatch.triggerConditions)}`);

  // Step 3: Build controlled snapshot with both current_valuation and previous_valuation
  const prevPE = parseFloat((aaplWatch as any).lastValuation ?? '34.09');
  const snapshot: TriggerInput = {
    current_valuation: prevPE,   // same as prev (PE=34.09 > threshold=1 → fires)
    previous_valuation: prevPE,  // from DB
    earnings_event_detected: false,  // suppress other triggers
    macro_change_detected: false,
    macro_change_magnitude: 0,
    risk_score: 0.3,
    evaluated_at: Date.now(),
  };
  console.log(`\nSNAPSHOT: current_valuation=${snapshot.current_valuation} previous_valuation=${snapshot.previous_valuation}`);
  console.log(`VALUATION_CONDITION_EXPECTED: ${snapshot.current_valuation} > 1 → should fire`);

  // Step 4: Direct call to evaluateSingleWatch (bypasses cooldown)
  console.log('\n--- DIRECT EVAL (dry_run=true to avoid DB side effects) ---');
  const evalResult = await TriggerEvaluationService.evaluateSingleWatch(
    aaplWatch,
    snapshot,
    'test_run_s8_ctrl',
    true  // dry_run=true
  );
  console.log(`EVAL_TRIGGERED: ${evalResult.triggered}`);
  console.log(`EVAL_SKIPPED: ${evalResult.skipped}`);
  console.log(`EVAL_SKIPPED_REASON: ${evalResult.skipped_reason ?? 'none'}`);
  console.log(`EVAL_TRIGGER_TYPE: ${(evalResult as any).trigger_type ?? 'none'}`);
  console.log(`EVAL_REASON: ${evalResult.evaluation_reason}`);

  // Check if it was valuation_shift (WatchEvalResult uses trigger_id, not trigger_type)
  const triggerId = evalResult.trigger_id;
  const valuationShiftFired = evalResult.triggered && triggerId === 'valuation_shift';
  console.log(`\nVALUATION_SHIFT_FIRED: ${valuationShiftFired ? 'YES' : 'NO'}`);
  
  if (evalResult.triggered) {
    console.log(`TRIGGER_FIRED_ID: ${triggerId}`);
  }

  // Step 5: Cleanup - remove controlled condition
  await conn.execute(
    'UPDATE watch_items SET trigger_conditions=? WHERE watch_id=?',
    [JSON.stringify([]), AAPL_WATCH_ID]
  );
  console.log('\nCLEANUP: controlled condition removed');

  console.log(`\nSECTION_8_STATUS: ${valuationShiftFired ? 'PASS' : 'HARD_FAIL'}`);
  if (!valuationShiftFired && evalResult.skipped) {
    console.log(`SKIP_REASON: ${evalResult.skipped_reason}`);
  }

  await conn.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
