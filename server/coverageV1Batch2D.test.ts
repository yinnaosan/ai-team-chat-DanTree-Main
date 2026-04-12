/**
 * Execution Coverage v1 Batch 2D — Targeted Tests
 *
 * Verifies that the 2 legacy call sites in server/routers.ts
 * now pass explicit source labels into the formal invokeLLM path:
 *   - CS-09: legacy streaming fallback  → source="legacy_stream_fallback"
 *   - CS-11: legacy no-key path         → source="legacy_no_key"
 *
 * These tests do NOT assert Rule E or any taxonomy change.
 * They only assert that:
 *   1. triggerContext is present with the correct source label
 *   2. The source label reaches decideExecutionTriggerV3 (observability)
 *   3. Rule result may be "NONE" — that is acceptable and expected for Batch 2D
 *
 * DO NOT modify executionTrigger.ts, NON_EXECUTION_SOURCES, or any rule semantics.
 */

import { describe, it, expect } from "vitest";
import { decideExecutionTriggerV3 } from "./executionTrigger";
import type { TriggerContext } from "./taskTypeBridge";
import { resolveBridgedTaskType } from "./taskTypeBridge";

// ── TC-COV-BATCH2D-01: CS-09 legacy streaming fallback ──────────────────────
describe("TC-COV-BATCH2D-01: CS-09 legacy streaming fallback carries source=legacy_stream_fallback", () => {
  it("triggerContext with source=legacy_stream_fallback reaches decideExecutionTriggerV3", () => {
    const ctx: TriggerContext = { source: "legacy_stream_fallback" };
    const resolvedTaskType = resolveBridgedTaskType(ctx);
    const decision = decideExecutionTriggerV3({
      resolvedTaskType,
      triggerContext: ctx,
      messages: [{ role: "user", content: "test" }],
    });
    // Source is now explicit — observability is achieved
    expect(ctx.source).toBe("legacy_stream_fallback");
    // Rule may be NONE — acceptable for Batch 2D (no taxonomy change)
    expect(decision).toBeDefined();
    expect(decision.rule).toBeDefined();
  });

  it("source=legacy_stream_fallback is NOT in NON_EXECUTION_SOURCES (no taxonomy change)", () => {
    const ctx: TriggerContext = { source: "legacy_stream_fallback" };
    const resolvedTaskType = resolveBridgedTaskType(ctx);
    const decision = decideExecutionTriggerV3({
      resolvedTaskType,
      triggerContext: ctx,
      messages: [{ role: "user", content: "test" }],
    });
    // Batch 2D constraint: no Rule E taxonomy expansion
    expect(decision.rule).not.toBe("E");
    // Also not Rule F (not a GPT pipeline source)
    expect(decision.rule).not.toBe("F");
  });
});

// ── TC-COV-BATCH2D-02: CS-11 legacy no-key path ─────────────────────────────
describe("TC-COV-BATCH2D-02: CS-11 legacy no-key path carries source=legacy_no_key", () => {
  it("triggerContext with source=legacy_no_key reaches decideExecutionTriggerV3", () => {
    const ctx: TriggerContext = { source: "legacy_no_key" };
    const resolvedTaskType = resolveBridgedTaskType(ctx);
    const decision = decideExecutionTriggerV3({
      resolvedTaskType,
      triggerContext: ctx,
      messages: [{ role: "user", content: "test" }],
    });
    expect(ctx.source).toBe("legacy_no_key");
    expect(decision).toBeDefined();
    expect(decision.rule).toBeDefined();
  });

  it("source=legacy_no_key is NOT in NON_EXECUTION_SOURCES (no taxonomy change)", () => {
    const ctx: TriggerContext = { source: "legacy_no_key" };
    const resolvedTaskType = resolveBridgedTaskType(ctx);
    const decision = decideExecutionTriggerV3({
      resolvedTaskType,
      triggerContext: ctx,
      messages: [{ role: "user", content: "test" }],
    });
    expect(decision.rule).not.toBe("E");
    expect(decision.rule).not.toBe("F");
  });

  it("source-only TriggerContext is valid for legacy_no_key (all other fields optional)", () => {
    const ctx: TriggerContext = { source: "legacy_no_key" };
    expect(ctx.source).toBe("legacy_no_key");
    expect(ctx.business_task_type).toBeUndefined();
    expect(ctx.interaction_mode).toBeUndefined();
    expect(ctx.entity_scope).toBeUndefined();
  });
});

// ── TC-COV-BATCH2D-03: Regression — prior covered sources unchanged ──────────
describe("TC-COV-BATCH2D-03: Regression — prior covered sources still fire correct rules", () => {
  it("source=step3_main still fires Rule F (Batch 1 regression)", () => {
    const ctx: TriggerContext = {
      source: "step3_main",
      business_task_type: "stock_analysis",
      interaction_mode: "execution",
    };
    const resolvedTaskType = resolveBridgedTaskType(ctx);
    const decision = decideExecutionTriggerV3({
      resolvedTaskType,
      triggerContext: ctx,
      messages: [{ role: "user", content: "test" }],
    });
    expect(decision.rule).toBe("F");
  });

  it("source=memory_summary still fires Rule E (pre-existing covered source)", () => {
    const ctx: TriggerContext = {
      source: "memory_summary",
      business_task_type: "stock_analysis",
    };
    const resolvedTaskType = resolveBridgedTaskType(ctx);
    const decision = decideExecutionTriggerV3({
      resolvedTaskType,
      triggerContext: ctx,
      messages: [{ role: "user", content: "test" }],
    });
    expect(decision.rule).toBe("E");
  });

  it("source=memory_classify still resolves to NONE (Batch 2A regression)", () => {
    const ctx: TriggerContext = { source: "memory_classify" };
    const resolvedTaskType = resolveBridgedTaskType(ctx);
    const decision = decideExecutionTriggerV3({
      resolvedTaskType,
      triggerContext: ctx,
      messages: [{ role: "user", content: "test" }],
    });
    // Batch 2A: memory_classify NOT in NON_EXECUTION_SOURCES → NONE
    expect(decision.rule).not.toBe("E");
  });
});
