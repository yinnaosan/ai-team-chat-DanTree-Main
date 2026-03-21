/**
 * Bank of England (BoE) Statistical Database API Module
 * Provides UK interest rates, gilt yields, exchange rates, and monetary data
 * Free public API: https://www.bankofengland.co.uk/boeapps/database/
 * CSV download format: _iadb-FromShowColumns.asp?csv.x=yes&SeriesCodes=...
 */

const BOE_BASE =
  "https://www.bankofengland.co.uk/boeapps/database/_iadb-FromShowColumns.asp";

// ─── Series Codes ─────────────────────────────────────────────────────────────

const BOE_SERIES = {
  BANK_RATE: "IUDBEDR",       // Official Bank Rate
  SONIA: "IUDSOIA",           // SONIA overnight rate
  GILT_10Y: "IUDMNPY",        // 10-year gilt yield
  GILT_2Y: "IUAABEDR",        // 2-year gilt yield (monthly)
  USD_GBP: "XUMAUSS",         // USD/GBP spot rate (monthly)
  EUR_GBP: "XUMAERS",         // EUR/GBP spot rate (monthly)
  JPY_GBP: "XUMAJYS",         // JPY/GBP spot rate (monthly)
  M4_GROWTH: "IUMBV34",       // M4 money supply annual growth %
  CPI: "IUQABEDR",            // CPI inflation (quarterly)
  CONSUMER_CREDIT: "LPMVWYR", // Consumer credit outstanding (£M)
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BoeSeriesPoint {
  date: string;
  value: number | null;
}

export interface BoeData {
  bankRate: BoeSeriesPoint | null;
  sonia: BoeSeriesPoint | null;
  gilt10y: BoeSeriesPoint | null;
  gilt2y: BoeSeriesPoint | null;
  usdGbp: BoeSeriesPoint | null;
  eurGbp: BoeSeriesPoint | null;
  jpyGbp: BoeSeriesPoint | null;
  m4Growth: BoeSeriesPoint | null;
  cpi: BoeSeriesPoint | null;
  fetchedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = `${now.getDate().toString().padStart(2, "0")}/${now.toLocaleString("en-GB", { month: "short" })}/${now.getFullYear()}`;
  const fromDate = new Date(now);
  fromDate.setFullYear(fromDate.getFullYear() - 1);
  const from = `01/Jan/${fromDate.getFullYear()}`;
  return { from, to };
}

async function fetchBoeSeries(
  seriesCode: string
): Promise<BoeSeriesPoint | null> {
  const { from, to } = getDateRange();
  const params = new URLSearchParams({
    "csv.x": "yes",
    Datefrom: from,
    Dateto: to,
    SeriesCodes: seriesCode,
    CSVF: "TT",
    UsingCodes: "Y",
  });
  const url = `${BOE_BASE}?${params}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/csv" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`BoE HTTP ${res.status}: ${seriesCode}`);

  const text = await res.text();
  if (!text.startsWith("SERIES")) {
    throw new Error(`BoE unexpected response format for ${seriesCode}`);
  }

  // Parse CSV: skip SERIES header block, then DATE,VALUE rows
  const lines = text.trim().split("\n").filter((l) => l.trim());
  const dataLines: string[] = [];
  let pastHeader = false;
  for (const line of lines) {
    if (line.startsWith("DATE,")) {
      pastHeader = true;
      continue;
    }
    if (pastHeader && line.trim()) {
      dataLines.push(line.trim());
    }
  }

  if (dataLines.length === 0) return null;

  // Return the most recent data point
  const lastLine = dataLines[dataLines.length - 1];
  const parts = lastLine.split(",");
  if (parts.length < 2) return null;

  const dateStr = parts[0].trim();
  const valueStr = parts[1].trim();
  const value = valueStr === "" || valueStr === "." ? null : parseFloat(valueStr);

  return { date: dateStr, value };
}

// ─── Main Fetch ───────────────────────────────────────────────────────────────

export async function fetchBoeData(): Promise<BoeData> {
  const [
    bankRateRes,
    soniaRes,
    gilt10yRes,
    gilt2yRes,
    usdGbpRes,
    eurGbpRes,
    jpyGbpRes,
    m4GrowthRes,
    cpiRes,
  ] = await Promise.allSettled([
    fetchBoeSeries(BOE_SERIES.BANK_RATE),
    fetchBoeSeries(BOE_SERIES.SONIA),
    fetchBoeSeries(BOE_SERIES.GILT_10Y),
    fetchBoeSeries(BOE_SERIES.GILT_2Y),
    fetchBoeSeries(BOE_SERIES.USD_GBP),
    fetchBoeSeries(BOE_SERIES.EUR_GBP),
    fetchBoeSeries(BOE_SERIES.JPY_GBP),
    fetchBoeSeries(BOE_SERIES.M4_GROWTH),
    fetchBoeSeries(BOE_SERIES.CPI),
  ]);

  const getValue = (
    r: PromiseSettledResult<BoeSeriesPoint | null>
  ): BoeSeriesPoint | null =>
    r.status === "fulfilled" ? r.value : null;

  return {
    bankRate: getValue(bankRateRes),
    sonia: getValue(soniaRes),
    gilt10y: getValue(gilt10yRes),
    gilt2y: getValue(gilt2yRes),
    usdGbp: getValue(usdGbpRes),
    eurGbp: getValue(eurGbpRes),
    jpyGbp: getValue(jpyGbpRes),
    m4Growth: getValue(m4GrowthRes),
    cpi: getValue(cpiRes),
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Trigger Condition ────────────────────────────────────────────────────────

export function isBoeRelevantTask(task: string): boolean {
  const lower = task.toLowerCase();
  const keywords = [
    // GBP / UK monetary
    "gbp", "英镑", "英国利率", "英国通胀", "英国央行",
    "bank of england", "boe", "英格兰银行",
    "gilt", "英国国债", "sonia",
    // UK macro
    "uk interest", "uk inflation", "uk monetary", "uk economy",
    "英国经济", "英国货币政策",
    // GBP pairs
    "gbp/usd", "eur/gbp", "usd/gbp",
    // UK specific
    "ftse", "英国股市",
  ];
  return keywords.some((k) => lower.includes(k));
}

// ─── Formatter ────────────────────────────────────────────────────────────────

export function formatBoeDataAsMarkdown(data: BoeData): string {
  const lines: string[] = ["## 英格兰银行（BoE）数据\n"];

  lines.push("### 英国关键利率与收益率");
  lines.push(`| 指标 | 最新值 | 日期 |`);
  lines.push(`|------|--------|------|`);

  const addRow = (label: string, point: BoeSeriesPoint | null, unit = "%") => {
    if (point && point.value != null) {
      lines.push(`| ${label} | ${point.value}${unit} | ${point.date} |`);
    }
  };

  addRow("英国基准利率（Bank Rate）", data.bankRate);
  addRow("SONIA 隔夜利率", data.sonia);
  addRow("10年期国债收益率", data.gilt10y);
  addRow("2年期国债收益率", data.gilt2y);
  addRow("CPI 通胀率", data.cpi);
  addRow("M4 货币供应量增长", data.m4Growth);
  lines.push("");

  lines.push("### 英镑汇率（最新月度）");
  lines.push(`| 货币对 | 汇率 | 日期 |`);
  lines.push(`|--------|------|------|`);

  const addFxRow = (label: string, point: BoeSeriesPoint | null) => {
    if (point && point.value != null) {
      lines.push(`| ${label} | ${point.value} | ${point.date} |`);
    }
  };

  addFxRow("USD/GBP（美元兑英镑）", data.usdGbp);
  addFxRow("EUR/GBP（欧元兑英镑）", data.eurGbp);
  addFxRow("JPY/GBP（日元兑英镑）", data.jpyGbp);
  lines.push("");

  return lines.join("\n");
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkBoeHealth(): Promise<{
  status: "ok" | "error";
  latency: number;
  message: string;
}> {
  const start = Date.now();
  try {
    const point = await fetchBoeSeries(BOE_SERIES.BANK_RATE);
    const latency = Date.now() - start;
    if (point && point.value != null) {
      return {
        status: "ok",
        latency,
        message: `BoE API 正常，Bank Rate: ${point.value}% (${point.date})`,
      };
    }
    return { status: "error", latency, message: "BoE API 返回空数据" };
  } catch (e: unknown) {
    return {
      status: "error",
      latency: Date.now() - start,
      message: `BoE API 错误: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
