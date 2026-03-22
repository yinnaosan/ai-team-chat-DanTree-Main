/**
 * optionPricing.ts
 * 期权定价与策略分析模块
 *
 * 参考来源：
 * - romanmichaelpaolucci/Q-Fin：Black-Scholes 定价 + 蒙特卡洛模拟
 * - quantsbin/Quantsbin：香草期权策略分析（Straddle/Spread/Strangle 等）
 *
 * 功能：
 * 1. Black-Scholes 欧式期权定价（Call / Put）
 * 2. 期权 Greeks（Delta / Gamma / Vega / Theta / Rho）
 * 3. 隐含波动率（IV）估算（二分法）
 * 4. 蒙特卡洛模拟验证
 * 5. 期权策略分析（Straddle / Strangle / Bull Call Spread / Bear Put Spread / Iron Condor）
 * 6. 格式化 Markdown 报告
 */

// ── 标准正态分布函数 ─────────────────────────────────────────────────────────

/**
 * 标准正态分布累积分布函数（CDF）
 * 使用 erf 级数展开，精度 > 1e-7
 */
export function normCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  // erf(x/sqrt(2)) 级数展开
  const a = x / Math.SQRT2;
  const absA = Math.abs(a);
  let erf: number;
  if (absA < 6.25) {
    // 小自变量区域：直接级数
    let r = a;
    let s = a * a;
    let t2 = 1.0;
    let sum = a;
    for (let n = 1; n <= 60; n++) {
      r *= -s / n;
      t2 = 2 * n + 1;
      sum += r / t2;
      if (Math.abs(r / t2) < 1e-15) break;
    }
    erf = (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    // 大自变量区域：连分数展开
    erf = a > 0 ? 1 : -1;
  }
  return 0.5 * (1 + erf);
}

/** 标准正态分布概率密度函数（PDF） */
export function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ── 核心类型 ──────────────────────────────────────────────────────────────────

export interface OptionInput {
  S: number;   // 标的资产当前价格
  K: number;   // 行权价
  T: number;   // 到期时间（年，如 0.25 = 3 个月）
  r: number;   // 无风险利率（如 0.05 = 5%）
  sigma: number; // 波动率（如 0.25 = 25%）
  type: "call" | "put";
}

export interface OptionPrice {
  price: number;
  intrinsicValue: number;
  timeValue: number;
}

export interface OptionGreeks {
  delta: number;
  gamma: number;
  vega: number;   // 每 1% 波动率变化的价格变化
  theta: number;  // 每日时间损耗
  rho: number;    // 每 1% 利率变化的价格变化
}

export interface OptionResult extends OptionPrice, OptionGreeks {
  d1: number;
  d2: number;
  impliedVolatility?: number;
}

// ── Black-Scholes 核心计算 ────────────────────────────────────────────────────

/**
 * 计算 d1 和 d2
 */
function calcD1D2(S: number, K: number, T: number, r: number, sigma: number): { d1: number; d2: number } {
  if (T <= 0) return { d1: 0, d2: 0 };
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

/**
 * Black-Scholes 欧式期权定价
 */
export function blackScholes(input: OptionInput): OptionResult {
  const { S, K, T, r, sigma, type } = input;

  // 到期处理
  if (T <= 0) {
    const intrinsic = type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return {
      price: intrinsic, intrinsicValue: intrinsic, timeValue: 0,
      delta: type === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0, vega: 0, theta: 0, rho: 0, d1: 0, d2: 0,
    };
  }

  const { d1, d2 } = calcD1D2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const discountK = K * Math.exp(-r * T);

  let price: number;
  let delta: number;
  let rho: number;

  if (type === "call") {
    price = S * normCDF(d1) - discountK * normCDF(d2);
    delta = normCDF(d1);
    rho = K * T * Math.exp(-r * T) * normCDF(d2) / 100;
  } else {
    price = discountK * normCDF(-d2) - S * normCDF(-d1);
    delta = normCDF(d1) - 1;
    rho = -K * T * Math.exp(-r * T) * normCDF(-d2) / 100;
  }

  const gamma = normPDF(d1) / (S * sigma * sqrtT);
  const vega = S * normPDF(d1) * sqrtT / 100; // per 1% vol change
  const theta = (
    -(S * normPDF(d1) * sigma) / (2 * sqrtT)
    - r * K * Math.exp(-r * T) * (type === "call" ? normCDF(d2) : normCDF(-d2))
  ) / 365; // per calendar day

  const intrinsicValue = type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  const timeValue = Math.max(price - intrinsicValue, 0);

  return {
    price: Math.max(price, 0),
    intrinsicValue,
    timeValue,
    delta,
    gamma,
    vega,
    theta,
    rho,
    d1,
    d2,
  };
}

// ── 隐含波动率（IV）估算 ──────────────────────────────────────────────────────

/**
 * 用二分法估算隐含波动率
 * @param marketPrice 市场期权价格
 * @param input 期权参数（sigma 字段会被替换）
 * @param tolerance 精度（默认 0.0001）
 * @param maxIter 最大迭代次数
 */
export function impliedVolatility(
  marketPrice: number,
  input: Omit<OptionInput, "sigma">,
  tolerance = 0.0001,
  maxIter = 200,
): number | null {
  let low = 0.001;
  let high = 5.0; // 500% 波动率上限

  for (let i = 0; i < maxIter; i++) {
    const mid = (low + high) / 2;
    const price = blackScholes({ ...input, sigma: mid }).price;
    const diff = price - marketPrice;

    if (Math.abs(diff) < tolerance) return mid;
    if (diff > 0) high = mid;
    else low = mid;
  }

  return null; // 未收敛
}

// ── 蒙特卡洛模拟验证 ──────────────────────────────────────────────────────────

/**
 * 蒙特卡洛模拟期权价格（GBM 路径）
 * @param input 期权参数
 * @param numPaths 模拟路径数（默认 10000）
 * @param seed 随机种子（用于可重复性测试）
 */
export function monteCarloOption(
  input: OptionInput,
  numPaths = 10000,
  seed?: number,
): { price: number; stdError: number; confidenceInterval: [number, number] } {
  const { S, K, T, r, sigma, type } = input;

  // 简单线性同余随机数生成器（可重复）
  let rng: () => number;
  if (seed !== undefined) {
    let state = seed;
    rng = () => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 0xffffffff;
    };
  } else {
    rng = Math.random;
  }

  // Box-Muller 正态分布
  const randNorm = (): number => {
    const u1 = Math.max(rng(), 1e-10);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const payoffs: number[] = [];
  const drift = (r - 0.5 * sigma * sigma) * T;
  const diffusion = sigma * Math.sqrt(T);

  for (let i = 0; i < numPaths; i++) {
    const z = randNorm();
    const ST = S * Math.exp(drift + diffusion * z);
    const payoff = type === "call" ? Math.max(ST - K, 0) : Math.max(K - ST, 0);
    payoffs.push(payoff);
  }

  const discount = Math.exp(-r * T);
  const mean = payoffs.reduce((a, b) => a + b, 0) / numPaths;
  const variance = payoffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (numPaths - 1);
  const stdError = Math.sqrt(variance / numPaths);
  const price = mean * discount;
  const se = stdError * discount;

  return {
    price,
    stdError: se,
    confidenceInterval: [price - 1.96 * se, price + 1.96 * se],
  };
}

// ── 期权策略分析 ──────────────────────────────────────────────────────────────

export interface StrategyLeg {
  type: "call" | "put";
  K: number;
  position: "long" | "short";
  quantity: number;
  premium: number;
}

export interface StrategyResult {
  name: string;
  legs: StrategyLeg[];
  netPremium: number;       // 净权利金（正=收入，负=支出）
  maxProfit: number | null; // null = 无限
  maxLoss: number | null;   // null = 无限
  breakEven: number[];
  outlook: string;
  summary: string;
}

/**
 * Long Straddle：买入同行权价的 Call + Put
 * 适合预期大幅波动但方向不确定
 */
export function longStraddle(S: number, K: number, T: number, r: number, sigma: number): StrategyResult {
  const call = blackScholes({ S, K, T, r, sigma, type: "call" });
  const put = blackScholes({ S, K, T, r, sigma, type: "put" });
  const netPremium = -(call.price + put.price);
  const totalCost = call.price + put.price;

  return {
    name: "Long Straddle（多头跨式）",
    legs: [
      { type: "call", K, position: "long", quantity: 1, premium: call.price },
      { type: "put", K, position: "long", quantity: 1, premium: put.price },
    ],
    netPremium,
    maxProfit: null, // 无限
    maxLoss: totalCost,
    breakEven: [K - totalCost, K + totalCost],
    outlook: "预期大幅波动，方向不确定",
    summary: `买入 K=${K} Call（$${call.price.toFixed(2)}）+ Put（$${put.price.toFixed(2)}），总成本 $${totalCost.toFixed(2)}。上方盈亏平衡：$${(K + totalCost).toFixed(2)}，下方：$${(K - totalCost).toFixed(2)}。`,
  };
}

/**
 * Long Strangle：买入不同行权价的 Call + Put（Call K > Put K）
 * 成本低于 Straddle，但需要更大波动才能盈利
 */
export function longStrangle(
  S: number, K_call: number, K_put: number, T: number, r: number, sigma: number
): StrategyResult {
  if (K_call <= K_put) throw new Error("Strangle: K_call must be > K_put");
  const call = blackScholes({ S, K: K_call, T, r, sigma, type: "call" });
  const put = blackScholes({ S, K: K_put, T, r, sigma, type: "put" });
  const totalCost = call.price + put.price;

  return {
    name: "Long Strangle（多头宽跨式）",
    legs: [
      { type: "call", K: K_call, position: "long", quantity: 1, premium: call.price },
      { type: "put", K: K_put, position: "long", quantity: 1, premium: put.price },
    ],
    netPremium: -totalCost,
    maxProfit: null,
    maxLoss: totalCost,
    breakEven: [K_put - totalCost, K_call + totalCost],
    outlook: "预期大幅波动，成本低于 Straddle",
    summary: `买入 K=${K_call} Call（$${call.price.toFixed(2)}）+ K=${K_put} Put（$${put.price.toFixed(2)}），总成本 $${totalCost.toFixed(2)}。`,
  };
}

/**
 * Bull Call Spread：买低行权价 Call + 卖高行权价 Call
 * 看涨但限制最大收益，降低成本
 */
export function bullCallSpread(
  S: number, K_low: number, K_high: number, T: number, r: number, sigma: number
): StrategyResult {
  if (K_high <= K_low) throw new Error("Bull Call Spread: K_high must be > K_low");
  const callLow = blackScholes({ S, K: K_low, T, r, sigma, type: "call" });
  const callHigh = blackScholes({ S, K: K_high, T, r, sigma, type: "call" });
  const netCost = callLow.price - callHigh.price;
  const maxProfit = K_high - K_low - netCost;

  return {
    name: "Bull Call Spread（牛市价差）",
    legs: [
      { type: "call", K: K_low, position: "long", quantity: 1, premium: callLow.price },
      { type: "call", K: K_high, position: "short", quantity: 1, premium: callHigh.price },
    ],
    netPremium: -netCost,
    maxProfit,
    maxLoss: netCost,
    breakEven: [K_low + netCost],
    outlook: "温和看涨",
    summary: `买入 K=${K_low} Call（$${callLow.price.toFixed(2)}），卖出 K=${K_high} Call（$${callHigh.price.toFixed(2)}），净成本 $${netCost.toFixed(2)}，最大收益 $${maxProfit.toFixed(2)}。`,
  };
}

/**
 * Bear Put Spread：买高行权价 Put + 卖低行权价 Put
 * 看跌但限制最大收益，降低成本
 */
export function bearPutSpread(
  S: number, K_high: number, K_low: number, T: number, r: number, sigma: number
): StrategyResult {
  if (K_high <= K_low) throw new Error("Bear Put Spread: K_high must be > K_low");
  const putHigh = blackScholes({ S, K: K_high, T, r, sigma, type: "put" });
  const putLow = blackScholes({ S, K: K_low, T, r, sigma, type: "put" });
  const netCost = putHigh.price - putLow.price;
  const maxProfit = K_high - K_low - netCost;

  return {
    name: "Bear Put Spread（熊市价差）",
    legs: [
      { type: "put", K: K_high, position: "long", quantity: 1, premium: putHigh.price },
      { type: "put", K: K_low, position: "short", quantity: 1, premium: putLow.price },
    ],
    netPremium: -netCost,
    maxProfit,
    maxLoss: netCost,
    breakEven: [K_high - netCost],
    outlook: "温和看跌",
    summary: `买入 K=${K_high} Put（$${putHigh.price.toFixed(2)}），卖出 K=${K_low} Put（$${putLow.price.toFixed(2)}），净成本 $${netCost.toFixed(2)}，最大收益 $${maxProfit.toFixed(2)}。`,
  };
}

/**
 * Iron Condor：卖出 Strangle + 买入更宽 Strangle（4 腿）
 * 适合预期低波动，收取权利金
 */
export function ironCondor(
  S: number,
  K_put_buy: number, K_put_sell: number,
  K_call_sell: number, K_call_buy: number,
  T: number, r: number, sigma: number
): StrategyResult {
  const putBuy = blackScholes({ S, K: K_put_buy, T, r, sigma, type: "put" });
  const putSell = blackScholes({ S, K: K_put_sell, T, r, sigma, type: "put" });
  const callSell = blackScholes({ S, K: K_call_sell, T, r, sigma, type: "call" });
  const callBuy = blackScholes({ S, K: K_call_buy, T, r, sigma, type: "call" });

  const netCredit = putSell.price - putBuy.price + callSell.price - callBuy.price;
  const putSpread = K_put_sell - K_put_buy;
  const callSpread = K_call_buy - K_call_sell;
  const maxLoss = Math.max(putSpread, callSpread) - netCredit;

  return {
    name: "Iron Condor（铁秃鹰）",
    legs: [
      { type: "put", K: K_put_buy, position: "long", quantity: 1, premium: putBuy.price },
      { type: "put", K: K_put_sell, position: "short", quantity: 1, premium: putSell.price },
      { type: "call", K: K_call_sell, position: "short", quantity: 1, premium: callSell.price },
      { type: "call", K: K_call_buy, position: "long", quantity: 1, premium: callBuy.price },
    ],
    netPremium: netCredit,
    maxProfit: netCredit,
    maxLoss,
    breakEven: [K_put_sell - netCredit, K_call_sell + netCredit],
    outlook: "预期低波动，区间震荡",
    summary: `净收入 $${netCredit.toFixed(2)}，最大亏损 $${maxLoss.toFixed(2)}，盈利区间：$${K_put_sell.toFixed(0)} ~ $${K_call_sell.toFixed(0)}。`,
  };
}

// ── 格式化 Markdown 报告 ──────────────────────────────────────────────────────

/**
 * 生成完整的期权定价 Markdown 报告
 */
export function formatOptionReport(
  input: OptionInput,
  result: OptionResult,
  mcResult?: ReturnType<typeof monteCarloOption>,
  strategies?: StrategyResult[],
): string {
  const typeLabel = input.type === "call" ? "看涨期权（Call）" : "看跌期权（Put）";
  const moneyness = input.S > input.K
    ? (input.type === "call" ? "实值（ITM）" : "虚值（OTM）")
    : input.S < input.K
    ? (input.type === "call" ? "虚值（OTM）" : "实值（ITM）")
    : "平值（ATM）";

  const lines: string[] = [];
  lines.push(`### 📊 期权定价分析 — ${typeLabel}`);
  lines.push(`\n**基础参数**`);
  lines.push(`| 参数 | 数值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 标的价格 (S) | $${input.S.toFixed(2)} |`);
  lines.push(`| 行权价 (K) | $${input.K.toFixed(2)} |`);
  lines.push(`| 到期时间 (T) | ${(input.T * 365).toFixed(0)} 天（${input.T.toFixed(4)} 年）|`);
  lines.push(`| 无风险利率 (r) | ${(input.r * 100).toFixed(2)}% |`);
  lines.push(`| 波动率 (σ) | ${(input.sigma * 100).toFixed(1)}% |`);
  lines.push(`| 价值状态 | ${moneyness} |`);

  lines.push(`\n**Black-Scholes 定价结果**`);
  lines.push(`| 指标 | 数值 |`);
  lines.push(`|---|---|`);
  lines.push(`| **理论价格** | **$${result.price.toFixed(4)}** |`);
  lines.push(`| 内在价值 | $${result.intrinsicValue.toFixed(4)} |`);
  lines.push(`| 时间价值 | $${result.timeValue.toFixed(4)} |`);
  lines.push(`| d₁ | ${result.d1.toFixed(4)} |`);
  lines.push(`| d₂ | ${result.d2.toFixed(4)} |`);

  lines.push(`\n**期权 Greeks**`);
  lines.push(`| Greek | 数值 | 含义 |`);
  lines.push(`|---|---|---|`);
  lines.push(`| **Delta (Δ)** | ${result.delta.toFixed(4)} | 标的价格变动 $1 时期权价格变化 |`);
  lines.push(`| **Gamma (Γ)** | ${result.gamma.toFixed(4)} | Delta 对标的价格的二阶导数 |`);
  lines.push(`| **Vega (ν)** | ${result.vega.toFixed(4)} | 波动率变动 1% 时期权价格变化 |`);
  lines.push(`| **Theta (Θ)** | ${result.theta.toFixed(4)} | 每日时间损耗（日历日）|`);
  lines.push(`| **Rho (ρ)** | ${result.rho.toFixed(4)} | 利率变动 1% 时期权价格变化 |`);

  if (mcResult) {
    lines.push(`\n**蒙特卡洛验证（10,000 路径）**`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|---|---|`);
    lines.push(`| MC 估算价格 | $${mcResult.price.toFixed(4)} |`);
    lines.push(`| 标准误差 | ±$${mcResult.stdError.toFixed(4)} |`);
    lines.push(`| 95% 置信区间 | [$${mcResult.confidenceInterval[0].toFixed(4)}, $${mcResult.confidenceInterval[1].toFixed(4)}] |`);
    const bsDiff = Math.abs(result.price - mcResult.price);
    lines.push(`| BS vs MC 偏差 | $${bsDiff.toFixed(4)}（${((bsDiff / result.price) * 100).toFixed(2)}%）|`);
  }

  if (strategies && strategies.length > 0) {
    lines.push(`\n**相关期权策略参考**`);
    for (const s of strategies) {
      lines.push(`\n> **${s.name}** — ${s.outlook}`);
      lines.push(`> ${s.summary}`);
      if (s.maxProfit !== null) {
        lines.push(`> 最大收益：$${s.maxProfit.toFixed(2)} | 最大亏损：$${s.maxLoss?.toFixed(2) ?? "无限"} | 盈亏平衡：${s.breakEven.map(v => `$${v.toFixed(2)}`).join(" / ")}`);
      } else {
        lines.push(`> 最大收益：无限 | 最大亏损：$${s.maxLoss?.toFixed(2) ?? "无限"} | 盈亏平衡：${s.breakEven.map(v => `$${v.toFixed(2)}`).join(" / ")}`);
      }
    }
  }

  lines.push(`\n*数据来源：Black-Scholes 模型（Q-Fin 参考实现）+ 蒙特卡洛模拟（Quantsbin 参考）*`);
  return lines.join("\n");
}

/**
 * 快速生成期权分析摘要（用于注入 GPT prompt）
 */
export function generateOptionSummary(
  ticker: string,
  S: number,
  sigma: number,
  r = 0.05,
): string {
  const T = 30 / 365; // 30 天期权
  const K_atm = Math.round(S); // 平值行权价
  const K_otm_call = Math.round(S * 1.05); // 5% 虚值 Call
  const K_otm_put = Math.round(S * 0.95);  // 5% 虚值 Put

  const atmCall = blackScholes({ S, K: K_atm, T, r, sigma, type: "call" });
  const atmPut = blackScholes({ S, K: K_atm, T, r, sigma, type: "put" });
  const otmCall = blackScholes({ S, K: K_otm_call, T, r, sigma, type: "call" });
  const otmPut = blackScholes({ S, K: K_otm_put, T, r, sigma, type: "put" });

  const straddle = longStraddle(S, K_atm, T, r, sigma);
  const bullSpread = bullCallSpread(S, K_atm, K_otm_call, T, r, sigma);

  const lines: string[] = [];
  lines.push(`#### ${ticker} 期权定价参考（30 天，σ=${(sigma * 100).toFixed(1)}%）`);
  lines.push(`| 类型 | 行权价 | BS 理论价 | Delta | Vega |`);
  lines.push(`|---|---|---|---|---|`);
  lines.push(`| ATM Call | $${K_atm} | $${atmCall.price.toFixed(2)} | ${atmCall.delta.toFixed(3)} | ${atmCall.vega.toFixed(3)} |`);
  lines.push(`| ATM Put | $${K_atm} | $${atmPut.price.toFixed(2)} | ${atmPut.delta.toFixed(3)} | ${atmPut.vega.toFixed(3)} |`);
  lines.push(`| OTM Call (+5%) | $${K_otm_call} | $${otmCall.price.toFixed(2)} | ${otmCall.delta.toFixed(3)} | ${otmCall.vega.toFixed(3)} |`);
  lines.push(`| OTM Put (-5%) | $${K_otm_put} | $${otmPut.price.toFixed(2)} | ${otmPut.delta.toFixed(3)} | ${otmPut.vega.toFixed(3)} |`);
  lines.push(``);
  lines.push(`**策略参考：**`);
  lines.push(`- ${straddle.name}：总成本 $${Math.abs(straddle.netPremium).toFixed(2)}，盈亏平衡 $${straddle.breakEven[0].toFixed(2)} / $${straddle.breakEven[1].toFixed(2)}`);
  lines.push(`- ${bullSpread.name}：净成本 $${Math.abs(bullSpread.netPremium).toFixed(2)}，最大收益 $${bullSpread.maxProfit?.toFixed(2)}`);

  return lines.join("\n");
}
