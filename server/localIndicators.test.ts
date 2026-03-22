/**
 * localIndicators.test.ts
 * 验证本地技术指标计算模块（indicatorts）的核心功能
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock callDataApi to avoid real network calls
vi.mock("./_core/dataApi", () => ({
  callDataApi: vi.fn(),
}));

import { callDataApi } from "./_core/dataApi";
import { getLocalTechnicalIndicators, formatLocalTechnicalIndicators } from "./localIndicators";

// 生成模拟 OHLCV 数据（250 条，足够计算所有指标）
function makeMockOHLCV(n = 250) {
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const opens: number[] = [];
  const volumes: number[] = [];
  const dates: string[] = [];

  let price = 100;
  for (let i = 0; i < n; i++) {
    price = price + (Math.random() - 0.48) * 2;
    price = Math.max(10, price);
    const open = price * (1 + (Math.random() - 0.5) * 0.01);
    const high = price * (1 + Math.random() * 0.02);
    const low = price * (1 - Math.random() * 0.02);
    closes.push(price);
    highs.push(high);
    lows.push(low);
    opens.push(open);
    volumes.push(Math.floor(Math.random() * 10_000_000) + 1_000_000);
    const d = new Date(2024, 0, 1);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return { closes, highs, lows, opens, volumes, dates };
}

describe("getLocalTechnicalIndicators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when callDataApi fails", async () => {
    (callDataApi as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));
    const result = await getLocalTechnicalIndicators("AAPL");
    expect(result).toBeNull();
  });

  it("returns null when API returns no data", async () => {
    (callDataApi as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await getLocalTechnicalIndicators("AAPL");
    expect(result).toBeNull();
  });

  it("returns null when data has fewer than 30 candles", async () => {
    const mock = makeMockOHLCV(20);
    (callDataApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      chart: { result: [{ indicators: { quote: [{ close: mock.closes, high: mock.highs, low: mock.lows, open: mock.opens, volume: mock.volumes }], adjclose: [{ adjclose: mock.closes }] }, timestamp: mock.closes.map((_, i) => i * 86400) }] }
    });
    const result = await getLocalTechnicalIndicators("AAPL");
    expect(result).toBeNull();
  });

  it("computes all indicators with 250 candles", async () => {
    const mock = makeMockOHLCV(250);
    const timestamps = mock.closes.map((_, i) => Math.floor(Date.now() / 1000) - (250 - i) * 86400);
    (callDataApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      chart: {
        result: [{
          indicators: {
            quote: [{ close: mock.closes, high: mock.highs, low: mock.lows, open: mock.opens, volume: mock.volumes }],
            adjclose: [{ adjclose: mock.closes }],
          },
          timestamp: timestamps,
        }],
      },
    });

    const result = await getLocalTechnicalIndicators("AAPL");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("AAPL");
    expect(result!.dataPoints).toBe(250);

    // RSI 应在 0-100 范围内
    expect(result!.rsi14.length).toBeGreaterThan(0);
    expect(result!.rsi14[0]).toBeGreaterThanOrEqual(0);
    expect(result!.rsi14[0]).toBeLessThanOrEqual(100);

    // MACD 应有 macdLine 和 macdSignal
    expect(result!.macdLine.length).toBeGreaterThan(0);
    expect(result!.macdSignal.length).toBeGreaterThan(0);

    // 布林带：upper > middle > lower
    expect(result!.bbUpper.length).toBeGreaterThan(0);
    expect(result!.bbMiddle.length).toBeGreaterThan(0);
    expect(result!.bbLower.length).toBeGreaterThan(0);
    expect(result!.bbUpper[0]).toBeGreaterThan(result!.bbMiddle[0]);
    expect(result!.bbMiddle[0]).toBeGreaterThan(result!.bbLower[0]);

    // EMA/SMA
    expect(result!.ema20.length).toBeGreaterThan(0);
    expect(result!.ema20[0]).toBeGreaterThan(0);
    expect(result!.ema50.length).toBeGreaterThan(0);
    expect(result!.sma50.length).toBeGreaterThan(0);
    expect(result!.sma200.length).toBeGreaterThan(0);

    // ATR
    expect(result!.atr14.length).toBeGreaterThan(0);
    expect(result!.atr14[0]).toBeGreaterThan(0);

    // OBV
    expect(result!.obvValues.length).toBeGreaterThan(0);

    // VWAP
    expect(result!.vwapValues.length).toBeGreaterThan(0);
    expect(result!.vwapValues[0]).toBeGreaterThan(0);

    // Williams %R 应在 -100 到 0 范围内
    expect(result!.williamsRValues.length).toBeGreaterThan(0);
    expect(result!.williamsRValues[0]).toBeGreaterThanOrEqual(-100);
    expect(result!.williamsRValues[0]).toBeLessThanOrEqual(0);

    // KDJ
    expect(result!.kdjK.length).toBeGreaterThan(0);
    expect(result!.kdjD.length).toBeGreaterThan(0);
    expect(result!.kdjJ.length).toBeGreaterThan(0);

    // CCI
    expect(result!.cci20.length).toBeGreaterThan(0);

    // Stochastic
    expect(result!.stochK.length).toBeGreaterThan(0);
    expect(result!.stochD.length).toBeGreaterThan(0);
  });
});

describe("formatLocalTechnicalIndicators", () => {
  it("returns empty string for null input", () => {
    // @ts-expect-error testing null guard
    expect(formatLocalTechnicalIndicators(null)).toBe("");
  });

  it("generates markdown with all sections", async () => {
    const mock = makeMockOHLCV(250);
    const timestamps = mock.closes.map((_, i) => Math.floor(Date.now() / 1000) - (250 - i) * 86400);
    (callDataApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      chart: {
        result: [{
          indicators: {
            quote: [{ close: mock.closes, high: mock.highs, low: mock.lows, open: mock.opens, volume: mock.volumes }],
            adjclose: [{ adjclose: mock.closes }],
          },
          timestamp: timestamps,
        }],
      },
    });

    const data = await getLocalTechnicalIndicators("TSLA");
    expect(data).not.toBeNull();

    const md = formatLocalTechnicalIndicators(data);
    expect(md).toContain("本地技术指标分析");
    expect(md).toContain("RSI");
    expect(md).toContain("MACD");
    expect(md).toContain("布林带");
    expect(md).toContain("EMA");
    expect(md).toContain("ATR");
    expect(md).toContain("VWAP");
    expect(md).toContain("TSLA");
  });
});
