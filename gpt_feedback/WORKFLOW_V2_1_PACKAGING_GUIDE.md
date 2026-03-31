# WORKFLOW V2.1 PACKAGING GUIDE
**Version:** 2.1 (post-Level12.6, OI-L12-007)  
**Maintained by:** GPT Architecture  
**Purpose:** Standard for assembling Claude and Manus task packages

---

## MANDATORY BLOCK ORDER (Claude ZIP)

```
[TASK]
[CODEBASE_CONTEXT]
[INTERFACE_SNAPSHOT]
[TYPE_REGISTRY_EXCERPT]
[OI_RESOLUTION]
[TEST_POLICY]
[PERMITTED_MODIFICATIONS]
[READ_ONLY]
[CHANGELOG_SINCE_LAST_TASK]
[DELIVERABLES]
[OUTPUT_REQUIRED]
[FAIL_CONDITIONS]
```

---

## MANDATORY BLOCK ORDER (Manus ZIP)

```
[TASK]
[INTEGRATION_SCOPE]
[READ_ONLY]
[CHANGELOG_SINCE_LAST_TASK]
[OI_RESOLUTION]
[TEST_POLICY]
[PERMITTED_MODIFICATIONS]
[OUTPUT_REQUIRED]
[FAIL_CONDITIONS]
```

---

## SHORT TYPE PACK RULE (OI-L12-007)

**Include `TEST_MOCK_TYPE_PACK.md` (or paste its contents as `[TYPE_MOCK_PACK]`) in lightweight Claude packages when ANY of the following is true:**

1. The task writes or modifies tests that mock `Level11AnalysisOutput`
2. The task writes or modifies tests that mock `SemanticTransportPacket` or `UnifiedSemanticState`
3. The task touches `PropagationLink`, `IncentiveAnalysisOutput`, `AssetType`, or `SentimentPhase`

**Rationale:** These types have historically caused repeated mock-field guessing failures, TSC repair rounds, and Manus integration rework. Including the pack eliminates the root cause.

**Pack location:** `gpt_feedback/TEST_MOCK_TYPE_PACK.md`

**Example block for lightweight packages:**

```
[TYPE_MOCK_PACK]
(paste contents of TEST_MOCK_TYPE_PACK.md here — only the sections needed)
[/TYPE_MOCK_PACK]
```

---

## ANTI-SUBDIRECTORY RULE

All task packages must enforce:

```
server/ is FLAT for import purposes.
NO subdirectories in import paths.
CORRECT:   import { X } from "./semantic_aggregator"
FORBIDDEN: import { X } from "./protocol/semantic_aggregator"
FORBIDDEN: import { X } from "../semantic_aggregator"
```

This rule applies even though `server/protocol/` physically exists. The tsconfig handles resolution; task packages must not expose subdirectory paths to Claude or Manus.

---

## FULL INTERFACE SNAPSHOTS FOR TEST MOCKS

When a task package includes tests that construct mock objects, the `[INTERFACE_SNAPSHOT]` block must include **complete interface definitions** — not just the fields that seem relevant.

**Why:** Claude and Manus cannot detect omitted required fields unless the full interface is visible.

**Rule:** If a mock touches `Level11AnalysisOutput`, include:
- `Level11AnalysisOutput` (full)
- `IncentiveAnalysisOutput` (full, from `TEST_MOCK_TYPE_PACK.md`)
- `AssetType` (full enum)
- `SentimentPhase` (full enum)
- `PrimaryDriverType` (full enum)
- `DriverFramework` (full enum)

---

## ENUM ASSERTION POLICY

```
Use >= N  (NOT === N) for enum count assertions unless explicitly frozen.
```

Example:
```ts
// CORRECT
expect(Object.keys(TASK_TYPES).length).toBeGreaterThanOrEqual(14);

// WRONG — breaks when new task type is added
expect(Object.keys(TASK_TYPES).length).toBe(14);
```

Exception: Only use `===` when `[CHANGELOG]` explicitly marks a count as frozen.

---

## IMPL + TEST SAME PASS RULE

Implementation and tests must be generated in a single pass using the same interface context.

**Why:** Generating implementation first, then tests separately, is the primary cause of test/impl drift and field-name mismatches.

---

## CHANGELOG REQUIREMENTS

Every task package must include `[CHANGELOG_SINCE_LAST_TASK]` with:

- `ADDED_FILES`: new files
- `MODIFIED_FILES`: changed files and what changed
- `INTERFACE_CHANGES`: any interface additions/modifications
- `ENUM_ADDITIONS`: any new enum values
- `DEPRECATED`: deprecated functions/patterns
- `PIPELINE_STATUS_CHANGES`: path/step activation changes

If nothing changed in a category, write `NONE`.

---

## TYPE_CONTEXT_REQUEST FORMAT

When Claude lacks required interface context, it must emit:

```
[TYPE_CONTEXT_REQUEST]
REQUIRED_INTERFACES:
- <InterfaceName> from <server/path/to/file.ts>
REQUIRED_ENUMS:
- <EnumName> from <server/path/to/file.ts>
REQUIRED_FUNCTION_SIGNATURES:
- <functionName>() from <server/path/to/file.ts>
REASON:
- <specific field/method needed and why>
[/TYPE_CONTEXT_REQUEST]
```

Claude must halt code generation until the request is fulfilled. It may write scaffolding (file structure, comments, non-typed helpers) while waiting.
