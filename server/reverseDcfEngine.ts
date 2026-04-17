/**
 * reverseDcfEngine.ts
 * QVL Move 2 — Lightweight deterministic FMP-based valuation context
 *
 * DESIGN CONSTRAINTS:
 * - No LLM calls
 * - No new API calls
 * - Pure deterministic transformation from FmpStockData | null
 * - advisory_only: true — hard-coded, cannot be false
 * - FMP disclaimer in simplified_note — always present
 * - insufficient_data fallback when required fields absent
 */

import type { FmpStockData } from "./fmpApi";

// ── Output type ───────────────────────────────────────────────────────────────

export type ValuationLabel = "cheap" | "fair" | "expensive" | "insufficient_data";

export interface QvlValuationOutput {
  fmp_dcf_fair_value: number | null;   // FMP DCF fair value (dcf.dcf)
  dcf_model_date: string | null;       // DCF estimate date (staleness)
  current_price: number | null;        // quote.price
  implied_upside_pct: number | null;   // (dcf - price) / price * 100, 1 decimal
  valuation_label: ValuationLabel;
  ev_to_ebitda: number | null;         // keyMetrics[0].enterpriseValueOverEBITDA
  pfcf_ratio: number | null;           // keyMetrics[0].pfcfRatio
  revenue_growth_3yr: number | null;   // 2-period CAGR from incomeStatements
  data_source: "fmp";
  advisory_only: true;                 // always true — hard-coded
  simplified_note: string;             // mandatory FMP disclaimer
}

// ── Disclaimer constant ───────────────────────────────────────────────────────

const DISCLAIMER =
  "Based on FMP's DCF model — FMP's underlying assumptions (WACC, terminal growth rate) " +
  "are not disclosed. Advisory only, not a buy/sell recommendation. " +
  "Reliable only when FMP deepFinancials data is available. " +
  "DCF estimates may lag current market conditions by 1-3 months.";

// ── Valuation label logic ─────────────────────────────────────────────────────

function deriveValuationLabel(impliedUpsidePct: number | null): ValuationLabel {
  if (impliedUpsidePct === null) return "insufficient_data";
  if (impliedUpsidePct > 20) return "cheap";
  if (impliedUpsidePct < -10) return "expensive";
  return "fair";
}

// ── Revenue 2-period CAGR ─────────────────────────────────────────────────────
// Uses the first 3 annual income statements (index 0 = most recent, index 2 = 2 years ago)
// Returns null when fewer than 3 statements or base revenue is 0/null

function computeRevenueGrowth3yr(
  incomeStatements: FmpStockData["incomeStatements"]
): number | null {
  if (!incomeStatements || incomeStatements.length < 3) return null;
  const latest = incomeStatements[0]?.revenue;
  const base = incomeStatements[2]?.revenue;
  if (!latest || !base || base === 0) return null;
  // CAGR over 2 periods: (latest / base)^(1/2) - 1
  const cagr = Math.pow(latest / base, 1 / 2) - 1;
  return Math.round(cagr * 1000) / 10; // percent, 1 decimal
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * computeValuationContext
 * Accepts FmpStockData | null.
 * Returns null immediately if fmpRawCache is null (non-US / non-FMP tickers).
 * Returns QvlValuationOutput with valuation_label = 'insufficient_data' when
 * required core fields (dcf, price) are absent or zero.
 */
export function computeValuationContext(
  fmpRawCache: FmpStockData | null
): QvlValuationOutput | null {
  // Guard: null input → return null (no attachment)
  if (!fmpRawCache) return null;

  // Extract fields — all nullable
  const dcfValue: number | null = fmpRawCache.dcf?.dcf ?? null;
  const dcfDate: string | null = fmpRawCache.dcf?.date ?? null;
  const currentPrice: number | null = fmpRawCache.quote?.price ?? null;

  // Compute implied upside — null when dcf or price absent/zero
  let impliedUpsidePct: number | null = null;
  if (dcfValue !== null && currentPrice !== null && currentPrice !== 0) {
    const raw = ((dcfValue - currentPrice) / currentPrice) * 100;
    impliedUpsidePct = Math.round(raw * 10) / 10; // 1 decimal
  }

  // Key metrics (first entry only)
  const km = fmpRawCache.keyMetrics?.[0] ?? null;
  const evToEbitda: number | null = km?.enterpriseValueOverEBITDA ?? null;
  const pfcfRatio: number | null = km?.pfcfRatio ?? null;

  // Revenue growth
  const revenueGrowth3yr = computeRevenueGrowth3yr(fmpRawCache.incomeStatements);

  // Valuation label
  const valuationLabel = deriveValuationLabel(impliedUpsidePct);

  return {
    fmp_dcf_fair_value: dcfValue,
    dcf_model_date: dcfDate,
    current_price: currentPrice,
    implied_upside_pct: impliedUpsidePct,
    valuation_label: valuationLabel,
    ev_to_ebitda: evToEbitda !== undefined ? evToEbitda : null,
    pfcf_ratio: pfcfRatio !== undefined ? pfcfRatio : null,
    revenue_growth_3yr: revenueGrowth3yr,
    data_source: "fmp",
    advisory_only: true,
    simplified_note: DISCLAIMER,
  };
}
