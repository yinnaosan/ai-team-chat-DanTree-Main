/**
 * LEVEL10.3-C — Experience Layer (Real-World Adaptive Thinking)
 *
 * This is NOT a data layer. This is NOT a signal layer.
 * This is a JUDGMENT EVOLUTION LAYER.
 *
 * Teaches the system to:
 * - Think in gradients, not binary triggers
 * - Detect "drift" instead of waiting for failure triggers
 * - Interpret management and market behavior dynamically
 * - Express uncertainty as evolving confidence, not fixed states
 * - Simulate "experience accumulation" across time
 *
 * advisory_only: true — all outputs are for informational purposes only.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ThesisHistoryContext {
  ticker: string;
  previous_critical_driver: string;
  previous_confidence: number;          // 0–1
  previous_drift_state: "strengthening" | "weakening" | "unclear" | "none";
  previous_key_variables: string[];     // variable names from last run
  previous_narrative_summary: string;   // short summary of last thesis
  last_updated_ms: number;              // UTC timestamp
}

export interface CurrentThesisContext {
  ticker: string;
  current_critical_driver: string;
  current_confidence: number;           // 0–1 (from buildInvestmentThesis)
  current_key_variables: string[];
  signal_fusion_score: number;          // 0–1
  bq_score: number;                     // 0–1 (business quality)
  regime_tag: string;                   // from regimeEngine
  has_event_shock: boolean;
  narrative_summary: string;            // short summary of current thesis
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1 — DRIFT DETECTION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface DriftDetectionOutput {
  drift_direction: "strengthening" | "weakening" | "unclear";
  drift_intensity: number;              // 0.0–1.0 (0 = no drift, 1 = max drift)
  drift_signal: string;                 // human-readable explanation
  confidence_change: number;            // suggested change to apply (-0.15 to +0.15)
  advisory_only: true;
}

/**
 * [LEVEL10.3-C Module 1] Detect thesis drift by comparing previous vs current context.
 * Thinks in gradients: not "broken" or "intact" but "direction + intensity".
 * Compares: critical_driver alignment, variable trends, narrative consistency, signal momentum.
 */
export function detectThesisDrift(
  history: ThesisHistoryContext,
  current: CurrentThesisContext
): DriftDetectionOutput {
  // No history → no drift to detect
  if (history.previous_drift_state === "none" || history.previous_confidence === 0) {
    return {
      drift_direction: "unclear",
      drift_intensity: 0.0,
      drift_signal: "No prior thesis context available — establishing baseline. Drift detection will activate on next cycle.",
      confidence_change: 0.0,
      advisory_only: true,
    };
  }

  let driftScore = 0.0;
  const signals: string[] = [];

  // ── 1. Critical driver alignment ──────────────────────────────────────────
  const driverSimilarity = computeTextSimilarity(
    history.previous_critical_driver,
    current.current_critical_driver
  );
  if (driverSimilarity < 0.4) {
    driftScore += 0.30;
    signals.push(`Critical driver has shifted materially (similarity: ${(driverSimilarity * 100).toFixed(0)}%) — the thesis anchor has moved.`);
  } else if (driverSimilarity < 0.65) {
    driftScore += 0.15;
    signals.push(`Critical driver shows partial drift — same domain but emphasis has changed.`);
  }

  // ── 2. Signal momentum direction ──────────────────────────────────────────
  const signalDelta = current.signal_fusion_score - (history.previous_confidence * 0.8);
  if (signalDelta < -0.12) {
    driftScore += 0.25;
    signals.push(`Signal fusion score has declined (Δ${(signalDelta * 100).toFixed(1)}%) — supporting evidence is weakening.`);
  } else if (signalDelta > 0.12) {
    driftScore -= 0.15; // negative drift = strengthening
    signals.push(`Signal fusion score has improved (Δ+${(signalDelta * 100).toFixed(1)}%) — thesis support is building.`);
  }

  // ── 3. BQ trend ───────────────────────────────────────────────────────────
  if (current.bq_score < 0.5 && history.previous_confidence > 0.65) {
    driftScore += 0.20;
    signals.push(`Business quality score has deteriorated while prior confidence was high — quality-confidence gap is widening.`);
  } else if (current.bq_score > 0.7 && history.previous_confidence < 0.55) {
    driftScore -= 0.10;
    signals.push(`Business quality is improving relative to prior low-confidence state.`);
  }

  // ── 4. Regime shift ───────────────────────────────────────────────────────
  if (current.regime_tag === "macro_stress" || current.regime_tag === "risk_off") {
    driftScore += 0.15;
    signals.push(`Regime has shifted to ${current.regime_tag} — macro headwind is creating thesis pressure.`);
  } else if (current.regime_tag === "risk_on" && history.previous_drift_state === "weakening") {
    driftScore -= 0.10;
    signals.push(`Risk-on regime may be providing temporary relief to a previously weakening thesis.`);
  }

  // ── 5. Event shock amplifier ──────────────────────────────────────────────
  if (current.has_event_shock) {
    driftScore += 0.10;
    signals.push(`Event shock detected — drift intensity amplified by near-term catalyst uncertainty.`);
  }

  // ── 6. Variable overlap ───────────────────────────────────────────────────
  const prevVars = new Set(history.previous_key_variables);
  const currVars = current.current_key_variables;
  const overlap = currVars.filter(v => prevVars.has(v)).length;
  const overlapRatio = prevVars.size > 0 ? overlap / prevVars.size : 1;
  if (overlapRatio < 0.4) {
    driftScore += 0.10;
    signals.push(`Key variable set has changed significantly (${(overlapRatio * 100).toFixed(0)}% overlap) — thesis is tracking different factors.`);
  }

  // ── Determine direction ───────────────────────────────────────────────────
  const clampedScore = Math.max(0, Math.min(1, driftScore));
  let direction: "strengthening" | "weakening" | "unclear";
  let confidenceChange: number;

  if (driftScore < -0.05) {
    direction = "strengthening";
    confidenceChange = Math.min(0.08, Math.abs(driftScore) * 0.3);
  } else if (driftScore > 0.25) {
    direction = "weakening";
    confidenceChange = -Math.min(0.15, clampedScore * 0.3);
  } else if (clampedScore > 0.10) {
    direction = "weakening";
    confidenceChange = -Math.min(0.08, clampedScore * 0.2);
  } else {
    direction = "unclear";
    confidenceChange = 0.0;
  }

  // ── Build drift signal narrative ──────────────────────────────────────────
  const driftNarrative = buildDriftNarrative(direction, clampedScore, signals, current.ticker);

  return {
    drift_direction: direction,
    drift_intensity: parseFloat(clampedScore.toFixed(3)),
    drift_signal: driftNarrative,
    confidence_change: parseFloat(confidenceChange.toFixed(3)),
    advisory_only: true,
  };
}

function buildDriftNarrative(
  direction: "strengthening" | "weakening" | "unclear",
  intensity: number,
  signals: string[],
  ticker: string
): string {
  const topSignals = signals.slice(0, 2).join(" ");
  if (direction === "weakening") {
    if (intensity > 0.6) {
      return `The thesis for ${ticker} is showing significant weakening. ${topSignals} The supporting signals are no longer aligned with the original investment case — this warrants active monitoring.`;
    }
    return `The thesis for ${ticker} is not broken, but the supporting signals are no longer strengthening. ${topSignals} Drift is gradual — watch for acceleration.`;
  }
  if (direction === "strengthening") {
    return `The thesis for ${ticker} appears to be gaining support. ${topSignals} Conviction may be building, though this should be validated against updated fundamentals.`;
  }
  return `No clear drift direction detected for ${ticker}. ${topSignals || "Signals are mixed or insufficient for directional assessment."} Continue monitoring.`;
}

/** Simple text similarity: Jaccard on word tokens */
function computeTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = Array.from(setA).filter(w => setB.has(w)).length;
  const union = new Set([...Array.from(setA), ...Array.from(setB)]).size;
  return union > 0 ? intersection / union : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2 — CONTINUOUS CONFIDENCE MODEL
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfidenceUpdateOutput {
  updated_confidence: number;           // 0–1, clamped
  confidence_trend: "rising" | "falling" | "stable";
  reason: string;
  advisory_only: true;
}

/**
 * [LEVEL10.3-C Module 2] Update thesis confidence incrementally.
 * RULES:
 * - Small changes per update (max ±0.15 per cycle unless event-driven)
 * - No sudden jumps unless event shock
 * - Must explain the change
 * - Confidence is sticky: high conviction needs sustained negative evidence to drop
 */
export function updateThesisConfidence(
  previousConfidence: number,
  drift: DriftDetectionOutput,
  newSignals: { signal_fusion_score: number; has_event_shock: boolean; bq_score: number }
): ConfidenceUpdateOutput {
  let delta = drift.confidence_change;

  // Event shock: allow faster confidence change (up to ±0.20)
  if (newSignals.has_event_shock) {
    delta = delta * 1.5;
    // Cap at ±0.20 for event-driven moves
    delta = Math.max(-0.20, Math.min(0.20, delta));
  }

  // BQ floor: if BQ is strong, confidence can't fall below 0.45
  const bqFloor = newSignals.bq_score > 0.7 ? 0.45 : 0.25;

  // Signal ceiling: if signal is weak, confidence can't exceed 0.75
  const signalCeiling = newSignals.signal_fusion_score < 0.4 ? 0.75 : 0.95;

  const rawConfidence = previousConfidence + delta;
  const updatedConfidence = Math.max(bqFloor, Math.min(signalCeiling, rawConfidence));
  const clampedConfidence = parseFloat(updatedConfidence.toFixed(3));

  // Determine trend
  const absDelta = Math.abs(clampedConfidence - previousConfidence);
  let trend: "rising" | "falling" | "stable";
  if (absDelta < 0.02) {
    trend = "stable";
  } else if (clampedConfidence > previousConfidence) {
    trend = "rising";
  } else {
    trend = "falling";
  }

  // Build reason
  const reason = buildConfidenceReason(
    previousConfidence,
    clampedConfidence,
    trend,
    drift,
    newSignals
  );

  return {
    updated_confidence: clampedConfidence,
    confidence_trend: trend,
    reason,
    advisory_only: true,
  };
}

function buildConfidenceReason(
  prev: number,
  updated: number,
  trend: "rising" | "falling" | "stable",
  drift: DriftDetectionOutput,
  signals: { signal_fusion_score: number; has_event_shock: boolean; bq_score: number }
): string {
  const prevPct = (prev * 100).toFixed(0);
  const updPct = (updated * 100).toFixed(0);
  const delta = ((updated - prev) * 100).toFixed(1);

  if (trend === "stable") {
    return `Confidence held at ${updPct}% — no material change in drift or signal quality. The thesis is in a holding pattern.`;
  }
  if (trend === "falling") {
    const cause = signals.has_event_shock
      ? "an event shock accelerated the decline"
      : drift.drift_direction === "weakening"
        ? "thesis drift is weakening the supporting case"
        : "signal quality has softened";
    return `Confidence declined from ${prevPct}% to ${updPct}% (Δ${delta}%) — ${cause}. ${drift.drift_signal.split(".")[0]}.`;
  }
  const cause = signals.has_event_shock
    ? "a positive event catalyst drove the increase"
    : drift.drift_direction === "strengthening"
      ? "thesis drift is strengthening"
      : "improving signal quality";
  return `Confidence rose from ${prevPct}% to ${updPct}% (+${delta}%) — ${cause}. BQ score: ${(signals.bq_score * 100).toFixed(0)}%.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3 — MANAGEMENT BEHAVIOR INTERPRETER
// ─────────────────────────────────────────────────────────────────────────────

export type BehaviorPattern = "consistent" | "shifting" | "overpromising" | "defensive" | "unclear";

export interface ManagementEventSignal {
  event_type: "earnings_call" | "guidance_change" | "capital_allocation" | "executive_change" | "regulatory_response";
  tone: "positive" | "neutral" | "negative" | "mixed";
  guidance_direction?: "raised" | "lowered" | "maintained" | "withdrawn";
  words_vs_execution_gap?: number;  // 0 = aligned, 1 = maximum gap
  description: string;
}

export interface ManagementBehaviorOutput {
  behavior_pattern: BehaviorPattern;
  interpretation: string;
  risk_implication: string;
  advisory_only: true;
}

/**
 * [LEVEL10.3-C Module 3] Interpret management behavior patterns dynamically.
 * Looks for: tone shifts, guidance patterns, words-vs-execution gaps.
 * NOT just data — reads the behavioral signal behind the data.
 */
export function interpretManagementBehavior(
  eventStream: ManagementEventSignal[],
  historicalBehavior?: { pattern: BehaviorPattern; consistency_score: number }
): ManagementBehaviorOutput {
  if (!eventStream || eventStream.length === 0) {
    return {
      behavior_pattern: "unclear",
      interpretation: "Insufficient management event data to assess behavioral pattern. Monitoring required.",
      risk_implication: "Unknown management behavior is itself a risk factor — treat as elevated uncertainty.",
      advisory_only: true,
    };
  }

  // ── Score each behavioral dimension ──────────────────────────────────────
  let overpromiseScore = 0;
  let defensiveScore = 0;
  let shiftScore = 0;
  let consistencyScore = 0;
  const observations: string[] = [];

  for (const event of eventStream) {
    // Guidance lowered or withdrawn → defensive signal
    if (event.guidance_direction === "lowered" || event.guidance_direction === "withdrawn") {
      defensiveScore += 0.25;
      observations.push(`Guidance ${event.guidance_direction} in ${event.event_type} — management is pulling back expectations.`);
    }

    // Positive tone + lowered guidance = overpromising pattern
    if (event.tone === "positive" && event.guidance_direction === "lowered") {
      overpromiseScore += 0.35;
      observations.push(`Tone-guidance mismatch: positive language with lowered guidance — classic overpromising signal.`);
    }

    // Words vs execution gap
    if (event.words_vs_execution_gap !== undefined && event.words_vs_execution_gap > 0.5) {
      overpromiseScore += 0.30;
      observations.push(`Significant words-vs-execution gap (${(event.words_vs_execution_gap * 100).toFixed(0)}%) — management is not delivering on stated commitments.`);
    }

    // Executive change → shifting signal
    if (event.event_type === "executive_change") {
      shiftScore += 0.30;
      observations.push(`Executive change detected — strategic direction may be shifting.`);
    }

    // Consistent positive guidance raises → consistency
    if (event.guidance_direction === "raised" && event.tone === "positive") {
      consistencyScore += 0.20;
    }

    // Negative tone across multiple events → defensive
    if (event.tone === "negative") {
      defensiveScore += 0.15;
    }
  }

  // Historical behavior modifier
  if (historicalBehavior) {
    if (historicalBehavior.pattern === "consistent") {
      consistencyScore += 0.20;
    } else if (historicalBehavior.pattern === "overpromising") {
      overpromiseScore += 0.15;
    }
  }

  // ── Determine pattern ────────────────────────────────────────────────────
  const scores: Record<BehaviorPattern, number> = {
    overpromising: overpromiseScore,
    defensive: defensiveScore,
    shifting: shiftScore,
    consistent: consistencyScore,
    unclear: 0.1, // baseline
  };

  const pattern = (Object.entries(scores) as [BehaviorPattern, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  const topObservation = observations[0] || "No specific behavioral signal detected.";
  const interpretation = buildManagementInterpretation(pattern, topObservation, eventStream.length);
  const riskImplication = buildManagementRiskImplication(pattern);

  return {
    behavior_pattern: pattern,
    interpretation,
    risk_implication: riskImplication,
    advisory_only: true,
  };
}

function buildManagementInterpretation(
  pattern: BehaviorPattern,
  topObservation: string,
  eventCount: number
): string {
  const base = `Based on ${eventCount} management event${eventCount > 1 ? "s" : ""}: `;
  switch (pattern) {
    case "overpromising":
      return `${base}management is exhibiting an overpromising pattern. ${topObservation} This is a behavioral red flag — the gap between stated expectations and delivered results is widening.`;
    case "defensive":
      return `${base}management tone has turned defensive. ${topObservation} This often precedes negative guidance revisions or operational challenges that haven't been fully disclosed.`;
    case "shifting":
      return `${base}management behavior is shifting. ${topObservation} Strategic pivots at the management level introduce execution risk that is difficult to model.`;
    case "consistent":
      return `${base}management is exhibiting consistent behavior. ${topObservation} Guidance has been reliable — this reduces execution risk and supports thesis confidence.`;
    default:
      return `${base}management behavior pattern is unclear. ${topObservation} Insufficient signal to form a directional view.`;
  }
}

function buildManagementRiskImplication(pattern: BehaviorPattern): string {
  switch (pattern) {
    case "overpromising":
      return "Elevated risk: management credibility discount should be applied. Reduce position sizing or require a larger margin of safety before adding exposure.";
    case "defensive":
      return "Moderate-to-elevated risk: defensive posture suggests management is aware of challenges not yet reflected in consensus estimates. Monitor next earnings closely.";
    case "shifting":
      return "Moderate risk: strategic shifts introduce uncertainty. The original thesis may need to be re-evaluated if the shift is material.";
    case "consistent":
      return "Low management risk: consistent execution reduces the behavioral uncertainty premium. This is a positive quality signal.";
    default:
      return "Unknown risk: treat as elevated uncertainty until more management event data is available.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4 — MARKET BEHAVIOR READER
// ─────────────────────────────────────────────────────────────────────────────

export type MarketBehaviorType = "accumulation" | "distribution" | "rotation" | "speculation";

export interface PriceActionContext {
  price_change_pct: number;          // recent price change %
  volume_trend: "rising" | "falling" | "flat";  // volume vs average
  price_vs_52w_high_pct: number;     // % below 52-week high (negative = below)
}

export interface CapitalFlowContext {
  sector_flow: "inflow" | "outflow" | "neutral";
  large_cap_bias: boolean;           // capital rotating to megacaps?
  institutional_accumulation: boolean;
}

export interface MarketBehaviorOutput {
  market_behavior: MarketBehaviorType;
  interpretation: string;
  implication_for_thesis: string;
  advisory_only: true;
}

/**
 * [LEVEL10.3-C Module 4] Read market behavior from price action + capital flow + regime.
 * Detects: accumulation, distribution, rotation, speculation.
 * Reads the "what is the market actually doing" signal, not just price.
 */
export function analyzeMarketBehavior(
  priceAction: PriceActionContext,
  capitalFlow: CapitalFlowContext,
  regimeTag: string
): MarketBehaviorOutput {
  // ── Score each behavior type ──────────────────────────────────────────────
  let accumulationScore = 0;
  let distributionScore = 0;
  let rotationScore = 0;
  let speculationScore = 0;

  // Price rising + volume rising → accumulation
  if (priceAction.price_change_pct > 2 && priceAction.volume_trend === "rising") {
    accumulationScore += 0.35;
  }

  // Price rising + volume falling → distribution (smart money selling into strength)
  if (priceAction.price_change_pct > 1 && priceAction.volume_trend === "falling") {
    distributionScore += 0.40;
  }

  // Price falling + volume rising → distribution (selling pressure)
  if (priceAction.price_change_pct < -2 && priceAction.volume_trend === "rising") {
    distributionScore += 0.30;
  }

  // Capital rotating to megacaps → rotation
  if (capitalFlow.large_cap_bias && capitalFlow.sector_flow === "inflow") {
    rotationScore += 0.35;
  }

  // Sector outflow → rotation away
  if (capitalFlow.sector_flow === "outflow") {
    rotationScore += 0.25;
  }

  // Speculation: large price move + no institutional accumulation + event_shock regime
  if (Math.abs(priceAction.price_change_pct) > 5 && !capitalFlow.institutional_accumulation) {
    speculationScore += 0.40;
  }

  // Regime modifiers
  if (regimeTag === "risk_on" && capitalFlow.institutional_accumulation) {
    accumulationScore += 0.20;
  }
  if (regimeTag === "risk_off" || regimeTag === "macro_stress") {
    distributionScore += 0.15;
  }
  if (regimeTag === "event_shock") {
    speculationScore += 0.20;
  }

  // ── Determine behavior ────────────────────────────────────────────────────
  const scores: Record<MarketBehaviorType, number> = {
    accumulation: accumulationScore,
    distribution: distributionScore,
    rotation: rotationScore,
    speculation: speculationScore,
  };

  const behavior = (Object.entries(scores) as [MarketBehaviorType, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  const interpretation = buildMarketInterpretation(behavior, priceAction, capitalFlow, regimeTag);
  const implication = buildMarketImplication(behavior, regimeTag);

  return {
    market_behavior: behavior,
    interpretation,
    implication_for_thesis: implication,
    advisory_only: true,
  };
}

function buildMarketInterpretation(
  behavior: MarketBehaviorType,
  price: PriceActionContext,
  flow: CapitalFlowContext,
  regime: string
): string {
  switch (behavior) {
    case "accumulation":
      return `Price is rising with ${price.volume_trend} volume and ${flow.sector_flow} sector flow — this pattern is consistent with institutional accumulation. The ${regime} regime is supportive.`;
    case "distribution":
      return `Price is ${price.price_change_pct > 0 ? "rising" : "falling"} but volume is ${price.volume_trend} — a classic distribution signal. Smart money may be selling into strength or the selling pressure is intensifying.`;
    case "rotation":
      return `Capital is rotating${flow.large_cap_bias ? " toward large-cap/megacap names" : " away from this sector"}. Sector flow is ${flow.sector_flow}. This is a positioning shift, not a fundamental change.`;
    case "speculation":
      return `Price movement (${price.price_change_pct > 0 ? "+" : ""}${price.price_change_pct.toFixed(1)}%) is outsized relative to fundamental signals. Without institutional accumulation, this looks speculative — driven by narrative or momentum rather than value.`;
  }
}

function buildMarketImplication(behavior: MarketBehaviorType, regime: string): string {
  switch (behavior) {
    case "accumulation":
      return "Positive for thesis: market behavior is aligned with the investment case. Accumulation patterns support the position.";
    case "distribution":
      return "Caution: distribution behavior suggests the market is reducing exposure. This may precede a re-rating lower — monitor closely and avoid adding on strength.";
    case "rotation":
      return "Neutral-to-negative: rotation is a positioning event, not a fundamental one. The thesis may still be intact, but near-term price action may be headwind.";
    case "speculation":
      return "High caution: speculative behavior disconnects price from fundamentals. The thesis may be temporarily irrelevant — wait for the speculation to resolve before acting on fundamental signals.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 5 — GRADIENT RISK MODEL
// ─────────────────────────────────────────────────────────────────────────────

export type RiskState = "low" | "building" | "elevated" | "critical";
export type RiskTrend = "increasing" | "decreasing" | "stable";

export interface GradientRiskOutput {
  risk_state: RiskState;
  risk_trend: RiskTrend;
  early_warning_signs: string[];
  advisory_only: true;
}

/**
 * [LEVEL10.3-C Module 5] Evaluate risk as a gradient, not a binary.
 * RULE: Must detect "before failure" — focus on developing risk, not confirmed failure.
 * Combines: thesis drift + market behavior + management behavior.
 */
export function evaluateGradientRisk(
  thesis: { thesis_confidence: number; failure_condition: string },
  drift: DriftDetectionOutput,
  marketBehavior: MarketBehaviorOutput
): GradientRiskOutput {
  const warnings: string[] = [];
  let riskScore = 0;

  // ── Drift contribution ────────────────────────────────────────────────────
  if (drift.drift_direction === "weakening") {
    riskScore += drift.drift_intensity * 0.4;
    if (drift.drift_intensity > 0.5) {
      warnings.push(`Thesis drift is significant (intensity: ${(drift.drift_intensity * 100).toFixed(0)}%) — the investment case is losing support.`);
    } else {
      warnings.push(`Early drift detected: ${drift.drift_signal.split(".")[0]}.`);
    }
  }

  // ── Confidence level contribution ─────────────────────────────────────────
  if (thesis.thesis_confidence < 0.45) {
    riskScore += 0.30;
    warnings.push(`Thesis confidence has fallen below 45% — the conviction level no longer supports a full position.`);
  } else if (thesis.thesis_confidence < 0.60) {
    riskScore += 0.15;
    warnings.push(`Thesis confidence is in the caution zone (${(thesis.thesis_confidence * 100).toFixed(0)}%) — monitor for further deterioration.`);
  }

  // ── Market behavior contribution ──────────────────────────────────────────
  if (marketBehavior.market_behavior === "distribution") {
    riskScore += 0.25;
    warnings.push(`Distribution pattern in market behavior — smart money may be reducing exposure ahead of a catalyst.`);
  } else if (marketBehavior.market_behavior === "speculation") {
    riskScore += 0.20;
    warnings.push(`Speculative market behavior detected — price may be disconnected from fundamentals, creating downside risk on normalization.`);
  } else if (marketBehavior.market_behavior === "rotation") {
    riskScore += 0.10;
    warnings.push(`Capital rotation is creating near-term price headwind.`);
  }

  // ── Failure condition proximity ───────────────────────────────────────────
  if (thesis.failure_condition && thesis.failure_condition.length > 20) {
    // If failure condition is already in the thesis, it's a known risk — add a reminder
    if (drift.drift_direction === "weakening" && drift.drift_intensity > 0.3) {
      warnings.push(`Failure condition is approaching: "${thesis.failure_condition.substring(0, 80)}..."`);
      riskScore += 0.15;
    }
  }

  // ── Determine risk state ──────────────────────────────────────────────────
  const clampedScore = Math.max(0, Math.min(1, riskScore));
  let riskState: RiskState;
  if (clampedScore < 0.20) {
    riskState = "low";
  } else if (clampedScore < 0.45) {
    riskState = "building";
  } else if (clampedScore < 0.70) {
    riskState = "elevated";
  } else {
    riskState = "critical";
  }

  // ── Determine trend ───────────────────────────────────────────────────────
  let riskTrend: RiskTrend;
  if (drift.drift_direction === "weakening" && clampedScore > 0.25) {
    riskTrend = "increasing";
  } else if (drift.drift_direction === "strengthening") {
    riskTrend = "decreasing";
  } else {
    riskTrend = "stable";
  }

  return {
    risk_state: riskState,
    risk_trend: riskTrend,
    early_warning_signs: warnings.slice(0, 4), // max 4 warnings
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 6 — EXPERIENCE NARRATIVE AUGMENTATION
// (Adds "experience_layer_insight" section to existing narrative)
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// [Level14.0-A] OI-L12-001 — Typed stabilization codes for ExperienceLayerInsight
// Compatibility-first: existing natural-language fields are preserved unchanged.
// These codes are ADDED alongside the string fields — not replacing them.
// ─────────────────────────────────────────────────────────────────────────────

/** Structured code for drift direction dimension */
export type DriftCode =
  | "weakening"
  | "strengthening"
  | "stable"
  | "unclear";

/** Structured code for confidence evolution dimension */
export type ConfidenceEvolutionCode =
  | "rising"
  | "falling"
  | "stable";

/** Structured code for risk gradient dimension */
export type RiskGradientCode =
  | "low"
  | "building"
  | "elevated"
  | "critical";

export interface ExperienceLayerInsight {
  drift_interpretation: string;
  confidence_evolution: string;
  behavior_insights: string;
  risk_gradient: string;
  full_insight: string;         // composed paragraph
  advisory_only: true;
  // [Level14.0-A] Typed codes — added for downstream typed consumption
  // These do NOT replace the natural-language fields above.
  drift_code?: DriftCode;
  confidence_evolution_code?: ConfidenceEvolutionCode;
  risk_gradient_code?: RiskGradientCode;
}

/**
 * [LEVEL10.3-C Module 6] Compose the Experience Layer Insight section.
 * Style: natural, reflective, slightly probabilistic language.
 * NOT a summary — a judgment-level interpretation of what the data means.
 */
export function composeExperienceInsight(
  drift: DriftDetectionOutput,
  confidenceUpdate: ConfidenceUpdateOutput,
  managementBehavior: ManagementBehaviorOutput,
  marketBehavior: MarketBehaviorOutput,
  gradientRisk: GradientRiskOutput,
  ticker: string
): ExperienceLayerInsight {
  // ── Drift interpretation ──────────────────────────────────────────────────
  const driftLine = drift.drift_direction === "weakening"
    ? `The thesis for ${ticker} is not broken, but the supporting signals are no longer strengthening.`
    : drift.drift_direction === "strengthening"
      ? `The thesis for ${ticker} appears to be gaining support — the investment case is building momentum.`
      : `The thesis for ${ticker} is holding steady with no clear directional drift.`;

  // ── Confidence evolution ──────────────────────────────────────────────────
  const confidenceLine = confidenceUpdate.confidence_trend === "falling"
    ? `Conviction is gradually declining (now ${(confidenceUpdate.updated_confidence * 100).toFixed(0)}%) — not a crisis, but a signal to watch.`
    : confidenceUpdate.confidence_trend === "rising"
      ? `Conviction is building (now ${(confidenceUpdate.updated_confidence * 100).toFixed(0)}%) — the position is earning its place.`
      : `Conviction is stable at ${(confidenceUpdate.updated_confidence * 100).toFixed(0)}% — no material change in the investment case.`;

  // ── Behavior insights ─────────────────────────────────────────────────────
  const behaviorLine = buildBehaviorInsightLine(managementBehavior, marketBehavior);

  // ── Risk gradient ─────────────────────────────────────────────────────────
  const riskLine = gradientRisk.risk_state === "low"
    ? `Risk is low and stable — no early warning signs require immediate attention.`
    : gradientRisk.risk_state === "building"
      ? `Risk is building gradually. ${gradientRisk.early_warning_signs[0] || "Monitor for acceleration."}`
      : gradientRisk.risk_state === "elevated"
        ? `Risk is elevated. ${gradientRisk.early_warning_signs[0] || "Active monitoring required."} The position may need to be sized down.`
        : `Risk is critical. ${gradientRisk.early_warning_signs[0] || "Thesis integrity is in question."} Re-evaluate the position.`;

  // ── Compose full insight paragraph ───────────────────────────────────────
  const fullInsight = `${driftLine} ${confidenceLine} ${behaviorLine} ${riskLine}`;

  // [Level14.0-A] Derive typed codes from the same source values used for natural-language lines
  const driftCode: DriftCode =
    drift.drift_direction === "weakening" ? "weakening"
    : drift.drift_direction === "strengthening" ? "strengthening"
    : drift.drift_direction === "unclear" ? "unclear"
    : "stable";

  const confidenceEvolutionCode: ConfidenceEvolutionCode =
    confidenceUpdate.confidence_trend === "falling" ? "falling"
    : confidenceUpdate.confidence_trend === "rising" ? "rising"
    : "stable";

  const riskGradientCode: RiskGradientCode =
    gradientRisk.risk_state === "low" ? "low"
    : gradientRisk.risk_state === "building" ? "building"
    : gradientRisk.risk_state === "elevated" ? "elevated"
    : "critical";

  return {
    drift_interpretation: driftLine,
    confidence_evolution: confidenceLine,
    behavior_insights: behaviorLine,
    risk_gradient: riskLine,
    full_insight: fullInsight,
    advisory_only: true,
    // [Level14.0-A] Typed codes — parallel to natural-language fields
    drift_code: driftCode,
    confidence_evolution_code: confidenceEvolutionCode,
    risk_gradient_code: riskGradientCode,
  };
}

function buildBehaviorInsightLine(
  mgmt: ManagementBehaviorOutput,
  market: MarketBehaviorOutput
): string {
  const mgmtSignal = mgmt.behavior_pattern === "consistent"
    ? "Management behavior remains consistent"
    : mgmt.behavior_pattern === "overpromising"
      ? "Management is showing overpromising signals — a credibility discount is warranted"
      : mgmt.behavior_pattern === "defensive"
        ? "Management tone has turned defensive — watch for guidance revisions"
        : mgmt.behavior_pattern === "shifting"
          ? "Management behavior is shifting — strategic execution risk is elevated"
          : "Management behavior is unclear";

  const marketSignal = market.market_behavior === "accumulation"
    ? "market behavior is supportive (accumulation pattern)"
    : market.market_behavior === "distribution"
      ? "market behavior suggests distribution — smart money may be reducing exposure"
      : market.market_behavior === "rotation"
        ? "capital rotation is creating near-term positioning headwind"
        : "speculative market behavior is disconnecting price from fundamentals";

  return `${mgmtSignal}. Combined with ${marketSignal}, this suggests the position may be ${
    mgmt.behavior_pattern === "consistent" && market.market_behavior === "accumulation"
      ? "in a constructive phase"
      : mgmt.behavior_pattern === "overpromising" || market.market_behavior === "distribution"
        ? "transitioning from accumulation to late-cycle behavior"
        : "in a period of elevated uncertainty"
  }.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 7 — TIME CONTEXT MEMORY (Lightweight)
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeContextRecord {
  ticker: string;
  previous_thesis_summary: string;
  previous_confidence: number;
  last_drift_state: "strengthening" | "weakening" | "unclear" | "none";
  last_market_behavior: MarketBehaviorType | "unknown";
  last_management_pattern: BehaviorPattern;
  last_risk_state: RiskState;
  recorded_at_ms: number;
  advisory_only: true;
}

// In-memory store (per-process, non-persistent — use DB for persistence)
const timeContextStore = new Map<string, TimeContextRecord>();

/**
 * [LEVEL10.3-C Module 7] Build and store time context for a ticker.
 * Enables comparison across time — the foundation of "experience accumulation".
 * NOTE: This is an in-process memory store. For persistence, write to DB.
 */
export function buildTimeContext(
  ticker: string,
  currentOutput: {
    thesis_summary: string;
    confidence: number;
    drift_state: "strengthening" | "weakening" | "unclear";
    market_behavior: MarketBehaviorType;
    management_pattern: BehaviorPattern;
    risk_state: RiskState;
  }
): { current: TimeContextRecord; previous: TimeContextRecord | null } {
  const previous = timeContextStore.get(ticker) ?? null;

  const current: TimeContextRecord = {
    ticker,
    previous_thesis_summary: currentOutput.thesis_summary,
    previous_confidence: currentOutput.confidence,
    last_drift_state: currentOutput.drift_state,
    last_market_behavior: currentOutput.market_behavior,
    last_management_pattern: currentOutput.management_pattern,
    last_risk_state: currentOutput.risk_state,
    recorded_at_ms: Date.now(),
    advisory_only: true,
  };

  timeContextStore.set(ticker, current);

  return { current, previous };
}

/**
 * Retrieve stored time context for a ticker (for use in detectThesisDrift).
 */
export function getTimeContext(ticker: string): TimeContextRecord | null {
  return timeContextStore.get(ticker) ?? null;
}

/**
 * Clear time context (for testing).
 */
export function clearTimeContext(ticker?: string): void {
  if (ticker) {
    timeContextStore.delete(ticker);
  } else {
    timeContextStore.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 8 — PIPELINE INTEGRATION TYPE
// (Used by deepResearchEngine.ts to augment DeepResearchOutput)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExperienceLayerOutput {
  ticker: string;
  drift: DriftDetectionOutput;
  confidence_update: ConfidenceUpdateOutput;
  management_behavior: ManagementBehaviorOutput;
  market_behavior: MarketBehaviorOutput;
  gradient_risk: GradientRiskOutput;
  experience_insight: ExperienceLayerInsight;
  time_context: TimeContextRecord;
  advisory_only: true;
}

/**
 * [LEVEL10.3-C Module 8] Run the full Experience Layer pipeline for a single ticker.
 * Designed to be called AFTER runDeepResearch() — augments, does not replace.
 * Non-blocking: errors are caught and return a degraded output.
 */
export function runExperienceLayer(params: {
  ticker: string;
  thesis: { thesis_confidence: number; failure_condition: string; core_thesis: string };
  signalFusionScore: number;
  bqScore: number;
  regimeTag: string;
  hasEventShock: boolean;
  priceAction: PriceActionContext;
  capitalFlow: CapitalFlowContext;
  managementEvents?: ManagementEventSignal[];
  historyContext?: ThesisHistoryContext;
}): ExperienceLayerOutput {
  const {
    ticker,
    thesis,
    signalFusionScore,
    bqScore,
    regimeTag,
    hasEventShock,
    priceAction,
    capitalFlow,
    managementEvents = [],
    historyContext,
  } = params;

  // Build current context
  const currentCtx: CurrentThesisContext = {
    ticker,
    current_critical_driver: thesis.failure_condition, // use failure_condition as proxy for driver
    current_confidence: thesis.thesis_confidence,
    current_key_variables: [],
    signal_fusion_score: signalFusionScore,
    bq_score: bqScore,
    regime_tag: regimeTag,
    has_event_shock: hasEventShock,
    narrative_summary: thesis.core_thesis.substring(0, 120),
  };

  // Use stored history if no explicit history provided
  const storedHistory = getTimeContext(ticker);
  const history: ThesisHistoryContext = historyContext ?? (storedHistory ? {
    ticker,
    previous_critical_driver: storedHistory.previous_thesis_summary,
    previous_confidence: storedHistory.previous_confidence,
    previous_drift_state: storedHistory.last_drift_state,
    previous_key_variables: [],
    previous_narrative_summary: storedHistory.previous_thesis_summary,
    last_updated_ms: storedHistory.recorded_at_ms,
  } : {
    ticker,
    previous_critical_driver: "",
    previous_confidence: 0,
    previous_drift_state: "none",
    previous_key_variables: [],
    previous_narrative_summary: "",
    last_updated_ms: 0,
  });

  // Run all modules
  const drift = detectThesisDrift(history, currentCtx);
  const confidenceUpdate = updateThesisConfidence(thesis.thesis_confidence, drift, {
    signal_fusion_score: signalFusionScore,
    has_event_shock: hasEventShock,
    bq_score: bqScore,
  });
  const managementBehavior = interpretManagementBehavior(managementEvents);
  const marketBehavior = analyzeMarketBehavior(priceAction, capitalFlow, regimeTag);
  const gradientRisk = evaluateGradientRisk(thesis, drift, marketBehavior);
  const experienceInsight = composeExperienceInsight(
    drift, confidenceUpdate, managementBehavior, marketBehavior, gradientRisk, ticker
  );

  // Update time context
  const { current: timeContext } = buildTimeContext(ticker, {
    thesis_summary: thesis.core_thesis.substring(0, 120),
    confidence: confidenceUpdate.updated_confidence,
    drift_state: drift.drift_direction,
    market_behavior: marketBehavior.market_behavior,
    management_pattern: managementBehavior.behavior_pattern,
    risk_state: gradientRisk.risk_state,
  });

  return {
    ticker,
    drift,
    confidence_update: confidenceUpdate,
    management_behavior: managementBehavior,
    market_behavior: marketBehavior,
    gradient_risk: gradientRisk,
    experience_insight: experienceInsight,
    time_context: timeContext,
    advisory_only: true,
  };
}
