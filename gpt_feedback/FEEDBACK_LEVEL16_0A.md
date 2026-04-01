# FEEDBACK — Level 16.0A: Portfolio-Level Analysis Phase 1 Preflight
**Date:** 2026-04-01
**Manus Version:** 1212d7cd (no new checkpoint — discovery-only, zero production changes)
**Status:** PREFLIGHT COMPLETE — Ready for L16.0B

---

## Summary

Discovery-only pass complete. All 11 specified read-only files inspected. Zero production files modified.

The codebase is ready for Portfolio-Level Analysis Phase 1. All required building blocks exist. The only structural constraint is that `multiEntityComparisonEngine.ts` hardcodes exactly 2 entities — portfolio analysis must be a new independent file.

---

## Key Findings

**Reusable without modification:**
- `buildEvidenceSnapshot()`, `buildSourceSnapshot()`, `buildSemanticSnapshot()` from `multiEntityComparisonEngine.ts` (will be duplicated/re-exported, not modified)
- `buildOutputGateResult()`, `buildFallbackOutputGateResult()` from `outputGatingEngine.ts`
- `buildEvidencePacket()` from `evidenceValidator.ts`
- `selectTopSources()`, `runSourceSelection()` from `sourceSelectionEngine.ts` — already supports `"portfolio_review"` as TaskType
- `ConcentrationRisk` type from `level105PositionLayer.ts`

**Only blocker:** `multiEntityComparisonEngine.ts` is hardcoded to 2 entities. Portfolio analysis = new file.

**Schema:** No changes needed. Phase 1 is pure in-memory aggregation.

---

## Recommended L16.0B Spec

**New file:** `server/portfolioAnalysisEngine.ts` (~120 lines)
**New test file:** `server/portfolioAnalysisEngine.test.ts` (~20 tests)
**Router change:** Add `market.analyzeBasket` to `server/routers.ts` (~25 lines)

**Basket input:** `{ entities: string[2..8], taskType?: "portfolio_review", region?: "US" }`

**5 Portfolio Dimensions:**
1. `thesis_overlap` — count of entities sharing dominant direction
2. `concentration_risk` — evidence score distribution (Herfindahl-style)
3. `shared_fragility` — avg semantic_fragility; flag if > 0.6
4. `evidence_dispersion` — std-dev of evidence_score across basket
5. `gate_distribution` — PASS/BLOCK count; basket "investable" if majority PASS

**Classification: CLAUDE_NARROW** (typed interface design + 5-dimension aggregation logic + test suite)

**MANUS_DIRECT acceptable** if scoped to: copy snapshot builders + aggregation loop + tRPC query (~150 lines total).

---

## OI Status

| OI | Status |
|----|--------|
| All L12–L15 OIs | ✅ RESOLVED |
| OI-L15-003 (Protocol Layer Direction) | ⏳ DEFERRED |
| OI-L16-001 (portfolioAnalysisEngine.ts) | 🆕 OPEN — to be resolved in L16.0B |

---

## Test Policy for L16.0B

- TSC: 0 errors required
- New tests: ~20 (basket validation, 5 dimensions, advisory_only, edge cases)
- Regression: full suite must remain ≥ 1727/1733

---

## Full Preflight Report

See: `gpt_feedback/L16_0A_PORTFOLIO_ANALYSIS_PREFLIGHT.md`
