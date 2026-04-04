/**
 * Finnhub API 模块
 * 数据来源：Finnhub Stock API (https://finnhub.io)
 * 提供：实时报价、分析师评级、公司新闻、财务指标、内部交易、市场新闻
 */

import { ENV } from "./_core/env";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

function getKey(): string {
  const key = ENV.FINNHUB_API_KEY || "d6v2ughr01qig546bblgd6v2ughr01qig546bbm0";
  if (!key) throw new Error("FINNHUB_API_KEY 未配置");
  return key;
}

async function fetchFinnhub<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = getKey();
  const qs = new URLSearchParams({ ...params, token: key }).toString();
  const url = `${FINNHUB_BASE}${path}?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Finnhub ${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface FinnhubQuote {
  c: number;   // 当前价
  d: number;   // 涨跌额
  dp: number;  // 涨跌幅 %
  h: number;   // 日高
  l: number;   // 日低
  o: number;   // 开盘价
  pc: number;  // 昨收
  t: number;   // 时间戳
}

export interface FinnhubProfile {
  name: string;
  ticker: string;
  exchange: string;
  finnhubIndustry: string;
  marketCapitalization: number;
  shareOutstanding: number;
  logo: string;
  weburl: string;
  country: string;
  currency: string;
  ipo: string;
}

export interface FinnhubRecommendation {
  period: string;
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
}

export interface FinnhubNewsItem {
  headline: string;
  summary: string;
  url: string;
  datetime: number;
  source: string;
  category: string;
  image: string;
}

export interface FinnhubMetric {
  metric: {
    peNormalizedAnnual?: number;
    pbAnnual?: number;
    psAnnual?: number;
    pcfShareTTM?: number;
    roeTTM?: number;
    roaTTM?: number;
    revenueGrowthTTMYoy?: number;
    epsNormalizedAnnual?: number;
    dividendYieldIndicatedAnnual?: number;
    debtEquityAnnual?: number;
    currentRatioAnnual?: number;
    grossMarginTTM?: number;
    netProfitMarginTTM?: number;
    [key: string]: number | undefined;
  };
}

export interface FinnhubInsiderTransaction {
  name: string;
  share: number;
  change: number;
  filingDate: string;
  transactionDate: string;
  transactionCode: string;
  transactionPrice: number;
}

// ─── 核心函数 ──────────────────────────────────────────────────────────────

/** 实时报价 */
export async function getQuote(symbol: string): Promise<FinnhubQuote> {
  return fetchFinnhub<FinnhubQuote>("/quote", { symbol: symbol.toUpperCase() });
}

/** 公司基本信息 */
export async function getCompanyProfile(symbol: string): Promise<FinnhubProfile> {
  return fetchFinnhub<FinnhubProfile>("/stock/profile2", { symbol: symbol.toUpperCase() });
}

/** 分析师评级（最近 6 个月） */
export async function getRecommendations(symbol: string): Promise<FinnhubRecommendation[]> {
  return fetchFinnhub<FinnhubRecommendation[]>("/stock/recommendation", { symbol: symbol.toUpperCase() });
}

/** 公司新闻（最近 7 天） */
export async function getCompanyNews(symbol: string): Promise<FinnhubNewsItem[]> {
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split("T")[0];
  return fetchFinnhub<FinnhubNewsItem[]>("/company-news", { symbol: symbol.toUpperCase(), from, to });
}

/** 财务指标（PE/PB/ROE/EPS 等） */
export async function getBasicFinancials(symbol: string): Promise<FinnhubMetric> {
  return fetchFinnhub<FinnhubMetric>("/stock/metric", { symbol: symbol.toUpperCase(), metric: "all" });
}

/** 内部交易记录 */
export async function getInsiderTransactions(symbol: string): Promise<{ data: FinnhubInsiderTransaction[] }> {
  return fetchFinnhub<{ data: FinnhubInsiderTransaction[] }>("/stock/insider-transactions", { symbol: symbol.toUpperCase() });
}

/** 获取同行业 peer 公司列表（Finnhub /stock/peers）*/
export async function getPeers(symbol: string): Promise<string[]> {
  const result = await fetchFinnhub<string[]>("/stock/peers", { symbol: symbol.toUpperCase() });
  // Finnhub 返回的第一个元素通常是自身，过滤掉，最多取 5 个
  return Array.isArray(result)
    ? result.filter((s) => s.toUpperCase() !== symbol.toUpperCase()).slice(0, 5)
    : [];
}

/** 市场综合新闻 */
export async function getMarketNews(category: "general" | "forex" | "crypto" | "merger" = "general"): Promise<FinnhubNewsItem[]> {
  return fetchFinnhub<FinnhubNewsItem[]>("/news", { category });
}

/** 健康检测 */
export async function checkHealth(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const t0 = Date.now();
  try {
    const q = await getQuote("AAPL");
    const latencyMs = Date.now() - t0;
    if (q.c > 0) {
      return { ok: true, latencyMs, detail: `AAPL $${q.c.toFixed(2)}` };
    }
    return { ok: false, latencyMs, detail: "返回数据异常" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, detail: String(e) };
  }
}

// ─── 综合分析数据（供 Step2 数据引擎调用） ────────────────────────────────

export interface FinnhubStockData {
  symbol: string;
  quote: FinnhubQuote | null;
  profile: FinnhubProfile | null;
  recommendations: FinnhubRecommendation[];
  recentNews: FinnhubNewsItem[];
  metrics: FinnhubMetric["metric"] | null;
  insiderTransactions: FinnhubInsiderTransaction[];
  source: string;
  fetchedAt: string;
}

/**
 * 获取股票综合数据（并行请求，单股票完整画像）
 */
export async function getStockFullData(symbol: string): Promise<FinnhubStockData> {
  const sym = symbol.toUpperCase();
  const [quote, profile, recommendations, news, metrics, insider] = await Promise.allSettled([
    getQuote(sym),
    getCompanyProfile(sym),
    getRecommendations(sym),
    getCompanyNews(sym),
    getBasicFinancials(sym),
    getInsiderTransactions(sym),
  ]);

  return {
    symbol: sym,
    quote: quote.status === "fulfilled" ? quote.value : null,
    profile: profile.status === "fulfilled" ? profile.value : null,
    recommendations: recommendations.status === "fulfilled" ? recommendations.value.slice(0, 3) : [],
    recentNews: news.status === "fulfilled" ? news.value.slice(0, 5) : [],
    metrics: metrics.status === "fulfilled" ? metrics.value.metric : null,
    insiderTransactions: insider.status === "fulfilled" ? insider.value.data.slice(0, 5) : [],
    source: "Finnhub Stock API",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 格式化 Finnhub 数据为 Markdown（供 GPT 分析）
 */
export function formatFinnhubData(data: FinnhubStockData): string {
  const lines: string[] = [];
  lines.push(`## Finnhub 数据 — ${data.symbol}`);
  lines.push(`*数据来源：Finnhub Stock API | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*\n`);

  if (data.quote) {
    const q = data.quote;
    const changeSign = q.d >= 0 ? "+" : "";
    lines.push(`### 实时报价`);
    lines.push(`| 当前价 | 涨跌额 | 涨跌幅 | 开盘 | 日高 | 日低 | 昨收 |`);
    lines.push(`|--------|--------|--------|------|------|------|------|`);
    lines.push(`| $${q.c.toFixed(2)} | ${changeSign}${q.d.toFixed(2)} | ${changeSign}${q.dp.toFixed(2)}% | $${q.o.toFixed(2)} | $${q.h.toFixed(2)} | $${q.l.toFixed(2)} | $${q.pc.toFixed(2)} |`);
  }

  if (data.profile && data.profile.name) {
    const p = data.profile;
    lines.push(`\n### 公司概况`);
    lines.push(`| 公司 | 交易所 | 行业 | 市值 | 国家 |`);
    lines.push(`|------|--------|------|------|------|`);
    lines.push(`| ${p.name} | ${p.exchange} | ${p.finnhubIndustry} | $${(p.marketCapitalization / 1000).toFixed(1)}B | ${p.country} |`);
  }

  if (data.metrics) {
    const m = data.metrics;
    lines.push(`\n### 财务指标`);
    lines.push(`| PE | PB | ROE | EPS | 毛利率 | 净利率 | 股息率 |`);
    lines.push(`|----|----|----|-----|--------|--------|--------|`);
    lines.push(`| ${m.peNormalizedAnnual?.toFixed(1) ?? "N/A"} | ${m.pbAnnual?.toFixed(1) ?? "N/A"} | ${m.roeTTM?.toFixed(1) ?? "N/A"}% | $${m.epsNormalizedAnnual?.toFixed(2) ?? "N/A"} | ${m.grossMarginTTM?.toFixed(1) ?? "N/A"}% | ${m.netProfitMarginTTM?.toFixed(1) ?? "N/A"}% | ${m.dividendYieldIndicatedAnnual?.toFixed(2) ?? "N/A"}% |`);
  }

  if (data.recommendations.length > 0) {
    lines.push(`\n### 分析师评级（最近 ${data.recommendations.length} 期）`);
    lines.push(`| 期间 | 强烈买入 | 买入 | 持有 | 卖出 | 强烈卖出 |`);
    lines.push(`|------|----------|------|------|------|----------|`);
    for (const r of data.recommendations) {
      lines.push(`| ${r.period} | ${r.strongBuy} | ${r.buy} | ${r.hold} | ${r.sell} | ${r.strongSell} |`);
    }
  }

  if (data.insiderTransactions.length > 0) {
    lines.push(`\n### 内部交易（最近 ${data.insiderTransactions.length} 笔）`);
    lines.push(`| 日期 | 姓名 | 操作 | 股数 | 价格 |`);
    lines.push(`|------|------|------|------|------|`);
    for (const tx of data.insiderTransactions) {
      const action = tx.change > 0 ? "买入" : "卖出";
      lines.push(`| ${tx.transactionDate} | ${tx.name} | ${action} | ${Math.abs(tx.change).toLocaleString()} | $${tx.transactionPrice?.toFixed(2) ?? "N/A"} |`);
    }
  }

  if (data.recentNews.length > 0) {
    lines.push(`\n### 近期新闻（最近 ${data.recentNews.length} 条）`);
    for (const n of data.recentNews) {
      const date = new Date(n.datetime * 1000).toLocaleDateString("zh-CN");
      lines.push(`- **${date}** [${n.headline.slice(0, 60)}](${n.url}) — *${n.source}*`);
    }
  }

  return lines.join("\n");
}
