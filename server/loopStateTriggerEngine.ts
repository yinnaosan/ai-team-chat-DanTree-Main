/**
 * DANTREE_LEVEL2 Phase1: Loop State and Trigger Engine
 * Determines whether a second reasoning pass is warranted after Level1 output.
 *
 * LEVEL3B: Extended with memory-aware trigger logic.
 * LEVEL21B: Extended with history-controlled trigger logic.
 *   - HistoryBootstrap is now a controller input, not just a prompt context.
 *   - Prior action changes next_step_type and probe priority.
 *   - Step0 revalidation is system-forced when revalidation_mandatory=true.
 */

import type { IntentContext } from "./intentInterpreter";
import type { FinalOutputSchema } from "./outputSchemaValidator";
import type { StructuredSynthesis } from "./synthesisController";
import type { MemorySeed, MemoryConflict } from "./hypothesisEngine";
import type { HistoryBootstrap, Step0Revalidation, Step0Result, Step0BindingResult, DispatchResult, RoutingPriorityTrace } from "./historyBootstrap";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoopState {
  iteration: number;           // Current iteration (1 = initial Level1 pass)
  max_iterations: number;      // Hard cap (default: 2 for v1)
  budget_used: number;         // LLM calls consumed so far
  budget_max: number;          // Max LLM calls allowed for loop
  triggered: boolean;          // Whether loop was triggered at all
  trigger_reason: string;      // Why loop was triggered (or not)
  trigger_time: number;        // Unix timestamp of trigger decision

  // LEVEL21B: History control state
  step0_ran: boolean;          // Whether Step0 revalidation was executed
  step0_object: Step0Revalidation | null;  // The Step0 object if created
  history_controlled: boolean; // Whether history altered this loop's behavior
  controller_path: string[];   // Audit trail of control decisions taken
  // LEVEL21C: Real Step0 execution result
  step0_result: Step0Result | null;           // Actual Step0 LLM output
  step0_binding: Step0BindingResult | null;   // Bound controller inputs from Step0
  // LEVEL21C: Hard routing dispatch
  dispatch_result: DispatchResult | null;     // Hard-dispatched probe type
  routing_trace: RoutingPriorityTrace | null; // Full routing priority trace
  // LEVEL21C: Execution path trace
  executed_path: string[];     // Steps actually executed
  intended_path: string[];     // Steps that were planned
}

export interface TriggerDecision {
  should_trigger: boolean;
  reason: string;
  trigger_type:
    | "low_confidence"
    | "high_uncertainty"
    | "weak_evidence"
    | "critical_risk_unresolved"
    | "memory_conflict_override"       // LEVEL3B: conflict forced trigger
    | "memory_recurrence_boost"        // LEVEL3B: memory boosted trigger
    | "history_revalidation_mandatory" // LEVEL21B: history forced trigger
    | "history_control_active"         // LEVEL21B: history influenced trigger
    | "no_trigger_high_confidence"
    | "no_trigger_quick_mode"
    | "no_trigger_discussion_mode"
    | "no_trigger_budget_exhausted"
    | "no_trigger_max_iterations"
    | "no_trigger_history_reaffirmed"  // LEVEL21B: early stop via history
    | "no_trigger_success_strength_bias"; // LEVEL3.6: early stop via success_strength_score
  evidence_score_at_trigger: number;
  confidence_at_trigger: string;
  memory_influenced: boolean;
  memory_influence_summary: string;

  // LEVEL21B: History controller output
  history_controlled: boolean;
  next_step_type: string;              // e.g. "risk_probe", "thesis_revalidation", "standard"
  probe_priority: string[];            // ordered probe types
  history_requires_revalidation: boolean;
  action_reconsideration_required: boolean;
  thesis_shift_detected: boolean;
  controller_stop_reason: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_THRESHOLDS = {
  CONFIDENCE_TRIGGER: ["low", "medium"] as string[],
  EVIDENCE_SCORE_TRIGGER: 0.65,
  UNCERTAINTY_TRIGGER_KEYWORDS: [
    "key_uncertainty", "weakest_point", "alternative_view"
  ],
  NO_TRIGGER_TASK_TYPES: ["general"] as string[],
  NO_TRIGGER_INTERACTION_MODES: ["discussion", "quick"] as string[],
  MEMORY_CONFLICT_FORCE_TRIGGER: true,
  MEMORY_RECURRENCE_THRESHOLD_BOOST: 0.05,
};

// LEVEL21B: Probe routing table by prior action
const HISTORY_PROBE_ROUTING: Record<string, string> = {
  BUY:  "risk_probe",
  SELL: "business_probe",
  HOLD: "valuation_probe",
  WAIT: "trigger_condition_check",
};

// ── Main Functions ────────────────────────────────────────────────────────────

/**
 * Initialize a fresh LoopState for a new task.
 */
export function initLoopState(options?: {
  max_iterations?: number;
  budget_max?: number;
}): LoopState {
  return {
    iteration: 1,
    max_iterations: options?.max_iterations ?? 2,
    budget_used: 0,
    budget_max: options?.budget_max ?? 6,
    triggered: false,
    trigger_reason: "not_evaluated",
    trigger_time: Date.now(),
    // LEVEL21B
    step0_ran: false,
    step0_object: null,
    history_controlled: false,
    controller_path: [],
    // LEVEL21C
    step0_result: null,
    step0_binding: null,
    dispatch_result: null,
    routing_trace: null,
    executed_path: [],
    intended_path: [],
  };
}

/**
 * LEVEL21B: Attach Step0 to loop state when revalidation_mandatory=true.
 * Called BEFORE evaluateTrigger, so Step0 is system-forced before GPT synthesis.
 */
export function attachStep0ToLoopState(
  loopState: LoopState,
  step0: Step0Revalidation | null
): LoopState {
  if (!step0) return loopState;
  return {
    ...loopState,
    step0_object: { ...step0, ran: true },
    step0_ran: true,
    history_controlled: true,
    controller_path: [...loopState.controller_path, "step0_revalidation"],
    // LEVEL21C: step0_result will be filled after runStep0Revalidation() completes
    intended_path: [...loopState.intended_path, "step0_revalidation"],
  };
}

/**
 * LEVEL21C: Bind Step0 execution result into loop state.
 * Called after runStep0Revalidation() completes.
 */
export function bindStep0ResultToLoopState(
  loopState: LoopState,
  step0Result: Step0Result,
  step0Binding: Step0BindingResult
): LoopState {
  return {
    ...loopState,
    step0_result: step0Result,
    step0_binding: step0Binding,
    // Mark step0 as actually executed in executed_path
    executed_path: [...loopState.executed_path, "step0_revalidation"],
  };
}

/**
 * LEVEL21C: Apply hard routing dispatch result to loop state.
 * Called after dispatchNextProbeFromHistoryControl() or enforceRoutingPriority().
 */
export function applyDispatchToLoopState(
  loopState: LoopState,
  dispatchResult: DispatchResult,
  routingTrace: RoutingPriorityTrace
): LoopState {
  return {
    ...loopState,
    dispatch_result: dispatchResult,
    routing_trace: routingTrace,
    // Extend intended_path with the dispatched probe
    intended_path: loopState.intended_path.includes(dispatchResult.dispatched_step_type)
      ? loopState.intended_path
      : [...loopState.intended_path, dispatchResult.dispatched_step_type],
  };
}

/**
 * LEVEL21C: Record a step as actually executed.
 * Called after each probe/step completes successfully.
 */
export function recordExecutedStep(
  loopState: LoopState,
  stepType: string
): LoopState {
  if (loopState.executed_path.includes(stepType)) return loopState;
  return {
    ...loopState,
    executed_path: [...loopState.executed_path, stepType],
    controller_path: [...loopState.controller_path, stepType],
  };
}

/**
 * Evaluate whether a second reasoning pass should be triggered.
 * Called after Level1 output is complete.
 *
 * LEVEL3B: Optional memorySeed and memoryConflict inputs enable memory-aware
 * trigger overrides and priority boosts.
 *
 * LEVEL21B: Optional historyBootstrap enables history-controlled trigger logic.
 * Prior action determines next_step_type and probe_priority.
 */
export function evaluateTrigger(params: {
  loopState: LoopState;
  intentCtx: IntentContext;
  analysisMode: string;
  evidenceScore: number;
  level1a3Output: FinalOutputSchema | null;
  structuredSynthesis: StructuredSynthesis | null;
  memorySeed?: MemorySeed;
  memoryConflict?: MemoryConflict;
  historyBootstrap?: HistoryBootstrap;  // LEVEL21B
  successStrengthScore?: number;        // LEVEL3.6: from memoryEvolution
}): TriggerDecision {
  const {
    loopState,
    intentCtx,
    analysisMode,
    evidenceScore,
    level1a3Output,
    structuredSynthesis,
    memorySeed,
    memoryConflict,
    historyBootstrap,
    successStrengthScore,
  } = params;

  // ── Default history controller fields ────────────────────────────────────
  const defaultHistoryFields = {
    history_controlled: false,
    next_step_type: "standard",
    probe_priority: [],
    history_requires_revalidation: false,
    action_reconsideration_required: false,
    thesis_shift_detected: false,
    controller_stop_reason: "",
  };

  // ── Hard stops (never trigger) ────────────────────────────────────────────

  if (analysisMode === "quick") {
    return {
      should_trigger: false,
      reason: "Quick mode: loop disabled by design",
      trigger_type: "no_trigger_quick_mode",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
      memory_influenced: false,
      memory_influence_summary: "",
      ...defaultHistoryFields,
    };
  }

  if (intentCtx.interaction_mode === "discussion") {
    return {
      should_trigger: false,
      reason: "Discussion mode: auto-loop would interrupt user dialogue",
      trigger_type: "no_trigger_discussion_mode",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
      memory_influenced: false,
      memory_influence_summary: "",
      ...defaultHistoryFields,
    };
  }

  if (TRIGGER_THRESHOLDS.NO_TRIGGER_TASK_TYPES.includes(intentCtx.task_type)) {
    return {
      should_trigger: false,
      reason: `Task type "${intentCtx.task_type}" does not benefit from reasoning loop`,
      trigger_type: "no_trigger_quick_mode",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
      memory_influenced: false,
      memory_influence_summary: "",
      ...defaultHistoryFields,
    };
  }

  if (loopState.iteration >= loopState.max_iterations) {
    return {
      should_trigger: false,
      reason: `Max iterations reached (${loopState.iteration}/${loopState.max_iterations})`,
      trigger_type: "no_trigger_max_iterations",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
      memory_influenced: false,
      memory_influence_summary: "",
      ...defaultHistoryFields,
    };
  }

  if (loopState.budget_used >= loopState.budget_max) {
    return {
      should_trigger: false,
      reason: `Budget exhausted (${loopState.budget_used}/${loopState.budget_max} calls)`,
      trigger_type: "no_trigger_budget_exhausted",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
      memory_influenced: false,
      memory_influence_summary: "",
      ...defaultHistoryFields,
    };
  }

  // ── LEVEL21B: History-Mandatory Trigger ──────────────────────────────────
  // If history requires revalidation, force trigger regardless of confidence.
  // This is the primary LEVEL21B control path.
  if (historyBootstrap?.history_requires_control && historyBootstrap.revalidation_mandatory) {
    const previousAction = historyBootstrap.previous_action;
    const nextStepType = HISTORY_PROBE_ROUTING[previousAction] ?? "thesis_revalidation";
    const probePriority = historyBootstrap.preferred_probe_order;

    return {
      should_trigger: true,
      reason: `History control: mandatory revalidation of prior ${previousAction} decision — ${historyBootstrap.history_control_reason}`,
      trigger_type: "history_revalidation_mandatory",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: level1a3Output?.confidence ?? "unknown",
      memory_influenced: false,
      memory_influence_summary: "",
      history_controlled: true,
      next_step_type: nextStepType,
      probe_priority: probePriority,
      history_requires_revalidation: true,
      action_reconsideration_required: ["BUY", "SELL"].includes(previousAction),
      thesis_shift_detected: (historyBootstrap.days_since_last_decision ?? 0) > 14,
      controller_stop_reason: "",
    };
  }

  // ── LEVEL21B: History-Influenced Early Stop ───────────────────────────────
  // If history strongly confirms current direction, allow early stop.
  if (
    historyBootstrap?.has_prior_history &&
    !historyBootstrap.revalidation_mandatory &&
    (historyBootstrap.days_since_last_decision ?? 999) < 7 &&
    level1a3Output?.confidence === "high" &&
    evidenceScore >= 0.75
  ) {
    return {
      should_trigger: false,
      reason: `History reaffirmed: recent ${historyBootstrap.previous_action} (${historyBootstrap.days_since_last_decision}d ago) with high confidence — early stop`,
      trigger_type: "no_trigger_history_reaffirmed",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: level1a3Output?.confidence ?? "high",
      memory_influenced: false,
      memory_influence_summary: "",
      history_controlled: true,
      next_step_type: "reaffirmation_stop",
      probe_priority: [],
      history_requires_revalidation: false,
      action_reconsideration_required: false,
      thesis_shift_detected: false,
      controller_stop_reason: `Prior ${historyBootstrap.previous_action} reaffirmed — no second pass needed`,
    };
  }

  // ── LEVEL21B: History-Active (non-mandatory) ──────────────────────────────
  // History exists and is decision-relevant, but not mandatory revalidation.
  // Still influences probe routing.
  const historyActive = historyBootstrap?.history_requires_control && !historyBootstrap.revalidation_mandatory;

  // ── LEVEL3B: Memory Conflict Override ────────────────────────────────────
  if (
    TRIGGER_THRESHOLDS.MEMORY_CONFLICT_FORCE_TRIGGER &&
    memoryConflict?.has_conflict &&
    memoryConflict.conflict_type !== "none"
  ) {
    const historyProbe = historyBootstrap?.previous_action
      ? HISTORY_PROBE_ROUTING[historyBootstrap.previous_action] ?? "standard"
      : "standard";

    return {
      should_trigger: true,
      reason: `Memory conflict detected (${memoryConflict.conflict_type}) — second pass required to resolve thesis tension`,
      trigger_type: "memory_conflict_override",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: level1a3Output?.confidence ?? "unknown",
      memory_influenced: true,
      memory_influence_summary: memoryConflict.summary,
      history_controlled: !!historyActive,
      next_step_type: historyActive ? historyProbe : "standard",
      probe_priority: historyBootstrap?.preferred_probe_order ?? [],
      history_requires_revalidation: !!historyBootstrap?.history_requires_control,
      action_reconsideration_required: false,
      thesis_shift_detected: false,
      controller_stop_reason: "",
    };
  }

  // ── Trigger conditions ────────────────────────────────────────────────────

  const confidence = level1a3Output?.confidence ?? "medium";

  // LEVEL3.6: success_strength_score confidence boost
  // Per GPT: strong prior success → allow early stop bias (affects evaluateStopCondition threshold)
  // Here: if successStrengthScore >= 0.7 AND confidence=medium AND evidenceScore >= 0.65
  // → upgrade to allow early stop (do not trigger second pass)
  if (
    successStrengthScore !== undefined &&
    successStrengthScore >= 0.7 &&
    confidence === "medium" &&
    evidenceScore >= 0.65 &&
    !historyBootstrap?.revalidation_mandatory
  ) {
    return {
      should_trigger: false,
      reason: `LEVEL3.6 success_strength_score=${successStrengthScore.toFixed(2)} >= 0.7 with medium confidence + evidenceScore=${evidenceScore.toFixed(2)} >= 0.65 — prior success pattern supports early stop`,
      trigger_type: "no_trigger_success_strength_bias",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: confidence,
      memory_influenced: true,
      memory_influence_summary: `success_strength_score=${successStrengthScore.toFixed(2)} — prior success pattern applied`,
      history_controlled: !!historyActive,
      next_step_type: "reaffirmation_stop",
      probe_priority: historyBootstrap?.preferred_probe_order ?? [],
      history_requires_revalidation: false,
      action_reconsideration_required: false,
      thesis_shift_detected: false,
      controller_stop_reason: `success_strength_score=${successStrengthScore.toFixed(2)} — early stop bias applied`,
    };
  }
  // HIGH confidence + good evidence
  if (confidence === "high" && evidenceScore >= 0.75) {
    if (memorySeed?.memory_found && memorySeed.prior_open_hypotheses.length > 0) {
      if (evidenceScore < 0.75 + 0.05) {
        return {
          should_trigger: true,
          reason: `High confidence but prior unresolved hypotheses from memory — second pass to revalidate`,
          trigger_type: "memory_recurrence_boost",
          evidence_score_at_trigger: evidenceScore,
          confidence_at_trigger: confidence,
          memory_influenced: true,
          memory_influence_summary: `Prior open hypothesis: "${memorySeed.prior_open_hypotheses[0].slice(0, 80)}"`,
          history_controlled: !!historyActive,
          next_step_type: historyActive
            ? (HISTORY_PROBE_ROUTING[historyBootstrap!.previous_action] ?? "standard")
            : "standard",
          probe_priority: historyBootstrap?.preferred_probe_order ?? [],
          history_requires_revalidation: !!historyBootstrap?.history_requires_control,
          action_reconsideration_required: false,
          thesis_shift_detected: false,
          controller_stop_reason: "",
        };
      }
    }
    return {
      should_trigger: false,
      reason: `High confidence (${confidence}) with strong evidence (${evidenceScore.toFixed(2)}) — already converged`,
      trigger_type: "no_trigger_high_confidence",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: confidence,
      memory_influenced: false,
      memory_influence_summary: "",
      ...defaultHistoryFields,
    };
  }

  // LOW confidence → always trigger
  if (confidence === "low") {
    const memoryNote = memorySeed?.memory_found
      ? ` (memory: prior verdict was ${memorySeed.prior_verdict})`
      : "";
    const historyProbe = historyActive
      ? HISTORY_PROBE_ROUTING[historyBootstrap!.previous_action] ?? "standard"
      : "standard";

    return {
      should_trigger: true,
      reason: `Low confidence (${confidence}) — second pass required to strengthen or refute thesis${memoryNote}`,
      trigger_type: "low_confidence",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: confidence,
      memory_influenced: !!memorySeed?.memory_found,
      memory_influence_summary: memorySeed?.memory_found
        ? `Prior verdict context available: ${memorySeed.prior_verdict}`
        : "",
      history_controlled: !!historyActive,
      next_step_type: historyActive ? historyProbe : "standard",
      probe_priority: historyBootstrap?.preferred_probe_order ?? [],
      history_requires_revalidation: !!historyBootstrap?.history_requires_control,
      action_reconsideration_required: false,
      thesis_shift_detected: false,
      controller_stop_reason: "",
    };
  }

  // MEDIUM confidence + weak evidence
  const effectiveEvidenceThreshold = memorySeed?.memory_found
    ? TRIGGER_THRESHOLDS.EVIDENCE_SCORE_TRIGGER + TRIGGER_THRESHOLDS.MEMORY_RECURRENCE_THRESHOLD_BOOST
    : TRIGGER_THRESHOLDS.EVIDENCE_SCORE_TRIGGER;

  if (confidence === "medium" && evidenceScore < effectiveEvidenceThreshold) {
    const memoryNote = memorySeed?.memory_found
      ? ` (memory-adjusted threshold: ${effectiveEvidenceThreshold.toFixed(2)})`
      : "";
    const historyProbe = historyActive
      ? HISTORY_PROBE_ROUTING[historyBootstrap!.previous_action] ?? "standard"
      : "standard";

    return {
      should_trigger: true,
      reason: `Medium confidence with weak evidence score (${evidenceScore.toFixed(2)} < ${effectiveEvidenceThreshold.toFixed(2)}) — second pass to improve evidence base${memoryNote}`,
      trigger_type: "weak_evidence",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: confidence,
      memory_influenced: !!memorySeed?.memory_found,
      memory_influence_summary: memorySeed?.memory_found
        ? `Evidence threshold raised to ${effectiveEvidenceThreshold.toFixed(2)} due to prior memory`
        : "",
      history_controlled: !!historyActive,
      next_step_type: historyActive ? historyProbe : "standard",
      probe_priority: historyBootstrap?.preferred_probe_order ?? [],
      history_requires_revalidation: !!historyBootstrap?.history_requires_control,
      action_reconsideration_required: false,
      thesis_shift_detected: false,
      controller_stop_reason: "",
    };
  }

  // MEDIUM confidence + critical unresolved risk
  if (confidence === "medium" && level1a3Output !== null) {
    const hasHighRisk = level1a3Output.risks.some(r => r.magnitude === "high");
    const keyUncertaintyIsSubstantial =
      level1a3Output.discussion.key_uncertainty.length > 30;
    if (hasHighRisk && keyUncertaintyIsSubstantial) {
      return {
        should_trigger: true,
        reason: `Medium confidence with unresolved high-magnitude risk and substantial key uncertainty — second pass to address critical risk`,
        trigger_type: "critical_risk_unresolved",
        evidence_score_at_trigger: evidenceScore,
        confidence_at_trigger: confidence,
        memory_influenced: false,
        memory_influence_summary: "",
        history_controlled: !!historyActive,
        next_step_type: historyActive ? "risk_probe" : "standard",
        probe_priority: historyBootstrap?.preferred_probe_order ?? [],
        history_requires_revalidation: !!historyBootstrap?.history_requires_control,
        action_reconsideration_required: false,
        thesis_shift_detected: false,
        controller_stop_reason: "",
      };
    }
  }

  // Check structuredSynthesis for high uncertainty signal
  if (structuredSynthesis !== null && confidence === "medium") {
    const hasWeakEvidence = (structuredSynthesis.key_evidence?.length ?? 0) < 2;
    if (hasWeakEvidence) {
      return {
        should_trigger: true,
        reason: `Medium confidence with insufficient supporting evidence in synthesis (< 2 items) — second pass to gather more evidence`,
        trigger_type: "high_uncertainty",
        evidence_score_at_trigger: evidenceScore,
        confidence_at_trigger: confidence,
        memory_influenced: false,
        memory_influence_summary: "",
        ...defaultHistoryFields,
      };
    }
  }

  // Default: no trigger
  return {
    should_trigger: false,
    reason: `Medium confidence (${confidence}) with acceptable evidence (${evidenceScore.toFixed(2)}) — no second pass needed`,
    trigger_type: "no_trigger_high_confidence",
    evidence_score_at_trigger: evidenceScore,
    confidence_at_trigger: confidence,
    memory_influenced: false,
    memory_influence_summary: "",
    ...defaultHistoryFields,
  };
}

/**
 * Advance the loop state after a trigger decision.
 * LEVEL21B: Preserves history control state and extends controller_path.
 */
export function advanceLoopState(
  loopState: LoopState,
  triggerDecision: TriggerDecision,
  additionalBudgetUsed: number = 1
): LoopState {
  const newPath = [...loopState.controller_path];
  if (triggerDecision.next_step_type && triggerDecision.next_step_type !== "standard") {
    newPath.push(triggerDecision.next_step_type);
  }

  return {
    ...loopState,
    iteration: loopState.iteration + 1,
    budget_used: loopState.budget_used + additionalBudgetUsed,
    triggered: triggerDecision.should_trigger,
    trigger_reason: triggerDecision.reason,
    trigger_time: Date.now(),
    history_controlled: loopState.history_controlled || triggerDecision.history_controlled,
    controller_path: newPath,
  };
}

/**
 * LEVEL21B: Build the history-driven next step type from trigger decision.
 * Maps probe type to a human-readable follow-up task hint.
 */
export function buildHistoryDrivenNextStep(triggerDecision: TriggerDecision): {
  step_hint: string;
  probe_type: string;
  priority_fields: string[];
} {
  const probeType = triggerDecision.next_step_type;

  const probeConfig: Record<string, { hint: string; fields: string[] }> = {
    risk_probe: {
      hint: "Focus on risk escalation and downside scenarios since prior BUY decision",
      fields: ["risk_factors", "valuation_metrics", "earnings_revision"],
    },
    business_probe: {
      hint: "Focus on business recovery and reversal signals since prior SELL decision",
      fields: ["revenue_growth", "margin_recovery", "business_fundamentals"],
    },
    valuation_probe: {
      hint: "Focus on valuation change and catalyst events since prior HOLD decision",
      fields: ["valuation_metrics", "catalyst_events", "price_target"],
    },
    trigger_condition_check: {
      hint: "Check if entry trigger conditions have been satisfied since prior WAIT decision",
      fields: ["price_level", "volume_signals", "technical_breakout"],
    },
    reversal_check: {
      hint: "Check for reversal signals that would invalidate prior SELL thesis",
      fields: ["price_recovery", "momentum_signals", "sentiment_shift"],
    },
    catalyst_check: {
      hint: "Check for new catalysts that would change prior HOLD stance",
      fields: ["earnings_catalyst", "news_catalyst", "sector_catalyst"],
    },
    thesis_update: {
      hint: "Update thesis based on material changes since last decision",
      fields: ["current_verdict", "evidence_update", "risk_update"],
    },
    thesis_revalidation: {
      hint: "Revalidate whether prior thesis still holds given current data",
      fields: ["current_price", "earnings_update", "macro_context"],
    },
    standard: {
      hint: "Standard second-pass analysis",
      fields: [],
    },
  };

  const config = probeConfig[probeType] ?? probeConfig["standard"];
  return {
    step_hint: config.hint,
    probe_type: probeType,
    priority_fields: config.fields,
  };
}
