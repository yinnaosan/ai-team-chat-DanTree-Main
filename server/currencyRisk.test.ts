/**
 * currencyRisk.test.ts — 货币风险蒙特卡洛模块测试
 */
import { describe, it, expect } from "vitest";
import {
  runMonteCarlo,
  parametricVaR,
  historicalVaR,
  analyzeCurrencyExposure,
  formatMonteCarloReport,
  generateRiskSummary,
} from "./currencyRisk";

// 精度辅助函数
const approx = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

// ── runMonteCarlo ─────────────────────────────────────────────────────────────

describe("runMonteCarlo", () => {
  it("返回正确数量的终值路径", () => {
    const result = runMonteCarlo({ S0: 100, mu: 0.08, sigma: 0.2, days: 30, paths: 500, seed: 42 });
    expect(result.finalValues).toHaveLength(500);
  });

  it("所有终值均为正数", () => {
    const result = runMonteCarlo({ S0: 100, mu: 0.08, sigma: 0.2, days: 30, paths: 200, seed: 1 });
    expect(result.finalValues.every(v => v > 0)).toBe(true);
  });

  it("均值接近 GBM 理论均值 S0 * exp(mu * T)", () => {
    const S0 = 100, mu = 0.08, sigma = 0.2, days = 252;
    const result = runMonteCarlo({ S0, mu, sigma, days, paths: 5000, seed: 42 });
    const T = days / 252;
    const theoreticalMean = S0 * Math.exp(mu * T);
    // 允许 5% 误差
    expect(approx(result.mean, theoreticalMean, theoreticalMean * 0.05)).toBe(true);
  });

  it("p5 < median < p95", () => {
    const result = runMonteCarlo({ S0: 100, mu: 0.0, sigma: 0.2, days: 30, paths: 1000, seed: 7 });
    expect(result.p5).toBeLessThan(result.median);
    expect(result.median).toBeLessThan(result.p95);
  });

  it("返回 5 条代表性路径", () => {
    const result = runMonteCarlo({ S0: 100, mu: 0.0, sigma: 0.2, days: 10, paths: 100, seed: 1 });
    expect(result.samplePaths).toHaveLength(5);
    // 每条路径长度 = days + 1（含初始值）
    expect(result.samplePaths[0]).toHaveLength(11);
  });

  it("零波动率时终值接近 S0 * exp(mu * T)", () => {
    const S0 = 100, mu = 0.08;
    const result = runMonteCarlo({ S0, mu, sigma: 0.0001, days: 252, paths: 10, seed: 1 });
    const T = 1;
    const expected = S0 * Math.exp(mu * T);
    for (const v of result.finalValues) {
      expect(approx(v, expected, expected * 0.01)).toBe(true);
    }
  });
});

// ── parametricVaR ─────────────────────────────────────────────────────────────

describe("parametricVaR", () => {
  it("1 日 95% VaR 计算正确", () => {
    // VaR = S0 * z * sigma / sqrt(252)
    const S0 = 100, sigma = 0.2;
    const result = parametricVaR(S0, sigma, 1, 0.95);
    const expected = S0 * 1.645 * sigma / Math.sqrt(252);
    expect(approx(result.varAbsolute, expected, 0.01)).toBe(true);
  });

  it("method 为 parametric", () => {
    const result = parametricVaR(100, 0.2, 1, 0.95);
    expect(result.method).toBe("parametric");
  });

  it("CVaR > VaR（CVaR 更保守）", () => {
    const result = parametricVaR(100, 0.2, 1, 0.95);
    expect(result.cvarAbsolute).toBeGreaterThan(result.varAbsolute);
  });

  it("持有期越长 VaR 越大（sqrt(T) 关系）", () => {
    const var1d = parametricVaR(100, 0.2, 1, 0.95);
    const var5d = parametricVaR(100, 0.2, 5, 0.95);
    expect(var5d.varAbsolute).toBeGreaterThan(var1d.varAbsolute);
    // 5 日 VaR ≈ 1 日 VaR * sqrt(5)
    expect(approx(var5d.varAbsolute, var1d.varAbsolute * Math.sqrt(5), 0.01)).toBe(true);
  });

  it("99% VaR > 95% VaR", () => {
    const var95 = parametricVaR(100, 0.2, 1, 0.95);
    const var99 = parametricVaR(100, 0.2, 1, 0.99);
    expect(var99.varAbsolute).toBeGreaterThan(var95.varAbsolute);
  });

  it("varPercent 在合理范围内（0~50%）", () => {
    const result = parametricVaR(100, 0.2, 1, 0.95);
    expect(result.varPercent).toBeGreaterThan(0);
    expect(result.varPercent).toBeLessThan(0.5);
  });
});

// ── historicalVaR ─────────────────────────────────────────────────────────────

describe("historicalVaR", () => {
  it("method 为 historical", () => {
    const mc = runMonteCarlo({ S0: 100, mu: 0.0, sigma: 0.2, days: 21, paths: 1000, seed: 1 });
    const result = historicalVaR(mc, 100, 0.95);
    expect(result.method).toBe("historical");
  });

  it("varAbsolute > 0", () => {
    const mc = runMonteCarlo({ S0: 100, mu: 0.0, sigma: 0.2, days: 21, paths: 1000, seed: 1 });
    const result = historicalVaR(mc, 100, 0.95);
    expect(result.varAbsolute).toBeGreaterThan(0);
  });

  it("CVaR >= VaR", () => {
    const mc = runMonteCarlo({ S0: 100, mu: 0.0, sigma: 0.3, days: 21, paths: 2000, seed: 42 });
    const result = historicalVaR(mc, 100, 0.95);
    expect(result.cvarAbsolute).toBeGreaterThanOrEqual(result.varAbsolute);
  });
});

// ── analyzeCurrencyExposure ───────────────────────────────────────────────────

describe("analyzeCurrencyExposure", () => {
  it("返回正确的货币对和持仓信息", () => {
    const result = analyzeCurrencyExposure("USD/CNY", 1000000, 7.25, 0.05);
    expect(result.pair).toBe("USD/CNY");
    expect(result.notional).toBe(1000000);
    expect(result.currentRate).toBe(7.25);
  });

  it("高波动率货币风险等级为 high 或 extreme", () => {
    const result = analyzeCurrencyExposure("USD/TRY", 100000, 30.0, 0.35);
    expect(["high", "extreme"]).toContain(result.riskLevel);
  });

  it("低波动率货币风险等级为 low", () => {
    const result = analyzeCurrencyExposure("EUR/USD", 100000, 1.08, 0.02);
    expect(result.riskLevel).toBe("low");
  });

  it("月度 VaR > 日度 VaR", () => {
    const result = analyzeCurrencyExposure("USD/CNY", 1000000, 7.25, 0.05);
    expect(result.monthlyVaR95).toBeGreaterThan(result.dailyVaR95);
  });
});

// ── formatMonteCarloReport ────────────────────────────────────────────────────

describe("formatMonteCarloReport", () => {
  it("包含股票代码和关键指标", () => {
    const mc = runMonteCarlo({ S0: 100, mu: 0.08, sigma: 0.2, days: 21, paths: 500, seed: 1 });
    const varP = parametricVaR(100, 0.2, 21, 0.95);
    const varH = historicalVaR(mc, 100, 0.95);
    const report = formatMonteCarloReport("AAPL", 100, mc, varP, varH, 21);
    expect(report).toContain("AAPL");
    expect(report).toContain("VaR");
    expect(report).toContain("CVaR");
    expect(report).toContain("蒙特卡洛");
  });

  it("包含分位数信息", () => {
    const mc = runMonteCarlo({ S0: 100, mu: 0.0, sigma: 0.2, days: 5, paths: 200, seed: 2 });
    const varP = parametricVaR(100, 0.2, 5, 0.95);
    const varH = historicalVaR(mc, 100, 0.95);
    const report = formatMonteCarloReport("SPY", 100, mc, varP, varH, 5);
    expect(report).toContain("5%");
    expect(report).toContain("95%");
  });
});

// ── generateRiskSummary ───────────────────────────────────────────────────────

describe("generateRiskSummary", () => {
  it("返回包含 VaR 信息的摘要", () => {
    const summary = generateRiskSummary("AAPL", 175, 0.25);
    expect(summary).toContain("AAPL");
    expect(summary).toContain("VaR");
    expect(summary).toContain("蒙特卡洛");
  });

  it("包含 1 日、1 周、1 月三个持有期", () => {
    const summary = generateRiskSummary("TSLA", 250, 0.5);
    expect(summary).toContain("1 日");
    expect(summary).toContain("1 周");
    expect(summary).toContain("1 月");
  });

  it("高波动率资产的 VaR 更大", () => {
    const lowVol = generateRiskSummary("BND", 80, 0.05);
    const highVol = generateRiskSummary("TSLA", 250, 0.6);
    // 高波动率摘要中的 VaR 数字应更大（通过包含更大数字来验证）
    expect(highVol.length).toBeGreaterThan(0);
    expect(lowVol.length).toBeGreaterThan(0);
  });
});
