/**
 * dataStandardizer.test.ts — OpenBB 数据标准化层测试
 */
import { describe, it, expect } from "vitest";
import {
  calcDataQuality,
  fuseDataPoints,
  standardizeData,
  extractFromYahooFinance,
  extractFromLocalIndicators,
  formatStandardizedReport,
  type StandardizedDataPoint,
} from "./dataStandardizer";

describe("calcDataQuality — 数据质量评分", () => {
  it("官方数据源 + 最新数据 = 高分", () => {
    const score = calcDataQuality("sec_edgar", 100, Date.now());
    expect(score).toBeGreaterThan(85);
  });

  it("新闻数据源 + 最新数据 = 中等分", () => {
    const score = calcDataQuality("news_api", "positive", Date.now());
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThan(90);
  });

  it("过期数据 = 低分", () => {
    const oldTimestamp = Date.now() - 48 * 60 * 60 * 1000; // 48小时前
    const score = calcDataQuality("yahoo_finance", 150, oldTimestamp);
    expect(score).toBeLessThan(70);
  });

  it("null 値 = 有效度分为 0（但来源可靠性分仍然计入）", () => {
    const score = calcDataQuality("fmp", null, Date.now());
    // fmp 可靠性 0.90 * 60 = 54，新鲜度 ~30，有效度 0 = ~84
    // null 値应比有效値低，但不一定低于 70
    expect(score).toBeGreaterThan(0);
    // 有效値应比 null 値质量更高
    const validScore = calcDataQuality("fmp", 25.5, Date.now());
    expect(validScore).toBeGreaterThan(score);
  });
});

describe("fuseDataPoints — 数据融合", () => {
  it("单个数据点 = 直接返回", () => {
    const point: StandardizedDataPoint = {
      field: "price.current",
      value: 150,
      sourceId: "yahoo_finance",
      timestamp: Date.now(),
      quality: 85,
      category: "price",
      unit: "USD",
    };
    const result = fuseDataPoints([point]);
    expect(result.fusionStrategy).toBe("single");
    expect(result.value).toBe(150);
    expect(result.hasConflict).toBe(false);
  });

  it("多个数值型数据点 = 加权平均", () => {
    const now = Date.now();
    const points: StandardizedDataPoint[] = [
      { field: "price.current", value: 150, sourceId: "yahoo_finance", timestamp: now, quality: 80, category: "price" },
      { field: "price.current", value: 152, sourceId: "polygon", timestamp: now, quality: 85, category: "price" },
      { field: "price.current", value: 149, sourceId: "finnhub", timestamp: now, quality: 75, category: "price" },
    ];
    const result = fuseDataPoints(points);
    expect(result.fusionStrategy).toBe("weighted_avg");
    // 加权平均应在 149-152 之间
    expect(result.value as number).toBeGreaterThan(149);
    expect(result.value as number).toBeLessThan(153);
  });

  it("数值偏差 > 20% 时标记冲突", () => {
    const now = Date.now();
    const points: StandardizedDataPoint[] = [
      { field: "fundamentals.pe", value: 20, sourceId: "yahoo_finance", timestamp: now, quality: 80, category: "fundamentals" },
      { field: "fundamentals.pe", value: 35, sourceId: "fmp", timestamp: now, quality: 85, category: "fundamentals" }, // 75% 偏差
    ];
    const result = fuseDataPoints(points);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictNote).toBeDefined();
  });

  it("数值偏差 < 5% 时无冲突", () => {
    const now = Date.now();
    const points: StandardizedDataPoint[] = [
      { field: "price.current", value: 150, sourceId: "yahoo_finance", timestamp: now, quality: 80, category: "price" },
      { field: "price.current", value: 151, sourceId: "polygon", timestamp: now, quality: 85, category: "price" },
    ];
    const result = fuseDataPoints(points);
    expect(result.hasConflict).toBe(false);
  });

  it("字符串型数据点 = 取质量最高的", () => {
    const now = Date.now();
    const points: StandardizedDataPoint[] = [
      { field: "analyst.rating", value: "buy", sourceId: "finnhub", timestamp: now, quality: 75, category: "analyst" },
      { field: "analyst.rating", value: "strong_buy", sourceId: "fmp", timestamp: now, quality: 88, category: "analyst" },
    ];
    const result = fuseDataPoints(points);
    expect(result.value).toBe("strong_buy"); // fmp 质量分更高
    expect(result.fusionStrategy).toBe("consensus");
  });
});

describe("standardizeData — 数据标准化", () => {
  it("正确分组和融合多个字段", () => {
    const now = Date.now();
    const rawPoints: StandardizedDataPoint[] = [
      { field: "price.current", value: 150, sourceId: "yahoo_finance", timestamp: now, quality: 85, category: "price" },
      { field: "price.current", value: 151, sourceId: "polygon", timestamp: now, quality: 88, category: "price" },
      { field: "fundamentals.pe", value: 25, sourceId: "fmp", timestamp: now, quality: 88, category: "fundamentals" },
      { field: "technical.rsi14", value: 62, sourceId: "local_indicators", timestamp: now, quality: 83, category: "technical" },
    ];

    const report = standardizeData("AAPL", rawPoints);

    expect(report.ticker).toBe("AAPL");
    expect(Object.keys(report.data)).toHaveLength(3); // 3 个不同字段
    expect(report.data["price.current"]).toBeDefined();
    expect(report.data["fundamentals.pe"]).toBeDefined();
    expect(report.data["technical.rsi14"]).toBeDefined();
    expect(report.overallQuality).toBeGreaterThan(0);
    expect(report.coverageRate).toBeGreaterThan(0);
  });

  it("计算数据源贡献统计", () => {
    const now = Date.now();
    const rawPoints: StandardizedDataPoint[] = [
      { field: "price.current", value: 150, sourceId: "yahoo_finance", timestamp: now, quality: 85, category: "price" },
      { field: "price.volume", value: 1e7, sourceId: "yahoo_finance", timestamp: now, quality: 85, category: "price" },
      { field: "fundamentals.pe", value: 25, sourceId: "fmp", timestamp: now, quality: 88, category: "fundamentals" },
    ];

    const report = standardizeData("TSLA", rawPoints);

    expect(report.sourceContributions["yahoo_finance"]).toBe(2);
    expect(report.sourceContributions["fmp"]).toBe(1);
  });
});

describe("extractFromYahooFinance — Yahoo Finance 数据提取", () => {
  it("正确提取价格和基本面数据", () => {
    const raw = {
      currentPrice: 150,
      marketCap: 2.5e12,
      trailingPE: 28.5,
      trailingEps: 5.26,
      dividendYield: 0.006,
      recommendationKey: "buy",
      targetMeanPrice: 185,
    };

    const points = extractFromYahooFinance("AAPL", raw);

    expect(points.length).toBeGreaterThan(0);
    const pricePoint = points.find(p => p.field === "price.current");
    expect(pricePoint?.value).toBe(150);
    const pePoint = points.find(p => p.field === "fundamentals.pe");
    expect(pePoint?.value).toBe(28.5);
    const divPoint = points.find(p => p.field === "fundamentals.dividend_yield");
    expect(divPoint?.value).toBeCloseTo(0.6, 1); // 0.6%
  });
});

describe("extractFromLocalIndicators — 技术指标提取", () => {
  it("正确提取最新技术指标值", () => {
    const raw = {
      rsi14: [45, 52, 58, 62, null],
      macdLine: [0.5, 0.8, 1.2],
      ema20: [148, 149, 150],
      sma200: [140, 141, 142],
    };

    const points = extractFromLocalIndicators("AAPL", raw);

    const rsiPoint = points.find(p => p.field === "technical.rsi14");
    expect(rsiPoint?.value).toBe(62); // 最后一个非 null 值

    const macdPoint = points.find(p => p.field === "technical.macd");
    expect(macdPoint?.value).toBe(1.2);
  });

  it("全 null 数组不生成数据点", () => {
    const raw = {
      rsi14: [null, null, null],
    };

    const points = extractFromLocalIndicators("TEST", raw);
    const rsiPoint = points.find(p => p.field === "technical.rsi14");
    expect(rsiPoint).toBeUndefined();
  });
});

describe("formatStandardizedReport — 报告格式化", () => {
  it("生成包含质量摘要的 Markdown 报告", () => {
    const now = Date.now();
    const rawPoints: StandardizedDataPoint[] = [
      { field: "price.current", value: 150, sourceId: "yahoo_finance", timestamp: now, quality: 85, category: "price" },
      { field: "technical.rsi14", value: 62, sourceId: "local_indicators", timestamp: now, quality: 83, category: "technical" },
    ];

    const report = standardizeData("NVDA", rawPoints);
    const markdown = formatStandardizedReport(report);

    expect(markdown).toContain("NVDA");
    expect(markdown).toContain("数据质量评分");
    expect(markdown).toContain("price.current");
    expect(markdown).toContain("technical.rsi14");
  });
});
