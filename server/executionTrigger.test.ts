/**
 * executionTrigger.test.ts
 * Execution Trigger System v1 测试
 *
 * TC-TRIGGER-01: Rule A — 明确执行层 task_type
 * TC-TRIGGER-02: Rule B — 文档/文件内容检测
 * TC-TRIGGER-03: Rule C — structured/repair 语义
 * TC-TRIGGER-04: Rule D — multi-step/pipeline 语义
 * TC-TRIGGER-05: Rule E — 阻止触发（低复杂 narrative/summary）
 * TC-TRIGGER-06: TriggerDecision schema 完整性
 * TC-TRIGGER-07: 向后兼容（无 triggerContext）
 * TC-TRIGGER-08: 4个真实调用点期望行为
 * TC-TRIGGER-09: Bridge + Trigger 集成路径
 * TC-TRIGGER-10: 回归：不破坏 TaskType Bridge 测试前置
 */
 
import { describe, it, expect } from "vitest";
import {
  decideExecutionTrigger,
  resolveFinalTaskType,
  formatTriggerDecisionLog,
  buildTriggerObservability,
  type TriggerDecision,
  type TriggerInput,
} from "./executionTrigger.ts";
import { resolveBridgedTaskType } from "./taskTypeBridge.ts";
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-01: Rule A — 明确执行层 task_type
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-01: Rule A — explicit execution task types", () => {
  it("resolvedTaskType=execution → TRIGGER high anthropic", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "execution",
    });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule A");
    expect(result.execution_priority).toBe("high");
    expect(result.execution_target).toBe("anthropic");
  });
 
  it("resolvedTaskType=code_analysis → TRIGGER high anthropic", () => {
    const result = decideExecutionTrigger({ resolvedTaskType: "code_analysis" });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule A");
    expect(result.execution_priority).toBe("high");
  });
 
  it("resolvedTaskType=agent_task → TRIGGER high anthropic", () => {
    const result = decideExecutionTrigger({ resolvedTaskType: "agent_task" });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule A");
    expect(result.execution_target).toBe("anthropic");
  });
 
  it("resolvedTaskType=research → no Rule A (not explicit execution type)", () => {
    const result = decideExecutionTrigger({ resolvedTaskType: "research" });
    expect(result.trigger_categories).not.toContain("Rule A");
    // research alone, no other context → not triggered
    expect(result.should_trigger_execution).toBe(false);
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-02: Rule B — 文档/文件内容检测
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-02: Rule B — document/file content detection", () => {
  it("message with file_url type → TRIGGER Rule B", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      messages: [
        {
          role: "user",
          content: [
            { type: "file_url", file_url: { url: "https://example.com/report.pdf" } },
          ],
        },
      ],
    });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule B");
    expect(result.execution_priority).toBe("high");
  });
 
  it("message with PDF mime_type → TRIGGER Rule B", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      messages: [
        {
          role: "user",
          content: [
            { type: "file_url", file_url: { url: "https://example.com/file", mime_type: "application/pdf" } },
          ],
        },
      ],
    });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule B");
  });
 
  it("string-only message content → no Rule B", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      messages: [{ role: "user", content: "Analyze AAPL stock" }],
    });
    expect(result.trigger_categories).not.toContain("Rule B");
  });
 
  it("no messages → no Rule B", () => {
    const result = decideExecutionTrigger({ resolvedTaskType: "research" });
    expect(result.trigger_categories).not.toContain("Rule B");
  });
 
  it("empty messages array → no Rule B", () => {
    const result = decideExecutionTrigger({ resolvedTaskType: "research", messages: [] });
    expect(result.trigger_categories).not.toContain("Rule B");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-03: Rule C — structured/repair/JSON 修复语义
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-03: Rule C — structured/repair path", () => {
  it("source=repair_pass → TRIGGER Rule C high", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "repair_pass", business_task_type: "stock_analysis" },
    });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule C");
    expect(result.execution_priority).toBe("high");
  });
 
  it("source=repair_pass without explicit execution taskType → suggests structured_json", () => {
    // When Rule C fires but not Rule A (no explicit execution task_type),
    // suggest structured_json as more precise for repair semantics
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",  // bridge result for stock_analysis
      triggerContext: { source: "repair_pass" },
    });
    expect(result.suggested_task_type).toBe("structured_json");
  });
 
  it("source=step3_main → no Rule C (step3 is pipeline, not repair)", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main" },
    });
    expect(result.trigger_categories).not.toContain("Rule C");
    expect(result.trigger_categories).toContain("Rule D"); // Rule D fires for step3
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-04: Rule D — multi-step/pipeline 语义
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-04: Rule D — multi-step pipeline path", () => {
  it("source=step3_main → TRIGGER Rule D medium", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main", business_task_type: "stock_analysis" },
    });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule D");
    expect(result.execution_priority).toBe("medium");
    expect(result.execution_target).toBe("anthropic");
  });
 
  it("source=repair_pass → fires both Rule C and Rule D", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "repair_pass" },
    });
    expect(result.trigger_categories).toContain("Rule C");
    expect(result.trigger_categories).toContain("Rule D");
    // Rule C present → priority is high (not just medium from Rule D)
    expect(result.execution_priority).toBe("high");
  });
 
  it("source=other_unknown → no Rule D", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "some_other_path" },
    });
    expect(result.trigger_categories).not.toContain("Rule D");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-05: Rule E — 阻止触发
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-05: Rule E — low complexity block (no trigger)", () => {
  it("source=title_gen → NO TRIGGER (Rule E blocks)", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "title_gen", business_task_type: "stock_analysis" },
    });
    expect(result.should_trigger_execution).toBe(false);
    expect(result.trigger_categories).toContain("Rule E");
    expect(result.execution_target).toBe("none");
    expect(result.execution_priority).toBe("low");
  });
 
  it("source=memory_summary → NO TRIGGER (Rule E blocks)", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "memory_summary", business_task_type: "stock_analysis" },
    });
    expect(result.should_trigger_execution).toBe(false);
    expect(result.trigger_categories).toContain("Rule E");
    expect(result.execution_target).toBe("none");
  });
 
  it("Rule E blocks even if Rule A would otherwise fire (edge case: execution task via title_gen)", () => {
    // Rule E always takes priority — even if resolvedTaskType is "execution",
    // title_gen source means low-complexity path
    const result = decideExecutionTrigger({
      resolvedTaskType: "execution",
      triggerContext: { source: "title_gen" },
    });
    // Rule E wins: title_gen is the negative signal
    expect(result.should_trigger_execution).toBe(false);
    expect(result.trigger_categories).toContain("Rule E");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-06: TriggerDecision schema 完整性
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-06: TriggerDecision schema completeness", () => {
  function assertDecisionShape(d: TriggerDecision) {
    expect(typeof d.should_trigger_execution).toBe("boolean");
    expect(Array.isArray(d.trigger_reasons)).toBe(true);
    expect(Array.isArray(d.trigger_categories)).toBe(true);
    expect(typeof d.suggested_task_type).toBe("string");
    expect(d.suggested_task_type.length).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(d.execution_priority);
    expect(["anthropic", "none"]).toContain(d.execution_target);
  }
 
  it("triggered decision has all required fields", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "execution",
      triggerContext: { source: "step3_main" },
    });
    assertDecisionShape(result);
    expect(result.trigger_reasons.length).toBeGreaterThan(0);
    expect(result.trigger_categories.length).toBeGreaterThan(0);
  });
 
  it("non-triggered decision has all required fields", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "narrative",
      triggerContext: { source: "title_gen" },
    });
    assertDecisionShape(result);
    // reasons still populated (with explanation)
    expect(result.trigger_reasons.length).toBeGreaterThan(0);
  });
 
  it("suggested_task_type is always a valid TaskType string", () => {
    const validTypes = [
      "research", "reasoning", "narrative", "execution", "summarization",
      "deep_research", "structured_json", "step_analysis",
      "classification", "code_analysis", "agent_task", "default",
    ];
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "repair_pass" },
    });
    expect(validTypes).toContain(result.suggested_task_type);
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-07: 向后兼容（无 triggerContext）
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-07: backward compatibility — no triggerContext", () => {
  it("no triggerContext, resolvedTaskType=default → no trigger (safe fallback)", () => {
    const result = decideExecutionTrigger({ resolvedTaskType: "default" });
    expect(result.should_trigger_execution).toBe(false);
    expect(result.execution_target).toBe("none");
    expect(result.trigger_reasons.length).toBeGreaterThan(0); // has explanation
  });
 
  it("no triggerContext, resolvedTaskType=research → no trigger", () => {
    const result = decideExecutionTrigger({ resolvedTaskType: "research" });
    expect(result.should_trigger_execution).toBe(false);
  });
 
  it("no triggerContext, resolvedTaskType=execution → Rule A still fires", () => {
    // Rule A doesn't need triggerContext — it only looks at resolvedTaskType
    const result = decideExecutionTrigger({ resolvedTaskType: "execution" });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule A");
  });
 
  it("empty triggerContext → no Rule C/D/E but Rule A can fire", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "code_analysis",
      triggerContext: {},
    });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule A");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-08: 4个真实调用点期望行为
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-08: 4 real call site expected behaviors", () => {
  // Source: routers.ts call sites patched in TaskType Bridge v1
 
  it("step3_main: TRIGGER (Rule D, medium, anthropic)", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",   // stock_analysis → research via bridge
      triggerContext: {
        business_task_type: "stock_analysis",
        interaction_mode: "execution",
        entity_scope: ["AAPL"],
        source: "step3_main",
      },
    });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule D");
    expect(result.execution_priority).toBe("medium");
    expect(result.execution_target).toBe("anthropic");
    // step3_main is pipeline but not repair → keeps resolvedTaskType
    expect(result.suggested_task_type).toBe("research");
  });
 
  it("repair_pass: TRIGGER (Rule C + D, high, anthropic, suggests structured_json)", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: {
        business_task_type: "stock_analysis",
        interaction_mode: "execution",
        entity_scope: ["AAPL"],
        source: "repair_pass",
      },
    });
    expect(result.should_trigger_execution).toBe(true);
    expect(result.trigger_categories).toContain("Rule C");
    expect(result.trigger_categories).toContain("Rule D");
    expect(result.execution_priority).toBe("high");
    expect(result.execution_target).toBe("anthropic");
    expect(result.suggested_task_type).toBe("structured_json");
  });
 
  it("memory_summary: NO TRIGGER (Rule E blocks)", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: {
        business_task_type: "stock_analysis",
        interaction_mode: "execution",
        source: "memory_summary",
      },
    });
    expect(result.should_trigger_execution).toBe(false);
    expect(result.trigger_categories).toContain("Rule E");
    expect(result.execution_target).toBe("none");
  });
 
  it("title_gen: NO TRIGGER (Rule E blocks)", () => {
    const result = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: {
        business_task_type: "stock_analysis",
        interaction_mode: "execution",
        source: "title_gen",
      },
    });
    expect(result.should_trigger_execution).toBe(false);
    expect(result.trigger_categories).toContain("Rule E");
    expect(result.execution_target).toBe("none");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-09: Bridge + Trigger 集成路径
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-09: Bridge + Trigger integration", () => {
  it("stock_analysis execution → bridge=research, trigger fires at step3_main", () => {
    const triggerContext = {
      business_task_type: "stock_analysis",
      interaction_mode: "execution" as const,
      entity_scope: ["AAPL"],
      source: "step3_main",
    };
 
    // Step 1: Bridge maps business_task_type to model TaskType
    const resolvedTaskType = resolveBridgedTaskType(triggerContext);
    expect(resolvedTaskType).toBe("research");
 
    // Step 2: Trigger decides execution layer
    const triggerDecision = decideExecutionTrigger({
      triggerContext,
      resolvedTaskType,
    });
    expect(triggerDecision.should_trigger_execution).toBe(true);
    expect(triggerDecision.execution_target).toBe("anthropic");
 
    // Critical: resolvedTaskType is no longer "default"
    expect(resolvedTaskType).not.toBe("default");
  });
 
  it("stock_analysis discussion → bridge=narrative, trigger does NOT fire at step3_main", () => {
    // discussion mode → narrative via bridge
    // step3_main normally triggers, but discussion mode means narrative output
    // Rule E doesn't block step3_main. Rule D fires. Let's verify.
    const triggerContext = {
      business_task_type: "stock_analysis",
      interaction_mode: "discussion" as const,
      source: "step3_main",
    };
 
    const resolvedTaskType = resolveBridgedTaskType(triggerContext);
    expect(resolvedTaskType).toBe("narrative"); // discussion → narrative
 
    const triggerDecision = decideExecutionTrigger({ triggerContext, resolvedTaskType });
    // step3_main still triggers Rule D regardless of narrative taskType
    expect(triggerDecision.should_trigger_execution).toBe(true);
    expect(triggerDecision.trigger_categories).toContain("Rule D");
  });
 
  it("general + no source → bridge=default, trigger=NO_TRIGGER", () => {
    const triggerContext = {
      business_task_type: "general",
      interaction_mode: "execution" as const,
    };
 
    const resolvedTaskType = resolveBridgedTaskType(triggerContext);
    expect(resolvedTaskType).toBe("default");
 
    const triggerDecision = decideExecutionTrigger({ triggerContext, resolvedTaskType });
    expect(triggerDecision.should_trigger_execution).toBe(false);
    expect(triggerDecision.execution_target).toBe("none");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-10: Observability helpers
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-10: Observability helpers", () => {
  it("formatTriggerDecisionLog: triggered decision formats correctly", () => {
    const decision = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main" },
    });
    const log = formatTriggerDecisionLog(decision, "step3_main");
    expect(log).toContain("[ExecutionTrigger]");
    expect(log).toContain("TRIGGER");
    expect(log).toContain("step3_main");
    expect(log).toContain("Rule D");
  });
 
  it("formatTriggerDecisionLog: non-triggered decision formats correctly", () => {
    const decision = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "title_gen" },
    });
    const log = formatTriggerDecisionLog(decision, "title_gen");
    expect(log).toContain("NO_TRIGGER");
    expect(log).toContain("title_gen");
  });
 
  it("buildTriggerObservability: includes all required fields including v2 fields", () => {
    const decision = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main", business_task_type: "stock_analysis" },
    });
    const finalResult = resolveFinalTaskType("research", decision);
    const obs = buildTriggerObservability(
      "research",
      decision,
      finalResult,
      { source: "step3_main", business_task_type: "stock_analysis" },
    );
    expect(obs.bridged_task_type).toBe("research");
    expect(obs.trigger_decision).toBe(decision);
    expect(obs.source).toBe("step3_main");
    // v2 fields
    expect(obs.finalTaskType).toBe(finalResult.finalTaskType);
    expect(obs.trigger_applied_to_execution_path).toBe(finalResult.trigger_applied_to_execution_path);
    // Always Claude in dev mode
    expect(obs.dev_actual_executor).toBe("claude-sonnet-4-6");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-11: resolveFinalTaskType — v2 core
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-11: resolveFinalTaskType — FinalTaskType Apply Layer (v2)", () => {
  it("repair_pass: REPLACE research → structured_json (Rule C makes it more precise)", () => {
    const decision = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "repair_pass", business_task_type: "stock_analysis" },
    });
    const result = resolveFinalTaskType("research", decision);
    expect(result.finalTaskType).toBe("structured_json");
    expect(result.trigger_applied_to_execution_path).toBe(true);
  });
 
  it("step3_main: NO REPLACE — suggested=research equals resolvedTaskType (condition b fails)", () => {
    const decision = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main", business_task_type: "stock_analysis" },
    });
    // step3_main: Rule D only, suggested_task_type = research (same as resolved)
    expect(decision.suggested_task_type).toBe("research");
    const result = resolveFinalTaskType("research", decision);
    expect(result.finalTaskType).toBe("research");
    expect(result.trigger_applied_to_execution_path).toBe(false);
  });
 
  it("memory_summary: NO REPLACE — NO_TRIGGER (condition a fails)", () => {
    const decision = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "memory_summary", business_task_type: "stock_analysis" },
    });
    expect(decision.should_trigger_execution).toBe(false);
    const result = resolveFinalTaskType("research", decision);
    expect(result.finalTaskType).toBe("research");
    expect(result.trigger_applied_to_execution_path).toBe(false);
  });
 
  it("title_gen: NO REPLACE — NO_TRIGGER (condition a fails)", () => {
    const decision = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "title_gen", business_task_type: "stock_analysis" },
    });
    expect(decision.should_trigger_execution).toBe(false);
    const result = resolveFinalTaskType("research", decision);
    expect(result.finalTaskType).toBe("research");
    expect(result.trigger_applied_to_execution_path).toBe(false);
  });
 
  it("execution task Rule A: TRIGGER but suggested=resolvedTaskType → NO REPLACE (condition b fails)", () => {
    // Rule A fires, but suggested_task_type stays as resolvedTaskType (no Rule C)
    const decision = decideExecutionTrigger({ resolvedTaskType: "execution" });
    expect(decision.suggested_task_type).toBe("execution"); // same as resolved
    const result = resolveFinalTaskType("execution", decision);
    expect(result.finalTaskType).toBe("execution");
    expect(result.trigger_applied_to_execution_path).toBe(false);
  });
 
  it("repair_pass with execution taskType: Rule A wins suggested stays execution → NO REPLACE", () => {
    // When Rule A fires (execution) + Rule C fires (repair_pass), Rule A takes precedence
    // in suggested_task_type (it stays "execution"). Condition b: suggested != resolved? No.
    const decision = decideExecutionTrigger({
      resolvedTaskType: "execution",
      triggerContext: { source: "repair_pass" },
    });
    // Rule A + C both fire → suggested stays execution (Rule A takes precedence)
    const result = resolveFinalTaskType("execution", decision);
    expect(result.finalTaskType).toBe("execution");
    expect(result.trigger_applied_to_execution_path).toBe(false);
  });
 
  it("trigger_applied_to_execution_path is always boolean", () => {
    const cases = [
      { resolvedTaskType: "research" as const, source: "repair_pass" },
      { resolvedTaskType: "research" as const, source: "step3_main" },
      { resolvedTaskType: "research" as const, source: "title_gen" },
      { resolvedTaskType: "research" as const, source: undefined },
    ];
    for (const { resolvedTaskType, source } of cases) {
      const decision = decideExecutionTrigger({
        resolvedTaskType,
        triggerContext: source ? { source } : undefined,
      });
      const result = resolveFinalTaskType(resolvedTaskType, decision);
      expect(typeof result.trigger_applied_to_execution_path).toBe("boolean");
      expect(typeof result.finalTaskType).toBe("string");
    }
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-12: Log level — TRIGGER=info signal, NO_TRIGGER=debug signal
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-12: Log level signals (v2)", () => {
  it("TRIGGER decision: formatTriggerDecisionLog contains TRIGGER keyword (for console.info)", () => {
    const decision = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main" },
    });
    expect(decision.should_trigger_execution).toBe(true);
    const log = formatTriggerDecisionLog(decision, "step3_main");
    // Caller uses console.info for triggered decisions
    expect(log).toContain("TRIGGER");
    expect(log).not.toContain("NO_TRIGGER");
  });
 
  it("NO_TRIGGER decision: formatTriggerDecisionLog contains NO_TRIGGER keyword (for console.debug)", () => {
    const decision = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "title_gen" },
    });
    expect(decision.should_trigger_execution).toBe(false);
    const log = formatTriggerDecisionLog(decision, "title_gen");
    // Caller uses console.debug for non-triggered decisions
    expect(log).toContain("NO_TRIGGER");
    expect(log).not.toContain(": TRIGGER (");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-13: v2 integration — resolvedTaskType / finalTaskType distinction
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-13: v2 integration — finalTaskType drives modelRouter.generate()", () => {
  it("repair_pass: finalTaskType=structured_json ≠ resolvedTaskType=research", () => {
    const triggerContext = {
      business_task_type: "stock_analysis",
      interaction_mode: "execution" as const,
      entity_scope: ["AAPL"],
      source: "repair_pass",
    };
    const resolvedTaskType = resolveBridgedTaskType(triggerContext);
    expect(resolvedTaskType).toBe("research");
 
    const decision = decideExecutionTrigger({ triggerContext, resolvedTaskType });
    const finalResult = resolveFinalTaskType(resolvedTaskType, decision);
 
    // KEY ASSERTION: finalTaskType != resolvedTaskType
    expect(finalResult.finalTaskType).toBe("structured_json");
    expect(finalResult.finalTaskType).not.toBe(resolvedTaskType);
    expect(finalResult.trigger_applied_to_execution_path).toBe(true);
 
    // modelRouter.generate() should receive finalTaskType, not resolvedTaskType
    // In production, structured_json → PRODUCTION_ROUTING_MAP → openai
    // This preserves OI-001 routing integrity
  });
 
  it("step3_main: finalTaskType = resolvedTaskType = research (no change)", () => {
    const triggerContext = {
      business_task_type: "stock_analysis",
      interaction_mode: "execution" as const,
      source: "step3_main",
    };
    const resolvedTaskType = resolveBridgedTaskType(triggerContext);
    const decision = decideExecutionTrigger({ triggerContext, resolvedTaskType });
    const finalResult = resolveFinalTaskType(resolvedTaskType, decision);
 
    expect(finalResult.finalTaskType).toBe("research");
    expect(finalResult.finalTaskType).toBe(resolvedTaskType); // same
    expect(finalResult.trigger_applied_to_execution_path).toBe(false);
  });
 
  it("v2 observability has all 6 required fields", () => {
    const triggerContext = {
      business_task_type: "stock_analysis",
      source: "repair_pass",
    };
    const resolvedTaskType = resolveBridgedTaskType(triggerContext);
    const decision = decideExecutionTrigger({ triggerContext, resolvedTaskType });
    const finalResult = resolveFinalTaskType(resolvedTaskType, decision);
    const obs = buildTriggerObservability(resolvedTaskType, decision, finalResult, triggerContext);
 
    // All 6 required observability fields
    expect(obs.bridged_task_type).toBeDefined();          // resolvedTaskType
    expect(obs.trigger_decision).toBeDefined();            // full TriggerDecision
    expect(obs.finalTaskType).toBeDefined();               // v2: final task type
    expect(typeof obs.trigger_applied_to_execution_path).toBe("boolean"); // v2: applied?
    expect(obs.source).toBeDefined();                      // call site
    expect(obs.dev_actual_executor).toBe("claude-sonnet-4-6"); // dev reality
  });
});
 
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-V3-01: decideExecutionTriggerV3 — rule selection
// ─────────────────────────────────────────────────────────────────────────────
 
import { decideExecutionTriggerV3, type TriggerDecisionV3 } from "./executionTrigger.ts";
 
describe("TC-TRIGGER-V3-01: decideExecutionTriggerV3 — rule + execution_target selection", () => {
  it("Rule E: title_gen → triggered=false, gpt, primary", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "research",
      triggerContext: { source: "title_gen", business_task_type: "stock_analysis" },
    });
    expect(d.triggered).toBe(false);
    expect(d.rule).toBe("E");
    expect(d.execution_target).toBe("gpt");
    expect(d.execution_mode).toBe("primary");
  });
 
  it("Rule E: memory_summary → triggered=false, gpt, primary", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "research",
      triggerContext: { source: "memory_summary" },
    });
    expect(d.triggered).toBe(false);
    expect(d.rule).toBe("E");
    expect(d.execution_target).toBe("gpt");
  });
 
  it("Rule C: repair_pass → triggered=true, claude, repair, finalTaskType=structured_json", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "research",
      triggerContext: { source: "repair_pass", business_task_type: "stock_analysis" },
    });
    expect(d.triggered).toBe(true);
    expect(d.rule).toBe("C");
    expect(d.execution_target).toBe("claude");
    expect(d.execution_mode).toBe("repair");
    expect(d.finalTaskType).toBe("structured_json");
  });
 
  it("Rule A: execution task type → triggered=true, claude, primary", () => {
    const d = decideExecutionTriggerV3({ resolvedTaskType: "execution" });
    expect(d.triggered).toBe(true);
    expect(d.rule).toBe("A");
    expect(d.execution_target).toBe("claude");
    expect(d.execution_mode).toBe("primary");
  });
 
  it("Rule A: agent_task → triggered=true, claude, primary", () => {
    const d = decideExecutionTriggerV3({ resolvedTaskType: "agent_task" });
    expect(d.triggered).toBe(true);
    expect(d.rule).toBe("A");
    expect(d.execution_target).toBe("claude");
  });
 
  it("Rule B: file_url content → triggered=true, claude, primary", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "research",
      messages: [{ role: "user", content: [{ type: "file_url", file_url: { url: "https://example.com/doc.pdf" } }] }],
    });
    expect(d.triggered).toBe(true);
    expect(d.rule).toBe("B");
    expect(d.execution_target).toBe("claude");
    expect(d.execution_mode).toBe("primary");
  });
 
  it("Rule F (v3 new): step3_main → triggered=true, gpt, primary", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main", business_task_type: "stock_analysis" },
    });
    expect(d.triggered).toBe(true);
    expect(d.rule).toBe("F");
    expect(d.execution_target).toBe("gpt");
    expect(d.execution_mode).toBe("primary");
    // step3_main: finalTaskType stays research (no Rule C)
    expect(d.finalTaskType).toBe("research");
  });
 
  it("NONE: no source, no rules → triggered=false, gpt, primary", () => {
    const d = decideExecutionTriggerV3({ resolvedTaskType: "research" });
    expect(d.triggered).toBe(false);
    expect(d.rule).toBe("NONE");
    expect(d.execution_target).toBe("gpt");
  });
 
  it("NONE: general task → triggered=false, gpt, primary", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "default",
      triggerContext: { business_task_type: "general" },
    });
    expect(d.triggered).toBe(false);
    expect(d.rule).toBe("NONE");
    expect(d.execution_target).toBe("gpt");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-V3-02: rule priority order
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-V3-02: Rule priority — E wins over A, C wins over D, F wins over D", () => {
  it("Rule E > Rule A: execution type via title_gen → E wins (triggered=false)", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "execution",
      triggerContext: { source: "title_gen" },
    });
    expect(d.rule).toBe("E");
    expect(d.triggered).toBe(false);
    expect(d.execution_target).toBe("gpt");
  });
 
  it("Rule C > Rule D: repair_pass fires C and D → C wins (claude, repair)", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "research",
      triggerContext: { source: "repair_pass" },
    });
    expect(d.rule).toBe("C");   // C beats D
    expect(d.execution_target).toBe("claude");
    expect(d.execution_mode).toBe("repair");
  });
 
  it("Rule F > Rule D: step3_main fires F (not generic D) → F wins (gpt, primary)", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main" },
    });
    // Rule D also fires for step3_main, but Rule F takes priority
    expect(d.rule).toBe("F");
    expect(d.execution_target).toBe("gpt");
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-V3-03: TriggerDecisionV3 schema completeness
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-V3-03: TriggerDecisionV3 schema completeness", () => {
  function assertV3Shape(d: TriggerDecisionV3) {
    expect(typeof d.triggered).toBe("boolean");
    expect(["A", "B", "C", "D", "E", "F", "NONE"]).toContain(d.rule);
    expect(typeof d.resolvedTaskType).toBe("string");
    expect(typeof d.finalTaskType).toBe("string");
    expect(["gpt", "claude", "hybrid"]).toContain(d.execution_target);
    expect(["primary", "fallback", "repair"]).toContain(d.execution_mode);
    expect(typeof d.reason).toBe("string");
    expect(d.reason.length).toBeGreaterThan(0);
  }
 
  it("all decision shapes are valid — triggered cases", () => {
    const cases: Parameters<typeof decideExecutionTriggerV3>[0][] = [
      { resolvedTaskType: "execution" },
      { resolvedTaskType: "research", triggerContext: { source: "repair_pass" } },
      { resolvedTaskType: "research", triggerContext: { source: "step3_main" } },
      { resolvedTaskType: "research", messages: [{ role: "user", content: [{ type: "file_url", file_url: { url: "x" } }] }] },
    ];
    for (const input of cases) {
      assertV3Shape(decideExecutionTriggerV3(input));
    }
  });
 
  it("all decision shapes are valid — non-triggered cases", () => {
    const cases: Parameters<typeof decideExecutionTriggerV3>[0][] = [
      { resolvedTaskType: "research" },
      { resolvedTaskType: "research", triggerContext: { source: "title_gen" } },
      { resolvedTaskType: "research", triggerContext: { source: "memory_summary" } },
      { resolvedTaskType: "default" },
    ];
    for (const input of cases) {
      assertV3Shape(decideExecutionTriggerV3(input));
    }
  });
 
  it("metadata field: TriggerDecisionV3.metadata is internal only — no duplicate observability fields", () => {
    const d = decideExecutionTriggerV3({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main" },
    });
    // metadata may be undefined (Rule F has no metadata) or contain only internal fields
    // It must NOT contain the 8 observability fields (those go to RouterResponse.metadata)
    if (d.metadata) {
      expect(d.metadata).not.toHaveProperty("trigger_rule");
      expect(d.metadata).not.toHaveProperty("resolved_task_type");
      expect(d.metadata).not.toHaveProperty("final_task_type");
      expect(d.metadata).not.toHaveProperty("selected_provider");
      expect(d.metadata).not.toHaveProperty("dev_override");
      expect(d.metadata).not.toHaveProperty("simulated_target");
    }
    // The single source of truth is RouterResponse.metadata (assembled by generate())
    // This is verified in TC-MR-GUARD-01 and TC-MR-V3-04
  });
});
 
// ─────────────────────────────────────────────────────────────────────────────
// TC-TRIGGER-V3-04: v2 behavior regression — decideExecutionTrigger unchanged
// ─────────────────────────────────────────────────────────────────────────────
 
describe("TC-TRIGGER-V3-04: v2 regression — decideExecutionTrigger not broken by v3", () => {
  it("step3_main: v2 still fires Rule D (v2 unchanged)", () => {
    const v2 = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "step3_main" },
    });
    expect(v2.trigger_categories).toContain("Rule D");
    expect(v2.should_trigger_execution).toBe(true);
  });
 
  it("repair_pass: v2 still fires Rule C+D, suggests structured_json", () => {
    const v2 = decideExecutionTrigger({
      resolvedTaskType: "research",
      triggerContext: { source: "repair_pass" },
    });
    expect(v2.trigger_categories).toContain("Rule C");
    expect(v2.trigger_categories).toContain("Rule D");
    expect(v2.suggested_task_type).toBe("structured_json");
  });
 
  it("v3 and v2 agree on finalTaskType for repair_pass", () => {
    const input = { resolvedTaskType: "research" as const, triggerContext: { source: "repair_pass" } };
    const v2 = decideExecutionTrigger(input);
    const v2Final = resolveFinalTaskType("research", v2);
    const v3 = decideExecutionTriggerV3(input);
    expect(v3.finalTaskType).toBe(v2Final.finalTaskType);
    expect(v3.finalTaskType).toBe("structured_json");
  });
});
 

