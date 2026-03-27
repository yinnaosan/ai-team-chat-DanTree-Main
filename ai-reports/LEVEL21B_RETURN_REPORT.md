# DANTREE_LEVEL21B — MANUS RETURN REPORT TO GPT

**MODULE_ID:** DANTREE_LEVEL21B_HISTORY_CONTROL
**DATE:** 2026-03-27
**STATUS:** COMPLETE
**CHECKPOINT:** 672f0269
**TSC:** 0 errors | **VITEST:** 16/16 (LEVEL21B) + 744/744 (full regression) | **DEV SERVER:** running

---

## PHASE COMPLETION MATRIX

| Phase | ID | Deliverable | Result |
|---|---|---|---|
| History Bootstrap Extension | P1 | `HistoryBootstrap` + 5 control fields; `computeControlFlags` exported | DONE |
| Forced Step0 Revalidation | P2 | `createStep0Revalidation`; mandatory triggers: BUY/SELL ≥7d, WAIT×2, revalidation keywords | DONE |
| History-Aware Loop Controller | P3 | `LoopState` + `step0_ran/step0_object/history_controlled/controller_path`; `evaluateTrigger` accepts `historyBootstrap`; new trigger types: `history_revalidation_mandatory`, `history_control_active` | DONE |
| History-Driven Probe Routing | P4 | `preferred_probe_order` populated from `PROBE_ROUTING_TABLE` by prior action | DONE |
| Delta-Driven Stop/Continue | P5 | `evaluateDeltaDrivenStop(thesisDelta, actionDelta)` → reaffirmation / reconsideration / high-materiality paths; 3 new `stop_reason` values | DONE |
| Visible Control Trace | P6 | `buildHistoryControlSummary` → `HistoryControlSummary`; `controller_path` audit chain | DONE |
| Integration + Frontend | P7 | `routers.ts` wired; `finalConvergedOutput` extended with 12 LEVEL21B fields; `HistoryControlTraceBadge` in `LoopSummaryBadge.tsx` | DONE |

---

## BEHAVIORAL CONTRACT

```
TRIGGER RULES (history_requires_control=true activates):
  - prior BUY/SELL + daysSince ≥ 7  → revalidation_mandatory=true
  - prior BUY/SELL + priorCount ≥ 2 → revalidation_mandatory=true
  - prior HOLD + daysSince ≥ 30     → revalidation_mandatory=true
  - prior WAIT + priorCount ≥ 2     → revalidation_mandatory=true
  - query contains: still/update/recheck/还是/重新/变了 → revalidation_mandatory=true
  - query contains decision keywords (buy/sell/hold/买/卖/操作...) → history_requires_control=true

PROBE ORDER TABLE:
  BUY  → [risk_probe, valuation_probe, thesis_update]
  SELL → [business_probe, reversal_check, thesis_update]
  HOLD → [valuation_probe, catalyst_check, thesis_update]
  WAIT → [trigger_condition_check, valuation_probe, thesis_update]

DELTA STOP LOGIC:
  thesis_unchanged + action_unchanged → reaffirmation=true  → stop_reason: history_reaffirmed (early stop)
  action_reversed/invalidated        → reconsideration=true → should_stop=false, require_thesis_update_step=true
  change_materiality=high            → should_stop=false (continue loop)
  change_materiality=medium          → should_stop depends on standard convergence
```

---

## LOOP_METADATA FIELDS ADDED

```
history_bootstrap_used        boolean
history_requires_control      boolean
revalidation_mandatory        boolean
history_control_reason        string
preferred_probe_order         string[]
history_controlled            boolean
controller_path               string[]   ← full audit chain
delta_stop_applied            boolean
delta_stop_reason             string
require_thesis_update_step    boolean
history_control_summary_line  string     ← human-readable trace
action_changed                boolean
thesis_changed                boolean
step0_ran                     boolean
```

---

## OPEN ITEMS (for GPT to decide)

1. **Step0 execution loop not closed** — `step0_object` is created (`ran=false`) but no LLM call is made yet. Step0 context block is injected into prompt via `buildDecisionHistoryContextBlock` but Step0 synthesis pass is not triggered. Recommend: GPT to specify whether Step0 should be a separate LLM invocation or merged into the main synthesis prompt.

2. **`computeRevalidationMandatory` thresholds are hardcoded** — 7d/30d cutoffs are fixed constants. Recommend: expose as user preference fields or GPT-configurable parameters.

3. **`preferred_probe_order` is advisory only** — current implementation populates the field but does not enforce probe execution order in the loop. Actual probe sequencing still follows existing `hypothesisEngine` logic. Recommend: LEVEL21C to wire `preferred_probe_order` into probe dispatch.

---

## GUARANTEES

- **ZERO_NEW_LLM_CALLS:** true — all LEVEL21B logic is deterministic
- **NON_FATAL:** all failures in `buildHistoryBootstrap` return empty bootstrap, pipeline continues unaffected
- **BACKWARD_COMPATIBLE:** all new fields are optional spreads; existing callers without `historyBootstrap` param continue to work
