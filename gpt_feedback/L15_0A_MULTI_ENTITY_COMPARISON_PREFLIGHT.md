# L15.0A — Multi-Entity Comparison Phase 1 Preflight Notes

**Date:** 2026-04-01
**Author:** Manus (Discovery-Only Pass)
**Production files modified:** NONE

---

## 1. Reusable Single-Entity Building Blocks

All three existing stats queries are directly reusable in paired form with **zero modification**:

| Function | File | Input | Key Output Fields |
|----------|------|-------|-------------------|
| `getSemanticStats` | `server/routers.ts:5843` | `{ entity, timeframe }` | `dominant_direction`, `confidence_score`, `conflict_count`, `state_regime` |
| `getSourceSelectionStats` | `server/routers.ts:5813` | `{ entity }` | `top_source`, `source_count`, `top_sources[]`, `summary` |
| `getOutputGateStats` | `server/routers.ts:5876` | (none — no entity param) | `evidence_score`, `evidence_level`, `output_mode`, `gate_passed`, `thesis_confidence`, `semantic_fragility` |

**Critical observation:** `getOutputGateStats` currently has **no entity parameter** — it builds a synthetic `EvidencePacket` with fixed values. For true multi-entity comparison, this procedure would need an `entity` input added, or a new `getOutputGateStatsByEntity(entity)` variant created.

**`getSemanticStats` and `getSourceSelectionStats` already accept `entity` as input** — they are immediately reusable for 2-entity comparison by calling them twice in parallel.

---

## 2. Recommended New File Location

**New file:** `server/multiEntityComparisonEngine.ts`

**Rationale:**
- Follows the established pattern: `outputGatingEngine.ts`, `sourceSelectionEngine.ts`, `semantic_engine_stats.ts`
- Pure aggregation layer — calls existing builders, does not rewrite logic
- Keeps comparison logic isolated and independently testable

**New tRPC procedure:** `market.compareEntities` (in `server/routers.ts`, appended to market router)

**New test file:** `server/multiEntityComparisonEngine.test.ts`

---

## 3. CLAUDE_NARROW vs MANUS_DIRECT

**Recommendation: MANUS_DIRECT**

Rationale:
- Pattern is identical to L12.8 (`semantic_engine_stats.ts`) and L13.2B (`outputGatingEngine.ts`) — pure aggregation layer over existing builders
- No new type system required — reuses `SemanticEngineStatsDisplay`, `OutputGateResult`, and the source stats shape
- The only new type needed is `MultiEntityComparisonResult` (~20 fields), which is a straightforward composition of existing types
- No LLM prompting, no complex branching, no new data sources
- Claude would add risk without benefit here — the pattern is mechanical and well-established

---

## 4. Minimum Comparison Dimensions for Phase 1

Recommended 5 dimensions (all derivable from existing builders):

| Dimension | Source | Field(s) |
|-----------|--------|----------|
| Semantic Direction | `getSemanticStats` | `dominant_direction`, `confidence_score` |
| Evidence Strength | `getOutputGateStats` (per entity) | `evidence_score`, `evidence_level` |
| Output Mode | `getOutputGateStats` (per entity) | `output_mode`, `gate_passed` |
| Source Quality/Breadth | `getSourceSelectionStats` | `source_count`, `top_source` |
| Fragility/Conflicts | `getSemanticStats` + `getOutputGateStats` | `conflict_count`, `semantic_fragility` |

**Phase 1 should be limited to exactly 2 entities.** N-entity comparison adds combinatorial complexity with no immediate value.

---

## 5. Phase 1 Scope: Query-Only First, or Query + Minimal UI?

**Recommendation: Query-only first (backend + tRPC only), then UI in a follow-up task.**

Rationale:
- Keeps Phase 1 atomic and testable in isolation
- The UI for comparison (side-by-side panel, delta indicators) is non-trivial and deserves its own task
- Backend-only Phase 1 can be validated via curl/tRPC before any UI work begins
- Follows the established pattern: L12.8 (engine) → L12.10 (UI wiring) → L13.4B (entity binding)

---

## 6. Blockers, Hidden Coupling, and Schema/State Risks

### Blocker 1: `getOutputGateStats` has no entity parameter
- Current implementation builds a synthetic `EvidencePacket` with fixed values (`hitCount: 0`, `totalCount: 0`)
- For meaningful per-entity comparison, the gate stats must be entity-aware
- **Recommended fix:** Add `entity: z.string().default("AAPL")` input to `getOutputGateStats`, pass it to `buildEvidencePacket` context
- This is a small additive change (~3 lines) that does not break existing callers

### Blocker 2: `getSemanticStats` returns `"unavailable"` for most entities
- `buildSemanticActivationResult` requires a full `DeepResearchContextMap` to compute real direction
- For entities without a completed research session, direction will always be `"unavailable"`
- **Mitigation for Phase 1:** Accept this as a known limitation; display `"—"` in comparison UI when unavailable; document in FEEDBACK

### No schema changes required
- Phase 1 is query-only, no new DB tables needed
- Comparison results are ephemeral (computed on demand, not persisted)

### No hidden coupling detected
- `multiEntityComparisonEngine.ts` will only import from existing engine files
- No circular dependencies expected
- `routers.ts` market router already has the established append pattern

---

## 7. Confirmation: No Production Files Modified

- `server/` — **NOT MODIFIED**
- `client/` — **NOT MODIFIED**
- `drizzle/` — **NOT MODIFIED**
- Only `gpt_feedback/` files created in this task

---

## Recommended Level 15.0B Task Structure

```
[TASK] Level15.0-B — Multi-Entity Comparison Engine Phase 1 (MANUS_DIRECT)
[PERMITTED_MODIFICATIONS]
  server/multiEntityComparisonEngine.ts (NEW)
  server/multiEntityComparisonEngine.test.ts (NEW)
  server/routers.ts (APPEND-ONLY: market.compareEntities + entity param to getOutputGateStats)
  gpt_feedback/TYPE_REGISTRY.md (APPEND-ONLY: MultiEntityComparisonResult section)
  gpt_feedback/FEEDBACK_LEVEL15_0B.md (NEW)

[IMPLEMENTATION_PLAN]
1. Add entity param to getOutputGateStats (3 lines)
2. Create MultiEntityComparisonResult interface (~20 fields)
3. Create buildMultiEntityComparison(entityA, entityB) function (~60 lines)
4. Create market.compareEntities publicProcedure (~20 lines)
5. Create test file (~100 lines, 15+ tests)
6. Append MultiEntityComparisonResult to TYPE_REGISTRY.md

[TEST_POLICY]
Layer 1: multiEntityComparisonEngine.test.ts
Layer 2: TSC --noEmit
Layer 3: Full regression
Layer 4: curl verify compareEntities endpoint

[POST_APPLY_ACTION]
restart_server
```

**Estimated implementation:** ~200 lines across 3 files, ~45 minutes.
