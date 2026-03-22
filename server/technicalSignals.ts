/**
 * technicalSignals.ts — 技术信号自动标注模块
 * 参考：AlgorithmicTrading（GitHub 评估资源）
 * 
 * 功能：
 * 1. 基于多指标组合，生成结构化买卖信号
 * 2. 检测经典形态（金叉/死叉、超买/超卖、趋势突破）
 * 3. 输出信号强度评分（0-100）和置信度
 * 4. 生成可直接插入分析报告的 Markdown 标注
 */

import type { LocalTechnicalIndicators } from "./localIndicators";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type SignalDirection = "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";

export interface TechnicalSignal {
  indicator: string;
  direction: SignalDirection;
  strength: number;     // 0-100，信号强度
  detail: string;       // 中文说明
  pattern?: string;     // 形态名称（如"金叉"、"死叉"）
}

export interface CrossoverEvent {
  type: "golden_cross" | "death_cross" | "macd_bullish_cross" | "macd_bearish_cross" | "stoch_bullish_cross" | "stoch_bearish_cross";
  label: string;
  description: string;
  barsAgo: number;      // 几根 K 线前发生
}

export interface TechnicalSignalReport {
  symbol: string;
  timestamp: string;
  overallScore: number;           // 综合评分 -100 到 +100（正=看涨，负=看跌）
  overallDirection: SignalDirection;
  confidence: number;             // 置信度 0-100（信号一致性越高越高）
  signals: TechnicalSignal[];
  crossovers: CrossoverEvent[];
  keyLevels: {
    support: number[];
    resistance: number[];
  };
  summary: string;                // 一句话总结
  detailedMarkdown: string;       // 完整 Markdown 报告
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function fmt(v: number, d = 2): string {
  return isNaN(v) ? "N/A" : v.toFixed(d);
}

function last(arr: number[]): number {
  return arr.length > 0 ? arr[0] : NaN; // arr[0] 是最新值（tail() 已反转）
}

function prev(arr: number[], n = 1): number {
  return arr.length > n ? arr[n] : NaN;
}

// 方向转文字
function directionLabel(d: SignalDirection): string {
  const map: Record<SignalDirection, string> = {
    strong_buy: "🟢🟢 强烈买入",
    buy: "🟢 买入",
    neutral: "⚪ 中性",
    sell: "🔴 卖出",
    strong_sell: "🔴🔴 强烈卖出",
  };
  return map[d];
}

// 综合评分转方向
function scoreToDirection(score: number): SignalDirection {
  if (score >= 60) return "strong_buy";
  if (score >= 20) return "buy";
  if (score <= -60) return "strong_sell";
  if (score <= -20) return "sell";
  return "neutral";
}

// ── 单指标信号生成 ─────────────────────────────────────────────────────────────

function analyzeRSI(data: LocalTechnicalIndicators): TechnicalSignal | null {
  if (data.rsi14.length < 2) return null;
  const current = last(data.rsi14);
  const previous = prev(data.rsi14);

  // 超卖反弹：RSI 从 <30 回升
  if (previous < 30 && current >= 30) {
    return { indicator: "RSI(14)", direction: "buy", strength: 75, detail: `RSI 从超卖区回升 ${fmt(previous)}→${fmt(current)}`, pattern: "超卖反弹" };
  }
  // 超买回落：RSI 从 >70 下降
  if (previous > 70 && current <= 70) {
    return { indicator: "RSI(14)", direction: "sell", strength: 75, detail: `RSI 从超买区回落 ${fmt(previous)}→${fmt(current)}`, pattern: "超买回落" };
  }
  // 深度超卖
  if (current < 20) {
    return { indicator: "RSI(14)", direction: "strong_buy", strength: 85, detail: `RSI 深度超卖 ${fmt(current)}（<20）`, pattern: "深度超卖" };
  }
  // 深度超买
  if (current > 80) {
    return { indicator: "RSI(14)", direction: "strong_sell", strength: 85, detail: `RSI 深度超买 ${fmt(current)}（>80）`, pattern: "深度超买" };
  }
  // 一般超卖
  if (current < 30) {
    return { indicator: "RSI(14)", direction: "buy", strength: 60, detail: `RSI 超卖区间 ${fmt(current)}（<30）` };
  }
  // 一般超买
  if (current > 70) {
    return { indicator: "RSI(14)", direction: "sell", strength: 60, detail: `RSI 超买区间 ${fmt(current)}（>70）` };
  }
  // 趋势判断
  const direction = current > 50 ? "buy" : "sell";
  return { indicator: "RSI(14)", direction, strength: 30, detail: `RSI ${fmt(current)}（${current > 50 ? "偏强" : "偏弱"}区间）` };
}

function analyzeMACD(data: LocalTechnicalIndicators): TechnicalSignal | null {
  if (data.macdLine.length < 2 || data.macdSignal.length < 2) return null;
  const macdCurrent = last(data.macdLine);
  const macdPrev = prev(data.macdLine);
  const sigCurrent = last(data.macdSignal);
  const sigPrev = prev(data.macdSignal);

  // 金叉：MACD 上穿信号线
  if (macdPrev <= sigPrev && macdCurrent > sigCurrent) {
    const strength = macdCurrent < 0 ? 85 : 70; // 零轴下方金叉更强
    return { indicator: "MACD", direction: "buy", strength, detail: `MACD 金叉（${fmt(macdCurrent, 4)} 上穿 ${fmt(sigCurrent, 4)}）`, pattern: "金叉" };
  }
  // 死叉：MACD 下穿信号线
  if (macdPrev >= sigPrev && macdCurrent < sigCurrent) {
    const strength = macdCurrent > 0 ? 85 : 70; // 零轴上方死叉更强
    return { indicator: "MACD", direction: "sell", strength, detail: `MACD 死叉（${fmt(macdCurrent, 4)} 下穿 ${fmt(sigCurrent, 4)}）`, pattern: "死叉" };
  }
  // 零轴上方持续看涨
  if (macdCurrent > 0 && macdCurrent > sigCurrent) {
    return { indicator: "MACD", direction: "buy", strength: 50, detail: `MACD 零轴上方（${fmt(macdCurrent, 4)}），多头持续` };
  }
  // 零轴下方持续看跌
  if (macdCurrent < 0 && macdCurrent < sigCurrent) {
    return { indicator: "MACD", direction: "sell", strength: 50, detail: `MACD 零轴下方（${fmt(macdCurrent, 4)}），空头持续` };
  }
  return { indicator: "MACD", direction: "neutral", strength: 20, detail: `MACD 信号不明确（${fmt(macdCurrent, 4)}）` };
}

function analyzeBollingerBands(data: LocalTechnicalIndicators): TechnicalSignal | null {
  if (data.bbUpper.length < 2 || data.bbLower.length < 2) return null;
  const price = data.priceData.current;
  const prevPrice = data.priceData.prev;
  const upper = last(data.bbUpper);
  const lower = last(data.bbLower);
  const middle = last(data.bbMiddle);
  const prevUpper = prev(data.bbUpper);
  const prevLower = prev(data.bbLower);

  // 突破上轨（可能超买或突破）
  if (prevPrice <= prevUpper && price > upper) {
    return { indicator: "布林带", direction: "sell", strength: 70, detail: `价格突破上轨（${fmt(price)} > ${fmt(upper)}）`, pattern: "上轨突破" };
  }
  // 跌破下轨（可能超卖或突破）
  if (prevPrice >= prevLower && price < lower) {
    return { indicator: "布林带", direction: "buy", strength: 70, detail: `价格跌破下轨（${fmt(price)} < ${fmt(lower)}）`, pattern: "下轨突破" };
  }
  // 价格在上轨附近
  if (price > upper * 0.99) {
    return { indicator: "布林带", direction: "sell", strength: 55, detail: `价格接近上轨（${fmt(price)} ≈ ${fmt(upper)}）` };
  }
  // 价格在下轨附近
  if (price < lower * 1.01) {
    return { indicator: "布林带", direction: "buy", strength: 55, detail: `价格接近下轨（${fmt(price)} ≈ ${fmt(lower)}）` };
  }
  // 中轨上下方
  const direction = price > middle ? "buy" : "sell";
  return { indicator: "布林带", direction, strength: 25, detail: `价格在中轨${price > middle ? "上方" : "下方"}（${fmt(price)} vs ${fmt(middle)}）` };
}

function analyzeMovingAverages(data: LocalTechnicalIndicators): TechnicalSignal | null {
  if (data.ema20.length < 2 || data.ema50.length < 2 || data.sma200.length < 2) return null;
  const ema20 = last(data.ema20);
  const ema50 = last(data.ema50);
  const sma200 = last(data.sma200);
  const prevEma20 = prev(data.ema20);
  const prevEma50 = prev(data.ema50);

  // 黄金交叉：EMA20 上穿 EMA50
  if (prevEma20 <= prevEma50 && ema20 > ema50) {
    return { indicator: "均线系统", direction: "strong_buy", strength: 80, detail: `EMA20 金叉 EMA50（${fmt(ema20)} > ${fmt(ema50)}）`, pattern: "EMA金叉" };
  }
  // 死亡交叉：EMA20 下穿 EMA50
  if (prevEma20 >= prevEma50 && ema20 < ema50) {
    return { indicator: "均线系统", direction: "strong_sell", strength: 80, detail: `EMA20 死叉 EMA50（${fmt(ema20)} < ${fmt(ema50)}）`, pattern: "EMA死叉" };
  }
  // 多头排列：EMA20 > EMA50 > SMA200
  if (ema20 > ema50 && ema50 > sma200) {
    return { indicator: "均线系统", direction: "buy", strength: 65, detail: `多头排列：EMA20(${fmt(ema20)}) > EMA50(${fmt(ema50)}) > SMA200(${fmt(sma200)})`, pattern: "多头排列" };
  }
  // 空头排列：EMA20 < EMA50 < SMA200
  if (ema20 < ema50 && ema50 < sma200) {
    return { indicator: "均线系统", direction: "sell", strength: 65, detail: `空头排列：EMA20(${fmt(ema20)}) < EMA50(${fmt(ema50)}) < SMA200(${fmt(sma200)})`, pattern: "空头排列" };
  }
  // 价格在 SMA200 上方
  const price = data.priceData.current;
  if (price > sma200) {
    return { indicator: "均线系统", direction: "buy", strength: 40, detail: `价格在 SMA200 上方（${fmt(price)} > ${fmt(sma200)}）` };
  }
  return { indicator: "均线系统", direction: "sell", strength: 40, detail: `价格在 SMA200 下方（${fmt(price)} < ${fmt(sma200)}）` };
}

function analyzeStochastic(data: LocalTechnicalIndicators): TechnicalSignal | null {
  if (data.stochK.length < 2 || data.stochD.length < 2) return null;
  const k = last(data.stochK);
  const d = last(data.stochD);
  const prevK = prev(data.stochK);
  const prevD = prev(data.stochD);

  // 超卖区金叉
  if (k < 20 && prevK <= prevD && k > d) {
    return { indicator: "Stochastic", direction: "strong_buy", strength: 80, detail: `超卖区 %K 金叉 %D（%K=${fmt(k)}）`, pattern: "超卖金叉" };
  }
  // 超买区死叉
  if (k > 80 && prevK >= prevD && k < d) {
    return { indicator: "Stochastic", direction: "strong_sell", strength: 80, detail: `超买区 %K 死叉 %D（%K=${fmt(k)}）`, pattern: "超买死叉" };
  }
  // 超卖
  if (k < 20) {
    return { indicator: "Stochastic", direction: "buy", strength: 60, detail: `Stochastic 超卖区（%K=${fmt(k)}）` };
  }
  // 超买
  if (k > 80) {
    return { indicator: "Stochastic", direction: "sell", strength: 60, detail: `Stochastic 超买区（%K=${fmt(k)}）` };
  }
  const direction = k > d ? "buy" : "sell";
  return { indicator: "Stochastic", direction, strength: 30, detail: `%K(${fmt(k)}) ${k > d ? ">" : "<"} %D(${fmt(d)})` };
}

function analyzeVWAP(data: LocalTechnicalIndicators): TechnicalSignal | null {
  if (data.vwapValues.length === 0) return null;
  const price = data.priceData.current;
  const vwap = last(data.vwapValues);
  const diff = ((price - vwap) / vwap) * 100;

  if (price > vwap * 1.02) {
    return { indicator: "VWAP", direction: "buy", strength: 55, detail: `价格显著高于 VWAP（+${fmt(diff, 1)}%）` };
  }
  if (price < vwap * 0.98) {
    return { indicator: "VWAP", direction: "sell", strength: 55, detail: `价格显著低于 VWAP（${fmt(diff, 1)}%）` };
  }
  const direction = price > vwap ? "buy" : "sell";
  return { indicator: "VWAP", direction, strength: 25, detail: `价格${price > vwap ? "高于" : "低于"} VWAP（${fmt(diff, 1)}%）` };
}

function analyzeCCI(data: LocalTechnicalIndicators): TechnicalSignal | null {
  if (data.cci20.length < 2) return null;
  const current = last(data.cci20);
  const previous = prev(data.cci20);

  if (previous < -100 && current >= -100) {
    return { indicator: "CCI(20)", direction: "buy", strength: 70, detail: `CCI 从超卖区回升 ${fmt(previous, 0)}→${fmt(current, 0)}`, pattern: "超卖回升" };
  }
  if (previous > 100 && current <= 100) {
    return { indicator: "CCI(20)", direction: "sell", strength: 70, detail: `CCI 从超买区回落 ${fmt(previous, 0)}→${fmt(current, 0)}`, pattern: "超买回落" };
  }
  if (current < -100) {
    return { indicator: "CCI(20)", direction: "buy", strength: 55, detail: `CCI 超卖区（${fmt(current, 0)}）` };
  }
  if (current > 100) {
    return { indicator: "CCI(20)", direction: "sell", strength: 55, detail: `CCI 超买区（${fmt(current, 0)}）` };
  }
  return { indicator: "CCI(20)", direction: "neutral", strength: 20, detail: `CCI 中性区间（${fmt(current, 0)}）` };
}

function analyzeWilliamsR(data: LocalTechnicalIndicators): TechnicalSignal | null {
  if (data.williamsRValues.length === 0) return null;
  const wr = last(data.williamsRValues);

  if (wr < -80) {
    return { indicator: "Williams %R", direction: "buy", strength: 60, detail: `Williams %R 超卖（${fmt(wr, 1)}）` };
  }
  if (wr > -20) {
    return { indicator: "Williams %R", direction: "sell", strength: 60, detail: `Williams %R 超买（${fmt(wr, 1)}）` };
  }
  const direction = wr > -50 ? "sell" : "buy";
  return { indicator: "Williams %R", direction, strength: 25, detail: `Williams %R ${fmt(wr, 1)}（中性区间）` };
}

// ── 交叉事件检测 ──────────────────────────────────────────────────────────────

function detectCrossovers(data: LocalTechnicalIndicators): CrossoverEvent[] {
  const events: CrossoverEvent[] = [];

  // EMA20 / EMA50 交叉（检测最近 5 根）
  const lookback = Math.min(5, data.ema20.length - 1, data.ema50.length - 1);
  for (let i = 0; i < lookback; i++) {
    const curr20 = data.ema20[i];
    const prev20 = data.ema20[i + 1];
    const curr50 = data.ema50[i];
    const prev50 = data.ema50[i + 1];
    if (prev20 <= prev50 && curr20 > curr50) {
      events.push({ type: "golden_cross", label: "EMA 金叉", description: `EMA20 上穿 EMA50（${i === 0 ? "今日" : `${i}根K线前`}）`, barsAgo: i });
      break;
    }
    if (prev20 >= prev50 && curr20 < curr50) {
      events.push({ type: "death_cross", label: "EMA 死叉", description: `EMA20 下穿 EMA50（${i === 0 ? "今日" : `${i}根K线前`}）`, barsAgo: i });
      break;
    }
  }

  // MACD 交叉（检测最近 5 根）
  const macdLookback = Math.min(5, data.macdLine.length - 1, data.macdSignal.length - 1);
  for (let i = 0; i < macdLookback; i++) {
    const currM = data.macdLine[i];
    const prevM = data.macdLine[i + 1];
    const currS = data.macdSignal[i];
    const prevS = data.macdSignal[i + 1];
    if (prevM <= prevS && currM > currS) {
      events.push({ type: "macd_bullish_cross", label: "MACD 金叉", description: `MACD 上穿信号线（${i === 0 ? "今日" : `${i}根K线前`}）`, barsAgo: i });
      break;
    }
    if (prevM >= prevS && currM < currS) {
      events.push({ type: "macd_bearish_cross", label: "MACD 死叉", description: `MACD 下穿信号线（${i === 0 ? "今日" : `${i}根K线前`}）`, barsAgo: i });
      break;
    }
  }

  // Stochastic 交叉（检测最近 3 根）
  const stochLookback = Math.min(3, data.stochK.length - 1, data.stochD.length - 1);
  for (let i = 0; i < stochLookback; i++) {
    const currK = data.stochK[i];
    const prevK = data.stochK[i + 1];
    const currD = data.stochD[i];
    const prevD = data.stochD[i + 1];
    if (prevK <= prevD && currK > currD && currK < 30) {
      events.push({ type: "stoch_bullish_cross", label: "Stoch 超卖金叉", description: `%K 在超卖区上穿 %D（${i === 0 ? "今日" : `${i}根K线前`}）`, barsAgo: i });
      break;
    }
    if (prevK >= prevD && currK < currD && currK > 70) {
      events.push({ type: "stoch_bearish_cross", label: "Stoch 超买死叉", description: `%K 在超买区下穿 %D（${i === 0 ? "今日" : `${i}根K线前`}）`, barsAgo: i });
      break;
    }
  }

  return events;
}

// ── 关键价位识别 ──────────────────────────────────────────────────────────────

function detectKeyLevels(data: LocalTechnicalIndicators): { support: number[]; resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];
  const price = data.priceData.current;

  // 布林带支撑/阻力
  if (data.bbLower.length > 0) support.push(parseFloat(last(data.bbLower).toFixed(2)));
  if (data.bbUpper.length > 0) resistance.push(parseFloat(last(data.bbUpper).toFixed(2)));
  if (data.bbMiddle.length > 0) {
    const mid = last(data.bbMiddle);
    if (mid < price) support.push(parseFloat(mid.toFixed(2)));
    else resistance.push(parseFloat(mid.toFixed(2)));
  }

  // 均线支撑/阻力
  const maLevels = [
    { val: last(data.ema20), name: "EMA20" },
    { val: last(data.ema50), name: "EMA50" },
    { val: last(data.sma200), name: "SMA200" },
  ];
  for (const { val } of maLevels) {
    if (!isNaN(val)) {
      if (val < price) support.push(parseFloat(val.toFixed(2)));
      else resistance.push(parseFloat(val.toFixed(2)));
    }
  }

  // VWAP
  if (data.vwapValues.length > 0) {
    const vwap = last(data.vwapValues);
    if (!isNaN(vwap)) {
      if (vwap < price) support.push(parseFloat(vwap.toFixed(2)));
      else resistance.push(parseFloat(vwap.toFixed(2)));
    }
  }

  // 去重并排序
  const uniqueSupport = Array.from(new Set(support)).sort((a, b) => b - a).slice(0, 3);
  const uniqueResistance = Array.from(new Set(resistance)).sort((a, b) => a - b).slice(0, 3);

  return { support: uniqueSupport, resistance: uniqueResistance };
}

// ── 综合评分计算 ──────────────────────────────────────────────────────────────

function calculateOverallScore(signals: TechnicalSignal[]): { score: number; confidence: number } {
  if (signals.length === 0) return { score: 0, confidence: 0 };

  const directionWeights: Record<SignalDirection, number> = {
    strong_buy: 1,
    buy: 0.5,
    neutral: 0,
    sell: -0.5,
    strong_sell: -1,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    const weight = signal.strength / 100;
    weightedSum += directionWeights[signal.direction] * weight;
    totalWeight += weight;
  }

  const rawScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;

  // 置信度 = 信号一致性（同方向信号越多，置信度越高）
  const bullCount = signals.filter(s => s.direction === "buy" || s.direction === "strong_buy").length;
  const bearCount = signals.filter(s => s.direction === "sell" || s.direction === "strong_sell").length;
  const totalDirectional = bullCount + bearCount;
  const maxCount = Math.max(bullCount, bearCount);
  const confidence = totalDirectional > 0 ? Math.round((maxCount / totalDirectional) * 100) : 50;

  return { score: Math.round(rawScore), confidence };
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

export function generateTechnicalSignalReport(data: LocalTechnicalIndicators): TechnicalSignalReport {
  // 收集所有信号
  const rawSignals = [
    analyzeRSI(data),
    analyzeMACD(data),
    analyzeBollingerBands(data),
    analyzeMovingAverages(data),
    analyzeStochastic(data),
    analyzeVWAP(data),
    analyzeCCI(data),
    analyzeWilliamsR(data),
  ].filter((s): s is TechnicalSignal => s !== null);

  const crossovers = detectCrossovers(data);
  const keyLevels = detectKeyLevels(data);
  const { score, confidence } = calculateOverallScore(rawSignals);
  const overallDirection = scoreToDirection(score);

  // 一句话总结
  const bullCount = rawSignals.filter(s => s.direction === "buy" || s.direction === "strong_buy").length;
  const bearCount = rawSignals.filter(s => s.direction === "sell" || s.direction === "strong_sell").length;
  const crossoverSummary = crossovers.length > 0
    ? `，近期出现 ${crossovers.map(c => c.label).join("、")}`
    : "";
  const summary = `${data.symbol} 技术面${directionLabel(overallDirection)}（${bullCount} 多/${bearCount} 空，置信度 ${confidence}%）${crossoverSummary}`;

  // 生成详细 Markdown
  const detailedMarkdown = buildDetailedMarkdown(data, rawSignals, crossovers, keyLevels, score, confidence, overallDirection);

  return {
    symbol: data.symbol,
    timestamp: new Date().toISOString(),
    overallScore: score,
    overallDirection,
    confidence,
    signals: rawSignals,
    crossovers,
    keyLevels,
    summary,
    detailedMarkdown,
  };
}

// ── Markdown 报告生成 ─────────────────────────────────────────────────────────

function buildDetailedMarkdown(
  data: LocalTechnicalIndicators,
  signals: TechnicalSignal[],
  crossovers: CrossoverEvent[],
  keyLevels: { support: number[]; resistance: number[] },
  score: number,
  confidence: number,
  direction: SignalDirection,
): string {
  const lines: string[] = [];
  const price = data.priceData.current;
  const change = data.priceData.changePct;

  lines.push(`## 技术信号自动标注 — ${data.symbol}`);
  lines.push(`> 当前价格：**${fmt(price)}**（${change >= 0 ? "+" : ""}${fmt(change, 2)}%）| 综合信号：**${directionLabel(direction)}** | 评分：${score > 0 ? "+" : ""}${score}/100 | 置信度：${confidence}%\n`);

  // 交叉事件（最重要，放最前）
  if (crossovers.length > 0) {
    lines.push(`### ⚡ 近期交叉事件`);
    for (const c of crossovers) {
      const icon = c.type.includes("bullish") || c.type === "golden_cross" ? "🟢" : "🔴";
      lines.push(`- ${icon} **${c.label}**：${c.description}`);
    }
    lines.push("");
  }

  // 信号汇总表
  lines.push(`### 📊 多指标信号汇总`);
  lines.push(`| 指标 | 方向 | 强度 | 说明 |`);
  lines.push(`|------|------|------|------|`);
  for (const s of signals) {
    const dirIcon = s.direction === "strong_buy" ? "🟢🟢"
      : s.direction === "buy" ? "🟢"
      : s.direction === "sell" ? "🔴"
      : s.direction === "strong_sell" ? "🔴🔴"
      : "⚪";
    const patternStr = s.pattern ? ` (${s.pattern})` : "";
    lines.push(`| ${s.indicator} | ${dirIcon} | ${s.strength}% | ${s.detail}${patternStr} |`);
  }
  lines.push("");

  // 关键价位
  if (keyLevels.support.length > 0 || keyLevels.resistance.length > 0) {
    lines.push(`### 🎯 关键价位`);
    if (keyLevels.resistance.length > 0) {
      lines.push(`- **阻力位**：${keyLevels.resistance.map(v => `$${fmt(v)}`).join(" → ")}`);
    }
    if (keyLevels.support.length > 0) {
      lines.push(`- **支撑位**：${keyLevels.support.map(v => `$${fmt(v)}`).join(" → ")}`);
    }
    lines.push("");
  }

  // 综合结论
  const bullSignals = signals.filter(s => s.direction === "buy" || s.direction === "strong_buy");
  const bearSignals = signals.filter(s => s.direction === "sell" || s.direction === "strong_sell");
  const strongPatterns = signals.filter(s => s.pattern).map(s => s.pattern!);

  lines.push(`### 📝 综合结论`);
  lines.push(`> **${directionLabel(direction)}**（评分 ${score > 0 ? "+" : ""}${score}，置信度 ${confidence}%）`);
  if (bullSignals.length > 0) {
    lines.push(`> 看涨依据：${bullSignals.map(s => s.indicator).join("、")}`);
  }
  if (bearSignals.length > 0) {
    lines.push(`> 看跌依据：${bearSignals.map(s => s.indicator).join("、")}`);
  }
  if (strongPatterns.length > 0) {
    lines.push(`> 识别形态：${strongPatterns.join("、")}`);
  }

  return lines.join("\n");
}

// ── 简版速览（用于插入分析报告）─────────────────────────────────────────────

export function generateSignalBadge(data: LocalTechnicalIndicators): string {
  const report = generateTechnicalSignalReport(data);
  const scoreStr = report.overallScore > 0 ? `+${report.overallScore}` : `${report.overallScore}`;
  return `**技术信号**：${directionLabel(report.overallDirection)} | 评分 ${scoreStr}/100 | 置信度 ${report.confidence}%`;
}
