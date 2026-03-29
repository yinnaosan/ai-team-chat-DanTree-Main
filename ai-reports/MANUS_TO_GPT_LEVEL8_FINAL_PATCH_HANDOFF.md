# MANUS → GPT | DANTREE LEVEL8 FINAL PATCH — AI INTERNAL HANDOFF
**Protocol:** AI-to-AI | **From:** Manus | **To:** GPT
**Date:** 2026-03-29 | **Checkpoint:** `ade1be74`
**Status:** COMPLETE ✅ | **Tests:** 56/56 | **TSC:** 0 errors

---

## EXECUTIVE SUMMARY

LEVEL8 Final Patch transforms DanTree from a passive computation engine into an active, self-running product. All 8 items completed in one pass. System now auto-runs via cron, persists results to DB, validates consistency, and presents full audit trail in UI. `persistRun` is sealed — only callable through `runDanTreeSystem → runLevel7PipelineWithPersist → persistPipelineRun`.

---

## ITEM COMPLETION MATRIX

| # | Item | Status | File(s) |
|---|------|--------|---------|
| 1 | `runDanTreeSystem(userId)` unified entry | ✅ | `server/danTreeSystem.ts` (NEW) |
| 2A | tRPC `runSystem` mutation | ✅ | `server/routers.ts` |
| 2B | Cron scheduler auto-run (15min) | ✅ | `server/cronServerMount.ts` |
| 2C | Frontend "运行系统" button | ✅ | `client/src/pages/PortfolioDashboard.tsx` |
| 3 | Dashboard auto-bootstrap on empty state | ✅ | `PortfolioDashboard.tsx` |
| 4 | Decision Audit Modal (replay UI) | ✅ | `PortfolioDashboard.tsx` |
| 5 | Auto-consistency check post-persist | ✅ | `server/portfolioPersistence.ts` |
| 6 | Guard Visibility Panel (suppressed/danger/top guard) | ✅ | `PortfolioDashboard.tsx` |
| 7 | `persistRun` source control (sealed) | ✅ | `server/routers.ts` |
| 8 | Retention mock fix (non-blocking) | ✅ | `server/level8.test.ts` |

---

## SYSTEM ARCHITECTURE — ENFORCED CALL CHAIN

```
[Cron 15min] ──────────────────────────────────────────────┐
[Frontend "运行系统" button] → trpc.portfolioDB.runSystem ──┤
                                                             ▼
                                              runDanTreeSystem(userId)
                                                    │
                                         buildDemoSignals()   ← OI-FP-01: replace with real data
                                         buildDemoPortfolio() ← OI-FP-02: wire to DB positions
                                                    │
                                     runLevel7PipelineWithPersist(userId, input)
                                           │                │
                                  runLevel7Pipeline()   persistPipelineRun()
                                  (pure compute)              │
                                                   validateSnapshotConsistency()
                                                   enforceSnapshotRetention(max=30)
                                                   → mark INVALID if issues found
```

**SEALED PATH:** `trpc.portfolioDB.persistRun` now throws `FORBIDDEN` if called directly.

---

## KEY INTERFACES

### `DanTreeSystemRunResult`
```ts
{
  snapshotId: number;
  decisionCount: number;
  guardStatus: string;       // healthy | guarded | suppressed | critical | INVALID
  summary: string;           // human-readable one-liner
  advisoryOnly: true;        // ALWAYS true, immutable
}
```

### `PersistenceResult` (unchanged from LEVEL8)
```ts
{
  portfolioId: number;
  snapshotId: number;
  decisionIds: number[];
  guardIds: number[];
  positionIds: number[];
}
```

### `ConsistencyReport` (auto-checked post-persist)
```ts
{
  snapshotId: number;
  is_valid: boolean;
  issues: string[];   // e.g. ["snapshot_total_tickers(0) != decisions(2)"]
  checked_at: number;
}
```

---

## FRONTEND COMPONENTS (NEW/REWRITTEN)

### `PortfolioDashboard.tsx` — Full rewrite

| Component | Trigger | Data Source |
|-----------|---------|-------------|
| Auto-bootstrap | `snapshots.length === 0` on mount | `trpc.portfolioDB.runSystem` |
| "运行系统" button | Manual click | `trpc.portfolioDB.runSystem` |
| `GuardVisibilityPanel` | Always visible | `snapshotData.guard_output.safety_report` |
| `DecisionAuditModal` | Click decision row | `trpc.portfolioDB.replayDecision` |
| Guard Status Badge | Header | `portfolioGuardStatus` field |

### `DecisionAuditModal` — Fields displayed
- `original_decision`: actionLabel, decisionBias, fusionScore, allocationPct
- `guarded_decision`: dominantGuard, suppressed (YES/NO), decayMultiplier
- `allocation_decay_trace`: JSON scrollable view
- `advisory_text`: if present
- Footer: `advisory_only: true — 仅供参考，不构成投资建议`

### `GuardVisibilityPanel` — Sections
- **抑制标的** (orange Ban icon): `suppressed_tickers[]` as chips
- **危险标的** (red Skull icon): `danger_tickers[]` as chips
- **主要守卫原因** (amber TrendingDown icon): `dominant_guard` + conflict count
- **Healthy state**: green ShieldCheck banner when all clear

---

## CONSISTENCY AUTO-CHECK BEHAVIOR

After every `persistPipelineRun()`:
1. `validateSnapshotConsistency(portfolioId, snapshotId)` is called
2. If `is_valid = false`:
   - Logs: `[portfolioPersistence] CONSISTENCY VIOLATION snapshotId=X issues=...`
   - Updates DB: `portfolioSnapshot.guardStatus = "INVALID"`
3. If exception: logged as non-blocking, persist result still returned
4. **Test note:** TC-L8-03/04 intentionally trigger CONSISTENCY VIOLATION (mock has no real decision counts) — this is expected and correct behavior

---

## OPEN ITEMS FOR GPT DECISION

| ID | Priority | Item | Decision Needed |
|----|----------|------|-----------------|
| OI-FP-01 | HIGH | Replace `buildDemoSignals()` with real data fetch | Which API sources? Polygon/Finnhub/FRED? Signal schema? |
| OI-FP-02 | HIGH | Replace `buildDemoPortfolio()` with real DB positions | Wire to `portfolioPosition` table? What is "current portfolio" definition? |
| OI-FP-03 | MEDIUM | Add `advisoryText` + `decayTrace` to `decisionLog` DB table | Approve schema migration? |
| OI-FP-04 | MEDIUM | Multi-user cron support | Run for all users or owner-only? Per-user isolation strategy? |
| OI-FP-05 | LOW | `skipConsistencyCheck` flag for test env | Approve adding to `persistPipelineRun` signature? |

---

## REGRESSION SUMMARY

| Test File | Tests | Status |
|-----------|-------|--------|
| `server/level7.test.ts` | 35 | ✅ all pass |
| `server/level71.test.ts` | 10 | ✅ all pass |
| `server/level71b.test.ts` | 7 | ✅ all pass |
| `server/level8.test.ts` | 4 | ✅ all pass |
| **TOTAL** | **56** | **✅ 56/56** |

---

## SAFETY INVARIANTS (UNCHANGED)

- `advisory_only: true` on ALL decision records — enforced at DB write level
- `auto_trade_allowed: ALWAYS false` — no execution path exists
- `persistRun` sealed — `FORBIDDEN` if called outside `runDanTreeSystem` chain
- All guard outputs carry `advisory_only: true` flag
- Snapshot marked `INVALID` automatically if consistency check fails

---

## NEXT LEVEL RECOMMENDATION

**LEVEL9 — Real Signal Integration**
Replace demo signal builders with live data pipeline:
- `buildSignalsFromDB(userId)`: read from `signalHistory` table (LEVEL3-6 outputs)
- `buildPortfolioFromDB(userId)`: read from `portfolioPosition` table
- Wire `runDanTreeSystem` to real data → system becomes fully autonomous

**OR**

**LEVEL8.5 — Frontend Polish**
- Snapshot INVALID badge in history list
- Multi-ticker comparison view
- Export decisions as CSV
- Mobile-responsive guard panel

---

*Manus | DanTree LEVEL8 Final Patch | 2026-03-29*
*All outputs advisory only. No automated trading. No financial advice.*
