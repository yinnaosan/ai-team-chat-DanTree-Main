/**
 * DANTREE LEVEL9 — Phase 4: Factor Interaction Engine
 *
 * Recognizes that factors do not merely add — they interact.
 * All interactions are explicit, explainable, and bounded.
 * advisory_only: always true
 *
 * Minimum 4 interactions implemented:
 *   1. low BQ + tech disruption event → alpha cap + danger boost
 *   2. high BQ + earnings event → momentum confidence boost (bounded)
 *   3. risk_off regime + high valuation sensitivity → alpha penalty + danger increase
 *   4. high macro stress + weak momentum → trigger quality downgrade
 */

import type { RegimeTag } from "./regimeEngine";

export interface FactorInteractionInput {
  /** Business quality score (0–1) */
  businessQualityScore: number;
  /** Event type from investor thinking */
  eventType: string;
  /** Event severity (0–1) */
  eventSeverity: number;
  /** Current regime tag */
  regimeTag: RegimeTag;
  /** Raw alpha score before interaction (0–1) */
  alphaScore: number;
  /** Raw danger score before interaction (0–1) */
  dangerScore: number;
  /** Raw trigger score before interaction (0–1) */
  triggerScore: number;
  /** Valuation sensitivity proxy (0–1, higher = more sensitive to rate/macro) */
  valuationSensitivity?: number;
  /** Momentum stress (−1 to +1) */
  momentumStress?: number;
}

export interface FactorInteractionOutput {
  adjusted_alpha_score: number;     // bounded [0, 1]
  adjusted_danger_score: number;    // bounded [0, 1]
  adjusted_trigger_score: number;   // bounded [0, 1]
  interaction_reasons: string[];
  interaction_dominant_effect: string;
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction Rules (explicit thresholds)
// ─────────────────────────────────────────────────────────────────────────────

const RULES = {
  LOW_BQ: 0.35,
  HIGH_BQ: 0.65,
  TECH_DISRUPTION_EVENTS: ["tech", "disruption", "competition", "regulatory"],
  EARNINGS_EVENTS: ["earnings", "guidance", "revenue"],
  HIGH_EVENT_SEVERITY: 0.55,
  HIGH_VALUATION_SENSITIVITY: 0.60,
  WEAK_MOMENTUM: -0.15,
  HIGH_MACRO_STRESS_REGIMES: ["macro_stress", "risk_off"] as RegimeTag[],
  RISK_OFF_REGIMES: ["risk_off"] as RegimeTag[],

  // Adjustment magnitudes (conservative + bounded)
  ALPHA_CAP_LOW_BQ_TECH: 0.40,          // cap alpha at 0.40 for low BQ + tech disruption
  DANGER_BOOST_LOW_BQ_TECH: 0.15,       // +0.15 danger
  ALPHA_BOOST_HIGH_BQ_EARNINGS: 0.12,   // +0.12 alpha (bounded)
  ALPHA_PENALTY_RISK_OFF_VALUATION: 0.15, // −0.15 alpha
  DANGER_BOOST_RISK_OFF_VALUATION: 0.12, // +0.12 danger
  TRIGGER_DOWNGRADE_MACRO_WEAK_MOM: 0.15, // −0.15 trigger
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function isTechDisruptionEvent(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return RULES.TECH_DISRUPTION_EVENTS.some((k) => lower.includes(k));
}

function isEarningsEvent(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return RULES.EARNINGS_EVENTS.some((k) => lower.includes(k));
}

/**
 * Apply factor interaction rules to produce adjusted scores.
 * All adjustments are bounded and explainable.
 */
export function applyFactorInteraction(input: FactorInteractionInput): FactorInteractionOutput {
  let alpha = input.alphaScore;
  let danger = input.dangerScore;
  let trigger = input.triggerScore;
  const reasons: string[] = [];
  const effects: string[] = [];

  const valSensitivity = input.valuationSensitivity ?? 0.5;
  const momentum = input.momentumStress ?? 0;

  // ── Interaction 1: Low BQ + Tech Disruption Event ────────────────────────
  // → alpha cap + danger boost
  if (
    input.businessQualityScore <= RULES.LOW_BQ &&
    isTechDisruptionEvent(input.eventType) &&
    input.eventSeverity >= RULES.HIGH_EVENT_SEVERITY
  ) {
    const prevAlpha = alpha;
    alpha = Math.min(alpha, RULES.ALPHA_CAP_LOW_BQ_TECH);
    danger = clamp(danger + RULES.DANGER_BOOST_LOW_BQ_TECH);
    if (prevAlpha > RULES.ALPHA_CAP_LOW_BQ_TECH) {
      reasons.push(`low_bq_tech_disruption: alpha capped ${prevAlpha.toFixed(3)}→${alpha.toFixed(3)}, danger +${RULES.DANGER_BOOST_LOW_BQ_TECH}`);
      effects.push("alpha_cap_danger_boost");
    } else {
      reasons.push(`low_bq_tech_disruption: danger +${RULES.DANGER_BOOST_LOW_BQ_TECH}`);
      effects.push("danger_boost");
    }
  }

  // ── Interaction 2: High BQ + Earnings Event ──────────────────────────────
  // → momentum confidence boost (bounded)
  if (
    input.businessQualityScore >= RULES.HIGH_BQ &&
    isEarningsEvent(input.eventType) &&
    input.eventSeverity >= 0.30
  ) {
    const boost = Math.min(RULES.ALPHA_BOOST_HIGH_BQ_EARNINGS, (1 - alpha) * 0.5);
    alpha = clamp(alpha + boost);
    reasons.push(`high_bq_earnings: alpha +${boost.toFixed(3)} (momentum confidence boost)`);
    effects.push("alpha_boost");
  }

  // ── Interaction 3: Risk-Off Regime + High Valuation Sensitivity ──────────
  // → alpha penalty + danger increase
  if (
    RULES.RISK_OFF_REGIMES.includes(input.regimeTag) &&
    valSensitivity >= RULES.HIGH_VALUATION_SENSITIVITY
  ) {
    alpha = clamp(alpha - RULES.ALPHA_PENALTY_RISK_OFF_VALUATION);
    danger = clamp(danger + RULES.DANGER_BOOST_RISK_OFF_VALUATION);
    reasons.push(`risk_off_valuation_sensitive: alpha −${RULES.ALPHA_PENALTY_RISK_OFF_VALUATION}, danger +${RULES.DANGER_BOOST_RISK_OFF_VALUATION}`);
    effects.push("alpha_penalty_danger_increase");
  }

  // ── Interaction 4: High Macro Stress + Weak Momentum ────────────────────
  // → trigger quality downgrade
  if (
    RULES.HIGH_MACRO_STRESS_REGIMES.includes(input.regimeTag) &&
    momentum <= RULES.WEAK_MOMENTUM
  ) {
    trigger = clamp(trigger - RULES.TRIGGER_DOWNGRADE_MACRO_WEAK_MOM);
    reasons.push(`macro_stress_weak_momentum: trigger −${RULES.TRIGGER_DOWNGRADE_MACRO_WEAK_MOM} (quality downgrade)`);
    effects.push("trigger_downgrade");
  }

  // ── Determine dominant effect ────────────────────────────────────────────
  const dominantEffect = effects.length > 0 ? effects[0] : "no_interaction";

  return {
    adjusted_alpha_score: clamp(alpha),
    adjusted_danger_score: clamp(danger),
    adjusted_trigger_score: clamp(trigger),
    interaction_reasons: reasons,
    interaction_dominant_effect: dominantEffect,
    advisory_only: true,
  };
}
