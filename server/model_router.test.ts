/**
 * model_router.test.ts — DanTree Model Router 单元测试
 *
 * 验证路由策略、模式切换、快捷函数和健康检查逻辑。
 * 不发起真实 API 调用（通过 vi.mock 隔离 provider）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MODELS } from "./llmProviders";

// ─────────────────────────────────────────────────────────────────────────────
// Mock providers — 避免真实 API 调用
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("./claude_provider", () => ({
  invokeClaude: vi.fn().mockResolvedValue({
    content: "Claude mock response",
    model: "claude-sonnet-4-6",
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    estimated_cost_usd: 0.0001,
  }),
  checkClaudeHealth: vi.fn().mockResolvedValue({
    ok: true,
    latency_ms: 120,
    model_tested: "claude-haiku-4-5",
  }),
}));

vi.mock("./gpt_provider", () => ({
  invokeGPT: vi.fn().mockResolvedValue({
    content: "GPT mock response",
    model: "gpt-4o",
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    estimated_cost_usd: 0.0002,
  }),
  checkGPTHealth: vi.fn().mockResolvedValue({
    ok: false,
    latency_ms: 0,
    error: "GPT not available in sandbox (network isolation)",
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("model_router — DanTree Model Router", () => {
  const mockMessages = [{ role: "user" as const, content: "Test message" }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.DANTREE_MODE;
  });

  // ─── TC-ROUTER-01: 开发模式路由（Claude-only）────────────────────────────
  it("TC-ROUTER-01: 开发模式下所有 task_type 路由到 Claude", async () => {
    process.env.DANTREE_MODE = "development";
    const { routeToModel } = await import("./model_router");
    const { invokeClaude } = await import("./claude_provider");
    const { invokeGPT } = await import("./gpt_provider");

    // structured_json 在开发模式下应路由到 Claude（不是 GPT）
    const res = await routeToModel({
      task_type: "structured_json",
      messages: mockMessages,
    });

    expect(invokeClaude).toHaveBeenCalledOnce();
    expect(invokeGPT).not.toHaveBeenCalled();
    expect(res.routing.mode).toBe("development");
    expect(res.routing.provider).toBe("anthropic");
    expect(res.routing.was_overridden).toBe(false);
  });

  // ─── TC-ROUTER-02: 生产模式路由（按 task_type 分配）─────────────────────
  it("TC-ROUTER-02: 生产模式下 structured_json 路由到 GPT-4o", async () => {
    process.env.DANTREE_MODE = "production";
    const { routeToModel } = await import("./model_router");
    const { invokeGPT } = await import("./gpt_provider");

    const res = await routeToModel({
      task_type: "structured_json",
      messages: mockMessages,
    });

    expect(invokeGPT).toHaveBeenCalledOnce();
    expect(res.routing.mode).toBe("production");
    expect(res.routing.resolved_model).toBe(MODELS.OPENAI.GPT_4O);
    expect(res.routing.provider).toBe("openai");
  });

  // ─── TC-ROUTER-03: 生产模式 deep_research 路由到 Claude Opus ─────────────
  it("TC-ROUTER-03: 生产模式下 deep_research 路由到 Claude Opus 4.6", async () => {
    process.env.DANTREE_MODE = "production";
    const { routeToModel } = await import("./model_router");
    const { invokeClaude } = await import("./claude_provider");

    const res = await routeToModel({
      task_type: "deep_research",
      messages: mockMessages,
    });

    expect(invokeClaude).toHaveBeenCalledOnce();
    expect(res.routing.resolved_model).toBe(MODELS.ANTHROPIC.OPUS_4_6);
    expect(res.routing.provider).toBe("anthropic");
  });

  // ─── TC-ROUTER-04: override_model 覆盖路由策略 ───────────────────────────
  it("TC-ROUTER-04: override_model 可强制指定模型，覆盖路由策略", async () => {
    process.env.DANTREE_MODE = "development"; // 开发模式默认 Claude
    const { routeToModel } = await import("./model_router");
    const { invokeGPT } = await import("./gpt_provider");

    // 强制指定 GPT-4o（即使开发模式）
    const res = await routeToModel({
      task_type: "default",
      messages: mockMessages,
      override_model: MODELS.OPENAI.GPT_4O,
    });

    expect(invokeGPT).toHaveBeenCalledOnce();
    expect(res.routing.was_overridden).toBe(true);
    expect(res.routing.resolved_model).toBe(MODELS.OPENAI.GPT_4O);
  });

  // ─── TC-ROUTER-05: 路由决策信息完整性 ───────────────────────────────────
  it("TC-ROUTER-05: RouterResponse 包含完整的 routing 决策信息", async () => {
    process.env.DANTREE_MODE = "development";
    const { routeToModel } = await import("./model_router");

    const res = await routeToModel({
      task_type: "narrative",
      messages: mockMessages,
    });

    expect(res.routing).toMatchObject({
      task_type: "narrative",
      mode: "development",
      provider: "anthropic",
      was_overridden: false,
    });
    expect(typeof res.routing.resolved_model).toBe("string");
    expect(res.routing.resolved_model.length).toBeGreaterThan(0);
  });

  // ─── TC-ROUTER-06: 快捷函数 routeDeepResearch ────────────────────────────
  it("TC-ROUTER-06: routeDeepResearch() 快捷函数正确路由", async () => {
    process.env.DANTREE_MODE = "development";
    const { routeDeepResearch } = await import("./model_router");
    const { invokeClaude } = await import("./claude_provider");

    const res = await routeDeepResearch(mockMessages);

    expect(invokeClaude).toHaveBeenCalledOnce();
    expect(res.routing.task_type).toBe("deep_research");
  });

  // ─── TC-ROUTER-07: 快捷函数 routeClassification ──────────────────────────
  it("TC-ROUTER-07: routeClassification() 路由到 Claude Haiku（最便宜）", async () => {
    process.env.DANTREE_MODE = "production";
    const { routeClassification } = await import("./model_router");
    const { invokeClaude } = await import("./claude_provider");

    const res = await routeClassification(mockMessages);

    expect(invokeClaude).toHaveBeenCalledOnce();
    expect(res.routing.resolved_model).toBe(MODELS.ANTHROPIC.HAIKU_4_5);
    expect(res.routing.task_type).toBe("classification");
  });

  // ─── TC-ROUTER-08: checkRouterHealth 返回健康状态 ────────────────────────
  it("TC-ROUTER-08: checkRouterHealth() 返回 Claude 可用、GPT 沙箱受限的状态", async () => {
    process.env.DANTREE_MODE = "development";
    const { checkRouterHealth } = await import("./model_router");

    const health = await checkRouterHealth();

    expect(health.mode).toBe("development");
    expect(health.claude.available).toBe(true);
    expect(health.claude.latency_ms).toBeGreaterThan(0);
    // GPT 在沙箱中不可用（网络隔离）
    expect(health.gpt.available).toBe(false);
    expect(health.gpt.note).toContain("development mode");
  });

  // ─── TC-ROUTER-09: 未知 provider 抛出明确错误 ────────────────────────────
  it("TC-ROUTER-09: 未知模型 ID 触发明确错误提示", async () => {
    const { routeToModel } = await import("./model_router");

    await expect(
      routeToModel({
        task_type: "default",
        messages: mockMessages,
        override_model: "unknown-model-xyz-999",
      })
    ).rejects.toThrow("Cannot route to unknown provider");
  });
});
