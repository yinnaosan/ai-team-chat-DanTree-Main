/**
 * localIndicators.ts
 * 基于 indicatorts (cinar/indicator) 的本地技术指标计算模块
 * 使用 Yahoo Finance 历史 OHLCV 数据，无需消耗 Alpha Vantage API 配额
 *
 * 支持指标：RSI、MACD、布林带、EMA/SMA、ATR、Stochastic、KDJ、CCI、OBV、VWAP、Williams %R
 */

import {
  rsi,
  macd, MACDDefaultConfig,
  bollingerBands, BBDefaultConfig,
  ema, EMADefaultConfig,
  sma, SMADefaultConfig,
  atr,
  stoch, StochDefaultConfig,
  kdj, KDJDefaultConfig,
  cci, CCIDefaultConfig,
  obv,
  vwap, VWAPDefaultConfig,
  williamsR,
} from "indicatorts";
import { callDataApi } from "./_core/dataApi";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface OHLCVData {
  timestamps: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

export interface LocalTechnicalIndicators {
  symbol: string;
  fetchedAt: string;
  priceData: {
    current: number;
    prev: number;
    change: number;
    changePct: number;
  };
  rsi14: number[];
  macdLine: number[];
  macdSignal: number[];
  bbUpper: number[];
  bbMiddle: number[];
  bbLower: number[];
  ema20: number[];
  ema50: number[];
  sma50: number[];
  sma200: number[];
  atr14: number[];
  stochK: number[];
  stochD: number[];
  kdjK: number[];
  kdjD: number[];
  kdjJ: number[];
  cci20: number[];
  obvValues: number[];
  vwapValues: number[];
  williamsRValues: number[];
  dataPoints: number;
}

// ── 数据获取 ──────────────────────────────────────────────────────────────────

function normalizeTicker(input: string): string {
  const ticker = input.trim().toUpperCase();
  if (ticker.includes(".")) return ticker;
  if (/^[036]\d{5}$/.test(ticker)) {
    return ticker.startsWith("6") ? `${ticker}.SS` : `${ticker}.SZ`;
  }
  if (/^\d{4,5}$/.test(ticker)) return `${ticker}.HK`;
  return ticker;
}

export async function fetchOHLCV(ticker: string): Promise<OHLCVData | null> {
  try {
    const normalized = normalizeTicker(ticker);
    const chartData = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: normalized, interval: "1d", range: "1y" },
    }) as any;

    const result = chartData?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) return null;

    const opens: number[] = (quote.open ?? []).map((v: number | null) => v ?? 0);
    const highs: number[] = (quote.high ?? []).map((v: number | null) => v ?? 0);
    const lows: number[] = (quote.low ?? []).map((v: number | null) => v ?? 0);
    const closes: number[] = (quote.close ?? []).map((v: number | null) => v ?? 0);
    const volumes: number[] = (quote.volume ?? []).map((v: number | null) => v ?? 0);

    const validIndices = closes.map((c, i) => c > 0 ? i : -1).filter(i => i >= 0);
    return {
      timestamps: validIndices.map(i => timestamps[i]),
      opens: validIndices.map(i => opens[i]),
      highs: validIndices.map(i => highs[i]),
      lows: validIndices.map(i => lows[i]),
      closes: validIndices.map(i => closes[i]),
      volumes: validIndices.map(i => volumes[i]),
    };
  } catch {
    return null;
  }
}

// ── 指标计算 ──────────────────────────────────────────────────────────────────

function tail<T>(arr: T[], n: number): T[] {
  return arr.slice(-n).reverse();
}

function safeArr(fn: () => number[]): number[] {
  try { return fn(); } catch { return []; }
}

export async function getLocalTechnicalIndicators(ticker: string): Promise<LocalTechnicalIndicators | null> {
  const ohlcv = await fetchOHLCV(ticker);
  if (!ohlcv || ohlcv.closes.length < 30) return null;

  const { highs, lows, closes, volumes } = ohlcv;
  const n = 8;

  const rsi14 = safeArr(() => tail(rsi(closes) as number[], n));

  // MACD — 返回 { macdLine, signalLine }，无 histogram
  const macdResult = (() => {
    try {
      const r = macd(closes, MACDDefaultConfig) as { macdLine: number[]; signalLine: number[] };
      return {
        macdLine: tail(r.macdLine, n),
        macdSignal: tail(r.signalLine, n),
      };
    } catch { return { macdLine: [], macdSignal: [] }; }
  })();

  // 布林带
  const bbResult = (() => {
    try {
      const r = bollingerBands(closes, { ...BBDefaultConfig, period: 20 }) as { upper: number[]; middle: number[]; lower: number[] };
      return {
        bbUpper: tail(r.upper, n),
        bbMiddle: tail(r.middle, n),
        bbLower: tail(r.lower, n),
      };
    } catch { return { bbUpper: [], bbMiddle: [], bbLower: [] }; }
  })();

  const ema20 = safeArr(() => tail(ema(closes, { ...EMADefaultConfig, period: 20 }) as number[], n));
  const ema50 = safeArr(() => tail(ema(closes, { ...EMADefaultConfig, period: 50 }) as number[], n));
  const sma50 = safeArr(() => tail(sma(closes, { ...SMADefaultConfig, period: 50 }) as number[], n));
  const sma200 = safeArr(() => tail(sma(closes, { ...SMADefaultConfig, period: 200 }) as number[], n));

  // ATR — 返回 { trLine, atrLine }
  const atr14 = safeArr(() => {
    const r = atr(highs, lows, closes) as { trLine: number[]; atrLine: number[] };
    return tail(r.atrLine, n);
  });

  // Stochastic — 返回 { k, d }
  const stochResult = (() => {
    try {
      const r = stoch(highs, lows, closes, StochDefaultConfig) as { k: number[]; d: number[] };
      return { stochK: tail(r.k, n), stochD: tail(r.d, n) };
    } catch { return { stochK: [], stochD: [] }; }
  })();

  // KDJ — 返回 { k, d, j }
  const kdjResult = (() => {
    try {
      const r = kdj(highs, lows, closes, KDJDefaultConfig) as { k: number[]; d: number[]; j: number[] };
      return { kdjK: tail(r.k, n), kdjD: tail(r.d, n), kdjJ: tail(r.j, n) };
    } catch { return { kdjK: [], kdjD: [], kdjJ: [] }; }
  })();

  // CCI — 返回 number[]
  const cci20 = safeArr(() => tail(cci(highs, lows, closes, CCIDefaultConfig) as number[], n));

  // OBV — 返回 number[]
  const obvValues = safeArr(() => tail(obv(closes, volumes) as number[], n));

  // VWAP — 返回 number[]（参数：closings, volumes, config）
  const vwapValues = safeArr(() => tail(vwap(closes, volumes, VWAPDefaultConfig) as number[], n));

  // Williams %R — 返回 number[]
  const williamsRValues = safeArr(() => tail(williamsR(highs, lows, closes) as number[], n));

  const current = closes[closes.length - 1];
  const prev = closes[closes.length - 2] ?? current;

  return {
    symbol: ticker.toUpperCase(),
    fetchedAt: new Date().toISOString(),
    priceData: {
      current,
      prev,
      change: current - prev,
      changePct: ((current - prev) / prev) * 100,
    },
    rsi14,
    ...macdResult,
    ...bbResult,
    ema20,
    ema50,
    sma50,
    sma200,
    atr14,
    ...stochResult,
    ...kdjResult,
    cci20,
    obvValues,
    vwapValues,
    williamsRValues,
    dataPoints: closes.length,
  };
}

// ── 格式化输出 ─────────────────────────────────────────────────────────────────

export function formatLocalTechnicalIndicators(data: LocalTechnicalIndicators | null | undefined): string {
  if (!data) return "";
  const lines: string[] = [];
  const { symbol, priceData } = data;
  const fmt = (v: number, d = 2) => isNaN(v) ? "N/A" : v.toFixed(d);

  lines.push(`## 本地技术指标分析 — ${symbol}`);
  lines.push(`*数据来源：Yahoo Finance 1年日线 + indicatorts 本地计算 | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")} | 数据点：${data.dataPoints}*\n`);

  // ── RSI ──
  if (data.rsi14.length > 0) {
    const latest = data.rsi14[0];
    const signal = latest > 70 ? "⚠️ **超买区间**（>70）" : latest < 30 ? "⚠️ **超卖区间**（<30）" : "✅ 中性区间（30-70）";
    lines.push(`### RSI(14) — 相对强弱指数`);
    lines.push(`> 最新值：**${fmt(latest)}** — ${signal}\n`);
    lines.push(`| 序号 | RSI(14) | 信号 |`);
    lines.push(`|------|---------|------|`);
    data.rsi14.slice(0, 5).forEach((v, i) => {
      lines.push(`| T-${i} | ${fmt(v)} | ${v > 70 ? "超买" : v < 30 ? "超卖" : "中性"} |`);
    });
    lines.push("");
  }

  // ── MACD ──
  if (data.macdLine.length > 0 && data.macdSignal.length > 0) {
    const macdVal = data.macdLine[0];
    const signalVal = data.macdSignal[0];
    const crossSignal = macdVal > signalVal ? "📈 MACD 在信号线上方（看涨）" : "📉 MACD 在信号线下方（看跌）";
    lines.push(`### MACD(12,26,9) — 指数平滑异同移动平均`);
    lines.push(`> MACD：**${fmt(macdVal, 4)}** | Signal：**${fmt(signalVal, 4)}**`);
    lines.push(`> ${crossSignal}\n`);
    lines.push(`| 序号 | MACD | Signal | 差值 |`);
    lines.push(`|------|------|--------|------|`);
    for (let i = 0; i < Math.min(5, data.macdLine.length); i++) {
      const diff = data.macdLine[i] - data.macdSignal[i];
      lines.push(`| T-${i} | ${fmt(data.macdLine[i], 4)} | ${fmt(data.macdSignal[i], 4)} | ${fmt(diff, 4)} |`);
    }
    lines.push("");
  }

  // ── 布林带 ──
  if (data.bbUpper.length > 0) {
    const upper = data.bbUpper[0];
    const middle = data.bbMiddle[0];
    const lower = data.bbLower[0];
    const price = priceData.current;
    const bandwidth = ((upper - lower) / middle * 100);
    const position = price > upper ? "⚠️ 价格突破上轨（超买/突破）"
      : price < lower ? "⚠️ 价格跌破下轨（超卖/突破）"
      : price > middle ? "价格在中轨上方（偏强）"
      : "价格在中轨下方（偏弱）";
    lines.push(`### 布林带(20, 2) — Bollinger Bands`);
    lines.push(`> 当前价格 **${fmt(price)}** | 上轨：${fmt(upper)} | 中轨：${fmt(middle)} | 下轨：${fmt(lower)}`);
    lines.push(`> 带宽：${fmt(bandwidth, 1)}% | ${position}\n`);
    lines.push(`| 序号 | 上轨 | 中轨 | 下轨 | 带宽 |`);
    lines.push(`|------|------|------|------|------|`);
    for (let i = 0; i < Math.min(4, data.bbUpper.length); i++) {
      const bw = ((data.bbUpper[i] - data.bbLower[i]) / data.bbMiddle[i] * 100);
      lines.push(`| T-${i} | ${fmt(data.bbUpper[i])} | ${fmt(data.bbMiddle[i])} | ${fmt(data.bbLower[i])} | ${fmt(bw, 1)}% |`);
    }
    lines.push("");
  }

  // ── 移动平均线 ──
  const maLines: string[][] = [];
  if (data.ema20.length > 0) maLines.push(["EMA(20)", fmt(data.ema20[0]), data.ema20[0] < priceData.current ? "✅ 价格在上方" : "⚠️ 价格在下方"]);
  if (data.ema50.length > 0) maLines.push(["EMA(50)", fmt(data.ema50[0]), data.ema50[0] < priceData.current ? "✅ 价格在上方" : "⚠️ 价格在下方"]);
  if (data.sma50.length > 0) maLines.push(["SMA(50)", fmt(data.sma50[0]), data.sma50[0] < priceData.current ? "✅ 价格在上方" : "⚠️ 价格在下方"]);
  if (data.sma200.length > 0) maLines.push(["SMA(200)", fmt(data.sma200[0]), data.sma200[0] < priceData.current ? "✅ 价格在上方（牛市）" : "⚠️ 价格在下方（熊市）"]);
  if (maLines.length > 0) {
    lines.push(`### 移动平均线（最新值）`);
    lines.push(`| 指标 | 最新值 | 与当前价格关系 |`);
    lines.push(`|------|--------|--------------|`);
    for (const row of maLines) lines.push(`| ${row[0]} | ${row[1]} | ${row[2]} |`);
    if (data.ema20.length > 0 && data.ema50.length > 0 && data.sma200.length > 0) {
      const bullish = data.ema20[0] > data.ema50[0] && data.ema50[0] > data.sma200[0];
      const bearish = data.ema20[0] < data.ema50[0] && data.ema50[0] < data.sma200[0];
      if (bullish) lines.push(`\n> 📈 **均线多头排列**（EMA20 > EMA50 > SMA200）— 趋势向上`);
      else if (bearish) lines.push(`\n> 📉 **均线空头排列**（EMA20 < EMA50 < SMA200）— 趋势向下`);
    }
    lines.push("");
  }

  // ── Stochastic ──
  if (data.stochK.length > 0) {
    const k = data.stochK[0];
    const d = data.stochD[0];
    const signal = k > 80 ? "⚠️ 超买区间（>80）" : k < 20 ? "⚠️ 超卖区间（<20）" : "✅ 中性区间";
    const cross = k > d ? "K 在 D 上方（看涨）" : "K 在 D 下方（看跌）";
    lines.push(`### 随机指标 Stochastic(14,3,3)`);
    lines.push(`> %K：**${fmt(k)}** | %D：**${fmt(d)}** — ${signal} | ${cross}\n`);
  }

  // ── KDJ ──
  if (data.kdjK.length > 0) {
    const k = data.kdjK[0];
    const d = data.kdjD[0];
    const j = data.kdjJ[0];
    const signal = j > 100 ? "⚠️ J 值超买（>100）" : j < 0 ? "⚠️ J 值超卖（<0）" : "✅ 中性区间";
    lines.push(`### KDJ 指标`);
    lines.push(`> K：**${fmt(k)}** | D：**${fmt(d)}** | J：**${fmt(j)}** — ${signal}\n`);
  }

  // ── CCI ──
  if (data.cci20.length > 0) {
    const cciVal = data.cci20[0];
    const signal = cciVal > 100 ? "⚠️ 超买（>+100）" : cciVal < -100 ? "⚠️ 超卖（<-100）" : "✅ 中性区间";
    lines.push(`### CCI(20) — 顺势指标`);
    lines.push(`> 最新值：**${fmt(cciVal, 1)}** — ${signal}\n`);
  }

  // ── Williams %R ──
  if (data.williamsRValues.length > 0) {
    const wr = data.williamsRValues[0];
    const signal = wr > -20 ? "⚠️ 超买区间（>-20）" : wr < -80 ? "⚠️ 超卖区间（<-80）" : "✅ 中性区间";
    lines.push(`### Williams %R(14)`);
    lines.push(`> 最新值：**${fmt(wr, 1)}** — ${signal}\n`);
  }

  // ── OBV ──
  if (data.obvValues.length > 0) {
    const obvVal = data.obvValues[0];
    const obvPrev = data.obvValues[1] ?? obvVal;
    const obvTrend = obvVal > obvPrev ? "↑ 上升（资金流入）" : obvVal < obvPrev ? "↓ 下降（资金流出）" : "→ 持平";
    lines.push(`### OBV — 能量潮指标`);
    lines.push(`> 最新值：**${(obvVal / 1e6).toFixed(2)}M** | 趋势：${obvTrend}\n`);
  }
  // ── VWAP ──
  if (data.vwapValues.length > 0) {
    const vwapVal = data.vwapValues[0];
    const price = priceData.current;
    const vwapDiff = ((price - vwapVal) / vwapVal * 100);
    const signal = price > vwapVal ? `✅ 价格在 VWAP 上方（+${fmt(vwapDiff, 1)}%）— 强势` : `⚠️ 价格在 VWAP 下方（${fmt(vwapDiff, 1)}%）— 弱势`;
    lines.push(`### VWAP — 成交量加权均价`);
    lines.push(`> 最新值：**${fmt(vwapVal)}** | 当前价格：${fmt(price)} | ${signal}\n`);
  }
  // ── ATR ──
  if (data.atr14.length > 0) {
    const atrVal = data.atr14[0];
    const atrPct = (atrVal / priceData.current * 100);
    lines.push(`### ATR(14) — 平均真实波幅`);
    lines.push(`> 最新值：**${fmt(atrVal)}**（占价格 ${fmt(atrPct, 1)}%）— 波动率${atrPct > 3 ? "较高" : atrPct > 1.5 ? "适中" : "较低"}\n`);
  }

  // ── 综合信号汇总 ──
  lines.push(`### 综合技术信号汇总`);
  const signals: string[] = [];
  if (data.rsi14.length > 0) {
    const r = data.rsi14[0];
    signals.push(`RSI=${fmt(r)}（${r > 70 ? "超买" : r < 30 ? "超卖" : "中性"}）`);
  }
  if (data.macdLine.length > 0 && data.macdSignal.length > 0) {
    signals.push(`MACD ${data.macdLine[0] > data.macdSignal[0] ? "看涨" : "看跌"}`);
  }
  if (data.bbUpper.length > 0) {
    const p = priceData.current;
    signals.push(`布林带：${p > data.bbUpper[0] ? "突破上轨" : p < data.bbLower[0] ? "跌破下轨" : "带内运行"}`);
  }
  if (data.stochK.length > 0) {
    const k = data.stochK[0];
    signals.push(`Stoch=%K${fmt(k)}（${k > 80 ? "超买" : k < 20 ? "超卖" : "中性"}）`);
  }
  if (signals.length > 0) {
    lines.push(`> ${signals.join(" | ")}`);
  }

  return lines.join("\n");
}

/**
 * 生成技术信号速览（用于在分析报告中插入简短技术面总结）
 */
export function generateTechnicalSignalSummary(data: LocalTechnicalIndicators): string {
  const signals: Array<{ indicator: string; signal: "bullish" | "bearish" | "neutral"; detail: string }> = [];

  if (data.rsi14.length > 0) {
    const r = data.rsi14[0];
    signals.push({
      indicator: "RSI(14)",
      signal: r > 70 ? "bearish" : r < 30 ? "bullish" : "neutral",
      detail: `${r.toFixed(1)}（${r > 70 ? "超买" : r < 30 ? "超卖" : "中性"}）`,
    });
  }

  if (data.macdLine.length > 0 && data.macdSignal.length > 0) {
    const bullish = data.macdLine[0] > data.macdSignal[0];
    signals.push({
      indicator: "MACD",
      signal: bullish ? "bullish" : "bearish",
      detail: bullish ? "MACD 在信号线上方" : "MACD 在信号线下方",
    });
  }

  if (data.ema20.length > 0 && data.sma200.length > 0) {
    const bullish = data.ema20[0] > data.sma200[0];
    signals.push({
      indicator: "均线趋势",
      signal: bullish ? "bullish" : "bearish",
      detail: bullish ? "EMA20 > SMA200（多头）" : "EMA20 < SMA200（空头）",
    });
  }

  if (data.stochK.length > 0) {
    const k = data.stochK[0];
    signals.push({
      indicator: "Stochastic",
      signal: k > 80 ? "bearish" : k < 20 ? "bullish" : "neutral",
      detail: `%K=${k.toFixed(1)}（${k > 80 ? "超买" : k < 20 ? "超卖" : "中性"}）`,
    });
  }

  const bullCount = signals.filter(s => s.signal === "bullish").length;
  const bearCount = signals.filter(s => s.signal === "bearish").length;
  const overall = bullCount > bearCount ? "📈 技术面偏多" : bearCount > bullCount ? "📉 技术面偏空" : "⚖️ 技术面中性";

  return [
    `**技术信号速览（${data.symbol}）：** ${overall}`,
    signals.map(s => `- ${s.indicator}：${s.detail}`).join("\n"),
  ].join("\n");
}

// ── 图表数据获取（用于 yorkeccak/finance 架构的自动图表生成）────────────────────

export interface ChartIndicatorData {
  ohlcv: OHLCVData;
  rsi14: number[];
  macdLine: number[];
  macdSignal: number[];
  bbUpper: number[];
  bbMiddle: number[];
  bbLower: number[];
  ema20: number[];
  ema50: number[];
  sma200: number[];
}

/**
 * 获取完整的 OHLCV + 技术指标数据，用于 matplotlib 图表生成
 * 与 getLocalTechnicalIndicators 的区别：不截断数据，返回全量序列
 */
export async function getOHLCVForChart(ticker: string): Promise<ChartIndicatorData | null> {
  const ohlcv = await fetchOHLCV(ticker);
  if (!ohlcv || ohlcv.closes.length < 30) return null;

  const { highs, lows, closes, volumes } = ohlcv;

  const safeFullArr = (fn: () => number[]): number[] => {
    try { return fn(); } catch { return []; }
  };

  // 计算全量指标（不截断，供图表使用）
  const rsi14 = safeFullArr(() => rsi(closes) as number[]);

  const macdResult = (() => {
    try {
      const r = macd(closes, MACDDefaultConfig) as { macdLine: number[]; signalLine: number[] };
      return { macdLine: r.macdLine, macdSignal: r.signalLine };
    } catch { return { macdLine: [], macdSignal: [] }; }
  })();

  const bbResult = (() => {
    try {
      const r = bollingerBands(closes, { ...BBDefaultConfig, period: 20 }) as { upper: number[]; middle: number[]; lower: number[] };
      return { bbUpper: r.upper, bbMiddle: r.middle, bbLower: r.lower };
    } catch { return { bbUpper: [], bbMiddle: [], bbLower: [] }; }
  })();

  const ema20 = safeFullArr(() => ema(closes, { ...EMADefaultConfig, period: 20 }) as number[]);
  const ema50 = safeFullArr(() => ema(closes, { ...EMADefaultConfig, period: 50 }) as number[]);
  const sma200 = safeFullArr(() => sma(closes, { ...SMADefaultConfig, period: 200 }) as number[]);

  return {
    ohlcv,
    rsi14,
    ...macdResult,
    ...bbResult,
    ema20,
    ema50,
    sma200,
  };
}
