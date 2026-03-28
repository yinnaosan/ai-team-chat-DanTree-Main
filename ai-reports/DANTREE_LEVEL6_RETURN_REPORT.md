# DANTREE LEVEL6 — Strategy & Alpha Layer
## RETURN REPORT

**MODULE_ID:** `DANTREE_LEVEL6_STRATEGY_ALPHA`
**EXECUTED_BY:** Manus
**DATE:** 2026-03-27
**CHECKPOINT:** pending

---

## 1. IMPLEMENTATION_STATUS

| Phase | Description | File | Status |
|-------|-------------|------|--------|
| Phase 1+2 | Signal Journal Schema + Outcome Attribution | `signalJournal.ts` | ✅ COMPLETE |
| Phase 3+4 | Trigger/Signal Scoring + Portfolio Cross-Watch Aggregation | `signalScoring.ts` | ✅ COMPLETE |
| Phase 5+6 | Regime/Context Slicing + Alpha Prioritization | `strategyAlpha.ts` | ✅ COMPLETE |
| Phase 7+8 | Anti-Overfit Guards + Validation Tests | `level6.test.ts` | ✅ COMPLETE |

---

## 2. KEY DESIGN DECISIONS

### Signal Journal
- `signal_id` format: `sig_{ticker}_{trigger_type}_{timestamp}`
- Outcome labels: `positive_risk_reduction` | `false_positive` | `harmful_miss` | `inconclusive` | `follow_through_confirmed` | `no_material_move`
- `harmful_miss` applies a **2× penalty multiplier** to risk_adjusted_score (most severe failure mode)
- Attribution quality: `high` when both `memory_influence=true` AND `learning_influence=true`

### Signal Scoring — Discount Compounding Fix
**Critical bug discovered and fixed:** The original accumulation logic used the already-discounted `risk_adjusted_score` for running average computation, causing severe downward bias ("discount compounding"). Fix: added `raw_avg_risk_adj` field to accumulate undiscounted scores; discount is applied only at display/ranking time.

| Sample Count | Quality | Discount Factor |
|-------------|---------|----------------|
| < 10 | low | 0.40 (60% shrinkage toward zero) |
| 10–24 | medium | 0.75 |
| ≥ 25 | high | 1.00 (no discount) |

### Alpha Tier Logic
| Tier | Condition |
|------|-----------|
| A | score ≥ 0.6 AND sample ≠ low |
| B | score ≥ 0.35 |
| C | score ≥ 0.1 |
| D | score ≥ -0.2 |
| unranked | score < -0.2 |

### Danger Tier Logic
| Tier | Condition |
|------|-----------|
| critical | score ≤ -0.6 OR harmful_miss ≥ 3 |
| high | score ≤ -0.4 OR harmful_miss ≥ 2 |
| moderate | score ≤ -0.2 OR false_positive ≥ 3 |
| low | score ≤ -0.05 |
| none | otherwise |

### Anti-Overfit Guards (Phase 7)
Two guards implemented in `level6.test.ts` (advisory layer, not production gates):

1. **`antiOverfitGuard(score, min_samples=5)`** — rejects entity scores with < 5 samples or `sample_quality=low`
2. **`stabilityGuard(scores, max_variance=0.15)`** — detects high variance in rolling score windows (requires ≥ 3 data points)

---

## 3. ADVISORY_ONLY_INVARIANT

```
All LEVEL6 outputs carry advisory_only: true
No LEVEL6 function modifies trigger/action core logic
No LEVEL6 function writes to DB (in-memory only)
Alpha Surface: informational surfacing, NOT trading signals
Danger Signals: risk awareness, NOT automated responses
```

---

## 4. VALIDATION

```
TSC:              0 errors
LEVEL6 tests:     29/29 ✅
  TC-L6-1 (Signal Journal + Attribution):    8/8  ✅
  TC-L6-2 (Scoring + Low-Sample Discount):   5/5  ✅
  TC-L6-3 (Portfolio Aggregation):           4/4  ✅
  TC-L6-4 (Regime/Context Slicing):          4/4  ✅
  TC-L6-5 (Alpha + Danger + Anti-Overfit):   8/8  ✅
Full regression:  1015/1015 ✅ (56 test files)
```

---

## 5. INTEGRATION POINTS

| LEVEL6 Component | Reads From | Writes To |
|-----------------|-----------|----------|
| `signalJournal` | LEVEL4 trigger results + LEVEL5 snapshots | In-memory journal |
| `signalScoring` | `signalJournal` outcomes | In-memory entity scores |
| `strategyAlpha` | `signalScoring` entity scores | In-memory regime slices + alpha surface |
| All outputs | — | Advisory display only |

---

## 6. OPEN ITEMS (awaiting GPT decision)

| ID | Question |
|----|----------|
| OI-L6-1 | Persist signal journal to DB (`signal_journal` table in drizzle/schema.ts)? |
| OI-L6-2 | Expose `buildAlphaSurface()` as tRPC procedure for frontend Alpha Panel? |
| OI-L6-3 | Frontend Alpha Dashboard — display tier A/B opportunities + critical danger signals? |
| OI-L6-4 | Wire `ingestSignalForRegimeSlice()` into LEVEL5.1 scheduler post-run hook? |
| OI-L6-5 | LEVEL7 — what is the next layer? (Portfolio optimization? Position sizing? Backtesting?) |
| OI-L51-1 | (carried) Mount `startCronScheduler()` to Express server startup? |
| OI-L51-3 | (carried) Kill switch / auto-failsafe → owner notification? |
| OI-E1 | (carried) Vector embedding — now ready to proceed? |
| OI-P1 | (carried) Expose `setLearningConfigOverride()` as tRPC? |
| OI-P2 | (carried) Surface `early_stop_bias_applied` in frontend badge? |
