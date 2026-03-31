/**
 * semantic_aggregator.test.ts — DanTree Level 12.2 Aggregation Layer Tests
 *
 * TC-AGG-01: multi-packet aggregation success
 * TC-AGG-02: direct contradiction preserved in conflicts
 * TC-AGG-03: confidence disagreement yields mixed
 * TC-AGG-04: duplicate signal merge works
 * TC-AGG-05: duplicate risk merge works
 * TC-AGG-06: experience semantic output no keyword heuristics
 * TC-AGG-07: unified state remains advisory_only
 * TC-AGG-08: empty / partial packet handling
 * TC-AGG-09: synthesis envelope contract
 */

import { describe, it, expect } from "vitest";
import {
  aggregateSemanticPackets,
  mergeSignals,
  mergeRisks,
  aggregateConfidence,
  resolveStateConflicts,
  buildExperienceSemanticState,
  buildSynthesisSemanticEnvelope,
  type AggregationInput,
  type UnifiedSemanticState,
} from "./semantic_aggregator";
import type { SemanticTransportPacket } from "./semantic_protocol";
import type { ExperienceLayerOutput } from "../experienceLayer";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makePacket(
  agent: string,
  direction: "positive" | "negative" | "mixed" | "neutral",
  confidenceScore: number,
  sourceQuality: "high" | "medium" | "low" | "unverified" = "high",
  overrides: Partial<SemanticTransportPacket> = {}
): SemanticTransportPacket {
  return {
    protocol_version: "12.1",
    advisory_only: true,
    agent,
    task: "risk_assessment",
    entity: "AAPL",
    timeframe: "mid",
    state: {
      asset_type: "equity",
      regime: "risk_on",
      narrative_gap: 0.3,
      crowding: 0.5,
      fragility: 0.4,
      timeframe: "mid",
      direction,
      primary_driver: "earnings_growth",
    },
    signals: [
      {
        name: "revenue_acceleration",
        direction: "positive",
        intensity: 0.72,
        persistence: "building",
        urgency: "medium",
        driver_type: "real",
      },
    ],
    risks: [
      {
        name: "macro_slowdown",
        severity: 0.45,
        timing: "mid",
        containment: "medium",
        trigger: "gdp_contracts_two_quarters",
      },
    ],
    confidence: {
      score: confidenceScore,
      trend: "stable",
      fragility: 0.3,
      source_quality: sourceQuality,
    },
    constraints: ["data_lag_em"],
    invalidations: ["earnings_reverses_yoy"],
    insight_notes: ["real_driver=earnings_momentum"],
    ...overrides,
  };
}

function makeExperienceOutput(
  driftDirection: "strengthening" | "weakening" | "unclear" = "strengthening",
  riskState: "low" | "building" | "elevated" | "critical" = "building"
): ExperienceLayerOutput {
  return {
    ticker: "AAPL",
    drift: {
      drift_direction: driftDirection,
      drift_intensity: 0.45,
      drift_signal: "thesis gaining conviction based on signal alignment",
      confidence_change: 0.05,
      advisory_only: true,
    },
    confidence_update: {
      updated_confidence: 0.72,
      confidence_trend: "rising",
      reason: "Signal fusion improving, BQ remains strong",
      advisory_only: true,
    },
    management_behavior: {
      behavior_pattern: "consistent",
      interpretation: "Management has consistently delivered on guidance",
      risk_implication: "Low management-induced risk; execution track record positive",
      advisory_only: true,
    },
    market_behavior: {
      market_behavior: "accumulation",
      interpretation: "Institutional accumulation pattern detected",
      implication_for_thesis: "Market behavior supports bullish thesis",
      advisory_only: true,
    },
    gradient_risk: {
      risk_state: riskState,
      risk_trend: "stable",
      risk_factors: ["macro_uncertainty"],
      gradient_signal: "Risk building slowly but not yet elevated",
      advisory_only: true,
    },
    experience_insight: {
      overall_conviction: "building",
      key_insight: "Thesis drifting positive; management consistent; accumulation detected",
      watch_points: ["guidance_tone_shift", "margin_compression"],
      advisory_only: true,
    },
    time_context: {
      ticker: "AAPL",
      recorded_at_ms: Date.now(),
      previous_thesis_summary: "Services growth driving margin expansion",
      previous_confidence: 0.67,
      last_drift_state: "strengthening",
    },
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-AGG-01: multi-packet aggregation success
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AGG-01: multi-packet aggregation success", () => {
  it("should produce a UnifiedSemanticState from multiple packets", () => {
    const input: AggregationInput = {
      packets: [
        makePacket("level11_engine", "positive", 0.74),
        makePacket("experience_layer", "positive", 0.69),
        makePacket("position_layer", "positive", 0.71),
      ],
    };
    const result = aggregateSemanticPackets(input);

    expect(result.protocol_version).toBe("12.2");
    expect(result.entity).toBe("AAPL");
    expect(result.packet_count).toBe(3);
    expect(result.source_agents).toHaveLength(3);
    expect(result.advisory_only).toBe(true);
    expect(result.signals).toBeDefined();
    expect(result.risks).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  it("should aggregate dominant_direction as positive when all packets agree", () => {
    const input: AggregationInput = {
      packets: [
        makePacket("agent_a", "positive", 0.75),
        makePacket("agent_b", "positive", 0.70),
      ],
    };
    const result = aggregateSemanticPackets(input);
    expect(result.dominant_direction).toBe("positive");
  });

  it("should merge invalidations from all packets deduped", () => {
    const input: AggregationInput = {
      packets: [
        makePacket("agent_a", "positive", 0.75, "high", {
          invalidations: ["earnings_reverses_yoy", "china_ban_expands"],
        }),
        makePacket("agent_b", "positive", 0.70, "high", {
          invalidations: ["earnings_reverses_yoy", "fed_hike_accelerates"],
        }),
      ],
    };
    const result = aggregateSemanticPackets(input);
    // earnings_reverses_yoy 应去重
    const inv = result.invalidations;
    expect(inv.filter((i) => i === "earnings_reverses_yoy")).toHaveLength(1);
    expect(inv).toContain("china_ban_expands");
    expect(inv).toContain("fed_hike_accelerates");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AGG-02: direct contradiction preserved in conflicts
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AGG-02: direct contradiction preserved in conflicts", () => {
  it("should detect positive vs negative direction contradiction", () => {
    const result = resolveStateConflicts([
      makePacket("bull_agent", "positive", 0.75),
      makePacket("bear_agent", "negative", 0.72),
    ]);
    expect(result.conflicts.length).toBeGreaterThan(0);
    const dirConflict = result.conflicts.find((c) => c.field === "state.direction");
    expect(dirConflict).toBeDefined();
    expect(dirConflict!.summary).toContain("direction_conflict");
  });

  it("should NOT silently collapse contradiction into a single direction", () => {
    const result = resolveStateConflicts([
      makePacket("bull_agent", "positive", 0.75, "high"),
      makePacket("bear_agent", "negative", 0.74, "high"),
    ]);
    // 权重相近时应为 unresolved 或 mixed
    const dirConflict = result.conflicts.find((c) => c.field === "state.direction");
    expect(dirConflict).toBeDefined();
    // dominant_direction 不应是 positive 或 negative（太确定）
    // 因为权重几乎相等
    expect(["mixed", "unclear"]).toContain(result.dominant_direction);
  });

  it("should resolve to dominant direction when one side has higher quality weight", () => {
    const result = resolveStateConflicts([
      makePacket("bull_agent", "positive", 0.80, "high"),
      makePacket("bear_agent", "negative", 0.55, "low"),
      makePacket("bull_agent2", "positive", 0.75, "high"),
    ]);
    // high quality positive × 2 vs low quality negative × 1
    expect(result.dominant_direction).toBe("positive");
  });

  it("conflict entry should include all conflicting agents", () => {
    const result = resolveStateConflicts([
      makePacket("agent_bull", "positive", 0.75),
      makePacket("agent_bear", "negative", 0.70),
    ]);
    const conflict = result.conflicts.find((c) => c.field === "state.direction");
    expect(conflict?.conflicting_values.some((v) => v.agent === "agent_bull")).toBe(true);
    expect(conflict?.conflicting_values.some((v) => v.agent === "agent_bear")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AGG-03: confidence disagreement yields mixed
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AGG-03: confidence disagreement yields mixed trend", () => {
  it("should yield downgraded=true when confidence scores diverge > 0.15", () => {
    const result = aggregateConfidence([
      { confidence: { score: 0.85, trend: "rising", fragility: 0.2, source_quality: "high" }, quality: "high" },
      { confidence: { score: 0.42, trend: "falling", fragility: 0.6, source_quality: "medium" }, quality: "medium" },
    ]);
    expect(result.downgraded).toBe(true);
    expect(result.trend).toBe("mixed");
  });

  it("should add conflict entry for confidence disagreement in aggregateSemanticPackets", () => {
    const input: AggregationInput = {
      packets: [
        makePacket("high_conf_agent", "positive", 0.88, "high"),
        makePacket("low_conf_agent", "positive", 0.35, "medium"),
      ],
    };
    const result = aggregateSemanticPackets(input);
    const confConflict = result.conflicts.find((c) => c.field === "confidence.score");
    expect(confConflict).toBeDefined();
    expect(confConflict!.summary).toContain("confidence_disagreement");
  });

  it("should NOT yield mixed when scores are close", () => {
    const result = aggregateConfidence([
      { confidence: { score: 0.72, trend: "rising", fragility: 0.3, source_quality: "high" }, quality: "high" },
      { confidence: { score: 0.75, trend: "rising", fragility: 0.25, source_quality: "high" }, quality: "high" },
    ]);
    expect(result.downgraded).toBe(false);
    expect(result.trend).toBe("rising");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AGG-04: duplicate signal merge works
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AGG-04: duplicate signal merge", () => {
  it("should merge semantically similar signals with same driver_type", () => {
    const signals = [
      {
        signal: { name: "revenue_acceleration", direction: "positive" as const, intensity: 0.70, persistence: "building" as const, urgency: "medium" as const, driver_type: "real" as const },
        quality: "high" as const,
      },
      {
        signal: { name: "revenue_acceleration", direction: "positive" as const, intensity: 0.80, persistence: "stable" as const, urgency: "high" as const, driver_type: "real" as const },
        quality: "high" as const,
      },
    ];
    const result = mergeSignals(signals);
    // 同名同类型：应合并为 1 个
    expect(result).toHaveLength(1);
    // 加权平均 intensity
    expect(result[0].intensity).toBeCloseTo(0.75, 1);
  });

  it("should preserve distinct signals with different driver_type", () => {
    const signals = [
      {
        signal: { name: "revenue_growth", direction: "positive" as const, intensity: 0.70, persistence: "building" as const, urgency: "medium" as const, driver_type: "real" as const },
        quality: "high" as const,
      },
      {
        signal: { name: "revenue_growth", direction: "positive" as const, intensity: 0.65, persistence: "stable" as const, urgency: "low" as const, driver_type: "narrative" as const },
        quality: "medium" as const,
      },
    ];
    const result = mergeSignals(signals);
    // 不同 driver_type → 保留为 2 个不同信号
    expect(result).toHaveLength(2);
  });

  it("should sort merged signals by intensity descending", () => {
    const signals = [
      {
        signal: { name: "low_signal", direction: "positive" as const, intensity: 0.30, persistence: "stable" as const, urgency: "low" as const, driver_type: "real" as const },
        quality: "high" as const,
      },
      {
        signal: { name: "high_signal", direction: "positive" as const, intensity: 0.85, persistence: "building" as const, urgency: "high" as const, driver_type: "real" as const },
        quality: "high" as const,
      },
    ];
    const result = mergeSignals(signals);
    expect(result[0].intensity).toBeGreaterThan(result[result.length - 1].intensity);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AGG-05: duplicate risk merge works
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AGG-05: duplicate risk merge", () => {
  it("should merge semantically similar risks, keeping max severity", () => {
    const risks = [
      {
        risk: { name: "macro_slowdown", severity: 0.45, timing: "mid" as const, containment: "medium" as const, trigger: "gdp_contracts" },
        quality: "high" as const,
      },
      {
        risk: { name: "macro_slowdown_risk", severity: 0.65, timing: "near" as const, containment: "low" as const, trigger: "recession_confirmed" },
        quality: "high" as const,
      },
    ];
    const result = mergeRisks(risks);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(0.65); // max
    expect(result[0].timing).toBe("near"); // most urgent
    expect(result[0].containment).toBe("low"); // most conservative
  });

  it("should preserve distinct risks with different semantic identity", () => {
    const risks = [
      {
        risk: { name: "macro_recession", severity: 0.55, timing: "mid" as const, containment: "medium" as const, trigger: "gdp_negative" },
        quality: "high" as const,
      },
      {
        risk: { name: "china_regulatory_ban", severity: 0.70, timing: "near" as const, containment: "low" as const, trigger: "government_restriction" },
        quality: "high" as const,
      },
    ];
    const result = mergeRisks(risks);
    expect(result).toHaveLength(2);
  });

  it("should sort merged risks by severity descending", () => {
    const risks = [
      {
        risk: { name: "low_risk", severity: 0.20, timing: "long" as const, containment: "high" as const, trigger: "minor_event" },
        quality: "medium" as const,
      },
      {
        risk: { name: "critical_risk", severity: 0.85, timing: "near" as const, containment: "low" as const, trigger: "major_event" },
        quality: "high" as const,
      },
    ];
    const result = mergeRisks(risks);
    expect(result[0].severity).toBeGreaterThan(result[result.length - 1].severity);
  });

  it("should merge trigger conditions with OR operator", () => {
    const risks = [
      {
        risk: { name: "policy_reversal", severity: 0.60, timing: "near" as const, containment: "low" as const, trigger: "fed_hike_surprise" },
        quality: "high" as const,
      },
      {
        risk: { name: "policy_reversal_risk", severity: 0.55, timing: "mid" as const, containment: "medium" as const, trigger: "cpi_reaccelerates" },
        quality: "high" as const,
      },
    ];
    const result = mergeRisks(risks);
    expect(result[0].trigger).toContain("||");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AGG-06: experience semantic output no keyword heuristics
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AGG-06: buildExperienceSemanticState — machine-native, no keyword bridge", () => {
  it("should produce machine-native drift_signal microphrase", () => {
    const exp = makeExperienceOutput("strengthening", "building");
    const result = buildExperienceSemanticState(exp);

    expect(result.drift_signal).toContain("drift_direction=strengthening");
    expect(result.drift_signal).toContain("drift_intensity=");
    expect(result.drift_signal).toContain("confidence_change=");
    // 不应是自然语言段落
    expect(result.drift_signal.length).toBeLessThan(120);
  });

  it("should produce machine-native management_signal without keyword heuristics", () => {
    const exp = makeExperienceOutput();
    const result = buildExperienceSemanticState(exp);

    expect(result.management_signal).toContain("management_pattern=consistent");
    // 不依赖 keyword bridge，不应有 'keyword' 或 'bridge' 字样
    expect(result.management_signal).not.toContain("keyword");
    expect(result.management_signal).not.toContain("bridge");
  });

  it("should produce machine-native market_signal", () => {
    const exp = makeExperienceOutput();
    const result = buildExperienceSemanticState(exp);

    expect(result.market_signal).toContain("market_behavior=accumulation");
    expect(result.market_signal.length).toBeLessThan(120);
  });

  it("should include risk warning note when gradient_risk is elevated", () => {
    const exp = makeExperienceOutput("weakening", "elevated");
    const result = buildExperienceSemanticState(exp);

    expect(result.insight_notes.some((n) => n.includes("risk_elevated"))).toBe(true);
  });

  it("should include thesis drift warning when weakening intensity > 0.6", () => {
    const exp = makeExperienceOutput("weakening", "critical");
    // Override drift intensity
    exp.drift.drift_intensity = 0.75;
    const result = buildExperienceSemanticState(exp);

    expect(result.insight_notes.some((n) => n.includes("thesis_drift_warning"))).toBe(true);
  });

  it("should return advisory_only=true", () => {
    const exp = makeExperienceOutput();
    const result = buildExperienceSemanticState(exp);
    expect(result.advisory_only).toBe(true);
  });

  it("insight_notes should be an array of strings", () => {
    const exp = makeExperienceOutput();
    const result = buildExperienceSemanticState(exp);
    expect(Array.isArray(result.insight_notes)).toBe(true);
    result.insight_notes.forEach((n) => expect(typeof n).toBe("string"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AGG-07: unified state remains advisory_only
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AGG-07: unified state advisory_only enforcement", () => {
  it("should always have advisory_only=true regardless of input", () => {
    const input: AggregationInput = {
      packets: [
        makePacket("agent_a", "positive", 0.75),
        makePacket("agent_b", "negative", 0.60),
      ],
    };
    const result = aggregateSemanticPackets(input);
    expect(result.advisory_only).toBe(true);
  });

  it("synthesis envelope should have advisory_only=true", () => {
    const input: AggregationInput = {
      packets: [makePacket("agent_a", "positive", 0.75)],
    };
    const unified = aggregateSemanticPackets(input);
    const envelope = buildSynthesisSemanticEnvelope(unified);
    expect(envelope.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AGG-08: empty / partial packet handling
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AGG-08: edge cases", () => {
  it("should throw when packets array is empty", () => {
    expect(() =>
      aggregateSemanticPackets({ packets: [] })
    ).toThrow(/packets array is empty/);
  });

  it("should handle single packet without errors", () => {
    const input: AggregationInput = {
      packets: [makePacket("solo_agent", "positive", 0.72)],
    };
    const result = aggregateSemanticPackets(input);
    expect(result.packet_count).toBe(1);
    expect(result.dominant_direction).toBe("positive");
    expect(result.conflicts).toHaveLength(0);
  });

  it("should handle packets with empty signals/risks arrays", () => {
    const input: AggregationInput = {
      packets: [
        makePacket("agent_a", "positive", 0.70, "high", { signals: [], risks: [] }),
        makePacket("agent_b", "positive", 0.68, "high", { signals: [], risks: [] }),
      ],
    };
    const result = aggregateSemanticPackets(input);
    expect(result.signals).toHaveLength(0);
    expect(result.risks).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AGG-09: synthesis envelope contract
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AGG-09: buildSynthesisSemanticEnvelope contract", () => {
  it("should surface unresolved conflicts in envelope", () => {
    const input: AggregationInput = {
      packets: [
        makePacket("bull", "positive", 0.80, "high"),
        makePacket("bear", "negative", 0.78, "high"),
      ],
    };
    const unified = aggregateSemanticPackets(input);
    const envelope = buildSynthesisSemanticEnvelope(unified);

    expect(envelope.has_conflicts).toBe(true);
    expect(envelope.conflict_count).toBeGreaterThan(0);
  });

  it("should limit top_signals to 3", () => {
    const manySignals = Array.from({ length: 6 }, (_, i) => ({
      name: `signal_${i}`,
      direction: "positive" as const,
      intensity: (6 - i) * 0.1,
      persistence: "stable" as const,
      urgency: "low" as const,
      driver_type: "real" as const,
    }));
    const input: AggregationInput = {
      packets: [makePacket("agent", "positive", 0.72, "high", { signals: manySignals })],
    };
    const unified = aggregateSemanticPackets(input);
    const envelope = buildSynthesisSemanticEnvelope(unified);
    expect(envelope.top_signals.length).toBeLessThanOrEqual(3);
  });

  it("envelope should contain machine-native fields, not natural language", () => {
    const input: AggregationInput = {
      packets: [makePacket("agent", "positive", 0.72)],
    };
    const unified = aggregateSemanticPackets(input);
    const envelope = buildSynthesisSemanticEnvelope(unified);

    // dominant_direction は enum value であること
    expect(["positive", "negative", "mixed", "neutral", "unclear"]).toContain(
      envelope.dominant_direction
    );
    // confidence_score は number であること
    expect(typeof envelope.confidence_score).toBe("number");
  });
});
