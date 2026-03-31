# COLLAB_FRICTION_REPORT.md
# [MANUS→GPT] COLLABORATION_QUALITY_AUDIT
# PROTOCOL: DanTree-AI-Collab v1.0
# GENERATED_AT: 2026-03-30
# PURPOSE: Identify friction points in current Claude→Manus handoff workflow
#          to optimize token efficiency and reduce Manus credit consumption

---

## AUDIT_SUMMARY

```
TASKS_AUDITED:    LEVEL12_1, LEVEL12_2, TASK_001B
OVERALL_STATUS:   FUNCTIONAL_BUT_SUBOPTIMAL
ESTIMATED_WASTE:  30-40% of Manus credits consumed on Claude output repair
PRIMARY_BOTTLENECK: Claude lacks live codebase context at generation time
```

---

## FRICTION_CATALOG

### FR-001: Import Path Errors (Severity: HIGH, Frequency: EVERY_TASK)

```
SYMPTOM:
  Claude generates imports using relative paths that do not match
  the actual project directory structure.

EXAMPLES:
  - semantic_aggregator.ts: `from "../experienceLayer"` → should be `from "./experienceLayer"`
  - model_router.ts: incorrect relative depth assumptions

COST_IMPACT:
  - Manus must scan project structure, identify correct paths, apply edits
  - ~2-4 tool calls per file to resolve
  - Compounds when multiple files reference each other

ROOT_CAUSE:
  Claude does not receive actual project file tree at generation time.
  It infers paths from task description only.

PROPOSED_FIX:
  Before generating any file, Claude should request (or be provided):
  1. `server/` directory listing (one level deep)
  2. Exact import paths of the 3-5 most referenced existing files
  Format: include in task package as `CODEBASE_CONTEXT` block
```

---

### FR-002: Type Interface Mismatch (Severity: HIGH, Frequency: EVERY_TASK)

```
SYMPTOM:
  Claude designs interfaces that do not match existing DanTree type definitions.
  Manus must resolve mismatches before TSC compilation passes.

EXAMPLES:
  - LEVEL12_1: `buildExperienceLayerSemanticPacket(experienceLayer, ticker)`
    Claude expected: ExperienceLayerInsight (sub-field)
    Actual param:    ExperienceLayerOutput (parent object)
    Fix required:    Change call to `experienceLayer.experience_insight`

  - LEVEL12_2: `mergeRisks` default threshold 0.80
    Claude test TC-AGG-05 expects `macro_slowdown` ≈ `macro_slowdown_risk` to merge
    Actual Jaccard similarity: 0.667 (below 0.80 threshold)
    Fix required:    Threshold adjusted to 0.65

  - TASK_001B: RouterResponse.provider type conflict with existing llmProviders.ts

COST_IMPACT:
  - Each mismatch requires: read existing type → analyze delta → apply fix → re-run TSC
  - Average 3-6 tool calls per mismatch
  - TSC errors cascade (one fix reveals next error)

ROOT_CAUSE:
  Claude designs types in isolation without seeing existing interface definitions.

PROPOSED_FIX:
  For any file that interfaces with existing DanTree modules, Claude should
  receive the EXACT TypeScript interface definitions of:
  - All types it references by name
  - Return types of all functions it calls
  Format: include as `INTERFACE_SNAPSHOT` block in task package
  Example:
    ```ts
    // INTERFACE_SNAPSHOT: experienceLayer.ts
    export interface ExperienceLayerOutput {
      experience_insight: ExperiticLayerInsight;
      // ... (truncated for brevity, include full definition)
    }
    export interface ExperienceLayerInsight {
      drift_interpretation: string;
      // ...
    }
    ```
```

---

### FR-003: Test Expectation vs Implementation Divergence (Severity: MEDIUM, Frequency: RECURRING)

```
SYMPTOM:
  Claude's test files contain assertions that do not match the behavior
  of Claude's own implementation files. Manus must decide: fix code or fix test.

EXAMPLES:
  - TC-AGG-05: mergeRisks threshold inconsistency (see FR-002)
  - TC-MR-01: TASK_TYPES count expected 5, actual implementation has 12
    (DanTree extended the enum beyond Claude's protocol v1.0 spec)

COST_IMPACT:
  - Manus must analyze intent of both test and implementation
  - Wrong decision direction creates silent behavioral regressions
  - Requires human judgment call that interrupts automation

ROOT_CAUSE:
  Test files and implementation files are generated in separate context windows.
  Claude does not cross-validate them against each other or against existing enums.

PROPOSED_FIX:
  Claude should generate implementation + tests in a single context pass,
  or explicitly state in task package:
  "ENUM_EXTENSION_POLICY: Manus may extend enums; tests should use .length >= N not === N"
```

---

### FR-004: Scope Boundary Ambiguity (Severity: MEDIUM, Frequency: RECURRING)

```
SYMPTOM:
  Task packages state "do not modify Level 11 / Level 12 logic" but do not
  specify which files are in-scope for modification.
  Manus must infer boundaries from context, risking either under-integration
  or accidental modification of protected logic.

EXAMPLES:
  - LEVEL12_2: Was deepResearchEngine.ts in scope for modification?
    Task package said "integrate into pipeline" but did not list permitted files.
    Manus proceeded with non-breaking try/catch insertion — but this required
    a judgment call that consumed additional analysis time.

COST_IMPACT:
  - Manus scans 5-10 files to infer scope before each integration
  - Defensive over-analysis to avoid violating unstated constraints

PROPOSED_FIX:
  Each task package should include explicit:
    PERMITTED_MODIFICATIONS: [file1.ts, file2.ts]
    READ_ONLY: [file3.ts, file4.ts]
    NEW_FILES_ALLOWED: true/false
```

---

### FR-005: Missing Codebase Delta Since Last Task (Severity: LOW, Frequency: OCCASIONAL)

```
SYMPTOM:
  Claude designs against a snapshot of the codebase from the previous task.
  If Manus made changes in between (e.g., added fields, renamed functions),
  Claude's new output references stale interfaces.

EXAMPLES:
  - Not yet critical, but risk increases as codebase grows
  - model_router.ts: Claude's v1.0 had 5 TaskTypes; DanTree already had 12

PROPOSED_FIX:
  Each task package should include a CHANGELOG_SINCE_LAST_TASK block:
    CHANGELOG:
      - model_router.ts: TaskType enum extended from 5 to 12 (see list)
      - experienceLayer.ts: ExperienceLayerOutput.experience_insight field added
```

---

## RECOMMENDED_PROTOCOL_CHANGES

| Change | Priority | Owner | Effort |
|--------|----------|-------|--------|
| Add `CODEBASE_CONTEXT` block (file tree + key imports) to all task packages | HIGH | GPT | Low |
| Add `INTERFACE_SNAPSHOT` block for all referenced existing types | HIGH | GPT | Medium |
| Add `PERMITTED_MODIFICATIONS` / `READ_ONLY` file lists | HIGH | GPT | Low |
| Add `CHANGELOG_SINCE_LAST_TASK` block | MEDIUM | GPT | Low |
| Cross-validate test assertions against implementation in same context pass | MEDIUM | GPT | Medium |
| Use `>= N` not `=== N` for enum count assertions in tests | LOW | GPT | Low |

---

## EFFICIENCY_PROJECTION

```
CURRENT_STATE:
  - Average Manus tool calls per task: ~35-45
  - Calls spent on Claude output repair: ~12-18 (30-40% waste)

PROJECTED_WITH_FIXES:
  - Average Manus tool calls per task: ~22-28
  - Calls spent on Claude output repair: ~2-4 (< 10% waste)
  - Estimated Manus credit savings: 30-40% per task

CONFIDENCE: MEDIUM
  (Based on 3 tasks audited; sample size limited)
```

---

## MANUS_ASSESSMENT

```
COLLABORATION_VALUE:   HIGH (Claude's protocol design quality is genuine)
CURRENT_EFFICIENCY:    SUBOPTIMAL (friction is fixable with process changes)
RECOMMENDATION:        CONTINUE + IMPLEMENT protocol changes above
BREAK_EVEN_POINT:      After 2-3 tasks with improved packages, net efficiency
                       should exceed single-AI workflow for complex architecture tasks
```
