# MANUS → GPT | Internal Handoff Report
## DANTREE LEVEL7 — Portfolio Decision Layer

**From:** Manus (Data & Engineering)
**To:** GPT (Strategy & Advisory Review)
**Date:** 2026-03-28
**Checkpoint:** `0e61f060`
**Status:** ✅ GO — All tests pass, ready for GPT review

---

## What Was Built

LEVEL7 is the final advisory intelligence tier of DanTree. It takes raw multi-source signals from LEVEL3–LEVEL6 and transforms them into structured, ranked, human-readable portfolio recommendations. **No auto-trade. No order generation. Advisory-only throughout.**

Four new server-side modules were implemented:

| Module | File | Lines |
|--------|------|-------|
| Portfolio State + Signal Fusion | `server/portfolioState.ts` | ~350 |
| Position Sizing + Risk Budget | `server/positionSizingEngine.ts` | ~280 |
| Decision Ranker + Advisory Output | `server/portfolioDecisionRanker.ts` | ~320 |
| Safety Guards | `server/portfolioSafetyGuard.ts` | ~230 |

---

## Signal Fusion Logic (Phase 2) — Key Formula

GPT should be aware of the weighting used in `fuseSignals()`:

```
raw_fusion = alpha_score × 0.35
           + memory_score × 0.25
           + trigger_score × 0.20
           + (1 - risk_score) × 0.20

fusion_score = (raw_fusion + regime_adjustment)
             × freshness_multiplier
             × source_quality
             − sample_penalty
```

**Priority chain (hard-coded, not overridable):**
1. `memory_contradiction = true` → `recheck` (highest priority)
2. `trigger_severity = critical` → `avoid`
3. `danger_score ≥ 0.75` → `avoid`
4. `danger_score ≥ 0.55` → `reduce`
5. `fusion_score ≥ 0.75` → `strong_buy`
6. `fusion_score ≥ 0.55` → `buy`
7. `fusion_score ≥ 0.40` → `hold`
8. `fusion_score ≥ 0.25` → `monitor`
9. default → `reduce`

---

## Position Sizing Buckets (Phase 3)

| Bucket | Default % | Trigger Conditions |
|--------|-----------|-------------------|
| `large` | 8% | fusion ≥ 0.70 AND samples ≥ 20 |
| `medium` | 5% | fusion ≥ 0.50 AND samples ≥ 10 |
| `small` | 3% | fusion ≥ 0.30 |
| `minimal` | 1% | samples < 5 OR confidence = low |
| `none` | 0% | avoid / danger ≥ 0.75 / cash floor hit |

Cash reserve floor default: **10%**. Max single position: **10%**.

---

## Action Labels & Resolution Logic (Phase 5)

| Label | Condition |
|-------|-----------|
| `INITIATE` | New ticker, positive sizing |
| `ADD` | Existing holding, target > current + 1% |
| `TRIM` | Existing holding, target < current − 1% |
| `HOLD` | Existing holding, within ±1% band |
| `EXIT` | Existing holding + avoid/danger signal |
| `AVOID` | New ticker + avoid signal |
| `MONITOR` | Positive but insufficient confidence |
| `RECHECK` | Memory contradiction detected |

Ranking sort order: `INITIATE > ADD > TRIM > HOLD > RECHECK > MONITOR > EXIT > AVOID`, then by `final_score` descending within each group.

---

## Risk Budget Thresholds (Phase 4)

| Dimension | Warn | Critical | Default Max |
|-----------|------|----------|-------------|
| Sector concentration | 35% | 50% | 35% |
| Theme concentration | 30% | 45% | 30% |
| Thesis cluster (≥2 shared themes) | 25% | 40% | 25% |
| High-danger candidate count | 2 | 4 | 3 |
| Cash reserve | < 10% | < 5% | 10% floor |

Risk budget status: `healthy → stretched → concentrated → critical`

---

## Safety Guards Summary (Phase 7)

Four guards are implemented as standalone functions (not yet auto-wired into pipeline — see Open Items):

1. **Churn Guard** (`applyChurnGuard`): Suppresses actionable decisions if same ticker was actioned within 48h cooldown. Downgrades to `MONITOR`.
2. **Overfit Detection** (`detectOverfitFlags`): Flags tickers with ≥5 consecutive high-score cycles (≥0.65) within 7-day lookback. Indicates stale alpha.
3. **Conflict Detection** (`detectDecisionConflicts`): Detects opposing action pairs (e.g., INITIATE vs EXIT on different tickers in same session).
4. **Sample Enforcement** (`applySampleEnforcement`): Downgrades actionable decisions to MONITOR if sample_count < 5.

---

## Pipeline Orchestrator

Single-call entry point for GPT to reference when discussing integration:

```typescript
const result = runLevel7Pipeline({
  portfolio: PortfolioState,
  signals: SignalInput[],
});

// result shape:
// {
//   portfolio_view: PortfolioView,       // ranked decisions
//   advisory_output: AdvisoryOutput,     // human-readable explanations
//   risk_budget: RiskBudgetReport,       // concentration warnings
//   fusion_decisions: FusionDecision[],  // raw fusion outputs
//   advisory_only: true,                 // ALWAYS true
// }
```

---

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| Phase 1 — Portfolio State | 5 | ✅ |
| Phase 2 — Multi-Signal Fusion | 8 | ✅ |
| Phase 3 — Position Sizing | 4 | ✅ |
| Phase 4 — Risk Budget | 4 | ✅ |
| Phase 5+6 — Ranking & Advisory | 5 | ✅ |
| Phase 7 — Safety Guards | 9 | ✅ |
| **LEVEL7 Total** | **35** | ✅ |
| **Full Regression (59 files)** | **1099** | ✅ |
| **TypeScript** | 0 errors | ✅ |

---

## Open Items — Needs GPT Input

The following items are deferred and require GPT's strategic input before implementation:

| ID | Item | Question for GPT |
|----|------|-----------------|
| OI-L7-1 | DB persistence for portfolio state | Should `portfolio_holdings` be per-user or shared? Should we track cost basis and current price in DB? |
| OI-L7-2 | tRPC API exposure | Which procedures should be public vs protected? Should advisory output be cached (TTL)? |
| OI-L7-3 | Safety guard pipeline integration | Should all 4 guards run by default, or be configurable per-user? Should `SafetyReport` be included in the main pipeline output? |
| OI-L7-4 | Frontend Portfolio Dashboard | Priority: ranked decisions list first, or risk budget heatmap first? |
| OI-L7-5 | Signal freshness TTL | Current default: signals older than 7 days get max freshness penalty. Is this appropriate for the investment thesis timeframe? |

---

## Invariants — Confirmed Maintained

- `auto_trade_allowed: ALWAYS false` — hardcoded, no execution path exists
- `advisory_only: true` — enforced on all 4 module outputs
- Append-only audit logs — no delete/update in new code
- Kill switch + auto-failsafe — inherited from LEVEL5.1, untouched
- Full backward compatibility — 1099/1099 tests pass

---

## Files Delivered This Cycle

```
server/portfolioState.ts          ← Phase 1+2
server/positionSizingEngine.ts    ← Phase 3+4
server/portfolioDecisionRanker.ts ← Phase 5+6
server/portfolioSafetyGuard.ts    ← Phase 7
server/level7.test.ts             ← 35 validation tests
ai-reports/DANTREE_LEVEL7_PORTFOLIO_DECISION_REPORT.md  ← Full return report
ai-reports/MANUS_TO_GPT_LEVEL7_HANDOFF.md               ← This file
```

---

**Manus out. Awaiting GPT strategic review on Open Items OI-L7-1 through OI-L7-5.**
