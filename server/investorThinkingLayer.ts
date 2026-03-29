/**
 * DANTREE LEVEL8.3 — Investor Thinking Layer
 *
 * Module 1: computeBusinessQuality()
 * Module 2: applyEventImpactAdjustment()
 * Module 3: Factor Hierarchy (alpha_score cap via BQ)
 * Module 4: generateFalsification()
 *
 * HARD RULES:
 * - DO NOT modify Level7/7.1/8 logic
 * - All outputs are advisory_only
 * - No new APIs — reuse existing signal data
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface LiveSignalData {
  ticker: string;
  price_momentum: number;   // [-1, 1]
  volatility: number;       // [0, 1]
  valuation_proxy: number;  // [0, 1]  high = cheap/quality
  news_sentiment: number;   // [-1, 1]
  macro_exposure: number;   // [-1, 1]
  event_signal?: {
    type: "policy" | "tech" | "earnings" | "geopolitics";
    severity: number;       // [0, 1]
  } | null;
  sector?: string;
  fallback_used?: boolean;
}

export interface BusinessQualityResult {
  business_quality_score: number;   // [0, 1]
  moat_strength: number;            // [0, 1]
  business_flags: string[];
}

export interface EventAdjustmentResult {
  adjusted_alpha_weight: number;    // multiplier [0.5, 1.5]
  adjusted_risk_weight: number;     // multiplier [0.5, 1.5]
  adjusted_macro_weight: number;    // multiplier [0.5, 2.0]
  adjusted_momentum_weight: number; // multiplier [0.5, 1.5]
  event_bias: "bullish" | "bearish" | "neutral" | "volatile";
  event_summary: string;
}

export interface FalsificationResult {
  why_might_be_wrong: string[];
  key_risk_flags: string[];
  invalidation_conditions: string[];
}

export interface InvestorThinkingOutput {
  ticker: string;
  business_quality: BusinessQualityResult;
  event_adjustment: EventAdjustmentResult;
  // Hierarchy-adjusted signal scores (after BQ cap + event weights)
  adjusted_alpha_score: number;     // [0, 1]
  adjusted_danger_score: number;    // [0, 1]
  adjusted_trigger_score: number;   // [0, 1]
  adjusted_memory_score: number;    // [0, 1]
  dominant_factor: string;
  falsification: FalsificationResult;
  advisory_only: true;
}

// ─────────────────────────────────────────────
// MODULE 1 — Business Quality Layer
// ─────────────────────────────────────────────

// Simple sector quality heuristics (no API needed)
const SECTOR_QUALITY_MAP: Record<string, number> = {
  technology: 0.75,
  healthcare: 0.70,
  consumer_staples: 0.72,
  financials: 0.60,
  industrials: 0.58,
  energy: 0.45,
  materials: 0.42,
  utilities: 0.55,
  real_estate: 0.50,
  communication_services: 0.65,
  consumer_discretionary: 0.55,
};

export function computeBusinessQuality(
  ticker: string,
  signal: LiveSignalData
): BusinessQualityResult {
  const flags: string[] = [];
  let score = 0.5; // neutral baseline
  let moat = 0.5;

  // ── Stability proxy: low volatility = stable business
  if (signal.volatility < 0.2) {
    score += 0.15;
    moat += 0.15;
    flags.push("low_volatility_stable");
  } else if (signal.volatility < 0.35) {
    score += 0.08;
    moat += 0.08;
  } else if (signal.volatility > 0.65) {
    score -= 0.15;
    moat -= 0.10;
    flags.push("high_volatility_unstable");
  } else if (signal.volatility > 0.5) {
    score -= 0.08;
    moat -= 0.05;
  }

  // ── Valuation proxy: high valuation_proxy = cheap/quality
  if (signal.valuation_proxy > 0.65) {
    score += 0.12;
    moat += 0.10;
    flags.push("attractive_valuation");
  } else if (signal.valuation_proxy > 0.5) {
    score += 0.05;
  } else if (signal.valuation_proxy < 0.25) {
    score -= 0.12;
    moat -= 0.08;
    flags.push("expensive_or_weak_valuation");
  }

  // ── Price consistency: stable positive momentum = quality
  const momentumAbs = Math.abs(signal.price_momentum);
  if (signal.price_momentum > 0.3 && momentumAbs < 0.7) {
    score += 0.08;
    flags.push("consistent_positive_momentum");
  } else if (momentumAbs > 0.8) {
    score -= 0.10;
    flags.push("erratic_momentum_penalty");
  }

  // ── Sector heuristic
  const sectorKey = (signal.sector ?? "").toLowerCase().replace(/\s+/g, "_");
  const sectorBase = SECTOR_QUALITY_MAP[sectorKey];
  if (sectorBase !== undefined) {
    // blend 20% sector heuristic into score
    score = score * 0.8 + sectorBase * 0.2;
    moat = moat * 0.8 + sectorBase * 0.2;
    if (sectorBase >= 0.70) flags.push(`quality_sector_${sectorKey}`);
    if (sectorBase <= 0.45) flags.push(`cyclical_sector_${sectorKey}`);
  }

  // ── Macro sensitivity penalty
  if (Math.abs(signal.macro_exposure) > 0.6) {
    score -= 0.05;
    flags.push("high_macro_sensitivity");
  }

  // ── Fallback penalty: uncertain data
  if (signal.fallback_used) {
    score -= 0.05;
    flags.push("data_fallback_uncertainty");
  }

  // Clamp
  const bqs = Math.max(0, Math.min(1, score));
  const ms = Math.max(0, Math.min(1, moat));

  return {
    business_quality_score: parseFloat(bqs.toFixed(3)),
    moat_strength: parseFloat(ms.toFixed(3)),
    business_flags: flags,
  };
}

// ─────────────────────────────────────────────
// MODULE 2 — Event Impact Adjustment Layer
// ─────────────────────────────────────────────

export function applyEventImpactAdjustment(
  signal: LiveSignalData,
  bq: BusinessQualityResult
): EventAdjustmentResult {
  const event = signal.event_signal;

  // Defaults: neutral multipliers
  let alphaW = 1.0;
  let riskW = 1.0;
  let macroW = 1.0;
  let momentumW = 1.0;
  let bias: EventAdjustmentResult["event_bias"] = "neutral";
  let summary = "No significant event detected. Standard signal weights applied.";

  if (!event || event.severity < 0.1) {
    return {
      adjusted_alpha_weight: alphaW,
      adjusted_risk_weight: riskW,
      adjusted_macro_weight: macroW,
      adjusted_momentum_weight: momentumW,
      event_bias: bias,
      event_summary: summary,
    };
  }

  const sev = event.severity; // [0, 1]

  switch (event.type) {
    case "geopolitics":
      // Geopolitics: increase risk, decrease alpha — uncertainty dominates
      riskW = 1.0 + sev * 0.5;       // up to 1.5x risk weight
      alphaW = 1.0 - sev * 0.3;      // down to 0.7x alpha weight
      macroW = 1.0 + sev * 0.3;      // macro more relevant
      bias = "bearish";
      summary = `Geopolitical event (severity=${sev.toFixed(2)}): risk weight ↑${(riskW).toFixed(2)}x, alpha weight ↓${(alphaW).toFixed(2)}x. Uncertainty premium applied.`;
      break;

    case "policy":
      // Policy: macro influence dominates, alpha partially suppressed
      macroW = 1.0 + sev * 0.8;      // up to 1.8x macro weight
      alphaW = 1.0 - sev * 0.2;      // slight alpha reduction
      riskW = 1.0 + sev * 0.2;       // modest risk increase
      bias = sev > 0.6 ? "bearish" : "volatile";
      summary = `Policy event (severity=${sev.toFixed(2)}): macro weight ↑${(macroW).toFixed(2)}x. Rate/regulatory impact elevated.`;
      break;

    case "earnings":
      // Earnings: momentum becomes primary signal temporarily
      momentumW = 1.0 + sev * 0.5;   // up to 1.5x momentum weight
      alphaW = 1.0 + sev * 0.2;      // alpha slightly boosted
      riskW = 1.0 + sev * 0.15;      // modest risk (earnings surprise risk)
      bias = signal.price_momentum > 0 ? "bullish" : "bearish";
      summary = `Earnings event (severity=${sev.toFixed(2)}): momentum weight ↑${(momentumW).toFixed(2)}x. Short-term price action elevated.`;
      break;

    case "tech":
      // Tech disruption: if high BQ → opportunity; if low BQ → penalize valuation
      if (bq.business_quality_score >= 0.6) {
        alphaW = 1.0 + sev * 0.3;    // quality tech companies benefit
        bias = "bullish";
        summary = `Tech event (severity=${sev.toFixed(2)}): high-quality business benefits. Alpha weight ↑${(alphaW).toFixed(2)}x.`;
      } else {
        alphaW = 1.0 - sev * 0.35;   // weak businesses penalized
        riskW = 1.0 + sev * 0.4;
        bias = "bearish";
        summary = `Tech disruption event (severity=${sev.toFixed(2)}): low-quality business penalized. Alpha ↓${(alphaW).toFixed(2)}x, risk ↑${(riskW).toFixed(2)}x.`;
      }
      break;
  }

  return {
    adjusted_alpha_weight: parseFloat(Math.max(0.5, Math.min(1.5, alphaW)).toFixed(3)),
    adjusted_risk_weight: parseFloat(Math.max(0.5, Math.min(1.5, riskW)).toFixed(3)),
    adjusted_macro_weight: parseFloat(Math.max(0.5, Math.min(2.0, macroW)).toFixed(3)),
    adjusted_momentum_weight: parseFloat(Math.max(0.5, Math.min(1.5, momentumW)).toFixed(3)),
    event_bias: bias,
    event_summary: summary,
  };
}

// ─────────────────────────────────────────────
// MODULE 3 — Factor Hierarchy
// Applies BQ cap + event-adjusted weights to compute final scores
// ─────────────────────────────────────────────

const BQ_ALPHA_CAP_THRESHOLD = 0.35; // BQ below this → cap max alpha
const BQ_ALPHA_MAX_CAP = 0.55;       // bad business cannot rank above 0.55

export function applyFactorHierarchy(
  signal: LiveSignalData,
  bq: BusinessQualityResult,
  eventAdj: EventAdjustmentResult
): {
  adjusted_alpha_score: number;
  adjusted_danger_score: number;
  adjusted_trigger_score: number;
  adjusted_memory_score: number;
  dominant_factor: string;
} {
  const {
    price_momentum: m,
    volatility: v,
    valuation_proxy: val,
    news_sentiment: ns,
    macro_exposure: macro,
  } = signal;

  const {
    adjusted_alpha_weight: aw,
    adjusted_risk_weight: rw,
    adjusted_macro_weight: mw,
    adjusted_momentum_weight: momw,
  } = eventAdj;

  // Normalize momentum from [-1,1] to [0,1]
  const m01 = (m + 1) / 2;
  const ns01 = (ns + 1) / 2;
  const macroAbs = Math.abs(macro);

  // ── Step 2: Event-adjusted signal scores
  let alpha = (
    aw * (0.35 * m01 + 0.25 * (1 - v) + 0.25 * val + 0.15 * ns01) +
    momw * 0.1 * m01  // extra momentum boost from event
  ) / (aw + momw * 0.1);

  let danger = (
    rw * (0.4 * v + 0.35 * (1 - m01) + 0.25 * macroAbs) +
    mw * 0.05 * macroAbs
  ) / (rw + mw * 0.05);

  let trigger = (
    0.4 * (signal.event_signal?.severity ?? 0) +
    momw * 0.35 * m01 +
    0.25 * ns01
  );

  let memory = (
    0.5 * val +
    0.3 * (1 - v) +
    0.2 * ns01
  );

  // ── Step 1: BQ gate — bad business cannot rank top
  if (bq.business_quality_score < BQ_ALPHA_CAP_THRESHOLD) {
    alpha = Math.min(alpha, BQ_ALPHA_MAX_CAP);
  }

  // Clamp all to [0, 1]
  alpha = Math.max(0, Math.min(1, alpha));
  danger = Math.max(0, Math.min(1, danger));
  trigger = Math.max(0, Math.min(1, trigger));
  memory = Math.max(0, Math.min(1, memory));

  // Determine dominant factor
  const factors: Record<string, number> = {
    business_quality: bq.business_quality_score,
    event_impact: signal.event_signal?.severity ?? 0,
    price_momentum: m01,
    valuation: val,
    volatility_risk: v,
  };
  const dominant_factor = Object.entries(factors).sort((a, b) => b[1] - a[1])[0][0];

  return {
    adjusted_alpha_score: parseFloat(alpha.toFixed(3)),
    adjusted_danger_score: parseFloat(danger.toFixed(3)),
    adjusted_trigger_score: parseFloat(trigger.toFixed(3)),
    adjusted_memory_score: parseFloat(memory.toFixed(3)),
    dominant_factor,
  };
}

// ─────────────────────────────────────────────
// MODULE 4 — Falsification Layer
// Every decision MUST include at least 1 falsification
// ─────────────────────────────────────────────

export function generateFalsification(
  ticker: string,
  signal: LiveSignalData,
  bq: BusinessQualityResult,
  eventAdj: EventAdjustmentResult,
  adjusted_alpha_score: number,
  adjusted_danger_score: number
): FalsificationResult {
  const why_might_be_wrong: string[] = [];
  const key_risk_flags: string[] = [];
  const invalidation_conditions: string[] = [];

  // ── Signal-based falsifications
  if (signal.price_momentum > 0.5) {
    why_might_be_wrong.push("Momentum may be short-term only — mean reversion risk.");
    invalidation_conditions.push("Price momentum reverses below 0 within 2 weeks.");
  }

  if (signal.volatility > 0.5) {
    why_might_be_wrong.push("High volatility suggests business instability or market uncertainty.");
    key_risk_flags.push("volatility_elevated");
    invalidation_conditions.push("Volatility remains above 0.6 for 3+ consecutive sessions.");
  }

  if (signal.fallback_used) {
    why_might_be_wrong.push("Signal based on fallback data — primary data source unavailable.");
    key_risk_flags.push("data_quality_uncertain");
    invalidation_conditions.push("Primary data source confirms different signal direction.");
  }

  // ── Event-based falsifications
  if (signal.event_signal) {
    const ev = signal.event_signal;
    if (ev.type === "earnings") {
      why_might_be_wrong.push("Event-driven spike may reverse post-earnings if guidance disappoints.");
      key_risk_flags.push("earnings_event_reversal_risk");
      invalidation_conditions.push("Post-earnings price drops >5% within 3 days.");
    }
    if (ev.type === "geopolitics") {
      why_might_be_wrong.push("Geopolitical situation may escalate beyond current severity estimate.");
      key_risk_flags.push("geopolitical_escalation_risk");
      invalidation_conditions.push("Geopolitical severity increases to critical level.");
    }
    if (ev.type === "policy") {
      why_might_be_wrong.push("Policy impact may be larger or smaller than current market pricing.");
      invalidation_conditions.push("Central bank policy changes more than 50bps from expectation.");
    }
    if (ev.type === "tech") {
      why_might_be_wrong.push("Tech disruption impact on business model may be underestimated.");
      key_risk_flags.push("tech_disruption_uncertainty");
      invalidation_conditions.push("Competitor announces breakthrough product in same category.");
    }
  }

  // ── Business quality falsifications
  if (bq.business_quality_score < 0.4) {
    why_might_be_wrong.push("Low business quality score — underlying business may be structurally weak.");
    key_risk_flags.push("weak_business_quality");
    invalidation_conditions.push("Business quality score remains below 0.4 for 2+ consecutive runs.");
  }

  if (bq.business_flags.includes("expensive_or_weak_valuation")) {
    why_might_be_wrong.push("Valuation proxy suggests expensive or deteriorating fundamentals.");
    key_risk_flags.push("valuation_concern");
    invalidation_conditions.push("P/E or EV/EBITDA expands beyond sector average by >30%.");
  }

  // ── Decision-level falsifications
  if (adjusted_alpha_score > 0.75) {
    why_might_be_wrong.push("High alpha score may reflect recency bias from recent positive momentum.");
    invalidation_conditions.push("Alpha score drops below 0.5 in next system run.");
  }

  if (adjusted_danger_score > 0.6) {
    why_might_be_wrong.push("Elevated danger score — position may face guard suppression in next cycle.");
    key_risk_flags.push("danger_guard_risk");
    invalidation_conditions.push("Danger score exceeds 0.75 triggering CRITICAL_DANGER guard.");
  }

  // Macro sensitivity
  if (Math.abs(signal.macro_exposure) > 0.5) {
    why_might_be_wrong.push("High macro sensitivity — Fed policy or yield curve shift could invalidate thesis.");
    key_risk_flags.push("macro_sensitivity_high");
    invalidation_conditions.push("10Y yield moves more than 50bps against current trend.");
  }

  // Guarantee at least 1 falsification
  if (why_might_be_wrong.length === 0) {
    why_might_be_wrong.push("Insufficient signal history to fully validate thesis — treat as preliminary.");
    invalidation_conditions.push("Any single signal dimension reverses by more than 0.3 in next run.");
  }

  return {
    why_might_be_wrong,
    key_risk_flags,
    invalidation_conditions,
  };
}

// ─────────────────────────────────────────────
// MODULE 5 — Full Investor Thinking Pipeline
// ─────────────────────────────────────────────

export function runInvestorThinking(
  signal: LiveSignalData
): InvestorThinkingOutput {
  // Step 1: Business Quality
  const bq = computeBusinessQuality(signal.ticker, signal);

  // Step 2: Event Impact Adjustment
  const eventAdj = applyEventImpactAdjustment(signal, bq);

  // Step 3: Factor Hierarchy (BQ cap + event weights → adjusted scores)
  const hierarchy = applyFactorHierarchy(signal, bq, eventAdj);

  // Step 4: Falsification
  const falsification = generateFalsification(
    signal.ticker,
    signal,
    bq,
    eventAdj,
    hierarchy.adjusted_alpha_score,
    hierarchy.adjusted_danger_score
  );

  return {
    ticker: signal.ticker,
    business_quality: bq,
    event_adjustment: eventAdj,
    ...hierarchy,
    falsification,
    advisory_only: true,
  };
}
