# L21.0A — Snapshot Persistence / Memory Bridge Phase 1 Preflight

**Date:** 2026-04-01
**Type:** DISCOVERY-ONLY — No production files modified
**Scope:** Snapshot Persistence / Memory Bridge Phase 1

---

## 1. Best Existing Result Layers for Snapshot Persistence Inputs

| Engine | Output Type | Persistence Suitability | Key Fields |
|--------|-------------|------------------------|------------|
| `thesisStateEngine.ts` | `EntityThesisState` (12 fields) | **PRIMARY** — richest entity-level state | current_stance, thesis_change_marker, evidence_state, gate_state, fragility_state, source_state, highest_alert_severity, state_summary_text |
| `sessionHistoryEngine.ts` | `ThesisTimelineSnapshot` (9 fields) | **PRIMARY** — already structured for snapshot | entity, thesis_stance, thesis_change_marker, alert_severity, timing_bias, source_health, state_summary_text |
| `alertEngine.ts` | `AlertSummary` (7 fields) | **SECONDARY** — severity + count | alert_count, highest_severity, has_critical, alert_types |
| `executionTimingEngine.ts` | `ExecutionTimingResult` (9 fields) | **SECONDARY** — timing bias | readiness_state, action_bias, timing_risk, timing_summary |
| `portfolioAnalysisEngine.ts` | `PortfolioAnalysisResult` | **TERTIARY** — basket-level only | basket_summary, concentration_risk, shared_fragility |
| `sessionHistoryEngine.ts` | `SessionHistoryResult` | **PRIMARY** — delta comparison | change_marker, delta_summary, current_snapshot, previous_snapshot |

**Recommended Phase 1 persistence inputs:** `ThesisTimelineSnapshot` (from `sessionHistoryEngine`) as the canonical snapshot payload, enriched with `alert_severity` from `AlertSummary` and `action_bias` from `ExecutionTimingResult`.

---

## 2. Recommended New File and Storage Layer

### New File: `server/snapshotPersistenceEngine.ts`

**Location:** `server/snapshotPersistenceEngine.ts` (pure function layer + db helpers)

**Architecture decision:** Use **Drizzle schema + db.ts helpers** (NOT S3 storage).

**Rationale:**
- `server/storage.ts` (`storagePut`/`storageGet`) is designed for file bytes (images, documents), not structured analytical records. Using S3 for snapshot records would require JSON serialization + URL tracking with no query capability.
- `drizzle/schema.ts` already has `memoryRecords` table with `memoryType: "thesis_snapshot"` enum value — this is an explicit design hook for exactly this use case.
- `db.ts` already has `getDb()` + Drizzle ORM patterns — adding `insertEntitySnapshot()` and `getEntitySnapshotHistory()` helpers follows established patterns.
- The existing `portfolioSnapshot` table (schema line 678) demonstrates the project already uses Drizzle for snapshot persistence.

### Schema Strategy: Extend `memoryRecords` vs. New Table

**Recommendation: NEW TABLE `entity_snapshots`** (not extending `memoryRecords`).

**Reason:** `memoryRecords` is designed for reasoning-grade memory (thesis_core, riskStructure, counterarguments, failureModes) — a different semantic layer. A new `entity_snapshots` table keeps Phase 1 clean and avoids polluting the reasoning memory layer.

---

## 3. L21.0B Classification

**CLAUDE_NARROW**

**Rationale:**
- Schema design (new table with 10 fields) requires careful type safety
- `db.ts` helper functions (insertEntitySnapshot, getEntitySnapshotHistory, getLatestEntitySnapshot) need precise Drizzle ORM patterns
- ≥30 tests required for persistence helpers + snapshot derivation
- Pure function layer (`snapshotPersistenceEngine.ts`) + db helpers is exactly the CLAUDE_NARROW pattern used in L16–L20

---

## 4. Minimal Persistence Objects for Phase 1

### Object 1: `EntitySnapshotRecord` (entity-level)
Persisted to new `entity_snapshots` table.

### Object 2: `BasketSnapshotRecord` (basket-level, optional in Phase 1)
Can be deferred to Phase 2 if scope needs to be minimized.

**Phase 1 recommendation: Entity snapshots only.** Basket snapshots can be added in Phase 2 once entity persistence is validated.

---

## 5. Minimal Fields for Phase 1 Objects

### `EntitySnapshotRecord` — Recommended Fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `snapshot_id` | varchar(36) PK | UUID generated | Unique identifier |
| `entity_key` | varchar(20) | `ThesisTimelineSnapshot.entity` | Ticker symbol |
| `snapshot_time` | bigint | UTC timestamp ms | `Date.now()` |
| `thesis_stance` | varchar(20) nullable | `ThesisTimelineSnapshot.thesis_stance` | bullish/bearish/neutral/unavailable |
| `thesis_change_marker` | varchar(30) nullable | `ThesisTimelineSnapshot.thesis_change_marker` | ThesisChangeMarker enum |
| `alert_severity` | varchar(20) nullable | `ThesisTimelineSnapshot.alert_severity` | AlertSeverity enum |
| `timing_bias` | varchar(10) nullable | `ThesisTimelineSnapshot.timing_bias` | ActionBias enum |
| `source_health` | varchar(20) nullable | `ThesisTimelineSnapshot.source_health` | SourceState enum |
| `change_marker` | varchar(30) | `SessionHistoryResult.change_marker` | SnapshotChangeMarker enum |
| `state_summary_text` | text | `ThesisTimelineSnapshot.state_summary_text` | Human-readable summary |
| `advisory_only` | boolean | hardcoded true | Phase 1 safety flag |
| `created_at` | bigint | UTC timestamp ms | Insert time |

**Total: 12 fields** — exactly matching the `snapshot_id, entity_key, basket_key, snapshot_time, thesis_state_summary, alert_severity, timing_bias, source_health, change_marker, advisory_only` hint from the preflight spec, plus `thesis_stance`, `thesis_change_marker`, and `state_summary_text` for richer query capability.

---

## 6. Phase 1 Scope: Backend/Query-Only First

**Recommendation: Backend + query only (no UI in Phase 1).**

**Rationale:**
- Phase 1 establishes the persistence bridge — the write path (`insertEntitySnapshot`) and read path (`getEntitySnapshotHistory`, `getLatestEntitySnapshot`) need to be validated independently before UI integration.
- TerminalEntry.tsx is already 824 lines with 9 panels. Adding a history panel before the persistence layer is tested would create a fragile dependency.
- UI integration (Panel K: Snapshot History) should be Phase 2 (L21.1A MANUS_DIRECT), after backend is confirmed stable.

---

## 7. Blockers, Hidden Coupling, Schema Risks, Storage Risks

### No Hard Blockers

### Hidden Coupling Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `memoryRecords` already has `memoryType: "thesis_snapshot"` enum — if Phase 1 uses a new table instead, the enum value becomes orphaned | LOW | Document the distinction: `memoryRecords.thesis_snapshot` = reasoning-grade memory; `entity_snapshots` = analytical state snapshot |
| `portfolioSnapshot` table uses `portfolioId` FK — new `entity_snapshots` table must NOT use a FK to avoid coupling to portfolio pipeline | LOW | Use `entity_key` (varchar) as the lookup key, no FK |
| `sessionHistoryEngine.ts` routes (`getSessionHistory`, `getBasketHistory`) currently accept `previous` as `z.any()` — if Phase 1 starts reading previous snapshots from DB, the route input schema needs updating | MEDIUM | Phase 1 write-only first; read path can use a separate `market.getSnapshotHistory` query |
| `advisory_only: true` is hardcoded in `sessionHistoryEngine.ts` — Phase 1 must propagate this flag to the DB record | LOW | Include `advisory_only` as a non-nullable boolean column, always `true` in Phase 1 |

### Schema Risks
- New table migration required — `pnpm drizzle-kit generate` + `webdev_execute_sql` workflow applies
- `entity_key` should be indexed for efficient history queries: `index("entity_key_idx").on(t.entityKey)`
- `snapshot_time` should be indexed for time-range queries

### Storage Risks
- None — using Drizzle/MySQL, not S3

---

## 8. Confirmation: No Production Files Modified

**CONFIRMED.** Zero production files were modified in this preflight.

Files read (discovery only):
- `server/sessionHistoryEngine.ts` ✓
- `server/executionTimingEngine.ts` ✓
- `server/thesisStateEngine.ts` ✓
- `server/alertEngine.ts` ✓
- `server/portfolioAnalysisEngine.ts` ✓
- `server/multiEntityComparisonEngine.ts` ✓
- `server/outputGatingEngine.ts` ✓
- `server/evidenceValidator.ts` ✓
- `server/sourceSelectionEngine.ts` ✓
- `server/watchlistEngine.ts` ✓
- `server/routers.ts` ✓
- `server/storage.ts` ✓
- `server/db.ts` ✓
- `server/semantic_protocol.ts` ✓
- `server/semantic_aggregator.ts` ✓
- `drizzle/schema.ts` ✓
- `client/src/pages/TerminalEntry.tsx` ✓

---

## L21.0B Task Specification (for Claude)

**Classification: CLAUDE_NARROW**

**Deliverables:**
1. `server/snapshotPersistenceEngine.ts` — pure function layer
   - `buildEntitySnapshotRecord(snapshot: ThesisTimelineSnapshot, changeMarker: SnapshotChangeMarker): EntitySnapshotRecord`
   - `buildBasketSnapshotRecord(snapshot: BasketTimelineSnapshot, changeMarker: SnapshotChangeMarker): BasketSnapshotRecord` (optional Phase 1)
   - All inputs nullable-safe with `advisory_only: true` hardcoded
2. `server/snapshotPersistenceEngine.test.ts` — ≥30 tests
   - Test all 12 fields of `EntitySnapshotRecord`
   - Test null input handling (all fields nullable)
   - Test `advisory_only: true` is always enforced
   - Test `snapshot_id` is a valid UUID format
   - Test `snapshot_time` is a valid UTC timestamp (ms)
3. **Schema addition** (Manus will apply): `entity_snapshots` table with 12 fields + 2 indexes
4. **db.ts helpers** (Manus will add): `insertEntitySnapshot()`, `getEntitySnapshotHistory(entityKey, limit)`, `getLatestEntitySnapshot(entityKey)`
5. **tRPC routes** (Manus will add): `market.saveEntitySnapshot` (mutation), `market.getSnapshotHistory` (query)

**Constraints:**
- NO imports from `experienceLayer.ts`, `danTreeSystem.ts`, `deepResearchEngine.ts`, `synthesisController.ts`
- NO DB calls in `snapshotPersistenceEngine.ts` — pure functions only
- `advisory_only: true` hardcoded on all outputs
- All fields nullable-safe
- `snapshot_id` must be UUID v4 format
