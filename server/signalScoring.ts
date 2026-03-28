/**
 * DANTREE LEVEL6 — Strategy & Alpha Layer
 * Phase 3: Trigger/Signal Scoring (aggregate scoring + low-sample discount)
 * Phase 4: Portfolio + Cross-Watch Aggregation
 *
 * Advisory-only. Does NOT modify trigger/action core logic.
 * All outputs are informational and sample-size aware.
 */

import type { SignalOutcomeRecord } from "./signalJournal";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EntityType =
  | "trigger_type"
  | "action_type"
  | "watch_type"
  | "reasoning_mode"
  | "source_used"
  | "memory_influence"
  | "learning_influence";

export type SampleQuality = "low" | "medium" | "high";

export interface EntityScore {
  entity_type: EntityType;
  entity_key: string;
  signals_count: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  avg_outcome_score: number;
  raw_avg_risk_adj: number;        // running average of raw (undiscounted) risk_adjusted_scores
  risk_adjusted_score: number;     // discounted score for display/ranking
  sample_quality: SampleQuality;
  low_sample_discount_applied: boolean;
  last_updated_at: number;
}

export interface PortfolioSummary {
  active_watch_count: number;
  high_risk_watch_count: number;
  top_trigger_cluster: string;
  top_risk_cluster: string;
  watch_concentration_summary: string;
}

export interface CrossWatchInsight {
  cluster_type: "sector" | "trigger" | "thesis" | "risk";
  cluster_key: string;
  watch_ids: string[];
  tickers: string[];
  concentration_level: "low" | "medium" | "high";
  risk_note: string;
}

export interface PortfolioAggregation {
  portfolio_summary: PortfolioSummary;
  cross_watch_insights: CrossWatchInsight[];
  generated_at: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Minimum sample thresholds for score trust
const SAMPLE_THRESHOLD_LOW = 3;
const SAMPLE_THRESHOLD_MEDIUM = 10;
const SAMPLE_THRESHOLD_HIGH = 25;

// Low-sample discount factor (shrinkage toward zero)
const LOW_SAMPLE_DISCOUNT = 0.4;
const MEDIUM_SAMPLE_DISCOUNT = 0.75;

// ── In-memory score tables ────────────────────────────────────────────────────

const _entityScores: Map<string, EntityScore> = new Map();

function _entityKey(entity_type: EntityType, entity_key: string): string {
  return `${entity_type}::${entity_key}`;
}

// ── Phase 3: Trigger/Signal Scoring ──────────────────────────────────────────

/**
 * Determine sample quality based on count.
 */
export function deriveSampleQuality(count: number): SampleQuality {
  if (count >= SAMPLE_THRESHOLD_HIGH) return "high";
  if (count >= SAMPLE_THRESHOLD_MEDIUM) return "medium";
  return "low";
}

/**
 * Apply shrinkage/Bayesian-style discount for low-sample signals.
 * Low sample → score shrinks toward zero (conservative).
 */
export function applyLowSampleDiscount(
  raw_score: number,
  sample_quality: SampleQuality
): { discounted_score: number; discount_applied: boolean } {
  if (sample_quality === "high") {
    return { discounted_score: raw_score, discount_applied: false };
  }
  const factor = sample_quality === "medium" ? MEDIUM_SAMPLE_DISCOUNT : LOW_SAMPLE_DISCOUNT;
  return {
    discounted_score: raw_score * factor,
    discount_applied: true,
  };
}

/**
 * Ingest a batch of outcome records and update entity scores.
 */
export function ingestOutcomesForScoring(
  outcomes: SignalOutcomeRecord[],
  entityExtractor: (outcome: SignalOutcomeRecord) => Array<{ entity_type: EntityType; entity_key: string }>
): void {
  for (const outcome of outcomes) {
    const entities = entityExtractor(outcome);
    for (const { entity_type, entity_key } of entities) {
      const key = _entityKey(entity_type, entity_key);
      const existing = _entityScores.get(key);

      const is_positive = outcome.risk_adjusted_score > 0.2;
      const is_negative = outcome.risk_adjusted_score < -0.1;
      const is_neutral = !is_positive && !is_negative;

      if (!existing) {
        const raw_avg = outcome.risk_adjusted_score;
        const sample_quality = deriveSampleQuality(1);
        const { discounted_score, discount_applied } = applyLowSampleDiscount(raw_avg, sample_quality);
        _entityScores.set(key, {
          entity_type,
          entity_key,
          signals_count: 1,
          positive_count: is_positive ? 1 : 0,
          negative_count: is_negative ? 1 : 0,
          neutral_count: is_neutral ? 1 : 0,
          avg_outcome_score: outcome.outcome_score,
          raw_avg_risk_adj: raw_avg,
          risk_adjusted_score: discounted_score,
          sample_quality,
          low_sample_discount_applied: discount_applied,
          last_updated_at: Date.now(),
        });
      } else {
        const new_count = existing.signals_count + 1;
        const new_avg_outcome =
          (existing.avg_outcome_score * existing.signals_count + outcome.outcome_score) / new_count;
        // Use raw_avg_risk_adj for accumulation to avoid discount compounding
        const new_raw_avg =
          (existing.raw_avg_risk_adj * existing.signals_count + outcome.risk_adjusted_score) / new_count;

        const sample_quality = deriveSampleQuality(new_count);
        const { discounted_score, discount_applied } = applyLowSampleDiscount(new_raw_avg, sample_quality);

        _entityScores.set(key, {
          ...existing,
          signals_count: new_count,
          positive_count: existing.positive_count + (is_positive ? 1 : 0),
          negative_count: existing.negative_count + (is_negative ? 1 : 0),
          neutral_count: existing.neutral_count + (is_neutral ? 1 : 0),
          avg_outcome_score: new_avg_outcome,
          raw_avg_risk_adj: new_raw_avg,
          risk_adjusted_score: discounted_score,
          sample_quality,
          low_sample_discount_applied: discount_applied,
          last_updated_at: Date.now(),
        });
      }
    }
  }
}

/**
 * Default entity extractor — extracts trigger_type and action_type.
 */
export function defaultEntityExtractor(
  outcome: SignalOutcomeRecord
): Array<{ entity_type: EntityType; entity_key: string }> {
  return [
    { entity_type: "trigger_type", entity_key: outcome.trigger_type },
    { entity_type: "action_type", entity_key: outcome.action_type },
  ];
}

export function getEntityScore(
  entity_type: EntityType,
  entity_key: string
): EntityScore | undefined {
  return _entityScores.get(_entityKey(entity_type, entity_key));
}

export function listEntityScores(
  entity_type?: EntityType,
  sort_by: "risk_adjusted_score" | "signals_count" = "risk_adjusted_score"
): EntityScore[] {
  let scores = Array.from(_entityScores.values());
  if (entity_type) scores = scores.filter((s) => s.entity_type === entity_type);
  scores.sort((a, b) => b[sort_by] - a[sort_by]);
  return scores;
}

export function getRankedTriggerTypes(): EntityScore[] {
  return listEntityScores("trigger_type", "risk_adjusted_score");
}

export function getRankedActionTypes(): EntityScore[] {
  return listEntityScores("action_type", "risk_adjusted_score");
}

export function resetEntityScores(): void {
  _entityScores.clear();
}

// ── Phase 4: Portfolio + Cross-Watch Aggregation ──────────────────────────────

export interface WatchSummaryInput {
  watch_id: string;
  ticker: string;
  sector: string;
  theme: string;
  risk_score: number;  // 0–1
  trigger_type_last: string;
  thesis_cluster: string;
}

/**
 * Build portfolio aggregation from a list of watch summaries.
 * Surfaces over-concentration of same thesis/risk.
 */
export function buildPortfolioAggregation(
  watches: WatchSummaryInput[]
): PortfolioAggregation {
  if (watches.length === 0) {
    return {
      portfolio_summary: {
        active_watch_count: 0,
        high_risk_watch_count: 0,
        top_trigger_cluster: "none",
        top_risk_cluster: "none",
        watch_concentration_summary: "No active watches.",
      },
      cross_watch_insights: [],
      generated_at: Date.now(),
    };
  }

  const high_risk = watches.filter((w) => w.risk_score >= 0.6);

  // Trigger cluster: most common trigger type
  const trigger_counts: Record<string, number> = {};
  for (const w of watches) {
    trigger_counts[w.trigger_type_last] = (trigger_counts[w.trigger_type_last] ?? 0) + 1;
  }
  const top_trigger_cluster = Object.entries(trigger_counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";

  // Sector cluster: most common sector
  const sector_counts: Record<string, number> = {};
  for (const w of watches) {
    sector_counts[w.sector] = (sector_counts[w.sector] ?? 0) + 1;
  }
  const top_risk_cluster = Object.entries(sector_counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";

  // Concentration summary
  const concentration_pct = watches.length > 0 ? (sector_counts[top_risk_cluster] / watches.length) : 0;
  const watch_concentration_summary =
    `${watches.length} active watches. Top sector: ${top_risk_cluster} (${(concentration_pct * 100).toFixed(0)}%). ` +
    `${high_risk.length} high-risk watches. Top trigger cluster: ${top_trigger_cluster}.`;

  // Cross-watch insights
  const cross_watch_insights: CrossWatchInsight[] = [];

  // Sector concentration insight
  for (const [sector, count] of Object.entries(sector_counts)) {
    if (count >= 2) {
      const sector_watches = watches.filter((w) => w.sector === sector);
      const concentration_level: CrossWatchInsight["concentration_level"] =
        count >= 5 ? "high" : count >= 3 ? "medium" : "low";
      cross_watch_insights.push({
        cluster_type: "sector",
        cluster_key: sector,
        watch_ids: sector_watches.map((w) => w.watch_id),
        tickers: sector_watches.map((w) => w.ticker),
        concentration_level,
        risk_note:
          concentration_level === "high"
            ? `High concentration in ${sector} sector (${count} watches). Consider diversification.`
            : `${count} watches in ${sector} sector. Monitor for correlated risk.`,
      });
    }
  }

  // Thesis cluster insight
  const thesis_counts: Record<string, WatchSummaryInput[]> = {};
  for (const w of watches) {
    if (!thesis_counts[w.thesis_cluster]) thesis_counts[w.thesis_cluster] = [];
    thesis_counts[w.thesis_cluster].push(w);
  }
  for (const [thesis, thesis_watches] of Object.entries(thesis_counts)) {
    if (thesis_watches.length >= 2 && thesis !== "general" && thesis !== "unknown") {
      cross_watch_insights.push({
        cluster_type: "thesis",
        cluster_key: thesis,
        watch_ids: thesis_watches.map((w) => w.watch_id),
        tickers: thesis_watches.map((w) => w.ticker),
        concentration_level: thesis_watches.length >= 4 ? "high" : "medium",
        risk_note: `Duplicated thesis cluster "${thesis}" across ${thesis_watches.length} watches. Shared thesis risk.`,
      });
    }
  }

  // Risk cluster insight
  if (high_risk.length >= 2) {
    cross_watch_insights.push({
      cluster_type: "risk",
      cluster_key: "high_risk_cluster",
      watch_ids: high_risk.map((w) => w.watch_id),
      tickers: high_risk.map((w) => w.ticker),
      concentration_level: high_risk.length >= 4 ? "high" : "medium",
      risk_note: `${high_risk.length} watches with risk_score >= 0.6. Elevated portfolio risk.`,
    });
  }

  return {
    portfolio_summary: {
      active_watch_count: watches.length,
      high_risk_watch_count: high_risk.length,
      top_trigger_cluster,
      top_risk_cluster,
      watch_concentration_summary,
    },
    cross_watch_insights,
    generated_at: Date.now(),
  };
}
