# L20.0A — Session History / Thesis Timeline Phase 1 Preflight

**Date:** 2026-04-01
**Classifier:** MANUS_ONLY
**Scope:** Discovery-only. Zero production files modified.
**Files Inspected:** 28 (all READ_ONLY per task spec)

---

## 1. Existing Result Layers Best Suited as History/Timeline Inputs

| Layer | File | Key Output Fields | Suitability |
|-------|------|-------------------|-------------|
| **EntityThesisState** | `server/thesisStateEngine.ts` | `current_stance`, `evidence_state`, `gate_state`, `fragility_state`, `source_state`, `thesis_change_marker`, `alert_count`, `highest_alert_severity`, `state_summary_text` | **Primary** — richest per-entity state snapshot, 12 fields, already computed per-query |
| **ExecutionTimingResult** | `server/executionTimingEngine.ts` | `readiness_state`, `entry_quality`, `timing_risk`, `action_bias`, `no_action_reason`, `timing_summary` | **Primary** — timing bias is a critical timeline dimension, already computed per-query |
| **AlertSummary** | `server/alertEngine.ts` | `alert_count`, `highest_severity`, `summary_text` | **Primary** — severity escalation is the most actionable timeline signal |
| **BasketThesisState** | `server/thesisStateEngine.ts` | `dominant_basket_thesis`, `overlap_intensity`, `concentration_state`, `basket_change_marker` | **Secondary** — basket-level timeline, only meaningful when ≥2 entities active |
| **SemanticStats** | `server/routers.ts` → `getSemanticStats` | `evidence_score`, `confidence_avg`, `dominant_direction` | **Supplementary** — evidence quality trend over time |
| **PortfolioAnalysisResult** | `server/portfolioAnalysisEngine.ts` | `basket_summary`, gate distribution, concentration | **Supplementary** — basket-level only, useful for concentration change tracking |

**Not recommended as direct inputs:**
- `deepResearchEngine.ts` — async, LLM-dependent, not suitable for lightweight snapshot
- `experienceLayer.ts` `ThesisHistoryContext` — designed for intra-session drift detection, not cross-session persistence
- `semantic_aggregator.ts` `UnifiedSemanticState` — too granular, 20+ fields, excessive for Phase 1

---

## 2. Recommended New File Location

**New file:** `server/sessionHistoryEngine.ts`

This is the correct home for Phase 1 because:
- All existing engines (`thesisStateEngine`, `executionTimingEngine`, `alertEngine`) are pure functions with no DB/LLM coupling
- `sessionHistoryEngine.ts` should also be a **pure function layer** — stateless, computed from the three primary inputs above
- No DB writes in Phase 1 (stateless/computed only)
- Mirrors the established pattern: `portfolioAnalysisEngine.ts`, `alertEngine.ts`, `thesisStateEngine.ts`

**New tRPC routes (in `server/routers.ts`):**
- `market.getEntityTimeline` — entity-level snapshot (entity + current state)
- `market.getBasketTimeline` — basket-level snapshot (entities + basket state)

---

## 3. L20.0B Classification

**CLAUDE_NARROW**

Rationale:
- Interface design for `ThesisTimelineSnapshot` and `BasketTimelineSnapshot` requires careful field selection and type alignment with 3 existing engines
- ≥30 tests needed: snapshot construction, null-safety guards, change_marker derivation, basket aggregation
- Pure function layer — no DB, no LLM, no async — ideal for Claude's structured output
- Manus will handle integration (file copy + 2 route additions + TSC fix if needed)

---

## 4. Minimal Phase 1 History/Timeline Objects

### Object 1: `ThesisTimelineSnapshot` (entity-level)

| Field | Source | Notes |
|-------|--------|-------|
| `snapshot_time` | `Date.now()` | UTC ms timestamp |
| `entity` | `EntityThesisState.entity` | Ticker symbol |
| `thesis_state_summary` | `EntityThesisState.state_summary_text` | Pre-built summary string |
| `alert_severity` | `AlertSummary.highest_severity \| null` | Null when no alerts |
| `timing_bias` | `ExecutionTimingResult.action_bias` | BUY/HOLD/WAIT/AVOID/NONE |
| `change_marker` | `EntityThesisState.thesis_change_marker` | STABLE/IMPROVING/DETERIORATING/REVERSAL/INSUFFICIENT_DATA |
| `source_health` | `EntityThesisState.source_state` | healthy/degraded/unavailable |
| `advisory_only` | `true` | Hardcoded Phase 1 guard |

**Total: 8 fields** (matches discovery hints exactly)

### Object 2: `BasketTimelineSnapshot` (basket-level)

| Field | Source | Notes |
|-------|--------|-------|
| `snapshot_time` | `Date.now()` | UTC ms timestamp |
| `entities` | `BasketThesisState.entities` | Array of tickers |
| `basket_change` | `BasketThesisState.basket_change_marker` | STABLE/MIXED_DRIFT/BASKET_SHIFT/INSUFFICIENT_DATA |
| `basket_thesis_summary` | `BasketThesisState.basket_state_summary_text` | Pre-built summary |
| `basket_action_bias` | `BasketTimingResult.basket_action_bias` | Aggregated timing bias |
| `advisory_only` | `true` | Hardcoded Phase 1 guard |

**Total: 6 fields**

---

## 5. Minimal Fields Per Object

See tables in Section 4 above. The 8 entity fields and 6 basket fields are the minimum valuable set for Phase 1. No additional fields are needed.

**Fields explicitly excluded from Phase 1:**
- `evidence_score` (numeric) — captured via `thesis_state_summary` text
- `fragility_score` (numeric) — captured via `thesis_state_summary` text
- `gate_mode` — too granular for timeline
- `top_source` — not a timeline dimension
- `stance_confidence` — already embedded in `thesis_state_summary`

---

## 6. Phase 1 Scope: Backend/Query-Only First

**Recommendation: Backend/query-only first (no UI in L20.0B).**

Rationale:
- TerminalEntry.tsx already has 9 panels (A–I); Panel J (Timing) and Panel K (Thesis State) are not yet implemented
- Adding a Session History panel before Panels J/K would create a confusing display order
- The backend layer is the blocker — once `sessionHistoryEngine.ts` is live, UI can be added in L20.1A
- This matches the established pattern: L17.0B (backend) → L17.1A (UI), L18.0B (backend) → L18.1A (pending), L19.0B (backend) → L19.1A (pending)

---

## 7. Blockers, Hidden Coupling, and Schema/State Risks

### Blocker: None

Phase 1 is stateless/computed. No DB writes, no LLM calls, no async. Zero blockers.

### Hidden Coupling Risk: `thesis_change_marker` derivation

`EntityThesisState.thesis_change_marker` is derived from `SemanticStatsInput.confidence_avg` and `SemanticStatsInput.dominant_direction`. If `semanticStats` is null (no active research session), `thesis_change_marker` defaults to `"INSUFFICIENT_DATA"`. The timeline snapshot must propagate this null-safety correctly — Claude must guard against `thesisState === null` in `buildThesisTimelineSnapshot()`.

### Hidden Coupling Risk: `action_bias` vs `timing_bias` naming

`ExecutionTimingResult.action_bias` uses the type `ActionBias` (`"BUY" | "HOLD" | "WAIT" | "AVOID" | "NONE"`). The timeline snapshot field should be named `timing_bias` (not `action_bias`) to avoid confusion with the raw timing engine output. Claude must rename this field in the snapshot interface.

### Schema Risk: None for Phase 1

Phase 1 is stateless. No `thesis_timeline_snapshot` table is needed. If Phase 2 adds persistence, a new table with columns `(id, user_id, entity, snapshot_time, snapshot_json)` would be the correct approach — but this is out of scope for Phase 1.

### One-Shot Snapshot Assumption

`buildEntityThesisState()` and `buildExecutionTimingResult()` are designed for one-shot snapshot usage. They accept optional inputs and return computed results. There is no internal state or caching that would block reusable timeline construction. **No coupling risk.**

### `portfolioAnalysisEngine.ts` Coupling

`analyzePortfolioBasket()` requires `BasketEntitySnapshot[]` with per-entity gate/evidence data. For basket timeline, the simpler `BasketThesisState` + `BasketTimingResult` combination is sufficient — no need to call `analyzePortfolioBasket()` in Phase 1.

---

## 8. Production File Modification Confirmation

**CONFIRMED: Zero production files were modified in this preflight.**

Files read (read-only):
- `server/thesisStateEngine.ts` ✅
- `server/executionTimingEngine.ts` ✅
- `server/alertEngine.ts` ✅
- `server/portfolioAnalysisEngine.ts` ✅
- `server/experienceLayer.ts` ✅
- `server/semantic_aggregator.ts` ✅
- `server/semantic_protocol.ts` ✅
- `server/routers.ts` ✅
- `drizzle/schema.ts` ✅
- `client/src/pages/TerminalEntry.tsx` ✅
- (+ 18 additional files scanned via grep)

---

## L20.0B Task Specification (for Claude)

```
[TASK]
Level20.0-B — Session History / Thesis Timeline Phase 1 Backend (CLAUDE_NARROW)

Goal:
Implement server/sessionHistoryEngine.ts — a pure function layer that assembles
ThesisTimelineSnapshot and BasketTimelineSnapshot objects from existing engine outputs.
No DB writes. No LLM calls. No async.

[NEW FILE]
server/sessionHistoryEngine.ts

[IMPORTS ALLOWED]
- Types only from: server/thesisStateEngine.ts, server/executionTimingEngine.ts, server/alertEngine.ts
- No imports from: experienceLayer, semantic_aggregator, deepResearchEngine, danTreeSystem, routers, db

[INTERFACES TO DEFINE]

interface ThesisTimelineSnapshot {
  snapshot_time: number;           // UTC ms (Date.now())
  entity: string;
  thesis_state_summary: string;    // from EntityThesisState.state_summary_text
  alert_severity: AlertSeverity | null;  // from AlertSummary.highest_severity
  timing_bias: ActionBias;         // from ExecutionTimingResult.action_bias
  change_marker: ThesisChangeMarker;     // from EntityThesisState.thesis_change_marker
  source_health: SourceState;      // from EntityThesisState.source_state
  advisory_only: true;
}

interface BasketTimelineSnapshot {
  snapshot_time: number;           // UTC ms
  entities: string[];
  basket_change: BasketChangeMarker;     // from BasketThesisState.basket_change_marker
  basket_thesis_summary: string;   // from BasketThesisState.basket_state_summary_text
  basket_action_bias: ActionBias;  // from BasketTimingResult.basket_action_bias
  advisory_only: true;
}

[FUNCTIONS TO IMPLEMENT]

export function buildThesisTimelineSnapshot(
  thesisState: EntityThesisState | null,
  alertSummary: AlertSummary | null,
  timingResult: ExecutionTimingResult | null,
  entity: string
): ThesisTimelineSnapshot

export function buildBasketTimelineSnapshot(
  basketThesisState: BasketThesisState | null,
  basketTimingResult: BasketTimingResult | null,
  entities: string[]
): BasketTimelineSnapshot

[NULL SAFETY RULES]
- thesisState === null → thesis_state_summary = "Insufficient data", change_marker = "INSUFFICIENT_DATA", source_health = "unavailable"
- alertSummary === null → alert_severity = null
- timingResult === null → timing_bias = "NONE"
- basketThesisState === null → basket_change = "INSUFFICIENT_DATA", basket_thesis_summary = "Insufficient basket data"
- basketTimingResult === null → basket_action_bias = "NONE"

[TEST FILE]
server/sessionHistoryEngine.test.ts
Minimum 35 tests covering:
- TC-SHE-01 to TC-SHE-15: buildThesisTimelineSnapshot (all null combos, all change_marker values, all alert_severity values, all timing_bias values)
- TC-SHE-16 to TC-SHE-25: buildBasketTimelineSnapshot (null combos, basket_change values, basket_action_bias values)
- TC-SHE-26 to TC-SHE-35: snapshot_time is a positive integer, advisory_only is always true, entity/entities preserved correctly

[CONSTRAINTS]
- advisory_only: true must be hardcoded (not derived)
- snapshot_time must be Date.now() called inside the function (not passed as parameter)
- No external dependencies beyond the three allowed import sources
- All functions must be pure (no side effects, no DB, no LLM)
- TSC must pass with 0 errors
```
