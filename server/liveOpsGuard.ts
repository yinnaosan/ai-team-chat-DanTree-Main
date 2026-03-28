/**
 * DANTREE LEVEL5.1 — Live Ops Guard
 * Phase 5: Rolling protection and failsafe
 * Phase 6: Minimum operational view (tRPC ops summary)
 *
 * NON-NEGOTIABLE:
 * - auto_trade_allowed = ALWAYS false
 * - kill switch overrides ALL other config
 * - auto-failsafe triggers on consecutive run failures
 * - shadow_mode is the safe fallback state
 */

import {
  getHealthSummary,
  computeRunStats,
  getLastRun,
  getRunLog,
  type HealthStatus,
} from "./sourceHealthMonitor";
import {
  getLiveOpsConfig,
  isCronRunning,
  stopCronScheduler,
  type SchedulerMode,
} from "./liveOpsScheduler";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GuardDecision = "allow" | "shadow_only" | "block";

export interface GuardState {
  kill_switch_active: boolean;
  kill_switch_reason: string | null;
  kill_switch_activated_at: number | null;
  auto_failsafe_active: boolean;
  auto_failsafe_reason: string | null;
  auto_failsafe_triggered_at: number | null;
  /** Effective mode after guard evaluation */
  effective_mode: SchedulerMode;
  /** Whether cron is currently running */
  cron_running: boolean;
}

export interface GuardEvalResult {
  decision: GuardDecision;
  reason: string;
  effective_mode: SchedulerMode;
  kill_switch_active: boolean;
  auto_failsafe_active: boolean;
  checks_passed: string[];
  checks_failed: string[];
}

export interface OpsSummary {
  guard: GuardState;
  health: ReturnType<typeof getHealthSummary>;
  stats: ReturnType<typeof computeRunStats>;
  last_run: ReturnType<typeof getLastRun>;
  recent_runs: ReturnType<typeof getRunLog>;
  config_snapshot: {
    cron_enabled: boolean;
    cron_expression: string;
    default_mode: SchedulerMode;
    max_watches_per_run: number;
    primary_source: string;
    fallback_chain: string[];
    enable_feedback_loop: boolean;
  };
  generated_at: number;
}

// ─── Guard State ──────────────────────────────────────────────────────────────

const AUTO_FAILSAFE_THRESHOLD = 3; // consecutive run failures → auto-failsafe

let _guardState: GuardState = {
  kill_switch_active: false,
  kill_switch_reason: null,
  kill_switch_activated_at: null,
  auto_failsafe_active: false,
  auto_failsafe_reason: null,
  auto_failsafe_triggered_at: null,
  effective_mode: "shadow",
  cron_running: false,
};

// ─── Kill Switch ──────────────────────────────────────────────────────────────

/**
 * Activate the kill switch. Immediately stops cron and forces shadow mode.
 * This is the highest-priority override — cannot be bypassed.
 */
export function activateKillSwitch(reason: string): void {
  _guardState.kill_switch_active = true;
  _guardState.kill_switch_reason = reason;
  _guardState.kill_switch_activated_at = Date.now();
  _guardState.effective_mode = "shadow";
  // Stop cron if running
  if (isCronRunning()) {
    stopCronScheduler();
  }
}

/**
 * Deactivate the kill switch. Requires explicit operator action.
 */
export function deactivateKillSwitch(): void {
  _guardState.kill_switch_active = false;
  _guardState.kill_switch_reason = null;
  _guardState.kill_switch_activated_at = null;
  _updateEffectiveMode();
}

// ─── Auto-Failsafe ────────────────────────────────────────────────────────────

/**
 * Check and trigger auto-failsafe based on health summary.
 * Called after each run to evaluate whether to force shadow mode.
 */
export function checkAndTriggerFailsafe(): boolean {
  const health = getHealthSummary();
  const consecutiveFailures = health.consecutive_run_failures;

  if (consecutiveFailures >= AUTO_FAILSAFE_THRESHOLD) {
    if (!_guardState.auto_failsafe_active) {
      _guardState.auto_failsafe_active = true;
      _guardState.auto_failsafe_reason = `${consecutiveFailures} consecutive run failures exceeded threshold (${AUTO_FAILSAFE_THRESHOLD})`;
      _guardState.auto_failsafe_triggered_at = Date.now();
      _updateEffectiveMode();
    }
    return true;
  }

  // Clear failsafe if runs are healthy again
  if (_guardState.auto_failsafe_active && consecutiveFailures === 0) {
    _guardState.auto_failsafe_active = false;
    _guardState.auto_failsafe_reason = null;
    _guardState.auto_failsafe_triggered_at = null;
    _updateEffectiveMode();
  }

  return false;
}

/**
 * Manually clear the auto-failsafe (operator override).
 */
export function clearAutoFailsafe(): void {
  _guardState.auto_failsafe_active = false;
  _guardState.auto_failsafe_reason = null;
  _guardState.auto_failsafe_triggered_at = null;
  _updateEffectiveMode();
}

// ─── Guard Evaluation ─────────────────────────────────────────────────────────

function _updateEffectiveMode(): void {
  if (_guardState.kill_switch_active || _guardState.auto_failsafe_active) {
    _guardState.effective_mode = "shadow";
  } else {
    const cfg = getLiveOpsConfig();
    _guardState.effective_mode = cfg.cron.default_mode;
  }
  _guardState.cron_running = isCronRunning();
}

/**
 * Evaluate whether a run should proceed, be forced to shadow, or be blocked.
 */
export function evaluateGuard(
  requestedMode: SchedulerMode = "shadow"
): GuardEvalResult {
  const checksPassed: string[] = [];
  const checksFailed: string[] = [];

  // Check 1: Kill switch
  if (_guardState.kill_switch_active) {
    checksFailed.push(
      `kill_switch: ${_guardState.kill_switch_reason ?? "activated"}`
    );
    return {
      decision: "shadow_only",
      reason: `Kill switch active: ${_guardState.kill_switch_reason}`,
      effective_mode: "shadow",
      kill_switch_active: true,
      auto_failsafe_active: _guardState.auto_failsafe_active,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
    };
  }
  checksPassed.push("kill_switch: inactive");

  // Check 2: Auto-failsafe
  if (_guardState.auto_failsafe_active) {
    checksFailed.push(
      `auto_failsafe: ${_guardState.auto_failsafe_reason ?? "triggered"}`
    );
    return {
      decision: "shadow_only",
      reason: `Auto-failsafe active: ${_guardState.auto_failsafe_reason}`,
      effective_mode: "shadow",
      kill_switch_active: false,
      auto_failsafe_active: true,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
    };
  }
  checksPassed.push("auto_failsafe: inactive");

  // Check 3: Source health
  const health = getHealthSummary();
  if (health.overall_status === "failing") {
    checksFailed.push("source_health: all sources failing");
    return {
      decision: "shadow_only",
      reason: "All data sources are in failing state",
      effective_mode: "shadow",
      kill_switch_active: false,
      auto_failsafe_active: false,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
    };
  }
  checksPassed.push(`source_health: ${health.overall_status}`);

  // All checks passed — allow with effective mode
  const effectiveMode: SchedulerMode =
    requestedMode === "live" ? "live" : "shadow";

  return {
    decision: "allow",
    reason: "All guard checks passed",
    effective_mode: effectiveMode,
    kill_switch_active: false,
    auto_failsafe_active: false,
    checks_passed: checksPassed,
    checks_failed: checksFailed,
  };
}

/**
 * Get current guard state snapshot.
 */
export function getGuardState(): GuardState {
  _updateEffectiveMode();
  return { ..._guardState };
}

/**
 * Reset guard state (for testing).
 */
export function resetGuardState(): void {
  _guardState = {
    kill_switch_active: false,
    kill_switch_reason: null,
    kill_switch_activated_at: null,
    auto_failsafe_active: false,
    auto_failsafe_reason: null,
    auto_failsafe_triggered_at: null,
    effective_mode: "shadow",
    cron_running: false,
  };
}

// ─── Ops Summary ──────────────────────────────────────────────────────────────

/**
 * Build the minimum operational view for the tRPC ops summary endpoint.
 */
export function buildOpsSummary(recentRunsLimit = 5): OpsSummary {
  _updateEffectiveMode();
  const cfg = getLiveOpsConfig();

  return {
    guard: getGuardState(),
    health: getHealthSummary(),
    stats: computeRunStats(),
    last_run: getLastRun(),
    recent_runs: getRunLog(recentRunsLimit),
    config_snapshot: {
      cron_enabled: cfg.cron.enabled,
      cron_expression: cfg.cron.cron_expression,
      default_mode: cfg.cron.default_mode,
      max_watches_per_run: cfg.cron.max_watches_per_run,
      primary_source: cfg.source_routing.primary_source,
      fallback_chain: cfg.source_routing.fallback_chain,
      enable_feedback_loop: cfg.enable_feedback_loop,
    },
    generated_at: Date.now(),
  };
}

/**
 * Determine if the system is in a safe-to-run state for live mode.
 */
export function isSafeForLiveRun(): boolean {
  const result = evaluateGuard("live");
  return result.decision === "allow" && result.effective_mode === "live";
}

/**
 * Determine if the system is in a safe-to-run state for shadow mode.
 */
export function isSafeForShadowRun(): boolean {
  const result = evaluateGuard("shadow");
  return result.decision !== "block";
}

// ─── Health Status Helpers ────────────────────────────────────────────────────

export function isHealthy(status: HealthStatus): boolean {
  return status === "healthy";
}

export function isDegraded(status: HealthStatus): boolean {
  return status === "degraded";
}

export function isFailing(status: HealthStatus): boolean {
  return status === "failing";
}
