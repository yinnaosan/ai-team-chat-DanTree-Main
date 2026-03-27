/**
 * DANTREE LEVEL4 — Execution Layer
 * Phase 1: Watchlist State Model
 * Phase 2: Trigger Engine
 *
 * NON-NEGOTIABLE RULES:
 * 1. NO auto-trading or real order placement.
 * 2. Trigger engine is deterministic — no LLM calls.
 * 3. Every trigger must be explainable.
 * 4. Watch logic is bounded and auditable.
 * 5. Preserves all Level1/Level2/Level3 behavior.
 */

// ── Phase 1: Watchlist State Model ───────────────────────────────────────────

export type WatchStatus = "active" | "paused" | "archived" | "triggered";
export type WatchType =
  | "thesis_watch"
  | "risk_watch"
  | "valuation_watch"
  | "event_watch"
  | "macro_watch";
export type ActionBias = "BUY" | "HOLD" | "WAIT" | "SELL" | "NONE";
export type WatchPriority = "low" | "medium" | "high" | "critical";

export type TriggerConditionType =
  | "price"
  | "valuation"
  | "earnings"
  | "macro"
  | "risk"
  | "memory_shift"
  | "learning_shift";

export type TriggerOperator =
  | "gt"   // greater than
  | "lt"   // less than
  | "gte"  // greater than or equal
  | "lte"  // less than or equal
  | "eq"   // equal
  | "neq"  // not equal
  | "crosses_above"
  | "crosses_below"
  | "changed"
  | "exceeds_threshold";

export interface TriggerCondition {
  condition_id: string;
  condition_type: TriggerConditionType;
  operator: TriggerOperator;
  threshold_value: string;
  description: string;
  enabled: boolean;
}

export interface WatchItem {
  watch_id: string;
  user_id: string;
  primary_ticker: string;
  watch_status: WatchStatus;
  watch_type: WatchType;
  current_action_bias: ActionBias;
  thesis_summary: string;
  risk_conditions: string[];
  trigger_conditions: TriggerCondition[];
  priority: WatchPriority;
  created_at: number;       // UTC ms
  updated_at: number;       // UTC ms
  last_evaluated_at: number | null;
  last_triggered_at: number | null;
  linked_memory_ids: string[];
  linked_loop_ids: string[];
  notes: string;
}

/**
 * Factory: create a new WatchItem with defaults.
 */
export function createWatchItem(params: {
  user_id: string;
  primary_ticker: string;
  watch_type: WatchType;
  current_action_bias: ActionBias;
  thesis_summary: string;
  priority?: WatchPriority;
  trigger_conditions?: TriggerCondition[];
  risk_conditions?: string[];
  linked_memory_ids?: string[];
  linked_loop_ids?: string[];
  notes?: string;
}): WatchItem {
  const now = Date.now();
  return {
    watch_id: `watch_${now}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: params.user_id,
    primary_ticker: params.primary_ticker.toUpperCase(),
    watch_status: "active",
    watch_type: params.watch_type,
    current_action_bias: params.current_action_bias,
    thesis_summary: params.thesis_summary,
    risk_conditions: params.risk_conditions ?? [],
    trigger_conditions: params.trigger_conditions ?? [],
    priority: params.priority ?? "medium",
    created_at: now,
    updated_at: now,
    last_evaluated_at: null,
    last_triggered_at: null,
    linked_memory_ids: params.linked_memory_ids ?? [],
    linked_loop_ids: params.linked_loop_ids ?? [],
    notes: params.notes ?? "",
  };
}

/**
 * Factory: create a TriggerCondition.
 */
export function createTriggerCondition(params: {
  condition_type: TriggerConditionType;
  operator: TriggerOperator;
  threshold_value: string;
  description: string;
  enabled?: boolean;
}): TriggerCondition {
  return {
    condition_id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    condition_type: params.condition_type,
    operator: params.operator,
    threshold_value: params.threshold_value,
    description: params.description,
    enabled: params.enabled ?? true,
  };
}

/**
 * Lifecycle helpers.
 */
export function pauseWatch(item: WatchItem): WatchItem {
  return { ...item, watch_status: "paused", updated_at: Date.now() };
}

export function resumeWatch(item: WatchItem): WatchItem {
  return { ...item, watch_status: "active", updated_at: Date.now() };
}

export function archiveWatch(item: WatchItem): WatchItem {
  return { ...item, watch_status: "archived", updated_at: Date.now() };
}

export function markWatchTriggered(item: WatchItem): WatchItem {
  const now = Date.now();
  return { ...item, watch_status: "triggered", last_triggered_at: now, updated_at: now };
}

// ── Phase 2: Trigger Engine ───────────────────────────────────────────────────

export type TriggerType =
  | "price_break"
  | "valuation_shift"
  | "earnings_event"
  | "macro_change"
  | "risk_escalation"
  | "memory_contradiction"
  | "learning_threshold_breach"
  | "no_trigger";

export type TriggerSeverity = "low" | "medium" | "high" | "critical";

export interface TriggerInput {
  /** Current price of the primary ticker */
  current_price?: number;
  /** Previous price (for break detection) */
  previous_price?: number;
  /** Current P/E or other valuation metric */
  current_valuation?: number;
  /** Previous valuation */
  previous_valuation?: number;
  /** Whether an earnings event was detected */
  earnings_event_detected?: boolean;
  /** Macro indicator change flag */
  macro_change_detected?: boolean;
  /** Macro change magnitude: 0-1 */
  macro_change_magnitude?: number;
  /** Risk score from LEVEL3 reasoning: 0-1 */
  risk_score?: number;
  /** Previous risk score */
  previous_risk_score?: number;
  /** Memory contradiction detected from LEVEL3 */
  memory_contradiction?: boolean;
  /** Memory contradiction type */
  memory_contradiction_type?: string;
  /** Learning threshold breach from LEVEL3.6 */
  learning_threshold_breach?: boolean;
  /** Failure intensity score from LEVEL3.6 */
  failure_intensity_score?: number;
  /** Current UTC timestamp */
  evaluated_at?: number;
}

export interface TriggerResult {
  watch_id: string;
  trigger_fired: boolean;
  trigger_type: TriggerType;
  trigger_reason: string;
  trigger_severity: TriggerSeverity;
  suggested_follow_up: string;
  evidence_snapshot: Record<string, unknown>;
  evaluated_at: number;
  skipped_reason?: string;  // set when watch is paused/archived
}

/**
 * Evaluate a numeric condition against a threshold.
 * Returns true if the condition is met.
 */
function evaluateNumericCondition(
  value: number,
  operator: TriggerOperator,
  threshold: number
): boolean {
  switch (operator) {
    case "gt":  return value > threshold;
    case "lt":  return value < threshold;
    case "gte": return value >= threshold;
    case "lte": return value <= threshold;
    case "eq":  return value === threshold;
    case "neq": return value !== threshold;
    case "crosses_above": return value > threshold;  // simplified: caller provides previous context
    case "crosses_below": return value < threshold;
    case "exceeds_threshold": return Math.abs(value) > threshold;
    default: return false;
  }
}

/**
 * Derive trigger severity from trigger type + input signals.
 */
function deriveSeverity(
  triggerType: TriggerType,
  input: TriggerInput,
  watchPriority: WatchPriority
): TriggerSeverity {
  // memory_contradiction and learning_threshold_breach are always high+
  if (triggerType === "memory_contradiction") return "high";
  if (triggerType === "learning_threshold_breach") {
    return (input.failure_intensity_score ?? 0) >= 0.8 ? "critical" : "high";
  }
  // risk_escalation severity depends on risk score delta
  if (triggerType === "risk_escalation") {
    const delta = (input.risk_score ?? 0) - (input.previous_risk_score ?? 0);
    if (delta >= 0.3) return "critical";
    if (delta >= 0.15) return "high";
    return "medium";
  }
  // earnings_event is always medium+
  if (triggerType === "earnings_event") {
    return watchPriority === "critical" || watchPriority === "high" ? "high" : "medium";
  }
  // price_break severity depends on price change %
  if (triggerType === "price_break") {
    const pct = input.current_price && input.previous_price
      ? Math.abs((input.current_price - input.previous_price) / input.previous_price)
      : 0;
    if (pct >= 0.1) return "critical";
    if (pct >= 0.05) return "high";
    return "medium";
  }
  // valuation_shift
  if (triggerType === "valuation_shift") return "medium";
  // macro_change
  if (triggerType === "macro_change") {
    return (input.macro_change_magnitude ?? 0) >= 0.5 ? "high" : "medium";
  }
  return "low";
}

/**
 * Suggest follow-up action based on trigger type and severity.
 */
function suggestFollowUp(triggerType: TriggerType, severity: TriggerSeverity): string {
  const map: Record<TriggerType, Record<TriggerSeverity, string>> = {
    price_break: {
      low: "Monitor — price moved but within normal range",
      medium: "Run targeted thesis check — confirm price break vs. noise",
      high: "Run full reasoning loop — price break may invalidate thesis",
      critical: "Immediate full reasoning loop + risk probe — critical price break",
    },
    valuation_shift: {
      low: "Note valuation change — no action required",
      medium: "Run valuation probe — check if entry/exit criteria still valid",
      high: "Run full reasoning loop — valuation shift may change action bias",
      critical: "Immediate full reasoning loop — extreme valuation deviation",
    },
    earnings_event: {
      low: "Note earnings event — monitor for material changes",
      medium: "Run earnings probe — check guidance vs. thesis assumptions",
      high: "Run full reasoning loop — earnings may change conviction",
      critical: "Immediate full reasoning loop — earnings surprise detected",
    },
    macro_change: {
      low: "Note macro change — no action required",
      medium: "Run macro probe — check if macro shift affects thesis",
      high: "Run full reasoning loop — macro change may affect sector/position",
      critical: "Immediate full reasoning loop — critical macro shift",
    },
    risk_escalation: {
      low: "Monitor risk — within acceptable range",
      medium: "Run risk probe — check if risk conditions have changed",
      high: "Run full reasoning loop — risk escalation requires thesis recheck",
      critical: "Immediate full reasoning loop + reduce_risk recommendation",
    },
    memory_contradiction: {
      low: "Note memory signal — low confidence contradiction",
      medium: "Run memory reconciliation probe",
      high: "Run full reasoning loop — memory contradiction detected",
      critical: "Immediate full reasoning loop — critical memory contradiction",
    },
    learning_threshold_breach: {
      low: "Note learning signal",
      medium: "Run learning-influenced probe",
      high: "Run full reasoning loop — learning threshold breached",
      critical: "Immediate full reasoning loop — critical failure pattern detected",
    },
    no_trigger: {
      low: "No action required",
      medium: "No action required",
      high: "No action required",
      critical: "No action required",
    },
  };
  return map[triggerType]?.[severity] ?? "Monitor — no specific follow-up";
}

/**
 * LEVEL4 Phase 2: Main trigger evaluation function.
 * Deterministic — no LLM calls.
 * Respects paused/archived watch items.
 */
export function evaluateWatchTrigger(
  watchItem: WatchItem,
  input: TriggerInput
): TriggerResult {
  const evaluatedAt = input.evaluated_at ?? Date.now();

  // Guard: paused or archived watch items never fire
  if (watchItem.watch_status === "paused") {
    return {
      watch_id: watchItem.watch_id,
      trigger_fired: false,
      trigger_type: "no_trigger",
      trigger_reason: "Watch item is paused — trigger evaluation skipped",
      trigger_severity: "low",
      suggested_follow_up: "Resume watch to re-enable trigger evaluation",
      evidence_snapshot: { watch_status: "paused" },
      evaluated_at: evaluatedAt,
      skipped_reason: "paused",
    };
  }

  if (watchItem.watch_status === "archived") {
    return {
      watch_id: watchItem.watch_id,
      trigger_fired: false,
      trigger_type: "no_trigger",
      trigger_reason: "Watch item is archived — trigger evaluation skipped",
      trigger_severity: "low",
      suggested_follow_up: "Unarchive watch to re-enable trigger evaluation",
      evidence_snapshot: { watch_status: "archived" },
      evaluated_at: evaluatedAt,
      skipped_reason: "archived",
    };
  }

  // ── Trigger Type 1: memory_contradiction (highest priority after Step0) ──
  if (input.memory_contradiction === true) {
    const severity = deriveSeverity("memory_contradiction", input, watchItem.priority);
    return {
      watch_id: watchItem.watch_id,
      trigger_fired: true,
      trigger_type: "memory_contradiction",
      trigger_reason: `Memory contradiction detected (type: ${input.memory_contradiction_type ?? "unknown"}) — thesis tension requires resolution`,
      trigger_severity: severity,
      suggested_follow_up: suggestFollowUp("memory_contradiction", severity),
      evidence_snapshot: {
        memory_contradiction: true,
        memory_contradiction_type: input.memory_contradiction_type,
        watch_type: watchItem.watch_type,
      },
      evaluated_at: evaluatedAt,
    };
  }

  // ── Trigger Type 2: learning_threshold_breach ──────────────────────────────
  if (input.learning_threshold_breach === true) {
    const severity = deriveSeverity("learning_threshold_breach", input, watchItem.priority);
    return {
      watch_id: watchItem.watch_id,
      trigger_fired: true,
      trigger_type: "learning_threshold_breach",
      trigger_reason: `Learning threshold breached — failure_intensity_score=${(input.failure_intensity_score ?? 0).toFixed(2)} — prior failure pattern requires recheck`,
      trigger_severity: severity,
      suggested_follow_up: suggestFollowUp("learning_threshold_breach", severity),
      evidence_snapshot: {
        learning_threshold_breach: true,
        failure_intensity_score: input.failure_intensity_score,
      },
      evaluated_at: evaluatedAt,
    };
  }

  // ── Trigger Type 3: risk_escalation ──────────────────────────────────────
  if (
    input.risk_score !== undefined &&
    input.previous_risk_score !== undefined &&
    input.risk_score > input.previous_risk_score
  ) {
    const delta = input.risk_score - input.previous_risk_score;
    // Only fire if delta is material (>= 0.1)
    if (delta >= 0.1) {
      const severity = deriveSeverity("risk_escalation", input, watchItem.priority);
      return {
        watch_id: watchItem.watch_id,
        trigger_fired: true,
        trigger_type: "risk_escalation",
        trigger_reason: `Risk score escalated from ${input.previous_risk_score.toFixed(2)} to ${input.risk_score.toFixed(2)} (delta=${delta.toFixed(2)}) — risk probe required`,
        trigger_severity: severity,
        suggested_follow_up: suggestFollowUp("risk_escalation", severity),
        evidence_snapshot: {
          risk_score: input.risk_score,
          previous_risk_score: input.previous_risk_score,
          delta,
        },
        evaluated_at: evaluatedAt,
      };
    }
  }

  // ── Trigger Type 4: earnings_event ────────────────────────────────────────
  if (input.earnings_event_detected === true) {
    const severity = deriveSeverity("earnings_event", input, watchItem.priority);
    return {
      watch_id: watchItem.watch_id,
      trigger_fired: true,
      trigger_type: "earnings_event",
      trigger_reason: `Earnings event detected for ${watchItem.primary_ticker} — thesis assumptions require validation`,
      trigger_severity: severity,
      suggested_follow_up: suggestFollowUp("earnings_event", severity),
      evidence_snapshot: {
        earnings_event_detected: true,
        ticker: watchItem.primary_ticker,
      },
      evaluated_at: evaluatedAt,
    };
  }

  // ── Trigger Type 5: price_break ───────────────────────────────────────────
  if (
    input.current_price !== undefined &&
    input.previous_price !== undefined &&
    input.previous_price > 0
  ) {
    const pctChange = Math.abs(
      (input.current_price - input.previous_price) / input.previous_price
    );
    // Check against enabled price conditions
    const priceConditions = watchItem.trigger_conditions.filter(
      (c) => c.condition_type === "price" && c.enabled
    );
    for (const cond of priceConditions) {
      const threshold = parseFloat(cond.threshold_value);
      if (!isNaN(threshold)) {
        const met = evaluateNumericCondition(input.current_price, cond.operator, threshold);
        if (met) {
          const severity = deriveSeverity("price_break", input, watchItem.priority);
          return {
            watch_id: watchItem.watch_id,
            trigger_fired: true,
            trigger_type: "price_break",
            trigger_reason: `Price break: ${watchItem.primary_ticker} current=${input.current_price} ${cond.operator} threshold=${threshold} — condition "${cond.description}" met (${(pctChange * 100).toFixed(1)}% move)`,
            trigger_severity: severity,
            suggested_follow_up: suggestFollowUp("price_break", severity),
            evidence_snapshot: {
              current_price: input.current_price,
              previous_price: input.previous_price,
              pct_change: pctChange,
              condition_id: cond.condition_id,
              condition_description: cond.description,
            },
            evaluated_at: evaluatedAt,
          };
        }
      }
    }
    // Fallback: fire on large move even without explicit condition (>= 5%)
    if (pctChange >= 0.05) {
      const severity = deriveSeverity("price_break", input, watchItem.priority);
      return {
        watch_id: watchItem.watch_id,
        trigger_fired: true,
        trigger_type: "price_break",
        trigger_reason: `Price break: ${watchItem.primary_ticker} moved ${(pctChange * 100).toFixed(1)}% — material price change detected`,
        trigger_severity: severity,
        suggested_follow_up: suggestFollowUp("price_break", severity),
        evidence_snapshot: {
          current_price: input.current_price,
          previous_price: input.previous_price,
          pct_change: pctChange,
        },
        evaluated_at: evaluatedAt,
      };
    }
  }

  // ── Trigger Type 6: valuation_shift ──────────────────────────────────────
  if (
    input.current_valuation !== undefined &&
    input.previous_valuation !== undefined &&
    input.previous_valuation > 0
  ) {
    const valuationConditions = watchItem.trigger_conditions.filter(
      (c) => c.condition_type === "valuation" && c.enabled
    );
    for (const cond of valuationConditions) {
      const threshold = parseFloat(cond.threshold_value);
      if (!isNaN(threshold)) {
        const met = evaluateNumericCondition(input.current_valuation, cond.operator, threshold);
        if (met) {
          const severity = deriveSeverity("valuation_shift", input, watchItem.priority);
          return {
            watch_id: watchItem.watch_id,
            trigger_fired: true,
            trigger_type: "valuation_shift",
            trigger_reason: `Valuation shift: ${watchItem.primary_ticker} current=${input.current_valuation} ${cond.operator} threshold=${threshold} — "${cond.description}"`,
            trigger_severity: severity,
            suggested_follow_up: suggestFollowUp("valuation_shift", severity),
            evidence_snapshot: {
              current_valuation: input.current_valuation,
              previous_valuation: input.previous_valuation,
              condition_id: cond.condition_id,
            },
            evaluated_at: evaluatedAt,
          };
        }
      }
    }
  }

  // ── Trigger Type 7: macro_change ─────────────────────────────────────────
  if (input.macro_change_detected === true) {
    const severity = deriveSeverity("macro_change", input, watchItem.priority);
    return {
      watch_id: watchItem.watch_id,
      trigger_fired: true,
      trigger_type: "macro_change",
      trigger_reason: `Macro change detected — magnitude=${(input.macro_change_magnitude ?? 0).toFixed(2)} — thesis macro assumptions require validation`,
      trigger_severity: severity,
      suggested_follow_up: suggestFollowUp("macro_change", severity),
      evidence_snapshot: {
        macro_change_detected: true,
        macro_change_magnitude: input.macro_change_magnitude,
      },
      evaluated_at: evaluatedAt,
    };
  }

  // ── No trigger ────────────────────────────────────────────────────────────
  return {
    watch_id: watchItem.watch_id,
    trigger_fired: false,
    trigger_type: "no_trigger",
    trigger_reason: "No trigger conditions met — watch item stable",
    trigger_severity: "low",
    suggested_follow_up: "Continue monitoring",
    evidence_snapshot: {
      evaluated_inputs: Object.keys(input).filter((k) => input[k as keyof TriggerInput] !== undefined),
    },
    evaluated_at: evaluatedAt,
  };
}

/**
 * Batch evaluate multiple watch items.
 * Returns only fired triggers (or all if returnAll=true).
 */
export function batchEvaluateTriggers(
  watchItems: WatchItem[],
  input: TriggerInput,
  options?: { returnAll?: boolean }
): TriggerResult[] {
  const results = watchItems.map((item) => evaluateWatchTrigger(item, input));
  if (options?.returnAll) return results;
  return results.filter((r) => r.trigger_fired);
}
