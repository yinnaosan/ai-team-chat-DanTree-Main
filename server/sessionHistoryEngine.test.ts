/**
 * sessionHistoryEngine.test.ts — DanTree Level 20.0-B
 *
 * TC-SHE-01: entity snapshot building
 * TC-SHE-02: basket snapshot building
 * TC-SHE-03: no previous snapshot → first_observation
 * TC-SHE-04: thesis change marker derivation
 * TC-SHE-05: alert severity change derivation
 * TC-SHE-06: timing bias change derivation
 * TC-SHE-07: basket change marker derivation
 * TC-SHE-08: null/fallback handling
 * TC-SHE-09: advisory_only always true
 * TC-SHE-10: summary text generation
 */

import { describe, it, expect } from "vitest";
import {
  buildThesisTimelineSnapshot,
  buildBasketTimelineSnapshot,
  buildSessionHistoryResult,
  buildBasketHistoryResult,
  type EntitySnapshotInput,
  type BasketSnapshotInput,
  type ThesisTimelineSnapshot,
  type BasketTimelineSnapshot,
} from "./sessionHistoryEngine";
import type { EntityThesisState, BasketThesisState } from "./thesisStateEngine";
import type { ExecutionTimingResult, BasketTimingResult } from "./executionTimingEngine";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeEntityThesisState(overrides: Partial<EntityThesisState> = {}): EntityThesisState {
  return {
    entity: "AAPL",
    generated_at: new Date().toISOString(),
    advisory_only: true,
    current_stance: "bullish",
    stance_confidence: 0.72,
    evidence_state: "strong",
    evidence_score: 72,
    gate_state: "pass",
    gate_mode: "decisive",
    fragility_state: "low",
    fragility_score: 0.28,
    source_state: "healthy",
    top_source: "yahoo_finance",
    alert_count: 0,
    highest_alert_severity: null,
    thesis_change_marker: "stable",
    state_summary_text: "Test entity summary.",
    ...overrides,
  };
}

function makeBasketThesisState(overrides: Partial<BasketThesisState> = {}): BasketThesisState {
  return {
    entities: ["AAPL", "MSFT", "GOOGL"],
    basket_size: 3,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    dominant_basket_thesis: "aligned_bullish",
    overlap_intensity: "high",
    concentration_state: "safe",
    basket_fragility_state: "low",
    shared_fragility_flag: false,
    basket_change_marker: "stable",
    basket_state_summary_text: "Test basket summary.",
    ...overrides,
  };
}

function makeTimingResult(overrides: Partial<ExecutionTimingResult> = {}): ExecutionTimingResult {
  return {
    entity: "AAPL",
    generated_at: new Date().toISOString(),
    advisory_only: true,
    readiness_state: "ready",
    entry_quality: "high",
    timing_risk: "low",
    confirmation_state: "confirmed",
    action_bias: "BUY",
    no_action_reason: null,
    timing_summary: "Test timing summary. Advisory only.",
    ...overrides,
  };
}

function makeBasketTimingResult(overrides: Partial<BasketTimingResult> = {}): BasketTimingResult {
  return {
    entities: ["AAPL", "MSFT", "GOOGL"],
    generated_at: new Date().toISOString(),
    advisory_only: true,
    entity_results: [],
    basket_readiness: "ready",
    basket_action_bias: "BUY",
    concentration_constraint: null,
    basket_timing_summary: "Test basket timing. Advisory only.",
    ...overrides,
  };
}

function makeEntityInput(overrides: Partial<EntitySnapshotInput> = {}): EntitySnapshotInput {
  return {
    entity: "AAPL",
    thesisState: makeEntityThesisState(),
    timingResult: makeTimingResult(),
    alertSeverity: null,
    ...overrides,
  };
}

function makeBasketInput(overrides: Partial<BasketSnapshotInput> = {}): BasketSnapshotInput {
  return {
    entities: ["AAPL", "MSFT", "GOOGL"],
    basketThesisState: makeBasketThesisState(),
    basketTimingResult: makeBasketTimingResult(),
    basketAlertSeverity: null,
    ...overrides,
  };
}

function makeEntitySnapshot(overrides: Partial<ThesisTimelineSnapshot> = {}): ThesisTimelineSnapshot {
  return buildThesisTimelineSnapshot({ ...makeEntityInput(), ...overrides });
}

function makeBasketSnapshot(overrides: Partial<BasketTimelineSnapshot> = {}): BasketTimelineSnapshot {
  return buildBasketTimelineSnapshot({ ...makeBasketInput(), ...overrides });
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-01: entity snapshot building
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-01: entity snapshot building", () => {
  it("snapshot entity matches input entity", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput({ entity: "TSLA" }));
    expect(snap.entity).toBe("TSLA");
  });

  it("thesis_stance comes from thesisState.current_stance", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ current_stance: "bearish" }),
    }));
    expect(snap.thesis_stance).toBe("bearish");
  });

  it("thesis_change_marker comes from thesisState.thesis_change_marker", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ thesis_change_marker: "weakening" }),
    }));
    expect(snap.thesis_change_marker).toBe("weakening");
  });

  it("timing_bias comes from timingResult.action_bias", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput({
      timingResult: makeTimingResult({ action_bias: "WAIT" }),
    }));
    expect(snap.timing_bias).toBe("WAIT");
  });

  it("source_health comes from thesisState.source_state", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ source_state: "degraded" }),
    }));
    expect(snap.source_health).toBe("degraded");
  });

  it("alert_severity from explicit input takes priority", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput({
      alertSeverity: "high",
      thesisState: makeEntityThesisState({ highest_alert_severity: "low" }),
    }));
    expect(snap.alert_severity).toBe("high");
  });

  it("alert_severity falls back to thesisState.highest_alert_severity", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput({
      alertSeverity: null,
      thesisState: makeEntityThesisState({ highest_alert_severity: "medium" }),
    }));
    expect(snap.alert_severity).toBe("medium");
  });

  it("snapshot_time is an ISO string", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput());
    expect(typeof snap.snapshot_time).toBe("string");
    expect(snap.snapshot_time.length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-02: basket snapshot building
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-02: basket snapshot building", () => {
  it("entities preserved in basket snapshot", () => {
    const snap = buildBasketTimelineSnapshot(makeBasketInput({ entities: ["AAPL", "MSFT"] }));
    expect(snap.entities).toEqual(["AAPL", "MSFT"]);
  });

  it("basket_thesis comes from basketThesisState.dominant_basket_thesis", () => {
    const snap = buildBasketTimelineSnapshot(makeBasketInput({
      basketThesisState: makeBasketThesisState({ dominant_basket_thesis: "aligned_bearish" }),
    }));
    expect(snap.basket_thesis).toBe("aligned_bearish");
  });

  it("basket_timing_bias comes from basketTimingResult.basket_action_bias", () => {
    const snap = buildBasketTimelineSnapshot(makeBasketInput({
      basketTimingResult: makeBasketTimingResult({ basket_action_bias: "WAIT" }),
    }));
    expect(snap.basket_timing_bias).toBe("WAIT");
  });

  it("concentration_state comes from basketThesisState.concentration_state", () => {
    const snap = buildBasketTimelineSnapshot(makeBasketInput({
      basketThesisState: makeBasketThesisState({ concentration_state: "high" }),
    }));
    expect(snap.concentration_state).toBe("high");
  });

  it("basket_alert_severity from explicit input", () => {
    const snap = buildBasketTimelineSnapshot(makeBasketInput({ basketAlertSeverity: "critical" }));
    expect(snap.basket_alert_severity).toBe("critical");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-03: no previous snapshot → first_observation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-03: no previous snapshot → first_observation", () => {
  it("entity history change_marker=first_observation when previous=null", () => {
    const current = buildThesisTimelineSnapshot(makeEntityInput());
    const result = buildSessionHistoryResult(current, null);
    expect(result.change_marker).toBe("first_observation");
  });

  it("basket history change_marker=first_observation when previous=null", () => {
    const current = buildBasketTimelineSnapshot(makeBasketInput());
    const result = buildBasketHistoryResult(current, null);
    expect(result.change_marker).toBe("first_observation");
  });

  it("delta_summary mentions first_observation when no previous", () => {
    const current = buildThesisTimelineSnapshot(makeEntityInput());
    const result = buildSessionHistoryResult(current, null);
    expect(result.delta_summary.toLowerCase()).toContain("first");
  });

  it("previous_snapshot is null when no previous provided", () => {
    const current = buildThesisTimelineSnapshot(makeEntityInput());
    const result = buildSessionHistoryResult(current, null);
    expect(result.previous_snapshot).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-04: thesis change marker derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-04: thesis change marker derivation", () => {
  it("reversal when stance flips bullish → bearish", () => {
    const prev = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ current_stance: "bullish" }),
    }));
    const curr = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ current_stance: "bearish" }),
    }));
    const result = buildSessionHistoryResult(curr, prev);
    expect(result.change_marker).toBe("reversal");
  });

  it("reversal when stance flips bearish → bullish", () => {
    const prev = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ current_stance: "bearish" }),
    }));
    const curr = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ current_stance: "bullish" }),
    }));
    const result = buildSessionHistoryResult(curr, prev);
    expect(result.change_marker).toBe("reversal");
  });

  it("strengthening when thesis_change_marker=strengthening", () => {
    const prev = buildThesisTimelineSnapshot(makeEntityInput());
    const curr = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ thesis_change_marker: "strengthening" }),
    }));
    const result = buildSessionHistoryResult(curr, prev);
    expect(result.change_marker).toBe("strengthening");
  });

  it("weakening when thesis_change_marker=weakening", () => {
    const prev = buildThesisTimelineSnapshot(makeEntityInput());
    const curr = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ thesis_change_marker: "weakening" }),
    }));
    const result = buildSessionHistoryResult(curr, prev);
    expect(result.change_marker).toBe("weakening");
  });

  it("stable when stance and key fields unchanged", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput({
      thesisState: makeEntityThesisState({ thesis_change_marker: "stable" }),
    }));
    // Same snapshot used as both current and previous
    const curr = { ...snap };
    const prev = { ...snap };
    const result = buildSessionHistoryResult(curr, prev);
    expect(result.change_marker).toBe("stable");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-05: alert severity change derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-05: alert severity change derivation", () => {
  it("weakening when alert severity increases", () => {
    const prev = buildThesisTimelineSnapshot(makeEntityInput({ alertSeverity: "low" }));
    const curr = buildThesisTimelineSnapshot(makeEntityInput({ alertSeverity: "high" }));
    const result = buildSessionHistoryResult(curr, prev);
    expect(result.change_marker).toBe("weakening");
  });

  it("strengthening when alert severity decreases", () => {
    const prev = buildThesisTimelineSnapshot(makeEntityInput({ alertSeverity: "high" }));
    const curr = buildThesisTimelineSnapshot(makeEntityInput({ alertSeverity: "low" }));
    const result = buildSessionHistoryResult(curr, prev);
    expect(result.change_marker).toBe("strengthening");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-06: timing bias change derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-06: timing bias change derivation", () => {
  it("weakening when bias shifts from BUY to AVOID", () => {
    const prev = buildThesisTimelineSnapshot(makeEntityInput({
      timingResult: makeTimingResult({ action_bias: "BUY" }),
    }));
    const curr = buildThesisTimelineSnapshot(makeEntityInput({
      timingResult: makeTimingResult({ action_bias: "AVOID" }),
    }));
    const result = buildSessionHistoryResult(curr, prev);
    expect(result.change_marker).toBe("weakening");
  });

  it("strengthening when bias shifts from WAIT to BUY", () => {
    const prev = buildThesisTimelineSnapshot(makeEntityInput({
      timingResult: makeTimingResult({ action_bias: "WAIT" }),
    }));
    const curr = buildThesisTimelineSnapshot(makeEntityInput({
      timingResult: makeTimingResult({ action_bias: "BUY" }),
    }));
    const result = buildSessionHistoryResult(curr, prev);
    expect(result.change_marker).toBe("strengthening");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-07: basket change marker derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-07: basket change marker derivation", () => {
  it("diverging when basket_thesis shifts to divergent", () => {
    const prev = buildBasketTimelineSnapshot(makeBasketInput({
      basketThesisState: makeBasketThesisState({ dominant_basket_thesis: "aligned_bullish" }),
    }));
    const curr = buildBasketTimelineSnapshot(makeBasketInput({
      basketThesisState: makeBasketThesisState({ dominant_basket_thesis: "divergent", basket_change_marker: "diverging" }),
    }));
    const result = buildBasketHistoryResult(curr, prev);
    expect(result.change_marker).toBe("diverging");
  });

  it("weakening when concentration worsens safe → high", () => {
    const prev = buildBasketTimelineSnapshot(makeBasketInput({
      basketThesisState: makeBasketThesisState({ concentration_state: "safe" }),
    }));
    const curr = buildBasketTimelineSnapshot(makeBasketInput({
      basketThesisState: makeBasketThesisState({ concentration_state: "high" }),
    }));
    const result = buildBasketHistoryResult(curr, prev);
    expect(result.change_marker).toBe("weakening");
  });

  it("strengthening when concentration improves critical → safe", () => {
    const prev = buildBasketTimelineSnapshot(makeBasketInput({
      basketThesisState: makeBasketThesisState({ concentration_state: "critical" }),
    }));
    const curr = buildBasketTimelineSnapshot(makeBasketInput({
      basketThesisState: makeBasketThesisState({ concentration_state: "safe" }),
    }));
    const result = buildBasketHistoryResult(curr, prev);
    expect(result.change_marker).toBe("strengthening");
  });

  it("stable when basket state unchanged", () => {
    const snap = buildBasketTimelineSnapshot(makeBasketInput());
    const result = buildBasketHistoryResult({ ...snap }, { ...snap });
    expect(result.change_marker).toBe("stable");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-08: null/fallback handling
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-08: null/fallback handling", () => {
  it("does not throw with all-null entity snapshot inputs", () => {
    expect(() =>
      buildThesisTimelineSnapshot({
        entity: "AAPL",
        thesisState: null,
        timingResult: null,
        alertSeverity: null,
      })
    ).not.toThrow();
  });

  it("does not throw with all-null basket snapshot inputs", () => {
    expect(() =>
      buildBasketTimelineSnapshot({
        entities: ["AAPL", "MSFT"],
        basketThesisState: null,
        basketTimingResult: null,
        basketAlertSeverity: null,
      })
    ).not.toThrow();
  });

  it("thesis_stance=null when thesisState is null", () => {
    const snap = buildThesisTimelineSnapshot({ entity: "AAPL", thesisState: null });
    expect(snap.thesis_stance).toBeNull();
  });

  it("timing_bias=null when timingResult is null", () => {
    const snap = buildThesisTimelineSnapshot({ entity: "AAPL", timingResult: null });
    expect(snap.timing_bias).toBeNull();
  });

  it("basket_thesis=null when basketThesisState is null", () => {
    const snap = buildBasketTimelineSnapshot({ entities: ["AAPL", "MSFT"], basketThesisState: null });
    expect(snap.basket_thesis).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-09: advisory_only always true
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-09: advisory_only always true", () => {
  it("ThesisTimelineSnapshot.advisory_only=true", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput());
    expect(snap.advisory_only).toBe(true);
  });

  it("BasketTimelineSnapshot.advisory_only=true", () => {
    const snap = buildBasketTimelineSnapshot(makeBasketInput());
    expect(snap.advisory_only).toBe(true);
  });

  it("SessionHistoryResult.advisory_only=true", () => {
    const current = buildThesisTimelineSnapshot(makeEntityInput());
    const result = buildSessionHistoryResult(current, null);
    expect(result.advisory_only).toBe(true);
  });

  it("BasketHistoryResult.advisory_only=true", () => {
    const current = buildBasketTimelineSnapshot(makeBasketInput());
    const result = buildBasketHistoryResult(current, null);
    expect(result.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-SHE-10: summary text generation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-SHE-10: summary text generation", () => {
  it("state_summary_text is non-empty string", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput());
    expect(typeof snap.state_summary_text).toBe("string");
    expect(snap.state_summary_text.length).toBeGreaterThan(10);
  });

  it("state_summary_text contains entity name", () => {
    const snap = buildThesisTimelineSnapshot(makeEntityInput({ entity: "NVDA" }));
    expect(snap.state_summary_text).toContain("NVDA");
  });

  it("basket_summary_text is non-empty string", () => {
    const snap = buildBasketTimelineSnapshot(makeBasketInput());
    expect(typeof snap.basket_summary_text).toBe("string");
    expect(snap.basket_summary_text.length).toBeGreaterThan(10);
  });

  it("basket_summary_text contains entity names", () => {
    const snap = buildBasketTimelineSnapshot(makeBasketInput());
    expect(snap.basket_summary_text).toContain("AAPL");
  });

  it("delta_summary contains change_marker", () => {
    const current = buildThesisTimelineSnapshot(makeEntityInput());
    const result = buildSessionHistoryResult(current, null);
    // Engine returns human-readable text for first_observation
    expect(result.delta_summary.toLowerCase()).toContain("first");
  });

  it("delta_summary contains entity name", () => {
    const current = buildThesisTimelineSnapshot(makeEntityInput({ entity: "META" }));
    const result = buildSessionHistoryResult(current, null);
    expect(result.delta_summary).toContain("META");
  });

  it("all summary texts contain advisory disclaimer", () => {
    const entitySnap = buildThesisTimelineSnapshot(makeEntityInput());
    const basketSnap = buildBasketTimelineSnapshot(makeBasketInput());
    const entityResult = buildSessionHistoryResult(entitySnap, null);
    const basketResult = buildBasketHistoryResult(basketSnap, null);

    expect(entitySnap.state_summary_text.toLowerCase()).toContain("advisory");
    expect(basketSnap.basket_summary_text.toLowerCase()).toContain("advisory");
    expect(entityResult.delta_summary.toLowerCase()).toContain("advisory");
    expect(basketResult.delta_summary.toLowerCase()).toContain("advisory");
  });
});
