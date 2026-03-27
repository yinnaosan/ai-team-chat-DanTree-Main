/**
 * DANTREE_LEVEL21 Phase 1: History Bootstrap
 *
 * Retrieves DecisionHistory records for a given ticker and user,
 * and builds a structured HistoryBootstrap object that can be injected
 * into the Level 2 reasoning loop.
 *
 * MODULE_ID: LEVEL21_HISTORY_BOOTSTRAP
 * ZERO_NEW_LLM_CALLS: true
 * NON_FATAL: all failures must never break the main pipeline
 * SOURCE: decision_history table (user-facing DecisionStrip records)
 *         NOT analysisMemory (internal analysis process memory)
 */

import { getDb } from "./db";
import { decisionHistory } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriorDecision {
  action: string;           // BUY / HOLD / WAIT / SELL
  state: string;            // DecisionStrip STATE field
  timingSignal: string;
  whySurface: string;
  whyTrend: string;
  whyHidden: string;
  cycle: string;
  source: string;           // manual / candidate / radar
  createdAt: string;        // ISO string
}

export interface HistoryBootstrap {
  has_prior_history: boolean;
  prior_decision_count: number;
  previous_action: string;          // most recent action
  previous_state: string;           // most recent state
  previous_verdict: string;         // combined surface+trend summary (≤200 chars)
  previous_key_thesis: string;      // whyTrend from most recent record
  previous_risks: string;           // whyHidden from most recent record (hidden layer)
  previous_cycle: string;           // cycle at time of last decision
  previous_timing: string;          // timingSignal from last record
  history_quality: "rich" | "single" | "none";
  // Rich context: last 3 decisions for pattern detection
  recent_decisions: PriorDecision[];
  // Action pattern: e.g. "WAIT → WAIT → BUY" or "BUY → HOLD"
  action_pattern: string;
  // Days since last decision
  days_since_last_decision: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_HISTORY_RECORDS = 3;
const DECISION_RELEVANCE_DAYS = 90; // ignore records older than 90 days

// ── Main: Build History Bootstrap ────────────────────────────────────────────

export async function buildHistoryBootstrap(params: {
  userId: number;
  ticker: string;
}): Promise<HistoryBootstrap> {
  const empty: HistoryBootstrap = {
    has_prior_history: false,
    prior_decision_count: 0,
    previous_action: "",
    previous_state: "",
    previous_verdict: "",
    previous_key_thesis: "",
    previous_risks: "",
    previous_cycle: "",
    previous_timing: "",
    history_quality: "none",
    recent_decisions: [],
    action_pattern: "",
    days_since_last_decision: null,
  };

  if (!params.ticker || params.ticker.trim() === "") return empty;

  try {
    const db = await getDb();
    if (!db) return empty;

    const normalizedTicker = params.ticker.toUpperCase().trim();
    const cutoff = new Date(Date.now() - DECISION_RELEVANCE_DAYS * 24 * 60 * 60 * 1000);

    const rows = await db
      .select()
      .from(decisionHistory)
      .where(
        and(
          eq(decisionHistory.userId, params.userId),
          eq(decisionHistory.ticker, normalizedTicker)
        )
      )
      .orderBy(desc(decisionHistory.createdAt))
      .limit(MAX_HISTORY_RECORDS);

    // Filter to relevant window (createdAt is Unix ms timestamp as number)
    const cutoffMs = cutoff.getTime();
    const relevant = rows.filter(r => (r.createdAt as number) >= cutoffMs);

    if (relevant.length === 0) return empty;

    const mostRecent = relevant[0];
    const mostRecentDate = new Date(mostRecent.createdAt as number);

    const daysSince = Math.floor(
      (Date.now() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Build recent_decisions array
    const recent_decisions: PriorDecision[] = relevant.map(r => ({
      action: r.action ?? "",
      state: r.state ?? "",
      timingSignal: r.timingSignal ?? "",
      whySurface: r.whySurface ?? "",
      whyTrend: r.whyTrend ?? "",
      whyHidden: r.whyHidden ?? "",
      cycle: r.cycle ?? "",
      source: r.source ?? "manual",
      createdAt: new Date(r.createdAt as number).toISOString(),
    }));

    // Build action pattern string (oldest → newest)
    const actionPattern = [...recent_decisions]
      .reverse()
      .map(d => d.action)
      .filter(Boolean)
      .join(" → ");

    // Previous verdict: combine surface + trend, max 200 chars
    const previousVerdict = [
      mostRecent.whySurface ?? "",
      mostRecent.whyTrend ?? "",
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 200);

    const quality: HistoryBootstrap["history_quality"] =
      relevant.length >= 2 ? "rich" : "single";

    return {
      has_prior_history: true,
      prior_decision_count: relevant.length,
      previous_action: mostRecent.action ?? "",
      previous_state: mostRecent.state ?? "",
      previous_verdict: previousVerdict,
      previous_key_thesis: (mostRecent.whyTrend ?? "").slice(0, 300),
      previous_risks: (mostRecent.whyHidden ?? "").slice(0, 300),
      previous_cycle: mostRecent.cycle ?? "",
      previous_timing: mostRecent.timingSignal ?? "",
      history_quality: quality,
      recent_decisions,
      action_pattern: actionPattern,
      days_since_last_decision: daysSince,
    };
  } catch (e) {
    // Non-fatal: history bootstrap failure must never break main pipeline
    console.error("[LEVEL21] History bootstrap failed (non-fatal):", (e as Error).message);
    return empty;
  }
}

// ── Phase 2: Build DECISION_HISTORY_CONTEXT block for LLM injection ──────────

export function buildDecisionHistoryContextBlock(bootstrap: HistoryBootstrap): string {
  if (!bootstrap.has_prior_history) return "";

  const decisionsStr = bootstrap.recent_decisions
    .map((d, i) => {
      const date = new Date(d.createdAt).toLocaleDateString("zh-CN");
      return `  [${i + 1}] ${date} | ACTION: ${d.action} | STATE: ${d.state} | CYCLE: ${d.cycle}`;
    })
    .join("\n");

  const daysSinceStr = bootstrap.days_since_last_decision !== null
    ? `${bootstrap.days_since_last_decision} days ago`
    : "unknown";

  return `[DECISION_HISTORY_CONTEXT]
TICKER: ${bootstrap.recent_decisions[0]?.action ? bootstrap.recent_decisions[0].action : ""}
PRIOR_DECISION_COUNT: ${bootstrap.prior_decision_count}
HISTORY_QUALITY: ${bootstrap.history_quality}
LAST_DECISION: ${daysSinceStr}
PREVIOUS_ACTION: ${bootstrap.previous_action}
PREVIOUS_STATE: ${bootstrap.previous_state}
PREVIOUS_CYCLE: ${bootstrap.previous_cycle}
PREVIOUS_TIMING: ${bootstrap.previous_timing}
PREVIOUS_THESIS: ${bootstrap.previous_key_thesis || "(not available)"}
PREVIOUS_HIDDEN_RISKS: ${bootstrap.previous_risks || "(not available)"}
ACTION_PATTERN: ${bootstrap.action_pattern || "(single record)"}
RECENT_DECISIONS:
${decisionsStr}
INSTRUCTION:
This user has previously made a decision on this ticker.
Step 0 — THESIS_REVALIDATION: Before proceeding with new analysis, evaluate:
  1. Is the previous thesis (${bootstrap.previous_action}) still valid given current data?
  2. What has materially changed since the last decision?
  3. Are the previous hidden risks (${bootstrap.previous_risks.slice(0, 80) || "none"}) still present or resolved?
  4. Does the action pattern (${bootstrap.action_pattern}) suggest conviction or hesitation?
Output a thesis_delta and action_delta in your reasoning before generating the final verdict.
[/DECISION_HISTORY_CONTEXT]`;
}

// ── Phase 3: Evaluate History-Aware Trigger Adjustment ───────────────────────

export interface HistoryTriggerAdjustment {
  history_requires_revalidation: boolean;
  thesis_shift_detected: boolean;
  action_reconsideration_required: boolean;
  adjustment_reason: string;
  early_stop_allowed: boolean;  // true if history strongly confirms current direction
}

export function evaluateHistoryTriggerAdjustment(
  bootstrap: HistoryBootstrap,
  currentConfidence: string,
  currentEvidenceScore: number
): HistoryTriggerAdjustment {
  if (!bootstrap.has_prior_history) {
    return {
      history_requires_revalidation: false,
      thesis_shift_detected: false,
      action_reconsideration_required: false,
      adjustment_reason: "No prior history — standard trigger logic applies",
      early_stop_allowed: false,
    };
  }

  // If last decision was recent (< 7 days) and same direction → allow early stop
  const isRecent = (bootstrap.days_since_last_decision ?? 999) < 7;
  const isHighConfidence = currentConfidence === "high";
  const isStrongEvidence = currentEvidenceScore >= 0.75;

  if (isRecent && isHighConfidence && isStrongEvidence) {
    return {
      history_requires_revalidation: false,
      thesis_shift_detected: false,
      action_reconsideration_required: false,
      adjustment_reason: `Recent decision (${bootstrap.days_since_last_decision}d ago) with high confidence — early convergence allowed`,
      early_stop_allowed: true,
    };
  }

  // If action pattern shows repeated WAIT → force revalidation
  const allWait = bootstrap.recent_decisions.every(d => d.action === "WAIT");
  if (allWait && bootstrap.prior_decision_count >= 2) {
    return {
      history_requires_revalidation: true,
      thesis_shift_detected: false,
      action_reconsideration_required: true,
      adjustment_reason: `Repeated WAIT pattern detected (${bootstrap.action_pattern}) — revalidation required to check if timing has changed`,
      early_stop_allowed: false,
    };
  }

  // If last action was BUY/SELL and current analysis might differ → flag thesis shift
  const lastAction = bootstrap.previous_action;
  const isActionableHistory = ["BUY", "SELL"].includes(lastAction);

  if (isActionableHistory && (bootstrap.days_since_last_decision ?? 999) > 14) {
    return {
      history_requires_revalidation: true,
      thesis_shift_detected: true,
      action_reconsideration_required: false,
      adjustment_reason: `Prior ${lastAction} decision was ${bootstrap.days_since_last_decision}d ago — thesis revalidation required`,
      early_stop_allowed: false,
    };
  }

  // Default: standard revalidation for any prior history
  return {
    history_requires_revalidation: true,
    thesis_shift_detected: false,
    action_reconsideration_required: false,
    adjustment_reason: `Prior history exists (${bootstrap.prior_decision_count} record(s), pattern: ${bootstrap.action_pattern}) — Step 0 revalidation injected`,
    early_stop_allowed: false,
  };
}

// ── Phase 4: Build Thesis Delta + Action Delta ────────────────────────────────

export type ChangeType =
  | "unchanged"
  | "strengthened"
  | "weakened"
  | "invalidated"
  | "reversed";

export interface ThesisDelta {
  change_type: ChangeType;
  previous_thesis: string;
  current_thesis_summary: string;
  what_changed: string;
  confidence_delta: string;  // e.g. "medium → high" or "unchanged"
}

export interface ActionDelta {
  change_type: ChangeType;
  previous_action: string;
  current_action: string;
  reconsideration_trigger: string;
  days_elapsed: number | null;
}

/**
 * Build thesis and action delta objects from bootstrap + current output.
 * Called after Level 2 loop completes, before finalConvergedOutput is assembled.
 */
export function buildDeltaObjects(params: {
  bootstrap: HistoryBootstrap;
  currentAction: string;
  currentVerdict: string;
  currentConfidence: string;
  previousConfidence?: string;
}): { thesis_delta: ThesisDelta; action_delta: ActionDelta } {
  const {
    bootstrap,
    currentAction,
    currentVerdict,
    currentConfidence,
    previousConfidence,
  } = params;

  if (!bootstrap.has_prior_history) {
    return {
      thesis_delta: {
        change_type: "unchanged",
        previous_thesis: "",
        current_thesis_summary: currentVerdict.slice(0, 200),
        what_changed: "No prior history — first analysis",
        confidence_delta: currentConfidence,
      },
      action_delta: {
        change_type: "unchanged",
        previous_action: "",
        current_action: currentAction,
        reconsideration_trigger: "First analysis — no prior action",
        days_elapsed: null,
      },
    };
  }

  // Determine action change type
  let actionChangeType: ChangeType = "unchanged";
  if (bootstrap.previous_action !== currentAction) {
    const reversals: Record<string, string> = {
      BUY: "SELL",
      SELL: "BUY",
      HOLD: "SELL",
    };
    if (reversals[bootstrap.previous_action] === currentAction) {
      actionChangeType = "reversed";
    } else if (bootstrap.previous_action === "WAIT" && currentAction === "BUY") {
      actionChangeType = "strengthened";
    } else if (bootstrap.previous_action === "BUY" && currentAction === "WAIT") {
      actionChangeType = "weakened";
    } else {
      actionChangeType = "weakened";
    }
  }

  // Determine thesis change type
  let thesisChangeType: ChangeType = "unchanged";
  if (actionChangeType === "reversed") {
    thesisChangeType = "invalidated";
  } else if (actionChangeType === "strengthened") {
    thesisChangeType = "strengthened";
  } else if (actionChangeType === "weakened") {
    thesisChangeType = "weakened";
  }

  const confidenceDelta = previousConfidence && previousConfidence !== currentConfidence
    ? `${previousConfidence} → ${currentConfidence}`
    : currentConfidence;

  return {
    thesis_delta: {
      change_type: thesisChangeType,
      previous_thesis: bootstrap.previous_verdict.slice(0, 200),
      current_thesis_summary: currentVerdict.slice(0, 200),
      what_changed: actionChangeType !== "unchanged"
        ? `Action changed from ${bootstrap.previous_action} to ${currentAction}`
        : "Thesis maintained with updated evidence",
      confidence_delta: confidenceDelta,
    },
    action_delta: {
      change_type: actionChangeType,
      previous_action: bootstrap.previous_action,
      current_action: currentAction,
      reconsideration_trigger: actionChangeType !== "unchanged"
        ? `Action shifted after ${bootstrap.days_since_last_decision ?? "?"} days`
        : `Action confirmed after ${bootstrap.days_since_last_decision ?? "?"} days`,
      days_elapsed: bootstrap.days_since_last_decision,
    },
  };
}
