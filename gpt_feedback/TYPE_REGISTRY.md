# TYPE REGISTRY — DanTree
**Version:** 2.2 (OI-L12-009)  
**Maintained by:** GPT Architecture  
**Read by:** Claude (Core Engineer), Manus (Integration)

---

## CORE PROTOCOL TYPES

### SemanticDirection
```ts
export type SemanticDirection = "positive" | "negative" | "mixed" | "neutral";
```

### SemanticTimeframe
```ts
export type SemanticTimeframe = "intraday" | "short" | "mid" | "long" | "structural";
```

### SemanticTaskType
```ts
export type SemanticTaskType =
  | "asset_classification"
  | "driver_routing"
  | "real_driver_identification"
  | "incentive_analysis"
  | "policy_reality"
  | "sentiment_detection"
  | "cross_asset_propagation"
  | "scenario_reasoning"
  | "narrative_composition"
  | "position_integration"
  | "risk_assessment"
  | "opportunity_radar"
  | "cycle_analysis"
  | "hypothesis_validation";
// TOTAL: 14 values — use >= 14 in assertions (NOT === 14)
```

---

## LEVEL 11 ENGINE TYPES

### AssetType
```ts
export type AssetType =
  | "equity"
  | "commodity"
  | "index"
  | "etf_equity"
  | "etf_sector"
  | "etf_macro";
```

### PrimaryDriverType
```ts
export type PrimaryDriverType =
  | "business"
  | "macro"
  | "liquidity"
  | "flow"
  | "hybrid";
```

### DriverFramework
```ts
export type DriverFramework =
  | "business_moat_management"
  | "macro_real_yield_supply_demand"
  | "liquidity_weight_regime"
  | "flow_narrative_wrapper";
```

### SentimentPhase
```ts
export type SentimentPhase =
  | "skepticism"
  | "early_bull"
  | "consensus"
  | "overheat"
  | "fragile"
  | "capitulation";
```

### DriverType (signal-level)
```ts
export type DriverType = "real" | "narrative" | "mixed";
```

---

## LEVEL 11 OUTPUT INTERFACES

### IncentiveAnalysisOutput
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

### PropagationLink
```ts
export interface PropagationLink {
  from: string;       // NOT from_asset
  to: string;         // NOT to_asset
  mechanism: string;
  lag: string;        // NOT lag_estimate
  confidence: number; // NOT correlation_strength
}
```

### PropagationChainOutput
```ts
export interface PropagationChainOutput {
  event: string;
  chain: PropagationLink[];  // NOT links
  terminal_impact: string;
  uncertainty_note: string;
  advisory_only: true;
}
```

### Level11AnalysisOutput
```ts
export interface Level11AnalysisOutput {
  classification: AssetClassification;
  driver_route: DriverEngineRoute;
  real_drivers: RealDriversOutput;
  incentives: IncentiveAnalysisOutput;
  sentiment_state: SentimentStateOutput;
  scenario_map: ScenarioMapOutput;
  policy_reality?: PolicyRealityOutput;
  propagation_chain?: PropagationChainOutput;
  advisory_only: true;
}
```

---

## SEMANTIC AGGREGATION TYPES

### UnifiedSemanticState
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

### SynthesisSemanticEnvelope
```ts
export interface SynthesisSemanticEnvelope {
  protocol_version: "12.2";
  entity: string;
  dominant_direction: SemanticDirection | "unclear";
  confidence_score: number;
  confidence_fragility: number;
  confidence_downgraded: boolean;
  top_signals: SemanticSignalObject[];
  top_risks: SemanticRiskObject[];
  has_conflicts: boolean;
  conflict_count: number;
  unresolved_conflicts: SemanticConflict[];
  key_invalidations: SemanticInsightNote[];
  semantic_notes: SemanticInsightNote[];
  state_regime?: string;
  state_crowding?: number;
  state_fragility?: number;
  advisory_only: true;
}
```

---

## DEEP RESEARCH TYPES (delta-critical)

### DeepResearchContextMap (post-Level12.5)
```ts
export interface DeepResearchContextMap {
  ticker: string;
  sector: string;
  investorThinking: InvestorThinkingOutput;
  regime: RegimeOutput;
  factorInteraction: FactorInteractionOutput;
  businessContext: BusinessContext;
  signalFusionScore: number;
  dataQualityScore: number;
  priceChangePercent?: number;
  level11Analysis?: Level11AnalysisOutput;  // [Level12.5]
}
```

### DeepResearchOutput (post-Level12.5)
```ts
export interface DeepResearchOutput {
  ticker: string;
  thesis: InvestmentThesisOutput;
  key_variables: KeyVariablesOutput;
  payout_map: PayoutMapOutput;
  implicit_factors: ImplicitFactorsOutput;
  judgment_tension: JudgmentTensionOutput;
  experience_layer?: ExperienceLayerOutput;
  experience_history?: ExperienceHistorySummaryEmbed;
  narrative: ResearchNarrativeOutput;
  lens: LensOutput;
  signal_density: SignalDensityResult;
  unifiedSemanticState?: UnifiedSemanticState;  // [Level12.5]
  advisory_only: true;
}
```

---

## TEST MOCK HOTSPOTS (OI-L12-007)

These types are the most frequently misused in test mocks. Always copy exact definitions:

| Type | Common mistake | Correct field |
|---|---|---|
| `PropagationLink` | `from_asset`, `to_asset` | `from`, `to` |
| `PropagationLink` | `lag_estimate` | `lag` |
| `PropagationLink` | `correlation_strength` | `confidence` |
| `PropagationChainOutput` | `links` | `chain` |
| `IncentiveAnalysisOutput` | Missing `narrative_support`, `narrative_fragility` | Include all 7 fields |
| `SentimentPhase` | Guessed values | Use only the 6 values listed above |
| `AssetType` | `etf` (invalid) | `etf_equity` / `etf_sector` / `etf_macro` |
| `UnifiedSemanticState` | Missing `generated_at` | `generated_at: new Date().toISOString()` |

**See `gpt_feedback/TEST_MOCK_TYPE_PACK.md` for the full reusable copy-paste pack.**

---

## PIPELINE STATUS (post-Level12.6)

| Path | Status |
|---|---|
| PATH-A (Level11 → semantic packet) | ✅ ACTIVE |
| PATH-B (ExperienceLayer → semantic packet) | ✅ ACTIVE |
| PATH-C (PositionLayer → semantic packet) | ✅ ACTIVE |
| Step3 semantic injection | ✅ ACTIVE |
| `unifiedSemanticState` in `DeepResearchOutput` | ✅ ACTIVE |
| `level11Analysis` in `DeepResearchContextMap` | ✅ ACTIVE |


---

## ExperienceLayerInsight Typed Codes (Level14.0-A / OI-L12-001)

**File:** `server/experienceLayer.ts`
**Status:** RESOLVED — Compatibility-first typed stabilization

### New Types Added (additive, backward-compatible)

```ts
export type DriftCode = "weakening" | "strengthening" | "stable" | "unclear";
export type ConfidenceEvolutionCode = "rising" | "falling" | "stable";
export type RiskGradientCode = "low" | "building" | "elevated" | "critical";
```

### Updated Interface

```ts
export interface ExperienceLayerInsight {
  // Existing natural-language fields (UNCHANGED — do NOT remove)
  drift_interpretation: string;
  confidence_evolution: string;
  behavior_insights: string;
  risk_gradient: string;
  full_insight: string;
  advisory_only: true;
  // [Level14.0-A] Typed codes — added for downstream typed consumption
  drift_code?: DriftCode;
  confidence_evolution_code?: ConfidenceEvolutionCode;
  risk_gradient_code?: RiskGradientCode;
}
```

### HARD RULES for Mock Generation

1. All 6 original string fields MUST be present — they are NOT optional
2. `advisory_only` MUST be exactly `true` (literal boolean, not string)
3. `drift_code` values: `"weakening" | "strengthening" | "stable" | "unclear"` only
4. `confidence_evolution_code` values: `"rising" | "falling" | "stable"` only
5. `risk_gradient_code` values: `"low" | "building" | "elevated" | "critical"` only
6. All three code fields are optional (`?`) — safe to omit in minimal mocks
