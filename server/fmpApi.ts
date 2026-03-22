/**
 * Financial Modeling Prep (FMP) API 模块
 * 数据来源：Financial Modeling Prep (https://financialmodelingprep.com/stable)
 * 提供：财务报表、DCF估値、关键指标、分析师目标价、经济指标
 */

import { ENV } from "./_core/env";
import { formatFinancialMetrics } from "./financialMetrics";

const FMP_BASE = "https://financialmodelingprep.com/stable";

function getKey(): string {
  const key = ENV.FMP_API_KEY || "i58yYDwWrdmyuftiynHvKBg3CZ1t6Zgd";
  if (!key) throw new Error("FMP_API_KEY 未配置");
  return key;
}

async function fetchFmp<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = getKey();
  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  const url = `${FMP_BASE}${path}?${qs}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "InvestmentPlatform/1.0" },
  });
  if (!res.ok) throw new Error(`FMP ${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface FmpQuote {
  symbol: string;
  name: string;
  price: number;
  changePercentage: number;
  change: number;
  volume: number;
  dayLow: number;
  dayHigh: number;
  previousClose: number;
  open: number;
  eps: number;
  pe: number;
  marketCap: number;
  sharesOutstanding: number;
  timestamp: number;
}

export interface FmpProfile {
  symbol: string;
  price: number;
  marketCap: number;
  beta: number;
  volAvg: number;
  lastDiv: number;
  range: string;
  changes: number;
  companyName: string;
  currency: string;
  cik: string;
  isin: string;
  cusip: string;
  exchange: string;
  exchangeShortName: string;
  industry: string;
  website: string;
  description: string;
  ceo: string;
  sector: string;
  country: string;
  fullTimeEmployees: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  dcfDiff: number;
  dcf: number;
  image: string;
  ipoDate: string;
  defaultImage: boolean;
  isEtf: boolean;
  isActivelyTrading: boolean;
  isAdr: boolean;
  isFund: boolean;
}

export interface FmpIncomeStatement {
  date: string;
  symbol: string;
  reportedCurrency: string;
  period: string;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  grossProfitRatio: number;
  researchAndDevelopmentExpenses: number;
  operatingExpenses: number;
  operatingIncome: number;
  operatingIncomeRatio: number;
  ebitda: number;
  ebitdaratio: number;
  netIncome: number;
  netIncomeRatio: number;
  eps: number;
  epsdiluted: number;
  weightedAverageShsOut: number;
  weightedAverageShsOutDil: number;
}

export interface FmpBalanceSheet {
  date: string;
  symbol: string;
  period: string;
  totalAssets: number;
  totalCurrentAssets: number;
  cashAndCashEquivalents: number;
  totalLiabilities: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  totalStockholdersEquity: number;
  totalDebt: number;
  netDebt: number;
}

export interface FmpCashFlow {
  date: string;
  symbol: string;
  period: string;
  operatingCashFlow: number;
  capitalExpenditure: number;
  freeCashFlow: number;
  dividendsPaid: number;
  commonStockRepurchased: number;
  netCashProvidedByOperatingActivities: number;
  netCashUsedForInvestingActivites: number;
  netCashUsedProvidedByFinancingActivities: number;
}

export interface FmpKeyMetrics {
  symbol: string;
  date: string;
  period: string;
  revenuePerShare: number;
  netIncomePerShare: number;
  operatingCashFlowPerShare: number;
  freeCashFlowPerShare: number;
  cashPerShare: number;
  bookValuePerShare: number;
  tangibleBookValuePerShare: number;
  shareholdersEquityPerShare: number;
  interestDebtPerShare: number;
  marketCap: number;
  enterpriseValue: number;
  peRatio: number;
  priceToSalesRatio: number;
  pocfratio: number;
  pfcfRatio: number;
  pbRatio: number;
  ptbRatio: number;
  evToSales: number;
  enterpriseValueOverEBITDA: number;
  evToOperatingCashFlow: number;
  evToFreeCashFlow: number;
  earningsYield: number;
  freeCashFlowYield: number;
  debtToEquity: number;
  debtToAssets: number;
  netDebtToEBITDA: number;
  currentRatio: number;
  interestCoverage: number;
  incomeQuality: number;
  dividendYield: number;
  payoutRatio: number;
  salesGeneralAndAdministrativeToRevenue: number;
  researchAndDdevelopementToRevenue: number;
  intangiblesToTotalAssets: number;
  capexToOperatingCashFlow: number;
  capexToRevenue: number;
  capexToDepreciation: number;
  stockBasedCompensationToRevenue: number;
  grahamNumber: number;
  roic: number;
  returnOnTangibleAssets: number;
  grahamNetNet: number;
  workingCapital: number;
  tangibleAssetValue: number;
  netCurrentAssetValue: number;
  investedCapital: number;
  averageReceivables: number;
  averagePayables: number;
  averageInventory: number;
  daysSalesOutstanding: number;
  daysPayablesOutstanding: number;
  daysOfInventoryOnHand: number;
  receivablesTurnover: number;
  payablesTurnover: number;
  inventoryTurnover: number;
  roe: number;
  capexPerShare: number;
}

export interface FmpDcf {
  symbol: string;
  date: string;
  dcf: number;
  "Stock Price": number;
}

export interface FmpPriceTarget {
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetConsensus: number;
  targetMedian: number;
}

export interface FmpEconomicIndicator {
  name: string;
  date: string;
  value: number;
}

// ─── 核心函数 ──────────────────────────────────────────────────────────────

export async function getQuote(symbol: string): Promise<FmpQuote | null> {
  const data = await fetchFmp<FmpQuote[]>("/quote", { symbol: symbol.toUpperCase() });
  return data[0] ?? null;
}

export async function getProfile(symbol: string): Promise<FmpProfile | null> {
  const data = await fetchFmp<FmpProfile[]>("/profile", { symbol: symbol.toUpperCase() });
  return data[0] ?? null;
}

export async function getIncomeStatement(symbol: string, limit = 4, period: "annual" | "quarter" = "annual"): Promise<FmpIncomeStatement[]> {
  return fetchFmp<FmpIncomeStatement[]>("/income-statement", {
    symbol: symbol.toUpperCase(),
    limit: String(limit),
    period,
  });
}

export async function getBalanceSheet(symbol: string, limit = 4, period: "annual" | "quarter" = "annual"): Promise<FmpBalanceSheet[]> {
  return fetchFmp<FmpBalanceSheet[]>("/balance-sheet-statement", {
    symbol: symbol.toUpperCase(),
    limit: String(limit),
    period,
  });
}

export async function getCashFlowStatement(symbol: string, limit = 4, period: "annual" | "quarter" = "annual"): Promise<FmpCashFlow[]> {
  return fetchFmp<FmpCashFlow[]>("/cash-flow-statement", {
    symbol: symbol.toUpperCase(),
    limit: String(limit),
    period,
  });
}

export async function getKeyMetrics(symbol: string, limit = 4, period: "annual" | "quarter" = "annual"): Promise<FmpKeyMetrics[]> {
  return fetchFmp<FmpKeyMetrics[]>("/key-metrics", {
    symbol: symbol.toUpperCase(),
    limit: String(limit),
    period,
  });
}

export async function getDcfValuation(symbol: string): Promise<FmpDcf | null> {
  const data = await fetchFmp<FmpDcf[]>("/discounted-cash-flow", { symbol: symbol.toUpperCase() });
  return data[0] ?? null;
}

export async function getPriceTargetConsensus(symbol: string): Promise<FmpPriceTarget | null> {
  const data = await fetchFmp<FmpPriceTarget[]>("/price-target-consensus", { symbol: symbol.toUpperCase() });
  return data[0] ?? null;
}

export async function getEconomicIndicators(name: string): Promise<FmpEconomicIndicator[]> {
  return fetchFmp<FmpEconomicIndicator[]>("/economic-indicators", { name });
}

/** 健康检测 */
export async function checkHealth(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const t0 = Date.now();
  try {
    const q = await getQuote("AAPL");
    const latencyMs = Date.now() - t0;
    if (q && q.price > 0) {
      return { ok: true, latencyMs, detail: `AAPL $${q.price.toFixed(2)}` };
    }
    return { ok: false, latencyMs, detail: "返回数据异常" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, detail: String(e) };
  }
}

// ─── 综合数据（供 Step2 数据引擎调用） ────────────────────────────────────

export interface FmpStockData {
  symbol: string;
  quote: FmpQuote | null;
  profile: FmpProfile | null;
  incomeStatements: FmpIncomeStatement[];
  balanceSheets: FmpBalanceSheet[];
  cashFlows: FmpCashFlow[];
  keyMetrics: FmpKeyMetrics[];
  // 季报数据（最近 6 个季度）
  quarterlyIncomeStatements: FmpIncomeStatement[];
  quarterlyBalanceSheets: FmpBalanceSheet[];
  quarterlyCashFlows: FmpCashFlow[];
  dcf: FmpDcf | null;
  priceTarget: FmpPriceTarget | null;
  source: string;
  fetchedAt: string;
}

export async function getStockFullData(symbol: string): Promise<FmpStockData> {
  const sym = symbol.toUpperCase();
  const [quote, profile, income, balance, cashflow, metrics, dcf, target,
    incomeQ, balanceQ, cashflowQ] = await Promise.allSettled([
    getQuote(sym),
    getProfile(sym),
    getIncomeStatement(sym, 4, "annual"),
    getBalanceSheet(sym, 4, "annual"),
    getCashFlowStatement(sym, 4, "annual"),
    getKeyMetrics(sym, 4, "annual"),
    getDcfValuation(sym),
    getPriceTargetConsensus(sym),
    // 季报数据（最近 6 个季度）
    getIncomeStatement(sym, 6, "quarter"),
    getBalanceSheet(sym, 6, "quarter"),
    getCashFlowStatement(sym, 6, "quarter"),
  ]);

  return {
    symbol: sym,
    quote: quote.status === "fulfilled" ? quote.value : null,
    profile: profile.status === "fulfilled" ? profile.value : null,
    incomeStatements: income.status === "fulfilled" ? income.value : [],
    balanceSheets: balance.status === "fulfilled" ? balance.value : [],
    cashFlows: cashflow.status === "fulfilled" ? cashflow.value : [],
    keyMetrics: metrics.status === "fulfilled" ? metrics.value : [],
    quarterlyIncomeStatements: incomeQ.status === "fulfilled" ? incomeQ.value : [],
    quarterlyBalanceSheets: balanceQ.status === "fulfilled" ? balanceQ.value : [],
    quarterlyCashFlows: cashflowQ.status === "fulfilled" ? cashflowQ.value : [],
    dcf: dcf.status === "fulfilled" ? dcf.value : null,
    priceTarget: target.status === "fulfilled" ? target.value : null,
    source: "Financial Modeling Prep",
    fetchedAt: new Date().toISOString(),
  };
}

/** 格式化 FMP 数据为 Markdown */
export function formatFmpData(data: FmpStockData): string {
  const lines: string[] = [];
  lines.push(`## Financial Modeling Prep 财务数据 — ${data.symbol}`);
  lines.push(`*数据来源：Financial Modeling Prep (FMP) | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*\n`);

  if (data.quote) {
    const q = data.quote;
    const changeSign = q.change >= 0 ? "+" : "";
    lines.push(`### 实时报价`);
    lines.push(`| 当前价 | 涨跌额 | 涨跌幅 | PE | 市值 |`);
    lines.push(`|--------|--------|--------|-----|------|`);
    lines.push(`| $${q.price.toFixed(2)} | ${changeSign}${q.change.toFixed(2)} | ${changeSign}${q.changePercentage.toFixed(2)}% | ${q.pe?.toFixed(1) ?? "N/A"} | $${(q.marketCap / 1e9).toFixed(1)}B |`);
  }

  if (data.profile) {
    const p = data.profile;
    lines.push(`\n### 公司概况`);
    lines.push(`| 公司 | 行业 | 国家 | CEO | 员工数 |`);
    lines.push(`|------|------|------|-----|--------|`);
    lines.push(`| ${p.companyName} | ${p.sector} / ${p.industry} | ${p.country} | ${p.ceo} | ${parseInt(p.fullTimeEmployees || "0").toLocaleString()} |`);
    if (p.description) {
      lines.push(`\n> ${p.description.slice(0, 200)}...`);
    }
  }

  // 季报数据（优先展示，更新更及时）
  if (data.quarterlyIncomeStatements && data.quarterlyIncomeStatements.length > 0) {
    lines.push(`\n### 季报损益表（最近 ${data.quarterlyIncomeStatements.length} 个季度）`);
    lines.push(`| 季度 | 营收 | 毛利润 | 营业利润 | 净利润 | EPS |`);
    lines.push(`|------|------|--------|----------|--------|-----|`);
    for (const s of data.quarterlyIncomeStatements) {
      lines.push(`| ${s.date.slice(0, 7)} (${s.period}) | $${(s.revenue / 1e9).toFixed(2)}B | $${(s.grossProfit / 1e9).toFixed(2)}B | $${(s.operatingIncome / 1e9).toFixed(2)}B | $${(s.netIncome / 1e9).toFixed(2)}B | $${s.eps?.toFixed(2) ?? "N/A"} |`);
    }
  }

  if (data.incomeStatements.length > 0) {
    lines.push(`\n### 年度损益表（最近 ${data.incomeStatements.length} 年）`);
    lines.push(`| 财年 | 营收 | 毛利润 | 营业利润 | 净利润 | EPS |`);
    lines.push(`|------|------|--------|----------|--------|-----|`);
    for (const s of data.incomeStatements) {
      lines.push(`| ${s.date.slice(0, 7)} | $${(s.revenue / 1e9).toFixed(1)}B | $${(s.grossProfit / 1e9).toFixed(1)}B | $${(s.operatingIncome / 1e9).toFixed(1)}B | $${(s.netIncome / 1e9).toFixed(1)}B | $${s.eps?.toFixed(2) ?? "N/A"} |`);
    }
  }

  if (data.balanceSheets.length > 0) {
    const b = data.balanceSheets[0];
    lines.push(`\n### 资产负债表（最新：${b.date.slice(0, 7)}）`);
    lines.push(`| 总资产 | 总负债 | 股东权益 | 现金 | 长期债务 | 净债务 |`);
    lines.push(`|--------|--------|----------|------|----------|--------|`);
    lines.push(`| $${(b.totalAssets / 1e9).toFixed(1)}B | $${(b.totalLiabilities / 1e9).toFixed(1)}B | $${(b.totalStockholdersEquity / 1e9).toFixed(1)}B | $${(b.cashAndCashEquivalents / 1e9).toFixed(1)}B | $${(b.longTermDebt / 1e9).toFixed(1)}B | $${(b.netDebt / 1e9).toFixed(1)}B |`);
  }

  if (data.cashFlows.length > 0) {
    lines.push(`\n### 现金流量表（年度，最近 ${data.cashFlows.length} 年）`);
    lines.push(`| 财年 | 经营现金流 | 资本支出 | 自由现金流 | 股票回购 |`);
    lines.push(`|------|------------|----------|------------|----------|`);
    for (const c of data.cashFlows) {
      lines.push(`| ${c.date.slice(0, 7)} | $${(c.operatingCashFlow / 1e9).toFixed(1)}B | $${(Math.abs(c.capitalExpenditure) / 1e9).toFixed(1)}B | $${(c.freeCashFlow / 1e9).toFixed(1)}B | $${(Math.abs(c.commonStockRepurchased || 0) / 1e9).toFixed(1)}B |`);
    }
  }

  if (data.keyMetrics.length > 0) {
    const m = data.keyMetrics[0];
    lines.push(`\n### 关键估值指标（最新：${m.date.slice(0, 7)}）`);
    lines.push(`| PE | PB | EV/EBITDA | 债务/权益 | ROE | 自由现金流收益率 |`);
    lines.push(`|----|----|-----------|-----------|----|-----------------|`);
    lines.push(`| ${m.peRatio?.toFixed(1) ?? "N/A"} | ${m.pbRatio?.toFixed(1) ?? "N/A"} | ${m.enterpriseValueOverEBITDA?.toFixed(1) ?? "N/A"} | ${m.debtToEquity?.toFixed(2) ?? "N/A"} | ${(m.roe * 100)?.toFixed(1) ?? "N/A"}% | ${(m.freeCashFlowYield * 100)?.toFixed(1) ?? "N/A"}% |`);
  }

  if (data.dcf) {
    const upside = ((data.dcf.dcf - data.dcf["Stock Price"]) / data.dcf["Stock Price"] * 100).toFixed(1);
    const upsideSign = parseFloat(upside) >= 0 ? "+" : "";
    lines.push(`\n### DCF 内在价值估算`);
    lines.push(`| 当前股价 | DCF 内在价值 | 安全边际 |`);
    lines.push(`|----------|--------------|----------|`);
    lines.push(`| $${data.dcf["Stock Price"].toFixed(2)} | $${data.dcf.dcf.toFixed(2)} | ${upsideSign}${upside}% |`);
  }

  if (data.priceTarget) {
    const pt = data.priceTarget;
    lines.push(`\n### 分析师目标价共识`);
    lines.push(`| 目标价（共识） | 目标价（中位） | 目标价（高） | 目标价（低） |`);
    lines.push(`|----------------|----------------|--------------|--------------|`);
    lines.push(`| $${pt.targetConsensus?.toFixed(2) ?? "N/A"} | $${pt.targetMedian?.toFixed(2) ?? "N/A"} | $${pt.targetHigh?.toFixed(2) ?? "N/A"} | $${pt.targetLow?.toFixed(2) ?? "N/A"} |`);
  }

  // 追加标准化财务指标分析（参考 FinanceToolkit 体系）
  const metricsAnalysis = formatFinancialMetrics(
    data.symbol,
    data.incomeStatements,
    data.balanceSheets,
    data.cashFlows,
    data.keyMetrics,
    data.profile
  );
  if (metricsAnalysis) {
    lines.push(`\n${metricsAnalysis}`);
  }

  return lines.join("\n");
}
