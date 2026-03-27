/**
 * DANTREE LEVEL4 — Execution Layer
 * Phase 3: Action Recommendation Engine
 * Phase 4: Alert and Workflow Output
 *
 * NON-NEGOTIABLE RULES:
 * 1. NO auto-trading or real order placement.
 * 2. Action recommendations are advisory only.
 * 3. Every recommendation must be traceable to a trigger + reasoning.
 * 4. Alert dedup/cooldown prevents spam.
 */

import type { TriggerResult, TriggerSeverity, WatchItem, WatchType, ActionBias } from "./watchlistEngine";

// ── Phase 3: Action Recommendation Engine ────────────────────────────────────

export type ActionType =
  | "recheck"              // run targeted reasoning again
  | "deep_recheck"         // full reasoning loop (high/critical)
  | "reduce_risk"          // advisory: reduce position or hedge
  | "downgrade_conviction" // advisory: lower conviction level
  | "upgrade_conviction"   // advisory: raise conviction level
  | "monitor_only"         // no action needed — watch and wait
  | "update_thesis"        // thesis needs explicit update
  | "escalate_to_user"     // requires user decision
  | "archive_watch";       // watch item no longer relevant

export type ReasoningMode = "quick" | "standard" | "deep";

export interface ActionRecommendation {
  action_id: string;
  watch_id: string;
  trigger_id: string;
  action_type: ActionType;
  reasoning_mode: ReasoningMode;
  rationale: string;
  urgency: TriggerSeverity;
  safe_to_auto_execute: false;  // ALWAYS false — no auto-trading
  created_at: number;
  linked_trigger_type: string;
  linked_trigger_severity: TriggerSeverity;
}

/**
 * Map trigger type + severity + watch type → action type.
 * This is the core decision matrix.
 */
function selectActionType(
  triggerType: string,
  severity: TriggerSeverity,
  watchType: WatchType,
  currentBias: ActionBias
): ActionType {
  // Critical severity always escalates
  if (severity === "critical") {
    if (triggerType === "risk_escalation" || triggerType === "memory_contradiction") {
      return "reduce_risk";
    }
    return "deep_recheck";
  }

  // High severity
  if (severity === "high") {
    if (triggerType === "risk_escalation") return "reduce_risk";
    if (triggerType === "memory_contradiction") return "downgrade_conviction";
    if (triggerType === "learning_threshold_breach") return "deep_recheck";
    return "deep_recheck";
  }

  // Medium severity
  if (severity === "medium") {
    if (triggerType === "earnings_event") return "recheck";
    if (triggerType === "valuation_shift") {
      // If already SELL bias, monitor only
      return currentBias === "SELL" ? "monitor_only" : "recheck";
    }
    if (triggerType === "price_break") return "recheck";
    if (triggerType === "macro_change") {
      return watchType === "macro_watch" ? "recheck" : "monitor_only";
    }
    return "recheck";
  }

  // Low severity
  return "monitor_only";
}

/**
 * Map severity → reasoning mode.
 * High-cost deep reasoning only for high/critical triggers (Phase 6 rule).
 */
function selectReasoningMode(severity: TriggerSeverity): ReasoningMode {
  if (severity === "critical") return "deep";
  if (severity === "high") return "deep";
  if (severity === "medium") return "standard";
  return "quick";
}

/**
 * Build rationale string for the recommendation.
 */
function buildRationale(
  triggerResult: TriggerResult,
  actionType: ActionType,
  watchItem: WatchItem
): string {
  const parts: string[] = [
    `Trigger: ${triggerResult.trigger_type} (${triggerResult.trigger_severity}) — ${triggerResult.trigger_reason}`,
    `Watch: ${watchItem.primary_ticker} (${watchItem.watch_type}, bias=${watchItem.current_action_bias})`,
    `Recommended action: ${actionType}`,
    `Thesis: ${watchItem.thesis_summary.slice(0, 120)}${watchItem.thesis_summary.length > 120 ? "..." : ""}`,
  ];
  return parts.join(" | ");
}

/**
 * LEVEL4 Phase 3: Generate action recommendation from trigger result.
 * Traceable: every recommendation links back to trigger + watch item.
 */
export function generateActionRecommendation(
  watchItem: WatchItem,
  triggerResult: TriggerResult
): ActionRecommendation {
  if (!triggerResult.trigger_fired) {
    // No trigger — monitor only
    return {
      action_id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      watch_id: watchItem.watch_id,
      trigger_id: `trigger_${triggerResult.evaluated_at}`,
      action_type: "monitor_only",
      reasoning_mode: "quick",
      rationale: `No trigger fired — ${watchItem.primary_ticker} stable, continue monitoring`,
      urgency: "low",
      safe_to_auto_execute: false,
      created_at: Date.now(),
      linked_trigger_type: "no_trigger",
      linked_trigger_severity: "low",
    };
  }

  const actionType = selectActionType(
    triggerResult.trigger_type,
    triggerResult.trigger_severity,
    watchItem.watch_type,
    watchItem.current_action_bias
  );
  const reasoningMode = selectReasoningMode(triggerResult.trigger_severity);
  const rationale = buildRationale(triggerResult, actionType, watchItem);

  return {
    action_id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    watch_id: watchItem.watch_id,
    trigger_id: `trigger_${triggerResult.evaluated_at}_${triggerResult.trigger_type}`,
    action_type: actionType,
    reasoning_mode: reasoningMode,
    rationale,
    urgency: triggerResult.trigger_severity,
    safe_to_auto_execute: false,  // ALWAYS false
    created_at: Date.now(),
    linked_trigger_type: triggerResult.trigger_type,
    linked_trigger_severity: triggerResult.trigger_severity,
  };
}

// ── Phase 4: Alert and Workflow Output ───────────────────────────────────────

export type AlertSeverity = TriggerSeverity;
export type WorkflowStatus =
  | "triggered"
  | "reasoning_requested"
  | "decision_updated"
  | "resolved";

export interface Alert {
  alert_id: string;
  watch_id: string;
  alert_title: string;
  alert_message: string;
  severity: AlertSeverity;
  action_recommendation_id: string;
  workflow_status: "new" | "acknowledged" | "resolved";
  created_at: number;
  dedup_key: string;  // for dedup/cooldown
}

export interface WorkflowObject {
  workflow_id: string;
  watch_id: string;
  trigger_id: string;
  action_id: string;
  workflow_step: WorkflowStatus;
  status: "open" | "in_progress" | "resolved";
  summary: string;
  created_at: number;
  updated_at: number;
}

/**
 * Build a human-readable alert title.
 */
function buildAlertTitle(
  triggerType: string,
  ticker: string,
  severity: AlertSeverity
): string {
  const severityPrefix = severity === "critical" ? "🔴 CRITICAL" :
    severity === "high" ? "🟠 HIGH" :
    severity === "medium" ? "🟡 MEDIUM" : "🔵 LOW";

  const typeLabel: Record<string, string> = {
    price_break: "Price Break",
    valuation_shift: "Valuation Shift",
    earnings_event: "Earnings Event",
    macro_change: "Macro Change",
    risk_escalation: "Risk Escalation",
    memory_contradiction: "Memory Contradiction",
    learning_threshold_breach: "Learning Threshold Breach",
  };

  return `${severityPrefix} — ${typeLabel[triggerType] ?? triggerType} — ${ticker}`;
}

/**
 * Build a human-readable alert message.
 * Must include: what changed, why it matters, what system recommends.
 */
function buildAlertMessage(
  triggerResult: TriggerResult,
  recommendation: ActionRecommendation,
  watchItem: WatchItem
): string {
  return [
    `**What changed:** ${triggerResult.trigger_reason}`,
    `**Why it matters:** ${watchItem.primary_ticker} (${watchItem.watch_type}) — current bias: ${watchItem.current_action_bias}`,
    `**System recommends:** ${recommendation.action_type} (${recommendation.reasoning_mode} reasoning) — ${recommendation.rationale.split(" | ")[0]}`,
  ].join("\n");
}

/**
 * Build dedup key for cooldown.
 * Same watch_id + trigger_type within cooldown window = duplicate.
 */
export function buildDedupKey(watchId: string, triggerType: string): string {
  return `${watchId}::${triggerType}`;
}

/**
 * LEVEL4 Phase 4: Create Alert from trigger + recommendation.
 */
export function createAlert(
  watchItem: WatchItem,
  triggerResult: TriggerResult,
  recommendation: ActionRecommendation
): Alert {
  return {
    alert_id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    watch_id: watchItem.watch_id,
    alert_title: buildAlertTitle(
      triggerResult.trigger_type,
      watchItem.primary_ticker,
      triggerResult.trigger_severity
    ),
    alert_message: buildAlertMessage(triggerResult, recommendation, watchItem),
    severity: triggerResult.trigger_severity,
    action_recommendation_id: recommendation.action_id,
    workflow_status: "new",
    created_at: Date.now(),
    dedup_key: buildDedupKey(watchItem.watch_id, triggerResult.trigger_type),
  };
}

/**
 * LEVEL4 Phase 4: Create Workflow Object from trigger + recommendation.
 */
export function createWorkflow(
  watchItem: WatchItem,
  triggerResult: TriggerResult,
  recommendation: ActionRecommendation
): WorkflowObject {
  const now = Date.now();
  return {
    workflow_id: `wf_${now}_${Math.random().toString(36).slice(2, 6)}`,
    watch_id: watchItem.watch_id,
    trigger_id: recommendation.trigger_id,
    action_id: recommendation.action_id,
    workflow_step: "triggered",
    status: "open",
    summary: `${watchItem.primary_ticker} — ${triggerResult.trigger_type} (${triggerResult.trigger_severity}) → ${recommendation.action_type} (${recommendation.reasoning_mode} mode)`,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Advance workflow to next step.
 */
export function advanceWorkflow(
  workflow: WorkflowObject,
  nextStep: WorkflowStatus,
  summary?: string
): WorkflowObject {
  const stepToStatus: Record<WorkflowStatus, WorkflowObject["status"]> = {
    triggered: "open",
    reasoning_requested: "in_progress",
    decision_updated: "in_progress",
    resolved: "resolved",
  };
  return {
    ...workflow,
    workflow_step: nextStep,
    status: stepToStatus[nextStep],
    summary: summary ?? workflow.summary,
    updated_at: Date.now(),
  };
}

// ── Dedup / Cooldown Registry ─────────────────────────────────────────────────

export interface CooldownEntry {
  dedup_key: string;
  last_fired_at: number;
  fire_count: number;
}

export type CooldownRegistry = Map<string, CooldownEntry>;

/**
 * Default cooldown: 30 minutes per watch_id + trigger_type combination.
 */
export const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Check if an alert is within cooldown window.
 * Returns true if the alert should be suppressed.
 */
export function isInCooldown(
  dedupKey: string,
  registry: CooldownRegistry,
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): boolean {
  const entry = registry.get(dedupKey);
  if (!entry) return false;
  return Date.now() - entry.last_fired_at < cooldownMs;
}

/**
 * Record a fired alert in the cooldown registry.
 */
export function recordCooldown(
  dedupKey: string,
  registry: CooldownRegistry
): void {
  const existing = registry.get(dedupKey);
  registry.set(dedupKey, {
    dedup_key: dedupKey,
    last_fired_at: Date.now(),
    fire_count: (existing?.fire_count ?? 0) + 1,
  });
}

/**
 * Full pipeline: trigger → recommendation → alert + workflow (with cooldown check).
 * Returns null if cooldown suppresses the alert.
 */
export function processWatchTrigger(
  watchItem: WatchItem,
  triggerResult: TriggerResult,
  cooldownRegistry: CooldownRegistry,
  options?: { cooldownMs?: number }
): {
  recommendation: ActionRecommendation;
  alert: Alert | null;
  workflow: WorkflowObject | null;
  cooldown_applied: boolean;
} {
  const recommendation = generateActionRecommendation(watchItem, triggerResult);

  if (!triggerResult.trigger_fired) {
    return { recommendation, alert: null, workflow: null, cooldown_applied: false };
  }

  const dedupKey = buildDedupKey(watchItem.watch_id, triggerResult.trigger_type);
  const cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  if (isInCooldown(dedupKey, cooldownRegistry, cooldownMs)) {
    return { recommendation, alert: null, workflow: null, cooldown_applied: true };
  }

  // Record cooldown and create alert + workflow
  recordCooldown(dedupKey, cooldownRegistry);
  const alert = createAlert(watchItem, triggerResult, recommendation);
  const workflow = createWorkflow(watchItem, triggerResult, recommendation);

  return { recommendation, alert, workflow, cooldown_applied: false };
}
