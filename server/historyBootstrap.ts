/**
 * DANTREE_LEVEL21 History Bootstrap
 *
 * LEVEL21 (original): history → prompt context → GPT-aware output
 * LEVEL21B (this file): history → loop controller → forced Step0 → path control → delta-driven stop
 *
 * MODULE_ID: LEVEL21B_HISTORY_CONTROL_BOOTSTRAP
 * ZERO_NEW_LLM_CALLS: true
 * NON_FATAL: all failures must never break the main pipeline
 * SOURCE: decision_history table (user-facing DecisionStrip records)
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

/**
 * LEVEL21B: Extended HistoryBootstrap with control fields.
 * These fields are consumed by the loop controller, not just injected into prompts.
 */
export interface HistoryBootstrap {
  // ── Factual fields (LEVEL21 original) ─────────────────────────────────────
  has_prior_history: boolean;
  prior_decision_count: number;
  previous_action: string;          // most recent action
  previous_state: string;           // most recent state
  previous_verdict: string;         // combined surface+trend summary (≤200 chars)
  previous_key_thesis: string;      // whyTrend from most recent record
  previous_risks: string;           // whyHidden from most recent record (hidden layer)
  previous_cycle: string;           // cycle at time of last decision
  previous_timing: string;          // timingSignal from last record
  previous_confidence: string;      // LEVEL21B: confidence at last decision (derived from state)
  history_quality: "rich" | "single" | "none";
  recent_decisions: PriorDecision[];
  action_pattern: string;           // e.g. "WAIT → WAIT → BUY"
  days_since_last_decision: number | null;

  // ── LEVEL21B: Control flags (consumed by loop controller) ─────────────────
  history_requires_control: boolean;     // true → history must alter loop behavior
  revalidation_mandatory: boolean;       // true → Step0 must be created before loop
  preferred_probe_order: string[];       // ordered probe types based on prior action
  history_control_reason: string;        // why control was activated (or not)
  // ── LEVEL3: Memory influence fields ──────────────────────────────────────
  memory_injected: boolean;
  memory_record_count: number;
  memory_influence_summary: string;
  memory_context_block: import('./memoryEngine').MemoryContextBlock | null;
  memory_influence: import('./memoryEngine').MemoryInfluence | null;
}

// ── Step0 Revalidation Object ─────────────────────────────────────────────────

export interface Step0Revalidation {
  step_type: "thesis_revalidation";
  objective: string;
  trigger_reason: string;
  previous_action: string;
  previous_thesis: string;
  revalidation_focus: string[];    // probe types to prioritize
  fields_needed: string[];         // data fields to gather
  continue_recommended: boolean;
  ran: boolean;                    // whether Step0 was actually executed
}

// ── History Control Trace ─────────────────────────────────────────────────────

export interface HistoryControlSummary {
  has_prior_history: boolean;
  revalidation_mandatory: boolean;
  previous_action: string;
  current_action: string;
  thesis_changed: boolean;
  action_changed: boolean;
  change_type: string;
  controller_path: string[];       // e.g. ["history_bootstrap","step0_revalidation","risk_probe","stop"]
  summary_line: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_HISTORY_RECORDS = 3;
const DECISION_RELEVANCE_DAYS = 90;

// Probe routing table by prior action
const PROBE_ROUTING_TABLE: Record<string, string[]> = {
  BUY:  ["risk_probe", "valuation_probe", "thesis_update"],
  SELL: ["business_probe", "reversal_check", "thesis_update"],
  HOLD: ["valuation_probe", "catalyst_check", "thesis_update"],
  WAIT: ["trigger_condition_check", "valuation_probe", "thesis_update"],
};

// Revalidation focus by prior action (for Step0)
const REVALIDATION_FOCUS_TABLE: Record<string, string[]> = {
  BUY:  ["risk_probe", "valuation_probe"],
  SELL: ["reversal_check", "business_probe"],
  HOLD: ["catalyst_check", "valuation_probe"],
  WAIT: ["trigger_condition_check"],
};

// Fields needed by prior action
const FIELDS_NEEDED_TABLE: Record<string, string[]> = {
  BUY:  ["current_price", "valuation_metrics", "risk_factors", "earnings_update"],
  SELL: ["price_recovery", "business_fundamentals", "reversal_signals"],
  HOLD: ["catalyst_events", "valuation_change", "earnings_update"],
  WAIT: ["trigger_conditions", "price_level", "volume_signals"],
};

// ── Main: Build History Bootstrap ────────────────────────────────────────────

export async function buildHistoryBootstrap(params: {
  userId: number;
  ticker: string;
  currentQuery?: string;   // LEVEL21B: used for revalidation_mandatory detection
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
    previous_confidence: "",
    history_quality: "none",
    recent_decisions: [],
    action_pattern: "",
    days_since_last_decision: null,
    history_requires_control: false,
    revalidation_mandatory: false,
    preferred_probe_order: [],
    history_control_reason: "No prior history — standard loop applies",
    memory_injected: false,
    memory_record_count: 0,
    memory_influence_summary: "no_memory",
    memory_context_block: null,
    memory_influence: null,
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

    const cutoffMs = cutoff.getTime();
    const relevant = rows.filter(r => (r.createdAt as number) >= cutoffMs);

    if (relevant.length === 0) return empty;

    const mostRecent = relevant[0];
    const mostRecentDate = new Date(mostRecent.createdAt as number);
    const daysSince = Math.floor(
      (Date.now() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24)
    );

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

    const actionPattern = [...recent_decisions]
      .reverse()
      .map(d => d.action)
      .filter(Boolean)
      .join(" → ");

    const previousVerdict = [
      mostRecent.whySurface ?? "",
      mostRecent.whyTrend ?? "",
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 200);

    const quality: HistoryBootstrap["history_quality"] =
      relevant.length >= 2 ? "rich" : "single";

    const previousAction = mostRecent.action ?? "";

    // ── LEVEL21B: Compute control flags ──────────────────────────────────────

    const controlFlags = computeControlFlags({
      previousAction,
      daysSince,
      quality,
      currentQuery: params.currentQuery ?? "",
      actionPattern,
      priorDecisionCount: relevant.length,
    });

    return {
      has_prior_history: true,
      prior_decision_count: relevant.length,
      previous_action: previousAction,
      previous_state: mostRecent.state ?? "",
      previous_verdict: previousVerdict,
      previous_key_thesis: (mostRecent.whyTrend ?? "").slice(0, 300),
      previous_risks: (mostRecent.whyHidden ?? "").slice(0, 300),
      previous_cycle: mostRecent.cycle ?? "",
      previous_timing: mostRecent.timingSignal ?? "",
      previous_confidence: deriveConfidenceFromState(mostRecent.state ?? ""),
      history_quality: quality,
      recent_decisions,
      action_pattern: actionPattern,
      days_since_last_decision: daysSince,
      ...controlFlags,
      // LEVEL3: memory fields — populated externally by attachMemoryToBootstrap()
      memory_injected: false,
      memory_record_count: 0,
      memory_influence_summary: "pending",
      memory_context_block: null,
      memory_influence: null,
    };
  } catch (e) {
    console.error("[LEVEL21B] History bootstrap failed (non-fatal):", (e as Error).message);
    return empty;
  }
}

// ── Control Flag Computation ──────────────────────────────────────────────────

export function computeControlFlags(params: {
  previousAction: string;
  daysSince: number;
  quality: "rich" | "single" | "none";
  currentQuery: string;
  actionPattern: string;
  priorDecisionCount: number;
}): {
  history_requires_control: boolean;
  revalidation_mandatory: boolean;
  preferred_probe_order: string[];
  history_control_reason: string;
} {
  const { previousAction, daysSince, quality, currentQuery, actionPattern, priorDecisionCount } = params;

  // No actionable prior history
  if (!previousAction || previousAction === "NONE") {
    return {
      history_requires_control: false,
      revalidation_mandatory: false,
      preferred_probe_order: [],
      history_control_reason: "No actionable prior decision found",
    };
  }

  // Probe order from routing table
  const preferred_probe_order = PROBE_ROUTING_TABLE[previousAction] ?? ["thesis_update"];

  // Determine if revalidation is mandatory
  const revalidation_mandatory = computeRevalidationMandatory({
    previousAction,
    daysSince,
    currentQuery,
    priorDecisionCount,
  });

  // history_requires_control: prior action exists + quality acceptable + decision-relevant query
  const isDecisionRelevant = isDecisionRelevantQuery(currentQuery);
  const history_requires_control = isDecisionRelevant || revalidation_mandatory;

  let reason = "";
  if (revalidation_mandatory) {
    reason = `Mandatory revalidation: prior ${previousAction} (${daysSince}d ago), pattern: ${actionPattern}`;
  } else if (history_requires_control) {
    reason = `History control active: prior ${previousAction} influences probe routing`;
  } else {
    reason = `History available but query not decision-relevant — control passive`;
  }

  return {
    history_requires_control,
    revalidation_mandatory,
    preferred_probe_order,
    history_control_reason: reason,
  };
}

/**
 * LEVEL21B Phase 2 rule: revalidation_mandatory computation.
 * Prior BUY/SELL are stronger triggers than HOLD/WAIT.
 */
function computeRevalidationMandatory(params: {
  previousAction: string;
  daysSince: number;
  currentQuery: string;
  priorDecisionCount: number;
}): boolean {
  const { previousAction, daysSince, currentQuery, priorDecisionCount } = params;

  // User explicitly asked for revalidation
  const revalidationKeywords = [
    "still", "still?", "why changed", "re-check", "recheck",
    "update", "revisit", "anymore", "changed", "different now",
    "还是", "还值得", "重新", "再看", "变了", "还在", "还有效",
  ];
  const queryLower = currentQuery.toLowerCase();
  if (revalidationKeywords.some(kw => queryLower.includes(kw))) return true;

  // Prior BUY or SELL with meaningful time elapsed → mandatory
  if (["BUY", "SELL"].includes(previousAction) && daysSince >= 7) return true;

  // Prior BUY/SELL with high confidence (any time) → mandatory
  if (["BUY", "SELL"].includes(previousAction) && priorDecisionCount >= 2) return true;

  // Prior HOLD with long elapsed → mandatory
  if (previousAction === "HOLD" && daysSince >= 30) return true;

  // Repeated WAIT pattern → mandatory
  if (previousAction === "WAIT" && priorDecisionCount >= 2) return true;

  return false;
}

/**
 * Detect if the current query is decision-relevant (vs. pure informational).
 */
function isDecisionRelevantQuery(query: string): boolean {
  if (!query) return false;
  const decisionKeywords = [
    "buy", "sell", "hold", "wait", "should i", "worth", "position",
    "action", "decision", "invest", "trade", "enter", "exit",
    "买", "卖", "持有", "等待", "值得", "建仓", "清仓", "操作",
    "分析", "研究", "判断", "决策",
  ];
  const q = query.toLowerCase();
  return decisionKeywords.some(kw => q.includes(kw));
}

/**
 * Derive a confidence label from the state string.
 * State field often contains "HIGH / MEDIUM / LOW" in text.
 */
function deriveConfidenceFromState(state: string): string {
  const s = state.toUpperCase();
  if (s.includes("HIGH")) return "high";
  if (s.includes("LOW")) return "low";
  if (s.includes("MEDIUM") || s.includes("MED")) return "medium";
  return "medium"; // default
}

// ── Phase 2: Create Step0 Revalidation Object ─────────────────────────────────

/**
 * LEVEL21B Phase 2: Create a Step0 revalidation object when mandatory.
 * This is created by system logic BEFORE GPT synthesis — GPT does not decide.
 */
export function createStep0Revalidation(bootstrap: HistoryBootstrap): Step0Revalidation | null {
  if (!bootstrap.history_requires_control || !bootstrap.revalidation_mandatory) {
    return null;
  }

  const previousAction = bootstrap.previous_action;
  const revalidationFocus = REVALIDATION_FOCUS_TABLE[previousAction] ?? ["thesis_update"];
  const fieldsNeeded = FIELDS_NEEDED_TABLE[previousAction] ?? ["current_price", "earnings_update"];

  const objectiveMap: Record<string, string> = {
    BUY:  "Validate whether prior BUY thesis still holds — check risk escalation and valuation drift",
    SELL: "Validate whether prior SELL thesis still holds — check for reversal signals and business recovery",
    HOLD: "Validate whether prior HOLD is still appropriate — check for new catalysts or valuation change",
    WAIT: "Validate whether trigger conditions for entry have been satisfied since last WAIT decision",
  };

  const triggerReason = bootstrap.history_control_reason;

  return {
    step_type: "thesis_revalidation",
    objective: objectiveMap[previousAction] ?? "Validate whether prior thesis still holds",
    trigger_reason: triggerReason,
    previous_action: previousAction,
    previous_thesis: bootstrap.previous_key_thesis || bootstrap.previous_verdict,
    revalidation_focus: revalidationFocus,
    fields_needed: fieldsNeeded,
    continue_recommended: true,
    ran: false,  // will be set to true when Step0 context is injected
  };
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

  const controlBlock = bootstrap.history_requires_control
    ? `HISTORY_CONTROL: ACTIVE
REVALIDATION_MANDATORY: ${bootstrap.revalidation_mandatory}
PREFERRED_PROBE_ORDER: ${bootstrap.preferred_probe_order.join(" → ")}
CONTROL_REASON: ${bootstrap.history_control_reason}`
    : `HISTORY_CONTROL: PASSIVE`;

  return `[DECISION_HISTORY_CONTEXT]
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
${controlBlock}
RECENT_DECISIONS:
${decisionsStr}
INSTRUCTION:
This user has previously made a decision on this ticker.
${bootstrap.revalidation_mandatory
  ? `Step 0 — THESIS_REVALIDATION (MANDATORY): Before proceeding with new analysis, evaluate:
  1. Is the previous ${bootstrap.previous_action} thesis still valid given current data?
  2. What has materially changed since the last decision (${daysSinceStr})?
  3. Are the previous hidden risks still present or resolved?
  4. Does the action pattern (${bootstrap.action_pattern}) suggest conviction or hesitation?
  Prioritize probes in this order: ${bootstrap.preferred_probe_order.join(" → ")}.
  Output a thesis_delta and action_delta in your reasoning before generating the final verdict.`
  : `History context is available. Consider prior decisions when forming your analysis.
  Preferred probe focus: ${bootstrap.preferred_probe_order.join(" → ")}.`}
[/DECISION_HISTORY_CONTEXT]`;
}

// ── Phase 3: Evaluate History-Aware Trigger Adjustment ───────────────────────

export interface HistoryTriggerAdjustment {
  history_requires_revalidation: boolean;
  thesis_shift_detected: boolean;
  action_reconsideration_required: boolean;
  adjustment_reason: string;
  early_stop_allowed: boolean;
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

  // Recent + high confidence + strong evidence → allow early stop
  const isRecent = (bootstrap.days_since_last_decision ?? 999) < 7;
  const isHighConfidence = currentConfidence === "high";
  const isStrongEvidence = currentEvidenceScore >= 0.75;

  if (isRecent && isHighConfidence && isStrongEvidence && !bootstrap.revalidation_mandatory) {
    return {
      history_requires_revalidation: false,
      thesis_shift_detected: false,
      action_reconsideration_required: false,
      adjustment_reason: `Recent decision (${bootstrap.days_since_last_decision}d ago) with high confidence — early convergence allowed`,
      early_stop_allowed: true,
    };
  }

  // Repeated WAIT → force revalidation
  const allWait = bootstrap.recent_decisions.every(d => d.action === "WAIT");
  if (allWait && bootstrap.prior_decision_count >= 2) {
    return {
      history_requires_revalidation: true,
      thesis_shift_detected: false,
      action_reconsideration_required: true,
      adjustment_reason: `Repeated WAIT pattern (${bootstrap.action_pattern}) — revalidation required`,
      early_stop_allowed: false,
    };
  }

  // Prior BUY/SELL with elapsed time → thesis shift likely
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
    history_requires_revalidation: bootstrap.history_requires_control,
    thesis_shift_detected: false,
    action_reconsideration_required: bootstrap.revalidation_mandatory,
    adjustment_reason: `Prior history exists (${bootstrap.prior_decision_count} record(s), pattern: ${bootstrap.action_pattern}) — Step 0 revalidation injected`,
    early_stop_allowed: false,
  };
}

// ── Phase 4: Thesis Delta + Action Delta ─────────────────────────────────────

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
  confidence_delta: string;
}

export interface ActionDelta {
  change_type: ChangeType;
  previous_action: string;
  current_action: string;
  reconsideration_trigger: string;
  days_elapsed: number | null;
}

export function buildDeltaObjects(params: {
  bootstrap: HistoryBootstrap;
  currentAction: string;
  currentVerdict: string;
  currentConfidence: string;
  previousConfidence?: string;
}): { thesis_delta: ThesisDelta; action_delta: ActionDelta } {
  const { bootstrap, currentAction, currentVerdict, currentConfidence, previousConfidence } = params;

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

  let actionChangeType: ChangeType = "unchanged";
  if (bootstrap.previous_action !== currentAction) {
    const reversals: Record<string, string> = {
      BUY: "SELL", SELL: "BUY", HOLD: "SELL",
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

  let thesisChangeType: ChangeType = "unchanged";
  if (actionChangeType === "reversed") thesisChangeType = "invalidated";
  else if (actionChangeType === "strengthened") thesisChangeType = "strengthened";
  else if (actionChangeType === "weakened") thesisChangeType = "weakened";

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

// ── Phase 5: Delta-Driven Stop Evaluation ────────────────────────────────────

export interface DeltaStopEvaluation {
  reaffirmation: boolean;       // thesis+action unchanged → confirm and stop early
  reconsideration: boolean;     // action changed → require thesis_update before stop
  change_materiality: "low" | "medium" | "high";
  stop_reason: string;
  require_thesis_update_step: boolean;
}

export function evaluateDeltaDrivenStop(
  thesisDelta: ThesisDelta,
  actionDelta: ActionDelta
): DeltaStopEvaluation {
  const thesisChanged = thesisDelta.change_type !== "unchanged";
  const actionChanged = actionDelta.change_type !== "unchanged";
  const changeType = thesisDelta.change_type;

  // Case 1: Both unchanged → reaffirmation, stop early
  if (!thesisChanged && !actionChanged) {
    return {
      reaffirmation: true,
      reconsideration: false,
      change_materiality: "low",
      stop_reason: `Thesis and action reaffirmed (${actionDelta.previous_action} → ${actionDelta.current_action}) — early stop allowed`,
      require_thesis_update_step: false,
    };
  }

  // Case 4+: Invalidated or reversed → continue until coherent
  if (changeType === "invalidated" || changeType === "reversed") {
    return {
      reaffirmation: false,
      reconsideration: true,
      change_materiality: "high",
      stop_reason: `Thesis ${changeType} — must continue until new action rationale is coherent`,
      require_thesis_update_step: true,
    };
  }

  // Case 3: Action changed → require explicit thesis_update step
  if (actionChanged) {
    return {
      reaffirmation: false,
      reconsideration: true,
      change_materiality: "high",
      stop_reason: `Action changed (${actionDelta.previous_action} → ${actionDelta.current_action}) — thesis_update step required before stop`,
      require_thesis_update_step: true,
    };
  }

  // Case 5: Strengthened → allow early stop if risk gap small
  if (changeType === "strengthened") {
    return {
      reaffirmation: false,
      reconsideration: false,
      change_materiality: "medium",
      stop_reason: `Thesis strengthened — allow early stop if risk gap small`,
      require_thesis_update_step: false,
    };
  }

  // Case 2: Thesis changed but action unchanged → continue only if clarification valuable
  return {
    reaffirmation: false,
    reconsideration: false,
    change_materiality: "medium",
    stop_reason: `Thesis changed (${changeType}) but action unchanged — continue if clarification valuable`,
    require_thesis_update_step: false,
  };
}

// ── Phase 6: Build History Control Trace ─────────────────────────────────────

export function buildHistoryControlSummary(params: {
  bootstrap: HistoryBootstrap;
  step0: Step0Revalidation | null;
  currentAction: string;
  thesisDelta: ThesisDelta;
  actionDelta: ActionDelta;
  controllerPath: string[];
}): HistoryControlSummary {
  const { bootstrap, step0, currentAction, thesisDelta, actionDelta, controllerPath } = params;

  const thesisChanged = thesisDelta.change_type !== "unchanged";
  const actionChanged = actionDelta.change_type !== "unchanged";

  let summaryLine = "";
  if (!bootstrap.has_prior_history) {
    summaryLine = "No prior history — standard analysis path taken";
  } else if (actionChanged) {
    summaryLine = `Prior ${bootstrap.previous_action} → current ${currentAction} (${actionDelta.change_type}): ${thesisDelta.what_changed}`;
  } else if (thesisChanged) {
    summaryLine = `Action confirmed (${currentAction}) but thesis ${thesisDelta.change_type} since last decision`;
  } else {
    summaryLine = `Prior ${bootstrap.previous_action} reaffirmed as ${currentAction} — thesis stable`;
  }

  return {
    has_prior_history: bootstrap.has_prior_history,
    revalidation_mandatory: bootstrap.revalidation_mandatory,
    previous_action: bootstrap.previous_action,
    current_action: currentAction,
    thesis_changed: thesisChanged,
    action_changed: actionChanged,
    change_type: thesisDelta.change_type,
    controller_path: controllerPath,
    summary_line: summaryLine,
  };
}

// ── Legacy: shouldTriggerHistoryRevalidation (kept for backward compat) ───────

export function shouldTriggerHistoryRevalidation(
  bootstrap: HistoryBootstrap,
  currentQuery: string
): boolean {
  if (!bootstrap.has_prior_history) return false;
  if (bootstrap.history_quality === "none") return false;
  return bootstrap.history_requires_control || bootstrap.revalidation_mandatory;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DANTREE_LEVEL21C: Execution Closure
// Phase 1: Real Step0 Execution
// Phase 2: Step0 Result Binding
// Phase 3: Hard Routing Dispatch
// Phase 4: Routing Priority Enforcement
// Phase 5: Execution Path Trace
// ═══════════════════════════════════════════════════════════════════════════════

// ── Phase 1: Step0 Result Type ────────────────────────────────────────────────

export interface Step0Result {
  revalidation_verdict: string;
  prior_thesis_still_valid: boolean;
  weakening_signals: string[];
  strengthening_signals: string[];
  required_follow_up_probe: string;
  thesis_tension_level: "low" | "medium" | "high";
}

// ── Phase 2: Step0 Binding Result ────────────────────────────────────────────

export interface Step0BindingResult {
  step0_result: Step0Result;
  step0_confidence: "low" | "medium" | "high";
  step0_followup_probe: string;
  step0_tension_level: "low" | "medium" | "high";
  step0_allows_early_stop: boolean;
  step0_forces_continuation: boolean;
}

/**
 * LEVEL21C Phase 1: Run Step0 as a real narrow reasoning execution.
 * Uses invokeLLM in compact JSON-schema mode — NOT a full research report.
 * Budget impact: exactly 1 LLM call, compact prompt.
 */
export async function runStep0Revalidation(params: {
  invokeLLM: (args: {
    messages: Array<{ role: string; content: string }>;
    response_format?: unknown;
  }) => Promise<{ choices: Array<{ message: { content: string } }> }>;
  bootstrap: HistoryBootstrap;
  currentQuery: string;
  evidenceContext?: string;
}): Promise<Step0Result> {
  const { invokeLLM: llm, bootstrap, currentQuery, evidenceContext } = params;

  const systemPrompt =
    `You are a narrow thesis revalidation engine. ` +
    `Evaluate if a prior investment decision thesis is still valid. ` +
    `Return ONLY valid JSON. No prose, no markdown, no explanation.`;

  const userPrompt =
    `PRIOR DECISION:\n` +
    `Action: ${bootstrap.previous_action}\n` +
    `Verdict: ${bootstrap.previous_verdict}\n` +
    `Key Thesis: ${bootstrap.previous_key_thesis}\n` +
    `Known Risks: ${bootstrap.previous_risks}\n` +
    `Days Elapsed: ${bootstrap.days_since_last_decision ?? "unknown"}\n\n` +
    `CURRENT QUERY: ${currentQuery}\n\n` +
    (evidenceContext ? `CURRENT CONTEXT:\n${evidenceContext}\n\n` : "") +
    `Return JSON only:\n` +
    `{"revalidation_verdict":"<one sentence>","prior_thesis_still_valid":true,"weakening_signals":[],"strengthening_signals":[],"required_follow_up_probe":"","thesis_tension_level":"low"}`;

  try {
    const response = await llm({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "step0_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              revalidation_verdict: { type: "string" },
              prior_thesis_still_valid: { type: "boolean" },
              weakening_signals: { type: "array", items: { type: "string" } },
              strengthening_signals: { type: "array", items: { type: "string" } },
              required_follow_up_probe: { type: "string" },
              thesis_tension_level: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: [
              "revalidation_verdict",
              "prior_thesis_still_valid",
              "weakening_signals",
              "strengthening_signals",
              "required_follow_up_probe",
              "thesis_tension_level",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Step0Result;
    return parsed;
  } catch {
    // Non-fatal fallback
    return {
      revalidation_verdict: "Step0 execution failed — assuming prior thesis tentatively valid",
      prior_thesis_still_valid: true,
      weakening_signals: [],
      strengthening_signals: [],
      required_follow_up_probe: "",
      thesis_tension_level: "low",
    };
  }
}

/**
 * LEVEL21C Phase 2: Bind Step0 result into controller-consumable object.
 */
export function bindStep0Result(step0Result: Step0Result): Step0BindingResult {
  const tensionLevel = step0Result.thesis_tension_level;
  const stillValid = step0Result.prior_thesis_still_valid;
  const followUp = (step0Result.required_follow_up_probe ?? "").trim();

  const confidence: "low" | "medium" | "high" =
    tensionLevel === "low" && stillValid ? "high" :
    tensionLevel === "high" || !stillValid ? "low" : "medium";

  const allowsEarlyStop = stillValid && tensionLevel === "low" && !followUp;
  const forcesContinuation = !stillValid || tensionLevel === "high" || !!followUp;

  return {
    step0_result: step0Result,
    step0_confidence: confidence,
    step0_followup_probe: followUp,
    step0_tension_level: tensionLevel,
    step0_allows_early_stop: allowsEarlyStop,
    step0_forces_continuation: forcesContinuation,
  };
}

// ── Phase 3: Hard Routing Dispatch ───────────────────────────────────────────

export interface DispatchResult {
  dispatched_step_type: string;
  dispatch_reason: string;
  routing_source: "step0_override" | "history_table" | "controller_override" | `failure_intensity_score=${string}`;
}

const HARD_ROUTING_TABLE: Record<string, string> = {
  BUY:  "risk_probe",
  SELL: "business_probe",
  HOLD: "valuation_probe",
  WAIT: "trigger_condition_check",
};

/**
 * LEVEL21C Phase 3: Hard-dispatch next probe type.
 * Priority: Step0 explicit override > history routing table > controller fallback.
 */
export function dispatchNextProbeFromHistoryControl(params: {
  previousAction: string;
  step0Binding: Step0BindingResult | null;
  controllerOverride?: string;
  alreadyRanProbes?: string[];
  failureIntensityScore?: number;  // LEVEL3.6: from memoryEvolution
}): DispatchResult {
  const { previousAction, step0Binding, controllerOverride, alreadyRanProbes = [], failureIntensityScore } = params;

  // Priority A: Step0 explicit required_follow_up_probe
  const step0Probe = step0Binding?.step0_followup_probe ?? "";
  if (step0Probe && !alreadyRanProbes.includes(step0Probe)) {
    return {
      dispatched_step_type: step0Probe,
      dispatch_reason: `Step0 explicitly required: ${step0Probe} (tension=${step0Binding?.step0_tension_level})`,
      routing_source: "step0_override",
    };
  }

  // Priority A.5 (LEVEL3.6): High failure_intensity_score → force risk_probe
  // Per GPT: prior failure case → increase risk probe priority
  // Threshold: >= 0.6 forces risk_probe before history routing table
  if (failureIntensityScore !== undefined && failureIntensityScore >= 0.6) {
    // High failure intensity forces risk_probe regardless of alreadyRanProbes
    // Per LEVEL3.6: repeat failure pattern must always get risk probe
    return {
      dispatched_step_type: "risk_probe",
      dispatch_reason: `LEVEL3.6 failure_intensity_score=${failureIntensityScore.toFixed(2)} >= 0.6 — forcing risk_probe to prevent repeat failure pattern`,
      routing_source: `failure_intensity_score=${failureIntensityScore.toFixed(2)}`,
    };
  }
  // Priority B: History routing table
  const tableProbe = HARD_ROUTING_TABLE[previousAction] ?? "";
  if (tableProbe && !alreadyRanProbes.includes(tableProbe)) {
    return {
      dispatched_step_type: tableProbe,
      dispatch_reason: `History routing table: prior ${previousAction} → ${tableProbe}`,
      routing_source: "history_table",
    };
  }

  // Priority C: Controller override
  if (controllerOverride && !alreadyRanProbes.includes(controllerOverride)) {
    return {
      dispatched_step_type: controllerOverride,
      dispatch_reason: `Controller override: ${controllerOverride}`,
      routing_source: "controller_override",
    };
  }

  return {
    dispatched_step_type: "thesis_update",
    dispatch_reason: "All priority probes exhausted — fallback to thesis_update",
    routing_source: "controller_override",
  };
}

// ── Phase 4: Routing Priority Enforcement ────────────────────────────────────

export interface RoutingPriorityTrace {
  routing_priority: string[];
  selected_probe: string;
  selection_reason: string;
  routing_enforced: boolean;
  routing_source: "step0_override" | "history_table" | "controller_override" | `failure_intensity_score=${string}`;
  skipped_probes: string[];
}

/**
 * LEVEL21C Phase 4: Build full routing priority trace and enforce selection.
 */
export function enforceRoutingPriority(params: {
  previousAction: string;
  step0Binding: Step0BindingResult | null;
  preferredProbeOrder: string[];
  alreadyRanProbes?: string[];
  controllerOverride?: string;
}): RoutingPriorityTrace {
  const {
    previousAction,
    step0Binding,
    preferredProbeOrder,
    alreadyRanProbes = [],
    controllerOverride,
  } = params;

  const step0Probe = step0Binding?.step0_followup_probe ?? "";
  const tableProbe = HARD_ROUTING_TABLE[previousAction] ?? "";

  const fullPriority: string[] = [];
  if (step0Probe) fullPriority.push(step0Probe);
  for (const p of preferredProbeOrder) {
    if (!fullPriority.includes(p)) fullPriority.push(p);
  }
  if (tableProbe && !fullPriority.includes(tableProbe)) fullPriority.push(tableProbe);
  if (!fullPriority.includes("thesis_update")) fullPriority.push("thesis_update");

  const skipped: string[] = [];
  let selected = "";
  let selectionReason = "";
  let routingSource: RoutingPriorityTrace["routing_source"] = "controller_override";

  for (const probe of fullPriority) {
    if (alreadyRanProbes.includes(probe)) {
      skipped.push(`${probe} (already ran)`);
      continue;
    }
    selected = probe;
    if (probe === step0Probe) {
      selectionReason = `Step0 required: ${probe}`;
      routingSource = "step0_override";
    } else if (probe === tableProbe) {
      selectionReason = `History table: prior ${previousAction} → ${probe}`;
      routingSource = "history_table";
    } else {
      selectionReason = `Preferred probe order: ${probe}`;
      routingSource = "controller_override";
    }
    break;
  }

  if (!selected) {
    selected = controllerOverride ?? "thesis_update";
    selectionReason = "All priority probes exhausted — fallback";
    routingSource = "controller_override";
  }

  return {
    routing_priority: fullPriority,
    selected_probe: selected,
    selection_reason: selectionReason,
    routing_enforced: true,
    routing_source: routingSource,
    skipped_probes: skipped,
  };
}

// ── Phase 5: Execution Path Trace ────────────────────────────────────────────

export interface ExecutionPathTrace {
  executed_path: string[];
  intended_path: string[];
  path_divergence: string[];
  final_execution_summary: string;
}

/**
 * LEVEL21C Phase 5: Build execution path trace comparing intended vs actual.
 */
export function buildExecutionPathTrace(params: {
  intendedPath: string[];
  executedPath: string[];
  stopReason: string;
}): ExecutionPathTrace {
  const { intendedPath, executedPath, stopReason } = params;

  const divergence: string[] = [];
  for (const step of intendedPath) {
    if (!executedPath.includes(step)) {
      divergence.push(`${step} (intended but not executed — stopped at: ${stopReason})`);
    }
  }

  const summary =
    executedPath.length === 0
      ? "No steps executed"
      : `Executed ${executedPath.length} step(s): ${executedPath.join(" → ")}. Stop: ${stopReason}.`;

  return {
    executed_path: executedPath,
    intended_path: intendedPath,
    path_divergence: divergence,
    final_execution_summary: summary,
  };
}

// ── LEVEL3: Memory Integration ────────────────────────────────────────────────

import {
  retrieveMemory,
  computeMemoryInfluence,
  buildMemoryContextBlock,
} from "./memoryEngine";

/**
 * Attach memory to an existing HistoryBootstrap.
 * Called AFTER buildHistoryBootstrap(), BEFORE loop initialization.
 * Priority: Step0 override > memory influence > history control > default logic
 */
export async function attachMemoryToBootstrap(
  bootstrap: HistoryBootstrap,
  params: {
    userId: string;
    ticker: string;
    currentTags?: string[];
    currentRiskStructure?: string[];
    currentScenarioType?: string;
    budgetUsed?: number;
    budgetMax?: number;
  }
): Promise<HistoryBootstrap> {
  try {
    const retrieval = await retrieveMemory({
      userId: params.userId,
      ticker: params.ticker,
      currentTags: params.currentTags,
      currentRiskStructure: params.currentRiskStructure,
      currentScenarioType: params.currentScenarioType,
    });

    const combined = retrieval.combined;
    if (combined.length === 0) {
      return {
        ...bootstrap,
        memory_injected: false,
        memory_record_count: 0,
        memory_influence_summary: "no_memory_found",
        memory_context_block: null,
        memory_influence: null,
      };
    }

    const influence = computeMemoryInfluence(combined, params.budgetUsed, params.budgetMax);
    const contextBlock = buildMemoryContextBlock(combined, influence);

    // Memory affects Step0: if failure memory exists, force revalidation_mandatory
    const revalidation_mandatory_upgraded =
      bootstrap.revalidation_mandatory || (influence.affects_step0 && influence.has_failure_memory);

    // Memory affects routing: merge elevated_probe into preferred_probe_order
    let preferred_probe_order = bootstrap.preferred_probe_order;
    if (influence.affects_routing && influence.elevated_probe) {
      const elevated = influence.elevated_probe;
      if (!preferred_probe_order.includes(elevated)) {
        preferred_probe_order = [elevated, ...preferred_probe_order];
      }
    }

    // Memory affects controller: force_continuation overrides early_stop_bias
    const history_control_reason = influence.force_continuation
      ? `${bootstrap.history_control_reason} | MEMORY: force_continuation (${influence.invalidation_count} invalidations)`
      : influence.early_stop_bias
        ? `${bootstrap.history_control_reason} | MEMORY: early_stop_bias (${influence.success_count} successes)`
        : bootstrap.history_control_reason;

    return {
      ...bootstrap,
      // Apply memory-driven upgrades
      revalidation_mandatory: revalidation_mandatory_upgraded,
      preferred_probe_order,
      history_control_reason,
      history_requires_control: bootstrap.history_requires_control || influence.affects_controller,
      // Memory fields
      memory_injected: true,
      memory_record_count: combined.length,
      memory_influence_summary: influence.memory_pattern_summary,
      memory_context_block: contextBlock,
      memory_influence: influence,
    };
  } catch (e) {
    console.error("[LEVEL3] attachMemoryToBootstrap failed (non-fatal):", (e as Error).message);
    return {
      ...bootstrap,
      memory_injected: false,
      memory_record_count: 0,
      memory_influence_summary: "memory_error",
      memory_context_block: null,
      memory_influence: null,
    };
  }
}
