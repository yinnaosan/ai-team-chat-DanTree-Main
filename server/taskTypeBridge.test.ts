/**
 * taskTypeBridge.test.ts
 * Unit tests for TaskType Bridge v1
 *
 * TC-BRIDGE-01: business_task_type mapping (9 tests)
 * TC-BRIDGE-02: interaction_mode priority (4 tests)
 * TC-BRIDGE-03: resolveBridgedTaskType compat (3 tests)
 * TC-BRIDGE-04: buildBridgeMetadata (2 tests)
 * TC-BRIDGE-05: invokeLLM pass-through mock (4 tests)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapIntentToModelTaskType,
  resolveBridgedTaskType,
  buildBridgeMetadata,
  type TriggerContext,
} from "./taskTypeBridge";

// ── TC-BRIDGE-01: business_task_type mapping ─────────────────────────────────

describe("TC-BRIDGE-01: mapIntentToModelTaskType — business_task_type mapping", () => {
  it("stock_analysis → research", () => {
    expect(mapIntentToModelTaskType({ business_task_type: "stock_analysis", interaction_mode: "execution" })).toBe("research");
  });

  it("macro_analysis → research", () => {
    expect(mapIntentToModelTaskType({ business_task_type: "macro_analysis", interaction_mode: "execution" })).toBe("research");
  });

  it("crypto_analysis → research", () => {
    expect(mapIntentToModelTaskType({ business_task_type: "crypto_analysis", interaction_mode: "execution" })).toBe("research");
  });

  it("portfolio_review → research", () => {
    expect(mapIntentToModelTaskType({ business_task_type: "portfolio_review", interaction_mode: "execution" })).toBe("research");
  });

  it("event_driven → reasoning", () => {
    expect(mapIntentToModelTaskType({ business_task_type: "event_driven", interaction_mode: "execution" })).toBe("reasoning");
  });

  it("discussion (task_type) → narrative", () => {
    expect(mapIntentToModelTaskType({ business_task_type: "discussion", interaction_mode: "execution" })).toBe("narrative");
  });

  it("general → default", () => {
    expect(mapIntentToModelTaskType({ business_task_type: "general" })).toBe("default");
  });

  it("unknown business_task_type → default", () => {
    expect(mapIntentToModelTaskType({ business_task_type: "unknown_type" })).toBe("default");
  });

  it("undefined business_task_type → default", () => {
    expect(mapIntentToModelTaskType({})).toBe("default");
  });
});

// ── TC-BRIDGE-02: interaction_mode priority ───────────────────────────────────

describe("TC-BRIDGE-02: interaction_mode priority override", () => {
  it("discussion mode overrides stock_analysis → narrative", () => {
    expect(mapIntentToModelTaskType({
      business_task_type: "stock_analysis",
      interaction_mode: "discussion",
    })).toBe("narrative");
  });

  it("discussion mode overrides event_driven → narrative (not reasoning)", () => {
    expect(mapIntentToModelTaskType({
      business_task_type: "event_driven",
      interaction_mode: "discussion",
    })).toBe("narrative");
  });

  it("execution mode does NOT override stock_analysis → research (not execution)", () => {
    // execution in IntentContext means "user wants analysis", NOT model_router TaskType "execution"
    expect(mapIntentToModelTaskType({
      business_task_type: "stock_analysis",
      interaction_mode: "execution",
    })).toBe("research");
  });

  it("no interaction_mode falls through to business_task_type mapping", () => {
    expect(mapIntentToModelTaskType({
      business_task_type: "macro_analysis",
    })).toBe("research");
  });
});

// ── TC-BRIDGE-03: resolveBridgedTaskType backward compat ─────────────────────

describe("TC-BRIDGE-03: resolveBridgedTaskType backward compatibility", () => {
  it("undefined triggerContext → default (backward compat)", () => {
    expect(resolveBridgedTaskType(undefined)).toBe("default");
  });

  it("empty triggerContext → default", () => {
    expect(resolveBridgedTaskType({})).toBe("default");
  });

  it("valid triggerContext → bridged task type", () => {
    expect(resolveBridgedTaskType({
      business_task_type: "stock_analysis",
      interaction_mode: "execution",
    })).toBe("research");
  });
});

// ── TC-BRIDGE-04: buildBridgeMetadata ────────────────────────────────────────

describe("TC-BRIDGE-04: buildBridgeMetadata", () => {
  it("with triggerContext: bridge_applied=true, fields populated", () => {
    const ctx: TriggerContext = {
      business_task_type: "stock_analysis",
      interaction_mode: "execution",
      source: "step3_main",
    };
    const meta = buildBridgeMetadata(ctx, "research");
    expect(meta.bridge_applied).toBe(true);
    expect(meta.resolved_task_type).toBe("research");
    expect(meta.original_business_task_type).toBe("stock_analysis");
    expect(meta.interaction_mode).toBe("execution");
    expect(meta.source).toBe("step3_main");
  });

  it("without triggerContext: bridge_applied=false, nulls", () => {
    const meta = buildBridgeMetadata(undefined, "default");
    expect(meta.bridge_applied).toBe(false);
    expect(meta.resolved_task_type).toBe("default");
    expect(meta.original_business_task_type).toBeNull();
    expect(meta.interaction_mode).toBeNull();
    expect(meta.source).toBeNull();
  });
});

// ── TC-BRIDGE-05: invokeLLM pass-through mock ─────────────────────────────────

describe("TC-BRIDGE-05: invokeLLM triggerContext pass-through (mock)", () => {
  // Mock invokeLLM to capture the params it receives
  const capturedParams: Array<{ triggerContext?: TriggerContext }> = [];

  const mockInvokeLLM = vi.fn(async (params: { triggerContext?: TriggerContext }) => {
    capturedParams.push({ triggerContext: params.triggerContext });
    return {
      id: "mock-id",
      created: 0,
      model: "mock",
      choices: [{ index: 0, message: { role: "assistant" as const, content: "mock" }, finish_reason: "stop" }],
    };
  });

  beforeEach(() => {
    capturedParams.length = 0;
    mockInvokeLLM.mockClear();
  });

  it("triggerContext is preserved when passed to invokeLLM", async () => {
    const ctx: TriggerContext = {
      business_task_type: "stock_analysis",
      interaction_mode: "execution",
      entity_scope: ["AAPL"],
      source: "step3_main",
    };
    await mockInvokeLLM({ triggerContext: ctx });
    expect(capturedParams[0]?.triggerContext).toEqual(ctx);
  });

  it("triggerContext is undefined when not passed (backward compat)", async () => {
    await mockInvokeLLM({});
    expect(capturedParams[0]?.triggerContext).toBeUndefined();
  });

  it("resolveBridgedTaskType correctly maps stock_analysis to research", () => {
    const ctx: TriggerContext = { business_task_type: "stock_analysis", interaction_mode: "execution" };
    const resolved = resolveBridgedTaskType(ctx);
    expect(resolved).toBe("research");
    // Confirms: the task_type passed to modelRouter.generate() would be "research", not "default"
  });

  it("resolveBridgedTaskType returns default when no context (existing call sites unaffected)", () => {
    const resolved = resolveBridgedTaskType(undefined);
    expect(resolved).toBe("default");
    // Confirms: existing call sites that don't pass triggerContext maintain exact behavior
  });
});
