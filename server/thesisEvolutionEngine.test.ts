/**
 * thesisEvolutionEngine.test.ts
 * DANTREE_THESIS_STATE_TRACKING_C1 — Move C1B
 *
 * 29 deterministic test cases covering all scoring rules.
 * No DB, no network, no LLM — pure function tests only.
 */

import { describe, it, expect } from "vitest";
import { computeThesisEvolution } from "./thesisEvolutionEngine";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GATE_PASS = { verdict: "PASS" };
const GATE_FULL_PASS = { verdict: "FULL_PASS" };
const GATE_HARD_FAIL = { verdict: "HARD_FAIL" };
const GATE_SOFT_FAIL = { verdict: "SOFT_FAIL" };

function makeDecision(stance: string, confidence: string, qvlBucket?: string) {
  return {
    stance,
    confidence,
    qvl: qvlBucket ? { size_bucket: qvlBucket } : undefined,
  };
}

// ── Group A — INSUFFICIENT_DATA conditions (6 cases) ─────────────────────────

describe("Group A — INSUFFICIENT_DATA conditions", () => {
  it("A1: no prevDecisionObject (null) → INSUFFICIENT_DATA", () => {
    const result = computeThesisEvolution(null, makeDecision("BULLISH", "HIGH"), GATE_PASS);
    expect(result.signal_strength).toBe("INSUFFICIENT_DATA");
    expect(result.noise_indicator).toBe(true);
    expect(result.advisory_only).toBe(true);
  });

  it("A2: no prevDecisionObject (undefined) → INSUFFICIENT_DATA", () => {
    const result = computeThesisEvolution(undefined, makeDecision("BULLISH", "HIGH"), GATE_PASS);
    expect(result.signal_strength).toBe("INSUFFICIENT_DATA");
    expect(result.noise_indicator).toBe(true);
  });

  it("A3: SA gate HARD_FAIL → INSUFFICIENT_DATA", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BEARISH", "LOW"),
      GATE_HARD_FAIL
    );
    expect(result.signal_strength).toBe("INSUFFICIENT_DATA");
    expect(result.noise_indicator).toBe(true);
  });

  it("A4: SA gate absent (null) → INSUFFICIENT_DATA", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BULLISH", "HIGH"),
      null
    );
    expect(result.signal_strength).toBe("INSUFFICIENT_DATA");
    expect(result.noise_indicator).toBe(true);
  });

  it("A5: SA gate absent (undefined) → INSUFFICIENT_DATA", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BULLISH", "HIGH"),
      undefined
    );
    expect(result.signal_strength).toBe("INSUFFICIENT_DATA");
  });

  it("A6: stance reversal with HARD_FAIL gate → INSUFFICIENT_DATA (not STRONG)", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BEARISH", "LOW"),
      GATE_HARD_FAIL
    );
    expect(result.signal_strength).toBe("INSUFFICIENT_DATA");
  });
});

// ── Group B — WEAK signal (4 cases) ──────────────────────────────────────────

describe("Group B — WEAK signal", () => {
  it("B1: stance unchanged, confidence unchanged, no QVL change → WEAK", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BULLISH", "HIGH"),
      GATE_PASS
    );
    expect(result.signal_strength).toBe("WEAK");
    expect(result.noise_indicator).toBe(true);
    expect(result.confidence_delta).toBe(0);
  });

  it("B2: WEAK → noise_indicator true", () => {
    const result = computeThesisEvolution(
      makeDecision("BEARISH", "MEDIUM"),
      makeDecision("BEARISH", "MEDIUM"),
      GATE_FULL_PASS
    );
    expect(result.signal_strength).toBe("WEAK");
    expect(result.noise_indicator).toBe(true);
  });

  it("B3: WEAK with SOFT_FAIL gate → WEAK (SOFT_FAIL does not trigger INSUFFICIENT_DATA)", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "LOW"),
      makeDecision("BULLISH", "LOW"),
      GATE_SOFT_FAIL
    );
    expect(result.signal_strength).toBe("WEAK");
    expect(result.noise_indicator).toBe(true);
  });

  it("B4: advisory_only is always true", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BULLISH", "HIGH"),
      GATE_PASS
    );
    expect(result.advisory_only).toBe(true);
  });
});

// ── Group C — MODERATE signal (7 cases) ──────────────────────────────────────

describe("Group C — MODERATE signal", () => {
  it("C1: confidence 1-step up (LOW→MEDIUM) → MODERATE", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "LOW"),
      makeDecision("BULLISH", "MEDIUM"),
      GATE_PASS
    );
    expect(result.signal_strength).toBe("MODERATE");
    expect(result.noise_indicator).toBe(false);
    expect(result.confidence_delta).toBe(1);
  });

  it("C2: confidence 1-step down (HIGH→MEDIUM) → MODERATE", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BULLISH", "MEDIUM"),
      GATE_PASS
    );
    expect(result.signal_strength).toBe("MODERATE");
    expect(result.confidence_delta).toBe(-1);
  });

  it("C3: QVL bucket changed, stance/confidence unchanged → MODERATE", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH", "small"),
      makeDecision("BULLISH", "HIGH", "medium"),
      GATE_PASS
    );
    expect(result.signal_strength).toBe("MODERATE");
  });

  it("C4: QVL bucket changed via qvlSizeBucket param → MODERATE", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH", "small"),
      makeDecision("BULLISH", "HIGH"),
      GATE_PASS,
      "large"
    );
    expect(result.signal_strength).toBe("MODERATE");
  });

  it("C5: 2-step confidence move with SOFT_FAIL gate → MODERATE (not STRONG)", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "LOW"),
      makeDecision("BULLISH", "HIGH"),
      GATE_SOFT_FAIL
    );
    expect(result.signal_strength).toBe("MODERATE");
    expect(result.confidence_delta).toBe(2);
  });

  it("C6: QVL reinforces at most MODERATE — cannot trigger STRONG alone", () => {
    // QVL changed but stance/confidence unchanged — should be MODERATE not STRONG
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH", "none"),
      makeDecision("BULLISH", "HIGH", "large"),
      GATE_FULL_PASS
    );
    expect(result.signal_strength).toBe("MODERATE");
  });

  it("C7: confidence 1-step up with FULL_PASS gate → MODERATE (not STRONG)", () => {
    // 1-step confidence shift never reaches STRONG regardless of gate
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "MEDIUM"),
      makeDecision("BULLISH", "HIGH"),
      GATE_FULL_PASS
    );
    expect(result.signal_strength).toBe("MODERATE");
  });
});

// ── Group D — STRONG signal (6 cases) ────────────────────────────────────────

describe("Group D — STRONG signal", () => {
  it("D1: stance reversal BULLISH→BEARISH with PASS gate → STRONG", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BEARISH", "LOW"),
      GATE_PASS
    );
    expect(result.signal_strength).toBe("STRONG");
    expect(result.noise_indicator).toBe(false);
    expect(result.inflection_evidence).toContain("stance: BULLISH→BEARISH");
  });

  it("D2: stance reversal with FULL_PASS gate → STRONG", () => {
    const result = computeThesisEvolution(
      makeDecision("BEARISH", "LOW"),
      makeDecision("BULLISH", "HIGH"),
      GATE_FULL_PASS
    );
    expect(result.signal_strength).toBe("STRONG");
  });

  it("D3: 2-step confidence move (LOW→HIGH) with PASS gate → STRONG", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "LOW"),
      makeDecision("BULLISH", "HIGH"),
      GATE_PASS
    );
    expect(result.signal_strength).toBe("STRONG");
    expect(result.confidence_delta).toBe(2);
  });

  it("D4: 2-step confidence move (HIGH→LOW) with FULL_PASS gate → STRONG", () => {
    const result = computeThesisEvolution(
      makeDecision("BEARISH", "HIGH"),
      makeDecision("BEARISH", "LOW"),
      GATE_FULL_PASS
    );
    expect(result.signal_strength).toBe("STRONG");
    expect(result.confidence_delta).toBe(-2);
  });

  it("D5: STRONG → noise_indicator false", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "LOW"),
      makeDecision("BULLISH", "HIGH"),
      GATE_PASS
    );
    expect(result.noise_indicator).toBe(false);
  });

  it("D6: stance reversal with SOFT_FAIL gate → INSUFFICIENT_DATA (not STRONG)", () => {
    // Conservative gate: STRONG requires PASS/FULL_PASS; SOFT_FAIL is not PASS
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BEARISH", "LOW"),
      GATE_SOFT_FAIL
    );
    expect(result.signal_strength).toBe("INSUFFICIENT_DATA");
  });
});

// ── Group E — confidence_delta mapping (4 cases) ─────────────────────────────

describe("Group E — confidence_delta mapping", () => {
  it("E1: same level HIGH→HIGH → delta 0", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BULLISH", "HIGH"),
      GATE_PASS
    );
    expect(result.confidence_delta).toBe(0);
  });

  it("E2: one step down HIGH→MEDIUM → delta -1", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BULLISH", "MEDIUM"),
      GATE_PASS
    );
    expect(result.confidence_delta).toBe(-1);
  });

  it("E3: two steps down HIGH→LOW → delta -2", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BULLISH", "LOW"),
      GATE_PASS
    );
    expect(result.confidence_delta).toBe(-2);
  });

  it("E4: two steps up LOW→HIGH → delta +2", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "LOW"),
      makeDecision("BULLISH", "HIGH"),
      GATE_PASS
    );
    expect(result.confidence_delta).toBe(2);
  });
});

// ── Group F — inflection_evidence (2 cases) ───────────────────────────────────

describe("Group F — inflection_evidence (server-only, not rendered in UI)", () => {
  it("F1: stance change recorded in inflection_evidence", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "HIGH"),
      makeDecision("BEARISH", "HIGH"),
      GATE_PASS
    );
    expect(result.inflection_evidence.some(e => e.includes("stance:"))).toBe(true);
  });

  it("F2: confidence change recorded in inflection_evidence", () => {
    const result = computeThesisEvolution(
      makeDecision("BULLISH", "LOW"),
      makeDecision("BULLISH", "HIGH"),
      GATE_PASS
    );
    expect(result.inflection_evidence.some(e => e.includes("confidence:"))).toBe(true);
  });
});
