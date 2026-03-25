/**
 * xueqiuApi.ts
 * 雪球数据接口模块（游客 Token 自动获取，无需用户配置）
 *
 * 数据分层架构（参考 GPT 制定的数据源分组清洗策略）：
 *   Layer 1 — 情绪层：股票讨论帖子（投资者情绪、热度）
 *   Layer 2 — 评级层：机构研报评级（国内券商评级/目标价）
 *   Layer 3 — 资金层：资金流向（主力资金净流入/流出）
 *   Layer 4 — 财务层：财务指标（A股季报/年报核心指标）
 *   Layer 5 — 行情层：股票实时详情（价格/估值/基本面）
 *
 * 接口来源：stock.xueqiu.com（非官方内部 API，学习自 pysnowball 开源项目）
 * Token 策略：访问 xueqiu.com/hq 首页自动获取游客 token，缓存 30 分钟
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

    // 从 set-cookie 中提取所有 cookie
    const setCookie = res.headers.get("set-cookie") || "";
    // Node.js fetch 有时将多个 set-cookie 合并，需要分割
    const cookieParts: string[] = [];
    setCookie.split(",").forEach((part) => {
      const trimmed = part.trim();
      if (trimmed.match(/^[a-zA-Z_]+=/) || trimmed.match(/^xq_/)) {
        cookieParts.push(trimmed.split(";")[0].trim());
      }
    });

    // 如果 set-cookie 解析失败，尝试从响应头直接拼接
    const rawCookies = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [setCookie];

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

    if (cookieStr) {
      cachedToken = cookieStr;
      tokenFetchedAt = now;
      return cookieStr;
    }

    // 降级：使用 set-cookie 原始字符串的第一段
    const fallback = setCookie.split(";")[0].trim();
    cachedToken = fallback;
    tokenFetchedAt = now;
    return fallback;
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

export interface XueqiuReport {
  title: string;
  rpt_comp: string; // 券商名称
  rating_desc: string; // 评级：买入/增持/中性/减持/卖出
  target_price_min: number | null;
  target_price_max: number | null;
  pub_date: number;
  reply_count: number;
  like_count: number;
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
  avg_roe: [number, number] | null;          // [值, YoY变化率]
  np_per_share: [number, number] | null;     // 每股收益
  operate_cash_flow_ps: [number, number] | null; // 每股经营现金流
  total_revenue: [number, number] | null;    // 营业总收入
  net_profit: [number, number] | null;       // 净利润
  gross_profit_margin: [number, number] | null; // 毛利率
  net_profit_margin: [number, number] | null;   // 净利率
  asset_liab_ratio: [number, number] | null;    // 资产负债率
}

export interface XueqiuDiscussionPost {
  id: string;
  text: string;
  timeBefore: string;
  retweet_count: number;
  reply_count: number;
  like_count: number;
  user_name: string;
}

export interface XueqiuData {
  symbol: string;
  fetchedAt: number;
  // Layer 1: 情绪层
  discussion?: {
    posts: XueqiuDiscussionPost[];
    totalCount: number;
    error?: string;
  };
  // Layer 2: 评级层
  reports?: {
    items: XueqiuReport[];
    ratingDistribution: Record<string, number>; // {买入: 3, 增持: 2, ...}
    latestRating: string;
    error?: string;
  };
  // Layer 3: 资金层
  capitalFlow?: {
    today: number;       // 今日净流入（元）
    history: XueqiuCapitalHistory;
    trend: "inflow" | "outflow" | "neutral";
    error?: string;
  };
  // Layer 4: 财务层
  finance?: {
    indicators: XueqiuFinanceIndicator[];
    latestPeriod: string;
    error?: string;
  };
  // Layer 5: 行情层
  quote?: {
    data: XueqiuQuote;
    error?: string;
  };
  errors: string[];
}

// ─── Layer 2: 机构研报评级 ────────────────────────────────────────────────────

export async function fetchXueqiuReports(symbol: string): Promise<XueqiuReport[]> {
  const url = `https://stock.xueqiu.com/stock/report/latest.json?symbol=${symbol}`;
  const data = (await xueqiuFetch(url)) as { list?: XueqiuReport[] };
  return data.list || [];
}

// ─── Layer 3: 资金流向 ────────────────────────────────────────────────────────

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
  const histData = (await xueqiuFetch(histUrl)) as {
    data?: XueqiuCapitalHistory;
  };
  const history: XueqiuCapitalHistory = histData.data || {
    sum3: 0,
    sum5: 0,
    sum10: 0,
    sum20: 0,
    items: [],
  };

  return { today: todayTotal, history };
}

// ─── Layer 4: 财务指标 ────────────────────────────────────────────────────────

export async function fetchXueqiuFinanceIndicator(
  symbol: string,
  count = 4
): Promise<XueqiuFinanceIndicator[]> {
  const url = `https://stock.xueqiu.com/v5/stock/finance/cn/indicator.json?symbol=${symbol}&type=Q4&count=${count}`;
  const data = (await xueqiuFetch(url)) as {
    data?: { list?: XueqiuFinanceIndicator[] };
  };
  return data.data?.list || [];
}

// ─── Layer 5: 股票行情详情 ────────────────────────────────────────────────────

export async function fetchXueqiuQuote(symbol: string): Promise<XueqiuQuote | null> {
  const url = `https://stock.xueqiu.com/v5/stock/quote.json?extend=detail&symbol=${symbol}`;
  const data = (await xueqiuFetch(url)) as {
    data?: { quote?: XueqiuQuote };
  };
  return data.data?.quote || null;
}

// ─── 聚合入口：并行获取所有层数据 ─────────────────────────────────────────────

/**
 * 判断是否为 A股/港股代码（雪球格式：SH600519 / SZ000001 / 09992）
 */
export function isXueqiuSupportedSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  // A股：SH/SZ 前缀
  if (upper.startsWith("SH") || upper.startsWith("SZ")) return true;
  // 港股：纯数字（如 09992, 00700）或 HK 前缀
  if (/^\d{4,5}$/.test(upper) || upper.startsWith("HK")) return true;
  // 雪球格式港股：09992.HK
  if (/^\d+\.HK$/.test(upper)) return true;
  return false;
}

/**
 * 将通用股票代码转换为雪球格式
 * AAPL → AAPL（美股直接使用）
 * 600519 → SH600519
 * 000001 → SZ000001
 * 00700 → 00700（港股）
 */
export function toXueqiuSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().trim();
  // 已经是雪球格式
  if (upper.startsWith("SH") || upper.startsWith("SZ")) return upper;
  // 纯6位数字：A股
  if (/^\d{6}$/.test(upper)) {
    const code = parseInt(upper, 10);
    // 上交所：60xxxx, 68xxxx, 900xxx
    if (code >= 600000 || (code >= 900000 && code < 1000000)) return `SH${upper}`;
    // 深交所：00xxxx, 30xxxx, 002xxx
    return `SZ${upper}`;
  }
  // 港股：4-5位数字
  if (/^\d{4,5}$/.test(upper)) return upper;
  return upper;
}

/**
 * 并行获取雪球所有层数据
 * 任意层失败不影响其他层
 */
export async function fetchXueqiuData(rawSymbol: string): Promise<XueqiuData> {
  const symbol = toXueqiuSymbol(rawSymbol);
  const errors: string[] = [];
  const fetchedAt = Date.now();

  // 预先获取一次 token（避免并发重复获取）
  let token = "";
  try {
    token = await getGuestToken();
  } catch (e) {
    errors.push(`Token 获取失败: ${String(e)}`);
    return { symbol, fetchedAt, errors };
  }

  // 并行获取各层数据
  const [reportsResult, capitalResult, financeResult, quoteResult] =
    await Promise.allSettled([
      fetchXueqiuReports(symbol),
      fetchXueqiuCapitalFlow(symbol),
      fetchXueqiuFinanceIndicator(symbol),
      fetchXueqiuQuote(symbol),
    ]);

  const result: XueqiuData = { symbol, fetchedAt, errors };

  // Layer 2: 评级层
  if (reportsResult.status === "fulfilled") {
    const items = reportsResult.value;
    const ratingDistribution: Record<string, number> = {};
    items.forEach((r) => {
      const rating = r.rating_desc || "未知";
      ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
    });
    const latestRating = items[0]?.rating_desc || "无评级";
    result.reports = { items, ratingDistribution, latestRating };
  } else {
    const err = String(reportsResult.reason);
    result.reports = {
      items: [],
      ratingDistribution: {},
      latestRating: "获取失败",
      error: err,
    };
    errors.push(`评级层: ${err}`);
  }

  // Layer 3: 资金层
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

  // Layer 4: 财务层
  if (financeResult.status === "fulfilled") {
    const indicators = financeResult.value;
    const latestPeriod = indicators[0]?.report_name || "无数据";
    result.finance = { indicators, latestPeriod };
  } else {
    const err = String(financeResult.reason);
    result.finance = { indicators: [], latestPeriod: "获取失败", error: err };
    errors.push(`财务层: ${err}`);
  }

  // Layer 5: 行情层
  if (quoteResult.status === "fulfilled" && quoteResult.value) {
    result.quote = { data: quoteResult.value };
  } else {
    const err =
      quoteResult.status === "rejected"
        ? String(quoteResult.reason)
        : "无数据";
    result.quote = { data: {} as XueqiuQuote, error: err };
    errors.push(`行情层: ${err}`);
  }

  return result;
}

// ─── 数据清洗 & Markdown 格式化 ───────────────────────────────────────────────

/**
 * 格式化资金金额（亿元）
 */
function fmtCapital(amount: number): string {
  const yi = amount / 1e8;
  const sign = yi >= 0 ? "+" : "";
  return `${sign}${yi.toFixed(2)}亿`;
}

/**
 * 格式化百分比（带 YoY 变化）
 */
function fmtYoY(pair: [number, number] | null, unit = ""): string {
  if (!pair) return "N/A";
  const [val, yoy] = pair;
  const yoyStr = yoy !== null ? ` (YoY ${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%)` : "";
  return `${val.toFixed(2)}${unit}${yoyStr}`;
}

/**
 * 将雪球数据格式化为 Markdown（注入 AI 分析上下文）
 * 按 GPT 数据分组清洗策略分层输出
 */
export function formatXueqiuDataAsMarkdown(data: XueqiuData): string {
  if (!data.symbol) return "";

  const sections: string[] = [];
  const sym = data.symbol;

  // ── Layer 5: 行情层（放最前，提供基础背景）──
  if (data.quote?.data?.name) {
    const q = data.quote.data;
    const pct = q.percent >= 0 ? `+${q.percent.toFixed(2)}%` : `${q.percent.toFixed(2)}%`;
    const mktCap = q.market_capital
      ? `市值: ${(q.market_capital / 1e8).toFixed(0)}亿`
      : "";
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

  // ── Layer 2: 评级层 ──
  if (data.reports && data.reports.items.length > 0) {
    const { items, ratingDistribution, latestRating } = data.reports;
    const distStr = Object.entries(ratingDistribution)
      .map(([k, v]) => `${k}×${v}`)
      .join(" / ");

    const rows = items.slice(0, 5).map((r) => {
      const date = new Date(r.pub_date).toLocaleDateString("zh-CN");
      const tp =
        r.target_price_min && r.target_price_max
          ? `目标价: ${r.target_price_min}~${r.target_price_max}`
          : r.target_price_max
          ? `目标价: ${r.target_price_max}`
          : "";
      return `- [${date}] **${r.rpt_comp}** | ${r.rating_desc} ${tp ? `| ${tp}` : ""} | ${r.title.slice(0, 40)}`;
    });

    sections.push(
      `**【雪球机构评级】最新: ${latestRating} | 分布: ${distStr}**\n` +
        rows.join("\n")
    );
  }

  // ── Layer 3: 资金层 ──
  if (data.capitalFlow) {
    const { today, history, trend } = data.capitalFlow;
    const trendEmoji =
      trend === "inflow" ? "🟢 净流入" : trend === "outflow" ? "🔴 净流出" : "⚪ 中性";
    const todayStr = fmtCapital(today);
    const h = history;

    sections.push(
      `**【雪球资金流向】今日: ${todayStr} (${trendEmoji})**\n` +
        `3日累计: ${fmtCapital(h.sum3)} | 5日: ${fmtCapital(h.sum5)} | 10日: ${fmtCapital(h.sum10)} | 20日: ${fmtCapital(h.sum20)}`
    );
  }

  // ── Layer 4: 财务层 ──
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
        `| 报告期 | ROE | EPS | 净利率 | 资产负债率 |\n` +
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
  // 如果有明确的 A股/港股代码
  if (symbol && isXueqiuSupportedSymbol(symbol)) return true;

  const keywords = [
    "A股", "港股", "沪深", "创业板", "科创板", "北交所",
    "茅台", "宁德", "比亚迪", "腾讯", "阿里", "百度", "小米",
    "中国股市", "A股行情", "机构评级", "资金流向", "主力资金",
    "券商评级", "研报", "财务指标", "ROE", "净利率",
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
      // 快速验证：获取热股列表
      const res = await fetch(
        "https://stock.xueqiu.com/v5/stock/hot_stock/list.json?size=1&_type=10&type=10",
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Cookie: token,
            Referer: "https://xueqiu.com/",
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (res.ok) {
        return { ok: true, latencyMs, status: "ok", message: "雪球游客 Token 正常" };
      }
      return {
        ok: false,
        latencyMs,
        status: "error",
        message: `热股接口 HTTP ${res.status}`,
      };
    }
    return { ok: false, latencyMs, status: "error", message: "Token 为空" };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      status: "error",
      message: String(err),
    };
  }
}
