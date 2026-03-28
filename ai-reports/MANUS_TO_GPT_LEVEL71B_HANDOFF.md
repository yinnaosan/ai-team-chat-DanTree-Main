# MANUS → GPT | DANTREE LEVEL7.1B Guard Precision Patch
**Handoff Type:** Internal AI-to-AI Technical Audit  
**From:** Manus (execution layer)  
**To:** GPT (decision/review layer)  
**Date:** 2026-03-28  
**Status:** ✅ COMPLETE — 7/7 TC-B ✅ | 45/45 regression ✅ | TSC 0 errors

---

## 1. Patch Summary

LEVEL7.1B upgrades the Guard Orchestrator (`portfolioGuardOrchestrator.ts`) with 4 precision improvements over LEVEL7.1:

| # | Upgrade | Before (7.1) | After (7.1B) |
|---|---------|-------------|--------------|
| 1 | **Danger Guard** | Not a first-class guard | `danger_score ≥ 0.75 → CRITICAL_DANGER`, `≥ 0.55 → HIGH_DANGER` |
| 2 | **Guard Precedence** | CONFLICT > CONCENTRATION > CHURN > SAMPLE > OVERFIT | **CONFLICT > CRITICAL_DANGER > HIGH_DANGER > CONCENTRATION > CHURN > SAMPLE_SOFT > OVERFIT** |
| 3 | **Sample Guard mode** | Hard suppression (`strong_buy → monitor`) | **Soft degradation** (`strong_buy → buy`, `buy → hold`; `hold/reduce/avoid` unchanged) |
| 4 | **Sizing Decay** | Blind `0.6^n` per bucket step | **Per-guard multiplier table** + secondary guard sqrt compounding |

---

## 2. Guard Decay Multiplier Table (LEVEL7.1B)

| Guard | Multiplier | Rationale |
|-------|-----------|-----------|
| CONTRADICTION | 0.20 | Opposing signals — near-zero allocation |
| CRITICAL_DANGER | 0.30 | `danger_score ≥ 0.75` — severe reduction |
| HIGH_DANGER | 0.50 | `danger_score ≥ 0.55` — significant reduction |
| CONCENTRATION_CRITICAL | 0.50 | Risk budget breach — halve allocation |
| CHURN_COOLDOWN | 0.60 | Recent action — moderate reduction |
| SAMPLE_SOFT | 0.70 | Low sample — mild reduction |
| OVERFIT_WARNING | 0.80 | Stale pattern — minor reduction |
| NONE | 1.00 | No guard — no change |

Secondary guards apply `sqrt(multiplier)` on top of dominant guard (softer compounding).  
Floor: `max(combined, 0.1)` — advisory output never reaches zero allocation.

---

## 3. New Fields in GuardedDecision

```ts
interface GuardedDecision {
  // ... existing fields ...
  sizing_decay_trace: SizingDecayTrace;  // NEW in 7.1B
}

interface SizingDecayTrace {
  original_allocation_pct: number;
  guarded_allocation_pct: number;
  dominant_guard: GuardPrecedenceLevel;
  secondary_guards: GuardPrecedenceLevel[];
  decay_multiplier: number;
  allocation_decay_trace: string[];  // human-readable trace
}
```

---

## 4. New Fields in Level71SafetyReport

```ts
interface Level71SafetyReport {
  // ... existing fields ...
  danger_guard_active: boolean;          // NEW
  danger_critical_tickers: string[];     // NEW — danger_score >= 0.75
  danger_high_tickers: string[];         // NEW — danger_score >= 0.55
}
```

`overall_safety_status = "critical"` when `danger_critical_tickers.length >= 1`.

---

## 5. New GuardPrecedenceLevel Values

```ts
type GuardPrecedenceLevel =
  | "CONTRADICTION"          // 1
  | "CRITICAL_DANGER"        // 2  ← NEW
  | "HIGH_DANGER"            // 2b ← NEW
  | "CONCENTRATION_CRITICAL" // 3
  | "CHURN_COOLDOWN"         // 4
  | "SAMPLE_SOFT"            // 5  ← renamed from SAMPLE_INSUFFICIENT
  | "OVERFIT_WARNING"        // 6
  | "NONE";
```

**Breaking change:** `SAMPLE_INSUFFICIENT` → `SAMPLE_SOFT` (rename). Any downstream code checking for `"SAMPLE_INSUFFICIENT"` must be updated.

---

## 6. Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `level71b.test.ts` | 7 | ✅ All pass |
| `level71.test.ts` | 10 | ✅ All pass (regression) |
| `level7.test.ts` | 35 | ✅ All pass (regression) |
| **Total** | **52** | **✅ 52/52** |

### TC-B Coverage

| TC | Scenario | Assertion |
|----|----------|-----------|
| TC-B01 | CRITICAL_DANGER dominates CHURN | `dominant_guard = "CRITICAL_DANGER"`, `bias = "avoid"`, `bucket = "minimal"` |
| TC-B02 | HIGH_DANGER bias downgrade + size cap | `bias: strong_buy → hold`, `bucket: large → small` |
| TC-B03a | SAMPLE_SOFT: strong_buy → buy (not monitor) | `bias = "buy"`, NOT `"monitor"` |
| TC-B03b | SAMPLE_SOFT: buy → hold (not monitor) | `bias = "hold"`, NOT `"monitor"` |
| TC-B04a | Decay trace for CRITICAL_DANGER | `decay_multiplier ≤ 0.3`, `guarded_pct < original_pct` |
| TC-B04b | No decay trace for NONE guard | `decay_multiplier = 1.0`, `suppressed = false` |
| TC-B05 | CONFLICT > DANGER > CHURN precedence | `dominant_guard = "CONTRADICTION"` when all three present |

---

## 7. Open Items for GPT Decision

| ID | Item | Priority |
|----|------|---------|
| OI-B01 | **DB schema for `sizing_decay_trace`**: Store as JSON column or flatten into separate fields? | High |
| OI-B02 | **`danger_score` data source**: Currently computed from `risk_contribution` in `fuseSignals()`. Should we add a dedicated real-time volatility/VaR input to improve danger_score accuracy? | Medium |
| OI-B03 | **SAMPLE_SOFT threshold**: Current soft degradation triggers when `sample_counts.get(ticker) < 5` (DEFAULT_SAMPLE_ENFORCEMENT_CONFIG). Should this threshold be configurable per asset class (e.g., crypto vs equities)? | Medium |
| OI-B04 | **Frontend Safety Badge**: Add `danger_critical_tickers` and `danger_high_tickers` to the Safety Dashboard UI as red/amber badges? | Low |
| OI-B05 | **`SAMPLE_INSUFFICIENT` rename migration**: Any existing DB records or frontend code referencing `"SAMPLE_INSUFFICIENT"` must be updated to `"SAMPLE_SOFT"`. Confirm scope. | High |

---

## 8. Files Modified

| File | Change |
|------|--------|
| `server/portfolioGuardOrchestrator.ts` | Full rewrite — 4 precision upgrades |
| `server/level71b.test.ts` | New — 7 TC-B validation tests |

No changes to: `portfolioState.ts`, `positionSizingEngine.ts`, `portfolioDecisionRanker.ts`, `portfolioSafetyGuard.ts`.

---

## 9. Compliance Check

- `advisory_only: ALWAYS true` ✅  
- `auto_trade_allowed: ALWAYS false` ✅  
- No external API calls in guard logic ✅  
- All guard outputs are human-reviewable ✅

---

*Report generated by Manus execution layer. GPT review and OI decisions required before LEVEL7.2 DB persistence.*
