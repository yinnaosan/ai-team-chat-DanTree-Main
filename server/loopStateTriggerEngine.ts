/**
 * DANTREE_LEVEL2 Phase1: Loop State and Trigger Engine
 * Determines whether a second reasoning pass is warranted after Level1 output.
 *
 * LEVEL3B: Extended with memory-aware trigger logic.
 * MemorySeed and MemoryConflict can override or elevate trigger decisions.
 */

import type { IntentContext } from "./intentInterpreter";
import type { FinalOutputSchema } from "./outputSchemaValidator";
import type { StructuredSynthesis } from "./synthesisController";
import type { MemorySeed, MemoryConflict } from "./hypothesisEngine";

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
    | "memory_conflict_override"     // LEVEL3B: conflict forced trigger
    | "memory_recurrence_boost"      // LEVEL3B: memory boosted trigger
    | "no_trigger_high_confidence"
    | "no_trigger_quick_mode"
    | "no_trigger_discussion_mode"
    | "no_trigger_budget_exhausted"
    | "no_trigger_max_iterations";
  evidence_score_at_trigger: number;
  confidence_at_trigger: string;
  memory_influenced: boolean;        // LEVEL3B: true if memory changed the decision
  memory_influence_summary: string;  // LEVEL3B: human-readable explanation
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
  // LEVEL3B: Memory conflict always forces trigger (even if high confidence)
  MEMORY_CONFLICT_FORCE_TRIGGER: true,
  // LEVEL3B: Memory recurrence boosts evidence_score threshold by this amount
  MEMORY_RECURRENCE_THRESHOLD_BOOST: 0.05,
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
 *
 * LEVEL3B: Optional memorySeed and memoryConflict inputs enable memory-aware
 * trigger overrides and priority boosts.
 */
export function evaluateTrigger(params: {
  loopState: LoopState;
  intentCtx: IntentContext;
  analysisMode: string;
  evidenceScore: number;
  level1a3Output: FinalOutputSchema | null;
  structuredSynthesis: StructuredSynthesis | null;
  memorySeed?: MemorySeed;       // LEVEL3B
  memoryConflict?: MemoryConflict; // LEVEL3B
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
      memory_influenced: false,
      memory_influence_summary: "",
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
      memory_influenced: false,
      memory_influence_summary: "",
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
      memory_influenced: false,
      memory_influence_summary: "",
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
      memory_influenced: false,
      memory_influence_summary: "",
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
      memory_influenced: false,
      memory_influence_summary: "",
    };
  }

  // ── LEVEL3B: Memory Conflict Override ────────────────────────────────────
  // If a material conflict is detected, force trigger regardless of confidence.
  // This ensures verdict flips and risk escalations always get a second pass.
  if (
    TRIGGER_THRESHOLDS.MEMORY_CONFLICT_FORCE_TRIGGER &&
    memoryConflict?.has_conflict &&
    memoryConflict.conflict_type !== "none"
  ) {
    return {
      should_trigger: true,
      reason: `Memory conflict detected (${memoryConflict.conflict_type}) — second pass required to resolve thesis tension`,
      trigger_type: "memory_conflict_override",
      evidence_score_at_trigger: evidenceScore,
      confidence_at_trigger: level1a3Output?.confidence ?? "unknown",
      memory_influenced: true,
      memory_influence_summary: memoryConflict.summary,
    };
  }

  // ── Trigger conditions ────────────────────────────────────────────────────

  const confidence = level1a3Output?.confidence ?? "medium";

  // HIGH confidence + good evidence → normally no trigger
  // LEVEL3B: But if memory has unresolved prior hypotheses, apply recurrence boost
  if (confidence === "high" && evidenceScore >= 0.75) {
    // Check if memory has unresolved hypotheses that should be revisited
    if (
      memorySeed?.memory_found &&
      memorySeed.prior_open_hypotheses.length > 0
    ) {
      // Boost: lower the effective evidence threshold
      const effectiveThreshold = 0.75 - TRIGGER_THRESHOLDS.MEMORY_RECURRENCE_THRESHOLD_BOOST;
      if (evidenceScore < 0.75 + 0.05) {
        // Still trigger if evidence is only marginally above threshold
        return {
          should_trigger: true,
          reason: `High confidence but prior unresolved hypotheses from memory — second pass to revalidate`,
          trigger_type: "memory_recurrence_boost",
          evidence_score_at_trigger: evidenceScore,
          confidence_at_trigger: confidence,
          memory_influenced: true,
          memory_influence_summary: `Prior open hypothesis: "${memorySeed.prior_open_hypotheses[0].slice(0, 80)}"`,
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
    };
  }

  // LOW confidence → always trigger
  if (confidence === "low") {
    const memoryNote = memorySeed?.memory_found
      ? ` (memory: prior verdict was ${memorySeed.prior_verdict})`
      : "";
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
    };
  }

  // MEDIUM confidence + weak evidence → trigger
  // LEVEL3B: Effective threshold raised slightly if memory has recurrence data
  const effectiveEvidenceThreshold = memorySeed?.memory_found
    ? TRIGGER_THRESHOLDS.EVIDENCE_SCORE_TRIGGER + TRIGGER_THRESHOLDS.MEMORY_RECURRENCE_THRESHOLD_BOOST
    : TRIGGER_THRESHOLDS.EVIDENCE_SCORE_TRIGGER;

  if (confidence === "medium" && evidenceScore < effectiveEvidenceThreshold) {
    const memoryNote = memorySeed?.memory_found
      ? ` (memory-adjusted threshold: ${effectiveEvidenceThreshold.toFixed(2)})`
      : "";
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
        memory_influenced: false,
        memory_influence_summary: "",
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
    memory_influenced: false,
    memory_influence_summary: "",
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
