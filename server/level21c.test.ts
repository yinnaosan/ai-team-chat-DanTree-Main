/**
 * DANTREE_LEVEL21C_EXECUTION_CLOSURE — Vitest Tests
 *
 * Tests:
 * 1. runStep0Revalidation() — real LLM call mock
 * 2. bindStep0Result() — binding logic
 * 3. dispatchNextProbeFromHistoryControl() — hard routing
 * 4. enforceRoutingPriority() — priority trace
 * 5. buildExecutionPathTrace() — path divergence
 * 6. LoopState LEVEL21C fields — initLoopState, bind, apply, record
 */

import { describe, it, expect, vi } from "vitest";
import {
  runStep0Revalidation,
  bindStep0Result,
  dispatchNextProbeFromHistoryControl,
  enforceRoutingPriority,
  buildExecutionPathTrace,
  type Step0Result,
  type HistoryBootstrap,
} from "./historyBootstrap";
import {
  initLoopState,
  attachStep0ToLoopState,
  bindStep0ResultToLoopState,
  applyDispatchToLoopState,
  recordExecutedStep,
} from "./loopStateTriggerEngine";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBootstrap(overrides: Partial<HistoryBootstrap> = {}): HistoryBootstrap {
  return {
    has_prior_history: true,
    prior_decision_count: 2,
    history_quality: "good",
    recent_decisions: [
      {
        id: 1,
        userId: 1,
        ticker: "AAPL",
        action: "BUY",
        state: "HIGH confidence",
        cycle: "bull",
        timing: "early",
        verdict: "Strong buy thesis",
        createdAt: new Date(Date.now() - 14 * 86400000),
      },
    ],
    previous_action: "BUY",
    previous_state: "HIGH confidence",
    previous_cycle: "bull",
    previous_timing: "early",
    previous_verdict: "Strong buy thesis",
    previous_key_thesis: "AI revenue acceleration",
    previous_risks: "valuation risk",
    action_pattern: "BUY",
    days_since_last_decision: 14,
    history_requires_control: true,
    revalidation_mandatory: true,
    preferred_probe_order: ["risk_probe", "valuation_probe"],
    history_control_reason: "Prior BUY 14 days ago — mandatory revalidation",
    previous_confidence: "high",
    ...overrides,
  };
}

function makeStep0Result(overrides: Partial<Step0Result> = {}): Step0Result {
  return {
    revalidation_verdict: "Prior BUY thesis still holds — AI revenue acceleration intact",
    prior_thesis_still_valid: true,
    weakening_signals: ["valuation stretched"],
    strengthening_signals: ["revenue beat"],
    required_follow_up_probe: "risk_probe",
    thesis_tension_level: "medium",
    ...overrides,
  };
}

// ── Suite 1: bindStep0Result ──────────────────────────────────────────────────

describe("bindStep0Result", () => {
  it("high tension + invalid → low confidence, forces continuation", () => {
    const result = makeStep0Result({
      prior_thesis_still_valid: false,
      thesis_tension_level: "high",
      required_follow_up_probe: "reversal_check",
    });
    const binding = bindStep0Result(result);
    expect(binding.step0_confidence).toBe("low");
    expect(binding.step0_forces_continuation).toBe(true);
    expect(binding.step0_allows_early_stop).toBe(false);
    expect(binding.step0_followup_probe).toBe("reversal_check");
  });

  it("low tension + valid + no follow-up → high confidence, allows early stop", () => {
    const result = makeStep0Result({
      prior_thesis_still_valid: true,
      thesis_tension_level: "low",
      required_follow_up_probe: "",
    });
    const binding = bindStep0Result(result);
    expect(binding.step0_confidence).toBe("high");
    expect(binding.step0_allows_early_stop).toBe(true);
    expect(binding.step0_forces_continuation).toBe(false);
  });

  it("medium tension → medium confidence", () => {
    const result = makeStep0Result({ thesis_tension_level: "medium" });
    const binding = bindStep0Result(result);
    expect(binding.step0_confidence).toBe("medium");
  });
});

// ── Suite 2: dispatchNextProbeFromHistoryControl ──────────────────────────────

describe("dispatchNextProbeFromHistoryControl", () => {
  it("Step0 explicit probe takes Priority A", () => {
    const step0Result = makeStep0Result({ required_follow_up_probe: "reversal_check" });
    const binding = bindStep0Result(step0Result);
    const dispatch = dispatchNextProbeFromHistoryControl({
      previousAction: "BUY",
      step0Binding: binding,
      alreadyRanProbes: [],
    });
    expect(dispatch.dispatched_step_type).toBe("reversal_check");
    expect(dispatch.routing_source).toBe("step0_override");
  });

  it("History table used when Step0 probe is empty", () => {
    const step0Result = makeStep0Result({ required_follow_up_probe: "" });
    const binding = bindStep0Result(step0Result);
    const dispatch = dispatchNextProbeFromHistoryControl({
      previousAction: "BUY",
      step0Binding: binding,
      alreadyRanProbes: [],
    });
    expect(dispatch.dispatched_step_type).toBe("risk_probe");
    expect(dispatch.routing_source).toBe("history_table");
  });

  it("SELL → business_probe from history table", () => {
    const binding = bindStep0Result(makeStep0Result({ required_follow_up_probe: "" }));
    const dispatch = dispatchNextProbeFromHistoryControl({
      previousAction: "SELL",
      step0Binding: binding,
      alreadyRanProbes: [],
    });
    expect(dispatch.dispatched_step_type).toBe("business_probe");
  });

  it("WAIT → trigger_condition_check from history table", () => {
    const binding = bindStep0Result(makeStep0Result({ required_follow_up_probe: "" }));
    const dispatch = dispatchNextProbeFromHistoryControl({
      previousAction: "WAIT",
      step0Binding: binding,
      alreadyRanProbes: [],
    });
    expect(dispatch.dispatched_step_type).toBe("trigger_condition_check");
  });

  it("Already-ran probe is skipped", () => {
    const binding = bindStep0Result(makeStep0Result({ required_follow_up_probe: "" }));
    const dispatch = dispatchNextProbeFromHistoryControl({
      previousAction: "BUY",
      step0Binding: binding,
      alreadyRanProbes: ["risk_probe"],
    });
    // risk_probe already ran, should fall back to controller_override
    expect(dispatch.dispatched_step_type).toBe("thesis_update");
    expect(dispatch.routing_source).toBe("controller_override");
  });
});

// ── Suite 3: enforceRoutingPriority ──────────────────────────────────────────

describe("enforceRoutingPriority", () => {
  it("Step0 probe is first in priority list", () => {
    const binding = bindStep0Result(makeStep0Result({ required_follow_up_probe: "reversal_check" }));
    const trace = enforceRoutingPriority({
      previousAction: "BUY",
      step0Binding: binding,
      preferredProbeOrder: ["risk_probe", "valuation_probe"],
      alreadyRanProbes: [],
    });
    expect(trace.routing_priority[0]).toBe("reversal_check");
    expect(trace.selected_probe).toBe("reversal_check");
    expect(trace.routing_source).toBe("step0_override");
    expect(trace.routing_enforced).toBe(true);
  });

  it("Preferred probe order respected after Step0", () => {
    const binding = bindStep0Result(makeStep0Result({ required_follow_up_probe: "" }));
    const trace = enforceRoutingPriority({
      previousAction: "BUY",
      step0Binding: binding,
      preferredProbeOrder: ["valuation_probe", "risk_probe"],
      alreadyRanProbes: [],
    });
    // valuation_probe is first in preferred order
    expect(trace.selected_probe).toBe("valuation_probe");
  });

  it("Skipped probes are recorded", () => {
    const binding = bindStep0Result(makeStep0Result({ required_follow_up_probe: "reversal_check" }));
    const trace = enforceRoutingPriority({
      previousAction: "BUY",
      step0Binding: binding,
      preferredProbeOrder: ["risk_probe"],
      alreadyRanProbes: ["reversal_check"],
    });
    expect(trace.skipped_probes.some(s => s.includes("reversal_check"))).toBe(true);
    expect(trace.selected_probe).toBe("risk_probe");
  });
});

// ── Suite 4: buildExecutionPathTrace ─────────────────────────────────────────

describe("buildExecutionPathTrace", () => {
  it("No divergence when all intended steps executed", () => {
    const trace = buildExecutionPathTrace({
      intendedPath: ["step0_revalidation", "risk_probe"],
      executedPath: ["step0_revalidation", "risk_probe"],
      stopReason: "history_reaffirmed",
    });
    expect(trace.path_divergence).toHaveLength(0);
    expect(trace.final_execution_summary).toContain("2 step(s)");
  });

  it("Divergence detected when intended step not executed", () => {
    const trace = buildExecutionPathTrace({
      intendedPath: ["step0_revalidation", "risk_probe", "thesis_update"],
      executedPath: ["step0_revalidation"],
      stopReason: "history_reaffirmed",
    });
    expect(trace.path_divergence).toHaveLength(2);
    expect(trace.path_divergence[0]).toContain("risk_probe");
  });

  it("Empty executed path produces summary", () => {
    const trace = buildExecutionPathTrace({
      intendedPath: ["step0_revalidation"],
      executedPath: [],
      stopReason: "budget_exhausted",
    });
    expect(trace.final_execution_summary).toBe("No steps executed");
  });
});

// ── Suite 5: LoopState LEVEL21C fields ───────────────────────────────────────

describe("LoopState LEVEL21C fields", () => {
  it("initLoopState has all LEVEL21C fields initialized", () => {
    const state = initLoopState();
    expect(state.step0_result).toBeNull();
    expect(state.step0_binding).toBeNull();
    expect(state.dispatch_result).toBeNull();
    expect(state.routing_trace).toBeNull();
    expect(state.executed_path).toEqual([]);
    expect(state.intended_path).toEqual([]);
  });

  it("attachStep0ToLoopState adds step0_revalidation to intended_path", () => {
    const state = initLoopState();
    const step0 = {
      step_type: "thesis_revalidation" as const,
      objective: "test",
      trigger_reason: "test",
      previous_action: "BUY",
      previous_thesis: "test",
      revalidation_focus: ["risk"],
      fields_needed: ["price"],
      continue_recommended: true,
      ran: false,
    };
    const updated = attachStep0ToLoopState(state, step0);
    expect(updated.step0_ran).toBe(true);
    expect(updated.intended_path).toContain("step0_revalidation");
  });

  it("bindStep0ResultToLoopState adds step0_revalidation to executed_path", () => {
    const state = initLoopState();
    const step0Result = makeStep0Result();
    const binding = bindStep0Result(step0Result);
    const updated = bindStep0ResultToLoopState(state, step0Result, binding);
    expect(updated.step0_result).not.toBeNull();
    expect(updated.step0_binding).not.toBeNull();
    expect(updated.executed_path).toContain("step0_revalidation");
  });

  it("applyDispatchToLoopState sets dispatch_result and routing_trace", () => {
    const state = initLoopState();
    const binding = bindStep0Result(makeStep0Result({ required_follow_up_probe: "" }));
    const dispatch = dispatchNextProbeFromHistoryControl({
      previousAction: "BUY",
      step0Binding: binding,
      alreadyRanProbes: [],
    });
    const trace = enforceRoutingPriority({
      previousAction: "BUY",
      step0Binding: binding,
      preferredProbeOrder: ["risk_probe"],
      alreadyRanProbes: [],
    });
    const updated = applyDispatchToLoopState(state, dispatch, trace);
    expect(updated.dispatch_result).not.toBeNull();
    expect(updated.routing_trace).not.toBeNull();
    expect(updated.intended_path).toContain(dispatch.dispatched_step_type);
  });

  it("recordExecutedStep adds step to executed_path without duplication", () => {
    const state = initLoopState();
    const s1 = recordExecutedStep(state, "risk_probe");
    const s2 = recordExecutedStep(s1, "risk_probe"); // duplicate
    expect(s1.executed_path).toEqual(["risk_probe"]);
    expect(s2.executed_path).toEqual(["risk_probe"]); // no duplicate
  });
});

// ── Suite 6: runStep0Revalidation (mocked LLM) ───────────────────────────────

describe("runStep0Revalidation (mocked)", () => {
  it("returns parsed Step0Result from LLM response", async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            revalidation_verdict: "Prior BUY thesis still valid",
            prior_thesis_still_valid: true,
            weakening_signals: ["valuation stretched"],
            strengthening_signals: ["revenue beat"],
            required_follow_up_probe: "risk_probe",
            thesis_tension_level: "medium",
          }),
        },
      }],
    });

    const bootstrap = makeBootstrap();
    const result = await runStep0Revalidation({
      invokeLLM: mockLLM as Parameters<typeof runStep0Revalidation>[0]["invokeLLM"],
      bootstrap,
      currentQuery: "Is AAPL still worth buying?",
    });

    expect(result.prior_thesis_still_valid).toBe(true);
    expect(result.thesis_tension_level).toBe("medium");
    expect(result.required_follow_up_probe).toBe("risk_probe");
    expect(mockLLM).toHaveBeenCalledOnce();
  });

  it("returns fallback on LLM failure (non-fatal)", async () => {
    const mockLLM = vi.fn().mockRejectedValue(new Error("LLM timeout"));
    const bootstrap = makeBootstrap();
    const result = await runStep0Revalidation({
      invokeLLM: mockLLM as Parameters<typeof runStep0Revalidation>[0]["invokeLLM"],
      bootstrap,
      currentQuery: "test",
    });
    // Non-fatal fallback
    expect(result.prior_thesis_still_valid).toBe(true);
    expect(result.revalidation_verdict).toContain("failed");
  });
});
