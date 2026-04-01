# FEEDBACK: LEVEL 13.4B — Active Research Entity Binding

**Status:** COMPLETE
**Date:** 2026-04-01
**Files Modified:** client/src/pages/TerminalEntry.tsx (1 file, frontend-only)
**Files Created:** gpt_feedback/FEEDBACK_LEVEL13_4B.md

---

## Summary

Level 13.4B implemented the active entity binding for all Terminal live panels. The 3 live data queries in TerminalEntry.tsx now use the user's persisted `lastTicker` from `trpc.rpa.getConfig` instead of the hardcoded `"AAPL"` fallback.

### Changes Applied

**client/src/pages/TerminalEntry.tsx:**

1. Added `trpc.rpa.getConfig.useQuery` hook (lines 310–314):
   ```tsx
   // [Level13.4B] Active entity from persisted user config — OI-L13-004
   const { data: rpaConfig } = trpc.rpa.getConfig.useQuery(undefined, {
     staleTime: 30_000,
     enabled: !!user,
   });
   const activeEntity: string = (rpaConfig as any)?.lastTicker ?? "AAPL";
   ```

2. Replaced `entity: "AAPL"` → `entity: activeEntity` in `getSourceSelectionStats` (line 317)

3. Replaced `entity: "AAPL"` → `entity: activeEntity` in `getSemanticStats` (line 330)

4. `getOutputGateStats` — no entity param, no change needed

### Behavior
- When user is authenticated and has a `lastTicker` saved: Terminal panels reflect their active research entity
- When user is unauthenticated or `lastTicker` is null: graceful fallback to `"AAPL"`
- `enabled: !!user` guard prevents unnecessary auth errors for unauthenticated visitors

---

## Test Results

| Layer | Result |
|-------|--------|
| TSC | ✅ 0 errors |
| Full Regression | ✅ 1679/1685 passed |
| Pre-existing failures | 6 (server/financeDatabaseApi.test.ts — environment dependency, unchanged) |

---

## OI Status

| OI | Status |
|----|--------|
| OI-L13-004 | ✅ RESOLVED — Active entity binding complete |
| OI-L13-003 | ✅ RESOLVED (L13.3A) |
| OI-L13-002 | ✅ RESOLVED (L13.2B) |
| OI-L13-001 | ✅ RESOLVED (L13.1B) |
| OI-L12-001 | DEFERRED — ExperienceLayerInsight enum migration |

---

## Terminal Live Panel Summary — Final State

All 3 live data sections now use `activeEntity` (user's last researched ticker):

| Panel | Data Source | Entity Binding |
|-------|-------------|----------------|
| Source Router (SYSTEM STATUS) | `market.getSourceSelectionStats` | ✅ activeEntity |
| Protocol Layer (ENGINE STATS) | `market.getSemanticStats` | ✅ activeEntity |
| Output Gate (ENGINE STATS) | `market.getOutputGateStats` | N/A (system-level) |

---

## Next Recommended Steps

1. **OI-L12-001 (ExperienceLayerInsight enum migration)**: Oldest unresolved OI, deferred since L12.1. Recommend next Claude task batch.

2. **financeDatabaseApi pre-existing failures**: `sudo pip3 install financedatabase` eliminates 6 failures, achieves 1685/1685.

3. **Terminal entity label display**: Consider showing `activeEntity` as a small label in the ENGINE STATS header (e.g., "ENGINE STATS · AAPL") so the user knows which entity the live panels are reflecting.
