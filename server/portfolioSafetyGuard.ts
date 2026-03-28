/**
 * DANTREE LEVEL7 — Phase 7
 * Anti-Overfit & Decision Safety Guards
 *
 * Prevents the decision engine from over-fitting to recent signals,
 * churning positions, or generating conflicting advisory outputs.
 *
 * ADVISORY ONLY — no auto-trade, no order generation.
 */

import type { FusionDecision } from "./portfolioState";
import type { RankedDecision } from "./portfolioDecisionRanker";

// ─────────────────────────────────────────────────────────────────────────────
// Guard 1: Churn Prevention
// Suppress INITIATE/ADD/TRIM/EXIT if the same ticker was actioned recently
// ─────────────────────────────────────────────────────────────────────────────

export interface RecentAction {
  ticker: string;
  action_label: string;
  actioned_at_ms: number;
}

export interface ChurnGuardConfig {
  min_cooldown_ms: number;   // default 48h
}

export const DEFAULT_CHURN_GUARD_CONFIG: ChurnGuardConfig = {
  min_cooldown_ms: 48 * 60 * 60 * 1000, // 48 hours
};

export function applyChurnGuard(
  ranked: RankedDecision[],
  recent_actions: RecentAction[],
  config: ChurnGuardConfig = DEFAULT_CHURN_GUARD_CONFIG
): RankedDecision[] {
  const now = Date.now();
  const recentMap = new Map<string, RecentAction>();
  for (const a of recent_actions) {
    const existing = recentMap.get(a.ticker);
    if (!existing || a.actioned_at_ms > existing.actioned_at_ms) {
      recentMap.set(a.ticker, a);
    }
  }

  return ranked.map(r => {
    const last = recentMap.get(r.ticker);
    if (!last) return r;
    const age = now - last.actioned_at_ms;
    if (age < config.min_cooldown_ms) {
      const actionable = ["INITIATE", "ADD", "TRIM", "EXIT"];
      if (actionable.includes(r.action_label)) {
        return {
          ...r,
          action_label: "MONITOR" as const,
          sizing_note_override: `Churn guard: last action was ${last.action_label} ${Math.round(age / 3600000)}h ago — cooldown active`,
        } as RankedDecision & { sizing_note_override?: string };
      }
    }
    return r;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard 2: Overfit Detection
// Flag tickers where the signal has been consistently high for too many
// consecutive cycles without any outcome resolution (stale alpha)
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalHistoryEntry {
  ticker: string;
  fusion_score: number;
  evaluated_at_ms: number;
}

export interface OverfitGuardConfig {
  max_consecutive_high_cycles: number;  // default 5
  high_score_threshold: number;         // default 0.65
  lookback_window_ms: number;           // default 7 days
}

export const DEFAULT_OVERFIT_GUARD_CONFIG: OverfitGuardConfig = {
  max_consecutive_high_cycles: 5,
  high_score_threshold: 0.65,
  lookback_window_ms: 7 * 24 * 60 * 60 * 1000,
};

export interface OverfitFlag {
  ticker: string;
  consecutive_high_cycles: number;
  flag_reason: string;
}

export function detectOverfitFlags(
  decisions: FusionDecision[],
  signal_history: SignalHistoryEntry[],
  config: OverfitGuardConfig = DEFAULT_OVERFIT_GUARD_CONFIG
): OverfitFlag[] {
  const now = Date.now();
  const cutoff = now - config.lookback_window_ms;
  const flags: OverfitFlag[] = [];

  for (const d of decisions) {
    const history = signal_history
      .filter(h => h.ticker === d.ticker && h.evaluated_at_ms >= cutoff)
      .sort((a, b) => b.evaluated_at_ms - a.evaluated_at_ms);

    let consecutive = 0;
    for (const h of history) {
      if (h.fusion_score >= config.high_score_threshold) {
        consecutive++;
      } else {
        break;
      }
    }

    if (consecutive >= config.max_consecutive_high_cycles) {
      flags.push({
        ticker: d.ticker,
        consecutive_high_cycles: consecutive,
        flag_reason: `Signal has been consistently high (≥${config.high_score_threshold}) for ${consecutive} consecutive cycles — possible overfit`,
      });
    }
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard 3: Conflict Resolution
// If two tickers in the same thesis cluster have opposing action labels
// (one INITIATE, one EXIT), flag as conflicted and downgrade both to RECHECK
// ─────────────────────────────────────────────────────────────────────────────

export interface ConflictFlag {
  ticker_a: string;
  ticker_b: string;
  action_a: string;
  action_b: string;
  conflict_reason: string;
}

export function detectDecisionConflicts(
  ranked: RankedDecision[]
): ConflictFlag[] {
  const conflicts: ConflictFlag[] = [];
  const opposing_pairs: Array<[string, string]> = [
    ["INITIATE", "EXIT"],
    ["ADD", "EXIT"],
    ["INITIATE", "AVOID"],
    ["ADD", "AVOID"],
    ["INITIATE", "TRIM"],  // Building new position while trimming another in same session
    ["ADD", "TRIM"],       // Adding to one while trimming another — directional conflict
  ];

  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const a = ranked[i];
      const b = ranked[j];
      for (const [la, lb] of opposing_pairs) {
        if (
          (a.action_label === la && b.action_label === lb) ||
          (a.action_label === lb && b.action_label === la)
        ) {
          conflicts.push({
            ticker_a: a.ticker,
            ticker_b: b.ticker,
            action_a: a.action_label,
            action_b: b.action_label,
            conflict_reason: `Opposing actions detected: ${a.ticker}=${a.action_label} vs ${b.ticker}=${b.action_label}`,
          });
        }
      }
    }
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard 4: Minimum Sample Enforcement
// Any decision with sample_count < min_required is downgraded to MONITOR
// ─────────────────────────────────────────────────────────────────────────────

export interface SampleEnforcementConfig {
  min_required_for_action: number;  // default 5
}

export const DEFAULT_SAMPLE_ENFORCEMENT_CONFIG: SampleEnforcementConfig = {
  min_required_for_action: 5,
};

export function applySampleEnforcement(
  ranked: RankedDecision[],
  sample_counts: Map<string, number>,
  config: SampleEnforcementConfig = DEFAULT_SAMPLE_ENFORCEMENT_CONFIG
): RankedDecision[] {
  const actionable = ["INITIATE", "ADD", "TRIM", "EXIT"];
  return ranked.map(r => {
    const count = sample_counts.get(r.ticker) ?? 0;
    if (count < config.min_required_for_action && actionable.includes(r.action_label)) {
      return {
        ...r,
        action_label: "MONITOR" as const,
      };
    }
    return r;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 Composite Safety Report
// ─────────────────────────────────────────────────────────────────────────────

export interface SafetyReport {
  churn_suppressed_count: number;
  overfit_flags: OverfitFlag[];
  conflict_flags: ConflictFlag[];
  sample_enforcement_count: number;
  overall_safety_status: "clean" | "flagged" | "critical";
  advisory_only: true;
}

export function buildSafetyReport(
  original_ranked: RankedDecision[],
  guarded_ranked: RankedDecision[],
  overfit_flags: OverfitFlag[],
  conflict_flags: ConflictFlag[]
): SafetyReport {
  const actionable = ["INITIATE", "ADD", "TRIM", "EXIT"];

  const churn_suppressed_count = original_ranked.filter((r, i) =>
    actionable.includes(r.action_label) &&
    !actionable.includes(guarded_ranked[i]?.action_label ?? "")
  ).length;

  const sample_enforcement_count = original_ranked.filter((r, i) =>
    actionable.includes(r.action_label) &&
    guarded_ranked[i]?.action_label === "MONITOR"
  ).length - churn_suppressed_count;

  const overall_safety_status =
    conflict_flags.length >= 2 || overfit_flags.length >= 3 ? "critical" :
    conflict_flags.length >= 1 || overfit_flags.length >= 1 || churn_suppressed_count >= 1 ? "flagged" :
    "clean";

  return {
    churn_suppressed_count: Math.max(0, churn_suppressed_count),
    overfit_flags,
    conflict_flags,
    sample_enforcement_count: Math.max(0, sample_enforcement_count),
    overall_safety_status,
    advisory_only: true,
  };
}
