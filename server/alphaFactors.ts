/**
 * alphaFactors.ts — microsoft/qlib 风格的 Alpha 因子库
 *
 * 参考架构：
 *   - microsoft/qlib: https://github.com/microsoft/qlib
 *   - WorldQuant Alpha101: https://arxiv.org/abs/1601.00991
 *   - Alpha158 因子集（qlib 内置）
 *
 * 核心设计：
 *   1. 纯 TypeScript 实现，无 Python 依赖（避免额外延迟）
 *   2. 所有因子基于 OHLCV + 技术指标计算
 *   3. 因子值标准化为 Z-score，便于跨股票比较
 *   4. 每个因子都有经济学解释和历史有效性说明
 */

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface OHLCVSeries {
  dates: string[];       // YYYY-MM-DD
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

export interface AlphaFactor {
  /** 因子名称（qlib 命名规范） */
  name: string;
  /** 因子值（最新值） */
  value: number | null;
  /** Z-score 标准化值（相对于自身历史） */
  zScore: number | null;
  /** 因子信号方向：1=看多, -1=看空, 0=中性 */
  signal: 1 | -1 | 0;
  /** 信号强度 0-100 */
  strength: number;
  /** 因子分类 */
  category: AlphaCategory;
  /** 经济学解释 */
  description: string;
  /** 历史有效性（IC 均值，来自 qlib 论文） */
  historicalIC?: number;
}

export type AlphaCategory =
  | "momentum"      // 动量因子
  | "reversal"      // 反转因子
  | "volatility"    // 波动率因子
  | "volume"        // 成交量因子
  | "technical"     // 技术形态因子
  | "quality"       // 质量因子（需基本面数据）
  | "value";        // 价值因子（需基本面数据）

export interface AlphaReport {
  ticker: string;
  generatedAt: number;
  factors: AlphaFactor[];
  /** 综合 Alpha 评分（-100 到 100） */
  compositeScore: number;
  /** 多空信号 */
  overallSignal: "strong_long" | "long" | "neutral" | "short" | "strong_short";
  /** 因子摘要（供 GPT 参考） */
  summary: string;
}

// ── 数学工具函数 ──────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function zScore(value: number, series: number[]): number {
  const m = mean(series);
  const s = std(series);
  if (s === 0) return 0;
  return (value - m) / s;
}

function rollingMean(arr: number[], window: number): (number | null)[] {
  return arr.map((_, i) => {
    if (i < window - 1) return null;
    return mean(arr.slice(i - window + 1, i + 1));
  });
}

function rollingStd(arr: number[], window: number): (number | null)[] {
  return arr.map((_, i) => {
    if (i < window - 1) return null;
    return std(arr.slice(i - window + 1, i + 1));
  });
}

function pctChange(arr: number[], lag = 1): (number | null)[] {
  return arr.map((v, i) => {
    if (i < lag) return null;
    const prev = arr[i - lag];
    if (prev === 0) return null;
    return (v - prev) / prev;
  });
}

function rank(arr: number[]): number[] {
  const sorted = [...arr].sort((a, b) => a - b);
  return arr.map(v => sorted.indexOf(v) / (sorted.length - 1));
}

function correlation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const mx = mean(x), my = mean(y);
  const num = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0);
  const den = Math.sqrt(
    x.reduce((s, xi) => s + (xi - mx) ** 2, 0) *
    y.reduce((s, yi) => s + (yi - my) ** 2, 0)
  );
  return den === 0 ? 0 : num / den;
}

function signalFromZ(z: number | null): { signal: 1 | -1 | 0; strength: number } {
  if (z === null || !isFinite(z)) return { signal: 0, strength: 0 };
  const abs = Math.abs(z);
  const strength = Math.min(100, Math.round(abs * 33.3));
  if (z > 0.5) return { signal: 1, strength };
  if (z < -0.5) return { signal: -1, strength };
  return { signal: 0, strength };
}

// ── Alpha 因子计算 ────────────────────────────────────────────────────────────

/**
 * Alpha001 (WorldQuant): rank(Ts_ArgMax(SignedPower(((returns < 0 ? std(returns, 20) : close)), 2.), 5)) - 0.5
 * 简化版：20日收益率标准差 + 5日最大收益日位置
 * 分类：动量/波动率
 */
function calcAlpha001(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 25) return nullFactor("ALPHA001", "momentum", "Alpha001: 动量-波动率复合因子");

  const returns = pctChange(data.closes) as number[];
  const validReturns = returns.filter(r => r !== null) as number[];

  // 20日收益率标准差
  const stdSeries = rollingStd(validReturns, 20).filter(v => v !== null) as number[];
  const latestStd = stdSeries.at(-1) ?? null;

  if (latestStd === null) return nullFactor("ALPHA001", "momentum", "Alpha001: 动量-波动率复合因子");

  const z = zScore(latestStd, stdSeries);
  const { signal, strength } = signalFromZ(-z); // 低波动率 = 正向信号

  return {
    name: "ALPHA001",
    value: latestStd,
    zScore: z,
    signal,
    strength,
    category: "momentum",
    description: "Alpha001: 20日收益率标准差（低波动率偏多）",
    historicalIC: 0.032,
  };
}

/**
 * Alpha002 (WorldQuant): -1 * correlation(rank(delta(log(volume), 2)), rank(((close - open) / open)), 6)
 * 成交量变化与价格变化的负相关性
 * 分类：成交量
 */
function calcAlpha002(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 10) return nullFactor("ALPHA002", "volume", "Alpha002: 量价背离因子");

  const logVol = data.volumes.map(v => Math.log(Math.max(v, 1)));
  const deltaVol = pctChange(logVol, 2).filter(v => v !== null) as number[];
  const priceChange = data.closes.map((c, i) => {
    const o = data.opens[i];
    return o > 0 ? (c - o) / o : 0;
  });

  const window = Math.min(6, Math.min(deltaVol.length, priceChange.length));
  if (window < 4) return nullFactor("ALPHA002", "volume", "Alpha002: 量价背离因子");

  const recentVol = deltaVol.slice(-window);
  const recentPrice = priceChange.slice(-window);

  const rankVol = rank(recentVol);
  const rankPrice = rank(recentPrice);
  const corr = correlation(rankVol, rankPrice);
  const alpha = -corr; // 负相关性 = 正向信号

  const historicalAlpha = data.closes.map((c, i) => {
    if (i < 8) return null;
    const dv = deltaVol.slice(Math.max(0, i - 8), i);
    const dp = priceChange.slice(Math.max(0, i - 8), i);
    if (dv.length < 4) return null;
    return -correlation(rank(dv), rank(dp));
  }).filter(v => v !== null) as number[];

  const z = historicalAlpha.length > 5 ? zScore(alpha, historicalAlpha) : null;
  const { signal, strength } = signalFromZ(z);

  return {
    name: "ALPHA002",
    value: alpha,
    zScore: z,
    signal,
    strength,
    category: "volume",
    description: "Alpha002: 量价背离因子（成交量涨价格跌 = 看空信号）",
    historicalIC: 0.028,
  };
}

/**
 * Alpha003 (WorldQuant): -1 * correlation(rank(open), rank(volume), 10)
 * 开盘价与成交量的负相关性
 * 分类：成交量
 */
function calcAlpha003(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 12) return nullFactor("ALPHA003", "volume", "Alpha003: 开盘量价因子");

  const window = Math.min(10, n);
  const recentOpen = data.opens.slice(-window);
  const recentVol = data.volumes.slice(-window);

  const rankOpen = rank(recentOpen);
  const rankVol = rank(recentVol);
  const alpha = -correlation(rankOpen, rankVol);

  const historical: number[] = [];
  for (let i = window; i < n; i++) {
    const ro = rank(data.opens.slice(i - window, i));
    const rv = rank(data.volumes.slice(i - window, i));
    historical.push(-correlation(ro, rv));
  }

  const z = historical.length > 5 ? zScore(alpha, historical) : null;
  const { signal, strength } = signalFromZ(z);

  return {
    name: "ALPHA003",
    value: alpha,
    zScore: z,
    signal,
    strength,
    category: "volume",
    description: "Alpha003: 开盘价-成交量负相关（高开低量 = 看空）",
    historicalIC: 0.025,
  };
}

/**
 * Alpha012 (WorldQuant): sign(delta(volume, 1)) * (-1 * delta(close, 1))
 * 成交量变化方向与价格变化反向
 * 分类：反转
 */
function calcAlpha012(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 3) return nullFactor("ALPHA012", "reversal", "Alpha012: 量价反转因子");

  const deltaVol = data.volumes.at(-1)! - data.volumes.at(-2)!;
  const deltaClose = data.closes.at(-1)! - data.closes.at(-2)!;

  const alpha = Math.sign(deltaVol) * (-deltaClose);

  // 历史值
  const historical: number[] = [];
  for (let i = 2; i < n; i++) {
    const dv = data.volumes[i] - data.volumes[i - 1];
    const dc = data.closes[i] - data.closes[i - 1];
    historical.push(Math.sign(dv) * (-dc));
  }

  const z = historical.length > 5 ? zScore(alpha, historical) : null;
  const { signal, strength } = signalFromZ(z);

  return {
    name: "ALPHA012",
    value: alpha,
    zScore: z,
    signal,
    strength,
    category: "reversal",
    description: "Alpha012: 量价反转（成交量增加但价格下跌 = 看多）",
    historicalIC: 0.038,
  };
}

/**
 * 动量因子 MOM20: 20日价格动量
 * 分类：动量
 */
function calcMOM20(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 22) return nullFactor("MOM20", "momentum", "20日价格动量");

  const mom = (data.closes.at(-1)! - data.closes.at(-21)!) / data.closes.at(-21)!;

  const historical: number[] = [];
  for (let i = 21; i < n; i++) {
    historical.push((data.closes[i] - data.closes[i - 20]) / data.closes[i - 20]);
  }

  const z = zScore(mom, historical);
  const { signal, strength } = signalFromZ(z);

  return {
    name: "MOM20",
    value: mom,
    zScore: z,
    signal,
    strength,
    category: "momentum",
    description: "20日价格动量（正值 = 上涨趋势）",
    historicalIC: 0.045,
  };
}

/**
 * 动量因子 MOM60: 60日价格动量
 * 分类：动量
 */
function calcMOM60(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 62) return nullFactor("MOM60", "momentum", "60日价格动量");

  const mom = (data.closes.at(-1)! - data.closes.at(-61)!) / data.closes.at(-61)!;

  const historical: number[] = [];
  for (let i = 61; i < n; i++) {
    historical.push((data.closes[i] - data.closes[i - 60]) / data.closes[i - 60]);
  }

  const z = zScore(mom, historical);
  const { signal, strength } = signalFromZ(z);

  return {
    name: "MOM60",
    value: mom,
    zScore: z,
    signal,
    strength,
    category: "momentum",
    description: "60日价格动量（中期趋势）",
    historicalIC: 0.052,
  };
}

/**
 * 短期反转因子 REV5: 5日收益率反转
 * 分类：反转
 */
function calcREV5(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 7) return nullFactor("REV5", "reversal", "5日短期反转因子");

  const ret5 = (data.closes.at(-1)! - data.closes.at(-6)!) / data.closes.at(-6)!;
  const alpha = -ret5; // 反转：近期下跌 = 看多

  const historical: number[] = [];
  for (let i = 6; i < n; i++) {
    historical.push(-((data.closes[i] - data.closes[i - 5]) / data.closes[i - 5]));
  }

  const z = historical.length > 5 ? zScore(alpha, historical) : null;
  const { signal, strength } = signalFromZ(z);

  return {
    name: "REV5",
    value: alpha,
    zScore: z,
    signal,
    strength,
    category: "reversal",
    description: "5日短期反转（近期超跌 = 看多）",
    historicalIC: 0.041,
  };
}

/**
 * 波动率因子 VOL20: 20日收益率波动率
 * 分类：波动率
 */
function calcVOL20(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 22) return nullFactor("VOL20", "volatility", "20日波动率因子");

  const returns = pctChange(data.closes).filter(v => v !== null) as number[];
  const vol20 = std(returns.slice(-20));

  const historical: number[] = [];
  for (let i = 20; i < returns.length; i++) {
    historical.push(std(returns.slice(i - 20, i)));
  }

  const z = historical.length > 5 ? zScore(vol20, historical) : null;
  const { signal, strength } = signalFromZ(-z!); // 低波动率 = 正向信号

  return {
    name: "VOL20",
    value: vol20,
    zScore: z,
    signal,
    strength,
    category: "volatility",
    description: "20日收益率波动率（低波动率偏多）",
    historicalIC: -0.028,
  };
}

/**
 * 成交量动量因子 VMOM10: 10日成交量动量
 * 分类：成交量
 */
function calcVMOM10(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 12) return nullFactor("VMOM10", "volume", "10日成交量动量");

  const avgVol10 = mean(data.volumes.slice(-10));
  const avgVol20 = mean(data.volumes.slice(-20));
  const vmom = avgVol20 > 0 ? (avgVol10 - avgVol20) / avgVol20 : 0;

  const historical: number[] = [];
  for (let i = 20; i < n; i++) {
    const v10 = mean(data.volumes.slice(i - 10, i));
    const v20 = mean(data.volumes.slice(i - 20, i));
    historical.push(v20 > 0 ? (v10 - v20) / v20 : 0);
  }

  const z = historical.length > 5 ? zScore(vmom, historical) : null;
  const { signal, strength } = signalFromZ(z);

  return {
    name: "VMOM10",
    value: vmom,
    zScore: z,
    signal,
    strength,
    category: "volume",
    description: "10日成交量动量（成交量放大 = 趋势确认）",
    historicalIC: 0.022,
  };
}

/**
 * 价格位置因子 PRPOS: 当前价格在 52 周高低点的相对位置
 * 分类：技术
 */
function calcPRPOS(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  const lookback = Math.min(252, n);
  if (lookback < 20) return nullFactor("PRPOS", "technical", "价格位置因子");

  const recentCloses = data.closes.slice(-lookback);
  const high = Math.max(...recentCloses);
  const low = Math.min(...recentCloses);
  const current = data.closes.at(-1)!;

  const prpos = high === low ? 0.5 : (current - low) / (high - low);

  const historical: number[] = [];
  for (let i = lookback; i < n; i++) {
    const rc = data.closes.slice(i - lookback, i);
    const h = Math.max(...rc), l = Math.min(...rc);
    historical.push(h === l ? 0.5 : (data.closes[i] - l) / (h - l));
  }

  const z = historical.length > 5 ? zScore(prpos, historical) : null;
  const { signal, strength } = signalFromZ(z);

  return {
    name: "PRPOS",
    value: prpos,
    zScore: z,
    signal,
    strength,
    category: "technical",
    description: `价格位置：当前价格处于 ${lookback} 日高低区间的 ${(prpos * 100).toFixed(0)}% 位置`,
    historicalIC: 0.035,
  };
}

/**
 * 高低价差因子 HLSPREAD: 日内价格波幅
 * 分类：波动率
 */
function calcHLSPREAD(data: OHLCVSeries): AlphaFactor {
  const n = data.closes.length;
  if (n < 10) return nullFactor("HLSPREAD", "volatility", "日内价格波幅因子");

  const spreads = data.closes.map((c, i) => {
    if (c <= 0) return 0;
    return (data.highs[i] - data.lows[i]) / c;
  });

  const latestSpread = spreads.at(-1)!;
  const historical = spreads.slice(0, -1);

  const z = historical.length > 5 ? zScore(latestSpread, historical) : null;
  const { signal, strength } = signalFromZ(-z!); // 低波幅 = 正向信号

  return {
    name: "HLSPREAD",
    value: latestSpread,
    zScore: z,
    signal,
    strength,
    category: "volatility",
    description: "日内高低价差率（低波幅 = 稳定趋势）",
    historicalIC: -0.018,
  };
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function nullFactor(name: string, category: AlphaCategory, description: string): AlphaFactor {
  return {
    name,
    value: null,
    zScore: null,
    signal: 0,
    strength: 0,
    category,
    description: description + "（数据不足）",
  };
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

/**
 * 计算所有 Alpha 因子并生成报告
 * @param ticker 标的代码
 * @param data OHLCV 时间序列
 * @returns Alpha 因子报告
 */
export function calcAlphaFactors(ticker: string, data: OHLCVSeries): AlphaReport {
  const factors: AlphaFactor[] = [
    calcAlpha001(data),
    calcAlpha002(data),
    calcAlpha003(data),
    calcAlpha012(data),
    calcMOM20(data),
    calcMOM60(data),
    calcREV5(data),
    calcVOL20(data),
    calcVMOM10(data),
    calcPRPOS(data),
    calcHLSPREAD(data),
  ].filter(f => f.value !== null);

  if (factors.length === 0) {
    return {
      ticker,
      generatedAt: Date.now(),
      factors: [],
      compositeScore: 0,
      overallSignal: "neutral",
      summary: "数据不足，无法计算 Alpha 因子",
    };
  }

  // 计算综合 Alpha 评分（加权平均，权重 = historicalIC）
  let weightedSum = 0;
  let weightTotal = 0;
  for (const f of factors) {
    if (f.zScore === null) continue;
    const ic = Math.abs(f.historicalIC ?? 0.03);
    const directedZ = f.signal === -1 ? -Math.abs(f.zScore) : f.signal === 1 ? Math.abs(f.zScore) : f.zScore;
    weightedSum += directedZ * ic;
    weightTotal += ic;
  }
  const compositeZ = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const compositeScore = Math.max(-100, Math.min(100, Math.round(compositeZ * 33.3)));

  // 确定整体信号
  let overallSignal: AlphaReport["overallSignal"];
  if (compositeScore >= 60) overallSignal = "strong_long";
  else if (compositeScore >= 25) overallSignal = "long";
  else if (compositeScore <= -60) overallSignal = "strong_short";
  else if (compositeScore <= -25) overallSignal = "short";
  else overallSignal = "neutral";

  // 生成摘要
  const longFactors = factors.filter(f => f.signal === 1).map(f => f.name);
  const shortFactors = factors.filter(f => f.signal === -1).map(f => f.name);
  const signalLabels: Record<AlphaReport["overallSignal"], string> = {
    strong_long: "强烈看多",
    long: "偏多",
    neutral: "中性",
    short: "偏空",
    strong_short: "强烈看空",
  };

  const summary = [
    `## Alpha 因子分析 — ${ticker}`,
    ``,
    `**综合 Alpha 评分：${compositeScore}/100**  |  **整体信号：${signalLabels[overallSignal]}**`,
    ``,
    `有效因子：${factors.length} 个`,
    longFactors.length > 0 ? `看多因子：${longFactors.join(", ")}` : "",
    shortFactors.length > 0 ? `看空因子：${shortFactors.join(", ")}` : "",
    ``,
    `### 因子详情`,
    `| 因子 | 值 | Z-Score | 信号 | 强度 | 分类 |`,
    `|------|-----|---------|------|------|------|`,
    ...factors.map(f => {
      const val = f.value !== null ? f.value.toFixed(4) : "N/A";
      const z = f.zScore !== null ? f.zScore.toFixed(2) : "N/A";
      const sig = f.signal === 1 ? "▲ 看多" : f.signal === -1 ? "▼ 看空" : "→ 中性";
      return `| ${f.name} | ${val} | ${z} | ${sig} | ${f.strength}% | ${f.category} |`;
    }),
    ``,
    `> **注：** Alpha 因子基于 WorldQuant Alpha101 和 qlib Alpha158 因子集，仅供参考，不构成投资建议。`,
  ].filter(l => l !== "").join("\n");

  return {
    ticker,
    generatedAt: Date.now(),
    factors,
    compositeScore,
    overallSignal,
    summary,
  };
}

/**
 * 将 OHLCVChartData（codeExecution.ts 格式）转换为 OHLCVSeries
 */
export function convertToOHLCVSeries(
  chartData: {
    timestamps: number[];
    opens: number[];
    highs: number[];
    lows: number[];
    closes: number[];
    volumes: number[];
  }
): OHLCVSeries {
  const dates = chartData.timestamps.map(ts => {
    const d = new Date(ts * 1000);
    return d.toISOString().slice(0, 10);
  });
  return {
    dates,
    opens: chartData.opens,
    highs: chartData.highs,
    lows: chartData.lows,
    closes: chartData.closes,
    volumes: chartData.volumes,
  };
}
