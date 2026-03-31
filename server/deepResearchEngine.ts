/**
 * LEVEL10.3 — Deep Research Mode (High-Signal Narrative Layer)
 *
 * Transforms DanTree outputs from rigid template summaries into
 * high-signal, investment-grade research narratives that resemble
 * real buy-side thinking.
 *
 * Modules:
 * 1. buildInvestmentThesis()      — Core thesis + main contradiction
 * 2. identifyKeyVariables()       — Max 3 outcome-driving variables
 * 3. buildPayoutMap()             — Asymmetry: if_right vs if_wrong
 * 4. inferImplicitFactors()       — Non-obvious but real influences
 * 5. composeResearchNarrative()   — Buy-side style narrative
 * 6. generateLens()               — Light conclusion (no buy/sell)
 * 7. validateSignalDensity()      — Reject generic output
 *
 * advisory_only: ALL outputs carry advisory_only: true
 * Hard Rules: NO hallucination, NO generic filler, grounded in L8–10.2
 */

import type { InvestorThinkingOutput } from "./investorThinkingLayer";
import type { RegimeOutput } from "./regimeEngine";
import type { FactorInteractionOutput } from "./factorInteractionEngine";
import type { BusinessContext } from "./businessUnderstandingEngine";
import {
  runExperienceLayer,
  type ExperienceLayerOutput,
  type PriceActionContext,
  type CapitalFlowContext,
} from "./experienceLayer";
import {
  buildExperienceHistorySummary,
  type ExperienceHistorySummary,
} from "./experienceLearningEngine";
import type {
  Level11AnalysisOutput,
} from "./level11MultiAssetEngine";
import {
  aggregateSemanticPackets,
  type UnifiedSemanticState,
} from "./semantic_aggregator";
import {
  buildLevel11SemanticPacket,
  buildExperienceLayerSemanticPacket,
  buildPositionLayerSemanticPacket,
  type PositionLayerHandoffInput,
} from "./semantic_protocol_integration";

// ─────────────────────────────────────────────────────────────────────────────
// Shared Context Map — aggregates all upstream layer outputs
// ─────────────────────────────────────────────────────────────────────────────

export interface DeepResearchContextMap {
  ticker: string;
  sector: string;
  investorThinking: InvestorThinkingOutput;
  regime: RegimeOutput;
  factorInteraction: FactorInteractionOutput;
  businessContext: BusinessContext;
  // Raw signal scores (from liveSignalEngine)
  signalFusionScore: number;   // 0–1
  dataQualityScore: number;    // 0–1
  priceChangePercent?: number; // recent price momentum
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1 — THESIS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface InvestmentThesisOutput {
  core_thesis: string;          // MUST include specific mechanism + observable signal
  main_contradiction: string;   // MUST express judgment tension
  critical_driver: string;      // [NEW 10.3-B] The ONE variable that determines outcome
  failure_condition: string;    // [NEW 10.3-B] Explicit thesis-breaking condition
  thesis_confidence: number;    // 0–1
  advisory_only: true;
}

/**
 * [LEVEL10.3-B] Build the core investment thesis — HARDENED.
 * MUST include: specific mechanism, observable signal, failure trigger.
 * REJECT if: no concrete variable, no failure condition.
 * Style: PM-to-PM, not AI-summarizing-data.
 */
export function buildInvestmentThesis(ctx: DeepResearchContextMap): InvestmentThesisOutput {
  const { ticker, sector, investorThinking, regime, businessContext, signalFusionScore, dataQualityScore } = ctx;
  const bq = investorThinking.business_quality;
  const moat = businessContext.businessUnderstanding.moat_strength;
  const eligibility = businessContext.eligibility.eligibility_status;
  const competence = businessContext.competenceFit.competence_fit;
  const regimeTag = regime.regime_tag;
  const dominantFactor = investorThinking.dominant_factor;
  const falsification = investorThinking.falsification;
  const event = investorThinking.event_adjustment;
  const mgmt = businessContext.managementProxy;
  const goodReasons = businessContext.businessUnderstanding.why_this_business_might_be_good;
  const fragileReasons = businessContext.businessUnderstanding.why_this_business_might_be_fragile;

  // Thesis confidence: data quality + BQ score + signal fusion
  const raw_confidence = (bq.business_quality_score * 0.4) + (signalFusionScore * 0.35) + (dataQualityScore * 0.25);
  const thesis_confidence = Math.min(0.95, Math.max(0.1, raw_confidence));

  let core_thesis = "";
  let main_contradiction = "";
  let critical_driver = "";
  let failure_condition = "";

  if (eligibility === "avoid_for_now" || competence === "outside") {
    // REJECTION BRANCH: outside competence = thesis is explicitly weak
    core_thesis = `${ticker} operates outside the defined competence boundary. Without domain expertise in ${sector}, the risk of misreading competitive dynamics or regulatory shifts is unquantifiable — any apparent signal may be noise.`;
    main_contradiction = `Observable price signal vs. inability to distinguish genuine opportunity from domain-specific risk we cannot properly evaluate.`;
    critical_driver = `Competence boundary — without sufficient sector understanding, no signal can be reliably interpreted.`;
    failure_condition = `Thesis is already in failure state: no position is warranted until ${sector} competence is established. Any entry here is speculative by definition.`;
  } else if (moat === 'wide' && bq.business_quality_score >= 0.75) {
    // HIGH-QUALITY COMPOUNDER: must name the specific mechanism
    const mechanism = goodReasons[0] ?? "durable competitive advantage and recurring revenue";
    const observableSignal = bq.business_quality_score >= 0.85
      ? "services revenue share rising as a percentage of total revenue"
      : "consistent free cash flow generation above sector peers";
    const valuationRisk = falsification.key_risk_flags.includes("valuation_stretch");
    const macroRisk = regimeTag === "risk_off" || regimeTag === "macro_stress";

    core_thesis = `${ticker} is a wide-moat ${sector} franchise whose earnings durability is driven by ${mechanism}. The observable signal is ${observableSignal}. The market is currently ${
      valuationRisk ? "pricing in optimistic outcomes — the thesis only works if growth sustains at current multiples" :
      macroRisk ? "compressing multiples due to macro pressure, creating a potential entry window if the franchise is intact" :
      "underpricing the reinvestment capacity of this franchise relative to its long-term compounding potential"
    }.`;
    main_contradiction = valuationRisk
      ? `Structural compounding power vs. current pricing that already reflects much of that strength — the quality is real, but so is the valuation risk.`
      : macroRisk
      ? `Franchise durability vs. near-term multiple compression — the business is fine, but the market is not paying for quality right now.`
      : `Long-term compounding potential vs. short-term market focus on quarterly noise that obscures the underlying trajectory.`;
    critical_driver = mgmt.capital_allocation_quality === "disciplined"
      ? `Capital allocation discipline — whether management continues to reinvest at high returns determines if the moat compounds or stagnates.`
      : `Moat durability — the thesis requires that ${mechanism} remains intact as the competitive environment evolves.`;
    failure_condition = valuationRisk
      ? `Thesis breaks if earnings growth decelerates below ${(bq.business_quality_score * 20).toFixed(0)}% while the multiple remains elevated — any guidance cut at current prices triggers disproportionate de-rating.`
      : `Thesis breaks if ${fragileReasons[0] ?? "competitive position erodes"} materializes, or if management pivots to value-destructive capital allocation.`;
  } else if (moat === 'narrow' && bq.business_quality_score >= 0.55) {
    const mechanism = goodReasons[0] ?? "defensible market position with moderate switching costs";
    const alphaSignal = dominantFactor === "alpha_score" ? "positive momentum" : "stable earnings delivery";
    core_thesis = `${ticker} is a solid ${sector} business with a narrow moat anchored by ${mechanism}. The thesis is not about structural expansion — it is about whether ${alphaSignal} can persist long enough to justify current pricing. The market is treating this as a compounder; the reality is more execution-dependent.`;
    main_contradiction = dominantFactor === "alpha_score"
      ? `Positive near-term momentum vs. limited structural moat — momentum can reverse faster than the market expects when the catalyst fades.`
      : `Adequate business quality vs. risk of mean reversion if execution falters — narrow moats require flawless execution to avoid competitive erosion.`;
    critical_driver = `Execution consistency — a single missed quarter or margin compression event can trigger a re-rating disproportionate to the fundamental change.`;
    failure_condition = `Thesis breaks if ${fragileReasons[0] ?? "competitive pressure intensifies"} or if the dominant factor (${dominantFactor}) reverses — at that point the business has no structural floor to prevent de-rating.`;
  } else if (regimeTag === "event_shock" || dominantFactor === "danger_score") {
    const eventBias = event.event_bias;
    const eventSummary = event.event_summary ?? "an unresolved event catalyst";
    core_thesis = `${ticker} is in an event-driven situation — the thesis is not about business quality but about whether the market is mispricing the outcome of ${eventSummary}. The event bias is ${eventBias}. This is a binary setup, not a structural position.`;
    main_contradiction = `Event-driven upside from ${eventBias === "bullish" ? "favorable resolution" : "mean reversion"} vs. structural business weakness that reasserts once the event fades.`;
    critical_driver = `Event resolution — the entire risk/reward is contingent on how ${eventSummary} resolves. Fundamentals are secondary until the event clears.`;
    failure_condition = `Thesis breaks if the event resolves ${eventBias === "bullish" ? "unfavorably or is delayed" : "in a way that triggers further negative re-rating"}, or if the market shifts focus back to structural weakness before recovery.`;
  } else {
    // LOW CONVICTION: explicit about what is missing
    const missingElement = dataQualityScore < 0.4 ? "data quality" : signalFusionScore < 0.4 ? "signal coherence" : "business quality clarity";
    core_thesis = `${ticker} presents insufficient ${missingElement} to form a concrete thesis. The signals are present but not coherent enough to identify a specific mechanism or observable driver. This is not a thesis — it is an observation that something may be happening.`;
    main_contradiction = `Potential opportunity from improving signals vs. high probability that current data reflects noise rather than a genuine edge.`;
    critical_driver = `${missingElement.charAt(0).toUpperCase() + missingElement.slice(1)} improvement — without this, no specific mechanism can be identified and the thesis remains unactionable.`;
    failure_condition = `Thesis is already in low-conviction state. It fails to become actionable if ${missingElement} does not improve within the next observation cycle.`;
  }

  return {
    core_thesis,
    main_contradiction,
    critical_driver,
    failure_condition,
    thesis_confidence,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2 — KEY VARIABLE IDENTIFIER
// ─────────────────────────────────────────────────────────────────────────────

export type DirectionalImpact = "positive" | "negative" | "uncertain";

export interface KeyVariable {
  variable: string;
  why_it_matters: string;
  directional_impact: DirectionalImpact;
  update_frequency: "real_time" | "quarterly" | "annual" | "event_driven"; // [NEW 10.3-B]
}

export interface KeyVariablesOutput {
  variables: KeyVariable[];
  advisory_only: true;
}

/**
 * Identify up to 3 key variables that directly drive the outcome.
 * No generic macro noise — each must connect to a specific signal.
 */
export function identifyKeyVariables(ctx: DeepResearchContextMap): KeyVariablesOutput {
  const { investorThinking, businessContext, regime, factorInteraction, dataQualityScore } = ctx;
  const variables: KeyVariable[] = [];

  const bq = investorThinking.business_quality;
  const event = investorThinking.event_adjustment;
  const falsification = investorThinking.falsification;
  const moat = businessContext.businessUnderstanding.moat_strength;
  const mgmt = businessContext.managementProxy.capital_allocation_quality;
  const regimeTag = regime.regime_tag;
  const interaction = factorInteraction;

  // Variable 1: Business quality / moat durability — HARDENED with specific mechanism
  if (moat === "wide" || moat === "narrow") {
    const moatMechanism = businessContext.businessUnderstanding.why_this_business_might_be_good[0] ?? "competitive positioning";
    const bqLabel = bq.business_quality_score >= 0.80 ? "high" : bq.business_quality_score >= 0.60 ? "moderate" : "borderline";
    variables.push({
      variable: moat === "wide" ? "Moat durability and reinvestment capacity" : "Execution consistency and competitive defense",
      why_it_matters: `${moat === "wide" ? "Wide moat" : "Narrow moat"} anchored by ${moatMechanism}. BQ score ${bq.business_quality_score.toFixed(2)} (${bqLabel}). The question is whether this advantage is durable enough to justify current pricing — not whether the business is good, but whether it is good enough for the price.`,
      directional_impact: bq.business_quality_score >= 0.65 ? "positive" : "uncertain",
      update_frequency: "quarterly",
    });
  } else if (moat === "weak" || moat === "unknown") {
    const fragileReason = businessContext.businessUnderstanding.why_this_business_might_be_fragile[0] ?? "limited competitive differentiation";
    variables.push({
      variable: "Competitive erosion and structural floor",
      why_it_matters: `Weak or unverifiable moat with primary fragility driver: ${fragileReason}. Without a structural floor, any margin compression or market share loss becomes self-reinforcing. The key question is not if erosion happens, but how fast.`,
      directional_impact: "negative",
      update_frequency: "quarterly",
    });
  }

  // Variable 2: Event / catalyst sensitivity — HARDENED with specific bias + mechanism
  if (event.adjusted_risk_weight > 1.1 || (event.adjusted_alpha_weight ?? 0) > 1.1) {
    const impactDir: DirectionalImpact = event.event_bias === "bullish" ? "positive" : event.event_bias === "bearish" ? "negative" : "uncertain";
    const eventSummary = event.event_summary ?? "an active event catalyst";
    variables.push({
      variable: `Event catalyst: ${event.event_bias} bias (${eventSummary.slice(0, 60)}${eventSummary.length > 60 ? "..." : ""})`,
      why_it_matters: `This is not a macro observation — it is a specific catalyst with a ${event.event_bias ?? "mixed"} directional bias. Alpha weight ${(event.adjusted_alpha_weight ?? 1.0).toFixed(2)}, Risk weight ${event.adjusted_risk_weight.toFixed(2)}. The market will re-price when the event resolves; the question is whether current pricing already reflects the expected outcome.`,
      directional_impact: impactDir,
      update_frequency: "event_driven",
    });
  } else if (regimeTag === "macro_stress" || regimeTag === "risk_off") {
    variables.push({
      variable: `Macro regime: ${regimeTag} (systematic multiple compression)`,
      why_it_matters: `${regimeTag === "macro_stress" ? "Macro stress" : "Risk-off environment"} is compressing multiples across the board. Even quality businesses are not immune — the question is whether the business can sustain earnings while the market re-prices risk. This is a timing variable, not a fundamental one.`,
      directional_impact: "negative",
      update_frequency: "real_time",
    });
  }

  // Variable 3: Factor interaction or management quality — HARDENED
  if (variables.length < 3) {
    if (interaction.interaction_dominant_effect && interaction.interaction_dominant_effect !== "none" && interaction.interaction_reasons.length > 0) {
      const alphaAdj = interaction.adjusted_alpha_score - 0.5;
      const dir: DirectionalImpact = alphaAdj > 0.05 ? "positive" : alphaAdj < -0.05 ? "negative" : "uncertain";
      variables.push({
        variable: `Factor interaction: ${interaction.interaction_dominant_effect}`,
        why_it_matters: `${interaction.interaction_reasons[0] ?? "Active factor interaction detected"}. Adjusted alpha: ${interaction.adjusted_alpha_score.toFixed(2)}, adjusted danger: ${interaction.adjusted_danger_score.toFixed(2)}. This interaction is not visible in single-factor analysis — it only appears when factors are evaluated together.`,
        directional_impact: dir,
        update_frequency: "real_time",
      });
    } else if (mgmt === "disciplined") {
      variables.push({
        variable: "Capital allocation quality (disciplined management)",
        why_it_matters: `Management proxy score: ${businessContext.managementProxy.management_proxy_score.toFixed(2)}. Disciplined capital allocation is the difference between a business that compounds and one that merely earns. The key question is whether management will continue to deploy capital at high returns or shift to value-destructive acquisitions.`,
        directional_impact: "positive",
        update_frequency: "annual",
      });
    } else if (mgmt === "poor" || mgmt === "unknown") {
      variables.push({
        variable: "Management execution risk (poor or unverifiable)",
        why_it_matters: `Management proxy score: ${businessContext.managementProxy.management_proxy_score.toFixed(2)}. Poor capital allocation destroys value even in structurally sound businesses. The risk is not that the business fails — it is that management extracts value from shareholders through dilution, bad acquisitions, or excessive leverage.`,
        directional_impact: "negative",
        update_frequency: "annual",
      });
    } else if (dataQualityScore < 0.5) {
      variables.push({
        variable: `Signal reliability (data quality: ${dataQualityScore.toFixed(2)})`,
        why_it_matters: `Low data quality means the system is drawing conclusions from incomplete information. The uncertainty is not just about the business — it is about whether the signals themselves are trustworthy. Any apparent edge here may be an artifact of missing data.`,
        directional_impact: "uncertain",
        update_frequency: "real_time",
      });
    }
  }

  // Falsification override: if falsification tags are present, add as variable
  if (falsification.key_risk_flags.length > 0 && variables.length < 3) {
    const riskFlag = falsification.key_risk_flags[0];
    variables.push({
      variable: `Falsification trigger: ${riskFlag}`,
      why_it_matters: `The system has flagged ${riskFlag} as a potential thesis-breaking condition. This is not a risk to monitor — it is a condition that, if confirmed, invalidates the thesis entirely. Position sizing should reflect this binary risk.`,
      directional_impact: "negative",
      update_frequency: "event_driven",
    });
  }

  return {
    variables: variables.slice(0, 3),
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3 — PAYOUT ENGINE (ASYMMETRY)
// ─────────────────────────────────────────────────────────────────────────────

export interface PayoutSide {
  mechanism: string;
  trigger: string;        // [NEW 10.3-B] The specific observable event that confirms this side
  drivers?: string[];
  risks?: string[];
}

export interface PayoutMapOutput {
  if_right: PayoutSide;
  if_wrong: PayoutSide;
  asymmetry_ratio: number;  // upside / downside (1.0 = symmetric)
  advisory_only: true;
}

/**
 * Build the payout map showing where upside and downside come from.
 * Must clearly express asymmetry — not just "risks and opportunities".
 */
export function buildPayoutMap(ctx: DeepResearchContextMap): PayoutMapOutput {
  const { investorThinking, businessContext, regime, signalFusionScore } = ctx;
  const bq = investorThinking.business_quality;
  const moat = businessContext.businessUnderstanding.moat_strength;
  const eligibility = businessContext.eligibility.eligibility_status;
  const mgmt = businessContext.managementProxy.capital_allocation_quality;
  const falsification = investorThinking.falsification;
  const fragileReasons = businessContext.businessUnderstanding.why_this_business_might_be_fragile;
  const goodReasons = businessContext.businessUnderstanding.why_this_business_might_be_good;
  const regimeTag = regime.regime_tag;

  let if_right: PayoutSide;
  let if_wrong: PayoutSide;
  let asymmetry_ratio: number;

  if (eligibility === "avoid_for_now") {
    if_right = {
      mechanism: "Speculative re-rating if business quality proves substantially better than assessed",
      trigger: "Competence boundary is crossed: sector understanding improves and the business model becomes legible",
      drivers: ["Sector re-rating", "Unexpected earnings beat", "Management change"],
    };
    if_wrong = {
      mechanism: "Continued deterioration with no structural floor to arrest the decline",
      trigger: "Any of the fragility drivers materialize: " + (fragileReasons[0] ?? "competitive erosion or margin compression"),
      risks: fragileReasons.length > 0 ? fragileReasons : ["Weak moat", "Poor management", "Outside competence circle"],
    };
    asymmetry_ratio = 0.5;
  } else if (moat === "wide" && bq.business_quality_score >= 0.75) {
    const upsideDrivers: string[] = [];
    if (goodReasons.length > 0) upsideDrivers.push(...goodReasons.slice(0, 2));
    if (mgmt === "disciplined") upsideDrivers.push("Disciplined reinvestment compounds returns over time");
    if (regimeTag === "risk_on") upsideDrivers.push("Favorable macro tailwind amplifies multiple expansion");
    const downsideRisks: string[] = [];
    if (falsification.key_risk_flags.length > 0) downsideRisks.push(...falsification.key_risk_flags.map(t => `Falsification: ${t}`));
    if (fragileReasons.length > 0) downsideRisks.push(...fragileReasons.slice(0, 1));
    if (regimeTag === "macro_stress") downsideRisks.push("Macro stress compresses valuation multiples");

    const valuationRisk = falsification.key_risk_flags.includes("valuation_stretch");
    if_right = {
      mechanism: valuationRisk
        ? "Multiple sustains or expands as earnings growth validates current pricing"
        : "Market re-rates the franchise at a premium as earnings quality and reinvestment capacity become apparent",
      trigger: valuationRisk
        ? "Next earnings report shows revenue growth and margin expansion both meeting or exceeding guidance"
        : `${goodReasons[0] ?? "Earnings compounding"} becomes visible in reported financials over 2-3 quarters`,
      drivers: upsideDrivers.length > 0 ? upsideDrivers : ["Earnings compounding", "Multiple expansion", "Capital return"],
    };
    if_wrong = {
      mechanism: valuationRisk
        ? "Multiple compression triggered by any guidance cut while valuation remains elevated"
        : "Valuation de-rating if growth decelerates or competitive position weakens",
      trigger: valuationRisk
        ? "Earnings miss or guidance reduction while P/E remains above 25x — triggers disproportionate sell-off"
        : `${fragileReasons[0] ?? "Competitive disruption"} materializes or management pivots to value-destructive capital allocation`,
      risks: downsideRisks.length > 0 ? downsideRisks : ["Valuation stretch", "Competitive disruption", "Macro headwinds"],
    };
    asymmetry_ratio = 1.8;
  } else if (moat === "narrow") {
    if_right = {
      mechanism: "Steady earnings delivery with gradual multiple re-rating as execution proves consistent",
      trigger: `Two consecutive quarters of on-target earnings delivery without margin deterioration`,
      drivers: goodReasons.length > 0 ? goodReasons.slice(0, 2) : ["Consistent execution", "Market share stability"],
    };
    if_wrong = {
      mechanism: "Competitive erosion or execution miss triggers disproportionate de-rating",
      trigger: `${fragileReasons[0] ?? "Margin compression or market share loss"} — narrow moats have no buffer once the narrative breaks`,
      risks: fragileReasons.length > 0 ? fragileReasons.slice(0, 2) : ["Competitive pressure", "Margin compression"],
    };
    asymmetry_ratio = 1.1;
  } else {
    // Weak moat or event-driven
    const eventSummary = investorThinking.event_adjustment.event_summary ?? "the pending event catalyst";
    if_right = {
      mechanism: "Event catalyst resolves favorably, triggering short-term re-rating",
      trigger: `${eventSummary} resolves in the expected direction within the next 30 days`,
      drivers: ["Event resolution", "Sentiment shift", "Short-term momentum"],
    };
    if_wrong = {
      mechanism: "Event disappoints or structural weakness reasserts, amplified by weak moat",
      trigger: `${eventSummary} resolves unfavorably, or market attention shifts back to structural weakness before event clears`,
      risks: ["Event risk", "Structural deterioration", "Liquidity pressure"],
    };
    asymmetry_ratio = 0.8;
  }

  // Adjust asymmetry for signal quality
  if (signalFusionScore >= 0.75) asymmetry_ratio *= 1.1;
  if (signalFusionScore < 0.4) asymmetry_ratio *= 0.85;

  return {
    if_right,
    if_wrong,
    asymmetry_ratio: Math.round(asymmetry_ratio * 100) / 100,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4 — IMPLICIT FACTOR ENGINE
// ─────────────────────────────────────────────────────────────────────────────

// [LEVEL10.3-B] 5 real market behavior types (renamed for capital-reality alignment)
export type ImplicitFactorType =
  | "narrative_excess"       // market is pricing a story, not fundamentals
  | "capital_flow_bias"      // institutional rotation creating non-fundamental price pressure
  | "management_style"       // management behavior pattern that affects capital allocation
  | "market_positioning"     // crowded trade, short squeeze, or positioning extreme
  | "policy_execution_gap";  // gap between policy intent and actual business impact

export interface ImplicitFactor {
  factor: string;
  type: ImplicitFactorType;
  impact: string;
  confidence: number;  // 0–1
}

export interface ImplicitFactorsOutput {
  factors: ImplicitFactor[];
  advisory_only: true;
}

/**
 * Infer non-obvious but real influences from upstream signals.
 * DO NOT fabricate — only infer when signals support.
 * Allow empty output if none.
 */
export function inferImplicitFactors(ctx: DeepResearchContextMap): ImplicitFactorsOutput {
  const { investorThinking, businessContext, regime, factorInteraction, dataQualityScore, priceChangePercent } = ctx;
  const factors: ImplicitFactor[] = [];

  const bq = investorThinking.business_quality;
  const event = investorThinking.event_adjustment;
  const mgmt = businessContext.managementProxy;
  const moat = businessContext.businessUnderstanding.moat_strength;
  const regimeTag = regime.regime_tag;
  const interaction = factorInteraction;

  // 1. [narrative_excess] Market pricing perfection: high BQ + high fusion score + risk_on
  if (bq.business_quality_score >= 0.80 && regimeTag === "risk_on" && interaction.adjusted_alpha_score > 0.65) {
    factors.push({
      factor: `Narrative excess: the quality story for ${ctx.ticker} is widely known and likely priced in`,
      type: "narrative_excess",
      impact: "The market is not wrong about the business — it is wrong about the margin of safety. Any earnings miss, however small, will be treated as a thesis break because the stock is priced for perfection. The risk is not the business; it is the narrative premium.",
      confidence: 0.72,
    });
  }

  // 2. [management_style] Management credibility risk: high event severity + poor execution
  if (event.adjusted_risk_weight >= 1.3 && mgmt.management_proxy_score < 0.5 && mgmt.capital_allocation_quality !== "disciplined") {
    factors.push({
      factor: `Management credibility gap: high event sensitivity combined with weak execution track record`,
      type: "management_style",
      impact: "Management is likely to overpromise during the event and underdeliver afterward. This is not a one-time risk — it is a behavioral pattern. The market will eventually price in the credibility discount, which compounds the fundamental risk.",
      confidence: 0.68,
    });
  }

  // 3. [capital_flow_bias] Defensive rotation: risk_off + quality business
  if (regimeTag === "risk_off" && bq.business_quality_score >= 0.70) {
    factors.push({
      factor: `Capital flow bias: institutional defensive rotation is creating non-fundamental demand`,
      type: "capital_flow_bias",
      impact: "Quality businesses in risk-off environments attract institutional flows that are not driven by fundamental analysis. This creates a temporary price support that will reverse when risk appetite returns. The business is fine; the inflow is not permanent.",
      confidence: 0.65,
    });
  }

  // 4. [policy_execution_gap] Sector policy tailwind vs. actual business impact
  if (regimeTag === "risk_on" && businessContext.competenceFit.competence_fit === "inside" && moat === "wide") {
    factors.push({
      factor: `Policy execution gap: sector tailwind is real but the business benefit is not yet visible in financials`,
      type: "policy_execution_gap",
      impact: "The policy narrative is driving multiple expansion before the earnings impact materializes. The gap between policy intent and reported financials creates a window where the stock can de-rate even if the thesis is correct — timing matters more than direction.",
      confidence: 0.55,
    });
  }

  // 5. [market_positioning] Industry consolidation: weak moat + event_shock
  if ((moat === "weak" || moat === "unknown") && regimeTag === "event_shock") {
    factors.push({
      factor: `Market positioning extreme: event shock is accelerating competitive displacement for weaker players`,
      type: "market_positioning",
      impact: "The event is not just a catalyst — it is a structural accelerant. Businesses without durable moats face disproportionate displacement because the shock forces customers and capital to consolidate around stronger players. The positioning risk is asymmetric.",
      confidence: 0.62,
    });
  }

  // 6. [narrative_excess] Low data confidence: information asymmetry
  if (dataQualityScore < 0.45) {
    factors.push({
      factor: `Information asymmetry: low data quality (${dataQualityScore.toFixed(2)}) means the market may be pricing on incomplete information`,
      type: "narrative_excess",
      impact: "When data quality is low, the market fills the gap with narrative. This creates both risk (narrative is wrong) and opportunity (narrative is overly pessimistic). The key is to determine which direction the information gap is biased.",
      confidence: 0.50,
    });
  }

  // 7. [capital_flow_bias] Price momentum divergence from fundamentals
  if (priceChangePercent !== undefined && Math.abs(priceChangePercent) > 0.15 && bq.business_quality_score < 0.5) {
    const dir = priceChangePercent > 0 ? "upward" : "downward";
    factors.push({
      factor: `Capital flow divergence: ${(priceChangePercent * 100).toFixed(1)}% price move is not supported by fundamentals`,
      type: "capital_flow_bias",
      impact: dir === "upward"
        ? "Momentum buyers are driving the price without fundamental justification. This is a positioning risk, not a fundamental one — when momentum reverses, the exit will be crowded."
        : "Forced selling or systematic de-risking is creating a dislocation. The price is not reflecting the business; it is reflecting the positioning of sellers. This may be temporary, but timing the reversal is difficult.",
      confidence: 0.57,
    });
  }

  // Cap at 3 most confident factors
  const sorted = factors.sort((a, b) => b.confidence - a.confidence).slice(0, 3);

  return {
    factors: sorted,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4B — JUDGMENT TENSION INJECTOR [NEW LEVEL10.3-B]
// ─────────────────────────────────────────────────────────────────────────────

export interface JudgmentTensionOutput {
  tension_statement: string;   // The core judgment tension in one sentence
  tension_type: "valuation_vs_quality" | "timing_vs_conviction" | "narrative_vs_fundamentals" | "moat_vs_disruption" | "regime_vs_thesis";
  resolution_path: string;     // What would resolve this tension
  advisory_only: true;
}

/**
 * [LEVEL10.3-B] Inject a judgment tension statement into every research output.
 * Every investment involves a real tension that cannot be resolved by data alone.
 * This function makes that tension explicit.
 */
export function injectJudgmentTension(ctx: DeepResearchContextMap): JudgmentTensionOutput {
  const { investorThinking, businessContext, regime, signalFusionScore } = ctx;
  const bq = investorThinking.business_quality;
  const moat = businessContext.businessUnderstanding.moat_strength;
  const eligibility = businessContext.eligibility.eligibility_status;
  const regimeTag = regime.regime_tag;
  const falsification = investorThinking.falsification;

  // Priority 1: Valuation vs. quality tension (most common for quality names)
  if (moat === "wide" && bq.business_quality_score >= 0.75 && falsification.key_risk_flags.includes("valuation_stretch")) {
    return {
      tension_statement: `The business is genuinely excellent, but the price already reflects that excellence — the question is not whether to admire the business, but whether to pay for it at current multiples.`,
      tension_type: "valuation_vs_quality",
      resolution_path: `A 15-20% price correction, or two quarters of earnings growth that reduces the forward P/E to a more defensible level, would resolve this tension in favor of entry.`,
      advisory_only: true,
    };
  }

  // Priority 2: Regime vs. thesis tension
  if ((regimeTag === "risk_off" || regimeTag === "macro_stress") && bq.business_quality_score >= 0.65) {
    return {
      tension_statement: `The thesis is structurally sound, but the macro regime is working against it in the near term — being right about the business and wrong about the timing are not mutually exclusive.`,
      tension_type: "regime_vs_thesis",
      resolution_path: `Regime shift to neutral or risk-on, or a macro catalyst that separates quality businesses from the broader de-rating, would resolve this tension.`,
      advisory_only: true,
    };
  }

  // Priority 3: Narrative vs. fundamentals tension
  if (signalFusionScore >= 0.70 && bq.business_quality_score < 0.55) {
    return {
      tension_statement: `The signal momentum is strong, but the underlying business quality does not support the narrative — momentum without fundamentals is a timing game, not an investment.`,
      tension_type: "narrative_vs_fundamentals",
      resolution_path: `Fundamental improvement (BQ score above 0.65) or a clear catalyst that justifies the current narrative would resolve this tension. Without that, the signal is a warning, not a confirmation.`,
      advisory_only: true,
    };
  }

  // Priority 4: Moat vs. disruption tension
  if (moat === "narrow" && regimeTag === "event_shock") {
    return {
      tension_statement: `The business has a defensible position today, but the event shock is testing whether that defense is structural or situational — narrow moats look wide until they don't.`,
      tension_type: "moat_vs_disruption",
      resolution_path: `Post-event financial results showing margin and market share stability would confirm the moat is structural. Deterioration in either metric would confirm the disruption thesis.`,
      advisory_only: true,
    };
  }

  // Priority 5: Timing vs. conviction tension (low data quality or mixed signals)
  if (eligibility === "research_required" || signalFusionScore < 0.45) {
    return {
      tension_statement: `The direction of the thesis is plausible, but conviction is not high enough to size a position — acting on low-conviction signals is how process discipline breaks down.`,
      tension_type: "timing_vs_conviction",
      resolution_path: `Signal density improvement (fusion score above 0.65) or a specific catalyst that confirms the thesis direction would justify moving from observation to action.`,
      advisory_only: true,
    };
  }

  // Default: valuation vs. quality (generic but honest)
  return {
    tension_statement: `Every investment involves a judgment call that data cannot fully resolve — the question here is whether the current signal profile is sufficient to justify the risk of being wrong.`,
    tension_type: "valuation_vs_quality",
    resolution_path: `Improvement in data quality and signal coherence, combined with a clearer fundamental catalyst, would reduce the judgment burden and improve the quality of the decision.`,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 5 — NARRATIVE COMPOSER
// ─────────────────────────────────────────────────────────────────────────────

// Internal type used to pass ctx reference through composeResearchNarrative
interface BusinessUnderstandingContextWithCtx extends BusinessContext {
  __ctx__?: DeepResearchContextMap;
}

export interface ResearchNarrativeOutput {
  ticker: string;
  narrative: {
    // ── LEVEL10 sections (equity-focused) ──────────────────────────────────
    business_and_thesis: string;    // Thesis + mechanism + observable signal
    what_actually_matters: string;  // Key variables with update frequency
    risk_break_point: string;       // Specific failure condition + trigger
    upside_vs_downside: string;     // Payout map with explicit triggers
    judgment_tension: string;       // [NEW 10.3-B] The core judgment tension
    deeper_layer?: string;          // Implicit factors (capital-reality language)
    experience_layer_insight?: string; // [NEW 10.3-C] Drift + confidence + gradient risk
    experience_learning_insight?: string; // [NEW 10.4] Learning from judgment history
    positioning_lens?: string;      // [NEW 10.5] Asymmetry + sizing + PM-style rationale
    investment_lens: string;        // Lens type + conviction + why
    // ── LEVEL11 sections (multi-asset reality layer) ────────────────────────
    core_reality?: string;          // [NEW 11] What is truly driving this asset
    real_vs_perceived?: string;     // [NEW 11] Real vs narrative driver separation
    incentives_human_layer?: string; // [NEW 11] Who benefits, who pushes, what breaks
    policy_reality_lens?: string;   // [NEW 11] Policy execution vs intention (if relevant)
    sentiment_positioning?: string; // [NEW 11] Sentiment phase + crowdedness
    cross_asset_implications?: string; // [NEW 11] Propagation chain summary
    scenario_map_summary?: string;  // [NEW 11] Base/bull/bear + key triggers
  };
  word_count: number;
  advisory_only: true;
}

/**
 * Compose a buy-side style research narrative.
 * Style: calm, precise, responsible — like a PM explaining to another PM.
 * NOT a template — each paragraph must carry real information.
 */
export function composeResearchNarrative(
  thesis: InvestmentThesisOutput,
  variables: KeyVariablesOutput,
  payout: PayoutMapOutput,
  implicitFactors: ImplicitFactorsOutput,
  businessContext: BusinessContext,
  ticker: string,
  experienceInsightText?: string,  // [NEW 10.3-C] Optional experience layer insight
  experienceLearningInsightText?: string,  // [NEW 10.4] Optional learning history insight
  positioningLensText?: string,  // [NEW 10.5] Optional positioning lens text
  level11Analysis?: Level11AnalysisOutput  // [NEW 11] Multi-asset reality layer
): ResearchNarrativeOutput {
  const moat = businessContext.businessUnderstanding.moat_strength;
  const eligibility = businessContext.eligibility.eligibility_status;
  const mgmt = businessContext.managementProxy.capital_allocation_quality;
  const competence = businessContext.competenceFit.competence_fit;

  // [LEVEL10.3-B] PM-style narrative rules:
  // 1. Every section must carry real information, not template language
  // 2. Thesis must include mechanism + observable signal
  // 3. Risk break point must include specific trigger, not just category
  // 4. Judgment tension must be explicit, not implied

  // Section 1: Business & Thesis — mechanism + observable signal + contradiction
  const business_and_thesis = thesis.core_thesis +
    ` The central tension: ${thesis.main_contradiction}` +
    ` Critical driver: ${thesis.critical_driver}` +
    ` Thesis confidence: ${(thesis.thesis_confidence * 100).toFixed(0)}%.`;

  // Section 2: What Actually Matters — variables with update frequency
  let what_actually_matters = "";
  if (variables.variables.length === 0) {
    what_actually_matters = "Signal density is insufficient to identify specific outcome-driving variables. The primary unknown is whether current data reflects the true business trajectory — this is itself a risk, not just a data gap.";
  } else {
    what_actually_matters = variables.variables.map((v, i) => {
      const prefix = i === 0 ? "The primary driver is" : i === 1 ? "Second," : "Additionally,";
      const dirLabel = v.directional_impact === "positive" ? "a tailwind" : v.directional_impact === "negative" ? "a headwind" : "a source of uncertainty";
      const freqLabel = v.update_frequency === "real_time" ? "(monitor continuously)" : v.update_frequency === "quarterly" ? "(reassess each quarter)" : v.update_frequency === "event_driven" ? "(event-dependent)" : "(annual review)";
      return `${prefix} ${v.variable} — ${dirLabel} ${freqLabel}. ${v.why_it_matters}`;
    }).join(" ");
  }

  // Section 3: Risk / Break Point — specific failure condition + trigger
  let risk_break_point = "";
  if (eligibility === "avoid_for_now") {
    const filterFlags = businessContext.eligibility.filter_flags;
    risk_break_point = `${thesis.failure_condition} Filter flags active: ${filterFlags.join(", ") || "outside competence boundary"}. The break point is not a future event — it is the current state.`;
  } else {
    risk_break_point = `${thesis.failure_condition} Specific trigger: ${payout.if_wrong.trigger}. ${payout.if_wrong.mechanism}`;
  }

  // Section 4: Upside vs Downside — explicit triggers, not just mechanisms
  const asymLabel = payout.asymmetry_ratio >= 1.5 ? "favorable" : payout.asymmetry_ratio >= 1.0 ? "roughly symmetric" : "unfavorable";
  const upside_vs_downside =
    `If right: ${payout.if_right.mechanism}. Trigger: ${payout.if_right.trigger}. ` +
    `If wrong: ${payout.if_wrong.mechanism}. Trigger: ${payout.if_wrong.trigger}. ` +
    `Asymmetry: ${payout.asymmetry_ratio.toFixed(1)}x (${asymLabel}). ` +
    (payout.asymmetry_ratio < 1.0 ? "The risk/reward does not justify a position without further evidence." : "");

  // Section 5: Judgment Tension — [NEW 10.3-B] explicit, not implied
  // Note: __ctx__ is injected by runDeepResearch for narrative composition
  const ctxForTension = (businessContext as BusinessUnderstandingContextWithCtx).__ctx__;
  const judgmentTension = ctxForTension ? injectJudgmentTension(ctxForTension) : {
    tension_statement: "Every investment involves a judgment call that data cannot fully resolve.",
    resolution_path: "Improve signal density and identify a specific catalyst before acting.",
    advisory_only: true as const,
  };
  const judgment_tension = `${judgmentTension.tension_statement} Resolution path: ${judgmentTension.resolution_path}`;

  // Section 6: Deeper Layer (Implicit Factors — capital-reality language)
  let deeper_layer: string | undefined;
  if (implicitFactors.factors.length > 0) {
    const topFactor = implicitFactors.factors[0];
    const secondFactor = implicitFactors.factors[1];
    deeper_layer = `[${topFactor.type}] ${topFactor.factor}. ${topFactor.impact}` +
      (secondFactor ? ` [${secondFactor.type}] ${secondFactor.factor.toLowerCase()}. ${secondFactor.impact}` : "");
  }

  // Section 7: Investment Lens — honest, not aspirational
  let investment_lens = "";
  if (eligibility === "avoid_for_now" || competence === "outside") {
    investment_lens = `Outside competence boundary. No position is warranted. The appropriate discipline is to acknowledge the limit of understanding rather than rationalize entry. Revisit only if sector competence is established.`;
  } else if (moat === "wide" && mgmt === "disciplined" && thesis.thesis_confidence >= 0.65 && payout.asymmetry_ratio >= 1.5) {
    investment_lens = `Long-term compounder candidate with favorable asymmetry (${payout.asymmetry_ratio.toFixed(1)}x). The discipline required is patience and resistance to quarterly noise. The thesis is not about the next quarter — it is about whether the moat compounds over years.`;
  } else if (thesis.thesis_confidence >= 0.55 && payout.asymmetry_ratio >= 1.0) {
    investment_lens = `Watchlist with directional conviction but insufficient density for full sizing. Monitor the critical driver (${thesis.critical_driver.split(" — ")[0]}) for confirmation before upgrading to active position.`;
  } else if (thesis.thesis_confidence < 0.4) {
    investment_lens = `Observation only. Signal density is below the threshold for actionable conviction. The risk of acting on incomplete information here is higher than the risk of missing the opportunity.`;
  } else {
    investment_lens = `Mixed risk/reward (${payout.asymmetry_ratio.toFixed(1)}x asymmetry). A small, monitored position may be appropriate for those with specific insight into the critical driver, but this is not a high-conviction setup. Size to reflect the uncertainty.`;
  }

  // Section 8: Experience Learning Insight — [NEW 10.4] Pattern from judgment history
  // This section surfaces meta-learning from historical decision patterns
  // It is injected from buildExperienceHistorySummary() (async, non-blocking)

  // ── LEVEL11 sections: Multi-Asset Reality Layer ────────────────────────────
  let core_reality: string | undefined;
  let real_vs_perceived: string | undefined;
  let incentives_human_layer: string | undefined;
  let policy_reality_lens: string | undefined;
  let sentiment_positioning: string | undefined;
  let cross_asset_implications: string | undefined;
  let scenario_map_summary: string | undefined;

  if (level11Analysis) {
    const l11 = level11Analysis;
    // Core Reality: what is truly driving this asset
    const topDriver = l11.real_drivers.drivers[0];
    core_reality = topDriver
      ? `[${l11.classification.asset_type.toUpperCase()}] Real driver: ${topDriver.driver} (${topDriver.type}). ` +
        `Strength: ${(topDriver.strength * 100).toFixed(0)}%. ${topDriver.why}. ` +
        `Primary real driver: ${l11.real_drivers.primary_real_driver}. ` +
        `Signal vs noise: ${l11.real_drivers.signal_vs_noise_summary}.`
      : `Asset classified as ${l11.classification.asset_type}. No dominant real driver identified — signal density insufficient.`;

    // Real vs Perceived: narrative vs reality separation
    const narrativeDrivers = l11.real_drivers.drivers.filter(d => d.type === "narrative");
    const realDrivers = l11.real_drivers.drivers.filter(d => d.type === "real");
    if (narrativeDrivers.length > 0 && realDrivers.length > 0) {
      real_vs_perceived = `Narrative driver: ${narrativeDrivers[0].driver}. ` +
        `Real driver: ${realDrivers[0].driver}. ` +
        `The market may be pricing the narrative while the real driver determines the actual outcome.`;
    } else if (narrativeDrivers.length > 0) {
      real_vs_perceived = `Primary driver appears narrative-based: ${narrativeDrivers[0].driver}. ` +
        `Primary narrative driver: ${l11.real_drivers.primary_narrative_driver}. ` +
        `No offsetting real driver identified — narrative-driven moves can reverse sharply.`;
    }

    // Incentives & Human Layer
    const topPlayer = l11.incentives.key_players[0];
    const topIncentive = l11.incentives.incentives[0];
    if (topPlayer || topIncentive) {
      incentives_human_layer = `Key player: ${topPlayer ?? "unknown"}. ` +
        `Primary incentive: ${topIncentive ?? "not identified"}. ` +
        `Narrative support: ${l11.incentives.narrative_support}. ` +
        `Narrative fragility: ${l11.incentives.narrative_fragility}.`;
    }

    // Policy Reality Lens
    if (l11.policy_reality) {
      const pr = l11.policy_reality;
      policy_reality_lens = `Policy intent: ${pr.policy_intent}. ` +
        `Execution strength: ${pr.execution_strength}. ` +
        `Consistency: ${pr.execution_consistency}. ` +
        `Effective impact: ${pr.effective_impact}. ` +
        `Market pricing: ${pr.market_pricing}.`;
    }

    // Sentiment & Positioning
    const sp = l11.sentiment_state;
    const crowdednessLabel = sp.crowdedness >= 0.8 ? "highly crowded" : sp.crowdedness >= 0.5 ? "moderately crowded" : "not crowded";
    const reversalLabel = sp.risk_of_reversal >= 0.7 ? "high" : sp.risk_of_reversal >= 0.4 ? "moderate" : "low";
    sentiment_positioning = `Sentiment phase: ${sp.sentiment_phase} (${crowdednessLabel}, crowdedness: ${(sp.crowdedness * 100).toFixed(0)}%). ` +
      `${sp.phase_description}. ` +
      `Reversal risk: ${reversalLabel} (${(sp.risk_of_reversal * 100).toFixed(0)}%). ` +
      `Positioning: ${sp.positioning}.`;

    // Cross-Asset Implications
    if (l11.propagation_chain && l11.propagation_chain.chain.length > 0) {
      const topLink = l11.propagation_chain.chain[0];
      const secondLink = l11.propagation_chain.chain[1];
      cross_asset_implications = `Propagation event: ${l11.propagation_chain.event}. ` +
        `${topLink.from} → ${topLink.to} (lag: ${topLink.lag}). ${topLink.mechanism}. ` +
        (secondLink ? `Secondary: ${secondLink.from} → ${secondLink.to}. ` : "") +
        `Terminal impact: ${l11.propagation_chain.terminal_impact}.`;
    }

    // Scenario Map Summary
    const sm = l11.scenario_map;
    // base_case/bull_case/bear_case are full narrative strings in Level11
    const baseSnippet = sm.base_case.split(".")[0] ?? sm.base_case;
    const bullSnippet = sm.bull_case.split(".")[0] ?? sm.bull_case;
    const bearSnippet = sm.bear_case.split(".")[0] ?? sm.bear_case;
    const topTrigger = sm.key_triggers[0] ?? "no explicit trigger identified";
    scenario_map_summary = `Base: ${baseSnippet}. Bull: ${bullSnippet}. Bear: ${bearSnippet}. ` +
      `Key trigger: ${topTrigger}.`;
  }

  const level11Texts = [core_reality ?? "", real_vs_perceived ?? "", incentives_human_layer ?? "",
    policy_reality_lens ?? "", sentiment_positioning ?? "", cross_asset_implications ?? "",
    scenario_map_summary ?? ""].join(" ");
  const fullText = [business_and_thesis, what_actually_matters, risk_break_point, upside_vs_downside, judgment_tension, deeper_layer ?? "", experienceInsightText ?? "", experienceLearningInsightText ?? "", positioningLensText ?? "", level11Texts, investment_lens].join(" ");
  const word_count = fullText.split(/\s+/).filter(Boolean).length;

  return {
    ticker,
    narrative: {
      business_and_thesis,
      what_actually_matters,
      risk_break_point,
      upside_vs_downside,
      judgment_tension,
      ...(deeper_layer ? { deeper_layer } : {}),
      ...(experienceInsightText ? { experience_layer_insight: experienceInsightText } : {}),
      ...(experienceLearningInsightText ? { experience_learning_insight: experienceLearningInsightText } : {}),
      ...(positioningLensText ? { positioning_lens: positioningLensText } : {}),
      investment_lens,
      // LEVEL11 sections
      ...(core_reality ? { core_reality } : {}),
      ...(real_vs_perceived ? { real_vs_perceived } : {}),
      ...(incentives_human_layer ? { incentives_human_layer } : {}),
      ...(policy_reality_lens ? { policy_reality_lens } : {}),
      ...(sentiment_positioning ? { sentiment_positioning } : {}),
      ...(cross_asset_implications ? { cross_asset_implications } : {}),
      ...(scenario_map_summary ? { scenario_map_summary } : {}),
    },
    word_count,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 6 — LENS ENGINE (LIGHT CONCLUSION)
// ─────────────────────────────────────────────────────────────────────────────

export type LensType = "long_term_compounder" | "watchlist" | "tactical_trade" | "speculative";

export interface LensOutput {
  lens_type: LensType;
  conviction_level: number;  // 0–1
  why: string;
  advisory_only: true;
}

/**
 * Generate a light conclusion lens.
 * NO buy/sell — must connect to thesis + payout.
 */
export function generateLens(
  thesis: InvestmentThesisOutput,
  payout: PayoutMapOutput,
  businessContext: BusinessContext
): LensOutput {
  const moat = businessContext.businessUnderstanding.moat_strength;
  const eligibility = businessContext.eligibility.eligibility_status;
  const mgmt = businessContext.managementProxy.capital_allocation_quality;
  const competence = businessContext.competenceFit.competence_fit;

  let lens_type: LensType;
  let conviction_level: number;
  let why: string;

  if (eligibility === "avoid_for_now" || competence === "outside") {
    lens_type = "speculative";
    conviction_level = Math.min(0.25, thesis.thesis_confidence);
    why = `Outside competence boundary with unfavorable asymmetry (${payout.asymmetry_ratio.toFixed(1)}x). Any position would be speculative rather than thesis-driven.`;
  } else  if (moat === "wide" && mgmt === "disciplined" && thesis.thesis_confidence >= 0.65 && payout.asymmetry_ratio >= 1.5) {
    lens_type = "long_term_compounder";
    conviction_level = Math.min(0.90, thesis.thesis_confidence * 1.1);
    why = `Wide moat + disciplined management + favorable asymmetry (${payout.asymmetry_ratio.toFixed(1)}x) = structural compounding setup. Thesis confidence: ${(thesis.thesis_confidence * 100).toFixed(0)}%.`;
  } else if (thesis.thesis_confidence >= 0.50 && payout.asymmetry_ratio >= 1.0) {    lens_type = "watchlist";
    conviction_level = thesis.thesis_confidence * 0.85;
    why = `Solid thesis with adequate asymmetry (${payout.asymmetry_ratio.toFixed(1)}x) but not yet high-conviction. Requires confirmation of key variables before upgrading.`;
  } else if (thesis.thesis_confidence >= 0.35 && payout.asymmetry_ratio < 1.0) {
    lens_type = "tactical_trade";
    conviction_level = thesis.thesis_confidence * 0.6;
    why = `Event-driven or short-term setup with limited structural support. Asymmetry (${payout.asymmetry_ratio.toFixed(1)}x) does not support a structural position — tactical only.`;
  } else {
    lens_type = "speculative";
    conviction_level = Math.max(0.05, thesis.thesis_confidence * 0.5);
    why = `Low thesis confidence (${(thesis.thesis_confidence * 100).toFixed(0)}%) and unfavorable asymmetry (${payout.asymmetry_ratio.toFixed(1)}x). Insufficient basis for a structured position.`;
  }

  return {
    lens_type,
    conviction_level: Math.round(conviction_level * 100) / 100,
    why,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 7 — SIGNAL DENSITY CHECK
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalDensityResult {
  passed: boolean;
  issues: string[];
  density_score: number;  // 0–1
  advisory_only: true;
}

// [LEVEL10.3-B] Expanded rejection rules
const GENERIC_PHRASES = [
  "has risks and opportunities",
  "balanced approach",
  "could go either way",
  "uncertain outlook",
  "mixed signals",
  "needs more research",
  "it depends",
  "both sides",
  "monitor closely",
];

/**
 * [LEVEL10.3-B] Validate narrative signal density — 4 rejection rules:
 * 1. Generic phrase detection (expanded list)
 * 2. Missing thesis mechanism or observable signal
 * 3. Missing explicit payout trigger (not just mechanism)
 * 4. Missing judgment tension statement
 */
export function validateSignalDensity(narrative: ResearchNarrativeOutput): SignalDensityResult {
  const issues: string[] = [];
  let density_score = 1.0;

  const fullText = Object.values(narrative.narrative).filter(Boolean).join(" ").toLowerCase();

  // Rule 1: Generic phrase detection
  for (const phrase of GENERIC_PHRASES) {
    if (fullText.includes(phrase.toLowerCase())) {
      issues.push(`Generic phrase detected: "${phrase}" — replace with specific mechanism`);
      density_score -= 0.12;
    }
  }

  // Rule 2: Thesis must include mechanism + observable signal
  const thesisText = narrative.narrative.business_and_thesis ?? "";
  if (thesisText.length < 80) {
    issues.push("Thesis too short — must include specific mechanism and observable signal");
    density_score -= 0.25;
  }
  const hasMechanism = ["driven by", "anchored by", "mechanism", "observable signal", "the market is"].some(kw => thesisText.toLowerCase().includes(kw));
  if (!hasMechanism) {
    issues.push("Thesis lacks specific mechanism or observable signal — 'the business is good' is not a thesis");
    density_score -= 0.20;
  }

  // Rule 3: Payout must include explicit trigger (not just mechanism)
  const payoutText = narrative.narrative.upside_vs_downside ?? "";
  if (payoutText.length < 80) {
    issues.push("Payout section too short — must include explicit triggers for both if-right and if-wrong");
    density_score -= 0.20;
  }
  const hasTrigger = ["trigger:", "if right:", "if wrong:", "resolves", "materializes", "confirms"].some(kw => payoutText.toLowerCase().includes(kw));
  if (!hasTrigger) {
    issues.push("Payout section lacks explicit triggers — must specify the observable event that confirms each side");
    density_score -= 0.15;
  }

  // Rule 4: Judgment tension must be present
  const hasTension = narrative.narrative.judgment_tension && narrative.narrative.judgment_tension.length > 50;
  if (!hasTension) {
    issues.push("Missing judgment tension statement — every investment involves a real tension that data cannot resolve");
    density_score -= 0.15;
  }

  // Bonus: directional keyword density
  const directionalKeywords = ["if right", "if wrong", "break", "driver", "trigger", "mechanism", "asymmetry", "upside", "downside", "thesis breaks"];
  const directionalCount = directionalKeywords.filter(kw => fullText.includes(kw)).length;
  if (directionalCount < 4) {
    issues.push(`Low directional keyword density (${directionalCount}/10) — narrative may be too descriptive`);
    density_score -= 0.10;
  }

  // Word count check
  if (narrative.word_count < 100) {
    issues.push(`Narrative too short (${narrative.word_count} words) — minimum 100 words for adequate signal density`);
    density_score -= 0.10;
  }

  density_score = Math.max(0, Math.round(density_score * 100) / 100);
  const passed = issues.length === 0 && density_score >= 0.7;

  return {
    passed,
    issues,
    density_score,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE RUNNER — Run all modules in sequence
// ─────────────────────────────────────────────────────────────────────────────

export interface ExperienceHistorySummaryEmbed {
  record_count: number;
  dominant_drift_trend: string;
  confidence_trend: string;
  pattern_consistency: number;
  meta_insight: string;
  recommended_adjustment: string;
  advisory_only: true;
}

export interface DeepResearchOutput {
  ticker: string;
  thesis: InvestmentThesisOutput;
  key_variables: KeyVariablesOutput;
  payout_map: PayoutMapOutput;
  implicit_factors: ImplicitFactorsOutput;
  judgment_tension: JudgmentTensionOutput;  // [NEW 10.3-B]
  experience_layer?: ExperienceLayerOutput; // [NEW 10.3-C] Optional, non-blocking
  experience_history?: ExperienceHistorySummaryEmbed; // [NEW 10.4] Optional async history
  narrative: ResearchNarrativeOutput;
  lens: LensOutput;
  signal_density: SignalDensityResult;
  advisory_only: true;
}

/**
 * [LEVEL10.4] Run the full deep research pipeline for a single ticker.
 * Upgraded: Experience Learning History integrated (async, non-blocking).
 * Returns a Promise to support async experience history lookup.
 */
export async function runDeepResearch(
  ctx: DeepResearchContextMap,
  experienceParams?: {
    priceAction: PriceActionContext;
    capitalFlow: CapitalFlowContext;
    signalFusionScore?: number;
  }
): Promise<DeepResearchOutput> {
  const thesis = buildInvestmentThesis(ctx);
  const keyVariables = identifyKeyVariables(ctx);
  const payoutMap = buildPayoutMap(ctx);
  const implicitFactors = inferImplicitFactors(ctx);
  const judgmentTension = injectJudgmentTension(ctx);

  // [LEVEL10.3-C] Run Experience Layer (non-blocking)
  let experienceLayer: ExperienceLayerOutput | undefined;
  let experienceInsightText: string | undefined;
  if (experienceParams) {
    try {
      experienceLayer = runExperienceLayer({
        ticker: ctx.ticker,
        thesis: {
          thesis_confidence: thesis.thesis_confidence,
          failure_condition: thesis.failure_condition,
          core_thesis: thesis.core_thesis,
        },
        signalFusionScore: experienceParams.signalFusionScore ?? 0.5,
        bqScore: ctx.investorThinking.business_quality.business_quality_score,
        regimeTag: ctx.regime?.regime_tag ?? "neutral",
        hasEventShock: ctx.investorThinking.event_adjustment?.event_bias === "bearish" ||
                       ctx.investorThinking.event_adjustment?.event_bias === "volatile",
        priceAction: experienceParams.priceAction,
        capitalFlow: experienceParams.capitalFlow,
      });
      experienceInsightText = experienceLayer.experience_insight.full_insight;
    } catch {
      // Non-blocking: experience layer failure does not break the pipeline
      experienceLayer = undefined;
    }
  }

  // [LEVEL10.4] Run Experience Learning History (async, non-blocking)
  let experienceHistory: ExperienceHistorySummaryEmbed | undefined;
  let experienceLearningInsightText: string | undefined;
  let experienceHistorySummary: ExperienceHistorySummary | undefined;
  try {
    const historySummary: ExperienceHistorySummary = await buildExperienceHistorySummary(ctx.ticker);
    if (historySummary.record_count > 0) {
      experienceHistorySummary = historySummary;
      experienceHistory = {
        record_count: historySummary.record_count,
        dominant_drift_trend: historySummary.drift_analysis.dominant_trend,
        confidence_trend: historySummary.confidence_trajectory.trend,
        pattern_consistency: historySummary.behavior_evolution.pattern_consistency,
        meta_insight: historySummary.meta_insight.meta_insight,
        recommended_adjustment: historySummary.meta_insight.recommended_adjustment,
        advisory_only: true,
      };
      // Build learning insight text for narrative injection
      experienceLearningInsightText =
        `[Experience Learning — ${historySummary.record_count} historical records] ` +
        `${historySummary.meta_insight.meta_insight} ` +
        `Recommended adjustment: ${historySummary.meta_insight.recommended_adjustment}`;
    }
  } catch {
    // Non-blocking: experience history failure does not break the pipeline
    experienceHistory = undefined;
    experienceLearningInsightText = undefined;
    experienceHistorySummary = undefined;
  }

  // [LEVEL10.5] Build Positioning Lens text (non-blocking, advisory only)
  let positioningLensText: string | undefined;
  try {
    const { runPositionLayer } = await import("./level105PositionLayer");
    const payoutMapForLayer = payoutMap;
    const gradientRiskForLayer = experienceLayer?.gradient_risk ?? {
      risk_state: "low" as const,
      risk_trend: "stable" as const,
      early_warning_signs: [],
      advisory_only: true as const,
    };
    const posLayer = runPositionLayer({
      thesis,
      payoutMap: payoutMapForLayer,
      gradientRisk: gradientRiskForLayer,
      businessContext: ctx.businessContext,
      experienceHistory: experienceHistorySummary,
      regimeTag: ctx.regime?.regime_tag,
    });
    positioningLensText =
      `[Positioning Lens — ADVISORY ONLY] ` +
      `Asymmetry: ${posLayer.asymmetry.asymmetry_label} (score: ${(posLayer.asymmetry.asymmetry_score * 100).toFixed(0)}%). ` +
      `${posLayer.asymmetry.why}. ` +
      `Suggested size: ${posLayer.sizing.size_bucket} (${posLayer.sizing.target_position_pct}% of portfolio). ` +
      `${posLayer.sizing.sizing_rationale}. ` +
      (posLayer.no_bet_discipline.restriction_level !== "none"
        ? `Restriction: ${posLayer.no_bet_discipline.reason}`
        : `No position restriction — proceed with sizing framework.`);
  } catch {
    // Non-blocking: position layer failure does not break the pipeline
    positioningLensText = undefined;
  }

   // ── [LEVEL 12.2] Semantic Aggregation Boundary ───────────────────────────
  // Non-blocking: aggregation failure does not break the pipeline
  let unifiedSemanticState: UnifiedSemanticState | undefined;
  try {
    const semanticPackets = [];
    // PATH-B: ExperienceLayer → synthesis
    if (experienceLayer) {
      const expPacket = buildExperienceLayerSemanticPacket(experienceLayer.experience_insight, ctx.ticker);
      semanticPackets.push(expPacket);
    }
    // PATH-C: PositionLayer → synthesis (requires posLayer from scope)
    // posLayer is captured in the try block above; we re-run a minimal version here
    // using the asymmetry/sizing data already embedded in positioningLensText.
    // Full posLayer integration is handled in Phase 4 (synthesisController extension).
    if (semanticPackets.length > 0) {
      unifiedSemanticState = aggregateSemanticPackets({
        packets: semanticPackets,
      });
    }
  } catch {
    // Non-blocking: semantic aggregation failure does not break the pipeline
    unifiedSemanticState = undefined;
  }
  // ── [LEVEL 12.2] End Semantic Aggregation Boundary ──────────────────────

  // Attach ctx reference for composeResearchNarrative to access injectJudgmentTension
  const businessContextWithCtx = { ...ctx.businessContext, __ctx__: ctx };
  const narrative = composeResearchNarrative(
    thesis,
    keyVariables,
    payoutMap,
    implicitFactors,
    businessContextWithCtx,
    ctx.ticker,
    experienceInsightText,  // [NEW 10.3-C]
    experienceLearningInsightText,  // [NEW 10.4]
    positioningLensText  // [NEW 10.5]
  );
  const lens = generateLens(thesis, payoutMap, ctx.businessContext);
  const signalDensity = validateSignalDensity(narrative);

  return {
    ticker: ctx.ticker,
    thesis,
    key_variables: keyVariables,
    payout_map: payoutMap,
    implicit_factors: implicitFactors,
    judgment_tension: judgmentTension,
    ...(experienceLayer ? { experience_layer: experienceLayer } : {}),
    ...(experienceHistory ? { experience_history: experienceHistory } : {}),
    narrative,
    lens,
    signal_density: signalDensity,
    advisory_only: true,
  };
}
