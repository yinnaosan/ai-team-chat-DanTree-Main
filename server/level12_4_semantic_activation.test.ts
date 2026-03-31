/**
 * level12_4_semantic_activation.test.ts — DanTree Level 12.4
 *
 * TC-L124-01: PATH-A only (level11Analysis explicit threading)
 * TC-L124-02: PATH-A + PATH-B + PATH-C full aggregate
 * TC-L124-03: empty input safe behavior
 * TC-L124-04: attachUnifiedSemanticState behavior
 * TC-L124-05: advisory_only enforcement across all paths
 * TC-L124-06: partial inputs (PATH-B only, PATH-C only)
 */

import { describe, it, expect } from "vitest";
import {
  buildSemanticActivationResult,
  attachUnifiedSemanticState,
  type SemanticActivationInput,
  type SemanticActivationResult,
} from "./level12_4_semantic_activation";

import type { Level11AnalysisOutput, AssetType, SentimentPhase } from "./level11MultiAssetEngine";
import type { ExperienceLayerOutput } from "./experienceLayer";
import type { PositionLayerOutput } from "./level105PositionLayer";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES — field names match INTERFACE_SNAPSHOT exactly
// ─────────────────────────────────────────────────────────────────────────────

function makeLevel11Output(): Level11AnalysisOutput {
  return {
    classification: {
      asset_type: "equity" as AssetType,
      underlying_structure: "Single equity — large cap",
      primary_driver_type: "earnings",
      analysis_mode: "fundamental_moat_thesis",
      advisory_only: true,
    },
    driver_route: {
      framework: "fundamental_moat",
      primary_lens: "earnings_quality",
      secondary_lens: "macro_sensitivity",
      advisory_only: true,
    },
    real_drivers: {
      drivers: [
        {
          driver: "services margin expansion",
          type: "real",
          strength: 0.78,
          why: "Gross margin expanding in services",
          monitoring_signal: "quarterly gross margin trend",
          risk_if_wrong: "services ARPU growth stalls",
        },
        {
          driver: "AI narrative premium",
          type: "narrative",
          strength: 0.52,
          why: "Market pricing in AI optionality",
          monitoring_signal: "on-device AI revenue",
          risk_if_wrong: "AI monetization fails to materialize",
        },
      ],
      signal_vs_noise_summary: "Real driver dominates",
      primary_real_driver: "services margin expansion",
      primary_narrative_driver: "AI narrative premium",
      advisory_only: true,
    },
    incentives: {
      ticker: "AAPL",
      key_players: ["institutional_holders"],
      incentives: ["buyback_yield"],
      fear_drivers: ["china_risk"],
      hidden_pressure_points: [
        "china_revenue_concentration>regulatory_risk",
        "hardware_cycle_dependency",
      ],
      behavioral_summary: "Institutions anchored on services thesis",
      advisory_only: true,
    },
    sentiment_state: {
      sentiment_phase: "consensus" as SentimentPhase,
      positioning: "crowded_long",
      crowdedness: 0.70,
      risk_of_reversal: 0.42,
      phase_description: "Broad consensus; elevated",
      advisory_only: true,
    },
    scenario_map: {
      base_case: "Services margin expands; AI optionality intact",
      bull_case: "AI monetization accelerates",
      bear_case: "China restrictions + hardware cycle miss",
      key_triggers: ["services_gross_margin", "china_revenue_pct"],
      invalidations: ["services_margin_contracts", "AI_narrative_collapses"],
      advisory_only: true,
    },
    advisory_only: true,
  };
}

function makeExperienceOutput(): ExperienceLayerOutput {
  return {
    ticker: "AAPL",
    drift: {
      drift_direction: "strengthening",
      drift_intensity: 0.45,
      drift_signal: "thesis gaining conviction",
      confidence_change: 0.05,
      advisory_only: true,
    },
    confidence_update: {
      updated_confidence: 0.72,
      confidence_trend: "rising",
      reason: "Signal improving, BQ strong",
      advisory_only: true,
    },
    management_behavior: {
      behavior_pattern: "consistent",
      interpretation: "Consistently delivering on guidance",
      risk_implication: "Low management risk",
      advisory_only: true,
    },
    market_behavior: {
      market_behavior: "accumulation",
      interpretation: "Institutional accumulation detected",
      implication_for_thesis: "Market behavior supports bullish thesis",
      advisory_only: true,
    },
    gradient_risk: {
      risk_state: "building",
      risk_trend: "stable",
      risk_factors: ["macro_uncertainty"],
      gradient_signal: "Risk building slowly",
      advisory_only: true,
    },
    experience_insight: {
      drift_interpretation: "Thesis drifting positive",
      confidence_evolution: "Confidence rising slowly",
      behavior_insights: "Management consistent; accumulation detected",
      risk_gradient: "Risk building but contained",
      full_insight: "Overall thesis gaining conviction with manageable risk",
      advisory_only: true,
    },
    time_context: {
      ticker: "AAPL",
      recorded_at_ms: Date.now(),
      previous_thesis_summary: "Services growth thesis",
      previous_confidence: 0.67,
      last_drift_state: "strengthening",
    },
    advisory_only: true,
  };
}

function makePositionOutput(): PositionLayerOutput {
  return {
    asymmetry: {
      asymmetry_score: 0.68,
      asymmetry_label: "favorable",
      why: "High moat quality with contained downside",
      advisory_only: true,
    },
    sizing: {
      target_position_pct: 6.5,
      size_bucket: "medium",
      sizing_rationale: "Favorable asymmetry + stable drift → medium",
      advisory_only: true,
    },
    no_bet_discipline: {
      bet_allowed: true,
      restriction_level: "none",
      reason: "All conditions met",
      advisory_only: true,
    },
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-L124-01: PATH-A only — level11Analysis explicit threading
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L124-01: PATH-A only (level11Analysis explicit threading)", () => {
  it("should produce a result when only level11Analysis is provided", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
    });

    expect(result.packetCount).toBeGreaterThanOrEqual(1);
    expect(result.unifiedState).toBeDefined();
    expect(result.synthesisEnvelope).toBeDefined();
  });

  it("should include level11 agent in source_agents", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
    });

    expect(result.unifiedState?.source_agents).toContain("level11_multiasset_engine");
  });

  it("unifiedState should have protocol_version 12.2", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
    });

    expect(result.unifiedState?.protocol_version).toBe("12.2");
  });

  it("synthesisEnvelope should have advisory_only=true", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
    });

    expect(result.synthesisEnvelope?.advisory_only).toBe(true);
  });

  it("should set entity correctly from input", () => {
    const result = buildSemanticActivationResult({
      entity: "TSLA",
      level11Analysis: makeLevel11Output(),
    });

    expect(result.unifiedState?.entity).toBe("TSLA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L124-02: PATH-A + PATH-B + PATH-C full aggregate
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L124-02: PATH-A + PATH-B + PATH-C full aggregate", () => {
  it("should produce packetCount >= 3 with all three paths", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
      experienceLayer: makeExperienceOutput(),
      positionLayer: makePositionOutput(),
    });

    expect(result.packetCount).toBeGreaterThanOrEqual(3);
  });

  it("should include all three agents in source_agents", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
      experienceLayer: makeExperienceOutput(),
      positionLayer: makePositionOutput(),
    });

    const agents = result.unifiedState?.source_agents ?? [];
    expect(agents).toContain("level11_multiasset_engine");
    expect(agents).toContain("experience_layer");
    expect(agents).toContain("level105_position_layer");
  });

  it("aggregated signals should include contributions from multiple paths", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
      experienceLayer: makeExperienceOutput(),
      positionLayer: makePositionOutput(),
    });

    expect((result.unifiedState?.signals.length ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it("synthesisEnvelope should have top_signals and top_risks arrays", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
      experienceLayer: makeExperienceOutput(),
      positionLayer: makePositionOutput(),
    });

    expect(Array.isArray(result.synthesisEnvelope?.top_signals)).toBe(true);
    expect(Array.isArray(result.synthesisEnvelope?.top_risks)).toBe(true);
  });

  it("top_signals should be at most 3", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
      experienceLayer: makeExperienceOutput(),
      positionLayer: makePositionOutput(),
    });

    expect((result.synthesisEnvelope?.top_signals.length ?? 0)).toBeLessThanOrEqual(3);
  });

  it("unifiedState advisory_only should be true", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
      experienceLayer: makeExperienceOutput(),
      positionLayer: makePositionOutput(),
    });

    expect(result.unifiedState?.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L124-03: empty input safe behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L124-03: empty input safe behavior", () => {
  it("should return packetCount=0 with no inputs", () => {
    const result = buildSemanticActivationResult({ entity: "AAPL" });
    expect(result.packetCount).toBe(0);
  });

  it("should return undefined unifiedState when no inputs", () => {
    const result = buildSemanticActivationResult({ entity: "AAPL" });
    expect(result.unifiedState).toBeUndefined();
  });

  it("should return undefined synthesisEnvelope when no inputs", () => {
    const result = buildSemanticActivationResult({ entity: "AAPL" });
    expect(result.synthesisEnvelope).toBeUndefined();
  });

  it("should NOT throw when all optional inputs are undefined", () => {
    expect(() =>
      buildSemanticActivationResult({
        entity: "AAPL",
        level11Analysis: undefined,
        experienceLayer: undefined,
        positionLayer: undefined,
      })
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L124-04: attachUnifiedSemanticState behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L124-04: attachUnifiedSemanticState", () => {
  it("should attach __unifiedSemanticState to target object", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
    });

    const target = { someField: "value", otherField: 42 };
    const enriched = attachUnifiedSemanticState(target, result.unifiedState);

    expect(enriched.__unifiedSemanticState).toBeDefined();
    expect(enriched.__unifiedSemanticState?.protocol_version).toBe("12.2");
  });

  it("should preserve all original target fields", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
    });

    const target = { someField: "value", numeric: 123, nested: { a: 1 } };
    const enriched = attachUnifiedSemanticState(target, result.unifiedState);

    expect(enriched.someField).toBe("value");
    expect(enriched.numeric).toBe(123);
    expect(enriched.nested).toEqual({ a: 1 });
  });

  it("should NOT mutate the original target object", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
    });

    const target = { someField: "value" };
    attachUnifiedSemanticState(target, result.unifiedState);

    // Original target should not have __unifiedSemanticState
    expect((target as Record<string, unknown>).__unifiedSemanticState).toBeUndefined();
  });

  it("should return original object unchanged when unifiedState is undefined", () => {
    const target = { someField: "value" };
    const result = attachUnifiedSemanticState(target, undefined);

    expect(result).toBe(target); // same reference
    expect((result as Record<string, unknown>).__unifiedSemanticState).toBeUndefined();
  });

  it("attached __unifiedSemanticState should have advisory_only=true", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
    });

    const enriched = attachUnifiedSemanticState({}, result.unifiedState);
    expect(enriched.__unifiedSemanticState?.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L124-05: advisory_only enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L124-05: advisory_only enforcement across all paths", () => {
  it("unifiedState.advisory_only is true for PATH-A only", () => {
    const r = buildSemanticActivationResult({ entity: "AAPL", level11Analysis: makeLevel11Output() });
    expect(r.unifiedState?.advisory_only).toBe(true);
  });

  it("unifiedState.advisory_only is true for PATH-B only", () => {
    const r = buildSemanticActivationResult({ entity: "AAPL", experienceLayer: makeExperienceOutput() });
    expect(r.unifiedState?.advisory_only).toBe(true);
  });

  it("unifiedState.advisory_only is true for PATH-C only", () => {
    const r = buildSemanticActivationResult({ entity: "AAPL", positionLayer: makePositionOutput() });
    expect(r.unifiedState?.advisory_only).toBe(true);
  });

  it("synthesisEnvelope.advisory_only is true for full aggregate", () => {
    const r = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeLevel11Output(),
      experienceLayer: makeExperienceOutput(),
      positionLayer: makePositionOutput(),
    });
    expect(r.synthesisEnvelope?.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L124-06: partial inputs (PATH-B only, PATH-C only)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L124-06: partial inputs", () => {
  it("PATH-B only should produce valid result", () => {
    const r = buildSemanticActivationResult({
      entity: "AAPL",
      experienceLayer: makeExperienceOutput(),
    });

    expect(r.packetCount).toBeGreaterThanOrEqual(1);
    expect(r.unifiedState).toBeDefined();
    expect(r.unifiedState?.source_agents).toContain("experience_layer");
  });

  it("PATH-C only should produce valid result", () => {
    const r = buildSemanticActivationResult({
      entity: "AAPL",
      positionLayer: makePositionOutput(),
    });

    expect(r.packetCount).toBeGreaterThanOrEqual(1);
    expect(r.unifiedState).toBeDefined();
    expect(r.unifiedState?.source_agents).toContain("level105_position_layer");
  });

  it("PATH-B + PATH-C without PATH-A should still aggregate correctly", () => {
    const r = buildSemanticActivationResult({
      entity: "AAPL",
      experienceLayer: makeExperienceOutput(),
      positionLayer: makePositionOutput(),
    });

    expect(r.packetCount).toBeGreaterThanOrEqual(2);
    expect(r.unifiedState?.advisory_only).toBe(true);
  });

  it("should use provided timeframe in unifiedState", () => {
    const r = buildSemanticActivationResult({
      entity: "AAPL",
      timeframe: "long",
      level11Analysis: makeLevel11Output(),
    });

    // unifiedState.timeframe is the longest timeframe across packets
    expect(r.unifiedState?.timeframe).toBe("long");
  });
});
