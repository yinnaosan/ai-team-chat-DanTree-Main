# FEEDBACK — Level 16.1A: Portfolio Basket UI (Manus Direct)
**Date:** 2026-04-01
**Classification:** MANUS_DIRECT
**Status:** COMPLETE — Basket Analysis panel live on Terminal Entry page

---

## Files Modified

| File | Action | Notes |
|---|---|---|
| `client/src/pages/TerminalEntry.tsx` | MODIFIED | Basket state + query + panel JSX added |
| `gpt_feedback/FEEDBACK_LEVEL16_1A.md` | ADDED | This file |

**Server files modified:** NONE  
**Schema files modified:** NONE  
**READ_ONLY files modified:** NONE  
**New routes/pages:** NONE

---

## UI Patch Summary

Added a compact **BASKET ANALYSIS** panel below the ENTITY COMPARISON panel in `TerminalEntry.tsx`. The panel follows the same visual language as ComparisonPanel (monospace terminal aesthetic, `te-panel` class, advisory disclaimer in header).

---

## Basket Input & Submit

- **5 input slots** rendered via `Array.from({ length: BASKET_SLOTS })`, each capped at 10 chars, auto-uppercase
- **Default values:** Slot 1 = `activeEntity` (or `"AAPL"`), Slot 2 = `"MSFT"`, Slot 3 = `"NVDA"`, Slots 4–5 empty
- **Slot 1 prefill:** `basketInitialized` ref syncs Slot 1 to `activeEntity` on first load (same pattern as ComparisonPanel)
- **Submit:** `ANALYZE` button or `Enter` key → `handleBasketRun()` → filters empty slots → updates `basketEntities` state
- **Query:** `trpc.market.analyzeBasket.useQuery({ entities: cleanedBasket, taskType: "portfolio_review", region: "US" }, { enabled: cleanedBasket.length >= 2 })`
- `cleanedBasket` is `useMemo`-stabilized to prevent infinite re-fetch

---

## Display Elements

1. **Per-entity gate badges** — color-coded: green (PASS), red (BLOCK), gray (UNAVAILABLE)
2. **5-dimension table** — Thesis Overlap, Concentration, Shared Fragility, Evidence Dispersion, Gate Distribution
3. **basket_summary** — rendered in advisory blockquote style
4. **Unavailable fallback** — all fields default to `"—"` when null/undefined
5. **Loading state** — button shows `"..."`, body shows `"Analyzing basket..."`
6. **Empty state** — `"Enter at least 2 tickers and press ANALYZE"` when cleanedBasket < 2

---

## Test Results

| Check | Result |
|---|---|
| TSC `--noEmit` | **0 errors** |
| Full regression | **1772/1778 pass** (6 pre-existing `financeDatabaseApi` failures) |
| New tests added | NONE (UI-only change, no new server logic) |

---

## OI Status

| OI | Status |
|----|--------|
| OI-L16-002 | ✅ RESOLVED — Basket Analysis UI live on Terminal Entry |
| OI-L16-001 | ✅ RESOLVED (L16.0C) |
| OI-L15-003 | ⏳ DEFERRED — Protocol Layer 'unavailable' session-binding, non-blocking |

---

## Scope Compliance

- No server files modified ✅
- No schema files modified ✅
- No new routes/pages ✅
- No alerts/history/persistence/rebalancing ✅
- Unavailable values render safely as "—" ✅
- Basket input accepts 2–5 tickers (up to 5 slots, submits only non-empty) ✅
