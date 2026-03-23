/**
 * Exchange Rates API — 外汇汇率数据
 * 使用 Frankfurter API（完全免费、无需 API Key、开源、基于欧洲央行数据）
 * 文档：https://www.frankfurter.app/docs
 *
 * 支持 33 种货币：USD/EUR/GBP/JPY/CNY/HKD/AUD/CAD/CHF/KRW/SGD/INR 等
 * 主要用途：
 * 1. 跨境投资汇率换算（美元/港元/人民币/欧元）
 * 2. 货币风险分析（汇率历史趋势）
 * 3. 多货币资产组合估值
 */

const BASE_URL = "https://api.frankfurter.app";

// ── 类型定义 ────────────────────────────────────────────────────────────────

export interface ExchangeRateLatest {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface ExchangeRateTimeSeries {
  amount: number;
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
}

// 主要货币列表（投资分析常用）
const MAJOR_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CNY", "HKD", "AUD", "CAD", "CHF", "KRW", "SGD"];

// 货币全名映射
const CURRENCY_NAMES: Record<string, string> = {
  USD: "美元",
  EUR: "欧元",
  GBP: "英镑",
  JPY: "日元",
  CNY: "人民币",
  HKD: "港元",
  AUD: "澳元",
  CAD: "加元",
  CHF: "瑞士法郎",
  KRW: "韩元",
  SGD: "新加坡元",
  INR: "印度卢比",
  BRL: "巴西雷亚尔",
  MXN: "墨西哥比索",
  SEK: "瑞典克朗",
  NOK: "挪威克朗",
  DKK: "丹麦克朗",
  NZD: "新西兰元",
  ZAR: "南非兰特",
  TRY: "土耳其里拉",
};

// ── 核心请求函数 ──────────────────────────────────────────────────────────────

async function fetchFrankfurter(path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Frankfurter API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── 最新汇率 ──────────────────────────────────────────────────────────────────

export async function getLatestRates(base = "USD", currencies?: string[]): Promise<ExchangeRateLatest> {
  const params: Record<string, string> = {};
  if (currencies?.length) params.to = currencies.join(",");
  const data = await fetchFrankfurter(`/latest?from=${base}`, params);
  return data as ExchangeRateLatest;
}

// ── 历史汇率（指定日期）────────────────────────────────────────────────────────

export async function getHistoricalRate(date: string, base = "USD", currencies?: string[]): Promise<ExchangeRateLatest> {
  const params: Record<string, string> = {};
  if (currencies?.length) params.to = currencies.join(",");
  const data = await fetchFrankfurter(`/${date}?from=${base}`, params);
  return data as ExchangeRateLatest;
}

// ── 时间序列（近期趋势）────────────────────────────────────────────────────────

export async function getRateTimeSeries(
  base = "USD",
  targetCurrency: string,
  days = 30
): Promise<ExchangeRateTimeSeries> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const data = await fetchFrankfurter(
    `/${fmt(startDate)}..${fmt(endDate)}?from=${base}&to=${targetCurrency}`
  );
  return data as ExchangeRateTimeSeries;
}

// ── 货币换算 ──────────────────────────────────────────────────────────────────

export async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  const data = await getLatestRates(from, [to]) as ExchangeRateLatest;
  const rate = data.rates[to];
  if (!rate) throw new Error(`Currency ${to} not supported`);
  return amount * rate;
}

// ── 综合外汇分析（供 Step2 使用）────────────────────────────────────────────

// 判断查询是否与外汇相关
function isForexRelevant(query: string): boolean {
  const text = query.toUpperCase();
  const forexKeywords = [
    "USD", "EUR", "GBP", "JPY", "CNY", "HKD", "AUD", "CAD", "CHF", "KRW", "SGD", "INR",
    "外汇", "汇率", "美元", "欧元", "英镑", "日元", "人民币", "港元", "港币",
    "澳元", "加元", "瑞郎", "韩元", "新加坡元", "新元",
    "货币对", "汇币", "外币", "外汇市场", "FOREX", "FX",
    "DOLLAR", "EURO", "POUND", "YEN", "YUAN", "RENMINBI", "CURRENCY", "EXCHANGE RATE",
    "跨境", "货币风险", "汇率风险", "多货币",
  ];
  return forexKeywords.some(kw => text.includes(kw));
}

export async function getForexAnalysis(query: string): Promise<string> {
  // 过滤非外汇相关的查询
  if (!isForexRelevant(query)) return "";

  // 从查询中识别相关货币
  const mentionedCurrencies = detectCurrencies(query);
  const baseCurrencies = mentionedCurrencies.length > 0 ? mentionedCurrencies : ["USD"];

  const lines: string[] = [`## 外汇汇率数据（来源：Frankfurter / 欧洲央行）`];

  try {
    // 获取主要货币对 USD 的最新汇率
    const usdRates = await getLatestRates("USD", MAJOR_CURRENCIES.filter(c => c !== "USD"));
    lines.push(`\n### 主要货币兑美元（USD）汇率 — ${usdRates.date}`);
    lines.push(`| 货币 | 全名 | 汇率（1 USD = ? 外币） | 外币兑 USD |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const [code, rate] of Object.entries(usdRates.rates)) {
      const name = CURRENCY_NAMES[code] ?? code;
      const inverse = (1 / rate).toFixed(6);
      lines.push(`| ${code} | ${name} | ${rate.toFixed(4)} | ${inverse} |`);
    }

    // 如果查询涉及特定货币对，提供近期趋势
    for (const currency of baseCurrencies.slice(0, 2)) {
      if (currency === "USD") continue;
      try {
        const series = await getRateTimeSeries("USD", currency, 30);
        const dates = Object.keys(series.rates).sort();
        if (dates.length >= 2) {
          const firstRate = series.rates[dates[0]][currency];
          const lastRate = series.rates[dates[dates.length - 1]][currency];
          const change = ((lastRate - firstRate) / firstRate * 100).toFixed(2);
          const direction = parseFloat(change) >= 0 ? "升值" : "贬值";
          lines.push(`\n### USD/${currency} 近 30 日趋势`);
          lines.push(`- 30天前: 1 USD = ${firstRate.toFixed(4)} ${currency}`);
          lines.push(`- 最新: 1 USD = ${lastRate.toFixed(4)} ${currency}`);
          lines.push(`- 变化: ${currency} 相对 USD ${direction} ${Math.abs(parseFloat(change))}%`);
        }
      } catch {
        // 单个货币趋势失败不影响整体
      }
    }

    return lines.join("\n");
  } catch (err) {
    return `[exchange_rates] 汇率数据获取失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── 从查询文本识别货币代码 ────────────────────────────────────────────────────

function detectCurrencies(query: string): string[] {
  const found: string[] = [];
  const text = query.toUpperCase();

  const patterns: Record<string, string[]> = {
    USD: ["USD", "美元", "美金", "DOLLAR"],
    EUR: ["EUR", "欧元", "EURO"],
    GBP: ["GBP", "英镑", "POUND"],
    JPY: ["JPY", "日元", "日圆", "YEN"],
    CNY: ["CNY", "RMB", "人民币", "元"],
    HKD: ["HKD", "港元", "港币", "港纸"],
    AUD: ["AUD", "澳元", "澳币"],
    CAD: ["CAD", "加元", "加币"],
    CHF: ["CHF", "瑞郎", "瑞士法郎"],
    KRW: ["KRW", "韩元", "韩币"],
    SGD: ["SGD", "新加坡元", "新元"],
  };

  for (const [code, keywords] of Object.entries(patterns)) {
    if (keywords.some(kw => text.includes(kw))) {
      found.push(code);
    }
  }
  return found;
}

// ── 健康检测 ──────────────────────────────────────────────────────────────────

export async function checkExchangeRatesHealth(): Promise<{ ok: boolean; status: "ok" | "degraded" | "error"; message: string; latencyMs: number }> {
  const t0 = Date.now();
  try {
    const data = await getLatestRates("USD", ["EUR", "CNY", "HKD"]);
    const latencyMs = Date.now() - t0;
    if (data.rates?.EUR) {
      return { ok: true, status: "ok", latencyMs, message: `USD/EUR: ${data.rates.EUR.toFixed(4)} | USD/CNY: ${data.rates.CNY?.toFixed(4) ?? "N/A"} | 日期: ${data.date}` };
    }
    return { ok: false, status: "degraded", latencyMs, message: "返回数据格式异常" };
  } catch (err) {
    return { ok: false, status: "error", latencyMs: Date.now() - t0, message: err instanceof Error ? err.message : String(err) };
  }
}
