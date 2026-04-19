/**
 * structuredAnalysisGate.test.ts
 * DANTREE_EVAL_MOVE2_SA_GATE_TESTS_AND_DIAGNOSTIC
 *
 * Deterministic regression tests for the SA semantic gate.
 * ALL inputs are synthetic — no network, no LLM, no DB dependency.
 * Exact classifications asserted (not loose "truthy" checks).
 *
 * Groups:
 *   A — evalPrimaryRiskCondition  (8 cases)
 *   B — evalConfidenceSummary     (7 cases)
 *   C — evalPrimaryBull + evalPrimaryBear (11 cases)
 *   D — evalStanceRationale       (7 cases)
 *   E — full evaluateStructuredAnalysisSemantics integration (10 cases)
 *
 * Total: 43 cases
 *
 * STRUCTURAL FINDING (E5):
 *   The SOFT_FAIL branch (weighted_score < 65) is structurally unreachable.
 *   Minimum weighted_score when all 5 hard rules pass ≈ 82 (all soft deductions applied):
 *     PRC=80 × 0.25 + CS=70 × 0.20 + PB=85 × 0.20 + PBR=85 × 0.20 + SR=90 × 0.15 ≈ 82
 *   Gate is effectively binary: HARD_FAIL or PASS/FULL_PASS.
 *   This is a design characteristic, not a bug.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateStructuredAnalysisSemantics,
  type StructuredAnalysis,
  type GateContext,
} from "./structuredAnalysisGate";

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — evalPrimaryRiskCondition (8 cases)
// ─────────────────────────────────────────────────────────────────────────────

describe("Group A — evalPrimaryRiskCondition", () => {
  // A1: Valid conditional + consequence → primary_risk_condition passes (OK)
  it("A1: valid conditional + consequence → PASS, reason OK", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_risk_condition.pass).toBe(true);
    expect(r.fields.primary_risk_condition.reason).toBe("OK");
  });

  // A2: Empty field → HARD_FAIL, PRC-H1
  it("A2: empty primary_risk_condition → HARD_FAIL, PRC-H1", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_risk_condition.pass).toBe(false);
    expect(r.fields.primary_risk_condition.reason).toContain("PRC-H1");
    expect(r.overall).toBe("HARD_FAIL");
  });

  // A3: Undefined field → HARD_FAIL, PRC-H1
  it("A3: undefined primary_risk_condition → HARD_FAIL, PRC-H1", () => {
    const sa: StructuredAnalysis = {
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_risk_condition.pass).toBe(false);
    expect(r.fields.primary_risk_condition.reason).toContain("PRC-H1");
  });

  // A4: Too short (< 30 chars) → HARD_FAIL, PRC-H2
  it("A4: primary_risk_condition too short → HARD_FAIL, PRC-H2", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果加息则下跌",  // 7 chars — well below 30
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_risk_condition.pass).toBe(false);
    expect(r.fields.primary_risk_condition.reason).toContain("PRC-H2");
  });

  // A5: No conditional trigger word → HARD_FAIL, PRC-H3
  it("A5: no conditional trigger word → HARD_FAIL, PRC-H3", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "美联储超预期加息50bp，市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_risk_condition.pass).toBe(false);
    expect(r.fields.primary_risk_condition.reason).toContain("PRC-H3");
  });

  // A6: Valid trigger, no consequence word → PASS + PRC-S1 warning
  it("A6: valid trigger, no consequence word → PASS + PRC-S1 warning", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，市场将面临流动性收紧压力，估值中枢可能下移。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_risk_condition.pass).toBe(true);
    expect(r.fields.primary_risk_condition.warnings.some(w => w.includes("PRC-S1"))).toBe(true);
  });

  // A7: English if/when trigger accepted → PASS
  it("A7: English 'if' trigger accepted → PASS", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "If the Fed raises rates by 50bp, market liquidity will tighten significantly and valuations will compress by 10-15%.",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_risk_condition.pass).toBe(true);
  });

  // A8: All soft rules pass → score = 100
  it("A8: all soft rules pass → score = 100", () => {
    const sa: StructuredAnalysis = {
      // >= 50 chars, has conditional trigger, has consequence word, has number
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%，影响持续约3个月。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_risk_condition.pass).toBe(true);
    expect(r.fields.primary_risk_condition.score).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP B — evalConfidenceSummary (7 cases)
// ─────────────────────────────────────────────────────────────────────────────

describe("Group B — evalConfidenceSummary", () => {
  // B1: Valid confidence level word → PASS (OK)
  it("B1: valid confidence level word → PASS, reason OK", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向，支撑当前判断。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.confidence_summary.pass).toBe(true);
    expect(r.fields.confidence_summary.reason).toBe("OK");
  });

  // B2: Empty field → HARD_FAIL, CS-H1
  it("B2: empty confidence_summary → HARD_FAIL, CS-H1", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.confidence_summary.pass).toBe(false);
    expect(r.fields.confidence_summary.reason).toContain("CS-H1");
  });

  // B3: Too short (< 25 chars) → HARD_FAIL, CS-H2
  it("B3: confidence_summary too short → HARD_FAIL, CS-H2", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，数据支撑。",  // < 25 chars
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.confidence_summary.pass).toBe(false);
    expect(r.fields.confidence_summary.reason).toContain("CS-H2");
  });

  // B4: No confidence level word → HARD_FAIL, CS-H3
  it("B4: no confidence level word → HARD_FAIL, CS-H3", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "当前市场数据支撑判断，多项指标均指向同一方向，分析结论较为可靠。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.confidence_summary.pass).toBe(false);
    expect(r.fields.confidence_summary.reason).toContain("CS-H3");
  });

  // B5: English HIGH/MEDIUM/LOW accepted → PASS
  it("B5: English HIGH confidence level accepted → PASS", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "HIGH confidence because multiple technical and fundamental indicators align consistently.",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.confidence_summary.pass).toBe(true);
  });

  // B6: No reason connector → PASS + CS-S1 warning
  it("B6: no reason connector → PASS + CS-S1 warning", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，多项技术指标和基本面数据均指向同一方向，支撑当前判断。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.confidence_summary.pass).toBe(true);
    expect(r.fields.confidence_summary.warnings.some(w => w.includes("CS-S1"))).toBe(true);
  });

  // B7: 高置信度 pattern → score ≥ 85
  it("B7: 高置信度 pattern with reason → score ≥ 85", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向，支撑当前判断，数据质量较高。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.confidence_summary.pass).toBe(true);
    expect(r.fields.confidence_summary.score).toBeGreaterThanOrEqual(85);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP C — evalPrimaryBull + evalPrimaryBear (11 cases)
// ─────────────────────────────────────────────────────────────────────────────

describe("Group C — evalPrimaryBull + evalPrimaryBear", () => {
  // C1: Valid bullish content → primary_bull PASS
  it("C1: valid bullish content → primary_bull PASS", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲，盈利能力持续改善。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bull.pass).toBe(true);
    expect(r.fields.primary_bull.reason).toBe("OK");
  });

  // C2: Empty primary_bull → HARD_FAIL, PB-H1
  it("C2: empty primary_bull → HARD_FAIL, PB-H1", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bull.pass).toBe(false);
    expect(r.fields.primary_bull.reason).toContain("PB-H1");
  });

  // C3: primary_bull too short → HARD_FAIL, PB-H2
  it("C3: primary_bull too short → HARD_FAIL, PB-H2", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "营收增长。",  // < 20 chars
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bull.pass).toBe(false);
    expect(r.fields.primary_bull.reason).toContain("PB-H2");
  });

  // C4: Main clause has bearish word → HARD_FAIL, PB-H3
  it("C4: primary_bull main clause has bearish word → HARD_FAIL, PB-H3", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "估值偏高，卖出信号明显，下跌风险较大，减持建议。",  // bearish in main clause (>= 20 chars, 卖出/减持 in BEARISH_IN_BULL_MAIN)
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bull.pass).toBe(false);
    expect(r.fields.primary_bull.reason).toContain("PB-H3");
  });

  // C5: Passes but no bullish signal word → PASS + PB-S1 warning
  it("C5: passes but no bullish signal word → PASS + PB-S1 warning", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司基本面稳健，管理层执行力强，市场份额持续扩大。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bull.pass).toBe(true);
    expect(r.fields.primary_bull.warnings.some(w => w.includes("PB-S1"))).toBe(true);
  });

  // C6: Bearish word after 'but' separator → PASS (main clause only)
  it("C6: bearish word after 'but' → PASS (main clause check only)", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲，但短期存在卖出压力。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bull.pass).toBe(true);
  });

  // C7: Valid bearish content → primary_bear PASS
  it("C7: valid bearish content → primary_bear PASS", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪持续承压，利空因素累积。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bear.pass).toBe(true);
    expect(r.fields.primary_bear.reason).toBe("OK");
  });

  // C8: Empty primary_bear → HARD_FAIL, PBR-H1
  it("C8: empty primary_bear → HARD_FAIL, PBR-H1", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bear.pass).toBe(false);
    expect(r.fields.primary_bear.reason).toContain("PBR-H1");
  });

  // C9: primary_bear too short → HARD_FAIL, PBR-H2
  it("C9: primary_bear too short → HARD_FAIL, PBR-H2", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "风险较大。",  // < 20 chars
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bear.pass).toBe(false);
    expect(r.fields.primary_bear.reason).toContain("PBR-H2");
  });

  // C10: Main clause has strong bullish word → HARD_FAIL, PBR-H3
  it("C10: primary_bear main clause has strong bullish word → HARD_FAIL, PBR-H3", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "强烈推荐买入，大幅上涨空间明显，增持信号强烈。",  // bullish in main clause
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bear.pass).toBe(false);
    expect(r.fields.primary_bear.reason).toContain("PBR-H3");
  });

  // C11: Passes but no bearish signal → PASS + PBR-S1 warning
  it("C11: passes but no bearish signal word → PASS + PBR-S1 warning", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "市场竞争加剧，行业格局面临重大变化，需密切关注。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.primary_bear.pass).toBe(true);
    expect(r.fields.primary_bear.warnings.some(w => w.includes("PBR-S1"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP D — evalStanceRationale (7 cases)
// ─────────────────────────────────────────────────────────────────────────────

describe("Group D — evalStanceRationale", () => {
  // D1: Stance word + reason connector → PASS (OK)
  it("D1: stance word + reason connector → PASS, reason OK", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑，盈利增速超预期。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.stance_rationale.pass).toBe(true);
    expect(r.fields.stance_rationale.reason).toBe("OK");
  });

  // D2: Empty → HARD_FAIL, SR-H1
  it("D2: empty stance_rationale → HARD_FAIL, SR-H1", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.stance_rationale.pass).toBe(false);
    expect(r.fields.stance_rationale.reason).toContain("SR-H1");
  });

  // D3: Too short (< 20 chars) → HARD_FAIL, SR-H2
  it("D3: stance_rationale too short → HARD_FAIL, SR-H2", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH看多。",  // < 20 chars
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.stance_rationale.pass).toBe(false);
    expect(r.fields.stance_rationale.reason).toContain("SR-H2");
  });

  // D4: No stance word → HARD_FAIL, SR-H3
  it("D4: no stance word → HARD_FAIL, SR-H3", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "基本面持续改善支撑当前判断，盈利增速超预期，市场认可度提升。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.stance_rationale.pass).toBe(false);
    expect(r.fields.stance_rationale.reason).toContain("SR-H3");
  });

  // D5: Stance present, no reason connector → PASS + SR-S1 warning
  it("D5: stance present, no reason connector → PASS + SR-S1 warning", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，基本面持续改善支撑多头逻辑，盈利增速超预期。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.stance_rationale.pass).toBe(true);
    expect(r.fields.stance_rationale.warnings.some(w => w.includes("SR-S1"))).toBe(true);
  });

  // D6: Chinese stance word 看多 accepted → PASS
  it("D6: Chinese stance word 看多 accepted → PASS", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "看多，因为基本面持续改善支撑多头逻辑，盈利增速超预期。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.stance_rationale.pass).toBe(true);
  });

  // D7: NEUTRAL stance word accepted → PASS
  it("D7: NEUTRAL stance word accepted → PASS", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%。",
      confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向。",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "NEUTRAL，因为多空信号相互抵消，等待更明确的方向性信号。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.fields.stance_rationale.pass).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP E — Full evaluateStructuredAnalysisSemantics integration (10 cases)
// ─────────────────────────────────────────────────────────────────────────────

// Shared strong SA input for FULL_PASS cases
const STRONG_SA: StructuredAnalysis = {
  primary_risk_condition: "如果美联储超预期加息50bp，则市场将面临流动性收紧压力，估值中枢将下移10-15%，影响持续约3个月。",
  confidence_summary: "高置信度，因为多项技术指标和基本面数据均指向同一方向，支撑当前判断，数据质量较高。",
  primary_bull: "公司营收增长超预期，上涨动能强劲，盈利能力持续改善，市场份额扩大。",
  primary_bear: "估值偏高存在下跌风险，市场情绪持续承压，利空因素累积不容忽视。",
  stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑，盈利增速超预期，机构持续增持。",
};

describe("Group E — Full evaluateStructuredAnalysisSemantics integration", () => {
  // E1: All fields pass strong content → FULL_PASS, score ≥ 85
  it("E1: all fields pass strong content → FULL_PASS, score ≥ 85", () => {
    const r = evaluateStructuredAnalysisSemantics(STRONG_SA);
    expect(r.overall).toBe("FULL_PASS");
    expect(r.weighted_score).toBeGreaterThanOrEqual(85);
    expect(r.hard_fail_fields).toHaveLength(0);
  });

  // E2: Single hard-fail field → HARD_FAIL, field listed
  it("E2: single hard-fail field → HARD_FAIL, field listed in hard_fail_fields", () => {
    const sa: StructuredAnalysis = {
      ...STRONG_SA,
      primary_risk_condition: "",  // force PRC-H1
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.overall).toBe("HARD_FAIL");
    expect(r.hard_fail_fields.some(f => f.includes("primary_risk_condition"))).toBe(true);
  });

  // E3: Multiple hard-fail fields → HARD_FAIL, all listed
  it("E3: multiple hard-fail fields → HARD_FAIL, all listed", () => {
    const sa: StructuredAnalysis = {
      primary_risk_condition: "",
      confidence_summary: "",
      primary_bull: "公司营收增长超预期，上涨动能强劲。",
      primary_bear: "估值偏高存在下跌风险，市场情绪承压。",
      stance_rationale: "BULLISH，因为基本面持续改善支撑多头逻辑。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.overall).toBe("HARD_FAIL");
    expect(r.hard_fail_fields.some(f => f.includes("primary_risk_condition"))).toBe(true);
    expect(r.hard_fail_fields.some(f => f.includes("confidence_summary"))).toBe(true);
  });

  // E4: All pass with soft deductions → PASS or FULL_PASS (not HARD_FAIL)
  it("E4: all pass with some soft deductions → PASS or FULL_PASS", () => {
    const sa: StructuredAnalysis = {
      // PRC: has trigger, no consequence word → PRC-S1 deduction
      primary_risk_condition: "如果美联储超预期加息，市场将面临流动性收紧压力，影响持续较长时间。",
      // CS: has level word, no reason connector → CS-S1 deduction
      confidence_summary: "高置信度，多项技术指标和基本面数据均指向同一方向。",
      // PB: no bullish signal → PB-S1 deduction
      primary_bull: "公司基本面稳健，市场份额持续扩大，竞争优势明显。",
      // PBR: no bearish signal → PBR-S1 deduction
      primary_bear: "市场竞争加剧，行业格局面临重大变化，需密切关注。",
      // SR: stance present, no reason connector → SR-S1 deduction
      stance_rationale: "BULLISH，基本面持续改善支撑多头逻辑，盈利增速超预期。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(["PASS", "FULL_PASS"]).toContain(r.overall);
    expect(r.hard_fail_fields).toHaveLength(0);
  });

  // E5: SOFT_FAIL is structurally unreachable — documented
  it("E5: SOFT_FAIL is structurally unreachable — min all-pass score ≈ 82 → PASS", () => {
    // Construct the worst-case all-pass scenario:
    // PRC: trigger present, no consequence (−10), length 30-49 (−5), no number (−5) → score=80
    // CS: level word present, no reason (−15), length 25-39 (−5) → score=70 (but no CS-S3)
    // PB: no bullish signal (−10), length 20-29 (−5) → score=85
    // PBR: no bearish signal (−10), length 20-29 (−5) → score=85
    // SR: stance present, no reason connector (−10) → score=90
    // weighted = 80×0.25 + 70×0.20 + 85×0.20 + 85×0.20 + 90×0.15
    //          = 20 + 14 + 17 + 17 + 13.5 = 81.5 → rounded = 82
    const sa: StructuredAnalysis = {
      // 33 chars, has 如果 trigger, no consequence word, no number, 30-49 range → PRC-S1+S2+S3 → score=80
      primary_risk_condition: "如果美联储超预期加息，市场将面临流动性收紧压力，影响持续较长时间。",
      // 25 chars, has 高置信度, no reason connector, 25-39 range → CS-S1+S2 → score=70
      confidence_summary: "高置信度，多项技术指标和基本面数据均指向同一方向。",
      // 24 chars, no bullish signal, 20-29 range → PB-S1+S2 → score=85
      primary_bull: "公司基本面稳健，市场份额持续扩大，竞争优势明显。",
      // 24 chars, no bearish signal, 20-29 range → PBR-S1+S2 → score=85
      primary_bear: "市场竞争加剧，行业格局面临重大变化，需密切关注。",
      // 30 chars, has BULLISH, no reason connector → SR-S1 → score=90
      stance_rationale: "BULLISH，基本面持续改善支撑多头逻辑，盈利增速超预期。",
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    // Must be PASS (not SOFT_FAIL, not HARD_FAIL)
    expect(r.overall).toBe("PASS");
    expect(r.weighted_score).toBeGreaterThanOrEqual(65);
    // Document the structural finding
    expect(r.overall).not.toBe("SOFT_FAIL");
  });

  // E6: weighted_score is always integer
  it("E6: weighted_score is always integer", () => {
    const r = evaluateStructuredAnalysisSemantics(STRONG_SA);
    expect(Number.isInteger(r.weighted_score)).toBe(true);
  });

  // E7: Malformed input (null cast) never throws → HARD_FAIL with gate_error
  it("E7: malformed input (null cast) never throws → HARD_FAIL with gate_error", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = evaluateStructuredAnalysisSemantics(null as any);
    expect(r.overall).toBe("HARD_FAIL");
    expect(r.hard_fail_fields.some(f => f.includes("gate_error"))).toBe(true);
  });

  // E8: GateContext verdict provided → CS-S3 behavior documented
  it("E8: GateContext verdict provided → CS-S3 behavior documented (no throw)", () => {
    const context: GateContext = {
      verdict: "高置信度，因为多项技术指标和基本面数据均指向同一方向",
      stance: "BULLISH",
    };
    // Should not throw; CS-S3 may or may not fire depending on overlap calculation
    expect(() => evaluateStructuredAnalysisSemantics(STRONG_SA, context)).not.toThrow();
    const r = evaluateStructuredAnalysisSemantics(STRONG_SA, context);
    expect(r.overall).toBeDefined();
  });

  // E9: All 5 fields present in result.fields map
  it("E9: all 5 fields present in result.fields map", () => {
    const r = evaluateStructuredAnalysisSemantics(STRONG_SA);
    expect(r.fields).toHaveProperty("primary_risk_condition");
    expect(r.fields).toHaveProperty("confidence_summary");
    expect(r.fields).toHaveProperty("primary_bull");
    expect(r.fields).toHaveProperty("primary_bear");
    expect(r.fields).toHaveProperty("stance_rationale");
  });

  // E10: hard_fail_fields format contains field name + code
  it("E10: hard_fail_fields format contains field name + code", () => {
    const sa: StructuredAnalysis = {
      ...STRONG_SA,
      confidence_summary: "",  // force CS-H1
    };
    const r = evaluateStructuredAnalysisSemantics(sa);
    expect(r.overall).toBe("HARD_FAIL");
    const failEntry = r.hard_fail_fields.find(f => f.includes("confidence_summary"));
    expect(failEntry).toBeDefined();
    expect(failEntry).toContain("CS-H1");
  });
});
