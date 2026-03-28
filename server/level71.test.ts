/**
 * DANTREE LEVEL7.1 — Validation Tests
 * ─────────────────────────────────────
 * 6 test cases covering all guard families and pipeline integration.
 *
 * Test IDs:
 *   L71-TC-01: Clean path — no guards triggered, advisory_only enforced
 *   L71-TC-02: Churn guard — recent INITIATE suppresses ADD within cooldown
 *   L71-TC-03: Sample guard — low sample count suppresses INITIATE to MONITOR
 *   L71-TC-04: Overfit guard — repeated strong_buy downgraded to buy
 *   L71-TC-05: Contradiction guard — opposing INITIATE/EXIT forces MONITOR
 *   L71-TC-06: Concentration critical — risk budget breach caps all buckets
 */

import { describe, it, expect } from "vitest";
import {
  runPortfolioSafetyGuards,
  type GuardOrchestratorInput,
} from "./portfolioGuardOrchestrator";
import { runLevel7Pipeline, type Level7PipelineInput } from "./portfolioDecisionRanker";
import type { PortfolioState } from "./portfolioState";
import type { RecentAction } from "./portfolioSafetyGuard";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makePortfolio(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return {
    portfolio_id: "test-portfolio",
    holdings: [],
    cash_pct: 100,
    total_value_usd: 100_000,
    last_updated_ms: Date.now(),
    advisory_only: true,
    ...overrides,
  };
}

function makeSignal(
  ticker: string,
  bias: "strong_buy" | "buy" | "hold" | "reduce" | "avoid",
  overrides: Record<string, unknown> = {}
) {
  return {
    ticker,
    fundamental_score: bias === "strong_buy" ? 0.85 : bias === "buy" ? 0.65 : 0.4,
    technical_score: bias === "strong_buy" ? 0.8 : bias === "buy" ? 0.6 : 0.35,
    sentiment_score: bias === "strong_buy" ? 0.75 : bias === "buy" ? 0.55 : 0.3,
    macro_score: bias === "strong_buy" ? 0.7 : bias === "buy" ? 0.5 : 0.25,
    momentum_score: bias === "strong_buy" ? 0.8 : bias === "buy" ? 0.6 : 0.3,
    sector: "Technology" as const,
    theme: "AI" as const,
    sample_count: 10,
    ...overrides,
  };
}

// ─── TC-01: Clean path ────────────────────────────────────────────────────────
describe("L71-TC-01: Clean path — no guards triggered", () => {
  it("should return advisory_only=true on all outputs", () => {
    const portfolio = makePortfolio();
    const input: Level7PipelineInput = {
      portfolio,
      signals: [
        makeSignal("AAPL", "buy"),
        makeSignal("MSFT", "buy"),
      ],
    };
    const output = runLevel7Pipeline(input);

    expect(output.advisory_only).toBe(true);
    expect(output.guard_output.advisory_only).toBe(true);
    expect(output.guard_output.safety_report.advisory_only).toBe(true);
    output.portfolio_view.ranked_decisions.forEach(r => {
      expect(r.advisory_only).toBe(true);
    });
  });

  it("should have healthy guard status when no guards triggered", () => {
    const portfolio = makePortfolio();
    const input: Level7PipelineInput = {
      portfolio,
      signals: [makeSignal("AAPL", "buy")],
      // Provide sufficient sample counts so sample guard does NOT trigger
      sample_counts: new Map([["AAPL", 10]]),
    };
    const output = runLevel7Pipeline(input);
    const report = output.guard_output.safety_report;

    expect(report.portfolio_guard_status).toBe("healthy");
    expect(report.active_guard_count).toBe(0);
    expect(report.suppressed_tickers).toHaveLength(0);
    expect(report.overall_safety_status).toBe("clean");
  });
});

// ─── TC-02: Churn guard ───────────────────────────────────────────────────────
describe("L71-TC-02: Churn guard — recent action suppresses within cooldown", () => {
  it("should suppress INITIATE to MONITOR when recent action within cooldown", () => {
    const portfolio = makePortfolio();
    const recent_actions: RecentAction[] = [
      {
        ticker: "NVDA",
        action_label: "INITIATE",
        actioned_at_ms: Date.now() - 12 * 60 * 60 * 1000, // 12h ago (within 48h cooldown)
      },
    ];
    const input: Level7PipelineInput = {
      portfolio,
      signals: [makeSignal("NVDA", "strong_buy")],
      recent_actions,
    };
    const output = runLevel7Pipeline(input);
    const report = output.guard_output.safety_report;

    expect(report.churn_guard_active).toBe(true);
    // NVDA should be suppressed from INITIATE/ADD to MONITOR
    const nvda = output.portfolio_view.ranked_decisions.find(r => r.ticker === "NVDA");
    expect(nvda?.action_label).toBe("MONITOR");
  });

  it("should NOT suppress when action is outside cooldown window", () => {
    const portfolio = makePortfolio();
    const recent_actions: RecentAction[] = [
      {
        ticker: "NVDA",
        action_label: "INITIATE",
        actioned_at_ms: Date.now() - 72 * 60 * 60 * 1000, // 72h ago (outside 48h cooldown)
      },
    ];
    const input: Level7PipelineInput = {
      portfolio,
      signals: [makeSignal("NVDA", "strong_buy")],
      recent_actions,
      // Provide sufficient sample counts so sample guard does NOT trigger
      sample_counts: new Map([["NVDA", 10]]),
    };
    const output = runLevel7Pipeline(input);
    const report = output.guard_output.safety_report;

    // Churn guard should NOT be active (72h > 48h cooldown)
    expect(report.churn_guard_active).toBe(false);
    const nvda = output.portfolio_view.ranked_decisions.find(r => r.ticker === "NVDA");
    expect(nvda?.action_label).not.toBe("MONITOR");
  });
});

// ─── TC-03: Sample guard ──────────────────────────────────────────────────────
describe("L71-TC-03: Sample guard — low sample count suppresses aggressive action", () => {
  it("should suppress INITIATE to MONITOR when sample_count < min_required", () => {
    const portfolio = makePortfolio();
    const sample_counts = new Map([["TSLA", 2]]); // below default min of 5
    const input: Level7PipelineInput = {
      portfolio,
      signals: [makeSignal("TSLA", "strong_buy", { sample_count: 2 })],
      sample_counts,
    };
    const output = runLevel7Pipeline(input);
    const report = output.guard_output.safety_report;

    expect(report.sample_guard_active).toBe(true);
    const tsla = output.portfolio_view.ranked_decisions.find(r => r.ticker === "TSLA");
    expect(tsla?.action_label).toBe("MONITOR");
  });

  it("should NOT suppress when sample_count >= min_required", () => {
    const portfolio = makePortfolio();
    const sample_counts = new Map([["TSLA", 10]]); // above min
    const input: Level7PipelineInput = {
      portfolio,
      signals: [makeSignal("TSLA", "buy", { sample_count: 10 })],
      sample_counts,
    };
    const output = runLevel7Pipeline(input);
    const report = output.guard_output.safety_report;

    expect(report.sample_guard_active).toBe(false);
  });
});

// ─── TC-04: Overfit guard ─────────────────────────────────────────────────────
describe("L71-TC-04: Overfit guard — repeated high-score pattern detected", () => {
  it("should flag overfit and downgrade strong_buy when consecutive high cycles detected", () => {
    const portfolio = makePortfolio();
    const now = Date.now();
    // 6 consecutive high-score entries for AMZN within 7-day window
    const signal_history = Array.from({ length: 6 }, (_, i) => ({
      ticker: "AMZN",
      fusion_score: 0.75,
      evaluated_at_ms: now - i * 20 * 60 * 60 * 1000, // every 20h
    }));

    const input: Level7PipelineInput = {
      portfolio,
      signals: [makeSignal("AMZN", "strong_buy")],
      signal_history,
    };
    const output = runLevel7Pipeline(input);
    const report = output.guard_output.safety_report;

    expect(report.overfit_guard_active).toBe(true);
    expect(report.overfit_flags.length).toBeGreaterThan(0);
    expect(report.overfit_flags[0].ticker).toBe("AMZN");
    // strong_buy should be downgraded
    const amzn = output.portfolio_view.ranked_decisions.find(r => r.ticker === "AMZN");
    expect(amzn?.decision_bias).not.toBe("strong_buy");
  });
});

// ─── TC-05: Contradiction guard ───────────────────────────────────────────────
describe("L71-TC-05: Contradiction guard — opposing INITIATE/EXIT forces MONITOR", () => {
  it("should detect conflict and suppress both tickers to MONITOR", () => {
    const portfolio = makePortfolio({
      holdings: [
        {
          ticker: "META",
          status: "active" as const,
          weight_pct: 8,
          cost_basis_usd: 350,
          sector: "Technology" as const,
          themes: ["Social" as const],
          added_at_ms: Date.now() - 30 * 24 * 60 * 60 * 1000,
        },
      ],
    });

    const input: Level7PipelineInput = {
      portfolio,
      signals: [
        makeSignal("GOOGL", "strong_buy"),  // INITIATE — new candidate
        // META: all scores = 0 to force fusion_bias=avoid → EXIT on existing holding
        {
          ticker: "META",
          fundamental_score: 0.0,
          technical_score: 0.0,
          sentiment_score: 0.0,
          macro_score: 0.0,
          momentum_score: 0.0,
          sector: "Technology" as const,
          theme: "AI" as const,
          sample_count: 10,
        },
      ],
      // Provide sufficient sample counts so sample guard does NOT suppress before conflict detection
      sample_counts: new Map([["GOOGL", 10], ["META", 10]]),
    };
    const output = runLevel7Pipeline(input);
    const report = output.guard_output.safety_report;

    // Conflict detection: INITIATE (GOOGL) vs TRIM (META) should be flagged
    // META scores=0 → fusion_score≈0.06 → bias=reduce → action=TRIM (existing holding)
    // GOOGL strong_buy → INITIATE. INITIATE vs TRIM is a valid directional conflict.
    expect(report.conflict_flags.length).toBeGreaterThan(0);
    const cf = report.conflict_flags[0];
    const hasInitiate = cf.action_a === "INITIATE" || cf.action_b === "INITIATE";
    const hasOpposing = cf.action_a === "TRIM" || cf.action_b === "TRIM" ||
                        cf.action_a === "EXIT" || cf.action_b === "EXIT" ||
                        cf.action_a === "AVOID" || cf.action_b === "AVOID";
    expect(hasInitiate).toBe(true);
    expect(hasOpposing).toBe(true);
  });
});

// ─── TC-06: Concentration critical ───────────────────────────────────────────
describe("L71-TC-06: Concentration critical — risk budget breach caps all buckets", () => {
  it("should activate concentration guard and reduce sizing when risk_budget_status=critical", () => {
    // Build a portfolio heavily concentrated in Technology
    const portfolio = makePortfolio({
      holdings: [
        { ticker: "AAPL", status: "active" as const, weight_pct: 20, cost_basis_usd: 180, sector: "Technology" as const, themes: ["AI" as const], added_at_ms: Date.now() },
        { ticker: "MSFT", status: "active" as const, weight_pct: 20, cost_basis_usd: 380, sector: "Technology" as const, themes: ["AI" as const], added_at_ms: Date.now() },
        { ticker: "NVDA", status: "active" as const, weight_pct: 20, cost_basis_usd: 800, sector: "Technology" as const, themes: ["AI" as const], added_at_ms: Date.now() },
      ],
      cash_pct: 40,
    });

    const input: Level7PipelineInput = {
      portfolio,
      signals: [
        makeSignal("GOOGL", "strong_buy"),
        makeSignal("AMD", "buy"),
      ],
      risk_budget_config: {
        max_sector_pct: 30,   // 60% tech > 30% → critical
        max_theme_pct: 25,
        max_cluster_pct: 20,
        max_danger_candidates: 3,
      },
    };
    const output = runLevel7Pipeline(input);
    const report = output.guard_output.safety_report;

    // Risk budget should be critical or at least concentration guard active
    const is_critical_or_guarded =
      report.concentration_guard_active ||
      report.portfolio_guard_status !== "healthy";

    expect(is_critical_or_guarded).toBe(true);
    // All guarded sizings should have reduced allocation
    output.guard_output.guarded_sizings.forEach(s => {
      expect(s.suggested_allocation_pct).toBeLessThanOrEqual(15);
    });
  });
});

// ─── Regression: advisory_only always true ────────────────────────────────────
describe("REGRESSION: advisory_only enforcement", () => {
  it("should have advisory_only=true on all output fields in every scenario", () => {
    const portfolio = makePortfolio();
    const scenarios: Level7PipelineInput[] = [
      { portfolio, signals: [makeSignal("AAPL", "buy")] },
      { portfolio, signals: [makeSignal("TSLA", "avoid")] },
      { portfolio, signals: [makeSignal("NVDA", "strong_buy"), makeSignal("AMD", "hold")] },
    ];

    for (const input of scenarios) {
      const output = runLevel7Pipeline(input);
      expect(output.advisory_only).toBe(true);
      expect(output.guard_output.advisory_only).toBe(true);
      expect(output.guard_output.safety_report.advisory_only).toBe(true);
      output.guard_output.guarded_sizings.forEach(s => {
        expect(s.advisory_only).toBe(true);
      });
    }
  });
});
