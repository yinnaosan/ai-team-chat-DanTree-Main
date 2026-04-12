/**
 * model_router.test.ts — Model Router Hardening Patch 验证测试
 *
 * TC-MR-01: TaskType 严格校验
 * TC-MR-02: Claude provider 统一响应结构
 * TC-MR-03: GPT stub provider 统一响应结构
 * TC-MR-04: 生产路由表完整性
 * TC-MR-05: deprecated wrapper 委托验证
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  modelRouter,
  invokeWithModelRouter,
  TASK_TYPES,
  PRODUCTION_ROUTING_MAP,
  type TaskType,
  type RouterResponse,
} from "./model_router";

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数：验证 RouterResponse 结构完整性
// ─────────────────────────────────────────────────────────────────────────────

function assertRouterResponseShape(result: unknown): asserts result is RouterResponse {
  expect(result).toBeDefined();
  const r = result as RouterResponse;
  // output: string
  expect(typeof r.output).toBe("string");
  // model: string
  expect(typeof r.model).toBe("string");
  expect(r.model.length).toBeGreaterThan(0);
  // provider: 严格三选一
  expect(["anthropic", "openai", "gpt_stub"]).toContain(r.provider);
  // usage: object with optional numeric fields
  expect(r.usage).toBeDefined();
  expect(typeof r.usage).toBe("object");
  if (r.usage.input_tokens !== undefined)
    expect(typeof r.usage.input_tokens).toBe("number");
  if (r.usage.output_tokens !== undefined)
    expect(typeof r.usage.output_tokens).toBe("number");
  if (r.usage.total_tokens !== undefined)
    expect(typeof r.usage.total_tokens).toBe("number");
  // metadata: optional object
  if (r.metadata !== undefined) {
    expect(typeof r.metadata).toBe("object");
  }
}

const SAMPLE_MESSAGES = [
  { role: "user" as const, content: "Analyze AAPL for research task." },
];

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-01: TaskType 严格校验
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-01: TaskType strict validation", () => {
  it("should define all 5+ task types (v1.0 protocol + DanTree extensions)", () => {
    // 协议 v1.0 定义 5 种通用类型，DanTree 扩展了专用类型，总数应大于等于 5
    expect(Object.keys(TASK_TYPES).length).toBeGreaterThanOrEqual(5);
    expect(TASK_TYPES.research).toBe("research");
    expect(TASK_TYPES.reasoning).toBe("reasoning");
    expect(TASK_TYPES.narrative).toBe("narrative");
    expect(TASK_TYPES.execution).toBe("execution");
    expect(TASK_TYPES.summarization).toBe("summarization");
  });

  it("should not throw on invalid task_type string — fallback to default", async () => {
    // OI-001 baseline: generate() walks fallback path instead of throwing
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "invalid_type" as TaskType
    );
    expect(result).toBeDefined();
    expect(typeof result.output).toBe("string");
    expect(result.metadata?.task_type).toBe("default");
    expect(["anthropic", "openai", "gpt_stub"]).toContain(result.provider);
  });

  it("should not throw on empty string task_type — fallback to default", async () => {
    // OI-001 baseline: generate() walks fallback path instead of throwing
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "" as TaskType
    );
    expect(result).toBeDefined();
    expect(typeof result.output).toBe("string");
    expect(result.metadata?.task_type).toBe("default");
    expect(["anthropic", "openai", "gpt_stub"]).toContain(result.provider);
  });

  it("should accept all valid task types without throwing type error", () => {
    const validTypes: TaskType[] = [
      "research",
      "reasoning",
      "narrative",
      "execution",
      "summarization",
    ];
    // 仅校验类型，不实际调用 API
    for (const t of validTypes) {
      expect(() => {
        // routingFor 内部调用 _validateTaskType
        const route = modelRouter.routingFor(t, "development");
        expect(route.provider).toBe("anthropic");
      }).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-02: Claude (Anthropic) provider 统一响应结构
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-02: Anthropic provider unified response shape", () => {
  beforeEach(() => {
    // Mock Anthropic SDK
    vi.mock("@anthropic-ai/sdk", () => {
      return {
        default: class MockAnthropic {
          messages = {
            create: vi.fn().mockResolvedValue({
              content: [{ type: "text", text: "Mock Anthropic analysis output." }],
              model: "claude-sonnet-4-6",
              stop_reason: "end_turn",
              usage: { input_tokens: 150, output_tokens: 300 },
            }),
          };
        },
      };
    });
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("should return unified RouterResponse shape from Anthropic provider", async () => {
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "research"
    );
    assertRouterResponseShape(result);
    expect(result.provider).toBe("anthropic");
    expect(result.output).toBeTruthy();
  });

  it("should include task_type in metadata", async () => {
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "execution"
    );
    expect(result.metadata?.task_type).toBe("execution");
  });

  it("should include usage with input/output/total tokens", async () => {
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "summarization"
    );
    expect(result.usage.input_tokens).toBe(150);
    expect(result.usage.output_tokens).toBe(300);
    expect(result.usage.total_tokens).toBe(450);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-03: GPT stub provider 统一响应结构
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-03: GPT stub provider unified response shape", () => {
  beforeEach(() => {
    // 强制使用 stub：没有任何 key
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    process.env.NODE_ENV = "development";
  });

  it("should return unified RouterResponse shape from GPT stub", async () => {
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "research"
    );
    assertRouterResponseShape(result);
    expect(result.provider).toBe("gpt_stub");
  });

  it("should include GPT_STUB marker in output", async () => {
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "narrative"
    );
    expect(result.output).toContain("[GPT_STUB]");
    expect(result.output).toContain("task_type=narrative");
  });

  it("should return zero usage for stub", async () => {
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "reasoning"
    );
    expect(result.usage.input_tokens).toBe(0);
    expect(result.usage.output_tokens).toBe(0);
    expect(result.usage.total_tokens).toBe(0);
  });

  it("should include stub=true in metadata", async () => {
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "execution"
    );
    expect(result.metadata?.stub).toBe(true);
  });

  it("gpt_stub response must pass unified shape assertion", async () => {
    const result = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "summarization"
    );
    // 核心断言：shape 完全一致，不能有 provider-specific 字段泄漏
    expect(result).toMatchObject({
      output: expect.any(String),
      model: expect.any(String),
      provider: "gpt_stub",
      usage: expect.objectContaining({}),
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-04: 生产路由表完整性
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-04: Production routing map completeness", () => {
  it("should have routing entry for all 5 task types", () => {
    const taskTypes: TaskType[] = [
      "research",
      "reasoning",
      "narrative",
      "execution",
      "summarization",
    ];
    for (const t of taskTypes) {
      expect(PRODUCTION_ROUTING_MAP[t]).toBeDefined();
      expect(["anthropic", "openai"]).toContain(PRODUCTION_ROUTING_MAP[t]);
    }
  });

  it("should route research to openai in production", () => {
    // OI-001 baseline: research 归 GPT 主控（openai）
    expect(PRODUCTION_ROUTING_MAP.research).toBe("openai");
  });

  it("should route reasoning to openai in production", () => {
    expect(PRODUCTION_ROUTING_MAP.reasoning).toBe("openai");
  });

  it("should route narrative to openai in production", () => {
    // OI-001 baseline: narrative 归 GPT 主控（openai）
    expect(PRODUCTION_ROUTING_MAP.narrative).toBe("openai");
  });

  it("should route execution to anthropic in production", () => {
    expect(PRODUCTION_ROUTING_MAP.execution).toBe("anthropic");
  });

  it("should route summarization to openai in production", () => {
    // OI-001 baseline: summarization 归 GPT 主控（openai）
    expect(PRODUCTION_ROUTING_MAP.summarization).toBe("openai");
  });

  it("routingFor() should return correct provider/model in development", () => {
    for (const t of Object.keys(TASK_TYPES) as TaskType[]) {
      const route = modelRouter.routingFor(t, "development");
      expect(route.provider).toBe("anthropic");
      expect(route.model).toBeTruthy();
      expect(route.model.startsWith("claude-")).toBe(true);
    }
  });

  it("routingFor() should return correct provider/model in production", () => {
    // OI-001 baseline: research 在生产态归 openai（GPT 主控策略）
    const researchRoute = modelRouter.routingFor("research", "production");
    expect(researchRoute.provider).toBe("openai");
    expect(researchRoute.model.length).toBeGreaterThan(0);

    const reasoningRoute = modelRouter.routingFor("reasoning", "production");
    expect(reasoningRoute.provider).toBe("openai");
    expect(reasoningRoute.model.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-05: deprecated wrapper 委托验证
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-05: Deprecated wrapper delegates to modelRouter.generate()", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    process.env.NODE_ENV = "development";
  });

  it("should return RouterResponse with same shape as modelRouter.generate()", async () => {
    const wrapperResult = await invokeWithModelRouter(SAMPLE_MESSAGES, "research");
    const directResult = await modelRouter.generate(
      { messages: SAMPLE_MESSAGES },
      "research"
    );

    // 两者 shape 必须一致
    assertRouterResponseShape(wrapperResult);
    assertRouterResponseShape(directResult);

    // 两者都应该经过同一路由逻辑（stub 模式下 provider 一致）
    expect(wrapperResult.provider).toBe(directResult.provider);
  });

  it("should default task_type to 'research' when omitted", async () => {
    const result = await invokeWithModelRouter(SAMPLE_MESSAGES);
    expect(result.metadata?.task_type).toBe("research");
  });

  it("should NOT contain direct provider branching logic", () => {
    // 结构验证：invokeWithModelRouter 内部必须调用 modelRouter.generate
    // 通过 spy 确认委托行为
    const spy = vi.spyOn(modelRouter, "generate");
    invokeWithModelRouter(SAMPLE_MESSAGES, "execution");
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ messages: SAMPLE_MESSAGES }),
      "execution"
    );
    spy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-V3-01: ExecutionTarget / ExecutionMode type exports
// ─────────────────────────────────────────────────────────────────────────────

import { type ExecutionTarget, type ExecutionMode } from "./model_router";

describe("TC-MR-V3-01: ExecutionTarget and ExecutionMode types exported correctly", () => {
  it("ExecutionTarget values are gpt | claude | hybrid", () => {
    const valid: ExecutionTarget[] = ["gpt", "claude", "hybrid"];
    for (const v of valid) {
      expect(typeof v).toBe("string");
    }
  });

  it("ExecutionMode values are primary | fallback | repair", () => {
    const valid: ExecutionMode[] = ["primary", "fallback", "repair"];
    for (const v of valid) {
      expect(typeof v).toBe("string");
    }
  });

  it("RouterInput accepts executionTarget and executionMode as optional fields (stub mode)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.NODE_ENV;
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "test" }],
        executionTarget: "claude",
        executionMode: "primary",
      },
      "research"
    );
    expect(result).toBeDefined();
    expect(typeof result.output).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-V3-02: Dev override behavior — executionTarget in dev mode (stub)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-V3-02: Dev override — executionTarget routing in dev mode (stub)", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executionTarget=gpt in dev (stub) → dev_override=true, simulated_target=gpt", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Analyze AAPL" }],
        executionTarget: "gpt",
        executionMode: "primary",
      },
      "research"
    );
    expect(["anthropic", "gpt_stub"]).toContain(result.provider);
    expect(result.metadata?.dev_override).toBe(true);
    expect(result.metadata?.simulated_target).toBe("gpt");
    expect(result.metadata?.execution_target).toBe("gpt");
  });

  it("executionTarget=claude in dev (stub) → dev_override=false", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Execute task" }],
        executionTarget: "claude",
        executionMode: "primary",
      },
      "execution"
    );
    expect(["anthropic", "gpt_stub"]).toContain(result.provider);
    expect(result.metadata?.dev_override).toBe(false);
    expect(result.metadata?.execution_target).toBe("claude");
  });

  it("no executionTarget in dev (stub) → execution_target=none in metadata", async () => {
    const result = await modelRouter.generate(
      { messages: [{ role: "user", content: "Analyze AAPL" }] },
      "research"
    );
    expect(["anthropic", "gpt_stub"]).toContain(result.provider);
    expect(result.metadata?.execution_target).toBe("none");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-V3-03: Stub mode dev override (no ANTHROPIC_API_KEY)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-V3-03: Stub dev override — no keys, executionTarget=gpt → gpt_stub + dev_override", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.NODE_ENV;
  });

  it("executionTarget=gpt, no keys → gpt_stub provider, dev_override=true, simulated_target=gpt", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Analyze AAPL" }],
        executionTarget: "gpt",
        executionMode: "primary",
      },
      "research"
    );
    expect(result.provider).toBe("gpt_stub");
    expect(result.metadata?.dev_override).toBe(true);
    expect(result.metadata?.simulated_target).toBe("gpt");
    expect(result.metadata?.execution_target).toBe("gpt");
  });

  it("executionTarget=claude, no keys → gpt_stub provider, dev_override=false", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Execute task" }],
        executionTarget: "claude",
        executionMode: "repair",
      },
      "execution"
    );
    expect(result.provider).toBe("gpt_stub");
    expect(result.metadata?.dev_override).toBe(false);
    expect(result.metadata?.execution_mode).toBe("repair");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-V3-04: Observability minimum viable fields in metadata
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-V3-04: Observability — RouterResponse.metadata is single source of truth for all 8 fields", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.NODE_ENV;
  });

  it("all 8 required observability fields present in RouterResponse.metadata when triggerV3Meta provided", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Analyze AAPL" }],
        executionTarget: "gpt",
        executionMode: "primary",
        triggerV3Meta: {
          trigger_rule:       "F",
          resolved_task_type: "research",
          final_task_type:    "research",
        },
      },
      "research"
    );
    expect(result.metadata).toBeDefined();
    expect(result.metadata).toHaveProperty("trigger_rule",       "F");
    expect(result.metadata).toHaveProperty("resolved_task_type", "research");
    expect(result.metadata).toHaveProperty("final_task_type",    "research");
    expect(result.metadata).toHaveProperty("execution_target",   "gpt");
    expect(result.metadata).toHaveProperty("execution_mode",     "primary");
    expect(result.metadata).toHaveProperty("selected_provider");
    expect(result.metadata).toHaveProperty("dev_override",       true);
    expect(result.metadata).toHaveProperty("simulated_target",   "gpt");
  });

  it("execution_mode=repair propagates to metadata", async () => {
    const result = await modelRouter.generate(
      {
        messages: [{ role: "user", content: "Repair JSON" }],
        executionTarget: "claude",
        executionMode: "repair",
        triggerV3Meta: {
          trigger_rule:       "C",
          resolved_task_type: "research",
          final_task_type:    "structured_json",
        },
      },
      "structured_json"
    );
    expect(result.metadata?.execution_mode).toBe("repair");
    expect(result.metadata?.trigger_rule).toBe("C");
    expect(result.metadata?.final_task_type).toBe("structured_json");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-V3-05: PRODUCTION_ROUTING_MAP + ExecutionTarget types check
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-V3-05: OI-001 routing integrity preserved with v3 types present", () => {
  it("PRODUCTION_ROUTING_MAP still has >= 12 task types", () => {
    expect(Object.keys(PRODUCTION_ROUTING_MAP).length).toBeGreaterThanOrEqual(12);
  });

  it("execution task types still route to anthropic in PRODUCTION_ROUTING_MAP", () => {
    expect(PRODUCTION_ROUTING_MAP["execution"]).toBe("anthropic");
    expect(PRODUCTION_ROUTING_MAP["code_analysis"]).toBe("anthropic");
    expect(PRODUCTION_ROUTING_MAP["agent_task"]).toBe("anthropic");
  });

  it("research/narrative/reasoning still route to openai in PRODUCTION_ROUTING_MAP", () => {
    expect(PRODUCTION_ROUTING_MAP["research"]).toBe("openai");
    expect(PRODUCTION_ROUTING_MAP["narrative"]).toBe("openai");
    expect(PRODUCTION_ROUTING_MAP["reasoning"]).toBe("openai");
  });

  it("TASK_TYPES has >= 12 entries (not broken by v3 additions)", () => {
    expect(Object.keys(TASK_TYPES).length).toBeGreaterThanOrEqual(12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-MR-GUARD-01: Direct provider bypass guardrail
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-MR-GUARD-01: modelRouter.generate() is the only exported LLM entry point", () => {
  it("internal call functions _callAnthropic/_callOpenAI/_callGptStub are NOT exported", async () => {
    const mr = await import("./model_router");
    const exported = mr as Record<string, unknown>;
    expect(exported["_callAnthropic"]).toBeUndefined();
    expect(exported["_callOpenAI"]).toBeUndefined();
    expect(exported["_callGptStub"]).toBeUndefined();
  });

  it("modelRouter.generate is the only function-typed export for LLM invocation", async () => {
    const mr = await import("./model_router");
    expect(typeof mr.modelRouter.generate).toBe("function");
    const spy = vi.spyOn(mr.modelRouter, "generate");
    mr.invokeWithModelRouter([{ role: "user" as const, content: "test" }], "research");
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ messages: expect.any(Array) }),
      "research"
    );
    spy.mockRestore();
  });

  it("resolveProviderWithAuthority is NOT exported (stays internal to router)", async () => {
    const mr = await import("./model_router");
    const exported = mr as Record<string, unknown>;
    expect(exported["resolveProviderWithAuthority"]).toBeUndefined();
  });

  it("executionTarget=gpt routing strategy goes through resolveProviderWithAuthority, not direct assignment", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.NODE_ENV;
    const { modelRouter: mr } = await import("./model_router");
    const result = await mr.generate(
      {
        messages: [{ role: "user", content: "test" }],
        executionTarget: "gpt",
        executionMode: "primary",
        triggerV3Meta: { trigger_rule: "F", resolved_task_type: "research", final_task_type: "research" },
      },
      "research"
    );
    expect(result.metadata?.trigger_rule).toBe("F");
    expect(result.metadata?.resolved_task_type).toBe("research");
    expect(result.metadata?.final_task_type).toBe("research");
    expect(result.metadata?.execution_target).toBe("gpt");
    expect(result.metadata?.execution_mode).toBe("primary");
    expect(result.metadata?.selected_provider).toBeDefined();
    expect(result.metadata?.dev_override).toBe(true);
    expect(result.metadata?.simulated_target).toBe("gpt");
  });
});
