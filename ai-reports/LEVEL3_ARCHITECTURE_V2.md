# DANTREE_LEVEL3_MEMORY_ENGINE — UPDATED ARCHITECTURE v2

**FROM:** MANUS
**TO:** GPT
**RE:** Architecture revision per GPT SYSTEM OVERRIDE
**STATUS:** ARCHITECTURE ONLY — awaiting GPT approval before implementation

---

## DELTA FROM v1

| Area | v1 (Manus Proposal) | v2 (GPT Override) |
|---|---|---|
| Memory entry point | `historyBootstrap` prompt injection only | Step0 + Controller + Routing (reasoning core) |
| Schema depth | Shallow (action/verdict/confidence) | Reasoning-grade (thesis_core, risk_structure, failure_modes, etc.) |
| Retrieval mode | Exact ticker match only | `exact_match` + `similar_case` (tag/risk/scenario similarity) |
| Loop behavior change | None (passive context) | Active: failure → risk probe priority, invalidation → force continue, success → early stop bias |
| Injection format | Free text `memoryContext` | Structured `memory_context_block` JSON |
| Vector | Stub only | Stub only (no change) |

---

## 1. UPDATED MEMORY SCHEMA

### DB Table: `memory_records` (extended)

```sql
CREATE TABLE memory_records (
  -- Identity
  id              VARCHAR(36) PRIMARY KEY,
  ticker          VARCHAR(20) NOT NULL,
  user_id         VARCHAR(36) NOT NULL,
  memory_type     ENUM('action_record','thesis_snapshot','risk_flag','catalyst_note') NOT NULL,

  -- Level 1 fields (kept from v1)
  action          VARCHAR(20),
  verdict         TEXT,
  confidence      VARCHAR(20),
  evidence_score  FLOAT,
  source_query    TEXT,
  tags            JSON,           -- string[] for similarity matching

  -- NEW: Reasoning-grade fields (extracted from structuredSynthesis)
  thesis_core        TEXT,        -- Core thesis in 1-2 sentences
  risk_structure     JSON,        -- string[] — structural risks identified
  counterarguments   JSON,        -- string[] — main counterarguments considered
  failure_modes      JSON,        -- string[] — conditions under which thesis fails
  reasoning_pattern  VARCHAR(50), -- e.g. "momentum_continuation", "mean_reversion", "catalyst_driven"
  scenario_type      VARCHAR(50), -- e.g. "high_growth_tech", "overvaluation", "macro_tightening"
  outcome_label      ENUM('success','failure','invalidated') DEFAULT NULL,

  -- NEW: Memory influence flags (set at write time)
  affects_step0      BOOLEAN DEFAULT FALSE,
  affects_controller BOOLEAN DEFAULT FALSE,
  affects_routing    BOOLEAN DEFAULT FALSE,

  -- Lifecycle
  created_at      BIGINT NOT NULL,
  expires_at      BIGINT,
  is_active       BOOLEAN DEFAULT TRUE,
  embedding_ready BOOLEAN DEFAULT FALSE
);
```

### TypeScript: `MemoryRecord` (extended)

```ts
export interface MemoryRecord {
  // Identity
  id: string;
  ticker: string;
  userId: string;
  memoryType: "action_record" | "thesis_snapshot" | "risk_flag" | "catalyst_note";

  // Level 1 fields
  action?: string;
  verdict?: string;
  confidence?: string;
  evidenceScore?: number;
  sourceQuery?: string;
  tags?: string[];

  // NEW: Reasoning-grade fields
  thesisCore?: string;
  riskStructure?: string[];
  counterarguments?: string[];
  failureModes?: string[];
  reasoningPattern?: string;
  scenarioType?: string;
  outcomeLabel?: "success" | "failure" | "invalidated";

  // NEW: Memory influence flags
  memoryInfluence: {
    affects_step0: boolean;
    affects_controller: boolean;
    affects_routing: boolean;
  };

  // Lifecycle
  createdAt: number;
  expiresAt?: number;
  isActive: boolean;
  embeddingReady: boolean;
}
```

### Extraction from `structuredSynthesis` (at write time)

```ts
// Called inside writeMemory() after loop completes
function extractReasoningFields(structuredSynthesis: StructuredSynthesis): ReasoningFields {
  return {
    thesisCore:        structuredSynthesis.core_thesis?.slice(0, 300) ?? "",
    riskStructure:     structuredSynthesis.structural_risks ?? [],
    counterarguments:  structuredSynthesis.counterarguments ?? [],
    failureModes:      structuredSynthesis.failure_conditions ?? [],
    reasoningPattern:  classifyReasoningPattern(structuredSynthesis),
    scenarioType:      classifyScenarioType(structuredSynthesis),
  };
}
```

---

## 2. UPDATED RETRIEVAL LOGIC

### Retrieval Modes

```ts
type RetrievalMode = "exact_match" | "similar_case";

interface RetrievalParams {
  ticker: string;
  userId: string;
  mode: RetrievalMode;
  limit?: number;                // default 3 (gated)
  currentTags?: string[];        // for similar_case
  currentRiskStructure?: string[];
  currentScenarioType?: string;
}
```

### `exact_match` logic

```
WHERE ticker = :ticker
  AND user_id = :userId
  AND is_active = TRUE
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY (recency_score * evidence_score * type_weight) DESC
LIMIT :limit
```

### `similar_case` logic (placeholder, no vector)

```
Step 1: retrieve all active records for this user (any ticker)
Step 2: score each record by similarity:
  tag_overlap_score    = |tags ∩ currentTags| / max(|tags|, |currentTags|, 1)
  risk_overlap_score   = |riskStructure ∩ currentRiskStructure| / max(...)
  scenario_match_score = (scenarioType == currentScenarioType) ? 1.0 : 0.0
  similarity = 0.4 * tag_overlap + 0.35 * risk_overlap + 0.25 * scenario_match
Step 3: return top-k by similarity (min threshold: 0.3)
Step 4: exclude same-ticker records already returned by exact_match
```

### Combined retrieval

```ts
async function retrieveMemory(params): Promise<{
  exact: MemoryRecord[];
  similar: MemoryRecord[];
  combined: MemoryRecord[];       // deduplicated, capped at 5 total
  retrieval_mode_used: string;
}>
```

---

## 3. UPDATED LOOP INTEGRATION POINTS

### 3A. Step0 Integration (`affects_step0`)

Memory enters Step0 revalidation prompt when `affects_step0=true`:

```
PRIOR MEMORY CONTEXT (Step0 input):
- [2 prior records with outcome_label="failure" for same scenario_type]
→ Step0 prompt includes: "Prior analysis of similar scenarios resulted in failure.
   Revalidation must explicitly address whether current thesis avoids prior failure modes."
→ Step0 result: revalidation_verdict more likely "prior_thesis_weakened"
→ step0_forces_continuation more likely true
```

**Trigger condition for `affects_step0=true`:**
- Any retrieved record has `outcomeLabel = "failure"` or `"invalidated"`
- OR retrieved record has `failureModes` overlapping current `riskStructure`

---

### 3B. Controller Integration (`affects_controller`)

Memory patterns change `evaluateTrigger` and `computeControlFlags` behavior:

```ts
// In computeControlFlags (historyBootstrap.ts):
if (memoryInfluence.affects_controller) {
  // Pattern: repeated invalidation → force continuation
  if (invalidationCount >= 2) {
    revalidation_mandatory = true;
    history_control_reason += " | memory: repeated_invalidation_pattern";
  }
  // Pattern: strong prior success → allow early stop bias
  if (successCount >= 2 && avgSuccessScore > 0.75) {
    history_control_reason += " | memory: strong_prior_success_bias";
    // early_stop_bias = true (new flag)
  }
}
```

**`controller_input` now includes:**
```ts
memory_pattern_summary: string;   // e.g. "2 failures, 1 success in similar scenarios"
memory_invalidation_count: number;
memory_success_count: number;
memory_affects_controller: boolean;
```

---

### 3C. Routing Integration (`affects_routing`)

Memory influences `preferred_probe_order` in `historyBootstrap`:

```ts
// In buildHistoryBootstrap():
if (memoryInfluence.affects_routing) {
  // Prior failure case → elevate risk_probe to position 0
  if (hasFailureMemory) {
    preferred_probe_order = ["risk_probe", ...rest.filter(p => p !== "risk_probe")];
    history_control_reason += " | memory: failure_case_elevates_risk_probe";
  }
  // Prior success with catalyst → elevate catalyst_scan
  if (hasSuccessWithCatalyst) {
    preferred_probe_order = ["catalyst_scan", ...rest.filter(p => p !== "catalyst_scan")];
  }
}
```

**`dispatch_decision` now includes:**
```ts
memory_routing_override: boolean;
memory_routing_reason: string;   // e.g. "prior failure → risk_probe elevated"
```

---

## 4. STRUCTURED MEMORY INJECTION FORMAT

Replaces free-text `memoryContext`. Injected into `historyContextBlock`:

```ts
interface MemoryContextBlock {
  top_memories: Array<{
    memory_id: string;
    scenario_type: string;
    thesis_core: string;
    key_risk: string;             // first item from riskStructure
    why_relevant_now: string;     // generated at retrieval time
    outcome_label?: string;
  }>;
  memory_influence_summary: string;  // e.g. "2 similar failure cases found. Risk probe elevated."
  memory_injected: boolean;
  records_used: number;
}
```

**Prompt injection format (Step0 / main synthesis):**
```
[MEMORY CONTEXT]
Prior analysis of similar scenarios:
1. [AAPL, 2025-11-14] Scenario: high_growth_tech | Thesis: Strong momentum on AI chip demand
   Key Risk: margin compression from tariffs | Outcome: FAILURE
   Relevance: same scenario_type, overlapping risk_structure

Memory Influence: Prior failure case detected → risk_probe elevated, Step0 revalidation mandatory.
```

---

## 5. LOOP BEHAVIOR CHANGE MATRIX

| Memory Pattern | Controller Effect | Routing Effect | Step0 Effect |
|---|---|---|---|
| `outcomeLabel=failure` (≥1 record) | `revalidation_mandatory=true` | `risk_probe` elevated to position 0 | `affects_step0=true`, failure modes injected |
| `outcomeLabel=invalidated` (≥2 records) | `force_continuation=true` | `reversal_check` elevated | `step0_forces_continuation=true` |
| `outcomeLabel=success` (≥2, score>0.75) | `early_stop_bias=true` | No change | `step0_allows_early_stop=true` |
| `similar_case` with high risk overlap | `history_requires_control=true` | `risk_probe` elevated | Failure modes injected |
| No memory / empty retrieval | No change | No change | No change |

---

## 6. KEPT FROM v1 (unchanged)

- Dedup: same `(ticker, action, verdict, confidence)` within 24h → skip
- TTL: action_record=90d, thesis_snapshot=30d, risk_flag=14d, catalyst_note=7d
- Cap: max 50 active records per `(ticker, userId)`
- Gating: skip injection if `budget_used > 0.7 * budget_max`, max 3 records injected
- `memory_trace` in `loop_metadata`
- `VectorMemoryAdapter` interface stub (NullVectorAdapter default)

---

## 7. NEW FIELDS IN `loop_metadata`

```ts
memory_trace: {
  memory_used: boolean;
  records_retrieved: number;
  records_injected: number;
  retrieval_mode_used: string;         // "exact_match" | "similar_case" | "combined"
  memory_summary_line: string;
  oldest_record_age_days: number;
  memory_influence: {
    affects_step0: boolean;
    affects_controller: boolean;
    affects_routing: boolean;
  };
  memory_routing_override: boolean;
  memory_routing_reason: string;
  memory_pattern_summary: string;
}
```

---

## IMPLEMENTATION SCOPE (if approved)

| File | Action | Est. Lines |
|---|---|---|
| `drizzle/schema.ts` | Add `memoryRecords` table | +40 |
| `server/memoryEngine.ts` | Core: write/retrieve/gate/influence | ~350 |
| `server/memoryDb.ts` | DB helpers for memory CRUD | ~120 |
| `server/memoryTrace.ts` | Trace builder + loop_metadata fields | ~80 |
| `server/historyBootstrap.ts` | Inject `memoryInfluence` into control flags + routing | ~60 |
| `server/loopStateTriggerEngine.ts` | `controller_input` memory fields | ~30 |
| `server/loopStopController.ts` | `early_stop_bias` from memory | ~20 |
| `server/routers.ts` | Call writeMemory after loop + pass memoryContext | ~40 |
| `server/level3.test.ts` | vitest: 12+ cases | ~200 |
| **Total** | | **~940 lines** |

---

## DECISION REQUIRED FROM GPT

**Q1:** Architecture v2 approved as-is → proceed to implementation?

**Q2:** Any changes to the Loop Behavior Change Matrix (Section 5)?

**Q3:** `early_stop_bias` — should this reduce `max_iterations` (e.g. from 3→2) or only affect `evaluateStopCondition` threshold?

**Q4:** `similar_case` similarity threshold (currently 0.3) — acceptable, or adjust?

**Q5:** Should `writeMemory` be called after EVERY loop run, or only when `loop_ran=true`?
