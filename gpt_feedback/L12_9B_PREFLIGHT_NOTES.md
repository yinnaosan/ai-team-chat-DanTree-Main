# L12_9B_PREFLIGHT_NOTES.md — Protocol Layer Live Wiring Feasibility

**Task:** LEVEL12.9-B — Manus-Only Discovery
**Date:** 2026-03-31
**Scope:** Static code inspection only. Zero production file changes.

---

## FEASIBILITY VERDICT

```
FEASIBLE_WITHOUT_CLAUDE = YES
DISCOVERY_GAP_UI_PATH   = NO
NEEDS_NEW_TRPC_QUERY    = YES (one small append-only procedure)
RECOMMENDED_ROUTING     = MANUS_PLUS_TINY_BACKEND_PATCH
```

---

## EXACT BACKEND SOURCE FILES

| File | Role |
|------|------|
| `server/level12_4_semantic_activation.ts` | `buildSemanticActivationResult({ entity, timeframe })` — the live computation entry point |
| `server/semantic_aggregator.ts` | `buildSynthesisSemanticEnvelope(unifiedState)` — produces `dominant_direction`, `confidence_score`, `conflict_count` |
| `server/semantic_engine_stats.ts` | `buildSemanticEngineStatsDisplay(unifiedState?, envelope?)` — formats the three values for display |
| `server/routers.ts` | Already calls `buildSemanticActivationResult` + `buildSynthesisSemanticEnvelope` at line 2149–2168 (inside `runCollaborationFlow` Step3 context block). **No standalone query exists yet.** |

---

## EXACT FRONTEND TARGET FILES

| File | Role |
|------|------|
| `client/src/pages/TerminalEntry.tsx` | Contains Protocol Layer placeholder rows (lines 416–431). Currently **zero tRPC hooks** — only `useAuth()` and local `useState/useEffect`. No existing query to piggyback on. |

---

## DATA FLOW ANALYSIS

### Current path (backend → prompt only, never reaches frontend):
```
runCollaborationFlow (Step3)
  → buildSemanticActivationResult({ entity: primaryTicker, timeframe: "mid" })
  → buildSynthesisSemanticEnvelope(unifiedState)
  → serialized as text block → injected into GPT prompt
  → NEVER returned in tRPC response
```

### Missing link:
`TerminalEntry.tsx` has **no tRPC query at all**. The semantic computation exists on the server but is only used as a prompt enrichment string, not as structured data returned to the frontend.

---

## MINIMAL PATCH PLAN

### Step 1 — Backend: Add one tiny `publicProcedure` query in `server/routers.ts`

Append to an appropriate router group (e.g., `market` or a new `semantic` sub-router):

```ts
getSemanticStats: publicProcedure
  .input(z.object({
    entity: z.string().default("AAPL"),
    timeframe: z.enum(["intraday","short","mid","long","structural"]).default("mid"),
  }))
  .query(async ({ input }) => {
    try {
      const { buildSemanticActivationResult } = await import("./level12_4_semantic_activation");
      const { buildSynthesisSemanticEnvelope } = await import("./semantic_aggregator");
      const { buildSemanticEngineStatsDisplay } = await import("./semantic_engine_stats");
      const result = buildSemanticActivationResult({ entity: input.entity, timeframe: input.timeframe });
      const envelope = result.unifiedState
        ? buildSynthesisSemanticEnvelope(result.unifiedState)
        : undefined;
      return buildSemanticEngineStatsDisplay(result.unifiedState ?? undefined, envelope);
    } catch {
      const { buildSemanticEngineStatsDisplay } = await import("./semantic_engine_stats");
      return buildSemanticEngineStatsDisplay(undefined, undefined);
    }
  }),
```

**Files touched:** `server/routers.ts` only (append-only, ~15 lines)

### Step 2 — Frontend: Wire TerminalEntry.tsx Protocol Layer rows

Add `trpc` import + one `useQuery` call in `TerminalEntry` component:

```tsx
import { trpc } from "@/lib/trpc";

// Inside TerminalEntry():
const { data: semanticStats } = trpc.market.getSemanticStats.useQuery(
  { entity: "AAPL", timeframe: "mid" },
  { refetchInterval: 60_000, staleTime: 30_000 }
);
```

Replace static placeholder values:
- `Direction` → `semanticStats?.dominant_direction ?? "—"`
- `Confidence` → `semanticStats?.confidence_score != null ? (semanticStats.confidence_score * 100).toFixed(0) + "%" : "—"`
- `Conflicts` → `semanticStats?.conflict_count ?? 0`

**Files touched:** `client/src/pages/TerminalEntry.tsx` only (append-only, ~10 lines)

---

## SCOPE ASSESSMENT

| Criterion | Assessment |
|-----------|-----------|
| New tRPC procedure needed | YES — 1 small `publicProcedure.query`, ~15 lines |
| New router group needed | NO — append to existing `market` router |
| Schema migration needed | NO |
| New server file needed | NO |
| Frontend hook complexity | LOW — 1 `useQuery`, graceful fallback to `"—"` |
| Risk level | LOW — pure read path, no writes, no auth required |
| Claude needed | NO — Manus can implement directly |

---

## RECOMMENDED ROUTING

**`MANUS_PLUS_TINY_BACKEND_PATCH`**

Manus can implement this in the next task (L12.10 or L12.9C) with:
- 1 append-only patch to `server/routers.ts` (~15 lines)
- 1 append-only patch to `client/src/pages/TerminalEntry.tsx` (~10 lines)
- 1 new vitest test for the new procedure
- No Claude involvement required

**Suggested test subset for follow-up task:**
- `server/semantic_engine_stats.test.ts` (existing, 39 tests — confirm no regression)
- New: `server/routers.getSemanticStats.test.ts` (1 test: returns `semantic_available: false` on empty input)

---

## OI STATUS

| OI | Status |
|----|--------|
| OI-L12-010 | IN_DISCOVERY → READY_FOR_MANUS_DIRECT_IMPLEMENTATION |
| OI-L12-001 | DEFERRED (no change) |
