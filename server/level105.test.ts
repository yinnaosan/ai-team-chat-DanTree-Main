/**
 * LEVEL10.5 — Asymmetry & Position Layer: Test Suite
 *
 * TC-L105-01: computeAsymmetryScore — high asymmetry (wide moat + favorable payout)
 * TC-L105-02: computeAsymmetryScore — poor asymmetry (outside competence + critical risk)
 * TC-L105-03: enforceNoBetDiscipline — hard no-bet (asymmetry < 0.20 + critical risk)
 * TC-L105-04: computePositionSizing — medium bucket (favorable asymmetry + eligible)
 * TC-L105-05: computeSizeAdjustment — decrease (persistent weakening + elevated risk)
 * TC-L105-06: computePortfolioConcentration — high concentration (portfolio at capacity)
 */

import { describe, it, expect } from "vitest";
import {
  computeAsymmetryScore,
  computePositionSizing,
  computeSizeAdjustment,
  enforceNoBetDiscipline,
  computePortfolioConcentration,
  runPositionLayer,
  type AsymmetryScoreContext,
  type PositionSizingContext,
  type SizeAdjustmentContext,
  type NoBetDisciplineContext,
  type PositionEntry105,
} from "./level105PositionLayer";

// ─────────────────────────────────────────────────────────────────────────────
// Shared test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ELIGIBLE_BUSINESS_CONTEXT = {
  competenceFit: {
    competence_fit: "inside" as const,
    competence_confidence: 0.85,
    competence_rationale: "Well-understood business model",
  },
  businessUnderstanding: {
    business_understanding_score: 0.82,
    moat_strength: "wide" as const,
    business_model_quality: "strong" as const,
    understanding_rationale: "Clear competitive advantages",
  },
  managementProxy: {
    management_proxy_score: 0.78,
    capital_allocation_quality: "disciplined" as const,
    management_rationale: "Consistent buybacks and dividends",
  },
  eligibility: {
    eligibility_status: "eligible" as const,
    business_priority_multiplier: 1.2,
    filter_flags: [] as string[],
    eligibility_rationale: "All criteria met",
  },
};

const OUTSIDE_BUSINESS_CONTEXT = {
  competenceFit: {
    competence_fit: "outside" as const,
    competence_confidence: 0.30,
    competence_rationale: "Complex financial instruments outside expertise",
  },
  businessUnderstanding: {
    business_understanding_score: 0.25,
    moat_strength: "weak" as const,
    business_model_quality: "fragile" as const,
    understanding_rationale: "Opaque business model",
  },
  managementProxy: {
    management_proxy_score: 0.30,
    capital_allocation_quality: "poor" as const,
    management_rationale: "Aggressive leverage",
  },
  eligibility: {
    eligibility_status: "avoid_for_now" as const,
    business_priority_multiplier: 0.3,
    filter_flags: ["outside_competence", "weak_moat"],
    eligibility_rationale: "Outside competence circle",
  },
};

const FAVORABLE_PAYOUT_MAP = {
  upside_scenario: { probability: 0.55, return_multiple: 3.5 },
  base_scenario: { probability: 0.30, return_multiple: 1.2 },
  downside_scenario: { probability: 0.15, return_multiple: 0.6 },
  expected_value: 2.1,
  asymmetry_ratio: 2.5,
  advisory_only: true as const,
};

const POOR_PAYOUT_MAP = {
  upside_scenario: { probability: 0.20, return_multiple: 1.3 },
  base_scenario: { probability: 0.40, return_multiple: 0.9 },
  downside_scenario: { probability: 0.40, return_multiple: 0.4 },
  expected_value: 0.7,
  asymmetry_ratio: 0.6,
  advisory_only: true as const,
};

const STABLE_GRADIENT_RISK = {
  risk_state: "stable" as const,
  risk_score: 0.25,
  risk_trend: "improving" as const,
  risk_rationale: "No material deterioration detected",
  advisory_only: true as const,
};

const CRITICAL_GRADIENT_RISK = {
  risk_state: "critical" as const,
  risk_score: 0.88,
  risk_trend: "deteriorating" as const,
  risk_rationale: "Structural breakdown in business fundamentals",
  advisory_only: true as const,
};

const STABLE_THESIS = {
  thesis_strength: "strong" as const,
  thesis_confidence: 0.80,
  thesis_summary: "Durable competitive moat with pricing power",
  key_assumptions: ["market share stable", "margins expanding"],
  falsification_triggers: ["margin compression > 5%"],
  advisory_only: true as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// TC-L105-01: computeAsymmetryScore — high asymmetry
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L105-01: computeAsymmetryScore — high asymmetry (wide moat + favorable payout)", () => {
  it("should return asymmetry_score >= 0.65 and label 'favorable' or 'highly_favorable'", () => {
    const ctx: AsymmetryScoreContext = {
      thesis: STABLE_THESIS,
      payoutMap: FAVORABLE_PAYOUT_MAP,
      gradientRisk: STABLE_GRADIENT_RISK,
      businessContext: ELIGIBLE_BUSINESS_CONTEXT,
      regimeTag: "risk_on",
    };
    const result = computeAsymmetryScore(ctx);

    expect(result.advisory_only).toBe(true);
    expect(result.asymmetry_score).toBeGreaterThanOrEqual(0.65);
    expect(["favorable", "highly_favorable"]).toContain(result.asymmetry_label);
    expect(result.why).toBeTruthy();
    expect(result.why.length).toBeGreaterThan(10);
  });

  it("should boost score further when experience history shows strengthening drift", () => {
    const ctx: AsymmetryScoreContext = {
      thesis: STABLE_THESIS,
      payoutMap: FAVORABLE_PAYOUT_MAP,
      gradientRisk: STABLE_GRADIENT_RISK,
      businessContext: ELIGIBLE_BUSINESS_CONTEXT,
      experienceHistory: {
        ticker: "AAPL",
        record_count: 8,
        drift_analysis: {
          drift_distribution: { strengthening: 0.75, weakening: 0.10, unclear: 0.15 },
          dominant_trend: "strengthening" as const,
          consecutive_drift_count: 4,
          interpretation: "Consistently strengthening thesis over 4 cycles",
          advisory_only: true as const,
        },
        confidence_trajectory: {
          trend: "uptrend" as const,
          volatility: 0.08,
          peak: 0.85,
          current_vs_peak: 0.96,
          interpretation: "Confidence rising steadily",
          advisory_only: true as const,
        },
        behavior_evolution: {
          management_pattern_trend: "value_creator",
          market_behavior_trend: "accumulation",
          pattern_consistency: 0.80,
          risk_implication: "Low risk — consistent management quality",
          advisory_only: true as const,
        },
        meta_insight: {
          meta_insight: "Thesis strengthening over time",
          learning_signal: "Increase position on continued strengthening",
          recommended_adjustment: "Increase 10-20%",
          advisory_only: true as const,
        },
        advisory_only: true as const,
      },
    };
    const result = computeAsymmetryScore(ctx);

    expect(result.asymmetry_score).toBeGreaterThanOrEqual(0.70);
    expect(["favorable", "highly_favorable"]).toContain(result.asymmetry_label);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L105-02: computeAsymmetryScore — poor asymmetry
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L105-02: computeAsymmetryScore — poor asymmetry (outside competence + critical risk)", () => {
  it("should return asymmetry_score <= 0.25 and label 'poor'", () => {
    const ctx: AsymmetryScoreContext = {
      thesis: {
        ...STABLE_THESIS,
        thesis_strength: "weak" as const,
        thesis_confidence: 0.25,
      },
      payoutMap: POOR_PAYOUT_MAP,
      gradientRisk: CRITICAL_GRADIENT_RISK,
      businessContext: OUTSIDE_BUSINESS_CONTEXT,
      regimeTag: "risk_off",
    };
    const result = computeAsymmetryScore(ctx);

    expect(result.advisory_only).toBe(true);
    expect(result.asymmetry_score).toBeLessThanOrEqual(0.25);
    expect(result.asymmetry_label).toBe("poor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L105-03: enforceNoBetDiscipline — hard no-bet
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L105-03: enforceNoBetDiscipline — hard no-bet (asymmetry < 0.20 + critical risk)", () => {
  it("should return bet_allowed=false and restriction_level='hard'", () => {
    const poorAsymmetry = {
      asymmetry_score: 0.12,
      asymmetry_label: "poor" as const,
      why: "Poor payout ratio and outside competence",
      advisory_only: true as const,
    };
    const ctx: NoBetDisciplineContext = {
      asymmetryScore: poorAsymmetry,
      gradientRisk: CRITICAL_GRADIENT_RISK,
      businessContext: OUTSIDE_BUSINESS_CONTEXT,
    };
    const result = enforceNoBetDiscipline(ctx);

    expect(result.advisory_only).toBe(true);
    expect(result.bet_allowed).toBe(false);
    expect(result.restriction_level).toBe("hard");
    expect(result.reason).toBeTruthy();
  });

  it("should return bet_allowed=true for eligible + favorable asymmetry + stable risk", () => {
    const goodAsymmetry = {
      asymmetry_score: 0.75,
      asymmetry_label: "favorable" as const,
      why: "Wide moat + favorable payout",
      advisory_only: true as const,
    };
    const ctx: NoBetDisciplineContext = {
      asymmetryScore: goodAsymmetry,
      gradientRisk: STABLE_GRADIENT_RISK,
      businessContext: ELIGIBLE_BUSINESS_CONTEXT,
    };
    const result = enforceNoBetDiscipline(ctx);

    expect(result.bet_allowed).toBe(true);
    expect(result.restriction_level).toBe("none");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L105-04: computePositionSizing — medium bucket
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L105-04: computePositionSizing — medium bucket (favorable asymmetry + eligible)", () => {
  it("should return size_bucket 'medium' or 'large' and target_position_pct in 6-12% range", () => {
    const goodAsymmetry = {
      asymmetry_score: 0.72,
      asymmetry_label: "favorable" as const,
      why: "Wide moat + favorable payout",
      advisory_only: true as const,
    };
    const ctx: PositionSizingContext = {
      asymmetryScore: goodAsymmetry,
      thesis: STABLE_THESIS,
      gradientRisk: STABLE_GRADIENT_RISK,
      businessContext: ELIGIBLE_BUSINESS_CONTEXT,
    };
    const result = computePositionSizing(ctx);

    expect(result.advisory_only).toBe(true);
    expect(["medium", "large", "small"]).toContain(result.size_bucket);
    expect(result.target_position_pct).toBeGreaterThan(0);
    expect(result.target_position_pct).toBeLessThanOrEqual(15);
    expect(result.sizing_rationale).toBeTruthy();
  });

  it("should return size_bucket 'none' when hard no-bet is enforced via runPositionLayer", () => {
    const result = runPositionLayer({
      thesis: { ...STABLE_THESIS, thesis_strength: "weak" as const, thesis_confidence: 0.20 },
      payoutMap: POOR_PAYOUT_MAP,
      gradientRisk: CRITICAL_GRADIENT_RISK,
      businessContext: OUTSIDE_BUSINESS_CONTEXT,
      strategyOverfitFlag: true,
    });

    expect(result.advisory_only).toBe(true);
    expect(result.no_bet_discipline.bet_allowed).toBe(false);
    expect(result.sizing.size_bucket).toBe("none");
    expect(result.sizing.target_position_pct).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L105-05: computeSizeAdjustment — decrease (persistent weakening)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L105-05: computeSizeAdjustment — decrease (persistent weakening + elevated risk)", () => {
  it("should return adjustment='decrease' when drift is persistently weakening", () => {
    const ctx: SizeAdjustmentContext = {
      previousPosition: { size_bucket: "medium" as const, target_position_pct: 7.5 },
      asymmetryScore: {
        asymmetry_score: 0.38,
        asymmetry_label: "neutral" as const,
        why: "Weakening thesis",
        advisory_only: true as const,
      },
      gradientRisk: {
        risk_state: "elevated" as const,
        risk_score: 0.65,
        risk_trend: "deteriorating" as const,
        risk_rationale: "Margin compression detected",
        advisory_only: true as const,
      },
      experienceHistory: {
        ticker: "XYZ",
        record_count: 6,
        drift_analysis: {
          drift_distribution: { strengthening: 0.10, weakening: 0.75, unclear: 0.15 },
          dominant_trend: "weakening" as const,
          consecutive_drift_count: 4,
          interpretation: "Persistent weakening over 4 cycles",
          advisory_only: true as const,
        },
        confidence_trajectory: {
          trend: "downtrend" as const,
          volatility: 0.15,
          peak: 0.72,
          current_vs_peak: 0.58,
          interpretation: "Confidence declining",
          advisory_only: true as const,
        },
        behavior_evolution: {
          management_pattern_trend: "value_destroyer",
          market_behavior_trend: "distribution",
          pattern_consistency: 0.50,
          risk_implication: "High risk — management destroying value",
          advisory_only: true as const,
        },
        meta_insight: {
          meta_insight: "Thesis deteriorating",
          learning_signal: "structural deterioration detected",
          recommended_adjustment: "Reduce 20-30%",
          advisory_only: true as const,
        },
        advisory_only: true as const,
      },
      thesisConfidence: 0.38,
      marketBehavior: "distribution",
    };
    const result = computeSizeAdjustment(ctx);

    expect(result.advisory_only).toBe(true);
    expect(result.adjustment).toBe("decrease");
    expect(result.adjustment_pct).toBeGreaterThan(0);
    expect(result.reason).toBeTruthy();
  });

  it("should return adjustment='increase' when drift strengthening + confidence rising", () => {
    const ctx: SizeAdjustmentContext = {
      previousPosition: { size_bucket: "small" as const, target_position_pct: 4.0 },
      asymmetryScore: {
        asymmetry_score: 0.78,
        asymmetry_label: "highly_favorable" as const,
        why: "Strengthening thesis",
        advisory_only: true as const,
      },
      gradientRisk: STABLE_GRADIENT_RISK,
      experienceHistory: {
        ticker: "AAPL",
        record_count: 5,
        drift_analysis: {
          drift_distribution: { strengthening: 0.80, weakening: 0.05, unclear: 0.15 },
          dominant_trend: "strengthening" as const,
          consecutive_drift_count: 3,
          interpretation: "Thesis strengthening",
          advisory_only: true as const,
        },
        confidence_trajectory: {
          trend: "uptrend" as const,
          volatility: 0.06,
          peak: 0.82,
          current_vs_peak: 0.97,
          interpretation: "Confidence rising",
          advisory_only: true as const,
        },
        behavior_evolution: {
          management_pattern_trend: "value_creator",
          market_behavior_trend: "accumulation",
          pattern_consistency: 0.85,
          risk_implication: "Low risk — strong management",
          advisory_only: true as const,
        },
        meta_insight: {
          meta_insight: "Thesis strengthening",
          learning_signal: "Increase position on continued strengthening",
          recommended_adjustment: "Increase 10-20%",
          advisory_only: true as const,
        },
        advisory_only: true as const,
      },
      thesisConfidence: 0.80,
      marketBehavior: "accumulation",
    };
    const result = computeSizeAdjustment(ctx);

    expect(result.adjustment).toBe("increase");
    expect(result.adjustment_pct).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L105-06: computePortfolioConcentration — high concentration
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L105-06: computePortfolioConcentration — high concentration (portfolio at capacity)", () => {
  it("should return concentration_risk='high' and max_allowed_size=0 when portfolio at 80%+", () => {
    const existingPositions: PositionEntry105[] = [
      { ticker: "AAPL", target_position_pct: 12, size_bucket: "large", regime_tag: "risk_on", sector: "tech" },
      { ticker: "MSFT", target_position_pct: 12, size_bucket: "large", regime_tag: "risk_on", sector: "tech" },
      { ticker: "GOOGL", target_position_pct: 12, size_bucket: "large", regime_tag: "risk_on", sector: "tech" },
      { ticker: "AMZN", target_position_pct: 12, size_bucket: "large", regime_tag: "risk_on", sector: "tech" },
      { ticker: "META", target_position_pct: 12, size_bucket: "large", regime_tag: "risk_on", sector: "tech" },
      { ticker: "NVDA", target_position_pct: 12, size_bucket: "large", regime_tag: "risk_on", sector: "tech" },
      { ticker: "TSLA", target_position_pct: 10, size_bucket: "medium", regime_tag: "risk_on", sector: "auto" },
    ]; // Total = 82%

    const candidate: PositionEntry105 = {
      ticker: "NFLX",
      target_position_pct: 8,
      size_bucket: "medium",
      regime_tag: "risk_on",
      sector: "tech",
    };

    const result = computePortfolioConcentration(existingPositions, candidate);

    expect(result.advisory_only).toBe(true);
    expect(result.concentration_risk).toBe("high");
    expect(result.max_allowed_size).toBe(0);
    expect(result.portfolio_reason).toContain("capacity");
  });

  it("should return concentration_risk='low' for an empty portfolio with a starter position", () => {
    const candidate: PositionEntry105 = {
      ticker: "AAPL",
      target_position_pct: 5,
      size_bucket: "small",
      regime_tag: "risk_on",
      sector: "tech",
    };

    const result = computePortfolioConcentration([], candidate);

    expect(result.concentration_risk).toBe("low");
    expect(result.max_allowed_size).toBeGreaterThan(0);
  });
});
