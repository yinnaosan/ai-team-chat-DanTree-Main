/**
 * DANTREE LEVEL4 — Execution Layer
 * Phase 5: State Transitions + Audit Trail
 *
 * NON-NEGOTIABLE RULES:
 * 1. Every state transition is recorded and reconstructable.
 * 2. Audit log is append-only — no deletions.
 * 3. Transitions must carry a reason and actor.
 */

import type { WatchItem, WatchStatus, ActionBias, WatchPriority } from "./watchlistEngine";

// ── State Transition Model ────────────────────────────────────────────────────

export type TransitionActor = "system" | "trigger_engine" | "user" | "learning_engine";

export type TransitionType =
  | "status_change"          // active → paused, paused → active, etc.
  | "bias_change"            // BUY → HOLD, HOLD → SELL, etc.
  | "priority_change"        // low → high, etc.
  | "trigger_fired"          // trigger fired event
  | "thesis_updated"         // thesis text changed
  | "condition_added"        // new trigger condition added
  | "condition_removed"      // trigger condition removed
  | "condition_toggled"      // trigger condition enabled/disabled
  | "linked_memory_updated"  // linked_memory_ids changed
  | "linked_loop_updated"    // linked_loop_ids changed
  | "created"                // initial creation
  | "archived";              // final archive

export interface StateTransitionRecord {
  transition_id: string;
  watch_id: string;
  transition_type: TransitionType;
  actor: TransitionActor;
  from_value: string;
  to_value: string;
  reason: string;
  occurred_at: number;  // UTC ms
  metadata?: Record<string, unknown>;
}

export interface AuditSummary {
  watch_id: string;
  primary_ticker: string;
  total_transitions: number;
  total_triggers_fired: number;
  bias_history: Array<{ bias: ActionBias; changed_at: number; reason: string }>;
  status_history: Array<{ status: WatchStatus; changed_at: number; reason: string }>;
  last_transition_at: number | null;
  reconstructable: true;  // always true — audit log is complete
}

// ── Audit Log (in-memory, per session) ───────────────────────────────────────
// In production this would persist to DB. For LEVEL4, we use an in-memory store
// with a clean interface for testing and future DB integration.

export type AuditLog = StateTransitionRecord[];

/**
 * Append a transition to the audit log.
 * Audit log is append-only.
 */
export function appendTransition(
  log: AuditLog,
  params: {
    watch_id: string;
    transition_type: TransitionType;
    actor: TransitionActor;
    from_value: string;
    to_value: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }
): StateTransitionRecord {
  const record: StateTransitionRecord = {
    transition_id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    watch_id: params.watch_id,
    transition_type: params.transition_type,
    actor: params.actor,
    from_value: params.from_value,
    to_value: params.to_value,
    reason: params.reason,
    occurred_at: Date.now(),
    metadata: params.metadata,
  };
  log.push(record);
  return record;
}

/**
 * Record a watch item creation event.
 */
export function recordCreation(log: AuditLog, watchItem: WatchItem): StateTransitionRecord {
  return appendTransition(log, {
    watch_id: watchItem.watch_id,
    transition_type: "created",
    actor: "user",
    from_value: "none",
    to_value: "active",
    reason: `Watch item created for ${watchItem.primary_ticker} (${watchItem.watch_type})`,
    metadata: {
      primary_ticker: watchItem.primary_ticker,
      watch_type: watchItem.watch_type,
      initial_bias: watchItem.current_action_bias,
      priority: watchItem.priority,
    },
  });
}

/**
 * Record a status change (active/paused/archived/triggered).
 */
export function recordStatusChange(
  log: AuditLog,
  watchId: string,
  fromStatus: WatchStatus,
  toStatus: WatchStatus,
  actor: TransitionActor,
  reason: string
): StateTransitionRecord {
  return appendTransition(log, {
    watch_id: watchId,
    transition_type: "status_change",
    actor,
    from_value: fromStatus,
    to_value: toStatus,
    reason,
  });
}

/**
 * Record a bias change (BUY/HOLD/WAIT/SELL/NONE).
 */
export function recordBiasChange(
  log: AuditLog,
  watchId: string,
  fromBias: ActionBias,
  toBias: ActionBias,
  actor: TransitionActor,
  reason: string
): StateTransitionRecord {
  return appendTransition(log, {
    watch_id: watchId,
    transition_type: "bias_change",
    actor,
    from_value: fromBias,
    to_value: toBias,
    reason,
  });
}

/**
 * Record a priority change.
 */
export function recordPriorityChange(
  log: AuditLog,
  watchId: string,
  fromPriority: WatchPriority,
  toPriority: WatchPriority,
  actor: TransitionActor,
  reason: string
): StateTransitionRecord {
  return appendTransition(log, {
    watch_id: watchId,
    transition_type: "priority_change",
    actor,
    from_value: fromPriority,
    to_value: toPriority,
    reason,
  });
}

/**
 * Record a trigger fired event.
 */
export function recordTriggerFired(
  log: AuditLog,
  watchId: string,
  triggerType: string,
  triggerSeverity: string,
  reason: string
): StateTransitionRecord {
  return appendTransition(log, {
    watch_id: watchId,
    transition_type: "trigger_fired",
    actor: "trigger_engine",
    from_value: "stable",
    to_value: `triggered:${triggerType}`,
    reason,
    metadata: { trigger_type: triggerType, trigger_severity: triggerSeverity },
  });
}

/**
 * Build an audit summary for a watch item from its log.
 * Summary is reconstructable from the log alone.
 */
export function buildAuditSummary(
  watchItem: WatchItem,
  log: AuditLog
): AuditSummary {
  const watchLog = log.filter((r) => r.watch_id === watchItem.watch_id);

  const triggersFired = watchLog.filter((r) => r.transition_type === "trigger_fired").length;

  const biasHistory = watchLog
    .filter((r) => r.transition_type === "bias_change" || r.transition_type === "created")
    .map((r) => ({
      bias: (r.transition_type === "created"
        ? (r.metadata?.initial_bias as ActionBias)
        : r.to_value as ActionBias) ?? "NONE",
      changed_at: r.occurred_at,
      reason: r.reason,
    }));

  const statusHistory = watchLog
    .filter((r) => r.transition_type === "status_change" || r.transition_type === "created")
    .map((r) => ({
      status: (r.transition_type === "created" ? "active" : r.to_value) as WatchStatus,
      changed_at: r.occurred_at,
      reason: r.reason,
    }));

  const lastTransition = watchLog.length > 0
    ? watchLog[watchLog.length - 1].occurred_at
    : null;

  return {
    watch_id: watchItem.watch_id,
    primary_ticker: watchItem.primary_ticker,
    total_transitions: watchLog.length,
    total_triggers_fired: triggersFired,
    bias_history: biasHistory,
    status_history: statusHistory,
    last_transition_at: lastTransition,
    reconstructable: true,
  };
}

/**
 * Get all transitions for a specific watch item.
 */
export function getWatchTransitions(
  log: AuditLog,
  watchId: string
): StateTransitionRecord[] {
  return log.filter((r) => r.watch_id === watchId);
}

/**
 * Get all trigger-fired transitions across all watch items.
 */
export function getAllFiredTriggers(log: AuditLog): StateTransitionRecord[] {
  return log.filter((r) => r.transition_type === "trigger_fired");
}
