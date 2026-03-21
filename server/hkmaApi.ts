/**
 * HKMA (Hong Kong Monetary Authority) API Module
 * Provides HKD exchange rates, interest rates, monetary supply, and interbank liquidity data
 * Free public API: https://apidocs.hkma.gov.hk/
 * URL format: https://api.hkma.gov.hk/public/{category}/{sub-category}
 */

const HKMA_BASE = "https://api.hkma.gov.hk/public";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HkmaMonetaryStats {
  end_of_month: string;
  notes_coins_circulation?: number;
  aggr_balance?: number;
  ef_bills_notes?: number;
  monetary_base_total?: number;
  exrate_hkd_usd?: number;
  nominal_eff_exrate_index?: number;
  hibor_fixing_overnight?: number;
  hibor_fixing_3m?: number;
  deposit_rate_saving?: number;
  deposit_rate_3m?: number;
  yield_efpaper_3m?: number;
  yield_govbond_10y?: number;
  best_lending_rate?: number;
  discount_window_base_rate?: number;
}

export interface HkmaMoneySupply {
  end_of_month: string;
  m1_hkd?: number;
  m1_fc?: number;
  m1_total?: number;
  m2_hkd?: number;
  m2_fc?: number;
  m2_total?: number;
  m3_hkd?: number;
  m3_fc?: number;
  m3_total?: number;
}

export interface HkmaDailyLiquidity {
  end_of_date: string;
  cu_weakside?: number;
  cu_strongside?: number;
  disc_win_base_rate?: number;
  hibor_overnight?: number;
  hibor_fixing_1m?: number;
  twi?: number;
  opening_balance?: number;
  closing_balance?: number;
}

export interface HkmaData {
  monetaryStats: HkmaMonetaryStats | null;
  moneySupply: HkmaMoneySupply[] | null;
  dailyLiquidity: HkmaDailyLiquidity | null;
  fetchedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hkmaFetch<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const qs = new URLSearchParams({ pagesize: "6", sortorder: "desc", ...params });
  const url = `${HKMA_BASE}/${path}?${qs}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HKMA HTTP ${res.status}: ${path}`);
  const data = await res.json();
  const records = data?.result?.records;
  if (!Array.isArray(records)) throw new Error(`HKMA no records: ${path}`);
  return records as T[];
}

// ─── Main Fetch ───────────────────────────────────────────────────────────────

export async function fetchHkmaData(): Promise<HkmaData> {
  const [monetaryStatsRes, moneySupplyRes, dailyLiquidityRes] =
    await Promise.allSettled([
      hkmaFetch<HkmaMonetaryStats>(
        "market-data-and-statistics/monthly-statistical-bulletin/financial/monetary-statistics",
        { pagesize: "1" }
      ),
      hkmaFetch<HkmaMoneySupply>(
        "market-data-and-statistics/monthly-statistical-bulletin/money/supply-adjusted",
        { pagesize: "6" }
      ),
      hkmaFetch<HkmaDailyLiquidity>(
        "market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity",
        { pagesize: "1" }
      ),
    ]);

  return {
    monetaryStats:
      monetaryStatsRes.status === "fulfilled" && monetaryStatsRes.value.length > 0
        ? monetaryStatsRes.value[0]
        : null,
    moneySupply:
      moneySupplyRes.status === "fulfilled" ? moneySupplyRes.value : null,
    dailyLiquidity:
      dailyLiquidityRes.status === "fulfilled" && dailyLiquidityRes.value.length > 0
        ? dailyLiquidityRes.value[0]
        : null,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Trigger Condition ────────────────────────────────────────────────────────

export function isHkmaRelevantTask(task: string): boolean {
  const lower = task.toLowerCase();
  const keywords = [
    // HKD / Hong Kong monetary
    "hkd", "港元", "港币", "香港金融", "hkma", "金管局",
    "hibor", "银行同业拆息",
    "联系汇率", "linked exchange rate", "currency board",
    // HK macro
    "香港利率", "香港通胀", "香港货币", "hong kong monetary",
    "hong kong interest", "hong kong inflation",
    // HK banking
    "香港银行", "最优惠利率", "best lending rate",
    "外汇基金", "exchange fund",
  ];
  return keywords.some((k) => lower.includes(k));
}

// ─── Formatter ────────────────────────────────────────────────────────────────

export function formatHkmaDataAsMarkdown(data: HkmaData): string {
  const lines: string[] = ["## 香港金融管理局（HKMA）数据\n"];

  // Daily liquidity / rates
  if (data.dailyLiquidity) {
    const d = data.dailyLiquidity;
    lines.push("### 每日银行间流动性（最新）");
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 日期 | ${d.end_of_date} |`);
    if (d.cu_weakside != null)
      lines.push(`| 港元汇率走廊弱方 | ${d.cu_weakside} |`);
    if (d.cu_strongside != null)
      lines.push(`| 港元汇率走廊强方 | ${d.cu_strongside} |`);
    if (d.disc_win_base_rate != null)
      lines.push(`| 贴现窗口基准利率 | ${d.disc_win_base_rate}% |`);
    if (d.hibor_overnight != null)
      lines.push(`| HIBOR 隔夜 | ${d.hibor_overnight}% |`);
    if (d.hibor_fixing_1m != null)
      lines.push(`| HIBOR 1个月 | ${d.hibor_fixing_1m}% |`);
    if (d.twi != null) lines.push(`| 贸易加权指数 (TWI) | ${d.twi} |`);
    if (d.opening_balance != null)
      lines.push(`| 结算余额（开盘）| HKD ${d.opening_balance?.toLocaleString()}M |`);
    if (d.closing_balance != null)
      lines.push(`| 结算余额（收盘）| HKD ${d.closing_balance?.toLocaleString()}M |`);
    lines.push("");
  }

  // Monthly monetary stats
  if (data.monetaryStats) {
    const m = data.monetaryStats;
    lines.push(`### 月度货币统计（${m.end_of_month}）`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    if (m.exrate_hkd_usd != null)
      lines.push(`| 港元/美元汇率 | ${m.exrate_hkd_usd} |`);
    if (m.nominal_eff_exrate_index != null)
      lines.push(`| 名义有效汇率指数 | ${m.nominal_eff_exrate_index} |`);
    if (m.hibor_fixing_overnight != null)
      lines.push(`| HIBOR 隔夜定盘 | ${m.hibor_fixing_overnight}% |`);
    if (m.hibor_fixing_3m != null)
      lines.push(`| HIBOR 3个月定盘 | ${m.hibor_fixing_3m}% |`);
    if (m.best_lending_rate != null)
      lines.push(`| 最优惠利率 | ${m.best_lending_rate}% |`);
    if (m.discount_window_base_rate != null)
      lines.push(`| 贴现窗口基准利率 | ${m.discount_window_base_rate}% |`);
    if (m.yield_efpaper_3m != null)
      lines.push(`| 外汇基金票据收益率(3M) | ${m.yield_efpaper_3m}% |`);
    if (m.yield_govbond_10y != null)
      lines.push(`| 政府债券收益率(10Y) | ${m.yield_govbond_10y}% |`);
    if (m.deposit_rate_saving != null)
      lines.push(`| 储蓄存款利率 | ${m.deposit_rate_saving}% |`);
    if (m.deposit_rate_3m != null)
      lines.push(`| 3个月定期存款利率 | ${m.deposit_rate_3m}% |`);
    if (m.monetary_base_total != null)
      lines.push(`| 货币基础总量 | HKD ${m.monetary_base_total?.toLocaleString()}M |`);
    lines.push("");
  }

  // Money supply trend
  if (data.moneySupply && data.moneySupply.length > 0) {
    lines.push("### 货币供应量趋势（M2 总量，近6个月）");
    lines.push(`| 月份 | M1 总量(HKD M) | M2 总量(HKD M) | M3 总量(HKD M) |`);
    lines.push(`|------|---------------|---------------|---------------|`);
    for (const row of data.moneySupply.slice(0, 6)) {
      const m1 = row.m1_total != null ? row.m1_total.toLocaleString() : "N/A";
      const m2 = row.m2_total != null ? row.m2_total.toLocaleString() : "N/A";
      const m3 = row.m3_total != null ? row.m3_total.toLocaleString() : "N/A";
      lines.push(`| ${row.end_of_month} | ${m1} | ${m2} | ${m3} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkHkmaHealth(): Promise<{
  status: "ok" | "error";
  latency: number;
  message: string;
}> {
  const start = Date.now();
  try {
    const records = await hkmaFetch<HkmaDailyLiquidity>(
      "market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity",
      { pagesize: "1" }
    );
    const latency = Date.now() - start;
    if (records.length > 0) {
      return {
        status: "ok",
        latency,
        message: `HKMA API 正常，最新数据日期: ${records[0].end_of_date}`,
      };
    }
    return { status: "error", latency, message: "HKMA API 返回空数据" };
  } catch (e: unknown) {
    return {
      status: "error",
      latency: Date.now() - start,
      message: `HKMA API 错误: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
