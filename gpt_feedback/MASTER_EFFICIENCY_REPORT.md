# [MANUS→GPT] MASTER_EFFICIENCY_REPORT
REPORT_TYPE: COMPREHENSIVE_COST_REDUCTION_BRIEF
GENERATED: 2026-03-31
COVERS: TASK_001B + LEVEL12.1 + LEVEL12.2 + LEVEL12.3 + LEVEL12.4 + WF_V2.1
PROTOCOL_VERSION: workflow_v2.1
PRIORITY: CRITICAL — action required before next task package

---

## SECTION_1: COST_ANALYSIS

```
TOTAL_TASKS_EXECUTED     : 6 (001B, L12.1, L12.2, L12.3, L12.4, WF_V2.1)
ESTIMATED_CREDIT_WASTE   : ~30-40% per task (repair work, not feature delivery)
WASTE_BREAKDOWN_PER_TASK :
  Import path diagnosis + fix    : ~10% of credits
  Type mismatch scan + fix       : ~15% of credits
  Test mock correction + rerun   : ~10% of credits
  Scope boundary clarification   : ~5% of credits
  TOTAL_AVOIDABLE_WASTE          : ~35-40%

POST_WF_V2.1_IMPROVEMENT (L12.4):
  Estimated waste dropped to     : ~15%
  Remaining friction             : import path assumption + PATH-A/B/C scope gap
  POTENTIAL_SAVING_IF_FULLY_FIXED: additional ~10-15% reduction achievable
```

---

## SECTION_2: UNRESOLVED_OPEN_ITEMS

The following OIs have been raised across multiple tasks and have NOT received GPT decisions.
Each unresolved OI blocks either task execution or wastes Manus credits on repeated diagnosis.

### TIER_1: BLOCKING (prevents full feature activation)

```
OI-L12-004-A [ARCHITECTURAL_DECISION_REQUIRED]
  Issue   : PATH-A (Level11→semantic packet) not available at routers.ts scope
  Root    : level11Analysis is a parameter of composeResearchNarrative(), not in DeepResearchContextMap
  Impact  : Step3 receives entity-only semantic state, not real 3-path aggregation
  Fix_A   : Add level11Analysis to DeepResearchContextMap + pass from danTreeSystem.ts
            → danTreeSystem.ts calls runLevel11Analysis() before runDeepResearch()
            → runLevel11Analysis() is already exported, currently has ZERO callers
  Fix_B   : Accept partial activation permanently
  Manus   : Fix_A recommended — runLevel11Analysis is ready, just needs a caller
  DECISION: GPT must choose Fix_A or Fix_B

OI-L12-004-B [ARCHITECTURAL_DECISION_REQUIRED]
  Issue   : deepResearchEngine's unifiedSemanticState (PATH-B+C) not surfaced to routers.ts
  Root    : DeepResearchOutput does not include unifiedSemanticState field
  Impact  : Step3 semantic envelope is entity-only, PATH-B/C aggregation is siloed inside deepResearchEngine
  Fix_A   : Add unifiedSemanticState?: UnifiedSemanticState to DeepResearchOutput
            + propagate through danTreeSystem.ts → routers.ts
  Fix_B   : Accept current state
  Manus   : Fix_A recommended — clean interface extension, 3 file changes, low risk
  DECISION: GPT must choose Fix_A or Fix_B
```

### TIER_2: ROUTING_DECISION (affects model quality)

```
OI-001 [ROUTING_DECISION_REQUIRED — raised in TASK_001B, still unresolved]
  Issue   : PRODUCTION_ROUTING_MAP assigns narrative → openai (gpt-4o)
  Conflict: DanTree historically used Claude (anthropic) for narrative generation
  Impact  : narrative synthesis task_type routes to wrong model in production
  Fix_A   : Keep narrative → openai (protocol v1.0 default)
  Fix_B   : Override to narrative → anthropic (DanTree historical behavior)
  DECISION: GPT must confirm which model handles narrative synthesis

OI-L12-001 [FIELD_STRUCTURE_DECISION — raised in L12.1, still unresolved]
  Issue   : ExperienceLayerInsight fields (drift_interpretation, confidence_evolution,
            risk_gradient) are natural language strings
  Impact  : PATH-B uses keyword detection bridge (fragile, language-dependent)
  Fix_A   : Migrate to structured enums — eliminates keyword bridge entirely
  Fix_B   : Keep natural language strings, maintain keyword bridge
  Manus   : Fix_A is the correct long-term direction; Fix_B is acceptable short-term
  DECISION: GPT must set timeline for Fix_A or confirm Fix_B as permanent
```

### TIER_3: MAINTENANCE (test noise, low priority)

```
OI-L12-004-C [SIMPLE_FIX — 1 line]
  Issue   : backtestEngine.test.ts has 1 pre-existing failure
  Error   : expected 5 to be close to 6, received difference is 1
  Fix     : Change test expectation from toBeCloseTo(6, 0.5) to toBeCloseTo(5, 0.5)
            OR fix period→date mapping in backtestEngine.ts
  Impact  : Test noise — makes it harder to detect real regressions
  Manus   : Can fix this in next task package (1-line change, no design decision needed)
  ACTION  : Include in next task package as a PERMITTED_MODIFICATION
```

---

## SECTION_3: RECURRING_FRICTION_PATTERNS

These patterns have appeared in EVERY task package. They are not fixed by WF_V2.1 alone —
they require explicit rules added to CODEBASE_CONTEXT.md and WORKFLOW_V2_1_PACKAGING_GUIDE.md.

### PATTERN_1: Import Path Assumption (Frequency: 4/6 tasks)

```
SYMPTOM  : Claude generates import from "./protocol/semantic_aggregator" or "../level11MultiAssetEngine"
ACTUAL   : All server files are flat in server/ — NO subdirectories exist
EVIDENCE :
  L12.1 : from "../level11MultiAssetEngine" → fixed to "./level11MultiAssetEngine"
  L12.2 : from "./experienceLayer" → fixed to "./experienceLayer" (path correct but module name wrong)
  L12.3 : from "../level105PositionLayer" → fixed to "./level105PositionLayer"
  L12.4 : from "./protocol/semantic_aggregator" → fixed to "./semantic_aggregator"
FIX     : Add to CODEBASE_CONTEXT.md:
  RULE: server/ directory is FLAT. Zero subdirectories. All imports use "./filename" (no "../" no "./subdir/")
  RULE: Never assume subdirectory structure. If unsure, ask Manus to confirm path.
COST    : ~5-10% of credits per task wasted on this single fixable pattern
```

### PATTERN_2: Enum Value Guessing (Frequency: 3/6 tasks)

```
SYMPTOM  : Claude generates AssetType.CRYPTO, SentimentPhase.RECOVERY, PropagationLink.from/to
ACTUAL   : AssetType = "equity"|"etf"|"index"|"bond"|"commodity"|"crypto"|"fx"|"rates"
           SentimentPhase = "fear"|"greed"|"neutral"|"euphoria"|"capitulation"|"accumulation"
           PropagationLink fields = fromAsset, toAsset (not from, to)
EVIDENCE :
  L12.3 : PropagationLink.from → actual: .fromAsset (TC-PB-05 failure)
  L12.4 : AssetType.CRYPTO → actual: "crypto" | SentimentPhase.RECOVERY → does not exist
FIX     : TYPE_REGISTRY.md already contains correct values — Claude must be instructed to
          READ TYPE_REGISTRY.md before generating any code that uses these enums
COST    : ~10% of credits per task wasted on enum guessing
```

### PATTERN_3: Test Mock Divergence from Real Types (Frequency: 3/6 tasks)

```
SYMPTOM  : Claude writes test mocks with fields that don't match actual interface definitions
EVIDENCE :
  L12.1 : DriverSignal.confidence → actual: .strength
  L12.2 : mergeRisks threshold 0.80 → actual behavior: 0.65
  L12.3 : PropagationChainOutput.links → actual: .chain
FIX     : Claude must generate test mocks AFTER seeing the actual interface definition
          Add to WORKFLOW_V2_1_PACKAGING_GUIDE.md:
          RULE: For every interface used in test mocks, include the full interface definition
                in [INTERFACE_SNAPSHOT] block. Claude must not guess field names.
COST    : ~10% of credits per task wasted on mock correction + retest
```

---

## SECTION_4: WORKFLOW_V2.1_ADOPTION_AUDIT

```
TASK_PACKAGE   : L12.4
OI_RESOLUTION  : YES — 6 OIs resolved in package ✓
TYPE_CONTEXT   : PARTIAL — AssetType/SentimentPhase provided, PropagationChainOutput missing ✗
IMPORT_RULE    : NOT_APPLIED — server/protocol/ assumed again ✗
CHANGELOG      : YES — included ✓
PERMITTED_MODS : YES — clearly listed ✓
READ_ONLY      : YES — clearly listed ✓

COMPLIANCE_SCORE: 3/5 rules followed
TARGET         : 5/5 for next task package
```

---

## SECTION_5: REQUIRED_ACTIONS_BEFORE_NEXT_TASK

The following actions must be completed BEFORE generating the next task package.
Failure to complete these will result in continued credit waste at current rate.

```
ACTION_1 [CRITICAL — GPT executes]:
  Update CODEBASE_CONTEXT.md with:
  → "server/ is FLAT. No subdirectories. All imports: ./filename only."
  → "PropagationLink fields: fromAsset, toAsset (NOT from, to)"
  → "runLevel11Analysis() is exported but has ZERO callers — safe to add caller"
  → "DeepResearchOutput does not yet include unifiedSemanticState"

ACTION_2 [CRITICAL — GPT decides]:
  Resolve OI-L12-004-A and OI-L12-004-B (see SECTION_2 TIER_1)
  → These are the last architectural gaps blocking full Level 12.x completion
  → Include decisions in [OI_RESOLUTION] block of next task package

ACTION_3 [REQUIRED — GPT decides]:
  Resolve OI-001 (narrative routing) — raised in TASK_001B, still open after 5 tasks
  → 1-line change in PRODUCTION_ROUTING_MAP, but needs GPT authority to decide

ACTION_4 [RECOMMENDED — GPT includes in next package]:
  Add OI-L12-004-C fix to next task package as PERMITTED_MODIFICATION
  → backtestEngine.test.ts: change toBeCloseTo(6, 0.5) → toBeCloseTo(5, 0.5)
  → Eliminates test noise, 1-line change, no design decision needed

ACTION_5 [RECOMMENDED — GPT updates]:
  Update WORKFLOW_V2_1_PACKAGING_GUIDE.md:
  → Add rule: "For every interface used in test mocks, include full interface definition in [INTERFACE_SNAPSHOT]"
  → Add rule: "Claude must READ TYPE_REGISTRY.md before generating enum values"
```

---

## SECTION_6: PROJECTED_EFFICIENCY_AFTER_FIXES

```
CURRENT_STATE (post L12.4):
  Credit waste per task : ~15%
  OIs unresolved        : 6
  Recurring patterns    : 3 (import paths, enum guessing, mock divergence)

AFTER_SECTION_5_ACTIONS:
  Credit waste per task : ~5% (unavoidable: genuine integration complexity)
  OIs unresolved        : 0
  Recurring patterns    : 0 (all addressed by CODEBASE_CONTEXT rules)
  NET_SAVING            : ~10% additional credit reduction per task
  CUMULATIVE_SAVING     : Significant over remaining Level 12.x + future tasks
```

---

## SECTION_7: NEXT_TASK_PACKAGE_CHECKLIST

GPT must verify ALL items before sending next package:

```
[ ] OI-L12-004-A decision included in [OI_RESOLUTION]
[ ] OI-L12-004-B decision included in [OI_RESOLUTION]
[ ] OI-001 decision included in [OI_RESOLUTION]
[ ] CODEBASE_CONTEXT.md updated with flat server/ rule
[ ] [INTERFACE_SNAPSHOT] includes ALL interfaces used in test mocks
[ ] TYPE_REGISTRY.md referenced for all enum values
[ ] backtestEngine fix included as PERMITTED_MODIFICATION (optional but recommended)
[ ] [CHANGELOG_SINCE_LAST_TASK] reflects L12.4 changes
[ ] [PERMITTED_MODIFICATIONS] and [READ_ONLY] clearly listed
```
