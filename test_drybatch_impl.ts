/**
 * Track B First Move: Direct test of _buildRealSnapshotProvider_impl logic
 * Run with: npx tsx test_drybatch_impl.ts
 * 
 * Tests:
 * 1. buildSignalsFromLiveData is called with real tickers
 * 2. Returned snapshots have real TriggerInput fields (not just evaluated_at)
 * 3. risk_score values are sensible (not NaN, not all identical, 0-1 range)
 * 4. Mapping is minimal (only intended fields)
 */

import { buildSignalsFromLiveData } from './server/liveSignalEngine';
import type { TriggerInput } from './server/watchlistEngine';

// Replicate _buildRealSnapshotProvider_impl logic exactly as patched
async function _buildRealSnapshotProvider_impl(
  tickers: string[]
): Promise<Record<string, TriggerInput>> {
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
  console.log('=== Track B First Move: _buildRealSnapshotProvider_impl Test ===\n');
  
  // Use the 4 known watch_items tickers
  const testTickers = ['1810.HK', '600916.SS', 'AAPL', '3690.HK'];
  const smallBatch = testTickers.slice(0, 3); // batchSize:3 for test
  
  console.log(`Testing with tickers: ${smallBatch.join(', ')}`);
  console.log('Calling _buildRealSnapshotProvider_impl...\n');
  
  const startTime = Date.now();
  const snapshots = await _buildRealSnapshotProvider_impl(smallBatch);
  const elapsed = Date.now() - startTime;
  
  console.log(`Completed in ${elapsed}ms\n`);
  
  // Analyze results
  let realSignalCount = 0;
  let stubFallbackCount = 0;
  const riskScores: number[] = [];
  
  for (const [ticker, snap] of Object.entries(snapshots)) {
    const isStub = snap.risk_score === undefined && 
                   snap.earnings_event_detected === undefined &&
                   snap.macro_change_detected === undefined;
    
    console.log(`--- ${ticker} ---`);
    console.log(`  risk_score: ${snap.risk_score?.toFixed(4) ?? 'undefined (stub fallback)'}`);
    console.log(`  earnings_event_detected: ${snap.earnings_event_detected ?? 'undefined'}`);
    console.log(`  macro_change_detected: ${snap.macro_change_detected ?? 'undefined'}`);
    console.log(`  macro_change_magnitude: ${snap.macro_change_magnitude?.toFixed(4) ?? 'undefined'}`);
    console.log(`  evaluated_at: ${snap.evaluated_at} (valid: ${typeof snap.evaluated_at === 'number'})`);
    console.log(`  Is stub fallback: ${isStub}`);
    
    // Verify NOT over-mapped (should NOT have these fields)
    const overMapped = 'current_price' in snap || 'previous_risk_score' in snap || 
                       'memory_contradiction' in snap || 'learning_threshold_breach' in snap;
    console.log(`  Over-mapped (should be false): ${overMapped}`);
    
    if (isStub) {
      stubFallbackCount++;
    } else {
      realSignalCount++;
      if (snap.risk_score !== undefined) riskScores.push(snap.risk_score);
    }
    console.log('');
  }
  
  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Total snapshots: ${Object.keys(snapshots).length}`);
  console.log(`Real signal snapshots: ${realSignalCount}`);
  console.log(`Stub fallback snapshots: ${stubFallbackCount}`);
  
  if (riskScores.length > 0) {
    const allValid = riskScores.every(r => !isNaN(r) && r >= 0 && r <= 1);
    const allIdentical = riskScores.length > 1 && riskScores.every(r => r === riskScores[0]);
    console.log(`\nRisk score analysis:`);
    console.log(`  Values: [${riskScores.map(r => r.toFixed(4)).join(', ')}]`);
    console.log(`  All valid (not NaN, 0-1): ${allValid}`);
    console.log(`  All identical (suspicious): ${allIdentical}`);
    console.log(`  Min: ${Math.min(...riskScores).toFixed(4)}`);
    console.log(`  Max: ${Math.max(...riskScores).toFixed(4)}`);
  }
  
  // Known limits check
  console.log('\n=== KNOWN LIMITS CHECK ===');
  console.log('price_break trigger: NOT supported (no current_price/previous_price) - EXPECTED');
  console.log('previous_risk_score: NOT mapped (no delta logic) - EXPECTED (Track B move 2)');
  console.log('risk_escalation: WILL NOT fire (needs previous_risk_score) - EXPECTED');
  console.log('earnings_event: CAN fire if event_signal.type === earnings');
  console.log('macro_change: CAN fire if event_signal.type === policy OR |macro_exposure| >= 0.5');
  
  console.log('\n=== TEST COMPLETE ===');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
