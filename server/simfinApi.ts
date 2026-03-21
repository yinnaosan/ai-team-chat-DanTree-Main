/**
 * SimFin API Integration
 * 财务报表（损益表/资产负债表/现金流量表）+ 衍生指标（估值/利润率/FCF）+ 股价历史
 * API v3 — 需要 SIMFIN_API_KEY
 * 文档：https://simfin.com/api/v3/documentation
 */

import { ENV } from "./_core/env";

const SIMFIN_BASE = "https://backend.simfin.com/api/v3";

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface SimFinIncomeStatement {
  fiscalPeriod: string;
  fiscalYear: number;
  reportDate: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  pretaxIncome: number | null;
  netIncome: number | null;
  ebitda: number | null;
  eps: number | null;
  epsDiluted: number | null;
}

export interface SimFinBalanceSheet {
  fiscalPeriod: string;
  fiscalYear: number;
  reportDate: string;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  cash: number | null;
  totalDebt: number | null;
  currentRatio: number | null;
}

export interface SimFinDerivedMetrics {
  fiscalPeriod: string;
  fiscalYear: number;
  reportDate: string;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  roic: number | null;
  freeCashFlow: number | null;
  fcfPerShare: number | null;
  netDebtToEbitda: number | null;
  debtRatio: number | null;
  piotroskiFScore: number | null;
}

export interface SimFinPricePoint {
  date: string;
  close: number;
  adjustedClose: number;
  high: number;
  low: number;
  open: number;
  sharesOutstanding: number | null;
}

export interface SimFinQuarterlyIncome {
  fiscalPeriod: string; // Q1/Q2/Q3/Q4
  fiscalYear: number;
  reportDate: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  epsDiluted: number | null;
}

export interface SimFinData {
  ticker: string;
  companyName: string;
  currency: string;
  incomeStatement: SimFinIncomeStatement | null;
  balanceSheet: SimFinBalanceSheet | null;
  derivedMetrics: SimFinDerivedMetrics | null;
  recentPrices: SimFinPricePoint[];
  quarterlyIncome: SimFinQuarterlyIncome[]; // 最近 4 季度
  source: string;
  fetchedAt: number;
}

// ─── 内部工具 ────────────────────────────────────────────────────────────────

function simfinHeaders(): HeadersInit {
  return {
    Authorization: `api-key ${ENV.SIMFIN_API_KEY}`,
    Accept: "application/json",
  };
}

async function simfinFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${SIMFIN_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url.toString(), {
      headers: simfinHeaders(),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`SimFin ${path} failed: ${res.status} ${err.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 将 compact 格式（columns + data 数组）转为对象数组 */
function compactToObjects(columns: string[], dataRows: unknown[][]): Record<string, unknown>[] {
  return dataRows.map(row =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );
}

// ─── 数据获取函数 ─────────────────────────────────────────────────────────────

/**
 * 获取损益表（最近一个完整财年）
 */
async function fetchIncomeStatement(ticker: string): Promise<SimFinIncomeStatement | null> {
  try {
    const raw = await simfinFetch("/companies/statements/compact", {
      ticker,
      statements: "pl",
      period: "FY",
    }) as Array<{ statements: Array<{ columns: string[]; data: unknown[][] }> }>;

    const stmt = raw?.[0]?.statements?.[0];
    if (!stmt?.data?.length) return null;

    // 取最新一行（最后一条，按年份排序）
    const rows = compactToObjects(stmt.columns, stmt.data);
    const latest = rows.sort((a, b) => (b["Fiscal Year"] as number) - (a["Fiscal Year"] as number))[0];

    return {
      fiscalPeriod: String(latest["Fiscal Period"] ?? "FY"),
      fiscalYear: Number(latest["Fiscal Year"] ?? 0),
      reportDate: String(latest["Report Date"] ?? ""),
      revenue: (latest["Revenue"] as number | null) ?? null,
      grossProfit: (latest["Gross Profit"] as number | null) ?? null,
      operatingIncome: (latest["Operating Income (Loss)"] as number | null) ?? null,
      pretaxIncome: (latest["Pretax Income (Loss)"] as number | null) ?? null,
      netIncome: (latest["Net Income"] as number | null) ?? null,
      ebitda: null, // EBITDA 在 derived 中
      eps: (latest["Earnings Per Share, Basic"] as number | null) ?? null,
      epsDiluted: (latest["Earnings Per Share, Diluted"] as number | null) ?? null,
    };
  } catch (err) {
    console.warn("[SimFin] Income statement fetch failed:", (err as Error).message);
    return null;
  }
}

/**
 * 获取资产负债表（最近一个完整财年）
 */
async function fetchBalanceSheet(ticker: string): Promise<SimFinBalanceSheet | null> {
  try {
    const raw = await simfinFetch("/companies/statements/compact", {
      ticker,
      statements: "bs",
      period: "FY",
    }) as Array<{ statements: Array<{ columns: string[]; data: unknown[][] }> }>;

    const stmt = raw?.[0]?.statements?.[0];
    if (!stmt?.data?.length) return null;

    const rows = compactToObjects(stmt.columns, stmt.data);
    const latest = rows.sort((a, b) => (b["Fiscal Year"] as number) - (a["Fiscal Year"] as number))[0];

    return {
      fiscalPeriod: String(latest["Fiscal Period"] ?? "FY"),
      fiscalYear: Number(latest["Fiscal Year"] ?? 0),
      reportDate: String(latest["Report Date"] ?? ""),
      totalAssets: (latest["Total Assets"] as number | null) ?? null,
      totalLiabilities: (latest["Total Liabilities"] as number | null) ?? null,
      totalEquity: (latest["Total Equity"] as number | null) ?? null,
      cash: (latest["Cash, Cash Equivalents & Short Term Investments"] as number | null) ?? null,
      totalDebt: (latest["Total Debt"] as number | null) ?? null,
      currentRatio: (latest["Current Ratio"] as number | null) ?? null,
    };
  } catch (err) {
    console.warn("[SimFin] Balance sheet fetch failed:", (err as Error).message);
    return null;
  }
}

/**
 * 获取衍生指标（估值/利润率/FCF/Piotroski）
 */
async function fetchDerivedMetrics(ticker: string): Promise<SimFinDerivedMetrics | null> {
  try {
    const raw = await simfinFetch("/companies/statements/compact", {
      ticker,
      statements: "derived",
      period: "FY",
    }) as Array<{ statements: Array<{ columns: string[]; data: unknown[][] }> }>;

    const stmt = raw?.[0]?.statements?.[0];
    if (!stmt?.data?.length) return null;

    const rows = compactToObjects(stmt.columns, stmt.data);
    const latest = rows.sort((a, b) => (b["Fiscal Year"] as number) - (a["Fiscal Year"] as number))[0];

    return {
      fiscalPeriod: String(latest["Fiscal Period"] ?? "FY"),
      fiscalYear: Number(latest["Fiscal Year"] ?? 0),
      reportDate: String(latest["Report Date"] ?? ""),
      grossMargin: (latest["Gross Profit Margin"] as number | null) ?? null,
      operatingMargin: (latest["Operating Margin"] as number | null) ?? null,
      netMargin: (latest["Net Profit Margin"] as number | null) ?? null,
      roe: (latest["Return on Equity"] as number | null) ?? null,
      roa: (latest["Return on Assets"] as number | null) ?? null,
      roic: (latest["Return On Invested Capital"] as number | null) ?? null,
      freeCashFlow: (latest["Free Cash Flow"] as number | null) ?? null,
      fcfPerShare: (latest["Free Cash Flow Per Share"] as number | null) ?? null,
      netDebtToEbitda: (latest["Net Debt / EBITDA"] as number | null) ?? null,
      debtRatio: (latest["Debt Ratio"] as number | null) ?? null,
      piotroskiFScore: (latest["Piotroski F-Score"] as number | null) ?? null,
    };
  } catch (err) {
    console.warn("[SimFin] Derived metrics fetch failed:", (err as Error).message);
    return null;
  }
}

/**
 * 获取近 90 天股价历史
 */
async function fetchRecentPrices(ticker: string): Promise<SimFinPricePoint[]> {
  try {
    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const start = startDate.toISOString().slice(0, 10);

    const raw = await simfinFetch("/companies/prices/compact", {
      ticker,
      start,
      end,
    }) as Array<{ columns: string[]; data: unknown[][] }>;

    const result = raw?.[0];
    if (!result?.data?.length) return [];

    const rows = compactToObjects(result.columns, result.data);
    // 取最近 30 个交易日（避免数据过多）
    return rows.slice(-30).map(row => ({
      date: String(row["Date"] ?? ""),
      close: Number(row["Last Closing Price"] ?? 0),
      adjustedClose: Number(row["Adjusted Closing Price"] ?? 0),
      high: Number(row["Highest Price"] ?? 0),
      low: Number(row["Lowest Price"] ?? 0),
      open: Number(row["Opening Price"] ?? 0),
      sharesOutstanding: (row["Common Shares Outstanding"] as number | null) ?? null,
    }));
  } catch (err) {
    console.warn("[SimFin] Prices fetch failed:", (err as Error).message);
    return [];
  }
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

/**
 * 获取季度损益表（最近 4 个季度）
 */
async function fetchQuarterlyIncome(ticker: string): Promise<SimFinQuarterlyIncome[]> {
  try {
    const raw = await simfinFetch("/companies/statements/compact", {
      ticker,
      statements: "pl",
      period: "quarters",
    }) as Array<{ statements: Array<{ columns: string[]; data: unknown[][] }> }>;

    const stmt = raw?.[0]?.statements?.[0];
    if (!stmt?.data?.length) return [];

    const rows = compactToObjects(stmt.columns, stmt.data);
    // 按年份+季度降序排列，取最近 4 个
    const sorted = rows.sort((a, b) => {
      const yearDiff = (b["Fiscal Year"] as number) - (a["Fiscal Year"] as number);
      if (yearDiff !== 0) return yearDiff;
      const pA = String(a["Fiscal Period"] ?? "").replace("Q", "");
      const pB = String(b["Fiscal Period"] ?? "").replace("Q", "");
      return Number(pB) - Number(pA);
    }).slice(0, 4);

    return sorted.map(row => ({
      fiscalPeriod: String(row["Fiscal Period"] ?? ""),
      fiscalYear: Number(row["Fiscal Year"] ?? 0),
      reportDate: String(row["Report Date"] ?? ""),
      revenue: (row["Revenue"] as number | null) ?? null,
      grossProfit: (row["Gross Profit"] as number | null) ?? null,
      operatingIncome: (row["Operating Income (Loss)"] as number | null) ?? null,
      netIncome: (row["Net Income"] as number | null) ?? null,
      eps: (row["Earnings Per Share, Basic"] as number | null) ?? null,
      epsDiluted: (row["Earnings Per Share, Diluted"] as number | null) ?? null,
    }));
  } catch (err) {
    console.warn("[SimFin] Quarterly income fetch failed:", (err as Error).message);
    return [];
  }
}

/**
 * 综合获取 SimFin 数据（财务报表 + 衍生指标 + 股价历史 + 季报）
 * 仅当检测到股票代码时触发
 */
export async function fetchSimFinData(ticker: string): Promise<SimFinData | null> {
  if (!ENV.SIMFIN_API_KEY) return null;
  if (!ticker) return null;

  // 并行获取四类数据
  const [incomeStmt, balanceSheet, derivedMetrics, recentPrices, quarterlyIncome] = await Promise.allSettled([
    fetchIncomeStatement(ticker),
    fetchBalanceSheet(ticker),
    fetchDerivedMetrics(ticker),
    fetchRecentPrices(ticker),
    fetchQuarterlyIncome(ticker),
  ]);

  const income = incomeStmt.status === "fulfilled" ? incomeStmt.value : null;
  const balance = balanceSheet.status === "fulfilled" ? balanceSheet.value : null;
  const derived = derivedMetrics.status === "fulfilled" ? derivedMetrics.value : null;
  const prices = recentPrices.status === "fulfilled" ? recentPrices.value : [];
  const quarterly = quarterlyIncome.status === "fulfilled" ? quarterlyIncome.value : [];

  // 如果所有数据都为空，返回 null（避免写入空数据块）
  if (!income && !balance && !derived && prices.length === 0 && quarterly.length === 0) return null;

  return {
    ticker,
    companyName: ticker, // 公司名由 Yahoo Finance 等其他数据源提供
    currency: "USD",
    incomeStatement: income,
    balanceSheet: balance,
    derivedMetrics: derived,
    recentPrices: prices,
    quarterlyIncome: quarterly,
    source: "SimFin",
    fetchedAt: Date.now(),
  };
}

// ─── 格式化输出 ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, isPercent = false, decimals = 2): string {
  if (n === null || n === undefined) return "N/A";
  if (isPercent) return `${(n * 100).toFixed(decimals)}%`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return n.toFixed(decimals);
}

export function formatSimFinDataAsMarkdown(data: SimFinData): string {
  const lines: string[] = [];
  lines.push(`## SimFin 财务数据 — ${data.ticker}`);
  lines.push(`> 数据来源：SimFin.com | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}`);
  lines.push("");

  // ── 损益表摘要 ──
  if (data.incomeStatement) {
    const is = data.incomeStatement;
    lines.push(`### 损益表摘要（FY${is.fiscalYear}，报告日：${is.reportDate}）`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 营业收入 | ${fmt(is.revenue)} |`);
    lines.push(`| 毛利润 | ${fmt(is.grossProfit)} |`);
    lines.push(`| 营业利润 | ${fmt(is.operatingIncome)} |`);
    lines.push(`| 税前利润 | ${fmt(is.pretaxIncome)} |`);
    lines.push(`| 净利润 | ${fmt(is.netIncome)} |`);
    lines.push(`| EPS（基本） | ${is.eps !== null ? `$${is.eps.toFixed(3)}` : "N/A"} |`);
    lines.push(`| EPS（摊薄） | ${is.epsDiluted !== null ? `$${is.epsDiluted.toFixed(3)}` : "N/A"} |`);
    lines.push("");
  }

  // ── 资产负债表摘要 ──
  if (data.balanceSheet) {
    const bs = data.balanceSheet;
    lines.push(`### 资产负债表摘要（FY${bs.fiscalYear}）`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 总资产 | ${fmt(bs.totalAssets)} |`);
    lines.push(`| 总负债 | ${fmt(bs.totalLiabilities)} |`);
    lines.push(`| 股东权益 | ${fmt(bs.totalEquity)} |`);
    lines.push(`| 现金及等价物 | ${fmt(bs.cash)} |`);
    lines.push(`| 总债务 | ${fmt(bs.totalDebt)} |`);
    lines.push(`| 流动比率 | ${bs.currentRatio !== null ? bs.currentRatio.toFixed(2) : "N/A"} |`);
    lines.push("");
  }

  // ── 衍生指标（估值/利润率/质量） ──
  if (data.derivedMetrics) {
    const dm = data.derivedMetrics;
    lines.push(`### 衍生指标与质量评分（FY${dm.fiscalYear}）`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 毛利率 | ${fmt(dm.grossMargin, true)} |`);
    lines.push(`| 营业利润率 | ${fmt(dm.operatingMargin, true)} |`);
    lines.push(`| 净利润率 | ${fmt(dm.netMargin, true)} |`);
    lines.push(`| ROE | ${fmt(dm.roe, true)} |`);
    lines.push(`| ROA | ${fmt(dm.roa, true)} |`);
    lines.push(`| ROIC | ${fmt(dm.roic, true)} |`);
    lines.push(`| 自由现金流 | ${fmt(dm.freeCashFlow)} |`);
    lines.push(`| FCF/股 | ${dm.fcfPerShare !== null ? `$${dm.fcfPerShare.toFixed(3)}` : "N/A"} |`);
    lines.push(`| 净债务/EBITDA | ${dm.netDebtToEbitda !== null ? dm.netDebtToEbitda.toFixed(2) : "N/A"}x |`);
    lines.push(`| 债务比率 | ${fmt(dm.debtRatio, true)} |`);
    lines.push(`| Piotroski F-Score | ${dm.piotroskiFScore !== null ? `${dm.piotroskiFScore}/9` : "N/A"} |`);
    lines.push("");
  }

  // ── 近期股价走势（最近 10 个交易日） ──
  if (data.recentPrices.length > 0) {
    const recent = data.recentPrices.slice(-10);
    lines.push(`### 近期股价（最近 ${recent.length} 个交易日）`);
    lines.push(`| 日期 | 开盘 | 最高 | 最低 | 收盘 | 复权收盘 |`);
    lines.push(`|------|------|------|------|------|----------|`);
    for (const p of recent) {
      lines.push(`| ${p.date} | $${p.open.toFixed(2)} | $${p.high.toFixed(2)} | $${p.low.toFixed(2)} | $${p.close.toFixed(2)} | $${p.adjustedClose.toFixed(2)} |`);
    }
    lines.push("");
  }

  // ── 季度损益表趋势（最近 4 季度） ──
  if (data.quarterlyIncome && data.quarterlyIncome.length > 0) {
    lines.push("### 季度损益表趋势（最近 4 季度）");
    lines.push("| 季度 | 营业收入 | 毛利润 | 营业利润 | 净利润 | EPS |");
    lines.push("|------|--------|--------|--------|--------|-----|");
    for (const q of data.quarterlyIncome) {
      const label = `FY${q.fiscalYear} ${q.fiscalPeriod}`;
      lines.push(`| ${label} | ${fmt(q.revenue)} | ${fmt(q.grossProfit)} | ${fmt(q.operatingIncome)} | ${fmt(q.netIncome)} | ${q.eps !== null ? `$${q.eps.toFixed(3)}` : "N/A"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── 健康检测 ────────────────────────────────────────────────────────────────

export async function checkSimFinHealth(): Promise<boolean> {
  try {
    if (!ENV.SIMFIN_API_KEY) return false;
    // 用 AAPL 衍生指标做轻量探针（数据量小）
    const raw = await simfinFetch("/companies/statements/compact", {
      ticker: "AAPL",
      statements: "derived",
      period: "FY",
    }) as unknown[];
    return Array.isArray(raw) && raw.length > 0;
  } catch {
    return false;
  }
}
