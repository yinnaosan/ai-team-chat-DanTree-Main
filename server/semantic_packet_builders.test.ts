/**
 * semantic_packet_builders.test.ts — Level 12.3
 *
 * TC-PB-01: buildLevel11SemanticPacket — valid packet shape
 * TC-PB-02: buildLevel11SemanticPacket — signals map from drivers
 * TC-PB-03: buildLevel11SemanticPacket — sentiment mapped correctly
 * TC-PB-04: buildLevel11SemanticPacket — policy_reality optional
 * TC-PB-05: buildLevel11SemanticPacket — propagation chain → risks
 * TC-PB-06: buildLevel11SemanticPacket — invalidations from scenario_map
 * TC-PB-07: buildPositionSemanticPacket — valid packet shape
 * TC-PB-08: buildPositionSemanticPacket — no_bet hard restriction → risk
 * TC-PB-09: buildPositionSemanticPacket — asymmetry → direction + intensity
 * TC-PB-10: both packets compatible with aggregateSemanticPackets
 */

import { describe, it, expect } from "vitest";
import {
  buildLevel11SemanticPacket,
  buildPositionSemanticPacket,
} from "./semantic_packet_builders";
import { validateSemanticPacket } from "./semantic_protocol";
import { aggregateSemanticPackets } from "./semantic_aggregator";
import type {
  Level11AnalysisOutput,
  AssetType,
  SentimentPhase,
} from "../level11MultiAssetEngine";
import type { PositionLayerOutput } from "../level105PositionLayer";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeLevel11Output(overrides: Partial<Level11AnalysisOutput> = {}): Level11AnalysisOutput {
  return {
    classification: {
      asset_type: "equity" as AssetType,
      underlying_structure: "Single equity — large cap technology",
      primary_driver_type: "earnings",
      analysis_mode: "fundamental_moat_thesis: analyze business quality and moat",
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
          driver: "services revenue margin expansion",
          type: "real",
          strength: 0.78,
          why: "Gross margin expanding in services segment",
          monitoring_signal: "quarterly gross margin trend",
          risk_if_wrong: "services ARPU growth stalls",
        },
        {
          driver: "AI narrative premium",
          type: "narrative",
          strength: 0.55,
          why: "Market pricing in AI upside not yet monetized",
          monitoring_signal: "on-device AI revenue materialization",
          risk_if_wrong: "AI monetization fails to materialize in 2 quarters",
        },
      ],
      signal_vs_noise_summary: "Real driver dominates; narrative provides upside optionality",
      primary_real_driver: "services revenue margin expansion",
      primary_narrative_driver: "AI narrative premium",
      advisory_only: true,
    },
    incentives: {
      ticker: "AAPL",
      key_players: ["institutional_holders", "retail_momentum"],
      incentives: ["dividend_reinvestment", "buyback_yield"],
      fear_drivers: ["china_revenue_risk", "rate_sensitivity"],
      hidden_pressure_points: [
        "china_revenue_concentration>regulatory_risk",
        "hardware_cycle_dependency && services_decoupling",
      ],
      behavioral_summary: "Institutions anchored on services growth thesis; fear=china+rates",
      advisory_only: true,
    },
    sentiment_state: {
      sentiment_phase: "consensus" as SentimentPhase,
      positioning: "crowded_long",
      crowdedness: 0.72,
      risk_of_reversal: 0.44,
      phase_description: "Broad consensus; elevated but not overheated",
      advisory_only: true,
    },
    scenario_map: {
      base_case: "Services margin continues expanding; AI optionality intact",
      bull_case: "AI monetization accelerates; services reach 60% gross margin",
      bear_case: "China restrictions expand; hardware cycle disappoints",
      key_triggers: ["services_gross_margin_quarterly", "china_revenue_pct"],
      invalidations: [
        "services gross margin contracts below 72pct",
        "AI monetization narrative collapses",
      ],
      advisory_only: true,
    },
    advisory_only: true,
    ...overrides,
  };
}

function makePositionOutput(overrides: Partial<PositionLayerOutput> = {}): PositionLayerOutput {
  return {
    asymmetry: {
      asymmetry_score: 0.68,
      asymmetry_label: "favorable",
      why: "High moat quality with contained downside; services growth provides asymmetric upside",
      advisory_only: true,
    },
    sizing: {
      target_position_pct: 6.5,
      size_bucket: "medium",
      sizing_rationale: "Favorable asymmetry + high BQ + stable drift → medium position",
      advisory_only: true,
    },
    no_bet_discipline: {
      bet_allowed: true,
      restriction_level: "none",
      reason: "All conditions met: competence fit, asymmetry > 0.5, risk not critical",
      advisory_only: true,
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-01: buildLevel11SemanticPacket — valid packet shape
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-01: buildLevel11SemanticPacket produces valid packet", () => {
  it("should produce a packet that passes validateSemanticPacket", () => {
    const packet = buildLevel11SemanticPacket(
      makeLevel11Output(),
      { entity: "AAPL" }
    );
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should have protocol_version 12.1", () => {
    const packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    expect(packet.protocol_version).toBe("12.1");
  });

  it("should have advisory_only=true", () => {
    const packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    expect(packet.advisory_only).toBe(true);
  });

  it("should use provided agent name", () => {
    const packet = buildLevel11SemanticPacket(
      makeLevel11Output(),
      { entity: "AAPL", agent: "custom_agent" }
    );
    expect(packet.agent).toBe("custom_agent");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-02: buildLevel11SemanticPacket — signals map from drivers
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-02: Level11 driver signals mapping", () => {
  it("should produce at least as many signals as drivers", () => {
    const level11 = makeLevel11Output();
    const packet = buildLevel11SemanticPacket(level11, { entity: "AAPL" });
    // drivers(2) + sentiment(1) = at least 3
    expect(packet.signals.length).toBeGreaterThanOrEqual(level11.real_drivers.drivers.length);
  });

  it("should map real driver strength to signal intensity", () => {
    const packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    const realSignal = packet.signals.find((s) => s.driver_type === "real");
    expect(realSignal).toBeDefined();
    expect(realSignal!.intensity).toBeGreaterThanOrEqual(0);
    expect(realSignal!.intensity).toBeLessThanOrEqual(1);
  });

  it("should map narrative driver to driver_type behavior or narrative", () => {
    const packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    const narrativeSignal = packet.signals.find((s) =>
      s.name.includes("narrative") || s.driver_type === "behavior"
    );
    expect(narrativeSignal).toBeDefined();
  });

  it("should include monitoring_signal and invalidation from driver", () => {
    const packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    const realSignal = packet.signals.find((s) => s.driver_type === "real");
    expect(realSignal?.monitoring_signal).toBeTruthy();
    expect(realSignal?.invalidation).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-03: buildLevel11SemanticPacket — sentiment mapped correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-03: Level11 sentiment state mapping", () => {
  it("should include a sentiment signal", () => {
    const packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    const sentimentSignal = packet.signals.find((s) => s.name.includes("sentiment_phase"));
    expect(sentimentSignal).toBeDefined();
  });

  it("should map capitulation sentiment to negative direction", () => {
    const level11 = makeLevel11Output({
      sentiment_state: {
        sentiment_phase: "capitulation",
        positioning: "crowded_short",
        crowdedness: 0.85,
        risk_of_reversal: 0.80,
        phase_description: "Capitulation phase",
        advisory_only: true,
      },
    });
    const packet = buildLevel11SemanticPacket(level11, { entity: "AAPL" });
    const sentimentSignal = packet.signals.find((s) => s.name.includes("sentiment_phase"));
    expect(sentimentSignal?.direction).toBe("negative");
  });

  it("should map early_bull sentiment to positive direction", () => {
    const level11 = makeLevel11Output({
      sentiment_state: {
        sentiment_phase: "early_bull",
        positioning: "neutral",
        crowdedness: 0.30,
        risk_of_reversal: 0.20,
        phase_description: "Early bull phase",
        advisory_only: true,
      },
    });
    const packet = buildLevel11SemanticPacket(level11, { entity: "AAPL" });
    const sentimentSignal = packet.signals.find((s) => s.name.includes("sentiment_phase"));
    expect(sentimentSignal?.direction).toBe("positive");
  });

  it("should put crowdedness in state", () => {
    const packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    expect(packet.state.crowding).toBeCloseTo(0.72, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-04: buildLevel11SemanticPacket — policy_reality optional
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-04: Level11 policy_reality optional handling", () => {
  it("should produce valid packet without policy_reality", () => {
    const level11 = makeLevel11Output({ policy_reality: undefined });
    const packet = buildLevel11SemanticPacket(level11, { entity: "AAPL" });
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(true);
  });

  it("should add policy signal when policy_reality present", () => {
    const level11 = makeLevel11Output({
      policy_reality: {
        policy_intent: "Maintain restrictive monetary policy",
        execution_strength: "strong",
        effective_impact: "Rate suppression of asset multiples",
        reversibility: "policy_pivot_requires_inflation_below_2pct",
        market_pricing: "partially priced",
        implementation_friction: ["fiscal_dominance_pressure"],
        policy_reality_summary: "Strong execution; market partially ahead",
        advisory_only: true,
      },
    });
    const packet = buildLevel11SemanticPacket(level11, { entity: "AAPL" });
    const policySignal = packet.signals.find((s) => s.driver_type === "policy");
    expect(policySignal).toBeDefined();
    expect(policySignal?.name).toContain("policy_");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-05: buildLevel11SemanticPacket — propagation chain → risks
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-05: Level11 propagation chain maps to risks", () => {
  it("should produce risks from propagation chain links", () => {
    const level11 = makeLevel11Output({
      propagation_chain: {
        links: [
          {
            from_asset: "USD",
            to_asset: "AAPL",
            mechanism: "currency headwind on international revenue",
            correlation_strength: 0.65,
            lag_estimate: "short_term",
            advisory_only: true,
          },
        ],
        chain_summary: "USD strength creates revenue headwind",
        advisory_only: true,
      },
    });
    const packet = buildLevel11SemanticPacket(level11, { entity: "AAPL" });
    const propRisk = packet.risks.find((r) => r.name.includes("propagation_"));
    expect(propRisk).toBeDefined();
    expect(propRisk!.severity).toBeGreaterThanOrEqual(0);
    expect(propRisk!.severity).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-06: buildLevel11SemanticPacket — invalidations from scenario_map
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-06: Level11 invalidations from scenario_map", () => {
  it("should include scenario invalidations in packet.invalidations", () => {
    const packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    expect(packet.invalidations.length).toBeGreaterThanOrEqual(1);
  });

  it("should include driver risk_if_wrong conditions", () => {
    const packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    // drivers[0].risk_if_wrong = "services ARPU growth stalls"
    const hasDriverInvalidation = packet.invalidations.some((inv) =>
      inv.includes("ARPU") || inv.includes("arpu") || inv.includes("stalls")
    );
    expect(hasDriverInvalidation).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-07: buildPositionSemanticPacket — valid packet shape
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-07: buildPositionSemanticPacket produces valid packet", () => {
  it("should produce a packet that passes validateSemanticPacket", () => {
    const packet = buildPositionSemanticPacket(
      makePositionOutput(),
      { entity: "AAPL" }
    );
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should have advisory_only=true", () => {
    const packet = buildPositionSemanticPacket(makePositionOutput(), { entity: "AAPL" });
    expect(packet.advisory_only).toBe(true);
  });

  it("should use task=position_integration", () => {
    const packet = buildPositionSemanticPacket(makePositionOutput(), { entity: "AAPL" });
    expect(packet.task).toBe("position_integration");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-08: buildPositionSemanticPacket — no_bet hard restriction → risk
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-08: Position hard no_bet restriction generates risk", () => {
  it("should add hard_no_bet_restriction risk when bet_allowed=false", () => {
    const position = makePositionOutput({
      no_bet_discipline: {
        bet_allowed: false,
        restriction_level: "hard",
        reason: "asymmetry_score below 0.20 — poor risk reward",
        advisory_only: true,
      },
    });
    const packet = buildPositionSemanticPacket(position, { entity: "AAPL" });
    const noBetRisk = packet.risks.find((r) => r.name === "hard_no_bet_restriction");
    expect(noBetRisk).toBeDefined();
    expect(noBetRisk!.severity).toBeGreaterThanOrEqual(0.7);
    expect(noBetRisk!.timing).toBe("near");
  });

  it("should add soft_bet_restriction risk when restriction=soft", () => {
    const position = makePositionOutput({
      no_bet_discipline: {
        bet_allowed: true,
        restriction_level: "soft",
        reason: "elevated gradient risk — reduce size",
        advisory_only: true,
      },
    });
    const packet = buildPositionSemanticPacket(position, { entity: "AAPL" });
    const softRisk = packet.risks.find((r) => r.name === "soft_bet_restriction_active");
    expect(softRisk).toBeDefined();
    expect(softRisk!.severity).toBeCloseTo(0.50, 1);
  });

  it("should have negative direction signal when bet_allowed=false", () => {
    const position = makePositionOutput({
      no_bet_discipline: {
        bet_allowed: false,
        restriction_level: "hard",
        reason: "poor asymmetry",
        advisory_only: true,
      },
    });
    const packet = buildPositionSemanticPacket(position, { entity: "AAPL" });
    const disciplineSignal = packet.signals.find((s) =>
      s.name.includes("no_bet_discipline")
    );
    expect(disciplineSignal?.direction).toBe("negative");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-09: buildPositionSemanticPacket — asymmetry → direction + intensity
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-09: Position asymmetry maps to signals", () => {
  it("should map highly_favorable asymmetry to positive direction", () => {
    const position = makePositionOutput({
      asymmetry: {
        asymmetry_score: 0.85,
        asymmetry_label: "highly_favorable",
        why: "Exceptional moat with massive upside and contained downside",
        advisory_only: true,
      },
    });
    const packet = buildPositionSemanticPacket(position, { entity: "AAPL" });
    const asymSignal = packet.signals.find((s) => s.name.includes("asymmetry_"));
    expect(asymSignal?.direction).toBe("positive");
    expect(asymSignal?.intensity).toBeCloseTo(0.85, 1);
  });

  it("should map poor asymmetry to negative direction", () => {
    const position = makePositionOutput({
      asymmetry: {
        asymmetry_score: 0.18,
        asymmetry_label: "poor",
        why: "Downside risk exceeds upside potential",
        advisory_only: true,
      },
    });
    const packet = buildPositionSemanticPacket(position, { entity: "AAPL" });
    const asymSignal = packet.signals.find((s) => s.name.includes("asymmetry_"));
    expect(asymSignal?.direction).toBe("negative");
    // poor asymmetry should also add poor_asymmetry_risk
    const poorRisk = packet.risks.find((r) => r.name === "poor_asymmetry_risk");
    expect(poorRisk).toBeDefined();
  });

  it("confidence should be lower when bet_allowed=false", () => {
    const allowed = buildPositionSemanticPacket(
      makePositionOutput({ no_bet_discipline: { bet_allowed: true, restriction_level: "none", reason: "ok", advisory_only: true } }),
      { entity: "AAPL", base_confidence: 0.70 }
    );
    const blocked = buildPositionSemanticPacket(
      makePositionOutput({ no_bet_discipline: { bet_allowed: false, restriction_level: "hard", reason: "blocked", advisory_only: true } }),
      { entity: "AAPL", base_confidence: 0.70 }
    );
    expect(allowed.confidence.score).toBeGreaterThan(blocked.confidence.score);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PB-10: both packets compatible with aggregateSemanticPackets
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PB-10: both packets compatible with aggregator", () => {
  it("should aggregate level11 + position packets without error", () => {
    const l11Packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    const posPacket = buildPositionSemanticPacket(makePositionOutput(), { entity: "AAPL" });

    const unified = aggregateSemanticPackets({ packets: [l11Packet, posPacket] });

    expect(unified.protocol_version).toBe("12.2");
    expect(unified.entity).toBe("AAPL");
    expect(unified.packet_count).toBe(2);
    expect(unified.advisory_only).toBe(true);
  });

  it("aggregated state should have dominant_direction", () => {
    const l11Packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    const posPacket = buildPositionSemanticPacket(makePositionOutput(), { entity: "AAPL" });
    const unified = aggregateSemanticPackets({ packets: [l11Packet, posPacket] });

    expect(["positive", "negative", "mixed", "neutral", "unclear"]).toContain(
      unified.dominant_direction
    );
  });

  it("aggregated signals should include both level11 and position signals", () => {
    const l11Packet = buildLevel11SemanticPacket(makeLevel11Output(), { entity: "AAPL" });
    const posPacket = buildPositionSemanticPacket(makePositionOutput(), { entity: "AAPL" });
    const unified = aggregateSemanticPackets({ packets: [l11Packet, posPacket] });

    expect(unified.signals.length).toBeGreaterThanOrEqual(2);
  });
});
