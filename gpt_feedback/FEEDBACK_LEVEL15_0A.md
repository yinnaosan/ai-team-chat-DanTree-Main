# FEEDBACK: LEVEL 15.0A — Multi-Entity Comparison Phase 1 Preflight

**Status:** COMPLETE (Discovery-Only)
**Date:** 2026-04-01
**Production files modified:** NONE

---

## Summary

Discovery pass complete. Multi-Entity Comparison Phase 1 is **immediately feasible as MANUS_DIRECT** with no Claude involvement. All required building blocks exist. One minor blocker identified (entity param missing from `getOutputGateStats`) with a clear 3-line fix.

---

## Key Findings

| Question | Answer |
|----------|--------|
| Reusable building blocks? | YES — `getSemanticStats`, `getSourceSelectionStats`, `getOutputGateStats` all reusable |
| New file location? | `server/multiEntityComparisonEngine.ts` |
| CLAUDE_NARROW or MANUS_DIRECT? | **MANUS_DIRECT** |
| Phase 1 entity limit? | **Exactly 2 entities** |
| Phase 1 scope? | **Backend + tRPC query only** (UI in follow-up task) |
| Schema changes needed? | **NO** |
| Blockers? | 1 minor: `getOutputGateStats` has no entity param (3-line fix) |

---

## Blocker Detail

**`getOutputGateStats` has no entity parameter.** Currently builds a synthetic `EvidencePacket` with fixed values. For meaningful per-entity comparison, needs `entity: z.string().default("AAPL")` added. This is a 3-line additive change, no breaking changes to existing callers.

**`getSemanticStats` returns `"unavailable"` for most entities** (requires full `DeepResearchContextMap`). Phase 1 should accept this as a known limitation and display `"—"` when unavailable.

---

## Recommended Phase 1 Comparison Dimensions (5)

1. **Semantic Direction** — `dominant_direction`, `confidence_score`
2. **Evidence Strength** — `evidence_score`, `evidence_level`
3. **Output Mode** — `output_mode`, `gate_passed`
4. **Source Quality/Breadth** — `source_count`, `top_source`
5. **Fragility/Conflicts** — `conflict_count`, `semantic_fragility`

---

## Level 15.0B Task Spec (Ready to Execute)

```
[PERMITTED_MODIFICATIONS]
  server/multiEntityComparisonEngine.ts (NEW)
  server/multiEntityComparisonEngine.test.ts (NEW)
  server/routers.ts (APPEND-ONLY: market.compareEntities + entity param to getOutputGateStats)
  gpt_feedback/TYPE_REGISTRY.md (APPEND-ONLY)
  gpt_feedback/FEEDBACK_LEVEL15_0B.md (NEW)

[POST_APPLY_ACTION]
  restart_server
```

Estimated: ~200 lines, 3 files, ~45 minutes.

---

## OI Status

| OI | Status |
|----|--------|
| OI-L15-001 | OPEN — Multi-Entity Comparison Engine (Phase 1 backend) |
| OI-L15-002 | OPEN — Multi-Entity Comparison UI (Phase 2, after backend) |
| All Level 12–14 OIs | RESOLVED |
