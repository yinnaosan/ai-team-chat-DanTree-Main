/**
 * TRACK_B_MOVE_4_V2 - Section 6: FMP Valuation Runtime Verification
 * Tests _fetchValuationPE logic directly using FMP getQuote().pe
 * Tickers: AAPL, MSFT, 1810.HK, 600916.SS
 */
import { getQuote } from './server/fmpApi';

const TICKERS = ['AAPL', 'MSFT', '1810.HK', '600916.SS'];

async function fetchValuationPE(ticker: string): Promise<{ current_pe?: number; reason?: string }> {
  try {
    const quote = await getQuote(ticker);
    if (!quote) return { reason: 'FMP_RETURNED_NULL' };
    const pe = quote.pe;
    if (typeof pe !== 'number') return { reason: 'PE_FIELD_NULL' };
    if (!isFinite(pe)) return { reason: 'PE_INVALID' };
    if (pe <= 0 || pe >= 2000) return { reason: 'PE_INVALID' };
    return { current_pe: pe };
  } catch (err) {
    return { reason: 'FMP_FETCH_FAILED' };
  }
}

async function main() {
  console.log('=== SECTION 6: FMP VALUATION RUNTIME VERIFY ===');
  const results: Record<string, { current_pe?: number; reason?: string }> = {};
  
  for (const ticker of TICKERS) {
    const result = await fetchValuationPE(ticker);
    results[ticker] = result;
    const present = result.current_pe !== undefined;
    console.log(`VALUATION_SAMPLE_${ticker.replace('.', '_')}: current_valuation=${result.current_pe ?? 'undefined'} valuation_present=${present ? 'YES' : 'NO'} source=FMP_getQuote_pe${result.reason ? ` failure_reason=${result.reason}` : ''}`);
  }
  
  const usAvailable = (results['AAPL']?.current_pe !== undefined) || (results['MSFT']?.current_pe !== undefined);
  console.log(`US_VALUATION_AVAILABLE: ${usAvailable ? 'YES' : 'NO'}`);
  console.log(`FMP_VALUATION_RUNTIME_STATUS: ${usAvailable ? 'PASS' : 'HARD_FAIL'}`);
  
  if (!usAvailable) {
    console.log('HARD_FAIL_REASON: Both AAPL and MSFT returned undefined current_valuation from FMP');
    process.exit(1);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
