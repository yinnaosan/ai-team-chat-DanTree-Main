/**
 * fetchChinaFundamentals v1.1
 * Calls the china-fundamentals-service (Python FastAPI on port 8001)
 * Only invoked when market === "CN" && needFundamentals.
 * Does NOT affect US fundamentals chain.
 *
 * Returns both:
 *   - structured object (ChinaFundamentalsResponse) for downstream use
 *   - formatted Markdown string for LLM consumption
 */

const CHINA_FUNDAMENTALS_URL = "http://localhost:8001";
const TIMEOUT_MS = 45_000; // 45s — Python providers can be slow on first call

function makeAbortSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// ── Raw numeric data ──────────────────────────────────────────────────────────
export interface ChinaFundamentalsRaw {
  // Core (9)
  pe: number | null;
  pb: number | null;
  ps: number | null;
  roe: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  // Extended (11)
  operatingMargin: number | null;
  roa: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  cashFromOperations: number | null;
  freeCashFlow: number | null;
  revenueGrowthYoy: number | null;
  netIncomeGrowthYoy: number | null;
  bookValuePerShare: number | null;
  dividendYield: number | null;
  sharesOutstanding: number | null;
  // Metadata
  fiscalYear: number | null;
  sourceType: string | null;
  confidence: string | null;
}

// ── Formatted display strings ─────────────────────────────────────────────────
export interface ChinaFundamentalsFmt {
  pe: string;
  pb: string;
  ps: string;
  roe: string;
  grossMargin: string;
  netMargin: string;
  revenue: string;
  netIncome: string;
  eps: string;
  operatingMargin: string;
  roa: string;
  debtToEquity: string;
  currentRatio: string;
  cashFromOperations: string;
  freeCashFlow: string;
  revenueGrowthYoy: string;
  netIncomeGrowthYoy: string;
  bookValuePerShare: string;
  dividendYield: string;
  sharesOutstanding: string;
}

// ── Full response ─────────────────────────────────────────────────────────────
export interface ChinaFundamentalsResponse {
  raw: ChinaFundamentalsRaw;
  fmt: ChinaFundamentalsFmt;
  source: string;
  sourceType: string;
  confidence: string;
  status: string;
  coverageScore: number;
  missingFields: string[];
  symbol: string;
  fetched_at: number;
}

// ── Source label maps ─────────────────────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  baostock: "BaoStock（主源）",
  akshare: "AKShare（备源 1）",
  efinance: "efinance（备源 2）",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  official_free: "官方免费",
  third_party_free: "第三方免费",
};

/**
 * Fetch CN fundamentals from the Python microservice.
 * Returns { structured, text } or null if unavailable.
 */
export async function fetchChinaFundamentals(
  ticker: string
): Promise<{ structured: ChinaFundamentalsResponse; text: string } | null> {
  try {
    const symbol = ticker.split(".")[0];

    const res = await fetch(
      `${CHINA_FUNDAMENTALS_URL}/fundamentals?symbol=${encodeURIComponent(symbol)}`,
      { signal: makeAbortSignal(TIMEOUT_MS) }
    );

    if (!res.ok) {
      console.warn(`[china-fundamentals] HTTP ${res.status} for ${symbol}`);
      return null;
    }

    const json = (await res.json()) as ChinaFundamentalsResponse;

    if (json.status === "unavailable") {
      console.warn(`[china-fundamentals] unavailable for ${symbol}`);
      return null;
    }

    const text = buildMarkdown(ticker, json);
    return { structured: json, text };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      console.warn(`[china-fundamentals] timeout for ${ticker}`);
    } else {
      console.warn(`[china-fundamentals] error for ${ticker}: ${e?.message}`);
    }
    return null;
  }
}

/**
 * Build LLM-ready Markdown from structured response.
 */
function buildMarkdown(ticker: string, json: ChinaFundamentalsResponse): string {
  const f = json.fmt;
  const sourceLabel = SOURCE_LABELS[json.source] ?? json.source;
  const confidenceLabel = CONFIDENCE_LABELS[json.confidence] ?? json.confidence;
  const sourceTypeLabel = SOURCE_TYPE_LABELS[json.sourceType] ?? json.sourceType;
  const statusLabel = json.status === "active" ? "主源" : "已触发 Fallback";
  const fyLabel = json.raw.fiscalYear ? `FY${json.raw.fiscalYear}` : "最新可得";
  const coveragePct = (json.coverageScore * 100).toFixed(1);

  const missingNote =
    json.missingFields.length > 0
      ? `\n> ⚠️ 以下字段当前不可得：${json.missingFields.join(", ")}`
      : "";

  return `## A股基本面数据 — ${ticker}
> 数据来源：${sourceLabel}（${sourceTypeLabel}）| 置信度：${confidenceLabel} | 状态：${statusLabel} | 财年：${fyLabel} | 字段覆盖率：${coveragePct}%${missingNote}

### 估值指标
| 指标 | 数值 |
|------|------|
| 市盈率（PE TTM） | ${f.pe} |
| 市净率（PB MRQ） | ${f.pb} |
| 市销率（PS TTM） | ${f.ps} |
| 股息率 | ${f.dividendYield} |

### 盈利能力
| 指标 | 数值 |
|------|------|
| 净资产收益率（ROE） | ${f.roe} |
| 资产收益率（ROA） | ${f.roa} |
| 毛利率 | ${f.grossMargin} |
| 营业利润率 | ${f.operatingMargin} |
| 净利率 | ${f.netMargin} |

### 财务规模
| 指标 | 数值 |
|------|------|
| 营业收入 | ${f.revenue} |
| 净利润 | ${f.netIncome} |
| 经营现金流 | ${f.cashFromOperations} |
| 自由现金流（FCF） | ${f.freeCashFlow} |
| 每股收益（EPS） | ${f.eps} |
| 每股净资产（BVPS） | ${f.bookValuePerShare} |

### 成长性
| 指标 | 数值 |
|------|------|
| 净利润同比增长 | ${f.netIncomeGrowthYoy} |
| 营收同比增长 | ${f.revenueGrowthYoy} |

### 财务健康
| 指标 | 数值 |
|------|------|
| 负债权益比（D/E） | ${f.debtToEquity} |
| 流动比率 | ${f.currentRatio} |
| 总股本 | ${f.sharesOutstanding} |`;
}

/**
 * Health check — used by orchestrator startup to verify service is up.
 * Returns true if service is reachable, false otherwise (silent).
 */
export async function checkChinaFundamentalsHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${CHINA_FUNDAMENTALS_URL}/health`, {
      signal: makeAbortSignal(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
