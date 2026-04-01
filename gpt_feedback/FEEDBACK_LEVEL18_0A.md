# FEEDBACK — LEVEL 18.0A
## Thesis / State Tracking Phase 1 Preflight (DISCOVERY-ONLY)

**Status:** COMPLETE — DISCOVERY ONLY  
**Production Files Modified:** ZERO  
**Date:** 2026-04-01

---

## Summary

Inspected 25 files across server/, client/, drizzle/. Confirmed that all 6 required input layers (semantic stats, output gate, source selection, alert summary, portfolio analysis, experience layer) are live and accessible via existing tRPC routes. Identified `server/thesisStateEngine.ts` as the correct new file location. Confirmed no schema migration needed for Phase 1.

---

## Answers to Required Output Questions

### 1. Existing Result Layers Best Suited as Thesis/State Inputs

| Priority | Layer | Route | Key Fields |
|----------|-------|-------|-----------|
| 1 | Semantic Stats | `market.getSemanticStats` | dominant_direction, confidence_score, conflict_count, state_regime |
| 2 | Output Gate | `market.getOutputGateStats` | gate_passed, evidence_score, output_mode, is_synthetic_fallback |
| 3 | Source Selection | `market.getSourceSelectionStats` | selection_available, top_source |
| 4 | Alert Summary | `market.evaluateEntityAlerts` | alert_count, highest_severity, alert_types |
| 5 | Portfolio Analysis | `market.analyzeBasket` | thesis_overlap, concentration_risk, shared_fragility |
| 6 | Experience Layer | `experienceLayer.ts` (pure fn) | ThesisHistoryContext, DriftDetectionOutput — advisory primitives already exist |

### 2. Recommended New File

**`server/thesisStateEngine.ts`** — pure-function engine, ~150–200 lines, same pattern as `alertEngine.ts`.

### 3. L18.0B Classification

**CLAUDE_NARROW** — interface design (19 typed fields across 2 state objects) + ≥30 tests required.

### 4. Minimal State Objects

- `EntityThesisState` — 12 semantic fields + entity/generated_at/advisory_only
- `BasketThesisState` — 7 semantic fields + entities/basket_size/generated_at/advisory_only

Full field specifications in `L18_0A_THESIS_STATE_PREFLIGHT.md` Section 4.

### 5. Minimal Fields

See `L18_0A_THESIS_STATE_PREFLIGHT.md` Section 5 for complete derivation table.

### 6. Phase 1 Scope

**Backend + query-only first.** UI (ThesisStatePanel) deferred to L18.1A. Two tRPC routes: `market.getEntityThesisState` and `market.getBasketThesisState`.

### 7. Blockers / Risks

- **No blockers.** All input layers are live.
- **3 low-severity coupling risks** (see preflight Section 7): experienceLayer import guard, synthetic fallback guard, EntityGateResult vs OutputGateResult disambiguation.
- **No schema migration needed** — Phase 1 is fully stateless.

### 8. Production File Modification Confirmation

**CONFIRMED: Zero production files modified.** Only `gpt_feedback/` files written.

---

## OI Status

| OI | Status |
|----|--------|
| OI-L18-001 | OPEN — thesisStateEngine.ts pending L18.0B |
| OI-L15-003 | DEFERRED — Protocol Layer Direction unavailable (non-blocking) |

---

## Next Steps

1. **L18.0B (CLAUDE_NARROW):** Send L18.0B Task Specification from preflight Section "L18.0B Task Specification" to Claude. Expected output: `thesisStateEngine.ts` + `thesisStateEngine.test.ts` (≥30 tests).

2. **L18.0C (MANUS_DIRECT):** Copy Claude files, add 2 tRPC routes, run tests, update TYPE_REGISTRY.

3. **L18.1A (MANUS_DIRECT):** Add ThesisStatePanel UI to TerminalEntry.tsx (Panel J), following BasketAnalysisPanel / AlertsPanel pattern.
