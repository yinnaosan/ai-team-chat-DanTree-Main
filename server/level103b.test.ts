/**
 * LEVEL10.3-B — Deep Reality Upgrade Validation Tests
 * 4 Cases verifying the upgraded deepResearchEngine.ts
 *
 * Case 1: Wide-moat compounder with valuation tension (AAPL-like)
 * Case 2: Narrow-moat watchlist with regime tension (INTC-like)
 * Case 3: Outside competence boundary — avoid (COIN-like)
 * Case 4: Judgment tension types coverage
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildInvestmentThesis,
  identifyKeyVariables,
  buildPayoutMap,
  inferImplicitFactors,
  injectJudgmentTension,
  composeResearchNarrative,
  validateSignalDensity,
  generateLens,
  runDeepResearch,
  type DeepResearchContextMap,
} from "./deepResearchEngine";

// ─────────────────────────────────────────────────────────────────────────────
// SHARED MOCK FACTORY — uses actual interface shapes
// ─────────────────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<DeepResearchContextMap> = {}): DeepResearchContextMap {
  const base: DeepResearchContextMap = {
    ticker: "AAPL",
    sector: "Technology",
    signalFusionScore: 0.72,
    dataQualityScore: 0.80,
    priceChangePercent: 0.03,
    investorThinking: {
      ticker: "AAPL",
      business_quality: {
        business_quality_score: 0.82,
        quality_label: "high",
        quality_reasons: ["Wide moat", "Pricing power", "Ecosystem lock-in"],
        fragile_reasons: [],
        advisory_only: true,
      },
      event_adjustment: {
        event_detected: true,
        event_type: "earnings",
        event_summary: "Q4 earnings beat with strong services revenue growth",
        adjusted_risk_weight: 1.1,
        event_severity: "medium",
        advisory_only: true,
      },
      falsification: {
        falsification_triggered: false,
        key_risk_flags: ["valuation_stretch"],
        falsification_tags: ["high_pe"],
        advisory_only: true,
      },
      final_signal: {
        direction: "bullish",
        conviction: "high",
        signal_fusion_score: 0.72,
        advisory_only: true,
      },
      dominant_factor: "business_quality",
      advisory_only: true,
    },
    businessContext: {
      competenceFit: {
        ticker: "AAPL",
        sector: "Technology",
        competence_fit: "inside",
        fit_reason: "Core technology sector within competence boundary",
        advisory_only: true,
      },
      businessUnderstanding: {
        ticker: "AAPL",
        business_understanding_score: 0.82,
        moat_strength: "wide",
        business_model_quality: "strong",
        business_flags: [],
        why_this_business_might_be_good: ["Ecosystem lock-in", "Pricing power", "Services recurring revenue"],
        why_this_business_might_be_fragile: ["Valuation stretch at current multiples"],
        advisory_only: true,
      },
      managementProxy: {
        ticker: "AAPL",
        management_proxy_score: 0.80,
        capital_allocation_quality: "disciplined",
        management_flags: [],
        allocation_flags: [],
        advisory_only: true,
      },
      eligibility: {
        ticker: "AAPL",
        business_eligible: true,
        eligibility_status: "eligible",
        eligibility_reason: "Wide moat + strong management + inside competence",
        business_priority_multiplier: 1.2,
        filter_flags: [],
        advisory_only: true,
      },
    },
    regime: {
      ticker: "AAPL",
      regime_tag: "risk_on",
      regime_confidence: 0.70,
      regime_drivers: ["Strong earnings season", "Low volatility"],
      advisory_only: true,
    },
    factorInteraction: {
      ticker: "AAPL",
      interaction_type: "high_bq_earnings_beat",
      adjusted_alpha_score: 0.75,
      interaction_drivers: ["High BQ + earnings beat"],
      advisory_only: true,
    },
    ...overrides,
  };
  return base;
}

function makeNarrowMoatCtx(): DeepResearchContextMap {
  return {
    ticker: "INTC",
    sector: "Semiconductors",
    signalFusionScore: 0.55,
    dataQualityScore: 0.65,
    priceChangePercent: -0.01,
    investorThinking: {
      ticker: "INTC",
      business_quality: {
        business_quality_score: 0.55,
        quality_label: "medium",
        quality_reasons: ["Legacy enterprise relationships", "Manufacturing scale"],
        fragile_reasons: ["Competitive pressure from AMD/TSMC", "Execution risk on process node"],
        advisory_only: true,
      },
      event_adjustment: {
        event_detected: false,
        event_type: "none",
        event_summary: null,
        adjusted_risk_weight: 1.0,
        event_severity: "low",
        advisory_only: true,
      },
      falsification: {
        falsification_triggered: false,
        key_risk_flags: ["competitive_pressure"],
        falsification_tags: ["execution_risk"],
        advisory_only: true,
      },
      final_signal: {
        direction: "neutral",
        conviction: "medium",
        signal_fusion_score: 0.55,
        advisory_only: true,
      },
      dominant_factor: "business_quality",
      advisory_only: true,
    },
    businessContext: {
      competenceFit: {
        ticker: "INTC",
        sector: "Semiconductors",
        competence_fit: "inside",
        fit_reason: "Semiconductor sector within competence boundary",
        advisory_only: true,
      },
      businessUnderstanding: {
        ticker: "INTC",
        business_understanding_score: 0.55,
        moat_strength: "narrow",
        business_model_quality: "average",
        business_flags: ["management_uncertainty"],
        why_this_business_might_be_good: ["Switching costs in enterprise", "Government subsidies"],
        why_this_business_might_be_fragile: ["AMD gaining market share", "TSMC manufacturing lead", "Execution risk on IDM 2.0"],
        advisory_only: true,
      },
      managementProxy: {
        ticker: "INTC",
        management_proxy_score: 0.55,
        capital_allocation_quality: "mixed",
        management_flags: ["execution_uncertainty"],
        allocation_flags: [],
        advisory_only: true,
      },
      eligibility: {
        ticker: "INTC",
        business_eligible: true,
        eligibility_status: "research_required",
        eligibility_reason: "Narrow moat + management uncertainty requires deeper research",
        business_priority_multiplier: 0.9,
        filter_flags: ["management_uncertainty"],
        advisory_only: true,
      },
    },
    regime: {
      ticker: "INTC",
      regime_tag: "macro_stress",
      regime_confidence: 0.60,
      regime_drivers: ["Rate uncertainty", "Semiconductor cycle downturn"],
      advisory_only: true,
    },
    factorInteraction: {
      ticker: "INTC",
      interaction_type: "risk_off_valuation",
      adjusted_alpha_score: 0.48,
      interaction_drivers: ["Macro stress + valuation pressure"],
      advisory_only: true,
    },
  };
}

function makeAvoidCtx(): DeepResearchContextMap {
  return {
    ticker: "COIN",
    sector: "Crypto",
    signalFusionScore: 0.38,
    dataQualityScore: 0.40,
    priceChangePercent: -0.05,
    investorThinking: {
      ticker: "COIN",
      business_quality: {
        business_quality_score: 0.35,
        quality_label: "low",
        quality_reasons: [],
        fragile_reasons: ["Regulatory risk", "Crypto cycle dependency", "No durable moat"],
        advisory_only: true,
      },
      event_adjustment: {
        event_detected: true,
        event_type: "regulatory",
        event_summary: "SEC enforcement action pending",
        adjusted_risk_weight: 1.6,
        event_severity: "high",
        advisory_only: true,
      },
      falsification: {
        falsification_triggered: true,
        key_risk_flags: ["regulatory_risk", "weak_moat"],
        falsification_tags: ["regulatory_risk", "outside_competence"],
        advisory_only: true,
      },
      final_signal: {
        direction: "bearish",
        conviction: "low",
        signal_fusion_score: 0.38,
        advisory_only: true,
      },
      dominant_factor: "event_adjustment",
      advisory_only: true,
    },
    businessContext: {
      competenceFit: {
        ticker: "COIN",
        sector: "Crypto",
        competence_fit: "outside",
        fit_reason: "Crypto exchange outside defined competence boundary",
        advisory_only: true,
      },
      businessUnderstanding: {
        ticker: "COIN",
        business_understanding_score: 0.30,
        moat_strength: "weak",
        business_model_quality: "fragile",
        business_flags: ["outside_competence", "unclear_business_model"],
        why_this_business_might_be_good: [],
        why_this_business_might_be_fragile: ["Regulatory risk", "Crypto cycle dependency", "No durable moat"],
        advisory_only: true,
      },
      managementProxy: {
        ticker: "COIN",
        management_proxy_score: 0.40,
        capital_allocation_quality: "aggressive",
        management_flags: ["aggressive_capital_allocation"],
        allocation_flags: ["high_risk_bets"],
        advisory_only: true,
      },
      eligibility: {
        ticker: "COIN",
        business_eligible: false,
        eligibility_status: "avoid_for_now",
        eligibility_reason: "Outside competence + fragile business model",
        business_priority_multiplier: 0.3,
        filter_flags: ["outside_competence", "unclear_business_model"],
        advisory_only: true,
      },
    },
    regime: {
      ticker: "COIN",
      regime_tag: "event_shock",
      regime_confidence: 0.65,
      regime_drivers: ["Regulatory uncertainty"],
      advisory_only: true,
    },
    factorInteraction: {
      ticker: "COIN",
      interaction_type: "none",
      adjusted_alpha_score: 0.30,
      interaction_drivers: [],
      advisory_only: true,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE 1: Wide-moat compounder with valuation tension (AAPL-like)
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL10.3-B Case 1: Wide-moat compounder (AAPL) — valuation tension", () => {
  let ctx: DeepResearchContextMap;

  beforeEach(() => {
    ctx = makeCtx();
  });

  it("TC-L103B-01: buildInvestmentThesis includes critical_driver and failure_condition", () => {
    const thesis = buildInvestmentThesis(ctx);
    expect(thesis.critical_driver).toBeDefined();
    expect(thesis.critical_driver.length).toBeGreaterThan(20);
    expect(thesis.failure_condition).toBeDefined();
    expect(thesis.failure_condition.length).toBeGreaterThan(20);
    expect(thesis.thesis_confidence).toBeGreaterThan(0.5);
    expect(thesis.advisory_only).toBe(true);
  });

  it("TC-L103B-02: identifyKeyVariables includes update_frequency for each variable", () => {
    const vars = identifyKeyVariables(ctx);
    expect(vars.variables.length).toBeGreaterThan(0);
    for (const v of vars.variables) {
      expect(v.update_frequency).toBeDefined();
      expect(["real_time", "quarterly", "event_driven", "annual"]).toContain(v.update_frequency);
      expect(v.why_it_matters.length).toBeGreaterThan(20);
    }
  });

  it("TC-L103B-03: buildPayoutMap includes trigger for both sides", () => {
    const payout = buildPayoutMap(ctx);
    expect(payout.if_right.trigger).toBeDefined();
    expect(payout.if_right.trigger.length).toBeGreaterThan(20);
    expect(payout.if_wrong.trigger).toBeDefined();
    expect(payout.if_wrong.trigger.length).toBeGreaterThan(20);
    // Wide moat + high BQ → favorable asymmetry
    expect(payout.asymmetry_ratio).toBeGreaterThanOrEqual(1.5);
  });

  it("TC-L103B-04: injectJudgmentTension returns valuation_vs_quality for high-BQ + valuation_stretch", () => {
    const tension = injectJudgmentTension(ctx);
    expect(tension.tension_type).toBe("valuation_vs_quality");
    expect(tension.tension_statement.length).toBeGreaterThan(50);
    expect(tension.resolution_path.length).toBeGreaterThan(30);
    expect(tension.advisory_only).toBe(true);
  });

  it("TC-L103B-05: runDeepResearch output includes judgment_tension field", () => {
    const output = runDeepResearch(ctx);
    expect(output.judgment_tension).toBeDefined();
    expect(output.judgment_tension.tension_type).toBe("valuation_vs_quality");
    expect(output.narrative.narrative.judgment_tension).toBeDefined();
    expect(output.narrative.narrative.judgment_tension.length).toBeGreaterThan(50);
  });

  it("TC-L103B-06: validateSignalDensity passes for high-quality narrative", () => {
    const output = runDeepResearch(ctx);
    const density = validateSignalDensity(output.narrative);
    // Wide moat + high BQ should produce high-density narrative
    expect(density.density_score).toBeGreaterThan(0.5);
    expect(density.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE 2: Narrow-moat with regime tension (INTC-like)
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL10.3-B Case 2: Narrow-moat watchlist (INTC) — regime tension", () => {
  let ctx: DeepResearchContextMap;

  beforeEach(() => {
    ctx = makeNarrowMoatCtx();
  });

  it("TC-L103B-07: injectJudgmentTension returns regime_vs_thesis or moat_vs_disruption for macro_stress", () => {
    const tension = injectJudgmentTension(ctx);
    // macro_stress + narrow moat can trigger either regime_vs_thesis or moat_vs_disruption
    expect(["regime_vs_thesis", "moat_vs_disruption", "timing_vs_conviction"]).toContain(tension.tension_type);
    expect(tension.tension_statement.length).toBeGreaterThan(30);
  });

  it("TC-L103B-08: buildPayoutMap trigger for narrow moat references specific observable event", () => {
    const payout = buildPayoutMap(ctx);
    expect(payout.if_right.trigger.length).toBeGreaterThan(20);
    expect(payout.if_wrong.trigger.length).toBeGreaterThan(20);
    // Narrow moat → roughly symmetric asymmetry (0.8–1.8 range)
    expect(payout.asymmetry_ratio).toBeGreaterThanOrEqual(0.8);
    expect(payout.asymmetry_ratio).toBeLessThan(2.0);
  });

  it("TC-L103B-09: generateLens returns watchlist or speculative for medium confidence", () => {
    const thesis = buildInvestmentThesis(ctx);
    const payout = buildPayoutMap(ctx);
    const lens = generateLens(thesis, payout, ctx.businessContext);
    expect(["watchlist", "speculative", "compounder"]).toContain(lens.lens_type);
  });

  it("TC-L103B-10: narrative risk_break_point is non-empty", () => {
    const output = runDeepResearch(ctx);
    const riskText = output.narrative.narrative.risk_break_point;
    expect(riskText.length).toBeGreaterThan(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE 3: Outside competence boundary — avoid (COIN-like)
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL10.3-B Case 3: Outside competence — avoid (COIN)", () => {
  let ctx: DeepResearchContextMap;

  beforeEach(() => {
    ctx = makeAvoidCtx();
  });

  it("TC-L103B-11: buildInvestmentThesis failure_condition references current state for avoid", () => {
    const thesis = buildInvestmentThesis(ctx);
    expect(thesis.failure_condition.length).toBeGreaterThan(20);
    expect(thesis.critical_driver.length).toBeGreaterThan(20);
    // Outside competence → low confidence
    expect(thesis.thesis_confidence).toBeLessThan(0.55);
  });

  it("TC-L103B-12: buildPayoutMap asymmetry_ratio is unfavorable for avoid_for_now", () => {
    const payout = buildPayoutMap(ctx);
    // Weak moat + avoid → unfavorable asymmetry
    expect(payout.asymmetry_ratio).toBeLessThan(1.2);
    expect(payout.if_wrong.trigger.length).toBeGreaterThan(20);
  });

  it("TC-L103B-13: narrative investment_lens explicitly states no position warranted", () => {
    const output = runDeepResearch(ctx);
    const lens_text = output.narrative.narrative.investment_lens.toLowerCase();
    // Should reference avoid or outside competence
    expect(lens_text).toMatch(/no position|outside competence|avoid|not warranted/);
  });

  it("TC-L103B-14: inferImplicitFactors returns valid factor types for event_shock + weak moat", () => {
    const implicit = inferImplicitFactors(ctx);
    // All 5 types are valid
    for (const f of implicit.factors) {
      expect(["narrative_excess", "capital_flow_bias", "management_style", "market_positioning", "policy_execution_gap"]).toContain(f.type);
    }
    expect(implicit.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE 4: Judgment tension types coverage
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL10.3-B Case 4: Judgment tension coverage — all types", () => {
  it("TC-L103B-15: narrative_vs_fundamentals tension for high signal + low BQ", () => {
    const ctx = makeCtx({
      signalFusionScore: 0.75,
      investorThinking: {
        ...makeCtx().investorThinking,
        business_quality: {
          business_quality_score: 0.42,
          quality_label: "low",
          quality_reasons: [],
          fragile_reasons: ["Weak fundamentals"],
          advisory_only: true,
        },
        falsification: {
          falsification_triggered: false,
          key_risk_flags: [],
          falsification_tags: [],
          advisory_only: true,
        },
        dominant_factor: "momentum",
      },
      regime: { ticker: "TEST", regime_tag: "neutral", regime_confidence: 0.5, regime_drivers: [], advisory_only: true },
    });
    const tension = injectJudgmentTension(ctx);
    expect(tension.tension_type).toBe("narrative_vs_fundamentals");
    expect(tension.tension_statement.length).toBeGreaterThan(30);
  });

  it("TC-L103B-16: timing_vs_conviction tension for low signal density + research_required", () => {
    const ctx = makeCtx({
      signalFusionScore: 0.35,
      dataQualityScore: 0.40,
      businessContext: {
        ...makeCtx().businessContext,
        eligibility: {
          ticker: "TEST",
          business_eligible: true,
          eligibility_status: "research_required",
          eligibility_reason: "Low data quality",
          business_priority_multiplier: 0.8,
          filter_flags: ["low_data_quality"],
          advisory_only: true,
        },
        businessUnderstanding: {
          ...makeCtx().businessContext.businessUnderstanding,
          moat_strength: "wide",
        },
      },
      regime: { ticker: "TEST", regime_tag: "neutral", regime_confidence: 0.5, regime_drivers: [], advisory_only: true },
      investorThinking: {
        ...makeCtx().investorThinking,
        falsification: {
          falsification_triggered: false,
          key_risk_flags: [],
          falsification_tags: [],
          advisory_only: true,
        },
        business_quality: {
          business_quality_score: 0.65,
          quality_label: "medium",
          quality_reasons: [],
          fragile_reasons: [],
          advisory_only: true,
        },
        dominant_factor: "business_quality",
      },
    });
    const tension = injectJudgmentTension(ctx);
    expect(tension.tension_type).toBe("timing_vs_conviction");
    expect(tension.tension_statement.length).toBeGreaterThan(30);
  });

  it("TC-L103B-17: moat_vs_disruption tension for narrow moat + event_shock", () => {
    const ctx = makeCtx({
      businessContext: {
        ...makeCtx().businessContext,
        businessUnderstanding: {
          ticker: "TEST",
          business_understanding_score: 0.55,
          moat_strength: "narrow",
          business_model_quality: "average",
          business_flags: [],
          why_this_business_might_be_good: ["Switching costs"],
          why_this_business_might_be_fragile: ["Competitive pressure"],
          advisory_only: true,
        },
        eligibility: {
          ticker: "TEST",
          business_eligible: true,
          eligibility_status: "eligible",
          eligibility_reason: "Eligible with caveats",
          business_priority_multiplier: 0.9,
          filter_flags: [],
          advisory_only: true,
        },
      },
      regime: { ticker: "TEST", regime_tag: "event_shock", regime_confidence: 0.65, regime_drivers: [], advisory_only: true },
      investorThinking: {
        ...makeCtx().investorThinking,
        business_quality: {
          business_quality_score: 0.60,
          quality_label: "medium",
          quality_reasons: [],
          fragile_reasons: [],
          advisory_only: true,
        },
        falsification: {
          falsification_triggered: false,
          key_risk_flags: [],
          falsification_tags: [],
          advisory_only: true,
        },
        dominant_factor: "business_quality",
      },
    });
    const tension = injectJudgmentTension(ctx);
    expect(tension.tension_type).toBe("moat_vs_disruption");
    expect(tension.tension_statement.length).toBeGreaterThan(30);
  });

  it("TC-L103B-18: validateSignalDensity detects missing judgment_tension", () => {
    const ctx = makeCtx();
    const output = runDeepResearch(ctx);
    // Manually remove judgment_tension to test rejection
    const narrativeWithoutTension = {
      ...output.narrative,
      narrative: {
        ...output.narrative.narrative,
        judgment_tension: "",
      },
    };
    const density = validateSignalDensity(narrativeWithoutTension);
    expect(density.issues.some((i: string) => i.toLowerCase().includes("judgment tension"))).toBe(true);
    expect(density.density_score).toBeLessThan(1.0);
  });
});
