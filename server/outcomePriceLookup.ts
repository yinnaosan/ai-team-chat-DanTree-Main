/**
 * DANTREE CRON + Outcome Auto-Resolve — Phase 5+6
 * outcomePriceLookup.ts
 *
 * Responsibilities:
 *   1. Price Lookup Abstraction — injectable PriceLookupFn backed by real market data
 *   2. Multi-source fallback: Finnhub → TwelveData → Polygon → FMP
 *   3. Post-Run Hook — after each scheduler run, batch-resolve pending signals
 *   4. Observability — resolution run log, stats, error capture
 *   5. Failsafe — errors never propagate to scheduler; all failures are captured
 */

import {
  batchResolveOutcomes,
  findExpiredSignals,
  summarizeResolutions,
  type PendingSignalRecord,
  type ResolvedOutcome,
  type BatchResolveResult,
  type ResolutionSummary,
  type HorizonKey,
  outcomeToSignalLabel,
} from "./outcomeAutoResolve";
import type { RealRunResult } from "./level5RealScheduler";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PriceLookupResult {
  price: number;
  source: string;
  fetched_at_ms: number;
}

export interface OutcomePostRunResult {
  run_id: string;
  signals_evaluated: number;
  resolved: number;
  skipped_not_due: number;
  skipped_no_price: number;
  expired_invalidated: number;
  failed: number;
  summary: ResolutionSummary | null;
  errors: string[];
  advisory_only: true;
  duration_ms: number;
}

export interface ResolutionRunLogEntry {
  run_id: string;
  started_at_ms: number;
  duration_ms: number;
  signals_evaluated: number;
  resolved: number;
  errors_count: number;
}

// ─── Module State ─────────────────────────────────────────────────────────────

const _resolutionRunLog: ResolutionRunLogEntry[] = [];
const MAX_RESOLUTION_LOG = 50;

// ─── Price Lookup — Real Market Data ─────────────────────────────────────────

/**
 * Build a real price lookup function backed by marketSnapshotProvider.
 * Falls back through Finnhub → TwelveData → Polygon → FMP.
 */
export function buildRealPriceLookup(): (ticker: string) => Promise<PriceLookupResult | null> {
  return async (ticker: string): Promise<PriceLookupResult | null> => {
    try {
      const { getMarketSnapshot } = await import("./marketSnapshotProvider");
      const snapshot = await getMarketSnapshot(ticker);

      const price = snapshot.current_price;
      if (!snapshot || !snapshot.is_real_data || !price || price <= 0) {
        return null;
      }

      return {
        price,
        source: snapshot.data_source,
        fetched_at_ms: snapshot.evaluated_at,
      };
    } catch (err) {
      console.warn(`[OutcomePriceLookup] Real lookup failed for ${ticker}:`, err);
      return null;
    }
  };
}

/**
 * Build a mock price lookup function for testing.
 * Returns a fixed price map.
 */
export function buildMockPriceLookup(
  priceMap: Record<string, number>,
  source = "mock"
): (ticker: string) => Promise<PriceLookupResult | null> {
  return async (ticker: string): Promise<PriceLookupResult | null> => {
    const price = priceMap[ticker];
    if (price === undefined || price <= 0) return null;
    return { price, source, fetched_at_ms: Date.now() };
  };
}

// ─── Post-Run Hook ────────────────────────────────────────────────────────────

/**
 * Called after each scheduler run to batch-resolve pending signals.
 * Extracts pending signals from the run result's snapshot_details,
 * then resolves any that are due.
 *
 * @param runResult - The result from runRealScheduler()
 * @param pendingSignals - Pending signals to evaluate (from DB or in-memory store)
 * @param priceLookup - Optional custom price lookup (defaults to real market data)
 * @param nowMs - Optional time override for testing
 */
export async function outcomePostRunHook(
  runResult: RealRunResult,
  pendingSignals: PendingSignalRecord[],
  priceLookup?: (ticker: string) => Promise<PriceLookupResult | null>,
  nowMs?: number
): Promise<OutcomePostRunResult> {
  const startMs = nowMs ?? Date.now();
  const runId = `resolution-${runResult.run_id}`;

  const result: OutcomePostRunResult = {
    run_id: runId,
    signals_evaluated: pendingSignals.length,
    resolved: 0,
    skipped_not_due: 0,
    skipped_no_price: 0,
    expired_invalidated: 0,
    failed: 0,
    summary: null,
    errors: [],
    advisory_only: true,
    duration_ms: 0,
  };

  try {
    // Identify and remove expired signals first
    const expiredIds = findExpiredSignals(pendingSignals, startMs);
    result.expired_invalidated = expiredIds.length;

    const activePending = pendingSignals.filter(s => !expiredIds.includes(s.signal_id));

    if (activePending.length === 0 && expiredIds.length === 0) {
      result.duration_ms = Date.now() - startMs;
      return result;
    }

    // Use provided lookup or build real one
    const lookup = priceLookup ?? buildRealPriceLookup();

    // Wrap to match PriceLookupFn signature (returns { price, source } | null)
    const wrappedLookup = async (ticker: string) => {
      const r = await lookup(ticker);
      if (!r) return null;
      return { price: r.price, source: r.source };
    };

    // Batch resolve
    const batchResult: BatchResolveResult = await batchResolveOutcomes(
      activePending,
      wrappedLookup,
      startMs
    );

    result.resolved = batchResult.resolved;
    result.skipped_not_due = batchResult.skipped_not_due;
    result.skipped_no_price = batchResult.skipped_no_price;
    result.failed = batchResult.failed;
    result.errors = [...batchResult.errors];

    if (batchResult.outcomes.length > 0) {
      result.summary = summarizeResolutions(batchResult.outcomes);
    }

  } catch (err) {
    result.errors.push(
      `Post-run hook failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  result.duration_ms = Date.now() - startMs;

  // Append to run log
  _resolutionRunLog.push({
    run_id: runId,
    started_at_ms: startMs,
    duration_ms: result.duration_ms,
    signals_evaluated: result.signals_evaluated,
    resolved: result.resolved,
    errors_count: result.errors.length,
  });

  // Trim log
  if (_resolutionRunLog.length > MAX_RESOLUTION_LOG) {
    _resolutionRunLog.splice(0, _resolutionRunLog.length - MAX_RESOLUTION_LOG);
  }

  return result;
}

/**
 * Safe wrapper — errors are captured, never thrown.
 * Use this in production cron hooks.
 */
export async function safeOutcomePostRunHook(
  runResult: RealRunResult,
  pendingSignals: PendingSignalRecord[],
  priceLookup?: (ticker: string) => Promise<PriceLookupResult | null>,
  nowMs?: number
): Promise<OutcomePostRunResult> {
  try {
    return await outcomePostRunHook(runResult, pendingSignals, priceLookup, nowMs);
  } catch (err) {
    const fallback: OutcomePostRunResult = {
      run_id: `resolution-${runResult.run_id}`,
      signals_evaluated: pendingSignals.length,
      resolved: 0,
      skipped_not_due: 0,
      skipped_no_price: 0,
      expired_invalidated: 0,
      failed: pendingSignals.length,
      summary: null,
      errors: [`safeOutcomePostRunHook caught: ${err instanceof Error ? err.message : String(err)}`],
      advisory_only: true,
      duration_ms: 0,
    };
    return fallback;
  }
}

// ─── Observability ────────────────────────────────────────────────────────────

export function getResolutionRunLog(limit = 20): ResolutionRunLogEntry[] {
  return _resolutionRunLog.slice(-limit);
}

export function getLastResolutionRun(): ResolutionRunLogEntry | null {
  return _resolutionRunLog.length > 0
    ? _resolutionRunLog[_resolutionRunLog.length - 1]
    : null;
}

export function getResolutionStats(): {
  total_runs: number;
  total_resolved: number;
  total_errors: number;
  avg_duration_ms: number | null;
} {
  if (_resolutionRunLog.length === 0) {
    return { total_runs: 0, total_resolved: 0, total_errors: 0, avg_duration_ms: null };
  }

  const totalResolved = _resolutionRunLog.reduce((s, r) => s + r.resolved, 0);
  const totalErrors = _resolutionRunLog.reduce((s, r) => s + r.errors_count, 0);
  const avgDuration = Math.round(
    _resolutionRunLog.reduce((s, r) => s + r.duration_ms, 0) / _resolutionRunLog.length
  );

  return {
    total_runs: _resolutionRunLog.length,
    total_resolved: totalResolved,
    total_errors: totalErrors,
    avg_duration_ms: avgDuration,
  };
}

export function resetResolutionRunLog(): void {
  _resolutionRunLog.splice(0, _resolutionRunLog.length);
}

// ─── Signal Extraction from Run Result ───────────────────────────────────────

/**
 * Extract pending signals from a scheduler run result.
 * Converts snapshot_details into PendingSignalRecord stubs for resolution.
 *
 * Note: In production, pending signals should come from the DB (signal_journal table).
 * This helper is for in-memory/testing scenarios.
 */
export function extractPendingSignalsFromRunResult(
  runResult: RealRunResult,
  horizonKey: HorizonKey = "7d"
): PendingSignalRecord[] {
  return runResult.snapshot_details
    .filter(d => d.is_usable && d.quality_score >= 0.5)
    .map(d => ({
      signal_id: `${runResult.run_id}-${d.ticker}`,
      ticker: d.ticker,
      entry_price: 0, // Will be filled from DB in production
      signal_direction: "neutral" as const,
      trigger_type: "scheduler_run",
      recorded_at_ms: Date.now(),
      horizon_key: horizonKey,
    }));
}

// ─── LEVEL6 Integration ───────────────────────────────────────────────────────

/**
 * Convert resolved outcomes to LEVEL6 signal journal entries.
 * Maps price-based outcomes to SignalOutcomeLabel for attribution scoring.
 */
export function convertOutcomesToSignalJournal(
  outcomes: ResolvedOutcome[]
): Array<{
  signal_id: string;
  ticker: string;
  outcome_label: import("./signalJournal").SignalOutcomeLabel;
  price_change_pct: number;
  horizon_key: HorizonKey;
  resolved_at_ms: number;
}> {
  return outcomes.map(o => ({
    signal_id: o.signal_id,
    ticker: o.ticker,
    outcome_label: outcomeToSignalLabel(o.outcome_label),
    price_change_pct: o.price_change_pct,
    horizon_key: o.horizon_key,
    resolved_at_ms: o.resolved_at_ms,
  }));
}
