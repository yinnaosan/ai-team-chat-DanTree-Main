/**
 * TRACK_B_MOVE_4_VALUATION_SHIFT_SYNC_VERIFY_V1 — Sections 6-7
 * Verifies: snapshot current_valuation + DB writeback + second run previous_valuation
 */
import { buildSignalsFromLiveData } from "./server/liveSignalEngine";
import { SchedulerService } from "./server/watchService";
import { WatchRepository } from "./server/watchRepository";
import mysql from "mysql2/promise";

async function _fetchYahooPrices(ticker: string): Promise<{ current_price?: number; previous_price?: number; current_pe?: number }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DanTree/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    const json = await res.json() as {
      chart?: { result?: Array<{
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        meta?: { trailingPE?: number };
      }> }
    };
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes)) return {};
    const validCloses = closes.filter((v): v is number => typeof v === 'number' && !isNaN(v));
    if (validCloses.length < 2) return {};
    const rawPE = json?.chart?.result?.[0]?.meta?.trailingPE;
    const current_pe = (typeof rawPE === 'number' && rawPE > 0 && rawPE < 2000) ? rawPE : undefined;
    return {
      current_price:  validCloses[validCloses.length - 1],
      previous_price: validCloses[validCloses.length - 2],
      current_pe,
    };
  } catch { return {}; }
}

async function buildSnapshotProvider(tickers: string[]): Promise<Record<string, import("./server/watchlistEngine").TriggerInput>> {
  const [signals, ...pricePairs] = await Promise.all([
    buildSignalsFromLiveData(tickers),
    ...tickers.map(t => _fetchYahooPrices(t)),
  ]);
  const signalMap = new Map((signals as {ticker: string; signals: {price_momentum: number; volatility: number; macro_exposure: number}; event_signal: {type: string}}[]).map(s => [s.ticker, s]));
  const priceMap = new Map(tickers.map((t, i) => [t, pricePairs[i] as { current_price?: number; previous_price?: number; current_pe?: number }]));
  return Object.fromEntries(tickers.map(ticker => {
    const sig = signalMap.get(ticker);
    const prices = priceMap.get(ticker) ?? {};
    if (!sig) return [ticker, { ...prices, current_valuation: prices.current_pe, evaluated_at: Date.now() }];
    const riskScore = Math.max(0, Math.min(1, 0.5 * Math.abs(sig.signals.price_momentum) + 0.5 * sig.signals.volatility));
    return [ticker, {
      risk_score: riskScore,
      earnings_event_detected: sig.event_signal.type === 'earnings',
      macro_change_detected: sig.event_signal.type === 'policy' || Math.abs(sig.signals.macro_exposure) >= 0.5,
      macro_change_magnitude: Math.abs(sig.signals.macro_exposure),
      current_price: prices.current_price,
      previous_price: prices.previous_price,
      current_valuation: prices.current_pe,  // B4
      evaluated_at: Date.now(),
    }];
  }));
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // Reset watches to active
  await conn.execute("UPDATE watch_items SET watch_status='active', last_valuation=NULL WHERE watch_status IN ('triggered','active')");

  // Section 6: Snapshot verification
  const tickers = ['AAPL', '1810.HK', '600916.SS'];
  const snapshots = await buildSnapshotProvider(tickers);
  console.log("\n=== SECTION 6: SNAPSHOT VERIFY ===");
  for (const ticker of tickers) {
    const s = snapshots[ticker] as Record<string, unknown>;
    const pe = s.current_valuation;
    const reason = pe === undefined ? (ticker.includes('.HK') || ticker.includes('.SS') ? 'YAHOO_PE_UNAVAILABLE' : 'YAHOO_PE_UNAVAILABLE') : 'N/A';
    console.log(`SNAPSHOT_${ticker}: current_price=${s.current_price} previous_price=${s.previous_price} current_valuation=${pe} valuation_present=${pe !== undefined ? 'YES' : 'NO'} reason=${reason}`);
  }

  // Section 7: DB writeback - RUN1
  console.log("\n=== SECTION 7: DB WRITEBACK - RUN1 ===");
  const [beforeRows] = await conn.execute("SELECT watch_id, primary_ticker, last_valuation FROM watch_items WHERE watch_status='active' ORDER BY primary_ticker") as [Array<{watch_id: string; primary_ticker: string; last_valuation: string | null}>, unknown];
  for (const r of beforeRows) {
    console.log(`BEFORE: watch_id=${r.watch_id} ticker=${r.primary_ticker} last_valuation=${r.last_valuation}`);
  }

  const run1 = await SchedulerService.batchEvaluateTriggers(buildSnapshotProvider, { batch_size: 4, dry_run: false });
  console.log(`RUN1: run_id=${run1.run_id} scanned=${run1.watches_scanned} errors=${run1.errors_count}`);

  const [afterRows] = await conn.execute("SELECT watch_id, primary_ticker, last_valuation FROM watch_items ORDER BY primary_ticker") as [Array<{watch_id: string; primary_ticker: string; last_valuation: string | null}>, unknown];
  for (const r of afterRows) {
    console.log(`AFTER_RUN1: watch_id=${r.watch_id} ticker=${r.primary_ticker} last_valuation=${r.last_valuation}`);
  }

  // Section 7: RUN2 - verify previous_valuation is read from DB
  console.log("\n=== SECTION 7: RUN2 (previous_valuation from DB) ===");
  await conn.execute("UPDATE watch_items SET watch_status='active' WHERE watch_status='triggered'");
  const run2 = await SchedulerService.batchEvaluateTriggers(buildSnapshotProvider, { batch_size: 4, dry_run: false });
  console.log(`RUN2: run_id=${run2.run_id} scanned=${run2.watches_scanned} errors=${run2.errors_count}`);
  const [afterRun2] = await conn.execute("SELECT watch_id, primary_ticker, last_valuation FROM watch_items ORDER BY primary_ticker") as [Array<{watch_id: string; primary_ticker: string; last_valuation: string | null}>, unknown];
  for (const r of afterRun2) {
    console.log(`AFTER_RUN2: watch_id=${r.watch_id} ticker=${r.primary_ticker} last_valuation=${r.last_valuation}`);
  }

  await conn.end();
  console.log("\nVERIFY_COMPLETE");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
