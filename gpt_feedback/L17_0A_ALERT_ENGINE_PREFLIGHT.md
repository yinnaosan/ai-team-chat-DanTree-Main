# L17.0A — Alert / Notification System Phase 1 Preflight
**Date:** 2026-04-01  
**Classification:** MANUS_ONLY — DISCOVERY ONLY  
**Production files modified:** NONE

---

## 1. Existing Result Layers Best Suited as Alert Inputs

The codebase already contains a mature, multi-layer result pipeline. The following four result objects are the highest-leverage alert inputs for Phase 1:

| Result Object | File | Key Fields for Alerting |
|---|---|---|
| `OutputGateResult` | `server/outputGatingEngine.ts` | `gate_passed`, `evidence_score`, `evidence_level`, `semantic_fragility`, `freshness` |
| `PortfolioAnalysisResult` | `server/portfolioAnalysisEngine.ts` | `concentration_risk.value.level`, `shared_fragility.value.fragility_flag`, `gate_distribution.value.basket_investable`, `evidence_dispersion.value.std_dev` |
| `SourceSelectionResult` | `server/sourceSelectionEngine.ts` | `route_results[*].health` (SourceHealth enum: `active`/`degraded`/`error`/`unknown`) |
| `MultiEntityComparisonResult` | `server/multiEntityComparisonEngine.ts` | `evidence_comparison`, `gate_comparison`, `fragility_comparison` |

`SemanticStats` (from `semantic_aggregator.ts` → `getSemanticStats` query) is a secondary input: `dominant_direction`, `confidence_score`, `conflict_count` are useful for direction-flip alerts but require a prior research session to be non-null (OI-L15-003 still deferred).

---

## 2. Recommended New File and Location

**New file:** `server/alertEngine.ts`

This is the correct home for Phase 1. The existing `watchlistEngine.ts` / `watchService.ts` / `watchAlerts` table already handles persisted, scheduled, user-configured watch alerts (price breaks, risk escalation, etc.). Phase 1 alert engine is a **different layer**: it produces ephemeral, on-demand `AlertResult[]` objects derived from the research result pipeline — no scheduling, no DB writes required in Phase 1.

**Recommended architecture:**

```
server/alertEngine.ts
  ├── AlertResult (interface)
  ├── AlertType (type union)
  ├── AlertSeverity (type)
  ├── buildEntityAlerts(gateResult, sourceResult) → AlertResult[]
  ├── buildBasketAlerts(portfolioResult) → AlertResult[]
  └── buildAlertSummary(alerts) → string
```

This file should be **pure functions only** — no DB calls, no LLM calls, no side effects. It reads from the existing result layer objects and emits a typed `AlertResult[]` array.

---

## 3. L17.0B Classification: CLAUDE_NARROW

**Recommendation: CLAUDE_NARROW**

Rationale: The alert engine requires precise TypeScript interface design (5 alert types × 2 scopes), threshold logic, and a full test suite (≥30 tests). This matches the CLAUDE_NARROW pattern used for `portfolioAnalysisEngine.ts` (L16.0B). Manus will then integrate via L17.0C (MANUS_DIRECT) by adding `market.getEntityAlerts` and `market.getBasketAlerts` tRPC queries and a minimal UI panel.

---

## 4. Minimal Alert Types for Phase 1

Five alert types are recommended, all derivable from existing result objects without new data sources:

| Alert Type | Source Field | Threshold | Severity |
|---|---|---|---|
| `gate_downgrade` | `OutputGateResult.gate_passed` → `false` | gate_passed === false | `high` |
| `evidence_weakening` | `OutputGateResult.evidence_score` | score < 40 (gate threshold) | `medium` |
| `fragility_spike` | `OutputGateResult.semantic_fragility` | fragility > 0.65 | `high` |
| `source_deterioration` | `SourceSelectionResult.route_results[*].health` | any route health === `"degraded"` or `"error"` | `medium` |
| `basket_concentration_warning` | `PortfolioAnalysisResult.concentration_risk.value.level` | level === `"high"` or `"very_high"` | `medium` |

All five thresholds are already embedded in the existing result layer logic. No new data sources or API calls are required.

---

## 5. Recommended Scope Targets for Phase 1

Phase 1 should support **both entity and basket scopes**, as the required inputs already exist:

- **Entity alerts** (`gate_downgrade`, `evidence_weakening`, `fragility_spike`, `source_deterioration`) — derived from `OutputGateResult` + `SourceSelectionResult`, both already returned by `market.getOutputGateStats` and `market.getSourceRouterStatus` queries.
- **Basket alerts** (`basket_concentration_warning`) — derived from `PortfolioAnalysisResult`, already returned by `market.analyzeBasket`.

Comparison-scope alerts (from `MultiEntityComparisonResult`) should be **deferred to Phase 2** — they require a winner-flip detection pattern that needs a prior state snapshot.

---

## 6. Phase 1 Scope: Backend/Query-Only First, Then Minimal UI

**Recommended sequence:**

1. **L17.0B (CLAUDE_NARROW):** `server/alertEngine.ts` — pure functions, typed interfaces, full test suite.
2. **L17.0C (MANUS_DIRECT):** Add `market.getEntityAlerts` and `market.getBasketAlerts` tRPC queries to `routers.ts`. Add a compact **ALERTS** panel to `TerminalEntry.tsx` (same pattern as BASKET ANALYSIS panel — no new route/page).

This matches the L16.0B → L16.0C → L16.1A pattern that proved stable.

---

## 7. Blockers, Hidden Coupling, and Schema/State Risks

| Risk | Severity | Notes |
|---|---|---|
| `watch_alerts` table already exists | LOW | Phase 1 alert engine is ephemeral (no DB writes). No conflict with existing `watchAlerts` table. |
| `TriggerInput` in `watchlistEngine.ts` does NOT include `gate_passed`, `evidence_score`, or `fragility` | MEDIUM | The existing trigger engine is price/risk/memory-based. Phase 1 alert engine must be a **separate, independent layer** — do NOT extend `TriggerInput`. |
| `getSemanticStats` returns `dominant_direction: "unavailable"` (OI-L15-003) | LOW | Direction-flip alerts depend on this. Defer direction-flip alert type to Phase 2. Phase 1 alert types do not require semantic direction. |
| `PortfolioAnalysisResult` uses `[Max Depth]` in tRPC batch responses | LOW | This is a tRPC superjson serialization depth display artifact in logs only. Actual data is complete. |
| `buildEntityAlerts` will need `gate_available` flag | LOW | `OutputGateResult` does not include a top-level `available` boolean. Alert engine must handle the `buildFallbackOutputGateResult()` case (evidence_score=0, gate_passed=false) without firing false alerts. Add `is_fallback` guard. |

**No schema migration required for Phase 1.** The `watch_alerts` table is for the scheduled watchlist system and is not touched by the ephemeral alert engine.

---

## 8. Production Files Modified

**NONE.** This is a discovery-only preflight. All files in `[READ_ONLY]` were inspected without modification.

---

## L17.0B Task Specification (for Claude)

```
[TASK]
Level17.0-B — Alert Engine Phase 1 (CLAUDE_NARROW)

Goal:
Implement server/alertEngine.ts — a pure-function alert engine that reads from
existing result layer objects and emits typed AlertResult[] arrays.

[NEW_FILES]
server/alertEngine.ts
server/alertEngine.test.ts

[INTERFACES_REQUIRED]
AlertType: "gate_downgrade" | "evidence_weakening" | "fragility_spike" | "source_deterioration" | "basket_concentration_warning"
AlertSeverity: "low" | "medium" | "high" | "critical"
AlertResult: { alert_type, severity, entity, scope, message, triggered_at, advisory_only }
AlertSummary: { alerts, alert_count, highest_severity, summary_text, advisory_only }

[FUNCTIONS_REQUIRED]
buildEntityAlerts(gateResult: OutputGateResult, sourceResult: SourceSelectionResult, entity: string): AlertResult[]
buildBasketAlerts(portfolioResult: PortfolioAnalysisResult): AlertResult[]
buildAlertSummary(alerts: AlertResult[]): AlertSummary

[THRESHOLDS]
gate_downgrade: gate_passed === false (guard: skip if is_fallback / evidence_score === 0 AND blocking_fields.length === 0)
evidence_weakening: evidence_score < 40
fragility_spike: semantic_fragility > 0.65
source_deterioration: any route_results[*].health === "degraded" or "error"
basket_concentration_warning: concentration_risk.value.level === "high" or "very_high"

[CONSTRAINTS]
- Pure functions only — no DB calls, no LLM calls, no side effects
- advisory_only: true on all AlertResult objects
- All inputs are optional/nullable — must handle gracefully
- No new dependencies

[TEST_POLICY]
≥ 30 tests covering:
- each alert type fires correctly at threshold
- each alert type does NOT fire below threshold
- fallback/null input handling
- buildAlertSummary aggregation
- highest_severity logic
```
