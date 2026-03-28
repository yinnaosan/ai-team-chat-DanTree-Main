/**
 * DANTREE LEVEL7.1B — Guard Precision Patch Validation Tests
 * ─────────────────────────────────────────────────────────────
 * TC-B01: CRITICAL_DANGER dominates over CHURN_COOLDOWN
 * TC-B02: HIGH_DANGER triggers bias downgrade + size cap to small
 * TC-B03: Sample Guard soft degradation (strong_buy → buy, NOT → monitor)
 * TC-B04: Guard-aware sizing decay trace is populated correctly
 * TC-B05: Guard precedence order: CONFLICT > DANGER > CHURN
 */
import { describe, it, expect } from "vitest";
import { runPortfolioSafetyGuards } from "./portfolioGuardOrchestrator";
import type { FusionDecision } from "./portfolioState";
import type { SizingResult, RiskBudgetReport } from "./positionSizingEngine";
import type { RankedDecision } from "./portfolioDecisionRanker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
function makeFusion(
  ticker: string,
  bias: FusionDecision["decision_bias"],
  danger_score = 0.1,
): FusionDecision {
  return {
    ticker,
    decision_bias: bias,
    fusion_score: bias === "strong_buy" ? 0.85 : bias === "buy" ? 0.65 : 0.45,
    fusion_confidence: "high",
    alpha_contribution: 0.7,
    risk_contribution: 0.1,
    trigger_contribution: 0.1,
    memory_contribution: 0.1,
    danger_score,
    sample_confidence_penalty: 0,
    regime_adjustment: 0,
    advisory_only: true,
    fused_at_ms: Date.now(),
  };
}

function makeSizing(ticker: string, bucket: SizingResult["sizing_bucket"] = "medium"): SizingResult {
  const pct_map: Record<string, number> = {
    large: 8, medium: 5, small: 3, minimal: 1, none: 0,
  };
  return {
    ticker,
    suggested_allocation_pct: pct_map[bucket] ?? 5,
    sizing_bucket: bucket,
    sizing_reason: "test",
    capped_by: [],
    advisory_only: true,
  };
}

function makeRanked(ticker: string, action: RankedDecision["action_label"] = "INITIATE"): RankedDecision {
  return {
    rank: 1,
    ticker,
    action_label: action,
    final_score: 0.8,
    fusion_score: 0.8,
    concentration_penalty: 0,
    suggested_allocation_pct: 5,
    sizing_bucket: "medium",
    decision_bias: "buy",
    fusion_confidence: "high",
    danger_score: 0.1,
    is_existing_holding: false,
    existing_weight_pct: 0,
    advisory_only: true,
  };
}

function makeHealthyBudget(): RiskBudgetReport {
  return {
    portfolio_id: "test",
    high_risk_exposure_pct: 10,
    sector_concentration: [],
    theme_concentration: [],
    duplicated_thesis_clusters: [],
    risk_budget_status: "healthy",
    top_concentration_warnings: [],
    advisory_only: true,
  };
}

// ─── TC-B01: CRITICAL_DANGER dominates over CHURN_COOLDOWN ───────────────────
describe("LEVEL7.1B TC-B01: CRITICAL_DANGER dominates CHURN_COOLDOWN", () => {
  it("should apply CRITICAL_DANGER guard (not CHURN) when danger_score >= 0.75", () => {
    const ticker = "NVDA";
    const decision = makeFusion(ticker, "strong_buy", 0.82); // CRITICAL danger
    const sizing = makeSizing(ticker, "large");
    const ranked = makeRanked(ticker, "INITIATE");

    // Also set up a recent action to trigger CHURN
    const recent_actions = [{
      ticker,
      action_label: "INITIATE" as const,
      executed_at_ms: Date.now() - 10 * 60 * 60 * 1000, // 10h ago (within 48h cooldown)
    }];

    const output = runPortfolioSafetyGuards({
      ranked_decisions: [ranked],
      decisions: [decision],
      sizings: [sizing],
      risk_budget: makeHealthyBudget(),
      recent_actions,
      sample_counts: new Map([[ticker, 15]]),
    });

    const gd = output.guarded_decisions[0];
    // CRITICAL_DANGER should dominate over CHURN_COOLDOWN
    expect(gd.annotation.dominant_guard).toBe("CRITICAL_DANGER");
    expect(gd.guarded_decision_bias).toBe("avoid");
    expect(gd.guarded_sizing_bucket).toBe("minimal");
    expect(gd.suppressed).toBe(true);
    // Safety report should flag danger_critical
    expect(output.safety_report.danger_critical_tickers).toContain(ticker);
    expect(output.safety_report.danger_guard_active).toBe(true);
    // overall_safety_status should be critical (danger_critical_tickers.length >= 1)
    expect(output.safety_report.overall_safety_status).toBe("critical");
  });
});

// ─── TC-B02: HIGH_DANGER triggers bias downgrade + size cap ──────────────────
describe("LEVEL7.1B TC-B02: HIGH_DANGER bias downgrade + size cap to small", () => {
  it("should downgrade strong_buy by 2 steps and cap size to small when danger_score=0.65", () => {
    const ticker = "TSLA";
    const decision = makeFusion(ticker, "strong_buy", 0.65); // HIGH danger
    const sizing = makeSizing(ticker, "large");
    const ranked = makeRanked(ticker, "INITIATE");

    const output = runPortfolioSafetyGuards({
      ranked_decisions: [ranked],
      decisions: [decision],
      sizings: [sizing],
      risk_budget: makeHealthyBudget(),
      sample_counts: new Map([[ticker, 15]]),
    });

    const gd = output.guarded_decisions[0];
    expect(gd.annotation.dominant_guard).toBe("HIGH_DANGER");
    // strong_buy → buy → hold (2 steps down)
    expect(gd.guarded_decision_bias).toBe("hold");
    // large → capped to small
    expect(gd.guarded_sizing_bucket).toBe("small");
    expect(gd.suppressed).toBe(true);
    expect(output.safety_report.danger_high_tickers).toContain(ticker);
    expect(output.safety_report.overall_safety_status).toBe("flagged");
  });
});

// ─── TC-B03: Sample Guard soft degradation ───────────────────────────────────
describe("LEVEL7.1B TC-B03: Sample Guard soft degradation (strong_buy → buy, NOT monitor)", () => {
  it("should degrade strong_buy to buy (not monitor) under SAMPLE_SOFT guard", () => {
    const ticker = "AAPL";
    // strong_buy signal with low sample count
    const decision = makeFusion(ticker, "strong_buy", 0.05); // no danger
    const sizing = makeSizing(ticker, "large");
    // Ranked as INITIATE
    const ranked: RankedDecision = {
      ...makeRanked(ticker, "INITIATE"),
      decision_bias: "strong_buy",
      fusion_score: 0.85,
    };

    // Low sample count → triggers SAMPLE_SOFT
    const output = runPortfolioSafetyGuards({
      ranked_decisions: [ranked],
      decisions: [decision],
      sizings: [sizing],
      risk_budget: makeHealthyBudget(),
      sample_counts: new Map([[ticker, 2]]), // below threshold
    });

    const gd = output.guarded_decisions[0];
    expect(gd.annotation.dominant_guard).toBe("SAMPLE_SOFT");
    // SOFT mode: strong_buy → buy (NOT monitor)
    expect(gd.guarded_decision_bias).toBe("buy");
    // NOT fully suppressed to monitor
    expect(gd.guarded_decision_bias).not.toBe("monitor");
    expect(gd.suppressed).toBe(true);
    expect(output.safety_report.sample_guard_active).toBe(true);
  });

  it("should degrade buy to hold (not monitor) under SAMPLE_SOFT guard", () => {
    const ticker = "MSFT";
    const decision = makeFusion(ticker, "buy", 0.05);
    const sizing = makeSizing(ticker, "medium");
    const ranked: RankedDecision = {
      ...makeRanked(ticker, "INITIATE"),
      decision_bias: "buy",
      fusion_score: 0.65,
    };

    const output = runPortfolioSafetyGuards({
      ranked_decisions: [ranked],
      decisions: [decision],
      sizings: [sizing],
      risk_budget: makeHealthyBudget(),
      sample_counts: new Map([[ticker, 2]]),
    });

    const gd = output.guarded_decisions[0];
    expect(gd.guarded_decision_bias).toBe("hold");
    expect(gd.guarded_decision_bias).not.toBe("monitor");
  });
});

// ─── TC-B04: Guard-aware sizing decay trace ───────────────────────────────────
describe("LEVEL7.1B TC-B04: Guard-aware sizing decay trace populated correctly", () => {
  it("should populate sizing_decay_trace with correct multiplier for CRITICAL_DANGER", () => {
    const ticker = "GME";
    const decision = makeFusion(ticker, "buy", 0.80); // CRITICAL danger
    const sizing = makeSizing(ticker, "medium"); // 5%

    const output = runPortfolioSafetyGuards({
      ranked_decisions: [makeRanked(ticker)],
      decisions: [decision],
      sizings: [sizing],
      risk_budget: makeHealthyBudget(),
      sample_counts: new Map([[ticker, 10]]),
    });

    const gd = output.guarded_decisions[0];
    const trace = gd.sizing_decay_trace;

    expect(trace).toBeDefined();
    expect(trace.dominant_guard).toBe("CRITICAL_DANGER");
    expect(trace.decay_multiplier).toBeLessThanOrEqual(0.3); // CRITICAL_DANGER multiplier = 0.3
    expect(trace.decay_multiplier).toBeGreaterThanOrEqual(0.1); // floor
    // guarded_allocation_pct should be original * decay
    expect(trace.guarded_allocation_pct).toBeLessThan(trace.original_allocation_pct);
    expect(trace.allocation_decay_trace.length).toBeGreaterThan(0);
    // Guarded sizing should use decay trace value
    const gs = output.guarded_sizings[0];
    expect(gs.suggested_allocation_pct).toBe(trace.guarded_allocation_pct);
  });

  it("should have decay_multiplier=1.0 and no trace entries for NONE guard", () => {
    const ticker = "GOOG";
    const decision = makeFusion(ticker, "hold", 0.1); // no danger, no guard
    const sizing = makeSizing(ticker, "small"); // 3%

    const output = runPortfolioSafetyGuards({
      ranked_decisions: [makeRanked(ticker, "HOLD")],
      decisions: [decision],
      sizings: [sizing],
      risk_budget: makeHealthyBudget(),
      sample_counts: new Map([[ticker, 20]]),
    });

    const gd = output.guarded_decisions[0];
    expect(gd.annotation.dominant_guard).toBe("NONE");
    expect(gd.suppressed).toBe(false);
    expect(gd.sizing_decay_trace.decay_multiplier).toBe(1.0);
    expect(gd.sizing_decay_trace.dominant_guard).toBe("NONE");
  });
});

// ─── TC-B05: Guard precedence CONFLICT > DANGER > CHURN ──────────────────────
describe("LEVEL7.1B TC-B05: Guard precedence CONFLICT > DANGER > CHURN", () => {
  it("should apply CONTRADICTION as dominant when conflict + high danger + churn all present", () => {
    const tickerA = "NVDA";
    const tickerB = "AMD";

    // NVDA: strong_buy (INITIATE) — also has high danger + recent churn
    const decisionA = makeFusion(tickerA, "strong_buy", 0.65); // HIGH danger
    const sizingA = makeSizing(tickerA, "large");
    const rankedA: RankedDecision = {
      ...makeRanked(tickerA, "INITIATE"),
      fusion_score: 0.85,
      decision_bias: "strong_buy",
    };

    // AMD: avoid (EXIT) — creates contradiction with NVDA INITIATE
    const decisionB = makeFusion(tickerB, "avoid", 0.05);
    const sizingB = makeSizing(tickerB, "minimal");
    const rankedB: RankedDecision = {
      ...makeRanked(tickerB, "EXIT"),
      rank: 2,
      fusion_score: 0.2,
      decision_bias: "avoid",
    };

    // Recent action for NVDA to trigger CHURN
    const recent_actions = [{
      ticker: tickerA,
      action_label: "INITIATE" as const,
      executed_at_ms: Date.now() - 5 * 60 * 60 * 1000, // 5h ago
    }];

    // Add a second INITIATE to create CONTRADICTION (INITIATE vs EXIT)
    // We need two tickers with opposing directions
    // Actually detectDecisionConflicts looks for INITIATE vs EXIT pairs across all ranked
    // NVDA=INITIATE, AMD=EXIT → conflict pair

    const output = runPortfolioSafetyGuards({
      ranked_decisions: [rankedA, rankedB],
      decisions: [decisionA, decisionB],
      sizings: [sizingA, sizingB],
      risk_budget: makeHealthyBudget(),
      recent_actions,
      sample_counts: new Map([[tickerA, 15], [tickerB, 15]]),
    });

    // NVDA is in a conflict pair AND has HIGH_DANGER AND has CHURN
    // CONTRADICTION should dominate
    const gdA = output.guarded_decisions[0];
    expect(gdA.annotation.conflict_guard_applied).toBe(true);
    expect(gdA.annotation.dominant_guard).toBe("CONTRADICTION");
    // CONTRADICTION forces recheck bias
    expect(gdA.guarded_decision_bias).toBe("recheck");
    // Safety report
    expect(output.safety_report.conflict_guard_active).toBe(true);
    expect(output.safety_report.conflict_flags.length).toBeGreaterThan(0);
  });
});
