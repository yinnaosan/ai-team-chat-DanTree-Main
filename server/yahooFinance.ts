/**
 * Yahoo Finance real-time stock data via Manus built-in callDataApi
 * Supports: US stocks (AAPL), HK stocks (0700.HK / ^HSI), A-shares (600519.SS / 000300.SS)
 *
 * Fallback strategy:
 *   - If regularMarketPrice is unavailable (market closed / pre-market), fall back to
 *     the most recent close from the chart's historical OHLCV array.
 *   - Data source label is adjusted accordingly: "实时" vs "最近收盘（上一交易日）"
 */

import { callDataApi } from "./_core/dataApi";

// ─── Ticker normalization ─────────────────────────────────────────────────────

/**
 * Detect market and normalize ticker symbol
 */
function normalizeTicker(input: string): string {
  const ticker = input.trim().toUpperCase();

  // Already has suffix or is an index (^HSI, ^GSPC …)
  if (ticker.includes(".") || ticker.startsWith("^")) return ticker;

  // Common A-share patterns (6-digit starting with 6/0/3)
  if (/^[036]\d{5}$/.test(ticker)) {
    if (ticker.startsWith("6")) return `${ticker}.SS`; // Shanghai
    return `${ticker}.SZ`; // Shenzhen
  }

  // HK stocks (4-5 digit numbers)
  if (/^\d{4,5}$/.test(ticker)) return `${ticker}.HK`;

  // Default: US stock
  return ticker;
}

// ─── Name → ticker mapping ────────────────────────────────────────────────────

const NAME_MAP: Record<string, string> = {
  // US
  苹果: "AAPL", apple: "AAPL",
  微软: "MSFT", microsoft: "MSFT",
  谷歌: "GOOGL", google: "GOOGL", alphabet: "GOOGL",
  亚马逊: "AMZN", amazon: "AMZN",
  英伟达: "NVDA", nvidia: "NVDA",
  特斯拉: "TSLA", tesla: "TSLA",
  脸书: "META", facebook: "META", meta: "META",
  京东: "JD", jd: "JD",
  拼多多: "PDD", pdd: "PDD",
  网易: "NTES", netease: "NTES",
  百度: "BIDU", baidu: "BIDU",
  阿里巴巴: "BABA", alibaba: "BABA", 阿里: "BABA",

  // HK stocks
  腾讯: "0700.HK", tencent: "0700.HK",
  美团: "3690.HK", meituan: "3690.HK",
  小米: "1810.HK", xiaomi: "1810.HK",
  港交所: "0388.HK", hkex: "0388.HK",
  汇丰: "0005.HK", hsbc: "0005.HK",
  中国移动: "0941.HK",
  中国联通: "0762.HK",
  中国电信: "0728.HK",
  中国建设银行: "0939.HK",
  中国工商银行: "1398.HK",
  中国银行: "3988.HK",
  中国人寿: "2628.HK",
  中国人保: "1339.HK",
  友邦保险: "1299.HK", aia: "1299.HK",
  快手: "1024.HK",
  网易港股: "9999.HK",
  京东港股: "9618.HK",
  阿里港股: "9988.HK",
  百度港股: "9888.HK",
  小鹏汽车: "9868.HK",
  理想汽车: "2015.HK",
  蔚来: "9866.HK",

  // A shares
  茅台: "600519.SS", 贵州茅台: "600519.SS",
  宁德时代: "300750.SZ", catl: "300750.SZ",
  比亚迪: "002594.SZ", byd: "002594.SZ",
  中国平安: "601318.SS",
  工商银行: "601398.SS",
  招商银行: "600036.SS",
  中国石油: "601857.SS",
  中国石化: "600028.SS",
  中国银行A: "601988.SS",
  建设银行: "601939.SS",
  农业银行: "601288.SS",
  兴业银行: "601166.SS",
  浦发银行: "600000.SS",
  民生银行: "600016.SS",
  中信证券: "600030.SS",
  海天味业: "603288.SS",
  五粮液: "000858.SZ",
  格力电器: "000651.SZ",
  美的集团: "000333.SZ",
  万科: "000002.SZ",
  隆基绿能: "601012.SS",
  通威股份: "600438.SS",
  迈瑞医疗: "300760.SZ",
  药明康德: "603259.SS",
  恒瑞医药: "600276.SS",
  东方财富: "300059.SZ",
  中芯国际: "688981.SS",
  华为: "002502.SZ",  // 华为概念股（深桑达A）
  中国中免: "601888.SS",
  海尔智家: "600690.SS",
  海信视像: "600060.SS",

  // Indices
  沪深300: "000300.SS", "csi 300": "000300.SS", csi300: "000300.SS", 沪深三百: "000300.SS",
  上证指数: "000001.SS", 上证: "000001.SS", 上证综指: "000001.SS",
  深证成指: "399001.SZ", 深证: "399001.SZ",
  创业板: "399006.SZ", 创业板指: "399006.SZ",
  科创50: "000688.SS",
  中证500: "000905.SS",
  中证1000: "000852.SS",
  恒生指数: "^HSI", 恒指: "^HSI", hsi: "^HSI",
  恒生科技: "^HSTECH", 恒科: "^HSTECH",
  标普500: "^GSPC", "s&p500": "^GSPC", sp500: "^GSPC",
  纳斯达克: "^IXIC", nasdaq: "^IXIC",
  道琼斯: "^DJI", dow: "^DJI",
  日经225: "^N225", 日经: "^N225",
  富时100: "^FTSE", ftse: "^FTSE",
  德国DAX: "^GDAXI", dax: "^GDAXI",
};

// ─── Ticker extraction ────────────────────────────────────────────────────────

/**
 * Extract tickers from a natural language query
 * e.g. "分析苹果AAPL和腾讯0700.HK" → ["AAPL", "0700.HK"]
 */
export function extractTickers(text: string): string[] {
  const tickers: string[] = [];

  // Match explicit tickers: AAPL, 0700.HK, 600519.SS, 600519.SZ, ^HSI
  const explicitPattern = /\b(\^?[A-Z]{1,6}(?:\.[A-Z]{1,2})?|\d{4,6}(?:\.[A-Z]{1,2})?)\b/g;
  let m: RegExpExecArray | null;
  const NON_TICKER_WORDS = new Set([
    "USD", "CNY", "HKD", "EUR", "GBP", "JPY", "GDP", "CPI", "ETF", "IPO",
    "PE", "PB", "EPS", "ROE", "FCF", "AI", "CEO", "CFO", "COO", "CTO",
    "SEC", "FED", "IMF", "ECB", "BOE", "API", "DCF", "YOY", "QOQ", "TTM",
    "NAV", "AUM", "ESG", "BIS", "WTO", "WHO", "UN", "EU", "US", "UK", "CN",
    "HK", "SS", "SZ", "NYSE", "NASDAQ",
  ]);
  while ((m = explicitPattern.exec(text)) !== null) {
    const t = m[1];
    if (NON_TICKER_WORDS.has(t)) continue;
    // Filter pure numbers that look like years
    if (/^\d{4,6}$/.test(t)) {
      const num = parseInt(t, 10);
      if (t.length === 4 && num >= 1990 && num <= 2099) continue;
    }
    tickers.push(normalizeTicker(t));
  }

  // Name → ticker mapping
  const lowerText = text.toLowerCase();
  for (const [name, ticker] of Object.entries(NAME_MAP)) {
    if (lowerText.includes(name.toLowerCase()) && !tickers.includes(ticker)) {
      tickers.push(ticker);
    }
  }

  return Array.from(new Set(tickers)).slice(0, 6); // Max 6 tickers
}

// ─── Fallback price helper ────────────────────────────────────────────────────

/**
 * Extract the most recent close price from chart OHLCV arrays.
 * Used when regularMarketPrice is unavailable (pre-market / closed market).
 */
function extractLatestCloseFromChart(chartAny: any): { price: number; date: string } | null {
  try {
    const result = chartAny?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];
    if (!timestamps.length || !closes.length) return null;

    // Find the last non-null close
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null && !isNaN(closes[i])) {
        const ts = timestamps[i];
        const date = new Date(ts * 1000).toLocaleDateString("zh-CN", {
          year: "numeric", month: "2-digit", day: "2-digit",
        });
        return { price: closes[i], date };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Single ticker data fetch ─────────────────────────────────────────────────

/**
 * Fetch stock data for a single ticker.
 * Falls back to the most recent historical close when real-time price is unavailable.
 *
 * @param ticker 股票代码
 * @param range  时间范围："1mo"|"3mo"|"6mo"|"1y"|"2y"|"5y"，默认 "1y"
 */
export async function getStockData(ticker: string, range: string = "1y"): Promise<string> {
  try {
    const normalized = normalizeTicker(ticker);
    // Choose interval based on range
    const interval =
      range === "1mo" || range === "3mo" ? "1d" :
      range === "6mo" ? "1d" :
      range === "1y" ? "1wk" : "1mo";

    // Fetch chart data (real-time meta + OHLCV history)
    const chartData = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: normalized, interval, range },
    });

    const chartAny = chartData as any;
    const meta = chartAny?.chart?.result?.[0]?.meta;
    if (!meta) return `无法获取 ${ticker} 的数据`;

    // ── Price with fallback ──────────────────────────────────────────────────
    let currentPrice: number | undefined = meta.regularMarketPrice;
    let priceLabel = "实时价格";
    let dataNote = "";

    if (!currentPrice || currentPrice === 0) {
      // Try previousClose first (always available in meta)
      if (meta.previousClose && meta.previousClose > 0) {
        currentPrice = meta.previousClose;
        priceLabel = "最近收盘价（上一交易日）";
        dataNote = "⚠️ 当前市场未开盘或数据暂不可用，以下为最近一个交易日收盘数据。";
      } else {
        // Last resort: extract from historical OHLCV
        const latestClose = extractLatestCloseFromChart(chartAny);
        if (latestClose) {
          currentPrice = latestClose.price;
          priceLabel = `最近收盘价（${latestClose.date}）`;
          dataNote = `⚠️ 实时数据暂不可用，以下为 ${latestClose.date} 收盘数据。`;
        }
      }
    }

    if (!currentPrice || currentPrice === 0) {
      return `暂无 ${ticker} 的价格数据（市场可能未开盘，请稍后重试）`;
    }

    const prevClose = meta.previousClose ?? currentPrice;
    const change = currentPrice - prevClose;
    const changePct = prevClose > 0 ? ((change / prevClose) * 100).toFixed(2) : "N/A";
    const week52High = meta.fiftyTwoWeekHigh;
    const week52Low = meta.fiftyTwoWeekLow;
    const currency = meta.currency ?? "";
    const marketCap = meta.marketCap;

    const lines: string[] = [];

    if (dataNote) lines.push(dataNote);

    lines.push(`### ${meta.longName || normalized} (${normalized})`);
    lines.push(`- **${priceLabel}**: ${currentPrice.toFixed(2)} ${currency}`);

    if (priceLabel === "实时价格") {
      lines.push(`- **涨跌**: ${change >= 0 ? "+" : ""}${change.toFixed(2)} (${change >= 0 ? "+" : ""}${changePct}%)`);
    }

    if (week52High && week52Low) {
      lines.push(`- **52周高/低**: ${week52High.toFixed(2)} / ${week52Low.toFixed(2)} ${currency}`);
    }

    if (marketCap) {
      const capB = (marketCap / 1e9).toFixed(1);
      lines.push(`- **市值**: ${capB}B ${currency}`);
    }

    // Exchange / timezone info (helpful for A-share / HK context)
    if (meta.exchangeName) {
      lines.push(`- **交易所**: ${meta.exchangeName}`);
    }
    if (meta.timezone) {
      lines.push(`- **时区**: ${meta.timezone}`);
    }

    // Try to get insights (analyst ratings, technicals) — non-critical
    try {
      const insights = await callDataApi("YahooFinance/get_stock_insights", {
        query: { symbol: normalized },
      });
      const insightsAny = insights as any;
      const techOutlook = insightsAny?.finance?.result?.instrumentInfo?.technicalEvents?.shortTermOutlook;
      const midOutlook = insightsAny?.finance?.result?.instrumentInfo?.technicalEvents?.intermediateTermOutlook;
      if (techOutlook?.stateDescription) {
        lines.push(`- **短期技术面**: ${techOutlook.stateDescription}`);
      }
      if (midOutlook?.stateDescription) {
        lines.push(`- **中期技术面**: ${midOutlook.stateDescription}`);
      }
    } catch {
      // Insights not critical, skip silently
    }

    return lines.join("\n");
  } catch (err: any) {
    return `获取 ${ticker} 数据失败: ${err.message}`;
  }
}

// ─── Multiple tickers ─────────────────────────────────────────────────────────

/**
 * Fetch data for multiple tickers and return combined report
 * @param tickers 股票代码列表
 * @param range   时间范围，默认 "1y"
 */
export async function getMultipleStocksData(tickers: string[], range: string = "1y"): Promise<string> {
  if (tickers.length === 0) return "";

  const results = await Promise.allSettled(tickers.map((t) => getStockData(t, range)));

  const lines = [`## 股票行情数据（来源：Yahoo Finance | 时间范围：${range}）\n`];
  for (const result of results) {
    if (result.status === "fulfilled") {
      lines.push(result.value);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── Task-level entry points ──────────────────────────────────────────────────

/**
 * Main entry: given a task description, extract tickers and fetch data
 * @param taskDescription 任务描述
 * @param period          时间范围（来自 Step1 解析），默认 "1y"
 */
export async function fetchStockDataForTask(taskDescription: string, period: string = "1y"): Promise<string> {
  const tickers = extractTickers(taskDescription);
  if (tickers.length === 0) return "";
  return getMultipleStocksData(tickers, period);
}

/**
 * 去重版：从任务描述中提取 ticker，但跳过已由 Baostock 处理的 A 股代码
 * 规则：
 *   - A 股代码（600519.SS / 000001.SZ）→ 由 Baostock 处理，Yahoo Finance 跳过
 *   - 港股（0700.HK）、美股（AAPL）、指数（^HSI / 000300.SS）→ 由 Yahoo Finance 处理
 */
export async function fetchStockDataForTaskWithDedup(
  taskDescription: string,
  aStockCodesHandledByBaostock: string[]
): Promise<string> {
  const tickers = extractTickers(taskDescription);
  if (tickers.length === 0) return "";

  // Convert Baostock codes to Yahoo format for dedup comparison
  const baostockAsYahoo = new Set(
    aStockCodesHandledByBaostock.map(bsCode => {
      const shMatch = bsCode.match(/^sh\.(\d{6})$/i);
      if (shMatch) return `${shMatch[1]}.SS`;
      const szMatch = bsCode.match(/^sz\.(\d{6})$/i);
      if (szMatch) return `${szMatch[1]}.SZ`;
      return null;
    }).filter(Boolean) as string[]
  );

  // Keep indices (000300.SS, ^HSI) even if they look like A-share codes
  const filteredTickers = tickers.filter(ticker => {
    const isAShare = /^\d{6}\.(SS|SZ)$/i.test(ticker);
    if (isAShare && baostockAsYahoo.has(ticker.toUpperCase())) {
      return false; // Skip: already handled by Baostock
    }
    return true;
  });

  if (filteredTickers.length === 0) return "";
  return getMultipleStocksData(filteredTickers);
}
