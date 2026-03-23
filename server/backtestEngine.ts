/**
 * backtestEngine.ts
 * 因子回测引擎：获取历史 OHLCV → 计算因子信号 → 模拟策略 → 输出绩效指标
 *
 * 数据源优先级：Polygon.io（美股）→ Yahoo Finance chart API（全球）
 * 支持因子：MACD、RSI、布林带、KDJ、动量、均线交叉
 * 回测模式：单因子信号策略（金叉买入/死叉卖出），初始资金 100 万
 */

import { getAggregates } from "./polygonApi";
import { callDataApi } from "./_core/dataApi";
import { ENV } from "./_core/env";

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface OHLCVBar {
  date: string;       // YYYY-MM-DD
  timestamp: number;  // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FactorSignal {
  date: string;
  timestamp: number;
  value: number;       // 因子数值（如 RSI 值、MACD 差值）
  signal: 1 | -1 | 0; // 1=买入, -1=卖出, 0=持有
  signalLabel: string; // 信号描述
}

export interface BacktestTrade {
  date: string;
  type: "buy" | "sell";
  price: number;
  shares: number;
  value: number;
  pnl?: number;       // 本次交易盈亏（卖出时）
}

export interface BacktestDailyResult {
  date: string;
  timestamp: number;
  close: number;
  factorValue: number;
  signal: 1 | -1 | 0;
  portfolioValue: number;  // 当日组合净值（初始 1,000,000）
  benchmarkValue: number;  // 基准净值（买入持有）
  position: number;        // 当前持仓（0 或 1）
}

export interface BacktestMetrics {
  totalReturn: number;        // 总收益率（%）
  benchmarkReturn: number;    // 基准收益率（%）
  annualizedReturn: number;   // 年化收益率（%）
  maxDrawdown: number;        // 最大回撤（%）
  sharpeRatio: number;        // 夏普比率（假设无风险利率 3%）
  winRate: number;            // 胜率（%）
  totalTrades: number;        // 总交易次数
  profitableTrades: number;   // 盈利交易次数
  avgHoldingDays: number;     // 平均持仓天数
  calmarRatio: number;        // 卡玛比率（年化收益/最大回撤）
  volatility: number;         // 年化波动率（%）
  alpha: number;              // 超额收益（相对基准）
}

export interface BacktestResult {
  ticker: string;
  factorId: string;
  factorName: string;
  period: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  metrics: BacktestMetrics;
  dailyResults: BacktestDailyResult[];
  trades: BacktestTrade[];
  signals: FactorSignal[];
  dataSource: "polygon" | "yahoo";
  barsCount: number;
}

// ─── 历史数据获取 ──────────────────────────────────────────────────────────

/**
 * 从 Polygon.io 获取日线 OHLCV（美股，最多 500 条）
 */
async function fetchFromPolygon(ticker: string, from: string, to: string): Promise<OHLCVBar[]> {
  const key = ENV.POLYGON_API_KEY;
  if (!key) throw new Error("POLYGON_API_KEY 未配置");
  const bars = await getAggregates(ticker.toUpperCase(), from, to, 1, "day");
  return bars.map((b) => ({
    date: new Date(b.t).toISOString().slice(0, 10),
    timestamp: b.t,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));
}

/**
 * 从 Yahoo Finance chart API 获取日线 OHLCV（全球股票/指数）
 */
async function fetchFromYahoo(ticker: string, period: "1y" | "2y"): Promise<OHLCVBar[]> {
  const chartData = await callDataApi("YahooFinance/get_stock_chart", {
    query: { symbol: ticker, interval: "1d", range: period },
  });
  const result = (chartData as any)?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo Finance 无法获取 ${ticker} 的历史数据`);
  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens: number[] = quote.open ?? [];
  const highs: number[] = quote.high ?? [];
  const lows: number[] = quote.low ?? [];
  const closes: number[] = quote.close ?? [];
  const volumes: number[] = quote.volume ?? [];
  const bars: OHLCVBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null || isNaN(closes[i])) continue;
    bars.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      timestamp: timestamps[i] * 1000,
      open: opens[i] ?? closes[i],
      high: highs[i] ?? closes[i],
      low: lows[i] ?? closes[i],
      close: closes[i],
      volume: volumes[i] ?? 0,
    });
  }
  return bars;
}

/**
 * 获取历史 OHLCV 数据（自动选择数据源）
 */
export async function fetchHistoricalBars(
  ticker: string,
  period: "6mo" | "1y" | "2y" = "1y"
): Promise<{ bars: OHLCVBar[]; source: "polygon" | "yahoo" }> {
  const now = new Date();
  const from = new Date(now);
  if (period === "6mo") from.setMonth(from.getMonth() - 6);
  else if (period === "1y") from.setFullYear(from.getFullYear() - 1);
  else from.setFullYear(from.getFullYear() - 2);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = now.toISOString().slice(0, 10);

  // 判断是否为美股（纯字母，无后缀）
  const isUsStock = /^[A-Z]{1,5}$/.test(ticker.toUpperCase());
  if (isUsStock && ENV.POLYGON_API_KEY) {
    try {
      const bars = await fetchFromPolygon(ticker, fromStr, toStr);
      if (bars.length >= 20) return { bars, source: "polygon" };
    } catch {
      // fallback to Yahoo
    }
  }
  // Yahoo Finance fallback（支持全球股票/指数）
  const yahooRange = period === "6mo" ? "1y" : period;
  const allBars = await fetchFromYahoo(ticker, yahooRange as "1y" | "2y");
  // 按 period 过滤
  const cutoff = from.getTime();
  const bars = allBars.filter((b) => b.timestamp >= cutoff);
  return { bars, source: "yahoo" };
}

// ─── 因子计算函数 ──────────────────────────────────────────────────────────

function calcEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = new Array(closes.length).fill(NaN);
  // Find first valid index
  let start = period - 1;
  if (start >= closes.length) return ema;
  ema[start] = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = start + 1; i < closes.length; i++) {
    ema[i] = closes[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calcSMA(closes: number[], period: number): number[] {
  const sma: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    sma[i] = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  }
  return sma;
}

function calcStdDev(values: number[], period: number): number[] {
  const std: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    std[i] = Math.sqrt(variance);
  }
  return std;
}

/**
 * MACD 信号：12/26 EMA 差值，9 日信号线
 * 买入：MACD 上穿信号线（金叉）
 * 卖出：MACD 下穿信号线（死叉）
 */
function calcMACDSignals(bars: OHLCVBar[]): FactorSignal[] {
  const closes = bars.map((b) => b.close);
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macd = ema12.map((v, i) => (isNaN(v) || isNaN(ema26[i]) ? NaN : v - ema26[i]));
  const signal9 = calcEMA(macd.map((v) => (isNaN(v) ? 0 : v)), 9);
  const signals: FactorSignal[] = [];
  for (let i = 26; i < bars.length; i++) {
    if (isNaN(macd[i]) || isNaN(signal9[i])) continue;
    const diff = macd[i] - signal9[i];
    const prevDiff = i > 0 ? macd[i - 1] - signal9[i - 1] : 0;
    let sig: 1 | -1 | 0 = 0;
    let label = "持有";
    if (prevDiff <= 0 && diff > 0) { sig = 1; label = "MACD 金叉（买入）"; }
    else if (prevDiff >= 0 && diff < 0) { sig = -1; label = "MACD 死叉（卖出）"; }
    signals.push({ date: bars[i].date, timestamp: bars[i].timestamp, value: parseFloat(diff.toFixed(4)), signal: sig, signalLabel: label });
  }
  return signals;
}

/**
 * RSI 信号：14 日 RSI
 * 买入：RSI 从超卖区（<30）回升到 30 以上
 * 卖出：RSI 从超买区（>70）回落到 70 以下
 */
function calcRSISignals(bars: OHLCVBar[]): FactorSignal[] {
  const closes = bars.map((b) => b.close);
  const period = 14;
  const rsi: number[] = new Array(closes.length).fill(NaN);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  const signals: FactorSignal[] = [];
  for (let i = period + 1; i < bars.length; i++) {
    if (isNaN(rsi[i]) || isNaN(rsi[i - 1])) continue;
    let sig: 1 | -1 | 0 = 0;
    let label = "持有";
    if (rsi[i - 1] < 30 && rsi[i] >= 30) { sig = 1; label = `RSI 超卖回升（${rsi[i].toFixed(1)}，买入）`; }
    else if (rsi[i - 1] > 70 && rsi[i] <= 70) { sig = -1; label = `RSI 超买回落（${rsi[i].toFixed(1)}，卖出）`; }
    signals.push({ date: bars[i].date, timestamp: bars[i].timestamp, value: parseFloat(rsi[i].toFixed(2)), signal: sig, signalLabel: label });
  }
  return signals;
}

/**
 * 布林带信号：20 日均线 ± 2 倍标准差
 * 买入：价格从下轨反弹（突破下轨后回到下轨以上）
 * 卖出：价格从上轨回落（突破上轨后回到上轨以下）
 */
function calcBollingerSignals(bars: OHLCVBar[]): FactorSignal[] {
  const closes = bars.map((b) => b.close);
  const period = 20;
  const mid = calcSMA(closes, period);
  const std = calcStdDev(closes, period);
  const upper = mid.map((m, i) => (isNaN(m) ? NaN : m + 2 * std[i]));
  const lower = mid.map((m, i) => (isNaN(m) ? NaN : m - 2 * std[i]));
  const signals: FactorSignal[] = [];
  for (let i = period; i < bars.length; i++) {
    if (isNaN(upper[i]) || isNaN(lower[i])) continue;
    const pct = ((closes[i] - lower[i]) / (upper[i] - lower[i])) * 100;
    let sig: 1 | -1 | 0 = 0;
    let label = "持有";
    if (i > 0 && closes[i - 1] < lower[i - 1] && closes[i] >= lower[i]) {
      sig = 1; label = `价格突破布林下轨（买入，%B=${pct.toFixed(0)}%）`;
    } else if (i > 0 && closes[i - 1] > upper[i - 1] && closes[i] <= upper[i]) {
      sig = -1; label = `价格跌破布林上轨（卖出，%B=${pct.toFixed(0)}%）`;
    }
    signals.push({ date: bars[i].date, timestamp: bars[i].timestamp, value: parseFloat(pct.toFixed(2)), signal: sig, signalLabel: label });
  }
  return signals;
}

/**
 * 均线交叉信号：5/20 日 SMA 金叉/死叉
 */
function calcMACrossSignals(bars: OHLCVBar[]): FactorSignal[] {
  const closes = bars.map((b) => b.close);
  const fast = calcSMA(closes, 5);
  const slow = calcSMA(closes, 20);
  const signals: FactorSignal[] = [];
  for (let i = 20; i < bars.length; i++) {
    if (isNaN(fast[i]) || isNaN(slow[i]) || isNaN(fast[i - 1]) || isNaN(slow[i - 1])) continue;
    const diff = fast[i] - slow[i];
    const prevDiff = fast[i - 1] - slow[i - 1];
    let sig: 1 | -1 | 0 = 0;
    let label = "持有";
    if (prevDiff <= 0 && diff > 0) { sig = 1; label = "MA5 上穿 MA20（金叉买入）"; }
    else if (prevDiff >= 0 && diff < 0) { sig = -1; label = "MA5 下穿 MA20（死叉卖出）"; }
    signals.push({ date: bars[i].date, timestamp: bars[i].timestamp, value: parseFloat(diff.toFixed(4)), signal: sig, signalLabel: label });
  }
  return signals;
}

/**
 * 动量信号：20 日价格动量（当前价 / 20 日前价 - 1）
 * 买入：动量从负转正
 * 卖出：动量从正转负
 */
function calcMomentumSignals(bars: OHLCVBar[]): FactorSignal[] {
  const closes = bars.map((b) => b.close);
  const period = 20;
  const signals: FactorSignal[] = [];
  for (let i = period; i < bars.length; i++) {
    const mom = (closes[i] / closes[i - period] - 1) * 100;
    const prevMom = i > period ? (closes[i - 1] / closes[i - period - 1] - 1) * 100 : 0;
    let sig: 1 | -1 | 0 = 0;
    let label = "持有";
    if (prevMom <= 0 && mom > 0) { sig = 1; label = `动量转正（${mom.toFixed(1)}%，买入）`; }
    else if (prevMom >= 0 && mom < 0) { sig = -1; label = `动量转负（${mom.toFixed(1)}%，卖出）`; }
    signals.push({ date: bars[i].date, timestamp: bars[i].timestamp, value: parseFloat(mom.toFixed(2)), signal: sig, signalLabel: label });
  }
  return signals;
}

/**
 * KDJ 信号：9 日随机指标
 * 买入：K 上穿 D（且 K < 30）
 * 卖出：K 下穿 D（且 K > 70）
 */
function calcKDJSignals(bars: OHLCVBar[]): FactorSignal[] {
  const period = 9;
  const K: number[] = new Array(bars.length).fill(50);
  const D: number[] = new Array(bars.length).fill(50);
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const highMax = Math.max(...slice.map((b) => b.high));
    const lowMin = Math.min(...slice.map((b) => b.low));
    const rsv = highMax === lowMin ? 50 : ((bars[i].close - lowMin) / (highMax - lowMin)) * 100;
    K[i] = (2 / 3) * (i > 0 ? K[i - 1] : 50) + (1 / 3) * rsv;
    D[i] = (2 / 3) * (i > 0 ? D[i - 1] : 50) + (1 / 3) * K[i];
  }
  const signals: FactorSignal[] = [];
  for (let i = period; i < bars.length; i++) {
    const diff = K[i] - D[i];
    const prevDiff = K[i - 1] - D[i - 1];
    let sig: 1 | -1 | 0 = 0;
    let label = "持有";
    if (prevDiff <= 0 && diff > 0 && K[i] < 50) { sig = 1; label = `KDJ 金叉（K=${K[i].toFixed(1)}，买入）`; }
    else if (prevDiff >= 0 && diff < 0 && K[i] > 50) { sig = -1; label = `KDJ 死叉（K=${K[i].toFixed(1)}，卖出）`; }
    signals.push({ date: bars[i].date, timestamp: bars[i].timestamp, value: parseFloat(K[i].toFixed(2)), signal: sig, signalLabel: label });
  }
  return signals;
}

// ─── 因子路由 ──────────────────────────────────────────────────────────────

const FACTOR_CALCULATORS: Record<string, (bars: OHLCVBar[]) => FactorSignal[]> = {
  macd: calcMACDSignals,
  rsi: calcRSISignals,
  bollinger: calcBollingerSignals,
  ma_cross: calcMACrossSignals,
  momentum: calcMomentumSignals,
  kdj: calcKDJSignals,
};

export const BACKTEST_FACTORS = [
  { id: "macd", name: "MACD（指数平滑异同移动平均）", shortName: "MACD", category: "趋势跟踪", description: "12/26 EMA 差值与 9 日信号线的金叉/死叉策略" },
  { id: "rsi", name: "RSI（相对强弱指数）", shortName: "RSI", category: "超买超卖", description: "14 日 RSI 超卖（<30）买入、超买（>70）卖出策略" },
  { id: "bollinger", name: "布林带（Bollinger Bands）", shortName: "BOLL", category: "波动率", description: "20 日均线 ±2σ 通道，下轨反弹买入、上轨回落卖出" },
  { id: "ma_cross", name: "均线交叉（MA Cross）", shortName: "MA5/20", category: "趋势跟踪", description: "5 日均线与 20 日均线的金叉/死叉策略" },
  { id: "momentum", name: "价格动量（Momentum）", shortName: "MOM", category: "动量", description: "20 日价格动量，动量转正买入、转负卖出" },
  { id: "kdj", name: "KDJ 随机指标", shortName: "KDJ", category: "超买超卖", description: "9 日 KDJ，低位金叉买入（K<50）、高位死叉卖出（K>50）" },
];

// ─── 回测核心逻辑 ──────────────────────────────────────────────────────────

export async function runBacktest(
  ticker: string,
  factorId: string,
  period: "6mo" | "1y" | "2y" = "1y"
): Promise<BacktestResult> {
  const factorInfo = BACKTEST_FACTORS.find((f) => f.id === factorId);
  if (!factorInfo) throw new Error(`未知因子 ID: ${factorId}`);
  const calcFn = FACTOR_CALCULATORS[factorId];
  if (!calcFn) throw new Error(`因子计算函数未找到: ${factorId}`);

  // 1. 获取历史数据
  const { bars, source } = await fetchHistoricalBars(ticker, period);
  if (bars.length < 30) throw new Error(`${ticker} 的历史数据不足（仅 ${bars.length} 条），无法回测`);

  // 2. 计算因子信号
  const signals = calcFn(bars);
  if (signals.length === 0) throw new Error(`无法为 ${ticker} 计算 ${factorInfo.name} 信号`);

  // 3. 构建信号映射（日期 → 信号）
  const signalMap = new Map<string, FactorSignal>();
  for (const s of signals) signalMap.set(s.date, s);

  // 4. 模拟回测（初始资金 1,000,000）
  const INITIAL_CAPITAL = 1_000_000;
  let cash = INITIAL_CAPITAL;
  let shares = 0;
  let position = 0; // 0=空仓, 1=持仓
  const trades: BacktestTrade[] = [];
  const dailyResults: BacktestDailyResult[] = [];
  let buyPrice = 0;
  let buyDate = "";

  // 基准：第一天买入持有
  const firstClose = bars[0].close;

  for (const bar of bars) {
    const sig = signalMap.get(bar.date);
    const factorValue = sig?.value ?? NaN;
    const signalValue = sig?.signal ?? 0;

    // 执行交易（使用次日开盘价模拟，这里用当日收盘价简化）
    if (signalValue === 1 && position === 0) {
      // 买入：全仓
      shares = Math.floor(cash / bar.close);
      if (shares > 0) {
        const cost = shares * bar.close;
        cash -= cost;
        position = 1;
        buyPrice = bar.close;
        buyDate = bar.date;
        trades.push({ date: bar.date, type: "buy", price: bar.close, shares, value: cost });
      }
    } else if (signalValue === -1 && position === 1) {
      // 卖出：全仓
      const value = shares * bar.close;
      const pnl = value - shares * buyPrice;
      cash += value;
      trades.push({ date: bar.date, type: "sell", price: bar.close, shares, value, pnl });
      shares = 0;
      position = 0;
      buyPrice = 0;
    }

    const portfolioValue = cash + shares * bar.close;
    const benchmarkValue = INITIAL_CAPITAL * (bar.close / firstClose);

    dailyResults.push({
      date: bar.date,
      timestamp: bar.timestamp,
      close: bar.close,
      factorValue,
      signal: signalValue,
      portfolioValue,
      benchmarkValue,
      position,
    });
  }

  // 5. 计算绩效指标
  const finalValue = dailyResults[dailyResults.length - 1]?.portfolioValue ?? INITIAL_CAPITAL;
  const benchmarkFinal = dailyResults[dailyResults.length - 1]?.benchmarkValue ?? INITIAL_CAPITAL;
  const totalReturn = ((finalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  const benchmarkReturn = ((benchmarkFinal - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;

  // 年化收益率
  const tradingDays = bars.length;
  const years = tradingDays / 252;
  const annualizedReturn = years > 0 ? ((Math.pow(finalValue / INITIAL_CAPITAL, 1 / years) - 1) * 100) : 0;

  // 最大回撤
  let maxDrawdown = 0;
  let peak = INITIAL_CAPITAL;
  for (const d of dailyResults) {
    if (d.portfolioValue > peak) peak = d.portfolioValue;
    const dd = ((peak - d.portfolioValue) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // 夏普比率（无风险利率 3%）
  const returns: number[] = [];
  for (let i = 1; i < dailyResults.length; i++) {
    const r = (dailyResults[i].portfolioValue - dailyResults[i - 1].portfolioValue) / dailyResults[i - 1].portfolioValue;
    returns.push(r);
  }
  const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const stdReturn = Math.sqrt(returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / (returns.length || 1));
  const riskFreeDaily = 0.03 / 252;
  const sharpeRatio = stdReturn > 0 ? ((avgReturn - riskFreeDaily) / stdReturn) * Math.sqrt(252) : 0;

  // 年化波动率
  const volatility = stdReturn * Math.sqrt(252) * 100;

  // 胜率
  const sellTrades = trades.filter((t) => t.type === "sell");
  const profitableTrades = sellTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = sellTrades.length > 0 ? (profitableTrades / sellTrades.length) * 100 : 0;

  // 平均持仓天数
  const holdingDays: number[] = [];
  const buyTrades = trades.filter((t) => t.type === "buy");
  for (let i = 0; i < Math.min(buyTrades.length, sellTrades.length); i++) {
    const buyTs = new Date(buyTrades[i].date).getTime();
    const sellTs = new Date(sellTrades[i].date).getTime();
    holdingDays.push((sellTs - buyTs) / (1000 * 60 * 60 * 24));
  }
  const avgHoldingDays = holdingDays.length > 0 ? holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length : 0;

  // 卡玛比率
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  // Alpha（超额收益）
  const alpha = totalReturn - benchmarkReturn;

  return {
    ticker: ticker.toUpperCase(),
    factorId,
    factorName: factorInfo.name,
    period,
    startDate: bars[0].date,
    endDate: bars[bars.length - 1].date,
    initialCapital: INITIAL_CAPITAL,
    finalCapital: finalValue,
    metrics: {
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      benchmarkReturn: parseFloat(benchmarkReturn.toFixed(2)),
      annualizedReturn: parseFloat(annualizedReturn.toFixed(2)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(3)),
      winRate: parseFloat(winRate.toFixed(1)),
      totalTrades: trades.length,
      profitableTrades,
      avgHoldingDays: parseFloat(avgHoldingDays.toFixed(1)),
      calmarRatio: parseFloat(calmarRatio.toFixed(3)),
      volatility: parseFloat(volatility.toFixed(2)),
      alpha: parseFloat(alpha.toFixed(2)),
    },
    dailyResults,
    trades,
    signals,
    dataSource: source,
    barsCount: bars.length,
  };
}
