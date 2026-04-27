/**
 * DANTREE LEVEL4.1 — Service Layer + Scheduler
 * Phase 2: WatchService, TriggerEvaluationService, AlertWorkflowService
 * Phase 3: SchedulerService — batchEvaluateTriggers, dry_run, concurrency lock
 *
 * NON-NEGOTIABLE RULES:
 * 1. Services orchestrate — no direct DB access (use Repositories).
 * 2. LEVEL4 deterministic trigger/action logic is REUSED via imports.
 * 3. NO LLM calls from scheduler decision layer.
 * 4. NO auto-trading. auto_trade_allowed is ALWAYS false.
 * 5. Scheduler must support dry_run mode.
 * 6. Scheduler enforces: max_batch_size, max_errors_before_abort, evaluation_cooldown.
 */

import {
  WatchRepository,
  WatchAuditRepository,
  WatchAlertRepository,
  WatchWorkflowRepository,
  SchedulerRunRepository,
} from "./watchRepository";
import {
  type WatchItemRow,
  type WatchAlertRow,
  type WatchWorkflowRow,
  type SchedulerRunRow,
} from "../drizzle/schema";
import { evaluateWatchTrigger, type WatchItem, type TriggerInput, type TriggerResult } from "./watchlistEngine";

import { evaluateSafety, type RateLimitCounters, DEFAULT_COST_SAFETY_CONFIG } from "./costSafetyGuard";
import { generateActionRecommendation } from "./actionRecommendationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SchedulerConfig {
  batch_size: number;
  max_runtime_ms: number;
  max_errors_before_abort: number;
  evaluation_interval_minutes: number;
  dry_run: boolean;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  batch_size: 50,
  max_runtime_ms: 30_000,
  max_errors_before_abort: 20,
  evaluation_interval_minutes: 15,
  dry_run: false,
};

export interface BatchRunResult {
  run_id: string;
  watches_scanned: number;
  triggers_fired: number;
  actions_created: number;
  alerts_created: number;
  errors_count: number;
  aborted_early: boolean;
  dry_run: boolean;
  duration_ms: number;
}

export interface WatchEvalResult {
  watch_id: string;
  ticker: string;
  triggered: boolean;
  skipped: boolean;
  skipped_reason?: string;
  trigger_id?: string;
  action_id?: string;
  alert_created: boolean;
  workflow_created: boolean;
  cooldown_applied: boolean;
  alert_dedup_applied: boolean;
  dry_run: boolean;
  evaluation_reason: string;
}

// Cooldown window for alert dedup (default 4 hours)
const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// WatchService — watch lifecycle management
// ─────────────────────────────────────────────────────────────────────────────

export const WatchService = {
  async createWatch(params: {
    userId: string;
    primaryTicker: string;
    watchType: string;
    thesisSummary: string;
    triggerConditions?: unknown[];
    riskConditions?: string[];
    priority?: string;
    notes?: string;
    linkedMemoryIds?: string[];
    linkedLoopIds?: string[];
  }): Promise<WatchItemRow> {
    const watch = await WatchRepository.createWatch({
      userId: params.userId,
      primaryTicker: params.primaryTicker.toUpperCase(),
      watchType: params.watchType,
      watchStatus: "active",
      currentActionBias: "NONE",
      thesisSummary: params.thesisSummary,
      triggerConditions: params.triggerConditions ?? [],
      riskConditions: params.riskConditions ?? [],
      priority: params.priority ?? "medium",
      notes: params.notes ?? null,
      linkedMemoryIds: params.linkedMemoryIds ?? [],
      linkedLoopIds: params.linkedLoopIds ?? [],
    });

    await WatchAuditRepository.appendAuditEvent({
      watchId: watch.watchId,
      eventType: "watch_created",
      toStatus: "active",
      payloadJson: { ticker: watch.primaryTicker, watchType: watch.watchType },
    });

    return watch;
  },

  async pauseWatch(watchId: string, reason?: string): Promise<void> {
    const watch = await WatchRepository.getWatchById(watchId);
    if (!watch) throw new Error(`Watch not found: ${watchId}`);
    const prev = watch.watchStatus;
    await WatchRepository.updateWatchStatus(watchId, "paused");
    await WatchAuditRepository.appendAuditEvent({
      watchId,
      eventType: "watch_paused",
      fromStatus: prev,
      toStatus: "paused",
      payloadJson: { reason: reason ?? "manual" },
    });
  },

  async archiveWatch(watchId: string, reason?: string): Promise<void> {
    const watch = await WatchRepository.getWatchById(watchId);
    if (!watch) throw new Error(`Watch not found: ${watchId}`);
    const prev = watch.watchStatus;
    await WatchRepository.updateWatchStatus(watchId, "archived");
    await WatchAuditRepository.appendAuditEvent({
      watchId,
      eventType: "watch_archived",
      fromStatus: prev,
      toStatus: "archived",
      payloadJson: { reason: reason ?? "manual" },
    });
  },

  async reactivateWatch(watchId: string): Promise<void> {
    const watch = await WatchRepository.getWatchById(watchId);
    if (!watch) throw new Error(`Watch not found: ${watchId}`);
    const prev = watch.watchStatus;
    await WatchRepository.updateWatchStatus(watchId, "active");
    await WatchAuditRepository.appendAuditEvent({
      watchId,
      eventType: "watch_reactivated",
      fromStatus: prev,
      toStatus: "active",
    });
  },

  async listWatches(userId: string): Promise<WatchItemRow[]> {
    return WatchRepository.listWatchesByUser(userId);
  },

  async getWatch(watchId: string): Promise<WatchItemRow | null> {
    return WatchRepository.getWatchById(watchId);
  },

  async getAuditTimeline(watchId: string) {
    return WatchAuditRepository.listAuditByWatch(watchId);
  },

  async getAlerts(watchId: string): Promise<WatchAlertRow[]> {
    return WatchAlertRepository.listAlertsByWatch(watchId);
  },

  async getWorkflows(watchId: string): Promise<WatchWorkflowRow[]> {
    return WatchWorkflowRepository.listWorkflowByWatch(watchId);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TriggerEvaluationService — single watch evaluation
// ─────────────────────────────────────────────────────────────────────────────

export const TriggerEvaluationService = {
  async evaluateSingleWatch(
    watchRow: WatchItemRow,
    snapshot: TriggerInput,
    schedulerRunId?: string,
    dryRun = false
  ): Promise<WatchEvalResult> {
    const _snapshot: TriggerInput = snapshot as unknown as TriggerInput;
    const result: WatchEvalResult = {
      watch_id: watchRow.watchId,
      ticker: watchRow.primaryTicker,
      triggered: false,
      skipped: false,
      alert_created: false,
      workflow_created: false,
      cooldown_applied: false,
      alert_dedup_applied: false,
      dry_run: dryRun,
      evaluation_reason: "evaluated",
    };

    // Skip paused/archived
    if (watchRow.watchStatus === "paused" || watchRow.watchStatus === "archived") {
      result.skipped = true;
      result.skipped_reason = `watch_status=${watchRow.watchStatus}`;
      result.evaluation_reason = "skipped";
      return result;
    }

    // Cooldown check: skip if evaluated within interval
    const evalIntervalMs = DEFAULT_SCHEDULER_CONFIG.evaluation_interval_minutes * 60 * 1000;
    if (watchRow.lastEvaluatedAt && (Date.now() - watchRow.lastEvaluatedAt) < evalIntervalMs) {
      result.skipped = true;
      result.skipped_reason = "evaluation_cooldown";
      result.cooldown_applied = true;
      result.evaluation_reason = "skipped_cooldown";
      return result;
    }

    // Build WatchItem from DB row for LEVEL4 engine
    const watchItem: WatchItem = {
      watch_id: watchRow.watchId,
      user_id: watchRow.userId,
      primary_ticker: watchRow.primaryTicker,
      watch_type: watchRow.watchType as WatchItem["watch_type"],
      watch_status: watchRow.watchStatus as WatchItem["watch_status"],
      current_action_bias: (watchRow.currentActionBias ?? "NONE") as WatchItem["current_action_bias"],
      thesis_summary: watchRow.thesisSummary,
      trigger_conditions: (watchRow.triggerConditions as WatchItem["trigger_conditions"]) ?? [],
      risk_conditions: (watchRow.riskConditions as string[]) ?? [],
      priority: (watchRow.priority ?? "medium") as WatchItem["priority"],
      linked_memory_ids: (watchRow.linkedMemoryIds as string[]) ?? [],
      linked_loop_ids: (watchRow.linkedLoopIds as string[]) ?? [],
      notes: watchRow.notes ?? "",
      created_at: watchRow.createdAt,
      last_evaluated_at: watchRow.lastEvaluatedAt ?? null,
      last_triggered_at: watchRow.lastTriggeredAt ?? null,
      updated_at: watchRow.updatedAt,
    };

    // Evaluate trigger (deterministic, no LLM)
    const triggerResult: TriggerResult = evaluateWatchTrigger(watchItem, _snapshot);

    if (!dryRun) {
      await WatchRepository.updateLastEvaluated(watchRow.watchId);
    }

    if (!triggerResult.trigger_fired) {
      result.evaluation_reason = "no_trigger";
      return result;
    }

    // Trigger fired
    result.triggered = true;
    result.trigger_id = triggerResult.trigger_type; // using trigger_type as id

    // Build action recommendation (deterministic, no LLM)
    const now = Date.now();
    const counters: RateLimitCounters = {
      user_id: watchRow.userId,
      evaluations_this_hour: 0,
      evaluations_hour_start: now,
      deep_reasoning_today: 0,
      standard_reasoning_today: 0,
      day_start: now,
    };
    const safetyResult = evaluateSafety(
      watchRow.userId,
      "standard",
      (triggerResult as { severity?: string }).severity as "low" | "medium" | "high" | "critical" ?? "medium",
      counters,
      DEFAULT_COST_SAFETY_CONFIG
    );

    const actionResult = generateActionRecommendation(watchItem, triggerResult);

    result.action_id = actionResult.action_id;

    if (!dryRun) {
      // Update watch state
      await WatchRepository.updateLastTriggered(watchRow.watchId);
      await WatchRepository.updateBias(watchRow.watchId, actionResult.action_type);

      // Audit — isolated: failure warns but does NOT kill dedup check + alert + workflow [B1R2]
      try {
        await WatchAuditRepository.appendAuditEvent({
          watchId: watchRow.watchId,
          eventType: "trigger_fired",
          fromStatus: watchRow.watchStatus,
          toStatus: "triggered",
          triggerId: triggerResult.trigger_type,
          actionId: actionResult.action_id,
          payloadJson: {
            trigger_type: triggerResult.trigger_type,
            trigger_reason: triggerResult.trigger_reason,
            action_type: actionResult.action_type,
            severity: actionResult.urgency,
            scheduler_run_id: schedulerRunId,
          },
        });
      } catch (auditErr) {
        console.warn(`[B1R2] trigger_fired audit write failed watchId=${watchRow.watchId} ticker=${watchRow.primaryTicker}`, (auditErr as Error).message);
      }
    }

    // Alert dedup check — ALWAYS reached, regardless of audit outcome [B1R2]
    const cooldownKey = `${watchRow.watchId}:${triggerResult.trigger_type}`;
    const duplicate = await WatchAlertRepository.findRecentDuplicateAlert(cooldownKey, ALERT_COOLDOWN_MS);
    if (duplicate) {
      result.alert_dedup_applied = true;
      result.evaluation_reason = "trigger_fired_dedup_suppressed";
      return result;
    }

    if (!dryRun) {
      // Create alert — isolated [B1R2]
      try {
        await AlertWorkflowService.createAlert({
          watchId: watchRow.watchId,
          triggerId: triggerResult.trigger_type,
          actionId: actionResult.action_id,
          severity: actionResult.urgency,
          title: `[${actionResult.urgency.toUpperCase()}] ${watchRow.primaryTicker} — ${triggerResult.trigger_type}`,
          message: actionResult.rationale,
          cooldownKey,
          schedulerRunId,
        });
        result.alert_created = true;
      } catch (alertErr) {
        console.warn(`[B1R2] createAlert failed watchId=${watchRow.watchId} ticker=${watchRow.primaryTicker}`, (alertErr as Error).message);
      }

      // Create workflow — isolated, independent of alert success [B1R2]
      try {
        await AlertWorkflowService.createWorkflow({
          watchId: watchRow.watchId,
          triggerId: triggerResult.trigger_type,
          actionId: actionResult.action_id,
          summary: actionResult.rationale,
          schedulerRunId,
        });
        result.workflow_created = true;
      } catch (workflowErr) {
        console.warn(`[B1R2] createWorkflow failed watchId=${watchRow.watchId} ticker=${watchRow.primaryTicker}`, (workflowErr as Error).message);
      }
    }

    result.evaluation_reason = "trigger_fired";
    return result;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AlertWorkflowService — alert + workflow lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export const AlertWorkflowService = {
  async createAlert(params: {
    watchId: string;
    triggerId?: string;
    actionId?: string;
    severity: string;
    title: string;
    message: string;
    cooldownKey: string;
    schedulerRunId?: string;
  }): Promise<WatchAlertRow> {
    return WatchAlertRepository.createAlert(params);
  },

  async createWorkflow(params: {
    watchId: string;
    triggerId?: string;
    actionId?: string;
    summary?: string;
    schedulerRunId?: string;
  }): Promise<WatchWorkflowRow> {
    return WatchWorkflowRepository.createWorkflow({
      ...params,
      workflowStep: "triggered",
    });
  },

  async advanceWorkflow(workflowId: string, step: string, status: string, summary?: string): Promise<void> {
    await WatchWorkflowRepository.updateWorkflowStatus(workflowId, step, status, summary);
  },

  async acknowledgeAlert(alertId: string): Promise<void> {
    await WatchAlertRepository.updateAlertWorkflowStatus(alertId, "acknowledged");
  },

  async resolveAlert(alertId: string): Promise<void> {
    await WatchAlertRepository.updateAlertWorkflowStatus(alertId, "resolved");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SchedulerService — batch evaluation with safety rails
// ─────────────────────────────────────────────────────────────────────────────

// Simple in-memory lock to prevent concurrent runs
let _schedulerRunning = false;

// B2.5: previous_risk_score is now persisted in watch_items.last_risk_score (DB column).
// Survives server restarts. Null on first run = no previous value = risk_escalation does not fire.

export const SchedulerService = {
  isRunning(): boolean {
    return _schedulerRunning;
  },

  async batchEvaluateTriggers(
    snapshotProvider: (tickers: string[]) => Promise<Record<string, TriggerInput>>,
    config: Partial<SchedulerConfig> = {}
  ): Promise<BatchRunResult> {
    const cfg: SchedulerConfig = { ...DEFAULT_SCHEDULER_CONFIG, ...config };

    // Concurrency lock
    if (_schedulerRunning) {
      throw new Error("Scheduler already running — concurrent runs not allowed");
    }
    _schedulerRunning = true;

    const runRow = await SchedulerRunRepository.createRun(cfg.dry_run);
    const startedAt = Date.now();

    let watchesScanned = 0;
    let triggersFired = 0;
    let actionsCreated = 0;
    let alertsCreated = 0;
    let errorsCount = 0;
    let abortedEarly = false;

    try {
      // Fetch active watches (bounded by batch_size)
      const activeWatches = await WatchRepository.listActiveWatches();
      const batch = activeWatches.slice(0, cfg.batch_size);

      // Fetch market snapshots for all tickers
      const tickerSet = new Set(batch.map(w => w.primaryTicker));
      const tickers = Array.from(tickerSet);
      const snapshots = await snapshotProvider(tickers);

      for (const watch of batch) {
        // Runtime limit check
        if (Date.now() - startedAt > cfg.max_runtime_ms) {
          abortedEarly = true;
          break;
        }
        // Error abort check
        if (errorsCount >= cfg.max_errors_before_abort) {
          abortedEarly = true;
          break;
        }

        watchesScanned++;

        try {
          // Step 1: get base snapshot (contains current risk_score from liveSignalEngine)
          const _baseSnapshot: TriggerInput = snapshots[watch.primaryTicker] ?? _emptySnapshot(watch.primaryTicker);
          // Step 2: READ old value from DB (B2.5 — persists across restarts)
          const _prevRaw = (watch as typeof watch & { lastRiskScore?: string | null }).lastRiskScore;
          const _prevRiskScore = _prevRaw != null ? parseFloat(_prevRaw) : undefined;
          // Step 2b: READ old PE from DB (B4 — persists across restarts)
          const _prevPERaw = (watch as typeof watch & { lastValuation?: string | null }).lastValuation;
          const _prevPE = _prevPERaw != null ? parseFloat(_prevPERaw) : undefined;
          // Step 3: enrich snapshot with previous_risk_score — B2.5
          let snapshot: TriggerInput = _prevRiskScore !== undefined && !isNaN(_prevRiskScore)
            ? { ..._baseSnapshot, previous_risk_score: _prevRiskScore }
            : _baseSnapshot;
          // Step 3b: enrich snapshot with previous_valuation — B4
          if (_prevPE !== undefined && !isNaN(_prevPE)) {
            snapshot = { ...snapshot, previous_valuation: _prevPE };
          }
          // Step 4: EVALUATE (risk_escalation + valuation_shift now have both values to compare)
          const evalResult = await TriggerEvaluationService.evaluateSingleWatch(
            watch, snapshot, runRow.runId, cfg.dry_run
          );
          // Step 5: WRITE BACK new value to DB AFTER evaluation (non-fatal) — B2.5
          if (_baseSnapshot.risk_score !== undefined) {
            try {
              await WatchRepository.updateLastRiskScore(watch.watchId, _baseSnapshot.risk_score);
            } catch (_rse) {
              console.warn('[B2.5] updateLastRiskScore failed (non-fatal):', (watch as { watchId?: string }).watchId, (_rse as Error).message);
            }
          }
          // Step 5b: WRITE BACK current PE to DB AFTER evaluation (non-fatal) — B4
          if (_baseSnapshot.current_valuation !== undefined) {
            try {
              await WatchRepository.updateLastValuation(watch.watchId, _baseSnapshot.current_valuation);
            } catch (_ve) {
              console.warn('[B4] updateLastValuation failed (non-fatal):', (watch as { watchId?: string }).watchId, (_ve as Error).message);
            }
          }

          if (evalResult.triggered) {
            triggersFired++;
            if (evalResult.action_id) actionsCreated++;
            if (evalResult.alert_created) alertsCreated++;
          }
        } catch (err) {
          errorsCount++;
          if (!cfg.dry_run) {
            await SchedulerRunRepository.appendRunError(runRow.runId);
          }
        }
      }
    } finally {
      _schedulerRunning = false;
    }

    const duration_ms = Date.now() - startedAt;

    if (!cfg.dry_run) {
      await SchedulerRunRepository.finalizeRun(runRow.runId, {
        runStatus: abortedEarly ? "aborted" : "completed",
        watchesScanned,
        triggersFired,
        actionsCreated,
        alertsCreated,
        errorsCount,
        abortedEarly,
        summaryJson: {
          duration_ms,
          config: cfg,
          completed_at: new Date().toISOString(),
        },
      });
    }

    return {
      run_id: runRow.runId,
      watches_scanned: watchesScanned,
      triggers_fired: triggersFired,
      actions_created: actionsCreated,
      alerts_created: alertsCreated,
      errors_count: errorsCount,
      aborted_early: abortedEarly,
      dry_run: cfg.dry_run,
      duration_ms,
    };
  },

  async getLatestRun(): Promise<SchedulerRunRow | null> {
    return SchedulerRunRepository.getLatestRun();
  },

  async listRecentRuns(limit = 10): Promise<SchedulerRunRow[]> {
    return SchedulerRunRepository.listRecentRuns(limit);
  },

  async getRunById(runId: string): Promise<SchedulerRunRow | null> {
    return SchedulerRunRepository.getRunById(runId);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function _emptySnapshot(ticker: string): TriggerInput {
  return {
    current_price: 0,
    evaluated_at: Date.now(),
  };
}
