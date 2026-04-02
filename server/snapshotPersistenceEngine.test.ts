/**
 * snapshotPersistenceEngine.test.ts — DanTree Level 21.0-B
 *
 * TC-SPE-01: entity snapshot record creation
 * TC-SPE-02: deterministic snapshot_id derivation / explicit id passthrough
 * TC-SPE-03: null alert_severity handling (G3)
 * TC-SPE-04: null timing_bias handling (G2)
 * TC-SPE-05: null source_health handling
 * TC-SPE-06: advisory_only serialization (G4)
 * TC-SPE-07: first_observation / change marker passthrough
 * TC-SPE-08: state_summary_text truncation
 * TC-SPE-09: invalid entity_key rejection (G5)
 * TC-SPE-10: stable serialization output shape + round-trip
 */

import { describe, it, expect } from "vitest";
import {
  buildEntitySnapshotRecord,
  serializeEntitySnapshotRecord,
  deserializeEntitySnapshotRecord,
  validateEntitySnapshotRecord,
  SnapshotValidationError,
  type EntitySnapshotRecord,
  type SnapshotPersistenceInput,
} from "./snapshotPersistenceEngine";
import type { ThesisTimelineSnapshot } from "./sessionHistoryEngine";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ThesisTimelineSnapshot> = {}): ThesisTimelineSnapshot {
  return {
    entity: "AAPL",
    snapshot_time: "2025-03-30T12:00:00.000Z",
    advisory_only: true,
    thesis_stance: "bullish",
    thesis_change_marker: "stable",
    alert_severity: null,
    timing_bias: "BUY",
    source_health: "healthy",
    state_summary_text: "[AAPL] stance=bullish | marker=stable | bias=BUY. Advisory only.",
    ...overrides,
  };
}

function makeInput(overrides: Partial<SnapshotPersistenceInput> = {}): SnapshotPersistenceInput {
  return {
    snapshot: makeSnapshot(),
    change_marker: "stable",
    ...overrides,
  };
}

function makeValidRecord(overrides: Partial<EntitySnapshotRecord> = {}): EntitySnapshotRecord {
  return {
    snapshot_id: "snap_AAPL_1743336000000",
    entity_key: "AAPL",
    snapshot_time: 1743336000000,
    thesis_stance: "bullish",
    thesis_change_marker: "stable",
    alert_severity: null,
    timing_bias: "BUY",
    source_health: "healthy",
    change_marker: "stable",
    state_summary_text: "[AAPL] stance=bullish. Advisory only.",
    advisory_only: true,
    created_at: Date.now(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-01: entity snapshot record creation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-01: entity snapshot record creation", () => {
  it("creates a record from valid input", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    expect(record).toBeDefined();
    expect(typeof record.snapshot_id).toBe("string");
    expect(record.entity_key).toBe("AAPL");
  });

  it("entity_key is normalized to uppercase", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ entity: "aapl" }),
    }));
    expect(record.entity_key).toBe("AAPL");
  });

  it("entity_key is trimmed", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ entity: "  MSFT  " }),
    }));
    expect(record.entity_key).toBe("MSFT");
  });

  it("snapshot_time is a number (ms)", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    expect(typeof record.snapshot_time).toBe("number");
    expect(record.snapshot_time).toBeGreaterThan(0);
  });

  it("change_marker matches input", () => {
    const record = buildEntitySnapshotRecord(makeInput({ change_marker: "first_observation" }));
    expect(record.change_marker).toBe("first_observation");
  });

  it("thesis_stance carries through from snapshot", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ thesis_stance: "bearish" }),
    }));
    expect(record.thesis_stance).toBe("bearish");
  });

  it("thesis_change_marker carries through from snapshot", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ thesis_change_marker: "weakening" }),
    }));
    expect(record.thesis_change_marker).toBe("weakening");
  });

  it("advisory_only is always true", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    expect(record.advisory_only).toBe(true);
  });

  it("created_at is a positive number", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    expect(typeof record.created_at).toBe("number");
    expect(record.created_at).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-02: deterministic snapshot_id derivation / explicit id passthrough
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-02: snapshot_id derivation and passthrough", () => {
  it("uses explicit snapshot_id when provided", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot_id: "my-custom-id-123",
    }));
    expect(record.snapshot_id).toBe("my-custom-id-123");
  });

  it("derives deterministic snapshot_id when not provided", () => {
    const input = makeInput();
    const r1 = buildEntitySnapshotRecord(input);
    const r2 = buildEntitySnapshotRecord(input);
    expect(r1.snapshot_id).toBe(r2.snapshot_id);
  });

  it("derived snapshot_id includes entity key", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    expect(record.snapshot_id).toContain("AAPL");
  });

  it("derived snapshot_id includes snapshot_time", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    expect(record.snapshot_id).toMatch(/\d{10,}/);
  });

  it("different entities produce different snapshot_ids", () => {
    const r1 = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ entity: "AAPL" }),
    }));
    const r2 = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ entity: "MSFT" }),
    }));
    expect(r1.snapshot_id).not.toBe(r2.snapshot_id);
  });

  it("explicit snapshot_id overrides deterministic derivation", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot_id: "override-id",
    }));
    expect(record.snapshot_id).toBe("override-id");
    expect(record.snapshot_id).not.toContain("AAPL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-03: null alert_severity handling (G3)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-03: null alert_severity handling (G3)", () => {
  it("alert_severity=null is preserved in record", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ alert_severity: null }),
    }));
    expect(record.alert_severity).toBeNull();
  });

  it("alert_severity=null round-trips through serialization", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ alert_severity: null }),
    }));
    const json = serializeEntitySnapshotRecord(record);
    const restored = deserializeEntitySnapshotRecord(json);
    expect(restored.alert_severity).toBeNull();
  });

  it("alert_severity='high' is preserved when set", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ alert_severity: "high" }),
    }));
    expect(record.alert_severity).toBe("high");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-04: null timing_bias handling (G2: field name = timing_bias)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-04: timing_bias field name and null handling (G2)", () => {
  it("field is named timing_bias (not action_bias)", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    expect("timing_bias" in record).toBe(true);
    expect("action_bias" in record).toBe(false);
  });

  it("timing_bias=null is preserved", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ timing_bias: null }),
    }));
    expect(record.timing_bias).toBeNull();
  });

  it("timing_bias='WAIT' is preserved when set", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ timing_bias: "WAIT" }),
    }));
    expect(record.timing_bias).toBe("WAIT");
  });

  it("timing_bias round-trips through serialization", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ timing_bias: "HOLD" }),
    }));
    const restored = deserializeEntitySnapshotRecord(serializeEntitySnapshotRecord(record));
    expect(restored.timing_bias).toBe("HOLD");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-05: null source_health handling
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-05: null source_health handling", () => {
  it("source_health=null is preserved", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ source_health: null }),
    }));
    expect(record.source_health).toBeNull();
  });

  it("source_health='degraded' is preserved", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ source_health: "degraded" }),
    }));
    expect(record.source_health).toBe("degraded");
  });

  it("source_health round-trips through serialization", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ source_health: "unavailable" }),
    }));
    const restored = deserializeEntitySnapshotRecord(serializeEntitySnapshotRecord(record));
    expect(restored.source_health).toBe("unavailable");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-06: advisory_only serialization (G4)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-06: advisory_only serialization (G4)", () => {
  it("advisory_only=true after buildEntitySnapshotRecord", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    expect(record.advisory_only).toBe(true);
  });

  it("advisory_only survives JSON serialization round-trip", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    const json = serializeEntitySnapshotRecord(record);
    const restored = deserializeEntitySnapshotRecord(json);
    expect(restored.advisory_only).toBe(true);
  });

  it("validateEntitySnapshotRecord returns false when advisory_only is not true", () => {
    const record = makeValidRecord({ advisory_only: false as unknown as true });
    expect(validateEntitySnapshotRecord(record)).toBe(false);
  });

  it("deserializeEntitySnapshotRecord throws when advisory_only is not true in JSON", () => {
    const bad = JSON.stringify({ ...makeValidRecord(), advisory_only: false });
    expect(() => deserializeEntitySnapshotRecord(bad)).toThrow(SnapshotValidationError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-07: change marker passthrough
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-07: change marker passthrough", () => {
  it("first_observation marker is preserved", () => {
    const record = buildEntitySnapshotRecord(makeInput({ change_marker: "first_observation" }));
    expect(record.change_marker).toBe("first_observation");
  });

  it("reversal marker is preserved", () => {
    const record = buildEntitySnapshotRecord(makeInput({ change_marker: "reversal" }));
    expect(record.change_marker).toBe("reversal");
  });

  it("all SnapshotChangeMarker values are passthrough-safe", () => {
    const markers = [
      "first_observation", "stable", "strengthening", "weakening", "reversal", "diverging", "unknown",
    ] as const;
    for (const marker of markers) {
      const record = buildEntitySnapshotRecord(makeInput({ change_marker: marker }));
      expect(record.change_marker).toBe(marker);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-08: state_summary_text truncation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-08: state_summary_text truncation", () => {
  it("short text passes through unchanged", () => {
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ state_summary_text: "Short text. Advisory only." }),
    }));
    expect(record.state_summary_text).toBe("Short text. Advisory only.");
  });

  it("text longer than 500 chars is truncated", () => {
    const longText = "X".repeat(600) + " Advisory only.";
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ state_summary_text: longText }),
    }));
    expect(record.state_summary_text.length).toBeLessThanOrEqual(500);
    expect(record.state_summary_text.endsWith("...")).toBe(true);
  });

  it("text exactly 500 chars is not truncated", () => {
    const text500 = "A".repeat(500);
    const record = buildEntitySnapshotRecord(makeInput({
      snapshot: makeSnapshot({ state_summary_text: text500 }),
    }));
    expect(record.state_summary_text.length).toBe(500);
    expect(record.state_summary_text.endsWith("...")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-09: invalid entity_key rejection (G5)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-09: invalid entity_key rejection (G5)", () => {
  it("throws SnapshotValidationError for empty entity string", () => {
    expect(() =>
      buildEntitySnapshotRecord(makeInput({ snapshot: makeSnapshot({ entity: "" }) }))
    ).toThrow(SnapshotValidationError);
  });

  it("throws SnapshotValidationError for whitespace-only entity", () => {
    expect(() =>
      buildEntitySnapshotRecord(makeInput({ snapshot: makeSnapshot({ entity: "   " }) }))
    ).toThrow(SnapshotValidationError);
  });

  it("does not throw for valid entity key", () => {
    expect(() => buildEntitySnapshotRecord(makeInput())).not.toThrow();
  });

  it("validateEntitySnapshotRecord returns false for empty entity_key", () => {
    const record = makeValidRecord({ entity_key: "" });
    expect(validateEntitySnapshotRecord(record)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SPE-10: stable serialization output shape + round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SPE-10: serialization output shape and round-trip", () => {
  it("serialized output is valid JSON string", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    const json = serializeEntitySnapshotRecord(record);
    expect(typeof json).toBe("string");
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("deserialized record matches original record fields", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    const json = serializeEntitySnapshotRecord(record);
    const restored = deserializeEntitySnapshotRecord(json);
    expect(restored.snapshot_id).toBe(record.snapshot_id);
    expect(restored.entity_key).toBe(record.entity_key);
    expect(restored.thesis_stance).toBe(record.thesis_stance);
    expect(restored.change_marker).toBe(record.change_marker);
  });

  it("validateEntitySnapshotRecord returns true for well-formed record", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    expect(validateEntitySnapshotRecord(record)).toBe(true);
  });

  it("validateEntitySnapshotRecord returns false for missing snapshot_id", () => {
    const record = makeValidRecord({ snapshot_id: "" });
    expect(validateEntitySnapshotRecord(record)).toBe(false);
  });

  it("validateEntitySnapshotRecord returns false for snapshot_time=0", () => {
    const record = makeValidRecord({ snapshot_time: 0 });
    expect(validateEntitySnapshotRecord(record)).toBe(false);
  });

  it("deserializeEntitySnapshotRecord throws on invalid JSON", () => {
    expect(() => deserializeEntitySnapshotRecord("not json {{")).toThrow(SnapshotValidationError);
  });

  it("deserializeEntitySnapshotRecord throws on null JSON", () => {
    expect(() => deserializeEntitySnapshotRecord("null")).toThrow(SnapshotValidationError);
  });

  it("all required fields are present in serialized output", () => {
    const record = buildEntitySnapshotRecord(makeInput());
    const parsed = JSON.parse(serializeEntitySnapshotRecord(record));
    const requiredFields = [
      "snapshot_id", "entity_key", "snapshot_time", "thesis_stance",
      "thesis_change_marker", "alert_severity", "timing_bias", "source_health",
      "change_marker", "state_summary_text", "advisory_only", "created_at",
    ];
    for (const field of requiredFields) {
      expect(field in parsed).toBe(true);
    }
  });
});
