# FEEDBACK — Level 19.0A Execution/Timing Assistant Preflight
**Date:** 2026-04-01 | **Task:** L19.0A Preflight (Discovery-Only)
**Status:** COMPLETE | **Production files modified:** 0

---

## Summary

Preflight complete. Scanned 23 read-only files. Execution/Timing Assistant Phase 1 is fully unblocked — all 6 input layers are live and typed. No schema migration required. L19.0B is classified CLAUDE_NARROW.

---

## Key Findings

**Best input layers (PRIMARY):**
- `thesisStateEngine.ts` → `current_stance`, `conviction_level`, `gate_state`
- `alertEngine.ts` → `highest_severity`, `alert_count`, `alert_type`
- `outputGatingEngine.ts` → `gate_passed`, `evidence_score`, `blocking_fields`

**Best input layers (SECONDARY):**
- `experienceLayer.ts` → `drift_code`, `confidence_evolution_code`, `risk_gradient_code`
- `portfolioAnalysisEngine.ts` → `concentration_risk.label` (basket only)
- `semantic_aggregator.ts` → `dominant_direction`, `state_summary.fragility`

**New file:** `server/executionTimingEngine.ts` (pure function, no DB/LLM)

**Two tRPC routes (L19.0C):**
- `market.getEntityTimingState`
- `market.getBasketTimingState`

**UI (L19.1A, separate task):** Panel J in TerminalEntry — follows Alerts Panel pattern

---

## Phase 1 Output Types

```
ExecutionTimingResult:
  readiness_state: "ready" | "conditional" | "not_ready" | "blocked"
  entry_quality:   "high" | "moderate" | "low" | "unavailable"
  timing_risk:     "low" | "medium" | "high" | "critical"
  confirmation_state: "confirmed" | "partial" | "unconfirmed" | "conflicted"
  action_bias:     "BUY" | "HOLD" | "WAIT" | "AVOID" | "NONE"
  no_action_reason: string | null
  timing_summary:  string

BasketTimingResult:
  entity_results: ExecutionTimingResult[]
  basket_readiness: ReadinessState (most conservative)
  basket_action_bias: ActionBias (plurality vote)
  concentration_constraint: boolean
  basket_timing_summary: string
```

---

## Guard Rules for Claude

1. `buildFallbackOutputGateResult()` → add `is_fallback` guard before treating `gate_passed=false` as "blocked"
2. `AlertSummary.highest_severity` may be `null` → treat as "low"
3. `current_stance="neutral"` → map to "conditional" (not "blocked")
4. `dominant_direction="unclear"` → "unconfirmed" (not "conflicted")
5. Basket size <2 → throw `BasketTimingValidationError`

---

## OI Updates

| OI | Status | Notes |
|---|---|---|
| OI-L19-001 | OPEN | Execution/Timing Engine Phase 1 — backend pending L19.0B |
| OI-L15-003 | DEFERRED | Protocol Layer Direction "unavailable" — non-blocking |

---

## Next Steps

1. **L19.0B (CLAUDE_NARROW)** — Send L19.0B Task Specification (in preflight report) to Claude. Expected: `executionTimingEngine.ts` (≥35 tests).
2. **L19.0C (MANUS_DIRECT)** — Copy Claude output, add 2 tRPC routes, run tests, update TYPE_REGISTRY.
3. **L19.1A (MANUS_DIRECT)** — Panel J UI in TerminalEntry after backend is stable.

---

## Confirmation

**No production files were modified in this task.**
Files written: `gpt_feedback/L19_0A_EXECUTION_TIMING_PREFLIGHT.md`, `gpt_feedback/FEEDBACK_LEVEL19_0A.md`
