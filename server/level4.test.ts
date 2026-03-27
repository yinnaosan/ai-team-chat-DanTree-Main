/**
 * DANTREE LEVEL4 — Execution Layer Tests
 * Phase 7: Validation
 *
 * Test Cases:
 * TC-L4-1: Watchlist State Model — schema, lifecycle, linkage
 * TC-L4-2: Trigger Engine — all 7 trigger types, paused/archived guard
 * TC-L4-3: Action Recommendation + Alert/Workflow — full pipeline, dedup/cooldown
 * TC-L4-4: State Transitions/Audit + Cost Safety — audit trail, rate limits, no-auto-trade
 */

import { describe, it, expect, beforeEach } from "vitest";

// Phase 1+2
import {
  createWatchItem,
  createTriggerCondition,
  pauseWatch,
  resumeWatch,
  archiveWatch,
  markWatchTriggered,
  evaluateWatchTrigger,
  batchEvaluateTriggers,
  type WatchItem,
  type TriggerInput,
} from "./watchlistEngine";

// Phase 3+4
import {
  generateActionRecommendation,
  createAlert,
  createWorkflow,
  advanceWorkflow,
  buildDedupKey,
  isInCooldown,
  recordCooldown,
  processWatchTrigger,
  DEFAULT_COOLDOWN_MS,
  type CooldownRegistry,
} from "./actionRecommendationEngine";

// Phase 5
import {
  appendTransition,
  recordCreation,
  recordStatusChange,
  recordBiasChange,
  recordTriggerFired,
  buildAuditSummary,
  getWatchTransitions,
  getAllFiredTriggers,
  type AuditLog,
} from "./watchlistAudit";

// Phase 6
import {
  evaluateSafety,
  isDeepReasoningAllowed,
  getSafetySummary,
  createRateLimitCounters,
  DEFAULT_COST_SAFETY_CONFIG,
  type RateLimitCounters,
} from "./costSafetyGuard";

// ── TC-L4-1: Watchlist State Model ────────────────────────────────────────────

describe("TC-L4-1: Watchlist State Model", () => {
  let watchItem: WatchItem;

  beforeEach(() => {
    watchItem = createWatchItem({
      user_id: "user_001",
      primary_ticker: "AAPL",
      watch_type: "thesis_watch",
      current_action_bias: "HOLD",
      thesis_summary: "Apple has strong ecosystem moat and consistent FCF generation",
      priority: "high",
      trigger_conditions: [
        createTriggerCondition({
          condition_type: "price",
          operator: "lt",
          threshold_value: "150",
          description: "Price drops below $150 support level",
        }),
      ],
      risk_conditions: ["Supply chain disruption", "Regulatory risk in China"],
      linked_memory_ids: ["mem_001", "mem_002"],
      linked_loop_ids: ["loop_001"],
      notes: "Core holding — monitor quarterly",
    });
  });

  it("creates watch item with required schema fields", () => {
    expect(watchItem.watch_id).toBeDefined();
    expect(watchItem.user_id).toBe("user_001");
    expect(watchItem.primary_ticker).toBe("AAPL");
    expect(watchItem.watch_status).toBe("active");
    expect(watchItem.watch_type).toBe("thesis_watch");
    expect(watchItem.current_action_bias).toBe("HOLD");
    expect(watchItem.thesis_summary).toContain("Apple");
    expect(watchItem.priority).toBe("high");
    expect(watchItem.created_at).toBeGreaterThan(0);
    expect(watchItem.updated_at).toBeGreaterThan(0);
    expect(watchItem.last_evaluated_at).toBeNull();
    expect(watchItem.last_triggered_at).toBeNull();
  });

  it("creates trigger condition with required schema fields", () => {
    const cond = watchItem.trigger_conditions[0];
    expect(cond.condition_id).toBeDefined();
    expect(cond.condition_type).toBe("price");
    expect(cond.operator).toBe("lt");
    expect(cond.threshold_value).toBe("150");
    expect(cond.description).toContain("$150");
    expect(cond.enabled).toBe(true);
  });

  it("supports memory and loop linkage", () => {
    expect(watchItem.linked_memory_ids).toEqual(["mem_001", "mem_002"]);
    expect(watchItem.linked_loop_ids).toEqual(["loop_001"]);
  });

  it("supports risk_conditions array", () => {
    expect(watchItem.risk_conditions).toHaveLength(2);
    expect(watchItem.risk_conditions[0]).toContain("Supply chain");
  });

  it("lifecycle: active → paused → active → archived → triggered", () => {
    const paused = pauseWatch(watchItem);
    expect(paused.watch_status).toBe("paused");
    expect(paused.updated_at).toBeGreaterThanOrEqual(watchItem.updated_at);

    const resumed = resumeWatch(paused);
    expect(resumed.watch_status).toBe("active");

    const archived = archiveWatch(resumed);
    expect(archived.watch_status).toBe("archived");

    const triggered = markWatchTriggered(archived);
    expect(triggered.watch_status).toBe("triggered");
    expect(triggered.last_triggered_at).toBeGreaterThan(0);
  });

  it("ticker is normalized to uppercase", () => {
    const lower = createWatchItem({
      user_id: "u1",
      primary_ticker: "tsla",
      watch_type: "risk_watch",
      current_action_bias: "WAIT",
      thesis_summary: "Tesla risk watch",
    });
    expect(lower.primary_ticker).toBe("TSLA");
  });

  it("all 5 watch types are valid", () => {
    const types: Array<WatchItem["watch_type"]> = [
      "thesis_watch", "risk_watch", "valuation_watch", "event_watch", "macro_watch",
    ];
    for (const t of types) {
      const w = createWatchItem({
        user_id: "u1",
        primary_ticker: "X",
        watch_type: t,
        current_action_bias: "NONE",
        thesis_summary: "test",
      });
      expect(w.watch_type).toBe(t);
    }
  });
});

// ── TC-L4-2: Trigger Engine ───────────────────────────────────────────────────

describe("TC-L4-2: Trigger Engine — 7 trigger types + guards", () => {
  let baseWatch: WatchItem;

  beforeEach(() => {
    baseWatch = createWatchItem({
      user_id: "user_001",
      primary_ticker: "TSLA",
      watch_type: "risk_watch",
      current_action_bias: "WAIT",
      thesis_summary: "Tesla risk monitoring — high volatility, macro sensitivity",
      priority: "high",
      trigger_conditions: [
        createTriggerCondition({
          condition_type: "price",
          operator: "lt",
          threshold_value: "200",
          description: "TSLA drops below $200",
        }),
        createTriggerCondition({
          condition_type: "valuation",
          operator: "gt",
          threshold_value: "80",
          description: "P/E exceeds 80x",
        }),
      ],
    });
  });

  it("TT-1: memory_contradiction fires with high severity", () => {
    const input: TriggerInput = {
      memory_contradiction: true,
      memory_contradiction_type: "thesis_reversal",
    };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_fired).toBe(true);
    expect(result.trigger_type).toBe("memory_contradiction");
    expect(result.trigger_severity).toBe("high");
    expect(result.suggested_follow_up).toContain("reasoning loop");
  });

  it("TT-2: learning_threshold_breach fires with critical severity at high failure_intensity", () => {
    const input: TriggerInput = {
      learning_threshold_breach: true,
      failure_intensity_score: 0.85,
    };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_fired).toBe(true);
    expect(result.trigger_type).toBe("learning_threshold_breach");
    expect(result.trigger_severity).toBe("critical");
    expect(result.evidence_snapshot).toMatchObject({ failure_intensity_score: 0.85 });
  });

  it("TT-3: risk_escalation fires when delta >= 0.1", () => {
    const input: TriggerInput = {
      risk_score: 0.75,
      previous_risk_score: 0.50,
    };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_fired).toBe(true);
    expect(result.trigger_type).toBe("risk_escalation");
    expect(result.evidence_snapshot).toMatchObject({ delta: 0.25 });
  });

  it("TT-3: risk_escalation does NOT fire when delta < 0.1", () => {
    const input: TriggerInput = {
      risk_score: 0.55,
      previous_risk_score: 0.50,
    };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_fired).toBe(false);
  });

  it("TT-4: earnings_event fires", () => {
    const input: TriggerInput = { earnings_event_detected: true };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_fired).toBe(true);
    expect(result.trigger_type).toBe("earnings_event");
    expect(result.trigger_severity).toBe("high");  // priority=high watch
  });

  it("TT-5: price_break fires when explicit condition met", () => {
    const input: TriggerInput = {
      current_price: 185,
      previous_price: 220,
    };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_fired).toBe(true);
    expect(result.trigger_type).toBe("price_break");
    expect(result.evidence_snapshot).toHaveProperty("current_price", 185);
  });

  it("TT-5: price_break fires on large move (>= 5%) even without explicit condition", () => {
    const noConditionWatch = createWatchItem({
      user_id: "u1",
      primary_ticker: "NVDA",
      watch_type: "thesis_watch",
      current_action_bias: "BUY",
      thesis_summary: "NVDA AI thesis",
    });
    const input: TriggerInput = {
      current_price: 900,
      previous_price: 1000,  // 10% drop
    };
    const result = evaluateWatchTrigger(noConditionWatch, input);
    expect(result.trigger_fired).toBe(true);
    expect(result.trigger_type).toBe("price_break");
  });

  it("TT-6: valuation_shift fires when condition met", () => {
    const input: TriggerInput = {
      current_valuation: 90,
      previous_valuation: 60,
    };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_fired).toBe(true);
    expect(result.trigger_type).toBe("valuation_shift");
  });

  it("TT-7: macro_change fires", () => {
    const input: TriggerInput = {
      macro_change_detected: true,
      macro_change_magnitude: 0.6,
    };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_fired).toBe(true);
    expect(result.trigger_type).toBe("macro_change");
    expect(result.trigger_severity).toBe("high");
  });

  it("GUARD: paused watch never fires", () => {
    const paused = pauseWatch(baseWatch);
    const input: TriggerInput = {
      memory_contradiction: true,
      risk_score: 0.9,
      previous_risk_score: 0.1,
      earnings_event_detected: true,
    };
    const result = evaluateWatchTrigger(paused, input);
    expect(result.trigger_fired).toBe(false);
    expect(result.skipped_reason).toBe("paused");
  });

  it("GUARD: archived watch never fires", () => {
    const archived = archiveWatch(baseWatch);
    const input: TriggerInput = { memory_contradiction: true };
    const result = evaluateWatchTrigger(archived, input);
    expect(result.trigger_fired).toBe(false);
    expect(result.skipped_reason).toBe("archived");
  });

  it("no_trigger when no conditions met", () => {
    const input: TriggerInput = {
      current_price: 250,
      previous_price: 248,  // small move, no condition met
    };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_fired).toBe(false);
    expect(result.trigger_type).toBe("no_trigger");
  });

  it("batchEvaluateTriggers returns only fired triggers by default", () => {
    const watches = [
      baseWatch,
      createWatchItem({
        user_id: "u1",
        primary_ticker: "MSFT",
        watch_type: "valuation_watch",
        current_action_bias: "HOLD",
        thesis_summary: "MSFT stable",
      }),
    ];
    const input: TriggerInput = { earnings_event_detected: true };
    const fired = batchEvaluateTriggers(watches, input);
    expect(fired.length).toBe(2);  // both fire on earnings event
    expect(fired.every((r) => r.trigger_fired)).toBe(true);
  });

  it("batchEvaluateTriggers returnAll=true includes non-fired", () => {
    const watches = [baseWatch];
    const input: TriggerInput = {};
    const all = batchEvaluateTriggers(watches, input, { returnAll: true });
    expect(all.length).toBe(1);
    expect(all[0].trigger_fired).toBe(false);
  });

  it("trigger priority: memory_contradiction takes precedence over price_break", () => {
    const input: TriggerInput = {
      memory_contradiction: true,
      current_price: 100,
      previous_price: 200,  // 50% drop — would also fire price_break
    };
    const result = evaluateWatchTrigger(baseWatch, input);
    expect(result.trigger_type).toBe("memory_contradiction");
  });
});

// ── TC-L4-3: Action Recommendation + Alert/Workflow + Cooldown ────────────────

describe("TC-L4-3: Action Recommendation + Alert/Workflow + Dedup/Cooldown", () => {
  let watchItem: WatchItem;
  let cooldownRegistry: CooldownRegistry;

  beforeEach(() => {
    watchItem = createWatchItem({
      user_id: "user_001",
      primary_ticker: "BRK",
      watch_type: "thesis_watch",
      current_action_bias: "BUY",
      thesis_summary: "Berkshire — value thesis, long-term hold",
      priority: "critical",
    });
    cooldownRegistry = new Map();
  });

  it("generates monitor_only recommendation when no trigger fired", () => {
    const triggerResult = evaluateWatchTrigger(watchItem, {});
    const rec = generateActionRecommendation(watchItem, triggerResult);
    expect(rec.action_type).toBe("monitor_only");
    expect(rec.safe_to_auto_execute).toBe(false);
  });

  it("generates deep_recheck for critical trigger", () => {
    const triggerResult = evaluateWatchTrigger(watchItem, {
      learning_threshold_breach: true,
      failure_intensity_score: 0.9,
    });
    const rec = generateActionRecommendation(watchItem, triggerResult);
    expect(rec.action_type).toBe("deep_recheck");
    expect(rec.reasoning_mode).toBe("deep");
    expect(rec.urgency).toBe("critical");
    expect(rec.safe_to_auto_execute).toBe(false);
  });

  it("generates reduce_risk for critical risk_escalation", () => {
    const triggerResult = evaluateWatchTrigger(watchItem, {
      risk_score: 0.95,
      previous_risk_score: 0.40,
    });
    const rec = generateActionRecommendation(watchItem, triggerResult);
    expect(rec.action_type).toBe("reduce_risk");
    expect(rec.safe_to_auto_execute).toBe(false);
  });

  it("creates alert with correct title and message", () => {
    const triggerResult = evaluateWatchTrigger(watchItem, {
      earnings_event_detected: true,
    });
    const rec = generateActionRecommendation(watchItem, triggerResult);
    const alert = createAlert(watchItem, triggerResult, rec);
    expect(alert.alert_id).toBeDefined();
    expect(alert.alert_title).toContain("BRK");
    expect(alert.alert_message).toContain("What changed");
    expect(alert.alert_message).toContain("Why it matters");
    expect(alert.alert_message).toContain("System recommends");
    expect(alert.workflow_status).toBe("new");
    expect(alert.dedup_key).toBe(buildDedupKey(watchItem.watch_id, "earnings_event"));
  });

  it("creates workflow with correct initial state", () => {
    const triggerResult = evaluateWatchTrigger(watchItem, { macro_change_detected: true });
    const rec = generateActionRecommendation(watchItem, triggerResult);
    const wf = createWorkflow(watchItem, triggerResult, rec);
    expect(wf.workflow_id).toBeDefined();
    expect(wf.workflow_step).toBe("triggered");
    expect(wf.status).toBe("open");
    expect(wf.summary).toContain("BRK");
  });

  it("advances workflow through steps", () => {
    const triggerResult = evaluateWatchTrigger(watchItem, { earnings_event_detected: true });
    const rec = generateActionRecommendation(watchItem, triggerResult);
    const wf = createWorkflow(watchItem, triggerResult, rec);

    const wf2 = advanceWorkflow(wf, "reasoning_requested");
    expect(wf2.workflow_step).toBe("reasoning_requested");
    expect(wf2.status).toBe("in_progress");

    const wf3 = advanceWorkflow(wf2, "resolved", "Thesis confirmed — no action needed");
    expect(wf3.workflow_step).toBe("resolved");
    expect(wf3.status).toBe("resolved");
    expect(wf3.summary).toContain("Thesis confirmed");
  });

  it("cooldown: second alert within window is suppressed", () => {
    const triggerResult = evaluateWatchTrigger(watchItem, { earnings_event_detected: true });

    const result1 = processWatchTrigger(watchItem, triggerResult, cooldownRegistry);
    expect(result1.alert).not.toBeNull();
    expect(result1.cooldown_applied).toBe(false);

    const result2 = processWatchTrigger(watchItem, triggerResult, cooldownRegistry);
    expect(result2.alert).toBeNull();
    expect(result2.cooldown_applied).toBe(true);
  });

  it("cooldown: different trigger types are not deduped against each other", () => {
    const earningsResult = evaluateWatchTrigger(watchItem, { earnings_event_detected: true });
    const macroResult = evaluateWatchTrigger(watchItem, { macro_change_detected: true });

    const r1 = processWatchTrigger(watchItem, earningsResult, cooldownRegistry);
    expect(r1.alert).not.toBeNull();

    const r2 = processWatchTrigger(watchItem, macroResult, cooldownRegistry);
    expect(r2.alert).not.toBeNull();  // different trigger type — not suppressed
  });

  it("cooldown: expires after cooldown window (0ms for test)", () => {
    const triggerResult = evaluateWatchTrigger(watchItem, { earnings_event_detected: true });

    const r1 = processWatchTrigger(watchItem, triggerResult, cooldownRegistry, { cooldownMs: 0 });
    expect(r1.alert).not.toBeNull();

    const r2 = processWatchTrigger(watchItem, triggerResult, cooldownRegistry, { cooldownMs: 0 });
    expect(r2.alert).not.toBeNull();  // cooldown=0ms, always allowed
  });

  it("isInCooldown returns false for unknown key", () => {
    expect(isInCooldown("unknown_key", cooldownRegistry)).toBe(false);
  });

  it("recordCooldown increments fire_count", () => {
    const key = "test_key";
    recordCooldown(key, cooldownRegistry);
    recordCooldown(key, cooldownRegistry);
    expect(cooldownRegistry.get(key)?.fire_count).toBe(2);
  });

  it("safe_to_auto_execute is ALWAYS false", () => {
    const allTriggerInputs: TriggerInput[] = [
      { memory_contradiction: true },
      { learning_threshold_breach: true, failure_intensity_score: 1.0 },
      { risk_score: 1.0, previous_risk_score: 0.0 },
      { earnings_event_detected: true },
      { macro_change_detected: true, macro_change_magnitude: 1.0 },
    ];
    for (const input of allTriggerInputs) {
      const tr = evaluateWatchTrigger(watchItem, input);
      const rec = generateActionRecommendation(watchItem, tr);
      expect(rec.safe_to_auto_execute).toBe(false);
    }
  });
});

// ── TC-L4-4: State Transitions/Audit + Cost Safety ───────────────────────────

describe("TC-L4-4: State Transitions + Audit + Cost Safety", () => {
  let watchItem: WatchItem;
  let auditLog: AuditLog;
  let counters: RateLimitCounters;

  beforeEach(() => {
    watchItem = createWatchItem({
      user_id: "user_001",
      primary_ticker: "META",
      watch_type: "valuation_watch",
      current_action_bias: "HOLD",
      thesis_summary: "Meta — ad revenue recovery + AI monetization thesis",
      priority: "medium",
    });
    auditLog = [];
    counters = createRateLimitCounters("user_001");
  });

  // ── Audit Trail ──

  it("records creation event in audit log", () => {
    recordCreation(auditLog, watchItem);
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].transition_type).toBe("created");
    expect(auditLog[0].actor).toBe("user");
    expect(auditLog[0].watch_id).toBe(watchItem.watch_id);
  });

  it("records status change", () => {
    recordStatusChange(auditLog, watchItem.watch_id, "active", "paused", "user", "User paused watch");
    expect(auditLog[0].transition_type).toBe("status_change");
    expect(auditLog[0].from_value).toBe("active");
    expect(auditLog[0].to_value).toBe("paused");
  });

  it("records bias change", () => {
    recordBiasChange(auditLog, watchItem.watch_id, "HOLD", "SELL", "system", "Risk escalation triggered SELL bias");
    expect(auditLog[0].transition_type).toBe("bias_change");
    expect(auditLog[0].from_value).toBe("HOLD");
    expect(auditLog[0].to_value).toBe("SELL");
  });

  it("records trigger fired event", () => {
    recordTriggerFired(auditLog, watchItem.watch_id, "earnings_event", "medium", "Q3 earnings released");
    expect(auditLog[0].transition_type).toBe("trigger_fired");
    expect(auditLog[0].actor).toBe("trigger_engine");
    expect(auditLog[0].metadata?.trigger_type).toBe("earnings_event");
  });

  it("audit log is append-only — multiple transitions accumulate", () => {
    recordCreation(auditLog, watchItem);
    recordStatusChange(auditLog, watchItem.watch_id, "active", "paused", "user", "Pause");
    recordBiasChange(auditLog, watchItem.watch_id, "HOLD", "WAIT", "system", "Uncertainty");
    recordTriggerFired(auditLog, watchItem.watch_id, "macro_change", "low", "Fed meeting");
    expect(auditLog).toHaveLength(4);
  });

  it("buildAuditSummary is reconstructable from log", () => {
    recordCreation(auditLog, watchItem);
    recordBiasChange(auditLog, watchItem.watch_id, "HOLD", "SELL", "system", "Risk");
    recordTriggerFired(auditLog, watchItem.watch_id, "price_break", "high", "Price dropped 8%");
    recordTriggerFired(auditLog, watchItem.watch_id, "earnings_event", "medium", "Q4 miss");

    const summary = buildAuditSummary(watchItem, auditLog);
    expect(summary.watch_id).toBe(watchItem.watch_id);
    expect(summary.primary_ticker).toBe("META");
    expect(summary.total_transitions).toBe(4);
    expect(summary.total_triggers_fired).toBe(2);
    expect(summary.reconstructable).toBe(true);
    expect(summary.bias_history.length).toBeGreaterThan(0);
  });

  it("getWatchTransitions filters by watch_id", () => {
    const other = createWatchItem({
      user_id: "u1",
      primary_ticker: "GOOG",
      watch_type: "thesis_watch",
      current_action_bias: "BUY",
      thesis_summary: "Google",
    });
    recordCreation(auditLog, watchItem);
    recordCreation(auditLog, other);
    appendTransition(auditLog, {
      watch_id: watchItem.watch_id,
      transition_type: "status_change",
      actor: "user",
      from_value: "active",
      to_value: "paused",
      reason: "test",
    });

    const myTransitions = getWatchTransitions(auditLog, watchItem.watch_id);
    expect(myTransitions).toHaveLength(2);
    expect(myTransitions.every((t) => t.watch_id === watchItem.watch_id)).toBe(true);
  });

  it("getAllFiredTriggers returns only trigger_fired records", () => {
    recordCreation(auditLog, watchItem);
    recordTriggerFired(auditLog, watchItem.watch_id, "price_break", "high", "reason");
    recordStatusChange(auditLog, watchItem.watch_id, "active", "triggered", "trigger_engine", "r");
    recordTriggerFired(auditLog, watchItem.watch_id, "macro_change", "medium", "reason2");

    const fired = getAllFiredTriggers(auditLog);
    expect(fired).toHaveLength(2);
    expect(fired.every((t) => t.transition_type === "trigger_fired")).toBe(true);
  });

  // ── Cost Safety ──

  it("evaluateSafety: auto_trade_allowed is ALWAYS false", () => {
    const config = { ...DEFAULT_COST_SAFETY_CONFIG, auto_trade_allowed: true as never };
    const decision = evaluateSafety("user_001", "deep", "critical", counters, config);
    expect(decision.decision_code).toBe("blocked_auto_trade");
    expect(decision.allowed).toBe(false);
  });

  it("evaluateSafety: allows deep reasoning for critical severity", () => {
    const decision = evaluateSafety("user_001", "deep", "critical", counters);
    expect(decision.allowed).toBe(true);
    expect(decision.reasoning_mode_final).toBe("deep");
    expect(decision.decision_code).toBe("allowed");
    expect(decision.counters_after.deep_reasoning_today).toBe(1);
  });

  it("evaluateSafety: downgrades deep to standard for low severity", () => {
    const decision = evaluateSafety("user_001", "deep", "low", counters);
    expect(decision.allowed).toBe(true);
    expect(decision.reasoning_mode_final).toBe("quick");  // low → below standard min too
    expect(decision.decision_code).toBe("downgraded_reasoning_mode");
  });

  it("evaluateSafety: blocks when hourly evaluation cap exceeded", () => {
    const cappedCounters: RateLimitCounters = {
      ...counters,
      evaluations_this_hour: DEFAULT_COST_SAFETY_CONFIG.max_evaluations_per_hour,
    };
    const decision = evaluateSafety("user_001", "quick", "medium", cappedCounters);
    expect(decision.allowed).toBe(false);
    expect(decision.decision_code).toBe("blocked_evaluation_cap");
  });

  it("evaluateSafety: downgrades deep to standard when deep cap exceeded", () => {
    const cappedCounters: RateLimitCounters = {
      ...counters,
      deep_reasoning_today: DEFAULT_COST_SAFETY_CONFIG.max_deep_reasoning_per_day,
    };
    const decision = evaluateSafety("user_001", "deep", "critical", cappedCounters);
    expect(decision.allowed).toBe(true);
    expect(decision.reasoning_mode_final).toBe("standard");
    expect(decision.decision_code).toBe("downgraded_reasoning_mode");
  });

  it("isDeepReasoningAllowed: true for high/critical, false for low/medium", () => {
    expect(isDeepReasoningAllowed("critical")).toBe(true);
    expect(isDeepReasoningAllowed("high")).toBe(true);
    expect(isDeepReasoningAllowed("medium")).toBe(false);
    expect(isDeepReasoningAllowed("low")).toBe(false);
  });

  it("getSafetySummary: auto_trade_allowed is always false", () => {
    const summary = getSafetySummary(counters);
    expect(summary.auto_trade_allowed).toBe(false);
    expect(summary.evaluations_remaining_this_hour).toBe(
      DEFAULT_COST_SAFETY_CONFIG.max_evaluations_per_hour
    );
    expect(summary.deep_reasoning_remaining_today).toBe(
      DEFAULT_COST_SAFETY_CONFIG.max_deep_reasoning_per_day
    );
  });

  it("getSafetySummary: decrements correctly after evaluations", () => {
    // Simulate 3 deep reasoning calls
    let c = counters;
    for (let i = 0; i < 3; i++) {
      const d = evaluateSafety("user_001", "deep", "critical", c);
      c = d.counters_after;
    }
    const summary = getSafetySummary(c);
    expect(summary.deep_reasoning_remaining_today).toBe(
      DEFAULT_COST_SAFETY_CONFIG.max_deep_reasoning_per_day - 3
    );
  });

  it("createRateLimitCounters initializes with zero counts", () => {
    const c = createRateLimitCounters("user_test");
    expect(c.user_id).toBe("user_test");
    expect(c.evaluations_this_hour).toBe(0);
    expect(c.deep_reasoning_today).toBe(0);
    expect(c.standard_reasoning_today).toBe(0);
  });
});
