# FEEDBACK_LEVEL12_9B.md — Manus → GPT

**Task:** Level 12.9B — Protocol Layer Live Wiring Preflight
**Date:** 2026-03-31
**Manus Version:** V2.1 workflow

---

## [TASK_RESULT]

STATUS = COMPLETE
SCOPE_RESPECTED = YES
PRODUCTION_FILES_MODIFIED = NO
DISCOVERY_COMPLETE = YES

---

## [FEASIBILITY_VERDICT]

```
FEASIBLE_WITHOUT_CLAUDE  = YES
DISCOVERY_GAP_UI_PATH    = NO
NEEDS_NEW_TRPC_QUERY     = YES (one ~15-line publicProcedure.query)
RECOMMENDED_ROUTING      = MANUS_PLUS_TINY_BACKEND_PATCH
```

---

## [EXACT_BACKEND_SOURCE_FILES]

| File | Role |
|------|------|
| `server/level12_4_semantic_activation.ts` | `buildSemanticActivationResult({ entity, timeframe })` — live computation entry point |
| `server/semantic_aggregator.ts` | `buildSynthesisSemanticEnvelope(unifiedState)` — produces `dominant_direction`, `confidence_score`, `conflict_count` |
| `server/semantic_engine_stats.ts` | `buildSemanticEngineStatsDisplay(unifiedState?, envelope?)` — formats display values |
| `server/routers.ts` | Already calls the above at line 2149–2168 (inside Step3 prompt enrichment). **No standalone query exists yet.** |

---

## [EXACT_FRONTEND_TARGET_FILES]

| File | Role |
|------|------|
| `client/src/pages/TerminalEntry.tsx` | Protocol Layer placeholder rows at lines 416–431. Currently **zero tRPC hooks** — only `useAuth()` and local state. |

---

## [CURRENT_DATA_FLOW]

```
runCollaborationFlow (Step3 prompt enrichment only)
  → buildSemanticActivationResult → buildSynthesisSemanticEnvelope
  → serialized as text string → injected into GPT prompt
  → NEVER returned in tRPC response to frontend
```

**Missing link:** No standalone tRPC query exposes semantic stats to frontend. TerminalEntry.tsx has no existing query to piggyback on.

---

## [MINIMAL_PATCH_PLAN]

**Backend patch** — append to `server/routers.ts` `market` router (~15 lines):
```ts
getSemanticStats: publicProcedure
  .input(z.object({ entity: z.string().default("AAPL"), timeframe: ... }))
  .query(async ({ input }) => {
    // calls buildSemanticActivationResult → buildSynthesisSemanticEnvelope → buildSemanticEngineStatsDisplay
    // graceful fallback: returns semantic_available: false on any error
  }),
```

**Frontend patch** — append to `TerminalEntry.tsx` (~10 lines):
```tsx
const { data: semanticStats } = trpc.market.getSemanticStats.useQuery(
  { entity: "AAPL", timeframe: "mid" },
  { refetchInterval: 60_000, staleTime: 30_000 }
);
// Wire: Direction → semanticStats?.dominant_direction ?? "—"
// Wire: Confidence → semanticStats?.confidence_score formatted as %
// Wire: Conflicts → semanticStats?.conflict_count ?? 0
```

**Total scope:** 2 files, ~25 lines, no schema changes, no new server files, no Claude required.

---

## [OI_STATUS]

| OI | Status |
|----|--------|
| OI-L12-010 | IN_DISCOVERY → **READY_FOR_MANUS_DIRECT_IMPLEMENTATION** |
| OI-L12-001 | DEFERRED (no change) |

---

## [RECOMMENDED_NEXT_TASK]

**L12.10 — Protocol Layer Live Wiring (MANUS_DIRECT)**

Scope:
- `[PERMITTED_MODIFICATIONS]`: `server/routers.ts`, `client/src/pages/TerminalEntry.tsx`
- Backend: append `getSemanticStats` query to `market` router
- Frontend: add `trpc.market.getSemanticStats.useQuery` + wire 3 display values
- Test: add 1 vitest for new procedure (`semantic_available: false` fallback)
- Full regression after implementation

**Full preflight notes saved at:** `gpt_feedback/L12_9B_PREFLIGHT_NOTES.md`
