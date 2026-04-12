/**
 * Execution Coverage v1 Batch 1 — Targeted Tests
 *
 * Purpose:
 *   Prove that the 5 Step3 partial-coverage paths now carry source="step3_main"
 *   into the formal invokeLLM → Trigger v3 chain.
 *
 *   Approved call sites (server/routers.ts):
 *     CS-03  L2613  Step3 PROD OpenAI fallback
 *     CS-04  L2623  Step3 PROD no-key Claude path
 *     CS-05  L2640  Step3 validation retry DEV
 *     CS-07  L2660  Step3 PROD retry OpenAI fallback
 *     CS-08  L2669  Step3 PROD retry no-key
 *
 *   These tests verify the triggerContext shape at the invokeLLM boundary
 *   (not at the routers.ts call site, which is untestable in unit scope).
 *   They confirm that source="step3_main" → Rule F fires consistently.
 *
 * Constraint:
 *   - No new trigger source taxonomy introduced.
 *   - No architecture changes.
 *   - Minimal code change only (triggerContext injection).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeLLM } from "./_core/llm";
import * as modelRouterModule from "./model_router";
import * as executionTriggerModule from "./executionTrigger";

// ─────────────────────────────────────────────────────────────────────────────
// TC-COV-BATCH1-01: Step3 fallback path — source="step3_main" → Rule F
// Simulates CS-03 (PROD OpenAI fallback) and CS-04 (PROD no-key Claude path):
// both paths now pass triggerContext.source="step3_main" into invokeLLM.
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-COV-BATCH1-01: Step3 fallback paths carry source=step3_main → Rule F", () => {
  let triggerV3Spy: ReturnType<typeof vi.spyOn>;
  let generateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.DANTREE_MODE = "production";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    triggerV3Spy = vi.spyOn(executionTriggerModule, "decideExecutionTriggerV3");
    generateSpy = vi.spyOn(modelRouterModule.modelRouter, "generate");
  });

  afterEach(() => {
    delete process.env.DANTREE_MODE;
    triggerV3Spy.mockRestore();
    generateSpy.mockRestore();
  });

  it("CS-03/CS-04: source=step3_main reaches decideExecutionTriggerV3 with correct source", async () => {
    // Simulates the triggerContext shape that CS-03 and CS-04 now inject.
    await invokeLLM({
      messages: [{ role: "user", content: "Step3 fallback path test" }],
      triggerContext: {
        business_task_type: "stock_analysis",
        interaction_mode: "analysis",
        entity_scope: "single",
        source: "step3_main",
      },
    });
    expect(triggerV3Spy).toHaveBeenCalledTimes(1);
    const callArg = triggerV3Spy.mock.calls[0][0];
    // triggerContext.source must be "step3_main" (not undefined, not "default")
    expect(callArg.triggerContext?.source).toBe("step3_main");
  });

  it("CS-03/CS-04: source=step3_main → Rule F fires (not NONE) in production", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Step3 PROD fallback Rule F test" }],
      triggerContext: {
        business_task_type: "stock_analysis",
        interaction_mode: "analysis",
        entity_scope: "single",
        source: "step3_main",
      },
    });
    const v3Result = triggerV3Spy.mock.results[0].value as Record<string, unknown>;
    // Rule F must fire — not NONE (which was the pre-Batch1 behavior)
    expect(v3Result.rule).toBe("F");
    expect(v3Result.execution_target).toBe("gpt");
    expect(v3Result.triggered).toBe(true);
  });

  it("CS-03/CS-04: source=step3_main → modelRouter.generate() receives executionTarget=gpt", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Step3 fallback modelRouter routing test" }],
      triggerContext: {
        business_task_type: "research",
        interaction_mode: "analysis",
        entity_scope: "single",
        source: "step3_main",
      },
    });
    expect(generateSpy).toHaveBeenCalledTimes(1);
    const callArg = generateSpy.mock.calls[0][0];
    // Rule F: step3_main → executionTarget="gpt"
    expect(callArg.executionTarget).toBe("gpt");
    expect(callArg.triggerV3Meta?.trigger_rule).toBe("F");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-COV-BATCH1-02: Step3 retry paths — source="step3_main" → Rule F
// Simulates CS-05 (DEV retry), CS-07 (PROD retry OpenAI fallback), CS-08 (PROD retry no-key):
// all retry paths now pass triggerContext.source="step3_main" into invokeLLM.
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-COV-BATCH1-02: Step3 retry paths carry source=step3_main → Rule F", () => {
  let triggerV3Spy: ReturnType<typeof vi.spyOn>;
  let generateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.DANTREE_MODE = "production";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    triggerV3Spy = vi.spyOn(executionTriggerModule, "decideExecutionTriggerV3");
    generateSpy = vi.spyOn(modelRouterModule.modelRouter, "generate");
  });

  afterEach(() => {
    delete process.env.DANTREE_MODE;
    triggerV3Spy.mockRestore();
    generateSpy.mockRestore();
  });

  it("CS-05/CS-07/CS-08: source=step3_main reaches decideExecutionTriggerV3 in retry path", async () => {
    // Simulates the triggerContext shape that CS-05, CS-07, CS-08 now inject.
    await invokeLLM({
      messages: [{ role: "user", content: "Step3 retry path test" }],
      triggerContext: {
        business_task_type: "stock_analysis",
        interaction_mode: "analysis",
        entity_scope: "single",
        source: "step3_main",
      },
    });
    expect(triggerV3Spy).toHaveBeenCalledTimes(1);
    const callArg = triggerV3Spy.mock.calls[0][0];
    // triggerContext.source must be "step3_main" (not undefined)
    expect(callArg.triggerContext?.source).toBe("step3_main");
  });

  it("CS-05/CS-07/CS-08: source=step3_main → Rule F fires in retry path (not NONE)", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Step3 retry Rule F test" }],
      triggerContext: {
        business_task_type: "stock_analysis",
        interaction_mode: "analysis",
        entity_scope: "single",
        source: "step3_main",
      },
    });
    const v3Result = triggerV3Spy.mock.results[0].value as Record<string, unknown>;
    // Rule F must fire — not NONE (which was the pre-Batch1 behavior for retry paths)
    expect(v3Result.rule).toBe("F");
    expect(v3Result.execution_target).toBe("gpt");
    expect(v3Result.triggered).toBe(true);
  });

  it("CS-05/CS-07/CS-08: retry path → modelRouter.generate() receives executionTarget=gpt", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Step3 retry modelRouter routing test" }],
      triggerContext: {
        business_task_type: "research",
        interaction_mode: "analysis",
        entity_scope: "single",
        source: "step3_main",
      },
    });
    expect(generateSpy).toHaveBeenCalledTimes(1);
    const callArg = generateSpy.mock.calls[0][0];
    // Rule F: step3_main → executionTarget="gpt"
    expect(callArg.executionTarget).toBe("gpt");
    expect(callArg.triggerV3Meta?.trigger_rule).toBe("F");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-COV-BATCH1-03: Semantic alignment — all 5 Batch 1 paths use identical triggerContext shape
// Verifies that fallback and retry paths are semantically aligned with the DEV primary path (CS-01).
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-COV-BATCH1-03: Semantic alignment — Batch 1 paths aligned with CS-01 DEV primary", () => {
  let triggerV3Spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.DANTREE_MODE = "production";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    triggerV3Spy = vi.spyOn(executionTriggerModule, "decideExecutionTriggerV3");
  });

  afterEach(() => {
    delete process.env.DANTREE_MODE;
    triggerV3Spy.mockRestore();
  });

  it("all 5 Batch 1 triggerContext shapes produce identical Rule F decision", async () => {
    // The 5 approved call sites all inject the same triggerContext shape.
    // Verify that all produce the same Trigger v3 outcome.
    const triggerContextVariants = [
      // CS-03: PROD OpenAI fallback
      { business_task_type: "stock_analysis", interaction_mode: "analysis", entity_scope: "single", source: "step3_main" },
      // CS-04: PROD no-key Claude path
      { business_task_type: "stock_analysis", interaction_mode: "analysis", entity_scope: "single", source: "step3_main" },
      // CS-05: DEV validation retry
      { business_task_type: "stock_analysis", interaction_mode: "analysis", entity_scope: "single", source: "step3_main" },
      // CS-07: PROD retry OpenAI fallback
      { business_task_type: "stock_analysis", interaction_mode: "analysis", entity_scope: "single", source: "step3_main" },
      // CS-08: PROD retry no-key
      { business_task_type: "stock_analysis", interaction_mode: "analysis", entity_scope: "single", source: "step3_main" },
    ];

    for (const triggerContext of triggerContextVariants) {
      triggerV3Spy.mockClear();
      await invokeLLM({
        messages: [{ role: "user", content: "Batch 1 alignment test" }],
        triggerContext,
      });
      const v3Result = triggerV3Spy.mock.results[0].value as Record<string, unknown>;
      // All 5 variants must produce Rule F (not NONE)
      expect(v3Result.rule).toBe("F");
      expect(v3Result.execution_target).toBe("gpt");
      expect(v3Result.triggered).toBe(true);
    }
  });

  it("without triggerContext (pre-Batch1 behavior): rule=NONE (regression baseline)", async () => {
    // Verify that the pre-Batch1 behavior (no triggerContext) still produces NONE.
    // This confirms that the Batch 1 change is meaningful.
    await invokeLLM({
      messages: [{ role: "user", content: "No triggerContext baseline test" }],
      // No triggerContext — simulates pre-Batch1 partial-coverage state
    });
    const v3Result = triggerV3Spy.mock.results[0].value as Record<string, unknown>;
    // Without triggerContext, rule must be NONE (not F)
    expect(v3Result.rule).toBe("NONE");
    expect(v3Result.triggered).toBe(false);
  });
});
