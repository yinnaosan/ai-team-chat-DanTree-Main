# MANUS → GPT | LEVEL7.1 SAFETY GUARD INTEGRATION — HANDOFF REPORT
**Date:** 2026-03-28 | **From:** Manus | **To:** GPT | **Status:** COMPLETE ✅

---

## EXECUTION SUMMARY

| Metric | Result |
|--------|--------|
| LEVEL7.1 Tests | **10/10 PASS** |
| LEVEL7 Regression | **35/35 PASS** |
| Combined | **45/45 PASS** |
| TSC Errors | **0** |
| New Files | 2 (`portfolioGuardOrchestrator.ts`, `level71.test.ts`) |
| Modified Files | 3 (`portfolioDecisionRanker.ts`, `portfolioSafetyGuard.ts`, `level71.test.ts`) |

---

## ARCHITECTURE CHANGE: WHAT WAS BUILT

### New Module: `portfolioGuardOrchestrator.ts`

Single entry point `runPortfolioSafetyGuards(input: GuardOrchestratorInput): GuardOrchestratorOutput` that:

1. **Step 1** — Runs all 4 guard families in parallel:
   - `applyChurnGuard(ranked, recent_actions, config)` → `churn_ranked`
   - `detectOverfitFlags(decisions, signal_history, config)` → `overfit_flags`
   - `detectDecisionConflicts(ranked)` → `conflict_flags`
   - `applySampleEnforcement(ranked, sample_counts, config)` → `sample_ranked`

2. **Step 2** — Builds per-ticker `TickerGuardAnnotation[]` (which guards fired per ticker)

3. **Step 3** — Applies `applyGuardSuppression()` per ticker:
   - Priority order: CONFLICT > OVERFIT > CHURN > SAMPLE > CONCENTRATION
   - Outputs `GuardedDecision[]` with `suppressed`, `original_decision_bias`, `guarded_decision_bias`, `guard_reason_codes`

4. **Step 4** — Rebuilds `guarded_sizings: SizingResult[]` with bucket reduction (0.6^n per step)

5. **Step 5** — Merges churn + sample ranked results, then applies bias/sizing suppression:
   ```
   churn_ranked → applySampleEnforcement → applyGuardsToRankedDecisions → guarded_ranked
   ```

6. **Step 6** — Builds `Level71SafetyReport` with full audit trail

### Modified: `portfolioDecisionRanker.ts`

`Level7PipelineInput` now accepts:
```ts
sample_counts?: Map<string, number>
recent_actions?: RecentAction[]
signal_history?: SignalHistoryEntry[]
churn_config?: ChurnGuardConfig
overfit_config?: OverfitGuardConfig
sample_config?: SampleEnforcementConfig
```

`Level7PipelineOutput` now includes:
```ts
guard_output: GuardOrchestratorOutput  // full safety report + guarded decisions
```

`runLevel7Pipeline()` now calls `runPortfolioSafetyGuards()` and uses `guard_output.guarded_ranked` as the final `portfolio_view.ranked_decisions`.

### Modified: `portfolioSafetyGuard.ts`

Extended `detectDecisionConflicts` opposing_pairs:
```ts
["INITIATE", "TRIM"],  // Building new while trimming another — directional conflict
["ADD", "TRIM"],       // Adding to one while trimming another
```

---

## GUARD PIPELINE FLOW (CANONICAL)

```
signals → fuseSignals → FusionDecision[]
                              ↓
                    rankDecisions → RankedDecision[]
                              ↓
          ┌───────────────────────────────────────┐
          │     runPortfolioSafetyGuards()         │
          │  ┌─────────────────────────────────┐   │
          │  │ 1. churnGuard → churn_ranked    │   │
          │  │ 2. overfitDetect → flags        │   │
          │  │ 3. conflictDetect → flags       │   │
          │  │ 4. sampleEnforce → sample_ranked│   │
          │  └─────────────────────────────────┘   │
          │  ┌─────────────────────────────────┐   │
          │  │ 5. merge churn+sample → apply   │   │
          │  │    bias/sizing suppression      │   │
          │  └─────────────────────────────────┘   │
          │  ┌─────────────────────────────────┐   │
          │  │ 6. buildLevel71SafetyReport()   │   │
          │  └─────────────────────────────────┘   │
          └───────────────────────────────────────┘
                              ↓
                    guarded_ranked → portfolio_view
                    safety_report → guard_output
```

---

## GUARD PRIORITY ORDER (SUPPRESSION)

| Priority | Guard | Trigger Condition | Action |
|----------|-------|-------------------|--------|
| 1 (highest) | CONFLICT | INITIATE/ADD vs EXIT/AVOID/TRIM | Suppress both to MONITOR |
| 2 | OVERFIT | ≥5 consecutive high-score cycles | Downgrade bias by 1 step |
| 3 | CHURN | Last action < 48h ago | Force MONITOR |
| 4 | SAMPLE | sample_count < 5 | Force MONITOR |
| 5 (lowest) | CONCENTRATION | risk_budget_status = "critical" | Cap sizing bucket to "minimal" |

---

## LEVEL71 SAFETY REPORT SCHEMA

```ts
interface Level71SafetyReport {
  portfolio_guard_status: "healthy" | "guarded" | "suppressed" | "critical";
  active_guard_count: number;
  top_guard_reasons: string[];
  suppressed_tickers: string[];
  downgraded_tickers: string[];
  concentration_guard_active: boolean;
  sample_guard_active: boolean;
  overfit_guard_active: boolean;
  churn_guard_active: boolean;
  conflict_guard_active: boolean;
  churn_suppressed_count: number;
  overfit_flags: OverfitFlag[];
  conflict_flags: ConflictFlag[];
  sample_enforcement_count: number;
  overall_safety_status: "clean" | "flagged" | "critical";
  advisory_only: true;  // ALWAYS true, never overrideable
}
```

**Status mapping:**
- `healthy`: active_guard_count = 0, no suppressions
- `guarded`: active_guard_count = 1
- `suppressed`: suppressed_tickers ≥ 1 OR active_guard_count ≥ 2
- `critical`: suppressed_tickers ≥ 3 OR conflict_flags ≥ 2

---

## TEST CASES VALIDATED (10/10)

| TC | Guard | Scenario | Result |
|----|-------|----------|--------|
| TC-01a | None | Clean path → advisory_only=true | ✅ |
| TC-01b | None | Clean path → status=healthy, count=0 | ✅ |
| TC-02a | Churn | Recent action within 48h → MONITOR | ✅ |
| TC-02b | Churn | Action 72h ago → NOT suppressed | ✅ |
| TC-03a | Sample | count=2 < 5 → MONITOR | ✅ |
| TC-03b | Sample | count=10 ≥ 5 → NOT suppressed | ✅ |
| TC-04 | Overfit | 6 consecutive high cycles → downgrade | ✅ |
| TC-05 | Conflict | INITIATE vs TRIM → conflict_flags ≥ 1 | ✅ |
| TC-06 | Concentration | risk_budget=critical → sizing capped | ✅ |
| REG | All | advisory_only=true on all outputs | ✅ |

---

## KNOWN BEHAVIORS / EDGE CASES

### Fusion Score Floor
All-zero signal scores produce `fusion_score ≈ 0.062` (not 0.0) due to base weights in `fuseSignals()`. This means:
- `fusion_score < 0.25` → `decision_bias = "reduce"` (not "avoid")
- To trigger `avoid` bias, need `danger_score ≥ 0.75` OR `trigger_severity = "critical"`

### Conflict Detection Scope
`detectDecisionConflicts` operates on **pre-guard** `ranked_decisions`. The `conflict_flags` in `safety_report` reflect pre-guard action labels. Post-guard `guarded_ranked` may show MONITOR for both conflicting tickers.

### Sample Guard Default
`DEFAULT_SAMPLE_ENFORCEMENT_CONFIG.min_required_for_action = 5`. When `sample_counts` Map is empty, ALL tickers default to count=0 → ALL actionable decisions suppressed. Always pass `sample_counts` in production.

---

## OPEN ITEMS FOR GPT DECISION

| ID | Item | Priority |
|----|------|----------|
| OI-L71-1 | **DB Schema**: `portfolio_guard_logs` table — store `Level71SafetyReport` per evaluation cycle for audit trail | HIGH |
| OI-L71-2 | **tRPC API**: Expose `runLevel7Pipeline` as protected procedure with `sample_counts` sourced from DB | HIGH |
| OI-L71-3 | **Conflict Pair Expansion**: Should `TRIM vs TRIM` (two tickers both being trimmed) be flagged as a concentration signal? | MEDIUM |
| OI-L71-4 | **Frontend**: `SafetyReport` dashboard widget — show `portfolio_guard_status` badge + `suppressed_tickers` list | MEDIUM |
| OI-L71-5 | **Cooldown Config**: Should `min_cooldown_ms` be per-action-type (INITIATE=72h, ADD=24h, TRIM=12h)? | LOW |

---

## FILES MODIFIED IN THIS CYCLE

```
server/portfolioGuardOrchestrator.ts  [NEW]  ~500 lines
server/level71.test.ts                [NEW]  ~300 lines
server/portfolioDecisionRanker.ts     [MOD]  +30 lines (Level7PipelineInput/Output + guard integration)
server/portfolioSafetyGuard.ts        [MOD]  +2 lines (opposing_pairs expansion)
```

---

*advisory_only: true | auto_trade_allowed: ALWAYS false | LEVEL7.1 COMPLETE*
