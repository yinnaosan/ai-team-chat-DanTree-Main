# MANUS → GPT HANDOFF: LEVEL10.5 — Asymmetry & Position Layer

**Date:** 2026-03-29
**From:** Manus (Implementation Agent)
**To:** GPT (Review & Planning Agent)
**Status:** ✅ COMPLETE — All modules implemented, TSC 0 errors, 11 new tests passing, 1337/1343 total tests passing (6 pre-existing failures in `financeDatabaseApi.test.ts` unrelated to LEVEL10.5)

---

## What Was Built

LEVEL10.5 introduces the **Asymmetry & Position Layer** — a disciplined, experience-aware position sizing framework that prevents DanTree from over-betting on low-conviction or outside-competence ideas.

### Module 1 — `computeAsymmetryScore()` [`level105PositionLayer.ts`]

Computes a 0–1 asymmetry score from payout map, gradient risk, business context, and experience history.

| Label | Score Range | Meaning |
|---|---|---|
| `poor` | 0.00–0.30 | Unfavorable risk/reward; avoid or minimal |
| `neutral` | 0.31–0.50 | Balanced; no strong edge |
| `favorable` | 0.51–0.70 | Good asymmetry; position warranted |
| `highly_favorable` | 0.71–1.00 | Exceptional setup; larger position justified |

**Key rules:**
- Base score from `payoutMap.asymmetry_ratio` (capped at 3.0)
- Wide moat → +0.10 boost
- Eligible + inside competence → +0.05 boost
- Experience strengthening drift → +0.05 boost
- Critical risk state → hard cap at 0.20
- Outside competence + weak moat → hard cap at 0.25
- `avoid_for_now` eligibility → hard cap at 0.15

### Module 2 — `computePositionSizing()` [`level105PositionLayer.ts`]

Translates asymmetry score into a target position percentage and size bucket.

| Bucket | Target % | Condition |
|---|---|---|
| `none` | 0% | Hard no-bet or avoid |
| `starter` | 1–2% | Low asymmetry or research_required |
| `small` | 3–5% | Neutral asymmetry + eligible |
| `medium` | 6–8% | Favorable asymmetry + eligible |
| `large` | 9–12% | Highly favorable + wide moat + stable risk |
| `max` | 13–15% | Exceptional: highly_favorable + inside + wide + stable + signal_dense |

**Key rules:**
- High conviction alone does NOT justify large size — asymmetry must be favorable
- Experience strengthening → +1 bucket upgrade allowed
- Elevated/critical risk → forced downgrade
- Signal density failure → capped at `starter`

### Module 3 — `computeSizeAdjustment()` [`level105PositionLayer.ts`]

Adjusts existing position size based on changing conditions (not initial sizing).

- **Increase** (net score ≥ 3): drift strengthening + confidence rising + accumulation + favorable asymmetry
- **Decrease** (net score ≤ -3): persistent weakening (≥3 cycles) + confidence downtrend + elevated risk + low thesis confidence
- **Avoid** (hard exit): critical risk + weakening drift simultaneously
- **Hold**: no dominant signal

### Module 4 — `enforceNoBetDiscipline()` [`level105PositionLayer.ts`]

Enforces the "sometimes the best position is no position" principle.

**Hard no-bet conditions** (any one triggers):
- Outside competence + weak/unknown moat
- `asymmetry_score < 0.20`
- Critical risk state
- Strategy overfit flag
- Signal density failed + density_score < 0.25

**Soft restriction conditions** (any one triggers):
- `research_required` eligibility
- Volatile confidence trajectory
- Mixed/unclear drift
- Elevated gradient risk

### Module 5 — `computePortfolioConcentration()` [`level105PositionLayer.ts`]

Governs portfolio-level concentration risk.

- Total portfolio cap: 80% allocated
- Same-regime exposure > 25% → `high` risk, cap at 3%
- Same-regime exposure > 15% → `medium` risk, cap at 6%
- ≥3 weakening positions + candidate weakening → `high` risk, cap at 2%
- Same-sector exposure > 20% → cap at 5%
- ≥3 large/max positions → cap at 6%

### Module 6 — Positioning Lens Narrative [`deepResearchEngine.ts`]

`composeResearchNarrative()` now accepts a `positioningLensText` parameter and returns `positioning_lens` in `ResearchNarrativeOutput`.

`runDeepResearch()` calls `runPositionLayer()` non-blocking and injects the result into the narrative.

### Module 7 — Persistence Extension [`portfolioPersistence.ts` + `drizzle/schema.ts`]

Seven new columns added to `decision_log`:

| Column | Type | Description |
|---|---|---|
| `asymmetry_score` | decimal(6,4) | 0–1 asymmetry score |
| `asymmetry_label` | varchar(20) | poor / neutral / favorable / highly_favorable |
| `position_target_pct` | decimal(6,2) | Target position % (0–15) |
| `position_size_bucket` | varchar(10) | none / starter / small / medium / large / max |
| `no_bet_restriction` | varchar(10) | none / soft / hard |
| `concentration_risk` | varchar(10) | low / medium / high |
| `positioning_lens_json` | json | Full `PositionLayerOutput` snapshot |

New functions:
- `updateDecisionPositionLayer(decisionId, positionData)` — non-blocking write after `saveDecision()`
- `replayDecision()` now returns `position_layer` field in `ReplayResult`

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `server/level105PositionLayer.ts` | **NEW** | 5 core modules + `runPositionLayer()` composite |
| `server/deepResearchEngine.ts` | **MODIFIED** | Module 6: `positioning_lens` in narrative + `runDeepResearch()` integration |
| `server/portfolioPersistence.ts` | **MODIFIED** | Module 7: `updateDecisionPositionLayer()` + `ReplayResult.position_layer` |
| `drizzle/schema.ts` | **MODIFIED** | 7 new columns in `decision_log` |
| `drizzle/0036_purple_mesmero.sql` | **NEW** | Migration SQL (already applied) |
| `server/level105.test.ts` | **NEW** | 11 test assertions across 6 test cases |

---

## Test Results

```
Test Files: 74 total | 73 passed | 1 pre-existing failure (financeDatabaseApi.test.ts)
Tests:      1343 total | 1337 passed | 6 pre-existing failures
TSC:        0 errors
```

**LEVEL10.5 specific:** 11/11 ✅
**LEVEL10.4 regression:** 12/12 ✅
**LEVEL10.3-C regression:** 44/44 ✅

---

## Suggested Next Steps for GPT

### LEVEL10.6 — Position Layer → Pipeline Integration

The position layer is currently computed in `runDeepResearch()` but not yet wired into the main `danTreeSystem.ts` pipeline. The next step is to:

1. In `danTreeSystem.ts`, after `saveDecision()` returns a `decisionId`, call `updateDecisionPositionLayer()` non-blocking with the position layer output
2. Pass `positionLayerOutput` into the `DanTreeSystemOutput` type so the frontend can display sizing recommendations
3. Add a "Position Sizing" card to the frontend replay UI showing: asymmetry score, size bucket, no-bet restriction, concentration risk

### LEVEL10.7 — Cross-Ticker Concentration Enforcement

Currently `computePortfolioConcentration()` is a standalone function. The next step is to:

1. In `danTreeSystem.ts`, after computing individual position layers, collect all `PositionEntry105` objects
2. Run `computePortfolioConcentration()` for each candidate against the existing portfolio
3. Apply the `max_allowed_size` cap to override individual sizing recommendations
4. Surface concentration warnings in the narrative

### LEVEL10.8 — Experience-Driven Auto-Adjustment Scheduler

Build a scheduled job that:
1. Runs `buildExperienceHistorySummary()` for all active positions weekly
2. Calls `computeSizeAdjustment()` for each position
3. Generates advisory alerts when `adjustment === "decrease"` or `adjustment === "avoid"`
4. Writes alerts to the notification system via `notifyOwner()`

---

## Architecture Invariants (Do Not Break)

- All outputs are `advisory_only: true` — no execution logic
- Position layer is **non-blocking** in `runDeepResearch()` — failures must not crash the pipeline
- `updateDecisionPositionLayer()` is a **fire-and-forget** update — use `void` or `.catch()` at call site
- `computePortfolioConcentration()` is **pure** (no DB calls) — safe to call in tests without mocking
- The 80% portfolio cap in `computePortfolioConcentration()` is a hard invariant — do not relax without explicit user approval
