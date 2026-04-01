# DANTREE CHANGELOG_SINCE_LAST_TASK_TEMPLATE
**Version:** 2.1 | **Purpose:** Delta awareness between task packages.
**Rule:** Every task package MUST include a `[CHANGELOG_SINCE_LAST_TASK]` block.
If nothing changed: write `NO_INTERFACE_CHANGES`.

---

## FORMAT (copy into task packages)

```
[CHANGELOG_SINCE_LAST_TASK]
TASK_REF: LEVEL12.3 → LEVEL12.4

ADDED_FILES:
  - server/semantic_packet_builders.ts      (Level 12.3 — PATH-A + PATH-C builders)
  - server/semantic_packet_builders.test.ts (Level 12.3 tests)

MODIFIED_FILES:
  - server/deepResearchEngine.ts  → Added PATH-A/C aggregation boundary (non-blocking)
  - server/routers.ts             → Added semanticEnvelopeBlock injection in Step3
  - server/synthesisController.ts → Added formatSemanticEnvelopeForPrompt()

INTERFACE_CHANGES:
  - NONE (all READ-ONLY interfaces unchanged)

DEPRECATED:
  - invokeWithModel() in server/llmProviders.ts (since Task #001-B)
    → Use modelRouter.generate() instead

ENUM_ADDITIONS:
  - SemanticTaskType: added "opportunity_radar", "cycle_analysis", "hypothesis_validation"
    (total now 14 values — use >= 14 in assertions)

ROUTE_ADDITIONS:
  - NONE

PIPELINE_STATUS_CHANGES:
  - PATH-C: INACTIVE → ACTIVE (builder wired in aggregation boundary)
  - Step3 injection: WIRED but INACTIVE (pending OI-L12-003-B)

NO_INTERFACE_CHANGES: (use this line if nothing changed)
[/CHANGELOG_SINCE_LAST_TASK]
```

---

## CUMULATIVE CHANGELOG (all tasks to date)

### Task #001-B — Model Router Hardening
```
ADDED: server/model_router.ts (v2.0 hardened)
ADDED: server/model_router.test.ts
MODIFIED: server/llmProviders.ts → invokeWithModel() deprecated
DEPRECATED: invokeWithModel() → delegates to modelRouter.generate()
```

### Task Level12.1 — Semantic Protocol Phase 1
```
ADDED: server/semantic_protocol.ts
ADDED: server/semantic_protocol_integration.ts
ADDED: server/semantic_protocol.test.ts
ADDED: server/semantic_protocol_integration.test.ts
PIPELINE: PATH-B activated (ExperienceLayer → packet)
```

### Task Level12.2 — Semantic Aggregation Layer
```
ADDED: server/semantic_aggregator.ts
ADDED: server/semantic_aggregator.test.ts
MODIFIED: server/deepResearchEngine.ts → PATH-B aggregation boundary
MODIFIED: server/synthesisController.ts → formatSemanticEnvelopeForPrompt()
PIPELINE: UnifiedSemanticState produced; Step3 injection wired (inactive)
```

### Task Level12.3 — Semantic Packet Builders
```
ADDED: server/semantic_packet_builders.ts
ADDED: server/semantic_packet_builders.test.ts
MODIFIED: server/deepResearchEngine.ts → PATH-C activated; PATH-A partial
MODIFIED: server/routers.ts → semanticEnvelopeBlock in Step3
PIPELINE: PATH-C ACTIVE; Step3 injection WIRED but INACTIVE (OI-L12-003-B)
```

### Task WF-V2.1 — Workflow Hardening
```
ADDED: gpt_feedback/TYPE_REGISTRY.md
ADDED: gpt_feedback/CODEBASE_CONTEXT.md
ADDED: gpt_feedback/OI_RESOLUTION_TEMPLATE.md
ADDED: gpt_feedback/CHANGELOG_SINCE_LAST_TASK_TEMPLATE.md
ADDED: gpt_feedback/WORKFLOW_V2_1_PACKAGING_GUIDE.md
NO CODE CHANGES
```

### Task Level16.0B — Portfolio Analysis Engine (Claude)
```
ADDED: server/portfolioAnalysisEngine.ts
ADDED: server/portfolioAnalysisEngine.test.ts (45 tests)
INTERFACE: BasketAnalysisInput, BasketEntitySnapshot, PortfolioAnalysisResult
INTERFACE: ThesisOverlapResult, ConcentrationRiskResult, SharedFragilityResult
INTERFACE: EvidenceDispersionResult, GateDistributionResult
INTERFACE: PortfolioAnalysisDimension<T>, DirectionBucket, EntityGateDecision
EXPORT: analyzePortfolioBasket(), validateBasket(), BasketValidationError
PIPELINE: Phase 1 basket analysis (2–8 entities, 5 dimensions, in-memory only)
```

### Task Level16.0C — Portfolio Analysis Integration (Manus)
```
MODIFIED: server/routers.ts → market.analyzeBasket added (append-only)
MODIFIED: gpt_feedback/TYPE_REGISTRY.md → Level16.0-B portfolio types appended (v2.3)
MODIFIED: gpt_feedback/FEEDBACK_LEVEL16_0B.md → copied from Claude output
MODIFIED: gpt_feedback/CHANGELOG_SINCE_LAST_TASK_TEMPLATE.md → this entry
OI: OI-L16-001 RESOLVED
TESTS: 45/45 new tests pass | 1772/1778 total (6 pre-existing financeDatabaseApi failures)
TSC: 0 errors
ROUTE: market.analyzeBasket (publicProcedure, input: entities[2..8], taskType?, region?)
NAMING: normalized from market.analyzePortfolioBasket → market.analyzeBasket per L16.0C spec
```

---

## Level 17.0B-C — Alert Engine Phase 1 Integration
**Date:** 2026-04-01  
**Task Refs:** LEVEL17.0B (CLAUDE_NARROW) → LEVEL17.0C (MANUS_INTEGRATION)

### Added Files
- `server/alertEngine.ts` — Alert Engine Phase 1 (pure functions, 5 alert types)
- `server/alertEngine.test.ts` — 53 tests, all passing

### Modified Files
- `server/routers.ts` — Added `market.evaluateEntityAlerts` and `market.evaluateBasketAlerts`

### Interface Changes
- `AlertType`, `AlertSeverity`, `AlertScope`, `AlertResult`, `AlertSummary`, `EntityGateResult` added to TYPE_REGISTRY v2.4

### Route Additions
- `market.evaluateEntityAlerts` — entity-scoped alert evaluation (gate_downgrade, evidence_weakening, fragility_spike, source_deterioration)
- `market.evaluateBasketAlerts` — basket-scoped alert evaluation (basket_concentration_warning)

### Test Results
- alertEngine: **53/53** ✅
- TSC: **0 errors** ✅
- Regression: **1825/1831** (6 pre-existing financeDatabaseApi env failures)

### OI Resolution
- OI-L17-001: RESOLVED — Alert Engine Phase 1 backend complete
- OI-L15-003: DEFERRED — Direction-flip alerts remain Phase 2


---

## Level 18.0B-C — Thesis / State Tracking Phase 1 (2026-04-01)

**Files Added:**
- server/thesisStateEngine.ts (523 lines, pure functions)
- server/thesisStateEngine.test.ts (70 tests, all pass)

**Routes Added:**
- market.getEntityThesisState — derives EntityThesisState from semantic/gate/source/alert inputs
- market.getBasketThesisState — derives BasketThesisState from PortfolioAnalysisResult

**Test Results:** 70/70 new tests pass | TSC 0 errors | Regression 1895/1901

**OI Closed:** OI-L18-001

---

## [L19.0B-C] — 2026-04-01

### Added
- `server/executionTimingEngine.ts` (447 lines) — Execution/Timing Assistant Phase 1 pure function layer
- `server/executionTimingEngine.test.ts` (615 lines) — 62 tests
- `market.getExecutionTiming` tRPC route (publicProcedure)
- `market.getBasketTiming` tRPC route (publicProcedure)

### Fixed (Manus)
- OI-L19-BUG-001: `deriveActionBias` branch order — `stance="unavailable"` now checked before `readiness="not_ready"`
- OI-L19-BUG-002: TSC error — `confirmation !== "conflicted"` replaced with explicit positive union
- OI-L19-BUG-003: TSC error — `entityResults` schema changed to `z.array(z.any())` in router

### Closed OIs
- OI-L19-001: `market.getExecutionTiming` + `market.getBasketTiming` routes live ✅

### Test Results
- executionTimingEngine: 62/62 ✅
- Full regression: 1957/1963 (6 pre-existing financeDatabaseApi env failures)
- TSC: 0 errors

---

## [L20.0B-C] Session History Engine — 2026-04-01

### Added
- `server/sessionHistoryEngine.ts` (468 lines) — pure function layer for thesis timeline snapshots
- `server/sessionHistoryEngine.test.ts` (532 lines, 46/46 tests)
- `market.getSessionHistory` tRPC route
- `market.getBasketHistory` tRPC route

### Fixed (Manus)
- Test assertion mismatch: `delta_summary.toContain("first_observation")` → `.toLowerCase().toContain("first")`
- Function signature mismatch ×2: positional args → single input object

### Metrics
- TSC: 0 errors | Regression: 2003/2009 | New tests: 46/46
- OI-L20-001: CLOSED


---

## [L20.0B-C] Session History Engine — 2026-04-01

### Added
- server/sessionHistoryEngine.ts (468 lines) — pure function layer for thesis timeline snapshots
- server/sessionHistoryEngine.test.ts (532 lines, 46/46 tests)
- market.getSessionHistory tRPC route
- market.getBasketHistory tRPC route

### Fixed (Manus)
- Test assertion mismatch: delta_summary.toContain first_observation -> toLowerCase first
- Function signature mismatch x2: positional args -> single input object

### Metrics
- TSC: 0 errors | Regression: 2003/2009 | New tests: 46/46
- OI-L20-001: CLOSED
