/**
 * Phase 1B Freshness Gate — Vitest unit tests
 * Tests for applyFreshnessGate() in outputAdapter.ts
 *
 * Scope: pure function tests only (no DB, no network)
 */
import { describe, it, expect } from "vitest";
import { applyFreshnessGate, extractDecisionObject } from "./outputAdapter";
import type { AdapterResult, DecisionSnapshot } from "./outputAdapter";
import type { FinalOutputSchema } from "./outputSchemaValidator";

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

  it("REUSE: gate writes signal only — current_bias NOT overwritten by gate (executor's job)", () => {
    // Updated for Phase 1B executor split:
    // gate = signal layer only, does NOT overwrite current_bias
    const curr = makeAdapterResult("BULLISH", "new bull arg");
    const prev = makePrevSnapshot("BULLISH", "prev summary text");
    const prevDO = makePrevDecisionObject("old bull arg");
    const result = applyFreshnessGate(curr, prev, prevDO);
    // Gate must write REUSE signal
    expect(result.snapshot._meta.field_freshness?.stance).toBe("REUSE");
    // Gate must NOT overwrite current_bias (value passthrough)
    expect(result.snapshot.current_bias).toBe(curr.snapshot.current_bias);
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

  it("REUSE: gate writes signal only — key_arguments NOT overwritten by gate (executor's job)", () => {
    // Updated for Phase 1B executor split:
    // gate = signal layer only, does NOT overwrite key_arguments
    const sameArg = "same arg";
    const curr = makeAdapterResult("BULLISH", sameArg);
    const prev = makePrevSnapshot("BULLISH");
    const prevDO = makePrevDecisionObject(sameArg);
    const result = applyFreshnessGate(curr, prev, prevDO);
    // Gate must write REUSE signal
    expect(result.snapshot._meta.field_freshness?.key_arguments).toBe("REUSE");
    // Gate must NOT overwrite key_arguments (value passthrough — curr has 2 args)
    expect(result.decision_object.key_arguments.length).toBe(2);
    expect(result.decision_object.key_arguments[0].argument).toBe(sameArg);
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

// ── Phase 1B Stance Freshness Upgrade — deriveSnapshot() stability tests ──────
// Tests via extractDecisionObject() since deriveSnapshot() is not exported.
// Note: inferStance() always returns source="INFERRED", so confidence HIGH is
// capped to MEDIUM by applyInferenceCap(). Use medium/low to test confidence change.

function makeDeliverable(
  confidence: "high" | "medium" | "low",
  verdict: string,
  bullCase: string[],
  bearCase: string[] = [],
  reasoningFirst?: string
): FinalOutputSchema {
  return {
    verdict,
    confidence,
    bull_case: bullCase,
    bear_case: bearCase,
    risks: [],
    next_steps: [],
    reasoning: reasoningFirst ? [reasoningFirst] : [],
    horizon: "mid-term",
    degraded: false,
  } as unknown as FinalOutputSchema;
}

function makePrevSnapshotForStability(
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCERTAIN",
  confidence: "HIGH" | "MEDIUM" | "LOW",
  summary: string,
  whyArgument: string
): DecisionSnapshot {
  return {
    current_bias: { direction, summary, confidence },
    why: { argument: whyArgument, direction: "BULL" },
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

describe("deriveSnapshot() stability — Phase 1B Stance Freshness Upgrade", () => {
  it("REVERSED: direction change (NEUTRAL → BULLISH)", () => {
    // prev: NEUTRAL; curr deliverable: bullish verdict
    const prevSnap = makePrevSnapshotForStability("NEUTRAL", "MEDIUM", "prev summary", "prev why");
    const deliverable = makeDeliverable("medium", "看多，买入", ["strong bull arg"], [], "bull reason");
    const result = extractDecisionObject(deliverable, prevSnap, 2);
    expect(result).not.toBeNull();
    expect(result!.snapshot._meta.stability).toBe("REVERSED");
  });

  it("CHANGED: same direction, confidence changed (MEDIUM → LOW)", () => {
    // prev: NEUTRAL MEDIUM; curr: NEUTRAL LOW (verdict neutral, confidence low)
    const prevSnap = makePrevSnapshotForStability("NEUTRAL", "MEDIUM", "prev summary", "prev why");
    // neutral verdict, low confidence → same direction NEUTRAL, confidence LOW
    const deliverable = makeDeliverable("low", "中性，观望", ["bull arg"], ["bear arg"], "low reason");
    const result = extractDecisionObject(deliverable, prevSnap, 2);
    expect(result).not.toBeNull();
    // confidence: prev=MEDIUM, curr=LOW → CHANGED
    expect(result!.snapshot._meta.stability).toBe("CHANGED");
  });

  it("CHANGED: same direction + same confidence, summary text changed", () => {
    // prev: NEUTRAL MEDIUM, summary = first 30 chars of "prev reasoning text"
    const prevReason = "prev reasoning text that is long";
    const prevSummary = prevReason.slice(0, 30);
    const prevSnap = makePrevSnapshotForStability("NEUTRAL", "MEDIUM", prevSummary, "prev why");
    // curr: NEUTRAL MEDIUM, different reasoning → different summary
    const deliverable = makeDeliverable("medium", "中性，观望", ["bull arg"], ["bear arg"], "completely different reasoning");
    const result = extractDecisionObject(deliverable, prevSnap, 2);
    expect(result).not.toBeNull();
    expect(result!.snapshot._meta.stability).toBe("CHANGED");
  });

  it("STABLE: same direction + same confidence + same summary + same why", () => {
    // Construct prev to exactly match what extractDecisionObject would produce
    // verdict: "中性，观望" → NEUTRAL (INFERRED), confidence: "medium" → MEDIUM (no cap since stance INFERRED but confidence not HIGH)
    // reasoning[0] → confidenceReason → summary = first 30 chars
    // bull_case[0] → bestBull (why.argument)
    const reason = "stable reasoning for test case";
    const bullArg = "stable bull argument text";
    const prevSummary = reason.slice(0, 30);
    const prevSnap = makePrevSnapshotForStability("NEUTRAL", "MEDIUM", prevSummary, bullArg);
    const deliverable = makeDeliverable("medium", "中性，观望", [bullArg], ["bear arg"], reason);
    const result = extractDecisionObject(deliverable, prevSnap, 2);
    expect(result).not.toBeNull();
    expect(result!.snapshot._meta.stability).toBe("STABLE");
  });

  it("no previous snapshot → stability defaults to STABLE", () => {
    const deliverable = makeDeliverable("medium", "看多，买入", ["bull arg"], [], "reason");
    const result = extractDecisionObject(deliverable, null, 1);
    expect(result).not.toBeNull();
    expect(result!.snapshot._meta.stability).toBe("STABLE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1B — Minimal UpdatePlanExecutor tests
// ═══════════════════════════════════════════════════════════════════════════════
import { buildUpdatePlan, executeUpdatePlan } from "./outputAdapter";
import type { UpdatePlan } from "./outputAdapter";

// ── buildUpdatePlan tests ─────────────────────────────────────────────────────

describe("buildUpdatePlan", () => {
  const prevSnap = makePrevSnapshot("BULLISH", "prev summary");

  it("FALLBACK tier → both modules PRESERVE regardless of freshness", () => {
    const plan = buildUpdatePlan("FALLBACK", { stance: "FRESH_UPDATE", key_arguments: "FRESH_UPDATE" }, prevSnap);
    expect(plan.stance_summary).toBe("PRESERVE");
    expect(plan.key_arguments).toBe("PRESERVE");
  });

  it("FALLBACK tier with no prev → still PRESERVE (FALLBACK always preserves)", () => {
    const plan = buildUpdatePlan("FALLBACK", undefined, null);
    expect(plan.stance_summary).toBe("PRESERVE");
    expect(plan.key_arguments).toBe("PRESERVE");
  });

  it("FULL_SUCCESS + FRESH_UPDATE → both modules OVERWRITE", () => {
    const plan = buildUpdatePlan("FULL_SUCCESS", { stance: "FRESH_UPDATE", key_arguments: "FRESH_UPDATE" }, prevSnap);
    expect(plan.stance_summary).toBe("OVERWRITE");
    expect(plan.key_arguments).toBe("OVERWRITE");
  });

  it("FULL_SUCCESS + REUSE → both modules PRESERVE", () => {
    const plan = buildUpdatePlan("FULL_SUCCESS", { stance: "REUSE", key_arguments: "REUSE" }, prevSnap);
    expect(plan.stance_summary).toBe("PRESERVE");
    expect(plan.key_arguments).toBe("PRESERVE");
  });

  it("FULL_SUCCESS + mixed freshness → per-module decision", () => {
    const plan = buildUpdatePlan("FULL_SUCCESS", { stance: "REUSE", key_arguments: "FRESH_UPDATE" }, prevSnap);
    expect(plan.stance_summary).toBe("PRESERVE");
    expect(plan.key_arguments).toBe("OVERWRITE");
  });

  it("FULL_SUCCESS + no prev → both OVERWRITE (no previous state to preserve)", () => {
    const plan = buildUpdatePlan("FULL_SUCCESS", { stance: "REUSE", key_arguments: "REUSE" }, null);
    expect(plan.stance_summary).toBe("OVERWRITE");
    expect(plan.key_arguments).toBe("OVERWRITE");
  });

  it("FULL_SUCCESS + missing field_freshness → safe default OVERWRITE", () => {
    const plan = buildUpdatePlan("FULL_SUCCESS", undefined, prevSnap);
    expect(plan.stance_summary).toBe("OVERWRITE");
    expect(plan.key_arguments).toBe("OVERWRITE");
  });

  it("PARTIAL_SUCCESS + REUSE → PRESERVE", () => {
    const plan = buildUpdatePlan("PARTIAL_SUCCESS", { stance: "REUSE", key_arguments: "REUSE" }, prevSnap);
    expect(plan.stance_summary).toBe("PRESERVE");
    expect(plan.key_arguments).toBe("PRESERVE");
  });
});

// ── executeUpdatePlan tests ───────────────────────────────────────────────────

describe("executeUpdatePlan", () => {
  const prevSnap = makePrevSnapshot("BULLISH", "prev summary");
  const prevDecisionObject = {
    stance: "BULLISH",
    confidence: "HIGH",
    confidence_reason: "prev reason",
    action_readiness: "CONSIDER",
    key_arguments: [
      { argument: "prev arg 1", direction: "BULL", strength: "STRONG", source: "LLM" },
    ],
    top_bear_argument: "prev bear",
    invalidation_conditions: [],
    _tier: "FULL_SUCCESS",
  };

  it("OVERWRITE: current values are written through unchanged", () => {
    const current = makeAdapterResult("BEARISH", "new arg");
    // Inject field_freshness = FRESH_UPDATE
    current.snapshot._meta = { ...current.snapshot._meta, field_freshness: { stance: "FRESH_UPDATE", key_arguments: "FRESH_UPDATE" } };
    const result = executeUpdatePlan(current, prevSnap, prevDecisionObject);
    expect(result.snapshot.current_bias.direction).toBe("BEARISH");
    expect(result.decision_object.key_arguments[0].argument).toBe("new arg");
  });

  it("PRESERVE stance: current_bias replaced with prevSnapshot.current_bias", () => {
    const current = makeAdapterResult("BULLISH", "new arg");
    // Same direction → REUSE → PRESERVE
    current.snapshot._meta = { ...current.snapshot._meta, field_freshness: { stance: "REUSE", key_arguments: "FRESH_UPDATE" } };
    const result = executeUpdatePlan(current, prevSnap, prevDecisionObject);
    // current_bias should be prevSnap.current_bias
    expect(result.snapshot.current_bias).toBe(prevSnap.current_bias);
    // key_arguments should be current (FRESH_UPDATE)
    expect(result.decision_object.key_arguments[0].argument).toBe("new arg");
  });

  it("PRESERVE key_arguments: key_arguments replaced with prev array", () => {
    const current = makeAdapterResult("BEARISH", "new arg");
    current.snapshot._meta = { ...current.snapshot._meta, field_freshness: { stance: "FRESH_UPDATE", key_arguments: "REUSE" } };
    const result = executeUpdatePlan(current, prevSnap, prevDecisionObject);
    // current_bias should be current (FRESH_UPDATE)
    expect(result.snapshot.current_bias.direction).toBe("BEARISH");
    // key_arguments should be prev
    expect(result.decision_object.key_arguments[0].argument).toBe("prev arg 1");
  });

  it("PRESERVE key_arguments with empty prev → falls through to current (no null-out)", () => {
    const current = makeAdapterResult("BEARISH", "new arg");
    current.snapshot._meta = { ...current.snapshot._meta, field_freshness: { stance: "FRESH_UPDATE", key_arguments: "REUSE" } };
    // prevDecisionObject has empty key_arguments
    const emptyPrevDO = { ...prevDecisionObject, key_arguments: [] };
    const result = executeUpdatePlan(current, prevSnap, emptyPrevDO);
    // Should fall through to current value, not null out
    expect(result.decision_object.key_arguments[0].argument).toBe("new arg");
  });

  it("does NOT modify _tier, stability, is_stale, w1Health", () => {
    const current = makeAdapterResult("BULLISH", "arg");
    current.snapshot._meta = { ...current.snapshot._meta, field_freshness: { stance: "REUSE", key_arguments: "REUSE" } };
    const result = executeUpdatePlan(current, prevSnap, prevDecisionObject);
    // _tier unchanged
    expect(result.decision_object._tier).toBe("FULL_SUCCESS");
    // stability unchanged (from current snapshot._meta)
    expect(result.snapshot._meta.stability).toBe(current.snapshot._meta.stability);
    // is_stale unchanged
    expect(result.snapshot._meta.is_stale).toBe(current.snapshot._meta.is_stale);
    // health unchanged
    expect(result.health).toBe(current.health);
  });

  it("no prevSnapshot → both OVERWRITE (no prev to preserve)", () => {
    const current = makeAdapterResult("BEARISH", "new arg");
    current.snapshot._meta = { ...current.snapshot._meta, field_freshness: { stance: "REUSE", key_arguments: "REUSE" } };
    const result = executeUpdatePlan(current, null, null);
    // No prev → OVERWRITE → current values pass through
    expect(result.snapshot.current_bias.direction).toBe("BEARISH");
    expect(result.decision_object.key_arguments[0].argument).toBe("new arg");
  });
});
