/**
 * level105PositionLayer.ts — LEVEL10.5: Asymmetry & Position Layer
 *
 * This is a CAPITAL ALLOCATION LAYER.
 * Converts conviction + asymmetry + risk into disciplined position sizing.
 *
 * HARD RULES:
 *   - advisory_only: true on ALL outputs
 *   - NO auto-trading, NO order execution
 *   - Integrates with LEVEL10.2 / 10.3 / 10.3-B / 10.3-C / 10.4 outputs
 *   - Risk-adjusted asymmetry takes priority over raw conviction
 *   - Sizing must be bounded (0–15%) and explainable
 *
 * Modules:
 *   1. computeAsymmetryScore()       — asymmetry scoring engine
 *   2. computePositionSizing()       — position size calculation
 *   3. computeSizeAdjustment()       — dynamic size adjustment
 *   4. enforceNoBetDiscipline()      — no-bet / low-bet enforcement
 *   5. computePortfolioConcentration() — portfolio concentration governor
 *   6. runPositionLayer()            — composite pipeline entry point
 */

import type {
  InvestmentThesisOutput,
  PayoutMapOutput,
  SignalDensityResult,
} from "./deepResearchEngine";
import type { GradientRiskOutput } from "./experienceLayer";
import type { ExperienceHistorySummary } from "./experienceLearningEngine";
import type { BusinessContext } from "./businessUnderstandingEngine";

// ─────────────────────────────────────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AsymmetryLabel = "poor" | "neutral" | "favorable" | "highly_favorable";
export type SizeBucket105 = "none" | "starter" | "small" | "medium" | "large" | "max";
export type AdjustmentDirection = "increase" | "decrease" | "hold" | "avoid";
export type RestrictionLevel = "none" | "soft" | "hard";
export type ConcentrationRisk = "low" | "medium" | "high";

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1 — ASYMMETRY SCORING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface AsymmetryScoreOutput {
  asymmetry_score: number;          // 0–1
  asymmetry_label: AsymmetryLabel;
  why: string;
  advisory_only: true;
}

export interface AsymmetryScoreContext {
  thesis: InvestmentThesisOutput;
  payoutMap: PayoutMapOutput;
  gradientRisk: GradientRiskOutput;
  businessContext: BusinessContext;
  experienceHistory?: ExperienceHistorySummary;
  regimeTag?: string;
}

/**
 * [LEVEL10.5 Module 1] Compute asymmetry score (0–1).
 * High upside alone is NOT enough — favorable asymmetry requires downside containment.
 * Persistent weakening or elevated risk must reduce asymmetry.
 */
export function computeAsymmetryScore(
  ctx: AsymmetryScoreContext
): AsymmetryScoreOutput {
  const { thesis, payoutMap, gradientRisk, businessContext, experienceHistory, regimeTag } = ctx;
  const eligibility = businessContext.eligibility.eligibility_status;
  const competence = businessContext.competenceFit.competence_fit;
  const moat = businessContext.businessUnderstanding.moat_strength;

  // ── Base: payout asymmetry ratio (cap at 3.0 for scoring) ────────────────
  const rawRatio = Math.min(payoutMap.asymmetry_ratio, 3.0);
  let score = Math.min(0.9, rawRatio / 3.0);

  // ── Upward adjustments ───────────────────────────────────────────────────
  if (moat === "wide") score = Math.min(1.0, score + 0.10);
  else if (moat === "narrow") score = Math.min(1.0, score + 0.04);

  if (thesis.thesis_confidence > 0.75) score = Math.min(1.0, score + 0.06);
  else if (thesis.thesis_confidence > 0.60) score = Math.min(1.0, score + 0.03);

  if (regimeTag === "risk_on") score = Math.min(1.0, score + 0.04);

  // ── Downward adjustments ─────────────────────────────────────────────────
  if (eligibility === "avoid_for_now") score = Math.max(0, score - 0.35);
  else if (eligibility === "research_required") score = Math.max(0, score - 0.15);

  if (competence === "outside") score = Math.max(0, score - 0.25);
  else if (competence === "borderline") score = Math.max(0, score - 0.10);

  if (gradientRisk.risk_state === "critical") score = Math.max(0, score - 0.30);
  else if (gradientRisk.risk_state === "elevated") score = Math.max(0, score - 0.15);
  else if (gradientRisk.risk_state === "building") score = Math.max(0, score - 0.07);

  // Experience history: persistent weakening reduces asymmetry
  if (experienceHistory && experienceHistory.record_count >= 2) {
    const driftTrend = experienceHistory.drift_analysis.dominant_trend;
    const confTrend = experienceHistory.confidence_trajectory.trend;
    if (driftTrend === "weakening") score = Math.max(0, score - 0.12);
    if (confTrend === "downtrend") score = Math.max(0, score - 0.08);
    if (driftTrend === "strengthening" && confTrend === "uptrend") {
      score = Math.min(1.0, score + 0.05);
    }
  }

  if (regimeTag === "risk_off") score = Math.max(0, score - 0.08);
  else if (regimeTag === "macro_stress") score = Math.max(0, score - 0.12);
  else if (regimeTag === "event_shock") score = Math.max(0, score - 0.10);

  score = Math.round(score * 100) / 100;

  // ── Label ────────────────────────────────────────────────────────────────
  let asymmetry_label: AsymmetryLabel;
  if (score >= 0.70) asymmetry_label = "highly_favorable";
  else if (score >= 0.50) asymmetry_label = "favorable";
  else if (score >= 0.30) asymmetry_label = "neutral";
  else asymmetry_label = "poor";

  // ── Why ──────────────────────────────────────────────────────────────────
  const reasons: string[] = [];
  if (payoutMap.asymmetry_ratio >= 2.0) {
    reasons.push(`strong upside/downside ratio (${payoutMap.asymmetry_ratio.toFixed(1)}x)`);
  } else if (payoutMap.asymmetry_ratio < 1.0) {
    reasons.push(`unfavorable payout ratio (${payoutMap.asymmetry_ratio.toFixed(1)}x)`);
  }
  if (moat === "wide") reasons.push("wide moat provides downside containment");
  if (competence === "outside") reasons.push("outside competence boundary limits conviction");
  if (gradientRisk.risk_state === "critical") reasons.push("critical risk state caps asymmetry");
  else if (gradientRisk.risk_state === "elevated") reasons.push("elevated risk reduces asymmetry");
  if (eligibility === "avoid_for_now") reasons.push("business flagged avoid_for_now");
  if (experienceHistory?.drift_analysis.dominant_trend === "weakening") {
    reasons.push(
      `${experienceHistory.drift_analysis.consecutive_drift_count} consecutive weakening cycles in history`
    );
  }

  const why =
    reasons.length > 0
      ? reasons.join("; ")
      : `Asymmetry score ${(score * 100).toFixed(0)}% — balanced risk/reward profile`;

  return { asymmetry_score: score, asymmetry_label, why, advisory_only: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2 — POSITION SIZING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface PositionSizingOutput {
  target_position_pct: number;     // 0–15
  size_bucket: SizeBucket105;
  sizing_rationale: string;
  advisory_only: true;
}

export interface PositionSizingContext {
  asymmetryScore: AsymmetryScoreOutput;
  thesis: InvestmentThesisOutput;
  gradientRisk: GradientRiskOutput;
  businessContext: BusinessContext;
  experienceHistory?: ExperienceHistorySummary;
  signalDensity?: SignalDensityResult;
}

/**
 * [LEVEL10.5 Module 2] Compute position size.
 * Base buckets: none=0%, starter=1-2%, small=3-5%, medium=6-8%, large=9-12%, max=13-15%
 * CRITICAL: High conviction but poor asymmetry → size stays small.
 * High asymmetry + high quality + stable drift → size can expand.
 */
export function computePositionSizing(
  ctx: PositionSizingContext
): PositionSizingOutput {
  const { asymmetryScore, thesis, gradientRisk, businessContext, experienceHistory, signalDensity } = ctx;
  const eligibility = businessContext.eligibility.eligibility_status;
  const competence = businessContext.competenceFit.competence_fit;
  const moat = businessContext.businessUnderstanding.moat_strength;
  const score = asymmetryScore.asymmetry_score;

  // ── Hard blocks ──────────────────────────────────────────────────────────
  if (eligibility === "avoid_for_now" || competence === "outside") {
    return {
      target_position_pct: 0,
      size_bucket: "none",
      sizing_rationale: `No position: ${
        eligibility === "avoid_for_now"
          ? "business flagged avoid_for_now"
          : "outside competence boundary"
      }.`,
      advisory_only: true,
    };
  }
  if (gradientRisk.risk_state === "critical") {
    return {
      target_position_pct: 0,
      size_bucket: "none",
      sizing_rationale:
        "No position: gradient risk state is critical — capital preservation takes priority.",
      advisory_only: true,
    };
  }
  if (signalDensity && !signalDensity.passed && signalDensity.density_score < 0.30) {
    return {
      target_position_pct: 1,
      size_bucket: "starter",
      sizing_rationale:
        "Signal density below threshold — starter position only until data quality improves.",
      advisory_only: true,
    };
  }

  // ── Base bucket from asymmetry score ─────────────────────────────────────
  let bucket: SizeBucket105;
  let basePct: number;

  if (score >= 0.75) { bucket = "large"; basePct = 10; }
  else if (score >= 0.60) { bucket = "medium"; basePct = 7; }
  else if (score >= 0.45) { bucket = "small"; basePct = 4; }
  else if (score >= 0.25) { bucket = "starter"; basePct = 1.5; }
  else { bucket = "none"; basePct = 0; }

  // ── Upward modifiers ─────────────────────────────────────────────────────
  if (moat === "wide" && thesis.thesis_confidence > 0.75 && bucket !== "none") {
    if (bucket === "large") { bucket = "max"; basePct = 14; }
    else if (bucket === "medium") { bucket = "large"; basePct = 10; }
  }
  if (
    experienceHistory &&
    experienceHistory.drift_analysis.dominant_trend === "strengthening" &&
    experienceHistory.confidence_trajectory.trend === "uptrend" &&
    bucket !== "none"
  ) {
    basePct = Math.min(15, basePct + 1);
  }

  // ── Downward modifiers ───────────────────────────────────────────────────
  if (gradientRisk.risk_state === "elevated") {
    basePct = Math.max(0, basePct - 2);
    if (bucket === "large") bucket = "medium";
    else if (bucket === "medium") bucket = "small";
  }
  if (eligibility === "research_required") {
    basePct = Math.min(basePct, 3);
    if (bucket !== "none") bucket = "small";
  }
  if (competence === "borderline") {
    basePct = Math.min(basePct, 5);
    if (bucket === "large" || bucket === "max") bucket = "medium";
  }
  if (experienceHistory?.drift_analysis.dominant_trend === "weakening") {
    basePct = Math.max(0, basePct - 1.5);
  }

  // ── Clamp to bucket ranges ────────────────────────────────────────────────
  const bucketRanges: Record<SizeBucket105, [number, number]> = {
    none: [0, 0], starter: [1, 2], small: [3, 5],
    medium: [6, 8], large: [9, 12], max: [13, 15],
  };
  const [minPct, maxPct] = bucketRanges[bucket];
  const target_position_pct =
    Math.round(Math.min(maxPct, Math.max(minPct, basePct)) * 10) / 10;

  // ── Rationale ─────────────────────────────────────────────────────────────
  const rationale_parts: string[] = [
    `Asymmetry score ${(score * 100).toFixed(0)}% (${asymmetryScore.asymmetry_label})`,
    `thesis confidence ${(thesis.thesis_confidence * 100).toFixed(0)}%`,
    `moat: ${moat}`,
    `risk: ${gradientRisk.risk_state}`,
  ];
  if (experienceHistory && experienceHistory.record_count > 0) {
    rationale_parts.push(
      `${experienceHistory.record_count} historical cycles: ${experienceHistory.drift_analysis.dominant_trend} drift`
    );
  }

  return {
    target_position_pct,
    size_bucket: bucket,
    sizing_rationale: rationale_parts.join(" | "),
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3 — SIZE ADJUSTMENT RULES
// ─────────────────────────────────────────────────────────────────────────────

export interface SizeAdjustmentOutput {
  adjustment: AdjustmentDirection;
  adjustment_pct: number;
  reason: string;
  advisory_only: true;
}

export interface PreviousPositionContext {
  size_bucket: SizeBucket105;
  target_position_pct: number;
}

export interface SizeAdjustmentContext {
  previousPosition: PreviousPositionContext;
  asymmetryScore: AsymmetryScoreOutput;
  gradientRisk: GradientRiskOutput;
  experienceHistory?: ExperienceHistorySummary;
  thesisConfidence: number;
  marketBehavior?: string;
}

/**
 * [LEVEL10.5 Module 3] Compute size adjustment based on changing conditions.
 * Increase: drift strengthening + confidence rising + accumulation + improving asymmetry.
 * Reduce: persistent weakening + downtrend confidence + elevated risk + structural deterioration.
 * Example: persistent weakening (3 cycles) + risk elevated → decrease 20–30%.
 */
export function computeSizeAdjustment(
  ctx: SizeAdjustmentContext
): SizeAdjustmentOutput {
  const { previousPosition, asymmetryScore, gradientRisk, experienceHistory, thesisConfidence, marketBehavior } = ctx;

  let increaseScore = 0;
  let decreaseScore = 0;
  const increaseReasons: string[] = [];
  const decreaseReasons: string[] = [];

  // ── Increase signals ──────────────────────────────────────────────────────
  if (experienceHistory?.drift_analysis.dominant_trend === "strengthening") {
    increaseScore += 2;
    increaseReasons.push("drift strengthening");
  }
  if (experienceHistory?.confidence_trajectory.trend === "uptrend") {
    increaseScore += 2;
    increaseReasons.push("confidence trajectory rising");
  }
  if (marketBehavior === "accumulation") {
    increaseScore += 1;
    increaseReasons.push("market behavior: accumulation");
  }
  if (
    asymmetryScore.asymmetry_label === "highly_favorable" ||
    asymmetryScore.asymmetry_label === "favorable"
  ) {
    increaseScore += 1;
    increaseReasons.push(`asymmetry ${asymmetryScore.asymmetry_label}`);
  }

  // ── Decrease signals ──────────────────────────────────────────────────────
  if (experienceHistory?.drift_analysis.dominant_trend === "weakening") {
    const consecutive = experienceHistory.drift_analysis.consecutive_drift_count;
    if (consecutive >= 3) {
      decreaseScore += 3;
      decreaseReasons.push(`persistent weakening (${consecutive} cycles)`);
    } else {
      decreaseScore += 1;
      decreaseReasons.push("drift weakening");
    }
  }
  if (experienceHistory?.confidence_trajectory.trend === "downtrend") {
    decreaseScore += 2;
    decreaseReasons.push("confidence trajectory declining");
  }
  if (gradientRisk.risk_state === "critical") {
    decreaseScore += 4;
    decreaseReasons.push("critical risk state");
  } else if (gradientRisk.risk_state === "elevated") {
    decreaseScore += 2;
    decreaseReasons.push("elevated gradient risk");
  }
  if (thesisConfidence < 0.40) {
    decreaseScore += 2;
    decreaseReasons.push(`low thesis confidence (${(thesisConfidence * 100).toFixed(0)}%)`);
  }
  if (
    experienceHistory?.meta_insight.learning_signal
      ?.toLowerCase()
      .includes("structural")
  ) {
    decreaseScore += 2;
    decreaseReasons.push("structural deterioration detected in experience history");
  }

  // ── Hard avoid ────────────────────────────────────────────────────────────
  if (
    gradientRisk.risk_state === "critical" &&
    experienceHistory?.drift_analysis.dominant_trend === "weakening"
  ) {
    return {
      adjustment: "avoid",
      adjustment_pct: previousPosition.target_position_pct,
      reason: "Critical risk + persistent weakening — exit or avoid entirely.",
      advisory_only: true,
    };
  }

  // ── Net score decision ────────────────────────────────────────────────────
  const net = increaseScore - decreaseScore;

  if (net >= 3) {
    const adj_pct = Math.round(Math.min(previousPosition.target_position_pct * 0.25, 3) * 10) / 10;
    return {
      adjustment: "increase",
      adjustment_pct: adj_pct,
      reason: `Increase: ${increaseReasons.join(", ")}.`,
      advisory_only: true,
    };
  } else if (net <= -3) {
    const adj_pct = Math.round(Math.min(previousPosition.target_position_pct * 0.30, 4) * 10) / 10;
    return {
      adjustment: "decrease",
      adjustment_pct: adj_pct,
      reason: `Reduce 20–30%: ${decreaseReasons.join(", ")}.`,
      advisory_only: true,
    };
  } else if (net < 0) {
    const adj_pct = Math.round(Math.min(previousPosition.target_position_pct * 0.15, 2) * 10) / 10;
    return {
      adjustment: "decrease",
      adjustment_pct: adj_pct,
      reason: `Modest reduction: ${decreaseReasons.join(", ")}.`,
      advisory_only: true,
    };
  } else {
    const allReasons = [...increaseReasons, ...decreaseReasons];
    return {
      adjustment: "hold",
      adjustment_pct: 0,
      reason: `Hold current position — no dominant signal for adjustment.${allReasons.length > 0 ? " " + allReasons.join(", ") + "." : ""}`,
      advisory_only: true,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4 — NO-BET / LOW-BET ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface NoBetDisciplineOutput {
  bet_allowed: boolean;
  restriction_level: RestrictionLevel;
  reason: string;
  advisory_only: true;
}

export interface NoBetDisciplineContext {
  asymmetryScore: AsymmetryScoreOutput;
  gradientRisk: GradientRiskOutput;
  businessContext: BusinessContext;
  signalDensity?: SignalDensityResult;
  experienceHistory?: ExperienceHistorySummary;
  strategyOverfitFlag?: boolean;
}

/**
 * [LEVEL10.5 Module 4] Enforce no-bet / low-bet discipline.
 *
 * Hard no-bet conditions:
 *   - outside competence + weak/unknown moat
 *   - asymmetry_score < 0.20
 *   - critical risk state
 *   - strategy overfit flag
 *   - signal density failed + density_score < 0.25
 *
 * Soft restriction conditions:
 *   - research_required eligibility
 *   - volatile confidence trajectory
 *   - mixed/unclear drift
 *   - elevated gradient risk
 *
 * Goal: Teach DanTree that sometimes the best position is no position.
 */
export function enforceNoBetDiscipline(
  ctx: NoBetDisciplineContext
): NoBetDisciplineOutput {
  const { asymmetryScore, gradientRisk, businessContext, signalDensity, experienceHistory, strategyOverfitFlag } = ctx;
  const eligibility = businessContext.eligibility.eligibility_status;
  const competence = businessContext.competenceFit.competence_fit;
  const moat = businessContext.businessUnderstanding.moat_strength;

  // ── HARD NO-BET conditions ────────────────────────────────────────────────
  if (competence === "outside" && (moat === "weak" || moat === "unknown")) {
    return {
      bet_allowed: false,
      restriction_level: "hard",
      reason:
        "Hard no-bet: outside competence boundary combined with weak/unknown moat — no edge exists.",
      advisory_only: true,
    };
  }
  if (asymmetryScore.asymmetry_score < 0.20) {
    return {
      bet_allowed: false,
      restriction_level: "hard",
      reason: `Hard no-bet: asymmetry score ${(asymmetryScore.asymmetry_score * 100).toFixed(0)}% below minimum threshold (20%) — risk/reward does not justify capital.`,
      advisory_only: true,
    };
  }
  if (gradientRisk.risk_state === "critical") {
    return {
      bet_allowed: false,
      restriction_level: "hard",
      reason:
        "Hard no-bet: gradient risk state is critical — capital preservation is the only rational action.",
      advisory_only: true,
    };
  }
  if (strategyOverfitFlag === true) {
    return {
      bet_allowed: false,
      restriction_level: "hard",
      reason:
        "Hard no-bet: current strategy version flagged as overfit — no new positions until strategy is re-validated.",
      advisory_only: true,
    };
  }
  if (signalDensity && !signalDensity.passed && signalDensity.density_score < 0.25) {
    return {
      bet_allowed: false,
      restriction_level: "hard",
      reason: `Hard no-bet: signal density failed (score: ${(signalDensity.density_score * 100).toFixed(0)}%) — insufficient data quality to justify capital allocation.`,
      advisory_only: true,
    };
  }

  // ── SOFT RESTRICTION conditions ───────────────────────────────────────────
  const softReasons: string[] = [];

  if (eligibility === "research_required") {
    softReasons.push("eligibility: research_required — further due diligence needed");
  }
  if (experienceHistory?.confidence_trajectory.trend === "volatile") {
    softReasons.push(
      "confidence trajectory volatile — thesis is sensitive to new information"
    );
  }
  if (experienceHistory?.drift_analysis.dominant_trend === "mixed") {
    softReasons.push(
      "unclear drift pattern — no dominant thesis direction established"
    );
  }
  if (gradientRisk.risk_state === "elevated") {
    softReasons.push("gradient risk elevated — size conservatively");
  }

  if (softReasons.length >= 2) {
    return {
      bet_allowed: true,
      restriction_level: "soft",
      reason: `Soft restriction: ${softReasons.join("; ")}. Starter or small position only.`,
      advisory_only: true,
    };
  }
  if (softReasons.length === 1) {
    return {
      bet_allowed: true,
      restriction_level: "soft",
      reason: `Soft restriction: ${softReasons[0]}. Proceed with reduced conviction sizing.`,
      advisory_only: true,
    };
  }

  // ── No restriction ────────────────────────────────────────────────────────
  return {
    bet_allowed: true,
    restriction_level: "none",
    reason: `No restriction: asymmetry ${asymmetryScore.asymmetry_label}, risk ${gradientRisk.risk_state}, eligibility ${eligibility}. Proceed with full sizing framework.`,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 5 — PORTFOLIO CONCENTRATION GOVERNOR
// ─────────────────────────────────────────────────────────────────────────────

export interface PositionEntry105 {
  ticker: string;
  size_bucket: SizeBucket105;
  target_position_pct: number;
  regime_tag?: string;
  drift_trend?: string;
  sector?: string;
}

export interface ConcentrationGovernorOutput {
  concentration_risk: ConcentrationRisk;
  max_allowed_size: number;
  portfolio_reason: string;
  advisory_only: true;
}

/**
 * [LEVEL10.5 Module 5] Portfolio concentration governor.
 * Prevents fake diversification — detects shared factor/regime/narrative clustering.
 *
 * Rules:
 *   - Total portfolio exposure capped at 80%
 *   - Same-regime exposure > 25% → cap candidate at starter
 *   - 3+ weakening positions + candidate weakening → hard cap at 2%
 *   - Same-sector exposure > 20% → diversification cap
 *   - 3+ large/max positions → cap new additions
 */
export function computePortfolioConcentration(
  positionSet: PositionEntry105[],
  candidatePosition: PositionEntry105
): ConcentrationGovernorOutput {
  const totalExistingPct = positionSet.reduce((sum, p) => sum + p.target_position_pct, 0);

  // ── Total portfolio exposure cap ──────────────────────────────────────────
  const remainingCapacity = Math.max(0, 80 - totalExistingPct);
  if (remainingCapacity <= 0) {
    return {
      concentration_risk: "high",
      max_allowed_size: 0,
      portfolio_reason: `Portfolio at capacity (${totalExistingPct.toFixed(1)}% allocated) — no room for new positions until existing ones are reduced.`,
      advisory_only: true,
    };
  }

  // ── Regime clustering ─────────────────────────────────────────────────────
  const sameRegimePct = positionSet
    .filter(p => p.regime_tag && p.regime_tag === candidatePosition.regime_tag)
    .reduce((sum, p) => sum + p.target_position_pct, 0);

  // ── Drift clustering ──────────────────────────────────────────────────────
  const weakeningCount = positionSet.filter(p => p.drift_trend === "weakening").length;
  const candidateWeakening = candidatePosition.drift_trend === "weakening";

  // ── Sector clustering ─────────────────────────────────────────────────────
  const sameSectorPct = positionSet
    .filter(p => p.sector && p.sector === candidatePosition.sector)
    .reduce((sum, p) => sum + p.target_position_pct, 0);

  // ── Large position count ──────────────────────────────────────────────────
  const largeCount = positionSet.filter(
    p => p.size_bucket === "large" || p.size_bucket === "max"
  ).length;

  // ── Determine concentration risk & cap ───────────────────────────────────
  const reasons: string[] = [];
  let maxAllowed = Math.min(15, remainingCapacity);
  let concentrationRisk: ConcentrationRisk = "low";

  if (sameRegimePct > 25) {
    concentrationRisk = "high";
    maxAllowed = Math.min(maxAllowed, 3);
    reasons.push(`same-regime exposure already ${sameRegimePct.toFixed(1)}% — capping at starter`);
  } else if (sameRegimePct > 15) {
    if (concentrationRisk === "low") concentrationRisk = "medium";
    maxAllowed = Math.min(maxAllowed, 6);
    reasons.push(`same-regime exposure ${sameRegimePct.toFixed(1)}% — moderate cap applied`);
  }

  if (weakeningCount >= 3 && candidateWeakening) {
    concentrationRisk = "high";
    maxAllowed = Math.min(maxAllowed, 2);
    reasons.push(
      `${weakeningCount} existing positions with weakening drift — candidate also weakening, hard cap`
    );
  } else if (weakeningCount >= 2 && candidateWeakening) {
    if (concentrationRisk === "low") concentrationRisk = "medium";
    maxAllowed = Math.min(maxAllowed, 4);
    reasons.push(`${weakeningCount} weakening positions in portfolio — candidate adds to cluster`);
  }

  if (sameSectorPct > 20) {
    if (concentrationRisk === "low") concentrationRisk = "medium";
    maxAllowed = Math.min(maxAllowed, 5);
    reasons.push(`sector concentration ${sameSectorPct.toFixed(1)}% — diversification cap`);
  }

  if (largeCount >= 3) {
    if (concentrationRisk === "low") concentrationRisk = "medium";
    maxAllowed = Math.min(maxAllowed, 6);
    reasons.push(`${largeCount} large/max positions already in portfolio`);
  }

  maxAllowed = Math.round(maxAllowed * 10) / 10;

  const portfolio_reason =
    reasons.length > 0
      ? `Concentration risk ${concentrationRisk}: ${reasons.join("; ")}.`
      : `Concentration risk low — portfolio has ${positionSet.length} positions, ${totalExistingPct.toFixed(1)}% allocated. Candidate fits within diversification guidelines.`;

  return {
    concentration_risk: concentrationRisk,
    max_allowed_size: maxAllowed,
    portfolio_reason,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITE: Full Position Layer Output (Module 1 + 2 + 4)
// ─────────────────────────────────────────────────────────────────────────────

export interface PositionLayerOutput {
  asymmetry: AsymmetryScoreOutput;
  sizing: PositionSizingOutput;
  no_bet_discipline: NoBetDisciplineOutput;
  advisory_only: true;
}

/**
 * [LEVEL10.5] Run the full position layer pipeline for a single ticker.
 * Combines: asymmetry scoring + no-bet discipline + position sizing.
 * Size adjustment (Module 3) and concentration governor (Module 5) are separate
 * calls because they require external portfolio state.
 */
export function runPositionLayer(ctx: {
  thesis: InvestmentThesisOutput;
  payoutMap: PayoutMapOutput;
  gradientRisk: GradientRiskOutput;
  businessContext: BusinessContext;
  experienceHistory?: ExperienceHistorySummary;
  signalDensity?: SignalDensityResult;
  regimeTag?: string;
  strategyOverfitFlag?: boolean;
}): PositionLayerOutput {
  const asymmetry = computeAsymmetryScore({
    thesis: ctx.thesis,
    payoutMap: ctx.payoutMap,
    gradientRisk: ctx.gradientRisk,
    businessContext: ctx.businessContext,
    experienceHistory: ctx.experienceHistory,
    regimeTag: ctx.regimeTag,
  });

  const noBet = enforceNoBetDiscipline({
    asymmetryScore: asymmetry,
    gradientRisk: ctx.gradientRisk,
    businessContext: ctx.businessContext,
    signalDensity: ctx.signalDensity,
    experienceHistory: ctx.experienceHistory,
    strategyOverfitFlag: ctx.strategyOverfitFlag,
  });

  // If hard no-bet, sizing is zero
  const sizing: PositionSizingOutput = noBet.bet_allowed
    ? computePositionSizing({
        asymmetryScore: asymmetry,
        thesis: ctx.thesis,
        gradientRisk: ctx.gradientRisk,
        businessContext: ctx.businessContext,
        experienceHistory: ctx.experienceHistory,
        signalDensity: ctx.signalDensity,
      })
    : {
        target_position_pct: 0,
        size_bucket: "none" as SizeBucket105,
        sizing_rationale: `No position: ${noBet.reason}`,
        advisory_only: true,
      };

  return { asymmetry, sizing, no_bet_discipline: noBet, advisory_only: true };
}
