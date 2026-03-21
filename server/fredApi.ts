/**
 * FRED (Federal Reserve Economic Data) API integration
 * Provides real-time macroeconomic data: CPI, interest rates, GDP, employment, etc.
 */

import { ENV } from "./_core/env";

const FRED_BASE_URL = "https://api.stlouisfed.org/fred";

// Key macroeconomic series IDs
export const FRED_SERIES = {
  // Inflation
  CPI: "CPIAUCSL",           // Consumer Price Index (All Urban Consumers)
  CORE_CPI: "CPILFESL",      // Core CPI (excluding food and energy)
  PCE: "PCEPI",              // PCE Price Index
  CORE_PCE: "PCEPILFE",      // Core PCE (Fed's preferred inflation measure)

  // Interest Rates
  FED_FUNDS_RATE: "FEDFUNDS",        // Federal Funds Effective Rate
  TREASURY_10Y: "DGS10",            // 10-Year Treasury Yield
  TREASURY_2Y: "DGS2",              // 2-Year Treasury Yield
  TREASURY_30Y: "DGS30",            // 30-Year Treasury Yield

  // Employment
  UNEMPLOYMENT: "UNRATE",            // Unemployment Rate
  NONFARM_PAYROLL: "PAYEMS",         // Total Nonfarm Payrolls
  INITIAL_CLAIMS: "ICSA",            // Initial Jobless Claims

  // GDP & Growth
  GDP: "GDP",                        // Gross Domestic Product
  REAL_GDP: "GDPC1",                 // Real GDP
  GDP_GROWTH: "A191RL1Q225SBEA",     // Real GDP Growth Rate

  // Money Supply & Credit
  M2: "M2SL",                        // M2 Money Supply
  CREDIT_SPREAD: "BAMLH0A0HYM2",     // High Yield Credit Spread

  // Housing
  HOUSING_STARTS: "HOUST",           // Housing Starts
  CASE_SHILLER: "CSUSHPISA",         // Case-Shiller Home Price Index

  // Consumer
  RETAIL_SALES: "RSXFS",             // Retail Sales
  CONSUMER_SENTIMENT: "UMCSENT",     // University of Michigan Consumer Sentiment
} as const;

interface FredObservation {
  date: string;
  value: string;
}

interface FredSeriesInfo {
  id: string;
  title: string;
  units: string;
  frequency: string;
  last_updated: string;
}

async function fetchFred(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const apiKey = ENV.FRED_API_KEY || "fc90d7149fbff8a90993d1a4d0829ba4";
  if (!apiKey) throw new Error("FRED_API_KEY not configured");

  const url = new URL(`${FRED_BASE_URL}/${endpoint}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000), // 10秒超时，防止 hang 住 Step2
  });
  if (!res.ok) throw new Error(`FRED API error: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Get the latest value for a FRED series
 */
export async function getFredLatest(seriesId: string): Promise<{ date: string; value: number; seriesId: string }> {
  const data = await fetchFred("series/observations", {
    series_id: seriesId,
    limit: "1",
    sort_order: "desc",
  });

  const obs: FredObservation = data.observations[0];
  return {
    date: obs.date,
    value: parseFloat(obs.value),
    seriesId,
  };
}

/**
 * Get recent observations for a FRED series
 */
export async function getFredSeries(seriesId: string, limit = 12): Promise<FredObservation[]> {
  const data = await fetchFred("series/observations", {
    series_id: seriesId,
    limit: String(limit),
    sort_order: "desc",
  });
  return data.observations as FredObservation[];
}

/**
 * Get series metadata
 */
export async function getFredSeriesInfo(seriesId: string): Promise<FredSeriesInfo> {
  const data = await fetchFred("series", { series_id: seriesId });
  return data.seriess[0] as FredSeriesInfo;
}

/**
 * Fetch a comprehensive macroeconomic dashboard
 * Returns key indicators for investment analysis
 */
export async function getMacroDashboard(): Promise<string> {
  const seriesIds = [
    { id: FRED_SERIES.FED_FUNDS_RATE, label: "联邦基金利率", unit: "%" },
    { id: FRED_SERIES.CPI, label: "CPI（消费者物价指数）", unit: "" },
    { id: FRED_SERIES.CORE_PCE, label: "核心PCE（美联储首选通胀指标）", unit: "%" },
    { id: FRED_SERIES.UNEMPLOYMENT, label: "失业率", unit: "%" },
    { id: FRED_SERIES.TREASURY_10Y, label: "10年期美债收益率", unit: "%" },
    { id: FRED_SERIES.TREASURY_2Y, label: "2年期美债收益率", unit: "%" },
    { id: FRED_SERIES.GDP_GROWTH, label: "实际GDP增速", unit: "%" },
  ];

  const results = await Promise.allSettled(
    seriesIds.map(async (s) => {
      const latest = await getFredLatest(s.id);
      return { ...s, ...latest };
    })
  );

  const lines: string[] = ["## 美国宏观经济实时数据（来源：FRED 圣路易斯联储）\n"];

  for (const result of results) {
    if (result.status === "fulfilled") {
      const d = result.value;
      lines.push(`- **${d.label}**: ${d.value}${d.unit} （截至 ${d.date}）`);
    }
  }

  // Calculate yield curve spread (10Y - 2Y)
  const t10 = results[4];
  const t2 = results[5];
  if (t10.status === "fulfilled" && t2.status === "fulfilled") {
    const spread = (t10.value.value - t2.value.value).toFixed(2);
    const inverted = parseFloat(spread) < 0;
    lines.push(`- **收益率曲线（10Y-2Y）**: ${spread}% ${inverted ? "⚠️ 倒挂（历史衰退信号）" : "（正常）"}`);
  }

  return lines.join("\n");
}

/**
 * Fetch specific macro data based on query keywords
 */
export async function getMacroDataByKeywords(keywords: string): Promise<string> {
  const lower = keywords.toLowerCase();
  const toFetch: Array<{ id: string; label: string; unit: string }> = [];

  if (lower.includes("通胀") || lower.includes("cpi") || lower.includes("inflation") || lower.includes("物价")) {
    toFetch.push(
      { id: FRED_SERIES.CPI, label: "CPI", unit: "" },
      { id: FRED_SERIES.CORE_CPI, label: "核心CPI", unit: "" },
      { id: FRED_SERIES.CORE_PCE, label: "核心PCE", unit: "%" }
    );
  }

  if (lower.includes("利率") || lower.includes("美联储") || lower.includes("fed") || lower.includes("interest rate")) {
    toFetch.push(
      { id: FRED_SERIES.FED_FUNDS_RATE, label: "联邦基金利率", unit: "%" },
      { id: FRED_SERIES.TREASURY_10Y, label: "10年期美债收益率", unit: "%" },
      { id: FRED_SERIES.TREASURY_2Y, label: "2年期美债收益率", unit: "%" }
    );
  }

  if (lower.includes("就业") || lower.includes("非农") || lower.includes("unemployment") || lower.includes("payroll")) {
    toFetch.push(
      { id: FRED_SERIES.UNEMPLOYMENT, label: "失业率", unit: "%" },
      { id: FRED_SERIES.NONFARM_PAYROLL, label: "非农就业人数", unit: "千人" },
      { id: FRED_SERIES.INITIAL_CLAIMS, label: "初请失业金人数", unit: "人" }
    );
  }

  if (lower.includes("gdp") || lower.includes("经济增长") || lower.includes("growth")) {
    toFetch.push(
      { id: FRED_SERIES.GDP_GROWTH, label: "实际GDP增速", unit: "%" },
      { id: FRED_SERIES.REAL_GDP, label: "实际GDP", unit: "十亿美元" }
    );
  }

  if (lower.includes("国债") || lower.includes("treasury") || lower.includes("收益率") || lower.includes("yield")) {
    toFetch.push(
      { id: FRED_SERIES.TREASURY_2Y, label: "2年期美债收益率", unit: "%" },
      { id: FRED_SERIES.TREASURY_10Y, label: "10年期美债收益率", unit: "%" },
      { id: FRED_SERIES.TREASURY_30Y, label: "30年期美债收益率", unit: "%" }
    );
  }

  if (lower.includes("m2") || lower.includes("货币供应") || lower.includes("money supply")) {
    toFetch.push({ id: FRED_SERIES.M2, label: "M2货币供应量", unit: "十亿美元" });
  }

  // If no specific keywords matched, return full dashboard
  if (toFetch.length === 0) {
    return getMacroDashboard();
  }

  // Deduplicate
  const unique = toFetch.filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);

  const results = await Promise.allSettled(
    unique.map(async (s) => {
      const latest = await getFredLatest(s.id);
      return { ...s, ...latest };
    })
  );

  const lines: string[] = ["## 宏观经济实时数据（来源：FRED 圣路易斯联储）\n"];
  for (const result of results) {
    if (result.status === "fulfilled") {
      const d = result.value;
      lines.push(`- **${d.label}**: ${d.value}${d.unit} （截至 ${d.date}）`);
    }
  }

  return lines.join("\n");
}
