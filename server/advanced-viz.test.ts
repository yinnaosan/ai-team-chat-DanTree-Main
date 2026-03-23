/**
 * advanced-viz.test.ts
 * 三项高级可视化功能单元测试：
 * 1. IV Smile 数据结构验证（getIVSmileData 返回类型 + 二分法 IV 反推）
 * 2. generateOptionSummary async 改造验证（返回 Promise<string>）
 * 3. 因子相关性矩阵计算逻辑验证（computeCorrelationMatrix 纯前端逻辑）
 */

import { describe, it, expect } from "vitest";
import {
  blackScholes,
  impliedVolatility,
  generateOptionSummary,
} from "./optionPricing";

// ── 1. IV Smile 二分法反推验证 ─────────────────────────────────────────────────

describe("IV Smile - 隐含波动率反推（二分法）", () => {
  it("impliedVolatility 应能从 BS 价格反推出原始 sigma", () => {
    const S = 150, K = 150, T = 30 / 365, r = 0.05, sigma = 0.25;
    const callPrice = blackScholes({ S, K, T, r, sigma, type: "call" }).price;
    const impliedSigma = impliedVolatility(callPrice, { S, K, T, r, type: "call" });
    expect(impliedSigma).toBeCloseTo(sigma, 2);
  });

  it("Put 期权 IV 反推应与原始 sigma 一致", () => {
    const S = 200, K = 190, T = 60 / 365, r = 0.04, sigma = 0.30;
    const putPrice = blackScholes({ S, K, T, r, sigma, type: "put" }).price;
    const impliedSigma = impliedVolatility(putPrice, { S, K, T, r, type: "put" });
    expect(impliedSigma).toBeCloseTo(sigma, 2);
  });

  it("OTM Call 的 IV 反推应准确", () => {
    const S = 100, K = 110, T = 45 / 365, r = 0.05, sigma = 0.20;
    const callPrice = blackScholes({ S, K, T, r, sigma, type: "call" }).price;
    const impliedSigma = impliedVolatility(callPrice, { S, K, T, r, type: "call" });
    expect(impliedSigma).toBeCloseTo(sigma, 2);
  });

  it("Deep OTM Put 的 IV 反推应准确", () => {
    const S = 100, K = 80, T = 30 / 365, r = 0.05, sigma = 0.35;
    const putPrice = blackScholes({ S, K, T, r, sigma, type: "put" }).price;
    const impliedSigma = impliedVolatility(putPrice, { S, K, T, r, type: "put" });
    expect(impliedSigma).toBeCloseTo(sigma, 2);
  });
});

// ── 2. generateOptionSummary async 改造验证 ───────────────────────────────────

describe("generateOptionSummary - async 改造", () => {
  it("应返回 Promise<string>", async () => {
    const result = generateOptionSummary("AAPL", 150, 0.25);
    expect(result).toBeInstanceOf(Promise);
    const text = await result;
    expect(typeof text).toBe("string");
  }, 15000);

  it("返回的字符串应包含 %%OPTION_PRICING%% 标记", async () => {
    const text = await generateOptionSummary("TSLA", 200, 0.40);
    expect(text).toContain("%%OPTION_PRICING%%");
    expect(text).toContain("%%END_OPTION_PRICING%%");
  });

  it("JSON 标记内应包含有效的 structuredPayload", async () => {
    const text = await generateOptionSummary("MSFT", 300, 0.22);
    const match = text.match(/%%OPTION_PRICING%%([\s\S]*?)%%END_OPTION_PRICING%%/);
    expect(match).toBeTruthy();
    const payload = JSON.parse(match![1]);
    expect(payload.ticker).toBe("MSFT");
    expect(payload.spotPrice).toBe(300);
    expect(payload.optionChain).toHaveLength(8);
    expect(payload.strategies).toHaveLength(2);
  });

  it("structuredPayload 中 optionChain 应包含正确的 Greeks 字段", async () => {
    const text = await generateOptionSummary("NVDA", 500, 0.50);
    const match = text.match(/%%OPTION_PRICING%%([\s\S]*?)%%END_OPTION_PRICING%%/);
    const payload = JSON.parse(match![1]);
    const atmCall = payload.optionChain.find((o: { label: string }) => o.label === "ATM Call");
    expect(atmCall).toBeTruthy();
    expect(typeof atmCall.delta).toBe("number");
    expect(typeof atmCall.gamma).toBe("number");
    expect(typeof atmCall.vega).toBe("number");
    expect(typeof atmCall.theta).toBe("number");
    expect(typeof atmCall.rho).toBe("number");
    // ATM Call delta 应接近 0.5
    expect(atmCall.delta).toBeGreaterThan(0.3);
    expect(atmCall.delta).toBeLessThan(0.7);
  });

  it("策略参考应包含 Straddle 和 Bull Call Spread", async () => {
    const text = await generateOptionSummary("AMZN", 180, 0.28);
    const match = text.match(/%%OPTION_PRICING%%([\s\S]*?)%%END_OPTION_PRICING%%/);
    const payload = JSON.parse(match![1]);
    const names = payload.strategies.map((s: { name: string }) => s.name);
    expect(names.some((n: string) => n.toLowerCase().includes("straddle") || n.includes("跨式"))).toBe(true);
    expect(names.some((n: string) => n.toLowerCase().includes("spread") || n.includes("价差"))).toBe(true);
  });

  it("ivSmile 字段应存在（可为 undefined 或数组）", async () => {
    const text = await generateOptionSummary("GOOGL", 170, 0.25);
    const match = text.match(/%%OPTION_PRICING%%([\s\S]*?)%%END_OPTION_PRICING%%/);
    const payload = JSON.parse(match![1]);
    // ivSmile 可以是 undefined（Polygon 网络不可用）或数组
    expect(payload.ivSmile === undefined || Array.isArray(payload.ivSmile)).toBe(true);
  });
});

// ── 3. 因子相关性矩阵逻辑验证（纯 JS 计算，不依赖 React）────────────────────────

describe("因子相关性矩阵 - 皮尔逊相关系数计算", () => {
  // 复制前端的 computeCorrelationMatrix 逻辑进行独立测试
  interface FactorData {
    signal: 1 | -1 | 0;
    strength: number;
    zScore: number | null;
  }

  function computeCorr(factors: FactorData[]): number[][] {
    const n = factors.length;
    const vectors = factors.map(f => {
      const base = f.signal * f.strength;
      const z = f.zScore !== null ? f.zScore : base / 50;
      return [base, z, f.strength];
    });
    const corr: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) { corr[i][j] = 1; continue; }
        const xi = vectors[i], xj = vectors[j];
        const dim = xi.length;
        let sumXY = 0, sumX2 = 0, sumY2 = 0;
        const meanX = xi.reduce((a, b) => a + b, 0) / dim;
        const meanY = xj.reduce((a, b) => a + b, 0) / dim;
        for (let k = 0; k < dim; k++) {
          sumXY += (xi[k] - meanX) * (xj[k] - meanY);
          sumX2 += (xi[k] - meanX) ** 2;
          sumY2 += (xj[k] - meanY) ** 2;
        }
        const denom = Math.sqrt(sumX2 * sumY2);
        corr[i][j] = denom === 0 ? 0 : parseFloat((sumXY / denom).toFixed(3));
      }
    }
    return corr;
  }

  it("对角线应全为 1（自相关）", () => {
    const factors: FactorData[] = [
      { signal: 1, strength: 80, zScore: 1.5 },
      { signal: -1, strength: 60, zScore: -1.2 },
      { signal: 1, strength: 40, zScore: 0.8 },
    ];
    const corr = computeCorr(factors);
    for (let i = 0; i < factors.length; i++) {
      expect(corr[i][i]).toBe(1);
    }
  });

  it("相关系数应在 [-1, 1] 范围内", () => {
    const factors: FactorData[] = [
      { signal: 1, strength: 90, zScore: 2.0 },
      { signal: -1, strength: 70, zScore: -1.5 },
      { signal: 1, strength: 50, zScore: 1.0 },
      { signal: 0, strength: 30, zScore: 0.1 },
    ];
    const corr = computeCorr(factors);
    for (let i = 0; i < factors.length; i++) {
      for (let j = 0; j < factors.length; j++) {
        expect(corr[i][j]).toBeGreaterThanOrEqual(-1);
        expect(corr[i][j]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("矩阵应为对称矩阵（corr[i][j] === corr[j][i]）", () => {
    const factors: FactorData[] = [
      { signal: 1, strength: 85, zScore: 1.8 },
      { signal: 1, strength: 75, zScore: 1.6 },
      { signal: -1, strength: 55, zScore: -1.0 },
    ];
    const corr = computeCorr(factors);
    for (let i = 0; i < factors.length; i++) {
      for (let j = 0; j < factors.length; j++) {
        expect(corr[i][j]).toBeCloseTo(corr[j][i], 5);
      }
    }
  });

  it("完全相同的因子应有相关系数 1", () => {
    const f: FactorData = { signal: 1, strength: 80, zScore: 1.5 };
    const factors: FactorData[] = [f, { ...f }, { signal: -1, strength: 40, zScore: -0.5 }];
    const corr = computeCorr(factors);
    // 前两个因子完全相同，相关系数应为 1
    expect(corr[0][1]).toBeCloseTo(1, 3);
  });

  it("同向因子应有正相关性（强多头 vs 弱多头）", () => {
    // 两个同方向因子：一强一弱，应有正相关
    const factors: FactorData[] = [
      { signal: 1, strength: 90, zScore: 2.5 },   // 强多头
      { signal: 1, strength: 30, zScore: 0.8 },   // 弱多头
    ];
    const corr = computeCorr(factors);
    // 同方向因子相关系数应为正数
    expect(corr[0][1]).toBeGreaterThan(0);
  });

  it("零向量情况下应返回 0 而非 NaN", () => {
    const factors: FactorData[] = [
      { signal: 0, strength: 0, zScore: 0 },
      { signal: 1, strength: 50, zScore: 1.0 },
    ];
    const corr = computeCorr(factors);
    expect(isNaN(corr[0][1])).toBe(false);
    expect(corr[0][1]).toBe(0);
  });
});

// ── 4. OptionPricingCard JSON 解析验证 ────────────────────────────────────────

describe("OptionPricingCard - JSON 标记解析", () => {
  function parseOptionPricing(text: string) {
    const match = text.match(/%%OPTION_PRICING%%([\s\S]*?)%%END_OPTION_PRICING%%/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }

  it("应能从 generateOptionSummary 输出中解析 JSON", async () => {
    const text = await generateOptionSummary("SPY", 450, 0.15);
    const payload = parseOptionPricing(text);
    expect(payload).not.toBeNull();
    expect(payload.ticker).toBe("SPY");
  });

  it("解析后的 optionChain 应包含 8 个合约", async () => {
    const text = await generateOptionSummary("QQQ", 380, 0.18);
    const payload = parseOptionPricing(text);
    expect(payload.optionChain).toHaveLength(8);
  });

  it("解析后的 strategies 应包含 2 个策略", async () => {
    const text = await generateOptionSummary("IWM", 200, 0.22);
    const payload = parseOptionPricing(text);
    expect(payload.strategies).toHaveLength(2);
    for (const s of payload.strategies) {
      expect(s.breakEven).toBeInstanceOf(Array);
      expect(s.breakEven.length).toBeGreaterThan(0);
    }
  });
});
