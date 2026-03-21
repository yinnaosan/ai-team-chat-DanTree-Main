/**
 * Tiingo API Integration
 * 提供股票/ETF 实时估值倍数、历史 OHLCV 价格、季度财务报表
 * 文档：https://api.tiingo.com/documentation/general/overview
 */

import { ENV } from "./_core/env";

const BASE_URL = "https://api.tiingo.com";
const TIMEOUT_MS = 12000;

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface TiingoFundamentals {
  date: string;
  marketCap: number | null;
  enterpriseVal: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  trailingPEG1Y: number | null;
}

export interface TiingoPriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

export interface TiingoStatementItem {
  dataCode: string;
  value: number | null;
}

export interface TiingoStatement {
  date: string;
  year: number;
  quarter: number;
  statementData: {
    incomeStatement?: TiingoStatementItem[];
    balanceSheet?: TiingoStatementItem[];
    cashFlow?: TiingoStatementItem[];
    overview?: TiingoStatementItem[];
  };
}

export interface TiingoData {
  ticker: string;
  name: string;
  description: string;
  exchangeCode: string;
  startDate: string;
  endDate: string;
  fundamentals: TiingoFundamentals | null;
  recentPrices: TiingoPriceBar[];
  quarterlyStatements: TiingoStatement[];
  source: "Tiingo";
  fetchedAt: number;
}

// ─── 内部工具 ────────────────────────────────────────────────────────────────

function tiingoFetch(path: string): Promise<Response> {
  const key = ENV.TIINGO_API_KEY || "b30264579ed635263c7fc43d27475699522cca44";
  if (!key) throw new Error("TIINGO_API_KEY not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  return fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── 核心获取函数 ─────────────────────────────────────────────────────────────

/**
 * 获取 Tiingo 综合数据：ticker 元信息 + 实时估值倍数 + 近 30 日价格 + 最近 4 季度财报
 */
export async function fetchTiingoData(ticker: string): Promise<TiingoData | null> {
  if (!ticker.trim()) return null;

  const key = ENV.TIINGO_API_KEY || "b30264579ed635263c7fc43d27475699522cca44";
  if (!key) {
    console.warn("[Tiingo] TIINGO_API_KEY not configured");
    return null;
  }

  const sym = ticker.toUpperCase().trim();
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
  const oneYearAgo = new Date(today.getTime() - 365 * 86400000);

  // 并行获取所有数据
  const [metaResult, priceResult, fundamentalsResult, statementsResult] = await Promise.allSettled([
    // 1. Ticker 元信息
    tiingoFetch(`/tiingo/daily/${sym}`).then(r => r.ok ? r.json() : null),

    // 2. 近 30 日历史价格
    tiingoFetch(
      `/tiingo/daily/${sym}/prices?startDate=${formatDate(thirtyDaysAgo)}&endDate=${formatDate(today)}&resampleFreq=daily`
    ).then(r => r.ok ? r.json() as Promise<TiingoPriceBar[]> : []),

    // 3. 实时估值倍数（最近 5 个交易日）
    tiingoFetch(
      `/tiingo/fundamentals/${sym}/daily?startDate=${formatDate(new Date(today.getTime() - 7 * 86400000))}`
    ).then(r => r.ok ? r.json() as Promise<TiingoFundamentals[]> : []),

    // 4. 最近 4 个季度财务报表
    tiingoFetch(
      `/tiingo/fundamentals/${sym}/statements?startDate=${formatDate(oneYearAgo)}&limit=4`
    ).then(r => r.ok ? r.json() as Promise<TiingoStatement[]> : []),
  ]);

  const meta = metaResult.status === "fulfilled" ? metaResult.value : null;
  const prices = priceResult.status === "fulfilled" ? (priceResult.value ?? []) : [];
  const fundamentalsList = fundamentalsResult.status === "fulfilled" ? (fundamentalsResult.value ?? []) : [];
  const statements = statementsResult.status === "fulfilled" ? (statementsResult.value ?? []) : [];

  if (metaResult.status === "rejected") {
    console.warn(`[Tiingo] Meta fetch failed for ${sym}:`, metaResult.reason);
  }
  if (priceResult.status === "rejected") {
    console.warn(`[Tiingo] Price fetch failed for ${sym}:`, priceResult.reason);
  }
  if (fundamentalsResult.status === "rejected") {
    console.warn(`[Tiingo] Fundamentals fetch failed for ${sym}:`, fundamentalsResult.reason);
  }
  if (statementsResult.status === "rejected") {
    console.warn(`[Tiingo] Statements fetch failed for ${sym}:`, statementsResult.reason);
  }

  // 如果所有数据都失败，返回 null
  if (!meta && prices.length === 0 && fundamentalsList.length === 0 && statements.length === 0) {
    return null;
  }

  // 取最新的估值倍数
  const latestFundamentals = Array.isArray(fundamentalsList) && fundamentalsList.length > 0
    ? fundamentalsList[fundamentalsList.length - 1]
    : null;

  return {
    ticker: sym,
    name: meta?.name ?? sym,
    description: meta?.description ?? "",
    exchangeCode: meta?.exchangeCode ?? "",
    startDate: meta?.startDate ?? "",
    endDate: meta?.endDate ?? "",
    fundamentals: latestFundamentals,
    recentPrices: Array.isArray(prices) ? prices : [],
    quarterlyStatements: Array.isArray(statements) ? statements : [],
    source: "Tiingo",
    fetchedAt: Date.now(),
  };
}

// ─── Markdown 格式化 ─────────────────────────────────────────────────────────

export function formatTiingoDataAsMarkdown(data: TiingoData): string {
  const lines: string[] = [];

  lines.push(`## Tiingo 财务数据 — ${data.ticker}`);
  if (data.name && data.name !== data.ticker) {
    lines.push(`> **${data.name}**（${data.exchangeCode}）| 数据来源：Tiingo | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}`);
  } else {
    lines.push(`> 数据来源：Tiingo | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}`);
  }
  lines.push("");

  // 1. 实时估值倍数
  if (data.fundamentals) {
    const f = data.fundamentals;
    const dateStr = f.date ? f.date.split("T")[0] : "最新";
    lines.push(`### 实时估值倍数（${dateStr}）`);
    lines.push("| 指标 | 数值 |");
    lines.push("|------|------|");

    if (f.marketCap !== null) {
      lines.push(`| 市值 | $${(f.marketCap / 1e9).toFixed(2)}B |`);
    }
    if (f.enterpriseVal !== null) {
      lines.push(`| 企业价值（EV） | $${(f.enterpriseVal / 1e9).toFixed(2)}B |`);
    }
    if (f.peRatio !== null) {
      lines.push(`| 市盈率（P/E） | ${f.peRatio.toFixed(2)}x |`);
    }
    if (f.pbRatio !== null) {
      lines.push(`| 市净率（P/B） | ${f.pbRatio.toFixed(2)}x |`);
    }
    if (f.trailingPEG1Y !== null) {
      lines.push(`| PEG 比率（1Y） | ${f.trailingPEG1Y.toFixed(3)} |`);
    }
    lines.push("");
  }

  // 2. 近期价格走势
  if (data.recentPrices.length > 0) {
    const recent = data.recentPrices.slice(-10);
    const latest = recent[recent.length - 1];
    const oldest = recent[0];
    const change = latest.close - oldest.close;
    const changePct = (change / oldest.close) * 100;

    lines.push(`### 近期价格走势（最近 ${data.recentPrices.length} 个交易日）`);
    lines.push(`> 最新收盘价：**$${latest.close.toFixed(2)}**（${latest.date.split("T")[0]}）| 10日涨跌：${change >= 0 ? "+" : ""}${changePct.toFixed(2)}%`);
    lines.push("");
    lines.push("| 日期 | 开盘 | 最高 | 最低 | 收盘 | 成交量 |");
    lines.push("|------|------|------|------|------|--------|");
    for (const bar of recent) {
      const dateStr = bar.date.split("T")[0];
      const vol = bar.volume ? `${(bar.volume / 1e6).toFixed(1)}M` : "N/A";
      lines.push(`| ${dateStr} | $${bar.open.toFixed(2)} | $${bar.high.toFixed(2)} | $${bar.low.toFixed(2)} | $${bar.close.toFixed(2)} | ${vol} |`);
    }
    lines.push("");
  }

  // 3. 季度财务报表
  if (data.quarterlyStatements.length > 0) {
    lines.push("### 季度财务摘要（最近 4 季度）");

    for (const stmt of data.quarterlyStatements.slice(0, 4)) {
      const qLabel = `FY${stmt.year} Q${stmt.quarter}（${stmt.date}）`;
      lines.push(`\n#### ${qLabel}`);

      // 损益表关键指标
      const is = stmt.statementData?.incomeStatement ?? [];
      const getVal = (code: string) => is.find(i => i.dataCode === code)?.value ?? null;

      const revenue = getVal("revenue");
      const grossProfit = getVal("grossProfit");
      const operatingIncome = getVal("operatingIncome");
      const netIncome = getVal("netIncome");
      const eps = getVal("eps") ?? getVal("epsBasic");

      const incomeRows: string[] = [];
      if (revenue !== null) incomeRows.push(`| 营业收入 | $${(revenue / 1e9).toFixed(2)}B |`);
      if (grossProfit !== null) incomeRows.push(`| 毛利润 | $${(grossProfit / 1e9).toFixed(2)}B |`);
      if (operatingIncome !== null) incomeRows.push(`| 营业利润 | $${(operatingIncome / 1e9).toFixed(2)}B |`);
      if (netIncome !== null) incomeRows.push(`| 净利润 | $${(netIncome / 1e9).toFixed(2)}B |`);
      if (eps !== null) incomeRows.push(`| EPS | $${eps.toFixed(3)} |`);

      if (incomeRows.length > 0) {
        lines.push("| 指标 | 数值 |");
        lines.push("|------|------|");
        lines.push(...incomeRows);
      }

      // 现金流关键指标
      const cf = stmt.statementData?.cashFlow ?? [];
      const getCfVal = (code: string) => cf.find(i => i.dataCode === code)?.value ?? null;
      const operatingCF = getCfVal("freeCashFlow") ?? getCfVal("netCashOps");
      const capex = getCfVal("capex");

      if (operatingCF !== null || capex !== null) {
        lines.push("");
        if (operatingCF !== null) lines.push(`- 自由现金流：$${(operatingCF / 1e9).toFixed(2)}B`);
        if (capex !== null) lines.push(`- 资本支出：$${(Math.abs(capex) / 1e9).toFixed(2)}B`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── 健康检测 ────────────────────────────────────────────────────────────────

export async function checkTiingoHealth(): Promise<boolean> {
  try {
    const res = await tiingoFetch("/tiingo/daily/AAPL");
    return res.ok;
  } catch {
    return false;
  }
}
