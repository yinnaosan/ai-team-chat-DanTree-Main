/**
 * DANTREE LEVEL9 — Phase 2: Strategy Insight Layer
 *
 * Turns historical performance data (decision_log + decision_outcome)
 * into strategy-level insight using structured DB-native fields.
 *
 * Does NOT auto-adjust weights. Advisory only.
 */

import { getDb } from "./db";
import { decisionLog, decisionOutcome } from "../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategyPattern {
  label: string;
  win_rate: number;
  avg_return: number;
  sample_count: number;
  conditions: Record<string, string | number>;
}

export interface StrategyInsightOutput {
  top_strength_patterns: StrategyPattern[];
  top_weakness_patterns: StrategyPattern[];
  high_value_conditions: StrategyPattern[];
  failure_clusters: StrategyPattern[];
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type EvaluatedRow = {
  businessQualityScore: string | null;
  eventType: string | null;
  dangerScore: string | null;
  dominantFactor: string | null;
  regimeTag: string | null;
  returnPct: string | null;
  isPositive: boolean | null;
};

function bqBucket(score: number | null): string {
  if (score == null) return "unknown";
  if (score >= 0.65) return "high_BQ";
  if (score >= 0.35) return "medium_BQ";
  return "low_BQ";
}

function dangerBucket(score: number | null): string {
  if (score == null) return "unknown";
  if (score >= 0.65) return "high_danger";
  if (score >= 0.35) return "medium_danger";
  return "low_danger";
}

interface BucketStats {
  wins: number;
  total: number;
  returnSum: number;
  conditions: Record<string, string | number>;
}

function aggregateBuckets(
  rows: EvaluatedRow[],
  keyFn: (row: EvaluatedRow) => string,
  conditionsFn: (key: string) => Record<string, string | number>
): StrategyPattern[] {
  const map = new Map<string, BucketStats>();

  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) {
      map.set(key, { wins: 0, total: 0, returnSum: 0, conditions: conditionsFn(key) });
    }
    const bucket = map.get(key)!;
    bucket.total++;
    if (row.isPositive) bucket.wins++;
    bucket.returnSum += parseFloat(row.returnPct ?? "0");
  }

  return Array.from(map.entries())
    .filter(([, s]) => s.total >= 2) // minimum sample size
    .map(([label, s]) => ({
      label,
      win_rate: s.total > 0 ? s.wins / s.total : 0,
      avg_return: s.total > 0 ? s.returnSum / s.total : 0,
      sample_count: s.total,
      conditions: s.conditions,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Function
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeStrategyPatterns(userId: number): Promise<StrategyInsightOutput> {
  const EMPTY: StrategyInsightOutput = {
    top_strength_patterns: [],
    top_weakness_patterns: [],
    high_value_conditions: [],
    failure_clusters: [],
    advisory_only: true,
  };

  try {
    const db = await getDb();
    if (!db) return EMPTY;

    // Get portfolioId for this user
    const { getPortfolioByUserId } = await import("./portfolioPersistence");
    const portfolios = await getPortfolioByUserId(userId);
    if (portfolios.length === 0) return EMPTY;
    const portfolioId = portfolios[0].id;

    // Join decision_log (structured fields) with decision_outcome (evaluated results)
    const rows = await db
      .select({
        businessQualityScore: decisionLog.businessQualityScore,
        eventType: decisionLog.eventType,
        dangerScore: decisionLog.dangerScore,
        dominantFactor: decisionLog.dominantFactor,
        regimeTag: decisionLog.regimeTag,
        returnPct: decisionOutcome.returnPct,
        isPositive: decisionOutcome.isPositive,
      })
      .from(decisionLog)
      .innerJoin(decisionOutcome, eq(decisionOutcome.decisionId, decisionLog.id))
      .where(
        and(
          eq(decisionLog.portfolioId, portfolioId),
          eq(decisionOutcome.evaluated, true),
          isNotNull(decisionOutcome.returnPct)
        )
      )
      .limit(500);

    if (rows.length === 0) return EMPTY;

    // ── Grouping 1: by BQ bucket ──────────────────────────────────────────
    const byBQ = aggregateBuckets(
      rows,
      (r) => bqBucket(r.businessQualityScore != null ? parseFloat(r.businessQualityScore) : null),
      (key) => ({ bq_bucket: key })
    );

    // ── Grouping 2: by regime_tag ─────────────────────────────────────────
    const byRegime = aggregateBuckets(
      rows,
      (r) => r.regimeTag ?? "unknown",
      (key) => ({ regime_tag: key })
    );

    // ── Grouping 3: by event_type ─────────────────────────────────────────
    const byEvent = aggregateBuckets(
      rows,
      (r) => r.eventType ?? "none",
      (key) => ({ event_type: key })
    );

    // ── Grouping 4: by danger bucket ──────────────────────────────────────
    const byDanger = aggregateBuckets(
      rows,
      (r) => dangerBucket(r.dangerScore != null ? parseFloat(r.dangerScore) : null),
      (key) => ({ danger_bucket: key })
    );

    // ── Grouping 5: by dominant_factor ────────────────────────────────────
    const byFactor = aggregateBuckets(
      rows,
      (r) => r.dominantFactor ?? "unknown",
      (key) => ({ dominant_factor: key })
    );

    // Combine all patterns
    const allPatterns = [...byBQ, ...byRegime, ...byEvent, ...byDanger, ...byFactor];

    // Sort by win_rate + avg_return composite
    const scored = allPatterns.map((p) => ({
      ...p,
      _score: p.win_rate * 0.6 + Math.max(0, p.avg_return) * 0.4,
    }));
    scored.sort((a, b) => b._score - a._score);

    const strengths = scored.filter((p) => p.win_rate >= 0.55 && p.avg_return > 0);
    const weaknesses = scored.filter((p) => p.win_rate < 0.45 || p.avg_return < 0);
    weaknesses.sort((a, b) => a._score - b._score);

    // High-value conditions: high BQ + positive regime
    const highValue = allPatterns.filter(
      (p) => p.win_rate >= 0.60 && p.sample_count >= 3
    );

    // Failure clusters: repeated failures
    const failures = allPatterns.filter(
      (p) => p.win_rate < 0.40 && p.sample_count >= 2
    );

    return {
      top_strength_patterns: strengths.slice(0, 5).map(({ _score: _, ...p }) => p),
      top_weakness_patterns: weaknesses.slice(0, 5).map(({ _score: _, ...p }) => p),
      high_value_conditions: highValue.slice(0, 5),
      failure_clusters: failures.slice(0, 5),
      advisory_only: true,
    };
  } catch (err) {
    console.error("[strategyInsightEngine] analyzeStrategyPatterns error:", err);
    return EMPTY;
  }
}
