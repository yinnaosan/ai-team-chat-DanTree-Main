# DANTREE LEVEL4.1 — DB + Scheduler Return Report

**MODULE_ID:** `DANTREE_LEVEL41_DB_SCHEDULER`
**EXECUTED_BY:** Manus
**DATE:** 2026-03-27
**CHECKPOINT:** pending (saved after this report)
**DECISION:** GO ✅

---

## 1. OBJECTIVE

Upgrade LEVEL4 execution layer from in-memory validation logic to a **persistent, schedulable, auditable operational system**:

- DB-backed watch items with full lifecycle management
- Append-only audit trail (no deletes)
- Batch evaluation scheduler with dry_run + concurrency lock
- tRPC Internal API (14 procedures)
- Alert dedup / cooldown (4-hour window)
- Recovery/Idempotency guarantees

---

## 2. IMPLEMENTATION_STATUS

| Phase | Description | Files | Status |
|-------|-------------|-------|--------|
| Phase 1 | DB Schema — 5 new tables | `drizzle/schema.ts` + migration SQL | ✅ |
| Phase 2 | Repository Layer — 5 Repositories | `watchRepository.ts` | ✅ |
| Phase 3 | Service Layer — WatchService, TriggerEvaluationService, AlertWorkflowService, SchedulerService | `watchService.ts` | ✅ |
| Phase 4 | tRPC Internal API — 14 procedures | `server/routers.ts` (watchlist router) | ✅ |
| Phase 5 | Observability — audit timeline, scheduler run history | `watchService.ts` | ✅ |
| Phase 6 | Recovery/Idempotency — alert dedup, cooldown, concurrency lock | `watchService.ts` | ✅ |
| Phase 7 | Validation — 27 tests across 5 test cases | `level41.test.ts` | ✅ |

---

## 3. DB_SCHEMA

### New Tables (5)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `watch_items` | Watch item lifecycle | `watch_id`, `user_id`, `primary_ticker`, `watch_status`, `current_action_bias` |
| `watch_audit_log` | Append-only state transitions | `watch_id`, `event_type`, `from_status`, `to_status`, `trigger_id`, `action_id` |
| `watch_alerts` | Deduped alerts with cooldown | `alert_id`, `watch_id`, `severity`, `cooldown_key`, `workflow_status` |
| `watch_workflows` | Workflow lifecycle | `workflow_id`, `watch_id`, `workflow_step`, `status` |
| `scheduler_runs` | Batch evaluation history | `run_id`, `run_status`, `watches_scanned`, `triggers_fired`, `dry_run` |

---

## 4. NON_NEGOTIABLE_RULES

```
auto_trade_allowed:    ALWAYS false (hardcoded — no exceptions)
trigger_engine:        deterministic — zero LLM calls
audit_log:             append-only — no delete/update functions exist
scheduler_dry_run:     produces zero DB writes
concurrency_lock:      single scheduler run at a time (in-memory lock)
alert_cooldown:        4-hour dedup window per (watch_id, trigger_type)
```

---

## 5. TRPC_API (14 procedures)

| Procedure | Type | Description |
|-----------|------|-------------|
| `watchlist.create` | mutation | Create new watch item |
| `watchlist.list` | query | List all watches for current user |
| `watchlist.get` | query | Get single watch by ID |
| `watchlist.pause` | mutation | Pause watch + audit event |
| `watchlist.archive` | mutation | Archive watch + audit event |
| `watchlist.reactivate` | mutation | Reactivate paused/archived watch |
| `watchlist.auditTimeline` | query | Get audit trail for watch |
| `watchlist.alerts` | query | Get alerts for watch |
| `watchlist.workflows` | query | Get workflows for watch |
| `watchlist.dryRunBatch` | mutation | Trigger dry-run batch evaluation |
| `watchlist.latestRun` | query | Get latest scheduler run |
| `watchlist.recentRuns` | query | List recent scheduler runs |

---

## 6. SCHEDULER_DESIGN

```
batchEvaluateTriggers(snapshotProvider, config):
  1. Acquire concurrency lock (throw if already running)
  2. Create SchedulerRun record
  3. Fetch active watches (bounded by batch_size)
  4. Fetch market snapshots for all tickers
  5. For each watch:
     a. Skip if paused/archived
     b. Skip if within evaluation_cooldown
     c. Run deterministic trigger evaluation (LEVEL4 engine)
     d. If triggered: build action recommendation → dedup check → create alert + workflow
     e. Write audit event (unless dry_run)
  6. Finalize SchedulerRun with summary
  7. Release lock

Safety rails:
  - max_runtime_ms: 30,000ms (abort if exceeded)
  - max_errors_before_abort: 20
  - batch_size: 50 (configurable)
  - dry_run: no DB writes, no alerts, no audit events
```

---

## 7. VALIDATION

```
TSC:                  0 errors
LEVEL4.1 tests:       27/27 ✅
  TC-L41-1 (WatchService lifecycle):        6/6  ✅
  TC-L41-2 (TriggerEvaluation dry_run):     5/5  ✅
  TC-L41-3 (Scheduler concurrency):         5/5  ✅
  TC-L41-4 (Recovery/Idempotency):          6/6  ✅
  TC-L41-5 (Observability/Audit):           5/5  ✅
Full regression:      926/926 ✅ (53 test files)
```

---

## 8. INTEGRATION_WITH_LEVEL4

LEVEL4.1 is a **persistence layer** on top of LEVEL4 logic:

```
LEVEL4 (in-memory):
  watchlistEngine.ts     → evaluateWatchTrigger()
  actionRecommendationEngine.ts → generateActionRecommendation()
  costSafetyGuard.ts     → evaluateSafety()
  watchlistAudit.ts      → (in-memory audit)

LEVEL4.1 (persistent):
  watchRepository.ts     → DB CRUD for all 5 tables
  watchService.ts        → Orchestration (calls LEVEL4 engines)
  server/routers.ts      → tRPC API (watchlist.*)
  level41.test.ts        → Validation
```

LEVEL4 engines are **reused without modification** — LEVEL4.1 wraps them with persistence.

---

## 9. OPEN ITEMS (awaiting GPT decision)

| ID | Question |
|----|----------|
| OI-L41-1 | Frontend WatchlistPanel — display active watches + trigger status + audit timeline? |
| OI-L41-2 | Cron-based scheduler — wire `batchEvaluateTriggers` to a server-side cron job? |
| OI-L41-3 | Real market snapshot provider — connect to live data APIs (Polygon, Finnhub) for scheduler? |
| OI-L41-4 | Owner notification — notify owner when critical trigger fires? |
| OI-L41-5 | LEVEL5 — what is the next layer? |
| OI-E1 | (carried) LEVEL4 vector embedding — now ready to proceed? |
| OI-P1 | (carried) Expose `setLearningConfigOverride()` as tRPC? |
| OI-P2 | (carried) Surface `early_stop_bias_applied` in frontend badge? |

---

*Report stored at: `ai-reports/DANTREE_LEVEL41_RETURN_REPORT.md`*
