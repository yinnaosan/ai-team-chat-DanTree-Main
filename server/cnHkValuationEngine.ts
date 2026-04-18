/**
 * cnHkValuationEngine.ts
 * DANTREE_CNHK_QVL_VALUATION_EXTENSION
 *
 * Lightweight PE/PB relative-value proxy for CN (A股) and HK (港股) markets.
 * NOT a DCF model — labels are derived from threshold comparisons calibrated
 * to historical A-share / HK market multiples.
 *
 * Input:  orchFundamentalsData (markdown from baostock / hk_akshare)
 * Output: QvlValuationOutput | null (same shape as reverseDcfEngine output)
 *
 * Priority: US FMP path has priority. This engine is a fallback only.
 * advisory_only: true — hard-coded, non-overridable.
 */

export interface QvlValuationOutput {
  fmp_dcf_fair_value: number | null;
  dcf_model_date: string | null;
  current_price: number | null;
  implied_upside_pct: number | null;
  valuation_label: "cheap" | "fair" | "expensive" | "insufficient_data";
  ev_to_ebitda: number | null;
  pfcf_ratio: number | null;
  revenue_growth_3yr: number | null;
  data_source: string;
  advisory_only: true;
  simplified_note: string;
}

// ── Markdown parser ────────────────────────────────────────────────────────────
// Extracts numeric values from baostock/hk_akshare markdown table rows.
// Both CN (A股基本面数据) and HK (港股基本面数据) use the same label patterns.

function parseNumericFromMarkdown(text: string, labelPattern: RegExp): number | null {
  const lines = text.split("\n");
  for (const line of lines) {
    if (labelPattern.test(line)) {
      // Match pipe-delimited table cell: | label | value |
      const match = line.match(/\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
      if (match) {
        const raw = match[2].trim().replace(/%$/, "").replace(/,/g, "");
        const n = parseFloat(raw);
        if (!isNaN(n)) return n;
      }
    }
  }
  return null;
}

// ── Valuation label logic ──────────────────────────────────────────────────────
// Conservative thresholds to minimize false precision.
// CN (A股): PE < 12 → cheap; PE > 30 → expensive; PB ≤ 1.0 → cheap signal
// HK (港股): PE < 8  → cheap; PE > 20 → expensive; PB ≤ 0.8 → cheap signal
// Majority signal of PE+PB wins; tie → fair

function deriveLabelFromMultiples(
  pe: number | null,
  pb: number | null,
  market: "CN" | "HK"
): "cheap" | "fair" | "expensive" | "insufficient_data" {
  if (pe === null && pb === null) return "insufficient_data";

  const peCheapThreshold = market === "CN" ? 12 : 8;
  const peExpensiveThreshold = market === "CN" ? 30 : 20;
  const pbCheapThreshold = market === "CN" ? 1.0 : 0.8;

  let cheapVotes = 0;
  let expensiveVotes = 0;

  if (pe !== null) {
    if (pe < peCheapThreshold) cheapVotes++;
    else if (pe > peExpensiveThreshold) expensiveVotes++;
    // else: neutral
  }
  if (pb !== null) {
    if (pb <= pbCheapThreshold) cheapVotes++;
    // PB alone doesn't signal expensive — high PB can reflect growth premium
  }

  if (cheapVotes > expensiveVotes) return "cheap";
  if (expensiveVotes > cheapVotes) return "expensive";
  return "fair";
}

// ── Main export ────────────────────────────────────────────────────────────────

export function computeCnHkValuationContext(
  fundamentalsText: string | null | undefined,
  market: "CN" | "HK"
): QvlValuationOutput | null {
  // Guard: empty/absent fundamentals → no attachment
  if (!fundamentalsText || fundamentalsText.trim().length === 0) return null;

  // Parse PE, PB, revenue growth from markdown
  const pe = parseNumericFromMarkdown(fundamentalsText, /市盈率/);
  const pb = parseNumericFromMarkdown(fundamentalsText, /市净率/);
  const revenueGrowthYoy = parseNumericFromMarkdown(fundamentalsText, /营收同比增长/);

  const valuation_label = deriveLabelFromMultiples(pe, pb, market);

  const dataSource = market === "CN" ? "baostock_proxy" : "hk_akshare_proxy";
  const disclaimer =
    market === "CN"
      ? "A股相对估值参考（非DCF内在价值模型）。基于PE/PB市场均值阈值，未考虑行业差异。仅供参考，不构成买卖建议。"
      : "港股相对估值参考（非DCF内在价值模型）。基于PE/PB市场均值阈值，未考虑行业差异。仅供参考，不构成买卖建议。";

  return {
    fmp_dcf_fair_value: null,       // N/A — no DCF model for CN/HK
    dcf_model_date: null,           // N/A
    current_price: null,            // Not parsed from markdown
    implied_upside_pct: null,       // Cannot derive without fair value anchor
    valuation_label,
    ev_to_ebitda: null,             // Not in baostock/hk_akshare current fields
    pfcf_ratio: null,               // Not directly available
    revenue_growth_3yr: revenueGrowthYoy ?? null, // Single-year YoY proxy
    data_source: dataSource,
    advisory_only: true,            // Hard-coded literal type — non-overridable
    simplified_note: disclaimer,
  };
}
