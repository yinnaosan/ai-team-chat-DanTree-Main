/**
 * DANTREE LEVEL8 — Portfolio Persistence Layer
 *
 * Provides DB write helpers and snapshot/replay system.
 * All outputs are advisory_only: true — no execution logic.
 *
 * Phase 2: saveDecision, saveGuardLog, saveSnapshot, upsertPosition
 * Phase 3: snapshotPortfolio, replayDecision
 */

import { getDb } from "./db";
import {
  portfolio,
  portfolioPosition,
  portfolioSnapshot,
  decisionLog,
  guardLog,
  type InsertPortfolio,
  type InsertPortfolioPosition,
  type InsertPortfolioSnapshot,
  type InsertDecisionLog,
  type InsertGuardLog,
} from "../drizzle/schema";
import type { StructuredAttribution, AttributionMap } from "./attributionWriteBack";
import { eq, desc, and } from "drizzle-orm";
import type { Level7PipelineOutput } from "./portfolioDecisionRanker";
import type { GuardedDecision } from "./portfolioGuardOrchestrator";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PersistenceResult {
  portfolioId: number;
  snapshotId: number;
  decisionIds: number[];
  guardIds: number[];
  advisory_only: true;
  consistency_valid: boolean;
  consistency_issues: string[];
}

export interface ReplayResult {
  ticker: string;
  snapshotId: number;
  snapshotCreatedAt: number;
  decisionAtSnapshot: {
    actionLabel: string;
    decisionBias: string;
    fusionScore: number;
    allocationPct: number;
    advisoryText: string | null;
  } | null;
  guardAtSnapshot: {
    dominantGuard: string;
    suppressed: boolean;
    decayMultiplier: number;
    decayTrace: unknown;
  } | null;
  /** LEVEL9.1: Structured attribution from decision_log (null if pre-LEVEL9.1 decision) */
  structured_attribution: {
    business_quality_score: number | null;
    moat_strength: string | null;
    event_type: string | null;
    event_severity: number | null;
    danger_score: number | null;
    alpha_score: number | null;
    trigger_score: number | null;
    memory_score: number | null;
    dominant_factor: string | null;
    regime_tag: string | null;
    falsification_tags: string[] | null;
  } | null;
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Portfolio & Position Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create a portfolio for a user.
 * Returns the portfolio id.
 */
export async function getOrCreatePortfolio(
  userId: number,
  name = "Default Portfolio"
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");

  const existing = await db
    .select({ id: portfolio.id })
    .from(portfolio)
    .where(eq(portfolio.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const now = Date.now();
  const inserted = await db.insert(portfolio).values({
    userId,
    name,
    createdAt: now,
    updatedAt: now,
  } as InsertPortfolio);

  return (inserted as any).insertId as number;
}

/**
 * Upsert a position for a ticker in a portfolio.
 * Marks old positions for the same ticker as inactive, then inserts new.
 */
export async function upsertPosition(
  portfolioId: number,
  ticker: string,
  data: {
    allocationPct: number;
    actionLabel: string;
    decisionBias: string;
    fusionScore: number;
    sizingBucket: string;
  }
): Promise<number> {
  const now = Date.now();

  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");

  // Deactivate old positions for this ticker
  await db
    .update(portfolioPosition)
    .set({ isActive: false, updatedAt: now })
    .where(
      and(
        eq(portfolioPosition.portfolioId, portfolioId),
        eq(portfolioPosition.ticker, ticker),
        eq(portfolioPosition.isActive, true)
      )
    );

  // Insert new active position
  const inserted = await db.insert(portfolioPosition).values({
    portfolioId,
    ticker,
    allocationPct: data.allocationPct.toFixed(4),
    actionLabel: data.actionLabel,
    decisionBias: data.decisionBias,
    fusionScore: data.fusionScore.toFixed(6),
    sizingBucket: data.sizingBucket,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as InsertPortfolioPosition);

  return (inserted as any).insertId as number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Decision & Guard Persistence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a single decision to decision_log.
 * Uses guarded_decision_bias and guarded_sizing_bucket from GuardedDecision.
 */
export async function saveDecision(
  portfolioId: number,
  snapshotId: number | null,
  decision: GuardedDecision,
  rankedDecision?: { action_label: string; suggested_allocation_pct?: number; fusion_score?: number },
  attribution?: StructuredAttribution | null
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  const now = Date.now();

  // LEVEL9.1: Build attribution fields (all nullable for backward compat)
  const attrFields = attribution ? {
    businessQualityScore: attribution.business_quality_score != null
      ? String(attribution.business_quality_score)
      : null,
    moatStrength: attribution.moat_strength ?? null,
    eventType: attribution.event_type ?? null,
    eventSeverity: attribution.event_severity != null
      ? String(attribution.event_severity)
      : null,
    dangerScore: attribution.danger_score != null
      ? String(attribution.danger_score)
      : null,
    alphaScore: attribution.alpha_score != null
      ? String(attribution.alpha_score)
      : null,
    triggerScore: attribution.trigger_score != null
      ? String(attribution.trigger_score)
      : null,
    memoryScore: attribution.memory_score != null
      ? String(attribution.memory_score)
      : null,
    dominantFactor: attribution.dominant_factor ?? null,
    regimeTag: attribution.regime_tag ?? null,
    falsificationTagsJson: attribution.falsification_tags_json ?? null,
  } : {};

  if (attribution) {
    console.log(`[AttributionWrite] Writing attribution for ${decision.ticker}: BQ=${attribution.business_quality_score}, regime=${attribution.regime_tag}`);
  } else {
    console.warn(`[AttributionWrite] No attribution for ${decision.ticker} — fields will be null`);
  }

  const inserted = await db.insert(decisionLog).values({
    portfolioId,
    snapshotId: snapshotId ?? undefined,
    ticker: decision.ticker,
    fusionScore: (rankedDecision?.fusion_score ?? 0).toFixed(6),
    decisionBias: decision.guarded_decision_bias,
    actionLabel: rankedDecision?.action_label ?? decision.guarded_decision_bias.toUpperCase(),
    sizingBucket: decision.guarded_sizing_bucket ?? null,
    allocationPct: rankedDecision?.suggested_allocation_pct != null
      ? rankedDecision.suggested_allocation_pct.toFixed(4)
      : null,
    advisoryText: null,
    advisoryOnly: true,
    createdAt: now,
    ...attrFields,
  } as InsertDecisionLog);

  return (inserted as any).insertId as number;
}

/**
 * Save a single guard record to guard_log.
 */
export async function saveGuardLog(
  portfolioId: number,
  snapshotId: number | null,
  decision: GuardedDecision,
  safetyReportJson?: unknown
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  const now = Date.now();
  const decayTrace = decision.sizing_decay_trace ?? null;
  const inserted = await db.insert(guardLog).values({
    portfolioId,
    snapshotId: snapshotId ?? undefined,
    ticker: decision.ticker,
    dominantGuard: decision.annotation?.dominant_guard ?? "NONE",
    suppressed: decision.suppressed ?? false,
    decayMultiplier: (decision.sizing_decay_trace?.decay_multiplier ?? 1.0).toFixed(4),
    decayTrace: decayTrace as any,
    safetyReport: safetyReportJson as any ?? null,
    createdAt: now,
  } as InsertGuardLog);

  return (inserted as any).insertId as number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Snapshot System
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a full portfolio snapshot from a Level7 pipeline output.
 * Returns the snapshot id.
 */
export async function snapshotPortfolio(
  portfolioId: number,
  pipelineOutput: Level7PipelineOutput
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  const now = Date.now();
  const guardStatus =
    pipelineOutput.guard_output?.safety_report?.overall_safety_status ?? "healthy";
  const totalTickers = pipelineOutput.portfolio_view?.ranked_decisions?.length ?? 0;

  const inserted = await db.insert(portfolioSnapshot).values({
    portfolioId,
    snapshotData: pipelineOutput as any,
    guardStatus,
    totalTickers,
    createdAt: now,
  } as InsertPortfolioSnapshot);

  return (inserted as any).insertId as number;
}

/**
 * Full pipeline persistence: snapshot → decisions → guards → positions.
 * Returns PersistenceResult with all inserted IDs.
 *
 * LEVEL9.1: Accepts optional attributionMap to write structured attribution
 * fields into each decision_log row. All fields nullable for backward compat.
 */
export async function persistPipelineRun(
  userId: number,
  pipelineOutput: Level7PipelineOutput,
  attributionMap?: AttributionMap
): Promise<PersistenceResult> {
  const portfolioId = await getOrCreatePortfolio(userId);
  const snapshotId = await snapshotPortfolio(portfolioId, pipelineOutput);

  const guardedDecisions: GuardedDecision[] =
    pipelineOutput.guard_output?.guarded_decisions ?? [];
  const safetyReport = pipelineOutput.guard_output?.safety_report ?? null;

  const decisionIds: number[] = [];
  const guardIds: number[] = [];

  // Build a lookup map: ticker → ranked decision (for fusion_score, action_label, etc.)
  const rankedMap = new Map<string, { action_label: string; fusion_score: number; suggested_allocation_pct?: number }>();
  for (const rd of pipelineOutput.guard_output?.guarded_ranked ?? []) {
    rankedMap.set(rd.ticker, {
      action_label: rd.action_label,
      fusion_score: rd.fusion_score ?? 0,
      suggested_allocation_pct: rd.suggested_allocation_pct,
    });
  }

  for (const gd of guardedDecisions) {
    const ranked = rankedMap.get(gd.ticker);
    // LEVEL9.1: Pass attribution for this ticker (null if not available)
    const attribution = attributionMap?.get(gd.ticker) ?? null;
    const dId = await saveDecision(portfolioId, snapshotId, gd, ranked, attribution);
    decisionIds.push(dId);

    const gId = await saveGuardLog(portfolioId, snapshotId, gd, safetyReport);
    guardIds.push(gId);

    // Upsert position
    await upsertPosition(portfolioId, gd.ticker, {
      allocationPct: ranked?.suggested_allocation_pct ?? 0,
      actionLabel: ranked?.action_label ?? gd.guarded_decision_bias.toUpperCase(),
      decisionBias: gd.guarded_decision_bias,
      fusionScore: ranked?.fusion_score ?? 0,
      sizingBucket: gd.guarded_sizing_bucket ?? "none",
    });
  }

  // Phase 4: Enforce snapshot retention (keep last 30)
  try {
    await enforceSnapshotRetention(portfolioId, 30);
  } catch (err) {
    console.error("[portfolioPersistence] enforceSnapshotRetention failed (non-blocking):", err);
  }

  // LEVEL8 Final Patch — ITEM 5: Auto-validate consistency after persist
  // If invalid: log error + mark snapshot INVALID (do NOT silently pass)
  let consistencyValid = true;
  let consistencyIssues: string[] = [];
  try {
    const consistency = await validateSnapshotConsistency(portfolioId, snapshotId);
    if (!consistency.is_consistent) {
      consistencyValid = false;
      if (!consistency.decisions_match_guards) consistencyIssues.push(`decisions(${consistency.decision_count}) != guards(${consistency.guard_count})`);
      if (!consistency.snapshot_tickers_match) consistencyIssues.push(`snapshot_total_tickers(${consistency.snapshot_total_tickers}) != decisions(${consistency.decision_count})`);
      console.error(
        `[portfolioPersistence] CONSISTENCY VIOLATION snapshotId=${snapshotId} ` +
        `issues=${consistencyIssues.join(" | ")}`
      );
      // Mark snapshot as INVALID in DB
      const dbInvalid = await getDb();
      if (dbInvalid) {
        await dbInvalid
          .update(portfolioSnapshot)
          .set({ guardStatus: "INVALID" })
          .where(eq(portfolioSnapshot.id, snapshotId));
        console.error(`[portfolioPersistence] Snapshot ${snapshotId} marked INVALID in DB`);
      }
    }
  } catch (consistencyErr) {
    console.error("[portfolioPersistence] Consistency auto-check failed:", consistencyErr);
  }

  return {
    portfolioId,
    snapshotId,
    decisionIds,
    guardIds,
    advisory_only: true,
    consistency_valid: consistencyValid,
    consistency_issues: consistencyIssues,
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Replay Systemm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replay the decision path for a specific ticker at a given snapshot.
 * If snapshotId is not provided, uses the most recent snapshot.
 */
export async function replayDecision(
  portfolioId: number,
  ticker: string,
  snapshotId?: number
): Promise<ReplayResult> {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  // Resolve snapshot
  let resolvedSnapshotId: number;
  let resolvedSnapshotCreatedAt: number;
  if (snapshotId != null) {
    const snap = await db
      .select({ id: portfolioSnapshot.id, createdAt: portfolioSnapshot.createdAt })
      .from(portfolioSnapshot)
      .where(
        and(
          eq(portfolioSnapshot.id, snapshotId),
          eq(portfolioSnapshot.portfolioId, portfolioId)
        )
      )
      .limit(1);
    if (snap.length === 0) throw new Error(`Snapshot ${snapshotId} not found`);
    resolvedSnapshotId = snap[0].id;
    resolvedSnapshotCreatedAt = snap[0].createdAt;
  } else {
    const latest = await db
      .select({ id: portfolioSnapshot.id, createdAt: portfolioSnapshot.createdAt })
      .from(portfolioSnapshot)
      .where(eq(portfolioSnapshot.portfolioId, portfolioId))
      .orderBy(desc(portfolioSnapshot.createdAt))
      .limit(1);
    if (latest.length === 0) throw new Error(`No snapshots found for portfolio ${portfolioId}`);
    resolvedSnapshotId = latest[0].id;
    resolvedSnapshotCreatedAt = latest[0].createdAt;
  }

  // Fetch decision at snapshot
  const decisions = await db
    .select()
    .from(decisionLog)
    .where(
      and(
        eq(decisionLog.portfolioId, portfolioId),
        eq(decisionLog.snapshotId, resolvedSnapshotId),
        eq(decisionLog.ticker, ticker)
      )
    )
    .limit(1);

  // Fetch guard at snapshot
  const guards = await db
    .select()
    .from(guardLog)
    .where(
      and(
        eq(guardLog.portfolioId, portfolioId),
        eq(guardLog.snapshotId, resolvedSnapshotId),
        eq(guardLog.ticker, ticker)
      )
    )
    .limit(1);

  // LEVEL9.1: Extract structured attribution from decision_log row
  const buildStructuredAttribution = (row: typeof decisions[0]) => {
    const hasBQ = row.businessQualityScore != null;
    const hasAny = hasBQ || row.moatStrength != null || row.regimeTag != null;
    if (!hasAny) return null;
    return {
      business_quality_score: row.businessQualityScore != null ? parseFloat(row.businessQualityScore) : null,
      moat_strength: row.moatStrength ?? null,
      event_type: row.eventType ?? null,
      event_severity: row.eventSeverity != null ? parseFloat(row.eventSeverity) : null,
      danger_score: row.dangerScore != null ? parseFloat(row.dangerScore) : null,
      alpha_score: row.alphaScore != null ? parseFloat(row.alphaScore) : null,
      trigger_score: row.triggerScore != null ? parseFloat(row.triggerScore) : null,
      memory_score: row.memoryScore != null ? parseFloat(row.memoryScore) : null,
      dominant_factor: row.dominantFactor ?? null,
      regime_tag: row.regimeTag ?? null,
      falsification_tags: Array.isArray(row.falsificationTagsJson)
        ? (row.falsificationTagsJson as string[])
        : null,
    };
  };

  return {
    ticker,
    snapshotId: resolvedSnapshotId,
    snapshotCreatedAt: resolvedSnapshotCreatedAt,
    decisionAtSnapshot: decisions.length > 0
      ? {
          actionLabel: decisions[0].actionLabel,
          decisionBias: decisions[0].decisionBias,
          fusionScore: parseFloat(decisions[0].fusionScore),
          allocationPct: decisions[0].allocationPct != null
            ? parseFloat(decisions[0].allocationPct)
            : 0,
          advisoryText: decisions[0].advisoryText ?? null,
        }
      : null,
    structured_attribution: decisions.length > 0 ? buildStructuredAttribution(decisions[0]) : null,
    guardAtSnapshot: guards.length > 0
      ? {
          dominantGuard: guards[0].dominantGuard,
          suppressed: guards[0].suppressed,
          decayMultiplier: parseFloat(guards[0].decayMultiplier),
          decayTrace: guards[0].decayTrace,
        }
      : null,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Helpers (for API layer)
// ─────────────────────────────────────────────────────────────────────────────

export async function getPortfolioByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  return db
    .select()
    .from(portfolio)
    .where(eq(portfolio.userId, userId))
    .limit(1);
}
export async function getActivePositions(portfolioId: number) {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  return db
    .select()
    .from(portfolioPosition)
    .where(
      and(
        eq(portfolioPosition.portfolioId, portfolioId),
        eq(portfolioPosition.isActive, true)
      )
    )
    .orderBy(desc(portfolioPosition.updatedAt));
}
export async function getRecentDecisions(portfolioId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  return db
    .select()
    .from(decisionLog)
    .where(eq(decisionLog.portfolioId, portfolioId))
    .orderBy(desc(decisionLog.createdAt))
    .limit(limit);
}
export async function getRecentGuardLogs(portfolioId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  return db
    .select()
    .from(guardLog)
    .where(eq(guardLog.portfolioId, portfolioId))
    .orderBy(desc(guardLog.createdAt))
    .limit(limit);
}
export async function getLatestSnapshot(portfolioId: number) {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  const rows = await db
    .select()
    .from(portfolioSnapshot)
    .where(eq(portfolioSnapshot.portfolioId, portfolioId))
    .orderBy(desc(portfolioSnapshot.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Snapshot Retention (keep last 30 per portfolio)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enforce snapshot retention: keep only the last 30 snapshots per portfolio.
 * Older snapshots are deleted automatically after each new snapshot is saved.
 * Replay is still functional as long as snapshotId is within the retained window.
 */
export async function enforceSnapshotRetention(
  portfolioId: number,
  maxSnapshots = 30
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");

  // Get all snapshot IDs ordered newest-first
  const allSnapshots = await db
    .select({ id: portfolioSnapshot.id })
    .from(portfolioSnapshot)
    .where(eq(portfolioSnapshot.portfolioId, portfolioId))
    .orderBy(desc(portfolioSnapshot.createdAt));

  if (allSnapshots.length <= maxSnapshots) return 0; // nothing to delete

  // IDs to delete (everything beyond the latest maxSnapshots)
  const toDelete = allSnapshots.slice(maxSnapshots).map(s => s.id);
  let deleted = 0;

  for (const snapshotId of toDelete) {
    // Delete associated decision_log and guard_log rows first (FK safety)
    await db.delete(decisionLog).where(
      and(eq(decisionLog.portfolioId, portfolioId), eq(decisionLog.snapshotId, snapshotId))
    );
    await db.delete(guardLog).where(
      and(eq(guardLog.portfolioId, portfolioId), eq(guardLog.snapshotId, snapshotId))
    );
    await db.delete(portfolioSnapshot).where(
      and(eq(portfolioSnapshot.id, snapshotId), eq(portfolioSnapshot.portfolioId, portfolioId))
    );
    deleted++;
  }

  return deleted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Data Consistency Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsistencyReport {
  portfolioId: number;
  snapshotId: number;
  decision_count: number;
  guard_count: number;
  decisions_match_guards: boolean;
  snapshot_total_tickers: number;
  snapshot_tickers_match: boolean;
  is_consistent: boolean;
}

/**
 * Validate that decision_log, guard_log, and snapshot are consistent for a given snapshot.
 */
export async function validateSnapshotConsistency(
  portfolioId: number,
  snapshotId: number
): Promise<ConsistencyReport> {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");

  const decisions = await db
    .select({ id: decisionLog.id })
    .from(decisionLog)
    .where(and(eq(decisionLog.portfolioId, portfolioId), eq(decisionLog.snapshotId, snapshotId)));

  const guards = await db
    .select({ id: guardLog.id })
    .from(guardLog)
    .where(and(eq(guardLog.portfolioId, portfolioId), eq(guardLog.snapshotId, snapshotId)));

  const snap = await db
    .select({ totalTickers: portfolioSnapshot.totalTickers })
    .from(portfolioSnapshot)
    .where(and(eq(portfolioSnapshot.id, snapshotId), eq(portfolioSnapshot.portfolioId, portfolioId)))
    .limit(1);

  const decision_count = decisions.length;
  const guard_count = guards.length;
  const snapshot_total_tickers = snap[0]?.totalTickers ?? 0;

  const decisions_match_guards = decision_count === guard_count;
  const snapshot_tickers_match = decision_count === snapshot_total_tickers;
  const is_consistent = decisions_match_guards && snapshot_tickers_match;

  return {
    portfolioId,
    snapshotId,
    decision_count,
    guard_count,
    decisions_match_guards,
    snapshot_total_tickers,
    snapshot_tickers_match,
    is_consistent,
  };
}
