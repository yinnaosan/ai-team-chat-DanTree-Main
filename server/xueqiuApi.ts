/**
 * xueqiuApi.ts
 * 雪球数据接口模块（游客 Token 自动获取，无需用户配置）
 *
 * 数据分层架构（实际可用接口）：
 *   Layer 1 — 行情层：股票实时详情（价格/估值/基本面）
 *   Layer 2 — 资金层：资金流向（主力资金净流入/流出）
 *   Layer 3 — 财务层：财务指标（A股/港股季报/年报核心指标）
 *
 * 接口来源：stock.xueqiu.com（非官方内部 API，学习自 pysnowball 开源项目）
 * Token 策略：访问 xueqiu.com/hq 首页自动获取游客 token，缓存 30 分钟
 *
 * 注：机构评级接口（stock.xueqiu.com/stock/report/latest.json）游客 token 权限不足，返回空数据。
 *     讨论帖子接口（xueqiu.com 主域名）在服务器环境受网络限制，暂不支持。
 */

const FETCH_TIMEOUT_MS = 12000;
const TOKEN_CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟

// ─── Token 缓存 ────────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenFetchedAt = 0;

/**
 * 自动获取雪球游客 Token（带缓存，30分钟有效）
 * 原理：访问 xueqiu.com/hq 首页，服务器自动在 set-cookie 中下发 xq_a_token
 */
async function getGuestToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now - tokenFetchedAt < TOKEN_CACHE_TTL_MS) {
    return cachedToken;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://xueqiu.com/hq", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      signal: controller.signal,
    });

    const rawCookies = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") || ""];

    const cookieMap: Record<string, string> = {};
    rawCookies.forEach((c) => {
      const firstPart = c.split(";")[0].trim();
      const eqIdx = firstPart.indexOf("=");
      if (eqIdx > 0) {
        const key = firstPart.slice(0, eqIdx).trim();
        const val = firstPart.slice(eqIdx + 1).trim();
        cookieMap[key] = val;
      }
    });

    const cookieStr = Object.entries(cookieMap)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const token = cookieStr || rawCookies[0]?.split(";")[0].trim() || "";
    cachedToken = token;
    tokenFetchedAt = now;
    return token;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 通用请求工具 ──────────────────────────────────────────────────────────────

async function xueqiuFetch(url: string, cookieStr?: string): Promise<unknown> {
  const token = cookieStr || (await getGuestToken());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Cookie: token,
        Referer: "https://xueqiu.com/",
        Origin: "https://xueqiu.com",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

export interface XueqiuQuote {
  symbol: string;
  name: string;
  current: number;
  percent: number;
  chg: number;
  open: number;
  high: number;
  low: number;
  last_close: number;
  volume: number;
  amount: number;
  turnover_rate: number | null;
  market_capital: number | null;
  float_market_capital: number | null;
  pe_ttm: number | null;
  pe_lyr: number | null;
  pb: number | null;
  eps: number | null;
  navps: number | null;
  dividend_yield: number | null;
  high52w: number | null;
  low52w: number | null;
  currency: string;
  exchange: string;
  sub_type: string;
  status: number;
  timestamp: number;
}

export interface XueqiuCapitalFlowItem {
  timestamp: number;
  amount: number; // 正=流入，负=流出
}

export interface XueqiuCapitalHistory {
  sum3: number;  // 3日累计
  sum5: number;  // 5日累计
  sum10: number; // 10日累计
  sum20: number; // 20日累计
  items: XueqiuCapitalFlowItem[];
}

export interface XueqiuFinanceIndicator {
  report_date: number;
  report_name: string;
  avg_roe: [number, number] | null;              // [值, YoY变化率]
  np_per_share: [number, number] | null;         // 每股收益
  operate_cash_flow_ps: [number, number] | null; // 每股经营现金流
  total_revenue: [number, number] | null;        // 营业总收入
  net_profit: [number, number] | null;           // 净利润
  gross_profit_margin: [number, number] | null;  // 毛利率
  net_profit_margin: [number, number] | null;    // 净利率/ROA
  asset_liab_ratio: [number, number] | null;     // 资产负债率
}

export interface XueqiuData {
  symbol: string;
  fetchedAt: number;
  // Layer 1: 行情层
  quote?: {
    data: XueqiuQuote;
    error?: string;
  };
  // Layer 2: 资金层
  capitalFlow?: {
    today: number;
    history: XueqiuCapitalHistory;
    trend: "inflow" | "outflow" | "neutral";
    error?: string;
  };
  // Layer 3: 财务层
  finance?: {
    indicators: XueqiuFinanceIndicator[];
    latestPeriod: string;
    error?: string;
  };
  errors: string[];
}

// ─── Layer 1: 股票行情详情 ────────────────────────────────────────────────────

export async function fetchXueqiuQuote(symbol: string): Promise<XueqiuQuote | null> {
  const url = `https://stock.xueqiu.com/v5/stock/quote.json?extend=detail&symbol=${symbol}`;
  const data = (await xueqiuFetch(url)) as { data?: { quote?: XueqiuQuote } };
  return data.data?.quote || null;
}

// ─── Layer 2: 资金流向 ────────────────────────────────────────────────────────

export async function fetchXueqiuCapitalFlow(symbol: string): Promise<{
  today: number;
  history: XueqiuCapitalHistory;
}> {
  // 今日资金流向（分钟级）
  const flowUrl = `https://stock.xueqiu.com/v5/stock/capital/flow.json?symbol=${symbol}`;
  const flowData = (await xueqiuFetch(flowUrl)) as {
    data?: { items?: XueqiuCapitalFlowItem[] };
  };
  const flowItems = flowData.data?.items || [];
  const todayTotal = flowItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  // 历史资金流向（日级）
  const histUrl = `https://stock.xueqiu.com/v5/stock/capital/history.json?symbol=${symbol}`;
  const histData = (await xueqiuFetch(histUrl)) as { data?: XueqiuCapitalHistory };
  const history: XueqiuCapitalHistory = histData.data || {
    sum3: 0, sum5: 0, sum10: 0, sum20: 0, items: [],
  };

  return { today: todayTotal, history };
}

// ─── Layer 3: 财务指标 ────────────────────────────────────────────────────────

function isHKSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return /^\d{4,5}$/.test(upper) || upper.endsWith(".HK");
}

function normalizeFinanceIndicator(
  raw: Record<string, unknown>,
  isHK: boolean
): XueqiuFinanceIndicator {
  if (isHK) {
    return {
      report_date: raw.report_date as number,
      report_name: raw.report_name as string,
      avg_roe: raw.roe as [number, number] | null,
      np_per_share: raw.beps as [number, number] | null,
      operate_cash_flow_ps: raw.ncfps as [number, number] | null,
      total_revenue: null,
      net_profit: null,
      gross_profit_margin: raw.gpm as [number, number] | null,
      net_profit_margin: raw.lnrerate as [number, number] | null,
      asset_liab_ratio: raw.tlia_ta as [number, number] | null,
    };
  }
  // A股字段映射
  return {
    report_date: raw.report_date as number,
    report_name: raw.report_name as string,
    avg_roe: raw.avg_roe as [number, number] | null,
    np_per_share: raw.np_per_share as [number, number] | null,
    operate_cash_flow_ps: raw.operate_cash_flow_ps as [number, number] | null,
    total_revenue: null,
    net_profit: null,
    gross_profit_margin: raw.gross_selling_rate as [number, number] | null,
    net_profit_margin: raw.net_interest_of_total_assets as [number, number] | null,
    asset_liab_ratio: null,
  };
}

export async function fetchXueqiuFinanceIndicator(
  symbol: string,
  count = 4
): Promise<XueqiuFinanceIndicator[]> {
  const hk = isHKSymbol(symbol);
  const paths = hk
    ? [
        `https://stock.xueqiu.com/v5/stock/finance/hk/indicator.json?symbol=${symbol}&type=annual&count=${count}`,
        `https://stock.xueqiu.com/v5/stock/finance/hk/indicator.json?symbol=${symbol}&type=Q4&count=${count}`,
      ]
    : [
        `https://stock.xueqiu.com/v5/stock/finance/cn/indicator.json?symbol=${symbol}&type=Q4&count=${count}`,
      ];

  for (const url of paths) {
    try {
      const data = (await xueqiuFetch(url)) as { data?: { list?: Record<string, unknown>[] } };
      const rawList = data.data?.list || [];
      if (rawList.length > 0) {
        return rawList.map((r) => normalizeFinanceIndicator(r, hk));
      }
    } catch {
      // 尝试下一个 URL
    }
  }
  return [];
}

// ─── 代码转换工具 ─────────────────────────────────────────────────────────────

/**
 * 判断是否为 A股/港股代码（雪球格式：SH600519 / SZ000001 / 09992）
 */
export function isXueqiuSupportedSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  if (upper.startsWith("SH") || upper.startsWith("SZ")) return true;
  if (/^\d{4,5}$/.test(upper) || upper.startsWith("HK")) return true;
  if (/^\d+\.HK$/.test(upper)) return true;
  return false;
}

/**
 * 将通用股票代码转换为雪球格式
 * 600519 → SH600519 | 000001 → SZ000001 | 00700 → 00700（港股）
 */
export function toXueqiuSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().trim();
  if (upper.startsWith("SH") || upper.startsWith("SZ")) return upper;
  if (/^\d{6}$/.test(upper)) {
    const code = parseInt(upper, 10);
    if (code >= 600000 || (code >= 900000 && code < 1000000)) return `SH${upper}`;
    return `SZ${upper}`;
  }
  if (/^\d{4,5}$/.test(upper)) return upper;
  return upper;
}

// ─── 聚合入口：并行获取所有层数据 ─────────────────────────────────────────────

export async function fetchXueqiuData(rawSymbol: string): Promise<XueqiuData> {
  const symbol = toXueqiuSymbol(rawSymbol);
  const errors: string[] = [];
  const fetchedAt = Date.now();

  let token = "";
  try {
    token = await getGuestToken();
  } catch (e) {
    errors.push(`Token 获取失败: ${String(e)}`);
    return { symbol, fetchedAt, errors };
  }

  const [quoteResult, capitalResult, financeResult] = await Promise.allSettled([
    fetchXueqiuQuote(symbol),
    fetchXueqiuCapitalFlow(symbol),
    fetchXueqiuFinanceIndicator(symbol),
  ]);

  const result: XueqiuData = { symbol, fetchedAt, errors };

  // Layer 1: 行情层
  if (quoteResult.status === "fulfilled" && quoteResult.value) {
    result.quote = { data: quoteResult.value };
  } else {
    const err = quoteResult.status === "rejected" ? String(quoteResult.reason) : "无数据";
    result.quote = { data: {} as XueqiuQuote, error: err };
    errors.push(`行情层: ${err}`);
  }

  // Layer 2: 资金层
  if (capitalResult.status === "fulfilled") {
    const { today, history } = capitalResult.value;
    const trend: "inflow" | "outflow" | "neutral" =
      today > 1_000_000 ? "inflow" : today < -1_000_000 ? "outflow" : "neutral";
    result.capitalFlow = { today, history, trend };
  } else {
    const err = String(capitalResult.reason);
    result.capitalFlow = {
      today: 0,
      history: { sum3: 0, sum5: 0, sum10: 0, sum20: 0, items: [] },
      trend: "neutral",
      error: err,
    };
    errors.push(`资金层: ${err}`);
  }

  // Layer 3: 财务层
  if (financeResult.status === "fulfilled") {
    const indicators = financeResult.value;
    const latestPeriod = indicators[0]?.report_name || "无数据";
    result.finance = { indicators, latestPeriod };
  } else {
    const err = String(financeResult.reason);
    result.finance = { indicators: [], latestPeriod: "获取失败", error: err };
    errors.push(`财务层: ${err}`);
  }

  return result;
}

// ─── 数据清洗 & Markdown 格式化 ───────────────────────────────────────────────

function fmtCapital(amount: number): string {
  const yi = amount / 1e8;
  const sign = yi >= 0 ? "+" : "";
  return `${sign}${yi.toFixed(2)}亿`;
}

function fmtYoY(pair: [number, number] | null, unit = ""): string {
  if (!pair) return "N/A";
  const [val, yoy] = pair;
  const yoyStr = yoy !== null ? ` (YoY ${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%)` : "";
  return `${val.toFixed(2)}${unit}${yoyStr}`;
}

/**
 * 将雪球数据格式化为 Markdown（注入 AI 分析上下文）
 */
export function formatXueqiuDataAsMarkdown(data: XueqiuData): string {
  if (!data.symbol) return "";

  const sections: string[] = [];
  const sym = data.symbol;

  // Layer 1: 行情层
  if (data.quote?.data?.name) {
    const q = data.quote.data;
    const pct = q.percent >= 0 ? `+${q.percent.toFixed(2)}%` : `${q.percent.toFixed(2)}%`;
    const mktCap = q.market_capital ? `市值: ${(q.market_capital / 1e8).toFixed(0)}亿` : "";
    const pe = q.pe_ttm ? `PE(TTM): ${q.pe_ttm.toFixed(1)}` : "";
    const pb = q.pb ? `PB: ${q.pb.toFixed(2)}` : "";
    const dy = q.dividend_yield ? `股息率: ${q.dividend_yield.toFixed(2)}%` : "";
    const valuation = [mktCap, pe, pb, dy].filter(Boolean).join(" | ");

    sections.push(
      `**【雪球行情】${q.name} (${sym})**\n` +
        `现价: **${q.current}** ${pct} | 今开: ${q.open} | 最高: ${q.high} | 最低: ${q.low}\n` +
        (valuation ? `${valuation}\n` : "") +
        `52周区间: ${q.low52w ?? "N/A"} ~ ${q.high52w ?? "N/A"}`
    );
  }

  // Layer 2: 资金层
  if (data.capitalFlow) {
    const { today, history, trend } = data.capitalFlow;
    const trendEmoji =
      trend === "inflow" ? "🟢 净流入" : trend === "outflow" ? "🔴 净流出" : "⚪ 中性";
    sections.push(
      `**【雪球资金流向】今日: ${fmtCapital(today)} (${trendEmoji})**\n` +
        `3日: ${fmtCapital(history.sum3)} | 5日: ${fmtCapital(history.sum5)} | 10日: ${fmtCapital(history.sum10)} | 20日: ${fmtCapital(history.sum20)}`
    );
  }

  // Layer 3: 财务层
  if (data.finance && data.finance.indicators.length > 0) {
    const { indicators, latestPeriod } = data.finance;
    const rows = indicators.slice(0, 4).map((ind) => {
      const roe = fmtYoY(ind.avg_roe, "%");
      const eps = fmtYoY(ind.np_per_share);
      const npm = fmtYoY(ind.net_profit_margin, "%");
      const alr = fmtYoY(ind.asset_liab_ratio, "%");
      return `| ${ind.report_name} | ${roe} | ${eps} | ${npm} | ${alr} |`;
    });

    sections.push(
      `**【雪球财务指标】最新报告期: ${latestPeriod}**\n` +
        `| 报告期 | ROE | EPS | 净利率/ROA | 资产负债率 |\n` +
        `|---|---|---|---|---|\n` +
        rows.join("\n")
    );
  }

  if (sections.length === 0) return "";

  return (
    `\n\n---\n### 📊 雪球数据（${sym}）\n\n` +
    sections.join("\n\n") +
    `\n\n> 数据来源：雪球（xueqiu.com）| 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} CST\n`
  );
}

/**
 * 判断查询是否需要雪球数据（A股/港股相关）
 */
export function isXueqiuRelevant(query: string, symbol?: string): boolean {
  if (symbol && isXueqiuSupportedSymbol(symbol)) return true;

  const keywords = [
    "A股", "港股", "沪深", "创业板", "科创板", "北交所",
    "茅台", "宁德", "比亚迪", "腾讯", "阿里", "百度", "小米",
    "中国股市", "A股行情", "资金流向", "主力资金",
    "财务指标", "ROE", "净利率",
    "SH6", "SZ0", "SZ3", "0700", "9988", "3690",
  ];
  const queryLower = query.toLowerCase();
  return keywords.some((kw) => queryLower.includes(kw.toLowerCase()));
}

/**
 * 健康检测
 */
export async function checkXueqiuHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  status: string;
  message: string;
}> {
  const start = Date.now();
  try {
    const token = await getGuestToken();
    const latencyMs = Date.now() - start;
    if (token) {
      const res = await fetch(
        "https://stock.xueqiu.com/v5/stock/hot_stock/list.json?size=1&_type=10&type=10",
        {
          headers: { "User-Agent": "Mozilla/5.0", Cookie: token, Referer: "https://xueqiu.com/" },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (res.ok) {
        return { ok: true, latencyMs, status: "ok", message: "雪球游客 Token 正常" };
      }
      return { ok: false, latencyMs, status: "error", message: `热股接口 HTTP ${res.status}` };
    }
    return { ok: false, latencyMs, status: "error", message: "Token 为空" };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, status: "error", message: String(err) };
  }
}
