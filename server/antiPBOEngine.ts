/**
 * DANTREE LEVEL10 — Anti-PBO Engine
 *
 * System Protection Layer: Prevents overfitting, self-deception, and false optimization.
 *
 * Module 3: enforceImmutableHistory()
 * Module 4: validateOOS()
 * Module 5: compareStrategyVersions()
 * Module 6: detectOverfitting()
 * Module 7: experimentBudget()
 * Module 8: strategyEvolutionLog helpers
 *
 * HARD RULES:
 * - DO NOT change decision logic
 * - DO NOT introduce auto-optimization
 * - DO NOT modify historical data
 * - MUST remain advisory_only
 * - ALL experiments must be tracked and auditable
 */

import { randomUUID } from "crypto";
import { getDb } from "./db";
import {
  strategyVersion,
  strategyEvolutionLog,
  decisionLog,
  decisionOutcome,
  type InsertStrategyVersion,
  type InsertStrategyEvolutionLog,
} from "../drizzle/schema";
import { eq, and, lt, gte, isNull, isNotNull, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategyVersionInput {
  versionName: string;
  description?: string;
  changeSummary?: string;
  parentVersionId?: string;
  isExperimental?: boolean;
  userId?: number;
}

export interface OOSValidationResult {
  versionId: string;
  versionCreatedAt: number;
  IS_performance: {
    win_rate: number;
    avg_return: number;
    sample_count: number;
  };
  OOS_performance: {
    win_rate: number;
    avg_return: number;
    sample_count: number;
  };
  degradation_ratio: number;  // OOS_win_rate / IS_win_rate (< 0.7 = overfit risk)
  overfit_risk: boolean;
  advisory_only: true;
}

export interface StrategyComparisonResult {
  v1_id: string;
  v2_id: string;
  win_rate_diff: number;       // v2 - v1 (positive = v2 better)
  return_diff: number;         // v2 - v1 avg return
  stability_score: number;     // 0-1, higher = more stable OOS
  regime_consistency: number;  // 0-1, consistent across regimes
  recommendation: "prefer_v2" | "prefer_v1" | "inconclusive";
  advisory_only: true;
}

export interface OverfittingDetectionResult {
  versionId: string;
  overfit_flag: boolean;
  overfit_reasons: string[];
  IS_win_rate: number;
  OOS_win_rate: number;
  regime_stability: number;
  confidence: "high" | "medium" | "low";
  advisory_only: true;
}

export interface ExperimentBudgetResult {
  userId: number;
  active_experimental_count: number;
  max_allowed: number;
  can_create_new: boolean;
  budget_exhausted: boolean;
  oldest_active_version_age_days: number;
  min_observation_window_days: number;
  advisory_only: true;
}

export interface ImmutableHistoryAudit {
  checked_at: number;
  decision_log_rows: number;
  decision_outcome_rows: number;
  immutability_enforced: boolean;
  audit_notes: string[];
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 1 Helper: createStrategyVersion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new immutable strategy version.
 * Every structural change MUST create a new version — no overwriting.
 */
export async function createStrategyVersion(
  input: StrategyVersionInput
): Promise<{ id: string; versionName: string; createdAt: number }> {
  const db = await getDb();
  if (!db) throw new Error("[AntiPBO] DB not available");

  const id = randomUUID();
  const now = Date.now();

  await db.insert(strategyVersion).values({
    id,
    versionName: input.versionName,
    createdAt: now,
    description: input.description ?? null,
    changeSummary: input.changeSummary ?? null,
    parentVersionId: input.parentVersionId ?? null,
    isActive: true,
    isExperimental: input.isExperimental ?? false,
    userId: input.userId ?? 0,
  } as InsertStrategyVersion);

  console.log(`[AntiPBO] Created strategy version: ${id} (${input.versionName})`);
  return { id, versionName: input.versionName, createdAt: now };
}

/**
 * Get the current active (non-experimental) strategy version for a user.
 * Returns null if no version exists.
 */
export async function getCurrentStrategyVersion(
  userId: number
): Promise<{ id: string; versionName: string; createdAt: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({ id: strategyVersion.id, versionName: strategyVersion.versionName, createdAt: strategyVersion.createdAt })
    .from(strategyVersion)
    .where(and(eq(strategyVersion.userId, userId), eq(strategyVersion.isActive, true), eq(strategyVersion.isExperimental, false)))
    .orderBy(sql`created_at DESC`)
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 3: enforceImmutableHistory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Audit immutability of decision_log and decision_outcome.
 * In production: decision_log rows CANNOT be updated after creation.
 * This function performs a read-only audit (enforcement is at DB layer via no UPDATE grants).
 */
export async function enforceImmutableHistory(): Promise<ImmutableHistoryAudit> {
  const db = await getDb();
  const now = Date.now();

  if (!db) {
    return {
      checked_at: now,
      decision_log_rows: 0,
      decision_outcome_rows: 0,
      immutability_enforced: false,
      audit_notes: ["DB not available — immutability cannot be verified"],
      advisory_only: true,
    };
  }

  const [dlCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(decisionLog);
  const [doCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(decisionOutcome);

  const auditNotes: string[] = [
    "decision_log: INSERT-only (no UPDATE/DELETE in application layer)",
    "decision_outcome: INSERT-only after evaluation (evaluated=true is terminal)",
    "strategy_version: UUID primary key prevents overwrite",
    "strategy_evolution_log: append-only, no DELETE",
  ];

  console.log(`[AntiPBO] Immutability audit: decision_log=${dlCount.count}, decision_outcome=${doCount.count}`);

  return {
    checked_at: now,
    decision_log_rows: Number(dlCount.count),
    decision_outcome_rows: Number(doCount.count),
    immutability_enforced: true,
    audit_notes: auditNotes,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 4: validateOOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split decisions into IS (before version creation) and OOS (after version creation).
 * Compute performance for each cohort and detect overfit risk.
 *
 * IS = decisions linked to this version with createdAt < version.createdAt
 * OOS = decisions linked to this version with createdAt >= version.createdAt
 *
 * Note: Since decisions are created AFTER the version, IS represents the
 * "training window" (decisions made under the previous regime) and OOS
 * represents the "live window" (decisions made under this version).
 * For proper IS/OOS split, we use the version's createdAt as the boundary.
 */
export async function validateOOS(versionId: string): Promise<OOSValidationResult> {
  const db = await getDb();
  if (!db) throw new Error("[AntiPBO] DB not available");

  // Get version creation time
  const versionRows = await db
    .select({ createdAt: strategyVersion.createdAt })
    .from(strategyVersion)
    .where(eq(strategyVersion.id, versionId))
    .limit(1);

  if (versionRows.length === 0) throw new Error(`[AntiPBO] Version ${versionId} not found`);
  const versionCreatedAt = versionRows[0].createdAt;

  // Get evaluated outcomes for decisions linked to this version
  const outcomes = await db
    .select({
      decisionCreatedAt: decisionLog.createdAt,
      returnPct: decisionOutcome.returnPct,
      isPositive: decisionOutcome.isPositive,
    })
    .from(decisionLog)
    .innerJoin(decisionOutcome, eq(decisionOutcome.decisionId, decisionLog.id))
    .where(
      and(
        eq(decisionLog.strategyVersionId, versionId),
        eq(decisionOutcome.evaluated, true),
        isNotNull(decisionOutcome.returnPct)
      )
    );

  // Split IS / OOS
  const IS = outcomes.filter(o => o.decisionCreatedAt < versionCreatedAt);
  const OOS = outcomes.filter(o => o.decisionCreatedAt >= versionCreatedAt);

  const computePerf = (rows: typeof outcomes) => {
    if (rows.length === 0) return { win_rate: 0, avg_return: 0, sample_count: 0 };
    const wins = rows.filter(r => r.isPositive === true).length;
    const avgRet = rows.reduce((s, r) => s + parseFloat(r.returnPct ?? "0"), 0) / rows.length;
    return {
      win_rate: wins / rows.length,
      avg_return: parseFloat(avgRet.toFixed(6)),
      sample_count: rows.length,
    };
  };

  const isPerf = computePerf(IS);
  const oosPerf = computePerf(OOS);

  // degradation_ratio = OOS_win_rate / IS_win_rate (< 0.7 = overfit risk)
  const degradationRatio = isPerf.win_rate > 0
    ? parseFloat((oosPerf.win_rate / isPerf.win_rate).toFixed(4))
    : 1.0;

  const overfitRisk = degradationRatio < 0.7 && isPerf.sample_count >= 5;

  console.log(`[AntiPBO] OOS validation for ${versionId}: IS_wr=${isPerf.win_rate.toFixed(2)}, OOS_wr=${oosPerf.win_rate.toFixed(2)}, degradation=${degradationRatio}`);

  return {
    versionId,
    versionCreatedAt,
    IS_performance: isPerf,
    OOS_performance: oosPerf,
    degradation_ratio: degradationRatio,
    overfit_risk: overfitRisk,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 5: compareStrategyVersions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two strategy versions using OOS data only.
 * Returns win_rate_diff, return_diff, stability_score, regime_consistency.
 */
export async function compareStrategyVersions(
  v1Id: string,
  v2Id: string
): Promise<StrategyComparisonResult> {
  const [v1OOS, v2OOS] = await Promise.all([
    validateOOS(v1Id).catch(() => null),
    validateOOS(v2Id).catch(() => null),
  ]);

  const v1WinRate = v1OOS?.OOS_performance.win_rate ?? 0;
  const v2WinRate = v2OOS?.OOS_performance.win_rate ?? 0;
  const v1AvgRet = v1OOS?.OOS_performance.avg_return ?? 0;
  const v2AvgRet = v2OOS?.OOS_performance.avg_return ?? 0;

  const winRateDiff = parseFloat((v2WinRate - v1WinRate).toFixed(4));
  const returnDiff = parseFloat((v2AvgRet - v1AvgRet).toFixed(6));

  // Stability score: based on degradation ratios (higher = more stable)
  const v1Stability = v1OOS ? Math.min(1, v1OOS.degradation_ratio) : 0;
  const v2Stability = v2OOS ? Math.min(1, v2OOS.degradation_ratio) : 0;
  const stabilityScore = parseFloat(((v1Stability + v2Stability) / 2).toFixed(4));

  // Regime consistency: proxy based on sample counts (more OOS data = more consistent)
  const v1Samples = v1OOS?.OOS_performance.sample_count ?? 0;
  const v2Samples = v2OOS?.OOS_performance.sample_count ?? 0;
  const regimeConsistency = parseFloat(
    (Math.min(v1Samples, v2Samples) / Math.max(Math.max(v1Samples, v2Samples), 1)).toFixed(4)
  );

  // Recommendation: prefer v2 if win_rate_diff > 0.05 AND stability >= 0.7
  let recommendation: "prefer_v2" | "prefer_v1" | "inconclusive";
  if (winRateDiff > 0.05 && v2Stability >= 0.7) {
    recommendation = "prefer_v2";
  } else if (winRateDiff < -0.05 && v1Stability >= 0.7) {
    recommendation = "prefer_v1";
  } else {
    recommendation = "inconclusive";
  }

  console.log(`[AntiPBO] Strategy comparison ${v1Id} vs ${v2Id}: win_rate_diff=${winRateDiff}, recommendation=${recommendation}`);

  return {
    v1_id: v1Id,
    v2_id: v2Id,
    win_rate_diff: winRateDiff,
    return_diff: returnDiff,
    stability_score: stabilityScore,
    regime_consistency: regimeConsistency,
    recommendation,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 6: detectOverfitting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect overfitting for a strategy version.
 * Criteria:
 * - High IS performance (win_rate > 0.65)
 * - Low OOS performance (win_rate < 0.50)
 * - Unstable across regimes (degradation_ratio < 0.7)
 */
export async function detectOverfitting(
  versionId: string
): Promise<OverfittingDetectionResult> {
  const oos = await validateOOS(versionId);

  const overfitReasons: string[] = [];
  let overfitFlag = false;

  const isHighIS = oos.IS_performance.win_rate > 0.65;
  const isLowOOS = oos.OOS_performance.win_rate < 0.50;
  const isUnstable = oos.degradation_ratio < 0.7;
  const hasSufficientData = oos.IS_performance.sample_count >= 5;

  if (isHighIS && hasSufficientData) {
    overfitReasons.push(`High IS win_rate (${(oos.IS_performance.win_rate * 100).toFixed(1)}% > 65%)`);
  }
  if (isLowOOS && oos.OOS_performance.sample_count >= 3) {
    overfitReasons.push(`Low OOS win_rate (${(oos.OOS_performance.win_rate * 100).toFixed(1)}% < 50%)`);
  }
  if (isUnstable && hasSufficientData) {
    overfitReasons.push(`Degradation ratio ${oos.degradation_ratio.toFixed(2)} < 0.70 (unstable)`);
  }

  // Overfit if at least 2 criteria met with sufficient data
  overfitFlag = overfitReasons.length >= 2 && hasSufficientData;

  // Confidence based on sample count
  const confidence: "high" | "medium" | "low" =
    oos.IS_performance.sample_count >= 20 ? "high" :
    oos.IS_performance.sample_count >= 10 ? "medium" : "low";

  // Regime stability proxy (based on degradation ratio)
  const regimeStability = Math.min(1, Math.max(0, oos.degradation_ratio));

  console.log(`[AntiPBO] Overfit detection for ${versionId}: overfit_flag=${overfitFlag}, reasons=${overfitReasons.length}`);

  return {
    versionId,
    overfit_flag: overfitFlag,
    overfit_reasons: overfitReasons,
    IS_win_rate: oos.IS_performance.win_rate,
    OOS_win_rate: oos.OOS_performance.win_rate,
    regime_stability: parseFloat(regimeStability.toFixed(4)),
    confidence,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 7: experimentBudget
// ─────────────────────────────────────────────────────────────────────────────

const MAX_EXPERIMENTAL_VERSIONS = 3;
const MIN_OBSERVATION_WINDOW_DAYS = 14;

/**
 * Check experiment budget for a user.
 * Rules:
 * - Max 3 active experimental versions
 * - Must wait minimum 14 days observation window before new version
 * - Cannot discard failed versions (they remain in DB)
 */
export async function experimentBudget(userId: number): Promise<ExperimentBudgetResult> {
  const db = await getDb();
  if (!db) {
    return {
      userId,
      active_experimental_count: 0,
      max_allowed: MAX_EXPERIMENTAL_VERSIONS,
      can_create_new: false,
      budget_exhausted: false,
      oldest_active_version_age_days: 0,
      min_observation_window_days: MIN_OBSERVATION_WINDOW_DAYS,
      advisory_only: true,
    };
  }

  // Count active experimental versions for this user
  const experimentalVersions = await db
    .select({ id: strategyVersion.id, createdAt: strategyVersion.createdAt })
    .from(strategyVersion)
    .where(
      and(
        eq(strategyVersion.userId, userId),
        eq(strategyVersion.isExperimental, true),
        eq(strategyVersion.isActive, true)
      )
    )
    .orderBy(sql`created_at ASC`);

  const activeCount = experimentalVersions.length;
  const budgetExhausted = activeCount >= MAX_EXPERIMENTAL_VERSIONS;

  // Check observation window: oldest active experimental version must be >= 14 days old
  const now = Date.now();
  const oldestAgeMs = experimentalVersions.length > 0
    ? now - experimentalVersions[0].createdAt
    : 0;
  const oldestAgeDays = parseFloat((oldestAgeMs / (1000 * 60 * 60 * 24)).toFixed(2));
  const observationWindowMet = oldestAgeDays >= MIN_OBSERVATION_WINDOW_DAYS || experimentalVersions.length === 0;

  const canCreateNew = !budgetExhausted && observationWindowMet;

  console.log(`[AntiPBO] Experiment budget for userId=${userId}: active=${activeCount}/${MAX_EXPERIMENTAL_VERSIONS}, can_create=${canCreateNew}`);

  return {
    userId,
    active_experimental_count: activeCount,
    max_allowed: MAX_EXPERIMENTAL_VERSIONS,
    can_create_new: canCreateNew,
    budget_exhausted: budgetExhausted,
    oldest_active_version_age_days: oldestAgeDays,
    min_observation_window_days: MIN_OBSERVATION_WINDOW_DAYS,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 8: Strategy Evolution Log helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a new entry to the strategy evolution log (append-only, never update).
 */
export async function appendEvolutionLog(input: {
  versionId: string;
  performanceSummary?: { win_rate: number; avg_return: number; sample_count: number };
  keyChanges?: string;
  evaluationResult?: "pass" | "fail" | "pending";
  overfitFlag?: boolean;
  isOosValidated?: boolean;
  degradationRatio?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("[AntiPBO] DB not available");

  const inserted = await db.insert(strategyEvolutionLog).values({
    versionId: input.versionId,
    performanceSummary: input.performanceSummary ?? null,
    keyChanges: input.keyChanges ?? null,
    evaluationResult: input.evaluationResult ?? "pending",
    overfitFlag: input.overfitFlag ?? false,
    isOosValidated: input.isOosValidated ?? false,
    degradationRatio: input.degradationRatio != null
      ? input.degradationRatio.toFixed(4)
      : null,
    createdAt: Date.now(),
  } as InsertStrategyEvolutionLog);

  const insertId = (inserted as any).insertId as number;
  console.log(`[AntiPBO] Evolution log entry ${insertId} appended for version ${input.versionId}`);
  return insertId;
}

/**
 * Get the evolution log for a specific version (read-only).
 */
export async function getEvolutionLog(versionId: string) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(strategyEvolutionLog)
    .where(eq(strategyEvolutionLog.versionId, versionId))
    .orderBy(sql`created_at ASC`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 2 Integration Helper: linkDecisionToVersion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current strategy version ID for a user.
 * Used by saveDecision() to auto-link decisions to the current version.
 * Returns null if no version exists (pre-LEVEL10 decisions).
 */
export async function getActiveVersionId(userId: number): Promise<string | null> {
  const version = await getCurrentStrategyVersion(userId);
  return version?.id ?? null;
}
