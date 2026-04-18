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

function makeCnText(
  pe: number | string,
  pb: number | string,
  revenueGrowth?: number | string,
  opts?: { roe?: number | string; netMargin?: number | string; debtToEquity?: number | string }
): string {
  const lines = [
    "| 指标 | 数值 |",
    "|------|------|",
    `| 市盈率 | ${pe} |`,
    `| 市净率 | ${pb} |`,
  ];
  if (revenueGrowth !== undefined) {
    lines.push(`| 营收同比增长 | ${revenueGrowth} |`);
  }
  if (opts?.roe !== undefined) {
    lines.push(`| 净资产收益率 | ${opts.roe} |`);
  }
  if (opts?.netMargin !== undefined) {
    lines.push(`| 净利率 | ${opts.netMargin} |`);
  }
  if (opts?.debtToEquity !== undefined) {
    lines.push(`| 负债权益比 | ${opts.debtToEquity} |`);
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

  // ── C12: Leverage floor (D/E > 2.5 → cheap → fair) ─────────────────────────
  it("C12a: cheap base + D/E 3.0 → fair (leverage floor)", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8, undefined, { debtToEquity: 3.0 }), "CN");
    expect(r?.valuation_label).toBe("fair");
  });

  it("C12b: cheap base + D/E 2.5 → cheap (boundary: not > 2.5)", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8, undefined, { debtToEquity: 2.5 }), "CN");
    expect(r?.valuation_label).toBe("cheap");
  });

  it("C12c: expensive base + D/E 4.0 → expensive (downward-only, no change)", () => {
    const r = computeCnHkValuationContext(makeCnText(40, 2.0, undefined, { debtToEquity: 4.0 }), "CN");
    expect(r?.valuation_label).toBe("expensive");
  });

  it("C12d: cheap base + D/E absent → cheap (no leverage data, no adjustment)", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8), "CN");
    expect(r?.valuation_label).toBe("cheap");
  });

  // ── C13: Dual-signal quality downgrade (ROE < 8 AND netMargin < 4 → cheap → fair) ─
  it("C13a: cheap base + ROE 5% + netMargin 2% → fair (dual-signal downgrade)", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8, undefined, { roe: 5, netMargin: 2 }), "CN");
    expect(r?.valuation_label).toBe("fair");
  });

  it("C13b: cheap base + ROE 5% only (no netMargin) → cheap (single signal preserved)", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8, undefined, { roe: 5 }), "CN");
    expect(r?.valuation_label).toBe("cheap");
  });

  it("C13c: cheap base + netMargin 2% only (no ROE) → cheap (single signal preserved)", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8, undefined, { netMargin: 2 }), "CN");
    expect(r?.valuation_label).toBe("cheap");
  });

  it("C13d: cheap base + ROE 12% + netMargin 6% → cheap (both above floor, no downgrade)", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8, undefined, { roe: 12, netMargin: 6 }), "CN");
    expect(r?.valuation_label).toBe("cheap");
  });

  // ── C14: Priority — leverage floor takes precedence over quality downgrade ──
  it("C14a: D/E 3.5 + ROE 5% + netMargin 2% → fair (leverage floor fires first)", () => {
    const r = computeCnHkValuationContext(makeCnText(10, 0.8, undefined, { debtToEquity: 3.5, roe: 5, netMargin: 2 }), "CN");
    expect(r?.valuation_label).toBe("fair");
  });

  it("C14b: HK cheap base + D/E 3.0 → fair (leverage floor applies to HK too)", () => {
    const r = computeCnHkValuationContext(makeCnText(6, 0.7, undefined, { debtToEquity: 3.0 }), "HK");
    expect(r?.valuation_label).toBe("fair");
  });

  it("C14c: insufficient_data base + D/E 3.0 → insufficient_data (downward-only, no change)", () => {
    const r = computeCnHkValuationContext(makeCnText("N/A", "N/A", undefined, { debtToEquity: 3.0 }), "CN");
    expect(r?.valuation_label).toBe("insufficient_data");
  });

  it("C14d: fair base + ROE 5% + netMargin 2% → fair (downward-only: fair not upgraded/changed)", () => {
    const r = computeCnHkValuationContext(makeCnText(20, 1.5, undefined, { roe: 5, netMargin: 2 }), "CN");
    expect(r?.valuation_label).toBe("fair");
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

// ─────────────────────────────────────────────────────────────────────────────
// GROUP C15 — Structured-first path (9 cases)
// DANTREE_HKCN_DATA_MOVE2_STRUCTURED_PASS_THROUGH
// ─────────────────────────────────────────────────────────────────────────────

// Helper: build a minimal ChinaFundamentalsResponse stub (synthetic — no network)
function makeStructured(
  raw: Partial<{
    pe: number | null;
    pb: number | null;
    roe: number | null;
    netMargin: number | null;
    debtToEquity: number | null;
    revenueGrowthYoy: number | null;
  }>,
  opts?: { periodEndDate?: string | null; confidence?: string | null }
): import("./fetchChinaFundamentals").ChinaFundamentalsResponse {
  const fullRaw = {
    pe: raw.pe ?? null,
    pb: raw.pb ?? null,
    ps: null,
    roe: raw.roe ?? null,
    grossMargin: null,
    netMargin: raw.netMargin ?? null,
    revenue: null,
    netIncome: null,
    eps: null,
    operatingMargin: null,
    roa: null,
    debtToEquity: raw.debtToEquity ?? null,
    currentRatio: null,
    cashFromOperations: null,
    freeCashFlow: null,
    revenueGrowthYoy: raw.revenueGrowthYoy ?? null,
    netIncomeGrowthYoy: null,
    bookValuePerShare: null,
    dividendYield: null,
    sharesOutstanding: null,
    fiscalYear: null,
    periodType: null,
    periodEndDate: opts?.periodEndDate ?? null,
    sourceType: null,
    confidence: opts?.confidence ?? null,
  };
  return {
    raw: fullRaw,
    fmt: {} as import("./fetchChinaFundamentals").ChinaFundamentalsFmt,
    source: "baostock",
    sourceType: "official_free",
    confidence: opts?.confidence ?? "high",
    status: "active",
    coverageScore: 1,
    missingFields: [],
    permanentlyUnavailable: [],
    periodType: null,
    periodEndDate: opts?.periodEndDate ?? null,
    symbol: "TEST",
    fetched_at: Date.now(),
  };
}

describe("Group C15 — cnHkValuationEngine: structured-first path", () => {
  // C15a: Structured PE=8 overrides markdown PE=40 → cheap (structured wins)
  it("C15a: structured PE=8 overrides markdown PE=40 → cheap", () => {
    const text = makeCnText(40, 2.0);  // markdown says expensive
    const structured = makeStructured({ pe: 8, pb: 0.9 });
    const r = computeCnHkValuationContext(text, "CN", structured);
    expect(r?.valuation_label).toBe("cheap");
  });

  // C15b: Structured PE=35 overrides markdown PE=8 → expensive (structured wins)
  it("C15b: structured PE=35 overrides markdown PE=8 → expensive", () => {
    const text = makeCnText(8, 0.8);   // markdown says cheap
    const structured = makeStructured({ pe: 35, pb: 2.0 });
    const r = computeCnHkValuationContext(text, "CN", structured);
    expect(r?.valuation_label).toBe("expensive");
  });

  // C15c: Structured ROE=2% + netMargin=1% + PE=8 → fair (quality downgrade)
  it("C15c: structured ROE=2% + netMargin=1% + PE=8 → fair (quality downgrade)", () => {
    const text = makeCnText(8, 0.8);
    const structured = makeStructured({ pe: 8, pb: 0.8, roe: 2, netMargin: 1 });
    const r = computeCnHkValuationContext(text, "CN", structured);
    expect(r?.valuation_label).toBe("fair");
  });

  // C15d: Structured D/E=3.5 + PE=8 → fair (leverage floor)
  it("C15d: structured D/E=3.5 + PE=8 → fair (leverage floor)", () => {
    const text = makeCnText(8, 0.8);
    const structured = makeStructured({ pe: 8, pb: 0.8, debtToEquity: 3.5 });
    const r = computeCnHkValuationContext(text, "CN", structured);
    expect(r?.valuation_label).toBe("fair");
  });

  // C15e: periodEndDate='2024-06-30' in structured → dcf_model_date='2024-06-30'
  it("C15e: periodEndDate from structured carries to dcf_model_date", () => {
    const text = makeCnText(10, 0.9);
    const structured = makeStructured({ pe: 10 }, { periodEndDate: "2024-06-30" });
    const r = computeCnHkValuationContext(text, "CN", structured);
    expect(r?.dcf_model_date).toBe("2024-06-30");
  });

  // C15f: confidence='medium' — interface still intact, advisory_only=true
  it("C15f: confidence='medium' — advisory_only=true, label correct", () => {
    const text = makeCnText(10, 0.9);
    const structured = makeStructured({ pe: 10, pb: 0.9 }, { confidence: "medium" });
    const r = computeCnHkValuationContext(text, "CN", structured);
    expect(r?.advisory_only).toStrictEqual(true);
    expect(r?.valuation_label).toBe("cheap");
  });

  // C15g: Structured pe=null/pb=null → falls back to markdown PE=8 → cheap
  it("C15g: structured pe=null/pb=null → markdown fallback PE=8 → cheap", () => {
    const text = makeCnText(8, 0.8);
    const structured = makeStructured({ pe: null, pb: null });
    const r = computeCnHkValuationContext(text, "CN", structured);
    expect(r?.valuation_label).toBe("cheap");
  });

  // C15h: HK market, structured PE=6 (< 8 threshold) → cheap
  it("C15h: HK market, structured PE=6 → cheap", () => {
    const text = makeCnText(6, 0.7);
    const structured = makeStructured({ pe: 6, pb: 0.7 });
    const r = computeCnHkValuationContext(text, "HK", structured);
    expect(r?.valuation_label).toBe("cheap");
  });

  // C15i: advisory_only with structured path → toStrictEqual(true)
  it("C15i: advisory_only with structured path → true", () => {
    const text = makeCnText(10, 0.9);
    const structured = makeStructured({ pe: 10, pb: 0.9 });
    const r = computeCnHkValuationContext(text, "CN", structured);
    expect(r?.advisory_only).toStrictEqual(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP C16 — Fallback path and null guards (6 cases)
// DANTREE_HKCN_DATA_MOVE2_STRUCTURED_PASS_THROUGH
// ─────────────────────────────────────────────────────────────────────────────

describe("Group C16 — cnHkValuationEngine: fallback path and null guards", () => {
  // C16a: No third arg → markdown fallback (existing behavior — cheap from PE=8)
  it("C16a: no third arg → markdown fallback → cheap", () => {
    const text = makeCnText(8, 0.8);
    const r = computeCnHkValuationContext(text, "CN");
    expect(r?.valuation_label).toBe("cheap");
  });

  // C16b: structured=null → markdown fallback → cheap
  it("C16b: structured=null → markdown fallback → cheap", () => {
    const text = makeCnText(8, 0.8);
    const r = computeCnHkValuationContext(text, "CN", null);
    expect(r?.valuation_label).toBe("cheap");
  });

  // C16c: structured=undefined → markdown fallback → cheap
  it("C16c: structured=undefined → markdown fallback → cheap", () => {
    const text = makeCnText(8, 0.8);
    const r = computeCnHkValuationContext(text, "CN", undefined);
    expect(r?.valuation_label).toBe("cheap");
  });

  // C16d: null text AND null structured → returns null
  it("C16d: null text AND null structured → returns null", () => {
    const r = computeCnHkValuationContext(null, "CN", null);
    expect(r).toBeNull();
  });

  // C16e: null text but structured.raw.pe=10 present → cheap (structured fills gap)
  it("C16e: null text but structured.raw.pe=10 → cheap (structured fills gap)", () => {
    const structured = makeStructured({ pe: 10, pb: 0.9 });
    const r = computeCnHkValuationContext(null, "CN", structured);
    expect(r?.valuation_label).toBe("cheap");
  });

  // C16f: no structured → dcf_model_date = null
  it("C16f: no structured → dcf_model_date = null", () => {
    const text = makeCnText(10, 0.9);
    const r = computeCnHkValuationContext(text, "CN");
    expect(r?.dcf_model_date).toBeNull();
  });
});
