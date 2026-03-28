/**
 * DANTREE LEVEL6.1 — Signal Persistence Layer
 *
 * Upgrades the in-memory LEVEL6 Strategy Layer to a persistent, auto-updating
 * Operational Alpha system.
 *
 * Phase 2: Signal Persistence Repository — CRUD for signal_journal + signal_outcome
 * Phase 3: Auto-Ingestion Hook — triggered after every scheduler run
 * Phase 4: Scoring Auto-Update — incremental EntityScore updates from new outcomes
 * Phase 5: Failsafe — ingestion failures never interrupt the scheduler
 *
 * NON-NEGOTIABLE RULES:
 * - auto_trade_allowed: ALWAYS false
 * - ingestion failures are logged, never thrown
 * - dedup: same (watchId, triggerType, schedulerRunId) → skip
 * - outcome resolution is advisory only
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import { signalJournal, signalOutcome } from "../drizzle/schema";
import type { SignalJournalRow, InsertSignalJournal, InsertSignalOutcome, SignalOutcomeRow } from "../drizzle/schema";
import {
  createSignalJournalEntry,
  scoreOutcomeForSignal,
  listSignalJournal as listMemoryJournal,
  listOutcomeRecords as listMemoryOutcomes,
} from "./signalJournal";
import type { SignalJournalEntry, SignalOutcomeRecord } from "./signalJournal";
import { ingestOutcomesForScoring } from "./signalScoring";
import type { RealRunResult } from "./level5RealScheduler";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestionInput {
  watchId: string;
  ticker: string;
  triggerType: string;
  actionType: string;
  snapshotQuality?: string;
  memoryInfluence?: boolean;
  learningInfluence?: boolean;
  schedulerRunId?: string;
  signalScoreJson?: Record<string, unknown>;
}

export interface IngestionResult {
  success: boolean;
  signal_id?: string;
  skipped?: boolean;
  skip_reason?: string;
  error?: string;
}

export interface OutcomeResolutionInput {
  signalId: string;
  horizon?: string;
  priceChangePct?: number;
  priceDirection?: string;
  outcomeScore?: number;
  riskAdjustedScore?: number;
  thesisStatus?: string;
  outcomeLabel?: string;
}

export interface OutcomeResolutionResult {
  success: boolean;
  outcome_id?: string;
  error?: string;
}

export interface PostRunIngestionSummary {
  run_id: string;
  signals_attempted: number;
  signals_persisted: number;
  signals_skipped: number;
  signals_failed: number;
  scoring_updated: boolean;
  errors: string[];
}

// ─── Dedup Cache (in-memory, per process) ────────────────────────────────────

const _dedupCache = new Set<string>();

function _dedupKey(watchId: string, triggerType: string, schedulerRunId?: string): string {
  return `${watchId}::${triggerType}::${schedulerRunId ?? "no_run"}`;
}

export function resetDedupCache(): void {
  _dedupCache.clear();
}

// ─── Phase 2: Signal Persistence Repository ──────────────────────────────────

/**
 * Persist a single signal to the signal_journal table.
 * Returns the generated signal_id on success.
 * Dedup: same (watchId, triggerType, schedulerRunId) within the same process run → skip.
 */
export async function persistSignal(input: IngestionInput): Promise<IngestionResult> {
  const dedupKey = _dedupKey(input.watchId, input.triggerType, input.schedulerRunId);
  if (_dedupCache.has(dedupKey)) {
    return { success: true, skipped: true, skip_reason: "dedup_cache_hit" };
  }

  try {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const signalId = `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const row: InsertSignalJournal = {
      signalId,
      watchId: input.watchId,
      ticker: input.ticker,
      triggerType: input.triggerType,
      actionType: input.actionType,
      snapshotQuality: input.snapshotQuality ?? "unknown",
      memoryInfluence: input.memoryInfluence ?? false,
      learningInfluence: input.learningInfluence ?? false,
      schedulerRunId: input.schedulerRunId ?? null,
      signalScoreJson: input.signalScoreJson ?? null,
      createdAt: now,
    };

    await db.insert(signalJournal).values(row);
    _dedupCache.add(dedupKey);

    return { success: true, signal_id: signalId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Persist an outcome resolution for a previously emitted signal.
 */
export async function persistOutcome(input: OutcomeResolutionInput): Promise<OutcomeResolutionResult> {
  try {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const outcomeId = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const row: InsertSignalOutcome = {
      outcomeId,
      signalId: input.signalId,
      horizon: input.horizon ?? "short",
      priceChangePct: input.priceChangePct != null ? String(input.priceChangePct) : null,
      priceDirection: input.priceDirection ?? null,
      outcomeScore: input.outcomeScore != null ? String(input.outcomeScore) : null,
      riskAdjustedScore: input.riskAdjustedScore != null ? String(input.riskAdjustedScore) : null,
      thesisStatus: input.thesisStatus ?? "inconclusive",
      outcomeLabel: input.outcomeLabel ?? "inconclusive",
      resolvedAt: now,
      createdAt: now,
    };

    await db.insert(signalOutcome).values(row);
    return { success: true, outcome_id: outcomeId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * List recent signals from DB (descending by created_at).
 */
export async function listPersistedSignals(opts?: {
  watchId?: string;
  ticker?: string;
  limit?: number;
}): Promise<SignalJournalRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const limit = opts?.limit ?? 100;
    const rows = await db
      .select()
      .from(signalJournal)
      .orderBy(desc(signalJournal.createdAt))
      .limit(limit);
    return rows.filter(r => {
      if (opts?.watchId && r.watchId !== opts.watchId) return false;
      if (opts?.ticker && r.ticker !== opts.ticker) return false;
      return true;
    });
  } catch {
    return [];
  }
}

/**
 * List recent outcomes from DB.
 */
export async function listPersistedOutcomes(opts?: {
  signalId?: string;
  limit?: number;
}): Promise<SignalOutcomeRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const limit = opts?.limit ?? 100;
    const rows = await db
      .select()
      .from(signalOutcome)
      .orderBy(desc(signalOutcome.createdAt))
      .limit(limit);
    return rows.filter(r => {
      if (opts?.signalId && r.signalId !== opts.signalId) return false;
      return true;
    });
  } catch {
    return [];
  }
}

// ─── Phase 3: Auto-Ingestion Hook ────────────────────────────────────────────

/**
 * Called after every scheduler run.
 * Extracts signals from the run result and persists them to signal_journal.
 * Failures are caught and logged — never thrown.
 */
export async function postRunIngestionHook(
  runResult: RealRunResult,
  opts?: { dry_run?: boolean }
): Promise<PostRunIngestionSummary> {
  const summary: PostRunIngestionSummary = {
    run_id: runResult.run_id,
    signals_attempted: 0,
    signals_persisted: 0,
    signals_skipped: 0,
    signals_failed: 0,
    scoring_updated: false,
    errors: [],
  };

  if (opts?.dry_run) {
    return summary; // dry_run: no DB writes
  }

  try {
    // Extract signal-worthy events from snapshot_details
    // snapshot_details has ticker/data_source/quality_score/is_usable/missing_fields
    // feedback_loop is a summary object (memories_updated, evolution_triggered, skipped)
    // We treat each usable snapshot as a potential signal candidate
    const snapshotDetails = runResult.snapshot_details ?? [];
    const usableSnapshots = snapshotDetails.filter(d => d.is_usable);

    summary.signals_attempted = usableSnapshots.length;

    for (const snap of usableSnapshots) {
      try {
        const result = await persistSignal({
          watchId: `watch_${snap.ticker}`,
          ticker: snap.ticker ?? "unknown",
          triggerType: "snapshot_available",
          actionType: "review",
          snapshotQuality: snap.quality_score >= 0.7 ? "high" : snap.quality_score >= 0.4 ? "medium" : "low",
          memoryInfluence: false,
          learningInfluence: false,
          schedulerRunId: runResult.run_id,
          signalScoreJson: undefined,
        });

        if (result.skipped) {
          summary.signals_skipped++;
        } else if (result.success) {
          summary.signals_persisted++;
        } else {
          summary.signals_failed++;
          if (result.error) summary.errors.push(result.error);
        }
      } catch (innerErr) {
        summary.signals_failed++;
        summary.errors.push(innerErr instanceof Error ? innerErr.message : String(innerErr));
      }
    }

    // Phase 4: Scoring Auto-Update — sync in-memory LEVEL6 scores from persisted outcomes
    await _syncScoringFromPersistedOutcomes(summary);

  } catch (outerErr) {
    // Phase 5: Failsafe — never throw, only log
    summary.errors.push(outerErr instanceof Error ? outerErr.message : String(outerErr));
  }

  return summary;
}

// ─── Phase 4: Scoring Auto-Update ────────────────────────────────────────────

/**
 * Load recent persisted outcomes from DB and feed them into the in-memory
 * LEVEL6 scoring engine (ingestOutcomesForScoring).
 * This keeps EntityScores up-to-date across restarts.
 */
async function _syncScoringFromPersistedOutcomes(summary: PostRunIngestionSummary): Promise<void> {
  try {
    const recentOutcomes = await listPersistedOutcomes({ limit: 200 });
    if (recentOutcomes.length === 0) return;

    // Convert DB rows to SignalOutcomeRecord format expected by ingestOutcomesForScoring
    const outcomeRecords: SignalOutcomeRecord[] = recentOutcomes.map(row => ({
      signal_id: row.signalId,
      watch_id: row.signalId, // approximation — watchId not stored in outcome table
      ticker: "unknown",
      trigger_type: "unknown",
      action_type: "unknown",
      evaluation_horizon: row.horizon,
      thesis_status: (row.thesisStatus as SignalOutcomeRecord["thesis_status"]) ?? "inconclusive",
      outcome_score: row.outcomeScore != null ? Number(row.outcomeScore) : 0,
      risk_adjusted_score: row.riskAdjustedScore != null ? Number(row.riskAdjustedScore) : 0,
      risk_realized: false,
      attribution_summary: "",
      risk_warning: "",
      outcome_label: (row.outcomeLabel as SignalOutcomeRecord["outcome_label"]) ?? "inconclusive",
      resolved_at: row.resolvedAt ?? Date.now(),
      recorded_at: row.createdAt,
    }));

    // Use defaultEntityExtractor from signalScoring
    const { defaultEntityExtractor } = await import("./signalScoring");
    ingestOutcomesForScoring(outcomeRecords, defaultEntityExtractor);
    summary.scoring_updated = true;
  } catch (err) {
    summary.errors.push(`scoring_sync_failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Phase 5: Failsafe Wrapper ────────────────────────────────────────────────

/**
 * Safe wrapper around postRunIngestionHook.
 * Guarantees the scheduler is never interrupted by ingestion failures.
 */
export async function safePostRunIngestion(
  runResult: RealRunResult,
  opts?: { dry_run?: boolean }
): Promise<PostRunIngestionSummary> {
  try {
    return await postRunIngestionHook(runResult, opts);
  } catch (fatalErr) {
    // Ultimate failsafe — should never reach here due to internal try/catch
    return {
      run_id: runResult.run_id,
      signals_attempted: 0,
      signals_persisted: 0,
      signals_skipped: 0,
      signals_failed: 0,
      scoring_updated: false,
      errors: [`fatal_failsafe: ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`],
    };
  }
}

// ─── Utility: Sync in-memory journal → DB (batch backfill) ───────────────────

/**
 * Backfill: persist all in-memory SignalJournalEntries to DB.
 * Used for one-time migration from memory-only to persistent mode.
 */
export async function backfillMemoryJournalToDB(opts?: { dry_run?: boolean }): Promise<{
  attempted: number;
  persisted: number;
  skipped: number;
  errors: string[];
}> {
  const result = { attempted: 0, persisted: 0, skipped: 0, errors: [] as string[] };
  if (opts?.dry_run) return result;

  const entries = listMemoryJournal();
  result.attempted = entries.length;

  for (const entry of entries) {
    try {
      const r = await persistSignal({
        watchId: entry.watch_id,
        ticker: entry.ticker,
        triggerType: entry.trigger_type,
        actionType: entry.action_type,
        snapshotQuality: "unknown",
        memoryInfluence: entry.memory_influence,
        learningInfluence: entry.learning_influence,
        schedulerRunId: undefined,
      });
      if (r.skipped) result.skipped++;
      else if (r.success) result.persisted++;
      else result.errors.push(r.error ?? "unknown");
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return result;
}
