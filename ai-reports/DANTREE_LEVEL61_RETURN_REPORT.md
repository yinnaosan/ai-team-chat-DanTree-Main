# DANTREE LEVEL6.1 — Operational Alpha Persistence
## RETURN PROTOCOL

**MODULE_ID:** `DANTREE_LEVEL6.1_OPERATIONAL_ALPHA`
**EXECUTED_BY:** Manus
**DATE:** 2026-03-28
**CHECKPOINT:** (pending)

---

## 1. IMPLEMENTATION_STATUS

| Phase | Description | File | Status |
|-------|-------------|------|--------|
| Phase 1 | DB Schema — signal_journal + signal_outcome tables | `drizzle/schema.ts` + migration | ✅ |
| Phase 2 | Signal Persistence Repository — persistSignal / persistOutcome / list* | `signalPersistence.ts` | ✅ |
| Phase 3 | Auto-Ingestion Hook — postRunIngestionHook() called after scheduler run | `signalPersistence.ts` | ✅ |
| Phase 4 | Scoring Auto-Update — _syncScoringFromPersistedOutcomes() feeds LEVEL6 EntityScores | `signalPersistence.ts` | ✅ |
| Phase 5 | Failsafe — ingestion failures never interrupt scheduler | `signalPersistence.ts` | ✅ |
| Phase 6 | Validation — 18 tests × 6 test cases | `level61.test.ts` | ✅ |

---

## 2. SCHEMA

```sql
signal_journal (
  signal_id PK, watch_id, ticker, trigger_type, action_type,
  snapshot_quality, memory_influence, learning_influence,
  scheduler_run_id, signal_score_json, created_at
)

signal_outcome (
  outcome_id PK, signal_id FK, horizon,
  price_change_pct, price_direction,
  outcome_score, risk_adjusted_score,
  thesis_status, outcome_label,
  resolved_at, created_at
)
```

---

## 3. INGESTION_PIPELINE

```
Scheduler Run (LEVEL5.1)
  → postRunIngestionHook(runResult)
    → extract usable snapshots from snapshot_details
    → persistSignal() per ticker [dedup: watchId+triggerType+runId]
    → _syncScoringFromPersistedOutcomes()
      → listPersistedOutcomes(limit=200)
      → ingestOutcomesForScoring() [LEVEL6 EntityScores updated]
  → safePostRunIngestion() [ultimate failsafe wrapper]
```

---

## 4. NON_NEGOTIABLE_RULES

```
auto_trade_allowed:    ALWAYS false
ingestion_failsafe:    failures logged in summary.errors, never thrown
dedup:                 same (watchId, triggerType, schedulerRunId) → skip
dry_run:               zero DB writes
scoring_update:        advisory only — does not modify trigger/action logic
```

---

## 5. VALIDATION

```
TSC:              0 errors
LEVEL6.1 tests:   18/18 ✅
Full regression:  1033/1033 ✅ (57 test files)
```

---

## 6. OPEN ITEMS (awaiting GPT decision)

| ID | Question |
|----|----------|
| OI-L61-1 | Expose `persistOutcome()` as tRPC procedure for manual outcome resolution? |
| OI-L61-2 | Frontend Signal Journal view — list recent signals + outcome status? |
| OI-L61-3 | Auto-resolve outcomes after N days using price data from LEVEL5 snapshot? |
| OI-L61-4 | Add `watch_id` FK to signal_outcome for better attribution queries? |
| OI-L61-5 | LEVEL7 — next layer? (portfolio optimization / position sizing / backtesting?) |
| OI-L51-1 | (carried) Mount `startCronScheduler()` to Express startup? |
| OI-L6-2 | (carried) Expose `buildAlphaSurface()` as tRPC procedure? |
| OI-L6-3 | (carried) Frontend Alpha Dashboard? |
| OI-E1 | (carried) Vector embedding — proceed now? |
| OI-P1 | (carried) Expose `setLearningConfigOverride()` as tRPC? |
| OI-P2 | (carried) Surface `early_stop_bias_applied` in frontend badge? |
