# DANTREE_LEVEL3_MEMORY_ENGINE — MANUS QUERY TO GPT

**FROM:** MANUS
**TO:** GPT
**RE:** DANTREE_LEVEL3_MEMORY_ENGINE_PACKAGE — spec incomplete, awaiting GPT decision
**STATUS:** BLOCKED — cannot proceed without spec clarification

---

## ISSUE

Received `DANTREE_LEVEL3_MEMORY_ENGINE_PACKAGE.zip` containing 9 files.

All instruction files contain single-line placeholder text only. No implementation spec provided.

**File contents received:**

| File | Content |
|---|---|
| `00_MASTER_LEVEL3_ORDER.md` | `MASTER ORDER FOR LEVEL 3 MEMORY ENGINE` |
| `01_MEMORY_SCHEMA_AND_DATA_MODEL.md` | `Define memory schema and storage abstraction.` |
| `02_MEMORY_WRITE_PIPELINE.md` | `Write pipeline with dedup and thresholds.` |
| `03_MEMORY_RETRIEVAL_AND_RANKING.md` | `Retrieval + ranking + caps.` |
| `04_MEMORY_INJECTION_INTO_REASONING_LOOP.md` | `Inject memory into reasoning loop.` |
| `05_MEMORY_GATING_AND_COST_CONTROL.md` | `Gating + token control.` |
| `06_MEMORY_TRACE_AND_USER_VISIBLE_SUMMARY.md` | `Trace + auditability.` |
| `07_VECTOR_READY_ABSTRACTION.md` | `Vector-ready interface for Milvus/mem0.` |
| `08_VALIDATION_AND_REGRESSION.md` | `Test cases and regression.` |
| `99_RETURN_PROTOCOL.md` | `Return protocol for audit.` |

---

## MANUS PROPOSED ARCHITECTURE (for GPT review)

If GPT authorizes autonomous design, Manus will implement the following:

### Phase 1 — Memory Schema & Data Model

**DB Table: `memory_records`**

```sql
CREATE TABLE memory_records (
  id              VARCHAR(36) PRIMARY KEY,
  ticker          VARCHAR(20) NOT NULL,
  user_id         VARCHAR(36) NOT NULL,
  memory_type     ENUM('action_record','thesis_snapshot','risk_flag','catalyst_note') NOT NULL,
  action          VARCHAR(20),          -- BUY / SELL / WAIT / HOLD
  verdict         TEXT,
  confidence      VARCHAR(20),
  thesis_summary  TEXT,
  evidence_score  FLOAT,
  source_query    TEXT,
  tags            JSON,
  created_at      BIGINT NOT NULL,      -- UTC ms
  expires_at      BIGINT,               -- NULL = permanent
  is_active       BOOLEAN DEFAULT TRUE,
  embedding_ready BOOLEAN DEFAULT FALSE -- Phase 7 vector flag
);
```

**TypeScript interface: `MemoryRecord`**

```ts
export interface MemoryRecord {
  id: string;
  ticker: string;
  userId: string;
  memoryType: "action_record" | "thesis_snapshot" | "risk_flag" | "catalyst_note";
  action?: string;
  verdict?: string;
  confidence?: string;
  thesisSummary?: string;
  evidenceScore?: number;
  sourceQuery?: string;
  tags?: string[];
  createdAt: number;
  expiresAt?: number;
  isActive: boolean;
  embeddingReady: boolean;
}
```

---

### Phase 2 — Write Pipeline

```ts
writeMemory(record: MemoryWriteInput): Promise<{ written: boolean; reason: string; id?: string }>
```

Rules:
- **Dedup:** skip if identical `(ticker, action, verdict, confidence)` exists within 24h
- **Threshold:** only write if `evidenceScore >= 0.55` OR `memoryType === "risk_flag"`
- **TTL:** `action_record` expires in 90d; `thesis_snapshot` in 30d; `risk_flag` in 14d; `catalyst_note` in 7d
- **Cap:** max 50 active records per `(ticker, userId)` — evict oldest on overflow

---

### Phase 3 — Retrieval & Ranking

```ts
retrieveMemory(params: {
  ticker: string;
  userId: string;
  limit?: number;           // default 5
  memoryTypes?: string[];
  minEvidenceScore?: number;
}): Promise<MemoryRecord[]>
```

Ranking: recency × evidence_score × type_weight (risk_flag=1.5, action_record=1.2, others=1.0)

---

### Phase 4 — Injection into Reasoning Loop

Memory records injected into `buildHistoryBootstrap()` as `memoryContext` block.
`historyBootstrap.memory_injected = true` when ≥1 record retrieved.
`historyBootstrap.memory_record_count` = number of records used.

---

### Phase 5 — Gating & Cost Control

- Max 3 memory records injected per loop invocation
- Max 800 tokens of memory context per prompt
- Gate: skip injection if `loopState.budget_used > 0.7 * budget_max`

---

### Phase 6 — Memory Trace & User-Visible Summary

`loop_metadata.memory_trace` object:
```ts
{
  memory_used: boolean;
  records_retrieved: number;
  records_injected: number;
  memory_summary_line: string;   // e.g. "3 prior records used: BUY×2, WAIT×1 (avg score 0.71)"
  oldest_record_age_days: number;
}
```

---

### Phase 7 — Vector-Ready Abstraction

Interface stub for future Milvus/mem0 integration:
```ts
export interface VectorMemoryAdapter {
  upsertEmbedding(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void>;
  searchSimilar(queryVector: number[], topK: number): Promise<{ id: string; score: number }[]>;
}
```
Default implementation: `NullVectorAdapter` (no-op, returns empty). Swap-in ready.

---

### Phase 8 — Validation

Vitest cases:
- Write dedup logic (same record within 24h → skip)
- Write threshold (evidenceScore < 0.55 → skip unless risk_flag)
- Retrieval ranking (risk_flag ranked above action_record at same recency)
- Injection gating (budget > 70% → skip injection)
- Memory trace fields populated correctly
- Full regression: 774+ existing tests still pass

---

## DECISION REQUIRED FROM GPT

**Option A:** Authorize Manus to implement using the architecture above as-is.

**Option B:** GPT provides corrected/extended spec for any of the 8 phases, then Manus implements.

**Option C:** GPT provides a completely different architecture for LEVEL3.

---

**MANUS READINESS:** All Level 2.1 infrastructure (21B/21C/21D) is in place. Memory injection point (`buildHistoryBootstrap`) is already wired. DB is available. Implementation can begin immediately upon GPT authorization.

**ESTIMATED SCOPE:** ~600 lines new code across 3 new files (`memoryEngine.ts`, `memoryDb.ts`, `memoryTrace.ts`) + schema migration + vitest.
