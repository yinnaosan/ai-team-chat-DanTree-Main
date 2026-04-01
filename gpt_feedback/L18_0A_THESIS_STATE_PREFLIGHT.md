# L18.0A — Thesis / State Tracking Phase 1 Preflight
## DISCOVERY-ONLY | No production files modified

**Date:** 2026-04-01  
**Scope:** server/, client/, drizzle/ — READ-ONLY  
**Files Inspected:** 23 (as specified in L18.0A task)

---

## 1. Existing Result Layers Best Suited as Thesis/State Inputs

The following 6 result layers are the highest-leverage inputs for `EntityThesisState` and `BasketThesisState`:

| Layer | File | Key Fields Available |
|-------|------|---------------------|
| **Semantic Stats** | `semantic_aggregator.ts` → `getSemanticStats` route | `dominant_direction`, `confidence_score`, `conflict_count`, `state_regime`, `fragility` |
| **Output Gate** | `outputGatingEngine.ts` → `getOutputGateStats` route | `gate_passed`, `evidence_score`, `output_mode`, `is_synthetic_fallback` |
| **Source Selection** | `sourceSelectionEngine.ts` → `getSourceSelectionStats` route | `top_source`, `route_count`, `selection_available`, `degraded_sources` |
| **Alert Summary** | `alertEngine.ts` → `evaluateEntityAlerts` route | `alert_count`, `highest_severity`, `alert_types[]`, `summary_text` |
| **Portfolio Analysis** | `portfolioAnalysisEngine.ts` → `analyzeBasket` route | `thesis_overlap`, `concentration_risk`, `shared_fragility`, `evidence_dispersion`, `gate_distribution`, `basket_summary` |
| **Experience Layer** | `experienceLayer.ts` | `ThesisHistoryContext`, `CurrentThesisContext`, `DriftDetectionOutput` — already defines drift tracking primitives |

**Critical finding:** `experienceLayer.ts` already defines `ThesisHistoryContext` and `CurrentThesisContext` with exactly the fields needed for thesis/state tracking (confidence, drift_state, critical_driver, key_variables, narrative_summary). These are **advisory-only** pure functions — no DB coupling.

---

## 2. Recommended New File and Location

**New file:** `server/thesisStateEngine.ts`

**Rationale:**
- Follows the established pattern: `alertEngine.ts`, `portfolioAnalysisEngine.ts`, `multiEntityComparisonEngine.ts` — all pure-function engines with no DB/LLM calls
- Does NOT extend `experienceLayer.ts` (that file is already 500+ lines and handles drift/confidence/management behavior — adding state tracking would violate single-responsibility)
- Does NOT extend `semantic_aggregator.ts` (that handles packet merging, not thesis state)
- Sits at the same level as `alertEngine.ts` in the result layer hierarchy

**Location:** `server/thesisStateEngine.ts` (~150–200 lines for Phase 1)

---

## 3. L18.0B Classification: CLAUDE_NARROW

**Recommendation: CLAUDE_NARROW**

Reasons:
- Phase 1 requires careful interface design (7 entity fields + 5 basket fields) that must be precisely typed to avoid downstream coupling
- Needs ≥30 tests covering: null-input guards, state derivation from each input source, severity escalation, change marker logic
- Pure-function architecture (no DB, no LLM) — exactly Claude's strength
- Manus will handle integration (copy file + add 2 tRPC routes) in L18.0C

---

## 4. Minimal State Objects Recommended for Phase 1

### EntityThesisState

```typescript
export interface EntityThesisState {
  entity: string;
  generated_at: string;
  advisory_only: true;

  // Stance
  current_stance: "bullish" | "bearish" | "neutral" | "mixed" | "unavailable";
  stance_confidence: number | null;       // 0–1, from semanticStats.confidence_score

  // Evidence state
  evidence_state: "strong" | "moderate" | "weak" | "insufficient";
  evidence_score: number | null;          // 0–1, from gateStats.evidence_score

  // Gate state
  gate_state: "pass" | "block" | "fallback";
  gate_mode: string | null;              // from gateStats.output_mode

  // Fragility state
  fragility_state: "low" | "medium" | "high" | "critical";
  fragility_score: number | null;        // from semanticStats.state_summary.fragility

  // Source state
  source_state: "healthy" | "degraded" | "unavailable";
  top_source: string | null;

  // Alert state
  alert_count: number;
  highest_alert_severity: "low" | "medium" | "high" | "critical" | null;

  // Change marker
  thesis_change_marker: "stable" | "strengthening" | "weakening" | "reversal" | "unknown";

  // Human-readable summary
  state_summary_text: string;
}
```

### BasketThesisState

```typescript
export interface BasketThesisState {
  entities: string[];
  basket_size: number;
  generated_at: string;
  advisory_only: true;

  // Dominant basket thesis
  dominant_basket_thesis: "aligned_bullish" | "aligned_bearish" | "mixed" | "divergent" | "unavailable";
  overlap_intensity: "high" | "medium" | "low" | "none";

  // Concentration state
  concentration_state: "safe" | "elevated" | "high" | "critical";

  // Basket fragility
  basket_fragility_state: "low" | "medium" | "high";
  shared_fragility_flag: boolean;

  // Change marker
  basket_change_marker: "stable" | "concentrating" | "diverging" | "unknown";

  // Human-readable summary
  basket_state_summary_text: string;
}
```

---

## 5. Minimal Fields for Each Phase 1 State Object

### EntityThesisState — 12 fields (excluding entity/generated_at/advisory_only)

| Field | Source | Derivation |
|-------|--------|-----------|
| `current_stance` | `semanticStats.dominant_direction` | Map: positive→bullish, negative→bearish, mixed→mixed, neutral→neutral, unclear→unavailable |
| `stance_confidence` | `semanticStats.confidence_score` | Direct passthrough (0–1) |
| `evidence_state` | `gateStats.evidence_score` | ≥0.7→strong, ≥0.4→moderate, ≥0.2→weak, <0.2→insufficient |
| `evidence_score` | `gateStats.evidence_score` | Direct passthrough |
| `gate_state` | `gateStats.gate_passed`, `is_synthetic_fallback` | fallback→fallback, passed→pass, failed→block |
| `gate_mode` | `gateStats.output_mode` | Direct passthrough |
| `fragility_state` | `semanticStats.state_regime` or fragility score | Derived from available signals |
| `fragility_score` | `semanticStats` (state_summary.fragility) | Direct if available, null otherwise |
| `source_state` | `sourceStats.selection_available`, degraded_sources | healthy/degraded/unavailable |
| `top_source` | `sourceStats.top_source` | Direct passthrough |
| `alert_count` | `alertSummary.alert_count` | Direct passthrough |
| `highest_alert_severity` | `alertSummary.highest_severity` | Direct passthrough |
| `thesis_change_marker` | Derived from gate_state + evidence_state + alert severity | Logic: if gate=block AND evidence=weak → weakening; if gate=pass AND evidence=strong AND alert_count=0 → stable |
| `state_summary_text` | Composed | Short human-readable string combining stance + evidence + gate |

### BasketThesisState — 7 fields (excluding entities/basket_size/generated_at/advisory_only)

| Field | Source | Derivation |
|-------|--------|-----------|
| `dominant_basket_thesis` | `portfolioResult.thesis_overlap.result.overlap_direction` | Map overlap direction to thesis label |
| `overlap_intensity` | `portfolioResult.thesis_overlap.result.overlap_score` | ≥0.7→high, ≥0.4→medium, ≥0.2→low, <0.2→none |
| `concentration_state` | `portfolioResult.concentration_risk.result.level` | Direct map: LOW→safe, MEDIUM→elevated, HIGH→high, CRITICAL→critical |
| `basket_fragility_state` | `portfolioResult.shared_fragility.result.fragility_score` | ≥0.7→high, ≥0.4→medium, <0.4→low |
| `shared_fragility_flag` | `portfolioResult.shared_fragility.result.fragility_flag` | Direct passthrough |
| `basket_change_marker` | Derived from concentration + fragility | concentrating if concentration HIGH+; diverging if overlap low + evidence dispersion high |
| `basket_state_summary_text` | Composed | Short human-readable string |

---

## 6. Phase 1 Scope: Backend/Query-Only First

**Recommendation: Backend + query-only first (no UI in L18.0B/C)**

Reasons:
1. The UI pattern is already established (BasketAnalysisPanel, AlertsPanel) — adding a ThesisStatePanel in L18.1A will be straightforward once the backend is stable
2. The state derivation logic needs test coverage before UI wiring (≥30 tests required)
3. Two tRPC routes suffice for Phase 1: `market.getEntityThesisState` and `market.getBasketThesisState`
4. TerminalEntry already has all 6 required input queries live — no new queries needed for the UI phase

---

## 7. Blockers, Hidden Coupling, and Schema/State Risks

### No Blockers Found

### Coupling Risks (Low — advisory-only)

| Risk | File | Severity | Mitigation |
|------|------|----------|-----------|
| `experienceLayer.ts` already defines `ThesisHistoryContext` / `CurrentThesisContext` | `experienceLayer.ts:21–48` | LOW | `thesisStateEngine.ts` must NOT import from `experienceLayer.ts` — use its own types to avoid coupling to the drift/confidence pipeline |
| `getSemanticStats` returns `state_regime` but NOT `fragility_score` directly | `routers.ts:5843` | LOW | Phase 1 derives `fragility_state` from `state_regime` string + `confidence_score` heuristic; `fragility_score` can be null |
| `getOutputGateStats` uses a synthetic packet (not a real research session) | `routers.ts:5876` | LOW | Phase 1 must guard `is_synthetic_fallback === true` → set `gate_state = "fallback"` not "block" |
| `alertEngine.ts` `EntityGateResult` interface overlaps with `OutputGateResult` | `alertEngine.ts:83` vs `outputGatingEngine.ts:20` | LOW | `thesisStateEngine.ts` should accept `OutputGateResult` (canonical) not `EntityGateResult` (alert-specific) |
| No schema migration needed | `drizzle/schema.ts` | NONE | Phase 1 is stateless — no DB writes |

### Snapshot-Only Usage Check

All 5 input engines (`alertEngine`, `portfolioAnalysisEngine`, `outputGatingEngine`, `sourceSelectionEngine`, `semantic_aggregator`) are pure-function, snapshot-only. None assume persistent state. **No blocking coupling found.**

---

## 8. Production File Modification Confirmation

**CONFIRMED: Zero production files modified.**

Files inspected (read-only):
- `server/alertEngine.ts` ✓
- `server/alertEngine.test.ts` ✓
- `server/portfolioAnalysisEngine.ts` ✓
- `server/portfolioAnalysisEngine.test.ts` ✓
- `server/multiEntityComparisonEngine.ts` ✓
- `server/multiEntityComparisonEngine.test.ts` ✓
- `server/outputGatingEngine.ts` ✓
- `server/outputGatingEngine.test.ts` ✓
- `server/evidenceValidator.ts` ✓
- `server/sourceSelectionEngine.ts` ✓
- `server/sourceSelectionEngine.test.ts` ✓
- `server/watchlistEngine.ts` ✓
- `server/routers.ts` ✓
- `server/semantic_protocol.ts` ✓
- `server/semantic_protocol_integration.ts` ✓
- `server/semantic_aggregator.ts` ✓
- `server/semantic_packet_builders.ts` ✓
- `server/deepResearchEngine.ts` ✓
- `server/danTreeSystem.ts` ✓
- `server/synthesisController.ts` ✓
- `server/experienceLayer.ts` ✓
- `server/level11MultiAssetEngine.ts` ✓
- `server/level105PositionLayer.ts` ✓
- `client/src/pages/TerminalEntry.tsx` ✓
- `drizzle/schema.ts` ✓

**Only permitted files modified:**
- `gpt_feedback/L18_0A_THESIS_STATE_PREFLIGHT.md` (this file)
- `gpt_feedback/FEEDBACK_LEVEL18_0A.md`

---

## L18.0B Task Specification (for Claude)

```
[TASK]
Level18.0-B — Thesis / State Tracking Phase 1 (CLAUDE_NARROW)

[FILE_TO_CREATE]
server/thesisStateEngine.ts

[INTERFACES_TO_DEFINE]
1. EntityThesisStateInput {
     entity: string;
     semanticStats: { dominant_direction, confidence_score, conflict_count, state_regime } | null;
     gateResult: { gate_passed, evidence_score, output_mode, is_synthetic_fallback } | null;
     sourceResult: { selection_available, top_source, degraded_sources? } | null;
     alertSummary: { alert_count, highest_severity, alert_types } | null;
   }

2. BasketThesisStateInput {
     portfolioResult: PortfolioAnalysisResult | null;
   }

3. EntityThesisState (12 fields — see preflight Section 4)
4. BasketThesisState (7 fields — see preflight Section 4)

[FUNCTIONS_TO_IMPLEMENT]
- buildEntityThesisState(input: EntityThesisStateInput): EntityThesisState
- buildBasketThesisState(input: BasketThesisStateInput): BasketThesisState
- buildThesisStateSummaryText(state: EntityThesisState): string
- buildBasketStateSummaryText(state: BasketThesisState): string

[CONSTRAINTS]
- Pure functions only — no DB, no LLM, no async
- advisory_only: true on all result objects
- All inputs nullable — must handle null gracefully
- Do NOT import from experienceLayer.ts
- Do NOT import from semantic_aggregator.ts
- Only import types from outputGatingEngine.ts and portfolioAnalysisEngine.ts if needed
- Guard is_synthetic_fallback === true → gate_state = "fallback" (not "block")

[TEST_REQUIREMENTS]
- Minimum 30 tests in server/thesisStateEngine.test.ts
- Cover: null inputs, each derivation branch, change marker logic, summary text generation
- Test EntityThesisState and BasketThesisState independently

[RETURN_FORMAT]
- thesisStateEngine.ts
- thesisStateEngine.test.ts
```
