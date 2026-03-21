/**
 * Alpha Vantage API 模块
 * 数据来源：Alpha Vantage (https://www.alphavantage.co)
 * 提供：实时报价、公司概况、技术指标、外汇汇率、加密货币、经济指标
 */

const AV_BASE = "https://www.alphavantage.co/query";

function getKey(): string {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error("ALPHA_VANTAGE_API_KEY 未配置");
  return key;
}

async function fetchAV<T>(params: Record<string, string>): Promise<T> {
  const key = getKey();
  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  const url = `${AV_BASE}?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  // 检测限流提示
  if (data["Note"] || data["Information"]) {
    throw new Error(`Alpha Vantage 限流: ${data["Note"] ?? data["Information"]}`);
  }
  return data as T;
}

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface AVGlobalQuote {
  "01. symbol": string;
  "02. open": string;
  "03. high": string;
  "04. low": string;
  "05. price": string;
  "06. volume": string;
  "07. latest trading day": string;
  "08. previous close": string;
  "09. change": string;
  "10. change percent": string;
}

export interface AVCompanyOverview {
  Symbol: string;
  Name: string;
  Description: string;
  Exchange: string;
  Currency: string;
  Country: string;
  Sector: string;
  Industry: string;
  MarketCapitalization: string;
  PERatio: string;
  PEGRatio: string;
  BookValue: string;
  DividendPerShare: string;
  DividendYield: string;
  EPS: string;
  RevenuePerShareTTM: string;
  ProfitMargin: string;
  OperatingMarginTTM: string;
  ReturnOnAssetsTTM: string;
  ReturnOnEquityTTM: string;
  RevenueTTM: string;
  GrossProfitTTM: string;
  DilutedEPSTTM: string;
  QuarterlyEarningsGrowthYOY: string;
  QuarterlyRevenueGrowthYOY: string;
  AnalystTargetPrice: string;
  TrailingPE: string;
  ForwardPE: string;
  PriceToSalesRatioTTM: string;
  PriceToBookRatio: string;
  EVToRevenue: string;
  EVToEBITDA: string;
  Beta: string;
  "52WeekHigh": string;
  "52WeekLow": string;
  "50DayMovingAverage": string;
  "200DayMovingAverage": string;
  SharesOutstanding: string;
}

export interface AVEconomicDataPoint {
  date: string;
  value: string;
}

export interface AVExchangeRate {
  "1. From_Currency Code": string;
  "2. From_Currency Name": string;
  "3. To_Currency Code": string;
  "4. To_Currency Name": string;
  "5. Exchange Rate": string;
  "6. Last Refreshed": string;
  "7. Time Zone": string;
  "8. Bid Price": string;
  "9. Ask Price": string;
}

// ─── 核心函数 ──────────────────────────────────────────────────────────────

/** 实时报价 */
export async function getGlobalQuote(symbol: string): Promise<AVGlobalQuote> {
  const data = await fetchAV<{ "Global Quote": AVGlobalQuote }>({
    function: "GLOBAL_QUOTE",
    symbol: symbol.toUpperCase(),
  });
  return data["Global Quote"];
}

/** 公司概况（含估值指标） */
export async function getCompanyOverview(symbol: string): Promise<AVCompanyOverview> {
  return fetchAV<AVCompanyOverview>({
    function: "OVERVIEW",
    symbol: symbol.toUpperCase(),
  });
}

/** 外汇实时汇率 */
export async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<AVExchangeRate> {
  const data = await fetchAV<{ "Realtime Currency Exchange Rate": AVExchangeRate }>({
    function: "CURRENCY_EXCHANGE_RATE",
    from_currency: fromCurrency.toUpperCase(),
    to_currency: toCurrency.toUpperCase(),
  });
  return data["Realtime Currency Exchange Rate"];
}

/** 联邦基金利率（月度） */
export async function getFederalFundsRate(): Promise<AVEconomicDataPoint[]> {
  const data = await fetchAV<{ data: AVEconomicDataPoint[] }>({
    function: "FEDERAL_FUNDS_RATE",
    interval: "monthly",
  });
  return (data.data ?? []).slice(0, 12);
}

/** CPI 通胀率（月度） */
export async function getCPI(): Promise<AVEconomicDataPoint[]> {
  const data = await fetchAV<{ data: AVEconomicDataPoint[] }>({
    function: "CPI",
    interval: "monthly",
  });
  return (data.data ?? []).slice(0, 12);
}

/** 失业率（月度） */
export async function getUnemploymentRate(): Promise<AVEconomicDataPoint[]> {
  const data = await fetchAV<{ data: AVEconomicDataPoint[] }>({
    function: "UNEMPLOYMENT",
  });
  return (data.data ?? []).slice(0, 12);
}

/** 健康检测 */
export async function checkHealth(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const t0 = Date.now();
  try {
    const q = await getGlobalQuote("AAPL");
    const latencyMs = Date.now() - t0;
    const price = parseFloat(q["05. price"] ?? "0");
    if (price > 0) {
      return { ok: true, latencyMs, detail: `AAPL $${price.toFixed(2)}` };
    }
    return { ok: false, latencyMs, detail: "返回数据异常" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, detail: String(e) };
  }
}

// ─── 综合数据（供 Step2 数据引擎调用） ────────────────────────────────────

export interface AlphaVantageStockData {
  symbol: string;
  quote: AVGlobalQuote | null;
  overview: Partial<AVCompanyOverview> | null;
  source: string;
  fetchedAt: string;
}

export interface AlphaVantageEconomicData {
  federalFundsRate: AVEconomicDataPoint[];
  cpi: AVEconomicDataPoint[];
  unemploymentRate: AVEconomicDataPoint[];
  usdCny: AVExchangeRate | null;
  usdEur: AVExchangeRate | null;
  source: string;
  fetchedAt: string;
}

/** 获取股票综合数据 */
export async function getStockData(symbol: string): Promise<AlphaVantageStockData> {
  const sym = symbol.toUpperCase();
  const [quote, overview] = await Promise.allSettled([
    getGlobalQuote(sym),
    getCompanyOverview(sym),
  ]);
  return {
    symbol: sym,
    quote: quote.status === "fulfilled" ? quote.value : null,
    overview: overview.status === "fulfilled" ? overview.value : null,
    source: "Alpha Vantage",
    fetchedAt: new Date().toISOString(),
  };
}

/** 获取宏观经济数据（并行，限流保护：最多 5 个并发） */
export async function getEconomicData(): Promise<AlphaVantageEconomicData> {
  // Alpha Vantage 免费版限速 5 req/min，使用 allSettled 避免整体失败
  const [ffr, cpi, unemp, usdCny, usdEur] = await Promise.allSettled([
    getFederalFundsRate(),
    getCPI(),
    getUnemploymentRate(),
    getExchangeRate("USD", "CNY"),
    getExchangeRate("USD", "EUR"),
  ]);
  return {
    federalFundsRate: ffr.status === "fulfilled" ? ffr.value : [],
    cpi: cpi.status === "fulfilled" ? cpi.value : [],
    unemploymentRate: unemp.status === "fulfilled" ? unemp.value : [],
    usdCny: usdCny.status === "fulfilled" ? usdCny.value : null,
    usdEur: usdEur.status === "fulfilled" ? usdEur.value : null,
    source: "Alpha Vantage",
    fetchedAt: new Date().toISOString(),
  };
}

/** 格式化宏观经济数据为 Markdown */
export function formatEconomicData(data: AlphaVantageEconomicData): string {
  const lines: string[] = [];
  lines.push(`## Alpha Vantage 宏观经济数据`);
  lines.push(`*数据来源：Alpha Vantage Economic Indicators | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*\n`);

  // 汇率
  if (data.usdCny || data.usdEur) {
    lines.push(`### 实时汇率`);
    lines.push(`| 货币对 | 汇率 | 更新时间 |`);
    lines.push(`|--------|------|----------|`);
    if (data.usdCny) {
      lines.push(`| USD/CNY | ${parseFloat(data.usdCny["5. Exchange Rate"]).toFixed(4)} | ${data.usdCny["6. Last Refreshed"]} |`);
    }
    if (data.usdEur) {
      lines.push(`| USD/EUR | ${parseFloat(data.usdEur["5. Exchange Rate"]).toFixed(4)} | ${data.usdEur["6. Last Refreshed"]} |`);
    }
  }

  // 联邦基金利率（最近 6 个月）
  if (data.federalFundsRate.length > 0) {
    const recent = data.federalFundsRate.slice(0, 6);
    lines.push(`\n### 美联储基准利率（月度，最近 ${recent.length} 期）`);
    lines.push(`| 日期 | 利率 |`);
    lines.push(`|------|------|`);
    for (const d of recent) {
      lines.push(`| ${d.date} | ${d.value}% |`);
    }
  }

  // CPI（最近 6 个月）
  if (data.cpi.length > 0) {
    const recent = data.cpi.slice(0, 6);
    lines.push(`\n### 美国 CPI 通胀指数（月度，最近 ${recent.length} 期）`);
    lines.push(`| 日期 | CPI |`);
    lines.push(`|------|-----|`);
    for (const d of recent) {
      lines.push(`| ${d.date} | ${d.value} |`);
    }
  }

  // 失业率（最近 6 个月）
  if (data.unemploymentRate.length > 0) {
    const recent = data.unemploymentRate.slice(0, 6);
    lines.push(`\n### 美国失业率（月度，最近 ${recent.length} 期）`);
    lines.push(`| 日期 | 失业率 |`);
    lines.push(`|------|--------|`);
    for (const d of recent) {
      lines.push(`| ${d.date} | ${d.value}% |`);
    }
  }

  return lines.join("\n");
}

/** 格式化股票数据为 Markdown */
export function formatStockData(data: AlphaVantageStockData): string {
  const lines: string[] = [];
  lines.push(`## Alpha Vantage 股票数据 — ${data.symbol}`);
  lines.push(`*数据来源：Alpha Vantage | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*\n`);

  if (data.quote) {
    const q = data.quote;
    const change = parseFloat(q["09. change"]);
    const changeSign = change >= 0 ? "+" : "";
    lines.push(`### 实时报价`);
    lines.push(`| 当前价 | 涨跌额 | 涨跌幅 | 开盘 | 日高 | 日低 | 昨收 |`);
    lines.push(`|--------|--------|--------|------|------|------|------|`);
    lines.push(`| $${parseFloat(q["05. price"]).toFixed(2)} | ${changeSign}${change.toFixed(2)} | ${q["10. change percent"]} | $${parseFloat(q["02. open"]).toFixed(2)} | $${parseFloat(q["03. high"]).toFixed(2)} | $${parseFloat(q["04. low"]).toFixed(2)} | $${parseFloat(q["08. previous close"]).toFixed(2)} |`);
  }

  if (data.overview && data.overview.Name) {
    const o = data.overview;
    lines.push(`\n### 公司概况与估值`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    if (o.Name) lines.push(`| 公司名称 | ${o.Name} |`);
    if (o.Sector) lines.push(`| 行业 | ${o.Sector} / ${o.Industry} |`);
    if (o.MarketCapitalization) lines.push(`| 市值 | $${(parseInt(o.MarketCapitalization) / 1e9).toFixed(1)}B |`);
    if (o.PERatio) lines.push(`| PE（TTM） | ${o.PERatio} |`);
    if (o.PriceToBookRatio) lines.push(`| PB | ${o.PriceToBookRatio} |`);
    if (o.EPS) lines.push(`| EPS | $${o.EPS} |`);
    if (o.DividendYield) lines.push(`| 股息率 | ${(parseFloat(o.DividendYield) * 100).toFixed(2)}% |`);
    if (o.ReturnOnEquityTTM) lines.push(`| ROE（TTM） | ${(parseFloat(o.ReturnOnEquityTTM) * 100).toFixed(1)}% |`);
    if (o.AnalystTargetPrice) lines.push(`| 分析师目标价 | $${o.AnalystTargetPrice} |`);
    if (o["52WeekHigh"] && o["52WeekLow"]) lines.push(`| 52周区间 | $${o["52WeekLow"]} — $${o["52WeekHigh"]} |`);
  }

  return lines.join("\n");
}
