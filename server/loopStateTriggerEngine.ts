/**
 * DANTREE_LEVEL2 Phase1: Loop State and Trigger Engine
 * Determines whether a second reasoning pass is warranted after Level1 output.
 */

import type { IntentContext } from "./intentInterpreter";
import type { FinalOutputSchema } from "./outputSchemaValidator";
import type { StructuredSynthesis } from "./synthesisController";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoopState {
  iteration: number;           // Current iteration (1 = initial Level1 pass)
  max_iterations: number;      // Hard cap (default: 2 for v1)
  budget_used: number;         // LLM calls consumed so far
  budget_max: number;          // Max LLM calls allowed for loop
  triggered: boolean;          // Whether loop was triggered at all
  trigger_reason: string;      // Why loop was triggered (or not)
  trigger_time: number;        // Unix timestamp of trigger decision
}

export interface TriggerDecision {
  should_trigger: boolean;
  reason: string;
  trigger_type:
    | "low_confidence"
    | "high_uncertainty"
    | "weak_evidence"
    | "critical_risk_unresolved"
    | "no_trigger_high_confidence"
    | "no_trigger_quick_mode"
    | "no_trigger_discussion_mode"
    | "no_trigger_budget_exhausted"
    | "no_trigger_max_iterations";
  evidence_score_at_trigger: number;
  confidence_at_trigger: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_THRESHOLDS = {
  // Trigger if confidence is low or medium AND evidence score below threshold
  CONFIDENCE_TRIGGER: ["low", "medium"] as string[],
  EVIDENCE_SCORE_TRIGGER: 0.65,           // Below this → trigger
  UNCERTAINTY_TRIGGER_KEYWORDS: [
    "key_uncertainty", "weakest_point", "alternative_view"
  ],
  // Do NOT trigger for these modes
  NO_TRIGGER_TASK_TYPES: ["general"] as string[],
  NO_TRIGGER_INTERACTION_MODES: ["discussion", "quick"] as string[],
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
  };
}

/**
 * Evaluate whether a second reasoning pass should be triggered.
 * Called after Level1 output is complete.
 */
export function evaluateTrigger(params: {
  loopState: LoopState;
  intentCtx: IntentContext;
  analysisMode: string;
  evidenceScore: number;
  level1a3Output: FinalOutputSchema | null;
  structuredSynthesis: StructuredSynthesis | null;
}): TriggerDecision {
  const {
    loopState,
    intentCtx,
    analysisMode,
    evidenceScore,
    level1a3Output,
    structuredSynthesis,
  } = params;

  // ── Hard stops (never trigger) ────────────────────────────────────────────

  // Quick mode → never loop
  if (analysisMode === "quick") {
    return {
      should_trigger: false,
      reason: "Quick mode: loop disabled by design",
      trigger_type: "no_trigger_quick_mode",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
    };
  }

  // Discussion mode → never auto-loop
  if (intentCtx.interaction_mode === "discussion") {
    return {
      should_trigger: false,
      reason: "Discussion mode: auto-loop would interrupt user dialogue",
      trigger_type: "no_trigger_discussion_mode",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
    };
  }

  // General task type → no structured loop
  if (TRIGGER_THRESHOLDS.NO_TRIGGER_TASK_TYPES.includes(intentCtx.task_type)) {
    return {
      should_trigger: false,
      reason: `Task type "${intentCtx.task_type}" does not benefit from reasoning loop`,
      trigger_type: "no_trigger_quick_mode",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
    };
  }

  // Max iterations reached
  if (loopState.iteration >= loopState.max_iterations) {
    return {
      should_trigger: false,
      reason: `Max iterations reached (${loopState.iteration}/${loopState.max_iterations})`,
      trigger_type: "no_trigger_max_iterations",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
    };
  }

  // Budget exhausted
  if (loopState.budget_used >= loopState.budget_max) {
    return {
      should_trigger: false,
      reason: `Budget exhausted (${loopState.budget_used}/${loopState.budget_max} calls)`,
      trigger_type: "no_trigger_budget_exhausted",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: "unknown",
    };
  }

  // ── Trigger conditions ────────────────────────────────────────────────────

  const confidence = level1a3Output?.confidence ?? "medium";

  // HIGH confidence + good evidence → no trigger (converged)
  if (confidence === "high" && evidenceScore >= 0.75) {
    return {
      should_trigger: false,
      reason: `High confidence (${confidence}) with strong evidence (${evidenceScore.toFixed(2)}) — already converged`,
      trigger_type: "no_trigger_high_confidence",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: confidence,
    };
  }

  // LOW confidence → always trigger
  if (confidence === "low") {
    return {
      should_trigger: true,
      reason: `Low confidence (${confidence}) — second pass required to strengthen or refute thesis`,
      trigger_type: "low_confidence",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: confidence,
    };
  }

  // MEDIUM confidence + weak evidence → trigger
  if (confidence === "medium" && evidenceScore < TRIGGER_THRESHOLDS.EVIDENCE_SCORE_TRIGGER) {
    return {
      should_trigger: true,
      reason: `Medium confidence with weak evidence score (${evidenceScore.toFixed(2)} < ${TRIGGER_THRESHOLDS.EVIDENCE_SCORE_TRIGGER}) — second pass to improve evidence base`,
      trigger_type: "weak_evidence",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: confidence,
    };
  }

  // MEDIUM confidence + critical unresolved risk → trigger
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
      };
    }
  }

  // Default: no trigger for medium confidence with acceptable evidence
  return {
    should_trigger: false,
    reason: `Medium confidence (${confidence}) with acceptable evidence (${evidenceScore.toFixed(2)}) — no second pass needed`,
    trigger_type: "no_trigger_high_confidence",
    evidence_score_at_trigger: evidenceScore,
    confidence_at_trigger: confidence,
  };
}

/**
 * Advance the loop state after a trigger decision.
 */
export function advanceLoopState(
  loopState: LoopState,
  triggerDecision: TriggerDecision,
  additionalBudgetUsed: number = 1
): LoopState {
  return {
    ...loopState,
    iteration: loopState.iteration + 1,
    budget_used: loopState.budget_used + additionalBudgetUsed,
    triggered: triggerDecision.should_trigger,
    trigger_reason: triggerDecision.reason,
    trigger_time: Date.now(),
  };
}
