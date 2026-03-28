# DANTREE LEVEL7 — Portfolio Decision Layer
## Return Report

**Date:** 2026-03-28  
**Decision:** ✅ **GO**  
**Test Status:** 35/35 LEVEL7 tests ✅ | 1099/1099 full regression ✅ (59 test files)  
**TSC:** 0 errors  
**Previous checkpoint:** `8e41a7bf` (CRON + Outcome Auto-Resolve)

---

## Executive Summary

LEVEL7 implements the **Portfolio Decision Layer** — the final advisory intelligence tier of the DanTree system. It transforms raw multi-source signals (LEVEL3–LEVEL6) into structured, ranked, human-readable portfolio recommendations. The system is strictly **advisory-only**: `auto_trade_allowed: ALWAYS false`, no order generation, no position execution.

---

## Architecture: 4 New Modules

| Module | File | Responsibility |
|--------|------|----------------|
| Portfolio State | `portfolioState.ts` | Holding abstraction + multi-signal fusion engine |
| Position Sizing | `positionSizingEngine.ts` | Bucket-based sizing + risk budget/concentration |
| Decision Ranker | `portfolioDecisionRanker.ts` | Ranking + advisory explanation layer + pipeline orchestrator |
| Safety Guards | `portfolioSafetyGuard.ts` | Anti-overfit + churn prevention + conflict detection |

---

## Phase-by-Phase Implementation

### Phase 1: Portfolio State & Holding Abstraction (`portfolioState.ts`)

**Data Model:**
- `Holding`: ticker, sector, themes[], weight_pct, status (active/watch/exited/pending), cost_basis, current_price
- `PortfolioState`: portfolio_id, holdings[], cash_reserve_pct, total_positions, timestamps

**Utility functions:**
- `getActiveHoldings()` — filter by status=active
- `getSectorWeights()` — aggregate sector exposure
- `getThemeWeights()` — aggregate theme exposure (multi-theme per holding)
- `getTotalAllocatedPct()` — sum of active holding weights
- `getHoldingByTicker()` — O(n) lookup

### Phase 2: Multi-Signal Decision Fusion (`portfolioState.ts`)

**Input:** `SignalInput` — aggregates signals from all prior layers:
- LEVEL6 Alpha: `alpha_score`, `alpha_tier`, `sample_count`
- LEVEL4 Trigger: `trigger_fired`, `trigger_severity`
- LEVEL3 Memory: `failure_intensity`, `success_strength`, `memory_contradiction`
- LEVEL5 Market: `risk_score`, `price_change_pct`
- LEVEL6 Regime: `regime_relevance`, `source_quality`, `signal_freshness_ms`

**Fusion formula:**
```
raw_fusion = alpha × 0.35 + memory × 0.25 + trigger × 0.20 + (1-risk) × 0.20
fusion_score = (raw_fusion + regime_adjustment) × freshness × source_quality − sample_penalty
```

**Decision bias priority chain:**
1. `memory_contradiction` → `recheck` (highest priority)
2. `trigger_severity=critical` → `avoid`
3. `danger_score ≥ 0.75` → `avoid`
4. `danger_score ≥ 0.55` → `reduce`
5. `fusion_score ≥ 0.75` → `strong_buy`
6. `fusion_score ≥ 0.55` → `buy`
7. `fusion_score ≥ 0.40` → `hold`
8. `fusion_score ≥ 0.25` → `monitor`
9. default → `reduce`

**Confidence levels:** `high` / `medium` / `low` / `insufficient` (based on score + sample count)

### Phase 3: Position Sizing Engine (`positionSizingEngine.ts`)

**Bucket system:**
| Bucket | Default % | Requirements |
|--------|-----------|--------------|
| large | 8% | fusion ≥ 0.70, samples ≥ 20 |
| medium | 5% | fusion ≥ 0.50, samples ≥ 10 |
| small | 3% | fusion ≥ 0.30 |
| minimal | 1% | samples < 5 or low confidence |
| none | 0% | avoid/danger/cash floor |

**Caps applied in order:**
1. `danger_score ≥ 0.75` → none (0%)
2. `decision_bias=avoid` → none (0%)
3. `danger_score ≥ 0.55` → cap at small
4. `fusion_confidence=insufficient` → cap at minimal
5. `fusion_confidence=low` → cap at small
6. `max_single_position_pct` (default 10%)
7. `cash_reserve_floor_pct` (default 10%) — remaining available capacity

### Phase 4: Risk Budget & Concentration Control (`positionSizingEngine.ts`)

**Concentration dimensions monitored:**
- Sector: max 35% (default) — warn/critical thresholds
- Theme: max 30% — warn/critical thresholds
- Thesis cluster: auto-detected via shared theme overlap (≥2 themes) — max 25%
- Danger candidate count: max 3 high-danger candidates
- Cash reserve: floor 10%

**Risk budget status:**
- `healthy` — no warnings
- `stretched` — ≥2 warn-level flags
- `concentrated` — ≥1 critical flag
- `critical` — ≥2 critical flags

**Concentration penalty:** Applied to final ranking score (0–0.5 range), computed from sector/theme/cluster overlap.

### Phase 5: Decision Ranking & Portfolio View (`portfolioDecisionRanker.ts`)

**Action labels:** INITIATE / ADD / HOLD / TRIM / EXIT / AVOID / MONITOR / RECHECK

**Action resolution logic:**
- Existing holding + target > current + 1% → ADD
- Existing holding + target < current − 1% → TRIM
- Existing holding + avoid/danger → EXIT
- New candidate + positive sizing → INITIATE
- New candidate + avoid → AVOID

**Ranking sort order:** INITIATE > ADD > TRIM > HOLD > RECHECK > MONITOR > EXIT > AVOID (then by final_score desc within each group)

**`PortfolioView`:** ranked_decisions[], actionable_count, monitor_count, avoid_count, risk_budget_status

### Phase 6: Advisory Output / Explanation Layer (`portfolioDecisionRanker.ts`)

**`AdvisoryExplanation` per ticker:**
- `headline` — action-specific human-readable summary
- `rationale_bullets` — fusion score, concentration penalty, current/target weight, new vs existing
- `risk_flags` — danger score, confidence issues, memory contradictions
- `confidence_note` — plain-language confidence level
- `sizing_note` — bucket and percentage recommendation
- `advisory_disclaimer` — "ADVISORY ONLY: This output is for informational purposes..."

**`runLevel7Pipeline()`** — single-call orchestrator:
```
signals → fuseMultipleSignals → computePositionSize × N → evaluateRiskBudget → rankDecisions → generateAdvisoryOutput
```

### Phase 7: Anti-Overfit & Decision Safety Guards (`portfolioSafetyGuard.ts`)

**Guard 1 — Churn Prevention:**
- Suppresses INITIATE/ADD/TRIM/EXIT if same ticker was actioned within cooldown window (default 48h)
- Downgrades to MONITOR with reason note

**Guard 2 — Overfit Detection:**
- Flags tickers with ≥5 consecutive high-score cycles (≥0.65) within 7-day lookback
- Indicates stale alpha / signal not resolving

**Guard 3 — Conflict Detection:**
- Detects opposing action pairs: INITIATE vs EXIT, ADD vs EXIT, INITIATE vs AVOID, ADD vs AVOID
- Returns `ConflictFlag[]` for human review

**Guard 4 — Sample Enforcement:**
- Downgrades actionable decisions to MONITOR if sample_count < 5 (configurable)

**`SafetyReport`:** churn_suppressed_count, overfit_flags, conflict_flags, sample_enforcement_count, overall_safety_status (clean/flagged/critical)

---

## Test Coverage

| Suite | Tests | Result |
|-------|-------|--------|
| Phase 1 — Portfolio State | 5 | ✅ |
| Phase 2 — Multi-Signal Fusion | 8 | ✅ |
| Phase 3 — Position Sizing | 4 | ✅ |
| Phase 4 — Risk Budget | 4 | ✅ |
| Phase 5+6 — Ranking & Advisory | 5 | ✅ |
| Phase 7 — Safety Guards | 9 | ✅ |
| **LEVEL7 Total** | **35** | ✅ |
| **Full Regression** | **1099** | ✅ |

---

## Key Invariants Maintained

| Invariant | Status |
|-----------|--------|
| `auto_trade_allowed: ALWAYS false` | ✅ Hardcoded, no order generation |
| `advisory_only: true` on all outputs | ✅ All 4 modules enforce this |
| Append-only audit logs | ✅ No delete/update in new code |
| Kill switch + auto-failsafe | ✅ Inherited from LEVEL5.1 |
| Priority chain preserved | ✅ Contradiction > critical trigger > danger > fusion score |
| Full backward compatibility | ✅ 1099/1099 tests pass |

---

## Open Items (Carried Forward)

| ID | Item | Status |
|----|------|--------|
| OI-L7-1 | DB persistence for portfolio state (holdings table) | Deferred to LEVEL7.1 |
| OI-L7-2 | tRPC procedures for portfolio advisory endpoints | Deferred to LEVEL7.1 |
| OI-L7-3 | Safety guard integration into pipeline orchestrator | Available as standalone, integration in LEVEL7.1 |
| OI-CO-1 through OI-CO-5 | Carried-over items from CRON package | Pending GPT input |

---

## GO/NO-GO Decision

**Decision: ✅ GO**

All 35 LEVEL7 tests pass. Full regression 1099/1099 ✅. TSC 0 errors. All key invariants maintained. The Portfolio Decision Layer is complete and ready for LEVEL7.1 (DB persistence + tRPC API exposure).

---

*Report generated: 2026-03-28 | DanTree System v7.0 | Advisory Only*
