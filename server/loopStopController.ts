/**
 * DANTREE_LEVEL2 Phase6: Loop Stop Controller
 * Determines whether the reasoning loop should stop or continue.
 * Enforces hard stops and convergence detection.
 *
 * LEVEL21B: Extended with delta-driven stop/continue logic.
 *   - DeltaStopEvaluation from historyBootstrap drives stop decision
 *   - History reaffirmation → early stop allowed
 *   - Action change → require thesis_update step before stop
 *   - Thesis invalidated/reversed → must continue until coherent
 *   - HistoryControlSummary is attached to StopDecision for frontend trace
 */

import type { LoopState } from "./loopStateTriggerEngine";
import type { EvidenceDelta } from "./evidenceDeltaEngine";
import type { UpdatedVerdict } from "./verdictUpdater";
import type {
  DeltaStopEvaluation,
  HistoryControlSummary,
  Step0BindingResult,
} from "./historyBootstrap";
import { getLearningConfig } from "./learningConfig";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StopDecision {
  should_stop: boolean;
  stop_reason: StopReason;
  stop_message: string;
  iterations_completed: number;
  final_convergence_signal: "converged" | "diverged" | "inconclusive" | "forced_stop";

  // LEVEL21B: History control trace
  history_control_summary: HistoryControlSummary | null;
  delta_stop_applied: boolean;
  delta_stop_reason: string;
  require_thesis_update_step: boolean;
  // LEVEL21D: Step0 stop override
  step0_stop_override_applied: boolean;
  step0_stop_reason: string;
  // LEVEL3.6: Learning control
  early_stop_bias_applied: boolean;
  adjusted_threshold: string;
}

export type StopReason =
  | "converged"              // Evidence converged, loop complete
  | "max_iterations"         // Hard cap reached
  | "budget_exhausted"       // LLM call budget exhausted
  | "verdict_reversed"       // Verdict was reversed — stop and report
  | "high_confidence"        // Confidence reached high — no more passes needed
  | "no_improvement"         // Second pass added nothing material
  | "error_fallback"         // Second pass failed — stop gracefully
  | "history_reaffirmed"     // LEVEL21B: prior action reaffirmed — early stop
  | "history_delta_stop"     // LEVEL21B: delta evaluation forced stop
  | "history_thesis_update"; // LEVEL21B: thesis update step required before stop

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Determine whether the reasoning loop should stop.
 * Called after each second pass completes.
 *
 * LEVEL21B: deltaStopEval and historyControlSummary are optional inputs.
 * When provided, they take precedence over standard convergence logic
 * for reaffirmation and reconsideration cases.
 */
export function evaluateStopCondition(params: {
  loopState: LoopState;
  evidenceDelta: EvidenceDelta;
  updatedVerdict: UpdatedVerdict;
  secondPassSucceeded: boolean;
  deltaStopEval?: DeltaStopEvaluation;         // LEVEL21B
  historyControlSummary?: HistoryControlSummary; // LEVEL21B
  step0Binding?: Step0BindingResult;              // LEVEL21D
  earlyStopBiasEligible?: boolean;                // LEVEL3.6: from memory success_strength_score
}): StopDecision {
  const {
    loopState,
    evidenceDelta,
    updatedVerdict,
    secondPassSucceeded,
    deltaStopEval,
    historyControlSummary,
    step0Binding,
    earlyStopBiasEligible,
  } = params;

  const historyTrace = historyControlSummary ?? null;
  // LEVEL3.6: Compute adjusted stop threshold based on early_stop_bias
  // Per GPT Q3: does NOT change max_iterations, only affects stop threshold
  const biasActive = earlyStopBiasEligible === true;
  // When bias active: lower evidence convergence threshold (from learningConfig)
  // Per GPT Q3: does NOT change max_iterations, only affects stop threshold
  const _cfg = getLearningConfig();
  const ADJUSTED_EVIDENCE_THRESHOLD = biasActive ? _cfg.stop_bias_evidence_floor : 0.65;

  // ── LEVEL21D: Step0 Binding Priority Override (before hard stops) ──────────────
  // Priority A: step0_forces_continuation → must NOT stop, overrides delta and quality stops
  if (step0Binding?.step0_forces_continuation) {
    return {
      should_stop: false,
      stop_reason: "history_thesis_update",
      stop_message: `Step0 revalidation forces continuation: confidence=${step0Binding.step0_confidence}, probe=${step0Binding.step0_followup_probe}`,
      iterations_completed: loopState.iteration,
      final_convergence_signal: "inconclusive",
      history_control_summary: historyTrace,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: true,
      step0_stop_override_applied: true,
      step0_stop_reason: `step0_forces_continuation=true (confidence=${step0Binding.step0_confidence}, probe=${step0Binding.step0_followup_probe})`,
      early_stop_bias_applied: false,
      adjusted_threshold: "",
    };
  }

  // ── Hard stops ────────────────────────────────────────────────────────────

  // Second pass failed
  if (!secondPassSucceeded) {
    return {
      should_stop: true,
      stop_reason: "error_fallback",
      stop_message: "Second pass execution failed. Proceeding with Level1 output as final.",
      iterations_completed: loopState.iteration,
      final_convergence_signal: "forced_stop",
      history_control_summary: historyTrace,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "",
    };
  }

  // Max iterations reached
  if (loopState.iteration >= loopState.max_iterations) {
    return {
      should_stop: true,
      stop_reason: "max_iterations",
      stop_message: `Maximum iterations reached (${loopState.iteration}/${loopState.max_iterations}). Proceeding with best available synthesis.`,
      iterations_completed: loopState.iteration,
      final_convergence_signal: evidenceDelta.convergence_signal === "converged" ? "converged" : "forced_stop",
      history_control_summary: historyTrace,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "",
    };
  }

  // Budget exhausted
  if (loopState.budget_used >= loopState.budget_max) {
    return {
      should_stop: true,
      stop_reason: "budget_exhausted",
      stop_message: `LLM budget exhausted (${loopState.budget_used}/${loopState.budget_max} calls). Proceeding with current synthesis.`,
      iterations_completed: loopState.iteration,
      final_convergence_signal: "forced_stop",
      history_control_summary: historyTrace,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "",
    };
  }

  // ── LEVEL21B: Delta-Driven Stop/Continue ─────────────────────────────────

  if (deltaStopEval) {
    // Case 1: Reaffirmation — thesis and action unchanged → early stop
    // LEVEL21D: step0_allows_early_stop must also be true (or absent) to allow this
    if (deltaStopEval.reaffirmation && step0Binding?.step0_allows_early_stop !== false) {
      return {
        should_stop: true,
        stop_reason: "history_reaffirmed",
        stop_message: `History reaffirmation: ${deltaStopEval.stop_reason}`,
        iterations_completed: loopState.iteration,
        final_convergence_signal: "converged",
        history_control_summary: historyTrace,
        delta_stop_applied: true,
        delta_stop_reason: deltaStopEval.stop_reason,
        require_thesis_update_step: false,
        step0_stop_override_applied: !!step0Binding,
        step0_stop_reason: step0Binding ? `step0_allows_early_stop=true (confidence=${step0Binding.step0_confidence})` : "",
        early_stop_bias_applied: false,
        adjusted_threshold: "",
      };
    }

    // Case 2: Reconsideration + thesis_update required → must not stop yet
    if (deltaStopEval.reconsideration && deltaStopEval.require_thesis_update_step) {
      return {
        should_stop: false,
        stop_reason: "history_thesis_update",
        stop_message: `History reconsideration: ${deltaStopEval.stop_reason} — thesis_update step required`,
        iterations_completed: loopState.iteration,
        final_convergence_signal: "inconclusive",
        history_control_summary: historyTrace,
        delta_stop_applied: true,
        delta_stop_reason: deltaStopEval.stop_reason,
        require_thesis_update_step: true,
        step0_stop_override_applied: false,
        step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "",
      };
    }

    // Case 3: High materiality change → continue
    if (deltaStopEval.change_materiality === "high" && !deltaStopEval.reaffirmation) {
      return {
        should_stop: false,
        stop_reason: "history_delta_stop",
        stop_message: `High-materiality change detected: ${deltaStopEval.stop_reason} — continuing loop`,
        iterations_completed: loopState.iteration,
        final_convergence_signal: "inconclusive",
        history_control_summary: historyTrace,
        delta_stop_applied: true,
        delta_stop_reason: deltaStopEval.stop_reason,
        require_thesis_update_step: deltaStopEval.require_thesis_update_step,
        step0_stop_override_applied: false,
        step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "",
      };
    }
  }

  // ── Quality-based stops ───────────────────────────────────────────────────

  // Verdict reversed — always stop and report (don't loop further on a reversal)
  if (updatedVerdict.change_type === "reversed") {
    return {
      should_stop: true,
      stop_reason: "verdict_reversed",
      stop_message: "Verdict reversed by second pass. Stopping loop to prevent further divergence. Reporting updated verdict.",
      iterations_completed: loopState.iteration,
      final_convergence_signal: "diverged",
      history_control_summary: historyTrace,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "",
    };
  }

  // High confidence achieved
  // LEVEL21D: step0_allows_early_stop must also be true (or absent) to allow this
  if (updatedVerdict.final_confidence === "high" && step0Binding?.step0_allows_early_stop !== false) {
    return {
      should_stop: true,
      stop_reason: "high_confidence",
      stop_message: `High confidence achieved after ${loopState.iteration} iteration(s). Loop complete.${
        biasActive ? " [early_stop_bias_applied]" : ""
      }`,
      iterations_completed: loopState.iteration,
      final_convergence_signal: "converged",
      history_control_summary: historyTrace,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: biasActive,
      adjusted_threshold: biasActive ? `evidence>=${ADJUSTED_EVIDENCE_THRESHOLD}` : "",
    };
  }

  // LEVEL3.6: Early stop bias — medium confidence but evidence >= adjusted threshold
  // Per GPT Q3: does NOT change max_iterations, only affects stop threshold
  if (biasActive &&
      updatedVerdict.final_confidence === "medium" &&
      evidenceDelta.evidence_score_after >= ADJUSTED_EVIDENCE_THRESHOLD &&
      step0Binding?.step0_allows_early_stop !== false) {
    return {
      should_stop: true,
      stop_reason: "high_confidence",
      stop_message: `Early stop bias: medium confidence but evidence (${evidenceDelta.evidence_score_after.toFixed(2)}) >= adjusted threshold (${ADJUSTED_EVIDENCE_THRESHOLD}). Prior success pattern supports convergence.`,
      iterations_completed: loopState.iteration,
      final_convergence_signal: "converged",
      history_control_summary: historyTrace,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: true,
      adjusted_threshold: `evidence>=${ADJUSTED_EVIDENCE_THRESHOLD} (bias from success_strength_score)`,
    };
  }

  // Evidence converged
  // LEVEL21D: step0_allows_early_stop must also be true (or absent) to allow this
  if (evidenceDelta.convergence_signal === "converged" && step0Binding?.step0_allows_early_stop !== false) {
    return {
      should_stop: true,
      stop_reason: "converged",
      stop_message: `Evidence converged: ${evidenceDelta.convergence_reason}`,
      iterations_completed: loopState.iteration,
      final_convergence_signal: "converged",
      history_control_summary: historyTrace,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "",
    };
  }

  // No material improvement
  if (
    evidenceDelta.evidence_score_delta < 0.02 &&
    !evidenceDelta.confidence_changed &&
    updatedVerdict.change_type === "unchanged" &&
    step0Binding?.step0_allows_early_stop !== false  // LEVEL21D: respect step0 override
  ) {
    return {
      should_stop: true,
      stop_reason: "no_improvement",
      stop_message: "Second pass added no material new information. Stopping loop to conserve resources.",
      iterations_completed: loopState.iteration,
      final_convergence_signal: "inconclusive",
      history_control_summary: historyTrace,
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      step0_stop_override_applied: false,
      step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "",
    };
  }
  // ── Continue loop ────────────────────────────────────────────────────────────
  return {
    should_stop: false,
    stop_reason: "converged",  // placeholder — not used when should_stop=false
    stop_message: `Iteration ${loopState.iteration} complete. Evidence score improved by ${(evidenceDelta.evidence_score_delta * 100).toFixed(1)}%. Continuing loop.`,
    iterations_completed: loopState.iteration,
    final_convergence_signal: "inconclusive",
    history_control_summary: historyTrace,
    delta_stop_applied: false,
    delta_stop_reason: "",
    require_thesis_update_step: false,
    step0_stop_override_applied: false,
    step0_stop_reason: "",
      early_stop_bias_applied: false,
      adjusted_threshold: "",
  };
}/**
 * Build a human-readable loop summary for inclusion in the final report.
 * LEVEL21B: Includes history control summary when present.
 */
export function buildLoopSummary(
  stopDecision: StopDecision,
  evidenceDelta: EvidenceDelta,
  updatedVerdict: UpdatedVerdict
): string {
  if (stopDecision.final_convergence_signal === "forced_stop") {
    return ""; // Don't show loop summary for forced stops
  }

  const scoreChange = evidenceDelta.evidence_score_delta > 0
    ? `+${(evidenceDelta.evidence_score_delta * 100).toFixed(1)}%`
    : `${(evidenceDelta.evidence_score_delta * 100).toFixed(1)}%`;

  const parts: string[] = [];

  if (updatedVerdict.verdict_changed) {
    parts.push(`**[二次推理循环]** ${updatedVerdict.change_narrative}`);
  }

  if (stopDecision.final_convergence_signal === "converged") {
    parts.push(`证据强度：${scoreChange}，置信度：${evidenceDelta.confidence_before} → ${evidenceDelta.confidence_after}。`);
  } else if (stopDecision.final_convergence_signal === "diverged") {
    parts.push(`⚠️ 二次分析发现重要分歧，请重点关注修正后的判断。`);
  }

  // LEVEL21B: History control summary
  if (stopDecision.delta_stop_applied && stopDecision.history_control_summary) {
    const hcs = stopDecision.history_control_summary;
    if (hcs.action_changed) {
      parts.push(`**[历史对比]** ${hcs.summary_line}`);
    } else if (hcs.thesis_changed) {
      parts.push(`**[历史追踪]** ${hcs.summary_line}`);
    }
  }

  return parts.join(" ");
}
