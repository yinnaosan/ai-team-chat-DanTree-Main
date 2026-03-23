/**
 * Twelve Data API — 实时行情 / 历史 OHLCV / 技术指标
 * 免费层：800 次/天，8 次/分钟
 * 文档：https://twelvedata.com/docs
 *
 * 主要用途：
 * 1. 作为 Yahoo Finance 的备用数据源（当 YF 返回 404 时）
 * 2. 提供更精确的技术指标（RSI/MACD/EMA/SMA/布林带）
 * 3. 支持全球 5000+ 股票、外汇、加密货币、ETF
 */

import { ENV } from "./_core/env.js";

const BASE_URL = "https://api.twelvedata.com";
const API_KEY = ENV.TWELVE_DATA_API_KEY ?? process.env.TWELVE_DATA_API_KEY ?? "";

// ── 类型定义 ────────────────────────────────────────────────────────────────

export interface TwelveDataQuote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  previous_close: string;
  change: string;
  percent_change: string;
  fifty_two_week: {
    low: string;
    high: string;
    low_change: string;
    high_change: string;
    low_change_percent: string;
    high_change_percent: string;
    range: string;
  };
  is_market_open: boolean;
}

export interface TwelveDataTimeSeries {
  meta: {
    symbol: string;
    interval: string;
    currency: string;
    exchange_timezone: string;
    exchange: string;
    type: string;
  };
  values: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
  status: string;
}

export interface TwelveDataIndicator {
  meta: {
    symbol: string;
    interval: string;
    indicator: { name: string };
  };
  values: Array<{
    datetime: string;
    [key: string]: string;
  }>;
  status: string;
}

// ── 核心请求函数 ──────────────────────────────────────────────────────────────

async function fetchTwelveData(endpoint: string, params: Record<string, string>): Promise<unknown> {
  if (!API_KEY) {
    throw new Error("TWELVE_DATA_API_KEY not configured");
  }
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("apikey", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Twelve Data API error: ${res.status} ${res.statusText}`);
  const data = await res.json() as Record<string, unknown>;
  if (data.status === "error" || data.code) {
    throw new Error(`Twelve Data API: ${data.message ?? JSON.stringify(data)}`);
  }
  return data;
}

// ── 实时报价 ──────────────────────────────────────────────────────────────────

export async function getTwelveDataQuote(symbol: string): Promise<TwelveDataQuote> {
  const data = await fetchTwelveData("quote", { symbol, outputsize: "1" });
  return data as TwelveDataQuote;
}

// ── 历史 OHLCV（日线）────────────────────────────────────────────────────────

export async function getTwelveDataTimeSeries(
  symbol: string,
  outputsize = "90"
): Promise<TwelveDataTimeSeries> {
  const data = await fetchTwelveData("time_series", {
    symbol,
    interval: "1day",
    outputsize,
  });
  return data as TwelveDataTimeSeries;
}

// ── 技术指标 ──────────────────────────────────────────────────────────────────

export async function getTwelveDataRSI(symbol: string, period = "14"): Promise<TwelveDataIndicator> {
  const data = await fetchTwelveData("rsi", { symbol, interval: "1day", time_period: period, outputsize: "1" });
  return data as TwelveDataIndicator;
}

export async function getTwelveDataMACD(symbol: string): Promise<TwelveDataIndicator> {
  const data = await fetchTwelveData("macd", { symbol, interval: "1day", outputsize: "1" });
  return data as TwelveDataIndicator;
}

export async function getTwelveDataBBands(symbol: string): Promise<TwelveDataIndicator> {
  const data = await fetchTwelveData("bbands", { symbol, interval: "1day", outputsize: "1" });
  return data as TwelveDataIndicator;
}

// ── 综合分析数据（供 Step2 使用）────────────────────────────────────────────

export async function getTwelveDataAnalysis(symbol: string): Promise<string> {
  if (!API_KEY) {
    return `[twelve_data] TWELVE_DATA_API_KEY 未配置，跳过`;
  }

  try {
    // 并行获取报价 + RSI + MACD
    const [quoteResult, rsiResult, macdResult] = await Promise.allSettled([
      getTwelveDataQuote(symbol),
      getTwelveDataRSI(symbol),
      getTwelveDataMACD(symbol),
    ]);

    const lines: string[] = [`## Twelve Data — ${symbol}`];

    // 报价
    if (quoteResult.status === "fulfilled") {
      const q = quoteResult.value;
      const isOpen = q.is_market_open ? "（市场开盘中）" : "（市场已收盘）";
      lines.push(`\n### 实时报价 ${isOpen}`);
      lines.push(`| 指标 | 数值 |`);
      lines.push(`| --- | --- |`);
      lines.push(`| 最新价 | ${q.currency} ${parseFloat(q.close).toFixed(2)} |`);
      lines.push(`| 涨跌额 | ${parseFloat(q.change) >= 0 ? "+" : ""}${parseFloat(q.change).toFixed(2)} |`);
      lines.push(`| 涨跌幅 | ${parseFloat(q.percent_change) >= 0 ? "+" : ""}${parseFloat(q.percent_change).toFixed(2)}% |`);
      lines.push(`| 今日开盘 | ${parseFloat(q.open).toFixed(2)} |`);
      lines.push(`| 今日最高 | ${parseFloat(q.high).toFixed(2)} |`);
      lines.push(`| 今日最低 | ${parseFloat(q.low).toFixed(2)} |`);
      lines.push(`| 前收盘价 | ${parseFloat(q.previous_close).toFixed(2)} |`);
      lines.push(`| 52周高 | ${parseFloat(q.fifty_two_week.high).toFixed(2)} |`);
      lines.push(`| 52周低 | ${parseFloat(q.fifty_two_week.low).toFixed(2)} |`);
      lines.push(`| 交易所 | ${q.exchange} | 数据时间 | ${q.datetime} |`);
    } else {
      lines.push(`\n报价获取失败: ${quoteResult.reason}`);
    }

    // RSI
    if (rsiResult.status === "fulfilled" && rsiResult.value.values?.length) {
      const rsi = parseFloat(rsiResult.value.values[0].rsi ?? "0");
      const rsiLabel = rsi > 70 ? "超买" : rsi < 30 ? "超卖" : "中性";
      lines.push(`\n### 技术指标（日线）`);
      lines.push(`| 指标 | 数值 | 信号 |`);
      lines.push(`| --- | --- | --- |`);
      lines.push(`| RSI(14) | ${rsi.toFixed(2)} | ${rsiLabel} |`);

      // MACD
      if (macdResult.status === "fulfilled" && macdResult.value.values?.length) {
        const m = macdResult.value.values[0];
        const macdVal = parseFloat(m.macd ?? "0");
        const signal = parseFloat(m.macd_signal ?? "0");
        const hist = parseFloat(m.macd_hist ?? "0");
        const macdSignal = hist > 0 ? "金叉（多头）" : "死叉（空头）";
        lines.push(`| MACD | ${macdVal.toFixed(4)} | ${macdSignal} |`);
        lines.push(`| MACD Signal | ${signal.toFixed(4)} | — |`);
        lines.push(`| MACD Hist | ${hist.toFixed(4)} | — |`);
      }
    }

    return lines.join("\n");
  } catch (err) {
    return `[twelve_data] ${symbol} 数据获取失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── 健康检测 ──────────────────────────────────────────────────────────────────

export async function checkTwelveDataHealth(): Promise<{ ok: boolean; status: "ok" | "degraded" | "error" | "not_configured"; message: string; latencyMs: number }> {
  const t0 = Date.now();
  if (!API_KEY) {
    return { ok: false, status: "not_configured", latencyMs: 0, message: "API Key 未配置（TWELVE_DATA_API_KEY）" };
  }
  try {
    const data = await fetchTwelveData("quote", { symbol: "AAPL" }) as TwelveDataQuote;
    const latencyMs = Date.now() - t0;
    if (data.close) {
      return { ok: true, status: "ok", latencyMs, message: `AAPL 报价: $${parseFloat(data.close).toFixed(2)}` };
    }
    return { ok: false, status: "degraded", latencyMs, message: "返回数据格式异常" };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("rate limit") || msg.includes("429") || msg.includes("quota")) {
      return { ok: false, status: "degraded", latencyMs, message: `限流: ${msg}` };
    }
    return { ok: false, status: "error", latencyMs, message: msg };
  }
}

export function isTwelveDataConfigured(): boolean {
  return !!API_KEY;
}
