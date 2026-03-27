/**
 * DANTREE_LEVEL3.5_MEMORY_EVOLUTION
 * Self-evolving memory engine: outcome update, failure learning,
 * pattern reinforcement, and memory decay.
 *
 * Priority chain: Step0 override > memory influence > history control > default
 */

import { getDb } from "./db";
import { memoryRecords } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { MemoryRecordRow } from "../drizzle/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OutcomeLabel = "success" | "failure" | "invalidated";

export interface OutcomeUpdateResult {
  memory_updated: boolean;
  old_outcome: string | null;
  new_outcome: string;
  reason: string;
  memory_id: string;
}

export interface FailurePatternResult {
  memory_id: string;
  failure_intensity_score: number;
  failure_modes_extracted: string[];
  risk_structure_boosted: boolean;
  reasoning_pattern_marked_weak: boolean;
}

export interface ReinforcementResult {
  memory_id: string;
  success_strength_score: number;
  reasoning_pattern_reinforced: boolean;
  early_stop_bias_eligible: boolean;
}

export interface DecayResult {
  memory_id: string;
  old_freshness: number;
  new_freshness: number;
  deactivated: boolean;
  influence_downgraded: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Freshness below this → downgrade influence flags */
const DECAY_INFLUENCE_THRESHOLD = 0.4;
/** Freshness below this → deactivate record */
const DECAY_DEACTIVATE_THRESHOLD = 0.1;
/** Exponential decay base per day */
const DECAY_RATE_PER_DAY = 0.035;
/** Failure intensity: base + per-failure-mode bonus */
const FAILURE_BASE_SCORE = 0.5;
const FAILURE_MODE_BONUS = 0.1;
const FAILURE_SCORE_MAX = 1.0;
/** Success strength: base + evidence bonus */
const SUCCESS_BASE_SCORE = 0.5;
const SUCCESS_EVIDENCE_BONUS_FACTOR = 0.5; // multiplied by evidenceScore (0-1)
const SUCCESS_STRENGTH_MAX = 1.0;
/** early_stop_bias eligible if successStrength >= this */
const EARLY_STOP_BIAS_THRESHOLD = 0.75;

// ── Phase 1: updateMemoryOutcome ──────────────────────────────────────────────

/**
 * Update outcomeLabel for a memory record.
 * Triggers: contradiction with new decision, Step0 invalidation, opposite action.
 * Appends entry to changeLog.
 */
export async function updateMemoryOutcome(
  memoryId: string,
  newOutcome: OutcomeLabel,
  reason: string
): Promise<OutcomeUpdateResult> {
  const db = await getDb();
  if (!db) return { memory_updated: false, old_outcome: null, new_outcome: newOutcome, reason: "db_unavailable", memory_id: memoryId };
  const rows = await db
    .select()
    .from(memoryRecords)
    .where(eq(memoryRecords.id, memoryId))
    .limit(1);

  if (rows.length === 0) {
    return {
      memory_updated: false,
      old_outcome: null,
      new_outcome: newOutcome,
      reason: `memory_not_found: ${memoryId}`,
      memory_id: memoryId,
    };
  }

  const record = rows[0];
  const oldOutcome = record.outcomeLabel ?? null;

  // Skip if outcome unchanged
  if (oldOutcome === newOutcome) {
    return {
      memory_updated: false,
      old_outcome: oldOutcome,
      new_outcome: newOutcome,
      reason: "outcome_unchanged",
      memory_id: memoryId,
    };
  }

  // Build change log entry
  const existingLog = (record.changeLog as Array<{ ts: number; from: string | null; to: string; reason: string }>) ?? [];
  const newLogEntry = { ts: Date.now(), from: oldOutcome, to: newOutcome, reason };
  const updatedLog = [...existingLog, newLogEntry];

  await db
    .update(memoryRecords)
    .set({
      outcomeLabel: newOutcome,
      changeLog: updatedLog,
    })
    .where(eq(memoryRecords.id, memoryId));

  return {
    memory_updated: true,
    old_outcome: oldOutcome,
    new_outcome: newOutcome,
    reason,
    memory_id: memoryId,
  };
}

/**
 * Detect and apply outcome updates based on current analysis output.
 * Called from routers.ts after loop completes.
 *
 * Triggers:
 * - opposite action (BUY→SELL or SELL→BUY) → invalidated
 * - Step0 revalidation verdict = invalid → invalidated
 * - new verdict contradicts stored verdict + high confidence → failure
 */
export async function detectAndUpdateOutcomes(params: {
  userId: string;
  ticker: string;
  currentAction: string;
  currentVerdict: string;
  step0Invalidated?: boolean;
}): Promise<OutcomeUpdateResult[]> {
  const { userId, ticker, currentAction, step0Invalidated } = params;
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();

  const activeRecords = await db
    .select()
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.userId, userId),
        eq(memoryRecords.ticker, ticker),
        eq(memoryRecords.isActive, true)
      )
    );

  const results: OutcomeUpdateResult[] = [];

  for (const record of activeRecords) {
    // Skip already-labelled terminal states
    if (record.outcomeLabel === "failure" || record.outcomeLabel === "invalidated") continue;
    // Skip expired
    if (record.expiresAt && record.expiresAt < now) continue;

    const storedAction = (record.action ?? "").toUpperCase();
    const newAction = currentAction.toUpperCase();

    // Trigger 1: Step0 invalidation
    if (step0Invalidated) {
      const r = await updateMemoryOutcome(record.id, "invalidated", "step0_revalidation_invalidated");
      results.push(r);
      continue;
    }

    // Trigger 2: Opposite action (BUY→SELL or SELL→BUY)
    const isOpposite =
      (storedAction.includes("BUY") && newAction.includes("SELL")) ||
      (storedAction.includes("SELL") && newAction.includes("BUY"));
    if (isOpposite) {
      const r = await updateMemoryOutcome(record.id, "invalidated", `opposite_action: ${storedAction}→${newAction}`);
      results.push(r);
      continue;
    }
  }

  return results;
}

// ── Phase 2: extractFailurePattern ───────────────────────────────────────────

/**
 * Extract failure patterns from a memory record with outcomeLabel == failure/invalidated.
 * Computes failure_intensity_score, boosts riskStructure weight, marks reasoningPattern as weak.
 */
export async function extractFailurePattern(
  memoryId: string
): Promise<FailurePatternResult | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(memoryRecords)
    .where(eq(memoryRecords.id, memoryId))
    .limit(1);

  if (rows.length === 0) return null;
  const record = rows[0];

  if (record.outcomeLabel !== "failure" && record.outcomeLabel !== "invalidated") {
    return null; // only process failure/invalidated records
  }

  const failureModes = (record.failureModes as string[]) ?? [];
  const riskStructure = (record.riskStructure as string[]) ?? [];

  // Compute failure_intensity_score
  const rawScore = Math.min(
    FAILURE_SCORE_MAX,
    FAILURE_BASE_SCORE + failureModes.length * FAILURE_MODE_BONUS
  );
  const failureIntensityScore = parseFloat(rawScore.toFixed(4));

  // Mark reasoningPattern as weak
  const weakPattern = record.reasoningPattern
    ? `[WEAK] ${record.reasoningPattern}`
    : "[WEAK] unknown_pattern";

  // Boost riskStructure: prepend a weight marker if not already boosted
  const boostedRisk = riskStructure.map(r =>
    r.startsWith("[HIGH]") ? r : `[HIGH] ${r}`
  );

  await db
    .update(memoryRecords)
    .set({
      failureIntensityScore: String(failureIntensityScore),
      reasoningPattern: weakPattern.slice(0, 60),
      riskStructure: boostedRisk,
      affectsRouting: true, // failure always affects routing
      affectsStep0: failureModes.length > 0, // affects Step0 if failure modes exist
    })
    .where(eq(memoryRecords.id, memoryId));

  return {
    memory_id: memoryId,
    failure_intensity_score: failureIntensityScore,
    failure_modes_extracted: failureModes,
    risk_structure_boosted: riskStructure.length > 0,
    reasoning_pattern_marked_weak: true,
  };
}

// ── Phase 3: reinforceSuccessPattern ─────────────────────────────────────────

/**
 * Reinforce success patterns for a memory record with outcomeLabel == success.
 * Computes success_strength_score, reinforces reasoningPattern, boosts early_stop_bias eligibility.
 */
export async function reinforceSuccessPattern(
  memoryId: string
): Promise<ReinforcementResult | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(memoryRecords)
    .where(eq(memoryRecords.id, memoryId))
    .limit(1);

  if (rows.length === 0) return null;
  const record = rows[0];

  if (record.outcomeLabel !== "success") {
    return null; // only process success records
  }

  const evidenceScore = parseFloat(String(record.evidenceScore ?? "0"));
  const rawScore = Math.min(
    SUCCESS_STRENGTH_MAX,
    SUCCESS_BASE_SCORE + evidenceScore * SUCCESS_EVIDENCE_BONUS_FACTOR
  );
  const successStrengthScore = parseFloat(rawScore.toFixed(4));
  const earlyStopBiasEligible = successStrengthScore >= EARLY_STOP_BIAS_THRESHOLD;

  // Reinforce reasoningPattern
  const reinforcedPattern = record.reasoningPattern
    ? record.reasoningPattern.replace(/^\[WEAK\] /, "").replace(/^\[STRONG\] /, "")
    : "unknown_pattern";
  const markedPattern = `[STRONG] ${reinforcedPattern}`.slice(0, 60);

  await db
    .update(memoryRecords)
    .set({
      successStrengthScore: String(successStrengthScore),
      reasoningPattern: markedPattern,
      affectsController: true,
    })
    .where(eq(memoryRecords.id, memoryId));

  return {
    memory_id: memoryId,
    success_strength_score: successStrengthScore,
    reasoning_pattern_reinforced: true,
    early_stop_bias_eligible: earlyStopBiasEligible,
  };
}

// ── Phase 4: applyMemoryDecay ─────────────────────────────────────────────────

/**
 * Apply exponential decay to a memory record's freshnessScore.
 * Degrades influence flags when freshness drops below threshold.
 * Deactivates record when freshness drops below deactivation threshold.
 *
 * Formula: newFreshness = oldFreshness * e^(-DECAY_RATE_PER_DAY * daysSinceCreation)
 */
export async function applyMemoryDecay(
  memoryId: string
): Promise<DecayResult | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(memoryRecords)
    .where(eq(memoryRecords.id, memoryId))
    .limit(1);

  if (rows.length === 0) return null;
  const record = rows[0];

  const now = Date.now();
  const ageMs = now - record.createdAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  const oldFreshness = parseFloat(String(record.freshnessScore ?? "1.0"));
  const rawNewFreshness = oldFreshness * Math.exp(-DECAY_RATE_PER_DAY * ageDays);
  const newFreshness = parseFloat(Math.max(0, rawNewFreshness).toFixed(4));

  const shouldDeactivate = newFreshness < DECAY_DEACTIVATE_THRESHOLD;
  const shouldDowngradeInfluence = newFreshness < DECAY_INFLUENCE_THRESHOLD && !shouldDeactivate;

  const updatePayload: Partial<typeof memoryRecords.$inferInsert> = {
    freshnessScore: String(newFreshness),
  };

  if (shouldDeactivate) {
    updatePayload.isActive = false;
    updatePayload.affectsController = false;
    updatePayload.affectsRouting = false;
    updatePayload.affectsStep0 = false;
  } else if (shouldDowngradeInfluence) {
    // Downgrade: controller and step0 lose influence, routing may remain if failure
    updatePayload.affectsController = false;
    updatePayload.affectsStep0 = false;
    // affectsRouting stays true if it was a failure record (risk still relevant)
  }

  await db
    .update(memoryRecords)
    .set(updatePayload)
    .where(eq(memoryRecords.id, memoryId));

  return {
    memory_id: memoryId,
    old_freshness: oldFreshness,
    new_freshness: newFreshness,
    deactivated: shouldDeactivate,
    influence_downgraded: shouldDowngradeInfluence,
  };
}

/**
 * Batch decay: apply decay to all active records for a user.
 * Called periodically (e.g., once per analysis session).
 */
export async function batchApplyDecay(userId: string): Promise<{
  processed: number;
  deactivated: number;
  downgraded: number;
}> {
  const db = await getDb();
  if (!db) return { processed: 0, deactivated: 0, downgraded: 0 };
  const activeRecords = await db
    .select({ id: memoryRecords.id })
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.userId, userId),
        eq(memoryRecords.isActive, true)
      )
    );

  let deactivated = 0;
  let downgraded = 0;

  for (const { id } of activeRecords) {
    const result = await applyMemoryDecay(id);
    if (result?.deactivated) deactivated++;
    else if (result?.influence_downgraded) downgraded++;
  }

  return { processed: activeRecords.length, deactivated, downgraded };
}

/**
 * Post-outcome evolution: after updating outcomeLabel, run the appropriate pattern function.
 * Called from routers.ts after detectAndUpdateOutcomes().
 */
export async function runPostOutcomeEvolution(
  memoryId: string,
  outcome: OutcomeLabel
): Promise<FailurePatternResult | ReinforcementResult | null> {
  if (outcome === "failure" || outcome === "invalidated") {
    return extractFailurePattern(memoryId);
  } else if (outcome === "success") {
    return reinforceSuccessPattern(memoryId);
  }
  return null;
}
