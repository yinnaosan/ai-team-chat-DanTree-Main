/**
 * DANTREE LEVEL4.1 — Execution Layer Persistence
 * Phase 2: Repository + Service Layer
 *
 * Repositories: pure DB persistence abstraction
 * Services: orchestration logic (reuses LEVEL4 deterministic engines)
 *
 * NON-NEGOTIABLE RULES:
 * 1. Repositories are pure persistence — no business logic.
 * 2. Services orchestrate — no direct DB access outside repositories.
 * 3. Existing LEVEL4 trigger/action logic is REUSED, not rewritten.
 * 4. NO auto-trading or brokerage execution.
 */

import { getDb } from "./db";
import {
  watchItems, watchAuditLog, watchAlerts, watchWorkflows, schedulerRuns,
  type WatchItemRow, type InsertWatchItem,
  type WatchAuditLogRow, type InsertWatchAuditLog,
  type WatchAlertRow, type InsertWatchAlert,
  type WatchWorkflowRow, type InsertWatchWorkflow,
  type SchedulerRunRow, type InsertSchedulerRun,
} from "../drizzle/schema";
import { eq, and, desc, gte } from "drizzle-orm";

// ── Utility ───────────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── WatchRepository ───────────────────────────────────────────────────────────

export const WatchRepository = {
  async createWatch(data: Omit<InsertWatchItem, "watchId" | "createdAt" | "updatedAt"> & { watchId?: string }): Promise<WatchItemRow> {
    const now = Date.now();
    const row: InsertWatchItem = {
      ...data,
      watchId: data.watchId ?? genId("w"),
      createdAt: now,
      updatedAt: now,
    };
    await (await getDb())!.insert(watchItems).values(row);
    return row as WatchItemRow;
  },

  async getWatchById(watchId: string): Promise<WatchItemRow | null> {
    const rows = await (await getDb())!.select().from(watchItems).where(eq(watchItems.watchId, watchId)).limit(1);
    return rows[0] ?? null;
  },

  async listActiveWatches(userId?: string): Promise<WatchItemRow[]> {
    if (userId) {
      return (await getDb())!.select().from(watchItems).where(
        and(eq(watchItems.watchStatus, "active"), eq(watchItems.userId, userId))
      );
    }
    return (await getDb())!.select().from(watchItems).where(eq(watchItems.watchStatus, "active"));
  },

  async listWatchesByUser(userId: string): Promise<WatchItemRow[]> {
    return (await getDb())!.select().from(watchItems).where(eq(watchItems.userId, userId)).orderBy(desc(watchItems.createdAt));
  },

  async updateWatchStatus(watchId: string, status: string): Promise<void> {
    await (await getDb())!.update(watchItems)
      .set({ watchStatus: status, updatedAt: Date.now() })
      .where(eq(watchItems.watchId, watchId));
  },

  async updateLastEvaluated(watchId: string): Promise<void> {
    await (await getDb())!.update(watchItems)
      .set({ lastEvaluatedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(watchItems.watchId, watchId));
  },

  async updateLastTriggered(watchId: string): Promise<void> {
    const now = Date.now();
    await (await getDb())!.update(watchItems)
      .set({ lastTriggeredAt: now, watchStatus: "triggered", updatedAt: now })
      .where(eq(watchItems.watchId, watchId));
  },

  async updateBias(watchId: string, bias: string): Promise<void> {
    await (await getDb())!.update(watchItems)
      .set({ currentActionBias: bias, updatedAt: Date.now() })
      .where(eq(watchItems.watchId, watchId));
  },
  /** B2.5: persist current risk_score as last_risk_score for next run's delta comparison */
  async updateLastRiskScore(watchId: string, score: number): Promise<void> {
    await (await getDb())!.update(watchItems)
      .set({ lastRiskScore: score.toFixed(4), updatedAt: Date.now() })
      .where(eq(watchItems.watchId, watchId));
  },
  /** B4: persist current PE ratio for valuation_shift delta comparison across restarts */
  async updateLastValuation(watchId: string, pe: number): Promise<void> {
    await (await getDb())!.update(watchItems)
      .set({ lastValuation: pe.toFixed(4), updatedAt: Date.now() })
      .where(eq(watchItems.watchId, watchId));
  },
};

// ── WatchAuditRepository ──────────────────────────────────────────────────────

export const WatchAuditRepository = {
  async appendAuditEvent(data: {
    watchId: string;
    eventType: string;
    fromStatus?: string;
    toStatus?: string;
    triggerId?: string;
    actionId?: string;
    payloadJson?: Record<string, unknown>;
  }): Promise<WatchAuditLogRow> {
    const row: InsertWatchAuditLog = {
      auditId: genId("aud"),
      watchId: data.watchId,
      eventType: data.eventType,
      fromStatus: data.fromStatus ?? null,
      toStatus: data.toStatus ?? null,
      triggerId: data.triggerId ?? null,
      actionId: data.actionId ?? null,
      payloadJson: data.payloadJson ?? null,
      createdAt: Date.now(),
    };
    await (await getDb())!.insert(watchAuditLog).values(row);
    return row as WatchAuditLogRow;
  },

  async listAuditByWatch(watchId: string): Promise<WatchAuditLogRow[]> {
    return (await getDb())!.select().from(watchAuditLog)
      .where(eq(watchAuditLog.watchId, watchId))
      .orderBy(watchAuditLog.createdAt);
  },
};

// ── WatchAlertRepository ──────────────────────────────────────────────────────

export const WatchAlertRepository = {
  async createAlert(data: {
    watchId: string;
    triggerId?: string;
    actionId?: string;
    severity: string;
    title: string;
    message: string;
    cooldownKey: string;
    schedulerRunId?: string;
  }): Promise<WatchAlertRow> {
    const row: InsertWatchAlert = {
      alertId: genId("alrt"),
      watchId: data.watchId,
      triggerId: data.triggerId ?? null,
      actionId: data.actionId ?? null,
      severity: data.severity,
      title: data.title,
      message: data.message,
      workflowStatus: "new",
      cooldownKey: data.cooldownKey,
      schedulerRunId: data.schedulerRunId ?? null,
      createdAt: Date.now(),
    };
    await (await getDb())!.insert(watchAlerts).values(row);
    return row as WatchAlertRow;
  },

  async findRecentDuplicateAlert(cooldownKey: string, windowMs: number): Promise<WatchAlertRow | null> {
    const since = Date.now() - windowMs;
    const rows = await (await getDb())!.select().from(watchAlerts)
      .where(and(eq(watchAlerts.cooldownKey, cooldownKey), gte(watchAlerts.createdAt, since)))
      .orderBy(desc(watchAlerts.createdAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async listAlertsByWatch(watchId: string): Promise<WatchAlertRow[]> {
    return (await getDb())!.select().from(watchAlerts)
      .where(eq(watchAlerts.watchId, watchId))
      .orderBy(desc(watchAlerts.createdAt));
  },

  async updateAlertWorkflowStatus(alertId: string, status: string): Promise<void> {
    await (await getDb())!.update(watchAlerts)
      .set({ workflowStatus: status })
      .where(eq(watchAlerts.alertId, alertId));
  },
};

// ── WatchWorkflowRepository ───────────────────────────────────────────────────

export const WatchWorkflowRepository = {
  async createWorkflow(data: {
    watchId: string;
    triggerId?: string;
    actionId?: string;
    workflowStep?: string;
    summary?: string;
    schedulerRunId?: string;
  }): Promise<WatchWorkflowRow> {
    const now = Date.now();
    const row: InsertWatchWorkflow = {
      workflowId: genId("wf"),
      watchId: data.watchId,
      triggerId: data.triggerId ?? null,
      actionId: data.actionId ?? null,
      workflowStep: data.workflowStep ?? "triggered",
      status: "open",
      summary: data.summary ?? null,
      schedulerRunId: data.schedulerRunId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await (await getDb())!.insert(watchWorkflows).values(row);
    return row as WatchWorkflowRow;
  },

  async updateWorkflowStatus(workflowId: string, step: string, status: string, summary?: string): Promise<void> {
    await (await getDb())!.update(watchWorkflows)
      .set({ workflowStep: step, status, summary: summary ?? undefined, updatedAt: Date.now() })
      .where(eq(watchWorkflows.workflowId, workflowId));
  },

  async listWorkflowByWatch(watchId: string): Promise<WatchWorkflowRow[]> {
    return (await getDb())!.select().from(watchWorkflows)
      .where(eq(watchWorkflows.watchId, watchId))
      .orderBy(desc(watchWorkflows.createdAt));
  },
};

// ── SchedulerRunRepository ────────────────────────────────────────────────────

export const SchedulerRunRepository = {
  async createRun(dryRun = false): Promise<SchedulerRunRow> {
    const row: InsertSchedulerRun = {
      runId: genId("run"),
      startedAt: Date.now(),
      finishedAt: null,
      runStatus: "running",
      watchesScanned: 0,
      triggersFired: 0,
      actionsCreated: 0,
      alertsCreated: 0,
      errorsCount: 0,
      abortedEarly: false,
      dryRun,
      summaryJson: null,
    };
    await (await getDb())!.insert(schedulerRuns).values(row);
    return row as SchedulerRunRow;
  },

  async finalizeRun(runId: string, updates: {
    runStatus: string;
    watchesScanned: number;
    triggersFired: number;
    actionsCreated: number;
    alertsCreated: number;
    errorsCount: number;
    abortedEarly: boolean;
    summaryJson?: Record<string, unknown>;
  }): Promise<void> {
    await (await getDb())!.update(schedulerRuns)
      .set({ ...updates, finishedAt: Date.now() })
      .where(eq(schedulerRuns.runId, runId));
  },

  async appendRunError(runId: string): Promise<void> {
    // Increment error count by fetching and updating
    const rows = await (await getDb())!.select({ errorsCount: schedulerRuns.errorsCount })
      .from(schedulerRuns).where(eq(schedulerRuns.runId, runId)).limit(1);
    const current = rows[0]?.errorsCount ?? 0;
    await (await getDb())!.update(schedulerRuns)
      .set({ errorsCount: current + 1 })
      .where(eq(schedulerRuns.runId, runId));
  },

  async getLatestRun(): Promise<SchedulerRunRow | null> {
    const rows = await (await getDb())!.select().from(schedulerRuns)
      .orderBy(desc(schedulerRuns.startedAt)).limit(1);
    return rows[0] ?? null;
  },

  async getRunById(runId: string): Promise<SchedulerRunRow | null> {
    const rows = await (await getDb())!.select().from(schedulerRuns)
      .where(eq(schedulerRuns.runId, runId)).limit(1);
    return rows[0] ?? null;
  },

  async listRecentRuns(limit = 10): Promise<SchedulerRunRow[]> {
    return (await getDb())!.select().from(schedulerRuns)
      .orderBy(desc(schedulerRuns.startedAt)).limit(limit);
  },

  async getRunningRun(): Promise<SchedulerRunRow | null> {
    const rows = await (await getDb())!.select().from(schedulerRuns)
      .where(eq(schedulerRuns.runStatus, "running"))
      .orderBy(desc(schedulerRuns.startedAt)).limit(1);
    return rows[0] ?? null;
  },
};
