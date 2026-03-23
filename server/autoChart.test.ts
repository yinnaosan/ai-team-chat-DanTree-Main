/**
 * autoChart.test.ts — generateAutoChart 函数测试
 * 验证 yorkeccak/finance 架构的自动图表生成功能
 */
import { describe, it, expect } from "vitest";
import { generateAutoChart, type OHLCVChartData, type TechIndicatorChartData } from "./codeExecution";

// 生成模拟 OHLCV 数据（120 个交易日）
function mockOHLCV(n = 120): OHLCVChartData {
  const timestamps: number[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];

  let price = 150;
  const startTs = Math.floor(Date.now() / 1000) - n * 86400;

  for (let i = 0; i < n; i++) {
    const change = (Math.random() - 0.48) * 3;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;
    const volume = Math.floor(1e7 + Math.random() * 5e7);

    timestamps.push(startTs + i * 86400);
    opens.push(open);
    highs.push(high);
    lows.push(Math.max(low, 1));
    closes.push(Math.max(close, 1));
    volumes.push(volume);

    price = Math.max(close, 1);
  }

  return { timestamps, opens, highs, lows, closes, volumes };
}

// 生成模拟技术指标数据
function mockIndicators(n = 120): TechIndicatorChartData {
  const rsi14 = Array.from({ length: n }, () => 30 + Math.random() * 40);
  const macdLine = Array.from({ length: n }, () => (Math.random() - 0.5) * 2);
  const macdSignal = macdLine.map(v => v + (Math.random() - 0.5) * 0.5);
  const bbMiddle = Array.from({ length: n }, (_, i) => 150 + Math.sin(i / 20) * 5);
  const bbUpper = bbMiddle.map(v => v + 5);
  const bbLower = bbMiddle.map(v => v - 5);
  const ema20 = Array.from({ length: n }, (_, i) => 148 + Math.sin(i / 15) * 3);
  const ema50 = Array.from({ length: n }, (_, i) => 146 + Math.sin(i / 30) * 4);
  const sma200 = Array.from({ length: n }, () => 145);

  return { rsi14, macdLine, macdSignal, bbUpper, bbMiddle, bbLower, ema20, ema50, sma200 };
}

describe("generateAutoChart — 自动图表生成", () => {
  it("生成完整图表（K线 + 成交量 + RSI）", async () => {
    const ohlcv = mockOHLCV(120);
    const indicators = mockIndicators(120);

    const base64 = await generateAutoChart("AAPL", ohlcv, indicators, "full");

    expect(base64).not.toBeNull();
    expect(typeof base64).toBe("string");
    expect(base64!.length).toBeGreaterThan(10000); // PNG 图像应该足够大
  }, 30000);

  it("生成仅价格图（无 RSI）", async () => {
    const ohlcv = mockOHLCV(60);

    const base64 = await generateAutoChart("TSLA", ohlcv, undefined, "price_only");

    expect(base64).not.toBeNull();
    expect(typeof base64).toBe("string");
    expect(base64!.length).toBeGreaterThan(5000);
  }, 30000);

  it("生成 MACD 图", async () => {
    const ohlcv = mockOHLCV(120);
    const indicators = mockIndicators(120);

    const base64 = await generateAutoChart("NVDA", ohlcv, indicators, "macd");

    expect(base64).not.toBeNull();
    expect(typeof base64).toBe("string");
    expect(base64!.length).toBeGreaterThan(5000);
  }, 30000);

  it("数据点不足时返回 null", async () => {
    const ohlcv = mockOHLCV(5); // 只有 5 个数据点，不足 10 个

    const base64 = await generateAutoChart("TEST", ohlcv, undefined, "full");

    expect(base64).toBeNull();
  }, 10000);

  it("生成的 base64 是有效的 PNG 图像", async () => {
    const ohlcv = mockOHLCV(80);
    const indicators = mockIndicators(80);

    const base64 = await generateAutoChart("SPY", ohlcv, indicators, "full");

    expect(base64).not.toBeNull();
    // PNG 文件头：iVBORw0KGgo...
    expect(base64!.startsWith("iVBORw0KGgo")).toBe(true);
  }, 30000);
});
