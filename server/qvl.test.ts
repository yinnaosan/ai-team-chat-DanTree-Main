/**
 * server/qvl.test.ts
 * DANTREE_EVAL_MOVE1_QVL_DETERMINISTIC_TESTS
 *
 * 63 tests across 4 groups.
 * Synthetic stubs only — no network, LLM, or DB dependencies.
 * Tests the three QVL deterministic engines:
 *   - qvlBridge.ts (Group A)
 *   - reverseDcfEngine.ts (Group B)
 *   - cnHkValuationEngine.ts (Group C)
 *   - Shape contract checks (Group D)
 */

import { describe, it, expect } from "vitest";
import {
  computeLightweightPositionSizing,
  type LightweightQvlContext,
  type LightweightSizeBucket,
} from "./qvlBridge";
import { computeValuationContext } from "./reverseDcfEngine";
import { computeCnHkValuationContext } from "./cnHkValuationEngine";
import type { FmpStockData } from "./fmpApi";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeCtx(
  stance: string,
  confidence: string,
  highRiskCount = 0,
  stability?: string
): LightweightQvlContext {
  const invalidation_conditions = Array.from({ length: highRiskCount }, () => ({
    condition: "test condition",
    probability: "HIGH" as const,
  }));
  return {
    stance: stance as LightweightQvlContext["stance"],
    confidence: confidence as LightweightQvlContext["confidence"],
    invalidation_conditions,
    stability: stability as LightweightQvlContext["stability"],
  };
}

function makeFmp(
  dcfValue: number | null,
  price: number | null,
  dcfDate: string | null = "2024-01-01",
  incomeStatements: Array<{ revenue: number }> = [],
  evToEbitda: number | null = null,
  pfcfRatio: number | null = null
): FmpStockData {
  return {
    dcf: dcfValue !== null ? { dcf: dcfValue, date: dcfDate ?? "2024-01-01" } : null,
    quote: price !== null ? { price } : null,
    keyMetrics: evToEbitda !== null || pfcfRatio !== null
      ? [{ enterpriseValueOverEBITDA: evToEbitda, pfcfRatio }]
      : [],
    incomeStatements,
  } as unknown as FmpStockData;
}

function makeCnText(pe: number | string, pb: number | string, revenueGrowth?: number | string): string {
  const lines = [
    "| 指标 | 数值 |",
    "|------|------|",
    `| 市盈率 | ${pe} |`,
    `| 市净率 | ${pb} |`,
  ];
  if (revenueGrowth !== undefined) {
    lines.push(`| 营收同比增长 | ${revenueGrowth} |`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — qvlBridge.ts (13 cases)
// ─────────────────────────────────────────────────────────────────────────────

describe("Group A — qvlBridge: computeLightweightPositionSizing", () => {
  it("A1: BULLISH × HIGH → size_bucket = medium", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "HIGH"));
    expect(r.size_bucket).toBe("medium");
  });

  it("A2: BULLISH × MEDIUM → size_bucket = small", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "MEDIUM"));
    expect(r.size_bucket).toBe("small");
  });

  it("A3: BULLISH × LOW → size_bucket = starter", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "LOW"));
    expect(r.size_bucket).toBe("starter");
  });

  it("A4: NEUTRAL × any → size_bucket = starter", () => {
    const r = computeLightweightPositionSizing(makeCtx("NEUTRAL", "HIGH"));
    expect(r.size_bucket).toBe("starter");
  });

  it("A5: BEARISH → size_bucket = none", () => {
    const r = computeLightweightPositionSizing(makeCtx("BEARISH", "HIGH"));
    expect(r.size_bucket).toBe("none");
  });

  it("A6: UNCERTAIN → size_bucket = none", () => {
    const r = computeLightweightPositionSizing(makeCtx("UNCERTAIN", "HIGH"));
    expect(r.size_bucket).toBe("none");
  });

  it("A7: ≥3 HIGH invalidations → step down medium → small", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "HIGH", 3));
    expect(r.size_bucket).toBe("small");
  });

  it("A7b: exactly 2 HIGH → no step-down, medium stays", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "HIGH", 2));
    expect(r.size_bucket).toBe("medium");
  });

  it("A8: stability=REVERSED → step down small → starter", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "MEDIUM", 0, "REVERSED"));
    expect(r.size_bucket).toBe("starter");
  });

  it("A9: ≥3 HIGH + REVERSED → double step medium → starter", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "HIGH", 3, "REVERSED"));
    expect(r.size_bucket).toBe("starter");
  });

  it("A9b: starter + REVERSED → floor at none", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "LOW", 0, "REVERSED"));
    expect(r.size_bucket).toBe("none");
  });

  it("A10: stability=undefined → no modifier applied", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "HIGH", 0, undefined));
    expect(r.size_bucket).toBe("medium");
  });

  it("A11: advisory_only === true (strict)", () => {
    const r = computeLightweightPositionSizing(makeCtx("BULLISH", "HIGH"));
    expect(r.advisory_only).toStrictEqual(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP B — reverseDcfEngine.ts (18 cases)
// ─────────────────────────────────────────────────────────────────────────────

describe("Group B — reverseDcfEngine: computeValuationContext", () => {
  it("B1: null input → returns null", () => {
    expect(computeValuationContext(null)).toBeNull();
  });

  it("B2a: dcf=null, price=100 → insufficient_data", () => {
    const r = computeValuationContext(makeFmp(null, 100));
    expect(r?.valuation_label).toBe("insufficient_data");
  });

  it("B2b: dcf=null → implied_upside_pct = null", () => {
    const r = computeValuationContext(makeFmp(null, 100));
    expect(r?.implied_upside_pct).toBeNull();
  });

  it("B2c: price=null → insufficient_data", () => {
    const r = computeValuationContext(makeFmp(130, null));
    expect(r?.valuation_label).toBe("insufficient_data");
  });

  it("B2d: price=0 (division guard) → insufficient_data", () => {
    const r = computeValuationContext(makeFmp(130, 0));
    expect(r?.valuation_label).toBe("insufficient_data");
  });

  it("B3: dcf=130, price=100 → cheap, upside≈30%", () => {
    const r = computeValuationContext(makeFmp(130, 100));
    expect(r?.valuation_label).toBe("cheap");
    expect(r?.implied_upside_pct).toBeCloseTo(30, 0);
  });

  it("B4: dcf=108, price=100 → fair, upside≈8%", () => {
    const r = computeValuationContext(makeFmp(108, 100));
    expect(r?.valuation_label).toBe("fair");
    expect(r?.implied_upside_pct).toBeCloseTo(8, 0);
  });

  it("B5: dcf=85, price=100 → expensive, upside≈-15%", () => {
    const r = computeValuationContext(makeFmp(85, 100));
    expect(r?.valuation_label).toBe("expensive");
    expect(r?.implied_upside_pct).toBeCloseTo(-15, 0);
  });

  it("B5b: upside=20.1% boundary → cheap", () => {
    // price=100, dcf=120.1 → upside=20.1%
    const r = computeValuationContext(makeFmp(120.1, 100));
    expect(r?.valuation_label).toBe("cheap");
  });

  it("B5c: upside=-10% boundary → fair", () => {
    // price=100, dcf=90 → upside=-10%
    const r = computeValuationContext(makeFmp(90, 100));
    expect(r?.valuation_label).toBe("fair");
  });

  it("B6a: 3 revenues [121,110,100] → growth≈10%", () => {
    const r = computeValuationContext(
      makeFmp(130, 100, "2024-01-01", [{ revenue: 121 }, { revenue: 110 }, { revenue: 100 }])
    );
    expect(r?.revenue_growth_3yr).toBeCloseTo(10, 0);
  });

  it("B6b: only 2 revenues → revenue_growth_3yr = null", () => {
    const r = computeValuationContext(
      makeFmp(130, 100, "2024-01-01", [{ revenue: 110 }, { revenue: 100 }])
    );
    expect(r?.revenue_growth_3yr).toBeNull();
  });

  it("B6c: prior revenue = 0 → revenue_growth_3yr = null", () => {
    const r = computeValuationContext(
      makeFmp(130, 100, "2024-01-01", [{ revenue: 110 }, { revenue: 100 }, { revenue: 0 }])
    );
    expect(r?.revenue_growth_3yr).toBeNull();
  });

  it("B7: data_source = 'fmp'", () => {
    const r = computeValuationContext(makeFmp(130, 100));
    expect(r?.data_source).toBe("fmp");
  });

  it("B8: advisory_only === true (strict)", () => {
    const r = computeValuationContext(makeFmp(130, 100));
    expect(r?.advisory_only).toStrictEqual(true);
  });

  it("B8b: simplified_note is non-empty string (length > 10)", () => {
    const r = computeValuationContext(makeFmp(130, 100));
    expect(typeof r?.simplified_note).toBe("string");
    expect((r?.simplified_note ?? "").length).toBeGreaterThan(10);
  });

  it("B9: ev_to_ebitda and pfcf_ratio populated from keyMetrics", () => {
    const r = computeValuationContext(makeFmp(130, 100, "2024-01-01", [], 15.5, 22.3));
    expect(r?.ev_to_ebitda).toBeCloseTo(15.5, 1);
    expect(r?.pfcf_ratio).toBeCloseTo(22.3, 1);
  });

  it("B10: dcf_model_date populated from fmp.dcf.date", () => {
    const r = computeValuationContext(makeFmp(130, 100, "2024-03-15"));
    expect(r?.dcf_model_date).toBe("2024-03-15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP C — cnHkValuationEngine.ts (19 cases)
// ─────────────────────────────────────────────────────────────────────────────

describe("Group C — cnHkValuationEngine: computeCnHkValuationContext", () => {
  it("C1: null text → returns null", () => {
    expect(computeCnHkValuationContext(null, "CN")).toBeNull();
  });

  it("C2a: empty string → returns null", () => {
    expect(computeCnHkValuationContext("", "CN")).toBeNull();
  });

  it("C2b: whitespace-only → returns null", () => {
    expect(computeCnHkValuationContext("   \n  ", "CN")).toBeNull();
  });

  it("C3: CN PE=10 (< 12) → cheap", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8), "CN");
    expect(r?.valuation_label).toBe("cheap");
  });

  it("C4a: CN PE=20 (12–30) → fair", () => {
    const r = computeCnHkValuationContext(makeCnText(20, 1.5), "CN");
    expect(r?.valuation_label).toBe("fair");
  });

  it("C4b: CN PE=12 (boundary) → fair", () => {
    const r = computeCnHkValuationContext(makeCnText(12, 1.5), "CN");
    expect(r?.valuation_label).toBe("fair");
  });

  it("C5: CN PE=40 (> 30) → expensive", () => {
    const r = computeCnHkValuationContext(makeCnText(40, 2.0), "CN");
    expect(r?.valuation_label).toBe("expensive");
  });

  it("C6a: HK PE=6 (< 8) → cheap", () => {
    const r = computeCnHkValuationContext(makeCnText(6, 0.7), "HK");
    expect(r?.valuation_label).toBe("cheap");
  });

  it("C6b: HK PE=14 (8–20) → fair", () => {
    const r = computeCnHkValuationContext(makeCnText(14, 1.2), "HK");
    expect(r?.valuation_label).toBe("fair");
  });

  it("C6c: HK PE=25 (> 20) → expensive", () => {
    const r = computeCnHkValuationContext(makeCnText(25, 2.5), "HK");
    expect(r?.valuation_label).toBe("expensive");
  });

  it("C7a: PE=N/A, PB=N/A → insufficient_data", () => {
    const r = computeCnHkValuationContext(makeCnText("N/A", "N/A"), "CN");
    expect(r?.valuation_label).toBe("insufficient_data");
  });

  it("C7b: Markdown with no PE/PB rows → insufficient_data", () => {
    const text = "| 指标 | 数值 |\n|------|------|\n| 营收 | 100亿 |";
    const r = computeCnHkValuationContext(text, "CN");
    expect(r?.valuation_label).toBe("insufficient_data");
  });

  it("C8: market=CN → data_source = 'baostock_proxy'", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8), "CN");
    expect(r?.data_source).toBe("baostock_proxy");
  });

  it("C9: market=HK → data_source = 'hk_akshare_proxy'", () => {
    const r = computeCnHkValuationContext(makeCnText(6, 0.7), "HK");
    expect(r?.data_source).toBe("hk_akshare_proxy");
  });

  it("C10a: advisory_only CN → toStrictEqual(true)", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8), "CN");
    expect(r?.advisory_only).toStrictEqual(true);
  });

  it("C10b: advisory_only HK → true", () => {
    const r = computeCnHkValuationContext(makeCnText(6, 0.7), "HK");
    expect(r?.advisory_only).toStrictEqual(true);
  });

  it("C10c: advisory_only even on insufficient_data → true", () => {
    const r = computeCnHkValuationContext(makeCnText("N/A", "N/A"), "CN");
    expect(r?.advisory_only).toStrictEqual(true);
  });

  it("C11a: revenue growth 8.3% → revenue_growth_3yr ≈ 8.3", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8, 8.3), "CN");
    expect(r?.revenue_growth_3yr).toBeCloseTo(8.3, 1);
  });

  it("C11b: revenue growth N/A → revenue_growth_3yr = null", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8, "N/A"), "CN");
    expect(r?.revenue_growth_3yr).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP D — Shape Contract (13 cases)
// ─────────────────────────────────────────────────────────────────────────────

describe("Group D — Shape Contract", () => {
  const qvlResult = computeLightweightPositionSizing(makeCtx("BULLISH", "HIGH"));
  const dcfResult = computeValuationContext(makeFmp(130, 100))!;
  const cnResult = computeCnHkValuationContext(makeCnText(10, 0.8), "CN")!;
  const hkResult = computeCnHkValuationContext(makeCnText(6, 0.7), "HK")!;

  // D1: LightweightQvlOutput required fields
  it("D1: LightweightQvlOutput — all required fields present", () => {
    const requiredFields = [
      "size_bucket", "target_pct_range", "rationale",
      "advisory_only", "_inputs",
    ];
    for (const f of requiredFields) {
      expect(qvlResult).toHaveProperty(f);
    }
  });

  it("D1b: LightweightQvlOutput._inputs fields: stance, confidence, high_risk_count, stability", () => {
    expect(qvlResult._inputs).toHaveProperty("stance");
    expect(qvlResult._inputs).toHaveProperty("confidence");
    expect(qvlResult._inputs).toHaveProperty("high_risk_count");
    expect(qvlResult._inputs).toHaveProperty("stability");
  });

  // D2: QvlValuationOutput (reverseDcfEngine) required fields
  it("D2: QvlValuationOutput (reverseDcfEngine) — all required fields present", () => {
    const requiredFields = [
      "fmp_dcf_fair_value", "dcf_model_date", "current_price",
      "implied_upside_pct", "valuation_label", "ev_to_ebitda",
      "pfcf_ratio", "revenue_growth_3yr", "data_source",
      "advisory_only", "simplified_note",
    ];
    for (const f of requiredFields) {
      expect(dcfResult).toHaveProperty(f);
    }
  });

  // D3a: QvlValuationOutput (cnHkValuationEngine CN) required fields
  it("D3a: QvlValuationOutput (cnHkValuationEngine CN) — all required fields present", () => {
    const requiredFields = [
      "fmp_dcf_fair_value", "dcf_model_date", "current_price",
      "implied_upside_pct", "valuation_label", "ev_to_ebitda",
      "pfcf_ratio", "revenue_growth_3yr", "data_source",
      "advisory_only", "simplified_note",
    ];
    for (const f of requiredFields) {
      expect(cnResult).toHaveProperty(f);
    }
  });

  // D3b: QvlValuationOutput (cnHkValuationEngine HK) required fields
  it("D3b: QvlValuationOutput (cnHkValuationEngine HK) — all required fields present", () => {
    const requiredFields = [
      "fmp_dcf_fair_value", "dcf_model_date", "current_price",
      "implied_upside_pct", "valuation_label", "ev_to_ebitda",
      "pfcf_ratio", "revenue_growth_3yr", "data_source",
      "advisory_only", "simplified_note",
    ];
    for (const f of requiredFields) {
      expect(hkResult).toHaveProperty(f);
    }
  });

  // D4: advisory_only strict checks
  it("D4a: qvlBridge advisory_only strict", () => {
    expect(qvlResult.advisory_only).toStrictEqual(true);
  });

  it("D4b: reverseDcfEngine advisory_only strict", () => {
    expect(dcfResult.advisory_only).toStrictEqual(true);
  });

  it("D4c: cnHkValuationEngine advisory_only strict", () => {
    expect(cnResult.advisory_only).toStrictEqual(true);
  });

  it("D4d: advisory_only never false for BEARISH/UNCERTAIN", () => {
    const bearish = computeLightweightPositionSizing(makeCtx("BEARISH", "HIGH"));
    const uncertain = computeLightweightPositionSizing(makeCtx("UNCERTAIN", "HIGH"));
    expect(bearish.advisory_only).toStrictEqual(true);
    expect(uncertain.advisory_only).toStrictEqual(true);
  });

  // D5: size_bucket always in valid set (all 12 stance×confidence combos)
  it("D5: size_bucket always in valid set (all stance×confidence combos)", () => {
    const stances = ["BULLISH", "NEUTRAL", "BEARISH", "UNCERTAIN"];
    const confidences = ["HIGH", "MEDIUM", "LOW"];
    const validBuckets: LightweightSizeBucket[] = ["none", "starter", "small", "medium", "large"];
    for (const stance of stances) {
      for (const confidence of confidences) {
        const r = computeLightweightPositionSizing(makeCtx(stance, confidence));
        expect(validBuckets).toContain(r.size_bucket);
      }
    }
  });

  // D6a: reverseDcfEngine valuation_label always in valid set
  it("D6a: reverseDcfEngine valuation_label always in valid set", () => {
    const validLabels = ["cheap", "fair", "expensive", "insufficient_data"];
    const cases = [
      makeFmp(130, 100),   // cheap
      makeFmp(108, 100),   // fair
      makeFmp(85, 100),    // expensive
      makeFmp(null, 100),  // insufficient_data
    ];
    for (const c of cases) {
      const r = computeValuationContext(c);
      if (r) expect(validLabels).toContain(r.valuation_label);
    }
  });

  // D6b: cnHkValuationEngine valuation_label always in valid set
  it("D6b: cnHkValuationEngine valuation_label always in valid set", () => {
    const validLabels = ["cheap", "fair", "expensive", "insufficient_data"];
    const cases = [
      makeCnText(10, 0.8),    // cheap
      makeCnText(20, 1.5),    // fair
      makeCnText(40, 2.0),    // expensive
      makeCnText("N/A", "N/A"), // insufficient_data
    ];
    for (const text of cases) {
      const r = computeCnHkValuationContext(text, "CN");
      if (r) expect(validLabels).toContain(r.valuation_label);
    }
  });
});
