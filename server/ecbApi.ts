/**
 * ECB (European Central Bank) Data API
 * 欧洲央行数据 API - 欧元区利率/通胀/汇率/货币供应量
 * 免费公开，无需 API Key
 * 文档: https://data-api.ecb.europa.eu/
 */

const ECB_BASE = "https://data-api.ecb.europa.eu/service/data";

// 请求限速：ECB API 无明确限制，但建议并发不超过 5
const TIMEOUT_MS = 12000;

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface ECBDataPoint {
  period: string;  // e.g. "2025-06-11" or "2025-12" or "2026-03-20"
  value: number | null;
}

export interface ECBInterestRates {
  mainRefinancingRate: ECBDataPoint | null;   // 主要再融资利率
  depositFacilityRate: ECBDataPoint | null;   // 存款便利利率
  marginalLendingRate: ECBDataPoint | null;   // 边际贷款利率
}

export interface ECBInflation {
  hicpYoY: ECBDataPoint | null;              // HICP 调和消费者价格指数（同比，%）
}

export interface ECBExchangeRates {
  eurUsd: ECBDataPoint | null;               // EUR/USD
  eurCny: ECBDataPoint | null;               // EUR/CNY
  eurGbp: ECBDataPoint | null;               // EUR/GBP
  eurJpy: ECBDataPoint | null;               // EUR/JPY
}

export interface ECBM3 {
  m3YoY: ECBDataPoint | null;               // M3 货币供应量同比增速（%）
}

export interface ECBData {
  interestRates: ECBInterestRates;
  inflation: ECBInflation;
  exchangeRates: ECBExchangeRates;
  m3: ECBM3;
  fetchedAt: string;
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────

async function fetchECBSeries(dataflow: string, key: string, lastN = 1): Promise<ECBDataPoint | null> {
  const url = `${ECB_BASE}/${dataflow}/${key}?format=jsondata&lastNObservations=${lastN}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as {
      dataSets: Array<{ series: Record<string, { observations: Record<string, [number | null, ...unknown[]]> }> }>;
      structure: { dimensions: { observation: Array<{ values: Array<{ id: string }> }> } };
    };
    const ds = data.dataSets?.[0];
    if (!ds) return null;
    const series = ds.series;
    if (!series) return null;
    const firstKey = Object.keys(series)[0];
    if (!firstKey) return null;
    const obs = series[firstKey].observations;
    const timeDim = data.structure?.dimensions?.observation?.[0]?.values ?? [];
    const obsKeys = Object.keys(obs).sort((a, b) => Number(a) - Number(b));
    const lastObsKey = obsKeys[obsKeys.length - 1];
    if (lastObsKey === undefined) return null;
    const obsIdx = Number(lastObsKey);
    const value = obs[lastObsKey]?.[0] ?? null;
    const period = timeDim[obsIdx]?.id ?? "";
    return { period, value };
  } catch {
    return null;
  }
}

// ─── 主获取函数 ────────────────────────────────────────────────────────────

export async function fetchECBData(): Promise<ECBData> {
  const [
    mainRate, depositRate, marginalRate,
    hicp,
    eurUsd, eurCny, eurGbp, eurJpy,
    m3,
  ] = await Promise.allSettled([
    // 三大关键利率
    fetchECBSeries("FM", "B.U2.EUR.4F.KR.MRR_FR.LEV"),
    fetchECBSeries("FM", "B.U2.EUR.4F.KR.DFR.LEV"),
    fetchECBSeries("FM", "B.U2.EUR.4F.KR.MLFR.LEV"),
    // HICP 通胀（月度同比）
    fetchECBSeries("ICP", "M.U2.N.000000.4.ANR"),
    // 汇率（日度）
    fetchECBSeries("EXR", "D.USD.EUR.SP00.A"),
    fetchECBSeries("EXR", "D.CNY.EUR.SP00.A"),
    fetchECBSeries("EXR", "D.GBP.EUR.SP00.A"),
    fetchECBSeries("EXR", "D.JPY.EUR.SP00.A"),
    // M3 货币供应量（月度同比）
    fetchECBSeries("BSI", "M.U2.Y.V.M30.X.1.U2.2300.Z01.E"),
  ]);

  const get = <T>(r: PromiseSettledResult<T>): T | null =>
    r.status === "fulfilled" ? r.value : null;

  return {
    interestRates: {
      mainRefinancingRate: get(mainRate),
      depositFacilityRate: get(depositRate),
      marginalLendingRate: get(marginalRate),
    },
    inflation: {
      hicpYoY: get(hicp),
    },
    exchangeRates: {
      eurUsd: get(eurUsd),
      eurCny: get(eurCny),
      eurGbp: get(eurGbp),
      eurJpy: get(eurJpy),
    },
    m3: {
      m3YoY: get(m3),
    },
    fetchedAt: new Date().toISOString(),
  };
}

// ─── 格式化为 Markdown ─────────────────────────────────────────────────────

export function formatECBDataAsMarkdown(data: ECBData): string {
  const fmt = (dp: ECBDataPoint | null, decimals = 2, suffix = "%"): string => {
    if (!dp || dp.value === null) return "N/A";
    return `${dp.value.toFixed(decimals)}${suffix} (${dp.period})`;
  };

  const lines: string[] = [
    "## 欧洲央行（ECB）数据",
    "",
    "### 关键利率",
    `| 利率类型 | 当前值 |`,
    `|---------|-------|`,
    `| 主要再融资利率 | ${fmt(data.interestRates.mainRefinancingRate)} |`,
    `| 存款便利利率 | ${fmt(data.interestRates.depositFacilityRate)} |`,
    `| 边际贷款利率 | ${fmt(data.interestRates.marginalLendingRate)} |`,
    "",
    "### 通胀",
    `| 指标 | 当前值 |`,
    `|-----|-------|`,
    `| HICP 同比通胀率 | ${fmt(data.inflation.hicpYoY)} |`,
    "",
    "### 欧元汇率",
    `| 货币对 | 汇率 |`,
    `|-------|-----|`,
    `| EUR/USD | ${fmt(data.exchangeRates.eurUsd, 4, ` (${data.exchangeRates.eurUsd?.period ?? ""})`).replace(/ \(\)$/, "")} |`,
    `| EUR/CNY | ${fmt(data.exchangeRates.eurCny, 4, ` (${data.exchangeRates.eurCny?.period ?? ""})`).replace(/ \(\)$/, "")} |`,
    `| EUR/GBP | ${fmt(data.exchangeRates.eurGbp, 5, ` (${data.exchangeRates.eurGbp?.period ?? ""})`).replace(/ \(\)$/, "")} |`,
    `| EUR/JPY | ${fmt(data.exchangeRates.eurJpy, 2, ` (${data.exchangeRates.eurJpy?.period ?? ""})`).replace(/ \(\)$/, "")} |`,
    "",
    "### 货币供应量",
    `| 指标 | 当前值 |`,
    `|-----|-------|`,
    `| M3 同比增速 | ${fmt(data.m3.m3YoY)} |`,
  ];

  // 简化汇率格式
  const rateLines = lines.map(line => {
    // 修复汇率行格式：去掉双重括号
    if (line.includes("EUR/") && line.includes("(")) {
      const match = line.match(/\| (EUR\/\w+) \| (.+) \|/);
      if (match) {
        const pair = match[1];
        const dp = {
          "EUR/USD": data.exchangeRates.eurUsd,
          "EUR/CNY": data.exchangeRates.eurCny,
          "EUR/GBP": data.exchangeRates.eurGbp,
          "EUR/JPY": data.exchangeRates.eurJpy,
        }[pair];
        if (dp && dp.value !== null) {
          const decimals = pair === "EUR/GBP" ? 5 : pair === "EUR/JPY" ? 2 : 4;
          return `| ${pair} | ${dp.value.toFixed(decimals)} (${dp.period}) |`;
        }
      }
    }
    return line;
  });

  return rateLines.join("\n");
}

// ─── 健康检测 ──────────────────────────────────────────────────────────────

export async function checkECBHealth(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const start = Date.now();
  try {
    const result = await fetchECBSeries("FM", "B.U2.EUR.4F.KR.DFR.LEV", 1);
    const latencyMs = Date.now() - start;
    if (result && result.value !== null) {
      return { ok: true, latencyMs, detail: `ECB 存款利率: ${result.value}% (${result.period})` };
    }
    return { ok: false, latencyMs, detail: "ECB API 返回空数据" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, detail: String(e) };
  }
}

// ─── 触发条件检测 ──────────────────────────────────────────────────────────

/**
 * 检测任务是否与欧元区/ECB 相关
 * 触发条件：欧元区、ECB、欧洲央行、欧元、EUR、欧洲经济、欧元区通胀等
 */
export function isECBRelevantTask(taskText: string): boolean {
  const lower = taskText.toLowerCase();
  const keywords = [
    "ecb", "european central bank", "欧洲央行", "欧元区", "eurozone", "euro area",
    "eur/", "/eur", "欧元", "euro ", " eur ", "hicp", "欧洲通胀", "欧洲利率",
    "欧洲经济", "欧盟经济", "eu economy", "european economy",
    "欧洲货币", "欧洲货币政策", "ecb rate", "ecb policy",
  ];
  return keywords.some(kw => lower.includes(kw));
}
