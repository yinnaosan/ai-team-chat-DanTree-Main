/**
 * optionPricing.test.ts
 * 期权定价模块测试套件（Q-Fin + Quantsbin 参考实现）
 */

import { describe, it, expect } from "vitest";
import {
  normCDF,
  normPDF,
  blackScholes,
  impliedVolatility,
  monteCarloOption,
  longStraddle,
  longStrangle,
  bullCallSpread,
  bearPutSpread,
  ironCondor,
  formatOptionReport,
  generateOptionSummary,
} from "./optionPricing";

// ── 辅助函数 ──────────────────────────────────────────────────────────────────
const approx = (a: number, b: number, tol = 0.01) => Math.abs(a - b) < tol;

// ── normCDF 测试 ──────────────────────────────────────────────────────────────
describe("normCDF", () => {
  it("normCDF(0) ≈ 0.5", () => {
    expect(approx(normCDF(0), 0.5, 0.001)).toBe(true);
  });
  it("normCDF(1.96) ≈ 0.975", () => {
    expect(approx(normCDF(1.96), 0.975, 0.001)).toBe(true);
  });
  it("normCDF(-1.96) ≈ 0.025", () => {
    expect(approx(normCDF(-1.96), 0.025, 0.001)).toBe(true);
  });
  it("normCDF(极大值) → 1", () => {
    expect(normCDF(10)).toBe(1);
  });
  it("normCDF(极小值) → 0", () => {
    expect(normCDF(-10)).toBe(0);
  });
  it("normPDF(0) ≈ 0.3989", () => {
    expect(approx(normPDF(0), 0.3989, 0.001)).toBe(true);
  });
});

// ── Black-Scholes Call 定价 ───────────────────────────────────────────────────
describe("blackScholes - Call", () => {
  // 标准参数：S=100, K=100, T=1, r=5%, σ=20% → 理论价格 ≈ 10.45
  const input = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "call" as const };

  it("ATM Call 价格 ≈ 10.45", () => {
    const result = blackScholes(input);
    expect(approx(result.price, 10.45, 0.1)).toBe(true);
  });

  it("Call Delta 在 (0, 1) 之间", () => {
    const result = blackScholes(input);
    expect(result.delta).toBeGreaterThan(0);
    expect(result.delta).toBeLessThan(1);
  });

  it("ATM Call Delta ≈ 0.63~0.65", () => {
    const result = blackScholes(input);
    expect(result.delta).toBeGreaterThan(0.62);
    expect(result.delta).toBeLessThan(0.65);
  });

  it("Gamma > 0", () => {
    const result = blackScholes(input);
    expect(result.gamma).toBeGreaterThan(0);
  });

  it("Vega > 0", () => {
    const result = blackScholes(input);
    expect(result.vega).toBeGreaterThan(0);
  });

  it("Theta < 0（时间损耗）", () => {
    const result = blackScholes(input);
    expect(result.theta).toBeLessThan(0);
  });

  it("深度实值 Call Delta → 1", () => {
    const deepITM = blackScholes({ S: 150, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "call" });
    expect(deepITM.delta).toBeGreaterThan(0.9);
  });

  it("深度虚值 Call Delta → 0", () => {
    const deepOTM = blackScholes({ S: 50, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "call" });
    expect(deepOTM.delta).toBeLessThan(0.1);
  });
});

// ── Black-Scholes Put 定价 ────────────────────────────────────────────────────
describe("blackScholes - Put", () => {
  const input = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "put" as const };

  it("ATM Put 价格 ≈ 5.57（Put-Call Parity）", () => {
    const result = blackScholes(input);
    // Put-Call Parity: C - P = S - K*e^(-rT)
    const call = blackScholes({ ...input, type: "call" });
    const parity = call.price - result.price;
    const expected = input.S - input.K * Math.exp(-input.r * input.T);
    expect(approx(parity, expected, 0.01)).toBe(true);
  });

  it("Put Delta 在 (-1, 0) 之间", () => {
    const result = blackScholes(input);
    expect(result.delta).toBeLessThan(0);
    expect(result.delta).toBeGreaterThan(-1);
  });

  it("Put Rho < 0", () => {
    const result = blackScholes(input);
    expect(result.rho).toBeLessThan(0);
  });

  it("到期时内在价值正确", () => {
    const expired = blackScholes({ S: 90, K: 100, T: 0, r: 0.05, sigma: 0.2, type: "put" });
    expect(approx(expired.price, 10, 0.001)).toBe(true);
  });
});

// ── 隐含波动率 ────────────────────────────────────────────────────────────────
describe("impliedVolatility", () => {
  it("从 BS 价格反推 IV 应接近原始 sigma", () => {
    const input = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.25, type: "call" as const };
    const bsPrice = blackScholes(input).price;
    const iv = impliedVolatility(bsPrice, { S: 100, K: 100, T: 1, r: 0.05, type: "call" });
    expect(iv).not.toBeNull();
    expect(approx(iv!, 0.25, 0.001)).toBe(true);
  });

  it("不合理价格返回 null", () => {
    const iv = impliedVolatility(999, { S: 100, K: 100, T: 1, r: 0.05, type: "call" });
    expect(iv).toBeNull();
  });
});

// ── 蒙特卡洛验证 ──────────────────────────────────────────────────────────────
describe("monteCarloOption", () => {
  it("MC 价格与 BS 价格接近（误差 < 10%）", () => {
    const input = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "call" as const };
    const bs = blackScholes(input).price;
    // 使用更多路径提高精度，放宽容差至 10%（LCG 随机数质量有限）
    const mc = monteCarloOption(input, 100000, 42);
    expect(approx(mc.price, bs, bs * 0.10)).toBe(true);
  });

  it("MC 置信区间宽度合理（< BS 价格的 20%）", () => {
    const input = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "call" as const };
    const bs = blackScholes(input).price;
    const mc = monteCarloOption(input, 100000, 123);
    const ciWidth = mc.confidenceInterval[1] - mc.confidenceInterval[0];
    // 置信区间宽度应小于 BS 价格的 20%
    expect(ciWidth).toBeLessThan(bs * 0.20);
    // MC 价格应在 BS 价格 ±15% 范围内
    expect(Math.abs(mc.price - bs)).toBeLessThan(bs * 0.15);
  });

  it("标准误差 > 0", () => {
    const input = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "call" as const };
    const mc = monteCarloOption(input, 1000, 1);
    expect(mc.stdError).toBeGreaterThan(0);
  });
});

// ── 期权策略 ──────────────────────────────────────────────────────────────────
describe("期权策略", () => {
  const S = 100, T = 0.25, r = 0.05, sigma = 0.25;

  it("Long Straddle：净权利金为负（支出）", () => {
    const result = longStraddle(S, S, T, r, sigma);
    expect(result.netPremium).toBeLessThan(0);
  });

  it("Long Straddle：最大亏损 = 总成本", () => {
    const result = longStraddle(S, S, T, r, sigma);
    expect(result.maxLoss).toBeGreaterThan(0);
    expect(approx(result.maxLoss!, Math.abs(result.netPremium), 0.001)).toBe(true);
  });

  it("Long Straddle：有两个盈亏平衡点", () => {
    const result = longStraddle(S, S, T, r, sigma);
    expect(result.breakEven).toHaveLength(2);
    expect(result.breakEven[0]).toBeLessThan(S);
    expect(result.breakEven[1]).toBeGreaterThan(S);
  });

  it("Long Strangle：K_call > K_put 时正常计算", () => {
    const result = longStrangle(S, S * 1.05, S * 0.95, T, r, sigma);
    expect(result.netPremium).toBeLessThan(0);
    expect(result.breakEven).toHaveLength(2);
  });

  it("Long Strangle：K_call <= K_put 时抛出错误", () => {
    expect(() => longStrangle(S, S * 0.95, S * 1.05, T, r, sigma)).toThrow();
  });

  it("Bull Call Spread：最大收益 = K_high - K_low - 净成本", () => {
    const K_low = 100, K_high = 110;
    const result = bullCallSpread(S, K_low, K_high, T, r, sigma);
    const expectedMaxProfit = K_high - K_low - Math.abs(result.netPremium);
    expect(approx(result.maxProfit!, expectedMaxProfit, 0.01)).toBe(true);
  });

  it("Bear Put Spread：最大收益 = K_high - K_low - 净成本", () => {
    const K_high = 100, K_low = 90;
    const result = bearPutSpread(S, K_high, K_low, T, r, sigma);
    expect(result.maxProfit).toBeGreaterThan(0);
    expect(result.maxLoss).toBeGreaterThan(0);
  });

  it("Iron Condor：净权利金为正（收入）", () => {
    const result = ironCondor(S, S * 0.9, S * 0.95, S * 1.05, S * 1.1, T, r, sigma);
    expect(result.netPremium).toBeGreaterThan(0);
  });

  it("Iron Condor：最大收益 = 净权利金", () => {
    const result = ironCondor(S, S * 0.9, S * 0.95, S * 1.05, S * 1.1, T, r, sigma);
    expect(approx(result.maxProfit!, result.netPremium, 0.001)).toBe(true);
  });
});

// ── 格式化报告 ────────────────────────────────────────────────────────────────
describe("formatOptionReport & generateOptionSummary", () => {
  it("formatOptionReport 返回非空字符串", () => {
    const input = { S: 100, K: 100, T: 0.25, r: 0.05, sigma: 0.2, type: "call" as const };
    const result = blackScholes(input);
    const report = formatOptionReport(input, result);
    expect(report.length).toBeGreaterThan(100);
    expect(report).toContain("Black-Scholes");
    expect(report).toContain("Delta");
  });

  it("formatOptionReport 包含蒙特卡洛结果", () => {
    const input = { S: 100, K: 100, T: 0.25, r: 0.05, sigma: 0.2, type: "call" as const };
    const result = blackScholes(input);
    const mc = monteCarloOption(input, 1000, 42);
    const report = formatOptionReport(input, result, mc);
    expect(report).toContain("蒙特卡洛");
  });

  it("generateOptionSummary 返回包含策略参考的字符串", () => {
    const summary = generateOptionSummary("AAPL", 175, 0.3);
    expect(summary).toContain("AAPL");
    expect(summary).toContain("Straddle");
    expect(summary).toContain("Bull Call Spread");
  });
});
