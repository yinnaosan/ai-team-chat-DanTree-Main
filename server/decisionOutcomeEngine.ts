/**
 * DANTREE LEVEL8.4 — Performance & Validation Layer
 * decisionOutcomeEngine.ts
 *
 * Modules:
 *   Module 2 — evaluateDecisionOutcome(): fetch price, compute return_pct, save to DB
 *   Module 3 — Cron integration: called every 1 hour from cronServerMount
 *   Module 4 — computePerformanceMetrics(userId): win_rate, avg_return, by_horizon
 *   Module 5 — analyzeDecisionAttribution(): group by BQ, event_type, risk range
 *   Module 6 — generateDecisionFeedback(): system_health, key_strength, key_weakness
 *
 * HARD RULES:
 *   - MUST NOT modify any decision outputs
 *   - MUST NOT auto-adjust weights or self-optimize
 *   - advisory_only = true on all outputs
 *   - Pure observation layer
 */

import { getDb } from "./db";
import { decisionOutcome, decisionLog } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Horizon = "1d" | "3d" | "7d";

export const HORIZON_MS: Record<Horizon, number> = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export interface PerformanceMetrics {
  total_decisions: number;
  evaluated_decisions: number;
  win_rate: number;
  avg_return: number;
  best_return: number;
  worst_return: number;
  by_horizon: Record<Horizon, HorizonMetrics>;
  advisory_only: true;
}

export interface HorizonMetrics {
  total: number;
  evaluated: number;
  win_rate: number;
  avg_return: number;
}

export interface AttributionAnalysis {
  performance_by_BQ: Record<string, BucketPerformance>;
  performance_by_event: Record<string, BucketPerformance>;
  performance_by_risk: Record<string, BucketPerformance>;
  advisory_only: true;
}

export interface BucketPerformance {
  count: number;
  win_rate: number;
  avg_return: number;
}

export interface DecisionFeedback {
  system_health: "good" | "neutral" | "poor";
  key_strength: string[];
  key_weakness: string[];
  win_rate: number;
  avg_return: number;
  advisory_only: true;
}

export interface EvaluationRunResult {
  evaluated: number;
  skipped_not_due: number;
  skipped_no_price: number;
  errors: number;
  advisory_only: true;
}

// ─── Module 2 — Outcome Evaluation Engine ────────────────────────────────────

/**
 * Fetch latest price for a ticker using Yahoo Finance (no API key required).
 * Returns null if unavailable.
 */
async function fetchLatestPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

/**
 * Module 2: evaluateDecisionOutcome()
 *
 * Scans all unevaluated decision_outcome rows where the horizon has elapsed.
 * For each eligible row: fetch current price, compute return_pct, update DB.
 *
 * Called by Module 3 (cron) every hour.
 */
export async function evaluateDecisionOutcome(): Promise<EvaluationRunResult> {
  const result: EvaluationRunResult = {
    evaluated: 0,
    skipped_not_due: 0,
    skipped_no_price: 0,
    errors: 0,
    advisory_only: true,
  };

  try {
    // Fetch all unevaluated rows
    const db = await getDb();
    if (!db) return result;
    const pending = await db
      .select()
      .from(decisionOutcome)
      .where(eq(decisionOutcome.evaluated, false));

    const now = Date.now();

    for (const row of pending) {
      const horizonMs = HORIZON_MS[row.horizon as Horizon];
      if (!horizonMs) continue;

      const dueAt = row.decisionTimestamp + horizonMs;

      if (now < dueAt) {
        result.skipped_not_due++;
        continue;
      }

      // Fetch current price
      const currentPrice = await fetchLatestPrice(row.ticker);
      if (currentPrice === null) {
        result.skipped_no_price++;
        continue;
      }

      const initialPrice = parseFloat(String(row.initialPrice));
      if (initialPrice <= 0) {
        result.errors++;
        continue;
      }

      const returnPct = (currentPrice - initialPrice) / initialPrice;
      const isPositive = returnPct > 0;

      try {
        await db!
          .update(decisionOutcome)
          .set({
            evaluationPrice: String(currentPrice.toFixed(4)),
            evaluationTimestamp: now,
            returnPct: String(returnPct.toFixed(6)),
            isPositive,
            evaluated: true,
          })
          .where(eq(decisionOutcome.id, row.id));

        result.evaluated++;
      } catch (dbErr) {
        console.warn(`[DecisionOutcome] DB update failed for id=${row.id}:`, dbErr);
        result.errors++;
      }
    }

    console.log(
      `[DecisionOutcome] Evaluation run: evaluated=${result.evaluated} ` +
      `skipped_not_due=${result.skipped_not_due} skipped_no_price=${result.skipped_no_price} ` +
      `errors=${result.errors}`
    );
  } catch (err) {
    console.error("[DecisionOutcome] evaluateDecisionOutcome failed:", err);
    result.errors++;
  }

  return result;
}

/**
 * Create outcome tracking rows for a new decision.
 * Called when a decision is persisted via persistPipelineRun.
 * Creates 3 rows (1d, 3d, 7d) per decision.
 */
export async function createOutcomeTracking(
  decisionId: number,
  ticker: string,
  initialPrice: number,
  decisionTimestamp: number
): Promise<void> {
  const horizons: Horizon[] = ["1d", "3d", "7d"];
  const now = Date.now();

  const db = await getDb();
  if (!db) return;
  for (const horizon of horizons) {
    try {
      await db.insert(decisionOutcome).values({
        decisionId,
        ticker,
        decisionTimestamp,
        initialPrice: String(initialPrice.toFixed(4)),
        horizon,
        evaluated: false,
        createdAt: now,
      });
    } catch (err) {
      // Non-critical: log and continue
      console.warn(`[DecisionOutcome] Failed to create tracking for ${ticker}/${horizon}:`, err);
    }
  }
}

// ─── Module 4 — Performance Metrics ──────────────────────────────────────────

/**
 * Module 4: computePerformanceMetrics(userId)
 *
 * Computes win_rate, avg_return, best/worst return, broken down by horizon.
 * Only uses evaluated rows.
 */
export async function computePerformanceMetrics(
  userId: number
): Promise<PerformanceMetrics> {
    interface OutcomeRow {
    id: number;
    ticker: string;
    horizon: string;
    returnPct: string | null;
    isPositive: boolean | null;
    evaluated: boolean;
    decisionId: number;
  }
  // Fetch all evaluated outcomes for this user's decisions
  const db = await getDb();
  if (!db) {
    return {
      total_decisions: 0, evaluated_decisions: 0, win_rate: 0, avg_return: 0,
      best_return: 0, worst_return: 0,
      by_horizon: { "1d": { total: 0, evaluated: 0, win_rate: 0, avg_return: 0 }, "3d": { total: 0, evaluated: 0, win_rate: 0, avg_return: 0 }, "7d": { total: 0, evaluated: 0, win_rate: 0, avg_return: 0 } },
      advisory_only: true,
    };
  }
  const rows: OutcomeRow[] = await db
    .select({
      id: decisionOutcome.id,
      ticker: decisionOutcome.ticker,
      horizon: decisionOutcome.horizon,
      returnPct: decisionOutcome.returnPct,
      isPositive: decisionOutcome.isPositive,
      evaluated: decisionOutcome.evaluated,
      decisionId: decisionOutcome.decisionId,
    })
    .from(decisionOutcome)
    .innerJoin(decisionLog, eq(decisionOutcome.decisionId, decisionLog.id))
    .where(
      and(
        eq(decisionLog.portfolioId, userId),
        eq(decisionOutcome.evaluated, true)
      )
    ) as OutcomeRow[];
  const allReturns: number[] = rows
    .map((r: OutcomeRow) => parseFloat(String(r.returnPct ?? "0")))
    .filter((v: number) => isFinite(v));
  const wins = rows.filter((r: OutcomeRow) => r.isPositive === true).length;
  const byHorizon: Record<Horizon, HorizonMetrics> = {
    "1d": computeHorizonMetrics(rows, "1d"),
    "3d": computeHorizonMetrics(rows, "3d"),
    "7d": computeHorizonMetrics(rows, "7d"),
  };
  // Total decisions = distinct decisionId count (across all horizons)
  const uniqueDecisionIds = new Set(rows.map((r: OutcomeRow) => r.decisionId));

  return {
    total_decisions: uniqueDecisionIds.size,
    evaluated_decisions: rows.length,
    win_rate: rows.length > 0 ? wins / rows.length : 0,
    avg_return: allReturns.length > 0
      ? allReturns.reduce((a: number, b: number) => a + b, 0) / allReturns.length
      : 0,
    best_return: allReturns.length > 0 ? Math.max(...allReturns) : 0,
    worst_return: allReturns.length > 0 ? Math.min(...allReturns) : 0,
    by_horizon: byHorizon,
    advisory_only: true,
  };
}

function computeHorizonMetrics(
  rows: Array<{ horizon: string; returnPct: string | null; isPositive: boolean | null }>,
  horizon: Horizon
): HorizonMetrics {
  const filtered = rows.filter((r) => r.horizon === horizon);
  const returns = filtered
    .map((r) => parseFloat(String(r.returnPct ?? "0")))
    .filter((v) => isFinite(v));
  const wins = filtered.filter((r) => r.isPositive === true).length;

  return {
    total: filtered.length,
    evaluated: filtered.length,
    win_rate: filtered.length > 0 ? wins / filtered.length : 0,
    avg_return: returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0,
  };
}

// ─── Module 5 — Attribution Analysis ─────────────────────────────────────────

/**
 * Module 5: analyzeDecisionAttribution()
 *
 * Groups evaluated outcomes by:
 *   - business_quality_score bucket (high/medium/low)
 *   - event_type (from decision advisory text)
 *   - danger_score range (high/medium/low)
 *   - alpha_score range (high/medium/low)
 *
 * Uses decision_log.advisoryText JSON for BQ/event/scores.
 */
export async function analyzeDecisionAttribution(
  userId: number
): Promise<AttributionAnalysis> {
  interface AttrRow {
    returnPct: string | null;
    isPositive: boolean | null;
    advisoryText: string | null;
    fusionScore: string | null;
    decisionBias: string;
  }
  const db = await getDb();
  if (!db) {
    return { performance_by_BQ: {}, performance_by_event: {}, performance_by_risk: {}, advisory_only: true };
  }
  // Fetch evaluated outcomes with decision context
  const rows: AttrRow[] = await db
    .select({
      returnPct: decisionOutcome.returnPct,
      isPositive: decisionOutcome.isPositive,
      advisoryText: decisionLog.advisoryText,
      fusionScore: decisionLog.fusionScore,
      decisionBias: decisionLog.decisionBias,
    })
    .from(decisionOutcome)
    .innerJoin(decisionLog, eq(decisionOutcome.decisionId, decisionLog.id))
    .where(
      and(
        eq(decisionLog.portfolioId, userId),
        eq(decisionOutcome.evaluated, true)
      )
    ) as AttrRow[];

  // Parse advisory text for BQ/event/scores
  const parsed: ParsedRow[] = rows.map((r: AttrRow) => {
    let bqScore = 0.5;
    let eventType = "unknown";
    let dangerScore = 0.5;
    let alphaScore = parseFloat(String(r.fusionScore ?? "0.5"));

    try {
      if (r.advisoryText) {
        const text = r.advisoryText;
        // Extract BQ score from advisory text (format: "BQ: 0.72" or "business_quality: 0.72")
        const bqMatch = text.match(/(?:BQ|business_quality)[:\s]+([0-9.]+)/i);
        if (bqMatch) bqScore = parseFloat(bqMatch[1]);

        // Extract event type
        const eventMatch = text.match(/(?:event|event_type)[:\s]+(\w+)/i);
        if (eventMatch) eventType = eventMatch[1].toLowerCase();

        // Extract danger score
        const dangerMatch = text.match(/(?:danger|danger_score)[:\s]+([0-9.]+)/i);
        if (dangerMatch) dangerScore = parseFloat(dangerMatch[1]);
      }
    } catch {
      // Ignore parse errors
    }

    return {
      returnPct: parseFloat(String(r.returnPct ?? "0")),
      isPositive: r.isPositive === true,
      bqScore,
      eventType,
      dangerScore,
      alphaScore,
    };
  });

  return {
    performance_by_BQ: groupByBucket(parsed, (r) => {
      if (r.bqScore >= 0.65) return "high_BQ";
      if (r.bqScore >= 0.40) return "medium_BQ";
      return "low_BQ";
    }),
    performance_by_event: groupByBucket(parsed, (r) => r.eventType),
    performance_by_risk: groupByBucket(parsed, (r) => {
      if (r.dangerScore >= 0.65) return "high_danger";
      if (r.dangerScore >= 0.35) return "medium_danger";
      return "low_danger";
    }),
    advisory_only: true,
  };
}

interface ParsedRow {
  returnPct: number;
  isPositive: boolean;
  bqScore: number;
  eventType: string;
  dangerScore: number;
  alphaScore: number;
}

function groupByBucket(
  rows: ParsedRow[],
  keyFn: (r: ParsedRow) => string
): Record<string, BucketPerformance> {
  const groups: Record<string, ParsedRow[]> = {};

  for (const row of rows) {
    const key = keyFn(row);
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const result: Record<string, BucketPerformance> = {};
  for (const [key, items] of Object.entries(groups)) {
    const returns = items.map((r) => r.returnPct).filter((v) => isFinite(v));
    const wins = items.filter((r) => r.isPositive).length;
    result[key] = {
      count: items.length,
      win_rate: items.length > 0 ? wins / items.length : 0,
      avg_return: returns.length > 0
        ? returns.reduce((a, b) => a + b, 0) / returns.length
        : 0,
    };
  }

  return result;
}

// ─── Module 6 — Decision Feedback Signal ─────────────────────────────────────

/**
 * Module 6: generateDecisionFeedback()
 *
 * Produces system health assessment based on win_rate and attribution patterns.
 * Logic:
 *   win_rate > 0.6 → "good"
 *   win_rate 0.4–0.6 → "neutral"
 *   win_rate < 0.4 → "poor"
 */
export async function generateDecisionFeedback(
  userId: number
): Promise<DecisionFeedback> {
  const metrics = await computePerformanceMetrics(userId);
  const attribution = await analyzeDecisionAttribution(userId);

  const { win_rate, avg_return, by_horizon } = metrics;

  // Determine system health
  let system_health: "good" | "neutral" | "poor";
  if (win_rate > 0.6) {
    system_health = "good";
  } else if (win_rate >= 0.4) {
    system_health = "neutral";
  } else {
    system_health = "poor";
  }

  const key_strength: string[] = [];
  const key_weakness: string[] = [];

  // Strength: high win_rate
  if (win_rate > 0.6) {
    key_strength.push(`Win rate ${(win_rate * 100).toFixed(1)}% above threshold`);
  }

  // Strength: positive avg_return
  if (avg_return > 0.02) {
    key_strength.push(`Avg return ${(avg_return * 100).toFixed(2)}% is positive`);
  }

  // Strength: best horizon
  const bestHorizon = (["1d", "3d", "7d"] as Horizon[]).reduce((best, h) =>
    by_horizon[h].win_rate > by_horizon[best].win_rate ? h : best, "1d" as Horizon
  );
  if (by_horizon[bestHorizon].win_rate > 0.55) {
    key_strength.push(`${bestHorizon} horizon shows ${(by_horizon[bestHorizon].win_rate * 100).toFixed(1)}% win rate`);
  }

  // Strength: high BQ decisions outperform
  const highBQ = attribution.performance_by_BQ["high_BQ"];
  const lowBQ = attribution.performance_by_BQ["low_BQ"];
  if (highBQ && lowBQ && highBQ.win_rate > lowBQ.win_rate + 0.1) {
    key_strength.push(`High BQ decisions outperform low BQ by ${((highBQ.win_rate - lowBQ.win_rate) * 100).toFixed(1)}%`);
  }

  // Weakness: low win_rate
  if (win_rate < 0.4) {
    key_weakness.push(`Win rate ${(win_rate * 100).toFixed(1)}% below 40% threshold`);
  }

  // Weakness: negative avg_return
  if (avg_return < -0.01) {
    key_weakness.push(`Avg return ${(avg_return * 100).toFixed(2)}% is negative`);
  }

  // Weakness: worst horizon
  const worstHorizon = (["1d", "3d", "7d"] as Horizon[]).reduce((worst, h) =>
    by_horizon[h].win_rate < by_horizon[worst].win_rate ? h : worst, "1d" as Horizon
  );
  if (by_horizon[worstHorizon].win_rate < 0.4 && by_horizon[worstHorizon].total > 0) {
    key_weakness.push(`${worstHorizon} horizon underperforms at ${(by_horizon[worstHorizon].win_rate * 100).toFixed(1)}% win rate`);
  }

  // Weakness: low BQ decisions dragging performance
  if (lowBQ && lowBQ.count > 0 && lowBQ.win_rate < 0.35) {
    key_weakness.push(`Low BQ decisions have ${(lowBQ.win_rate * 100).toFixed(1)}% win rate — BQ gate may need tightening`);
  }

  // Default messages if no data
  if (metrics.evaluated_decisions === 0) {
    key_strength.push("System initialized — awaiting first evaluated decisions");
    system_health = "neutral";
  }

  return {
    system_health,
    key_strength,
    key_weakness,
    win_rate,
    avg_return,
    advisory_only: true,
  };
}

// ─── Safe wrapper for cron use ────────────────────────────────────────────────

/**
 * Safe wrapper: never throws. Used by cron tick.
 */
export async function safeEvaluateDecisionOutcome(): Promise<EvaluationRunResult> {
  try {
    return await evaluateDecisionOutcome();
  } catch (err) {
    console.error("[DecisionOutcome] safeEvaluate caught error:", err);
    return {
      evaluated: 0,
      skipped_not_due: 0,
      skipped_no_price: 0,
      errors: 1,
      advisory_only: true,
    };
  }
}
