/**
 * DANTREE_LEVEL2 Phase6: Loop Stop Controller
 * Determines whether the reasoning loop should stop or continue.
 * Enforces hard stops and convergence detection.
 */

import type { LoopState } from "./loopStateTriggerEngine";
import type { EvidenceDelta } from "./evidenceDeltaEngine";
import type { UpdatedVerdict } from "./verdictUpdater";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StopDecision {
  should_stop: boolean;
  stop_reason: StopReason;
  stop_message: string;
  iterations_completed: number;
  final_convergence_signal: "converged" | "diverged" | "inconclusive" | "forced_stop";
}

export type StopReason =
  | "converged"              // Evidence converged, loop complete
  | "max_iterations"         // Hard cap reached
  | "budget_exhausted"       // LLM call budget exhausted
  | "verdict_reversed"       // Verdict was reversed — stop and report
  | "high_confidence"        // Confidence reached high — no more passes needed
  | "no_improvement"         // Second pass added nothing material
  | "error_fallback";        // Second pass failed — stop gracefully

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Determine whether the reasoning loop should stop.
 * Called after each second pass completes.
 */
export function evaluateStopCondition(params: {
  loopState: LoopState;
  evidenceDelta: EvidenceDelta;
  updatedVerdict: UpdatedVerdict;
  secondPassSucceeded: boolean;
}): StopDecision {
  const { loopState, evidenceDelta, updatedVerdict, secondPassSucceeded } = params;

  // ── Hard stops ────────────────────────────────────────────────────────────

  // Second pass failed
  if (!secondPassSucceeded) {
    return {
      should_stop: true,
      stop_reason: "error_fallback",
      stop_message: "Second pass execution failed. Proceeding with Level1 output as final.",
      iterations_completed: loopState.iteration,
      final_convergence_signal: "forced_stop",
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
    };
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
    };
  }

  // High confidence achieved
  if (updatedVerdict.final_confidence === "high") {
    return {
      should_stop: true,
      stop_reason: "high_confidence",
      stop_message: `High confidence achieved after ${loopState.iteration} iteration(s). Loop complete.`,
      iterations_completed: loopState.iteration,
      final_convergence_signal: "converged",
    };
  }

  // Evidence converged
  if (evidenceDelta.convergence_signal === "converged") {
    return {
      should_stop: true,
      stop_reason: "converged",
      stop_message: `Evidence converged: ${evidenceDelta.convergence_reason}`,
      iterations_completed: loopState.iteration,
      final_convergence_signal: "converged",
    };
  }

  // No material improvement
  if (
    evidenceDelta.evidence_score_delta < 0.02 &&
    !evidenceDelta.confidence_changed &&
    updatedVerdict.change_type === "unchanged"
  ) {
    return {
      should_stop: true,
      stop_reason: "no_improvement",
      stop_message: "Second pass added no material new information. Stopping loop to conserve resources.",
      iterations_completed: loopState.iteration,
      final_convergence_signal: "inconclusive",
    };
  }

  // ── Continue loop ─────────────────────────────────────────────────────────
  return {
    should_stop: false,
    stop_reason: "converged",  // placeholder — not used when should_stop=false
    stop_message: `Iteration ${loopState.iteration} complete. Evidence score improved by ${(evidenceDelta.evidence_score_delta * 100).toFixed(1)}%. Continuing loop.`,
    iterations_completed: loopState.iteration,
    final_convergence_signal: "inconclusive",
  };
}

/**
 * Build a human-readable loop summary for inclusion in the final report.
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

  return parts.join(" ");
}
