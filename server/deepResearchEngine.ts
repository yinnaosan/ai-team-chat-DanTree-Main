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
  core_thesis: string;
  main_contradiction: string;
  thesis_confidence: number;  // 0–1
  advisory_only: true;
}

/**
 * Build the core investment thesis from upstream context.
 * core_thesis = ONE dominant idea.
 * main_contradiction = the real tension (e.g. growth vs disruption).
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

  // Determine thesis confidence: data quality + BQ score + signal fusion
  const raw_confidence = (bq.business_quality_score * 0.4) + (signalFusionScore * 0.35) + (dataQualityScore * 0.25);
  const thesis_confidence = Math.min(0.95, Math.max(0.1, raw_confidence));

  // Build core thesis based on moat + eligibility + regime
  let core_thesis = "";
  let main_contradiction = "";

  if (eligibility === "avoid_for_now" || competence === "outside") {
    core_thesis = `${ticker} operates outside the defined competence boundary — the business model and competitive dynamics are insufficiently understood to form a reliable thesis.`;
    main_contradiction = `Sector familiarity gap vs. potential signal noise masquerading as opportunity.`;
  } else if (moat === 'wide' && bq.business_quality_score >= 0.75) {
    // High-quality compounder thesis
    const moatSource = businessContext.businessUnderstanding.why_this_business_might_be_good[0] ?? "durable competitive advantage";
    core_thesis = `${ticker} is a high-quality ${sector} business with a wide moat anchored by ${moatSource}. The core thesis is that the market is underpricing the durability and reinvestment capacity of this franchise.`;
    if (regimeTag === "risk_off" || regimeTag === "macro_stress") {
      main_contradiction = `Franchise durability vs. near-term macro headwinds compressing multiples.`;
    } else if (falsification.key_risk_flags.includes("valuation_stretch")) {
      main_contradiction = `Compounding power vs. current valuation already pricing in optimistic outcomes.`;
    } else {
      main_contradiction = `Long-term compounding potential vs. short-term market focus on quarterly noise.`;
    }
  } else if (moat === 'narrow' && bq.business_quality_score >= 0.55) {
    // Solid but not exceptional business
    core_thesis = `${ticker} is a solid ${sector} business with a defensible but not dominant position. The thesis depends on execution consistency and avoiding competitive erosion rather than structural expansion.`;
    if (dominantFactor === "alpha_score") {
      main_contradiction = `Positive near-term momentum vs. limited structural moat to sustain it.`;
    } else {
      main_contradiction = `Adequate business quality vs. risk of mean reversion if execution falters.`;
    }
  } else if (regimeTag === "event_shock" || dominantFactor === "danger_score") {
    // Event-driven or distressed thesis
    core_thesis = `${ticker} is currently in an event-driven situation where near-term catalysts dominate the risk/reward. The thesis is not about business quality but about whether the market is mispricing the event outcome.`;
    main_contradiction = `Event-driven upside vs. structural business weakness that may persist post-event.`;
  } else {
    // Low conviction / uncertain thesis
    core_thesis = `${ticker} presents a mixed signal profile with insufficient data density to form a high-conviction thesis. The business quality and competitive positioning remain unclear.`;
    main_contradiction = `Potential upside from signal improvement vs. risk of false positives in low-data environment.`;
  }

  return {
    core_thesis,
    main_contradiction,
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

  // Variable 1: Business quality / moat durability
  if (moat === "wide" || moat === "narrow") {
    variables.push({
      variable: "Moat durability and reinvestment rate",
      why_it_matters: `With a ${moat} moat, the key question is whether the business can sustain its competitive advantage while deploying capital at high returns. BQ score is ${bq.business_quality_score.toFixed(2)}.`,
      directional_impact: bq.business_quality_score >= 0.65 ? "positive" : "uncertain",
    });
  } else if (moat === "weak" || moat === "unknown") {
    variables.push({
      variable: "Competitive erosion risk",
      why_it_matters: `A weak or unverifiable moat means the business is vulnerable to margin compression or market share loss. This is the primary risk variable.`,
      directional_impact: "negative",
    });
  }

  // Variable 2: Event / catalyst sensitivity
  if (event.adjusted_risk_weight > 1.1 || event.adjusted_alpha_weight > 1.1) {
    const impactDir: DirectionalImpact = event.event_bias === "bullish" ? "positive" : event.event_bias === "bearish" ? "negative" : "uncertain";
    variables.push({
      variable: `Event catalyst (bias: ${event.event_bias})`,
      why_it_matters: `The current event context has a ${event.event_bias} bias. Alpha weight: ${event.adjusted_alpha_weight.toFixed(2)}, Risk weight: ${event.adjusted_risk_weight.toFixed(2)}. ${event.event_summary}`,
      directional_impact: impactDir,
    });
  } else if (regimeTag === "macro_stress" || regimeTag === "risk_off") {
    variables.push({
      variable: "Macro regime pressure",
      why_it_matters: `The current ${regimeTag} regime creates systematic headwinds. Even quality businesses face multiple compression in this environment.`,
      directional_impact: "negative",
    });
  }

  // Variable 3: Factor interaction or management quality
  if (variables.length < 3) {
    if (interaction.interaction_dominant_effect && interaction.interaction_dominant_effect !== "none" && interaction.interaction_reasons.length > 0) {
      const alphaAdj = interaction.adjusted_alpha_score - 0.5;
      const dir: DirectionalImpact = alphaAdj > 0.05 ? "positive" : alphaAdj < -0.05 ? "negative" : "uncertain";
      variables.push({
        variable: `Factor interaction: ${interaction.interaction_dominant_effect}`,
        why_it_matters: `Active factor interaction detected. ${interaction.interaction_reasons[0] ?? ""}`,
        directional_impact: dir,
      });
    } else if (mgmt === "disciplined") {
      variables.push({
        variable: "Management capital allocation discipline",
        why_it_matters: `Disciplined capital allocation (score: ${businessContext.managementProxy.management_proxy_score.toFixed(2)}) is a compounding multiplier — it determines whether earnings translate into shareholder value.`,
        directional_impact: "positive",
      });
    } else if (mgmt === "poor" || mgmt === "unknown") {
      variables.push({
        variable: "Management execution risk",
        why_it_matters: `Poor or unverifiable management quality (score: ${businessContext.managementProxy.management_proxy_score.toFixed(2)}) introduces execution risk that can erode even a structurally sound business.`,
        directional_impact: "negative",
      });
    } else if (dataQualityScore < 0.5) {
      variables.push({
        variable: "Data quality and signal reliability",
        why_it_matters: `Low data quality (${dataQualityScore.toFixed(2)}) means conclusions are built on incomplete information. The uncertainty itself is a key variable.`,
        directional_impact: "uncertain",
      });
    }
  }

  // Falsification override: if falsification tags are present, add as variable
  if (falsification.key_risk_flags.length > 0 && variables.length < 3) {
    variables.push({
      variable: `Falsification risk: ${falsification.key_risk_flags[0]}`,
      why_it_matters: `The system has flagged ${falsification.key_risk_flags[0]} as a potential thesis-breaking condition. If this materializes, the core thesis is invalidated.`,
      directional_impact: "negative",
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
      mechanism: "Speculative re-rating if business quality proves better than assessed",
      drivers: ["Sector re-rating", "Unexpected earnings beat", "Management change"],
    };
    if_wrong = {
      mechanism: "Continued deterioration with no structural floor",
      risks: fragileReasons.length > 0 ? fragileReasons : ["Weak moat", "Poor management", "Outside competence circle"],
    } as PayoutSide;
    asymmetry_ratio = 0.5; // unfavorable asymmetry
  } else  if (moat === "wide" && bq.business_quality_score >= 0.75) {
    const upsideDrivers: string[] = [];
    if (goodReasons.length > 0) upsideDrivers.push(...goodReasons.slice(0, 2));
    if (mgmt === "disciplined") upsideDrivers.push("Disciplined reinvestment compounds returns over time");
    if (regimeTag === "risk_on") upsideDrivers.push("Favorable macro tailwind amplifies multiple expansion");
    const downsideRisks: string[] = [];
    if (falsification.key_risk_flags.length > 0) downsideRisks.push(...falsification.key_risk_flags.map(t => `Falsification: ${t}`));
    if (fragileReasons.length > 0) downsideRisks.push(...fragileReasons.slice(0, 1));
    if (regimeTag === "macro_stress") downsideRisks.push("Macro stress compresses valuation multiples");

    if_right = {
      mechanism: "Market re-rates the franchise at a premium as earnings quality and durability become apparent",
      drivers: upsideDrivers.length > 0 ? upsideDrivers : ["Earnings compounding", "Multiple expansion", "Capital return"],
    };
    if_wrong = {
      mechanism: "Valuation de-rating if growth decelerates or competitive position weakens",
      risks: downsideRisks.length > 0 ? downsideRisks : ["Valuation stretch", "Competitive disruption", "Macro headwinds"],
    } as PayoutSide;
    asymmetry_ratio = 1.8; // favorable asymmetry for quality compounders
  } else if (moat === "narrow") {
    if_right = {
      mechanism: "Steady earnings delivery with gradual multiple re-rating as execution proves consistent",
      drivers: goodReasons.length > 0 ? goodReasons.slice(0, 2) : ["Consistent execution", "Market share stability"],
    };
    if_wrong = {
      mechanism: "Competitive erosion or execution miss triggers disproportionate de-rating",
      risks: fragileReasons.length > 0 ? fragileReasons.slice(0, 2) : ["Competitive pressure", "Margin compression"],
    } as PayoutSide;
    asymmetry_ratio = 1.1; // roughly symmetric
  } else {
    // Weak moat or event-driven
    if_right = {
      mechanism: "Event catalyst resolves favorably, triggering short-term re-rating",
      drivers: ["Event resolution", "Sentiment shift", "Short-term momentum"],
    };
    if_wrong = {
      mechanism: "Event disappoints or structural weakness reasserts, amplified by weak moat",
      risks: ["Event risk", "Structural deterioration", "Liquidity pressure"],
    } as PayoutSide;
    asymmetry_ratio = 0.8; // slightly unfavorable
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

export type ImplicitFactorType =
  | "management_style"
  | "market_narrative"
  | "industry_game"
  | "policy_bias"
  | "capital_behavior";

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

  // 1. Management overpromising: high event severity + poor execution consistency
  if (event.adjusted_risk_weight >= 1.3 && mgmt.management_proxy_score < 0.5 && mgmt.capital_allocation_quality !== "disciplined") {
    factors.push({
      factor: "Management credibility risk — pattern of high event sensitivity with weak execution",
      type: "management_style",
      impact: "Elevated risk of guidance misses or strategic pivots that erode investor trust",
      confidence: 0.65,
    });
  }

  // 2. Market pricing perfection: high BQ + high fusion score + risk_on regime
  if (bq.business_quality_score >= 0.80 && regimeTag === "risk_on" && interaction.adjusted_alpha_score > 0.65) {
    factors.push({
      factor: "Market may be pricing near-perfection — high-quality narrative is widely known",
      type: "market_narrative",
      impact: "Limited margin of safety; any earnings miss or guidance cut could trigger outsized de-rating",
      confidence: 0.70,
    });
  }

  // 3. Policy tailwind for sector leaders: risk_on + inside competence + wide moat
  if (regimeTag === "risk_on" && businessContext.competenceFit.competence_fit === "inside" && moat === "wide") {
    factors.push({
      factor: "Policy and capital flows favor sector leaders in current risk-on environment",
      type: "policy_bias",
      impact: "Institutional capital rotation into quality names amplifies multiple expansion beyond fundamentals",
      confidence: 0.55,
    });
  }

  // 4. Industry consolidation pressure: weak moat + event_shock
  if ((moat === "weak" || moat === "unknown") && regimeTag === "event_shock") {
    factors.push({
      factor: "Industry consolidation pressure — weaker players face accelerated competitive displacement",
      type: "industry_game",
      impact: "Event shock may accelerate structural shifts that disadvantage businesses without durable moats",
      confidence: 0.60,
    });
  }

  // 5. Capital behavior: high fusion score + risk_off (smart money defensive rotation)
  if (regimeTag === "risk_off" && bq.business_quality_score >= 0.70) {
    factors.push({
      factor: "Defensive capital rotation — quality businesses attract institutional flows in risk-off environments",
      type: "capital_behavior",
      impact: "Relative outperformance likely even if absolute returns are muted; acts as portfolio anchor",
      confidence: 0.65,
    });
  }

  // 6. Low data confidence: uncertainty itself is an implicit factor
  if (dataQualityScore < 0.45) {
    factors.push({
      factor: "Information asymmetry — low data quality creates both risk and opportunity",
      type: "market_narrative",
      impact: "Market may be mispricing due to incomplete information; requires independent verification before acting",
      confidence: 0.50,
    });
  }

  // 7. Price momentum divergence from fundamentals
  if (priceChangePercent !== undefined && Math.abs(priceChangePercent) > 0.15 && bq.business_quality_score < 0.5) {
    const dir = priceChangePercent > 0 ? "upward" : "downward";
    factors.push({
      factor: `Price momentum (${(priceChangePercent * 100).toFixed(1)}%) diverging from weak fundamentals`,
      type: "capital_behavior",
      impact: `${dir === "upward" ? "Momentum-driven buyers may be ignoring fundamental deterioration" : "Forced selling may be creating temporary dislocation"}`,
      confidence: 0.55,
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
// MODULE 5 — NARRATIVE COMPOSER
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchNarrativeOutput {
  ticker: string;
  narrative: {
    business_and_thesis: string;
    what_actually_matters: string;
    risk_break_point: string;
    upside_vs_downside: string;
    deeper_layer?: string;
    investment_lens: string;
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
  ticker: string
): ResearchNarrativeOutput {
  const moat = businessContext.businessUnderstanding.moat_strength;
  const eligibility = businessContext.eligibility.eligibility_status;
  const mgmt = businessContext.managementProxy.capital_allocation_quality;
  const competence = businessContext.competenceFit.competence_fit;

  // Section 1: Business & Thesis
  const business_and_thesis = thesis.core_thesis + " " +
    `The central tension is: ${thesis.main_contradiction} ` +
    `Thesis confidence: ${(thesis.thesis_confidence * 100).toFixed(0)}%.`;

  // Section 2: What Actually Matters (Key Variables)
  let what_actually_matters = "";
  if (variables.variables.length === 0) {
    what_actually_matters = "Signal density is insufficient to identify specific outcome-driving variables with confidence. The primary unknown is whether current data reflects the true business trajectory.";
  } else {
    what_actually_matters = variables.variables.map((v, i) => {
      const prefix = i === 0 ? "The primary driver is" : i === 1 ? "Second," : "Additionally,";
      const dirLabel = v.directional_impact === "positive" ? "a tailwind" : v.directional_impact === "negative" ? "a headwind" : "a source of uncertainty";
      return `${prefix} ${v.variable} — ${dirLabel}. ${v.why_it_matters}`;
    }).join(" ");
  }

  // Section 3: Risk / Break Point
  const falsificationTags = businessContext.eligibility.filter_flags;
  let risk_break_point = "";
  if (eligibility === "avoid_for_now") {
    risk_break_point = `The thesis breaks immediately if the business remains outside the competence boundary. Without sufficient understanding of the competitive dynamics, any position carries unquantifiable risk. Filter flags: ${falsificationTags.join(", ") || "outside competence"}.`;
  } else if (payout.if_wrong.risks && payout.if_wrong.risks.length > 0) {
    const primaryRisk = payout.if_wrong.risks[0];
    const secondaryRisk = payout.if_wrong.risks[1] ?? null;
    risk_break_point = `The thesis breaks if ${primaryRisk.toLowerCase()}${secondaryRisk ? `, or if ${secondaryRisk.toLowerCase()}` : ""}. ${payout.if_wrong.mechanism}`;
  } else {
    risk_break_point = `The primary break point is ${payout.if_wrong.mechanism.toLowerCase()}.`;
  }

  // Section 4: Upside vs Downside (Payout)
  const asymLabel = payout.asymmetry_ratio >= 1.5 ? "favorable" : payout.asymmetry_ratio >= 1.0 ? "roughly symmetric" : "unfavorable";
    const upside_vs_downside = `If the thesis is correct: ${payout.if_right.mechanism}. Key drivers: ${(payout.if_right.drivers ?? []).slice(0, 2).join(", ")}. ` +
    `If wrong: ${payout.if_wrong.mechanism}. ` +
    `The asymmetry ratio is ${payout.asymmetry_ratio.toFixed(1)}x — ${asymLabel}. ` +
    `${payout.asymmetry_ratio < 1.0 ? "The risk/reward does not justify a position without further evidence." : ""}`;

  // Section 5: Deeper Layer (Implicit Factors — optional)
  let deeper_layer: string | undefined;
  if (implicitFactors.factors.length > 0) {
    const topFactor = implicitFactors.factors[0];
    const secondFactor = implicitFactors.factors[1];
    deeper_layer = `Beyond the visible signals: ${topFactor.factor}. ${topFactor.impact}` +
      (secondFactor ? ` Additionally, ${secondFactor.factor.toLowerCase()}. ${secondFactor.impact}` : "");
  }

  // Section 6: Investment Lens
  let investment_lens = "";
  if (eligibility === "avoid_for_now" || competence === "outside") {
    investment_lens = `This name sits outside the defined competence boundary. The appropriate action is to monitor from a distance and revisit only if the business model becomes sufficiently understood. No position is warranted at this stage.`;
  } else if (moat === "wide" && mgmt === "disciplined" && thesis.thesis_confidence >= 0.65) {
    investment_lens = `This is a long-term compounder candidate. The business has the structural characteristics to generate above-average returns over a multi-year horizon. The key discipline is patience — the thesis requires time to play out and should not be evaluated on quarterly noise.`;
  } else if (thesis.thesis_confidence >= 0.55 && payout.asymmetry_ratio >= 1.0) {
    investment_lens = `This name warrants a watchlist position pending further evidence. The thesis is directionally sound but conviction is not yet high enough to justify a full position. Monitor for confirmation of the key variables identified above.`;
  } else if (thesis.thesis_confidence < 0.4) {
    investment_lens = `Signal density is too low to form a reliable investment lens. The appropriate posture is observation, not action. Revisit when data quality improves or a clearer catalyst emerges.`;
  } else {
    investment_lens = `The risk/reward is mixed. A small, monitored position may be appropriate for those with specific insight into the key variables, but this is not a high-conviction setup. Size accordingly.`;
  }

  const fullText = [business_and_thesis, what_actually_matters, risk_break_point, upside_vs_downside, deeper_layer ?? "", investment_lens].join(" ");
  const word_count = fullText.split(/\s+/).filter(Boolean).length;

  return {
    ticker,
    narrative: {
      business_and_thesis,
      what_actually_matters,
      risk_break_point,
      upside_vs_downside,
      ...(deeper_layer ? { deeper_layer } : {}),
      investment_lens,
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

const GENERIC_PHRASES = [
  "has risks and opportunities",
  "balanced approach",
  "could go either way",
  "uncertain outlook",
  "mixed signals",
  "needs more research",
];

/**
 * Validate that the narrative is high-signal, not generic.
 * Reject if: generic phrases, no thesis, no payout, purely descriptive.
 */
export function validateSignalDensity(narrative: ResearchNarrativeOutput): SignalDensityResult {
  const issues: string[] = [];
  let density_score = 1.0;

  const fullText = Object.values(narrative.narrative).join(" ").toLowerCase();

  // Check for generic phrases
  for (const phrase of GENERIC_PHRASES) {
    if (fullText.includes(phrase.toLowerCase())) {
      issues.push(`Generic phrase detected: "${phrase}"`);
      density_score -= 0.15;
    }
  }

  // Check for clear thesis
  if (!narrative.narrative.business_and_thesis || narrative.narrative.business_and_thesis.length < 50) {
    issues.push("Missing or too-short thesis statement");
    density_score -= 0.25;
  }

  // Check for payout explanation
  if (!narrative.narrative.upside_vs_downside || narrative.narrative.upside_vs_downside.length < 50) {
    issues.push("Missing payout / asymmetry explanation");
    density_score -= 0.25;
  }

  // Check for purely descriptive (no directional content)
  const directionalKeywords = ["if right", "if wrong", "break", "driver", "mechanism", "asymmetry", "upside", "downside", "risk", "thesis"];
  const directionalCount = directionalKeywords.filter(kw => fullText.includes(kw)).length;
  if (directionalCount < 3) {
    issues.push("Narrative is too descriptive — lacks directional investment content");
    density_score -= 0.20;
  }

  // Check word count (too short = low density)
  if (narrative.word_count < 80) {
    issues.push(`Narrative too short (${narrative.word_count} words) — insufficient signal density`);
    density_score -= 0.15;
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

export interface DeepResearchOutput {
  ticker: string;
  thesis: InvestmentThesisOutput;
  key_variables: KeyVariablesOutput;
  payout_map: PayoutMapOutput;
  implicit_factors: ImplicitFactorsOutput;
  narrative: ResearchNarrativeOutput;
  lens: LensOutput;
  signal_density: SignalDensityResult;
  advisory_only: true;
}

/**
 * Run the full LEVEL10.3 deep research pipeline for a single ticker.
 * Returns a complete DeepResearchOutput.
 */
export function runDeepResearch(ctx: DeepResearchContextMap): DeepResearchOutput {
  const thesis = buildInvestmentThesis(ctx);
  const keyVariables = identifyKeyVariables(ctx);
  const payoutMap = buildPayoutMap(ctx);
  const implicitFactors = inferImplicitFactors(ctx);
  const narrative = composeResearchNarrative(
    thesis,
    keyVariables,
    payoutMap,
    implicitFactors,
    ctx.businessContext,
    ctx.ticker
  );
  const lens = generateLens(thesis, payoutMap, ctx.businessContext);
  const signalDensity = validateSignalDensity(narrative);

  return {
    ticker: ctx.ticker,
    thesis,
    key_variables: keyVariables,
    payout_map: payoutMap,
    implicit_factors: implicitFactors,
    narrative,
    lens,
    signal_density: signalDensity,
    advisory_only: true,
  };
}
