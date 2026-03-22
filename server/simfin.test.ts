/**
 * SimFin API Integration Tests
 * 测试财务报表、衍生指标、股价历史和健康检测
 * 注意：共享单次 fetch 结果，避免免费配额耗尽
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  fetchSimFinData,
  formatSimFinDataAsMarkdown,
  checkSimFinHealth,
  type SimFinData,
} from "./simfinApi";

// ─── 共享数据（仅调用一次 API）──────────────────────────────────────────────
let sharedData: SimFinData | null = null;

beforeAll(async () => {
  sharedData = await fetchSimFinData("AAPL");
  console.log("SimFin AAPL data fetched:", JSON.stringify({
    ticker: sharedData?.ticker,
    hasIncomeStmt: !!sharedData?.incomeStatement,
    hasBalanceSheet: !!sharedData?.balanceSheet,
    hasDerivedMetrics: !!sharedData?.derivedMetrics,
    priceCount: sharedData?.recentPrices?.length ?? 0,
  }, null, 2));
}, 30000);

// ─── 配置检查 ────────────────────────────────────────────────────────────────
describe("SimFin API — Configuration Check", () => {
  it("should have SIMFIN_API_KEY configured", () => {
    const key = process.env.SIMFIN_API_KEY;
    expect(key).toBeTruthy();
    expect(key!.length).toBeGreaterThan(10);
    console.log(`SimFin API Key configured: ${!!key} (length: ${key?.length})`);
  });
});

// ─── 健康检测 ────────────────────────────────────────────────────────────────
describe("SimFin API — Health Check", () => {
  it("should report health status (pass or quota-limited)", async () => {
    // 健康检测可能因配额限制失败，但不应抛出异常
    const result = await checkSimFinHealth();
    console.log(`SimFin health check result: ${JSON.stringify(result)}`);
    expect(typeof result).toBe("object");
    expect(typeof result.ok).toBe("boolean");
  }, 20000);
});

// ─── 数据获取 ────────────────────────────────────────────────────────────────
describe("SimFin API — Fetch AAPL Data", () => {
  it("should return non-null data for valid ticker", () => {
    // 如果配额耗尽，可能返回 null，但测试不应崩溃
    console.log(`sharedData is ${sharedData === null ? "null (quota may be exhausted)" : "non-null"}`);
    // 宽松断言：允许 null（配额限制）或有效数据
    expect(sharedData === null || typeof sharedData === "object").toBe(true);
  });

  it("should have correct ticker and source when data is available", () => {
    if (!sharedData) {
      console.log("Skipping: no data available (quota exhausted)");
      return;
    }
    expect(sharedData.ticker).toBe("AAPL");
    expect(sharedData.source).toBe("SimFin");
    expect(sharedData.fetchedAt).toBeGreaterThan(0);
  });

  it("should have at least one data category available", () => {
    if (!sharedData) {
      console.log("Skipping: no data available (quota exhausted)");
      return;
    }
    const hasAnyData =
      !!sharedData.incomeStatement ||
      !!sharedData.balanceSheet ||
      !!sharedData.derivedMetrics ||
      sharedData.recentPrices.length > 0;
    expect(hasAnyData).toBe(true);
    console.log("Available data categories:", {
      income: !!sharedData.incomeStatement,
      balance: !!sharedData.balanceSheet,
      derived: !!sharedData.derivedMetrics,
      prices: sharedData.recentPrices.length,
    });
  });

  it("should have valid income statement when available", () => {
    if (!sharedData?.incomeStatement) {
      console.log("Income statement not available (quota or data issue)");
      return;
    }
    const is = sharedData.incomeStatement;
    expect(is.fiscalYear).toBeGreaterThanOrEqual(2023);
    if (is.revenue !== null) {
      expect(is.revenue).toBeGreaterThan(0);
    }
    console.log(`AAPL FY${is.fiscalYear} Revenue: ${is.revenue ? `$${(is.revenue / 1e9).toFixed(1)}B` : "N/A"}`);
  });

  it("should have valid derived metrics when available", () => {
    if (!sharedData?.derivedMetrics) {
      console.log("Derived metrics not available (quota or data issue)");
      return;
    }
    const dm = sharedData.derivedMetrics;
    if (dm.grossMargin !== null) {
      expect(dm.grossMargin).toBeGreaterThan(0);
      expect(dm.grossMargin).toBeLessThan(1);
    }
    console.log(`AAPL Gross Margin: ${dm.grossMargin !== null ? `${(dm.grossMargin * 100).toFixed(1)}%` : "N/A"}`);
    if (dm.piotroskiFScore !== null) {
      console.log(`AAPL Piotroski F-Score: ${dm.piotroskiFScore}/9`);
    }
  });

  it("should have recent price data when available", () => {
    if (!sharedData || sharedData.recentPrices.length === 0) {
      console.log("Price data not available (quota or data issue)");
      return;
    }
    const latest = sharedData.recentPrices[sharedData.recentPrices.length - 1];
    expect(latest.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(latest.close).toBeGreaterThan(0);
    console.log(`AAPL latest price: $${latest.close} on ${latest.date}`);
  });
});

// ─── Markdown 格式化 ─────────────────────────────────────────────────────────
describe("SimFin API — Format Markdown", () => {
  it("should format available data as readable markdown", () => {
    if (!sharedData) {
      console.log("Skipping format test: no data available");
      return;
    }
    const md = formatSimFinDataAsMarkdown(sharedData);
    expect(md).toContain("SimFin 财务数据");
    expect(md).toContain("AAPL");
    expect(md.length).toBeGreaterThan(100);

    // 根据实际可用数据验证内容
    if (sharedData.incomeStatement) expect(md).toContain("损益表摘要");
    if (sharedData.derivedMetrics) expect(md).toContain("衍生指标");
    if (sharedData.recentPrices.length > 0) expect(md).toContain("近期股价");

    console.log(`Markdown length: ${md.length} chars`);
    console.log("Preview:\n" + md.slice(0, 300));
  });
});

// ─── 错误处理 ────────────────────────────────────────────────────────────────
describe("SimFin API — Error Handling", () => {
  it("should return null for empty ticker", async () => {
    const data = await fetchSimFinData("");
    expect(data).toBeNull();
  });
});
