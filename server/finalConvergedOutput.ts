/**
 * DANTREE_LEVEL2 Phase7: Final Converged Output Builder
 * Merges Level1 output with Level2 reasoning loop results into a single
 * authoritative final output. This is the last step before report rendering.
 */

import type { FinalOutputSchema } from "./outputSchemaValidator";
import type { LoopState } from "./loopStateTriggerEngine";
import type { EvidenceDelta } from "./evidenceDeltaEngine";
import type { UpdatedVerdict } from "./verdictUpdater";
import type { StopDecision } from "./loopStopController";
import { buildLoopSummary } from "./loopStopController";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConvergedOutput {
  // Final merged schema (ready for rendering)
  final_schema: FinalOutputSchema;

  // Level2 loop metadata (for frontend display and telemetry)
  loop_metadata: {
    loop_ran: boolean;
    iterations_completed: number;
    stop_reason: string;
    convergence_signal: string;
    evidence_score_before: number;
    evidence_score_after: number;
    evidence_score_delta: number;
    confidence_before: string;
    confidence_after: string;
    verdict_changed: boolean;
    change_type: string;
    loop_summary: string;
  };
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Build the final converged output by merging Level1 and Level2 results.
 * If Level2 loop did not run, returns Level1 output unchanged.
 */
export function buildConvergedOutput(params: {
  level1Output: FinalOutputSchema;
  loopRan: boolean;
  loopState?: LoopState;
  evidenceDelta?: EvidenceDelta;
  updatedVerdict?: UpdatedVerdict;
  stopDecision?: StopDecision;
}): ConvergedOutput {
  const { level1Output, loopRan, loopState, evidenceDelta, updatedVerdict, stopDecision } = params;

  // ── Case 1: Loop did not run ──────────────────────────────────────────────
  if (!loopRan || !evidenceDelta || !updatedVerdict || !stopDecision) {
    return {
      final_schema: level1Output,
      loop_metadata: {
        loop_ran: false,
        iterations_completed: 0,
        stop_reason: "not_triggered",
        convergence_signal: "n/a",
        evidence_score_before: 0,
        evidence_score_after: 0,
        evidence_score_delta: 0,
        confidence_before: level1Output.confidence,
        confidence_after: level1Output.confidence,
        verdict_changed: false,
        change_type: "unchanged",
        loop_summary: "",
      },
    };
  }

  // ── Case 2: Loop ran — merge outputs ──────────────────────────────────────
  const loopSummary = buildLoopSummary(stopDecision, evidenceDelta, updatedVerdict);

  // Build merged final schema
  const mergedSchema: FinalOutputSchema = {
    // Updated verdict and confidence from Level2
    verdict: updatedVerdict.final_verdict,
    confidence: updatedVerdict.final_confidence,

    // Preserve Level1 horizon
    horizon: level1Output.horizon,

    // Merge bull_case: Level1 + second pass supporting evidence
    bull_case: mergeBullCase(level1Output.bull_case, updatedVerdict),

    // Preserve Level1 reasoning (structural)
    reasoning: level1Output.reasoning,

    // Merge bear_case: Level1 + second pass contradicting evidence
    bear_case: mergeBearCase(level1Output.bear_case, updatedVerdict, evidenceDelta),

    // Merged risks (includes any new risks from second pass)
    risks: updatedVerdict.merged_risks,

    // Preserve Level1 next_steps
    next_steps: level1Output.next_steps,

    // Merge discussion: update key_uncertainty if verdict changed
    discussion: mergeDiscussion(level1Output.discussion, updatedVerdict, evidenceDelta),
  };

  return {
    final_schema: mergedSchema,
    loop_metadata: {
      loop_ran: true,
      iterations_completed: stopDecision.iterations_completed,
      stop_reason: stopDecision.stop_reason,
      convergence_signal: stopDecision.final_convergence_signal,
      evidence_score_before: evidenceDelta.evidence_score_before,
      evidence_score_after: evidenceDelta.evidence_score_after,
      evidence_score_delta: evidenceDelta.evidence_score_delta,
      confidence_before: evidenceDelta.confidence_before,
      confidence_after: evidenceDelta.confidence_after,
      verdict_changed: updatedVerdict.verdict_changed,
      change_type: updatedVerdict.change_type,
      loop_summary: loopSummary,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mergeBullCase(
  level1BullCase: string[],
  updatedVerdict: UpdatedVerdict
): string[] {
  // If verdict was reinforced, add second pass finding to bull case
  if (updatedVerdict.change_type === "reinforced") {
    const newBull = updatedVerdict.second_pass_finding;
    return [...level1BullCase.slice(0, 4), newBull].slice(0, 5);
  }
  return level1BullCase;
}

function mergeBearCase(
  level1BearCase: string[],
  updatedVerdict: UpdatedVerdict,
  evidenceDelta: EvidenceDelta
): string[] {
  // If verdict was qualified or reversed, add second pass finding to bear case
  if (updatedVerdict.change_type === "qualified" || updatedVerdict.change_type === "reversed") {
    const newBear = updatedVerdict.second_pass_finding;
    return [...level1BearCase.slice(0, 3), newBear].slice(0, 4);
  }

  // If new risk was introduced, note it in bear case
  if (evidenceDelta.new_risk_introduced) {
    const newBear = `[二次分析] ${updatedVerdict.merged_risks[updatedVerdict.merged_risks.length - 1]?.description ?? "新风险已识别"}`;
    return [...level1BearCase.slice(0, 3), newBear].slice(0, 4);
  }

  return level1BearCase;
}

function mergeDiscussion(
  level1Discussion: FinalOutputSchema["discussion"],
  updatedVerdict: UpdatedVerdict,
  evidenceDelta: EvidenceDelta
): FinalOutputSchema["discussion"] {
  // If verdict changed, update key_uncertainty to reflect the change
  if (updatedVerdict.verdict_changed) {
    return {
      ...level1Discussion,
      key_uncertainty: updatedVerdict.change_narrative,
      // Add second pass contribution to exploration_paths
      exploration_paths: [
        ...level1Discussion.exploration_paths.slice(0, 2),
        updatedVerdict.second_pass_contribution,
      ],
    };
  }

  // If evidence diverged, update weakest_point
  if (evidenceDelta.convergence_signal === "diverged") {
    return {
      ...level1Discussion,
      weakest_point: `[二次分析发现] ${updatedVerdict.second_pass_finding}`,
    };
  }

  return level1Discussion;
}
