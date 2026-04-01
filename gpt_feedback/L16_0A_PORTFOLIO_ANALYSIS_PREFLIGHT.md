# L16_0A — Portfolio-Level Analysis Phase 1 Preflight
**Level:** 16.0A (Discovery-Only)
**Date:** 2026-04-01
**Author:** Manus (preflight pass)
**Production files modified:** NONE

---

## 1. Reusable Building Blocks

The following existing functions are directly reusable at basket scale **without modification**:

| Function | File | Reuse Pattern |
|---|---|---|
| `buildEvidenceSnapshot(entity)` | `multiEntityComparisonEngine.ts` | Call per entity in basket loop |
| `buildSourceSnapshot(entity)` | `multiEntityComparisonEngine.ts` | Call per entity in basket loop |
| `buildSemanticSnapshot(entity)` | `multiEntityComparisonEngine.ts` | Call per entity in basket loop |
| `buildOutputGateResult(packet, conf, frag)` | `outputGatingEngine.ts` | Per-entity gate status |
| `buildFallbackOutputGateResult()` | `outputGatingEngine.ts` | Fallback for any entity without live session |
| `buildEvidencePacket(...)` | `evidenceValidator.ts` | Per-entity evidence packet |
| `selectTopSources(taskType, region, fields, n)` | `sourceSelectionEngine.ts` | Already accepts `"portfolio_review"` as TaskType |
| `runSourceSelection(fields, taskType, region)` | `sourceSelectionEngine.ts` | Full pipeline, basket-safe |
| `compareWinner(left, right, higherIsBetter)` | `multiEntityComparisonEngine.ts` (internal) | Export or duplicate for portfolio aggregation |
| `safeNum(val, fallback)` | `multiEntityComparisonEngine.ts` (internal) | Export or duplicate |

**Key observation:** `sourceSelectionEngine.ts` already defines `"portfolio_review"` as a valid `TaskType` (line 25). No source-routing changes are needed for Phase 1.

---

## 2. Current Entity-Count Assumptions and Blockers

| Layer | Assumes exactly N entities? | Blocker for basket? |
|---|---|---|
| `multiEntityComparisonEngine.ts` | **Yes — exactly 2** (left/right hardcoded) | YES — cannot be stretched to 3–8 without rewrite |
| `outputGatingEngine.ts` | No — pure per-entity function | No |
| `evidenceValidator.ts` | No — pure per-entity function | No |
| `sourceSelectionEngine.ts` | No — task-level, not entity-count-bound | No |
| `semantic_aggregator.ts` | No — accepts array of `SemanticTransportPacket[]` | No — already designed for N inputs |
| `level105PositionLayer.ts` | No — per-entity, but has `computePortfolioConcentration()` | No — `ConcentrationRisk` type already defined |
| `danTreeSystem.ts` | No — loops over holdings array from DB | No — already multi-ticker |

**Conclusion:** The comparison engine is the only layer that hardcodes 2 entities. Portfolio analysis must be a **new separate file**, not an extension of `multiEntityComparisonEngine.ts`.

---

## 3. Recommended New File and Location

**New file:** `server/portfolioAnalysisEngine.ts`

This is the safest and most consistent location because:
- All existing single-entity engines live in `server/`
- It follows the naming convention of `multiEntityComparisonEngine.ts` and `outputGatingEngine.ts`
- It requires zero schema changes (no new DB tables)
- It can be imported lazily in `routers.ts` exactly like `compareEntities`

**New tRPC procedure:** `market.analyzeBasket` in `server/routers.ts`

---

## 4. Recommended Basket Input Model (Phase 1)

```typescript
interface BasketAnalysisInput {
  entities: string[];       // 2–8 ticker symbols (validated: min 2, max 8)
  taskType?: TaskType;      // default: "portfolio_review"
  region?: Region;          // default: "US"
}
```

**Entity count limits:**
- Minimum: **2** (degenerate basket = pairwise comparison, already handled)
- Maximum: **8** (keeps computation O(n) and response under 200ms; aligns with `level105PositionLayer` concentration governance which uses buckets, not continuous scaling)
- Recommended default for UI: **3–5**

**Rationale for 8-entity cap:** `computePortfolioConcentration()` in `level105PositionLayer.ts` already governs concentration risk at the position level. Phase 1 portfolio analysis is an advisory aggregation layer, not a live portfolio optimizer. Keeping the basket small ensures the result is readable and actionable.

---

## 5. Recommended Phase 1 Portfolio Dimensions (5 dimensions)

| Dimension | Derivation | Source Function |
|---|---|---|
| **Thesis Overlap** | Count entities sharing the same `dominant_direction` / direction score bucket | `buildSemanticSnapshot()` per entity |
| **Concentration Risk** | Herfindahl-style: how many entities dominate evidence score distribution | `buildEvidenceSnapshot()` per entity → compute dispersion |
| **Shared Fragility** | Average `semantic_fragility` across basket; flag if > 0.6 | `buildEvidenceSnapshot()` per entity |
| **Evidence Dispersion** | Std-dev of `evidence_score` across basket; high dispersion = uneven research quality | `buildEvidenceSnapshot()` per entity |
| **Gate Distribution** | Count of PASS vs BLOCK across basket; basket is "investable" only if majority PASS | `buildEvidenceSnapshot()` per entity |

These 5 dimensions map directly to the discovery hints in the task spec and require **no new data fetching** — all values come from existing per-entity builders.

---

## 6. Phase 1 Scope: Backend/Query-Only First

**Recommendation: Backend + tRPC query only in Level 16.0B. No UI in 16.0B.**

Rationale:
- The `compareEntities` pattern (L15.0B backend → L15.1A UI) proved stable: backend-first eliminates type errors before UI wiring
- `TerminalEntry.tsx` already has two panels (ENGINE STATS + ENTITY COMPARISON). Adding a third panel in the same task would exceed the safe complexity budget
- A minimal UI (basket ticker input + 5-dimension table) can be added in Level 16.1A following the same pattern as `ComparisonPanel`
- The tRPC query can be validated via Jest tests before any UI work begins

**Level 16.0B scope:** `portfolioAnalysisEngine.ts` (~120 lines) + `portfolioAnalysisEngine.test.ts` (~20 tests) + `market.analyzeBasket` tRPC query in `routers.ts` (~25 lines)

---

## 7. Blockers, Hidden Coupling, and Schema/State Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `buildSemanticSnapshot()` returns `"unavailable"` for all entities without live session | LOW | Accepted Phase 1 limitation (same as L15.0B). Document in advisory_only flag. |
| `multiEntityComparisonEngine.ts` snapshot builders are not exported | LOW | Either re-export them or duplicate the 3 snapshot builders in `portfolioAnalysisEngine.ts` (~30 lines). Duplication preferred to avoid coupling. |
| `compareWinner` and `safeNum` are not exported | LOW | Duplicate in new file (4 lines each). Do NOT modify `multiEntityComparisonEngine.ts`. |
| `level105PositionLayer.ts` `ConcentrationRisk` type uses "low/medium/high" — portfolio analysis should reuse this type | NONE | Import `ConcentrationRisk` type directly. No modification needed. |
| Schema: no new tables needed | NONE | Phase 1 is pure in-memory aggregation. `drizzle/schema.ts` unchanged. |
| `danTreeSystem.ts` already has multi-ticker orchestration | NONE | Not a blocker — Phase 1 portfolio analysis is independent of the DanTree system run. They can coexist. |
| `getOutputGateStats` in `routers.ts` does not accept an `entity` param | LOW | `analyzeBasket` will call `buildEvidenceSnapshot()` directly, bypassing `getOutputGateStats`. No router change needed. |

---

## 8. Level 16.0B Task Classification

**CLAUDE_NARROW** — recommended.

Rationale:
- New file (`portfolioAnalysisEngine.ts`) requires typed interface design and 5-dimension aggregation logic (~120 lines)
- Test file requires ~20 test cases covering basket validation, dimension computation, and edge cases
- This is non-trivial enough to benefit from Claude's type precision
- The task spec is narrow and well-defined (exact input model, exact 5 dimensions, exact file location)
- No UI work in 16.0B — Claude output is backend-only, reducing integration risk

**MANUS_DIRECT would be acceptable** if the task is scoped to: copy snapshot builders from comparison engine + write aggregation loop + add tRPC query. Estimated ~150 lines total.

---

## 9. Confirmation

No production files were modified during this preflight. The following files were read in read-only mode:

- `server/multiEntityComparisonEngine.ts` ✓
- `server/outputGatingEngine.ts` ✓
- `server/evidenceValidator.ts` (via file explorer summary) ✓
- `server/sourceSelectionEngine.ts` ✓
- `server/routers.ts` (market router section) ✓
- `server/level105PositionLayer.ts` ✓
- `server/danTreeSystem.ts` ✓
- `server/semantic_aggregator.ts` ✓
- `server/semantic_packet_builders.ts` (via file explorer summary) ✓
- `client/src/pages/TerminalEntry.tsx` (via file explorer summary) ✓
- `drizzle/schema.ts` (via file explorer summary) ✓

---

## 10. Recommended L16.0B Task Spec (for Claude)

```
NEW FILE: server/portfolioAnalysisEngine.ts

Interface:
  BasketAnalysisInput { entities: string[2..8], taskType?: TaskType, region?: Region }
  BasketEntitySnapshot { entity, evidence_score, evidence_level, gate_passed,
                         semantic_fragility, dominant_direction, source_count, available }
  PortfolioAnalysisDimension { dimension, value, label, note }
  PortfolioAnalysisResult {
    entities: string[],
    basket_size: number,
    generated_at: string,
    advisory_only: true,
    entity_snapshots: BasketEntitySnapshot[],
    thesis_overlap: PortfolioAnalysisDimension,
    concentration_risk: PortfolioAnalysisDimension,
    shared_fragility: PortfolioAnalysisDimension,
    evidence_dispersion: PortfolioAnalysisDimension,
    gate_distribution: PortfolioAnalysisDimension,
    basket_summary: string
  }

EXPORT: buildPortfolioAnalysis(input: BasketAnalysisInput): PortfolioAnalysisResult

NEW FILE: server/portfolioAnalysisEngine.test.ts
  ~20 tests covering: basket validation (min/max), all 5 dimensions, advisory_only,
  same-entity basket, single-direction basket, mixed gate basket

MODIFY: server/routers.ts
  Add market.analyzeBasket: publicProcedure
    .input(z.object({ entities: z.array(z.string().min(1).max(20)).min(2).max(8) }))
    .query(async ({ input }) => { ... buildPortfolioAnalysis(input) ... })
```
