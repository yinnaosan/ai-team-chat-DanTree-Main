/**
 * DANTREE LEVEL10.4 — Experience Learning Engine
 * Module 2-6: Experience History + Drift History + Confidence Trajectory + Behavior Evolution + Meta-Insight
 *
 * HARD RULES:
 * - advisory_only: true on all outputs
 * - append-only: never overwrite history
 * - never delete failed experiences
 * - supports replay + audit
 */

import { getDb } from "./db";
import { decisionLog } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ExperienceContextSnapshot {
  drift: {
    drift_direction: string;
    drift_intensity: number;
    drift_signal: string;
  };
  confidence: {
    updated_confidence: number;
    confidence_trend: string;
    reason: string;
  };
  management: {
    pattern: string;
    behavior_interpretation: string;
    risk_flag: boolean;
  };
  market_behavior: {
    behavior_type: string;
    interpretation: string;
    signal_strength: number;
  };
  gradient_risk: {
    risk_state: string;
    risk_trend: string;
    risk_score: number;
  };
  recorded_at_ms: number;
}

export interface ExperienceHistoryRecord {
  timestamp: number;
  drift_direction: string;
  confidence: number;
  risk_state: string;
  market_behavior: string;
  management_pattern: string;
}

export interface DriftHistoryAnalysis {
  drift_distribution: {
    strengthening: number;
    weakening: number;
    unclear: number;
  };
  dominant_trend: "strengthening" | "weakening" | "mixed";
  consecutive_drift_count: number;
  interpretation: string;
  advisory_only: true;
}

export interface ConfidenceTrajectory {
  trend: "uptrend" | "downtrend" | "volatile" | "flat";
  volatility: number;
  peak: number;
  current_vs_peak: number;
  interpretation: string;
  advisory_only: true;
}

export interface BehaviorEvolution {
  management_pattern_trend: string;
  market_behavior_trend: string;
  pattern_consistency: number;
  risk_implication: string;
  advisory_only: true;
}

export interface ExperienceMetaInsight {
  meta_insight: string;
  learning_signal: string;
  recommended_adjustment: string;
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2 — EXPERIENCE HISTORY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve ordered experience history for a ticker from decision_log.
 * Returns records ordered by time (ascending), no aggregation.
 */
export async function getExperienceHistory(
  ticker: string,
  limit = 30
): Promise<ExperienceHistoryRecord[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        createdAt: decisionLog.createdAt,
        experienceContextJson: decisionLog.experienceContextJson,
      })
      .from(decisionLog)
      .where(eq(decisionLog.ticker, ticker))
      .orderBy(desc(decisionLog.createdAt))
      .limit(limit);

    // Reverse to get ascending order
    const ascending = rows.reverse();

    return ascending
      .filter((r) => r.experienceContextJson != null)
      .map((r) => {
        const ctx = r.experienceContextJson as ExperienceContextSnapshot;
        return {
          timestamp: r.createdAt,
          drift_direction: ctx.drift?.drift_direction ?? "unclear",
          confidence: ctx.confidence?.updated_confidence ?? 0.5,
          risk_state: ctx.gradient_risk?.risk_state ?? "low",
          market_behavior: ctx.market_behavior?.behavior_type ?? "unknown",
          management_pattern: ctx.management?.pattern ?? "unclear",
        };
      });
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3 — DRIFT HISTORY ANALYZER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze thesis drift history to detect long-term patterns.
 * Detects streaks, flip-flopping, and dominant trends.
 */
export function analyzeThesisDriftHistory(
  history: ExperienceHistoryRecord[]
): DriftHistoryAnalysis {
  if (history.length === 0) {
    return {
      drift_distribution: { strengthening: 0, weakening: 0, unclear: 1.0 },
      dominant_trend: "mixed",
      consecutive_drift_count: 0,
      interpretation: "No experience history available — cannot assess drift pattern.",
      advisory_only: true,
    };
  }

  // Count frequencies
  let strengtheningCount = 0;
  let weakeningCount = 0;
  let unclearCount = 0;

  for (const record of history) {
    if (record.drift_direction === "strengthening") strengtheningCount++;
    else if (record.drift_direction === "weakening") weakeningCount++;
    else unclearCount++;
  }

  const total = history.length;
  const distribution = {
    strengthening: Math.round((strengtheningCount / total) * 100) / 100,
    weakening: Math.round((weakeningCount / total) * 100) / 100,
    unclear: Math.round((unclearCount / total) * 100) / 100,
  };

  // Detect consecutive streak (from most recent)
  const recent = [...history].reverse();
  const latestDirection = recent[0]?.drift_direction ?? "unclear";
  let consecutiveCount = 0;
  for (const record of recent) {
    if (record.drift_direction === latestDirection) consecutiveCount++;
    else break;
  }

  // Determine dominant trend
  let dominant_trend: "strengthening" | "weakening" | "mixed";
  if (distribution.strengthening >= 0.6) dominant_trend = "strengthening";
  else if (distribution.weakening >= 0.6) dominant_trend = "weakening";
  else dominant_trend = "mixed";

  // Detect instability (flip-flopping)
  let flipCount = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].drift_direction;
    const curr = history[i].drift_direction;
    if (prev !== "unclear" && curr !== "unclear" && prev !== curr) flipCount++;
  }
  const isUnstable = flipCount > total * 0.4;

  // Build interpretation
  let interpretation = "";
  if (dominant_trend === "weakening" && consecutiveCount >= 3) {
    interpretation = `Thesis has been weakening for ${consecutiveCount} consecutive cycles — this is no longer noise but structural deterioration. Recommend reassessing position sizing.`;
  } else if (dominant_trend === "strengthening" && consecutiveCount >= 3) {
    interpretation = `Thesis has been strengthening for ${consecutiveCount} consecutive cycles — conviction is building. Monitor for overconfidence risk.`;
  } else if (isUnstable) {
    interpretation = `Drift pattern is unstable (${flipCount} direction reversals in ${total} cycles) — thesis lacks structural clarity. High uncertainty environment.`;
  } else if (dominant_trend === "mixed") {
    interpretation = `Mixed drift signals across ${total} cycles — no clear directional conviction. Maintain current position with close monitoring.`;
  } else {
    interpretation = `Drift trend is ${dominant_trend} with ${consecutiveCount} consecutive cycles — pattern is developing but not yet conclusive.`;
  }

  return {
    drift_distribution: distribution,
    dominant_trend,
    consecutive_drift_count: consecutiveCount,
    interpretation,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4 — CONFIDENCE TRAJECTORY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze confidence trajectory over time.
 * Detects uptrend, downtrend, volatile, or flat patterns.
 */
export function analyzeConfidenceTrajectory(
  history: ExperienceHistoryRecord[]
): ConfidenceTrajectory {
  if (history.length < 2) {
    return {
      trend: "flat",
      volatility: 0,
      peak: history[0]?.confidence ?? 0.5,
      current_vs_peak: 1.0,
      interpretation: "Insufficient history to assess confidence trajectory.",
      advisory_only: true,
    };
  }

  const confidences = history.map((r) => r.confidence);
  const peak = Math.max(...confidences);
  const current = confidences[confidences.length - 1];
  const current_vs_peak = peak > 0 ? Math.round((current / peak) * 100) / 100 : 1.0;

  // Calculate volatility (std dev)
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const variance =
    confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
  const volatility = Math.round(Math.sqrt(variance) * 100) / 100;

  // Determine trend using linear regression slope
  const n = confidences.length;
  const xMean = (n - 1) / 2;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (confidences[i] - mean);
    denominator += Math.pow(i - xMean, 2);
  }
  const slope = denominator !== 0 ? numerator / denominator : 0;

  let trend: "uptrend" | "downtrend" | "volatile" | "flat";
  if (volatility > 0.15) trend = "volatile";
  else if (slope > 0.02) trend = "uptrend";
  else if (slope < -0.02) trend = "downtrend";
  else trend = "flat";

  // Build interpretation
  let interpretation = "";
  if (trend === "downtrend" && current_vs_peak < 0.8) {
    interpretation = `Confidence peaked at ${(peak * 100).toFixed(0)}% and has declined ${((1 - current_vs_peak) * 100).toFixed(0)}% — market may have already repriced part of the thesis.`;
  } else if (trend === "uptrend") {
    interpretation = `Confidence is trending upward (slope: +${(slope * 100).toFixed(1)}%/cycle) — thesis conviction is strengthening. Watch for overconfidence.`;
  } else if (trend === "volatile") {
    interpretation = `Confidence is volatile (σ=${(volatility * 100).toFixed(1)}%) — thesis is sensitive to new information. Maintain disciplined position sizing.`;
  } else {
    interpretation = `Confidence trajectory is flat — thesis conviction is stable. No significant signal change detected.`;
  }

  return {
    trend,
    volatility,
    peak,
    current_vs_peak,
    interpretation,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 5 — BEHAVIOR PATTERN TRACKER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze evolution of management and market behavior patterns.
 */
export function analyzeBehaviorEvolution(
  history: ExperienceHistoryRecord[]
): BehaviorEvolution {
  if (history.length < 2) {
    return {
      management_pattern_trend: "insufficient_history",
      market_behavior_trend: "insufficient_history",
      pattern_consistency: 1.0,
      risk_implication: "Not enough history to assess behavior evolution.",
      advisory_only: true,
    };
  }

  // Management pattern analysis
  const mgmtPatterns = history.map((r) => r.management_pattern);
  const uniqueMgmt = new Set(mgmtPatterns);
  const mgmtConsistency = 1 - (uniqueMgmt.size - 1) / Math.max(mgmtPatterns.length - 1, 1);

  // Detect management pattern shift (last 3 vs first 3)
  const earlyMgmt = mgmtPatterns.slice(0, Math.min(3, Math.floor(history.length / 2)));
  const recentMgmt = mgmtPatterns.slice(-Math.min(3, Math.floor(history.length / 2)));
  const earlyMgmtMode = getModeValue(earlyMgmt);
  const recentMgmtMode = getModeValue(recentMgmt);
  const mgmtTrend =
    earlyMgmtMode === recentMgmtMode
      ? `stable_${recentMgmtMode}`
      : `shifted_from_${earlyMgmtMode}_to_${recentMgmtMode}`;

  // Market behavior analysis
  const mktBehaviors = history.map((r) => r.market_behavior);
  const uniqueMkt = new Set(mktBehaviors);
  const mktConsistency = 1 - (uniqueMkt.size - 1) / Math.max(mktBehaviors.length - 1, 1);

  const earlyMkt = mktBehaviors.slice(0, Math.min(3, Math.floor(history.length / 2)));
  const recentMkt = mktBehaviors.slice(-Math.min(3, Math.floor(history.length / 2)));
  const earlyMktMode = getModeValue(earlyMkt);
  const recentMktMode = getModeValue(recentMkt);
  const mktTrend =
    earlyMktMode === recentMktMode
      ? `stable_${recentMktMode}`
      : `shifted_from_${earlyMktMode}_to_${recentMktMode}`;

  // Overall pattern consistency
  const pattern_consistency =
    Math.round(((mgmtConsistency + mktConsistency) / 2) * 100) / 100;

  // Risk implication
  let risk_implication = "";
  const hasMgmtShift = mgmtTrend.startsWith("shifted");
  const hasMktShift = mktTrend.startsWith("shifted");

  if (hasMgmtShift && hasMktShift) {
    risk_implication = `Both management pattern and market behavior have shifted — compound behavioral change detected. Execution risk elevated.`;
  } else if (hasMgmtShift) {
    risk_implication = `Management pattern shifted (${mgmtTrend}) — execution risk rising. Monitor capital allocation decisions closely.`;
  } else if (hasMktShift) {
    risk_implication = `Market behavior shifted (${mktTrend}) — sentiment regime change detected. Reassess entry/exit timing.`;
  } else if (pattern_consistency < 0.5) {
    risk_implication = `Behavior patterns are inconsistent (consistency: ${(pattern_consistency * 100).toFixed(0)}%) — high uncertainty in both management and market signals.`;
  } else {
    risk_implication = `Behavior patterns are stable — no significant regime change detected. Thesis execution environment is consistent.`;
  }

  return {
    management_pattern_trend: mgmtTrend,
    market_behavior_trend: mktTrend,
    pattern_consistency,
    risk_implication,
    advisory_only: true,
  };
}

function getModeValue(arr: string[]): string {
  const freq: Record<string, number> = {};
  for (const v of arr) freq[v] = (freq[v] ?? 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unclear";
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 6 — EXPERIENCE META-INSIGHT ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate meta-insights by synthesizing drift, confidence, and behavior analyses.
 * This is where DanTree "learns" from its own history.
 */
export function generateExperienceInsight(
  driftAnalysis: DriftHistoryAnalysis,
  confidenceTrajectory: ConfidenceTrajectory,
  behaviorAnalysis: BehaviorEvolution
): ExperienceMetaInsight {
  const insights: string[] = [];
  const learningSignals: string[] = [];
  const adjustments: string[] = [];

  // Drift-based insight
  if (driftAnalysis.dominant_trend === "weakening" && driftAnalysis.consecutive_drift_count >= 3) {
    insights.push(
      `Thesis has been weakening for ${driftAnalysis.consecutive_drift_count} consecutive cycles — structural deterioration, not noise.`
    );
    learningSignals.push("persistent_weakening_detected");
    adjustments.push("Reduce position size by 20-30%; set hard exit trigger at next negative catalyst.");
  } else if (driftAnalysis.dominant_trend === "strengthening" && driftAnalysis.consecutive_drift_count >= 3) {
    insights.push(
      `Thesis has been strengthening for ${driftAnalysis.consecutive_drift_count} consecutive cycles — conviction is building.`
    );
    learningSignals.push("persistent_strengthening_detected");
    adjustments.push("Consider gradual position add on pullbacks; maintain thesis monitoring cadence.");
  } else if (driftAnalysis.dominant_trend === "mixed") {
    insights.push("Thesis direction is mixed — no structural conviction has emerged across cycles.");
    learningSignals.push("mixed_drift_pattern");
    adjustments.push("Maintain current sizing; avoid adding until directional clarity emerges.");
  }

  // Confidence trajectory insight
  if (confidenceTrajectory.trend === "downtrend" && confidenceTrajectory.current_vs_peak < 0.8) {
    insights.push(
      `Confidence peaked at ${(confidenceTrajectory.peak * 100).toFixed(0)}% and has declined ${((1 - confidenceTrajectory.current_vs_peak) * 100).toFixed(0)}% — market may have already repriced part of the thesis.`
    );
    learningSignals.push("confidence_peak_and_decline");
    adjustments.push("Review original thesis assumptions; check if key variables have changed.");
  } else if (confidenceTrajectory.trend === "volatile") {
    insights.push(
      `Confidence is volatile (σ=${(confidenceTrajectory.volatility * 100).toFixed(1)}%) — thesis is highly sensitive to new information.`
    );
    learningSignals.push("high_confidence_volatility");
    adjustments.push("Reduce leverage; use smaller position increments to manage uncertainty.");
  }

  // Behavior evolution insight
  if (behaviorAnalysis.management_pattern_trend.startsWith("shifted")) {
    insights.push(
      `Management pattern shifted (${behaviorAnalysis.management_pattern_trend}) — execution risk rising.`
    );
    learningSignals.push("management_pattern_shift");
    adjustments.push("Monitor next 2 earnings calls closely for execution quality signals.");
  }

  if (behaviorAnalysis.pattern_consistency < 0.5) {
    insights.push(
      `Behavioral consistency is low (${(behaviorAnalysis.pattern_consistency * 100).toFixed(0)}%) — high uncertainty in both management and market signals.`
    );
    learningSignals.push("low_behavioral_consistency");
    adjustments.push("Avoid adding to position until behavioral patterns stabilize.");
  }

  // Synthesize final outputs
  const meta_insight =
    insights.length > 0
      ? insights.join(" | ")
      : "No significant learning signal detected across drift, confidence, and behavior dimensions.";

  const learning_signal =
    learningSignals.length > 0
      ? learningSignals.join(", ")
      : "no_significant_signal";

  const recommended_adjustment =
    adjustments.length > 0
      ? adjustments.join(" Additionally: ")
      : "No adjustment recommended — maintain current thesis and monitoring cadence.";

  return {
    meta_insight,
    learning_signal,
    recommended_adjustment,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPERIENCE HISTORY SUMMARY (for replayDecision)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExperienceHistorySummary {
  ticker: string;
  record_count: number;
  drift_analysis: DriftHistoryAnalysis;
  confidence_trajectory: ConfidenceTrajectory;
  behavior_evolution: BehaviorEvolution;
  meta_insight: ExperienceMetaInsight;
  advisory_only: true;
}

export async function buildExperienceHistorySummary(
  ticker: string
): Promise<ExperienceHistorySummary> {
  const history = await getExperienceHistory(ticker);
  const driftAnalysis = analyzeThesisDriftHistory(history);
  const confidenceTrajectory = analyzeConfidenceTrajectory(history);
  const behaviorEvolution = analyzeBehaviorEvolution(history);
  const metaInsight = generateExperienceInsight(
    driftAnalysis,
    confidenceTrajectory,
    behaviorEvolution
  );

  return {
    ticker,
    record_count: history.length,
    drift_analysis: driftAnalysis,
    confidence_trajectory: confidenceTrajectory,
    behavior_evolution: behaviorEvolution,
    meta_insight: metaInsight,
    advisory_only: true,
  };
}
