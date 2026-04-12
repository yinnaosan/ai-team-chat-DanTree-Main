/**
 * triggerV3_prod_path2.test.ts
 *
 * PATH 2 — Formal production path verification through invokeLLM()
 * Updated after PATCH LLM-8: invokeLLM() production bypass has been removed.
 *
 * PURPOSE (post-PATCH LLM-8):
 *   Prove that in production mode, invokeLLM() now participates in the
 *   Trigger v3 chain and reaches modelRouter.generate() — the bypass is gone.
 *
 * HISTORICAL NOTE:
 *   Before PATCH LLM-8, invokeLLM() in production mode bypassed modelRouter
 *   entirely (raw fetch → gpt-5.4). PATCH LLM-8 removed that bypass.
 *   These tests now verify the repaired behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeLLM } from "./_core/llm";
import * as modelRouterModule from "./model_router";

// ─────────────────────────────────────────────────────────────────────────────
// PATH2-PROD: invokeLLM() production-mode call chain (post-PATCH LLM-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("PATH2-PROD: invokeLLM() production-mode call chain (post-PATCH LLM-8)", () => {
  let modelRouterSpy: ReturnType<typeof vi.spyOn>;
  let savedMode: string | undefined;
  let savedForgeKey: string | undefined;
  let savedForgeUrl: string | undefined;

  beforeEach(() => {
    savedMode = process.env.DANTREE_MODE;
    savedForgeKey = process.env.BUILT_IN_FORGE_API_KEY;
    savedForgeUrl = process.env.BUILT_IN_FORGE_API_URL;

    process.env.DANTREE_MODE = "production";
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    modelRouterSpy = vi.spyOn(modelRouterModule.modelRouter, "generate");
  });

  afterEach(() => {
    modelRouterSpy.mockRestore();
    if (savedMode === undefined) delete process.env.DANTREE_MODE;
    else process.env.DANTREE_MODE = savedMode;
    if (savedForgeKey === undefined) delete process.env.BUILT_IN_FORGE_API_KEY;
    else process.env.BUILT_IN_FORGE_API_KEY = savedForgeKey;
    if (savedForgeUrl === undefined) delete process.env.BUILT_IN_FORGE_API_URL;
    else process.env.BUILT_IN_FORGE_API_URL = savedForgeUrl;
  });

  // ── TC-PATH2-01: invokeLLM() production path now reaches modelRouter ────────
  it("TC-PATH2-01: invokeLLM() in production now calls modelRouter.generate() (bypass removed)", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Production call chain test" }],
      triggerContext: {
        source: "step3_main",
        business_task_type: "research",
      },
    });
    // PATCH LLM-8: modelRouter.generate() MUST now be called in production
    expect(modelRouterSpy).toHaveBeenCalledTimes(1);
  });

  // ── TC-PATH2-02: invokeLLM() production path passes triggerContext to Trigger v3 ──
  it("TC-PATH2-02: invokeLLM() production path passes triggerContext through Trigger v3 chain", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Trigger v3 chain test" }],
      triggerContext: {
        source: "step3_main",
        business_task_type: "research",
      },
    });
    // modelRouter.generate() was called with routerInput that includes triggerV3Meta
    expect(modelRouterSpy).toHaveBeenCalledTimes(1);
    const callArg = modelRouterSpy.mock.calls[0][0];
    // triggerV3Meta must be present (set by Layer 3.5 in invokeLLM)
    expect(callArg).toHaveProperty("triggerV3Meta");
    expect(callArg.triggerV3Meta).toBeDefined();
  });

  // ── TC-PATH2-03: Rule F triggers in production via invokeLLM() ─────────────
  it("TC-PATH2-03: Rule F (step3_main source) triggers executionTarget=gpt in production via invokeLLM()", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Rule F production test" }],
      triggerContext: {
        source: "step3_main",
        business_task_type: "research",
      },
    });
    // modelRouter.generate() called with executionTarget from Trigger v3
    expect(modelRouterSpy).toHaveBeenCalledTimes(1);
    const callArg = modelRouterSpy.mock.calls[0][0];
    // Rule F: step3_main → executionTarget="gpt"
    expect(callArg.executionTarget).toBe("gpt");
    // triggerV3Meta.trigger_rule must be "F"
    expect(callArg.triggerV3Meta?.trigger_rule).toBe("F");
  });

  // ── TC-PATH2-04: InvokeResult does NOT expose RouterResponse.metadata ───────
  it("TC-PATH2-04: InvokeResult adaptation drops RouterResponse.metadata (documented structural gap)", async () => {
    const result = await invokeLLM({
      messages: [{ role: "user", content: "Metadata adaptation test" }],
      triggerContext: {
        source: "step3_main",
        business_task_type: "research",
      },
    }) as unknown as Record<string, unknown>;

    // modelRouter.generate() was called (production path is active)
    expect(modelRouterSpy).toHaveBeenCalledTimes(1);

    // DOCUMENTED STRUCTURAL GAP: InvokeResult does NOT expose metadata
    // RouterResponse.metadata (8 fields) is dropped at the InvokeResult adaptation layer.
    // Callers needing metadata must use modelRouter.generate() directly.
    expect(result.metadata).toBeUndefined();

    // InvokeResult only exposes standard LLM response fields
    expect(result).toHaveProperty("choices");
    expect(result).toHaveProperty("usage");
  });
});
