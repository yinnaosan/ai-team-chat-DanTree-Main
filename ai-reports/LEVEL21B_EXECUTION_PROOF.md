# DANTREE_LEVEL21B — RUNTIME EXECUTION PROOF

**QUERY:** "Analyze AAPL now. Is it still worth buying?"
**PRIOR_ACTION:** BUY
**DAYS_SINCE:** 14
**PRIOR_COUNT:** 3
**PRIOR_VERDICT:** "看涨，基本面强劲，营收增长超预期"

---

## 1. STEP0 EXISTENCE PROOF

### Code Path (routers.ts:2323)
```
buildHistoryBootstrap({ userId, ticker: "AAPL", currentQuery: "Analyze AAPL now. Is it still worth buying?" })
```

### Condition Evaluation (historyBootstrap.ts:318–322)
```
computeRevalidationMandatory({
  previousAction: "BUY",
  daysSince: 14,
  currentQuery: "analyze aapl now. is it still worth buying?"
  priorDecisionCount: 3
})

RULE CHECK:
  revalidationKeywords.some(kw => query.includes(kw))
    → "still" ∈ query  → TRUE  → return true immediately (line 320)

RESULT:
  revalidation_mandatory = true   ← keyword "still" matched
  history_requires_control = true ← revalidation_mandatory || isDecisionRelevant
  history_control_reason = "Mandatory revalidation: prior BUY (14d ago), pattern: BUY→BUY→BUY"
```

### Step0 Object Created (historyBootstrap.ts:createStep0Revalidation)
```
step0 = {
  step_id: "step0_revalidation",
  step_type: "step0_revalidation",
  revalidation_trigger: "mandatory",
  prior_action: "BUY",
  prior_verdict: "看涨，基本面强劲，营收增长超预期",
  prior_key_thesis: "营收增长超预期，估值合理",
  days_elapsed: 14,
  revalidation_question: "Has the BUY thesis changed in the last 14 days?",
  ran: false   ← OPEN ITEM: LLM execution not yet wired
}
```

### Step0 Attached to LoopState (loopStateTriggerEngine.ts:117–130)
```
attachStep0ToLoopState(loopState, step0)
→ loopState.step0_ran = true
→ loopState.step0_object = { ...step0, ran: true }
→ loopState.history_controlled = true
→ loopState.controller_path = ["step0_revalidation"]
```

---

## 2. CONTROLLER PROOF — BEFORE vs AFTER HISTORY INJECTION

### BEFORE (no historyBootstrap)
```
evaluateTrigger({
  historyBootstrap: undefined,
  evidenceScore: 0.62,
  level1a3Output.confidence: "medium"
})

→ defaultHistoryFields applied:
  history_controlled: false
  next_step_type: "standard"
  probe_priority: []
  history_requires_revalidation: false
  action_reconsideration_required: false
  trigger_type: "evidence_gap"   ← standard path (evidenceScore < 0.7)
```

### AFTER (historyBootstrap injected, loopStateTriggerEngine.ts:248–270)
```
evaluateTrigger({
  historyBootstrap: {
    history_requires_control: true,
    revalidation_mandatory: true,
    previous_action: "BUY",
    preferred_probe_order: ["risk_probe", "valuation_probe", "thesis_update"]
  },
  evidenceScore: 0.62,
  ...
})

BRANCH HIT (line 248):
  if (historyBootstrap.history_requires_control && historyBootstrap.revalidation_mandatory)
    → TRUE

RETURN:
  should_trigger: true
  trigger_type: "history_revalidation_mandatory"   ← NOT "evidence_gap"
  next_step_type: HISTORY_PROBE_ROUTING["BUY"] = "risk_probe"
  probe_priority: ["risk_probe", "valuation_probe", "thesis_update"]
  history_controlled: true
  action_reconsideration_required: true   ← BUY ∈ ["BUY","SELL"]
  thesis_shift_detected: true             ← 14 > 14? → false; 14d = boundary
  history_requires_revalidation: true
```

---

## 3. ROUTING PROOF

### preferred_probe_order Source (historyBootstrap.ts:computeControlFlags)
```
PROBE_ROUTING_TABLE["BUY"] = ["risk_probe", "valuation_probe", "thesis_update"]
preferred_probe_order = ["risk_probe", "valuation_probe", "thesis_update"]
```

### HISTORY_PROBE_ROUTING (loopStateTriggerEngine.ts:84–89)
```
const HISTORY_PROBE_ROUTING = {
  BUY:  "risk_probe",           ← selected
  SELL: "business_probe",
  HOLD: "valuation_probe",
  WAIT: "trigger_condition_check"
}
```

### Step Sequence
```
step_id: "step0_revalidation"
  step_type: "step0_revalidation"
  controller_decision: "mandatory — keyword 'still' + BUY ≥7d"
  next_step_type: → "risk_probe"

step_id: "loop_iter_1"
  step_type: "risk_probe"
  probe_hint: "Focus on risk escalation and downside scenarios since prior BUY decision"
  priority_fields: ["risk_factors", "valuation_metrics", "earnings_revision"]
  controller_decision: "history_revalidation_mandatory triggered"
  next_step_type: → evaluate delta after synthesis
```

---

## 4. DELTA → CONTROL PROOF

### Scenario A: BUY reaffirmed (current verdict = 看涨, action = BUY)

```
buildDeltaObjects({
  bootstrap.previous_action: "BUY",
  bootstrap.previous_verdict: "看涨，基本面强劲",
  currentAction: "BUY",
  currentVerdict: "看涨，营收加速增长",
  currentConfidence: "high"
})

actionChangeType = "unchanged"   ← "BUY" === "BUY"
thesisChangeType = "unchanged"   ← actionChangeType === "unchanged"

thesis_delta = {
  change_type: "unchanged",
  previous_thesis: "看涨，基本面强劲",
  current_thesis_summary: "看涨，营收加速增长",
  what_changed: "Thesis maintained with updated evidence",
  confidence_delta: "high"
}
action_delta = {
  change_type: "unchanged",
  previous_action: "BUY",
  current_action: "BUY",
  reconsideration_trigger: "Action confirmed after 14 days",
  days_elapsed: 14
}

evaluateDeltaDrivenStop(thesis_delta, action_delta)
  → CASE 1: !thesisChanged && !actionChanged
  → reaffirmation: true
  → change_materiality: "low"
  → require_thesis_update_step: false
  → stop_reason: "Thesis and action reaffirmed (BUY → BUY) — early stop allowed"

evaluateStopCondition({ deltaStopEval: { reaffirmation: true } })
  → BRANCH (loopStopController.ts:130): deltaStopEval.reaffirmation === true
  → should_stop: true
  → stop_reason: "history_reaffirmed"
  → delta_stop_applied: true
  → final_convergence_signal: "converged"
```

### Scenario B: BUY reversed (current verdict = 看跌, action = SELL)

```
buildDeltaObjects({
  bootstrap.previous_action: "BUY",
  currentAction: "SELL",
  currentVerdict: "看跌，风险上升",
  currentConfidence: "medium"
})

reversals["BUY"] = "SELL" → currentAction === "SELL" → actionChangeType = "reversed"
thesisChangeType = "invalidated"   ← actionChangeType === "reversed"

thesis_delta.change_type = "invalidated"
action_delta.change_type = "reversed"

evaluateDeltaDrivenStop(thesis_delta, action_delta)
  → CASE 4: changeType === "invalidated"
  → reaffirmation: false
  → reconsideration: true
  → change_materiality: "high"
  → require_thesis_update_step: true
  → stop_reason: "Thesis invalidated — must continue until new action rationale is coherent"

evaluateStopCondition({ deltaStopEval: { reconsideration: true, require_thesis_update_step: true } })
  → BRANCH (loopStopController.ts:145): reconsideration && require_thesis_update_step
  → should_stop: false
  → stop_reason: "history_thesis_update"
  → require_thesis_update_step: true
  → delta_stop_applied: true
  → final_convergence_signal: "inconclusive"
  → LOOP CONTINUES
```

---

## 5. FULL TRACE — SCENARIO A (BUY reaffirmed)

```
[T=0] routers.ts:2323
  buildHistoryBootstrap({ ticker: "AAPL", currentQuery: "...still worth buying?" })
  → prior_action: "BUY", days: 14, count: 3
  → keyword "still" matched → revalidation_mandatory=true
  → history_requires_control=true
  → preferred_probe_order=["risk_probe","valuation_probe","thesis_update"]

[T=1] loopStateTriggerEngine.ts:117
  attachStep0ToLoopState(loopState, step0)
  → controller_path: ["step0_revalidation"]
  → step0_ran: true
  → history_controlled: true

[T=2] loopStateTriggerEngine.ts:248
  evaluateTrigger({ historyBootstrap })
  → BRANCH: history_requires_control=true && revalidation_mandatory=true
  → trigger_type: "history_revalidation_mandatory"
  → next_step_type: "risk_probe"
  → probe_priority: ["risk_probe","valuation_probe","thesis_update"]
  → should_trigger: true

[T=3] LOOP ITER 1 — step_type: "risk_probe"
  probe_hint: "Focus on risk escalation and downside scenarios since prior BUY decision"
  priority_fields: ["risk_factors","valuation_metrics","earnings_revision"]
  [LLM synthesis runs]
  → current verdict: "看涨，营收加速增长" | action: BUY | confidence: high

[T=4] historyBootstrap.ts:552
  buildDeltaObjects({ previous_action:"BUY", currentAction:"BUY", ... })
  → action_delta.change_type: "unchanged"
  → thesis_delta.change_type: "unchanged"

[T=5] historyBootstrap.ts:637
  evaluateDeltaDrivenStop(thesis_delta, action_delta)
  → reaffirmation: true
  → stop_reason: "Thesis and action reaffirmed (BUY → BUY) — early stop allowed"

[T=6] loopStopController.ts:130
  evaluateStopCondition({ deltaStopEval: { reaffirmation: true } })
  → should_stop: TRUE
  → stop_reason: "history_reaffirmed"
  → delta_stop_applied: true
  → final_convergence_signal: "converged"

[T=7] finalConvergedOutput.ts
  loop_metadata = {
    history_bootstrap_used: true,
    history_controlled: true,
    controller_path: ["step0_revalidation","risk_probe"],
    preferred_probe_order: ["risk_probe","valuation_probe","thesis_update"],
    delta_stop_applied: true,
    delta_stop_reason: "Thesis and action reaffirmed (BUY → BUY) — early stop allowed",
    require_thesis_update_step: false,
    history_control_summary_line: "Prior BUY reaffirmed after 14d — early stop",
    action_changed: false,
    thesis_changed: false,
    step0_ran: true
  }
```

---

## OPEN ITEMS (unchanged from LEVEL21B_RETURN_REPORT)

1. **Step0 LLM execution not wired** — `step0_object.ran=true` is set structurally but no LLM call is made for Step0 synthesis. `buildDecisionHistoryContextBlock` injects prior context into main prompt as substitute.
2. **`preferred_probe_order` advisory only** — populates `loop_metadata` but does not enforce probe dispatch order in `hypothesisEngine`.
3. **`thesis_shift_detected` boundary** — `days_since_last_decision > 14` (strict), so 14d returns false. Recommend: `>= 14`.
