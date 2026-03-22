/**
 * technicalSignals.test.ts — 技术信号自动标注模块测试
 */

import { describe, it, expect } from "vitest";
import { generateTechnicalSignalReport, generateSignalBadge } from "./technicalSignals";
import type { LocalTechnicalIndicators } from "./localIndicators";

// ── 测试数据工厂 ──────────────────────────────────────────────────────────────

function makeIndicators(overrides: Partial<LocalTechnicalIndicators> = {}): LocalTechnicalIndicators {
  return {
    symbol: "AAPL",
    fetchedAt: new Date().toISOString(),
    priceData: { current: 175, prev: 170, change: 5, changePct: 2.94 },
    // 默认：RSI 中性，MACD 看涨，均线多头排列
    rsi14: [55, 52, 50, 48, 45],
    macdLine: [0.5, 0.3, 0.1, -0.1, -0.2],
    macdSignal: [0.3, 0.2, 0.2, 0.1, 0.0],
    bbUpper: [180, 179, 178, 177, 176],
    bbMiddle: [170, 169, 168, 167, 166],
    bbLower: [160, 159, 158, 157, 156],
    ema20: [173, 172, 171, 170, 169],
    ema50: [168, 167, 166, 165, 164],
    sma50: [167, 166, 165, 164, 163],
    sma200: [160, 159, 158, 157, 156],
    atr14: [3.5, 3.4, 3.3, 3.2, 3.1],
    stochK: [60, 55, 50, 45, 40],
    stochD: [55, 52, 48, 44, 40],
    kdjK: [65, 60, 55, 50, 45],
    kdjD: [60, 58, 55, 50, 45],
    kdjJ: [75, 64, 55, 50, 45],
    cci20: [50, 40, 30, 20, 10],
    obvValues: [1e8, 9.9e7, 9.8e7, 9.7e7, 9.6e7],
    vwapValues: [172, 171, 170, 169, 168],
    williamsRValues: [-40, -45, -50, -55, -60],
    dataPoints: 250,
    ...overrides,
  };
}

// ── 测试套件 ──────────────────────────────────────────────────────────────────

describe("generateTechnicalSignalReport - 基本结构", () => {
  it("返回完整报告结构", () => {
    const data = makeIndicators();
    const report = generateTechnicalSignalReport(data);

    expect(report.symbol).toBe("AAPL");
    expect(typeof report.overallScore).toBe("number");
    expect(typeof report.confidence).toBe("number");
    expect(Array.isArray(report.signals)).toBe(true);
    expect(Array.isArray(report.crossovers)).toBe(true);
    expect(typeof report.summary).toBe("string");
    expect(typeof report.detailedMarkdown).toBe("string");
  });

  it("评分在 -100 到 +100 范围内", () => {
    const data = makeIndicators();
    const report = generateTechnicalSignalReport(data);
    expect(report.overallScore).toBeGreaterThanOrEqual(-100);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  it("置信度在 0 到 100 范围内", () => {
    const data = makeIndicators();
    const report = generateTechnicalSignalReport(data);
    expect(report.confidence).toBeGreaterThanOrEqual(0);
    expect(report.confidence).toBeLessThanOrEqual(100);
  });

  it("Markdown 包含股票代码", () => {
    const data = makeIndicators();
    const report = generateTechnicalSignalReport(data);
    expect(report.detailedMarkdown).toContain("AAPL");
  });

  it("Markdown 包含信号汇总表", () => {
    const data = makeIndicators();
    const report = generateTechnicalSignalReport(data);
    expect(report.detailedMarkdown).toContain("多指标信号汇总");
  });
});

describe("generateTechnicalSignalReport - RSI 信号", () => {
  it("RSI 超卖（<30）产生买入信号", () => {
    const data = makeIndicators({ rsi14: [25, 28, 30, 32, 35] });
    const report = generateTechnicalSignalReport(data);
    const rsiSignal = report.signals.find(s => s.indicator === "RSI(14)");
    expect(rsiSignal).toBeDefined();
    expect(["buy", "strong_buy"]).toContain(rsiSignal!.direction);
  });

  it("RSI 超买（>70）产生卖出信号", () => {
    const data = makeIndicators({ rsi14: [75, 72, 70, 68, 65] });
    const report = generateTechnicalSignalReport(data);
    const rsiSignal = report.signals.find(s => s.indicator === "RSI(14)");
    expect(rsiSignal).toBeDefined();
    expect(["sell", "strong_sell"]).toContain(rsiSignal!.direction);
  });

  it("RSI 从超卖区回升触发反弹信号", () => {
    const data = makeIndicators({ rsi14: [31, 28, 25, 22, 20] }); // 从28回升到31
    const report = generateTechnicalSignalReport(data);
    const rsiSignal = report.signals.find(s => s.indicator === "RSI(14)");
    expect(rsiSignal?.pattern).toBe("超卖反弹");
  });

  it("RSI 深度超卖（<20）产生强烈买入", () => {
    const data = makeIndicators({ rsi14: [15, 17, 19, 21, 23] });
    const report = generateTechnicalSignalReport(data);
    const rsiSignal = report.signals.find(s => s.indicator === "RSI(14)");
    expect(rsiSignal?.direction).toBe("strong_buy");
  });
});

describe("generateTechnicalSignalReport - MACD 信号", () => {
  it("MACD 金叉产生买入信号", () => {
    // macdLine[0] > macdSignal[0]，macdLine[1] <= macdSignal[1]
    const data = makeIndicators({
      macdLine: [0.2, -0.1, -0.2, -0.3, -0.4],
      macdSignal: [0.1, 0.0, 0.1, 0.2, 0.3],
    });
    const report = generateTechnicalSignalReport(data);
    const macdSignal = report.signals.find(s => s.indicator === "MACD");
    expect(macdSignal?.pattern).toBe("金叉");
    expect(macdSignal?.direction).toBe("buy");
  });

  it("MACD 死叉产生卖出信号", () => {
    // macdLine[0] < macdSignal[0]，macdLine[1] >= macdSignal[1]
    const data = makeIndicators({
      macdLine: [-0.2, 0.1, 0.2, 0.3, 0.4],
      macdSignal: [-0.1, 0.0, -0.1, -0.2, -0.3],
    });
    const report = generateTechnicalSignalReport(data);
    const macdSignal = report.signals.find(s => s.indicator === "MACD");
    expect(macdSignal?.pattern).toBe("死叉");
    expect(macdSignal?.direction).toBe("sell");
  });
});

describe("generateTechnicalSignalReport - 均线信号", () => {
  it("多头排列产生买入信号", () => {
    const data = makeIndicators({
      ema20: [175, 174, 173, 172, 171],
      ema50: [170, 169, 168, 167, 166],
      sma200: [160, 159, 158, 157, 156],
    });
    const report = generateTechnicalSignalReport(data);
    const maSignal = report.signals.find(s => s.indicator === "均线系统");
    expect(maSignal?.pattern).toBe("多头排列");
    expect(maSignal?.direction).toBe("buy");
  });

  it("空头排列产生卖出信号", () => {
    const data = makeIndicators({
      ema20: [155, 156, 157, 158, 159],
      ema50: [160, 161, 162, 163, 164],
      sma200: [170, 171, 172, 173, 174],
    });
    const report = generateTechnicalSignalReport(data);
    const maSignal = report.signals.find(s => s.indicator === "均线系统");
    expect(maSignal?.pattern).toBe("空头排列");
    expect(maSignal?.direction).toBe("sell");
  });

  it("EMA 金叉产生强烈买入信号", () => {
    // ema20[0] > ema50[0]，ema20[1] <= ema50[1]
    const data = makeIndicators({
      ema20: [171, 169, 168, 167, 166],
      ema50: [170, 170, 170, 170, 170],
      sma200: [160, 159, 158, 157, 156],
    });
    const report = generateTechnicalSignalReport(data);
    const maSignal = report.signals.find(s => s.indicator === "均线系统");
    expect(maSignal?.pattern).toBe("EMA金叉");
    expect(maSignal?.direction).toBe("strong_buy");
  });
});

describe("generateTechnicalSignalReport - 交叉事件检测", () => {
  it("检测 MACD 金叉事件", () => {
    const data = makeIndicators({
      macdLine: [0.2, -0.1, -0.2, -0.3, -0.4],
      macdSignal: [0.1, 0.0, 0.1, 0.2, 0.3],
    });
    const report = generateTechnicalSignalReport(data);
    const macdCross = report.crossovers.find(c => c.type === "macd_bullish_cross");
    expect(macdCross).toBeDefined();
    expect(macdCross?.label).toBe("MACD 金叉");
  });

  it("检测 EMA 金叉事件", () => {
    const data = makeIndicators({
      ema20: [171, 169, 168, 167, 166],
      ema50: [170, 170, 170, 170, 170],
      sma200: [160, 159, 158, 157, 156],
    });
    const report = generateTechnicalSignalReport(data);
    const emaCross = report.crossovers.find(c => c.type === "golden_cross");
    expect(emaCross).toBeDefined();
    expect(emaCross?.label).toBe("EMA 金叉");
  });
});

describe("generateTechnicalSignalReport - 关键价位", () => {
  it("识别支撑位和阻力位", () => {
    const data = makeIndicators();
    const report = generateTechnicalSignalReport(data);
    expect(Array.isArray(report.keyLevels.support)).toBe(true);
    expect(Array.isArray(report.keyLevels.resistance)).toBe(true);
  });

  it("价格下方均线作为支撑", () => {
    const data = makeIndicators({
      priceData: { current: 175, prev: 170, change: 5, changePct: 2.94 },
      ema20: [173, 172, 171],
      ema50: [168, 167, 166],
      sma200: [160, 159, 158],
    });
    const report = generateTechnicalSignalReport(data);
    // 支撑位应包含低于当前价格的均线
    expect(report.keyLevels.support.length).toBeGreaterThan(0);
    report.keyLevels.support.forEach(s => {
      expect(s).toBeLessThan(175);
    });
  });
});

describe("generateTechnicalSignalReport - 综合评分", () => {
  it("全部看涨信号时评分为正", () => {
    const data = makeIndicators({
      rsi14: [25, 28, 30, 32, 35],       // 超卖 → 买入
      macdLine: [0.5, 0.3, 0.1, -0.1, -0.2],  // MACD 在信号线上方
      macdSignal: [0.3, 0.2, 0.2, 0.1, 0.0],
      ema20: [175, 174, 173, 172, 171],   // 多头排列
      ema50: [170, 169, 168, 167, 166],
      sma200: [160, 159, 158, 157, 156],
    });
    const report = generateTechnicalSignalReport(data);
    expect(report.overallScore).toBeGreaterThan(0);
  });

  it("全部看跌信号时评分为负", () => {
    const data = makeIndicators({
      rsi14: [75, 72, 70, 68, 65],       // 超买 → 卖出
      macdLine: [-0.5, -0.3, -0.1, 0.1, 0.2],  // MACD 在信号线下方
      macdSignal: [-0.3, -0.2, -0.2, -0.1, 0.0],
      ema20: [155, 156, 157, 158, 159],   // 空头排列
      ema50: [160, 161, 162, 163, 164],
      sma200: [170, 171, 172, 173, 174],
    });
    const report = generateTechnicalSignalReport(data);
    expect(report.overallScore).toBeLessThan(0);
  });
});

describe("generateSignalBadge", () => {
  it("返回简短信号徽章字符串", () => {
    const data = makeIndicators();
    const badge = generateSignalBadge(data);
    expect(typeof badge).toBe("string");
    expect(badge).toContain("技术信号");
    expect(badge).toContain("评分");
    expect(badge).toContain("置信度");
  });

  it("包含方向文字", () => {
    const data = makeIndicators();
    const badge = generateSignalBadge(data);
    // 应包含方向标签中的某个词
    const hasDirection = ["强烈买入", "买入", "中性", "卖出", "强烈卖出"].some(d => badge.includes(d));
    expect(hasDirection).toBe(true);
  });
});
