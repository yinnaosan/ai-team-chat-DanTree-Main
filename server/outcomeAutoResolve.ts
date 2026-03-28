/**
 * DANTREE CRON + Outcome Auto-Resolve — Phase 3+4
 * outcomeAutoResolve.ts
 *
 * Responsibilities:
 *   1. Outcome Horizon Schema — define resolution windows (1d, 3d, 7d, 14d, 30d)
 *   2. Auto-Resolve Engine — compare entry vs. current price, classify outcome
 *   3. Batch resolution — scan pending signals and resolve eligible ones
 *   4. Outcome classification — profitable / loss / neutral / invalidated
 *   5. Safety: advisory only, never triggers trades
 */

// OutcomeLabel is independent from SignalOutcomeLabel (LEVEL6 attribution)
// This represents the price-based resolution outcome
export type OutcomeLabel = "profitable" | "loss" | "neutral" | "invalidated";

// ─── Types ───────────────────────────────────────────────────────────────────

export type HorizonKey = "1d" | "3d" | "7d" | "14d" | "30d";

export interface OutcomeHorizon {
  key: HorizonKey;
  label: string;
  days: number;
  min_price_change_pct: number; // Minimum % move to classify as profitable/loss (not neutral)
}

export interface PendingSignalRecord {
  signal_id: string;
  ticker: string;
  entry_price: number;
  signal_direction: "bullish" | "bearish" | "neutral";
  trigger_type: string;
  recorded_at_ms: number;
  horizon_key: HorizonKey;
  /** Optional: context from LEVEL3 at time of signal */
  entry_risk_score?: number;
  entry_failure_intensity?: number;
}

export interface ResolvedOutcome {
  signal_id: string;
  ticker: string;
  horizon_key: HorizonKey;
  entry_price: number;
  resolution_price: number;
  price_change_pct: number;
  outcome_label: OutcomeLabel;
  resolved_at_ms: number;
  resolution_source: string;
  advisory_only: true;
  resolution_notes: string;
}

// Map OutcomeLabel to SignalOutcomeLabel for LEVEL6 integration
export function outcomeToSignalLabel(outcome: OutcomeLabel): import("./signalJournal").SignalOutcomeLabel {
  switch (outcome) {
    case "profitable": return "positive_upside_capture";
    case "loss": return "false_positive";
    case "neutral": return "neutral";
    case "invalidated": return "neutral";
  }
}

export interface BatchResolveResult {
  total_pending: number;
  resolved: number;
  skipped_not_due: number;
  skipped_no_price: number;
  failed: number;
  outcomes: ResolvedOutcome[];
  errors: string[];
  advisory_only: true;
}

export interface AutoResolveConfig {
  horizons: OutcomeHorizon[];
  /** Minimum % move to classify as profitable (default: 2.0) */
  profit_threshold_pct: number;
  /** Minimum % move to classify as loss (default: -2.0) */
  loss_threshold_pct: number;
  /** Maximum age in days before signal is invalidated (default: 60) */
  max_age_days: number;
}

// ─── Default Horizons ─────────────────────────────────────────────────────────

export const DEFAULT_HORIZONS: OutcomeHorizon[] = [
  { key: "1d",  label: "1-Day",   days: 1,  min_price_change_pct: 0.5  },
  { key: "3d",  label: "3-Day",   days: 3,  min_price_change_pct: 1.0  },
  { key: "7d",  label: "7-Day",   days: 7,  min_price_change_pct: 1.5  },
  { key: "14d", label: "14-Day",  days: 14, min_price_change_pct: 2.0  },
  { key: "30d", label: "30-Day",  days: 30, min_price_change_pct: 3.0  },
];

export const DEFAULT_AUTO_RESOLVE_CONFIG: AutoResolveConfig = {
  horizons: DEFAULT_HORIZONS,
  profit_threshold_pct: 2.0,
  loss_threshold_pct: -2.0,
  max_age_days: 60,
};

// ─── Config Override ──────────────────────────────────────────────────────────

let _configOverride: Partial<AutoResolveConfig> | null = null;

export function setAutoResolveConfigOverride(override: Partial<AutoResolveConfig>): void {
  _configOverride = override;
}

export function resetAutoResolveConfig(): void {
  _configOverride = null;
}

export function getAutoResolveConfig(): AutoResolveConfig {
  if (!_configOverride) return DEFAULT_AUTO_RESOLVE_CONFIG;
  return {
    ...DEFAULT_AUTO_RESOLVE_CONFIG,
    ..._configOverride,
    horizons: _configOverride.horizons ?? DEFAULT_AUTO_RESOLVE_CONFIG.horizons,
  };
}

// ─── Horizon Utilities ────────────────────────────────────────────────────────

/**
 * Returns the horizon definition for a given key.
 */
export function getHorizon(key: HorizonKey): OutcomeHorizon {
  const cfg = getAutoResolveConfig();
  const h = cfg.horizons.find(h => h.key === key);
  if (!h) throw new Error(`Unknown horizon key: ${key}`);
  return h;
}

/**
 * Returns the resolution deadline (ms) for a signal given its horizon.
 */
export function getResolutionDeadlineMs(recordedAtMs: number, horizonKey: HorizonKey): number {
  const horizon = getHorizon(horizonKey);
  return recordedAtMs + horizon.days * 24 * 60 * 60 * 1000;
}

/**
 * Returns true if a signal is due for resolution.
 */
export function isResolutionDue(recordedAtMs: number, horizonKey: HorizonKey, nowMs?: number): boolean {
  const now = nowMs ?? Date.now();
  return now >= getResolutionDeadlineMs(recordedAtMs, horizonKey);
}

/**
 * Returns true if a signal has exceeded max age and should be invalidated.
 */
export function isSignalExpired(recordedAtMs: number, nowMs?: number): boolean {
  const cfg = getAutoResolveConfig();
  const now = nowMs ?? Date.now();
  const maxAgeMs = cfg.max_age_days * 24 * 60 * 60 * 1000;
  return now - recordedAtMs > maxAgeMs;
}

// ─── Outcome Classification ───────────────────────────────────────────────────

/**
 * Classify an outcome based on price change and signal direction.
 *
 * Logic:
 *   - If signal expired → invalidated
 *   - If |price_change_pct| < horizon.min_price_change_pct → neutral
 *   - Bullish signal + price up >= profit_threshold → profitable
 *   - Bullish signal + price down <= loss_threshold → loss
 *   - Bearish signal + price down <= loss_threshold → profitable (short was right)
 *   - Bearish signal + price up >= profit_threshold → loss (short was wrong)
 *   - Otherwise → neutral
 */
export function classifyOutcome(
  signal: PendingSignalRecord,
  currentPrice: number,
  nowMs?: number
): OutcomeLabel {
  const cfg = getAutoResolveConfig();
  const horizon = getHorizon(signal.horizon_key);

  // Expired check
  if (isSignalExpired(signal.recorded_at_ms, nowMs)) {
    return "invalidated";
  }

  const priceDelta = currentPrice - signal.entry_price;
  const priceChangePct = signal.entry_price > 0
    ? (priceDelta / signal.entry_price) * 100
    : 0;

  // Below minimum move threshold → neutral
  if (Math.abs(priceChangePct) < horizon.min_price_change_pct) {
    return "neutral";
  }

  if (signal.signal_direction === "bullish") {
    if (priceChangePct >= cfg.profit_threshold_pct) return "profitable";
    if (priceChangePct <= cfg.loss_threshold_pct) return "loss";
    return "neutral";
  }

  if (signal.signal_direction === "bearish") {
    // Bearish signal is "right" when price falls
    if (priceChangePct <= cfg.loss_threshold_pct) return "profitable";
    if (priceChangePct >= cfg.profit_threshold_pct) return "loss";
    return "neutral";
  }

  // Neutral direction signal
  return "neutral";
}

// ─── Single Signal Resolution ─────────────────────────────────────────────────

/**
 * Resolve a single pending signal given the current price.
 * Returns null if not yet due for resolution.
 */
export function resolveSignal(
  signal: PendingSignalRecord,
  currentPrice: number,
  priceSource: string,
  nowMs?: number
): ResolvedOutcome | null {
  const now = nowMs ?? Date.now();

  // Not yet due
  if (!isResolutionDue(signal.recorded_at_ms, signal.horizon_key, now)) {
    return null;
  }

  const priceChangePct = signal.entry_price > 0
    ? ((currentPrice - signal.entry_price) / signal.entry_price) * 100
    : 0;

  const outcomeLabel = classifyOutcome(signal, currentPrice, now);

  const notes = buildResolutionNotes(signal, currentPrice, priceChangePct, outcomeLabel);

  return {
    signal_id: signal.signal_id,
    ticker: signal.ticker,
    horizon_key: signal.horizon_key,
    entry_price: signal.entry_price,
    resolution_price: currentPrice,
    price_change_pct: Math.round(priceChangePct * 100) / 100,
    outcome_label: outcomeLabel,
    resolved_at_ms: now,
    resolution_source: priceSource,
    advisory_only: true,
    resolution_notes: notes,
  };
}

function buildResolutionNotes(
  signal: PendingSignalRecord,
  currentPrice: number,
  priceChangePct: number,
  outcome: OutcomeLabel
): string {
  const direction = priceChangePct >= 0 ? "+" : "";
  const horizon = getHorizon(signal.horizon_key);
  return (
    `${signal.ticker} ${signal.signal_direction} signal (${signal.trigger_type}) ` +
    `resolved at ${horizon.label}: entry=${signal.entry_price.toFixed(2)} ` +
    `current=${currentPrice.toFixed(2)} change=${direction}${priceChangePct.toFixed(2)}% ` +
    `→ ${outcome}`
  );
}

// ─── Batch Resolution Engine ──────────────────────────────────────────────────

export interface PriceLookupFn {
  (ticker: string): Promise<{ price: number; source: string } | null>;
}

/**
 * Batch resolve all pending signals that are due.
 * Requires a price lookup function (injected, not hardcoded).
 *
 * @param pendingSignals - Array of pending signals to evaluate
 * @param priceLookup - Async function to get current price for a ticker
 * @param nowMs - Optional: override current time (for testing)
 */
export async function batchResolveOutcomes(
  pendingSignals: PendingSignalRecord[],
  priceLookup: PriceLookupFn,
  nowMs?: number
): Promise<BatchResolveResult> {
  const now = nowMs ?? Date.now();
  const result: BatchResolveResult = {
    total_pending: pendingSignals.length,
    resolved: 0,
    skipped_not_due: 0,
    skipped_no_price: 0,
    failed: 0,
    outcomes: [],
    errors: [],
    advisory_only: true,
  };

  // Group by ticker to minimize price lookups
  const byTicker = new Map<string, PendingSignalRecord[]>();
  for (const signal of pendingSignals) {
    const existing = byTicker.get(signal.ticker) ?? [];
    existing.push(signal);
    byTicker.set(signal.ticker, existing);
  }

  for (const [ticker, signals] of Array.from(byTicker.entries())) {
    // Check if any signal in this ticker group is due
    const dueSignals = signals.filter(s => isResolutionDue(s.recorded_at_ms, s.horizon_key, now));
    const notDueCount = signals.length - dueSignals.length;
    result.skipped_not_due += notDueCount;

    if (dueSignals.length === 0) continue;

    // Fetch price once per ticker
    let priceData: { price: number; source: string } | null = null;
    try {
      priceData = await priceLookup(ticker);
    } catch (err) {
      const errMsg = `Price lookup failed for ${ticker}: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(errMsg);
      result.skipped_no_price += dueSignals.length;
      continue;
    }

    if (!priceData) {
      result.skipped_no_price += dueSignals.length;
      continue;
    }

    // Resolve each due signal
    for (const signal of dueSignals) {
      try {
        const resolved = resolveSignal(signal, priceData.price, priceData.source, now);
        if (resolved) {
          result.outcomes.push(resolved);
          result.resolved++;
        } else {
          result.skipped_not_due++;
        }
      } catch (err) {
        result.failed++;
        result.errors.push(
          `Resolution failed for signal ${signal.signal_id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return result;
}

// ─── Expired Signal Cleanup ───────────────────────────────────────────────────

/**
 * Identify signals that have exceeded max age and should be marked as invalidated.
 * Returns a list of signal IDs to invalidate.
 */
export function findExpiredSignals(
  pendingSignals: PendingSignalRecord[],
  nowMs?: number
): string[] {
  const now = nowMs ?? Date.now();
  return pendingSignals
    .filter(s => isSignalExpired(s.recorded_at_ms, now))
    .map(s => s.signal_id);
}

// ─── Resolution Summary ───────────────────────────────────────────────────────

export interface ResolutionSummary {
  total_resolved: number;
  profitable: number;
  loss: number;
  neutral: number;
  invalidated: number;
  win_rate_pct: number | null;
  avg_price_change_pct: number | null;
  by_horizon: Record<HorizonKey, { count: number; win_rate_pct: number | null }>;
  advisory_only: true;
}

/**
 * Summarize a batch of resolved outcomes.
 */
export function summarizeResolutions(outcomes: ResolvedOutcome[]): ResolutionSummary {
  const counts: Record<OutcomeLabel, number> = { profitable: 0, loss: 0, neutral: 0, invalidated: 0 };
  const byHorizon: Record<string, { count: number; wins: number }> = {};

  let totalPriceChange = 0;

  for (const o of outcomes) {
    counts[o.outcome_label]++;
    totalPriceChange += o.price_change_pct;

    if (!byHorizon[o.horizon_key]) {
      byHorizon[o.horizon_key] = { count: 0, wins: 0 };
    }
    byHorizon[o.horizon_key].count++;
    if (o.outcome_label === "profitable") byHorizon[o.horizon_key].wins++;
  }

  const decidedCount = counts.profitable + counts.loss;
  const winRate = decidedCount > 0
    ? Math.round((counts.profitable / decidedCount) * 100 * 10) / 10
    : null;

  const avgChange = outcomes.length > 0
    ? Math.round((totalPriceChange / outcomes.length) * 100) / 100
    : null;

  const horizonSummary: Record<HorizonKey, { count: number; win_rate_pct: number | null }> = {
    "1d": { count: 0, win_rate_pct: null },
    "3d": { count: 0, win_rate_pct: null },
    "7d": { count: 0, win_rate_pct: null },
    "14d": { count: 0, win_rate_pct: null },
    "30d": { count: 0, win_rate_pct: null },
  };

  for (const [key, data] of Object.entries(byHorizon)) {
    const decided = data.wins + (byHorizon[key].count - data.wins);
    const hr = decided > 0 ? Math.round((data.wins / decided) * 100 * 10) / 10 : null;
    horizonSummary[key as HorizonKey] = { count: data.count, win_rate_pct: hr };
  }

  return {
    total_resolved: outcomes.length,
    profitable: counts.profitable,
    loss: counts.loss,
    neutral: counts.neutral,
    invalidated: counts.invalidated,
    win_rate_pct: winRate,
    avg_price_change_pct: avgChange,
    by_horizon: horizonSummary,
    advisory_only: true,
  };
}
