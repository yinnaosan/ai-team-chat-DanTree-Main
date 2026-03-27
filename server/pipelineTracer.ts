/**
 * DANTREE_E2E — Pipeline Tracer (Instrumentation Layer)
 *
 * Provides lightweight tracepoints across the full reasoning pipeline.
 * Used by E2E tests to verify that each module fires in the correct order
 * and produces the expected control signals.
 *
 * Design:
 *   - Zero side effects on production logic
 *   - All functions are pure recorders — they accept existing outputs and
 *     return a structured trace entry without modifying any input
 *   - Non-fatal: any error in tracer is swallowed and returns a null entry
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineStage =
  | "history_bootstrap"       // LEVEL21: buildHistoryBootstrap
  | "step0_revalidation"      // LEVEL21C: runStep0Revalidation
  | "step0_binding"           // LEVEL21C: bindStep0Result
  | "dispatch"                // LEVEL21C: dispatchNextProbeFromHistoryControl
  | "routing_priority"        // LEVEL21C: enforceRoutingPriority
  | "trigger_evaluation"      // LEVEL21B: evaluateTrigger
  | "stop_evaluation"         // LEVEL21B/D: evaluateStopCondition
  | "memory_retrieval"        // LEVEL3: retrieveMemory
  | "memory_influence"        // LEVEL3: computeMemoryInfluence
  | "memory_write"            // LEVEL3: writeMemory
  | "memory_evolution"        // LEVEL3.5: runPostOutcomeEvolution
  | "learning_config"         // LEVEL3.6 Patch: getLearningConfig
  | "converged_output";       // LEVEL21D: buildConvergedOutput

export interface TraceEntry {
  stage: PipelineStage;
  timestamp: number;
  fired: boolean;
  key_signals: Record<string, unknown>;
  notes?: string;
}

export interface PipelineTrace {
  scenario_id: string;
  entries: TraceEntry[];
  started_at: number;
  completed_at: number | null;
  stages_fired: PipelineStage[];
  breakpoints_detected: string[];
}

// ── Tracer Factory ────────────────────────────────────────────────────────────

export function createPipelineTrace(scenarioId: string): PipelineTrace {
  return {
    scenario_id: scenarioId,
    entries: [],
    started_at: Date.now(),
    completed_at: null,
    stages_fired: [],
    breakpoints_detected: [],
  };
}

export function recordTraceEntry(
  trace: PipelineTrace,
  stage: PipelineStage,
  keySignals: Record<string, unknown>,
  notes?: string
): void {
  try {
    const entry: TraceEntry = {
      stage,
      timestamp: Date.now(),
      fired: true,
      key_signals: keySignals,
      notes,
    };
    trace.entries.push(entry);
    if (!trace.stages_fired.includes(stage)) {
      trace.stages_fired.push(stage);
    }
  } catch {
    // non-fatal: tracer errors never break pipeline
  }
}

export function finalizeTrace(trace: PipelineTrace): PipelineTrace {
  trace.completed_at = Date.now();
  return trace;
}

// ── Breakpoint Detection ──────────────────────────────────────────────────────

/**
 * Audit a completed trace for hidden breakpoints.
 * A breakpoint is a stage that was expected but did not fire,
 * or a control signal that contradicts the expected behavior.
 */
export function auditTraceForBreakpoints(
  trace: PipelineTrace,
  expectedStages: PipelineStage[]
): string[] {
  const breakpoints: string[] = [];

  // Check all expected stages fired
  for (const stage of expectedStages) {
    if (!trace.stages_fired.includes(stage)) {
      breakpoints.push(`MISSING_STAGE: ${stage} expected but not recorded`);
    }
  }

  // Check for signal contradictions
  for (const entry of trace.entries) {
    const signals = entry.key_signals;

    // Contradiction: step0_forces_continuation=true but stop_evaluation says should_stop=true
    if (
      entry.stage === "stop_evaluation" &&
      signals.step0_forces_continuation === true &&
      signals.should_stop === true
    ) {
      breakpoints.push(
        `SIGNAL_CONTRADICTION: stop_evaluation.should_stop=true despite step0_forces_continuation=true`
      );
    }

    // Contradiction: failure_intensity >= threshold but routing did not go to risk_probe
    if (
      entry.stage === "dispatch" &&
      typeof signals.failure_intensity_score === "number" &&
      typeof signals.failure_threshold === "number" &&
      signals.failure_intensity_score >= signals.failure_threshold &&
      signals.dispatched_step_type !== "risk_probe"
    ) {
      breakpoints.push(
        `SIGNAL_CONTRADICTION: dispatch.dispatched_step_type=${signals.dispatched_step_type} despite high failure_intensity=${signals.failure_intensity_score}`
      );
    }

    // Contradiction: success_strength >= threshold but trigger fired anyway (without revalidation_mandatory)
    if (
      entry.stage === "trigger_evaluation" &&
      typeof signals.success_strength_score === "number" &&
      typeof signals.success_threshold === "number" &&
      signals.success_strength_score >= signals.success_threshold &&
      signals.revalidation_mandatory !== true &&
      signals.should_trigger === true &&
      signals.confidence === "medium"
    ) {
      breakpoints.push(
        `SIGNAL_CONTRADICTION: trigger_evaluation.should_trigger=true despite success_strength=${signals.success_strength_score} >= ${signals.success_threshold}`
      );
    }

    // Contradiction: early_stop_bias_applied=true but adjusted_threshold is still default
    if (
      entry.stage === "converged_output" &&
      signals.early_stop_bias_applied === true &&
      signals.adjusted_threshold === "0.65 (default)"
    ) {
      breakpoints.push(
        `SIGNAL_CONTRADICTION: converged_output.early_stop_bias_applied=true but adjusted_threshold is still default`
      );
    }
  }

  trace.breakpoints_detected = breakpoints;
  return breakpoints;
}

// ── Trace Summary ─────────────────────────────────────────────────────────────

export function buildTraceSummary(trace: PipelineTrace): string {
  const duration = trace.completed_at
    ? trace.completed_at - trace.started_at
    : null;
  const lines = [
    `Scenario: ${trace.scenario_id}`,
    `Stages fired: [${trace.stages_fired.join(", ")}]`,
    `Entries: ${trace.entries.length}`,
    `Duration: ${duration !== null ? `${duration}ms` : "not completed"}`,
    `Breakpoints: ${trace.breakpoints_detected.length === 0 ? "NONE" : trace.breakpoints_detected.join("; ")}`,
  ];
  return lines.join(" | ");
}
