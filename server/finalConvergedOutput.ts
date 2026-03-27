/**
 * DANTREE_LEVEL2 Phase7: Final Converged Output Builder
 * Merges Level1 output with Level2 reasoning loop results into a single
 * authoritative final output. This is the last step before report rendering.
 *
 * LEVEL21B: Extended loop_metadata with history control trace fields.
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
    // ── LEVEL21: History-Driven Reasoning fields ──────────────────────────
    history_bootstrap_used?: boolean;
    history_record_count?: number;
    history_action_pattern?: string;
    history_days_since_last?: number;
    history_revalidation_summary?: string;
    thesis_delta?: string;
    action_delta?: string;
    step0_ran?: boolean;
    // ── LEVEL21B: History Control Trace fields ────────────────────────────
    history_requires_control?: boolean;
    revalidation_mandatory?: boolean;
    history_control_reason?: string;
    preferred_probe_order?: string[];
    history_controlled?: boolean;
    controller_path?: string[];
    delta_stop_applied?: boolean;
    delta_stop_reason?: string;
    require_thesis_update_step?: boolean;
    history_control_summary_line?: string;
    action_changed?: boolean;
    thesis_changed?: boolean;
    // ── LEVEL21D: Step0 stop override + forced dispatch + execution trace ──
    step0_stop_override_applied?: boolean;
    step0_stop_reason_d?: string;
    forced_step_type_used?: boolean;
    effective_step_type?: string;
    forced_from?: string;
    execution_path_trace?: {
      executed_path: string[];
      intended_path: string[];
      path_divergence: string[];
      final_execution_summary: string;
    };
  };
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Build the final converged output by merging Level1 and Level2 results.
 * If Level2 loop did not run, returns Level1 output unchanged.
 *
 * LEVEL21B: level21 parameter extended with history control trace fields.
 */
export function buildConvergedOutput(params: {
  level1Output: FinalOutputSchema;
  loopRan: boolean;
  loopState?: LoopState;
  evidenceDelta?: EvidenceDelta;
  updatedVerdict?: UpdatedVerdict;
  stopDecision?: StopDecision;
  // LEVEL21 + LEVEL21B history-driven fields (optional, non-breaking)
  level21?: {
    history_bootstrap_used: boolean;
    history_record_count: number;
    history_action_pattern: string;
    history_days_since_last: number;
    history_revalidation_summary: string;
    thesis_delta: string;
    action_delta: string;
    step0_ran: boolean;
    // LEVEL21B: control trace
    history_requires_control?: boolean;
    revalidation_mandatory?: boolean;
    history_control_reason?: string;
    preferred_probe_order?: string[];
    history_controlled?: boolean;
    controller_path?: string[];
    delta_stop_applied?: boolean;
    delta_stop_reason?: string;
    require_thesis_update_step?: boolean;
    history_control_summary_line?: string;
    action_changed?: boolean;
    thesis_changed?: boolean;
    change_type?: string;
    // LEVEL21D: Step0 stop override + forced dispatch + execution trace
    step0_stop_override_applied?: boolean;
    step0_stop_reason_d?: string;
    forced_step_type_used?: boolean;
    effective_step_type?: string;
    forced_from?: string;
    execution_path_trace?: {
      executed_path: string[];
      intended_path: string[];
      path_divergence: string[];
      final_execution_summary: string;
    };
  };
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
        // LEVEL21 defaults
        history_bootstrap_used: false,
        history_record_count: 0,
        history_action_pattern: "",
        history_days_since_last: -1,
        history_revalidation_summary: "",
        thesis_delta: "",
        action_delta: "",
        step0_ran: false,
        // LEVEL21B defaults
        history_requires_control: false,
        revalidation_mandatory: false,
        history_control_reason: "",
        preferred_probe_order: [],
        history_controlled: false,
        controller_path: [],
        delta_stop_applied: false,
        delta_stop_reason: "",
        require_thesis_update_step: false,
        history_control_summary_line: "",
        action_changed: false,
        thesis_changed: false,
        // LEVEL21D defaults
        step0_stop_override_applied: false,
        step0_stop_reason_d: "",
        forced_step_type_used: false,
        effective_step_type: "",
        forced_from: "fallback",
        execution_path_trace: {
          executed_path: [],
          intended_path: [],
          path_divergence: [],
          final_execution_summary: "loop_not_ran",
        },
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

  // LEVEL21B: Extract delta stop fields from stopDecision
  const deltaStopFields = {
    delta_stop_applied: stopDecision.delta_stop_applied ?? false,
    delta_stop_reason: stopDecision.delta_stop_reason ?? "",
    require_thesis_update_step: stopDecision.require_thesis_update_step ?? false,
    history_control_summary_line: stopDecision.history_control_summary?.summary_line ?? "",
    action_changed: stopDecision.history_control_summary?.action_changed ?? false,
    thesis_changed: stopDecision.history_control_summary?.thesis_changed ?? false,
  };

  // LEVEL21B: Extract loop state history control fields
  const loopStateHistoryFields = params.loopState
    ? {
        history_controlled: params.loopState.history_controlled ?? false,
        controller_path: params.loopState.controller_path ?? [],
      }
    : {
        history_controlled: false,
        controller_path: [] as string[],
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
      // LEVEL21 + LEVEL21B: pass through history-driven fields if provided
      ...(params.level21 ?? {
        history_bootstrap_used: false,
        history_record_count: 0,
        history_action_pattern: "",
        history_days_since_last: -1,
        history_revalidation_summary: "",
        thesis_delta: "",
        action_delta: "",
        step0_ran: false,
      }),
      // LEVEL21B: delta stop + loop state history fields (override level21 if present)
      ...deltaStopFields,
      ...loopStateHistoryFields,
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
