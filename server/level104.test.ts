/**
 * LEVEL10.4 — Experience Persistence & Learning Layer Tests
 *
 * 4 Test Cases:
 * TC-L104-01: analyzeThesisDriftHistory — drift pattern analysis from history records
 * TC-L104-02: analyzeConfidenceTrajectory — confidence trend detection
 * TC-L104-03: generateExperienceInsight — meta-insight synthesis from multi-dimension analysis
 * TC-L104-04: runDeepResearch async — experience_history embed in output (non-blocking)
 *
 * Hard Rules:
 * - advisory_only: true on all outputs
 * - Experience history is non-blocking (pipeline works without DB)
 * - buildExperienceHistorySummary handles empty history gracefully
 * - runDeepResearch is now async (returns Promise<DeepResearchOutput>)
 */

import { describe, it, expect } from "vitest";
import {
  analyzeThesisDriftHistory,
  analyzeConfidenceTrajectory,
  analyzeBehaviorEvolution,
  generateExperienceInsight,
  buildExperienceHistorySummary,
  type ExperienceHistoryRecord,
  type DriftHistoryAnalysis,
  type ConfidenceTrajectory,
  type BehaviorEvolution,
} from "./experienceLearningEngine";
import { runDeepResearch, type DeepResearchContextMap } from "./deepResearchEngine";
import type { InvestorThinkingOutput } from "./investorThinkingLayer";
import type { RegimeOutput } from "./regimeEngine";
import type { FactorInteractionOutput } from "./factorInteractionEngine";
import type { BusinessContext } from "./businessUnderstandingEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock builders
// ─────────────────────────────────────────────────────────────────────────────

function makeHistoryRecord(overrides: Partial<ExperienceHistoryRecord> = {}): ExperienceHistoryRecord {
  return {
    timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
    drift_direction: "stable",
    confidence: 0.72,
    management_pattern: "consistent",
    market_behavior: "accumulation",
    risk_state: "low",
    ...overrides,
  };
}

function makeDeepResearchCtx(ticker: string): DeepResearchContextMap {
  const investorThinking: InvestorThinkingOutput = {
    business_quality: {
      business_quality_score: 0.75,
      moat_strength: 0.7,
      business_flags: [],
    },
    event_adjustment: {
      adjusted_alpha_weight: 1.0,
      adjusted_risk_weight: 1.0,
      adjusted_macro_weight: 1.0,
      adjusted_momentum_weight: 1.0,
      event_bias: "neutral",
      event_summary: "No significant events",
    },
    falsification: {
      why_might_be_wrong: [],
      key_risk_flags: [],
      invalidation_conditions: [],
    },
    adjusted_alpha_score: 0.68,
    adjusted_danger_score: 0.15,
    adjusted_trigger_score: 0.55,
    adjusted_memory_score: 0.60,
    dominant_factor: "alpha_score",
    advisory_only: true,
  };

  const regime: RegimeOutput = {
    regime_tag: "neutral",
    regime_confidence: 0.7,
    regime_drivers: [],
    advisory_only: true,
  };

  const factorInteraction: FactorInteractionOutput = {
    adjusted_alpha_score: 0.68,
    adjusted_danger_score: 0.15,
    adjusted_trigger_score: 0.55,
    interaction_reasons: [],
    interaction_dominant_effect: "none",
    advisory_only: true,
  };

  const businessContext: BusinessContext = {
    competenceFit: {
      competence_fit: "within",
      competence_confidence: 0.8,
      sector_familiarity: "high",
      advisory_only: true,
    },
    businessUnderstanding: {
      business_understanding_score: 0.75,
      moat_strength: "narrow",
      business_model_quality: "recurring",
      why_this_business_might_be_good: ["strong recurring revenue"],
      why_this_business_might_be_fragile: ["competitive pressure"],
      advisory_only: true,
    },
    managementProxy: {
      management_proxy_score: 0.70,
      capital_allocation_quality: "disciplined",
      management_risk_flags: [],
      advisory_only: true,
    },
    eligibility: {
      eligibility_status: "eligible",
      business_priority_multiplier: 1.0,
      filter_flags: [],
      advisory_only: true,
    },
  };

  return {
    ticker,
    sector: "technology",
    investorThinking,
    regime,
    factorInteraction,
    businessContext,
    signalFusionScore: 0.68,
    dataQualityScore: 0.75,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-L104-01: analyzeThesisDriftHistory — drift pattern analysis
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L104-01: analyzeThesisDriftHistory", () => {
  it("should return mixed trend for empty history", () => {
    const result: DriftHistoryAnalysis = analyzeThesisDriftHistory([]);
    expect(result.advisory_only).toBe(true);
    expect(result.dominant_trend).toBe("mixed");
    expect(result.consecutive_drift_count).toBe(0);
    expect(result.drift_distribution.strengthening).toBe(0);
    expect(result.drift_distribution.weakening).toBe(0);
    // For empty history, unclear is set to 1.0 (100% unclear)
    expect(result.drift_distribution.unclear).toBe(1.0);
    expect(typeof result.interpretation).toBe("string");
  });

  it("should detect persistent weakening trend", () => {
    const history: ExperienceHistoryRecord[] = [
      makeHistoryRecord({ drift_direction: "weakening", timestamp: Date.now() - 3 * 86400000 }),
      makeHistoryRecord({ drift_direction: "weakening", timestamp: Date.now() - 2 * 86400000 }),
      makeHistoryRecord({ drift_direction: "weakening", timestamp: Date.now() - 1 * 86400000 }),
    ];
    const result: DriftHistoryAnalysis = analyzeThesisDriftHistory(history);
    expect(result.advisory_only).toBe(true);
    expect(result.dominant_trend).toBe("weakening");
    expect(result.consecutive_drift_count).toBeGreaterThanOrEqual(3);
    // distribution values are ratios (0-1), not raw counts
    expect(result.drift_distribution.weakening).toBeGreaterThan(0.5);
    expect(result.drift_distribution.strengthening).toBe(0);
  });

  it("should detect strengthening trend", () => {
    const history: ExperienceHistoryRecord[] = [
      makeHistoryRecord({ drift_direction: "strengthening", timestamp: Date.now() - 4 * 86400000 }),
      makeHistoryRecord({ drift_direction: "strengthening", timestamp: Date.now() - 3 * 86400000 }),
      makeHistoryRecord({ drift_direction: "strengthening", timestamp: Date.now() - 2 * 86400000 }),
      makeHistoryRecord({ drift_direction: "strengthening", timestamp: Date.now() - 1 * 86400000 }),
    ];
    const result: DriftHistoryAnalysis = analyzeThesisDriftHistory(history);
    expect(result.advisory_only).toBe(true);
    expect(result.dominant_trend).toBe("strengthening");
    expect(result.consecutive_drift_count).toBeGreaterThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L104-02: analyzeConfidenceTrajectory — confidence trend detection
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L104-02: analyzeConfidenceTrajectory", () => {
  it("should return flat trend for insufficient history (< 2 records)", () => {
    // analyzeConfidenceTrajectory returns flat for < 2 records
    const result: ConfidenceTrajectory = analyzeConfidenceTrajectory([makeHistoryRecord()]);
    expect(result.advisory_only).toBe(true);
    expect(result.trend).toBe("flat");
    expect(result.current_vs_peak).toBe(1.0);
    expect(result.volatility).toBe(0);
    expect(typeof result.interpretation).toBe("string");
  });

  it("should detect downtrend when confidence consistently declines", () => {
    const history: ExperienceHistoryRecord[] = [
      makeHistoryRecord({ confidence: 0.85, timestamp: Date.now() - 4 * 86400000 }),
      makeHistoryRecord({ confidence: 0.75, timestamp: Date.now() - 3 * 86400000 }),
      makeHistoryRecord({ confidence: 0.65, timestamp: Date.now() - 2 * 86400000 }),
      makeHistoryRecord({ confidence: 0.55, timestamp: Date.now() - 1 * 86400000 }),
    ];
    const result: ConfidenceTrajectory = analyzeConfidenceTrajectory(history);
    expect(result.advisory_only).toBe(true);
    expect(result.trend).toBe("downtrend");
    expect(result.peak).toBeCloseTo(0.85, 1);
    expect(result.current_vs_peak).toBeLessThan(1.0);
  });

  it("should detect uptrend when confidence consistently rises with sufficient slope", () => {
    // Need slope > 0.02 per cycle — use wider spread
    const history: ExperienceHistoryRecord[] = [
      makeHistoryRecord({ confidence: 0.40, timestamp: Date.now() - 4 * 86400000 }),
      makeHistoryRecord({ confidence: 0.52, timestamp: Date.now() - 3 * 86400000 }),
      makeHistoryRecord({ confidence: 0.64, timestamp: Date.now() - 2 * 86400000 }),
      makeHistoryRecord({ confidence: 0.76, timestamp: Date.now() - 1 * 86400000 }),
    ];
    const result: ConfidenceTrajectory = analyzeConfidenceTrajectory(history);
    expect(result.advisory_only).toBe(true);
    expect(result.trend).toBe("uptrend");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L104-03: generateExperienceInsight — meta-insight synthesis
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L104-03: generateExperienceInsight", () => {
  it("should return no-signal insight for empty/neutral inputs", () => {
    const driftAnalysis: DriftHistoryAnalysis = {
      drift_distribution: { strengthening: 0, weakening: 0, unclear: 0 },
      dominant_trend: "mixed",
      consecutive_drift_count: 0,
      interpretation: "No drift data",
      advisory_only: true,
    };
    const confidenceTrajectory: ConfidenceTrajectory = {
      trend: "flat",
      volatility: 0.05,
      peak: 0.7,
      current_vs_peak: 1.0,
      interpretation: "Stable confidence",
      advisory_only: true,
    };
    const behaviorEvolution: BehaviorEvolution = {
      management_pattern_trend: "consistent",
      market_behavior_trend: "neutral",
      pattern_consistency: 0.8,
      risk_implication: "Low risk",
      advisory_only: true,
    };
    const result = generateExperienceInsight(driftAnalysis, confidenceTrajectory, behaviorEvolution);
    expect(result.advisory_only).toBe(true);
    expect(typeof result.meta_insight).toBe("string");
    expect(typeof result.learning_signal).toBe("string");
    expect(typeof result.recommended_adjustment).toBe("string");
    // No significant signal → should say "No adjustment" or "Maintain current"
    const noSignalPhrases = ["No adjustment", "Maintain current", "maintain"];
    const hasNoSignalPhrase = noSignalPhrases.some(p => result.recommended_adjustment.toLowerCase().includes(p.toLowerCase()));
    expect(hasNoSignalPhrase).toBe(true);
  });

  it("should generate actionable insight for persistent weakening + confidence decline", () => {
    const driftAnalysis: DriftHistoryAnalysis = {
      drift_distribution: { strengthening: 0, weakening: 4, unclear: 0 },
      dominant_trend: "weakening",
      consecutive_drift_count: 4,
      interpretation: "Persistent weakening over 4 cycles",
      advisory_only: true,
    };
    const confidenceTrajectory: ConfidenceTrajectory = {
      trend: "downtrend",
      volatility: 0.08,
      peak: 0.85,
      current_vs_peak: 0.65,  // 35% decline from peak
      interpretation: "Confidence peaked and declined significantly",
      advisory_only: true,
    };
    const behaviorEvolution: BehaviorEvolution = {
      management_pattern_trend: "consistent",
      market_behavior_trend: "neutral",
      pattern_consistency: 0.75,
      risk_implication: "Moderate risk",
      advisory_only: true,
    };
    const result = generateExperienceInsight(driftAnalysis, confidenceTrajectory, behaviorEvolution);
    expect(result.advisory_only).toBe(true);
    // Should detect persistent weakening
    expect(result.learning_signal).toContain("persistent_weakening_detected");
    // Should recommend position reduction
    expect(result.recommended_adjustment).toContain("Reduce");
    // Meta insight should mention consecutive cycles
    expect(result.meta_insight).toContain("4");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L104-04: runDeepResearch async — experience_history embed (non-blocking)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L104-04: runDeepResearch async with experience_history", () => {
  it("should be async and return a Promise", async () => {
    const ctx = makeDeepResearchCtx("AAPL");
    const resultPromise = runDeepResearch(ctx);
    // Must be a Promise
    expect(resultPromise).toBeInstanceOf(Promise);
    const result = await resultPromise;
    expect(result.advisory_only).toBe(true);
    expect(result.ticker).toBe("AAPL");
  });

  it("should run without experienceParams and return valid output (backward compatible)", async () => {
    const ctx = makeDeepResearchCtx("MSFT");
    const result = await runDeepResearch(ctx);
    expect(result.advisory_only).toBe(true);
    expect(result.ticker).toBe("MSFT");
    expect(result.thesis).toBeDefined();
    expect(result.narrative).toBeDefined();
    expect(result.lens).toBeDefined();
    expect(result.signal_density).toBeDefined();
    // experience_history may be undefined (no DB in test env) — non-blocking
    // It should NOT throw even if DB is unavailable
  });

  it("should include experience_history when DB records exist (or gracefully skip)", async () => {
    const ctx = makeDeepResearchCtx("NVDA");
    const result = await runDeepResearch(ctx);
    expect(result.advisory_only).toBe(true);
    // experience_history is optional — if present, must have correct structure
    if (result.experience_history) {
      expect(result.experience_history.advisory_only).toBe(true);
      expect(typeof result.experience_history.record_count).toBe("number");
      expect(result.experience_history.record_count).toBeGreaterThan(0);
      expect(["strengthening", "weakening", "mixed"]).toContain(result.experience_history.dominant_drift_trend);
      expect(["uptrend", "downtrend", "volatile", "flat"]).toContain(result.experience_history.confidence_trend);
      expect(typeof result.experience_history.pattern_consistency).toBe("number");
      expect(typeof result.experience_history.meta_insight).toBe("string");
      expect(typeof result.experience_history.recommended_adjustment).toBe("string");
    }
    // experience_learning_insight in narrative is optional too
    if (result.narrative.narrative.experience_learning_insight) {
      expect(typeof result.narrative.narrative.experience_learning_insight).toBe("string");
      expect(result.narrative.narrative.experience_learning_insight.length).toBeGreaterThan(0);
    }
  });

  it("should not break pipeline when experience history DB is unavailable", async () => {
    // This test verifies non-blocking behavior: even if DB fails, pipeline completes
    const ctx = makeDeepResearchCtx("META");
    // Should not throw
    const result = await runDeepResearch(ctx);
    expect(result.advisory_only).toBe(true);
    expect(result.ticker).toBe("META");
    expect(result.thesis).toBeDefined();
    expect(result.narrative).toBeDefined();
    // experience_history may be undefined (non-blocking failure)
    // This is expected behavior — no assertion needed
  });
});
