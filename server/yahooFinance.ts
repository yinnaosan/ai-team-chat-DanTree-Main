/**
 * Yahoo Finance real-time stock data via Manus built-in callDataApi
 * Supports: US stocks (AAPL), HK stocks (0700.HK), A-shares (600519.SS)
 */

import { callDataApi } from "./_core/dataApi";

/**
 * Detect market and normalize ticker symbol
 */
function normalizeTicker(input: string): string {
  const ticker = input.trim().toUpperCase();

  // Already has suffix
  if (ticker.includes(".")) return ticker;

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

/**
 * Extract tickers from a natural language query
 * e.g. "分析苹果AAPL和腾讯0700.HK" → ["AAPL", "0700.HK"]
 */
export function extractTickers(text: string): string[] {
  const tickers: string[] = [];

  // Match explicit tickers: AAPL, 0700.HK, 600519.SS, 600519.SZ
  const explicitPattern = /\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?|\d{4,6}(?:\.[A-Z]{1,2})?)\b/g;
  let m: RegExpExecArray | null;
  // 常见非 ticker 大写词 + 年份范围过滤
  const NON_TICKER_WORDS = new Set(["USD", "CNY", "HKD", "EUR", "GDP", "CPI", "ETF", "IPO", "PE", "PB", "EPS", "ROE", "FCF", "AI", "CEO", "CFO", "COO", "CTO", "SEC", "FED", "IMF", "ECB", "BOE", "API", "DCF", "YOY", "QOQ", "TTM", "NAV", "AUM", "ESG"]);
  while ((m = explicitPattern.exec(text)) !== null) {
    const t = m[1];
    // 过滤常见非 ticker 词
    if (NON_TICKER_WORDS.has(t)) continue;
    // 过滤纯数字（可能是年份如 2025、2024，或百分比等）
    if (/^\d{4,6}$/.test(t)) {
      const num = parseInt(t, 10);
      // 4位数字在 1990-2099 范围内视为年份，跳过
      if (t.length === 4 && num >= 1990 && num <= 2099) continue;
    }
    tickers.push(normalizeTicker(t));
  }

  // Common name → ticker mapping
  const nameMap: Record<string, string> = {
    苹果: "AAPL", apple: "AAPL",
    微软: "MSFT", microsoft: "MSFT",
    谷歌: "GOOGL", google: "GOOGL", alphabet: "GOOGL",
    亚马逊: "AMZN", amazon: "AMZN",
    英伟达: "NVDA", nvidia: "NVDA",
    特斯拉: "TSLA", tesla: "TSLA",
    脸书: "META", facebook: "META", meta: "META",
    腾讯: "0700.HK", tencent: "0700.HK",
    阿里巴巴: "BABA", alibaba: "BABA", 阿里: "BABA",
    茅台: "600519.SS", 贵州茅台: "600519.SS",
    宁德时代: "300750.SZ", catl: "300750.SZ",
    比亚迪: "002594.SZ", byd: "002594.SZ",
    美团: "3690.HK", meituan: "3690.HK",
    京东: "JD", jd: "JD",
    拼多多: "PDD", pdd: "PDD",
    网易: "NTES", netease: "NTES",
    百度: "BIDU", baidu: "BIDU",
    小米: "1810.HK", xiaomi: "1810.HK",
    中国平安: "601318.SS",
    工商银行: "601398.SS",
    招商银行: "600036.SS",
    中国石油: "601857.SS",
    恒生指数: "^HSI", 恒指: "^HSI",
    标普500: "^GSPC", "s&p500": "^GSPC", sp500: "^GSPC",
    纳斯达克: "^IXIC", nasdaq: "^IXIC",
    道琼斯: "^DJI", dow: "^DJI",
  };

  const lowerText = text.toLowerCase();
  for (const [name, ticker] of Object.entries(nameMap)) {
    if (lowerText.includes(name.toLowerCase()) && !tickers.includes(ticker)) {
      tickers.push(ticker);
    }
  }

  return Array.from(new Set(tickers)).slice(0, 5); // Max 5 tickers
}

/**
 * Fetch real-time stock data for a single ticker
 */
export async function getStockData(ticker: string): Promise<string> {
  try {
    const normalized = normalizeTicker(ticker);

    // Get chart data (includes current price, 52-week range)
    const chartData = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: normalized, interval: "1d", range: "3mo" },
    });

    const chartAny = chartData as any;
    const meta = chartAny?.chart?.result?.[0]?.meta;
    if (!meta) return `无法获取 ${ticker} 的数据`;

    const currentPrice = meta.regularMarketPrice ?? meta.previousClose;
    const prevClose = meta.previousClose;
    const change = currentPrice - prevClose;
    const changePct = ((change / prevClose) * 100).toFixed(2);
    const week52High = meta.fiftyTwoWeekHigh;
    const week52Low = meta.fiftyTwoWeekLow;
    const currency = meta.currency;
    const marketCap = meta.marketCap;

    const lines = [
      `### ${meta.longName || normalized} (${normalized})`,
      `- **当前价格**: ${currentPrice} ${currency}`,
      `- **涨跌**: ${change >= 0 ? "+" : ""}${change.toFixed(2)} (${change >= 0 ? "+" : ""}${changePct}%)`,
      `- **52周高/低**: ${week52High} / ${week52Low} ${currency}`,
    ];

    if (marketCap) {
      const capB = (marketCap / 1e9).toFixed(1);
      lines.push(`- **市值**: ${capB}B ${currency}`);
    }

    // Try to get insights (analyst ratings, technicals)
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

/**
 * Fetch data for multiple tickers and return combined report
 */
export async function getMultipleStocksData(tickers: string[]): Promise<string> {
  if (tickers.length === 0) return "";

  const results = await Promise.allSettled(tickers.map((t) => getStockData(t)));

  const lines = ["## 实时股票数据（来源：Yahoo Finance）\n"];
  for (const result of results) {
    if (result.status === "fulfilled") {
      lines.push(result.value);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Main entry: given a task description, extract tickers and fetch data
 */
export async function fetchStockDataForTask(taskDescription: string): Promise<string> {
  const tickers = extractTickers(taskDescription);
  if (tickers.length === 0) return "";
  return getMultipleStocksData(tickers);
}

/**
 * 去重版：从任务描述中提取 ticker，但跳过已由 Baostock 处理的 A 股代码
 * 规则：
 *   - A 股代码（600519.SS / 000001.SZ）→ 由 Baostock 处理，Yahoo Finance 跳过
 *   - 港股（0700.HK）、美股（AAPL）→ 由 Yahoo Finance 处理，Baostock 不触发
 * @param taskDescription 任务描述文本
 * @param aStockCodesHandledByBaostock 已由 Baostock 处理的 A 股代码列表（Baostock 格式：sh.600519）
 */
export async function fetchStockDataForTaskWithDedup(
  taskDescription: string,
  aStockCodesHandledByBaostock: string[]
): Promise<string> {
  const tickers = extractTickers(taskDescription);
  if (tickers.length === 0) return "";

  // 将 Baostock 代码转换为 Yahoo 格式用于比对
  const baostockAsYahoo = new Set(
    aStockCodesHandledByBaostock.map(bsCode => {
      const shMatch = bsCode.match(/^sh\.(\d{6})$/i);
      if (shMatch) return `${shMatch[1]}.SS`;
      const szMatch = bsCode.match(/^sz\.(\d{6})$/i);
      if (szMatch) return `${szMatch[1]}.SZ`;
      return null;
    }).filter(Boolean) as string[]
  );

  // 过滤掉已由 Baostock 处理的 A 股代码
  const filteredTickers = tickers.filter(ticker => {
    const isAShare = /^\d{6}\.(SS|SZ)$/i.test(ticker);
    if (isAShare && baostockAsYahoo.has(ticker.toUpperCase())) {
      return false; // 跳过：Baostock 已处理
    }
    return true;
  });

  if (filteredTickers.length === 0) return "";
  return getMultipleStocksData(filteredTickers);
}
