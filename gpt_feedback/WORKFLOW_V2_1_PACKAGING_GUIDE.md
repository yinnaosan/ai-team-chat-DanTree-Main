# DANTREE WORKFLOW V2.1 PACKAGING GUIDE
**Version:** 2.1 | **Effective from:** Task Level12.4+
**Purpose:** Mandatory structure for all future Claude and Manus task packages.

---

## CLAUDE ZIP — MANDATORY BLOCKS

Every ZIP sent to Claude MUST contain a file with these blocks in order:

```
[TASK]
Clear mission statement. One paragraph max.
What to build, what NOT to build, what protocol version to target.

[CODEBASE_CONTEXT]
Paste relevant sections from gpt_feedback/CODEBASE_CONTEXT.md
Include:
- Files relevant to this task and their roles
- Import path examples (correct patterns)
- Pipeline status relevant to this task

[INTERFACE_SNAPSHOT]
Paste EXACT TypeScript interface definitions from TYPE_REGISTRY.md
Include ALL fields of every interface Claude will reference.
DO NOT paraphrase. DO NOT omit fields.
Example:
  export interface PropagationLink {
    from: string;        // NOT from_asset
    to: string;          // NOT to_asset
    mechanism: string;
    lag: string;
    confidence: number;  // NOT correlation_strength
  }

[TYPE_REGISTRY_EXCERPT]
Paste EXACT enum/union type definitions from TYPE_REGISTRY.md
Include every enum Claude will use in assertions or switch statements.
Example:
  export type SemanticTaskType = ... (14 values)
  // NOTE: use >= 14 in count assertions, NOT === 14

[OI_RESOLUTION]
Resolve ALL pending OIs before new work begins.
Format: OI-{ID} = {STATUS} | {OPTION} | {IMPACT}
See OI_RESOLUTION_TEMPLATE.md for full format.

[TEST_POLICY]
- enum/count assertions: >= N (never === N unless explicitly frozen)
- impl and tests: same generation pass with same context
- TSC target: 0 new errors
- mock data: must use exact field names from INTERFACE_SNAPSHOT

[PERMITTED_MODIFICATIONS]
List every file Claude is allowed to create or modify.
Be explicit. No wildcards unless necessary.

[READ_ONLY]
List every file Claude must not modify.
Standard READ-ONLY list:
  server/level11MultiAssetEngine.ts
  server/experienceLayer.ts
  server/level105PositionLayer.ts
  server/deepResearchEngine.ts
  server/synthesisController.ts
  server/routers.ts (append-only exception)
  drizzle/schema.ts

[CHANGELOG_SINCE_LAST_TASK]
List all files added/modified since the previous task.
See CHANGELOG_SINCE_LAST_TASK_TEMPLATE.md for format.

[DELIVERABLES]
Numbered list of files to create/modify with descriptions.

[OUTPUT_REQUIRED]
What Claude must return as proof of completion.

[FAIL_CONDITIONS]
What would cause Manus to reject the output.
```

---

## MANUS ZIP — MANDATORY BLOCKS

Every ZIP sent to Manus MUST contain a file with these blocks:

```
[TASK]
What Manus must integrate. Reference Claude output files explicitly.

[INTEGRATION_SCOPE]
Which files to copy from Claude ZIP.
Which files to modify in the codebase.
Explicit list — no ambiguity.

[READ_ONLY]
Files Manus must not modify (same standard list as above).

[CHANGELOG_SINCE_LAST_TASK]
Same content as Claude ZIP — keeps Manus aware of what changed.

[OI_RESOLUTION]
Same content as Claude ZIP — Manus uses this to understand architectural decisions.

[TEST_POLICY]
- Run Claude's tests: pnpm test server/<new_file>.test.ts
- Run full regression: pnpm test
- TSC: npx tsc --noEmit
- Acceptable failures: list any known pre-existing failures

[PERMITTED_MODIFICATIONS]
Explicit list of files Manus can modify during integration.

[OUTPUT_REQUIRED]
What Manus must return (checkpoint version, test results, TSC status).

[FAIL_CONDITIONS]
What would cause the task to be rejected.
```

---

## CHECKLIST — BEFORE SENDING ANY TASK PACKAGE

### GPT checklist (before sending to Claude):
```
□ CODEBASE_CONTEXT included (from latest gpt_feedback/CODEBASE_CONTEXT.md)
□ INTERFACE_SNAPSHOT includes ALL interfaces Claude will reference
□ TYPE_REGISTRY_EXCERPT includes ALL enums Claude will use
□ OI_RESOLUTION resolves ALL pending OIs
□ CHANGELOG_SINCE_LAST_TASK is accurate
□ TEST_POLICY specifies >= N for count assertions
□ PERMITTED_MODIFICATIONS is explicit
□ READ_ONLY list is complete
```

### GPT checklist (before sending to Manus):
```
□ Claude output files are included in ZIP
□ INTEGRATION_SCOPE lists exact files to copy
□ OI_RESOLUTION is consistent with Claude package
□ CHANGELOG_SINCE_LAST_TASK is included
□ Known pre-existing test failures are listed in TEST_POLICY
```

---

## EFFICIENCY IMPACT ESTIMATE

| Protocol Version | Avg repair work per task | Credit waste |
|---|---|---|
| V1.0 (no context) | ~35% of task | HIGH |
| V2.1 (full context) | ~5-10% of task | LOW |

**Primary saving:** Claude generates correct field names on first pass → no scan/diagnose/fix/retest cycle.

---

## TYPE_REGISTRY REFRESH TRIGGERS

Refresh `gpt_feedback/TYPE_REGISTRY.md` after any task that:
1. Adds or modifies fields in a READ-ONLY interface
2. Adds new enum values to any registered type
3. Deprecates or renames a wrapper function
4. Adds a new protocol version (e.g., 12.3 → 12.4)
5. Changes `DeepResearchContextMap` structure

**Manus will update TYPE_REGISTRY as part of each task's deliverables when interfaces change.**
