# L19.0A — Execution / Timing Assistant Phase 1 Preflight
**Date:** 2026-04-01 | **Author:** Manus (Discovery-Only)
**Status:** PREFLIGHT COMPLETE — NO PRODUCTION FILES MODIFIED

---

## 1. Existing Result Layers Best Suited as Execution/Timing Inputs

| Layer | File | Key Fields Available | Timing Relevance |
|---|---|---|---|
| **Thesis State** | `thesisStateEngine.ts` | `current_stance`, `evidence_state`, `gate_state`, `thesis_change_marker`, `conviction_level` | PRIMARY — stance + conviction = entry readiness signal |
| **Alert Engine** | `alertEngine.ts` | `highest_severity`, `alert_count`, `gate_downgrade`, `fragility_spike`, `evidence_weakening` | PRIMARY — active alerts = timing risk signal |
| **Output Gate** | `outputGatingEngine.ts` | `gate_passed`, `evidence_score`, `evidence_level`, `output_mode`, `semantic_fragility`, `blocking_fields` | PRIMARY — gate_passed = minimum confirmation threshold |
| **Experience Layer** | `experienceLayer.ts` | `drift_code`, `confidence_evolution_code`, `risk_gradient_code`, `market_behavior` | SECONDARY — drift + confidence trend = momentum quality |
| **Portfolio Analysis** | `portfolioAnalysisEngine.ts` | `concentration_risk`, `shared_fragility`, `gate_distribution` | SECONDARY (basket only) — concentration risk = position sizing constraint |
| **Semantic Aggregator** | `semantic_aggregator.ts` | `dominant_direction`, `state_summary.fragility`, `confidence.overall` | SECONDARY — direction + fragility = directional confirmation |
| **Source Selection** | `sourceSelectionEngine.ts` | `selected_sources`, `validation_result`, `route_results` | TERTIARY — source quality = evidence freshness signal |
| **Level10.5 Position Layer** | `level105PositionLayer.ts` | `asymmetry.label`, `sizing.size_bucket`, `no_bet_discipline.should_bet` | TERTIARY — asymmetry + no-bet = sizing readiness |

**NOT suitable as Phase 1 inputs:**
- `danTreeSystem.ts` — batch pipeline, too heavy for per-entity timing query
- `multiEntityComparisonEngine.ts` — comparison-only, no single-entity timing signal
- `level11MultiAssetEngine.ts` — macro/structural, not per-entity timing

---

## 2. Recommended New File and Location

**New file:** `server/executionTimingEngine.ts`

This is a **pure function layer** — no DB calls, no LLM calls, no async. Accepts pre-computed engine outputs as inputs, returns a typed `ExecutionTimingResult`. Follows the same pattern as `alertEngine.ts` and `portfolioAnalysisEngine.ts`.

**Location rationale:** Consistent with all Phase 1 pure-function engines in `server/`. No schema migration required.

---

## 3. L19.0B Classification: CLAUDE_NARROW

**Rationale:**
- Requires careful type interface design (6 output fields, 3 input bundles)
- Requires ≥30 tests covering all readiness/timing combinations
- Pure function layer with no DB/LLM coupling — ideal for Claude's structured output
- Manus integration (L19.0C) will be straightforward: copy file + add 2 tRPC routes

---

## 4. Minimal Phase 1 Objects

### Object 1: `ExecutionTimingResult` (entity-level)

```typescript
export interface ExecutionTimingResult {
  entity: string;
  generated_at: string;
  advisory_only: true;

  // Core Phase 1 fields (6 required)
  readiness_state: ReadinessState;        // "ready" | "conditional" | "not_ready" | "blocked"
  entry_quality: EntryQuality;            // "high" | "moderate" | "low" | "unavailable"
  timing_risk: TimingRisk;                // "low" | "medium" | "high" | "critical"
  confirmation_state: ConfirmationState;  // "confirmed" | "partial" | "unconfirmed" | "conflicted"
  action_bias: ActionBias;                // "BUY" | "HOLD" | "WAIT" | "AVOID" | "NONE"
  no_action_reason: string | null;        // null when action_bias is actionable

  // Derived summary
  timing_summary: string;                 // 1-sentence natural language
}
```

### Object 2: `BasketTimingResult` (basket-level)

```typescript
export interface BasketTimingResult {
  entities: string[];
  generated_at: string;
  advisory_only: true;

  entity_results: ExecutionTimingResult[];
  basket_readiness: ReadinessState;        // most conservative of entity results
  basket_action_bias: ActionBias;          // plurality vote
  concentration_constraint: boolean;       // from portfolioAnalysisEngine concentration_risk
  basket_timing_summary: string;
}
```

### Supporting Types

```typescript
export type ReadinessState = "ready" | "conditional" | "not_ready" | "blocked";
export type EntryQuality = "high" | "moderate" | "low" | "unavailable";
export type TimingRisk = "low" | "medium" | "high" | "critical";
export type ConfirmationState = "confirmed" | "partial" | "unconfirmed" | "conflicted";
export type ActionBias = "BUY" | "HOLD" | "WAIT" | "AVOID" | "NONE";
```

---

## 5. Minimal Fields Per Object

### `ExecutionTimingResult` — Field Derivation Logic

| Field | Source | Derivation Rule |
|---|---|---|
| `readiness_state` | `gate_passed` + `current_stance` + `alert.highest_severity` | `gate_passed=false` → "blocked"; `severity=critical` → "blocked"; `stance=bullish` + `gate_passed=true` + `severity≤medium` → "ready"; else "conditional" |
| `entry_quality` | `evidence_score` + `drift_code` + `confidence_evolution_code` | `evidence_score≥70` + `drift=strengthening` + `confidence=rising` → "high"; `evidence_score<40` → "low"; else "moderate" |
| `timing_risk` | `alert.highest_severity` + `fragility` + `risk_gradient_code` | Maps directly: `critical/elevated` → "critical"/"high"; `building` → "medium"; `low` → "low" |
| `confirmation_state` | `dominant_direction` + `gate_passed` + `alert_count` | `direction=bullish/bearish` + `gate_passed=true` + `alert_count=0` → "confirmed"; conflicts → "conflicted" |
| `action_bias` | `readiness_state` + `current_stance` + `confirmation_state` | "ready"+"bullish"+"confirmed" → "BUY"; "blocked" → "AVOID"; "conditional" → "WAIT"; else "HOLD" |
| `no_action_reason` | `readiness_state` + `blocking_fields` + `alert_type` | null when "ready"; string when "blocked"/"conditional" |

### `BasketTimingResult` — Field Derivation Logic

| Field | Source | Derivation Rule |
|---|---|---|
| `basket_readiness` | `entity_results[].readiness_state` | Most conservative (blocked > not_ready > conditional > ready) |
| `basket_action_bias` | `entity_results[].action_bias` | Plurality vote; tie → "WAIT" |
| `concentration_constraint` | `portfolioAnalysisEngine.concentration_risk.label` | `label="high"` → true |

---

## 6. Phase 1 Scope: Backend/Query-Only First

**Recommendation: Backend + query only (no UI in L19.0B/0C).**

Rationale:
- UI (Panel J) should be a separate `L19.1A` task after backend is stable and tested
- Consistent with L16/L17/L18 pattern: 0B (Claude backend) → 0C (Manus integration) → 1A (Manus UI)
- `market.getEntityTimingState` and `market.getBasketTimingState` are the only two routes needed in L19.0C
- Panel J will follow the same pattern as Alerts Panel (Panel I) — conditional render, severity color coding

---

## 7. Blockers, Hidden Coupling, and Schema/State Risks

### No Blockers

Phase 1 is fully unblocked. All 6 input layers are live and return typed results.

### Hidden Coupling Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `buildFallbackOutputGateResult()` returns `gate_passed=false` even when data is valid | LOW | Add `is_fallback` guard in `executionTimingEngine.ts` — same pattern as `alertEngine.ts` |
| `thesisStateEngine.ts` `current_stance` may be `"neutral"` when data is sparse | LOW | Map "neutral" stance → "conditional" readiness (not "blocked") |
| `alertEngine.ts` `highest_severity` is `null` when no alerts — must not be treated as "critical" | LOW | Explicit null check: `null` → treat as "low" severity |
| `dominant_direction` from `semantic_aggregator` may be `"unclear"` | LOW | Map "unclear" → `confirmation_state="unconfirmed"` (not "conflicted") |
| Basket timing requires `PortfolioAnalysisResult` which needs ≥2 entities | MEDIUM | Validate basket size ≥2 before calling `buildBasketTimingResult`; return error if <2 |

### Schema/State Risks

**None.** Phase 1 is stateless — no DB writes, no schema migration required. `decisionHistory` table already has `timingSignal` field for future Phase 2 persistence.

---

## 8. Confirmation: No Production Files Modified

**CONFIRMED.** The following files were read (discovery only):

```
server/thesisStateEngine.ts          ✓ READ ONLY
server/thesisStateEngine.test.ts     ✓ READ ONLY
server/alertEngine.ts                ✓ READ ONLY
server/alertEngine.test.ts           ✓ READ ONLY
server/portfolioAnalysisEngine.ts    ✓ READ ONLY
server/portfolioAnalysisEngine.test.ts ✓ READ ONLY
server/multiEntityComparisonEngine.ts ✓ READ ONLY
server/multiEntityComparisonEngine.test.ts ✓ READ ONLY
server/outputGatingEngine.ts         ✓ READ ONLY
server/outputGatingEngine.test.ts    ✓ READ ONLY
server/evidenceValidator.ts          ✓ READ ONLY
server/sourceSelectionEngine.ts      ✓ READ ONLY
server/sourceSelectionEngine.test.ts ✓ READ ONLY
server/watchlistEngine.ts            ✓ READ ONLY
server/routers.ts                    ✓ READ ONLY
server/semantic_protocol.ts          ✓ READ ONLY (via grep)
server/semantic_aggregator.ts        ✓ READ ONLY
server/danTreeSystem.ts              ✓ READ ONLY
server/experienceLayer.ts            ✓ READ ONLY
server/level11MultiAssetEngine.ts    ✓ READ ONLY
server/level105PositionLayer.ts      ✓ READ ONLY
client/src/pages/TerminalEntry.tsx   ✓ READ ONLY
drizzle/schema.ts                    ✓ READ ONLY
```

**No production files modified.**

---

## L19.0B Task Specification (for Claude)

```
[TASK]
Level19.0-B — Execution / Timing Assistant Phase 1 (CLAUDE_NARROW)

Goal:
Implement server/executionTimingEngine.ts as a pure-function layer.
No DB calls. No LLM calls. No async. No imports from server/_core/.

[INPUT_CONTRACT]
The engine accepts pre-computed outputs from existing engines:
- OutputGateResult (from outputGatingEngine.ts)
- EntityThesisState (from thesisStateEngine.ts)
- AlertSummary (from alertEngine.ts)
- ExperienceLayerInsight (from experienceLayer.ts)
- UnifiedSemanticState (from semantic_aggregator.ts)
- PortfolioAnalysisResult (from portfolioAnalysisEngine.ts) — basket only

[OUTPUT_TYPES]
export type ReadinessState = "ready" | "conditional" | "not_ready" | "blocked";
export type EntryQuality = "high" | "moderate" | "low" | "unavailable";
export type TimingRisk = "low" | "medium" | "high" | "critical";
export type ConfirmationState = "confirmed" | "partial" | "unconfirmed" | "conflicted";
export type ActionBias = "BUY" | "HOLD" | "WAIT" | "AVOID" | "NONE";

export interface ExecutionTimingResult {
  entity: string;
  generated_at: string;
  advisory_only: true;
  readiness_state: ReadinessState;
  entry_quality: EntryQuality;
  timing_risk: TimingRisk;
  confirmation_state: ConfirmationState;
  action_bias: ActionBias;
  no_action_reason: string | null;
  timing_summary: string;
}

export interface BasketTimingResult {
  entities: string[];
  generated_at: string;
  advisory_only: true;
  entity_results: ExecutionTimingResult[];
  basket_readiness: ReadinessState;
  basket_action_bias: ActionBias;
  concentration_constraint: boolean;
  basket_timing_summary: string;
}

[DERIVATION_RULES]
readiness_state:
  - gate_passed=false → "blocked"
  - alert.highest_severity="critical" → "blocked"
  - stance="bullish" AND gate_passed=true AND severity≤"medium" → "ready"
  - stance="bearish" AND gate_passed=true AND severity≤"medium" → "ready" (short bias)
  - else → "conditional" (default to conditional, not not_ready)
  - no_action_reason: null when "ready"; descriptive string otherwise

entry_quality:
  - evidence_score≥70 AND drift_code="strengthening" AND confidence_evolution_code="rising" → "high"
  - evidence_score<40 → "low"
  - gate_passed=false → "unavailable"
  - else → "moderate"

timing_risk:
  - alert.highest_severity="critical" OR risk_gradient_code="critical" → "critical"
  - alert.highest_severity="high" OR risk_gradient_code="elevated" → "high"
  - alert.highest_severity="medium" OR risk_gradient_code="building" → "medium"
  - else → "low"

confirmation_state:
  - dominant_direction="bullish"/"bearish" AND gate_passed=true AND alert_count=0 → "confirmed"
  - dominant_direction="mixed" OR (gate_passed=true AND alert_count>0) → "conflicted"
  - dominant_direction="unclear" → "unconfirmed"
  - gate_passed=false → "partial"

action_bias:
  - readiness_state="blocked" → "AVOID"
  - readiness_state="ready" AND stance="bullish" AND confirmation_state="confirmed" → "BUY"
  - readiness_state="ready" AND stance="bearish" AND confirmation_state="confirmed" → "AVOID"
  - readiness_state="conditional" → "WAIT"
  - else → "HOLD"

basket_readiness: most conservative of entity_results[].readiness_state
  Priority: blocked > not_ready > conditional > ready

basket_action_bias: plurality vote of entity_results[].action_bias; tie → "WAIT"

concentration_constraint:
  - portfolioAnalysisResult.concentration_risk.label === "high" → true
  - else → false

[GUARD_RULES]
- buildFallbackOutputGateResult() returns gate_passed=false — add is_fallback guard
  (check if gate_reason includes "fallback" or blocking_fields.length>3)
- AlertSummary.highest_severity may be null — treat null as "low"
- EntityThesisState.current_stance may be "neutral" — map to "conditional" readiness
- dominant_direction="unclear" → "unconfirmed" (NOT "conflicted")
- Basket size must be ≥2; throw BasketTimingValidationError if <2

[EXPORTS_REQUIRED]
export function buildEntityTimingResult(input: EntityTimingInput): ExecutionTimingResult
export function buildBasketTimingResult(input: BasketTimingInput): BasketTimingResult
export function buildFallbackTimingResult(entity: string): ExecutionTimingResult
export class BasketTimingValidationError extends Error

[TEST_REQUIREMENTS]
File: server/executionTimingEngine.test.ts
Minimum: 35 tests
Coverage required:
- All 4 ReadinessState values (including fallback guard)
- All 5 ActionBias values
- All 4 EntryQuality values
- All 4 TimingRisk values
- All 4 ConfirmationState values
- Basket: concentration_constraint true/false
- Basket: most-conservative readiness aggregation
- Basket: plurality vote tie-breaking
- Null/undefined input guards (AlertSummary.highest_severity=null)
- BasketTimingValidationError for <2 entities

[SCOPE_GUARD]
Phase 1 is NOT trade execution automation.
Do NOT plan broker integration, order placement, or alert delivery.
This is decision-support only.
advisory_only: true must be present on all output objects.
```
