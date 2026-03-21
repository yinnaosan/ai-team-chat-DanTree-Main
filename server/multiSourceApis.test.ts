/**
 * Multi-Source API Integration Tests
 * Tests for Finnhub, Alpha Vantage, Polygon.io, FMP, SEC EDGAR modules
 */

import { describe, it, expect } from "vitest";

// ─── Finnhub ──────────────────────────────────────────────────────────────────
describe("finnhubApi", () => {
  it("formatFinnhubData handles empty/null data gracefully", async () => {
    const { formatFinnhubData } = await import("./finnhubApi");
    const result = formatFinnhubData({
      symbol: "TEST",
      quote: null,
      profile: null,
      recommendations: [],
      recentNews: [],
      metrics: null,
      insiderTransactions: [],
      source: "Finnhub Stock API",
      fetchedAt: new Date().toISOString(),
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formatFinnhubData includes symbol in output", async () => {
    const { formatFinnhubData } = await import("./finnhubApi");
    const result = formatFinnhubData({
      symbol: "AAPL",
      quote: { c: 200, d: 1.5, dp: 0.75, h: 202, l: 198, o: 199, pc: 198.5, t: 1700000000 },
      profile: null,
      recommendations: [],
      recentNews: [],
      metrics: null,
      insiderTransactions: [],
      source: "Finnhub Stock API",
      fetchedAt: new Date().toISOString(),
    });
    expect(result).toContain("AAPL");
    expect(result).toContain("200");
  });

  it("formatFinnhubData renders recommendations when present", async () => {
    const { formatFinnhubData } = await import("./finnhubApi");
    const result = formatFinnhubData({
      symbol: "MSFT",
      quote: null,
      profile: null,
      recommendations: [{ buy: 20, hold: 5, sell: 2, strongBuy: 10, strongSell: 1, period: "2024-01-01", symbol: "MSFT" }],
      recentNews: [],
      metrics: null,
      insiderTransactions: [],
      source: "Finnhub Stock API",
      fetchedAt: new Date().toISOString(),
    });
    expect(result).toContain("买入");
  });
});

// ─── Alpha Vantage ────────────────────────────────────────────────────────────
describe("alphaVantageApi", () => {
  it("formatEconomicData handles empty data", async () => {
    const { formatEconomicData } = await import("./alphaVantageApi");
    const result = formatEconomicData({
      usdCny: null,
      usdEur: null,
      federalFundsRate: [],
      cpi: [],
      unemploymentRate: [],
      source: "Alpha Vantage",
      fetchedAt: new Date().toISOString(),
    });
    expect(typeof result).toBe("string");
  });

  it("formatEconomicData includes section headers", async () => {
    const { formatEconomicData } = await import("./alphaVantageApi");
    const result = formatEconomicData({
      usdCny: {
        "1. From_Currency Code": "USD", "2. From_Currency Name": "US Dollar",
        "3. To_Currency Code": "CNY", "4. To_Currency Name": "Chinese Yuan",
        "5. Exchange Rate": "7.25", "6. Last Refreshed": "2024-01-01",
        "7. Time Zone": "UTC", "8. Bid Price": "7.24", "9. Ask Price": "7.26",
      },
      usdEur: null,
      federalFundsRate: [{ date: "2024-01-01", value: "5.33" }],
      cpi: [{ date: "2024-01-01", value: "314.0" }],
      unemploymentRate: [{ date: "2024-01-01", value: "3.7" }],
      source: "Alpha Vantage",
      fetchedAt: new Date().toISOString(),
    });
    expect(result).toContain("Alpha Vantage");
    expect(result).toContain("7.25");
  });

  it("formatStockData handles empty data", async () => {
    const { formatStockData } = await import("./alphaVantageApi");
    const result = formatStockData({ symbol: "TEST", quote: null, overview: null, source: "Alpha Vantage", fetchedAt: new Date().toISOString() });
    expect(typeof result).toBe("string");
  });
});

// ─── Polygon.io ───────────────────────────────────────────────────────────────
describe("polygonApi", () => {
  it("formatPolygonData handles empty data", async () => {
    const { formatPolygonData } = await import("./polygonApi");
    const result = formatPolygonData({
      ticker: "AAPL",
      snapshot: null,
      details: null,
      recentNews: [],
      weeklyBars: [],
      source: "Polygon.io",
      fetchedAt: new Date().toISOString(),
    });
    expect(typeof result).toBe("string");
    expect(result).toContain("AAPL");
  });

  it("formatPolygonData includes price when snapshot present", async () => {
    const { formatPolygonData } = await import("./polygonApi");
    const result = formatPolygonData({
      ticker: "TSLA",
      snapshot: {
        day: { c: 250.5, h: 255, l: 248, o: 249, v: 1000000, vw: 251 },
        lastTrade: { p: 250.5 },
        min: { c: 250.5 },
        prevDay: { c: 245 },
        todaysChangePerc: 2.24,
        todaysChange: 5.5,
      } as any,
      details: null,
      recentNews: [],
      weeklyBars: [],
      source: "Polygon.io",
      fetchedAt: new Date().toISOString(),
    });
    expect(result).toContain("250.5");
    expect(result).toContain("TSLA");
  });

  it("formatPolygonData renders trend summary from aggregates", async () => {
    const { formatPolygonData } = await import("./polygonApi");
    const bars = Array.from({ length: 5 }, (_, i) => ({
      t: Date.now() - (4 - i) * 86400000,
      o: 100 + i,
      h: 102 + i,
      l: 99 + i,
      c: 101 + i,
      v: 500000,
      vw: 100.5 + i,
    }));
    const result = formatPolygonData({
      ticker: "NVDA",
      snapshot: null,
      details: null,
      recentNews: [],
      weeklyBars: bars,
      source: "Polygon.io",
      fetchedAt: new Date().toISOString(),
    });
    expect(result).toContain("NVDA");
  });
});

// ─── FMP ──────────────────────────────────────────────────────────────────────
describe("fmpApi", () => {
  it("formatFmpData handles empty data", async () => {
    const { formatFmpData } = await import("./fmpApi");
    const result = formatFmpData({
      symbol: "AAPL",
      quote: null,
      profile: null,
      incomeStatements: [],
      balanceSheets: [],
      cashFlows: [],
      keyMetrics: [],
      dcf: null,
      priceTarget: null,
      source: "Financial Modeling Prep",
      fetchedAt: new Date().toISOString(),
    });
    expect(typeof result).toBe("string");
    expect(result).toContain("AAPL");
  });

  it("formatFmpData includes revenue when income statements present", async () => {
    const { formatFmpData } = await import("./fmpApi");
    const result = formatFmpData({
      symbol: "MSFT",
      quote: null,
      profile: null,
      incomeStatements: [{
        date: "2024-06-30", calendarYear: "2024", period: "FY",
        revenue: 245122000000, grossProfit: 181074000000, operatingIncome: 109433000000,
        netIncome: 88136000000, eps: 11.80, ebitda: 125237000000,
        grossProfitRatio: 0.739, operatingIncomeRatio: 0.447, netIncomeRatio: 0.360,
      }],
      balanceSheets: [],
      cashFlows: [],
      keyMetrics: [],
      dcf: null,
      priceTarget: null,
      source: "Financial Modeling Prep",
      fetchedAt: new Date().toISOString(),
    });
    expect(result).toContain("245");
    expect(result).toContain("MSFT");
  });

  it("formatFmpData shows DCF upside when dcf present", async () => {
    const { formatFmpData } = await import("./fmpApi");
    const result = formatFmpData({
      symbol: "GOOGL",
      quote: { price: 170, change: 2.0, changePercentage: 1.2, marketCap: 2100000000000, pe: 22, eps: 7.7, yearHigh: 195, yearLow: 130 } as any,
      profile: null,
      incomeStatements: [],
      balanceSheets: [],
      cashFlows: [],
      keyMetrics: [],
      dcf: { symbol: "GOOGL", date: "2024-01-01", dcf: 210, "Stock Price": 170 },
      priceTarget: null,
      source: "Financial Modeling Prep",
      fetchedAt: new Date().toISOString(),
    });
    expect(result).toContain("DCF");
    expect(result).toContain("210");
  });
});

// ─── SEC EDGAR ────────────────────────────────────────────────────────────────
describe("secEdgarApi", () => {
  // 新版接口包含更多字段，需要提供完整的 keyFinancials 对象
  const emptyKeyFinancials = {
    revenue: [],
    netIncome: [],
    eps: [],
    totalAssets: [],
    totalLiabilities: [],
    operatingCashFlow: [],
    researchAndDevelopment: [],
  };

  it("formatSecData handles empty data", async () => {
    const { formatSecData } = await import("./secEdgarApi");
    const result = formatSecData({
      ticker: "AAPL",
      cik: null,
      companyName: null,
      recentFilings: [],
      keyFinancials: emptyKeyFinancials,
      source: "SEC EDGAR",
      fetchedAt: new Date().toISOString(),
    });
    expect(typeof result).toBe("string");
    expect(result).toContain("AAPL");
  });

  it("formatSecData includes filing links when filings present", async () => {
    const { formatSecData } = await import("./secEdgarApi");
    const result = formatSecData({
      ticker: "MSFT",
      cik: "0000789019",
      companyName: "MICROSOFT CORP",
      recentFilings: [{
        accessionNumber: "0000789019-24-000001",
        form: "10-K",
        filingDate: "2024-07-30",
        reportDate: "2024-06-30",
        primaryDocument: "msft-20240630.htm",
        primaryDocDescription: "10-K",
        size: 10000000,
        url: "https://www.sec.gov/Archives/edgar/data/789019/000078901924000001/msft-20240630.htm",
      }],
      keyFinancials: emptyKeyFinancials,
      source: "SEC EDGAR",
      fetchedAt: new Date().toISOString(),
    });
    expect(result).toContain("10-K");
    expect(result).toContain("MICROSOFT");
  });

  it("formatSecData renders financial table when revenue present", async () => {
    const { formatSecData } = await import("./secEdgarApi");
    const result = formatSecData({
      ticker: "AAPL",
      cik: "0000320193",
      companyName: "Apple Inc.",
      recentFilings: [],
      keyFinancials: {
        ...emptyKeyFinancials,
        revenue: [
          { period: "2023-09-30", value: 383285000000, form: "10-K" },
          { period: "2022-09-24", value: 394328000000, form: "10-K" },
        ],
        netIncome: [
          { period: "2023-09-30", value: 96995000000, form: "10-K" },
        ],
      },
      source: "SEC EDGAR",
      fetchedAt: new Date().toISOString(),
    });
    expect(result).toContain("383");
    expect(result).toContain("Apple");
  });
});
