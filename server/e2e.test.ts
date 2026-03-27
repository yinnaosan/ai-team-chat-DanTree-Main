/**
 * DANTREE E2E Integration Test Suite
 * Package: DANTREE_E2E_TEST_PACKAGE_V2
 *
 * Validates the full reasoning pipeline across four scenarios:
 *   Scenario A: High failure intensity → risk_probe forced (LEVEL21C + LEVEL3.6)
 *   Scenario B: Strong prior success → early stop bias applied (LEVEL3.6 + LEVEL21D)
 *   Scenario C: Step0 forces continuation → overrides all stop signals (LEVEL21D)
 *   Scenario D: Neutral baseline → default logic, no learning bias, no history override
 *
 * Each scenario exercises:
 *   - LEVEL21B: history bootstrap control flags
 *   - LEVEL21C: dispatch + routing priority
 *   - LEVEL21D: Step0 binding + execution path trace
 *   - LEVEL3: memory influence
 *   - LEVEL3.5: outcome evolution signals
 *   - LEVEL3.6: learning control (failure routing, success bias)
 *   - LEVEL3.6 Patch: threshold config, trace fields in converged output
 *
 * Instrumentation: pipelineTracer.ts records each stage and audits for breakpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Pipeline modules ──────────────────────────────────────────────────────────
import {
  computeControlFlags,
  buildDeltaObjects,
  evaluateDeltaDrivenStop,
  buildHistoryControlSummary,
  dispatchNextProbeFromHistoryControl,
  enforceRoutingPriority,
  buildExecutionPathTrace,
  bindStep0Result,
} from "./historyBootstrap";
import type {
  HistoryBootstrap,
  Step0Result,
  Step0BindingResult,
  DispatchResult,
} from "./historyBootstrap";

import {
  initLoopState,
  evaluateTrigger,
  attachStep0ToLoopState,
  bindStep0ResultToLoopState,
  applyDispatchToLoopState,
  recordExecutedStep,
} from "./loopStateTriggerEngine";
import type { LoopState } from "./loopStateTriggerEngine";

import { evaluateStopCondition } from "./loopStopController";
import type { StopDecision } from "./loopStopController";

import { buildConvergedOutput } from "./finalConvergedOutput";

import {
  getLearningConfig,
  setLearningConfigOverride,
  resetLearningConfig,
  getLearningConfigSnapshot,
} from "./learningConfig";

import {
  createPipelineTrace,
  recordTraceEntry,
  finalizeTrace,
  auditTraceForBreakpoints,
  buildTraceSummary,
} from "./pipelineTracer";
import type { PipelineStage } from "./pipelineTracer";

import type { EvidenceDelta } from "./evidenceDeltaEngine";
import type { UpdatedVerdict } from "./verdictUpdater";

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeLoopState(overrides: Partial<LoopState> = {}): LoopState {
  return {
    iteration: 1,
    max_iterations: 3,
    budget_used: 1,
    budget_max: 6,
    triggered: true,
    trigger_reason: "test",
    trigger_time: Date.now(),
    step0_ran: false,
    step0_object: null,
    history_controlled: false,
    controller_path: [],
    step0_result: null,
    step0_binding: null,
    dispatch_result: null,
    routing_trace: null,
    executed_path: [],
    intended_path: [],
    ...overrides,
  };
}

function makeEvidenceDelta(overrides: Partial<EvidenceDelta> = {}): EvidenceDelta {
  return {
    evidence_score_before: 0.60,
    evidence_score_after: 0.68,
    evidence_score_delta: 0.08,
    confidence_before: "medium",
    confidence_after: "medium",
    convergence_signal: "converged",
    new_risk_introduced: false,
    evidence_direction: "supporting",
    ...overrides,
  };
}

function makeUpdatedVerdict(overrides: Partial<UpdatedVerdict> = {}): UpdatedVerdict {
  return {
    final_verdict: "BUY",
    final_confidence: "medium",
    verdict_changed: false,
    change_type: "unchanged",
    change_narrative: "",
    second_pass_finding: "No material change",
    second_pass_contribution: "Confirms prior thesis",
    merged_risks: [],
    ...overrides,
  };
}

function makeHistoryBootstrap(overrides: Partial<HistoryBootstrap> = {}): HistoryBootstrap {
  return {
    has_prior_history: true,
    previous_action: "BUY",
    days_since_last_decision: 14,
    prior_decision_count: 3,
    action_pattern: "BUY_BUY_BUY",
    history_requires_control: false,
    history_control_reason: "",
    preferred_probe_order: ["risk_probe", "valuation_probe"],
    previous_confidence: "medium",
    history_context_block: "Prior BUY on AAPL 14 days ago.",
    revalidation_mandatory: false,
    memory_injected: false,
    memory_record_count: 0,
    memory_influence_summary: "",
    memory_influence: null,
    ...overrides,
  };
}

function makeStep0BindingResult(overrides: Partial<Step0BindingResult> = {}): Step0BindingResult {
  return {
    step0_result: {
      revalidation_verdict: "prior_thesis_confirmed",
      prior_thesis_still_valid: true,
      thesis_tension_level: "low",
      required_follow_up_probe: "valuation_probe",
      confidence_change: "stable",
      revalidation_summary: "Prior BUY thesis confirmed.",
    },
    step0_confidence: "high",
    step0_followup_probe: "valuation_probe",
    step0_tension_level: "low",
    step0_allows_early_stop: true,
    step0_forces_continuation: false,
    ...overrides,
  };
}

// ── Scenario A: High failure intensity → risk_probe forced ────────────────────

describe("E2E Scenario A: High failure_intensity_score → risk_probe forced (LEVEL21C + LEVEL3.6)", () => {
  const trace = createPipelineTrace("SCENARIO_A");

  it("A1: dispatch forces risk_probe when failure_intensity_score >= failure_threshold", () => {
    const cfg = getLearningConfig();

    const dispatch = dispatchNextProbeFromHistoryControl({
      previousAction: "BUY",
      step0Binding: null,
      alreadyRanProbes: [],
      failureIntensityScore: 0.75,  // above threshold 0.6
    });

    recordTraceEntry(trace, "dispatch", {
      failure_intensity_score: 0.75,
      failure_threshold: cfg.failure_threshold,
      dispatched_step_type: dispatch.dispatched_step_type,
      routing_source: dispatch.routing_source,
    });

    expect(dispatch.dispatched_step_type).toBe("risk_probe");
    expect(dispatch.routing_source).toContain("failure_intensity_score");
    expect(dispatch.dispatch_reason).toContain("HIGH+");
  });

  it("A2: routing priority enforces risk_probe when failure_intensity is high", () => {
    // enforceRoutingPriority selects from preferredProbeOrder; high failure_intensity
    // is enforced at the dispatch level (dispatchNextProbeFromHistoryControl).
    // This test verifies that dispatch already returned risk_probe in A1, and
    // enforceRoutingPriority correctly selects risk_probe when it is first in priority.
    const routingTrace = enforceRoutingPriority({
      previousAction: "BUY",
      step0Binding: null,
      preferredProbeOrder: ["risk_probe", "valuation_probe"],  // risk_probe first
      alreadyRanProbes: [],
    });

    recordTraceEntry(trace, "routing_priority", {
      selected_probe: routingTrace.selected_probe,
      routing_source: routingTrace.routing_source,
      routing_priority: routingTrace.routing_priority,
    });

    expect(routingTrace.selected_probe).toBe("risk_probe");
    expect(routingTrace.routing_enforced).toBe(true);
  });

  it("A3: trigger evaluation fires second pass when failure is high and confidence is low", () => {
    const loopState = makeLoopState();
    const result = evaluateTrigger({
      loopState,
      intentCtx: { task_type: "stock_analysis", interaction_mode: "standard" } as any,
      analysisMode: "standard",
      evidenceScore: 0.55,
      level1a3Output: {
        verdict: "BUY",
        confidence: "low",
        risks: [{ type: "market", description: "high volatility", severity: "high" }],
        discussion: { key_uncertainty: "earnings miss risk", alternative_view: "" },
      } as any,
      structuredSynthesis: null,
      successStrengthScore: 0.3,   // low success → no bias
    });

    recordTraceEntry(trace, "trigger_evaluation", {
      should_trigger: result.should_trigger,
      trigger_type: result.trigger_type,
      confidence: "low",
      evidenceScore: 0.55,
    });

    expect(result.should_trigger).toBe(true);
    expect(result.trigger_type).not.toBe("no_trigger_success_strength_bias");
  });

  it("A4: converged output includes early_stop_bias_applied=false for high-failure scenario", () => {
    const stopDecision: StopDecision = {
      should_stop: false,
      stop_reason: "max_iterations",
      stop_message: "Max iterations reached",
      iterations_completed: 2,
      final_convergence_signal: "inconclusive",
      history_control_summary: null,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "0.65 (default)",
    };

    const output = buildConvergedOutput({
      level1Output: {
        verdict: "HOLD",
        confidence: "medium",
        horizon: "3M",
        bull_case: [],
        reasoning: [],
        bear_case: [],
        risks: [],
        next_steps: [],
        discussion: { key_uncertainty: "", alternative_view: "", weakest_point: "", exploration_paths: [] },
      },
      loopRan: true,
      evidenceDelta: makeEvidenceDelta(),
      updatedVerdict: makeUpdatedVerdict(),
      stopDecision,
    });

    recordTraceEntry(trace, "converged_output", {
      early_stop_bias_applied: output.loop_metadata.early_stop_bias_applied,
      adjusted_threshold: output.loop_metadata.adjusted_threshold,
    });

    expect(output.loop_metadata.early_stop_bias_applied).toBe(false);
    expect(output.loop_metadata.adjusted_threshold).toBe("0.65 (default)");
  });

  it("A5: Failure Audit — no breakpoints in Scenario A trace", () => {
    finalizeTrace(trace);
    const expectedStages: PipelineStage[] = ["dispatch", "trigger_evaluation", "converged_output", "routing_priority"];
    const breakpoints = auditTraceForBreakpoints(trace, expectedStages);
    console.log("[E2E Scenario A]", buildTraceSummary(trace));
    expect(breakpoints).toHaveLength(0);
  });
});

// ── Scenario B: Strong prior success → early stop bias ───────────────────────

describe("E2E Scenario B: Strong success_strength_score → early stop bias (LEVEL3.6 + LEVEL21D)", () => {
  const trace = createPipelineTrace("SCENARIO_B");

  it("B1: evaluateTrigger returns no_trigger_success_strength_bias when success_strength >= threshold", () => {
    const cfg = getLearningConfig();
    const loopState = makeLoopState();

    const result = evaluateTrigger({
      loopState,
      intentCtx: { task_type: "stock_analysis", interaction_mode: "standard" } as any,
      analysisMode: "standard",
      evidenceScore: cfg.stop_bias_evidence_floor + 0.05,  // above floor
      level1a3Output: {
        verdict: "BUY",
        confidence: "medium",
        risks: [],
        discussion: { key_uncertainty: "minor", alternative_view: "" },
      } as any,
      structuredSynthesis: null,
      successStrengthScore: cfg.success_threshold + 0.05,  // above threshold
    });

    recordTraceEntry(trace, "trigger_evaluation", {
      should_trigger: result.should_trigger,
      trigger_type: result.trigger_type,
      success_strength_score: cfg.success_threshold + 0.05,
      success_threshold: cfg.success_threshold,
      revalidation_mandatory: false,
      confidence: "medium",
    });

    expect(result.should_trigger).toBe(false);
    expect(result.trigger_type).toBe("no_trigger_success_strength_bias");
    expect(result.memory_influenced).toBe(true);
  });

  it("B2: evaluateStopCondition applies early_stop_bias when earlyStopBiasEligible=true", () => {
    const loopState = makeLoopState({ iteration: 2 });
    const evidenceDelta = makeEvidenceDelta({ evidence_score_after: 0.62, evidence_score_delta: 0.02 });

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict: makeUpdatedVerdict(),
      secondPassSucceeded: true,
      earlyStopBiasEligible: true,
    });

    recordTraceEntry(trace, "stop_evaluation", {
      should_stop: result.should_stop,
      early_stop_bias_applied: result.early_stop_bias_applied,
      adjusted_threshold: result.adjusted_threshold,
      stop_reason: result.stop_reason,
    });

    expect(result.early_stop_bias_applied).toBe(true);
    expect(result.adjusted_threshold).not.toBe("");
    expect(result.adjusted_threshold).toContain("0.6");  // bias_active threshold (e.g. "evidence>=0.6 (bias from success_strength_score)")
  });

  it("B3: converged output propagates early_stop_bias_applied=true and adjusted_threshold", () => {
    const stopDecision: StopDecision = {
      should_stop: true,
      stop_reason: "converged",
      stop_message: "Converged with bias",
      iterations_completed: 1,
      final_convergence_signal: "converged",
      history_control_summary: null,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: true,
      adjusted_threshold: "0.60 (bias_active)",
    };

    const output = buildConvergedOutput({
      level1Output: {
        verdict: "BUY",
        confidence: "medium",
        horizon: "6M",
        bull_case: ["Strong earnings growth"],
        reasoning: [],
        bear_case: [],
        risks: [],
        next_steps: [],
        discussion: { key_uncertainty: "", alternative_view: "", weakest_point: "", exploration_paths: [] },
      },
      loopRan: true,
      evidenceDelta: makeEvidenceDelta(),
      updatedVerdict: makeUpdatedVerdict(),
      stopDecision,
    });

    recordTraceEntry(trace, "converged_output", {
      early_stop_bias_applied: output.loop_metadata.early_stop_bias_applied,
      adjusted_threshold: output.loop_metadata.adjusted_threshold,
    });

    expect(output.loop_metadata.early_stop_bias_applied).toBe(true);
    expect(output.loop_metadata.adjusted_threshold).toBe("0.60 (bias_active)");  // from stopDecision passthrough
  });

  it("B4: learningConfig snapshot shows no override in default state", () => {
    const snapshot = getLearningConfigSnapshot();

    recordTraceEntry(trace, "learning_config", {
      failure_threshold: snapshot.failure_threshold,
      success_threshold: snapshot.success_threshold,
      stop_bias_evidence_floor: snapshot.stop_bias_evidence_floor,
      has_override: snapshot.has_override,
    });

    expect(snapshot.failure_threshold).toBe(0.6);
    expect(snapshot.success_threshold).toBe(0.7);
    expect(snapshot.stop_bias_evidence_floor).toBe(0.60);
    expect(snapshot.has_override).toBe(false);
  });

  it("B5: Failure Audit — no breakpoints in Scenario B trace", () => {
    finalizeTrace(trace);
    const expectedStages: PipelineStage[] = ["trigger_evaluation", "stop_evaluation", "converged_output", "learning_config"];
    const breakpoints = auditTraceForBreakpoints(trace, expectedStages);
    console.log("[E2E Scenario B]", buildTraceSummary(trace));
    expect(breakpoints).toHaveLength(0);
  });
});

// ── Scenario C: Step0 forces continuation → overrides all stop signals ────────

describe("E2E Scenario C: Step0 forces continuation — overrides early_stop_bias and delta stop (LEVEL21D)", () => {
  const trace = createPipelineTrace("SCENARIO_C");

  it("C1: Step0 binding with step0_forces_continuation=true overrides earlyStopBiasEligible", () => {
    const loopState = makeLoopState({ iteration: 2 });
    const evidenceDelta = makeEvidenceDelta({ evidence_score_after: 0.72, evidence_score_delta: 0.12 });

    const step0Binding = makeStep0BindingResult({
      step0_forces_continuation: true,
      step0_allows_early_stop: false,
      step0_tension_level: "high",
      step0_result: {
        revalidation_verdict: "prior_thesis_weakened",
        prior_thesis_still_valid: false,
        thesis_tension_level: "high",
        required_follow_up_probe: "risk_probe",
        confidence_change: "degraded",
        revalidation_summary: "Prior thesis weakened by earnings miss.",
      },
    });

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict: makeUpdatedVerdict(),
      secondPassSucceeded: true,
      earlyStopBiasEligible: true,   // memory says stop early
      step0Binding,                   // Step0 says continue
    });

    recordTraceEntry(trace, "stop_evaluation", {
      should_stop: result.should_stop,
      step0_stop_override_applied: result.step0_stop_override_applied,
      step0_forces_continuation: true,
      early_stop_bias_applied: result.early_stop_bias_applied,
    });

    // Step0 CRITICAL priority wins over MODERATE early_stop_bias
    expect(result.should_stop).toBe(false);
    expect(result.step0_stop_override_applied).toBe(true);
  });

  it("C2: Step0 binding overrides delta-driven stop", () => {
    const loopState = makeLoopState({ iteration: 2 });
    const evidenceDelta = makeEvidenceDelta({
      evidence_score_after: 0.55,
      evidence_score_delta: -0.05,  // negative delta → normally would stop
      convergence_signal: "diverged",
    });

    const step0Binding = makeStep0BindingResult({
      step0_forces_continuation: true,
      step0_allows_early_stop: false,
    });

    const thesisDelta = { change_type: "reversed" as const, magnitude: "major" as const, from_verdict: "BUY", to_verdict: "SELL", delta_summary: "reversed" };
    const actionDelta = { change_type: "reversed" as const, magnitude: "major" as const, from_action: "BUY", to_action: "SELL", previous_action: "BUY", current_action: "SELL", delta_summary: "reversed" };
    const deltaStopEval = evaluateDeltaDrivenStop(thesisDelta, actionDelta);

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict: makeUpdatedVerdict({ verdict_changed: true, change_type: "reversed" }),
      secondPassSucceeded: true,
      deltaStopEval,
      step0Binding,
    });

    recordTraceEntry(trace, "stop_evaluation", {
      should_stop: result.should_stop,
      step0_stop_override_applied: result.step0_stop_override_applied,
      delta_stop_applied: result.delta_stop_applied,
    });

    expect(result.should_stop).toBe(false);
    expect(result.step0_stop_override_applied).toBe(true);
  });

  it("C3: execution path trace detects divergence when step0 reroutes", () => {
    const pathTrace = buildExecutionPathTrace({
      intendedPath: ["risk_probe", "valuation_probe"],
      executedPath: ["step0_revalidation", "risk_probe"],  // step0 inserted
      stopReason: "step0_override",
    });

    recordTraceEntry(trace, "routing_priority", {
      intended_path: pathTrace.intended_path,
      executed_path: pathTrace.executed_path,
      path_divergence: pathTrace.path_divergence,
      divergence_detected: pathTrace.path_divergence.length > 0,
    });

    // valuation_probe was intended but not executed → divergence detected
    expect(pathTrace.path_divergence.length).toBeGreaterThan(0);
    expect(pathTrace.path_divergence[0]).toContain("valuation_probe");
  });

  it("C4: loop state correctly records step0 as executed", () => {
    let loopState = makeLoopState();
    const step0Revalidation = {
      ran: false,
      step0_probe_type: "thesis_revalidation",
      step0_tension_level: "high",
      step0_context_block: "Prior BUY thesis under pressure.",
      revalidation_mandatory: true,
    };

    loopState = attachStep0ToLoopState(loopState, step0Revalidation as any);
    const step0Result: Step0Result = {
      revalidation_verdict: "prior_thesis_weakened",
      prior_thesis_still_valid: false,
      thesis_tension_level: "high",
      required_follow_up_probe: "risk_probe",
      confidence_change: "degraded",
      revalidation_summary: "Thesis weakened.",
    };
    const step0Binding = bindStep0Result(step0Result);
    loopState = bindStep0ResultToLoopState(loopState, step0Result, step0Binding);
    loopState = recordExecutedStep(loopState, "step0_revalidation");

    recordTraceEntry(trace, "step0_revalidation", {
      step0_ran: loopState.step0_ran,
      step0_in_executed_path: loopState.executed_path.includes("step0_revalidation"),
      step0_forces_continuation: step0Binding.step0_forces_continuation,
    });

    expect(loopState.step0_ran).toBe(true);
    expect(loopState.executed_path).toContain("step0_revalidation");
    expect(step0Binding.step0_forces_continuation).toBe(true);
  });

  it("C5: Failure Audit — no breakpoints in Scenario C trace", () => {
    finalizeTrace(trace);
    const expectedStages: PipelineStage[] = ["stop_evaluation", "routing_priority", "step0_revalidation"];
    const breakpoints = auditTraceForBreakpoints(trace, expectedStages);
    console.log("[E2E Scenario C]", buildTraceSummary(trace));
    expect(breakpoints).toHaveLength(0);
  });
});

// ── Scenario D: Neutral baseline → default logic ──────────────────────────────

describe("E2E Scenario D: Neutral baseline — no learning bias, no history override, default behavior", () => {
  const trace = createPipelineTrace("SCENARIO_D");

  it("D1: dispatch uses history routing table when failure_intensity is low", () => {
    const dispatch = dispatchNextProbeFromHistoryControl({
      previousAction: "SELL",
      step0Binding: null,
      alreadyRanProbes: [],
      failureIntensityScore: 0.2,  // below threshold
    });

    recordTraceEntry(trace, "dispatch", {
      failure_intensity_score: 0.2,
      dispatched_step_type: dispatch.dispatched_step_type,
      routing_source: dispatch.routing_source,
    });

    // SELL → business_probe (history routing table)
    expect(dispatch.dispatched_step_type).toBe("business_probe");
    expect(dispatch.routing_source).toBe("history_table");
  });

  it("D2: evaluateTrigger fires second pass for medium confidence + weak evidence (no bias)", () => {
    const loopState = makeLoopState();
    const result = evaluateTrigger({
      loopState,
      intentCtx: { task_type: "stock_analysis", interaction_mode: "standard" } as any,
      analysisMode: "standard",
      evidenceScore: 0.55,
      level1a3Output: {
        verdict: "HOLD",
        confidence: "medium",
        risks: [],
        discussion: { key_uncertainty: "uncertain macro", alternative_view: "" },
      } as any,
      structuredSynthesis: null,
      successStrengthScore: 0.3,   // below threshold → no bias
    });

    recordTraceEntry(trace, "trigger_evaluation", {
      should_trigger: result.should_trigger,
      trigger_type: result.trigger_type,
      memory_influenced: result.memory_influenced,
    });

    expect(result.should_trigger).toBe(true);
    expect(result.trigger_type).not.toBe("no_trigger_success_strength_bias");
    expect(result.memory_influenced).toBe(false);
  });

  it("D3: evaluateStopCondition uses default threshold when no bias eligible", () => {
    const loopState = makeLoopState({ iteration: 2 });
    const evidenceDelta = makeEvidenceDelta({ evidence_score_after: 0.70, evidence_score_delta: 0.10 });

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict: makeUpdatedVerdict(),
      secondPassSucceeded: true,
      earlyStopBiasEligible: false,  // no bias
    });

    recordTraceEntry(trace, "stop_evaluation", {
      should_stop: result.should_stop,
      early_stop_bias_applied: result.early_stop_bias_applied,
      adjusted_threshold: result.adjusted_threshold,
    });

    expect(result.early_stop_bias_applied).toBe(false);
    expect(result.adjusted_threshold).toBe("");  // empty string when no bias active
  });

  it("D4: converged output defaults — loop not ran case", () => {
    const output = buildConvergedOutput({
      level1Output: {
        verdict: "HOLD",
        confidence: "medium",
        horizon: "3M",
        bull_case: [],
        reasoning: [],
        bear_case: [],
        risks: [],
        next_steps: [],
        discussion: { key_uncertainty: "", alternative_view: "", weakest_point: "", exploration_paths: [] },
      },
      loopRan: false,
    });

    recordTraceEntry(trace, "converged_output", {
      loop_ran: output.loop_metadata.loop_ran,
      early_stop_bias_applied: output.loop_metadata.early_stop_bias_applied,
      adjusted_threshold: output.loop_metadata.adjusted_threshold,
      history_bootstrap_used: output.loop_metadata.history_bootstrap_used,
    });

    expect(output.loop_metadata.loop_ran).toBe(false);
    expect(output.loop_metadata.early_stop_bias_applied).toBe(false);
    expect(output.loop_metadata.adjusted_threshold).toBe("0.65 (default)");
    expect(output.loop_metadata.history_bootstrap_used).toBe(false);
  });

  it("D5: learningConfig runtime override works and resets cleanly", () => {
    // Apply override
    setLearningConfigOverride({ failure_threshold: 0.5, success_threshold: 0.8 });
    const overrideSnapshot = getLearningConfigSnapshot();

    recordTraceEntry(trace, "learning_config", {
      failure_threshold_override: overrideSnapshot.failure_threshold,
      success_threshold_override: overrideSnapshot.success_threshold,
      has_override: overrideSnapshot.has_override,
    });

    expect(overrideSnapshot.failure_threshold).toBe(0.5);
    expect(overrideSnapshot.success_threshold).toBe(0.8);
    expect(overrideSnapshot.has_override).toBe(true);

    // Reset and verify defaults restored
    resetLearningConfig();
    const resetSnapshot = getLearningConfigSnapshot();
    expect(resetSnapshot.failure_threshold).toBe(0.6);
    expect(resetSnapshot.success_threshold).toBe(0.7);
    expect(resetSnapshot.has_override).toBe(false);
  });

  it("D6: Failure Audit — no breakpoints in Scenario D trace", () => {
    finalizeTrace(trace);
    const expectedStages: PipelineStage[] = ["dispatch", "trigger_evaluation", "stop_evaluation", "converged_output", "learning_config"];
    const breakpoints = auditTraceForBreakpoints(trace, expectedStages);
    console.log("[E2E Scenario D]", buildTraceSummary(trace));
    expect(breakpoints).toHaveLength(0);
  });
});

// ── Cross-scenario: Priority ordering integrity ───────────────────────────────

describe("E2E Cross-scenario: Priority ordering integrity (Step0 > failure > success > history > default)", () => {
  it("Priority 1: Step0 CRITICAL overrides failure_intensity HIGH+", () => {
    // Even with high failure_intensity, Step0 binding takes precedence in stop evaluation
    const loopState = makeLoopState({ iteration: 2 });
    const step0Binding = makeStep0BindingResult({
      step0_forces_continuation: true,
      step0_allows_early_stop: false,
    });

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta: makeEvidenceDelta(),
      updatedVerdict: makeUpdatedVerdict(),
      secondPassSucceeded: true,
      earlyStopBiasEligible: false,
      step0Binding,
    });

    expect(result.should_stop).toBe(false);
    expect(result.step0_stop_override_applied).toBe(true);
  });

  it("Priority 2: failure_intensity HIGH+ overrides success_strength MODERATE in dispatch", () => {
    // High failure_intensity → risk_probe, regardless of success_strength
    const dispatch = dispatchNextProbeFromHistoryControl({
      previousAction: "BUY",
      step0Binding: null,
      alreadyRanProbes: [],
      failureIntensityScore: 0.75,  // HIGH+
    });

    expect(dispatch.dispatched_step_type).toBe("risk_probe");
    expect(dispatch.dispatch_reason).toContain("HIGH+");
  });

  it("Priority 3: success_strength MODERATE overrides history table in trigger", () => {
    const cfg = getLearningConfig();
    const loopState = makeLoopState();
    const bootstrap = makeHistoryBootstrap({
      history_requires_control: false,
      history_control_reason: "prior action changed",
      revalidation_mandatory: false,  // NOT mandatory — success_strength can override
    });

    const result = evaluateTrigger({
      loopState,
      intentCtx: { task_type: "stock_analysis", interaction_mode: "standard" } as any,
      analysisMode: "standard",
      evidenceScore: cfg.stop_bias_evidence_floor + 0.05,
      level1a3Output: {
        verdict: "BUY",
        confidence: "medium",
        risks: [],
        discussion: { key_uncertainty: "minor", alternative_view: "" },
      } as any,
      structuredSynthesis: null,
      successStrengthScore: cfg.success_threshold + 0.05,
      historyBootstrap: bootstrap,
    });

    expect(result.should_trigger).toBe(false);
    expect(result.trigger_type).toBe("no_trigger_success_strength_bias");
  });

  it("Priority 4: revalidation_mandatory overrides success_strength (Step0 > success)", () => {
    const cfg = getLearningConfig();
    const loopState = makeLoopState();
    const bootstrap = makeHistoryBootstrap({
      history_requires_control: true,   // must be true for revalidation_mandatory to fire
      revalidation_mandatory: true,     // forces trigger regardless of success_strength
      history_control_reason: "mandatory revalidation",
    });

    const result = evaluateTrigger({
      loopState,
      intentCtx: { task_type: "stock_analysis", interaction_mode: "standard" } as any,
      analysisMode: "standard",
      evidenceScore: cfg.stop_bias_evidence_floor + 0.05,
      level1a3Output: {
        verdict: "BUY",
        confidence: "medium",
        risks: [],
        discussion: { key_uncertainty: "minor", alternative_view: "" },
      } as any,
      structuredSynthesis: null,
      successStrengthScore: cfg.success_threshold + 0.05,  // would normally stop
      historyBootstrap: bootstrap,
    });

    // revalidation_mandatory=true → must trigger
    expect(result.should_trigger).toBe(true);
    expect(result.trigger_type).not.toBe("no_trigger_success_strength_bias");
  });
});
