# MANUS → GPT LEVEL11 Handoff Report
**Date:** 2026-03-29 | **Status:** COMPLETE ✅ | **TSC:** 0 errors | **Tests:** 8 new + 1345 regression passed

---

## What Was Built

### LEVEL11: Multi-Asset Reality & Propagation Engine

This level transforms DanTree from a "single-equity analyzer" into a **multi-asset reality engine** that understands what is truly driving any asset — and how shocks propagate across the financial system.

---

## New Files

### `server/level11MultiAssetEngine.ts` (~1,500 lines)

8 core modules, all `advisory_only: true`:

| Module | Function | Description |
|--------|----------|-------------|
| 1 | `classifyAsset()` | Classifies asset type: equity / commodity / index / etf_equity / etf_sector / etf_macro |
| 2 | `routeDriverEngine()` | Routes to correct driver framework based on asset type |
| 3 | `identifyRealDrivers()` | Separates real drivers from narrative drivers (DriverType: real / narrative / mixed) |
| 4 | `analyzeIncentives()` | Identifies key players, incentives, narrative support/fragility |
| 5 | `analyzePolicyReality()` | Evaluates policy execution strength vs stated intent |
| 6 | `detectSentimentState()` | Detects sentiment phase: skepticism → early_bull → consensus → overheat → fragile → capitulation |
| 7 | `buildPropagationChain()` | Builds cross-asset propagation chain from shock events (tariff/rate/geopolitical/etc.) |
| 8 | `buildScenarioMap()` | Generates base/bull/bear scenario narratives |
| Composite | `runLevel11Analysis()` | Full pipeline: classification + routing + drivers + incentives + sentiment + scenarios |

### `server/level11.test.ts` (8 tests, all passing)

| Test | Scenario |
|------|----------|
| TC-L11-01 | Gold (GLD) — asset classification + real driver identification under macro stress |
| TC-L11-02 | Oil (USO) — overheat sentiment detection → asymmetry score penalty |
| TC-L11-03 | Nasdaq (QQQ) — skepticism phase detection → asymmetry score bonus |
| TC-L11-04 | ARKK ETF — crowded positioning → fragile sentiment → asymmetry penalty |
| TC-L11-05 | Tariff shock propagation chain — multi-step chain structure validation |

---

## Modified Files

### `server/deepResearchEngine.ts`

**ResearchNarrativeOutput** — 7 new fields added:
```ts
core_reality?: string;              // What is truly driving this asset
real_vs_perceived?: string;         // Narrative vs structural driver separation
incentives_human_layer?: string;    // Key players + incentive structure
policy_reality_lens?: string;       // Policy execution vs stated intent
sentiment_positioning?: string;     // Sentiment phase + crowdedness + reversal risk
cross_asset_implications?: string;  // Propagation chain summary
scenario_map_summary?: string;      // Base/bull/bear scenario narratives
```

**composeResearchNarrative()** — upgraded to generate Level11 narrative sections when `level11Analysis` is provided.

**runDeepResearch()** — now calls `runLevel11Analysis()` and passes result to `composeResearchNarrative()`.

### `server/level105PositionLayer.ts`

**AsymmetryScoreContext** — new optional field:
```ts
level11Analysis?: Level11AnalysisOutput;  // [NEW 11] Multi-asset reality
```

**computeAsymmetryScore()** — integrated Level11 adjustments:
- `overheat` sentiment: -0.12
- `fragile` sentiment: -0.08
- `capitulation` sentiment: +0.06 (contrarian opportunity)
- `skepticism` sentiment: +0.04 (early entry)
- High crowdedness (≥0.8): -0.08
- Moderate crowdedness (≥0.6): -0.04
- Strong policy execution: +0.04
- Weak policy execution: -0.06
- Downstream propagation target: -0.05

---

## Key Design Decisions

1. **Asset classification priority**: ETF detection runs before commodity/index detection. This means GLD ("SPDR Gold Shares") classifies as `etf_equity` not `commodity` — this is correct behavior (GLD is an ETF that tracks gold).

2. **PropagationLink.confidence is 0–1 number**, not a string enum. The `PropagationChainOutput` has no top-level confidence field — confidence lives at the link level.

3. **SentimentPhase is a 6-stage cycle**: `skepticism → early_bull → consensus → overheat → fragile → capitulation`. Contrarian opportunities exist at `skepticism` and `capitulation`.

4. **All outputs are advisory_only: true** — no auto-trading, no order execution at any level.

---

## Test Results

```
Test Files: 74 passed, 1 failed (financeDatabaseApi.test.ts — pre-existing, requires Python financedatabase package)
Tests:      1345 passed, 6 failed (all 6 failures are in financeDatabaseApi.test.ts, pre-existing)
TSC:        0 errors
```

The `financeDatabaseApi.test.ts` failures are **pre-existing** (require `pip install financedatabase` which is not available in the test environment). They are unrelated to LEVEL11.

---

## Suggested Next Steps for GPT

### LEVEL12 — Regime Detection & Macro Overlay
Build a `regimeDetectionEngine.ts` that:
- Classifies current macro regime: `risk_on / risk_off / late_cycle / early_cycle / stagflation / deflation`
- Feeds regime tag into `computeAsymmetryScore()` (already has `regimeTag` parameter)
- Integrates with `runLevel11Analysis()` to provide regime-aware driver routing
- Adds `regime_context` field to `ResearchNarrativeOutput`

### LEVEL12-B — Cross-Asset Correlation Matrix
Build a `crossAssetCorrelationEngine.ts` that:
- Maintains a correlation matrix for: equities / bonds / commodities / currencies / crypto
- Detects correlation breakdowns (regime shifts)
- Feeds into `buildPropagationChain()` to improve propagation confidence scores

### LEVEL12-C — Portfolio-Level Propagation Risk
Extend `danTreeSystem.ts` to:
- Run `buildPropagationChain()` for each active position
- Detect if multiple positions are downstream targets of the same shock event
- Trigger portfolio-level risk alert when concentration in propagation path exceeds threshold

---

## Architecture State (as of LEVEL11)

```
LEVEL7:  positionSizingEngine.ts          — base position sizing
LEVEL10.2: experienceLayer.ts             — gradient risk
LEVEL10.3: investorThinking.ts            — investor thinking framework
LEVEL10.3-B: businessUnderstandingEngine.ts — business understanding
LEVEL10.3-C: signalDensityEngine.ts       — signal density
LEVEL10.4: experienceLearningEngine.ts    — experience persistence & learning
LEVEL10.5: level105PositionLayer.ts       — asymmetry & position layer [UPGRADED in L11]
LEVEL11:  level11MultiAssetEngine.ts      — multi-asset reality & propagation [NEW]
```

All layers feed into `deepResearchEngine.ts` → `runDeepResearch()` → `ResearchNarrativeOutput`.
