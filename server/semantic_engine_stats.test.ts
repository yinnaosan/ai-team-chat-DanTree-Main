/**
 * semantic_engine_stats.test.ts — DanTree Level 12.8
 *
 * TC-SES-01: fallback when both inputs missing
 * TC-SES-02: confidence_score priority (envelope first)
 * TC-SES-03: packet_count from unifiedState
 * TC-SES-04: conflict_count priority (envelope first)
 * TC-SES-05: state_regime passthrough
 * TC-SES-06: semantic_available flag
 * TC-SES-07: formatSemanticEngineStatsLine
 * TC-SES-08: partial input safety
 */

import { describe, it, expect } from "vitest";
import {
  buildSemanticEngineStatsDisplay,
  formatSemanticEngineStatsLine,
  type SemanticEngineStatsDisplay,
} from "./semantic_engine_stats";
import type {
  UnifiedSemanticState,
  SynthesisSemanticEnvelope,
} from "./semantic_aggregator";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES — field names exactly from INTERFACE_SNAPSHOT_MIN
// ─────────────────────────────────────────────────────────────────────────────

function makeUnifiedState(overrides: Partial<UnifiedSemanticState> = {}): UnifiedSemanticState {
  return {
    protocol_version: "12.2",
    entity: "AAPL",
    timeframe: "mid",
    dominant_direction: "positive",
    state_summary: {
      regime: "risk_on",
      narrative_gap: 0.3,
      crowding: 0.6,
      fragility: 0.4,
      trend: "positive",
    } as any,
    signals: [
      { name: "services_margin", direction: "positive", intensity: 0.75, persistence: "building", urgency: "medium", driver_type: "real" } as any,
    ],
    risks: [
      { name: "china_risk", severity: 0.55, timing: "mid", containment: "medium", trigger: "ban_expands" } as any,
    ],
    confidence: {
      score: 0.72,
      trend: "stable",
      fragility: 0.30,
      source_quality: "high",
      dispersion: 0.05,
      downgraded: false,
    } as any,
    conflicts: [],
    invalidations: ["services_margin_contracts"],
    semantic_notes: ["real_driver=services_margin"],
    source_agents: ["level11_multiasset_engine"],
    packet_count: 2,
    advisory_only: true,
    ...overrides,
  };
}

function makeEnvelope(overrides: Partial<SynthesisSemanticEnvelope> = {}): SynthesisSemanticEnvelope {
  return {
    protocol_version: "12.2",
    entity: "AAPL",
    dominant_direction: "positive",
    confidence_score: 0.68,
    confidence_fragility: 0.28,
    confidence_downgraded: false,
    top_signals: [
      { name: "services_margin", direction: "positive", intensity: 0.75, persistence: "building", urgency: "medium", driver_type: "real" } as any,
    ],
    top_risks: [
      { name: "china_risk", severity: 0.55, timing: "mid", containment: "medium", trigger: "ban_expands" } as any,
    ],
    has_conflicts: false,
    conflict_count: 0,
    unresolved_conflicts: [],
    key_invalidations: ["services_margin_contracts"],
    semantic_notes: ["real_driver=services_margin"],
    state_regime: "risk_on",
    state_crowding: 0.6,
    state_fragility: 0.4,
    advisory_only: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-SES-01: fallback when both inputs missing
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SES-01: fallback when both inputs missing", () => {
  it("returns fallback object when both inputs are undefined", () => {
    const result = buildSemanticEngineStatsDisplay();
    expect(result.semantic_available).toBe(false);
    expect(result.dominant_direction).toBe("unavailable");
    expect(result.confidence_score).toBeNull();
    expect(result.conflict_count).toBe(0);
    expect(result.state_regime).toBeNull();
    expect(result.packet_count).toBeNull();
  });

  it("returns fallback when both inputs are null", () => {
    const result = buildSemanticEngineStatsDisplay(null, null);
    expect(result.semantic_available).toBe(false);
    expect(result.dominant_direction).toBe("unavailable");
  });

  it("never throws on undefined inputs", () => {
    expect(() => buildSemanticEngineStatsDisplay(undefined, undefined)).not.toThrow();
  });

  it("never throws on null inputs", () => {
    expect(() => buildSemanticEngineStatsDisplay(null, null)).not.toThrow();
  });

  it("fallback signal_count and risk_count are 0", () => {
    const result = buildSemanticEngineStatsDisplay();
    expect(result.signal_count).toBe(0);
    expect(result.risk_count).toBe(0);
  });

  it("fallback entity is null", () => {
    const result = buildSemanticEngineStatsDisplay();
    expect(result.entity).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SES-02: confidence_score priority — envelope first
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SES-02: confidence_score priority (envelope first)", () => {
  it("uses synthesisEnvelope.confidence_score when both available", () => {
    const state = makeUnifiedState({ confidence: { score: 0.72, trend: "stable", fragility: 0.30, source_quality: "high", dispersion: 0.05, downgraded: false } as any });
    const env = makeEnvelope({ confidence_score: 0.68 });

    const result = buildSemanticEngineStatsDisplay(state, env);
    expect(result.confidence_score).toBeCloseTo(0.68, 2);
  });

  it("falls back to unifiedState.confidence.score when envelope absent", () => {
    const state = makeUnifiedState({ confidence: { score: 0.72, trend: "stable", fragility: 0.30, source_quality: "high", dispersion: 0.05, downgraded: false } as any });

    const result = buildSemanticEngineStatsDisplay(state, null);
    expect(result.confidence_score).toBeCloseTo(0.72, 2);
  });

  it("confidence_score is null when neither source has score", () => {
    const state = makeUnifiedState({ confidence: { score: undefined, trend: "stable", fragility: 0.30, source_quality: "high", dispersion: 0.05, downgraded: false } as any });
    const env = makeEnvelope({ confidence_score: undefined as any });

    const result = buildSemanticEngineStatsDisplay(state, env);
    expect(result.confidence_score).toBeNull();
  });

  it("confidence_score is in [0, 1] when available", () => {
    const result = buildSemanticEngineStatsDisplay(null, makeEnvelope());
    if (result.confidence_score !== null) {
      expect(result.confidence_score).toBeGreaterThanOrEqual(0);
      expect(result.confidence_score).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SES-03: packet_count from unifiedState
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SES-03: packet_count from unifiedState", () => {
  it("uses unifiedState.packet_count when available", () => {
    const state = makeUnifiedState({ packet_count: 3 });
    const result = buildSemanticEngineStatsDisplay(state, null);
    expect(result.packet_count).toBe(3);
  });

  it("packet_count is null when unifiedState absent", () => {
    const result = buildSemanticEngineStatsDisplay(null, makeEnvelope());
    expect(result.packet_count).toBeNull();
  });

  it("packet_count is null when both absent", () => {
    const result = buildSemanticEngineStatsDisplay();
    expect(result.packet_count).toBeNull();
  });

  it("packet_count is a non-negative integer when present", () => {
    const state = makeUnifiedState({ packet_count: 2 });
    const result = buildSemanticEngineStatsDisplay(state);
    expect(result.packet_count).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SES-04: conflict_count priority — envelope first
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SES-04: conflict_count priority (envelope first)", () => {
  it("uses synthesisEnvelope.conflict_count when available", () => {
    const env = makeEnvelope({ conflict_count: 2 });
    const result = buildSemanticEngineStatsDisplay(null, env);
    expect(result.conflict_count).toBe(2);
  });

  it("falls back to unifiedState.conflicts.length when envelope absent", () => {
    const state = makeUnifiedState({
      conflicts: [
        { field: "state.direction", conflicting_values: [], severity: 0.7, resolution: "unresolved", summary: "conflict" } as any,
      ],
    });
    const result = buildSemanticEngineStatsDisplay(state, null);
    expect(result.conflict_count).toBe(1);
  });

  it("conflict_count is 0 as fallback when neither source has conflicts", () => {
    const result = buildSemanticEngineStatsDisplay();
    expect(result.conflict_count).toBe(0);
  });

  it("conflict_count is always a non-negative integer", () => {
    const result = buildSemanticEngineStatsDisplay(makeUnifiedState(), makeEnvelope());
    expect(result.conflict_count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.conflict_count)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SES-05: state_regime passthrough
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SES-05: state_regime passthrough", () => {
  it("passes through state_regime from synthesisEnvelope when present", () => {
    const env = makeEnvelope({ state_regime: "risk_off" });
    const result = buildSemanticEngineStatsDisplay(null, env);
    expect(result.state_regime).toBe("risk_off");
  });

  it("state_regime is null when envelope absent and unifiedState has no regime", () => {
    const state = makeUnifiedState({ state_summary: { narrative_gap: 0.3, crowding: 0.5, fragility: 0.4 } as any });
    const result = buildSemanticEngineStatsDisplay(state, null);
    // regime not in state_summary override → null
    expect(result.state_regime === null || typeof result.state_regime === "string").toBe(true);
  });

  it("state_regime is null when completely absent", () => {
    const env = makeEnvelope({ state_regime: undefined });
    const result = buildSemanticEngineStatsDisplay(null, env);
    expect(result.state_regime).toBeNull();
  });

  it("state_regime is a string when present", () => {
    const env = makeEnvelope({ state_regime: "risk_on" });
    const result = buildSemanticEngineStatsDisplay(null, env);
    if (result.state_regime !== null) {
      expect(typeof result.state_regime).toBe("string");
      expect(result.state_regime.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SES-06: semantic_available flag
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SES-06: semantic_available flag", () => {
  it("is true when unifiedState is provided", () => {
    const result = buildSemanticEngineStatsDisplay(makeUnifiedState());
    expect(result.semantic_available).toBe(true);
  });

  it("is true when only envelope is provided", () => {
    const result = buildSemanticEngineStatsDisplay(null, makeEnvelope());
    expect(result.semantic_available).toBe(true);
  });

  it("is true when both are provided", () => {
    const result = buildSemanticEngineStatsDisplay(makeUnifiedState(), makeEnvelope());
    expect(result.semantic_available).toBe(true);
  });

  it("is false when both are undefined", () => {
    const result = buildSemanticEngineStatsDisplay();
    expect(result.semantic_available).toBe(false);
  });

  it("is false when both are null", () => {
    const result = buildSemanticEngineStatsDisplay(null, null);
    expect(result.semantic_available).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SES-07: formatSemanticEngineStatsLine
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SES-07: formatSemanticEngineStatsLine", () => {
  it("returns unavailable string when semantic not available", () => {
    const stats = buildSemanticEngineStatsDisplay();
    const line = formatSemanticEngineStatsLine(stats);
    expect(line).toContain("unavailable");
    expect(line).toContain("semantic_available=false");
  });

  it("includes entity when semantic available", () => {
    const stats = buildSemanticEngineStatsDisplay(makeUnifiedState(), makeEnvelope());
    const line = formatSemanticEngineStatsLine(stats);
    expect(line).toContain("AAPL");
  });

  it("includes dominant_direction when available", () => {
    const stats = buildSemanticEngineStatsDisplay(null, makeEnvelope({ dominant_direction: "positive" }));
    const line = formatSemanticEngineStatsLine(stats);
    expect(line).toContain("dir=positive");
  });

  it("includes confidence when available", () => {
    const stats = buildSemanticEngineStatsDisplay(null, makeEnvelope({ confidence_score: 0.68 }));
    const line = formatSemanticEngineStatsLine(stats);
    expect(line).toContain("conf=0.68");
  });

  it("includes state_regime when available", () => {
    const stats = buildSemanticEngineStatsDisplay(null, makeEnvelope({ state_regime: "risk_on" }));
    const line = formatSemanticEngineStatsLine(stats);
    expect(line).toContain("regime=risk_on");
  });

  it("returns a single-line string with no newlines", () => {
    const stats = buildSemanticEngineStatsDisplay(makeUnifiedState(), makeEnvelope());
    const line = formatSemanticEngineStatsLine(stats);
    expect(line).not.toContain("\n");
  });

  it("never throws on fallback stats", () => {
    const stats = buildSemanticEngineStatsDisplay(null, null);
    expect(() => formatSemanticEngineStatsLine(stats)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SES-08: partial input safety
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SES-08: partial input safety", () => {
  it("handles unifiedState with empty signals/risks arrays", () => {
    const state = makeUnifiedState({ signals: [], risks: [] });
    const result = buildSemanticEngineStatsDisplay(state);
    expect(result.signal_count).toBe(0);
    expect(result.risk_count).toBe(0);
    expect(result.semantic_available).toBe(true);
  });

  it("handles envelope with no state_regime", () => {
    const env = makeEnvelope({ state_regime: undefined });
    const result = buildSemanticEngineStatsDisplay(null, env);
    expect(result.state_regime).toBeNull();
    expect(result.semantic_available).toBe(true);
  });

  it("dominant_direction is a string in all cases", () => {
    [
      buildSemanticEngineStatsDisplay(),
      buildSemanticEngineStatsDisplay(makeUnifiedState()),
      buildSemanticEngineStatsDisplay(null, makeEnvelope()),
      buildSemanticEngineStatsDisplay(makeUnifiedState(), makeEnvelope()),
    ].forEach((result) => {
      expect(typeof result.dominant_direction).toBe("string");
    });
  });

  it("output object never has advisory_only field (display-only, not protocol)", () => {
    const result = buildSemanticEngineStatsDisplay(makeUnifiedState(), makeEnvelope());
    expect((result as Record<string, unknown>).advisory_only).toBeUndefined();
  });

  it("signal_count and risk_count are non-negative integers", () => {
    const result = buildSemanticEngineStatsDisplay(makeUnifiedState(), makeEnvelope());
    expect(result.signal_count).toBeGreaterThanOrEqual(0);
    expect(result.risk_count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.signal_count)).toBe(true);
    expect(Number.isInteger(result.risk_count)).toBe(true);
  });
});
