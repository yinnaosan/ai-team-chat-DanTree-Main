/**
 * triggerV3_prod_path1.test.ts
 *
 * PATH 1: Production-mode verification of modelRouter.generate() directly.
 * Verifies:
 *   - DANTREE_MODE=production switches to production routing path
 *   - executionTarget="gpt" → resolveProviderWithAuthority → openai provider
 *   - executionTarget="claude" → resolveProviderWithAuthority → anthropic provider
 *   - RouterResponse.metadata contains all 8 required v3 fields
 *
 * Approach: mock both @anthropic-ai/sdk and openai so no real API calls are made.
 * Token values are consistent across mocks to avoid cross-test pollution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock Anthropic ────────────────────────────────────────────────────────────
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Mock Anthropic production response." }],
        model: "claude-opus-4-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 150, output_tokens: 300 },
      }),
    };
  },
}));

// ── Mock OpenAI ───────────────────────────────────────────────────────────────
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          id: "chatcmpl-test",
          object: "chat.completion",
          created: 1700000000,
          model: "gpt-4o",
          choices: [{
            index: 0,
            message: { role: "assistant", content: "Mock OpenAI production response." },
            finish_reason: "stop",
          }],
          usage: { prompt_tokens: 150, completion_tokens: 300, total_tokens: 450 },
        }),
      },
    };
  },
}));

import { modelRouter } from "./model_router";

// ─────────────────────────────────────────────────────────────────────────────
// PATH 1 — Production-mode: modelRouter.generate() direct
// ─────────────────────────────────────────────────────────────────────────────

describe("PATH1-PROD: modelRouter.generate() production-mode routing", () => {
  const savedMode = process.env.DANTREE_MODE;
  const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const savedOpenAIKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.DANTREE_MODE = "production";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key-prod";
    process.env.OPENAI_API_KEY = "test-openai-key-prod";
  });

  afterEach(() => {
    if (savedMode === undefined) delete process.env.DANTREE_MODE;
    else process.env.DANTREE_MODE = savedMode;
    if (savedAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
    if (savedOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedOpenAIKey;
  });

  // ── TC-PROD-01: production mode switch ─────────────────────────────────────
  it("TC-PROD-01: DANTREE_MODE=production activates production routing path", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Test production mode switch" }],
        executionTarget: "claude",
        executionMode: "primary",
      },
      "research"
    );
    // In production mode, executionTarget="claude" → anthropic
    expect(result.provider).toBe("anthropic");
    // dev_override must be false in production
    expect(result.metadata?.dev_override).toBe(false);
    // routing.mode must be "production"
    expect(result.routing?.mode).toBe("production");
  });

  // ── TC-PROD-02: executionTarget="gpt" → openai in production ──────────────
  it("TC-PROD-02: executionTarget=gpt → resolveProviderWithAuthority → openai provider", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Analyze market data" }],
        executionTarget: "gpt",
        executionMode: "primary",
        triggerV3Meta: {
          trigger_rule: "F",
          resolved_task_type: "research",
          final_task_type: "research",
        },
      },
      "research"
    );

    // Provider must be openai (authority override)
    expect(result.provider).toBe("openai");
    // dev_override must be false
    expect(result.metadata?.dev_override).toBe(false);
    // simulated_target must be undefined (not a dev override)
    expect(result.metadata?.simulated_target).toBeUndefined();

    // ── Metadata 8-field verification ────────────────────────────────────────
    const meta = result.metadata ?? {};
    expect(meta).toHaveProperty("execution_target", "gpt");
    expect(meta).toHaveProperty("execution_mode", "primary");
    expect(meta).toHaveProperty("selected_provider", "openai");
    expect(meta).toHaveProperty("dev_override", false);
    // trigger_rule injected via triggerV3Meta
    expect(meta).toHaveProperty("trigger_rule", "F");
    expect(meta).toHaveProperty("resolved_task_type", "research");
    expect(meta).toHaveProperty("final_task_type", "research");
    // simulated_target: undefined (not a dev override, may be absent)
    expect(meta.simulated_target).toBeUndefined();
  });

  // ── TC-PROD-03: executionTarget="claude" → anthropic in production ─────────
  it("TC-PROD-03: executionTarget=claude → resolveProviderWithAuthority → anthropic provider", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Execute structured task" }],
        executionTarget: "claude",
        executionMode: "primary",
        triggerV3Meta: {
          trigger_rule: "A",
          resolved_task_type: "execution",
          final_task_type: "execution",
        },
      },
      "execution"
    );

    // Provider must be anthropic (authority override)
    expect(result.provider).toBe("anthropic");
    expect(result.metadata?.dev_override).toBe(false);

    // ── Metadata 8-field verification ────────────────────────────────────────
    const meta = result.metadata ?? {};
    expect(meta).toHaveProperty("execution_target", "claude");
    expect(meta).toHaveProperty("execution_mode", "primary");
    expect(meta).toHaveProperty("selected_provider", "anthropic");
    expect(meta).toHaveProperty("dev_override", false);
    expect(meta).toHaveProperty("trigger_rule", "A");
    expect(meta).toHaveProperty("resolved_task_type", "execution");
    expect(meta).toHaveProperty("final_task_type", "execution");
    expect(meta.simulated_target).toBeUndefined();
  });

  // ── TC-PROD-04: no executionTarget → PRODUCTION_ROUTING_MAP ───────────────
  it("TC-PROD-04: no executionTarget → falls back to PRODUCTION_ROUTING_MAP", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Default routing test" }],
        // no executionTarget
        executionMode: "primary",
      },
      "research"
    );
    // research is mapped in PRODUCTION_ROUTING_MAP — verify provider is set
    expect(["anthropic", "openai"]).toContain(result.provider);
    expect(result.metadata?.dev_override).toBe(false);
    expect(result.metadata?.execution_target).toBe("none");
    expect(result.routing?.mode).toBe("production");
  });

  // ── TC-PROD-05: resolveProviderWithAuthority strategy field ───────────────
  it("TC-PROD-05: executionTarget=gpt uses authority_override strategy (logged)", async () => {
    // This test captures the console.log output to verify strategy field
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
      origLog(...args);
    };

    await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Strategy test" }],
        executionTarget: "gpt",
        executionMode: "primary",
      },
      "research"
    );

    console.log = origLog;

    // Find the [model_router:route] log entry
    const routeLog = logs.find((l) => l.includes("[model_router:route]"));
    expect(routeLog).toBeDefined();
    const parsed = JSON.parse(routeLog!.replace("[model_router:route] ", ""));
    expect(parsed.authority_strategy).toBe("authority_override");
    expect(parsed.provider).toBe("openai");
    expect(parsed.mode).toBe("production");
  });
});
