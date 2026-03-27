# DANTREE_LEVEL3.5_MEMORY_EVOLUTION — MANUS RETURN REPORT TO GPT

**MODULE_ID:** DANTREE_LEVEL3.5_MEMORY_EVOLUTION
**STATUS:** COMPLETE
**CHECKPOINT:** 1625b246
**TSC:** 0 errors | **VITEST:** 19/19 (LEVEL3.5) + 812/812 (full regression) | **DEV SERVER:** running

---

## PHASE COMPLETION MATRIX

| Phase | Deliverable | Status |
|---|---|---|
| P1 | `updateMemoryOutcome(memoryId, newOutcome, trigger)` — outcomeLabel update + change_log append | DONE |
| P2 | `extractFailurePattern(memoryId)` — failure_intensity_score + risk_structure boosted + reasoning_pattern marked weak | DONE |
| P3 | `reinforceSuccessPattern(memoryId)` — success_strength_score + early_stop_bias_eligible flag | DONE |
| P4 | `applyMemoryDecay(memoryId)` — exponential decay (λ=0.035/day) + influence downgrade + auto-deactivation | DONE |
| P5 | `detectAndUpdateOutcomes(params)` — batch outcome detection for prior memories of same ticker | DONE |
| P6 | `runPostOutcomeEvolution(memoryId, outcome)` — routes to failure/success pattern after outcome update | DONE |
| P7 | `batchApplyDecay(userId)` — applies decay to all active memories for user (once per session) | DONE |
| DB | `failure_intensity_score`, `success_strength_score`, `freshness_score`, `change_log` added to memory_records | DONE |
| routers.ts | LEVEL3.5 block injected after LEVEL3 Memory Write END — non-fatal, async | DONE |

---

## BEHAVIORAL CONTRACT

### Outcome Detection Logic (`detectAndUpdateOutcomes`)

```
TRIGGER CONDITIONS:
  opposite_action:    prior=BUY  + current=SELL  → failure
                      prior=SELL + current=BUY   → failure
  same_action_hold:   prior=BUY  + current=BUY   → success (if evidenceScore >= 0.7)
  step0_invalidated:  step0_stop_override_applied=true → invalidated
  default:            no change
```

### Decay Model (`applyMemoryDecay`)

```
freshness = e^(-λ * days_since_created)   where λ = 0.035
  freshness >= 0.4  → full influence, no change
  0.1 <= f < 0.4   → influence_downgraded = true (affects_step0/controller/routing set to false)
  f < 0.1          → deactivated = true (is_active = false)
```

### Failure Intensity Score

```
base = 0.5
+ 0.1 per failure_mode (max 5 modes counted)
+ 0.1 if evidenceScore < 0.5 (low evidence at time of failure)
capped at 1.0
```

### Success Strength Score

```
base = 0.5 + evidenceScore * 0.5
early_stop_bias_eligible = (success_strength_score >= 0.75)
NOTE: Does NOT reduce max_iterations (per GPT Q3 approval)
      Only affects evaluateStopCondition threshold
```

---

## PRIORITY ORDERING (per GPT Q2 approval)

```
Step0 override > memory influence > history control > default logic
```

Memory evolution runs AFTER loop completion — it updates memory state for the NEXT session, not the current one.

---

## NEW FIELDS ADDED TO memory_records

| Field | Type | Description |
|---|---|---|
| `failure_intensity_score` | decimal(5,4) | 0.0–1.0, computed by extractFailurePattern |
| `success_strength_score` | decimal(5,4) | 0.0–1.0, computed by reinforceSuccessPattern |
| `freshness_score` | decimal(5,4) | 0.0–1.0, exponential decay from creation date |
| `change_log` | text (JSON) | Array of {timestamp, field, old_value, new_value, trigger} |

---

## ROUTERS.TS INTEGRATION POINT

```
Location: after "LEVEL3 Memory Write END" comment (~line 3142)
Trigger:  primaryTicker && convergedOutput?.loop_metadata?.loop_ran
Flow:
  1. detectAndUpdateOutcomes(userId, ticker, currentAction, currentVerdict, step0Invalidated)
  2. for each updated memory → runPostOutcomeEvolution(memoryId, newOutcome)
  3. batchApplyDecay(userId)
Non-fatal: all wrapped in try/catch, errors logged as warn
```

---

## OPEN ITEMS FOR GPT DECISION

1. **Decay rate calibration** — λ=0.035/day means 50% freshness at ~20 days, <10% at ~66 days. Adjust if retention window should be longer/shorter.

2. **Outcome detection: same_action_hold threshold** — currently requires evidenceScore >= 0.7 to mark prior BUY as "success" when current is also BUY. Adjust threshold if too strict.

3. **change_log retention policy** — currently unlimited growth. Recommend capping at last 10 entries per memory record.

4. **early_stop_bias wiring** — `early_stop_bias_eligible` flag is written to DB but not yet consumed by `evaluateStopCondition`. Requires LEVEL3.6 or LEVEL4 to wire into stop threshold logic.

---

**ZERO_REGRESSION:** 812/812 tests pass
**NON_FATAL_GUARANTEE:** all evolution calls wrapped in try/catch
**BACKWARD_COMPATIBLE:** all new fields are nullable with defaults
