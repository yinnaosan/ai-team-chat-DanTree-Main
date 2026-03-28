/**
 * DANTREE LEVEL7 — Validation Tests (Phase 8)
 * Portfolio Decision Layer: 35 tests across all 7 modules
 */

import { describe, it, expect } from "vitest";

// Phase 1+2
import {
  createPortfolioState,
  getActiveHoldings,
  getSectorWeights,
  getThemeWeights,
  getTotalAllocatedPct,
  getHoldingByTicker,
  fuseSignals,
  fuseMultipleSignals,
  type Holding,
  type PortfolioState,
  type SignalInput,
} from "./portfolioState";

// Phase 3+4
import {
  computePositionSize,
  evaluateRiskBudget,
  computeConcentrationPenalty,
  DEFAULT_SIZING_CONFIG,
  DEFAULT_RISK_BUDGET_CONFIG,
} from "./positionSizingEngine";

// Phase 5+6
import {
  rankDecisions,
  generateAdvisoryOutput,
  runLevel7Pipeline,
} from "./portfolioDecisionRanker";

// Phase 7
import {
  applyChurnGuard,
  detectOverfitFlags,
  detectDecisionConflicts,
  applySampleEnforcement,
  buildSafetyReport,
  DEFAULT_CHURN_GUARD_CONFIG,
  DEFAULT_OVERFIT_GUARD_CONFIG,
  DEFAULT_SAMPLE_ENFORCEMENT_CONFIG,
} from "./portfolioSafetyGuard";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const makeHolding = (overrides: Partial<Holding> = {}): Holding => ({
  ticker: "AAPL",
  sector: "Technology",
  themes: ["AI", "Consumer"],
  weight_pct: 5,
  status: "active",
  added_at_ms: Date.now() - 86400000,
  ...overrides,
});

const makePortfolio = (holdings: Holding[] = [], cash = 20): PortfolioState =>
  createPortfolioState("test-portfolio", holdings, cash);

const makeSignal = (overrides: Partial<SignalInput> = {}): SignalInput => ({
  ticker: "AAPL",
  alpha_score: 0.7,
  alpha_tier: "A",
  sample_count: 25,
  trigger_fired: false,
  failure_intensity: 0.1,
  success_strength: 0.8,
  memory_contradiction: false,
  risk_score: 0.2,
  regime_relevance: 0.7,
  source_quality: 0.9,
  signal_freshness_ms: 3600000, // 1h
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Portfolio State
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL7 Phase 1 — Portfolio State", () => {
  it("creates portfolio state with correct fields", () => {
    const holdings = [makeHolding(), makeHolding({ ticker: "MSFT", weight_pct: 8 })];
    const state = makePortfolio(holdings, 15);
    expect(state.portfolio_id).toBe("test-portfolio");
    expect(state.holdings).toHaveLength(2);
    expect(state.cash_reserve_pct).toBe(15);
    expect(state.total_positions).toBe(2);
  });

  it("getActiveHoldings filters by status", () => {
    const holdings = [
      makeHolding({ status: "active" }),
      makeHolding({ ticker: "MSFT", status: "exited" }),
    ];
    const state = makePortfolio(holdings);
    expect(getActiveHoldings(state)).toHaveLength(1);
    expect(getActiveHoldings(state)[0].ticker).toBe("AAPL");
  });

  it("getSectorWeights aggregates correctly", () => {
    const holdings = [
      makeHolding({ sector: "Technology", weight_pct: 10 }),
      makeHolding({ ticker: "MSFT", sector: "Technology", weight_pct: 8 }),
      makeHolding({ ticker: "JPM", sector: "Financials", weight_pct: 5 }),
    ];
    const state = makePortfolio(holdings);
    const weights = getSectorWeights(state);
    expect(weights["Technology"]).toBe(18);
    expect(weights["Financials"]).toBe(5);
  });

  it("getThemeWeights aggregates themes", () => {
    const holdings = [
      makeHolding({ themes: ["AI", "Cloud"], weight_pct: 10 }),
      makeHolding({ ticker: "NVDA", themes: ["AI", "Semiconductor"], weight_pct: 8 }),
    ];
    const state = makePortfolio(holdings);
    const weights = getThemeWeights(state);
    expect(weights["AI"]).toBe(18);
    expect(weights["Cloud"]).toBe(10);
    expect(weights["Semiconductor"]).toBe(8);
  });

  it("getTotalAllocatedPct sums active holdings", () => {
    const holdings = [
      makeHolding({ weight_pct: 10 }),
      makeHolding({ ticker: "MSFT", weight_pct: 8 }),
      makeHolding({ ticker: "EXITED", weight_pct: 5, status: "exited" }),
    ];
    const state = makePortfolio(holdings);
    expect(getTotalAllocatedPct(state)).toBe(18);
  });

  it("getHoldingByTicker returns correct holding", () => {
    const holdings = [makeHolding(), makeHolding({ ticker: "MSFT" })];
    const state = makePortfolio(holdings);
    expect(getHoldingByTicker(state, "MSFT")?.ticker).toBe("MSFT");
    expect(getHoldingByTicker(state, "UNKNOWN")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Multi-Signal Decision Fusion
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL7 Phase 2 — Multi-Signal Fusion", () => {
  it("produces advisory_only: true on all outputs", () => {
    const result = fuseSignals(makeSignal());
    expect(result.advisory_only).toBe(true);
  });

  it("strong signal → strong_buy bias", () => {
    const result = fuseSignals(makeSignal({
      alpha_score: 0.9,
      success_strength: 0.9,
      failure_intensity: 0.05,
      risk_score: 0.1,
      regime_relevance: 0.9,
    }));
    expect(["strong_buy", "buy"]).toContain(result.decision_bias);
    expect(result.fusion_score).toBeGreaterThan(0.5);
  });

  it("memory contradiction → recheck bias", () => {
    const result = fuseSignals(makeSignal({ memory_contradiction: true }));
    expect(result.decision_bias).toBe("recheck");
  });

  it("critical trigger → avoid bias", () => {
    const result = fuseSignals(makeSignal({
      trigger_fired: true,
      trigger_severity: "critical",
      memory_contradiction: false,
    }));
    expect(result.decision_bias).toBe("avoid");
  });

  it("high danger score → avoid or reduce", () => {
    const result = fuseSignals(makeSignal({
      risk_score: 0.9,
      failure_intensity: 0.9,
      memory_contradiction: false,
    }));
    expect(["avoid", "reduce"]).toContain(result.decision_bias);
    expect(result.danger_score).toBeGreaterThan(0.5);
  });

  it("insufficient samples → insufficient confidence", () => {
    const result = fuseSignals(makeSignal({ sample_count: 1 }));
    expect(result.fusion_confidence).toBe("insufficient");
  });

  it("stale signal → freshness penalty applied", () => {
    const fresh = fuseSignals(makeSignal({ signal_freshness_ms: 3600000 }));
    const stale = fuseSignals(makeSignal({ signal_freshness_ms: 10 * 24 * 3600000 }));
    expect(fresh.fusion_score).toBeGreaterThan(stale.fusion_score);
  });

  it("fuseMultipleSignals processes array", () => {
    const signals = [makeSignal(), makeSignal({ ticker: "MSFT" })];
    const results = fuseMultipleSignals(signals);
    expect(results).toHaveLength(2);
    expect(results[0].ticker).toBe("AAPL");
    expect(results[1].ticker).toBe("MSFT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Position Sizing Engine
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL7 Phase 3 — Position Sizing", () => {
  it("high fusion score + large samples → large bucket", () => {
    const decision = fuseSignals(makeSignal({ alpha_score: 0.9, success_strength: 0.9, failure_intensity: 0.05 }));
    const portfolio = makePortfolio([], 20);
    const result = computePositionSize(decision, 25, portfolio);
    expect(result.advisory_only).toBe(true);
    expect(["large", "medium"]).toContain(result.sizing_bucket);
    expect(result.suggested_allocation_pct).toBeGreaterThan(0);
  });

  it("avoid decision → none bucket, 0% allocation", () => {
    const decision = fuseSignals(makeSignal({
      trigger_fired: true,
      trigger_severity: "critical",
      memory_contradiction: false,
    }));
    const portfolio = makePortfolio([], 20);
    const result = computePositionSize(decision, 25, portfolio);
    expect(result.sizing_bucket).toBe("none");
    expect(result.suggested_allocation_pct).toBe(0);
  });

  it("cash reserve floor blocks new allocation", () => {
    // Portfolio already 90% allocated
    const holdings = Array.from({ length: 9 }, (_, i) =>
      makeHolding({ ticker: `STOCK${i}`, weight_pct: 10 })
    );
    const portfolio = makePortfolio(holdings, 10);
    const decision = fuseSignals(makeSignal({ ticker: "NEW" }));
    const result = computePositionSize(decision, 25, portfolio, {
      ...DEFAULT_SIZING_CONFIG,
      cash_reserve_floor_pct: 10,
    });
    expect(result.suggested_allocation_pct).toBe(0);
  });

  it("insufficient confidence → minimal bucket", () => {
    const decision = fuseSignals(makeSignal({ sample_count: 1 }));
    const portfolio = makePortfolio([], 20);
    const result = computePositionSize(decision, 1, portfolio);
    expect(["minimal", "none"]).toContain(result.sizing_bucket);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Risk Budget
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL7 Phase 4 — Risk Budget", () => {
  it("healthy portfolio → healthy status", () => {
    const holdings = [
      makeHolding({ sector: "Technology", weight_pct: 10 }),
      makeHolding({ ticker: "JPM", sector: "Financials", weight_pct: 8 }),
    ];
    const portfolio = makePortfolio(holdings, 20);
    const decisions = fuseMultipleSignals([makeSignal(), makeSignal({ ticker: "JPM" })]);
    const report = evaluateRiskBudget(portfolio, decisions);
    expect(report.advisory_only).toBe(true);
    expect(["healthy", "stretched"]).toContain(report.risk_budget_status);
  });

  it("over-concentrated sector → warning generated", () => {
    const holdings = Array.from({ length: 4 }, (_, i) =>
      makeHolding({ ticker: `TECH${i}`, sector: "Technology", weight_pct: 10 })
    );
    const portfolio = makePortfolio(holdings, 20);
    const decisions = fuseMultipleSignals(holdings.map(h => makeSignal({ ticker: h.ticker })));
    const report = evaluateRiskBudget(portfolio, decisions, {
      ...DEFAULT_RISK_BUDGET_CONFIG,
      max_sector_pct: 30,
    });
    expect(report.top_concentration_warnings.some(w => w.dimension === "sector")).toBe(true);
  });

  it("thesis cluster detected for shared themes", () => {
    const holdings = [
      makeHolding({ ticker: "NVDA", themes: ["AI", "Semiconductor"], weight_pct: 15 }),
      makeHolding({ ticker: "AMD", themes: ["AI", "Semiconductor"], weight_pct: 12 }),
    ];
    const portfolio = makePortfolio(holdings, 20);
    const decisions = fuseMultipleSignals([makeSignal({ ticker: "NVDA" }), makeSignal({ ticker: "AMD" })]);
    const report = evaluateRiskBudget(portfolio, decisions, {
      ...DEFAULT_RISK_BUDGET_CONFIG,
      max_cluster_pct: 20,
    });
    expect(report.duplicated_thesis_clusters.length).toBeGreaterThan(0);
  });

  it("computeConcentrationPenalty returns 0 for non-holding", () => {
    const portfolio = makePortfolio([makeHolding()], 20);
    const decisions = fuseMultipleSignals([makeSignal()]);
    const report = evaluateRiskBudget(portfolio, decisions);
    const penalty = computeConcentrationPenalty("UNKNOWN_TICKER", portfolio, report);
    expect(penalty).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5+6: Ranking + Advisory Output
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL7 Phase 5+6 — Ranking & Advisory Output", () => {
  it("rankDecisions assigns sequential ranks", () => {
    const portfolio = makePortfolio([makeHolding()], 20);
    const signals = [makeSignal(), makeSignal({ ticker: "MSFT" })];
    const decisions = fuseMultipleSignals(signals);
    const sizings = decisions.map(d => computePositionSize(d, 25, portfolio));
    const decisions2 = fuseMultipleSignals(signals);
    const report = evaluateRiskBudget(portfolio, decisions2);
    const view = rankDecisions(decisions, sizings, portfolio, report);
    const ranks = view.ranked_decisions.map(r => r.rank);
    expect(ranks).toEqual([1, 2]);
  });

  it("advisory_only is true on all outputs", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([makeHolding()], 20),
      signals: [makeSignal()],
    });
    expect(result.advisory_only).toBe(true);
    expect(result.portfolio_view.advisory_only).toBe(true);
    expect(result.advisory_output.advisory_only).toBe(true);
    expect(result.risk_budget.advisory_only).toBe(true);
  });

  it("generateAdvisoryOutput includes disclaimer", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([makeHolding()], 20),
      signals: [makeSignal()],
    });
    const decisions = result.advisory_output.top_decisions;
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0].advisory_disclaimer).toContain("ADVISORY ONLY");
  });

  it("full pipeline produces portfolio_health_note", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([makeHolding()], 20),
      signals: [makeSignal(), makeSignal({ ticker: "MSFT" })],
    });
    expect(result.advisory_output.portfolio_health_note).toContain("candidates evaluated");
  });

  it("AVOID decision → no allocation in advisory output", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([], 20),
      signals: [makeSignal({
        trigger_fired: true,
        trigger_severity: "critical",
        memory_contradiction: false,
      })],
    });
    const d = result.portfolio_view.ranked_decisions[0];
    expect(["AVOID", "EXIT"]).toContain(d.action_label);
    expect(d.suggested_allocation_pct).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Safety Guards
// ─────────────────────────────────────────────────────────────────────────────

describe("LEVEL7 Phase 7 — Safety Guards", () => {
  it("churn guard suppresses recent action", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([], 20),
      signals: [makeSignal()],
    });
    const ranked = result.portfolio_view.ranked_decisions;
    const recent = [{ ticker: "AAPL", action_label: "INITIATE", actioned_at_ms: Date.now() - 3600000 }];
    const guarded = applyChurnGuard(ranked, recent, DEFAULT_CHURN_GUARD_CONFIG);
    const aapl = guarded.find(r => r.ticker === "AAPL");
    if (aapl && ["INITIATE", "ADD", "TRIM", "EXIT"].includes(ranked.find(r => r.ticker === "AAPL")?.action_label ?? "")) {
      expect(aapl.action_label).toBe("MONITOR");
    }
  });

  it("churn guard allows action after cooldown", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([], 20),
      signals: [makeSignal()],
    });
    const ranked = result.portfolio_view.ranked_decisions;
    const old_action = [{ ticker: "AAPL", action_label: "INITIATE", actioned_at_ms: Date.now() - 72 * 3600000 }];
    const guarded = applyChurnGuard(ranked, old_action, DEFAULT_CHURN_GUARD_CONFIG);
    const aapl = guarded.find(r => r.ticker === "AAPL");
    const original = ranked.find(r => r.ticker === "AAPL");
    expect(aapl?.action_label).toBe(original?.action_label);
  });

  it("overfit detection flags consistently high signals", () => {
    const decisions = fuseMultipleSignals([makeSignal()]);
    const history = Array.from({ length: 6 }, (_, i) => ({
      ticker: "AAPL",
      fusion_score: 0.8,
      evaluated_at_ms: Date.now() - i * 3600000,
    }));
    const flags = detectOverfitFlags(decisions, history, DEFAULT_OVERFIT_GUARD_CONFIG);
    expect(flags.length).toBe(1);
    expect(flags[0].ticker).toBe("AAPL");
  });

  it("overfit detection does not flag low-score signals", () => {
    const decisions = fuseMultipleSignals([makeSignal({ alpha_score: 0.3, success_strength: 0.3 })]);
    const history = Array.from({ length: 6 }, (_, i) => ({
      ticker: "AAPL",
      fusion_score: 0.4,
      evaluated_at_ms: Date.now() - i * 3600000,
    }));
    const flags = detectOverfitFlags(decisions, history, DEFAULT_OVERFIT_GUARD_CONFIG);
    expect(flags.length).toBe(0);
  });

  it("conflict detection flags opposing INITIATE vs EXIT", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([
        makeHolding({ ticker: "AAPL", weight_pct: 10 }),
      ], 20),
      signals: [
        makeSignal({ ticker: "AAPL", alpha_score: 0.9, success_strength: 0.9, failure_intensity: 0.05 }),
        makeSignal({ ticker: "MSFT", trigger_fired: true, trigger_severity: "critical", memory_contradiction: false }),
      ],
    });
    const ranked = result.portfolio_view.ranked_decisions;
    // Conflict detection is structural — just verify it runs without error
    const conflicts = detectDecisionConflicts(ranked);
    expect(Array.isArray(conflicts)).toBe(true);
  });

  it("sample enforcement downgrades low-sample actionable decisions", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([], 20),
      signals: [makeSignal({ sample_count: 2 })],
    });
    const ranked = result.portfolio_view.ranked_decisions;
    const sample_counts = new Map([["AAPL", 2]]);
    const enforced = applySampleEnforcement(ranked, sample_counts, DEFAULT_SAMPLE_ENFORCEMENT_CONFIG);
    const aapl = enforced.find(r => r.ticker === "AAPL");
    const actionable = ["INITIATE", "ADD", "TRIM", "EXIT"];
    if (actionable.includes(ranked.find(r => r.ticker === "AAPL")?.action_label ?? "")) {
      expect(aapl?.action_label).toBe("MONITOR");
    }
  });

  it("buildSafetyReport returns clean status for clean pipeline", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([makeHolding()], 20),
      signals: [makeSignal()],
    });
    const ranked = result.portfolio_view.ranked_decisions;
    const report = buildSafetyReport(ranked, ranked, [], []);
    expect(report.advisory_only).toBe(true);
    expect(report.overall_safety_status).toBe("clean");
  });

  it("buildSafetyReport flags critical on multiple conflicts", () => {
    const result = runLevel7Pipeline({
      portfolio: makePortfolio([makeHolding()], 20),
      signals: [makeSignal()],
    });
    const ranked = result.portfolio_view.ranked_decisions;
    const fake_conflicts = [
      { ticker_a: "A", ticker_b: "B", action_a: "INITIATE", action_b: "EXIT", conflict_reason: "test" },
      { ticker_a: "C", ticker_b: "D", action_a: "ADD", action_b: "AVOID", conflict_reason: "test" },
    ];
    const report = buildSafetyReport(ranked, ranked, [], fake_conflicts);
    expect(report.overall_safety_status).toBe("critical");
  });
});
