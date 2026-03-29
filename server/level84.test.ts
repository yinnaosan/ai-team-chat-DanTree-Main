/**
 * DANTREE LEVEL8.4 — Performance & Validation Layer
 * level84.test.ts
 *
 * Test Coverage:
 *   TC-L84-01: evaluateDecisionOutcome() — no DB mode (returns safe defaults)
 *   TC-L84-02: createOutcomeTracking() — no DB mode (no throw)
 *   TC-L84-03: computePerformanceMetrics() — no DB mode (returns zero metrics)
 *   TC-L84-04: analyzeDecisionAttribution() — no DB mode (returns empty buckets)
 *   TC-L84-05: generateDecisionFeedback() — no DB mode (neutral health)
 *   TC-L84-06: safeEvaluateDecisionOutcome() — never throws
 *   TC-L84-07: Horizon constants — correct millisecond values
 *   TC-L84-08: PerformanceMetrics structure — all required fields present
 *   TC-L84-09: AttributionAnalysis structure — advisory_only always true
 *   TC-L84-10: DecisionFeedback — system_health classification logic
 *   TC-L84-11: Output samples — 6 mock scenarios
 *   TC-L84-12: HARD RULES — advisory_only = true on all outputs
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HORIZON_MS,
  evaluateDecisionOutcome,
  createOutcomeTracking,
  computePerformanceMetrics,
  analyzeDecisionAttribution,
  generateDecisionFeedback,
  safeEvaluateDecisionOutcome,
  type PerformanceMetrics,
  type AttributionAnalysis,
  type DecisionFeedback,
  type EvaluationRunResult,
  type Horizon,
} from "./decisionOutcomeEngine";

// ─── Mock DB (no DB available in test environment) ────────────────────────────
vi.mock("./db", () => ({
  getDb: async () => null,
}));

// ─── TC-L84-01: evaluateDecisionOutcome() — no DB ────────────────────────────
describe("TC-L84-01: evaluateDecisionOutcome — no DB", () => {
  it("should return safe EvaluationRunResult when DB is unavailable", async () => {
    const result = await evaluateDecisionOutcome();
    expect(result).toBeDefined();
    expect(result.advisory_only).toBe(true);
    expect(typeof result.evaluated).toBe("number");
    expect(typeof result.skipped_not_due).toBe("number");
    expect(typeof result.skipped_no_price).toBe("number");
    expect(typeof result.errors).toBe("number");
    // When DB is null, returns immediately with zeros
    expect(result.evaluated).toBe(0);
  });
});

// ─── TC-L84-02: createOutcomeTracking() — no DB ──────────────────────────────
describe("TC-L84-02: createOutcomeTracking — no DB", () => {
  it("should not throw when DB is unavailable", async () => {
    await expect(
      createOutcomeTracking(1, "AAPL", 150.0, Date.now())
    ).resolves.toBeUndefined();
  });

  it("should not throw for multiple tickers", async () => {
    const tickers = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"];
    for (const ticker of tickers) {
      await expect(
        createOutcomeTracking(1, ticker, 100.0, Date.now())
      ).resolves.toBeUndefined();
    }
  });
});

// ─── TC-L84-03: computePerformanceMetrics() — no DB ──────────────────────────
describe("TC-L84-03: computePerformanceMetrics — no DB", () => {
  it("should return zero metrics when DB is unavailable", async () => {
    const metrics = await computePerformanceMetrics(1);
    expect(metrics.advisory_only).toBe(true);
    expect(metrics.total_decisions).toBe(0);
    expect(metrics.evaluated_decisions).toBe(0);
    expect(metrics.win_rate).toBe(0);
    expect(metrics.avg_return).toBe(0);
    expect(metrics.best_return).toBe(0);
    expect(metrics.worst_return).toBe(0);
  });

  it("should include all three horizons in by_horizon", async () => {
    const metrics = await computePerformanceMetrics(1);
    expect(metrics.by_horizon).toBeDefined();
    expect(metrics.by_horizon["1d"]).toBeDefined();
    expect(metrics.by_horizon["3d"]).toBeDefined();
    expect(metrics.by_horizon["7d"]).toBeDefined();
  });

  it("should have valid HorizonMetrics structure for each horizon", async () => {
    const metrics = await computePerformanceMetrics(1);
    for (const horizon of ["1d", "3d", "7d"] as Horizon[]) {
      const hm = metrics.by_horizon[horizon];
      expect(typeof hm.total).toBe("number");
      expect(typeof hm.evaluated).toBe("number");
      expect(typeof hm.win_rate).toBe("number");
      expect(typeof hm.avg_return).toBe("number");
    }
  });
});

// ─── TC-L84-04: analyzeDecisionAttribution() — no DB ─────────────────────────
describe("TC-L84-04: analyzeDecisionAttribution — no DB", () => {
  it("should return empty buckets when DB is unavailable", async () => {
    const attribution = await analyzeDecisionAttribution(1);
    expect(attribution.advisory_only).toBe(true);
    expect(attribution.performance_by_BQ).toBeDefined();
    expect(attribution.performance_by_event).toBeDefined();
    expect(attribution.performance_by_risk).toBeDefined();
  });

  it("should return empty objects for all bucket types", async () => {
    const attribution = await analyzeDecisionAttribution(1);
    expect(Object.keys(attribution.performance_by_BQ).length).toBe(0);
    expect(Object.keys(attribution.performance_by_event).length).toBe(0);
    expect(Object.keys(attribution.performance_by_risk).length).toBe(0);
  });
});

// ─── TC-L84-05: generateDecisionFeedback() — no DB ───────────────────────────
describe("TC-L84-05: generateDecisionFeedback — no DB", () => {
  it("should return neutral health when no data available", async () => {
    const feedback = await generateDecisionFeedback(1);
    expect(feedback.advisory_only).toBe(true);
    expect(feedback.system_health).toBe("neutral");
    expect(Array.isArray(feedback.key_strength)).toBe(true);
    expect(Array.isArray(feedback.key_weakness)).toBe(true);
    expect(typeof feedback.win_rate).toBe("number");
    expect(typeof feedback.avg_return).toBe("number");
  });

  it("should include initialization message in key_strength when no data", async () => {
    const feedback = await generateDecisionFeedback(1);
    const hasInitMsg = feedback.key_strength.some(s =>
      s.toLowerCase().includes("initialized") || s.toLowerCase().includes("awaiting")
    );
    expect(hasInitMsg).toBe(true);
  });
});

// ─── TC-L84-06: safeEvaluateDecisionOutcome() — never throws ─────────────────
describe("TC-L84-06: safeEvaluateDecisionOutcome — never throws", () => {
  it("should never throw even if internal error occurs", async () => {
    await expect(safeEvaluateDecisionOutcome()).resolves.toBeDefined();
  });

  it("should always return advisory_only = true", async () => {
    const result = await safeEvaluateDecisionOutcome();
    expect(result.advisory_only).toBe(true);
  });
});

// ─── TC-L84-07: Horizon constants ────────────────────────────────────────────
describe("TC-L84-07: Horizon constants", () => {
  it("should have correct millisecond values for each horizon", () => {
    expect(HORIZON_MS["1d"]).toBe(1 * 24 * 60 * 60 * 1000);
    expect(HORIZON_MS["3d"]).toBe(3 * 24 * 60 * 60 * 1000);
    expect(HORIZON_MS["7d"]).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("should have 3d > 1d > 0", () => {
    expect(HORIZON_MS["3d"]).toBeGreaterThan(HORIZON_MS["1d"]);
    expect(HORIZON_MS["1d"]).toBeGreaterThan(0);
  });

  it("should have 7d > 3d", () => {
    expect(HORIZON_MS["7d"]).toBeGreaterThan(HORIZON_MS["3d"]);
  });
});

// ─── TC-L84-08: PerformanceMetrics structure ─────────────────────────────────
describe("TC-L84-08: PerformanceMetrics structure", () => {
  it("should have all required fields", async () => {
    const metrics: PerformanceMetrics = await computePerformanceMetrics(1);
    const requiredFields: (keyof PerformanceMetrics)[] = [
      "total_decisions",
      "evaluated_decisions",
      "win_rate",
      "avg_return",
      "best_return",
      "worst_return",
      "by_horizon",
      "advisory_only",
    ];
    for (const field of requiredFields) {
      expect(metrics).toHaveProperty(field);
    }
  });

  it("win_rate should be between 0 and 1", async () => {
    const metrics = await computePerformanceMetrics(1);
    expect(metrics.win_rate).toBeGreaterThanOrEqual(0);
    expect(metrics.win_rate).toBeLessThanOrEqual(1);
  });
});

// ─── TC-L84-09: AttributionAnalysis structure ────────────────────────────────
describe("TC-L84-09: AttributionAnalysis structure", () => {
  it("should always have advisory_only = true", async () => {
    const attribution: AttributionAnalysis = await analyzeDecisionAttribution(1);
    expect(attribution.advisory_only).toBe(true);
  });

  it("should have all three bucket types", async () => {
    const attribution = await analyzeDecisionAttribution(1);
    expect(attribution).toHaveProperty("performance_by_BQ");
    expect(attribution).toHaveProperty("performance_by_event");
    expect(attribution).toHaveProperty("performance_by_risk");
  });
});

// ─── TC-L84-10: DecisionFeedback health classification ───────────────────────
describe("TC-L84-10: DecisionFeedback health classification", () => {
  it("should return valid system_health values", async () => {
    const feedback: DecisionFeedback = await generateDecisionFeedback(1);
    expect(["good", "neutral", "poor"]).toContain(feedback.system_health);
  });

  it("should have non-empty key_strength when no data", async () => {
    const feedback = await generateDecisionFeedback(1);
    // When no data, should at least have initialization message
    expect(feedback.key_strength.length).toBeGreaterThan(0);
  });

  it("win_rate in feedback matches computePerformanceMetrics", async () => {
    const feedback = await generateDecisionFeedback(1);
    const metrics = await computePerformanceMetrics(1);
    expect(feedback.win_rate).toBe(metrics.win_rate);
  });
});

// ─── TC-L84-11: Output samples — 6 mock scenarios ────────────────────────────
describe("TC-L84-11: Output samples — 6 mock scenarios", () => {
  /**
   * These tests validate the output shape and advisory_only invariant
   * using pure in-memory logic (no DB required).
   */

  it("Sample 1: EvaluationRunResult shape", async () => {
    const result: EvaluationRunResult = await evaluateDecisionOutcome();
    expect(result).toMatchObject({
      evaluated: expect.any(Number),
      skipped_not_due: expect.any(Number),
      skipped_no_price: expect.any(Number),
      errors: expect.any(Number),
      advisory_only: true,
    });
  });

  it("Sample 2: PerformanceMetrics shape", async () => {
    const metrics: PerformanceMetrics = await computePerformanceMetrics(42);
    expect(metrics).toMatchObject({
      total_decisions: expect.any(Number),
      evaluated_decisions: expect.any(Number),
      win_rate: expect.any(Number),
      avg_return: expect.any(Number),
      best_return: expect.any(Number),
      worst_return: expect.any(Number),
      advisory_only: true,
    });
  });

  it("Sample 3: AttributionAnalysis shape", async () => {
    const attr: AttributionAnalysis = await analyzeDecisionAttribution(42);
    expect(attr).toMatchObject({
      performance_by_BQ: expect.any(Object),
      performance_by_event: expect.any(Object),
      performance_by_risk: expect.any(Object),
      advisory_only: true,
    });
  });

  it("Sample 4: DecisionFeedback shape", async () => {
    const fb: DecisionFeedback = await generateDecisionFeedback(42);
    expect(fb).toMatchObject({
      system_health: expect.stringMatching(/^(good|neutral|poor)$/),
      key_strength: expect.any(Array),
      key_weakness: expect.any(Array),
      win_rate: expect.any(Number),
      avg_return: expect.any(Number),
      advisory_only: true,
    });
  });

  it("Sample 5: safeEvaluateDecisionOutcome shape", async () => {
    const result = await safeEvaluateDecisionOutcome();
    expect(result).toMatchObject({
      evaluated: expect.any(Number),
      errors: expect.any(Number),
      advisory_only: true,
    });
  });

  it("Sample 6: Multiple users return independent results", async () => {
    const [m1, m2] = await Promise.all([
      computePerformanceMetrics(1),
      computePerformanceMetrics(2),
    ]);
    // Both should be valid PerformanceMetrics
    expect(m1.advisory_only).toBe(true);
    expect(m2.advisory_only).toBe(true);
    // Both should have zero metrics (no DB)
    expect(m1.total_decisions).toBe(0);
    expect(m2.total_decisions).toBe(0);
  });
});

// ─── TC-L84-12: HARD RULES — advisory_only = true ────────────────────────────
describe("TC-L84-12: HARD RULES — advisory_only invariant", () => {
  it("evaluateDecisionOutcome: advisory_only = true", async () => {
    const result = await evaluateDecisionOutcome();
    expect(result.advisory_only).toBe(true);
  });

  it("safeEvaluateDecisionOutcome: advisory_only = true", async () => {
    const result = await safeEvaluateDecisionOutcome();
    expect(result.advisory_only).toBe(true);
  });

  it("computePerformanceMetrics: advisory_only = true", async () => {
    const metrics = await computePerformanceMetrics(1);
    expect(metrics.advisory_only).toBe(true);
  });

  it("analyzeDecisionAttribution: advisory_only = true", async () => {
    const attr = await analyzeDecisionAttribution(1);
    expect(attr.advisory_only).toBe(true);
  });

  it("generateDecisionFeedback: advisory_only = true", async () => {
    const fb = await generateDecisionFeedback(1);
    expect(fb.advisory_only).toBe(true);
  });

  it("should not contain auto_trade_allowed in any output", async () => {
    const metrics = await computePerformanceMetrics(1) as Record<string, unknown>;
    const attr = await analyzeDecisionAttribution(1) as Record<string, unknown>;
    const fb = await generateDecisionFeedback(1) as Record<string, unknown>;
    expect(metrics.auto_trade_allowed).toBeUndefined();
    expect(attr.auto_trade_allowed).toBeUndefined();
    expect(fb.auto_trade_allowed).toBeUndefined();
  });
});
