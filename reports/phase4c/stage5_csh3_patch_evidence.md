# Phase 4C Stage 5 — CS-H3 Regex Patch Evidence Package

**Date:** 2026-04-17  
**Patch:** Claude CS-H3 FINAL_REGEX applied to `server/structuredAnalysisGate.ts`  
**Scope:** CONFIDENCE_LEVEL regex content only (1 file, 1 variable)

---

## 1. Patch Applied

### File Changed
`server/structuredAnalysisGate.ts` — 1 file only

### Variable
`CONFIDENCE_LEVEL` (symbol name unchanged per GPT instruction)

### Before (original)
```ts
const CONFIDENCE_LEVEL = /高置信度|中置信度|低置信度|置信度.{0,5}[高中低]|[高中低].{0,4}置信/i;
```

### After (Claude FINAL_REGEX, converted to `new RegExp()` for esbuild Unicode safety)
```ts
const CONFIDENCE_LEVEL = new RegExp(
  "高置信度|中置信度|低置信度" +
  "|置信度.{0,5}[高中低]|置信度.{0,5}(?:medium|high|low)" +
  "|[高中低].{0,4}置信" +
  "|信心为[高中低]|信心为(?:medium|high|low)" +
  "|信心.{0,4}[高中低]" +
  "|信心评级为[高中低]|信心评级为(?:medium|high|low)" +
  "|\\bmedium\\b|\\bhigh\\b|\\blow\\b",
  "i"
);
```

**Formatting note:** Single-line regex literal caused `Unterminated regular expression` under esbuild Unicode parsing. Converted to `new RegExp(...)` per GPT-confirmed fallback rule. Semantic content is 100% identical to Claude FINAL_REGEX.

---

## 2. TSC Result

```
npx tsc --noEmit (structuredAnalysisGate.ts only)
→ 0 errors in structuredAnalysisGate.ts

Pre-existing error (unrelated to this patch):
  server/routers.ts(1915,54): error TS2802: Type 'Set<string>' can only be iterated
  through when using '--downlevelIteration' flag or '--target' of 'es2015' or higher.
```

**New errors introduced by this patch: 0**

---

## 3. esbuild Result

```
node_modules/.bin/esbuild server/structuredAnalysisGate.ts --bundle=false
→ EXIT: 0
→ CONFIDENCE_LEVEL = new RegExp(...) compiled successfully
```

---

## 4. Round 1 Gate Re-run (same 35 samples, post-patch regex)

| Gate | Threshold | Before Patch | After Patch | Result |
|------|-----------|-------------|-------------|--------|
| G1 HARD_FAIL ≤ 10% | ≤10% | 20.0% | **2.9%** | PASS ✓ |
| G2 PASS+FULL_PASS ≥ 70% | ≥70% | 80.0% | **97.1%** | PASS ✓ |
| G3 prc_pass ≥ 85% | ≥85% | 100.0% | **100.0%** | PASS ✓ |
| G4 avg_score ≥ 65 | ≥65 | 90.0 | **93.6** | PASS ✓ |

**Round 1 FINAL: PASS ✓** (G1 borderline — 1/35 HARD_FAIL remaining)

### Remaining HARD_FAIL (Round 1)
- **msgId=1530036** — `SR-H3: no stance word`
- `stance_rationale`: `"基于当前PE(TTM)328倍与净利润-47%的极度背离...判断TSLA方向性偏空（likely overvalued）"`
- Analysis: `偏空` and `overvalued` are semantically valid stance words but not covered by SR-H3 regex. This is a **separate SR-H3 issue**, outside CS-H3 patch scope.

---

## 5. Round 2 Gate (15 new samples, post-patch, MSFT/NVDA/SPY)

| msgId | Overall | Score | Hard Fail Fields |
|-------|---------|-------|-----------------|
| 1560016 | FULL_PASS | 94 | — |
| 1560017 | FULL_PASS | 94 | — |
| 1560018 | FULL_PASS | 94 | — |
| 1560019 | HARD_FAIL | 83 | stance_rationale: SR-H3: no stance word |
| 1560020 | FULL_PASS | 94 | — |
| 1560021 | FULL_PASS | 94 | — |
| 1560022 | FULL_PASS | 96 | — |
| 1560023 | FULL_PASS | 96 | — |
| 1560024 | FULL_PASS | 94 | — |
| 1560025 | FULL_PASS | 94 | — |
| 1560026 | FULL_PASS | 94 | — |
| 1560027 | FULL_PASS | 94 | — |
| 1560028 | FULL_PASS | 96 | — |
| 1560029 | FULL_PASS | 94 | — |
| 1560030 | FULL_PASS | 96 | — |

| Gate | Threshold | Round 2 | Result |
|------|-----------|---------|--------|
| G1 HARD_FAIL ≤ 10% | ≤10% | **6.7%** | PASS ✓ |
| G2 PASS+FULL_PASS ≥ 70% | ≥70% | **93.3%** | PASS ✓ |
| G3 prc_pass ≥ 85% | ≥85% | **100.0%** | PASS ✓ |
| G4 avg_score ≥ 65 | ≥65 | **93.8** | PASS ✓ |

**Round 2 FINAL: READY for integration ✓**

### Round 2 Failure Pattern
- 1/15 HARD_FAIL: `stance_rationale: SR-H3: no stance word` — same SR-H3 pattern as Round 1 (outside CS-H3 patch scope)

---

## 6. Combined Summary (35 + 15 = 50 samples)

| Metric | Value |
|--------|-------|
| Total samples | 50 |
| HARD_FAIL | 2 (4.0%) |
| FULL_PASS | 47 (94.0%) |
| avg weighted_score | ~93.7 |
| CS-H3 failures after patch | **0** |
| Remaining HARD_FAIL cause | SR-H3 only (2/50, 4.0%) |

---

## 7. FINAL VERDICT

**CS-H3 patch: CONFIRMED EFFECTIVE**

- CS-H3 HARD_FAIL rate: 20.0% → **0.0%** (eliminated)
- Overall HARD_FAIL: 20.0% → **4.0%** (within G1 threshold of ≤10%)
- All 4 gates PASS across both rounds
- Remaining 4.0% HARD_FAIL is SR-H3 (stance word coverage), a separate issue

**READY for integration ✓**

---

## 8. Open Issue (for GPT decision)

**SR-H3 gap:** `偏空`, `偏多`, `overvalued`, `undervalued` are semantically valid stance words not covered by current SR-H3 regex. Rate: 2/50 = 4.0%. Below G1 threshold, so not blocking. GPT to decide whether to patch SR-H3 in a follow-up task.
