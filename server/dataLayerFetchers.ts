/**
 * ============================================================
 * DATA LAYER FETCHERS — DanTree Phase 1
 * ============================================================
 *
 * 每个路由层的实际 API 调用实现。
 * 本文件只提供 fetcher 函数，不做路由决策。
 * 路由决策由 dataRoutingEngine.ts 的 executeLayerRouting 负责。
 *
 * 规则：
 * - 每个 fetcher 返回 string | null（null = 失败）
 * - 失败时返回 null，不抛出异常
 * - 禁止调用任何未在 DATA_ROUTING_MATRIX 中注册的 API
 * - 禁止：Tavily / Serper / Web search / Scraping
 */

import path from "path";
import { fileURLToPath } from "url";
import { ENV } from "./_core/env";
import { OHLCVBar, computeIndicators, formatIndicatorsMarkdown } from "./localIndicatorEngine";

// ESM 环境下的 __dirname 替代
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 腾讯新闻 CLI 路径（项目内固化路径，相对于本文件所在目录）
// 二进制位于 server/bin/tencent-news-cli
// 如需重新安装，运行: sh server/bin/setup-tencent-news.sh
const TENCENT_NEWS_CLI_PATH = path.resolve(__dirname, "bin", "tencent-news-cli");

const DEFAULT_TIMEOUT = 10000; // 10 秒

function timeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

// ══════════════════════════════════════════════════════════════════════════════
// [Fundamentals] — FMP / SimFin
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchFMPFundamentals(ticker: string): Promise<string | null> {
  try {
    const key = ENV.FMP_API_KEY;
    // 使用 /stable/ 端点（/api/v3/ legacy 已废弃）
    const [profileRes, ratiosRes] = await Promise.allSettled([
      fetch(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${key}`, { signal: timeout(DEFAULT_TIMEOUT) }),
      fetch(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${ticker}&apikey=${key}`, { signal: timeout(DEFAULT_TIMEOUT) }),
    ]);

    const parts: string[] = [];

    if (profileRes.status === "fulfilled" && profileRes.value.ok) {
      const data = await profileRes.value.json() as any;
      const p = Array.isArray(data) ? data[0] : data;
      if (p && p.symbol) {
        parts.push(`## FMP Profile — ${ticker}
| 字段 | 值 |
|------|-----|
| 公司名 | ${p.companyName ?? "N/A"} |
| 行业 | ${p.industry ?? "N/A"} |
| 市值 | ${p.mktCap ? (p.mktCap / 1e9).toFixed(2) + "B" : "N/A"} |
| 股价 | ${p.price ?? "N/A"} |
| Beta | ${p.beta ?? "N/A"} |
| 员工数 | ${p.fullTimeEmployees ?? "N/A"} |`);
      }
    }

    if (ratiosRes.status === "fulfilled" && ratiosRes.value.ok) {
      const data = await ratiosRes.value.json() as any;
      const r = Array.isArray(data) ? data[0] : data;
      if (r && (r.peRatioTTM || r.priceToBookRatioTTM)) {
        parts.push(`## FMP Ratios TTM — ${ticker}
| 指标 | 值 |
|------|-----|
| PE (TTM) | ${r.peRatioTTM?.toFixed(2) ?? "N/A"} |
| PB | ${r.priceToBookRatioTTM?.toFixed(2) ?? "N/A"} |
| PS | ${r.priceToSalesRatioTTM?.toFixed(2) ?? "N/A"} |
| EV/EBITDA | ${r.enterpriseValueMultipleTTM?.toFixed(2) ?? "N/A"} |
| ROE | ${r.returnOnEquityTTM ? (r.returnOnEquityTTM * 100).toFixed(2) + "%" : "N/A"} |
| 净利率 | ${r.netProfitMarginTTM ? (r.netProfitMarginTTM * 100).toFixed(2) + "%" : "N/A"} |`);
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}

export async function fetchSimFinFundamentals(ticker: string): Promise<string | null> {
  try {
    const key = ENV.SIMFIN_API_KEY;
    if (!key) return null;
    // SimFin v3 API — compact format
    const BASE = 'https://backend.simfin.com/api/v3';
    const headers: Record<string, string> = { 'Authorization': `api-key ${key}` };

    // Helper: parse compact response { columns, data } into a key-value object
    const parseCompact = (stmt: any): Record<string, unknown> | null => {
      if (!stmt || !Array.isArray(stmt.columns) || !Array.isArray(stmt.data) || stmt.data.length === 0) return null;
      const cols: string[] = stmt.columns;
      const row: unknown[] = stmt.data[0];
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) {
        if (row[i] !== null && row[i] !== undefined) obj[cols[i]] = row[i];
      }
      return obj;
    };

    // Fetch Income Statement (pl)
    const plRes = await fetch(
      `${BASE}/companies/statements/compact?ticker=${encodeURIComponent(ticker)}&statements=pl&period=FY&fyear=2024`,
      { headers, signal: timeout(DEFAULT_TIMEOUT) }
    );
    let plData: Record<string, unknown> | null = null;
    if (plRes.ok) {
      const plJson = await plRes.json() as any[];
      if (Array.isArray(plJson) && plJson.length > 0) {
        const stmts = plJson[0]?.statements;
        if (Array.isArray(stmts) && stmts.length > 0) {
          plData = parseCompact(stmts[0]);
        }
      }
    }

    // Fetch Derived metrics (gross margin, EPS, FCF, ROE, etc.)
    const derivedRes = await fetch(
      `${BASE}/companies/statements/compact?ticker=${encodeURIComponent(ticker)}&statements=derived&period=FY&fyear=2024`,
      { headers, signal: timeout(DEFAULT_TIMEOUT) }
    );
    let derivedData: Record<string, unknown> | null = null;
    if (derivedRes.ok) {
      const derivedJson = await derivedRes.json() as any[];
      if (Array.isArray(derivedJson) && derivedJson.length > 0) {
        const stmts = derivedJson[0]?.statements;
        if (Array.isArray(stmts) && stmts.length > 0) {
          derivedData = parseCompact(stmts[0]);
        }
      }
    }

    if (!plData && !derivedData) return null;

    const parts: string[] = [];

    if (plData) {
      const fyear = plData['Fiscal Year'] ?? 'N/A';
      const reportDate = plData['Report Date'] ?? 'N/A';
      const fmt = (v: unknown) => (typeof v === 'number' ? (v / 1e9).toFixed(2) + 'B' : String(v ?? 'N/A'));
      const plLines = [
        `Fiscal Year: ${fyear} (Report Date: ${reportDate})`,
        `Revenue: ${fmt(plData['Revenue'])}`,
        `Gross Profit: ${fmt(plData['Gross Profit'])}`,
        `Operating Income: ${fmt(plData['Operating Income (Loss)'])}`,
        `Pretax Income: ${fmt(plData['Pretax Income (Loss)'])}`,
        `Net Income: ${fmt(plData['Net Income'])}`,
        `R&D Expense: ${fmt(plData['Research & Development'])}`,
        `SG&A Expense: ${fmt(plData['Selling, General & Administrative'])}`,
      ].join('\n');
      parts.push(`## SimFin Income Statement (FY${fyear}) — ${ticker}\n${plLines}`);
    }

    if (derivedData) {
      const pct = (v: unknown) => (typeof v === 'number' ? (v * 100).toFixed(2) + '%' : String(v ?? 'N/A'));
      const num = (v: unknown) => (typeof v === 'number' ? v.toFixed(4) : String(v ?? 'N/A'));
      const usd = (v: unknown) => (typeof v === 'number' ? (v / 1e9).toFixed(2) + 'B' : String(v ?? 'N/A'));
      const derivedLines = [
        `Gross Profit Margin: ${pct(derivedData['Gross Profit Margin'])}`,
        `Operating Margin: ${pct(derivedData['Operating Margin'])}`,
        `Net Profit Margin: ${pct(derivedData['Net Profit Margin'])}`,
        `EPS (Diluted): ${num(derivedData['Earnings Per Share, Diluted'])}`,
        `Free Cash Flow: ${usd(derivedData['Free Cash Flow'])}`,
        `Return on Equity: ${pct(derivedData['Return on Equity'])}`,
        `Return on Assets: ${pct(derivedData['Return on Assets'])}`,
        `ROIC: ${pct(derivedData['Return On Invested Capital'])}`,
        `EBITDA: ${usd(derivedData['EBITDA'])}`,
        `Total Debt: ${usd(derivedData['Total Debt'])}`,
      ].join('\n');
      parts.push(`## SimFin Derived Metrics — ${ticker}\n${derivedLines}`);
    }

    return parts.join('\n\n');
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [Price] — Finnhub / Tiingo / Yahoo Finance
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchFinnhubPrice(ticker: string): Promise<string | null> {
  try {
    const key = ENV.FINNHUB_API_KEY;
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`,
      { signal: timeout(DEFAULT_TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data || !data.c || data.c === 0) return null;
    return `## Finnhub Quote — ${ticker}
| 字段 | 值 |
|------|-----|
| 当前价 | ${data.c} |
| 涨跌幅 | ${data.dp?.toFixed(2) ?? "N/A"}% |
| 今日高 | ${data.h ?? "N/A"} |
| 今日低 | ${data.l ?? "N/A"} |
| 开盘价 | ${data.o ?? "N/A"} |
| 昨收价 | ${data.pc ?? "N/A"} |
_截至 ${new Date(data.t * 1000).toISOString().slice(0, 10)}_`;
  } catch {
    return null;
  }
}

export async function fetchTiingoPrice(ticker: string): Promise<string | null> {
  try {
    const key = ENV.TIINGO_API_KEY;
    const res = await fetch(
      `https://api.tiingo.com/tiingo/daily/${ticker}/prices?token=${key}`,
      {
        headers: { "Content-Type": "application/json" },
        signal: timeout(DEFAULT_TIMEOUT),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const item = Array.isArray(data) ? data[0] : data;
    if (!item || !item.close) return null;
    return `## Tiingo Price — ${ticker}
| 字段 | 值 |
|------|-----|
| 收盘价 | ${item.close} |
| 开盘价 | ${item.open ?? "N/A"} |
| 最高价 | ${item.high ?? "N/A"} |
| 最低价 | ${item.low ?? "N/A"} |
| 成交量 | ${item.volume ?? "N/A"} |
_截至 ${item.date?.slice(0, 10) ?? "N/A"}_`;
  } catch {
    return null;
  }
}

export async function fetchYahooPrice(ticker: string): Promise<string | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DanTree/1.0)" },
      signal: timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) return null;
    const json = await res.json() as any;
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) return null;
    return `## Yahoo Finance Quote — ${ticker}
| 字段 | 值 |
|------|-----|
| 当前价 | ${meta.regularMarketPrice} |
| 52W高 | ${meta.fiftyTwoWeekHigh ?? "N/A"} |
| 52W低 | ${meta.fiftyTwoWeekLow ?? "N/A"} |
| 市值 | ${meta.marketCap ? (meta.marketCap / 1e9).toFixed(2) + "B" : "N/A"} |
| 货币 | ${meta.currency ?? "N/A"} |`;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [News - Global] — Finnhub News / Marketaux / NewsAPI
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchFinnhubNews(ticker: string): Promise<string | null> {
  try {
    const key = ENV.FINNHUB_API_KEY;
    const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${key}`,
      { signal: timeout(DEFAULT_TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const headlines = data.slice(0, 5).map(n => `- ${n.headline ?? ""}（${n.source ?? ""}）`).join("\n");
    return `## Finnhub News — ${ticker}（近7天）\n${headlines}`;
  } catch {
    return null;
  }
}

export async function fetchMarketauxNews(ticker: string): Promise<string | null> {
  try {
    const key = ENV.MARKETAUX_API_KEY;
    const res = await fetch(
      `https://api.marketaux.com/v1/news/all?symbols=${ticker}&filter_entities=true&language=en&api_token=${key}&limit=5`,
      { signal: timeout(DEFAULT_TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data?.data || data.data.length === 0) return null;
    const headlines = data.data.map((n: any) => `- ${n.title ?? ""}（${n.source ?? ""}）`).join("\n");
    return `## Marketaux News — ${ticker}\n${headlines}`;
  } catch {
    return null;
  }
}

export async function fetchNewsAPINews(query: string): Promise<string | null> {
  try {
    const key = ENV.NEWS_API_KEY;
    // NewsAPI 必须加 User-Agent，否则返回 400
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=5&apiKey=${key}`,
      {
        headers: {
          "User-Agent": "DanTree/1.0 (investment analysis platform)",
          "X-Api-Key": key,
        },
        signal: timeout(DEFAULT_TIMEOUT),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data?.articles || data.articles.length === 0) return null;
    const headlines = data.articles.map((n: any) => `- ${n.title ?? ""}（${n.source?.name ?? ""}）`).join("\n");
    return `## NewsAPI — ${query}\n${headlines}`;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [News - China] — 腾讯新闻（CLI 调用）
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchTencentNews(query: string): Promise<string | null> {
  try {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    const cliPath = TENCENT_NEWS_CLI_PATH;
    const key = ENV.TENCENT_NEWS_API_KEY;

    // 验证 CLI 二进制存在
    const { existsSync } = await import("fs");
    if (!existsSync(cliPath)) {
      // CLI 不存在，返回 null（missing_key 级别处理）
      return null;
    }

    const { stdout } = await execFileAsync(
      cliPath,
      ["search", query, "--limit", "5"],
      {
        timeout: DEFAULT_TIMEOUT,
        env: {
          ...process.env,
          // 确保 CLI 能读到 API key（CLI 使用 TENCENT_NEWS_APIKEY 变量名）
          TENCENT_NEWS_APIKEY: key,
        },
      }
    );

    if (!stdout || stdout.trim() === "") return null;
    return `## 腾讯新闻 — ${query}\n${stdout.slice(0, 1000)}`;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [Macro] — FRED / World Bank / IMF
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchFREDMacro(seriesIds: string[] = ["FEDFUNDS", "DGS10", "CPIAUCSL"]): Promise<string | null> {
  try {
    const key = ENV.FRED_API_KEY;
    const results: string[] = [];

    for (const seriesId of seriesIds.slice(0, 3)) {
      try {
        const res = await fetch(
          `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&limit=1&sort_order=desc`,
          { signal: timeout(DEFAULT_TIMEOUT) }
        );
        if (!res.ok) continue;
        const data = await res.json() as any;
        const obs = data?.observations?.[0];
        if (obs) results.push(`${seriesId}: ${obs.value} (${obs.date})`);
      } catch {
        // 单个 series 失败不影响其他
      }
    }

    return results.length > 0 ? `## FRED 宏观指标\n${results.join("\n")}` : null;
  } catch {
    return null;
  }
}

export async function fetchWorldBankMacro(indicator: string = "NY.GDP.MKTP.CD", country: string = "US"): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&mrv=1`,
      { signal: timeout(DEFAULT_TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const item = data?.[1]?.[0];
    if (!item || item.value === null) return null;
    return `## World Bank — ${indicator} (${country})\n值：${item.value} (${item.date})`;
  } catch {
    return null;
  }
}

export async function fetchIMFMacro(): Promise<string | null> {
  try {
    // IMF WEO 公开数据
    const res = await fetch(
      `https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/USA?periods=2024,2025`,
      { signal: timeout(DEFAULT_TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const usaData = data?.values?.NGDP_RPCH?.USA;
    if (!usaData) return null;
    const entries = Object.entries(usaData).map(([year, val]) => `${year}: ${val}%`).join(", ");
    return `## IMF WEO — 美国 GDP 增速\n${entries}`;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [Alternative] — QuiverQuant / Polymarket
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchQuiverQuantCongress(ticker: string): Promise<string | null> {
  try {
    const key = ENV.QUIVER_QUANT_API_KEY;
    const res = await fetch(
      `https://api.quiverquant.com/beta/historical/congresstrading/${ticker}`,
      {
        headers: { "Authorization": `Token ${key}` },
        signal: timeout(DEFAULT_TIMEOUT),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as any[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const recent = data.slice(0, 5).map(t =>
      `- ${t.Representative ?? "N/A"} | ${t.Transaction ?? "N/A"} | ${t.Range ?? "N/A"} | ${t.Date ?? "N/A"}`
    ).join("\n");
    return `## QuiverQuant 国会交易 — ${ticker}\n${recent}`;
  } catch {
    return null;
  }
}

export async function fetchPolymarketSentiment(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?search=${encodeURIComponent(query)}&limit=3&active=true`,
      { signal: timeout(DEFAULT_TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const markets = data.map(m => `- ${m.question ?? "N/A"} | 流动性: $${m.liquidity ?? "N/A"}`).join("\n");
    return `## Polymarket 预测市场 — ${query}\n${markets}`;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [Indicators - US] — Twelve Data / Alpha Vantage
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchTwelveDataIndicators(ticker: string): Promise<string | null> {
  try {
    const key = ENV.TWELVE_DATA_API_KEY;
    if (!key) return null;

    // 获取 OHLCV 数据（60 根日线）
    const res = await fetch(
      `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=60&apikey=${key}`,
      { signal: timeout(DEFAULT_TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.status === "error" || !data.values) return null;

    // 转换为 OHLCVBar 格式
    const bars: OHLCVBar[] = (data.values as any[])
      .reverse() // Twelve Data 返回降序，需转为升序
      .map((v: any) => ({
        timestamp: new Date(v.datetime).getTime(),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume ?? "0"),
      }))
      .filter(b => !isNaN(b.close));

    if (bars.length < 14) return null;

    const indicators = computeIndicators(bars);
    return formatIndicatorsMarkdown(ticker, indicators);
  } catch {
    return null;
  }
}

export async function fetchAlphaVantageIndicators(ticker: string): Promise<string | null> {
  try {
    const key = ENV.ALPHA_VANTAGE_API_KEY;
    // Alpha Vantage: 获取日线 OHLCV
    const res = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=compact&apikey=${key}`,
      { signal: timeout(DEFAULT_TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const timeSeries = data["Time Series (Daily)"];
    if (!timeSeries) return null;

    const bars: OHLCVBar[] = Object.entries(timeSeries)
      .sort(([a], [b]) => a.localeCompare(b)) // 升序
      .slice(-60)
      .map(([date, v]: [string, any]) => ({
        timestamp: new Date(date).getTime(),
        open: parseFloat(v["1. open"]),
        high: parseFloat(v["2. high"]),
        low: parseFloat(v["3. low"]),
        close: parseFloat(v["4. close"]),
        volume: parseFloat(v["5. volume"] ?? "0"),
      }))
      .filter(b => !isNaN(b.close));

    if (bars.length < 14) return null;

    const indicators = computeIndicators(bars);
    return formatIndicatorsMarkdown(ticker + " (Alpha Vantage)", indicators);
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [Indicators - CN/HK] — Yahoo OHLCV → 本地计算
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchYahooOHLCVForIndicators(ticker: string): Promise<string | null> {
  try {
    // Yahoo Finance: 获取 3 个月日线数据
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3mo`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DanTree/1.0)" },
      signal: timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) return null;
    const json = await res.json() as any;
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const ohlcv = result.indicators?.quote?.[0];
    if (!ohlcv || timestamps.length === 0) return null;

    const bars: OHLCVBar[] = timestamps
      .map((ts: number, i: number) => ({
        timestamp: ts * 1000,
        open: ohlcv.open?.[i] ?? 0,
        high: ohlcv.high?.[i] ?? 0,
        low: ohlcv.low?.[i] ?? 0,
        close: ohlcv.close?.[i] ?? 0,
        volume: ohlcv.volume?.[i] ?? 0,
      }))
      .filter(b => b.close > 0);

    if (bars.length < 14) return null;

    const indicators = computeIndicators(bars);
    return formatIndicatorsMarkdown(ticker, indicators);
  } catch {
    return null;
  }
}
