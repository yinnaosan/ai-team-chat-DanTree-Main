/**
 * DANTREE_LEVEL3.6_LEARNING_CONTROL — vitest
 * Validates: early_stop_bias → evaluateStopCondition threshold
 *            failure_intensity_score → dispatchNextProbeFromHistoryControl routing
 *            success_strength_score → evaluateTrigger early stop
 */
import { describe, it, expect } from "vitest";
import { evaluateStopCondition } from "./loopStopController";
import { evaluateTrigger, initLoopState } from "./loopStateTriggerEngine";
import { dispatchNextProbeFromHistoryControl } from "./historyBootstrap";
import type { LoopState } from "./loopStateTriggerEngine";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeLoopState(overrides: Partial<LoopState> = {}): LoopState {
  return {
    ...initLoopState(),
    triggered: true,
    trigger_reason: "test",
    trigger_time: Date.now(),
    ...overrides,
  };
}

function makeIntentCtx(overrides: Record<string, unknown> = {}) {
  return {
    task_type: "analysis",
    interaction_mode: "standard",
    primary_ticker: "AAPL",
    ...overrides,
  } as any;
}

function makeEvidenceDelta(overrides: Record<string, unknown> = {}) {
  return {
    evidence_score_before: 0.5,
    evidence_score_after: 0.7,
    evidence_score_delta: 0.2,
    confidence_before: "medium" as const,
    confidence_after: "medium" as const,
    confidence_changed: false,
    verdict_update: "confirms" as const,
    verdict_stability: "stable" as const,
    new_evidence_count: 1,
    new_risk_introduced: false,
    net_supporting_evidence: 2,
    net_contradicting_evidence: 0,
    convergence_signal: "inconclusive" as const,
    convergence_reason: "test",
    ...overrides,
  };
}

function makeUpdatedVerdict(overrides: Record<string, unknown> = {}) {
  return {
    final_verdict: "BUY",
    final_confidence: "medium" as const,
    change_type: "none",
    changed: false,
    ...overrides,
  } as any;
}

// ── Phase 1: early_stop_bias → evaluateStopCondition ──────────────────────

describe("LEVEL3.6 Phase 1: early_stop_bias → evaluateStopCondition threshold", () => {
  it("should apply early_stop_bias and stop earlier when bias=true and evidence converged", () => {
    // Use max_iterations=5 to avoid triggering max_iterations early stop path
    // Use evidence_score_delta=0.18 to avoid triggering no_improvement path (< 0.02)
    const loopState = makeLoopState({ iteration: 1, max_iterations: 5 });
    const evidenceDelta = makeEvidenceDelta({
      evidence_score_after: 0.68,
      evidence_score_delta: 0.18,
      convergence_signal: "inconclusive" as const,
      confidence_after: "medium" as const,
      confidence_changed: true,  // avoid no_improvement path
    });
    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict: makeUpdatedVerdict({ final_confidence: "medium", change_type: "updated", changed: true }),
      secondPassSucceeded: true,
      earlyStopBiasEligible: true,  // LEVEL3.6
    });
    // With early_stop_bias, threshold lowers from 0.65 to 0.60
    // evidenceScore=0.68 >= 0.60 → should stop
    expect(result.should_stop).toBe(true);
    expect(result.early_stop_bias_applied).toBe(true);
    // adjusted_threshold is a string like "evidence>=0.60 (bias from success_strength_score)"
    expect(result.adjusted_threshold).toContain("0.6");
  });

  it("should NOT apply early_stop_bias when bias=false", () => {
    const loopState = makeLoopState({ iteration: 2 });
    const evidenceDelta = makeEvidenceDelta({ evidence_score_after: 0.62, delta: 0.12 });

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict: makeUpdatedVerdict({ changed: false }),
      secondPassSucceeded: true,
      earlyStopBiasEligible: false,
    });

    // Without bias, threshold stays at 0.65 → 0.62 < 0.65 → should NOT stop
    expect(result.early_stop_bias_applied).toBe(false);
  });

  it("should NOT apply early_stop_bias when step0_stop_override is active", () => {
    const loopState = makeLoopState({ iteration: 2 });
    const evidenceDelta = makeEvidenceDelta({ evidence_score_after: 0.68, delta: 0.18 });

    // step0_binding with step0_forces_continuation overrides early_stop_bias
    const step0Binding = {
      step0_forces_continuation: true,
      step0_confidence: "low",
      step0_followup_probe: "risk_probe",
      override_stop: false,
      recommended_probe: "risk_probe",
      binding_reason: "step0 says continue",
    };

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict: makeUpdatedVerdict({ changed: false }),
      secondPassSucceeded: true,
      earlyStopBiasEligible: true,
      step0Binding: step0Binding as any,
    });

    // Step0 force_continue overrides early_stop_bias → should NOT stop
    expect(result.should_stop).toBe(false);
    expect(result.step0_stop_override_applied).toBe(true);
  });
});

// ── Phase 2: failure_intensity_score → dispatchNextProbeFromHistoryControl ─

describe("LEVEL3.6 Phase 2: failure_intensity_score → routing", () => {
  it("should force risk_probe when failureIntensityScore >= 0.6", () => {
    const result = dispatchNextProbeFromHistoryControl({
      previousAction: "BUY",
      step0Binding: null,
      alreadyRanProbes: [],
      failureIntensityScore: 0.65,  // LEVEL3.6
    });

    expect(result.dispatched_step_type).toBe("risk_probe");
    expect(result.routing_source).toContain("failure_intensity");
  });

  it("should NOT force risk_probe when failureIntensityScore < 0.6", () => {
    const result = dispatchNextProbeFromHistoryControl({
      previousAction: "BUY",
      step0Binding: null,
      alreadyRanProbes: [],
      failureIntensityScore: 0.3,  // below threshold
    });

    // Should fall through to normal BUY routing (risk_probe from HISTORY_PROBE_ROUTING)
    // but NOT from failure_intensity path
    expect(result.routing_source).not.toContain("failure_intensity");
  });

  it("should force risk_probe even when alreadyRanProbes contains risk_probe if failureIntensityScore >= 0.6", () => {
    const result = dispatchNextProbeFromHistoryControl({
      previousAction: "WAIT",
      step0Binding: null,
      alreadyRanProbes: ["risk_probe"],  // already ran
      failureIntensityScore: 0.8,  // high intensity
    });

    // High failure intensity forces risk_probe regardless
    expect(result.dispatched_step_type).toBe("risk_probe");
  });

  it("should use normal routing when failureIntensityScore is 0", () => {
    const result = dispatchNextProbeFromHistoryControl({
      previousAction: "SELL",
      step0Binding: null,
      alreadyRanProbes: [],
      failureIntensityScore: 0.0,
    });

    // Normal SELL routing → business_probe
    expect(result.dispatched_step_type).toBe("business_probe");
  });
});

// ── Phase 3: success_strength_score → evaluateTrigger ─────────────────────

describe("LEVEL3.6 Phase 3: success_strength_score → evaluateTrigger early stop", () => {
  it("should NOT trigger second pass when successStrengthScore >= 0.7 and medium confidence + evidenceScore >= 0.65", () => {
    const loopState = makeLoopState();
    const intentCtx = makeIntentCtx();

    const result = evaluateTrigger({
      loopState,
      intentCtx,
      analysisMode: "standard",
      evidenceScore: 0.67,
      level1a3Output: {
        verdict: "BUY",
        confidence: "medium",
        risks: [],
        discussion: { key_uncertainty: "minor uncertainty", alternative_view: "" },
      } as any,
      structuredSynthesis: null,
      successStrengthScore: 0.75,  // LEVEL3.6
    });

    expect(result.should_trigger).toBe(false);
    expect(result.trigger_type).toBe("no_trigger_success_strength_bias");
    expect(result.memory_influenced).toBe(true);
  });

  it("should still trigger when successStrengthScore >= 0.7 but revalidation_mandatory=true", () => {
    const loopState = makeLoopState();
    const intentCtx = makeIntentCtx();

    const result = evaluateTrigger({
      loopState,
      intentCtx,
      analysisMode: "standard",
      evidenceScore: 0.67,
      level1a3Output: {
        verdict: "BUY",
        confidence: "medium",
        risks: [],
        discussion: { key_uncertainty: "minor uncertainty", alternative_view: "" },
      } as any,
      structuredSynthesis: null,
      successStrengthScore: 0.75,
      historyBootstrap: {
        has_prior_history: true,
        revalidation_mandatory: true,  // overrides success_strength_score
        previous_action: "BUY",
        days_since_last_decision: 14,
        prior_decision_count: 3,
        action_pattern: "BUY_BUY",
        history_requires_control: true,
        history_control_reason: "revalidation required",
        preferred_probe_order: [],
        previous_confidence: "medium",
        history_context_block: "",
        memory_injected: false,
        memory_record_count: 0,
        memory_influence_summary: "",
        memory_influence: null,
      } as any,
    });

    // revalidation_mandatory=true → must trigger despite success_strength_score
    expect(result.should_trigger).toBe(true);
  });

  it("should trigger normally when successStrengthScore < 0.7", () => {
    const loopState = makeLoopState();
    const intentCtx = makeIntentCtx();

    const result = evaluateTrigger({
      loopState,
      intentCtx,
      analysisMode: "standard",
      evidenceScore: 0.55,  // below threshold
      level1a3Output: {
        verdict: "BUY",
        confidence: "medium",
        risks: [],
        discussion: { key_uncertainty: "minor uncertainty", alternative_view: "" },
      } as any,
      structuredSynthesis: null,
      successStrengthScore: 0.5,  // below 0.7 threshold
    });

    // Normal medium confidence + weak evidence → should trigger
    expect(result.should_trigger).toBe(true);
    expect(result.trigger_type).not.toBe("no_trigger_success_strength_bias");
  });
});

// ── Phase 4: Priority ordering ─────────────────────────────────────────────

describe("LEVEL3.6 Phase 4: Priority ordering — Step0 > memory > history > default", () => {
  it("Step0 force_continue overrides early_stop_bias (highest priority)", () => {
    const loopState = makeLoopState({ iteration: 2 });
    const evidenceDelta = makeEvidenceDelta({ evidence_score_after: 0.72, delta: 0.22 });

    const step0Binding = {
      step0_forces_continuation: true,
      step0_confidence: "low",
      step0_followup_probe: "risk_probe",
      override_stop: false,
      recommended_probe: "risk_probe",
      binding_reason: "step0 detected thesis tension",
    };

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict: makeUpdatedVerdict({ changed: false }),
      secondPassSucceeded: true,
      earlyStopBiasEligible: true,  // memory says stop early
      step0Binding: step0Binding as any,  // step0 says continue
    });

    // Step0 wins → should NOT stop
    expect(result.should_stop).toBe(false);
    expect(result.step0_stop_override_applied).toBe(true);
  });
});
