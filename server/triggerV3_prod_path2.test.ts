/**
 * triggerV3_prod_path2.test.ts
 *
 * PATH 2: Production-mode verification of invokeLLM() formal call chain.
 * Verifies:
 *   - Whether Trigger v3 (resolveProviderWithAuthority, executionTarget, metadata)
 *     is active when DANTREE_MODE=production and invokeLLM() is called
 *   - Whether modelRouter.generate() is bypassed in production invokeLLM() path
 *   - Whether metadata 8 fields survive through invokeLLM() in production
 *
 * Approach:
 *   - Mock global fetch to intercept the direct OpenAI gpt-5.4 call in production path
 *   - Spy on modelRouter.generate to detect whether it is called
 *   - Inspect the InvokeResult to check for metadata field presence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeLLM } from "./_core/llm";
import { modelRouter } from "./model_router";

// ─────────────────────────────────────────────────────────────────────────────
// PATH 2 — Production-mode: invokeLLM() formal call chain
// ─────────────────────────────────────────────────────────────────────────────

describe("PATH2-PROD: invokeLLM() production-mode call chain", () => {
  const savedMode = process.env.DANTREE_MODE;
  const savedForgeKey = process.env.BUILT_IN_FORGE_API_KEY;
  const savedForgeUrl = process.env.BUILT_IN_FORGE_API_URL;

  let modelRouterSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.DANTREE_MODE = "production";
    process.env.BUILT_IN_FORGE_API_KEY = "test-forge-key-prod";
    process.env.BUILT_IN_FORGE_API_URL = "https://mock-forge.example.com";

    // Spy on modelRouter.generate to detect whether it is called
    modelRouterSpy = vi.spyOn(modelRouter, "generate");

    // Mock global fetch to intercept the direct gpt-5.4 call
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "chatcmpl-mock-prod",
        object: "chat.completion",
        created: 1700000000,
        model: "gpt-5.4",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "Mock production OpenAI response." },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 150, completion_tokens: 300, total_tokens: 450 },
      }),
    } as Response);
  });

  afterEach(() => {
    modelRouterSpy.mockRestore();
    fetchSpy.mockRestore();
    if (savedMode === undefined) delete process.env.DANTREE_MODE;
    else process.env.DANTREE_MODE = savedMode;
    if (savedForgeKey === undefined) delete process.env.BUILT_IN_FORGE_API_KEY;
    else process.env.BUILT_IN_FORGE_API_KEY = savedForgeKey;
    if (savedForgeUrl === undefined) delete process.env.BUILT_IN_FORGE_API_URL;
    else process.env.BUILT_IN_FORGE_API_URL = savedForgeUrl;
  });

  // ── TC-PATH2-01: invokeLLM() production path — modelRouter bypassed ────────
  it("TC-PATH2-01: invokeLLM() in production bypasses modelRouter.generate()", async () => {
    const result = await invokeLLM({
      messages: [{ role: "user", content: "Production call chain test" }],
      triggerContext: {
        source: "step3_main",
        business_task_type: "research",
      },
    });

    // modelRouter.generate must NOT have been called
    expect(modelRouterSpy).not.toHaveBeenCalled();

    // fetch must have been called (direct OpenAI gpt-5.4 call)
    expect(fetchSpy).toHaveBeenCalled();

    // Result must be the raw OpenAI response (no modelRouter wrapping)
    expect(result.model).toBe("gpt-5.4");
    expect(result.choices[0].message.content).toBe("Mock production OpenAI response.");
  });

  // ── TC-PATH2-02: invokeLLM() production result has NO metadata 8 fields ────
  it("TC-PATH2-02: invokeLLM() production result does NOT contain Trigger v3 metadata 8 fields", async () => {
    const result = await invokeLLM({
      messages: [{ role: "user", content: "Metadata field check" }],
      triggerContext: {
        source: "step3_main",
        business_task_type: "research",
      },
    }) as unknown as Record<string, unknown>;

    // InvokeResult does NOT have a metadata field — it's a raw OpenAI response shape
    // These 8 fields should NOT be present in the production invokeLLM result:
    const v3Fields = [
      "trigger_rule",
      "resolved_task_type",
      "final_task_type",
      "execution_target",
      "execution_mode",
      "selected_provider",
      "dev_override",
      "simulated_target",
    ];

    for (const field of v3Fields) {
      // None of these fields should appear in the top-level InvokeResult
      expect(result).not.toHaveProperty(field);
    }
    // Also verify no nested metadata object
    expect(result.metadata).toBeUndefined();
  });

  // ── TC-PATH2-03: invokeLLM() production — executionTarget field ignored ─────
  it("TC-PATH2-03: invokeLLM() production path ignores executionTarget (no Trigger v3 routing)", async () => {
    // Even if triggerContext has source=step3_main (Rule F), production path
    // bypasses Trigger v3 entirely and goes straight to gpt-5.4
    const result = await invokeLLM({
      messages: [{ role: "user", content: "Rule F test in production" }],
      triggerContext: {
        source: "step3_main",
        business_task_type: "research",
      },
    });

    // modelRouter must NOT have been called (no Trigger v3 routing)
    expect(modelRouterSpy).not.toHaveBeenCalled();

    // The call went to gpt-5.4 directly regardless of Rule F
    // fetch was called (direct OpenAI/Forge call — URL depends on OPENAI_API_KEY presence)
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Result is raw gpt-5.4 response (not wrapped by modelRouter)
    expect(result.model).toBe("gpt-5.4");
  });

  // ── TC-PATH2-04: fetch payload does NOT contain executionTarget ────────────
  it("TC-PATH2-04: production fetch payload does NOT include executionTarget or triggerV3Meta", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "Payload inspection test" }],
      triggerContext: {
        source: "step3_main",
        business_task_type: "research",
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchCall = fetchSpy.mock.calls[0];
    const fetchOptions = fetchCall[1] as RequestInit;
    const payload = JSON.parse(fetchOptions.body as string);

    // The raw OpenAI payload must NOT contain Trigger v3 fields
    expect(payload).not.toHaveProperty("executionTarget");
    expect(payload).not.toHaveProperty("triggerV3Meta");
    expect(payload).not.toHaveProperty("execution_target");
    // It should only contain standard OpenAI fields
    expect(payload).toHaveProperty("model", "gpt-5.4");
    expect(payload).toHaveProperty("messages");
  });
});
