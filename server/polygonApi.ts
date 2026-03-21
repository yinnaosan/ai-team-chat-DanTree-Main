/**
 * Polygon.io API 模块
 * 数据来源：Polygon.io (https://polygon.io)
 * 提供：股票聚合数据、实时快照、公司详情、新闻、技术指标、期权、外汇
 */

const POLY_BASE = "https://api.polygon.io";

function getKey(): string {
  const key = process.env.POLYGON_API_KEY;
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
    { adjusted: "true", sort: "asc", limit: "120" }
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
