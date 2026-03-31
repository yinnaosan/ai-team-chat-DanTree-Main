/**
 * semantic_protocol_integration.test.ts — Level 12.1 Integration Layer Tests
 * TC-INT-01~05: Phase 1 handoff path validation
 */
import { describe, it, expect } from "vitest";
import {
  buildLevel11SemanticPacket,
  buildExperienceLayerSemanticPacket,
  buildPositionLayerSemanticPacket,
  rejectNaturalLanguageInternalPayload,
  SEMANTIC_INTEGRATION_REGISTRY,
  type PositionLayerHandoffInput,
} from "./semantic_protocol_integration";
import { validateSemanticPacket } from "./semantic_protocol";
import type { Level11AnalysisOutput } from "./level11MultiAssetEngine";
import type { ExperienceLayerInsight } from "./experienceLayer";

// ─── Mock helpers ────────────────────────────────────────────────────────────

function makeL11Mock(): Level11AnalysisOutput {
  return {
    classification: { asset_type: "equity", ticker: "AAPL", sector: "technology", advisory_only: true },
    driver_route: { asset_type: "equity", engine: "equity_fundamental", rationale: "equity", advisory_only: true },
    real_drivers: {
      drivers: [
        { driver: "earnings_revision_cycle_upward", type: "real", strength: 0.78, why: "consensus_beat", monitoring_signal: "eps_revision_ratio", risk_if_wrong: "macro_deterioration" },
        { driver: "ai_narrative_premium", type: "narrative", strength: 0.62, why: "market_hype", monitoring_signal: "ai_revenue_pct", risk_if_wrong: "ai_revenue_miss" },
      ],
      signal_vs_noise_summary: "real_driver_dominant_over_narrative",
      primary_real_driver: "earnings_revision_cycle_upward",
      primary_narrative_driver: "ai_narrative_premium",
      advisory_only: true,
    },
    incentives: {
      key_players: ["institutional_long_only", "retail_momentum"],
      incentives: ["earnings_beat_continuation"],
      narrative_support: "high",
      narrative_fragility: "medium",
      advisory_only: true,
    },
    sentiment_state: {
      sentiment_phase: "optimism",
      phase_description: "moderate_optimism",
      crowdedness: 0.65,
      risk_of_reversal: 0.42,
      positioning: "long_biased",
      advisory_only: true,
    },
    scenario_map: {
      base_case: "Earnings continue to beat. Multiple expansion limited.",
      bull_case: "AI revenue acceleration surprises to upside.",
      bear_case: "Macro deterioration compresses multiples.",
      key_triggers: ["q4_earnings_beat", "fed_rate_cut_acceleration"],
      advisory_only: true,
    },
    advisory_only: true,
  };
}

function makeExperienceInsightMock(): ExperienceLayerInsight {
  return {
    drift_interpretation: "The thesis for AAPL is weakening — supporting signals are diverging from price action.",
    confidence_evolution: "Conviction is gradually declining (now 68%) — not a crisis, but a signal to watch.",
    behavior_insights: "Management delivered on guidance. Market behavior shows accumulation pattern.",
    risk_gradient: "Risk is building gradually. Monitor for acceleration.",
    full_insight: "Overall thesis intact but drift requires monitoring.",
    advisory_only: true,
  };
}

function makePositionMock(): PositionLayerHandoffInput {
  return {
    ticker: "AAPL",
    size_bucket: "medium",
    target_position_pct: 8.5,
    asymmetry_score: 0.68,
    asymmetry_label: "favorable",
    adjustment_direction: "hold",
    concentration_risk: "medium",
    regime_tag: "risk_on",
    drift_trend: "stable",
    advisory_only: true,
  };
}

// ─── TC-INT-01: PATH-A Level11 → narrative synthesis ─────────────────────────

describe("TC-INT-01: PATH-A buildLevel11SemanticPacket", () => {
  it("should produce a valid SemanticTransportPacket", () => {
    const l11 = makeL11Mock();
    const packet = buildLevel11SemanticPacket(l11, "AAPL");
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should set agent=level11_multiasset_engine and task=driver_routing", () => {
    const packet = buildLevel11SemanticPacket(makeL11Mock(), "AAPL");
    expect(packet.agent).toBe("level11_multiasset_engine");
    expect(packet.task).toBe("driver_routing");
  });

  it("should set entity to ticker", () => {
    const packet = buildLevel11SemanticPacket(makeL11Mock(), "NVDA");
    expect(packet.entity).toBe("NVDA");
  });

  it("should have advisory_only=true", () => {
    const packet = buildLevel11SemanticPacket(makeL11Mock(), "AAPL");
    expect(packet.advisory_only).toBe(true);
  });

  it("should have protocol_version=12.1", () => {
    const packet = buildLevel11SemanticPacket(makeL11Mock(), "AAPL");
    expect(packet.protocol_version).toBe("12.1");
  });

  it("should map crowding from sentiment_state", () => {
    const l11 = makeL11Mock();
    const packet = buildLevel11SemanticPacket(l11, "AAPL");
    expect(packet.state.crowding).toBeCloseTo(0.65, 1);
  });

  it("should have at least one signal", () => {
    const packet = buildLevel11SemanticPacket(makeL11Mock(), "AAPL");
    expect(packet.signals.length).toBeGreaterThan(0);
  });

  it("should sort signals by intensity descending", () => {
    const packet = buildLevel11SemanticPacket(makeL11Mock(), "AAPL");
    for (let i = 0; i < packet.signals.length - 1; i++) {
      expect(packet.signals[i].intensity).toBeGreaterThanOrEqual(packet.signals[i + 1].intensity);
    }
  });
});

// ─── TC-INT-02: PATH-B Experience Layer → synthesis ──────────────────────────

describe("TC-INT-02: PATH-B buildExperienceLayerSemanticPacket", () => {
  it("should produce a valid SemanticTransportPacket", () => {
    const insight = makeExperienceInsightMock();
    const packet = buildExperienceLayerSemanticPacket(insight, "AAPL", 0.68);
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should set agent=experience_layer_engine and task=hypothesis_validation", () => {
    const packet = buildExperienceLayerSemanticPacket(makeExperienceInsightMock(), "AAPL");
    expect(packet.agent).toBe("experience_layer_engine");
    expect(packet.task).toBe("hypothesis_validation");
  });

  it("should detect weakening drift from insight text", () => {
    const packet = buildExperienceLayerSemanticPacket(makeExperienceInsightMock(), "AAPL");
    // drift_interpretation contains "weakening" → direction should be negative
    expect(packet.state.direction).toBe("negative");
  });

  it("should detect falling confidence trend", () => {
    const packet = buildExperienceLayerSemanticPacket(makeExperienceInsightMock(), "AAPL");
    expect(packet.confidence.trend).toBe("falling");
  });

  it("should have advisory_only=true", () => {
    const packet = buildExperienceLayerSemanticPacket(makeExperienceInsightMock(), "AAPL");
    expect(packet.advisory_only).toBe(true);
  });
});

// ─── TC-INT-03: PATH-C Position Layer → synthesis/decision ───────────────────

describe("TC-INT-03: PATH-C buildPositionLayerSemanticPacket", () => {
  it("should produce a valid SemanticTransportPacket", () => {
    const pos = makePositionMock();
    const packet = buildPositionLayerSemanticPacket(pos);
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should set agent=level105_position_layer and task=position_integration", () => {
    const packet = buildPositionLayerSemanticPacket(makePositionMock());
    expect(packet.agent).toBe("level105_position_layer");
    expect(packet.task).toBe("position_integration");
  });

  it("should map asymmetry_score to confidence.score", () => {
    const packet = buildPositionLayerSemanticPacket(makePositionMock());
    expect(packet.confidence.score).toBeCloseTo(0.68, 2);
  });

  it("should map concentration_risk=high to crowding=0.8", () => {
    const pos = { ...makePositionMock(), concentration_risk: "high" as const };
    const packet = buildPositionLayerSemanticPacket(pos);
    expect(packet.state.crowding).toBe(0.8);
  });

  it("should have advisory_only=true", () => {
    const packet = buildPositionLayerSemanticPacket(makePositionMock());
    expect(packet.advisory_only).toBe(true);
  });
});

// ─── TC-INT-04: Enforcement Guard ────────────────────────────────────────────

describe("TC-INT-04: rejectNaturalLanguageInternalPayload", () => {
  it("should pass short machine phrases", () => {
    const result = rejectNaturalLanguageInternalPayload(
      { signal: "earnings_revision_cycle_upward", score: 0.78 },
      "test_path",
      "warn"
    );
    expect(result.clean).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("should detect long natural language paragraph", () => {
    const longText = "The Federal Reserve has signaled a potential pivot in monetary policy, which could have significant implications for equity valuations and credit spreads across multiple asset classes in the coming quarters.";
    const result = rejectNaturalLanguageInternalPayload(
      { narrative: longText },
      "test_path",
      "warn"
    );
    expect(result.clean).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("should throw in strict mode when natural language detected", () => {
    const longText = "The Federal Reserve has signaled a potential pivot in monetary policy, which could have significant implications for equity valuations and credit spreads across multiple asset classes in the coming quarters.";
    expect(() =>
      rejectNaturalLanguageInternalPayload({ narrative: longText }, "test_path", "throw")
    ).toThrow(/natural_lang_detected/);
  });

  it("should pass semantic microphrases even if they look like multiple words", () => {
    const result = rejectNaturalLanguageInternalPayload(
      { note: "crowding_high && fragility_rising — gap_risk_elevated" },
      "test_path",
      "warn"
    );
    expect(result.clean).toBe(true);
  });
});

// ─── TC-INT-05: Integration Registry ─────────────────────────────────────────

describe("TC-INT-05: SEMANTIC_INTEGRATION_REGISTRY", () => {
  it("should have protocol_version=12.1", () => {
    expect(SEMANTIC_INTEGRATION_REGISTRY.protocol_version).toBe("12.1");
  });

  it("should have 3 integrated paths", () => {
    expect(SEMANTIC_INTEGRATION_REGISTRY.integrated_paths).toHaveLength(3);
  });

  it("should list PATH-A, PATH-B, PATH-C as integrated", () => {
    const ids = SEMANTIC_INTEGRATION_REGISTRY.integrated_paths.map(p => p.id);
    expect(ids).toContain("PATH-A");
    expect(ids).toContain("PATH-B");
    expect(ids).toContain("PATH-C");
  });

  it("all integrated paths should have status=integrated", () => {
    for (const path of SEMANTIC_INTEGRATION_REGISTRY.integrated_paths) {
      expect(path.status).toBe("integrated");
    }
  });

  it("should document remaining natural language paths", () => {
    expect(SEMANTIC_INTEGRATION_REGISTRY.remaining_natural_language_paths.length).toBeGreaterThan(0);
  });
});
