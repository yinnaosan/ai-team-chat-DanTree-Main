/**
 * fetchChinaFundamentals
 * Calls the china-fundamentals-service (Python FastAPI on port 8001)
 * Only invoked when market === "CN" && needFundamentals.
 * Does NOT affect US fundamentals chain.
 */

const CHINA_FUNDAMENTALS_URL = "http://localhost:8001";
const TIMEOUT_MS = 30_000; // 30s — Python providers can be slow on first call

function timeout(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export interface ChinaFundamentalsData {
  pe: number | null;
  pb: number | null;
  roe: number | null;
  revenue: number | null;
  netIncome: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  eps: number | null;
}

export interface ChinaFundamentalsResponse {
  data: ChinaFundamentalsData;
  source: string;
  confidence: string;
  status: string;
  symbol: string;
  fetched_at: number;
}

function fmtNum(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || !isFinite(val)) return "N/A";
  return val.toFixed(decimals);
}

function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined || !isFinite(val)) return "N/A";
  return (val * 100).toFixed(2) + "%";
}

function fmtBillion(val: number | null | undefined): string {
  if (val === null || val === undefined || !isFinite(val)) return "N/A";
  const b = val / 1e8; // convert CNY to 亿元
  return b.toFixed(2) + "亿";
}

export async function fetchChinaFundamentals(ticker: string): Promise<string | null> {
  try {
    // Strip exchange suffix: "600519.SS" → "600519"
    const symbol = ticker.split(".")[0];

    const res = await fetch(
      `${CHINA_FUNDAMENTALS_URL}/fundamentals?symbol=${encodeURIComponent(symbol)}`,
      { signal: timeout(TIMEOUT_MS) }
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

    const d = json.data;
    const sourceLabel = {
      baostock: "BaoStock（主源）",
      akshare: "AKShare（备源 1）",
      efinance: "efinance（备源 2）",
    }[json.source] ?? json.source;

    const confidenceLabel = {
      high: "高",
      medium: "中",
      low: "低",
    }[json.confidence] ?? json.confidence;

    const statusLabel = json.status === "active" ? "主源" : "已触发 Fallback";

    return `## A股基本面数据 — ${ticker}
> 数据来源：${sourceLabel} | 置信度：${confidenceLabel} | 状态：${statusLabel}

| 指标 | 数值 |
|------|------|
| 市盈率（PE） | ${fmtNum(d.pe)} |
| 市净率（PB） | ${fmtNum(d.pb)} |
| 净资产收益率（ROE） | ${fmtPct(d.roe)} |
| 营业收入 | ${fmtBillion(d.revenue)} |
| 净利润 | ${fmtBillion(d.netIncome)} |
| 毛利率 | ${fmtPct(d.grossMargin)} |
| 净利率 | ${fmtPct(d.netMargin)} |
| 每股收益（EPS） | ${fmtNum(d.eps, 4)} 元 |`;
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
 * Health check — used by orchestrator startup to verify service is up.
 * Returns true if service is reachable, false otherwise (silent).
 */
export async function checkChinaFundamentalsHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${CHINA_FUNDAMENTALS_URL}/health`, {
      signal: timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
