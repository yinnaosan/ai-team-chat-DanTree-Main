# FEEDBACK — Level 12.10 Protocol Layer Live Wiring
**Date:** 2026-03-31
**Status:** COMPLETE
**OI Resolved:** OI-L12-010

---

## Summary

Protocol Layer rows in TerminalEntry ENGINE STATS are now **live** — no longer static placeholders.

---

## Files Modified

| File | Change |
|------|--------|
| `server/routers.ts` | Appended `market.getSemanticStats` publicProcedure query (~35 lines) |
| `client/src/pages/TerminalEntry.tsx` | Added `trpc` import + `useQuery` hook + wired 3 display values |
| `server/routers.getSemanticStats.test.ts` | **NEW** — 3 fallback path tests |

**Zero READ_ONLY files touched. Zero schema changes. Zero new server files.**

---

## Patch Summary

### Backend (`server/routers.ts`)
- Appended `getSemanticStats` to the `market` router (after `symbolSearch`)
- Input: `{ entity: string = "AAPL", timeframe: "intraday"|"short"|"mid"|"long"|"structural" = "mid" }`
- Calls: `buildSemanticActivationResult` → `buildSynthesisSemanticEnvelope` → `buildSemanticEngineStatsDisplay`
- Returns: `{ semantic_available, dominant_direction, confidence_score, conflict_count, state_regime }`
- On any error: graceful fallback with `semantic_available: false`, `dominant_direction: "—"`, `conflict_count: 0`

### Frontend (`client/src/pages/TerminalEntry.tsx`)
- Added `import { trpc } from "@/lib/trpc"` (line 10)
- Added `trpc.market.getSemanticStats.useQuery({ entity: "AAPL", timeframe: "mid" }, { refetchInterval: 60_000, staleTime: 30_000 })` in component body
- Wired:
  - **Direction** → `semanticStats?.dominant_direction ?? "—"`
  - **Confidence** → `confidence_score != null ? (score * 100).toFixed(0) + "%" : "—"`
  - **Conflicts** → `semanticStats?.conflict_count ?? 0`

---

## Test Results

| Layer | Test | Result |
|-------|------|--------|
| Layer 1 | `routers.getSemanticStats.test.ts` (3 tests) | ✅ PASS |
| Layer 2 | `semantic_engine_stats.test.ts` (39) + `level12_5_semantic_surface.test.ts` (38) | ✅ PASS |
| Layer 3 | `npx tsc --noEmit` | ✅ 0 errors |
| Layer 4 | Full regression: 1637/1643 | ✅ PASS (6 pre-existing failures in `financeDatabaseApi.test.ts` — environment dependency, unchanged) |

---

## Live Display Status

Protocol Layer rows now show real semantic engine values on page load:
- **Direction**: computed from `buildSemanticActivationResult` PATH-A/B/C dominant direction
- **Confidence**: percentage from `confidence_score` field (e.g. "72%")
- **Conflicts**: integer conflict count from `SynthesisSemanticEnvelope`
- Auto-refreshes every 60 seconds (`refetchInterval: 60_000`)
- Falls back gracefully to `"—" / 0` if semantic engine throws

---

## OI Status

| OI | Status | Notes |
|----|--------|-------|
| OI-L12-010 | **RESOLVED** | Protocol Layer live wiring complete |
| OI-L12-001 | DEFERRED | ExperienceLayerInsight enum migration — still natural language strings |
| financeDatabaseApi 6 failures | Pre-existing | `financedatabase` Python module not installed in test env |

---

## Suggested Next Steps

1. **OI-L12-001 (ExperienceLayerInsight enum migration)** — oldest open OI, deferred since L12.1. If next Claude task touches ExperienceLayer, resolve in same batch.
2. **financeDatabaseApi 6 failures** — run `sudo pip3 install financedatabase` or mock the tests to reach 1643/1643.
3. **Protocol Layer entity selector** — currently hardcoded to `"AAPL"`. Future enhancement: wire to the active research entity from conversation context.
