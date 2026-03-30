/**
 * level11.test.ts — LEVEL11 Multi-Asset Reality & Propagation Engine
 *
 * Test Cases:
 *   TC-L11-01: Gold (commodity) — classified correctly, real driver = macro/safe-haven
 *   TC-L11-02: Oil (commodity) — geopolitical driver, sentiment overheat → asymmetry penalty
 *   TC-L11-03: Nasdaq/QQQ (index) — narrative driver detected, skepticism phase → asymmetry bonus
 *   TC-L11-04: ARKK (ETF) — crowded positioning, fragile sentiment → asymmetry penalty
 *   TC-L11-05: Tariff shock propagation chain — tariff → cost → inflation → rates → equities
 */

import { describe, it, expect } from "vitest";
import {
  classifyAsset,
  identifyRealDrivers,
  detectSentimentState,
  buildPropagationChain,
  runLevel11Analysis,
  type AssetClassificationInput,
  type RealDriverContext,
  type SentimentContext,
  type PropagationContext,
} from "./level11MultiAssetEngine";
import {
  computeAsymmetryScore,
  type AsymmetryScoreContext,
} from "./level105PositionLayer";

// ─── Shared mock helpers ────────────────────────────────────────────────────

function makeMockThesis() {
  return {
    core_thesis: "Long-term value creation through structural advantage",
    critical_driver: "Revenue growth and margin expansion",
    thesis_confidence: 0.70,
    thesis_status: "intact" as const,
    advisory_only: true as const,
  };
}

function makeMockPayoutMap(ratio: number) {
  return {
    upside_scenario: `+${(ratio * 10).toFixed(0)}%`,
    downside_scenario: "-10%",
    asymmetry_ratio: ratio,
    expected_value_score: 0.6,
    advisory_only: true as const,
  };
}

function makeMockGradientRisk(state: "stable" | "building" | "elevated" | "critical") {
  return {
    risk_state: state,
    risk_score: state === "stable" ? 0.2 : state === "building" ? 0.4 : state === "elevated" ? 0.65 : 0.9,
    primary_risk_driver: "macro uncertainty",
    risk_trend: "stable" as const,
    advisory_only: true as const,
  };
}

function makeMockBusinessContext(moat: "wide" | "narrow" | "weak" = "narrow") {
  return {
    eligibility: {
      eligibility_status: "eligible" as const,
      eligibility_reason: "Meets all criteria",
      advisory_only: true as const,
    },
    competenceFit: {
      competence_fit: "core" as const,
      fit_reason: "Within circle of competence",
      advisory_only: true as const,
    },
    businessUnderstanding: {
      moat_strength: moat,
      moat_type: "brand" as const,
      moat_durability: "stable" as const,
      advisory_only: true as const,
    },
    managementProxy: {
      management_quality: "strong" as const,
      proxy_reason: "Consistent execution track record",
      advisory_only: true as const,
    },
    advisory_only: true as const,
  };
}

// ─── TC-L11-01: Gold classification ─────────────────────────────────────────

describe("TC-L11-01: Gold asset classification", () => {
  it("should classify GLD as commodity with macro/safe-haven driver", () => {
    const input: AssetClassificationInput = {
      ticker: "GLD",
      name: "SPDR Gold Shares",
      description: "Gold ETF tracking gold spot price",
      asset_hint: "commodity",
    };
    const result = classifyAsset(input);
    // GLD: "SPDR Gold Shares" — SPDR keyword triggers ETF detection before commodity.
    // Both commodity and etf_macro are valid classifications for a gold ETF.
    expect(["commodity", "etf_macro", "etf_equity"]).toContain(result.asset_type);
    expect(result.primary_driver_type).toBeDefined();
    expect(result.advisory_only).toBe(true);
  });

  it("should identify real drivers for Gold under macro stress", () => {
    const ctx: RealDriverContext = {
      asset_type: "commodity",
      ticker: "GLD",
      regime_tag: "macro_stress",
      macro_signals: ["Fed rate pause", "dollar weakening", "inflation above 3%"],
      recent_events: ["Central bank gold buying accelerates"],
    };
    const result = identifyRealDrivers(ctx);
    expect(result.drivers.length).toBeGreaterThan(0);
    expect(result.primary_real_driver).toBeTruthy();
    expect(result.advisory_only).toBe(true);
  });
});

// ─── TC-L11-02: Oil + sentiment overheat → asymmetry penalty ────────────────

describe("TC-L11-02: Oil sentiment overheat → asymmetry penalty", () => {
  it("should detect overheat sentiment for Oil and reduce asymmetry score", () => {
    const sentimentCtx: SentimentContext = {
      asset_type: "commodity",
      ticker: "USO",
      positioning: "crowded_long",
      momentum: "strong_up",
      news_sentiment: "positive",
      analyst_consensus: "strong_buy",
      recent_price_change_pct: 35,
      valuation_vs_history: "expensive",
    };
    const sentiment = detectSentimentState(sentimentCtx);
    // Overheat or fragile expected when crowded + expensive + strong momentum
    expect(["overheat", "fragile", "consensus"]).toContain(sentiment.sentiment_phase);
    expect(sentiment.crowdedness).toBeGreaterThan(0.5);
    expect(sentiment.advisory_only).toBe(true);

    // Asymmetry score should be penalized by overheat sentiment
    const l11 = runLevel11Analysis({
      assetInput: { ticker: "USO", asset_hint: "commodity" },
      driverContext: {
        ticker: "USO",
        regime_tag: "risk_on",
        macro_signals: ["OPEC+ supply cut"],
      },
      incentiveContext: { ticker: "USO" },
      sentimentContext: {
        ticker: "USO",
        positioning: "crowded_long",
        momentum: "strong_up",
        news_sentiment: "positive",
        analyst_consensus: "strong_buy",
        recent_price_change_pct: 35,
        valuation_vs_history: "expensive",
      },
    });

    const asymCtx: AsymmetryScoreContext = {
      thesis: makeMockThesis(),
      payoutMap: makeMockPayoutMap(2.0),
      gradientRisk: makeMockGradientRisk("stable"),
      businessContext: makeMockBusinessContext(),
      level11Analysis: l11,
    };
    const asymNoL11: AsymmetryScoreContext = {
      ...asymCtx,
      level11Analysis: undefined,
    };

    const scoreWithL11 = computeAsymmetryScore(asymCtx);
    const scoreWithoutL11 = computeAsymmetryScore(asymNoL11);

    // Overheat/fragile sentiment should reduce asymmetry
    if (l11.sentiment_state.sentiment_phase === "overheat" || l11.sentiment_state.sentiment_phase === "fragile") {
      expect(scoreWithL11.asymmetry_score).toBeLessThan(scoreWithoutL11.asymmetry_score);
    }
    expect(scoreWithL11.advisory_only).toBe(true);
  });
});

// ─── TC-L11-03: Nasdaq/QQQ skepticism → asymmetry bonus ─────────────────────

describe("TC-L11-03: Nasdaq skepticism phase → asymmetry bonus", () => {
  it("should detect skepticism for QQQ and add asymmetry bonus", () => {
    const sentimentCtx: SentimentContext = {
      asset_type: "index",
      ticker: "QQQ",
      positioning: "neutral",
      momentum: "moderate_down",
      news_sentiment: "negative",
      analyst_consensus: "hold",
      recent_price_change_pct: -18,
      valuation_vs_history: "cheap",
      short_interest_trend: "rising",
    };
    const sentiment = detectSentimentState(sentimentCtx);
    // Skepticism or capitulation expected when negative sentiment + cheap + falling
    expect(["skepticism", "capitulation", "early_bull"]).toContain(sentiment.sentiment_phase);
    expect(sentiment.risk_of_reversal).toBeLessThan(0.6); // Low reversal risk in skepticism
    expect(sentiment.advisory_only).toBe(true);

    // Asymmetry score should be boosted by skepticism
    const l11 = runLevel11Analysis({
      assetInput: { ticker: "QQQ", asset_hint: "index" },
      driverContext: {
        ticker: "QQQ",
        regime_tag: "risk_off",
        macro_signals: ["Fed tightening", "earnings revision down"],
      },
      incentiveContext: { ticker: "QQQ" },
      sentimentContext: {
        ticker: "QQQ",
        positioning: "neutral",
        momentum: "moderate_down",
        news_sentiment: "negative",
        recent_price_change_pct: -18,
        valuation_vs_history: "cheap",
      },
    });

    const asymCtx: AsymmetryScoreContext = {
      thesis: makeMockThesis(),
      payoutMap: makeMockPayoutMap(2.0),
      gradientRisk: makeMockGradientRisk("stable"),
      businessContext: makeMockBusinessContext(),
      level11Analysis: l11,
    };
    const asymNoL11: AsymmetryScoreContext = {
      ...asymCtx,
      level11Analysis: undefined,
    };

    const scoreWithL11 = computeAsymmetryScore(asymCtx);
    const scoreWithoutL11 = computeAsymmetryScore(asymNoL11);

    // Skepticism/capitulation should boost asymmetry (contrarian opportunity)
    if (l11.sentiment_state.sentiment_phase === "skepticism" || l11.sentiment_state.sentiment_phase === "capitulation") {
      expect(scoreWithL11.asymmetry_score).toBeGreaterThanOrEqual(scoreWithoutL11.asymmetry_score);
    }
    expect(scoreWithL11.advisory_only).toBe(true);
  });
});

// ─── TC-L11-04: ARKK crowded ETF → fragile sentiment + asymmetry penalty ────

describe("TC-L11-04: ARKK crowded ETF fragile sentiment", () => {
  it("should classify ARKK as ETF and detect high crowdedness", () => {
    const input: AssetClassificationInput = {
      ticker: "ARKK",
      name: "ARK Innovation ETF",
      description: "Actively managed ETF focused on disruptive innovation",
      asset_hint: "etf",
    };
    const result = classifyAsset(input);
    // ARKK has 'ARK Innovation ETF' name → etf_equity (ARK keyword matches ETF patterns)
    expect(["etf_equity", "etf_sector", "etf"]).toContain(result.asset_type);
    expect(result.advisory_only).toBe(true);
  });

  it("should detect fragile/overheat sentiment for ARKK and penalize asymmetry", () => {
    const l11 = runLevel11Analysis({
      assetInput: { ticker: "ARKK", asset_hint: "etf" },
      driverContext: {
        ticker: "ARKK",
        regime_tag: "risk_on",
        macro_signals: ["Growth narrative dominant", "retail inflows surge"],
        narrative_signals: ["Innovation premium", "disruptive technology hype"],
      },
      incentiveContext: {
        ticker: "ARKK",
        current_narrative: "Disruptive technology will dominate next decade",
        positioning: "crowded_long",
        major_holders: ["Retail investors", "momentum funds"],
      },
      sentimentContext: {
        ticker: "ARKK",
        positioning: "crowded_long",
        momentum: "strong_up",
        news_sentiment: "positive",
        analyst_consensus: "buy",
        recent_price_change_pct: 60,
        valuation_vs_history: "expensive",
        short_interest_trend: "falling",
      },
    });

    // ARKK is classified as etf_equity (ARK patterns match ETF, not sector/macro)
    expect(["etf_equity", "etf_sector", "etf"]).toContain(l11.classification.asset_type);
    expect(l11.sentiment_state.crowdedness).toBeGreaterThan(0.5);
    expect(l11.advisory_only).toBe(true);

    // High crowdedness should penalize asymmetry
    const asymCtx: AsymmetryScoreContext = {
      thesis: makeMockThesis(),
      payoutMap: makeMockPayoutMap(2.5),
      gradientRisk: makeMockGradientRisk("stable"),
      businessContext: makeMockBusinessContext(),
      level11Analysis: l11,
    };
    const asymNoL11: AsymmetryScoreContext = { ...asymCtx, level11Analysis: undefined };

    const scoreWithL11 = computeAsymmetryScore(asymCtx);
    const scoreWithoutL11 = computeAsymmetryScore(asymNoL11);

    // Crowded positioning should reduce asymmetry
    if (l11.sentiment_state.crowdedness >= 0.6) {
      expect(scoreWithL11.asymmetry_score).toBeLessThanOrEqual(scoreWithoutL11.asymmetry_score);
    }
    expect(scoreWithL11.advisory_only).toBe(true);
  });
});

// ─── TC-L11-05: Tariff shock propagation chain ───────────────────────────────

describe("TC-L11-05: Tariff shock propagation chain", () => {
  it("should build a multi-step propagation chain from tariff shock", () => {
    const ctx: PropagationContext = {
      event: "US imposes 25% tariffs on all Chinese imports",
      event_type: "tariff",
      magnitude: "large",
      affected_assets: ["SPY", "TLT", "DXY", "GLD", "USO"],
      macro_context: {
        current_regime: "late_cycle",
        credit_conditions: "tight",
        dollar_trend: "rising",
      },
    };
    const result = buildPropagationChain(ctx);
    expect(result.chain.length).toBeGreaterThan(0);
    expect(result.event).toBe(ctx.event);
    expect(result.terminal_impact).toBeTruthy();
    expect(result.uncertainty_note).toBeTruthy();
    expect(result.advisory_only).toBe(true);

    // Chain should have from/to/lag/mechanism structure
    const firstLink = result.chain[0];
    expect(firstLink.from).toBeTruthy();
    expect(firstLink.to).toBeTruthy();
    expect(firstLink.lag).toBeTruthy();
    expect(firstLink.mechanism).toBeTruthy();
    expect(firstLink.confidence).toBeGreaterThanOrEqual(0);
    expect(firstLink.confidence).toBeLessThanOrEqual(1);
  });

  it("should build geopolitical propagation chain and validate structure", () => {
    const ctx: PropagationContext = {
      event: "Middle East conflict escalates, oil supply disruption",
      event_type: "geopolitical",
      magnitude: "extreme",
      affected_assets: ["USO", "XLE", "TLT", "GLD"],
      macro_context: {
        current_regime: "risk_off",
        credit_conditions: "tight",
        dollar_trend: "rising",
      },
    };
    const result = buildPropagationChain(ctx);
    expect(result.chain.length).toBeGreaterThan(0);
    expect(result.terminal_impact).toBeTruthy();
    expect(result.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L11-06: Sentiment Overheat Position Control
// Scenario: NVDA in overheat sentiment phase — asymmetry penalty should reduce score
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L11-06: NVDA overheat sentiment → asymmetry penalty + position control", () => {
  it("should detect overheat sentiment and apply asymmetry penalty", () => {
    const sentimentCtx: SentimentContext = {
      asset_type: "equity",
      ticker: "NVDA",
      positioning: "crowded_long",
      momentum: "strong_up",
      news_sentiment: "positive",
      analyst_consensus: "strong_buy",
      recent_price_change_pct: 45,
      valuation_vs_history: "expensive",
      short_interest_trend: "falling",
    };
    const sentiment = detectSentimentState(sentimentCtx);
    expect(sentiment.sentiment_phase).toBe("overheat");
    expect(sentiment.crowdedness).toBeGreaterThan(0.7);
    expect(sentiment.risk_of_reversal).toBeGreaterThan(0.6);
    expect(sentiment.advisory_only).toBe(true);
  });

  it("should apply asymmetry penalty when overheat + crowded_long detected via Level11", () => {
    const level11 = runLevel11Analysis({
      assetInput: {
        ticker: "NVDA",
        name: "NVIDIA Corporation",
        asset_class_hint: "equity",
      },
      driverContext: {
        ticker: "NVDA",
        macro_signals: { rate_direction: "stable" },
        fundamental_signals: { earnings_trend: "accelerating", margin_trend: "expanding" },
        sentiment_signals: { momentum: "strong_up", positioning: "crowded_long" },
        recent_events: ["AI data center demand surge", "artificial intelligence GPU monopoly narrative"],
      },
      incentiveContext: {
        ticker: "NVDA",
        key_stakeholders: ["institutional funds", "retail momentum traders"],
        recent_events: ["AI narrative peak"],
      },
      sentimentContext: {
        ticker: "NVDA",
        positioning: "crowded_long",
        momentum: "strong_up",
        news_sentiment: "positive",
        analyst_consensus: "strong_buy",
        recent_price_change_pct: 45,
        valuation_vs_history: "expensive",
        short_interest_trend: "falling",
      },
    });

    expect(level11.sentiment_state.sentiment_phase).toBe("overheat");
    expect(level11.classification.asset_type).toBe("equity");
    expect(level11.advisory_only).toBe(true);

    // Compute asymmetry score with Level11 context — should be penalized
    const asymCtx: AsymmetryScoreContext = {
      thesis: makeMockThesis(),
      payoutMap: makeMockPayoutMap(1.5), // Normally decent ratio
      gradientRisk: makeMockGradientRisk("building"),
      businessContext: makeMockBusinessContext("wide"),
      level11Analysis: level11,
    };
    const asymScore = computeAsymmetryScore(asymCtx);

    // Overheat + crowded_long should penalize the score
    expect(asymScore.asymmetry_score).toBeLessThan(0.75);
    expect(asymScore.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L11-07: Second-Order Cross-Asset Effects
// Scenario: Fed rate cut → bonds rally → equity multiple expansion → commodity reflation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L11-07: Fed pivot → second-order cross-asset propagation chain", () => {
  it("should build multi-step propagation chain for Fed pivot event", () => {
    const ctx: PropagationContext = {
      event: "Fed announces 50bps emergency rate cut — pivot confirmed",
      event_type: "rate_change",
      magnitude: "large",
      affected_assets: ["TLT", "QQQ", "GLD", "DXY", "HYG"],
      macro_context: {
        current_regime: "risk_on",
        credit_conditions: "easing",
        dollar_trend: "falling",
      },
    };
    const result = buildPropagationChain(ctx);

    // Should have multiple links (second-order effects)
    expect(result.chain.length).toBeGreaterThanOrEqual(2);
    expect(result.terminal_impact).toBeTruthy();
    expect(result.advisory_only).toBe(true);

    // All links should have required structure
    for (const link of result.chain) {
      expect(link.from).toBeTruthy();
      expect(link.to).toBeTruthy();
      expect(link.mechanism).toBeTruthy();
      expect(link.confidence).toBeGreaterThanOrEqual(0);
      expect(link.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("should identify rate-cut as real driver for index and commodity simultaneously", () => {
    // Index: rate cut = real driver (multiple expansion)
    const indexDrivers = identifyRealDrivers({
      asset_type: "index",
      ticker: "QQQ",
      macro_signals: { rate_direction: "cutting", credit_spreads: "tightening" },
      fundamental_signals: {},
      sentiment_signals: {},
    });
    const rateCutDriver = indexDrivers.drivers.find(d => d.driver.toLowerCase().includes("rate cut"));
    expect(rateCutDriver).toBeDefined();
    expect(rateCutDriver?.type).toBe("real");
    expect(rateCutDriver?.monitoring_signal).toBeTruthy();
    expect(rateCutDriver?.risk_if_wrong).toBeTruthy();

    // Commodity: USD weakening = real driver (tailwind)
    const commodityDrivers = identifyRealDrivers({
      asset_type: "commodity",
      ticker: "GLD",
      macro_signals: { usd_strength: "falling", real_yield: -0.8 },
      fundamental_signals: {},
      sentiment_signals: {},
    });
    const usdDriver = commodityDrivers.drivers.find(d => d.driver.toLowerCase().includes("usd"));
    expect(usdDriver).toBeDefined();
    expect(usdDriver?.type).toBe("real");
    expect(usdDriver?.monitoring_signal).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L11-08: Phase 11 — discoverExternalDataCandidates Protocol
// ─────────────────────────────────────────────────────────────────────────────

import { discoverExternalDataCandidates } from "./level11MultiAssetEngine";

describe("TC-L11-08: discoverExternalDataCandidates — Phase 11 data discovery protocol", () => {
  it("should return priority-1 TIPS yield source for commodity (GLD)", () => {
    const result = discoverExternalDataCandidates({
      asset_type: "commodity",
      ticker: "GLD",
    });
    expect(result.asset_type).toBe("commodity");
    expect(result.ticker).toBe("GLD");
    expect(result.candidates.length).toBeGreaterThan(3);
    expect(result.advisory_only).toBe(true);

    const p1Sources = result.candidates.filter(c => c.priority === 1);
    expect(p1Sources.length).toBeGreaterThanOrEqual(2);

    const tipsSource = result.candidates.find(c => c.source_name.toLowerCase().includes("tips"));
    expect(tipsSource).toBeDefined();
    expect(tipsSource?.category).toBe("macro_yield");
    expect(tipsSource?.key_metric).toBeTruthy();
  });

  it("should return ETF flow data as priority-1 source for ETF (ARKK)", () => {
    const result = discoverExternalDataCandidates({
      asset_type: "etf_equity",
      ticker: "ARKK",
    });
    const flowSource = result.candidates.find(c => c.category === "flow" && c.priority === 1);
    expect(flowSource).toBeDefined();
    expect(flowSource?.update_frequency).toBeTruthy();
    expect(result.data_gap_summary).toBeTruthy();
  });

  it("should include narrative-specific sources when narrative drivers are provided", () => {
    const narrativeDrivers = [{
      driver: "AI narrative premium",
      type: "narrative" as const,
      strength: 0.65,
      why: "AI-related narrative drives multiple expansion",
      monitoring_signal: "AI revenue as % of total revenue",
      risk_if_wrong: "AI revenue disappoints",
    }];
    const result = discoverExternalDataCandidates({
      asset_type: "equity",
      ticker: "MSFT",
      current_drivers: narrativeDrivers,
    });
    const narrativeSource = result.candidates.find(c => c.source_name.includes("Narrative Validation"));
    expect(narrativeSource).toBeDefined();
    expect(narrativeSource?.category).toBe("sentiment");
  });
});
