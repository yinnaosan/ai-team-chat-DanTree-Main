/**
 * LEVEL2C: Loop Telemetry Writer
 * Writes loop execution data to loop_telemetry table for threshold calibration.
 * MODULE_ID: LEVEL2C_TELEMETRY_WRITER
 * ZERO_NEW_LLM_CALLS: true
 */

import { getDb } from "./db";
import { loopTelemetry } from "../drizzle/schema";
import type { LoopState } from "./loopStateTriggerEngine";
import type { TriggerDecision } from "./loopStateTriggerEngine";
import type { HypothesisCandidate } from "./hypothesisEngine";
import type { EvidenceDelta } from "./evidenceDeltaEngine";

export interface TelemetryWriteParams {
  taskId: number;
  userId: number;
  primaryTicker: string;
  triggerDecision: TriggerDecision;
  loopState: LoopState;
  hypothesisCandidates: HypothesisCandidate[];
  selectedHypothesis: HypothesisCandidate | null;
  secondPassSuccess: boolean;
  evidenceDelta: EvidenceDelta | null;
  verdictChanged: boolean;
  outputMode: string;
  loopDurationMs: number;
}

export async function writeLoopTelemetry(params: TelemetryWriteParams): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(loopTelemetry).values({
      taskId: params.taskId,
      userId: params.userId,
      primaryTicker: params.primaryTicker,
      triggerType: params.triggerDecision.trigger_type,
      triggerReason: params.triggerDecision.reason,
      evidenceScoreAtTrigger: String(params.triggerDecision.evidence_score_at_trigger ?? 0),
      confidenceAtTrigger: params.triggerDecision.confidence_at_trigger ?? "",
      hypothesisCandidateCount: params.hypothesisCandidates.length,
      selectedHypothesisId: params.selectedHypothesis?.hypothesis_id ?? "",
      selectedFocusArea: params.selectedHypothesis?.focus_area ?? "",
      secondPassSuccess: params.secondPassSuccess ? 1 : 0,
      evidenceDelta: String(params.evidenceDelta?.evidence_score_delta ?? 0),
      verdictChanged: params.verdictChanged ? 1 : 0,
      outputMode: params.outputMode,
      loopDurationMs: params.loopDurationMs,
      llmCallsUsed: params.loopState.iteration ?? 0,
    });
  } catch (e) {
    // Non-fatal: telemetry write failure must never break the main flow
    console.error("[LEVEL2C] Telemetry write failed:", (e as Error).message);
  }
}

/**
 * THRESHOLD_CONFIG: Current trigger thresholds (calibrate after 50+ telemetry rows)
 * EVIDENCE_SCORE_TRIGGER_THRESHOLD: 0.65
 * CONFIDENCE_TRIGGER_VALUES: ["low", "very_low", "insufficient"]
 * MAX_LOOP_ITERATIONS: 1
 * MAX_LLM_CALLS_PER_LOOP: 2
 */
export const LOOP_THRESHOLD_CONFIG = {
  EVIDENCE_SCORE_TRIGGER: 0.65,
  CONFIDENCE_TRIGGER_VALUES: ["low", "very_low", "insufficient"] as string[],
  MAX_LOOP_ITERATIONS: 1,
  MAX_LLM_CALLS_PER_LOOP: 2,
  SKIP_MODES: ["quick", "discussion", "general"] as string[],
} as const;
