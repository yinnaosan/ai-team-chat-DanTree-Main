# DANTREE OI_RESOLUTION_TEMPLATE
**Version:** 2.1 | **Purpose:** Explicit open-item resolution before new task work begins.
**Rule:** Every task package MUST include an `[OI_RESOLUTION]` block. No exceptions.

---

## STATUS DEFINITIONS

```
RESOLVED  → Decision made, implementation complete or explicitly delegated
DEFERRED  → Decision postponed to a future task (must specify which task)
EXCLUDED  → Out of scope permanently (must specify reason)
PENDING   → Awaiting GPT decision (blocks downstream work)
```

---

## FORMAT (copy into task packages)

```
[OI_RESOLUTION]
OI-{ID} = {STATUS} | {OPTION_CHOSEN or REASON} | {IMPACT}

Examples:
OI-L12-001 = RESOLVED | OPTION_A | ExperienceLayer fields remain natural language strings; keyword bridge retained
OI-L12-002 = RESOLVED | OPTION_B | User-facing synthesis remains natural language; machine layer advisory_only
OI-L12-003-A = DEFERRED | LEVEL12.4 | level11Analysis ctx extension deferred; PATH-A aggregation incomplete
OI-L12-003-B = PENDING | GPT_DECISION_REQUIRED | __unifiedSemanticState attachment blocks Step3 injection
[/OI_RESOLUTION]
```

---

## CURRENT OPEN ITEMS (as of 2026-03-31)

| OI ID | Status | Description | Blocking |
|-------|--------|-------------|---------|
| OI-L12-001 | PENDING | ExperienceLayerInsight fields: keep natural language strings vs migrate to enums | PATH-B keyword bridge |
| OI-L12-002-A | PENDING | narrative task type routing: Claude vs OpenAI | PRODUCTION_ROUTING_MAP |
| OI-L12-002-B | PENDING | User-facing synthesis: machine-native vs natural language | synthesisController |
| OI-L12-003-A | PENDING | Add level11Analysis to DeepResearchContextMap for full PATH-A | PATH-A aggregation |
| OI-L12-003-B | PENDING | Attach __unifiedSemanticState to multiAgentResult in danTreeSystem.ts | Step3 injection |
| OI-001-B | PENDING | rpa.ts callOpenAI migration to modelRouter.generate() | Task #001-D |

---

## RESOLUTION PROTOCOL

```
WHEN: At the start of every new task package
WHO: GPT resolves all PENDING items before issuing new work
HOW: Include [OI_RESOLUTION] block in task package header
MANUS: Will not start implementation until OI_RESOLUTION block is present
```

---

## EXAMPLE — COMPLETE TASK PACKAGE HEADER

```
[OI_RESOLUTION]
OI-L12-003-A = RESOLVED | OPTION_A | Add level11Analysis to DeepResearchContextMap
OI-L12-003-B = RESOLVED | IMPLEMENT | Attach __unifiedSemanticState in danTreeSystem.ts
OI-L12-001   = DEFERRED | LEVEL12.5 | Natural language strings acceptable for now
[/OI_RESOLUTION]

[TASK]
...new work begins here...
```
