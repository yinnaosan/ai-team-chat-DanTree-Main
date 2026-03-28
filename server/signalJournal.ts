/**
 * DANTREE LEVEL6 — Strategy & Alpha Layer
 * Phase 1: Signal Journal Schema + Storage
 * Phase 2: Outcome Attribution
 *
 * Advisory-only layer. Does NOT modify trigger/action core logic.
 * Does NOT introduce auto-trade language.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThesisStatus =
  | "pending"
  | "confirmed"
  | "contradicted"
  | "partially_confirmed"
  | "invalidated"
  | "expired";

export type SignalOutcomeLabel =
  | "positive_risk_reduction"
  | "positive_upside_capture"
  | "neutral"
  | "false_positive"
  | "false_negative"
  | "harmful_miss";

export type AttributionQuality = "high" | "medium" | "low" | "insufficient_sample";

export interface SignalJournalEntry {
  signal_id: string;
  watch_id: string;
  ticker: string;
  trigger_type: string;
  action_type: string;
  signal_timestamp: number;
  evaluation_horizon: string; // e.g. "7d", "30d", "90d"
  thesis_at_signal: string;
  risk_context_at_signal: string;
  failure_intensity_at_signal: number; // 0–1
  success_strength_at_signal: number;  // 0–1
  source_used: string;
  reasoning_mode: string; // "deep" | "standard" | "fast"
  memory_influence: boolean;
  learning_influence: boolean;
  regime_context: RegimeContext;
  created_at: number;
}

export interface RegimeContext {
  macro_regime: string;       // "risk_on" | "risk_off" | "neutral" | "unknown"
  volatility_regime: string;  // "low" | "medium" | "high" | "extreme" | "unknown"
  liquidity_regime: string;   // "ample" | "tight" | "unknown"
  sector_theme: string;
  event_regime: string;       // "earnings" | "macro_event" | "quiet" | "unknown"
}

export interface SignalOutcomeRecord {
  signal_id: string;
  watch_id: string;
  ticker: string;
  trigger_type: string;
  action_type: string;
  evaluation_horizon: string;
  thesis_status: ThesisStatus;
  outcome_score: number;         // -1 to +1
  risk_adjusted_score: number;   // penalizes harmful misses more
  risk_realized: boolean;
  attribution_summary: string;
  risk_warning: string;
  outcome_label: SignalOutcomeLabel;
  recorded_at: number;
}

export interface AttributionResult {
  signal_id: string;
  ticker: string;
  trigger_quality: "strong" | "moderate" | "weak" | "misleading";
  action_mapping_quality: "correct" | "acceptable" | "incorrect";
  thesis_quality: "confirmed" | "partial" | "contradicted" | "unknown";
  outcome_score: number;
  risk_adjusted_score: number;
  outcome_label: SignalOutcomeLabel;
  attribution_summary: string;
  risk_warning: string;
  attribution_quality: AttributionQuality;
}

// ── In-memory storage (advisory layer — no DB writes required) ────────────────

const _signalJournal: Map<string, SignalJournalEntry> = new Map();
const _outcomeRecords: Map<string, SignalOutcomeRecord> = new Map();

// ── Phase 1: Signal Journal ───────────────────────────────────────────────────

export function createSignalJournalEntry(
  params: Omit<SignalJournalEntry, "signal_id" | "created_at">
): SignalJournalEntry {
  const signal_id = `sig_${params.ticker}_${params.trigger_type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const entry: SignalJournalEntry = {
    ...params,
    signal_id,
    created_at: Date.now(),
  };
  _signalJournal.set(signal_id, entry);
  return entry;
}

export function getSignalJournalEntry(signal_id: string): SignalJournalEntry | undefined {
  return _signalJournal.get(signal_id);
}

export function listSignalJournal(filter?: {
  ticker?: string;
  trigger_type?: string;
  watch_id?: string;
  limit?: number;
}): SignalJournalEntry[] {
  let entries = Array.from(_signalJournal.values());
  if (filter?.ticker) entries = entries.filter((e) => e.ticker === filter.ticker);
  if (filter?.trigger_type) entries = entries.filter((e) => e.trigger_type === filter.trigger_type);
  if (filter?.watch_id) entries = entries.filter((e) => e.watch_id === filter.watch_id);
  entries.sort((a, b) => b.created_at - a.created_at);
  if (filter?.limit) entries = entries.slice(0, filter.limit);
  return entries;
}

export function getSignalJournalSize(): number {
  return _signalJournal.size;
}

export function resetSignalJournal(): void {
  _signalJournal.clear();
  _outcomeRecords.clear();
}

// ── Phase 2: Outcome Attribution ──────────────────────────────────────────────

/**
 * Score an outcome for a signal.
 *
 * Scoring rules (risk-adjusted framing):
 * - +0.8 to +1.0: signal correctly identified risk before downside materialized
 * - +0.5 to +0.8: signal led to useful recheck/downgrade that preceded deterioration
 * - +0.3 to +0.5: signal identified valid follow-through (upgrade/recheck confirmed)
 * - 0.0 to +0.3: neutral — no material move
 * - -0.3 to -0.5: false positive — action contradicted by subsequent data
 * - -0.5 to -1.0: harmful miss — failed to flag realized risk (penalized more than false positives)
 */
export function scoreOutcomeForSignal(params: {
  signal: SignalJournalEntry;
  thesis_confirmed: boolean;
  risk_materialized: boolean;
  risk_was_flagged: boolean;
  price_move_pct: number;        // actual price move (signed)
  action_was_risk_reduction: boolean;
  follow_through_confirmed: boolean;
  no_material_move: boolean;
}): SignalOutcomeRecord {
  const {
    signal,
    thesis_confirmed,
    risk_materialized,
    risk_was_flagged,
    price_move_pct,
    action_was_risk_reduction,
    follow_through_confirmed,
    no_material_move,
  } = params;

  let raw_score = 0;
  let risk_adjusted_score = 0;
  let outcome_label: SignalOutcomeLabel = "neutral";
  let thesis_status: ThesisStatus = "pending";
  let attribution_summary = "";
  let risk_warning = "";

  // ── Risk-reduction path (highest value) ──────────────────────────────────
  if (action_was_risk_reduction && risk_materialized && risk_was_flagged) {
    raw_score = 0.85;
    risk_adjusted_score = 0.90;
    outcome_label = "positive_risk_reduction";
    thesis_status = "confirmed";
    attribution_summary = `Signal correctly flagged risk (${signal.trigger_type}) before downside materialized. Risk-reduction action was appropriate.`;
  }
  // ── Recheck/downgrade path ────────────────────────────────────────────────
  else if (follow_through_confirmed && thesis_confirmed) {
    raw_score = 0.65;
    risk_adjusted_score = 0.60;
    outcome_label = "positive_upside_capture";
    thesis_status = "confirmed";
    attribution_summary = `Signal (${signal.trigger_type}) led to confirmed follow-through. Thesis validated.`;
  }
  // ── Neutral — no material move ────────────────────────────────────────────
  else if (no_material_move || Math.abs(price_move_pct) < 0.02) {
    raw_score = 0.10;
    risk_adjusted_score = 0.05;
    outcome_label = "neutral";
    thesis_status = "pending";
    attribution_summary = `No material price move observed within evaluation horizon. Signal inconclusive.`;
  }
  // ── False positive — action contradicted ─────────────────────────────────
  else if (!thesis_confirmed && !risk_materialized && !no_material_move) {
    raw_score = -0.40;
    risk_adjusted_score = -0.45;
    outcome_label = "false_positive";
    thesis_status = "contradicted";
    attribution_summary = `Signal (${signal.trigger_type}) produced action that was contradicted by subsequent data. Price moved ${(price_move_pct * 100).toFixed(1)}% against thesis.`;
    risk_warning = "False positive recorded. Trigger/action mapping may need review.";
  }
  // ── Harmful miss — risk materialized but was NOT flagged ──────────────────
  else if (risk_materialized && !risk_was_flagged) {
    raw_score = -0.60;
    risk_adjusted_score = -0.80; // penalized more than false positive
    outcome_label = "harmful_miss";
    thesis_status = "invalidated";
    attribution_summary = `Risk materialized (price move: ${(price_move_pct * 100).toFixed(1)}%) but signal did NOT flag it. Harmful miss recorded.`;
    risk_warning = "HARMFUL MISS: Risk was not flagged before downside. Trigger sensitivity may be too low.";
  }
  // ── False negative — thesis partially confirmed ───────────────────────────
  else if (thesis_confirmed && !follow_through_confirmed) {
    raw_score = -0.20;
    risk_adjusted_score = -0.25;
    outcome_label = "false_negative";
    thesis_status = "partially_confirmed";
    attribution_summary = `Thesis partially confirmed but follow-through not observed. Signal quality: moderate.`;
  }
  // ── Default ───────────────────────────────────────────────────────────────
  else {
    raw_score = 0.0;
    risk_adjusted_score = 0.0;
    outcome_label = "neutral";
    thesis_status = "pending";
    attribution_summary = "Outcome could not be clearly attributed. Insufficient data.";
  }

  const record: SignalOutcomeRecord = {
    signal_id: signal.signal_id,
    watch_id: signal.watch_id,
    ticker: signal.ticker,
    trigger_type: signal.trigger_type,
    action_type: signal.action_type,
    evaluation_horizon: signal.evaluation_horizon,
    thesis_status,
    outcome_score: Math.max(-1, Math.min(1, raw_score)),
    risk_adjusted_score: Math.max(-1, Math.min(1, risk_adjusted_score)),
    risk_realized: risk_materialized,
    attribution_summary,
    risk_warning,
    outcome_label,
    recorded_at: Date.now(),
  };

  _outcomeRecords.set(signal.signal_id, record);
  return record;
}

export function getOutcomeRecord(signal_id: string): SignalOutcomeRecord | undefined {
  return _outcomeRecords.get(signal_id);
}

export function listOutcomeRecords(filter?: {
  ticker?: string;
  trigger_type?: string;
  outcome_label?: SignalOutcomeLabel;
  limit?: number;
}): SignalOutcomeRecord[] {
  let records = Array.from(_outcomeRecords.values());
  if (filter?.ticker) records = records.filter((r) => r.ticker === filter.ticker);
  if (filter?.trigger_type) records = records.filter((r) => r.trigger_type === filter.trigger_type);
  if (filter?.outcome_label) records = records.filter((r) => r.outcome_label === filter.outcome_label);
  records.sort((a, b) => b.recorded_at - a.recorded_at);
  if (filter?.limit) records = records.slice(0, filter.limit);
  return records;
}

/**
 * Build full attribution result for a signal.
 * Combines journal entry + outcome record into a structured attribution.
 */
export function buildAttributionResult(signal_id: string): AttributionResult | null {
  const signal = _signalJournal.get(signal_id);
  const outcome = _outcomeRecords.get(signal_id);
  if (!signal || !outcome) return null;

  // Trigger quality: based on risk_adjusted_score
  const trigger_quality: AttributionResult["trigger_quality"] =
    outcome.risk_adjusted_score >= 0.7
      ? "strong"
      : outcome.risk_adjusted_score >= 0.3
      ? "moderate"
      : outcome.risk_adjusted_score >= -0.2
      ? "weak"
      : "misleading";

  // Action mapping quality
  const action_mapping_quality: AttributionResult["action_mapping_quality"] =
    outcome.outcome_label === "positive_risk_reduction" ||
    outcome.outcome_label === "positive_upside_capture"
      ? "correct"
      : outcome.outcome_label === "neutral"
      ? "acceptable"
      : "incorrect";

  // Thesis quality
  const thesis_quality: AttributionResult["thesis_quality"] =
    outcome.thesis_status === "confirmed"
      ? "confirmed"
      : outcome.thesis_status === "partially_confirmed"
      ? "partial"
      : outcome.thesis_status === "contradicted" || outcome.thesis_status === "invalidated"
      ? "contradicted"
      : "unknown";

  // Attribution quality based on signal context
  const attribution_quality: AttributionQuality =
    signal.failure_intensity_at_signal > 0.5 || signal.success_strength_at_signal > 0.5
      ? "high"
      : signal.memory_influence || signal.learning_influence
      ? "medium"
      : "low";

  return {
    signal_id,
    ticker: signal.ticker,
    trigger_quality,
    action_mapping_quality,
    thesis_quality,
    outcome_score: outcome.outcome_score,
    risk_adjusted_score: outcome.risk_adjusted_score,
    outcome_label: outcome.outcome_label,
    attribution_summary: outcome.attribution_summary,
    risk_warning: outcome.risk_warning,
    attribution_quality,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function makeDefaultRegimeContext(
  overrides: Partial<RegimeContext> = {}
): RegimeContext {
  return {
    macro_regime: "neutral",
    volatility_regime: "medium",
    liquidity_regime: "ample",
    sector_theme: "general",
    event_regime: "quiet",
    ...overrides,
  };
}
