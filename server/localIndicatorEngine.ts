/**
 * ============================================================
 * LOCAL INDICATOR ENGINE — DanTree Phase 1
 * ============================================================
 *
 * 本地计算技术指标（不调用任何外部指标 API）
 * 输入：OHLCV 数据
 * 输出：RSI / MACD / EMA / SMA / Bollinger Bands / ATR
 *
 * 用于：
 * - CN/HK 股票（Yahoo OHLCV → 本地计算）
 * - US 股票（Twelve Data 失败时的 fallback 计算）
 *
 * 禁止：
 * - 调用任何"免费指标 API"代替
 * - 接入 Tushare / efinance / AKShare
 */

export interface OHLCVBar {
  timestamp: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult {
  /** RSI (14) */
  rsi14: number | null;
  /** MACD line */
  macdLine: number | null;
  /** MACD signal line */
  macdSignal: number | null;
  /** MACD histogram */
  macdHistogram: number | null;
  /** EMA 20 */
  ema20: number | null;
  /** EMA 50 */
  ema50: number | null;
  /** SMA 20 */
  sma20: number | null;
  /** SMA 50 */
  sma50: number | null;
  /** Bollinger Upper (20, 2σ) */
  bollingerUpper: number | null;
  /** Bollinger Middle (SMA 20) */
  bollingerMiddle: number | null;
  /** Bollinger Lower (20, 2σ) */
  bollingerLower: number | null;
  /** ATR 14 */
  atr14: number | null;
  /** 最新收盘价 */
  lastClose: number | null;
  /** 数据点数量 */
  barCount: number;
}

// ── EMA ────────────────────────────────────────────────────────────────────────
function calcEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  // 初始 EMA = 前 period 个收盘价的 SMA
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// ── SMA ────────────────────────────────────────────────────────────────────────
function calcSMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const result: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

// ── RSI ────────────────────────────────────────────────────────────────────────
function calcRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ── MACD ───────────────────────────────────────────────────────────────────────
function calcMACD(closes: number[]): { macdLine: number | null; signal: number | null; histogram: number | null } {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema12.length === 0 || ema26.length === 0) {
    return { macdLine: null, signal: null, histogram: null };
  }
  // ema12 比 ema26 多 14 个点，需对齐
  const offset = ema12.length - ema26.length;
  const macdSeries: number[] = [];
  for (let i = 0; i < ema26.length; i++) {
    macdSeries.push(ema12[i + offset] - ema26[i]);
  }
  const signalSeries = calcEMA(macdSeries, 9);
  if (signalSeries.length === 0) {
    return { macdLine: macdSeries[macdSeries.length - 1] ?? null, signal: null, histogram: null };
  }
  const macdLine = macdSeries[macdSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  return { macdLine, signal, histogram: macdLine - signal };
}

// ── Bollinger Bands ────────────────────────────────────────────────────────────
function calcBollinger(closes: number[], period: number = 20, multiplier: number = 2): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
} {
  if (closes.length < period) return { upper: null, middle: null, lower: null };
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: sma + multiplier * stdDev,
    middle: sma,
    lower: sma - multiplier * stdDev,
  };
}

// ── ATR ────────────────────────────────────────────────────────────────────────
function calcATR(bars: OHLCVBar[], period: number = 14): number | null {
  if (bars.length < period + 1) return null;
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  // Wilder's smoothing
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}

// ── 主入口 ─────────────────────────────────────────────────────────────────────
/**
 * 从 OHLCV 数据计算所有技术指标
 * @param bars OHLCV 数组（按时间升序排列）
 */
export function computeIndicators(bars: OHLCVBar[]): IndicatorResult {
  if (!bars || bars.length === 0) {
    return {
      rsi14: null, macdLine: null, macdSignal: null, macdHistogram: null,
      ema20: null, ema50: null, sma20: null, sma50: null,
      bollingerUpper: null, bollingerMiddle: null, bollingerLower: null,
      atr14: null, lastClose: null, barCount: 0,
    };
  }

  const closes = bars.map(b => b.close);
  const lastClose = closes[closes.length - 1] ?? null;

  const rsi14 = calcRSI(closes, 14);

  const { macdLine, signal: macdSignal, histogram: macdHistogram } = calcMACD(closes);

  const ema20Series = calcEMA(closes, 20);
  const ema50Series = calcEMA(closes, 50);
  const ema20 = ema20Series.length > 0 ? ema20Series[ema20Series.length - 1] : null;
  const ema50 = ema50Series.length > 0 ? ema50Series[ema50Series.length - 1] : null;

  const sma20Series = calcSMA(closes, 20);
  const sma50Series = calcSMA(closes, 50);
  const sma20 = sma20Series.length > 0 ? sma20Series[sma20Series.length - 1] : null;
  const sma50 = sma50Series.length > 0 ? sma50Series[sma50Series.length - 1] : null;

  const { upper: bollingerUpper, middle: bollingerMiddle, lower: bollingerLower } = calcBollinger(closes, 20, 2);

  const atr14 = calcATR(bars, 14);

  return {
    rsi14: rsi14 !== null ? Math.round(rsi14 * 100) / 100 : null,
    macdLine: macdLine !== null ? Math.round(macdLine * 10000) / 10000 : null,
    macdSignal: macdSignal !== null ? Math.round(macdSignal * 10000) / 10000 : null,
    macdHistogram: macdHistogram !== null ? Math.round(macdHistogram * 10000) / 10000 : null,
    ema20: ema20 !== null ? Math.round(ema20 * 100) / 100 : null,
    ema50: ema50 !== null ? Math.round(ema50 * 100) / 100 : null,
    sma20: sma20 !== null ? Math.round(sma20 * 100) / 100 : null,
    sma50: sma50 !== null ? Math.round(sma50 * 100) / 100 : null,
    bollingerUpper: bollingerUpper !== null ? Math.round(bollingerUpper * 100) / 100 : null,
    bollingerMiddle: bollingerMiddle !== null ? Math.round(bollingerMiddle * 100) / 100 : null,
    bollingerLower: bollingerLower !== null ? Math.round(bollingerLower * 100) / 100 : null,
    atr14: atr14 !== null ? Math.round(atr14 * 10000) / 10000 : null,
    lastClose,
    barCount: bars.length,
  };
}

/**
 * 将指标结果格式化为 Markdown 字符串（用于注入 LLM prompt）
 */
export function formatIndicatorsMarkdown(ticker: string, result: IndicatorResult): string {
  if (result.barCount === 0) return `[技术指标] ${ticker}：数据不足，无法计算`;

  const fmt = (v: number | null, decimals = 2) => v !== null ? v.toFixed(decimals) : "N/A";

  return `## 技术指标（本地计算）— ${ticker}

| 指标 | 值 |
|------|-----|
| 最新收盘价 | ${fmt(result.lastClose)} |
| RSI (14) | ${fmt(result.rsi14)} |
| MACD Line | ${fmt(result.macdLine, 4)} |
| MACD Signal | ${fmt(result.macdSignal, 4)} |
| MACD Histogram | ${fmt(result.macdHistogram, 4)} |
| EMA 20 | ${fmt(result.ema20)} |
| EMA 50 | ${fmt(result.ema50)} |
| SMA 20 | ${fmt(result.sma20)} |
| SMA 50 | ${fmt(result.sma50)} |
| Bollinger Upper | ${fmt(result.bollingerUpper)} |
| Bollinger Middle | ${fmt(result.bollingerMiddle)} |
| Bollinger Lower | ${fmt(result.bollingerLower)} |
| ATR (14) | ${fmt(result.atr14, 4)} |

_数据点数量：${result.barCount} 根 K 线（本地计算，无外部指标 API）_`;
}
