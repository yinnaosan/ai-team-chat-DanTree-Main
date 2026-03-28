/**
 * DANTREE LEVEL6 — Strategy & Alpha Layer
 * Phase 5: Regime/Context Slicing
 * Phase 6: Alpha Prioritization (opportunity + danger surfacing)
 *
 * Advisory-only. Does NOT modify trigger/action core logic.
 * All outputs are informational and sample-size aware.
 */

import type { SignalJournalEntry, SignalOutcomeRecord, RegimeContext } from "./signalJournal";
import type { EntityScore } from "./signalScoring";
import { deriveSampleQuality, applyLowSampleDiscount } from "./signalScoring";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlphaTier = "A" | "B" | "C" | "D" | "unranked";
export type DangerTier = "critical" | "high" | "moderate" | "low" | "none";

export interface RegimeSlice {
  regime_key: string;
  macro_regime: string;
  volatility_regime: string;
  event_regime: string;
  signals_count: number;
  avg_risk_adjusted_score: number;
  sample_quality: ReturnType<typeof deriveSampleQuality>;
  low_sample_discount_applied: boolean;
  best_trigger_type: string;
  worst_trigger_type: string;
  regime_note: string;
}

export interface AlphaPriority {
  entity_key: string;
  entity_type: string;
  alpha_tier: AlphaTier;
  risk_adjusted_score: number;
  signals_count: number;
  sample_quality: ReturnType<typeof deriveSampleQuality>;
  regime_fit: string;
  opportunity_note: string;
  advisory_only: true;
}

export interface DangerSignal {
  entity_key: string;
  entity_type: string;
  danger_tier: DangerTier;
  risk_adjusted_score: number;
  signals_count: number;
  harmful_miss_count: number;
  false_positive_count: number;
  danger_note: string;
  advisory_only: true;
}

export interface AlphaSurface {
  alpha_opportunities: AlphaPriority[];
  danger_signals: DangerSignal[];
  regime_context: string;
  generated_at: number;
  advisory_only: true;
}

// ── Phase 5: Regime/Context Slicing ──────────────────────────────────────────

const _regimeSlices: Map<string, RegimeSliceAccumulator> = new Map();

interface RegimeSliceAccumulator {
  regime_key: string;
  macro_regime: string;
  volatility_regime: string;
  event_regime: string;
  scores: number[];
  trigger_scores: Record<string, number[]>;
}

function _regimeKey(ctx: RegimeContext): string {
  return `${ctx.macro_regime}::${ctx.volatility_regime}::${ctx.event_regime}`;
}

/**
 * Ingest a signal + outcome pair into the regime slicer.
 */
export function ingestSignalForRegimeSlice(
  signal: SignalJournalEntry,
  outcome: SignalOutcomeRecord
): void {
  const key = _regimeKey(signal.regime_context);
  const existing = _regimeSlices.get(key);

  if (!existing) {
    _regimeSlices.set(key, {
      regime_key: key,
      macro_regime: signal.regime_context.macro_regime,
      volatility_regime: signal.regime_context.volatility_regime,
      event_regime: signal.regime_context.event_regime,
      scores: [outcome.risk_adjusted_score],
      trigger_scores: {
        [signal.trigger_type]: [outcome.risk_adjusted_score] as number[],
      } as Record<string, number[]>,
    });
  } else {
    existing.scores.push(outcome.risk_adjusted_score);
    if (!existing.trigger_scores[signal.trigger_type]) {
      existing.trigger_scores[signal.trigger_type] = [];
    }
    existing.trigger_scores[signal.trigger_type].push(outcome.risk_adjusted_score);
  }
}

/**
 * Get all regime slices as structured summaries.
 */
export function getRegimeSlices(): RegimeSlice[] {
  const slices: RegimeSlice[] = [];

  for (const acc of Array.from(_regimeSlices.values())) {
    const count = acc.scores.length;
    const avg = acc.scores.reduce((s: number, v: number) => s + v, 0) / count;
    const sample_quality = deriveSampleQuality(count);
    const { discounted_score, discount_applied } = applyLowSampleDiscount(avg, sample_quality);

    // Best/worst trigger types in this regime
    let best_trigger = "none";
    let worst_trigger = "none";
    let best_score = -Infinity;
    let worst_score = Infinity;

    for (const [trigger, scores] of Object.entries(acc.trigger_scores) as [string, number[]][]) {
      const trigger_avg = (scores as number[]).reduce((s: number, v: number) => s + v, 0) / scores.length;
      if (trigger_avg > best_score) {
        best_score = trigger_avg;
        best_trigger = trigger;
      }
      if (trigger_avg < worst_score) {
        worst_score = trigger_avg;
        worst_trigger = trigger;
      }
    }

    const regime_note =
      discounted_score >= 0.5
        ? `Regime "${acc.macro_regime}/${acc.volatility_regime}" shows strong signal quality.`
        : discounted_score >= 0.1
        ? `Regime "${acc.macro_regime}/${acc.volatility_regime}" shows moderate signal quality.`
        : discounted_score >= -0.1
        ? `Regime "${acc.macro_regime}/${acc.volatility_regime}" is neutral — signals inconclusive.`
        : `Regime "${acc.macro_regime}/${acc.volatility_regime}" shows poor signal quality. Review trigger sensitivity.`;

    slices.push({
      regime_key: acc.regime_key,
      macro_regime: acc.macro_regime,
      volatility_regime: acc.volatility_regime,
      event_regime: acc.event_regime,
      signals_count: count,
      avg_risk_adjusted_score: discounted_score,
      sample_quality,
      low_sample_discount_applied: discount_applied,
      best_trigger_type: best_trigger,
      worst_trigger_type: worst_trigger,
      regime_note,
    });
  }

  slices.sort((a, b) => b.avg_risk_adjusted_score - a.avg_risk_adjusted_score);
  return slices;
}

/**
 * Get regime slice for a specific context.
 */
export function getRegimeSliceForContext(ctx: RegimeContext): RegimeSlice | undefined {
  return getRegimeSlices().find((s) => s.regime_key === _regimeKey(ctx));
}

export function resetRegimeSlices(): void {
  _regimeSlices.clear();
}

// ── Phase 6: Alpha Prioritization ────────────────────────────────────────────

/**
 * Derive alpha tier from risk-adjusted score + sample quality.
 *
 * Tier logic:
 * - A: score >= 0.6 AND sample >= medium → strong, consistent signal
 * - B: score >= 0.35 AND sample >= low   → solid, worth monitoring
 * - C: score >= 0.1                      → weak positive, low confidence
 * - D: score < 0.1 AND score >= -0.2     → neutral/inconclusive
 * - unranked: score < -0.2 OR sample = low with score < 0.3
 */
export function deriveAlphaTier(
  risk_adjusted_score: number,
  sample_quality: ReturnType<typeof deriveSampleQuality>
): AlphaTier {
  if (risk_adjusted_score >= 0.6 && sample_quality !== "low") return "A";
  if (risk_adjusted_score >= 0.35) return "B";
  if (risk_adjusted_score >= 0.1) return "C";
  if (risk_adjusted_score >= -0.2) return "D";
  return "unranked";
}

/**
 * Derive danger tier from risk-adjusted score + harmful miss count.
 */
export function deriveDangerTier(
  risk_adjusted_score: number,
  harmful_miss_count: number,
  false_positive_count: number
): DangerTier {
  if (risk_adjusted_score <= -0.6 || harmful_miss_count >= 3) return "critical";
  if (risk_adjusted_score <= -0.4 || harmful_miss_count >= 2) return "high";
  if (risk_adjusted_score <= -0.2 || false_positive_count >= 3) return "moderate";
  if (risk_adjusted_score <= -0.05) return "low";
  return "none";
}

/**
 * Build Alpha Surface from entity scores + outcome records.
 * Surfaces top opportunities and danger signals.
 */
export function buildAlphaSurface(params: {
  entity_scores: EntityScore[];
  outcome_records: SignalOutcomeRecord[];
  current_regime?: RegimeContext;
  top_n?: number;
}): AlphaSurface {
  const { entity_scores, outcome_records, current_regime, top_n = 10 } = params;

  // Count harmful misses and false positives per entity
  const harmful_miss_counts: Record<string, number> = {};
  const false_positive_counts: Record<string, number> = {};

  for (const outcome of outcome_records) {
    const key = `trigger_type::${outcome.trigger_type}`;
    if (outcome.outcome_label === "harmful_miss") {
      harmful_miss_counts[key] = (harmful_miss_counts[key] ?? 0) + 1;
    }
    if (outcome.outcome_label === "false_positive") {
      false_positive_counts[key] = (false_positive_counts[key] ?? 0) + 1;
    }
  }

  // Regime fit description
  const regime_context = current_regime
    ? `${current_regime.macro_regime}/${current_regime.volatility_regime}/${current_regime.event_regime}`
    : "unknown";

  // Best regime for current context
  const best_regime_slice = current_regime
    ? getRegimeSliceForContext(current_regime)
    : undefined;

  const alpha_opportunities: AlphaPriority[] = [];
  const danger_signals: DangerSignal[] = [];

  for (const score of entity_scores) {
    const alpha_tier = deriveAlphaTier(score.risk_adjusted_score, score.sample_quality);
    const entity_key_full = `${score.entity_type}::${score.entity_key}`;
    const harmful_miss = harmful_miss_counts[entity_key_full] ?? 0;
    const false_positive = false_positive_counts[entity_key_full] ?? 0;
    const danger_tier = deriveDangerTier(score.risk_adjusted_score, harmful_miss, false_positive);

    // Regime fit
    const regime_fit =
      best_regime_slice && best_regime_slice.best_trigger_type === score.entity_key
        ? `Best fit for current regime (${regime_context})`
        : best_regime_slice && best_regime_slice.worst_trigger_type === score.entity_key
        ? `Poor fit for current regime (${regime_context})`
        : "Regime fit: unknown";

    // Opportunity surfacing
    if (alpha_tier === "A" || alpha_tier === "B") {
      alpha_opportunities.push({
        entity_key: score.entity_key,
        entity_type: score.entity_type,
        alpha_tier,
        risk_adjusted_score: score.risk_adjusted_score,
        signals_count: score.signals_count,
        sample_quality: score.sample_quality,
        regime_fit,
        opportunity_note:
          alpha_tier === "A"
            ? `High-quality signal source. ${score.signals_count} samples, risk-adjusted score: ${score.risk_adjusted_score.toFixed(2)}.`
            : `Solid signal source. ${score.signals_count} samples, risk-adjusted score: ${score.risk_adjusted_score.toFixed(2)}.`,
        advisory_only: true,
      });
    }

    // Danger surfacing
    if (danger_tier !== "none") {
      danger_signals.push({
        entity_key: score.entity_key,
        entity_type: score.entity_type,
        danger_tier,
        risk_adjusted_score: score.risk_adjusted_score,
        signals_count: score.signals_count,
        harmful_miss_count: harmful_miss,
        false_positive_count: false_positive,
        danger_note:
          danger_tier === "critical"
            ? `CRITICAL: ${harmful_miss} harmful misses. This signal source has failed to flag realized risks.`
            : danger_tier === "high"
            ? `HIGH DANGER: ${harmful_miss} harmful misses, ${false_positive} false positives. Review trigger sensitivity.`
            : danger_tier === "moderate"
            ? `Moderate danger: ${false_positive} false positives recorded. Signal reliability is questionable.`
            : `Low danger: slightly negative risk-adjusted score (${score.risk_adjusted_score.toFixed(2)}).`,
        advisory_only: true,
      });
    }
  }

  // Sort and limit
  alpha_opportunities.sort((a, b) => b.risk_adjusted_score - a.risk_adjusted_score);
  danger_signals.sort((a, b) => {
    const tier_order: Record<DangerTier, number> = { critical: 4, high: 3, moderate: 2, low: 1, none: 0 };
    return tier_order[b.danger_tier] - tier_order[a.danger_tier];
  });

  return {
    alpha_opportunities: alpha_opportunities.slice(0, top_n),
    danger_signals: danger_signals.slice(0, top_n),
    regime_context,
    generated_at: Date.now(),
    advisory_only: true,
  };
}
