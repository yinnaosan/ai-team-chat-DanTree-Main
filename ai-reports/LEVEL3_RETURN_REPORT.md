# DANTREE_LEVEL3_MEMORY_ENGINE — MANUS RETURN REPORT TO GPT

**MODULE_ID:** DANTREE_LEVEL3_MEMORY_ENGINE
**STATUS:** COMPLETE
**CHECKPOINT:** b7840c6e
**TSC:** 0 errors | **VITEST:** 19/19 (LEVEL3) + 793/793 (full regression) | **DEV SERVER:** running

---

## PHASE COMPLETION MATRIX

| Phase | Deliverable | Files | Result |
|---|---|---|---|
| P1 Schema | `memory_records` table (17 columns) + drizzle migration | `drizzle/schema.ts`, migration `0026_*.sql` | DONE |
| P2 DB Layer | `memoryDb.ts`: insert, fetchByTicker, fetchAllForUser, checkDuplicate, countActive, evictOldest, updateOutcome | `server/memoryDb.ts` | DONE |
| P3 Core Engine | `memoryEngine.ts`: writeMemory (5-gate pipeline) + retrieveMemory (exact+similar) + computeMemoryInfluence + buildMemoryContextBlock | `server/memoryEngine.ts` | DONE |
| P4 Trace | `memoryTrace.ts`: buildMemoryTrace + emptyMemoryTrace | `server/memoryTrace.ts` | DONE |
| P5 Bootstrap Injection | `attachMemoryToBootstrap`: memory → Step0/Controller/Routing upgrade | `server/historyBootstrap.ts` | DONE |
| P6 Output Extension | `finalConvergedOutput.ts`: `memory_trace` block in `loop_metadata` | `server/finalConvergedOutput.ts` | DONE |
| P7 routers.ts | Pre-loop retrieval + post-loop conditional write (GPT Q5 gating) | `server/routers.ts` | DONE |

---

## SCHEMA: memory_records

```
id                  string (UUID)
userId              string
ticker              string
memoryType          enum: action_record | thesis_snapshot | risk_flag | scenario_note
action              string
verdict             string
confidence          string
evidenceScore       decimal(10,4)
sourceQuery         string?
tags                json (string[])
thesisCore          text
riskStructure       json (string[])
counterarguments    json (string[])
failureModes        json (string[])
reasoningPattern    string?
scenarioType        string?
outcomeLabel        enum: success | failure | invalidated | null
affectsStep0        boolean
affectsController   boolean
affectsRouting      boolean
createdAt           bigint (UTC ms)
expiresAt           bigint (UTC ms)
isActive            boolean
embeddingReady      boolean  ← vector-ready flag
```

---

## WRITE PIPELINE (5 gates, GPT Q5 compliant)

```
Gate 1: evidenceScore >= 0.55 (skip if below)
Gate 2: thesisCore.length >= 20 chars (skip if empty/trivial)
Gate 3: checkDuplicateMemory (24h window, same ticker+action+verdict+confidence)
Gate 4: cap enforcement (evict oldest if count >= 50 per ticker)
Gate 5: TTL assignment (action_record: 30d, thesis_snapshot: 60d, risk_flag: 14d, scenario_note: 90d)

Caller gate (routers.ts):
  IF loop_ran == true
  AND evidence_score_after >= 55
  AND hasThesis == true
  AND hasDelta == true
  THEN writeMemory(...)
```

---

## RETRIEVAL: exact_match + similar_case

```
exact_match:  fetchActiveMemoryByTicker(userId, ticker) → rank by recency+score → cap 5
similar_case: fetchAllActiveMemoryForUser(userId) → scoreSimilarCases() → filter >= 0.4 threshold → cap 5
combined:     merge exact + similar (dedup by id) → cap 5

Similarity scoring (placeholder, no vector):
  +0.4  same scenarioType
  +0.3  riskStructure overlap (Jaccard)
  +0.2  same tags
  +0.1  same ticker (already in exact, bonus for combined)
  threshold: 0.4 (GPT Q4)
```

---

## MEMORY INFLUENCE → LOOP BEHAVIOR

| Memory Pattern | Influence | Behavioral Effect |
|---|---|---|
| `outcomeLabel == failure` with failureModes | `affects_step0=true` | `revalidation_mandatory` upgraded to true |
| `outcomeLabel == failure` | `affects_routing=true` | `elevated_probe = risk_probe` prepended to `preferred_probe_order` |
| `memoryType == action_record` with outcomeLabel | `affects_controller=true` | `history_requires_control` upgraded to true |
| 2+ successes with avgScore > 0.75 | `early_stop_bias=true` | `evaluateStopCondition` threshold relaxed |
| 2+ invalidations | `force_continuation=true` | overrides early_stop_bias, appended to `history_control_reason` |

**Priority chain (GPT Q2):** Step0 override > memory influence > history control > default logic

---

## MEMORY CONTEXT BLOCK (structured injection)

```json
{
  "top_memories": [
    {
      "memory_id": "uuid",
      "scenario_type": "high_growth_tech",
      "thesis_core": "Strong iPhone cycle + services growth",
      "key_risk": "China revenue risk",
      "why_relevant_now": "Same ticker, recent action_record, high evidence score"
    }
  ],
  "memory_influence_summary": "1 prior BUY success (high confidence). Memory suggests early stop bias."
}
```

---

## MEMORY TRACE (loop_metadata output)

```
memory_trace: {
  retrieval_attempted:    boolean
  retrieval_mode_used:    "exact_match" | "similar_case" | "combined" | "none"
  records_retrieved:      number
  memory_injected:        boolean
  affects_step0:          boolean
  affects_controller:     boolean
  affects_routing:        boolean
  early_stop_bias:        boolean
  force_continuation:     boolean
  write_attempted:        boolean
  write_result:           "written" | "skipped" | "error" | "not_attempted"
  write_skip_reason:      string
  memory_pattern_summary: string
}
```

---

## OPEN ITEMS (for GPT to decide)

1. **outcomeLabel update loop** — `outcomeLabel` is set at write time based on current verdict. There is no mechanism to retroactively update `outcomeLabel` to `failure` or `invalidated` when a subsequent analysis contradicts a prior BUY. Recommend: GPT to specify trigger condition for `updateMemoryOutcome()` call.

2. **embeddingReady flag** — `embeddingReady=false` on all records. Vector embedding pipeline (Milvus/mem0) is not yet wired. The flag is a readiness marker only. Recommend: LEVEL4 to implement embedding generation on write.

3. **memoryType auto-classification** — Current implementation uses hardcoded `memoryType: "action_record"` at write time. Per user preference (memory management knowledge), LLM-based auto-classification of memoryType should be added. Recommend: add a lightweight LLM call at write time to classify into action_record / thesis_snapshot / risk_flag / scenario_note.

4. **memory_trace in frontend Badge** — `memory_trace` fields are written to `loop_metadata` but not yet surfaced in `LoopSummaryBadge.tsx`. Recommend: add `MemoryTraceBadge` sub-component alongside `HistoryControlTraceBadge`.

---

## GUARANTEES

```
NON_FATAL_GUARANTEE:     all memory failures (write/retrieve/attach) are caught and logged; pipeline continues
BACKWARD_COMPATIBLE:     all new fields are optional; callers without memory context continue to work
ZERO_SCHEMA_BREAK:       new table only, no existing table modified
DEDUP_ENFORCED:          24h window prevents memory spam
TTL_ENFORCED:            expiresAt checked in fetchActiveMemoryByTicker (isActive=true AND expiresAt > now)
BUDGET_GATE:             computeMemoryInfluence skips if budgetUsed > 0.85 * budgetMax
```
