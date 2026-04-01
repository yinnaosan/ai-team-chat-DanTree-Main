# FEEDBACK — Level 15.1A: Entity Comparison Panel UI
**Date:** 2026-04-01
**Manus Version:** b9c9dfc3 → new checkpoint
**OI Resolved:** OI-L15-002 (ComparisonPanel UI)
**Status:** COMPLETE

---

## Summary

Added ENTITY COMPARISON panel to `TerminalEntry.tsx`:
- Two ticker input boxes (A vs B), Enter key or RUN button triggers query
- 5-dimension table: Semantic Dir / Evidence / Gate / Sources / Fragility
- Winner column with green (left wins) / red (right wins) / gray (tie) coloring
- Comparison summary text block with cyan left border
- Graceful loading state ("Comparing...") and empty state ("Enter two tickers and press RUN")

**Files Modified:** `client/src/pages/TerminalEntry.tsx` (+80 lines, frontend only)
**Files Added:** none
**Server Changes:** none
**Schema Changes:** none

---

## Test Results

| Layer | Result |
|-------|--------|
| TSC | 0 errors |
| Full Regression | 1727/1733 pass (6 pre-existing financeDatabaseApi failures, unchanged) |

---

## OI Status After This Task

| OI | Status |
|----|--------|
| OI-L15-002 (ComparisonPanel UI) | ✅ RESOLVED |
| OI-L15-001 (compareEntities backend) | ✅ RESOLVED (L15.0B) |
| All L12–L14 OIs | ✅ ALL RESOLVED |

---

## Known Limitations

1. **Comparison defaults to AAPL vs MSFT** (not `activeEntity`). This is intentional — the panel is for ad-hoc comparison, not tied to the current research entity. User can type any two tickers.

2. **5 dimensions show "—"** when backend returns fallback data (no real research session). This is expected behavior — the comparison engine uses static fallbacks when no `DeepResearchContextMap` is available.

3. **Panel layout**: Currently rendered below the 3-panel row as a full-width strip. If the layout feels crowded, consider moving it to a collapsible section or a dedicated `/compare` route.

---

## Recommended Next Steps

1. **L15.2 — activeEntity pre-fill**: Initialize `compInputA` from `rpaConfig.lastTicker` instead of hardcoded "AAPL", so the panel auto-populates with the user's current research entity.

2. **L15.3 — Comparison history**: Store last 3 comparison results in localStorage so users can reference previous comparisons without re-running.

3. **OI-L16-001 — Protocol Layer Direction fix**: Direction shows "unavailable" because it requires a full `DeepResearchContextMap`. Consider caching the last research session's semantic output so Direction persists after analysis completes.
