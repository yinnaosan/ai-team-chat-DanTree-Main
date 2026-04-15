# Phase 2I — Pre-Phase-3A Precheck Report

> ⚠️ **PRECHECK ONLY — NOT VALID FOR FINAL GATE**
> Formal READY / NOT READY requires post-Phase-3A samples (id > 1,440,006)

---

## Data Window

| Item | Value |
|------|-------|
| Query scope | All assistant messages, no id filter |
| Condition | `decisionObject IS NOT NULL` AND `answerObject.bull_case[0] IS NOT NULL` |
| Records returned | **15** |
| createdAt range | 2026-03-19 → 2026-04-15 05:04:17 UTC |
| Phase 3A deployment | 2026-04-15 12:33 UTC |
| All records are | **pre-Phase-3A** |
| post-Phase-3A records | **0** (no new messages written since deployment) |

---

## TABLE A — criticalDriver (legacy_bull vs struct_bull)

| id | date | tier | stance | L_len | S_len | category |
|---:|------|------|--------|------:|------:|----------|
| 1350002 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 93 | 80 | TRUNCATION-ONLY |
| 1350004 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 84 | 80 | TRUNCATION-ONLY |
| 1350006 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 101 | 80 | TRUNCATION-ONLY |
| 1350008 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 83 | 80 | TRUNCATION-ONLY |
| 1350010 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 93 | 80 | TRUNCATION-ONLY |
| 1350012 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 83 | 80 | TRUNCATION-ONLY |
| 1350020 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 83 | 80 | TRUNCATION-ONLY |
| **1350022** | **2026-04-14** | **FULL_SUCCESS** | **NEUTRAL** | **92** | **80** | **MATERIALLY DIFFERENT** |
| 1380002 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 18 | 18 | EXACT |
| 1380004 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 81 | 80 | TRUNCATION-ONLY |
| 1410002 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 18 | 18 | EXACT |
| 1410004 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 18 | 18 | EXACT |
| 1410006 | 2026-04-14 | FULL_SUCCESS | NEUTRAL | 18 | 18 | EXACT |
| 1440002 | 2026-04-15 | FULL_SUCCESS | NEUTRAL | 64 | 64 | EXACT |
| 1440004 | 2026-04-15 | FULL_SUCCESS | NEUTRAL | 81 | 80 | TRUNCATION-ONLY |
| 1440006 | 2026-04-15 | FULL_SUCCESS | NEUTRAL | 71 | 71 | EXACT |

---

## TABLE B — failureCondition (legacy_bear vs struct_bear)

| id | L_len | S_len | category |
|---:|------:|------:|----------|
| 1350002 | 93 | 80 | TRUNCATION-ONLY |
| 1350004 | 84 | 80 | TRUNCATION-ONLY |
| 1350006 | 101 | 80 | TRUNCATION-ONLY |
| 1350008 | 83 | 80 | TRUNCATION-ONLY |
| 1350010 | 93 | 80 | TRUNCATION-ONLY |
| 1350012 | 83 | 80 | TRUNCATION-ONLY |
| 1350020 | 83 | 80 | TRUNCATION-ONLY |
| **1350022** | **108** | **80** | **MATERIALLY DIFFERENT** |
| 1380002 | 18 | 18 | EXACT |
| 1380004 | 81 | 80 | TRUNCATION-ONLY |
| 1410002 | 18 | 18 | EXACT |
| 1410004 | 18 | 18 | EXACT |
| 1410006 | 18 | 18 | EXACT |
| 1440002 | 64 | 64 | EXACT |
| 1440004 | 81 | 80 | TRUNCATION-ONLY |
| 1440006 | 71 | 71 | EXACT |

---

## MATERIALLY DIFFERENT Detail — id=1350022

### criticalDriver (bull)

```
LEGACY_BULL (92 chars):
  股价较52周高点61.45港元跌幅约49.7%，当前30.88港元仅高于52周低位30.26约2%，
  技术面处于极端超卖区域，若EV交付量及毛利率数据超预期，超跌反弹的风险收益比显著改善

STRUCT_BULL (80 chars):
  股价已跌至52周低点（30.26港元）附近，技术上处于极端超卖区域，下行空间有限，
  超跌反弹机会显现，若EV业务（SU7系列）销量数据超预期将成为估值修复的核心催[截断]
```

**Analysis**: Both describe "oversold rebound" theme, but legacy emphasizes "49.7% drawdown / risk-reward ratio" while struct emphasizes "SU7 series / valuation recovery". Word overlap ~55%, below 60% PARTIAL CONTENT threshold → MATERIALLY DIFFERENT.

### failureCondition (bear)

```
LEGACY_BEAR (108 chars):
  中美科技脱钩风险持续升温：小米曾被列入美国国防部CMIC名单（虽已撤销），
  2026年地缘政治博弈加剧，潜在出口管制、芯片禁令及供应链限制仍构成系统性风险，
  压制国际资本配置意愿，EV与AIoT业务对先进半导体依赖度较高

STRUCT_BEAR (80 chars):
  全球高利率环境持续压制科技/成长股估值：美联储基准利率3.64%、10年期美债收益率4.31%，
  港股流动性承压，小米作为高贝塔成长股首当其冲，估值修复进程可能持[截断]
```

**Analysis**: Legacy = geopolitical/CMIC/chip ban risk. Struct = high interest rate / valuation compression. **Completely different risk dimensions** — not a truncation issue, extraction pipeline selected wrong bear argument.

---

## Counts

### criticalDriver (bull)

| Category | Count | % |
|----------|------:|---:|
| EXACT | 7 | 46.7% |
| WHITESPACE | 0 | 0.0% |
| TRUNCATION-ONLY | 7 | 46.7% |
| PHRASE-ORDER | 0 | 0.0% |
| PARTIAL CONTENT | 0 | 0.0% |
| **MATERIALLY DIFFERENT** | **1** | **6.7%** |
| **Safe total** | **14** | **93.3%** |

### failureCondition (bear)

| Category | Count | % |
|----------|------:|---:|
| EXACT | 6 | 40.0% |
| WHITESPACE | 0 | 0.0% |
| TRUNCATION-ONLY | 8 | 53.3% |
| PHRASE-ORDER | 0 | 0.0% |
| PARTIAL CONTENT | 0 | 0.0% |
| **MATERIALLY DIFFERENT** | **1** | **6.7%** |
| **Safe total** | **14** | **93.3%** |

### Long legacy check

| Field | >200 chars | % |
|-------|----------:|---:|
| legacy_bull | 0 / 15 | 0.0% |
| legacy_bear | 0 / 15 | 0.0% |

---

## Gate Simulation (reference only — NOT formal)

| Gate | Condition | Precheck value | Simulated |
|------|-----------|---------------|-----------|
| G1 | >200 chars ≤ 5% | 0.0% | PASS |
| G2 | MATERIALLY DIFFERENT = 0 | bull=1, bear=1 | **FAIL** |
| G3 | safe ≥ 90% | 93.3% | PASS |

> ⚠️ Gate simulation based on pre-Phase-3A data — NOT a formal PASS/FAIL conclusion

---

## Why pre-Phase-3A data is NOT valid for final gate

1. **Causal Contamination**: Phase 3A expanded truncation limits (key_arguments 80→200). Pre-Phase-3A records were generated under old limits; TRUNCATION-ONLY classifications reflect old behavior, not post-3A behavior.
2. **Sample Selection Bias**: 15 records from dev/test sessions, concentrated on few tickers (AAPL, 1810.HK). Not representative of production input distribution.
3. **Gate Design Intent**: G1/G2/G3 validate that Phase 3A's expanded limits produce faithful struct↔legacy alignment. Pre-Phase-3A data cannot test this.
4. **Temporal Ordering**: Formal gate confirms deployed system behavior. Pre-Phase-3A data cannot confirm post-deployment behavior.

---

## What pre-Phase-3A data CAN tell us

1. **Structural alignment baseline**: MATERIALLY DIFFERENT = 1 (not 0) — extraction pipeline had alignment issues before Phase 3A. Needs investigation.
2. **Field coverage**: `key_arguments[0].argument` and `top_bear_argument` are populated; semantic role mapping is correct.
3. **Truncation pattern**: TRUNCATION-ONLY = 46.7% (bull) / 53.3% (bear) — old 80-char limit was actively cutting content. Phase 3A expansion was necessary.
4. **Early warning**: Both bull and bear MATERIALLY DIFFERENT come from the same record (id=1350022). Isolated event, but bear divergence is semantically complete — extraction pipeline selected wrong argument.

---

## Precheck Conclusion

> ⚠️ **PRECHECK ONLY — NOT VALID FOR FINAL GATE**

**PRECHECK DOES NOT SUPPORT further validation priority without investigation**

- Material divergence detected: bull=1, bear=1 (both from id=1350022)
- Required action: investigate id=1350022 argument selection logic in extraction pipeline
- If investigation confirms isolated LLM output variance (not systemic defect), criticalDriver remains viable for formal gate

**FORMAL GATE STATUS: PENDING**

- Trigger: first `assistant` message with `id > 1,440,006` AND `decisionObject IS NOT NULL`
- Formal gate requires: G1 + G2 + G3 all PASS
- Only post-Phase-3A samples can produce READY / NOT READY conclusion

---

*Generated: 2026-04-15 | Script: /home/ubuntu/phase2i_precheck.py*
*Full raw output: reports/phase2i/precheck_report.txt*
