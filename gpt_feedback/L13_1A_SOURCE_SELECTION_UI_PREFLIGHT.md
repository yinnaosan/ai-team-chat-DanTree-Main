# L13.1A — Source Selection UI Visibility Preflight
**Date:** 2026-04-01
**Task:** DISCOVERY-ONLY — no production files modified
**Status:** COMPLETE

---

## 1. Current UI Structure (TerminalEntry.tsx)

The homepage (`client/src/pages/TerminalEntry.tsx`) has three data panels:

| Panel | Location | Current Data |
|-------|----------|-------------|
| MARKET STATUS | Left column | Static exchange open/close status |
| SYSTEM STATUS | Center column | Static `SYSTEM_STATUS` array (6 rows including "Source Router") |
| ENGINE STATS | Right column | Static stats + Protocol Layer (live via `trpc.market.getSemanticStats`) |

### Existing tRPC hook pattern (L12.10 reference)
```tsx
// Line 306 — already in TerminalEntry.tsx
const { data: semanticStats } = trpc.market.getSemanticStats.useQuery(
  { entity: "AAPL", timeframe: "mid" },
  { refetchInterval: 60_000, staleTime: 30_000 }
);
```
This is the exact pattern to replicate for `getSourceSelectionStats`.

---

## 2. Recommended Frontend Target

**Primary target: SYSTEM STATUS panel — "Source Router" row**

- **File:** `client/src/pages/TerminalEntry.tsx`
- **Current state:** `Source Router` row is hardcoded as `{ status: "ONLINE", color: "text-emerald-400" }` in the static `SYSTEM_STATUS` array (line 62)
- **Proposed change:** Replace static "ONLINE" with live `top_source` value from `market.getSourceSelectionStats`

**Why this placement:**
1. "Source Router" is already semantically correct — it describes exactly what `sourceSelectionEngine` does
2. Minimal surface area: only 1 row changes from static to live
3. Consistent with L12.10 pattern (Protocol Layer in ENGINE STATS)
4. No new UI sections needed — zero layout risk

**Secondary option: ENGINE STATS panel — new "Source Layer" sub-section**
- Could mirror the "Protocol Layer" sub-section pattern
- Would show: Top Source / Source Count / Selection Status
- More visible but requires more lines and a new divider row
- Recommend deferring unless GPT wants richer visibility

---

## 3. Minimal Patch Plan

### Option A (Recommended): SYSTEM STATUS "Source Router" row live update

**File:** `client/src/pages/TerminalEntry.tsx`
**Approximate lines changed:** ~15 lines total

**Step 1 — Add useQuery hook (~3 lines):**
```tsx
// After line 308 (semanticStats hook)
const { data: sourceStats } = trpc.market.getSourceSelectionStats.useQuery(
  { entity: "AAPL" },
  { refetchInterval: 60_000, staleTime: 30_000 }
);
```

**Step 2 — Replace static SystemStatusPanel with live version (~12 lines):**
The `SystemStatusPanel` function (lines 251–270) currently maps over the static `SYSTEM_STATUS` array. Two options:

- **Option A1 (simplest):** Keep static array, override the "Source Router" row inline using `sourceStats?.top_source`
- **Option A2 (cleaner):** Pass `sourceStats` as prop to `SystemStatusPanel` and compute display value inside

**Data mapping:**
```
sourceStats.selection_available → show "ONLINE" (green) or "DEGRADED" (yellow)
sourceStats.top_source          → show as status value, e.g. "yahoo_finance"
sourceStats.source_count        → optional tooltip or secondary display
```

**Display example:**
```
Source Router    yahoo_finance   ← replaces "ONLINE"
```

---

## 4. Can Manus Implement Directly (Level13.1-B)?

**YES — MANUS_DIRECT, no Claude needed.**

Reasons:
- Pattern is identical to L12.10 (`getSemanticStats` → Protocol Layer)
- Only 1 file modified: `client/src/pages/TerminalEntry.tsx`
- No new components, no schema changes, no server changes
- `market.getSourceSelectionStats` is already live and returning correct data

**Estimated scope:**
- ~15 lines modified in `client/src/pages/TerminalEntry.tsx`
- 0 server changes
- 0 schema changes
- 1 new test (optional: verify hook renders without crash)

---

## 5. Blockers / Discovery Gaps

| Item | Status |
|------|--------|
| `market.getSourceSelectionStats` live and returning data | CONFIRMED |
| `SystemStatusPanel` is a standalone function (easy to modify) | CONFIRMED |
| `SYSTEM_STATUS` is a module-level const array | CONFIRMED — needs inline override or prop pass |
| No existing test for TerminalEntry rendering | NOTED — not blocking |

**One minor design decision needed for L13.1-B:**
The `SystemStatusPanel` function currently maps over the static array without access to live data. The cleanest approach is to move the "Source Router" row out of the static array and render it separately with live data — same pattern as Protocol Layer in ENGINE STATS.

---

## 6. Confirmation

- **No production files modified in this task:** CONFIRMED
- **No server/ files modified:** CONFIRMED
- **No client/ files modified:** CONFIRMED
- **No drizzle/ files modified:** CONFIRMED
