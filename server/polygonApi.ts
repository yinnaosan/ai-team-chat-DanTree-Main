/**
 * Polygon.io API 模块
 * 数据来源：Polygon.io (https://polygon.io)
 * 提供：股票聚合数据、实时快照、公司详情、新闻、技术指标、期权、外汇
 */

import { ENV } from "./_core/env";

const POLY_BASE = "https://api.polygon.io";

function getKey(): string {
  const key = ENV.POLYGON_API_KEY || "65gRaMpwHzfm5uxZEcekmt803Y3ci6Yk";
  if (!key) throw new Error("POLYGON_API_KEY 未配置");
  return key;
}

async function fetchPolygon<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = getKey();
  const qs = new URLSearchParams({ ...params, apiKey: key }).toString();
  const url = `${POLY_BASE}${path}?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Polygon.io ${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface PolyAggregate {
  c: number;   // 收盘价
  h: number;   // 最高价
  l: number;   // 最低价
  n: number;   // 交易笔数
  o: number;   // 开盘价
  t: number;   // 时间戳（毫秒）
  v: number;   // 成交量
  vw: number;  // 成交量加权均价
}

export interface PolyTickerDetails {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
  cik: string;
  composite_figi: string;
  share_class_figi: string;
  market_cap: number;
  phone_number: string;
  address: { address1: string; city: string; state: string; postal_code: string };
  description: string;
  sic_code: string;
  sic_description: string;
  ticker_root: string;
  homepage_url: string;
  total_employees: number;
  list_date: string;
  branding: { logo_url: string; icon_url: string };
  share_class_shares_outstanding: number;
  weighted_shares_outstanding: number;
}

export interface PolyNewsItem {
  id: string;
  publisher: { name: string; homepage_url: string; logo_url: string; favicon_url: string };
  title: string;
  author: string;
  published_utc: string;
  article_url: string;
  tickers: string[];
  description: string;
  keywords: string[];
  image_url: string;
  insights?: Array<{ ticker: string; sentiment: string; sentiment_reasoning: string }>;
}

export interface PolySnapshot {
  ticker: string;
  todaysChangePerc: number;
  todaysChange: number;
  updated: number;
  day: { o: number; h: number; l: number; c: number; v: number; vw: number };
  lastTrade: { p: number; s: number; t: number };
  lastQuote: { P: number; S: number; p: number; s: number; t: number };
  min: { av: number; t: number; n: number; o: number; h: number; l: number; c: number; v: number; vw: number };
  prevDay: { o: number; h: number; l: number; c: number; v: number; vw: number };
}

// ─── 核心函数 ──────────────────────────────────────────────────────────────

/** 昨日 OHLCV 数据 */
export async function getPreviousClose(ticker: string): Promise<PolyAggregate | null> {
  const data = await fetchPolygon<{ results: PolyAggregate[]; status: string }>(
    `/v2/aggs/ticker/${ticker.toUpperCase()}/prev`
  );
  return data.results?.[0] ?? null;
}

/** 历史聚合数据（日线） */
export async function getAggregates(
  ticker: string,
  from: string,
  to: string,
  multiplier = 1,
  timespan: "day" | "week" | "month" = "day"
): Promise<PolyAggregate[]> {
  const data = await fetchPolygon<{ results: PolyAggregate[]; status: string }>(
    `/v2/aggs/ticker/${ticker.toUpperCase()}/range/${multiplier}/${timespan}/${from}/${to}`,
    { adjusted: "true", sort: "asc", limit: "50000" }  // Polygon 免费层最大允许 50000 条/请求
  );
  return data.results ?? [];
}

/** 公司详情 */
export async function getTickerDetails(ticker: string): Promise<PolyTickerDetails | null> {
  const data = await fetchPolygon<{ results: PolyTickerDetails; status: string }>(
    `/v3/reference/tickers/${ticker.toUpperCase()}`
  );
  return data.results ?? null;
}

/** 股票快照（实时） */
export async function getSnapshot(ticker: string): Promise<PolySnapshot | null> {
  const data = await fetchPolygon<{ ticker: PolySnapshot; status: string }>(
    `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker.toUpperCase()}`
  );
  return data.ticker ?? null;
}

/** 公司新闻（最近 10 条） */
export async function getTickerNews(ticker: string, limit = 10): Promise<PolyNewsItem[]> {
  const data = await fetchPolygon<{ results: PolyNewsItem[]; status: string }>(
    `/v2/reference/news`,
    { ticker: ticker.toUpperCase(), limit: String(limit), sort: "published_utc", order: "desc" }
  );
  return data.results ?? [];
}

/** 健康检测 */
export async function checkHealth(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const t0 = Date.now();
  try {
    const agg = await getPreviousClose("AAPL");
    const latencyMs = Date.now() - t0;
    if (agg && agg.c > 0) {
      return { ok: true, latencyMs, detail: `AAPL 昨收 $${agg.c.toFixed(2)}` };
    }
    return { ok: false, latencyMs, detail: "返回数据异常" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, detail: String(e) };
  }
}

// ─── 综合数据（供 Step2 数据引擎调用） ────────────────────────────────────

export interface PolygonStockData {
  ticker: string;
  snapshot: PolySnapshot | null;
  details: PolyTickerDetails | null;
  recentNews: PolyNewsItem[];
  weeklyBars: PolyAggregate[];   // 最近 30 个交易日日线
  source: string;
  fetchedAt: string;
}

export async function getStockFullData(ticker: string): Promise<PolygonStockData> {
  const sym = ticker.toUpperCase();
  const toDate = new Date().toISOString().split("T")[0];
  const fromDate = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().split("T")[0];

  const [snapshot, details, news, bars] = await Promise.allSettled([
    getSnapshot(sym),
    getTickerDetails(sym),
    getTickerNews(sym, 5),
    getAggregates(sym, fromDate, toDate),
  ]);

  return {
    ticker: sym,
    snapshot: snapshot.status === "fulfilled" ? snapshot.value : null,
    details: details.status === "fulfilled" ? details.value : null,
    recentNews: news.status === "fulfilled" ? news.value : [],
    weeklyBars: bars.status === "fulfilled" ? bars.value.slice(-30) : [],
    source: "Polygon.io",
    fetchedAt: new Date().toISOString(),
  };
}

/** 格式化 Polygon 数据为 Markdown */
export function formatPolygonData(data: PolygonStockData): string {
  const lines: string[] = [];
  lines.push(`## Polygon.io 市场数据 — ${data.ticker}`);
  lines.push(`*数据来源：Polygon.io | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*\n`);

  if (data.snapshot) {
    const s = data.snapshot;
    const changeSign = s.todaysChangePerc >= 0 ? "+" : "";
    lines.push(`### 实时快照`);
    lines.push(`| 当前价 | 今日涨跌 | 今日涨跌幅 | 成交量 | 昨收 |`);
    lines.push(`|--------|----------|------------|--------|------|`);
    lines.push(`| $${s.day.c.toFixed(2)} | ${changeSign}${s.todaysChange.toFixed(2)} | ${changeSign}${s.todaysChangePerc.toFixed(2)}% | ${(s.day.v / 1e6).toFixed(1)}M | $${s.prevDay.c.toFixed(2)} |`);
  }

  if (data.details) {
    const d = data.details;
    lines.push(`\n### 公司信息`);
    lines.push(`| 公司 | 交易所 | 市值 | 员工数 | 行业 |`);
    lines.push(`|------|--------|------|--------|------|`);
    lines.push(`| ${d.name} | ${d.primary_exchange} | $${d.market_cap ? (d.market_cap / 1e9).toFixed(1) + "B" : "N/A"} | ${d.total_employees?.toLocaleString() ?? "N/A"} | ${d.sic_description ?? "N/A"} |`);
    if (d.description) {
      lines.push(`\n> ${d.description.slice(0, 200)}...`);
    }
  }

  if (data.weeklyBars.length > 0) {
    const bars = data.weeklyBars;
    const first = bars[0];
    const last = bars[bars.length - 1];
    const change = ((last.c - first.c) / first.c * 100).toFixed(2);
    const changeSign = parseFloat(change) >= 0 ? "+" : "";
    lines.push(`\n### 近期走势（最近 ${bars.length} 个交易日）`);
    lines.push(`| 期间 | 起始价 | 最终价 | 区间涨跌 | 最高 | 最低 |`);
    lines.push(`|------|--------|--------|----------|------|------|`);
    lines.push(`| ${new Date(first.t).toLocaleDateString("zh-CN")} — ${new Date(last.t).toLocaleDateString("zh-CN")} | $${first.c.toFixed(2)} | $${last.c.toFixed(2)} | ${changeSign}${change}% | $${Math.max(...bars.map(b => b.h)).toFixed(2)} | $${Math.min(...bars.map(b => b.l)).toFixed(2)} |`);
  }

  if (data.recentNews.length > 0) {
    lines.push(`\n### 近期新闻（${data.recentNews.length} 条）`);
    for (const n of data.recentNews) {
      const date = new Date(n.published_utc).toLocaleDateString("zh-CN");
      const sentiment = n.insights?.[0]?.sentiment;
      const sentimentTag = sentiment ? ` [${sentiment === "positive" ? "利好" : sentiment === "negative" ? "利空" : "中性"}]` : "";
      lines.push(`- **${date}**${sentimentTag} [${n.title.slice(0, 60)}](${n.article_url}) — *${n.publisher.name}*`);
    }
  }

  return lines.join("\n");
}

// ─── 期权链数据（Options Chain） ──────────────────────────────────────────────

export interface PolyOptionContract {
  ticker: string;
  contract_type: "call" | "put";
  expiration_date: string;
  strike_price: number;
  exercise_style: string;
  shares_per_contract: number;
}

export interface PolyOptionsChainData {
  underlying: string;
  /** 近期到期日（最近 3 个到期日） */
  nearTermExpiries: string[];
  /** 各到期日的 Call/Put 合约数量 */
  expiryBreakdown: Array<{ expiry: string; calls: number; puts: number; pcRatio: number }>;
  /** 整体 Put/Call 比率（合约数量维度） */
  putCallRatio: number;
  /** 总 Call 合约数 */
  totalCalls: number;
  /** 总 Put 合约数 */
  totalPuts: number;
  /** 市场关注的 Call 行权价（合约密集区） */
  topCallStrikes: number[];
  /** 市场关注的 Put 行权价（合约密集区） */
  topPutStrikes: number[];
  source: string;
  fetchedAt: string;
}

/** 获取期权链摘要数据（免费层：合约参考数据，计算 Put/Call Ratio 和行权价分布） */
export async function getOptionsChain(symbol: string, daysAhead = 60): Promise<PolyOptionsChainData | null> {
  const sym = symbol.toUpperCase();
  const today = new Date().toISOString().split("T")[0];
  const expMax = new Date(Date.now() + daysAhead * 86400000).toISOString().split("T")[0];

  try {
    const [callsRes, putsRes] = await Promise.allSettled([
      fetchPolygon<{ results: PolyOptionContract[] }>(
        "/v3/reference/options/contracts",
        { underlying_ticker: sym, expiration_date_gte: today, expiration_date_lte: expMax, contract_type: "call", limit: "250" }
      ),
      fetchPolygon<{ results: PolyOptionContract[] }>(
        "/v3/reference/options/contracts",
        { underlying_ticker: sym, expiration_date_gte: today, expiration_date_lte: expMax, contract_type: "put", limit: "250" }
      ),
    ]);

    const calls = callsRes.status === "fulfilled" ? (callsRes.value.results ?? []) : [];
    const puts = putsRes.status === "fulfilled" ? (putsRes.value.results ?? []) : [];

    if (calls.length === 0 && puts.length === 0) return null;

    // 按到期日分组
    const expiryMap = new Map<string, { calls: number; puts: number }>();
    for (const c of calls) {
      const e = expiryMap.get(c.expiration_date) ?? { calls: 0, puts: 0 };
      e.calls++;
      expiryMap.set(c.expiration_date, e);
    }
    for (const p of puts) {
      const e = expiryMap.get(p.expiration_date) ?? { calls: 0, puts: 0 };
      e.puts++;
      expiryMap.set(p.expiration_date, e);
    }

    const expiryBreakdown = Array.from(expiryMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([expiry, { calls: c, puts: p }]) => ({
        expiry,
        calls: c,
        puts: p,
        pcRatio: c > 0 ? parseFloat((p / c).toFixed(2)) : 0,
      }));

    const nearTermExpiries = expiryBreakdown.slice(0, 3).map(e => e.expiry);

    // 行权价分布（出现频次最高的视为市场关注焦点）
    const callStrikeCount = new Map<number, number>();
    const putStrikeCount = new Map<number, number>();
    for (const c of calls) callStrikeCount.set(c.strike_price, (callStrikeCount.get(c.strike_price) ?? 0) + 1);
    for (const p of puts) putStrikeCount.set(p.strike_price, (putStrikeCount.get(p.strike_price) ?? 0) + 1);

    const topCallStrikes = Array.from(callStrikeCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([strike]) => strike)
      .sort((a, b) => a - b);

    const topPutStrikes = Array.from(putStrikeCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([strike]) => strike)
      .sort((a, b) => a - b);

    return {
      underlying: sym,
      nearTermExpiries,
      expiryBreakdown: expiryBreakdown.slice(0, 8),
      putCallRatio: calls.length > 0 ? parseFloat((puts.length / calls.length).toFixed(2)) : 0,
      totalCalls: calls.length,
      totalPuts: puts.length,
      topCallStrikes,
      topPutStrikes,
      source: "Polygon.io Options Chain",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** 格式化期权链数据为 Markdown */
export function formatOptionsChain(data: PolyOptionsChainData): string {
  const lines: string[] = [];
  lines.push(`## Polygon.io 期权链摘要 — ${data.underlying}`);
  lines.push(`*数据来源：Polygon.io Options Reference | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*\n`);

  // 整体 Put/Call 比率
  const pcSignal = data.putCallRatio > 1.2 ? "⚠️ 偏空（市场对冲需求强）" :
    data.putCallRatio < 0.7 ? "📈 偏多（看涨情绪主导）" : "⚖️ 中性";
  lines.push(`### 整体 Put/Call 比率`);
  lines.push(`> **${data.putCallRatio.toFixed(2)}** ${pcSignal}`);
  lines.push(`> 总 Call 合约：${data.totalCalls} 个 | 总 Put 合约：${data.totalPuts} 个（统计范围：未来 60 天）\n`);

  // 近期到期日分布
  if (data.expiryBreakdown.length > 0) {
    lines.push(`### 近期到期日 Put/Call 分布`);
    lines.push(`| 到期日 | Call | Put | P/C 比率 | 情绪 |`);
    lines.push(`|--------|------|-----|----------|------|`);
    for (const e of data.expiryBreakdown) {
      const sentiment = e.pcRatio > 1.2 ? "偏空" : e.pcRatio < 0.7 ? "偏多" : "中性";
      lines.push(`| ${e.expiry} | ${e.calls} | ${e.puts} | ${e.pcRatio.toFixed(2)} | ${sentiment} |`);
    }
  }

  // 市场关注行权价
  if (data.topCallStrikes.length > 0 || data.topPutStrikes.length > 0) {
    lines.push(`\n### 市场关注行权价（合约密集区）`);
    if (data.topCallStrikes.length > 0) {
      lines.push(`- **Call 密集区（阻力位参考）**：$${data.topCallStrikes.join(" / $")}`);
    }
    if (data.topPutStrikes.length > 0) {
      lines.push(`- **Put 密集区（支撑位参考）**：$${data.topPutStrikes.join(" / $")}`);
    }
  }

  return lines.join("\n");
}

// ── IV Smile 数据提取 ──────────────────────────────────────────────────────────

export interface IVSmilePoint {
  strike: number;
  moneyness: number;
  actualIV: number;
  bsIV: number;
  type: "call" | "put";
  expiry?: string;
  midPrice?: number;
}

interface PolyOptionSnapshot {
  details?: { contract_type?: string; expiration_date?: string; strike_price?: number };
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
  implied_volatility?: number;
  last_quote?: { ask?: number; bid?: number; midpoint?: number };
}

/**
 * 从 Polygon 期权快照 API 获取各行权价的实际 IV，构建 IV Smile 数据
 */
export async function getIVSmileData(
  symbol: string,
  spotPrice: number,
  bsSigma: number,
  daysAhead = 45,
): Promise<IVSmilePoint[] | null> {
  const sym = symbol.toUpperCase();
  const today = new Date().toISOString().split("T")[0];
  const expMax = new Date(Date.now() + daysAhead * 86400000).toISOString().split("T")[0];
  const strikeMin = (spotPrice * 0.80).toFixed(2);
  const strikeMax = (spotPrice * 1.20).toFixed(2);

  try {
    const [callsRes, putsRes] = await Promise.allSettled([
      fetchPolygon<{ results: PolyOptionSnapshot[] }>(
        `/v3/snapshot/options/${sym}`,
        { expiration_date_gte: today, expiration_date_lte: expMax, contract_type: "call", strike_price_gte: strikeMin, strike_price_lte: strikeMax, limit: "50" }
      ),
      fetchPolygon<{ results: PolyOptionSnapshot[] }>(
        `/v3/snapshot/options/${sym}`,
        { expiration_date_gte: today, expiration_date_lte: expMax, contract_type: "put", strike_price_gte: strikeMin, strike_price_lte: strikeMax, limit: "50" }
      ),
    ]);

    const calls = callsRes.status === "fulfilled" ? (callsRes.value.results ?? []) : [];
    const puts = putsRes.status === "fulfilled" ? (putsRes.value.results ?? []) : [];
    if (calls.length === 0 && puts.length === 0) return null;

    const bsIVPct = parseFloat((bsSigma * 100).toFixed(2));
    const smilePoints: IVSmilePoint[] = [];

    const processSnap = (snap: PolyOptionSnapshot, type: "call" | "put") => {
      const strike = snap.details?.strike_price;
      const expiry = snap.details?.expiration_date;
      if (!strike || !expiry) return;

      let actualIV: number | null = null;
      if (snap.implied_volatility && snap.implied_volatility > 0 && snap.implied_volatility < 5) {
        actualIV = parseFloat((snap.implied_volatility * 100).toFixed(2));
      } else if (snap.last_quote?.midpoint && snap.last_quote.midpoint > 0) {
        const T = Math.max((new Date(expiry).getTime() - Date.now()) / (365 * 24 * 3600 * 1000), 1 / 365);
        const ivRaw = ivBisect(snap.last_quote.midpoint, spotPrice, strike, T, 0.05, type);
        if (ivRaw !== null) actualIV = parseFloat((ivRaw * 100).toFixed(2));
      }

      if (actualIV !== null && actualIV > 0 && actualIV < 500) {
        smilePoints.push({ strike, moneyness: parseFloat((strike / spotPrice).toFixed(4)), actualIV, bsIV: bsIVPct, type, expiry, midPrice: snap.last_quote?.midpoint });
      }
    };

    for (const snap of calls) processSnap(snap, "call");
    for (const snap of puts) processSnap(snap, "put");

    // 去重：同一行权价取均值
    const grouped = new Map<string, IVSmilePoint[]>();
    for (const p of smilePoints) {
      const key = `${p.type}_${p.strike}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }
    const result: IVSmilePoint[] = [];
    grouped.forEach((pts: IVSmilePoint[]) => {
      const avgIV = pts.reduce((s: number, p: IVSmilePoint) => s + p.actualIV, 0) / pts.length;
      result.push({ ...pts[0], actualIV: parseFloat(avgIV.toFixed(2)) });
    });
    return result.sort((a, b) => a.moneyness - b.moneyness);
  } catch {
    return null;
  }
}

function ivBisect(mktPrice: number, S: number, K: number, T: number, r: number, type: "call" | "put"): number | null {
  let lo = 0.001, hi = 5.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const p = bsPriceLocal(S, K, T, r, mid, type);
    const diff = p - mktPrice;
    if (Math.abs(diff) < 0.001) return mid;
    if (diff > 0) hi = mid; else lo = mid;
  }
  return null;
}

function bsPriceLocal(S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put"): number {
  if (T <= 0 || sigma <= 0) return Math.max(type === "call" ? S - K : K - S, 0);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nc = (x: number) => {
    const sign = x < 0 ? -1 : 1;
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x / 2)));
  };
  const discK = K * Math.exp(-r * T);
  return type === "call" ? S * nc(d1) - discK * nc(d2) : discK * nc(-d2) - S * nc(-d1);
}
