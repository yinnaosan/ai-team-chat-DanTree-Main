/**
 * financeDatabaseApi.test.ts — JerBouma/FinanceDatabase 集成测试
 */

import { describe, it, expect } from "vitest";
import {
  getEquityClassification,
  formatFinanceDatabaseReport,
  extractTickersForClassification,
  type FinanceDatabaseResult,
} from "./financeDatabaseApi";

// ── 单元测试（不依赖网络，直接调用 Python 本地数据库）──────────────────────────

describe("FinanceDatabase — Ticker Classification", () => {
  it("should classify AAPL correctly", async () => {
    const result = await getEquityClassification("AAPL");

    expect(result.ticker).toBe("AAPL");
    expect(result.classification).toBeDefined();
    expect(result.classification!.name).toContain("Apple");
    expect(result.classification!.sector).toBe("Information Technology");
    expect(result.classification!.country).toBe("United States");
    expect(result.classification!.marketCap).toBe("Mega Cap");
    expect(result.classification!.exchange).toBe("NMS");
  }, 30000);

  it("should return industry peers for AAPL", async () => {
    const result = await getEquityClassification("AAPL");

    expect(result.industryPeers).toBeDefined();
    expect(result.industryPeers.length).toBeGreaterThan(0);
    // 同业公司不应包含 AAPL 自身
    const selfPeer = result.industryPeers.find(p => p.symbol === "AAPL");
    expect(selfPeer).toBeUndefined();
    // 应包含大盘/超大盘公司
    const capLevels = result.industryPeers.map(p => p.marketCap);
    expect(capLevels.some(c => ["Mega Cap", "Large Cap", "Mid Cap"].includes(c))).toBe(true);
  }, 30000);

  it("should return sector stats for AAPL", async () => {
    const result = await getEquityClassification("AAPL");

    expect(result.sectorStats).toBeDefined();
    expect(result.sectorStats.totalCompanies).toBeGreaterThan(1000);
    expect(result.sectorStats.megaCap).toBeGreaterThan(0);
  }, 30000);

  it("should classify TSLA correctly", async () => {
    const result = await getEquityClassification("TSLA");

    expect(result.classification).toBeDefined();
    expect(result.classification!.name).toContain("Tesla");
    expect(result.classification!.country).toBe("United States");
  }, 30000);

  it("should handle unknown ticker gracefully", async () => {
    const result = await getEquityClassification("XYZXYZXYZ999");

    expect(result.ticker).toBe("XYZXYZXYZ999");
    expect(result.classification).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.peers).toEqual([]);
  }, 30000);
});

describe("FinanceDatabase — Report Formatting", () => {
  it("should format a complete report for AAPL", async () => {
    const result = await getEquityClassification("AAPL");
    const report = formatFinanceDatabaseReport(result);

    expect(report).toContain("FinanceDatabase");
    expect(report).toContain("Apple");
    expect(report).toContain("Information Technology");
    expect(report).toContain("Mega Cap");
    expect(report).toContain("United States");
  }, 30000);

  it("should format error report for unknown ticker", () => {
    const errorResult: FinanceDatabaseResult = {
      ticker: "UNKNOWN",
      classification: undefined,
      peers: [],
      sectorPeers: [],
      industryPeers: [],
      sectorStats: { totalCompanies: 0, megaCap: 0, largeCap: 0, midCap: 0, smallCap: 0 },
      error: "Ticker UNKNOWN not found",
    };
    const report = formatFinanceDatabaseReport(errorResult);
    expect(report).toContain("FinanceDatabase");
    expect(report).toContain("Ticker UNKNOWN not found");
  });
});

describe("FinanceDatabase — Ticker Extraction", () => {
  it("should extract tickers from task description", () => {
    const tickers = extractTickersForClassification("分析 AAPL 和 MSFT 的竞争格局");
    expect(tickers).toContain("AAPL");
    expect(tickers).toContain("MSFT");
  });

  it("should filter out common stop words", () => {
    const tickers = extractTickersForClassification("分析 US GDP 和 AI 行业趋势");
    expect(tickers).not.toContain("US");
    expect(tickers).not.toContain("GDP");
    expect(tickers).not.toContain("AI");
  });

  it("should limit to 5 tickers", () => {
    const tickers = extractTickersForClassification("AAPL MSFT GOOGL AMZN META NVDA TSLA");
    expect(tickers.length).toBeLessThanOrEqual(5);
  });
});
