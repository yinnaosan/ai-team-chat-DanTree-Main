/**
 * alphaFactors.test.ts — qlib Alpha 因子库测试
 */
import { describe, it, expect } from "vitest";
import { calcAlphaFactors, convertToOHLCVSeries, type OHLCVSeries } from "./alphaFactors";

// 生成模拟 OHLCV 数据
function mockOHLCVSeries(n = 120, trend: "up" | "down" | "flat" = "flat"): OHLCVSeries {
  const dates: string[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];

  let price = 150;
  const startDate = new Date("2024-01-01");

  for (let i = 0; i < n; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));

    // 根据趋势调整价格变化
    const trendBias = trend === "up" ? 0.003 : trend === "down" ? -0.003 : 0;
    const change = (Math.random() - 0.5 + trendBias) * 3;
    const open = price;
    const close = Math.max(1, price + change);
    const high = Math.max(open, close) + Math.random() * 1.5;
    const low = Math.min(open, close) - Math.random() * 1.5;
    const volume = Math.floor(1e7 + Math.random() * 5e7);

    opens.push(open);
    highs.push(high);
    lows.push(Math.max(0.1, low));
    closes.push(close);
    volumes.push(volume);
    price = close;
  }

  return { dates, opens, highs, lows, closes, volumes };
}

describe("calcAlphaFactors — Alpha 因子计算", () => {
  it("数据不足时返回有限因子报告", () => {
    const data = mockOHLCVSeries(5);
    const report = calcAlphaFactors("TEST", data);

    expect(report.ticker).toBe("TEST");
    // 5 个数据点可能计算出少数因子，但不应超过 3 个
    expect(report.factors.length).toBeLessThanOrEqual(3);
    expect(report.compositeScore).toBeGreaterThanOrEqual(-100);
    expect(report.compositeScore).toBeLessThanOrEqual(100);
  });

  it("120 个数据点时计算所有因子", () => {
    const data = mockOHLCVSeries(120);
    const report = calcAlphaFactors("AAPL", data);

    expect(report.factors.length).toBeGreaterThan(5);
    expect(report.compositeScore).toBeGreaterThanOrEqual(-100);
    expect(report.compositeScore).toBeLessThanOrEqual(100);
    expect(["strong_long", "long", "neutral", "short", "strong_short"]).toContain(report.overallSignal);
  });

  it("上涨趋势 = 偏多信号（确定性）", () => {
    // 使用确定性上涨数据（每日上涨 1%）
    const dates: string[] = [];
    const closes: number[] = [];
    let price = 100;
    for (let i = 0; i < 120; i++) {
      const d = new Date("2024-01-01");
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
      price = price * 1.01; // 确定性上涨
      closes.push(price);
    }
    const data: OHLCVSeries = {
      dates,
      opens: closes.map(c => c * 0.995),
      highs: closes.map(c => c * 1.01),
      lows: closes.map(c => c * 0.99),
      closes,
      volumes: closes.map(() => 1e7),
    };
    const report = calcAlphaFactors("BULL", data);

    const momFactor = report.factors.find(f => f.name === "MOM20" || f.name === "MOM60");
    expect(momFactor).toBeDefined();
    // 确定性上涨趋势中，动量因子必须为正
    expect(momFactor!.value).toBeGreaterThan(0);
  });

  it("下跌趋势 = 应产生负向动量因子（概率性）", () => {
    // 使用确定性下跌数据（每日下跌 1%）
    const dates: string[] = [];
    const closes: number[] = [];
    let price = 200;
    for (let i = 0; i < 120; i++) {
      const d = new Date("2024-01-01");
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
      price = price * 0.99; // 确定性下跌
      closes.push(price);
    }
    const data: OHLCVSeries = {
      dates,
      opens: closes.map(c => c * 1.005),
      highs: closes.map(c => c * 1.01),
      lows: closes.map(c => c * 0.99),
      closes,
      volumes: closes.map(() => 1e7),
    };
    const report = calcAlphaFactors("BEAR", data);

    const momFactor = report.factors.find(f => f.name === "MOM20" || f.name === "MOM60");
    expect(momFactor).toBeDefined();
    // 确定性下跌趋势中，动量因子必须为负
    expect(momFactor!.value).toBeLessThan(0);
  });

  it("因子名称符合 qlib 命名规范", () => {
    const data = mockOHLCVSeries(120);
    const report = calcAlphaFactors("NVDA", data);

    const validNames = ["ALPHA001", "ALPHA002", "ALPHA003", "ALPHA012", "MOM20", "MOM60", "REV5", "VOL20", "VMOM10", "PRPOS", "HLSPREAD"];
    for (const factor of report.factors) {
      expect(validNames).toContain(factor.name);
    }
  });

  it("因子信号强度在 0-100 范围内", () => {
    const data = mockOHLCVSeries(120);
    const report = calcAlphaFactors("SPY", data);

    for (const factor of report.factors) {
      expect(factor.strength).toBeGreaterThanOrEqual(0);
      expect(factor.strength).toBeLessThanOrEqual(100);
    }
  });

  it("报告包含 Markdown 摘要", () => {
    const data = mockOHLCVSeries(120);
    const report = calcAlphaFactors("TSLA", data);

    expect(report.summary).toContain("TSLA");
    expect(report.summary).toContain("Alpha 因子分析");
    expect(report.summary).toContain("综合 Alpha 评分");
  });
});

describe("convertToOHLCVSeries — 数据格式转换", () => {
  it("正确转换时间戳为日期字符串", () => {
    const now = Math.floor(Date.now() / 1000);
    const chartData = {
      timestamps: [now - 86400, now],
      opens: [150, 151],
      highs: [155, 156],
      lows: [148, 149],
      closes: [152, 153],
      volumes: [1e7, 1.2e7],
    };

    const series = convertToOHLCVSeries(chartData);

    expect(series.dates.length).toBe(2);
    expect(series.dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(series.closes).toEqual([152, 153]);
  });
});
