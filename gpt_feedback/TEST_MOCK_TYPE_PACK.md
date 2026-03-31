# TEST MOCK TYPE PACK — OI-L12-007
**Version:** 1.1 (OI-L12-009)  
**Scope:** Include in every Claude/Manus task package that touches Level11AnalysisOutput or semantic surface tests.  
**Rule:** Copy-paste the relevant sections verbatim. Do not infer missing fields.

---

## INCLUDE RULE

| Condition | Include sections |
|---|---|
| Task touches `Level11AnalysisOutput` mocks | `AssetType`, `PrimaryDriverType`, `DriverFramework`, `IncentiveAnalysisOutput` |
| Task touches semantic activation / surface tests | `AssetType`, `SentimentPhase`, `PropagationLink`, `UnifiedSemanticState` |
| Task touches both | Include all sections |

---

## SECTION 1 — AssetType

```ts
export type AssetType =
  | "equity"
  | "commodity"
  | "index"
  | "etf_equity"
  | "etf_sector"
  | "etf_macro";
```

---

## SECTION 2 — SentimentPhase

```ts
export type SentimentPhase =
  | "skepticism"
  | "early_bull"
  | "consensus"
  | "overheat"
  | "fragile"
  | "capitulation";
```

---

## SECTION 3 — PrimaryDriverType

```ts
export type PrimaryDriverType =
  | "business"
  | "macro"
  | "liquidity"
  | "flow"
  | "hybrid";
```

---

## SECTION 4 — DriverFramework

```ts
export type DriverFramework =
  | "business_moat_management"
  | "macro_real_yield_supply_demand"
  | "liquidity_weight_regime"
  | "flow_narrative_wrapper";
```

---

## SECTION 5 — IncentiveAnalysisOutput

```ts
export interface IncentiveAnalysisOutput {
  key_players: string[];
  incentives: string[];
  fear_drivers: string[];
  narrative_support: string;
  narrative_fragility: string;
  hidden_pressure_points: string[];
  behavioral_summary: string;
  advisory_only: true;
}
```

---

## SECTION 6 — PropagationLink

```ts
export interface PropagationLink {
  from: string;
  to: string;
  mechanism: string;
  lag: string;
  confidence: number;
}
```

---

## SECTION 7 — UnifiedSemanticState (delta-critical fields)

```ts
export interface UnifiedSemanticState {
  protocol_version: "12.2";
  entity: string;
  timeframe: SemanticTimeframe;
  dominant_direction: SemanticDirection | "unclear";
  state_summary: AggregatedStateSummary;
  signals: SemanticSignalObject[];
  risks: SemanticRiskObject[];
  confidence: AggregatedConfidence;
  conflicts: SemanticConflict[];
  invalidations: SemanticInsightNote[];
  semantic_notes: SemanticInsightNote[];
  source_agents: string[];
  packet_count: number;
  generated_at: string;  // ISO timestamp — REQUIRED, do not omit
  advisory_only: true;
}
```

---

## HARD RULES

1. **Never infer** enum values — only use values listed above.
2. **Never omit** required fields from mock objects (`advisory_only: true` is mandatory on all DanTree output types). `UnifiedSemanticState` also requires `generated_at: string` — use `new Date().toISOString()` in mocks.
3. **Prefer surgical diffs** — include only the sections actually referenced by the task.
4. `PropagationLink` fields are: `from`, `to`, `mechanism`, `lag`, `confidence` — NOT `from_asset`, `to_asset`, `lag_estimate`, `correlation_strength`.
5. `IncentiveAnalysisOutput` does NOT have a `ticker` field at the top level (it is embedded inside `Level11AnalysisOutput.incentives`).
