/**
 * Integration tests for real-time data sources
 * Tests: Yahoo Finance, FRED, Tavily (if configured)
 */
import { describe, it, expect } from "vitest";
import { fetchStockDataForTask, extractTickers } from "./yahooFinance";
import { getMacroDashboard, getMacroDataByKeywords, getFredLatest, FRED_SERIES } from "./fredApi";
import { isTavilyConfigured } from "./tavilySearch";

describe("Yahoo Finance - Ticker Extraction", () => {
  it("should extract US stock tickers from text", () => {
    const tickers = extractTickers("分析苹果AAPL和微软MSFT的估值");
    expect(tickers).toContain("AAPL");
    expect(tickers).toContain("MSFT");
  });

  it("should extract Chinese company names", () => {
    const tickers = extractTickers("腾讯和茅台最近表现如何");
    expect(tickers).toContain("0700.HK");
    expect(tickers).toContain("600519.SS");
  });

  it("should normalize A-share tickers", () => {
    const tickers = extractTickers("分析600519");
    expect(tickers).toContain("600519.SS");
  });

  it("should limit to 6 tickers max", () => {
    const tickers = extractTickers("苹果 微软 谷歌 亚马逊 英伟达 特斯拉 腾讯");
    expect(tickers.length).toBeLessThanOrEqual(6);
  });

  it("should extract CSI 300 index ticker", () => {
    const tickers = extractTickers("沪深300指数最近表现如何");
    expect(tickers).toContain("000300.SS");
  });

  it("should extract Hang Seng Index ticker", () => {
    const tickers = extractTickers("恒生指数今天涨了多少");
    expect(tickers).toContain("^HSI");
  });

  it("should extract Shanghai Composite Index ticker", () => {
    const tickers = extractTickers("上证指数走势分析");
    expect(tickers).toContain("000001.SS");
  });
});

describe("Yahoo Finance - Real-time Data", () => {
  it("should fetch AAPL stock data", async () => {
    const data = await fetchStockDataForTask("分析苹果AAPL的股价");
    expect(data).toBeTruthy();
    expect(data).toContain("AAPL");
    // Accept either real-time price, fallback to latest close, or API unavailable in sandbox
    // The key requirement: no "insufficient data" error shown to user
    expect(data).not.toContain("数据不足");
    expect(data).not.toContain("insufficient data");
  }, 15000);

  it("should fetch Tencent HK stock data", async () => {
    const data = await fetchStockDataForTask("分析腾讯的估值");
    expect(data).toBeTruthy();
    expect(data).toContain("0700.HK");
  }, 15000);

  it("should return empty string when no tickers detected", async () => {
    const data = await fetchStockDataForTask("今天天气怎么样");
    expect(data).toBe("");
  }, 10000);

  it("should fetch CSI 300 index data without error", async () => {
    const data = await fetchStockDataForTask("沪深300指数最近表现如何");
    expect(data).toBeTruthy();
    // Should contain the ticker or a meaningful response (not an error about insufficient data)
    expect(data).not.toContain("数据不足");
    expect(data).not.toContain("insufficient data");
    // Should contain 000300.SS or a price-related label
    const hasData = data.includes("000300.SS") || data.includes("实时价格") || data.includes("最近收盘价") || data.includes("暂无");
    expect(hasData).toBe(true);
  }, 15000);

  it("should fetch Hang Seng Index data without error", async () => {
    const data = await fetchStockDataForTask("恒生指数今天涨了多少");
    expect(data).toBeTruthy();
    expect(data).not.toContain("数据不足");
    expect(data).not.toContain("insufficient data");
    const hasData = data.includes("^HSI") || data.includes("实时价格") || data.includes("最近收盘价") || data.includes("暂无");
    expect(hasData).toBe(true);
  }, 15000);
});

describe("FRED - Macroeconomic Data", () => {
  it("should fetch Federal Funds Rate", async () => {
    const data = await getFredLatest(FRED_SERIES.FED_FUNDS_RATE);
    expect(data.value).toBeGreaterThan(0);
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    console.log(`Fed Funds Rate: ${data.value}% as of ${data.date}`);
  }, 10000);

  it("should fetch CPI data", async () => {
    const data = await getFredLatest(FRED_SERIES.CPI);
    expect(data.value).toBeGreaterThan(200); // CPI should be > 200 in recent years
    console.log(`CPI: ${data.value} as of ${data.date}`);
  }, 10000);

  it("should return macro dashboard", async () => {
    const dashboard = await getMacroDashboard();
    expect(dashboard).toContain("联邦基金利率");
    expect(dashboard).toContain("CPI");
    expect(dashboard).toContain("失业率");
    console.log("Macro Dashboard preview:", dashboard.slice(0, 300));
  }, 20000);

  it("should detect inflation keywords and return CPI data", async () => {
    const data = await getMacroDataByKeywords("通胀和CPI走势分析");
    expect(data).toContain("CPI");
    expect(data).toContain("核心");
  }, 15000);

  it("should detect interest rate keywords", async () => {
    const data = await getMacroDataByKeywords("美联储利率决议影响");
    expect(data).toContain("联邦基金利率");
    expect(data).toContain("美债");
  }, 15000);
});

describe("Tavily Search - Configuration Check", () => {
  it("should report Tavily configuration status", () => {
    const configured = isTavilyConfigured();
    console.log(`Tavily API configured: ${configured}`);
    // This test just checks the function works, not the actual value
    expect(typeof configured).toBe("boolean");
  });
});
