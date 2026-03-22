/**
 * etfAnalysis.test.ts — ETF 分析模块测试
 */
import { describe, it, expect } from "vitest";
import {
  calculateETFRiskMetrics,
  scoreETF,
  formatETFReport,
  compareETFsSummary,
  isETFTask,
  extractETFTickers,
  type ETFBasicInfo,
} from "./etfAnalysis";

// ── 测试数据 ──────────────────────────────────────────────────────────────────

// 模拟 SPY 价格序列（252 个交易日，从 400 到 450 的平滑上涨 + 波动）
function generatePrices(n: number, start: number, end: number, seed = 42): number[] {
  const prices: number[] = [start];
  let s = seed >>> 0;
  const rng = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
  const drift = (end / start) ** (1 / n) - 1;
  for (let i = 1; i < n; i++) {
    const noise = (rng() - 0.5) * 0.02;
    prices.push(prices[i - 1] * (1 + drift + noise));
  }
  return prices;
}

const mockSPYInfo: ETFBasicInfo = {
  symbol: "SPY",
  name: "SPDR S&P 500 ETF Trust",
  aum: 450000, // $450B
  expenseRatio: 0.0009, // 0.09%
  trackingIndex: "S&P 500",
  assetClass: "US Large Cap Equity",
  region: "United States",
  dividendFrequency: "quarterly",
  dividendYield: 0.015,
  holdingsCount: 503,
  currentPrice: 450,
  yearReturn: 0.15,
};

const mockARKKInfo: ETFBasicInfo = {
  symbol: "ARKK",
  name: "ARK Innovation ETF",
  aum: 8000, // $8B
  expenseRatio: 0.0075, // 0.75%
  trackingIndex: null,
  assetClass: "Disruptive Innovation",
  region: "United States",
  dividendFrequency: null,
  dividendYield: 0,
  holdingsCount: 35,
  currentPrice: 45,
  yearReturn: -0.20,
};

// ── calculateETFRiskMetrics ───────────────────────────────────────────────────

describe("calculateETFRiskMetrics", () => {
  it("空价格数组返回零值", () => {
    const result = calculateETFRiskMetrics("TEST", []);
    expect(result.annualizedVol).toBe(0);
    expect(result.sharpeRatio).toBe(0);
    expect(result.maxDrawdown).toBe(0);
  });

  it("单价格返回零值", () => {
    const result = calculateETFRiskMetrics("TEST", [100]);
    expect(result.annualizedVol).toBe(0);
  });

  it("年化波动率在合理范围内（0~100%）", () => {
    const prices = generatePrices(252, 400, 450);
    const result = calculateETFRiskMetrics("SPY", prices);
    expect(result.annualizedVol).toBeGreaterThan(0);
    expect(result.annualizedVol).toBeLessThan(1.0);
  });

  it("最大回撤在 0~1 之间", () => {
    const prices = generatePrices(252, 400, 450);
    const result = calculateETFRiskMetrics("SPY", prices);
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.maxDrawdown).toBeLessThanOrEqual(1);
  });

  it("高波动率序列的年化波动率更高", () => {
    const lowVolPrices = generatePrices(252, 100, 110, 1);
    const highVolPrices = generatePrices(252, 100, 110, 2).map((p, i) =>
      p * (1 + (i % 2 === 0 ? 0.05 : -0.05))
    );
    const lowVol = calculateETFRiskMetrics("LOW", lowVolPrices);
    const highVol = calculateETFRiskMetrics("HIGH", highVolPrices);
    expect(highVol.annualizedVol).toBeGreaterThan(lowVol.annualizedVol);
  });

  it("计算 3 月、6 月、1 年收益率", () => {
    const prices = generatePrices(252, 400, 450);
    const result = calculateETFRiskMetrics("SPY", prices);
    expect(result.return3m).not.toBeNull();
    expect(result.return6m).not.toBeNull();
    expect(result.return1y).not.toBeNull();
  });

  it("价格不足 63 天时 return3m 为 null", () => {
    const prices = generatePrices(50, 100, 110);
    const result = calculateETFRiskMetrics("TEST", prices);
    expect(result.return3m).toBeNull();
  });

  it("symbol 字段正确返回", () => {
    const result = calculateETFRiskMetrics("ARKK", [100, 110, 105]);
    expect(result.symbol).toBe("ARKK");
  });
});

// ── scoreETF ─────────────────────────────────────────────────────────────────

describe("scoreETF", () => {
  it("SPY 评分应较高（低费率 + 大规模）", () => {
    const prices = generatePrices(252, 400, 450);
    const metrics = calculateETFRiskMetrics("SPY", prices);
    const score = scoreETF(mockSPYInfo, metrics);
    expect(score.totalScore).toBeGreaterThan(50);
    expect(score.costScore).toBeGreaterThanOrEqual(20); // 0.09% 费率应得高分
    expect(score.scaleScore).toBe(25); // $450B AUM 满分
  });

  it("ARKK 费率评分应较低（0.75% 费率）", () => {
    const prices = generatePrices(252, 100, 80); // 下跌趋势
    const metrics = calculateETFRiskMetrics("ARKK", prices);
    const score = scoreETF(mockARKKInfo, metrics);
    expect(score.costScore).toBeLessThan(15); // 0.75% 费率得分低
  });

  it("评级字段为有效值", () => {
    const prices = generatePrices(252, 400, 450);
    const metrics = calculateETFRiskMetrics("SPY", prices);
    const score = scoreETF(mockSPYInfo, metrics);
    expect(["A+", "A", "B+", "B", "C", "D"]).toContain(score.grade);
  });

  it("总分 = 四项分之和", () => {
    const prices = generatePrices(252, 400, 450);
    const metrics = calculateETFRiskMetrics("SPY", prices);
    const score = scoreETF(mockSPYInfo, metrics);
    expect(score.totalScore).toBe(score.costScore + score.scaleScore + score.returnScore + score.riskScore);
  });

  it("总分在 0~100 之间", () => {
    const prices = generatePrices(252, 100, 80);
    const metrics = calculateETFRiskMetrics("ARKK", prices);
    const score = scoreETF(mockARKKInfo, metrics);
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });

  it("summary 字段非空", () => {
    const prices = generatePrices(252, 400, 450);
    const metrics = calculateETFRiskMetrics("SPY", prices);
    const score = scoreETF(mockSPYInfo, metrics);
    expect(score.summary.length).toBeGreaterThan(0);
  });

  it("未知费率时给中等分", () => {
    const infoNoER: ETFBasicInfo = { ...mockSPYInfo, expenseRatio: null };
    const prices = generatePrices(100, 100, 110);
    const metrics = calculateETFRiskMetrics("TEST", prices);
    const score = scoreETF(infoNoER, metrics);
    expect(score.costScore).toBe(10);
  });
});

// ── formatETFReport ───────────────────────────────────────────────────────────

describe("formatETFReport", () => {
  it("包含 ETF 代码和名称", () => {
    const prices = generatePrices(252, 400, 450);
    const metrics = calculateETFRiskMetrics("SPY", prices);
    const score = scoreETF(mockSPYInfo, metrics);
    const report = formatETFReport(mockSPYInfo, metrics, score);
    expect(report).toContain("SPY");
    expect(report).toContain("S&P 500");
  });

  it("包含费率信息", () => {
    const prices = generatePrices(252, 400, 450);
    const metrics = calculateETFRiskMetrics("SPY", prices);
    const score = scoreETF(mockSPYInfo, metrics);
    const report = formatETFReport(mockSPYInfo, metrics, score);
    expect(report).toContain("0.090%"); // 0.0009 * 100 = 0.090%
  });

  it("包含评分和评级", () => {
    const prices = generatePrices(252, 400, 450);
    const metrics = calculateETFRiskMetrics("SPY", prices);
    const score = scoreETF(mockSPYInfo, metrics);
    const report = formatETFReport(mockSPYInfo, metrics, score);
    expect(report).toContain("评分");
    expect(report).toContain("评级");
  });
});

// ── compareETFsSummary ────────────────────────────────────────────────────────

describe("compareETFsSummary", () => {
  it("空数组返回空字符串", () => {
    expect(compareETFsSummary([])).toBe("");
  });

  it("包含所有 ETF 代码", () => {
    const spyPrices = generatePrices(252, 400, 450);
    const arkkPrices = generatePrices(252, 100, 80);
    const spyMetrics = calculateETFRiskMetrics("SPY", spyPrices);
    const arkkMetrics = calculateETFRiskMetrics("ARKK", arkkPrices);
    const spyScore = scoreETF(mockSPYInfo, spyMetrics);
    const arkkScore = scoreETF(mockARKKInfo, arkkMetrics);

    const summary = compareETFsSummary([
      { info: mockSPYInfo, metrics: spyMetrics, score: spyScore },
      { info: mockARKKInfo, metrics: arkkMetrics, score: arkkScore },
    ]);
    expect(summary).toContain("SPY");
    expect(summary).toContain("ARKK");
    expect(summary).toContain("推荐");
  });
});

// ── isETFTask ─────────────────────────────────────────────────────────────────

describe("isETFTask", () => {
  it("识别 ETF 关键词", () => {
    expect(isETFTask("分析 SPY ETF")).toBe(true);
    expect(isETFTask("QQQ 和 VOO 哪个更好")).toBe(true);
    expect(isETFTask("指数基金投资策略")).toBe(true);
    expect(isETFTask("被动投资")).toBe(true);
  });

  it("非 ETF 任务返回 false", () => {
    expect(isETFTask("分析苹果公司财报")).toBe(false);
    expect(isETFTask("比特币价格")).toBe(false);
  });
});

// ── extractETFTickers ─────────────────────────────────────────────────────────

describe("extractETFTickers", () => {
  it("提取已知 ETF 代码", () => {
    const tickers = extractETFTickers("我想比较 SPY 和 QQQ 的表现");
    expect(tickers).toContain("SPY");
    expect(tickers).toContain("QQQ");
  });

  it("最多返回 5 个", () => {
    const tickers = extractETFTickers("SPY QQQ VOO VTI IVV EEM GLD BND");
    expect(tickers.length).toBeLessThanOrEqual(5);
  });

  it("无 ETF 时返回空数组", () => {
    const tickers = extractETFTickers("今天天气不错");
    expect(tickers).toHaveLength(0);
  });
});
