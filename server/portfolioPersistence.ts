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
  rankedDecision?: { action_label: string; suggested_allocation_pct?: number; fusion_score?: number }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("[portfolioPersistence] DB not available");
  const now = Date.now();
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
 */
export async function persistPipelineRun(
  userId: number,
  pipelineOutput: Level7PipelineOutput
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
    const dId = await saveDecision(portfolioId, snapshotId, gd, ranked);
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

  return {
    portfolioId,
    snapshotId,
    decisionIds,
    guardIds,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Replay System
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
