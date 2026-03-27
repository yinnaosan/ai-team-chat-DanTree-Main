/**
 * DANTREE LEVEL4 — Execution Layer
 * Phase 6: Cost Safety + Rate Limits
 *
 * NON-NEGOTIABLE RULES:
 * 1. NO auto-trading or real order placement — EVER.
 * 2. Evaluation cap prevents runaway LLM costs.
 * 3. Cooldown per watch item prevents alert spam.
 * 4. Deep reasoning mode is gated behind severity threshold.
 * 5. All safety decisions are logged and auditable.
 */

import type { TriggerSeverity } from "./watchlistEngine";
import type { ReasoningMode } from "./actionRecommendationEngine";

// ── Cost Safety Configuration ─────────────────────────────────────────────────

export interface CostSafetyConfig {
  /** Maximum number of watch evaluations per hour per user */
  max_evaluations_per_hour: number;
  /** Maximum number of deep reasoning calls per day per user */
  max_deep_reasoning_per_day: number;
  /** Maximum number of standard reasoning calls per day per user */
  max_standard_reasoning_per_day: number;
  /** Minimum severity required to trigger deep reasoning */
  deep_reasoning_min_severity: TriggerSeverity;
  /** Minimum severity required to trigger standard reasoning */
  standard_reasoning_min_severity: TriggerSeverity;
  /** Cooldown in ms between same trigger type on same watch item */
  trigger_cooldown_ms: number;
  /** Whether auto-trading is allowed (ALWAYS false) */
  auto_trade_allowed: false;
}

export const DEFAULT_COST_SAFETY_CONFIG: CostSafetyConfig = {
  max_evaluations_per_hour: 60,
  max_deep_reasoning_per_day: 10,
  max_standard_reasoning_per_day: 50,
  deep_reasoning_min_severity: "high",
  standard_reasoning_min_severity: "medium",
  trigger_cooldown_ms: 30 * 60 * 1000,  // 30 minutes
  auto_trade_allowed: false,
};

// ── Rate Limit Counters ───────────────────────────────────────────────────────

export interface RateLimitCounters {
  user_id: string;
  evaluations_this_hour: number;
  evaluations_hour_start: number;  // UTC ms
  deep_reasoning_today: number;
  standard_reasoning_today: number;
  day_start: number;  // UTC ms
}

export function createRateLimitCounters(userId: string): RateLimitCounters {
  const now = Date.now();
  return {
    user_id: userId,
    evaluations_this_hour: 0,
    evaluations_hour_start: now,
    deep_reasoning_today: 0,
    standard_reasoning_today: 0,
    day_start: now,
  };
}

/**
 * Reset hourly counter if the hour has passed.
 */
function maybeResetHourly(counters: RateLimitCounters): RateLimitCounters {
  const now = Date.now();
  if (now - counters.evaluations_hour_start >= 60 * 60 * 1000) {
    return {
      ...counters,
      evaluations_this_hour: 0,
      evaluations_hour_start: now,
    };
  }
  return counters;
}

/**
 * Reset daily counters if the day has passed.
 */
function maybeResetDaily(counters: RateLimitCounters): RateLimitCounters {
  const now = Date.now();
  if (now - counters.day_start >= 24 * 60 * 60 * 1000) {
    return {
      ...counters,
      deep_reasoning_today: 0,
      standard_reasoning_today: 0,
      day_start: now,
    };
  }
  return counters;
}

// ── Safety Decision ───────────────────────────────────────────────────────────

export type SafetyDecisionCode =
  | "allowed"
  | "blocked_auto_trade"          // auto-trade attempt — always blocked
  | "blocked_evaluation_cap"      // hourly evaluation cap exceeded
  | "blocked_deep_reasoning_cap"  // daily deep reasoning cap exceeded
  | "blocked_standard_reasoning_cap" // daily standard reasoning cap exceeded
  | "blocked_severity_too_low"    // severity below minimum for this reasoning mode
  | "downgraded_reasoning_mode";  // deep → standard due to cap

export interface SafetyDecision {
  allowed: boolean;
  decision_code: SafetyDecisionCode;
  reasoning_mode_final: ReasoningMode;
  reason: string;
  counters_after: RateLimitCounters;
}

/**
 * LEVEL4 Phase 6: Evaluate whether a reasoning call is safe to proceed.
 * Returns a SafetyDecision with final reasoning mode (may be downgraded).
 * Mutates counters in place.
 */
export function evaluateSafety(
  userId: string,
  requestedReasoningMode: ReasoningMode,
  triggerSeverity: TriggerSeverity,
  counters: RateLimitCounters,
  config: CostSafetyConfig = DEFAULT_COST_SAFETY_CONFIG
): SafetyDecision {
  // Rule 0: Auto-trade is ALWAYS blocked
  // (This check is here for defense-in-depth — the action engine never sets auto-trade)
  if ((config as { auto_trade_allowed: boolean }).auto_trade_allowed === true) {
    return {
      allowed: false,
      decision_code: "blocked_auto_trade",
      reasoning_mode_final: requestedReasoningMode,
      reason: "Auto-trading is permanently disabled in DANTREE",
      counters_after: counters,
    };
  }

  // Reset stale counters
  let c = maybeResetHourly(counters);
  c = maybeResetDaily(c);

  // Rule 1: Hourly evaluation cap
  if (c.evaluations_this_hour >= config.max_evaluations_per_hour) {
    return {
      allowed: false,
      decision_code: "blocked_evaluation_cap",
      reasoning_mode_final: requestedReasoningMode,
      reason: `Hourly evaluation cap reached (${config.max_evaluations_per_hour}/hr) for user ${userId}`,
      counters_after: c,
    };
  }

  // Severity → minimum mode check
  const severityOrder: Record<TriggerSeverity, number> = {
    low: 0, medium: 1, high: 2, critical: 3,
  };
  const deepMinOrder = severityOrder[config.deep_reasoning_min_severity];
  const standardMinOrder = severityOrder[config.standard_reasoning_min_severity];
  const currentSeverityOrder = severityOrder[triggerSeverity];

  let finalMode = requestedReasoningMode;

  // Rule 2: Deep reasoning requires minimum severity
  if (finalMode === "deep" && currentSeverityOrder < deepMinOrder) {
    // Downgrade to standard
    finalMode = "standard";
  }

  // Rule 3: Standard reasoning requires minimum severity
  if (finalMode === "standard" && currentSeverityOrder < standardMinOrder) {
    // Downgrade to quick
    finalMode = "quick";
  }

  // Rule 4: Deep reasoning daily cap
  if (finalMode === "deep" && c.deep_reasoning_today >= config.max_deep_reasoning_per_day) {
    // Downgrade to standard
    finalMode = "standard";
    if (c.standard_reasoning_today >= config.max_standard_reasoning_per_day) {
      // Downgrade to quick
      finalMode = "quick";
    }
  }

  // Rule 5: Standard reasoning daily cap
  if (finalMode === "standard" && c.standard_reasoning_today >= config.max_standard_reasoning_per_day) {
    finalMode = "quick";
  }

  // Increment counters
  c = { ...c, evaluations_this_hour: c.evaluations_this_hour + 1 };
  if (finalMode === "deep") {
    c = { ...c, deep_reasoning_today: c.deep_reasoning_today + 1 };
  } else if (finalMode === "standard") {
    c = { ...c, standard_reasoning_today: c.standard_reasoning_today + 1 };
  }

  const wasDowngraded = finalMode !== requestedReasoningMode;

  return {
    allowed: true,
    decision_code: wasDowngraded ? "downgraded_reasoning_mode" : "allowed",
    reasoning_mode_final: finalMode,
    reason: wasDowngraded
      ? `Reasoning mode downgraded from ${requestedReasoningMode} to ${finalMode} (cap or severity constraint)`
      : `Allowed — ${finalMode} reasoning for ${triggerSeverity} severity trigger`,
    counters_after: c,
  };
}

/**
 * Quick check: is deep reasoning allowed for this severity?
 * Useful for pre-flight checks without mutating counters.
 */
export function isDeepReasoningAllowed(
  triggerSeverity: TriggerSeverity,
  config: CostSafetyConfig = DEFAULT_COST_SAFETY_CONFIG
): boolean {
  const severityOrder: Record<TriggerSeverity, number> = {
    low: 0, medium: 1, high: 2, critical: 3,
  };
  return severityOrder[triggerSeverity] >= severityOrder[config.deep_reasoning_min_severity];
}

/**
 * Get a human-readable safety status summary.
 */
export function getSafetySummary(
  counters: RateLimitCounters,
  config: CostSafetyConfig = DEFAULT_COST_SAFETY_CONFIG
): {
  evaluations_remaining_this_hour: number;
  deep_reasoning_remaining_today: number;
  standard_reasoning_remaining_today: number;
  auto_trade_allowed: false;
} {
  const c = maybeResetHourly(maybeResetDaily(counters));
  return {
    evaluations_remaining_this_hour: Math.max(
      0, config.max_evaluations_per_hour - c.evaluations_this_hour
    ),
    deep_reasoning_remaining_today: Math.max(
      0, config.max_deep_reasoning_per_day - c.deep_reasoning_today
    ),
    standard_reasoning_remaining_today: Math.max(
      0, config.max_standard_reasoning_per_day - c.standard_reasoning_today
    ),
    auto_trade_allowed: false,
  };
}
