/**
 * semantic_protocol.test.ts — DanTree Level 12.1 Protocol Validator Tests
 *
 * TC-SP-01: valid packet passes validation
 * TC-SP-02: missing required fields fails
 * TC-SP-03: long-form natural language packet fails
 * TC-SP-04: semantic note compression preserves array structure
 * TC-SP-05: risk / signal / confidence objects validate correctly
 * TC-SP-06: buildSemanticPacket enforces schema
 * TC-SP-07: normalizeSemanticPacket sorts by intensity/severity
 * TC-SP-08: protocol examples are all valid
 */

import { describe, it, expect } from "vitest";
import {
  validateSemanticPacket,
  buildSemanticPacket,
  normalizeSemanticPacket,
  compressSemanticNotes,
  TASK_TYPES,
  type SemanticTransportPacket,
} from "./semantic_protocol";
import { PROTOCOL_EXAMPLES } from "./semantic_protocol.examples";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** 构造一个最小合法 packet（用于各 TC 中按需修改） */
function makeValidPacket(): SemanticTransportPacket {
  return {
    protocol_version: "12.1",
    agent: "test_agent",
    task: "risk_assessment",
    entity: "AAPL",
    timeframe: "mid",
    advisory_only: true,
    state: {
      asset_type: "equity",
      regime: "risk_on",
      narrative_gap: 0.3,
      crowding: 0.5,
      fragility: 0.4,
      timeframe: "mid",
      direction: "positive",
      primary_driver: "earnings_growth",
    },
    signals: [
      {
        name: "revenue_growth_acceleration",
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
        trigger: "gdp_contracts_two_consecutive_quarters",
      },
    ],
    confidence: {
      score: 0.70,
      trend: "stable",
      fragility: 0.25,
      source_quality: "high",
    },
    constraints: ["data_lag_in_emerging_market_exposure"],
    invalidations: ["earnings_growth_reverses_yoy"],
    insight_notes: [
      "real_driver=earnings_momentum; narrative_premium=moderate",
      "crowding_moderate && fragility_low",
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-SP-01: valid packet passes validation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SP-01: valid packet passes validation", () => {
  it("should return valid=true for a correctly formed packet", () => {
    const result = validateSemanticPacket(makeValidPacket());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should return valid=true with empty signals and risks arrays", () => {
    const packet = { ...makeValidPacket(), signals: [], risks: [] };
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(true);
  });

  it("should return valid=true with optional fields present", () => {
    const packet = {
      ...makeValidPacket(),
      generated_at: new Date().toISOString(),
      extensions: { custom_flag: true },
    };
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SP-02: missing required fields fails
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SP-02: missing required fields fails", () => {
  it("should fail when protocol_version is missing", () => {
    const packet = { ...makeValidPacket(), protocol_version: undefined } as unknown as SemanticTransportPacket;
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("protocol_version"))).toBe(true);
  });

  it("should fail when agent is missing", () => {
    const packet = { ...makeValidPacket(), agent: "" };
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("agent"))).toBe(true);
  });

  it("should fail when advisory_only is false", () => {
    const packet = { ...makeValidPacket(), advisory_only: false } as unknown as SemanticTransportPacket;
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("advisory_only"))).toBe(true);
  });

  it("should fail when advisory_only is missing", () => {
    const packet = { ...makeValidPacket() };
    delete (packet as any).advisory_only;
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("advisory_only"))).toBe(true);
  });

  it("should fail when entity is missing", () => {
    const packet = { ...makeValidPacket(), entity: "" };
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
  });

  it("should fail when state is missing", () => {
    const packet = { ...makeValidPacket() };
    delete (packet as any).state;
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("state"))).toBe(true);
  });

  it("should fail when state.primary_driver is missing", () => {
    const packet = {
      ...makeValidPacket(),
      state: { ...makeValidPacket().state, primary_driver: "" },
    };
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("primary_driver"))).toBe(true);
  });

  it("should fail when confidence is missing", () => {
    const packet = { ...makeValidPacket() };
    delete (packet as any).confidence;
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("confidence"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SP-03: long-form natural language packet fails
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SP-03: long-form natural language in insight_notes fails", () => {
  it("should fail when insight_note exceeds 120 chars (natural language paragraph)", () => {
    const longNote =
      "The Federal Reserve has been signaling that it will keep interest rates higher for longer due to persistent inflation pressures in the services sector which remains above target.";
    expect(longNote.length).toBeGreaterThan(120);

    const packet = {
      ...makeValidPacket(),
      insight_notes: [longNote],
    };
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("natural language paragraph detected"))).toBe(true);
  });

  it("should fail for long-form constraints", () => {
    const longConstraint =
      "The analysis is constrained by the fact that emerging market data is often delayed by several weeks and does not reflect current conditions in real time.";
    const packet = {
      ...makeValidPacket(),
      constraints: [longConstraint],
    };
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(false);
  });

  it("should pass for valid machine-native semantic microphrases", () => {
    const validNotes = [
      "policy_signal>execution_reality",
      "narrative_strength decoupled_from earnings_followthrough",
      "crowding_high && fragility_rising",
      "real_driver=yield_compression; structural_floor=cb_accumulation",
    ];
    const packet = { ...makeValidPacket(), insight_notes: validNotes };
    const result = validateSemanticPacket(packet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should warn (not fail) for single-label notes", () => {
    const packet = {
      ...makeValidPacket(),
      insight_notes: ["buy"],
    };
    const result = validateSemanticPacket(packet);
    // single label は error ではなく warning
    expect(result.warnings.some((w) => w.includes("single-label detected"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SP-04: semantic note compression preserves array structure
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SP-04: compressSemanticNotes preserves array structure", () => {
  it("should return an array (not a string)", () => {
    const notes = [
      "crowding_high && fragility_rising",
      "policy_signal>execution_reality",
    ];
    const result = compressSemanticNotes(notes);
    expect(Array.isArray(result)).toBe(true);
  });

  it("should deduplicate identical notes", () => {
    const notes = [
      "crowding_high && fragility_rising",
      "crowding_high && fragility_rising",
      "policy_signal>execution_reality",
    ];
    const result = compressSemanticNotes(notes);
    expect(result).toHaveLength(2);
  });

  it("should remove single-label notes", () => {
    const notes = ["buy", "crowding_high && fragility_rising", "ok"];
    const result = compressSemanticNotes(notes);
    expect(result).not.toContain("buy");
    expect(result).not.toContain("ok");
    expect(result).toContain("crowding_high && fragility_rising");
  });

  it("should NOT merge notes into a single string", () => {
    const notes = [
      "real_driver=yield_compression",
      "narrative_premium_low",
      "crowding_moderate",
    ];
    const result = compressSemanticNotes(notes);
    expect(result).toHaveLength(3);
    result.forEach((n) => expect(typeof n).toBe("string"));
  });

  it("should truncate long natural language notes, not drop them entirely", () => {
    const longNote =
      "The Federal Reserve has been signaling that it will keep interest rates higher for longer due to persistent inflation pressures in the services sector.";
    const result = compressSemanticNotes([longNote]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("[compressed:natural_lang_detected]");
    expect(result[0].length).toBeLessThan(longNote.length);
  });

  it("should preserve rich semantic phrases without compression", () => {
    const richNote = "crowding_high && fragility_rising — tail_risk_elevated";
    const result = compressSemanticNotes([richNote]);
    expect(result[0]).toBe(richNote);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SP-05: risk / signal / confidence objects validate correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SP-05: sub-object validation", () => {
  describe("signal validation", () => {
    it("should fail if signal intensity is out of [0,1]", () => {
      const packet = {
        ...makeValidPacket(),
        signals: [{ ...makeValidPacket().signals[0], intensity: 1.5 }],
      };
      const result = validateSemanticPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("intensity"))).toBe(true);
    });

    it("should fail if signal direction is invalid", () => {
      const packet = {
        ...makeValidPacket(),
        signals: [{ ...makeValidPacket().signals[0], direction: "up" as any }],
      };
      const result = validateSemanticPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("direction"))).toBe(true);
    });

    it("should fail if signal driver_type is invalid", () => {
      const packet = {
        ...makeValidPacket(),
        signals: [{ ...makeValidPacket().signals[0], driver_type: "unknown_type" as any }],
      };
      const result = validateSemanticPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("driver_type"))).toBe(true);
    });
  });

  describe("risk validation", () => {
    it("should fail if risk severity is out of [0,1]", () => {
      const packet = {
        ...makeValidPacket(),
        risks: [{ ...makeValidPacket().risks[0], severity: -0.1 }],
      };
      const result = validateSemanticPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("severity"))).toBe(true);
    });

    it("should fail if risk trigger is missing", () => {
      const packet = {
        ...makeValidPacket(),
        risks: [{ ...makeValidPacket().risks[0], trigger: "" }],
      };
      const result = validateSemanticPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("trigger"))).toBe(true);
    });

    it("should fail if risk timing is invalid", () => {
      const packet = {
        ...makeValidPacket(),
        risks: [{ ...makeValidPacket().risks[0], timing: "soon" as any }],
      };
      const result = validateSemanticPacket(packet);
      expect(result.valid).toBe(false);
    });
  });

  describe("confidence validation", () => {
    it("should fail if confidence score is out of [0,1]", () => {
      const packet = {
        ...makeValidPacket(),
        confidence: { ...makeValidPacket().confidence, score: 1.2 },
      };
      const result = validateSemanticPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("score"))).toBe(true);
    });

    it("should fail if confidence trend is invalid", () => {
      const packet = {
        ...makeValidPacket(),
        confidence: { ...makeValidPacket().confidence, trend: "improving" as any },
      };
      const result = validateSemanticPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("trend"))).toBe(true);
    });

    it("should fail if confidence fragility is out of [0,1]", () => {
      const packet = {
        ...makeValidPacket(),
        confidence: { ...makeValidPacket().confidence, fragility: 2.0 },
      };
      const result = validateSemanticPacket(packet);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("fragility"))).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SP-06: buildSemanticPacket enforces schema
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SP-06: buildSemanticPacket enforces schema", () => {
  it("should throw if built packet is invalid", () => {
    expect(() =>
      buildSemanticPacket({
        agent: "",           // invalid: empty
        task: "risk_assessment",
        entity: "TEST",
        timeframe: "mid",
        state: makeValidPacket().state,
        signals: [],
        risks: [],
        confidence: makeValidPacket().confidence,
        constraints: [],
        invalidations: [],
        insight_notes: [],
      })
    ).toThrow(/invalid packet/);
  });

  it("should auto-inject protocol_version=12.1", () => {
    const packet = buildSemanticPacket({
      agent: "test_agent",
      task: "risk_assessment",
      entity: "TEST",
      timeframe: "mid",
      state: makeValidPacket().state,
      signals: [],
      risks: [],
      confidence: makeValidPacket().confidence,
      constraints: [],
      invalidations: [],
      insight_notes: [],
    });
    expect(packet.protocol_version).toBe("12.1");
  });

  it("should auto-inject advisory_only=true", () => {
    const packet = buildSemanticPacket({
      agent: "test_agent",
      task: "risk_assessment",
      entity: "TEST",
      timeframe: "mid",
      state: makeValidPacket().state,
      signals: [],
      risks: [],
      confidence: makeValidPacket().confidence,
      constraints: [],
      invalidations: [],
      insight_notes: [],
    });
    expect(packet.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SP-07: normalizeSemanticPacket sorts correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SP-07: normalizeSemanticPacket", () => {
  it("should sort signals by intensity descending", () => {
    const packet = {
      ...makeValidPacket(),
      signals: [
        { ...makeValidPacket().signals[0], name: "low_signal", intensity: 0.3 },
        { ...makeValidPacket().signals[0], name: "high_signal", intensity: 0.9 },
        { ...makeValidPacket().signals[0], name: "mid_signal", intensity: 0.6 },
      ],
    };
    const normalized = normalizeSemanticPacket(packet);
    expect(normalized.signals[0].name).toBe("high_signal");
    expect(normalized.signals[1].name).toBe("mid_signal");
    expect(normalized.signals[2].name).toBe("low_signal");
  });

  it("should sort risks by severity descending", () => {
    const packet = {
      ...makeValidPacket(),
      risks: [
        { ...makeValidPacket().risks[0], name: "low_risk", severity: 0.2 },
        { ...makeValidPacket().risks[0], name: "critical_risk", severity: 0.85 },
      ],
    };
    const normalized = normalizeSemanticPacket(packet);
    expect(normalized.risks[0].name).toBe("critical_risk");
    expect(normalized.risks[1].name).toBe("low_risk");
  });

  it("should always set advisory_only=true even if input had false", () => {
    const packet = { ...makeValidPacket(), advisory_only: false } as unknown as SemanticTransportPacket;
    const normalized = normalizeSemanticPacket(packet);
    expect(normalized.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SP-08: all protocol examples are valid
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SP-08: all PROTOCOL_EXAMPLES pass validation", () => {
  it("equity_business example should be valid", () => {
    const result = validateSemanticPacket(PROTOCOL_EXAMPLES.equity_business);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("macro_commodity example should be valid", () => {
    const result = validateSemanticPacket(PROTOCOL_EXAMPLES.macro_commodity);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("policy_reality example should be valid", () => {
    const result = validateSemanticPacket(PROTOCOL_EXAMPLES.policy_reality);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("market_structure example should be valid", () => {
    const result = validateSemanticPacket(PROTOCOL_EXAMPLES.market_structure);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("all examples should have advisory_only=true", () => {
    for (const [key, example] of Object.entries(PROTOCOL_EXAMPLES)) {
      expect(example.advisory_only).toBe(true);
    }
  });

  it("all examples should have protocol_version=12.1", () => {
    for (const [key, example] of Object.entries(PROTOCOL_EXAMPLES)) {
      expect(example.protocol_version).toBe("12.1");
    }
  });
});
