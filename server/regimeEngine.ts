/**
 * DANTREE LEVEL9 — Phase 3: Regime Awareness Engine
 *
 * Classifies the current market regime from available low-cost signals.
 * Regime is a context tag — NOT a trade signal.
 * advisory_only: always true
 *
 * Regime tags:
 *   "risk_on"      — favorable macro, low volatility, positive momentum
 *   "risk_off"     — danger + volatility + macro stress aligned
 *   "neutral"      — no strong directional signal
 *   "macro_stress" — rate pressure + risk deterioration
 *   "event_shock"  — high event severity dominates
 */

export type RegimeTag = "risk_on" | "risk_off" | "neutral" | "macro_stress" | "event_shock";

export interface RegimeInput {
  /** Fed Funds Rate (FRED DFF) — higher = tighter */
  fedFundsRate?: number;
  /** 10Y Treasury yield (FRED DGS10) */
  tenYearYield?: number;
  /** Volatility proxy (e.g. VIX-like, 0–1 normalized) */
  volatilityProxy?: number;
  /** Event severity from investorThinking (0–1) */
  eventSeverity?: number;
  /** Momentum stress: negative = weak momentum (−1 to +1) */
  momentumStress?: number;
  /** Danger score from signal pipeline (0–1) */
  dangerScore?: number;
  /** Market breadth proxy (optional, 0–1, higher = broader) */
  marketBreadth?: number;
}

export interface RegimeOutput {
  regime_tag: RegimeTag;
  regime_confidence: number;   // 0–1
  regime_reasons: string[];
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds (explicit, explainable, conservative)
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  HIGH_VOLATILITY: 0.65,
  ELEVATED_VOLATILITY: 0.45,
  HIGH_EVENT_SEVERITY: 0.70,
  ELEVATED_EVENT_SEVERITY: 0.50,
  HIGH_DANGER: 0.65,
  ELEVATED_DANGER: 0.45,
  HIGH_FED_FUNDS: 4.5,       // % — historically restrictive
  HIGH_10Y_YIELD: 4.5,       // % — historically elevated
  WEAK_MOMENTUM: -0.20,      // normalized
  STRONG_MOMENTUM: 0.20,
  LOW_BREADTH: 0.35,
  HIGH_BREADTH: 0.65,
};

/**
 * Compute a regime tag from available signal context.
 * Uses explicit rule-based logic — no opaque model behavior.
 */
export function computeRegimeTag(input: RegimeInput): RegimeOutput {
  const {
    fedFundsRate,
    tenYearYield,
    volatilityProxy = 0.3,
    eventSeverity = 0,
    momentumStress = 0,
    dangerScore = 0,
    marketBreadth,
  } = input;

  const reasons: string[] = [];
  let score_risk_off = 0;
  let score_risk_on = 0;
  let score_macro_stress = 0;
  let score_event_shock = 0;

  // ── Rule 1: Event shock — high event severity dominates ──────────────────
  if (eventSeverity >= THRESHOLDS.HIGH_EVENT_SEVERITY) {
    score_event_shock += 3;
    reasons.push("high_event_severity");
  } else if (eventSeverity >= THRESHOLDS.ELEVATED_EVENT_SEVERITY) {
    score_event_shock += 1;
    reasons.push("elevated_event_severity");
  }

  // ── Rule 2: Macro stress — rate pressure + risk deterioration ────────────
  const macroTight = (fedFundsRate != null && fedFundsRate >= THRESHOLDS.HIGH_FED_FUNDS)
    || (tenYearYield != null && tenYearYield >= THRESHOLDS.HIGH_10Y_YIELD);
  if (macroTight) {
    score_macro_stress += 2;
    reasons.push("high_macro_exposure");
  }

  // ── Rule 3: Elevated volatility ──────────────────────────────────────────
  if (volatilityProxy >= THRESHOLDS.HIGH_VOLATILITY) {
    score_risk_off += 2;
    score_macro_stress += 1;
    reasons.push("elevated_volatility");
  } else if (volatilityProxy >= THRESHOLDS.ELEVATED_VOLATILITY) {
    score_risk_off += 1;
    reasons.push("moderate_volatility");
  }

  // ── Rule 4: Danger score ─────────────────────────────────────────────────
  if (dangerScore >= THRESHOLDS.HIGH_DANGER) {
    score_risk_off += 2;
    reasons.push("high_danger_score");
  } else if (dangerScore >= THRESHOLDS.ELEVATED_DANGER) {
    score_risk_off += 1;
    reasons.push("elevated_danger_score");
  }

  // ── Rule 5: Momentum stress ──────────────────────────────────────────────
  if (momentumStress <= THRESHOLDS.WEAK_MOMENTUM) {
    score_risk_off += 1;
    score_macro_stress += 1;
    reasons.push("weak_momentum");
  } else if (momentumStress >= THRESHOLDS.STRONG_MOMENTUM) {
    score_risk_on += 2;
    reasons.push("strong_momentum");
  }

  // ── Rule 6: Market breadth (optional) ───────────────────────────────────
  if (marketBreadth != null) {
    if (marketBreadth >= THRESHOLDS.HIGH_BREADTH) {
      score_risk_on += 1;
      reasons.push("broad_market_participation");
    } else if (marketBreadth <= THRESHOLDS.LOW_BREADTH) {
      score_risk_off += 1;
      reasons.push("narrow_market_breadth");
    }
  }

  // ── Rule 7: risk_on conditions ───────────────────────────────────────────
  if (!macroTight && volatilityProxy < THRESHOLDS.ELEVATED_VOLATILITY && dangerScore < THRESHOLDS.ELEVATED_DANGER) {
    score_risk_on += 1;
    reasons.push("low_macro_pressure");
  }

  // ── Regime resolution (priority order) ──────────────────────────────────
  // event_shock dominates if very high
  if (score_event_shock >= 3) {
    return {
      regime_tag: "event_shock",
      regime_confidence: Math.min(0.95, 0.6 + score_event_shock * 0.1),
      regime_reasons: reasons,
      advisory_only: true,
    };
  }

  // risk_off dominates when danger + volatility + macro align
  const risk_off_total = score_risk_off + (macroTight ? 1 : 0);
  if (risk_off_total >= 4) {
    return {
      regime_tag: "risk_off",
      regime_confidence: Math.min(0.90, 0.55 + risk_off_total * 0.07),
      regime_reasons: reasons,
      advisory_only: true,
    };
  }

  // macro_stress when rate pressure is primary driver
  if (score_macro_stress >= 3 && score_risk_off < 4) {
    return {
      regime_tag: "macro_stress",
      regime_confidence: Math.min(0.85, 0.50 + score_macro_stress * 0.08),
      regime_reasons: reasons,
      advisory_only: true,
    };
  }

  // risk_on when momentum + breadth positive
  if (score_risk_on >= 3 && score_risk_off <= 1) {
    return {
      regime_tag: "risk_on",
      regime_confidence: Math.min(0.85, 0.50 + score_risk_on * 0.08),
      regime_reasons: reasons,
      advisory_only: true,
    };
  }

  // Default: neutral
  return {
    regime_tag: "neutral",
    regime_confidence: 0.50,
    regime_reasons: reasons.length > 0 ? reasons : ["no_strong_directional_signal"],
    advisory_only: true,
  };
}

/**
 * Build a RegimeInput from live signal data (convenience adapter).
 */
export function buildRegimeInputFromSignals(params: {
  fedFundsRate?: number;
  tenYearYield?: number;
  avgVolatility?: number;
  maxEventSeverity?: number;
  avgMomentum?: number;
  avgDanger?: number;
}): RegimeInput {
  return {
    fedFundsRate: params.fedFundsRate,
    tenYearYield: params.tenYearYield,
    volatilityProxy: params.avgVolatility != null
      ? Math.min(1, params.avgVolatility / 50) // normalize VIX-like 0–50 → 0–1
      : undefined,
    eventSeverity: params.maxEventSeverity,
    momentumStress: params.avgMomentum,
    dangerScore: params.avgDanger,
  };
}
