# L13.2A — Evidence Engine / Output Gating Preflight
**Date:** 2026-04-01
**Type:** DISCOVERY-ONLY
**Production files modified:** 0

---

## 1. Existing Related Logic (What Already Exists)

### A. `server/evidenceValidator.ts` — PRIMARY ENGINE (535 lines, production-active)

This is the core Evidence Engine. It is **already fully implemented** and production-active. Key exports:

| Export | Purpose |
|--------|---------|
| `EvidencePacket` | Full evidence state object (score, level, outputMode, claimWhitelist, conflictList, etc.) |
| `computeEvidenceScore()` | Computes 0–100 score: blocking missing = -20/item, non-blocking = -5/item, field-level tiers |
| `buildEvidencePacket()` | Assembles EvidencePacket from task description + data report + field tiers + API hit stats |
| `validateGptResponse()` | Post-generation gate: returns `pass | rewrite | blocked` |

**`EvidencePacket` key fields:**
```ts
evidenceScore: number;          // 0–100
evidenceLevel: "sufficient" | "partial" | "insufficient";
allowInvestmentAdvice: boolean;
outputMode: "decisive" | "directional" | "framework_only";
claimWhitelist: string[];
conflictList: Array<{ field, valueA, sourceA, valueB, sourceB }>;
discussability: boolean;        // evidenceScore >= 50 && no blocking missing
missingBlocking: string[];
missingImportant: string[];
missingOptional: string[];
freshnessLabel: "realtime" | "latest_available" | "recent" | "stale";
```

### B. `server/routers.ts` — Evidence Engine Integration Points

| Line | Usage |
|------|-------|
| 1766 | `buildEvidencePacket()` called after data fetch, result stored as `evidencePacket` |
| 2949 | `evidenceDelta.evidence_score_after` used in loop convergence |
| 3031 | `level1cResult.strength_report.evidence_score` used for memory write eligibility |
| 3141 | `finalQuality = (loopMeta.evidence_score_after ?? 0) >= 55` — **existing output gate** |

### C. `server/deepResearchEngine.ts` — Thesis Confidence (Partial Gating)

- `thesis_confidence: number` (0–1) computed in `buildInvestmentThesis()` via:
  ```ts
  raw_confidence = (bq_score * 0.4) + (signalFusionScore * 0.35) + (dataQualityScore * 0.25)
  ```
- This is a **soft signal**, not a hard gate. It influences GPT prompt framing but does not block output.

### D. `server/synthesisController.ts` — Semantic Fragility (Soft Signal)

- `confidence_fragility` and `state_fragility` are computed and injected into GPT prompts via `formatSemanticEnvelopeForPrompt()`
- These are **advisory signals**, not hard gates

### E. `server/experienceLayer.ts` — Confidence Drift Tracking

- Tracks `confidence_change` across sessions (-0.15 to +0.15)
- Not a gate — a memory signal

---

## 2. What Is Missing (The Gap)

The existing system has:
- ✅ Evidence score computation (`evidenceValidator.ts`)
- ✅ Soft output mode control (`outputMode: decisive | directional | framework_only`)
- ✅ Post-generation validation (`validateGptResponse`)
- ✅ Memory write gate (`finalQuality >= 55`)
- ❌ **No structured `OutputGateResult` object** that summarizes the gating decision
- ❌ **No tRPC exposure** of the gating state (cannot be queried by frontend)
- ❌ **No test coverage** for `evidenceValidator.ts`
- ❌ **No unified read-only gating summary** that combines: evidence_score + outputMode + thesis_confidence + semantic fragility

---

## 3. Best Insertion Point

**Layer:** Between `buildEvidencePacket()` (line 1789) and the Step3 GPT call in `routers.ts`

**Recommended new file:** `server/outputGatingEngine.ts` (~80 lines)

```ts
export interface OutputGateResult {
  evidence_score: number;          // 0–100 (from EvidencePacket)
  evidence_level: "sufficient" | "partial" | "insufficient";
  output_mode: "decisive" | "directional" | "framework_only";
  thesis_confidence: number;       // 0–1 (from buildInvestmentThesis)
  semantic_fragility: number;      // 0–1 (from SynthesisSemanticEnvelope)
  allow_investment_advice: boolean;
  gate_passed: boolean;            // evidence_score >= 40 && !blocking_missing
  gate_reason: string;             // human-readable explanation
  blocking_fields: string[];       // missingBlocking list
  conflict_count: number;          // from EvidencePacket.conflictList
  freshness: string;               // from EvidencePacket.freshnessLabel
}

export function buildOutputGateResult(
  packet: EvidencePacket,
  thesisConfidence: number,
  semanticFragility: number
): OutputGateResult
```

**Why this layer:**
- `buildEvidencePacket()` already exists and is called at line 1789
- `thesis_confidence` is already computed in `buildInvestmentThesis()` and stored in context
- `semantic_fragility` is already in `SynthesisSemanticEnvelope.state_fragility`
- This is a **pure aggregation** — no new computation, just a unified read-only summary object

---

## 4. Minimal Phase 1 Implementation Plan

| Step | File | Scope | Lines |
|------|------|-------|-------|
| 1 | `server/outputGatingEngine.ts` | New file: `OutputGateResult` interface + `buildOutputGateResult()` | ~80 |
| 2 | `server/outputGatingEngine.test.ts` | New test file: 8–10 tests covering gate_passed logic | ~100 |
| 3 | `server/routers.ts` | Add `market.getOutputGateStats` publicProcedure query (~15 lines) | ~15 |
| **Total** | | | **~195 lines** |

**No schema changes. No frontend changes required for Phase 1.**

---

## 5. Whether L13.2-B Needs Claude

**`FEASIBLE_WITHOUT_CLAUDE = YES`**

Rationale:
- `buildOutputGateResult()` is pure aggregation of already-computed values
- No new algorithm design required
- Pattern is identical to `buildSemanticEngineStatsDisplay()` (L12.8) and `getSourceSelectionStats` (L13.0B)
- All input types (`EvidencePacket`, `thesis_confidence`, `state_fragility`) are already defined and production-active

---

## 6. Blockers and Hidden Coupling Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `evidencePacket` is computed inside the main `submitTask` procedure — not easily extractable for standalone query | LOW | `getOutputGateStats` can use a lightweight mock/sample call or return the last cached result per entity |
| `thesis_confidence` is computed inside `buildInvestmentThesis()` which requires full `DeepResearchContextMap` | LOW | For the stats query, use a simplified fallback (0.65 default) with a `is_live: false` flag |
| `state_fragility` is inside `SynthesisSemanticEnvelope` which requires a full semantic run | LOW | Same fallback approach as `getSemanticStats` (L12.10) — run a lightweight activation |

**No blocking risks. All risks are LOW and have established mitigation patterns from L12.8/L13.0B.**

---

## 7. Frontend Visibility Recommendation

**Phase 1: Backend-only + tRPC-exposed (no frontend changes)**
- Add `market.getOutputGateStats` query (same pattern as `getSemanticStats`)
- Frontend integration (ENGINE STATS panel) can be Phase 2

**Phase 2 (future):** Add "Gate" row to ENGINE STATS panel:
```
Gate Status    DECISIVE  (green)
Evidence       78/100    (blue)
Conflicts      2         (cyan)
```

---

## 8. Compliance

- No production files modified ✅
- No implementation attempted ✅
- Exact files and functions named ✅
- Claude requirement clearly stated: NOT NEEDED ✅
