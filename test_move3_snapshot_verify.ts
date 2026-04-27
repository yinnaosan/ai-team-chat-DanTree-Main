/**
 * DANTREE_TRACK_B_MOVE_3 — Snapshot Verification Test
 * Verifies: _fetchYahooPrices works, current_price/previous_price present in snapshots
 * Also runs dryRunBatch to capture full run result
 */
import { buildSignalsFromLiveData } from "./server/liveSignalEngine";
import { SchedulerService } from "./server/watchService";
import mysql from "mysql2/promise";

// ── Replicate _fetchYahooPrices exactly as patched in routers.ts ──────────────
async function _fetchYahooPrices(ticker: string): Promise<{ current_price?: number; previous_price?: number }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DanTree/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.log(`[Yahoo] ${ticker}: HTTP ${res.status} — returning {}`);
      return {};
    }
    const json = await res.json() as {
      chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> }
    };
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes)) {
      console.log(`[Yahoo] ${ticker}: no closes array — returning {}`);
      return {};
    }
    const validCloses = closes.filter((v): v is number => typeof v === 'number' && !isNaN(v));
    if (validCloses.length < 2) {
      console.log(`[Yahoo] ${ticker}: only ${validCloses.length} valid closes — returning {}`);
      return {};
    }
    const result = {
      current_price:  validCloses[validCloses.length - 1],
      previous_price: validCloses[validCloses.length - 2],
    };
    console.log(`[Yahoo] ${ticker}: current_price=${result.current_price} previous_price=${result.previous_price} (from ${validCloses.length} closes)`);
    return result;
  } catch (e) {
    console.log(`[Yahoo] ${ticker}: exception — ${(e as Error).message} — returning {}`);
    return {};
  }
}

// ── Build full snapshot (mirrors patched _buildRealSnapshotProvider_impl) ─────
async function buildSnapshotProvider(tickers: string[]): Promise<Record<string, import("./server/watchlistEngine").TriggerInput>> {
  const [signals, ...pricePairs] = await Promise.all([
    buildSignalsFromLiveData(tickers),
    ...tickers.map(t => _fetchYahooPrices(t)),
  ]);
  const signalMap = new Map((signals as {ticker: string; signals: {price_momentum: number; volatility: number; macro_exposure: number}; event_signal: {type: string}}[]).map(s => [s.ticker, s]));
  const priceMap = new Map(tickers.map((t, i) => [t, pricePairs[i] as { current_price?: number; previous_price?: number }]));
  return Object.fromEntries(tickers.map(ticker => {
    const sig = signalMap.get(ticker);
    const prices = priceMap.get(ticker) ?? {};
    if (!sig) return [ticker, { ...prices, evaluated_at: Date.now() }];
    const riskScore = Math.max(0, Math.min(1,
      0.5 * Math.abs(sig.signals.price_momentum) + 0.5 * sig.signals.volatility
    ));
    return [ticker, {
      risk_score: riskScore,
      earnings_event_detected: sig.event_signal.type === 'earnings',
      macro_change_detected: sig.event_signal.type === 'policy' || Math.abs(sig.signals.macro_exposure) >= 0.5,
      macro_change_magnitude: Math.abs(sig.signals.macro_exposure),
      current_price:  prices.current_price,
      previous_price: prices.previous_price,
      evaluated_at: Date.now(),
    }];
  }));
}

async function main() {
  console.log("=== MOVE 3 SNAPSHOT VERIFICATION TEST ===\n");

  // STEP 1: Direct Yahoo price fetch test
  console.log("--- STEP 1: Direct _fetchYahooPrices test ---");
  const testTickers = ['AAPL', '1810.HK', '600916.SS', 'MSFT'];
  const priceResults: Record<string, { current_price?: number; previous_price?: number }> = {};
  for (const t of testTickers) {
    priceResults[t] = await _fetchYahooPrices(t);
  }

  // STEP 2: Full snapshot build
  console.log("\n--- STEP 2: Full snapshot build (signals + prices) ---");
  const activeTickers = ['1810.HK', '600916.SS', 'AAPL'];
  const snapshots = await buildSnapshotProvider(activeTickers);

  console.log("\n[SNAPSHOT OUTPUT]");
  for (const [ticker, snap] of Object.entries(snapshots)) {
    const s = snap as Record<string, unknown>;
    console.log(`  ${ticker}:`);
    console.log(`    risk_score=${s.risk_score}`);
    console.log(`    earnings_event_detected=${s.earnings_event_detected}`);
    console.log(`    macro_change_detected=${s.macro_change_detected}`);
    console.log(`    macro_change_magnitude=${s.macro_change_magnitude}`);
    console.log(`    current_price=${s.current_price ?? 'UNDEFINED'}`);
    console.log(`    previous_price=${s.previous_price ?? 'UNDEFINED'}`);
  }

  // STEP 3: Check watch_items trigger_conditions
  console.log("\n--- STEP 3: watch_items trigger_conditions ---");
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [watches] = await conn.execute(
    "SELECT watch_id, primary_ticker, watch_status, trigger_conditions FROM watch_items WHERE watch_status='active' ORDER BY created_at LIMIT 6"
  ) as [Array<{watch_id: string; primary_ticker: string; watch_status: string; trigger_conditions: string | null}>, unknown];
  await conn.end();

  let hasPriceConditions = false;
  for (const w of watches) {
    let conditions: unknown[] = [];
    try { conditions = JSON.parse(w.trigger_conditions ?? '[]'); } catch { conditions = []; }
    const priceConditions = (conditions as Array<{trigger_type?: string; enabled?: boolean}>).filter(c => c.trigger_type === 'price_break' || c.trigger_type === 'price_target');
    const enabledPrice = priceConditions.filter(c => c.enabled !== false);
    console.log(`  ${w.primary_ticker} (${w.watch_id}):`);
    console.log(`    total_conditions=${conditions.length} price_conditions=${priceConditions.length} enabled_price=${enabledPrice.length}`);
    if (priceConditions.length > 0) {
      console.log(`    price_conditions: ${JSON.stringify(priceConditions)}`);
    }
    if (enabledPrice.length > 0) hasPriceConditions = true;
  }
  console.log(`\nAny watch has enabled price conditions: ${hasPriceConditions ? 'YES' : 'NO'}`);

  // STEP 4: dryRunBatch
  console.log("\n--- STEP 4: dryRunBatch ---");
  const dryResult = await SchedulerService.batchEvaluateTriggers(buildSnapshotProvider, { batch_size: 3, dry_run: true });
  console.log("dryRunBatch result:", JSON.stringify(dryResult, null, 2));

  // STEP 5: Summary
  console.log("\n=== SUMMARY ===");
  const priceFieldsPresent = activeTickers.some(t => {
    const s = snapshots[t] as Record<string, unknown>;
    return s.current_price !== undefined && s.previous_price !== undefined;
  });
  console.log(`Yahoo price fetch works: ${Object.values(priceResults).some(p => p.current_price !== undefined) ? 'YES ✓' : 'NO ✗'}`);
  console.log(`current_price/previous_price in snapshots: ${priceFieldsPresent ? 'YES ✓' : 'NO ✗'}`);
  console.log(`Active watches with price conditions: ${hasPriceConditions ? 'YES' : 'NO (price_break structurally active but no watch has price conditions yet)'}`);
  console.log(`dryRun: scanned=${dryResult.watches_scanned} fired=${dryResult.triggers_fired} errors=${dryResult.errors_count}`);

  console.log("\nDone.");
  process.exit(0);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
