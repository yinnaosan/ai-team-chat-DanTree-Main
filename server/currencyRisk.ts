/**
 * currencyRisk.ts — 货币风险与蒙特卡洛模拟模块
 * 参考：codez0mb1e/resistance（货币波动率分析）
 * 功能：
 *   1. GBM 蒙特卡洛路径模拟（汇率/股价）
 *   2. VaR（Value at Risk）计算（历史模拟法 + 参数法）
 *   3. CVaR（Conditional VaR / Expected Shortfall）
 *   4. 货币风险敞口分析
 *   5. 多货币组合风险报告
 */

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface MonteCarloInput {
  /** 当前价格/汇率 */
  S0: number;
  /** 年化漂移率（预期收益率） */
  mu: number;
  /** 年化波动率 */
  sigma: number;
  /** 模拟天数 */
  days: number;
  /** 模拟路径数量 */
  paths: number;
  /** 随机种子（可选，用于可重现结果） */
  seed?: number;
}

export interface MonteCarloResult {
  /** 终值分布（所有路径的最终价格） */
  finalValues: number[];
  /** 均值终值 */
  mean: number;
  /** 中位数终值 */
  median: number;
  /** 标准差 */
  std: number;
  /** 5% 分位数 */
  p5: number;
  /** 25% 分位数 */
  p25: number;
  /** 75% 分位数 */
  p75: number;
  /** 95% 分位数 */
  p95: number;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 代表性路径（5条：均值路径附近） */
  samplePaths: number[][];
}

export interface VaRResult {
  /** 置信水平（如 0.95 = 95%） */
  confidenceLevel: number;
  /** VaR（绝对损失金额） */
  varAbsolute: number;
  /** VaR（相对损失比例） */
  varPercent: number;
  /** CVaR / Expected Shortfall（超过 VaR 的平均损失） */
  cvarAbsolute: number;
  /** CVaR 百分比 */
  cvarPercent: number;
  /** 计算方法 */
  method: "historical" | "parametric";
}

export interface CurrencyExposure {
  /** 货币对（如 "USD/CNY"） */
  pair: string;
  /** 持仓金额（基础货币） */
  notional: number;
  /** 当前汇率 */
  currentRate: number;
  /** 年化波动率（估算） */
  annualizedVol: number;
  /** 1 日 VaR（95%） */
  dailyVaR95: number;
  /** 1 月 VaR（95%） */
  monthlyVaR95: number;
  /** 风险等级 */
  riskLevel: "low" | "medium" | "high" | "extreme";
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/** 简单线性同余随机数生成器（LCG），支持种子 */
function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

/** Box-Muller 变换生成标准正态随机数 */
function boxMuller(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** 计算数组分位数 */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

/** 计算数组均值 */
function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** 计算数组标准差 */
function std(arr: number[], avg?: number): number {
  const m = avg ?? mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

// ── 核心模拟函数 ──────────────────────────────────────────────────────────────

/**
 * 几何布朗运动（GBM）蒙特卡洛路径模拟
 * dS = μS dt + σS dW
 */
export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const { S0, mu, sigma, days, paths, seed = Date.now() } = input;
  const dt = 1 / 252; // 每日时间步长（年）
  const rng = createRng(seed);

  const finalValues: number[] = [];
  // 存储5条代表性路径
  const samplePathIndices = [
    Math.floor(paths * 0.1),
    Math.floor(paths * 0.3),
    Math.floor(paths * 0.5),
    Math.floor(paths * 0.7),
    Math.floor(paths * 0.9),
  ];
  const samplePaths: number[][] = samplePathIndices.map(() => [S0]);

  for (let p = 0; p < paths; p++) {
    let S = S0;
    const isSample = samplePathIndices.indexOf(p);
    for (let d = 0; d < days; d++) {
      const z = boxMuller(rng);
      S = S * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
      if (isSample >= 0) {
        samplePaths[isSample].push(S);
      }
    }
    finalValues.push(S);
  }

  const sorted = [...finalValues].sort((a, b) => a - b);
  const avg = mean(finalValues);
  const stdDev = std(finalValues, avg);

  return {
    finalValues,
    mean: avg,
    median: quantile(sorted, 0.5),
    std: stdDev,
    p5: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    samplePaths,
  };
}

/**
 * 参数法 VaR 计算（假设正态分布）
 * @param S0 当前价格
 * @param sigma 年化波动率
 * @param horizon 持有期（天）
 * @param confidenceLevel 置信水平（如 0.95）
 */
export function parametricVaR(
  S0: number,
  sigma: number,
  horizon: number,
  confidenceLevel = 0.95
): VaRResult {
  // 正态分布分位数（常用值）
  const zTable: Record<number, number> = {
    0.90: 1.282,
    0.95: 1.645,
    0.99: 2.326,
    0.999: 3.090,
  };
  const z = zTable[confidenceLevel] ?? 1.645;
  const dailySigma = sigma / Math.sqrt(252);
  const horizonSigma = dailySigma * Math.sqrt(horizon);

  const varPercent = z * horizonSigma;
  const varAbsolute = S0 * varPercent;

  // CVaR = E[loss | loss > VaR] = σ * φ(z) / (1-c) （正态分布）
  const phi_z = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cvarPercent = (horizonSigma * phi_z) / (1 - confidenceLevel);
  const cvarAbsolute = S0 * cvarPercent;

  return {
    confidenceLevel,
    varAbsolute,
    varPercent,
    cvarAbsolute,
    cvarPercent,
    method: "parametric",
  };
}

/**
 * 历史模拟法 VaR（基于蒙特卡洛终值分布）
 */
export function historicalVaR(
  mcResult: MonteCarloResult,
  S0: number,
  confidenceLevel = 0.95
): VaRResult {
  const returns = mcResult.finalValues.map(v => (v - S0) / S0);
  const sortedReturns = [...returns].sort((a, b) => a - b);

  const varIdx = Math.floor((1 - confidenceLevel) * sortedReturns.length);
  const varReturn = -sortedReturns[varIdx];
  const varAbsolute = S0 * varReturn;

  // CVaR = 超过 VaR 的平均损失
  const tailLosses = sortedReturns.slice(0, varIdx).map(r => -r);
  const cvarPercent = tailLosses.length > 0 ? mean(tailLosses) : varReturn;
  const cvarAbsolute = S0 * cvarPercent;

  return {
    confidenceLevel,
    varAbsolute,
    varPercent: varReturn,
    cvarAbsolute,
    cvarPercent,
    method: "historical",
  };
}

/**
 * 货币风险敞口分析
 * @param pair 货币对（如 "USD/CNY"）
 * @param notional 持仓金额
 * @param currentRate 当前汇率
 * @param annualizedVol 年化波动率（如 0.05 = 5%）
 */
export function analyzeCurrencyExposure(
  pair: string,
  notional: number,
  currentRate: number,
  annualizedVol: number
): CurrencyExposure {
  const daily95 = parametricVaR(notional, annualizedVol, 1, 0.95);
  const monthly95 = parametricVaR(notional, annualizedVol, 21, 0.95);

  // 风险等级：基于月度 VaR/持仓比例
  const monthlyVarRatio = monthly95.varPercent;
  let riskLevel: CurrencyExposure["riskLevel"] = "low";
  if (monthlyVarRatio > 0.15) riskLevel = "extreme";
  else if (monthlyVarRatio > 0.08) riskLevel = "high";
  else if (monthlyVarRatio > 0.04) riskLevel = "medium";

  return {
    pair,
    notional,
    currentRate,
    annualizedVol,
    dailyVaR95: daily95.varAbsolute,
    monthlyVaR95: monthly95.varAbsolute,
    riskLevel,
  };
}

// ── 格式化报告 ────────────────────────────────────────────────────────────────

/**
 * 生成蒙特卡洛风险分析 Markdown 报告
 */
export function formatMonteCarloReport(
  ticker: string,
  S0: number,
  mc: MonteCarloResult,
  varResult: VaRResult,
  cvarResult: VaRResult,
  days: number
): string {
  const horizon = days === 1 ? "1 日" : days === 5 ? "1 周" : days === 21 ? "1 月" : `${days} 日`;
  const lines: string[] = [];

  lines.push(`### 📊 蒙特卡洛风险分析 — ${ticker}`);
  lines.push(`\n**模拟参数**：${mc.finalValues.length.toLocaleString()} 条路径 | 持有期：${horizon} | 置信水平：${(varResult.confidenceLevel * 100).toFixed(0)}%`);

  lines.push(`\n**终值分布**`);
  lines.push(`| 统计量 | 数值 | 相对当前价 |`);
  lines.push(`|---|---|---|`);
  lines.push(`| 当前价格 | $${S0.toFixed(2)} | — |`);
  lines.push(`| 均值预测 | $${mc.mean.toFixed(2)} | ${((mc.mean / S0 - 1) * 100).toFixed(2)}% |`);
  lines.push(`| 中位数 | $${mc.median.toFixed(2)} | ${((mc.median / S0 - 1) * 100).toFixed(2)}% |`);
  lines.push(`| 5% 分位（悲观）| $${mc.p5.toFixed(2)} | ${((mc.p5 / S0 - 1) * 100).toFixed(2)}% |`);
  lines.push(`| 25% 分位 | $${mc.p25.toFixed(2)} | ${((mc.p25 / S0 - 1) * 100).toFixed(2)}% |`);
  lines.push(`| 75% 分位 | $${mc.p75.toFixed(2)} | ${((mc.p75 / S0 - 1) * 100).toFixed(2)}% |`);
  lines.push(`| 95% 分位（乐观）| $${mc.p95.toFixed(2)} | ${((mc.p95 / S0 - 1) * 100).toFixed(2)}% |`);

  lines.push(`\n**风险指标**`);
  lines.push(`| 指标 | 参数法 | 历史模拟法 |`);
  lines.push(`|---|---|---|`);
  lines.push(`| VaR（${(varResult.confidenceLevel * 100).toFixed(0)}%）| $${varResult.varAbsolute.toFixed(2)}（${(varResult.varPercent * 100).toFixed(2)}%）| $${cvarResult.varAbsolute.toFixed(2)}（${(cvarResult.varPercent * 100).toFixed(2)}%）|`);
  lines.push(`| CVaR / ES | $${varResult.cvarAbsolute.toFixed(2)}（${(varResult.cvarPercent * 100).toFixed(2)}%）| $${cvarResult.cvarAbsolute.toFixed(2)}（${(cvarResult.cvarPercent * 100).toFixed(2)}%）|`);

  lines.push(`\n*数据来源：GBM 蒙特卡洛模拟（resistance 参考实现）*`);
  return lines.join("\n");
}

/**
 * 快速生成股票/汇率风险摘要（用于注入 GPT prompt）
 * @param ticker 股票代码或货币对
 * @param S0 当前价格
 * @param sigma 年化波动率
 */
export function generateRiskSummary(
  ticker: string,
  S0: number,
  sigma: number
): string {
  // 1 日、1 周、1 月 VaR（95%）
  const var1d = parametricVaR(S0, sigma, 1, 0.95);
  const var1w = parametricVaR(S0, sigma, 5, 0.95);
  const var1m = parametricVaR(S0, sigma, 21, 0.95);

  // 蒙特卡洛 30 日预测（1000 路径，快速）
  const mc = runMonteCarlo({ S0, mu: 0.08, sigma, days: 30, paths: 1000, seed: 42 });
  const mcVaR = historicalVaR(mc, S0, 0.95);

  const lines: string[] = [];
  lines.push(`#### ${ticker} 风险量化摘要（σ=${(sigma * 100).toFixed(1)}%）`);
  lines.push(`| 持有期 | VaR 95% | CVaR 95% |`);
  lines.push(`|---|---|---|`);
  lines.push(`| 1 日 | $${var1d.varAbsolute.toFixed(2)}（${(var1d.varPercent * 100).toFixed(2)}%）| $${var1d.cvarAbsolute.toFixed(2)} |`);
  lines.push(`| 1 周 | $${var1w.varAbsolute.toFixed(2)}（${(var1w.varPercent * 100).toFixed(2)}%）| $${var1w.cvarAbsolute.toFixed(2)} |`);
  lines.push(`| 1 月 | $${var1m.varAbsolute.toFixed(2)}（${(var1m.varPercent * 100).toFixed(2)}%）| $${var1m.cvarAbsolute.toFixed(2)} |`);
  lines.push(`\n**蒙特卡洛 30 日预测**（1000 路径）：`);
  lines.push(`- 均值目标：$${mc.mean.toFixed(2)}（${((mc.mean / S0 - 1) * 100).toFixed(2)}%）`);
  lines.push(`- 悲观情景（5%）：$${mc.p5.toFixed(2)}（${((mc.p5 / S0 - 1) * 100).toFixed(2)}%）`);
  lines.push(`- 乐观情景（95%）：$${mc.p95.toFixed(2)}（${((mc.p95 / S0 - 1) * 100).toFixed(2)}%）`);
  lines.push(`- 历史模拟 VaR 30 日：$${mcVaR.varAbsolute.toFixed(2)}（${(mcVaR.varPercent * 100).toFixed(2)}%）`);

  return lines.join("\n");
}
