# L13.0A — Source Selection Engine Preflight Report
**Date:** 2026-03-31
**Task:** MANUS-ONLY Discovery Pass
**Status:** COMPLETE — Zero production files modified

---

## [TASK_RESULT]

| Field | Value |
|-------|-------|
| STATUS | COMPLETE |
| SCOPE_RESPECTED | YES |
| PRODUCTION_FILES_MODIFIED | NO |

---

## [EXISTING_RELEVANT_FILES]

| File | Lines | Role | Reusable for L13.0-B |
|------|-------|------|----------------------|
| `server/sourceSelectionEngine.ts` | 564 | **Core engine** — all source definitions (40+ sources), scoring, selection, validation, routing. `runSourceSelection()` is the main entry point. Already imported and called in `routers.ts`. | YES — primary target |
| `server/routers.ts` | ~5900 | Calls `runSourceSelection()` at line 1164 (LEVEL1B block, lines 1145–1170). Also imports `resourceBudget`, `model_router`. | YES — insertion point confirmed |
| `server/resourceBudget.ts` | 238 | Budget tracking, field-level deduplication, search cache. `BudgetTracker` class tracks per-task API usage. | YES — reusable for Phase 1 cost awareness |
| `server/model_router.ts` | 628 | LLM provider routing (Anthropic / OpenAI / stub). `PRODUCTION_ROUTING_MAP` maps `TaskType → provider`. | PARTIAL — reusable for model-source co-selection |
| `server/deepResearchEngine.ts` | 1219 | `DeepResearchContextMap` (the canonical data bag), `runDeepResearch()`. No source selection logic here — purely analytical. | READ-ONLY — context consumer, not source selector |
| `server/synthesisController.ts` | 378 | Step3 synthesis builder. No source selection logic. | READ-ONLY |
| `server/dataSourceRegistry.test.ts` | — | Existing test for data source registry patterns | Reference only |

**Key finding:** `sourceSelectionEngine.ts` already exists and is production-active. It is NOT a stub — it has 40+ `SOURCE_DEFINITIONS`, dynamic scoring, health caching, field routing, and multi-source validation. `runSourceSelection()` is already called in the main research pipeline at `routers.ts:1164`.

---

## [BEST_ATTACHMENT_POINT]

**Primary insertion point: `server/sourceSelectionEngine.ts` — extend in-place**

The engine already exists. The gap is:

1. **No test coverage** — `sourceSelectionEngine.test.ts` does not exist. This is the highest-risk gap.
2. **`runSourceSelection()` result is logged but not persisted** — `level1bSelectionResult` is computed at `routers.ts:1164` but only `console.log`'d. The result is never returned to the frontend or stored in the research output.
3. **No `getSourceSelectionStats` tRPC query** — frontend has no visibility into which sources were selected for a given research task.

**Why this is the best path:**
- Zero new architecture needed — the engine is live and working
- Insertion is additive: add tests + expose result via tRPC query
- No risk to semantic protocol (Level 12.x chain is entirely separate)

**Secondary insertion point: `server/routers.ts` lines 1164–1170**
- Optionally: pass `level1bSelectionResult` into the research output object so it surfaces in the response
- This is a ~5-line additive change with no logic modification

---

## [MINIMAL_PHASE1_SHAPE]

Phase 1 does NOT need new interfaces — all types already exist in `sourceSelectionEngine.ts`:

```ts
// Already exported — no new types needed:
SourceSelectionResult
SelectedSource
RouteResult
ValidationResult
SourceHealth
TaskType
Region
```

**What Phase 1 DOES need:**

1. **`server/sourceSelectionEngine.test.ts`** (new file, ~120 lines)
   - Tests for `runSourceSelection()` with each `TaskType`
   - Tests for `scoreSourceDynamic()` scoring logic
   - Tests for `validateMultiSource()` conflict detection
   - Tests for `isDirectionalThresholdReached()` gate logic

2. **`server/routers.ts`** (additive, ~15 lines)
   - Add `market.getSourceSelectionStats` publicProcedure query
   - Input: `{ taskType: TaskType, region: Region, fields: string[] }`
   - Returns: `SourceSelectionResult` shape (already typed)

3. **Optional: `server/routers.ts` line ~1170** (additive, ~3 lines)
   - Include `source_selection: level1bSelectionResult` in the research response object
   - Allows frontend to display which sources were used for a given analysis

**Rule-based mapping sufficient for Phase 1:** YES — `TASK_TYPE_CATEGORY_RELEVANCE` and `SOURCE_DEFINITIONS` already implement rule-based mapping. No ML needed.

---

## [FILE_PLAN_FOR_NEXT_TASK]

| File | Action | Estimated Lines | Notes |
|------|--------|-----------------|-------|
| `server/sourceSelectionEngine.test.ts` | CREATE | ~120 | Core test coverage — highest priority |
| `server/routers.ts` | APPEND | ~20 | Add `market.getSourceSelectionStats` query |
| `server/routers.ts` | EDIT (optional) | ~3 | Include `source_selection` in research response |

**Total change size: ~140 lines, 2 files (1 new, 1 modified)**

**READ-ONLY for L13.0-B:**
- `server/sourceSelectionEngine.ts` — do NOT modify production logic
- `server/deepResearchEngine.ts`
- `server/semantic_protocol.ts` and all Level 12.x semantic files
- `drizzle/schema.ts`

---

## [ROUTING_RECOMMENDATION]

**MANUS_DIRECT**

Rationale:
- All types and interfaces already exist and are exported
- No new architectural decisions required
- Test file is mechanical: call existing functions, assert known shapes
- tRPC query pattern is identical to `market.getSemanticStats` (just completed in L12.10)
- Zero risk of accidentally breaking semantic chain (entirely separate code path)

Claude is NOT needed unless the task expands to include new source definitions, scoring algorithm changes, or cross-engine integration logic.

---

## [RISKS]

| Risk | Severity | Mitigation |
|------|----------|------------|
| Accidentally modifying `sourceSelectionEngine.ts` scoring logic | HIGH | Mark as READ-ONLY in L13.0-B task package |
| Over-expanding scope to add new API sources | MEDIUM | Explicitly exclude external source onboarding from L13.0-B |
| Disturbing Level 12.x semantic chain | LOW | Semantic files are entirely separate; `runSourceSelection` has no imports from semantic layer |
| `level1bSelectionResult` inclusion in research response changing output shape | MEDIUM | Make it optional field (`source_selection?`) to avoid breaking existing consumers |
| Test file importing wrong path (subdirectory pattern) | LOW | All server files are flat — use `"./sourceSelectionEngine"` only |

---

## [SUGGESTED_NEXT_TASK]

**Level 13.0-B — Source Selection Engine Test Coverage + tRPC Exposure**

Mission:
1. Create `server/sourceSelectionEngine.test.ts` with ~120 lines covering all exported functions
2. Append `market.getSourceSelectionStats` publicProcedure to `server/routers.ts`
3. Optionally include `source_selection` as optional field in research response

Permitted modifications: `server/sourceSelectionEngine.test.ts` (new), `server/routers.ts`
Read-only: `server/sourceSelectionEngine.ts`, all semantic files, `drizzle/schema.ts`
Routing: MANUS_DIRECT
Expected test result: 1643+/1643 (adding ~10 new passing tests)
