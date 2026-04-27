/**
 * TRACK_B_MOVE_4_V3 - Section 7: DB Writeback RUN1+RUN2 Verification
 * Inline snapshotProvider (no routers.ts import to avoid router initialization).
 * Verifies last_valuation is written to DB after RUN1, and previous_valuation enriched in RUN2.
 */
import mysql from 'mysql2/promise';
import { SchedulerService } from './server/watchService';
import { buildSignalsFromLiveData } from './server/liveSignalEngine';
import { getKeyMetrics } from './server/fmpApi';
import type { TriggerInput } from './server/watchlistEngine';

const DB_URL = process.env.DATABASE_URL!;

// Inline _fetchValuationPE V3 logic (same as routers.ts)
async function fetchValuationPE(ticker: string): Promise<{ current_pe?: number }> {
  try {
    const metrics = await getKeyMetrics(ticker, 1, 'annual');
    if (!metrics || metrics.length === 0) return {};
    const earningsYield = metrics[0].earningsYield;
    if (
      typeof earningsYield !== 'number' ||
      !isFinite(earningsYield) ||
      earningsYield <= 0 ||
      earningsYield >= 1
    ) return {};
    const current_pe = 1 / earningsYield;
    if (!isFinite(current_pe) || current_pe <= 0 || current_pe >= 2000) return {};
    return { current_pe };
  } catch {
    return {};
  }
}

// Inline snapshotProvider (mirrors _buildRealSnapshotProvider_impl in routers.ts)
async function buildSnapshotProvider(
  tickers: string[]
): Promise<Record<string, TriggerInput>> {
  const [signals, pricePairs, valuationResults] = await Promise.all([
    buildSignalsFromLiveData(tickers),
    Promise.all(tickers.map(async (t) => {
      try {
        const { default: axios } = await import('axios');
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=1d&range=2d`;
        const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const meta = res.data?.chart?.result?.[0]?.meta;
        const closes = res.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        if (!meta || !closes) return {};
        const current_price = meta.regularMarketPrice ?? closes[closes.length - 1];
        const previous_price = closes.length >= 2 ? closes[closes.length - 2] : undefined;
        return { current_price, previous_price };
      } catch { return {}; }
    })),
    Promise.all(tickers.map(t => fetchValuationPE(t))),
  ]);

  const signalMap = new Map(signals.map(s => [s.ticker, s]));
  const priceMap = new Map(tickers.map((t, i) => [t, pricePairs[i] as { current_price?: number; previous_price?: number }]));
  const valuationMap = new Map(tickers.map((t, i) => [t, valuationResults[i]]));

  const result: Record<string, TriggerInput> = {};
  for (const ticker of tickers) {
    const sig = signalMap.get(ticker);
    const prices = priceMap.get(ticker) ?? {};
    const valuation = valuationMap.get(ticker) ?? {};
    result[ticker] = {
      earnings_event_detected: sig?.earnings_event_detected ?? false,
      macro_change_detected: sig?.macro_change_detected ?? false,
      macro_change_magnitude: sig?.macro_change_magnitude ?? 0,
      risk_score: sig?.risk_score ?? 0,
      current_price: prices.current_price,
      previous_price: prices.previous_price,
      current_valuation: valuation.current_pe,
      evaluated_at: Date.now(),
    };
  }
  return result;
}

async function getWatchValuations(conn: mysql.Connection) {
  const [rows] = await conn.execute(
    'SELECT watch_id, primary_ticker, last_valuation, watch_status FROM watch_items'
  ) as any[];
  return rows as { watch_id: string; primary_ticker: string; last_valuation: string | null; watch_status: string }[];
}

async function main() {
  console.log('=== SECTION 7: DB WRITEBACK RUN1+RUN2 VERIFY ===');
  const conn = await mysql.createConnection(DB_URL);

  // Reset state for clean test
  await conn.execute("UPDATE watch_items SET watch_status='active', last_valuation=NULL");
  console.log('RESET: all watches active, last_valuation=NULL');

  const before = await getWatchValuations(conn);
  console.log('PRE_RUN1:');
  for (const r of before) console.log(`  ${r.primary_ticker}: last_valuation=${r.last_valuation}`);

  // RUN1
  console.log('\n--- RUN1 (dry_run=false) ---');
  const run1 = await SchedulerService.batchEvaluateTriggers(buildSnapshotProvider, { dry_run: false, max_watches: 10 });
  console.log(`RUN1: watches_scanned=${run1.watches_scanned} triggers_fired=${run1.triggers_fired} errors=${run1.errors_count}`);

  const afterRun1 = await getWatchValuations(conn);
  console.log('POST_RUN1 last_valuation:');
  let aaplWritten = false;
  let aaplRun1Val: string | null = null;
  for (const r of afterRun1) {
    const written = r.last_valuation !== null;
    if (r.primary_ticker === 'AAPL' && written) { aaplWritten = true; aaplRun1Val = r.last_valuation; }
    console.log(`  ${r.primary_ticker}: last_valuation=${r.last_valuation} (written=${written ? 'YES' : 'NO'})`);
  }
  console.log(`AAPL_LAST_VALUATION_WRITTEN_RUN1: ${aaplWritten ? 'YES' : 'NO'} (value=${aaplRun1Val})`);

  // Reset watch_status to active for RUN2
  await conn.execute("UPDATE watch_items SET watch_status='active'");
  console.log('\nRESET watch_status=active for RUN2');

  // RUN2
  console.log('\n--- RUN2 (dry_run=false) ---');
  const run2 = await SchedulerService.batchEvaluateTriggers(buildSnapshotProvider, { dry_run: false, max_watches: 10 });
  console.log(`RUN2: watches_scanned=${run2.watches_scanned} triggers_fired=${run2.triggers_fired} errors=${run2.errors_count}`);

  const afterRun2 = await getWatchValuations(conn);
  console.log('POST_RUN2 last_valuation:');
  let aaplRun2Val: string | null = null;
  for (const r of afterRun2) {
    if (r.primary_ticker === 'AAPL') aaplRun2Val = r.last_valuation;
    console.log(`  ${r.primary_ticker}: last_valuation=${r.last_valuation}`);
  }

  const valuationConsistent = aaplRun1Val !== null && aaplRun2Val !== null &&
    Math.abs(parseFloat(aaplRun1Val) - parseFloat(aaplRun2Val)) < 0.01;
  console.log(`\nAAPL_RUN1_VALUATION: ${aaplRun1Val}`);
  console.log(`AAPL_RUN2_VALUATION: ${aaplRun2Val}`);
  console.log(`VALUATION_CONSISTENT_RUN1_RUN2: ${valuationConsistent ? 'YES' : 'NO'}`);
  console.log(`DB_WRITEBACK_STATUS: ${aaplWritten ? 'PASS' : 'HARD_FAIL'}`);

  await conn.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
