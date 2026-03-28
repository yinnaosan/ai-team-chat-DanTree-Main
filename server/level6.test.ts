/**
 * DANTREE LEVEL6 — Strategy & Alpha Layer
 * Phase 7: Anti-Overfit Guards
 * Phase 8: Validation Tests (5 test cases)
 *
 * TC-L6-1: Signal Journal CRUD + Outcome Attribution
 * TC-L6-2: Trigger/Signal Scoring + Low-Sample Discount
 * TC-L6-3: Portfolio Cross-Watch Aggregation
 * TC-L6-4: Regime/Context Slicing
 * TC-L6-5: Alpha Prioritization + Danger Surfacing + Anti-Overfit Guards
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createSignalJournalEntry,
  getSignalJournalEntry,
  listSignalJournal,
  scoreOutcomeForSignal,
  getOutcomeRecord,
  buildAttributionResult,
  makeDefaultRegimeContext,
  resetSignalJournal,
  getSignalJournalSize,
} from "./signalJournal";
import {
  ingestOutcomesForScoring,
  defaultEntityExtractor,
  getEntityScore,
  listEntityScores,
  getRankedTriggerTypes,
  buildPortfolioAggregation,
  deriveSampleQuality,
  applyLowSampleDiscount,
  resetEntityScores,
} from "./signalScoring";
import {
  ingestSignalForRegimeSlice,
  getRegimeSlices,
  getRegimeSliceForContext,
  buildAlphaSurface,
  deriveAlphaTier,
  deriveDangerTier,
  resetRegimeSlices,
} from "./strategyAlpha";

// ── Anti-Overfit Guards (Phase 7) ─────────────────────────────────────────────

/**
 * Anti-overfit guard: reject entity scores with insufficient samples.
 * Returns null if sample count is below minimum threshold.
 */
function antiOverfitGuard(
  score: ReturnType<typeof getEntityScore>,
  min_samples: number = 5
): { passed: boolean; reason: string } {
  if (!score) return { passed: false, reason: "no_score_found" };
  if (score.signals_count < min_samples) {
    return {
      passed: false,
      reason: `insufficient_samples: ${score.signals_count} < ${min_samples}`,
    };
  }
  if (score.sample_quality === "low") {
    return {
      passed: false,
      reason: "low_sample_quality — score may be overfitted to small dataset",
    };
  }
  return { passed: true, reason: "ok" };
}

/**
 * Stability guard: check if score is stable across rolling windows.
 * Uses variance of scores to detect instability.
 */
function stabilityGuard(
  scores: number[],
  max_variance: number = 0.15
): { stable: boolean; variance: number; reason: string } {
  if (scores.length < 3) {
    return { stable: false, variance: 0, reason: "insufficient_data_for_stability_check" };
  }
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length;
  return {
    stable: variance <= max_variance,
    variance,
    reason: variance <= max_variance ? "stable" : `high_variance: ${variance.toFixed(3)} > ${max_variance}`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<Parameters<typeof createSignalJournalEntry>[0]> = {}) {
  return createSignalJournalEntry({
    watch_id: "w1",
    ticker: "AAPL",
    trigger_type: "risk_escalation",
    action_type: "deep_recheck",
    evaluation_horizon: "30d",
    thesis_at_signal: "Elevated risk due to macro headwinds",
    risk_context_at_signal: "High failure intensity",
    failure_intensity_at_signal: 0.7,
    success_strength_at_signal: 0.3,
    source_used: "finnhub",
    reasoning_mode: "deep",
    memory_influence: true,
    learning_influence: true,
    regime_context: makeDefaultRegimeContext({ macro_regime: "risk_off", volatility_regime: "high" }),
    ...overrides,
  });
}

// ── TC-L6-1: Signal Journal CRUD + Outcome Attribution ───────────────────────

describe("TC-L6-1: Signal Journal CRUD + Outcome Attribution", () => {
  beforeEach(() => {
    resetSignalJournal();
    resetEntityScores();
    resetRegimeSlices();
  });

  it("L6-1-1: creates signal journal entry with unique signal_id", () => {
    const entry = makeSignal();
    expect(entry.signal_id).toMatch(/^sig_AAPL_risk_escalation_/);
    expect(entry.ticker).toBe("AAPL");
    expect(entry.trigger_type).toBe("risk_escalation");
    expect(entry.created_at).toBeGreaterThan(0);
  });

  it("L6-1-2: retrieves signal journal entry by signal_id", () => {
    const entry = makeSignal();
    const retrieved = getSignalJournalEntry(entry.signal_id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.signal_id).toBe(entry.signal_id);
  });

  it("L6-1-3: lists signals with filter by ticker", () => {
    makeSignal({ ticker: "AAPL" });
    makeSignal({ ticker: "AAPL" });
    makeSignal({ ticker: "MSFT" });
    const aapl = listSignalJournal({ ticker: "AAPL" });
    expect(aapl).toHaveLength(2);
    const msft = listSignalJournal({ ticker: "MSFT" });
    expect(msft).toHaveLength(1);
  });

  it("L6-1-4: scores positive_risk_reduction outcome correctly", () => {
    const signal = makeSignal();
    const outcome = scoreOutcomeForSignal({
      signal,
      thesis_confirmed: true,
      risk_materialized: true,
      risk_was_flagged: true,
      price_move_pct: -0.12,
      action_was_risk_reduction: true,
      follow_through_confirmed: false,
      no_material_move: false,
    });
    expect(outcome.outcome_label).toBe("positive_risk_reduction");
    expect(outcome.outcome_score).toBeGreaterThan(0.7);
    expect(outcome.risk_adjusted_score).toBeGreaterThan(0.7);
    expect(outcome.thesis_status).toBe("confirmed");
    expect(outcome.risk_warning).toBe("");
  });

  it("L6-1-5: scores harmful_miss with penalty (risk_adjusted < raw)", () => {
    const signal = makeSignal();
    const outcome = scoreOutcomeForSignal({
      signal,
      thesis_confirmed: false,
      risk_materialized: true,
      risk_was_flagged: false,
      price_move_pct: -0.18,
      action_was_risk_reduction: false,
      follow_through_confirmed: false,
      no_material_move: false,
    });
    expect(outcome.outcome_label).toBe("harmful_miss");
    expect(outcome.risk_adjusted_score).toBeLessThan(-0.5);
    expect(outcome.risk_adjusted_score).toBeLessThan(outcome.outcome_score);
    expect(outcome.risk_warning).toContain("HARMFUL MISS");
    expect(outcome.thesis_status).toBe("invalidated");
  });

  it("L6-1-6: scores false_positive with negative score", () => {
    const signal = makeSignal();
    const outcome = scoreOutcomeForSignal({
      signal,
      thesis_confirmed: false,
      risk_materialized: false,
      risk_was_flagged: false,
      price_move_pct: 0.08,
      action_was_risk_reduction: false,
      follow_through_confirmed: false,
      no_material_move: false,
    });
    expect(outcome.outcome_label).toBe("false_positive");
    expect(outcome.risk_adjusted_score).toBeLessThan(-0.2);
    expect(outcome.thesis_status).toBe("contradicted");
  });

  it("L6-1-7: builds attribution result with correct trigger_quality", () => {
    const signal = makeSignal();
    scoreOutcomeForSignal({
      signal,
      thesis_confirmed: true,
      risk_materialized: true,
      risk_was_flagged: true,
      price_move_pct: -0.10,
      action_was_risk_reduction: true,
      follow_through_confirmed: false,
      no_material_move: false,
    });
    const attribution = buildAttributionResult(signal.signal_id);
    expect(attribution).not.toBeNull();
    expect(attribution?.trigger_quality).toBe("strong");
    expect(attribution?.action_mapping_quality).toBe("correct");
    expect(attribution?.thesis_quality).toBe("confirmed");
    expect(attribution?.attribution_quality).toBe("high"); // memory_influence=true
  });

  it("L6-1-8: returns null attribution for unknown signal_id", () => {
    const result = buildAttributionResult("nonexistent_signal_id");
    expect(result).toBeNull();
  });
});

// ── TC-L6-2: Trigger/Signal Scoring + Low-Sample Discount ────────────────────

describe("TC-L6-2: Trigger/Signal Scoring + Low-Sample Discount", () => {
  beforeEach(() => {
    resetSignalJournal();
    resetEntityScores();
    resetRegimeSlices();
  });

  it("L6-2-1: deriveSampleQuality returns correct tier", () => {
    expect(deriveSampleQuality(1)).toBe("low");
    expect(deriveSampleQuality(5)).toBe("low");
    expect(deriveSampleQuality(10)).toBe("medium");
    expect(deriveSampleQuality(25)).toBe("high");
    expect(deriveSampleQuality(100)).toBe("high");
  });

  it("L6-2-2: applyLowSampleDiscount shrinks score for low-sample", () => {
    const { discounted_score, discount_applied } = applyLowSampleDiscount(0.8, "low");
    expect(discount_applied).toBe(true);
    expect(discounted_score).toBeLessThan(0.8);
    expect(discounted_score).toBeCloseTo(0.8 * 0.4, 5);
  });

  it("L6-2-3: applyLowSampleDiscount does NOT shrink for high-sample", () => {
    const { discounted_score, discount_applied } = applyLowSampleDiscount(0.8, "high");
    expect(discount_applied).toBe(false);
    expect(discounted_score).toBe(0.8);
  });

  it("L6-2-4: ingestOutcomesForScoring accumulates entity scores", () => {
    const signal = makeSignal({ trigger_type: "price_break", action_type: "flag_for_review" });
    const outcome = scoreOutcomeForSignal({
      signal,
      thesis_confirmed: true,
      risk_materialized: true,
      risk_was_flagged: true,
      price_move_pct: -0.10,
      action_was_risk_reduction: true,
      follow_through_confirmed: false,
      no_material_move: false,
    });
    ingestOutcomesForScoring([outcome], defaultEntityExtractor);
    const score = getEntityScore("trigger_type", "price_break");
    expect(score).toBeDefined();
    expect(score?.signals_count).toBe(1);
    expect(score?.positive_count).toBe(1);
    expect(score?.sample_quality).toBe("low");
    expect(score?.low_sample_discount_applied).toBe(true);
  });

  it("L6-2-5: getRankedTriggerTypes returns sorted list", () => {
    // Create 2 signals with different trigger types
    const s1 = makeSignal({ trigger_type: "risk_escalation" });
    const o1 = scoreOutcomeForSignal({
      signal: s1, thesis_confirmed: true, risk_materialized: true,
      risk_was_flagged: true, price_move_pct: -0.1, action_was_risk_reduction: true,
      follow_through_confirmed: false, no_material_move: false,
    });
    const s2 = makeSignal({ trigger_type: "macro_change" });
    const o2 = scoreOutcomeForSignal({
      signal: s2, thesis_confirmed: false, risk_materialized: false,
      risk_was_flagged: false, price_move_pct: 0.05, action_was_risk_reduction: false,
      follow_through_confirmed: false, no_material_move: false,
    });
    ingestOutcomesForScoring([o1, o2], defaultEntityExtractor);
    const ranked = getRankedTriggerTypes();
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    // risk_escalation should rank higher than macro_change
    const re_idx = ranked.findIndex((r) => r.entity_key === "risk_escalation");
    const mc_idx = ranked.findIndex((r) => r.entity_key === "macro_change");
    expect(re_idx).toBeLessThan(mc_idx);
  });
});

// ── TC-L6-3: Portfolio Cross-Watch Aggregation ────────────────────────────────

describe("TC-L6-3: Portfolio Cross-Watch Aggregation", () => {
  it("L6-3-1: empty portfolio returns zero counts", () => {
    const agg = buildPortfolioAggregation([]);
    expect(agg.portfolio_summary.active_watch_count).toBe(0);
    expect(agg.portfolio_summary.high_risk_watch_count).toBe(0);
    expect(agg.cross_watch_insights).toHaveLength(0);
  });

  it("L6-3-2: detects sector concentration when >= 2 watches in same sector", () => {
    const watches = [
      { watch_id: "w1", ticker: "AAPL", sector: "tech", theme: "AI", risk_score: 0.4, trigger_type_last: "price_break", thesis_cluster: "growth" },
      { watch_id: "w2", ticker: "MSFT", sector: "tech", theme: "cloud", risk_score: 0.3, trigger_type_last: "risk_escalation", thesis_cluster: "growth" },
      { watch_id: "w3", ticker: "XOM", sector: "energy", theme: "oil", risk_score: 0.5, trigger_type_last: "macro_change", thesis_cluster: "value" },
    ];
    const agg = buildPortfolioAggregation(watches);
    expect(agg.portfolio_summary.active_watch_count).toBe(3);
    const sector_insight = agg.cross_watch_insights.find((i) => i.cluster_type === "sector" && i.cluster_key === "tech");
    expect(sector_insight).toBeDefined();
    expect(sector_insight?.tickers).toContain("AAPL");
    expect(sector_insight?.tickers).toContain("MSFT");
  });

  it("L6-3-3: detects thesis cluster concentration", () => {
    const watches = [
      { watch_id: "w1", ticker: "AAPL", sector: "tech", theme: "AI", risk_score: 0.4, trigger_type_last: "price_break", thesis_cluster: "AI_growth" },
      { watch_id: "w2", ticker: "NVDA", sector: "tech", theme: "AI", risk_score: 0.5, trigger_type_last: "risk_escalation", thesis_cluster: "AI_growth" },
      { watch_id: "w3", ticker: "MSFT", sector: "tech", theme: "cloud", risk_score: 0.3, trigger_type_last: "macro_change", thesis_cluster: "AI_growth" },
    ];
    const agg = buildPortfolioAggregation(watches);
    const thesis_insight = agg.cross_watch_insights.find((i) => i.cluster_type === "thesis" && i.cluster_key === "AI_growth");
    expect(thesis_insight).toBeDefined();
    expect(thesis_insight?.watch_ids).toHaveLength(3);
  });

  it("L6-3-4: detects high-risk cluster when >= 2 watches with risk_score >= 0.6", () => {
    const watches = [
      { watch_id: "w1", ticker: "AAPL", sector: "tech", theme: "AI", risk_score: 0.75, trigger_type_last: "risk_escalation", thesis_cluster: "growth" },
      { watch_id: "w2", ticker: "TSLA", sector: "auto", theme: "EV", risk_score: 0.80, trigger_type_last: "risk_escalation", thesis_cluster: "growth" },
      { watch_id: "w3", ticker: "XOM", sector: "energy", theme: "oil", risk_score: 0.30, trigger_type_last: "macro_change", thesis_cluster: "value" },
    ];
    const agg = buildPortfolioAggregation(watches);
    expect(agg.portfolio_summary.high_risk_watch_count).toBe(2);
    const risk_insight = agg.cross_watch_insights.find((i) => i.cluster_type === "risk");
    expect(risk_insight).toBeDefined();
    expect(risk_insight?.danger_tier ?? risk_insight?.concentration_level).toBeDefined();
  });
});

// ── TC-L6-4: Regime/Context Slicing ──────────────────────────────────────────

describe("TC-L6-4: Regime/Context Slicing", () => {
  beforeEach(() => {
    resetSignalJournal();
    resetEntityScores();
    resetRegimeSlices();
  });

  it("L6-4-1: ingests signal+outcome into regime slicer", () => {
    const signal = makeSignal({
      regime_context: makeDefaultRegimeContext({ macro_regime: "risk_off", volatility_regime: "high", event_regime: "macro_event" }),
    });
    const outcome = scoreOutcomeForSignal({
      signal, thesis_confirmed: true, risk_materialized: true, risk_was_flagged: true,
      price_move_pct: -0.10, action_was_risk_reduction: true, follow_through_confirmed: false, no_material_move: false,
    });
    ingestSignalForRegimeSlice(signal, outcome);
    const slices = getRegimeSlices();
    expect(slices).toHaveLength(1);
    expect(slices[0].macro_regime).toBe("risk_off");
    expect(slices[0].volatility_regime).toBe("high");
    expect(slices[0].signals_count).toBe(1);
  });

  it("L6-4-2: aggregates multiple signals in same regime", () => {
    const ctx = makeDefaultRegimeContext({ macro_regime: "risk_on", volatility_regime: "low" });
    for (let i = 0; i < 3; i++) {
      const s = makeSignal({ regime_context: ctx, trigger_type: "price_break" });
      const o = scoreOutcomeForSignal({
        signal: s, thesis_confirmed: true, risk_materialized: false, risk_was_flagged: false,
        price_move_pct: 0.05, action_was_risk_reduction: false, follow_through_confirmed: true, no_material_move: false,
      });
      ingestSignalForRegimeSlice(s, o);
    }
    const slices = getRegimeSlices();
    const risk_on_slice = slices.find((s) => s.macro_regime === "risk_on");
    expect(risk_on_slice?.signals_count).toBe(3);
    expect(risk_on_slice?.best_trigger_type).toBe("price_break");
  });

  it("L6-4-3: separates different regimes into distinct slices", () => {
    const ctx1 = makeDefaultRegimeContext({ macro_regime: "risk_off", volatility_regime: "high" });
    const ctx2 = makeDefaultRegimeContext({ macro_regime: "risk_on", volatility_regime: "low" });
    const s1 = makeSignal({ regime_context: ctx1 });
    const o1 = scoreOutcomeForSignal({
      signal: s1, thesis_confirmed: true, risk_materialized: true, risk_was_flagged: true,
      price_move_pct: -0.1, action_was_risk_reduction: true, follow_through_confirmed: false, no_material_move: false,
    });
    const s2 = makeSignal({ regime_context: ctx2 });
    const o2 = scoreOutcomeForSignal({
      signal: s2, thesis_confirmed: false, risk_materialized: false, risk_was_flagged: false,
      price_move_pct: 0.05, action_was_risk_reduction: false, follow_through_confirmed: false, no_material_move: false,
    });
    ingestSignalForRegimeSlice(s1, o1);
    ingestSignalForRegimeSlice(s2, o2);
    const slices = getRegimeSlices();
    expect(slices).toHaveLength(2);
  });

  it("L6-4-4: getRegimeSliceForContext returns correct slice", () => {
    const ctx = makeDefaultRegimeContext({ macro_regime: "neutral", volatility_regime: "medium" });
    const s = makeSignal({ regime_context: ctx });
    const o = scoreOutcomeForSignal({
      signal: s, thesis_confirmed: true, risk_materialized: false, risk_was_flagged: false,
      price_move_pct: 0.02, action_was_risk_reduction: false, follow_through_confirmed: true, no_material_move: false,
    });
    ingestSignalForRegimeSlice(s, o);
    const slice = getRegimeSliceForContext(ctx);
    expect(slice).toBeDefined();
    expect(slice?.macro_regime).toBe("neutral");
  });
});

// ── TC-L6-5: Alpha Prioritization + Danger Surfacing + Anti-Overfit Guards ───

describe("TC-L6-5: Alpha Prioritization + Danger Surfacing + Anti-Overfit Guards", () => {
  beforeEach(() => {
    resetSignalJournal();
    resetEntityScores();
    resetRegimeSlices();
  });

  it("L6-5-1: deriveAlphaTier returns A for high score + non-low sample", () => {
    expect(deriveAlphaTier(0.75, "medium")).toBe("A");
    expect(deriveAlphaTier(0.75, "high")).toBe("A");
    expect(deriveAlphaTier(0.75, "low")).toBe("B"); // low sample → cannot be A
  });

  it("L6-5-2: deriveDangerTier returns critical for harmful_miss >= 3", () => {
    expect(deriveDangerTier(-0.3, 3, 0)).toBe("critical");
    expect(deriveDangerTier(-0.7, 0, 0)).toBe("critical");
    expect(deriveDangerTier(-0.45, 2, 0)).toBe("high");
    expect(deriveDangerTier(-0.25, 0, 4)).toBe("moderate");
    expect(deriveDangerTier(0.1, 0, 0)).toBe("none");
  });

  it("L6-5-3: buildAlphaSurface surfaces opportunities and dangers", () => {
    // Create entity scores manually (need >= 10 samples for medium quality → discounted score >= 0.35)
    const outcomes: import("./signalJournal").SignalOutcomeRecord[] = [];
    for (let i = 0; i < 12; i++) {
      const s = makeSignal({ trigger_type: "risk_escalation", action_type: "deep_recheck" });
      const o = scoreOutcomeForSignal({
        signal: s, thesis_confirmed: true, risk_materialized: true, risk_was_flagged: true,
        price_move_pct: -0.1, action_was_risk_reduction: true, follow_through_confirmed: false, no_material_move: false,
      });
      outcomes.push(o);
    }
    ingestOutcomesForScoring(outcomes, defaultEntityExtractor);
    const entity_scores = listEntityScores();
    const surface = buildAlphaSurface({ entity_scores, outcome_records: outcomes });
    expect(surface.advisory_only).toBe(true);
    expect(surface.alpha_opportunities.length).toBeGreaterThan(0);
    // risk_escalation with 5 positive outcomes should be an opportunity
    const opp = surface.alpha_opportunities.find((o) => o.entity_key === "risk_escalation");
    expect(opp).toBeDefined();
    expect(opp?.advisory_only).toBe(true);
  });

  it("L6-5-4: anti-overfit guard rejects low-sample entity scores", () => {
    const s = makeSignal({ trigger_type: "earnings_event" });
    const o = scoreOutcomeForSignal({
      signal: s, thesis_confirmed: true, risk_materialized: true, risk_was_flagged: true,
      price_move_pct: -0.1, action_was_risk_reduction: true, follow_through_confirmed: false, no_material_move: false,
    });
    ingestOutcomesForScoring([o], defaultEntityExtractor);
    const score = getEntityScore("trigger_type", "earnings_event");
    const guard = antiOverfitGuard(score, 5);
    expect(guard.passed).toBe(false);
    expect(guard.reason).toContain("insufficient_samples");
  });

  it("L6-5-5: stability guard detects high variance in rolling scores", () => {
    // Alternating high/low scores → high variance
    const scores = [0.9, -0.8, 0.85, -0.75, 0.8];
    const result = stabilityGuard(scores, 0.15);
    expect(result.stable).toBe(false);
    expect(result.variance).toBeGreaterThan(0.15);
  });

  it("L6-5-6: stability guard passes for stable scores", () => {
    const scores = [0.7, 0.72, 0.68, 0.71, 0.69];
    const result = stabilityGuard(scores, 0.15);
    expect(result.stable).toBe(true);
    expect(result.reason).toBe("stable");
  });

  it("L6-5-7: stability guard requires >= 3 data points", () => {
    const result = stabilityGuard([0.5, 0.6], 0.15);
    expect(result.stable).toBe(false);
    expect(result.reason).toContain("insufficient_data");
  });

  it("L6-5-8: danger signals surface harmful_miss correctly", () => {
    const outcomes: import("./signalJournal").SignalOutcomeRecord[] = [];
    // Create 3 harmful miss outcomes for same trigger type
    for (let i = 0; i < 3; i++) {
      const s = makeSignal({ trigger_type: "macro_change", action_type: "flag_for_review" });
      const o = scoreOutcomeForSignal({
        signal: s, thesis_confirmed: false, risk_materialized: true, risk_was_flagged: false,
        price_move_pct: -0.15, action_was_risk_reduction: false, follow_through_confirmed: false, no_material_move: false,
      });
      outcomes.push(o);
    }
    ingestOutcomesForScoring(outcomes, defaultEntityExtractor);
    const entity_scores = listEntityScores();
    const surface = buildAlphaSurface({ entity_scores, outcome_records: outcomes });
    const danger = surface.danger_signals.find((d) => d.entity_key === "macro_change");
    expect(danger).toBeDefined();
    expect(danger?.danger_tier).toMatch(/critical|high/);
    expect(danger?.advisory_only).toBe(true);
  });
});
