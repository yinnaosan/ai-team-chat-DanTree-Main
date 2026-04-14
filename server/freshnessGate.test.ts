/**
 * Phase 1B Freshness Gate — Vitest unit tests
 * Tests for applyFreshnessGate() in outputAdapter.ts
 *
 * Scope: pure function tests only (no DB, no network)
 */
import { describe, it, expect } from "vitest";
import { applyFreshnessGate } from "./outputAdapter";
import type { AdapterResult, DecisionSnapshot } from "./outputAdapter";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdapterResult(
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCERTAIN",
  firstArgText: string
): AdapterResult {
  return {
    decision_object: {
      stance: direction,
      confidence: "HIGH",
      confidence_reason: "test reason",
      action_readiness: "CONSIDER",
      key_arguments: [
        { argument: firstArgText, direction: "BULL", strength: "STRONG", source: "LLM" },
        { argument: "second arg", direction: "BEAR", strength: "MEDIUM", source: "LLM" },
      ],
      top_bear_argument: "bear arg",
      invalidation_conditions: [],
      _tier: "FULL_SUCCESS",
      _inferred_fields: [],
      _extraction_log: [],
    },
    snapshot: {
      current_bias: { direction, summary: "test summary", confidence: "HIGH" },
      why: { argument: firstArgText, direction: "BULL" },
      key_risk: { risk: "test risk", source: "BEAR_ARGUMENT" },
      next_step: { action: "test action", type: "RESEARCH" },
      _meta: {
        generated_at: Date.now(),
        based_on_turn: 1,
        stability: "STABLE",
        is_stale: false,
        horizon: "mid-term",
      },
    },
    health: {
      llm_hit_rate: 1.0,
      field_freshness_ratio: 0.8,
      partial_success_streak: 0,
      deferred_queue_depth: 0,
      inference_field_count: 2,
      _tier: "FULL_SUCCESS",
      _turn: 1,
    },
  };
}

function makePrevSnapshot(
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCERTAIN",
  summary = "prev summary"
): DecisionSnapshot {
  return {
    current_bias: { direction, summary, confidence: "MEDIUM" },
    why: { argument: "prev why", direction: "BULL" },
    key_risk: { risk: "prev risk", source: "BEAR_ARGUMENT" },
    next_step: { action: "prev action", type: "WAIT" },
    _meta: {
      generated_at: Date.now() - 60000,
      based_on_turn: 0,
      stability: "STABLE",
      is_stale: false,
      horizon: "mid-term",
    },
  };
}

function makePrevDecisionObject(firstArgText: string) {
  return {
    stance: "BULLISH",
    key_arguments: [
      { argument: firstArgText, direction: "BULL", strength: "STRONG", source: "LLM" },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("applyFreshnessGate — no prev (first turn)", () => {
  it("both fields are FRESH_UPDATE when no previous state", () => {
    const curr = makeAdapterResult("BULLISH", "strong bull arg");
    const result = applyFreshnessGate(curr, null, null);
    expect(result.snapshot._meta.field_freshness?.stance).toBe("FRESH_UPDATE");
    expect(result.snapshot._meta.field_freshness?.key_arguments).toBe("FRESH_UPDATE");
  });

  it("field_freshness is present in _meta", () => {
    const curr = makeAdapterResult("BULLISH", "arg");
    const result = applyFreshnessGate(curr, null, null);
    expect(result.snapshot._meta.field_freshness).toBeDefined();
  });

  it("current_bias is preserved when no prev", () => {
    const curr = makeAdapterResult("BULLISH", "arg");
    const result = applyFreshnessGate(curr, null, null);
    expect(result.snapshot.current_bias.direction).toBe("BULLISH");
  });

  it("key_arguments are preserved when no prev", () => {
    const curr = makeAdapterResult("BULLISH", "my arg");
    const result = applyFreshnessGate(curr, null, null);
    expect(result.decision_object.key_arguments[0].argument).toBe("my arg");
  });
});

describe("applyFreshnessGate — stance freshness", () => {
  it("stance is FRESH_UPDATE when direction changes BULLISH→BEARISH", () => {
    const curr = makeAdapterResult("BEARISH", "new bear arg");
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = makePrevDecisionObject("old bull arg");
    const result = applyFreshnessGate(curr, prev, prevDO);
    expect(result.snapshot._meta.field_freshness?.stance).toBe("FRESH_UPDATE");
    expect(result.snapshot.current_bias.direction).toBe("BEARISH");
  });

  it("stance is REUSE when direction unchanged BULLISH→BULLISH", () => {
    const curr = makeAdapterResult("BULLISH", "new bull arg");
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = makePrevDecisionObject("old bull arg");
    const result = applyFreshnessGate(curr, prev, prevDO);
    expect(result.snapshot._meta.field_freshness?.stance).toBe("REUSE");
  });

  it("REUSE: keeps entire prevSnapshot.current_bias (not just direction)", () => {
    const curr = makeAdapterResult("BULLISH", "new bull arg");
    const prev = makePrevSnapshot("BULLISH", "prev summary text");
    const prevDO = makePrevDecisionObject("old bull arg");
    const result = applyFreshnessGate(curr, prev, prevDO);
    // Should use prev current_bias object (same reference)
    expect(result.snapshot.current_bias).toBe(prev.current_bias);
    expect(result.snapshot.current_bias.summary).toBe("prev summary text");
  });

  it("FRESH_UPDATE: uses current current_bias", () => {
    const curr = makeAdapterResult("BEARISH", "arg");
    const prev = makePrevSnapshot("BULLISH");
    const result = applyFreshnessGate(curr, prev, null);
    expect(result.snapshot.current_bias).toBe(curr.snapshot.current_bias);
  });
});

describe("applyFreshnessGate — key_arguments freshness", () => {
  it("key_arguments is FRESH_UPDATE when first arg text changes", () => {
    const curr = makeAdapterResult("BULLISH", "brand new argument");
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = makePrevDecisionObject("old argument");
    const result = applyFreshnessGate(curr, prev, prevDO);
    expect(result.snapshot._meta.field_freshness?.key_arguments).toBe("FRESH_UPDATE");
    expect(result.decision_object.key_arguments[0].argument).toBe("brand new argument");
  });

  it("key_arguments is REUSE when first arg text is same", () => {
    const sameArg = "same bull argument text";
    const curr = makeAdapterResult("BULLISH", sameArg);
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = makePrevDecisionObject(sameArg);
    const result = applyFreshnessGate(curr, prev, prevDO);
    expect(result.snapshot._meta.field_freshness?.key_arguments).toBe("REUSE");
    expect(result.decision_object.key_arguments[0].argument).toBe(sameArg);
  });

  it("REUSE: keeps entire prev key_arguments array", () => {
    const sameArg = "same arg";
    const curr = makeAdapterResult("BULLISH", sameArg);
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = makePrevDecisionObject(sameArg);
    const result = applyFreshnessGate(curr, prev, prevDO);
    // Should use prev array (length 1, not 2 from curr)
    expect(result.decision_object.key_arguments.length).toBe(1);
  });

  it("key_arguments is FRESH_UPDATE when prevDecisionObject is null", () => {
    const curr = makeAdapterResult("BULLISH", "some arg");
    const prev = makePrevSnapshot("BULLISH");
    const result = applyFreshnessGate(curr, prev, null);
    expect(result.snapshot._meta.field_freshness?.key_arguments).toBe("FRESH_UPDATE");
  });

  it("key_arguments is FRESH_UPDATE when prevDecisionObject has no key_arguments", () => {
    const curr = makeAdapterResult("BULLISH", "some arg");
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = { stance: "BULLISH" }; // no key_arguments
    const result = applyFreshnessGate(curr, prev, prevDO);
    expect(result.snapshot._meta.field_freshness?.key_arguments).toBe("FRESH_UPDATE");
  });
});

describe("applyFreshnessGate — invariants (must not touch)", () => {
  it("is_stale is NOT modified by freshness gate", () => {
    const curr = makeAdapterResult("BULLISH", "arg");
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = makePrevDecisionObject("arg");
    const result = applyFreshnessGate(curr, prev, prevDO);
    expect(result.snapshot._meta.is_stale).toBe(false);
  });

  it("health object is passed through unchanged", () => {
    const curr = makeAdapterResult("BULLISH", "arg");
    const result = applyFreshnessGate(curr, null, null);
    expect(result.health.llm_hit_rate).toBe(1.0);
    expect(result.health._tier).toBe("FULL_SUCCESS");
    expect(result.health).toBe(curr.health);
  });

  it("stability is NOT modified by freshness gate", () => {
    const curr = makeAdapterResult("BULLISH", "arg");
    curr.snapshot._meta.stability = "CHANGED";
    const prev = makePrevSnapshot("BULLISH");
    const result = applyFreshnessGate(curr, prev, null);
    expect(result.snapshot._meta.stability).toBe("CHANGED");
  });

  it("other snapshot fields (why, key_risk, next_step) are not modified", () => {
    const curr = makeAdapterResult("BULLISH", "arg");
    const prev = makePrevSnapshot("BULLISH");
    const result = applyFreshnessGate(curr, prev, null);
    expect(result.snapshot.why).toBe(curr.snapshot.why);
    expect(result.snapshot.key_risk).toBe(curr.snapshot.key_risk);
    expect(result.snapshot.next_step).toBe(curr.snapshot.next_step);
  });
});

describe("applyFreshnessGate — edge cases", () => {
  it("handles empty string arg gracefully (FRESH_UPDATE, not REUSE)", () => {
    const curr = makeAdapterResult("BULLISH", "");
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = makePrevDecisionObject("");
    const result = applyFreshnessGate(curr, prev, prevDO);
    // Both empty → currFirst="" prevFirst="" → condition: currFirst !== "" is false → FRESH_UPDATE
    expect(result.snapshot._meta.field_freshness?.key_arguments).toBe("FRESH_UPDATE");
  });

  it("whitespace-only args are trimmed before comparison", () => {
    const curr = makeAdapterResult("BULLISH", "  same arg  ");
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = makePrevDecisionObject("same arg");
    const result = applyFreshnessGate(curr, prev, prevDO);
    expect(result.snapshot._meta.field_freshness?.key_arguments).toBe("REUSE");
  });
});
