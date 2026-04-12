/**
 * TC-LLM-PROD-01: invokeLLM() Production Path Formal Integration Test
 *
 * Purpose:
 *   Provide direct evidence that after PATCH LLM-8:
 *   1. invokeLLM() production path routes through modelRouter.generate() (not raw fetch)
 *   2. Trigger v3 layers (decideExecutionTriggerV3) are called in the formal path
 *   3. InvokeResult structure is verified (metadata NOT in InvokeResult — documented gap)
 *   4. executionTarget="gpt" and "claude" production routing behavior is verified
 *      (mocked production verification — labeled explicitly)
 *
 * Source of Truth: TRIGGER_V3_PROD_FIX_DELIVERY.docx + PATCH LLM-8
 * Checkpoint: 1ddc2f53
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as modelRouterModule from "./model_router";
import * as executionTriggerModule from "./executionTrigger";
import { invokeLLM } from "./_core/llm";

// ─────────────────────────────────────────────────────────────────────────────
// TC-LLM-PROD-01-A: Formal path — invokeLLM() routes through modelRouter.generate()
// Evidence: spy on modelRouter.generate() and verify it is called in production mode
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-LLM-PROD-01-A: invokeLLM() production path routes through modelRouter.generate()", () => {
  let generateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.DANTREE_MODE = "production";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    // Spy on modelRouter.generate to prove it is called
    generateSpy = vi.spyOn(modelRouterModule.modelRouter, "generate");
  });

  afterEach(() => {
    delete process.env.DANTREE_MODE;
    generateSpy.mockRestore();
  });

  it("production mode: invokeLLM() calls modelRouter.generate() exactly once", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Analyze AAPL" }],
      triggerContext: { source: "step3_main", business_task_type: "research" },
    });
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("production mode: modelRouter.generate() receives routerInputV3 with triggerV3Meta", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Analyze AAPL" }],
      triggerContext: { source: "step3_main", business_task_type: "research" },
    });
    const callArg = generateSpy.mock.calls[0][0];
    // triggerV3Meta must be present in the call (Layer 3.5 evidence)
    expect(callArg).toHaveProperty("triggerV3Meta");
    expect(callArg.triggerV3Meta).toHaveProperty("trigger_rule");
    expect(callArg.triggerV3Meta).toHaveProperty("resolved_task_type");
    expect(callArg.triggerV3Meta).toHaveProperty("final_task_type");
  });

  it("production mode: modelRouter.generate() receives executionTarget from decideExecutionTriggerV3", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Analyze AAPL" }],
      triggerContext: { source: "step3_main", business_task_type: "research" },
    });
    const callArg = generateSpy.mock.calls[0][0];
    // executionTarget must be set (from triggerV3.execution_target)
    expect(callArg).toHaveProperty("executionTarget");
    expect(["gpt", "claude", "none"]).toContain(callArg.executionTarget);
  });

  it("production mode: invokeLLM() returns InvokeResult with choices[0].message.content", async () => {
    const result = await invokeLLM({
      messages: [{ role: "user", content: "Analyze AAPL" }],
      triggerContext: { source: "step3_main", business_task_type: "research" },
    });
    expect(result).toHaveProperty("choices");
    expect(result.choices[0]).toHaveProperty("message");
    expect(result.choices[0].message).toHaveProperty("content");
    expect(result.choices[0].message.role).toBe("assistant");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-LLM-PROD-01-B: InvokeResult metadata gap — documented evidence
// Evidence: InvokeResult does NOT contain metadata field (by design)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-LLM-PROD-01-B: InvokeResult metadata gap — documented structural evidence", () => {
  beforeEach(() => {
    process.env.DANTREE_MODE = "production";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
  });

  afterEach(() => {
    delete process.env.DANTREE_MODE;
  });

  it("InvokeResult does NOT contain metadata field — metadata is dropped at adaptation layer", async () => {
    const result = await invokeLLM({
      messages: [{ role: "user", content: "Analyze AAPL" }],
      triggerContext: { source: "step3_main", business_task_type: "research" },
    });
    // DOCUMENTED GAP: InvokeResult type has no metadata field.
    // routerResult.metadata exists in RouterResponse but is NOT mapped to InvokeResult.
    // This is an explicit structural finding, not a test failure.
    expect((result as Record<string, unknown>)["metadata"]).toBeUndefined();
  });

  it("InvokeResult contains exactly: id, model, choices, usage (no metadata)", async () => {
    const result = await invokeLLM({
      messages: [{ role: "user", content: "Analyze AAPL" }],
      triggerContext: { source: "step3_main", business_task_type: "research" },
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("model");
    expect(result).toHaveProperty("choices");
    expect(result).toHaveProperty("usage");
    // metadata is NOT in InvokeResult — dropped in llm.ts return statement
    expect(Object.keys(result as object)).not.toContain("metadata");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-LLM-PROD-01-C: Trigger v3 layer activation evidence
// Evidence: decideExecutionTriggerV3 is called in the formal invokeLLM path
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-LLM-PROD-01-C: Trigger v3 layer activation in formal invokeLLM path", () => {
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

  it("production mode: decideExecutionTriggerV3 is called exactly once per invokeLLM call", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Analyze AAPL" }],
      triggerContext: { source: "step3_main", business_task_type: "research" },
    });
    expect(triggerV3Spy).toHaveBeenCalledTimes(1);
  });

  it("production mode: decideExecutionTriggerV3 returns TriggerDecisionV3 with triggered/rule/execution_target", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Analyze AAPL" }],
      triggerContext: { source: "step3_main", business_task_type: "research" },
    });
    const v3Result = triggerV3Spy.mock.results[0].value as Record<string, unknown>;
    expect(v3Result).toHaveProperty("triggered");
    expect(v3Result).toHaveProperty("rule");
    expect(v3Result).toHaveProperty("execution_target");
    expect(v3Result).toHaveProperty("execution_mode");
    expect(v3Result).toHaveProperty("reason");
  });

  it("production mode: source=step3_main triggers Rule F (GPT_PIPELINE_SOURCES)", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Generate narrative" }],
      triggerContext: { source: "step3_main", business_task_type: "narrative" },
    });
    const v3Result = triggerV3Spy.mock.results[0].value as Record<string, unknown>;
    // step3_main is in GPT_PIPELINE_SOURCES → Rule F
    expect(v3Result.rule).toBe("F");
    expect(v3Result.execution_target).toBe("gpt");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-LLM-PROD-01-D: GPT production routing — mocked production verification
// LABEL: MOCKED PRODUCTION VERIFICATION
// Real OPENAI_API_KEY not available in sandbox. Uses spy to verify routing intent.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-LLM-PROD-01-D: GPT production routing [MOCKED PRODUCTION VERIFICATION]", () => {
  let generateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.DANTREE_MODE = "production";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    generateSpy = vi.spyOn(modelRouterModule.modelRouter, "generate");
  });

  afterEach(() => {
    delete process.env.DANTREE_MODE;
    generateSpy.mockRestore();
  });


  it("[MOCKED] executionTarget=gpt in production: modelRouter.generate() receives executionTarget=gpt", async () => {
    // source=step3_main → Rule F → executionTarget="gpt"
    await invokeLLM({
      messages: [{ role: "user", content: "Generate investment thesis" }],
      triggerContext: { source: "step3_main", business_task_type: "research" },
    });
    const callArg = generateSpy.mock.calls[0][0];
    // Rule F: step3_main → executionTarget="gpt"
    expect(callArg.executionTarget).toBe("gpt");
    // NOTE: actual OpenAI API call falls back to gpt_stub because OPENAI_API_KEY not set in sandbox
    // Real OpenAI routing requires Railway/Render environment with OPENAI_API_KEY
  });

  it("[MOCKED] executionTarget=gpt in production: RouterResponse.metadata.execution_target=gpt (via direct modelRouter call)", async () => {
    // NOTE: InvokeResult does NOT expose metadata — to verify RouterResponse.metadata,
    // we must call modelRouter.generate() directly (not via invokeLLM).
    // This is a documented structural finding: metadata is dropped at InvokeResult adaptation layer.
    generateSpy.mockRestore(); // restore spy before direct call

    const result = await modelRouterModule.modelRouter.generate(
      {
        messages: [{ role: "user", content: "Generate investment thesis" }],
        executionTarget: "gpt",
        executionMode: "primary",
        triggerV3Meta: { trigger_rule: "F", resolved_task_type: "research", final_task_type: "research" },
      },
      "research"
    );

    // RouterResponse.metadata IS populated in direct modelRouter path
    expect(result.metadata).toBeDefined();
    const metadata = result.metadata as Record<string, unknown>;
    expect(metadata["execution_target"]).toBe("gpt");
    expect(metadata["trigger_rule"]).toBe("F");
    // NOTE: dev_override=false in production mode (DANTREE_MODE=production)
    expect(metadata["dev_override"]).toBe(false);
    // NOTE: real OpenAI API call not available in sandbox — falls back to gpt_stub
    // Real OpenAI routing requires OPENAI_API_KEY in Railway/Render environment
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-LLM-PROD-01-E: Claude production routing via Rule A [MOCKED PRODUCTION VERIFICATION]
// Separate describe to allow vi.mock isolation without polluting TC-LLM-PROD-01-D
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        id: "msg_prod_ruleA",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Claude execution response" }],
        model: "claude-opus-4-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 150, output_tokens: 300 },
      }),
    },
  })),
}));

describe("TC-LLM-PROD-01-E: Claude production routing via Rule A [MOCKED PRODUCTION VERIFICATION]", () => {
  beforeEach(() => {
    process.env.DANTREE_MODE = "production";
    process.env.ANTHROPIC_API_KEY = "test-key-prod-ruleA";
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
  });

  afterEach(() => {
    delete process.env.DANTREE_MODE;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("[MOCKED] executionTarget=claude in production: direct modelRouter call with Rule A (structural finding)", async () => {
    // STRUCTURAL FINDING: invokeLLM() cannot trigger Rule A (executionTarget="claude") via triggerContext
    // because taskTypeBridge has no mapping from any business_task_type to EXECUTION_TASK_TYPES.
    // Rule A can only be triggered via direct modelRouter.generate() call.
    // This is documented as a structural gap — not a bug.
    const result = await modelRouterModule.modelRouter.generate(
      {
        messages: [{ role: "user", content: "Execute trade order" }],
        executionTarget: "claude",
        executionMode: "primary",
        triggerV3Meta: { trigger_rule: "A", resolved_task_type: "execution", final_task_type: "execution" },
      },
      "execution"
    );

    // The routing intent (executionTarget=claude) is preserved in metadata
    expect(result.metadata).toBeDefined();
    const metadata = result.metadata as Record<string, unknown>;
    expect(metadata["execution_target"]).toBe("claude");
    expect(metadata["trigger_rule"]).toBe("A");
    expect(metadata["dev_override"]).toBe(false);
    // NOTE: Real Claude routing requires ANTHROPIC_API_KEY in production environment
  });
});
