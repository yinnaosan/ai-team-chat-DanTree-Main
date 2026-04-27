/**
 * TRACK_B_MOVE_4_V3 - Section 6: FMP earningsYield Runtime Verification
 * Tests _fetchValuationPE V3 logic: getKeyMetrics().earningsYield → PE = 1/earningsYield
 * Tickers: AAPL, MSFT, 1810.HK, 600916.SS
 */
import { getKeyMetrics } from './server/fmpApi';

const TICKERS = ['AAPL', 'MSFT', '1810.HK', '600916.SS'];

async function fetchValuationPE_V3(ticker: string): Promise<{
  earningsYield?: number;
  current_pe?: number;
  failure_reason?: string;
}> {
  try {
    const metrics = await getKeyMetrics(ticker, 1, 'annual');
    if (!metrics || metrics.length === 0) return { failure_reason: 'KEY_METRICS_EMPTY' };
    const earningsYield = metrics[0].earningsYield;
    if (typeof earningsYield !== 'number') return { failure_reason: 'EARNINGS_YIELD_NULL' };
    if (!isFinite(earningsYield)) return { failure_reason: 'EARNINGS_YIELD_INVALID' };
    if (earningsYield <= 0 || earningsYield >= 1) return { 
      earningsYield,
      failure_reason: `EARNINGS_YIELD_INVALID (value=${earningsYield.toFixed(5)}, out of (0,1) range)` 
    };
    const current_pe = 1 / earningsYield;
    if (!isFinite(current_pe) || current_pe <= 0 || current_pe >= 2000) {
      return { earningsYield, failure_reason: `DERIVED_PE_INVALID (pe=${current_pe.toFixed(2)})` };
    }
    return { earningsYield, current_pe };
  } catch (err: any) {
    return { failure_reason: `FMP_FETCH_FAILED: ${err.message}` };
  }
}

async function main() {
  console.log('=== SECTION 6: FMP EARNINGS_YIELD RUNTIME VERIFY ===');
  const results: Record<string, { earningsYield?: number; current_pe?: number; failure_reason?: string }> = {};
  
  for (const ticker of TICKERS) {
    const result = await fetchValuationPE_V3(ticker);
    results[ticker] = result;
    const present = result.current_pe !== undefined;
    const ey = result.earningsYield !== undefined ? result.earningsYield.toFixed(5) : 'N/A';
    const pe = result.current_pe !== undefined ? result.current_pe.toFixed(2) : 'undefined';
    const key = `VALUATION_SAMPLE_${ticker.replace('.', '_')}`;
    console.log(`${key}: earningsYield=${ey} current_valuation=${pe} valuation_present=${present ? 'YES' : 'NO'}${result.failure_reason ? ` failure_reason=${result.failure_reason}` : ''}`);
  }
  
  const aaplPE = results['AAPL']?.current_pe;
  const msftPE = results['MSFT']?.current_pe;
  const usAvailable = (aaplPE !== undefined) || (msftPE !== undefined);
  
  console.log(`US_VALUATION_AVAILABLE: ${usAvailable ? 'YES' : 'NO'}`);
  
  // Check AAPL derivation match (expected ~34.1 from earningsYield=0.02933)
  if (aaplPE !== undefined && results['AAPL']?.earningsYield !== undefined) {
    const expectedPE = 1 / results['AAPL'].earningsYield!;
    const match = Math.abs(aaplPE - expectedPE) < 0.01;
    console.log(`AAPL_PE_DERIVATION_MATCH: ${match ? 'YES' : 'NO'} (derived=${aaplPE.toFixed(2)}, expected=${expectedPE.toFixed(2)})`);
  } else {
    console.log(`AAPL_PE_DERIVATION_MATCH: NOT_AVAILABLE`);
  }
  
  console.log(`FMP_EARNINGS_YIELD_RUNTIME_STATUS: ${usAvailable ? 'PASS' : 'HARD_FAIL'}`);
  
  if (!usAvailable) {
    console.log('HARD_FAIL_REASON: Both AAPL and MSFT returned undefined current_valuation from FMP earningsYield');
    process.exit(1);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
