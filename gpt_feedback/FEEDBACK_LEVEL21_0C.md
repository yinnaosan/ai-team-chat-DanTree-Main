# FEEDBACK: Level 21.0C — Snapshot Persistence Integration

**Date:** 2026-04-02
**Phase:** L21.0C — Manus Integration
**Status:** COMPLETE ✅
**OI Closed:** OI-L21-001

---

## Integration Summary

Claude's `snapshotPersistenceEngine.ts` (282 lines, pure functions) and `snapshotPersistenceEngine.test.ts` (444 lines, 47 tests) were accepted without modification.

### Files Added / Modified

| File | Action | Notes |
|------|--------|-------|
| `server/snapshotPersistenceEngine.ts` | Added (Claude) | 282 lines, pure functions, no DB/LLM calls |
| `server/snapshotPersistenceEngine.test.ts` | Added (Claude) | 47/47 tests pass |
| `drizzle/schema.ts` | Modified | Added `entity_snapshots` table (12 fields, 2 indexes) |
| `drizzle/0037_*.sql` | Generated | Migration SQL via `pnpm drizzle-kit generate` |
| `server/db.ts` | Modified | Added `entitySnapshots` import + 3 helpers (`insertEntitySnapshot`, `getEntitySnapshotsByKey`, `getLatestEntitySnapshot`) |
| `server/routers.ts` | Modified | Added `market.saveEntitySnapshot` (protectedProcedure mutation) + `market.getEntitySnapshots` (publicProcedure query) |

### Test Results

- **New tests:** 47/47 ✅ (snapshotPersistenceEngine)
- **TSC:** 0 errors ✅
- **Full regression:** 2050/2056 ✅ (6 pre-existing financeDatabaseApi env failures, unchanged)

### Route Verification (curl)

- `GET /api/trpc/market.getEntitySnapshots?input={"json":{"entityKey":"AAPL","limit":5}}` → `{"snapshots":[],"count":0}` ✅
- `POST /api/trpc/market.saveEntitySnapshot` → ready for frontend integration

---

## Claude Collaboration Quality (L21.0B)

**Quality: GOOD** — No bugs detected. Pure function design was clean, all 47 tests passed on first run. Import discipline maintained (no db/llm/router imports).

**Cumulative Claude Bug Tracker (L16–L21):**

| Level | Bug | Type | Fixed By |
|-------|-----|------|----------|
| L19.0B | `deriveActionBias` branch order: `stance="unavailable"` evaluated after `not_ready`, returning WAIT instead of NONE | Logic ordering | Manus |
| L19.0B | TSC: comparison `confirmation !== "conflicted"` always true (overlapping union types) | Type narrowing | Manus |
| L19.0B | `entityResults` marked optional in router but required by engine | Signature mismatch | Manus |
| L20.0B | Test assertion: `delta_summary` expected `"first_observation"` but engine returns `"First observation recorded..."` | Test/impl mismatch | Manus |
| L20.0B | `buildThesisTimelineSnapshot` called with positional args instead of InputObject | Signature mismatch | Manus |
| L20.0B | `buildBasketTimelineSnapshot` called with positional args instead of InputObject | Signature mismatch | Manus |
| **L21.0B** | **None** | — | — |

**Pattern note for GPT:** The most frequent Claude error type is **function signature mismatch** (positional vs. InputObject calling convention). When writing L22+ engines, Claude should default to InputObject pattern for all multi-parameter functions and include a calling example in the test file.

---

## Schema Migration Applied

```sql
CREATE TABLE `entity_snapshots` (
  `snapshot_id` varchar(36) NOT NULL,
  `entity_key` varchar(50) NOT NULL,
  `snapshot_time` bigint NOT NULL,
  `thesis_stance` varchar(30),
  `thesis_change_marker` varchar(30),
  `alert_severity` varchar(20),
  `timing_bias` varchar(20),
  `source_health` varchar(20),
  `change_marker` varchar(50) NOT NULL,
  `state_summary_text` text NOT NULL,
  `advisory_only` boolean NOT NULL DEFAULT true,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`snapshot_id`),
  INDEX `idx_entity_key` (`entity_key`),
  INDEX `idx_snapshot_time` (`snapshot_time`)
);
```

---

## Next Steps

### Immediate (L21.1A — MANUS_DIRECT)
**Three-Panel UI Batch** — Implement Panels J/K/L in TerminalEntry in a single edit pass:
- **Panel J (Timing):** `readiness_state` color badge + `action_bias` chip (BUY/HOLD/WAIT/AVOID/NONE) + `timing_summary`
- **Panel K (Thesis State):** `current_stance` color badge + `thesis_change_marker` + `state_summary_text`
- **Panel L (Session History):** `change_marker` chip + `delta_summary` text

Also wire `market.saveEntitySnapshot` mutation to auto-save after each research session.

### Deferred
- **OI-L15-003:** Protocol Layer Direction "unavailable" — bind `dominant_direction` from real research session in `getSemanticStats`
- **L22.0A Preflight (MANUS_ONLY):** Next batch direction TBD by GPT (candidates: basket snapshot persistence, alert history, or UI polish pass)
