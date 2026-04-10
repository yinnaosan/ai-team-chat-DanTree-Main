/**
 * ============================================================
 * DATA ROUTING ORCHESTRATOR — DanTree Phase 1
 * ============================================================
 *
 * 将所有路由层组合成一个统一的入口。
 * 调用方只需传入 ticker/query，本模块负责：
 * 1. 按矩阵路由每一层
 * 2. 执行 fallback（Primary → Backup → Backup2 → unavailable）
 * 3. 返回 provider 状态、数据、evidenceScore
 *
 * 这是现有 routers.ts 调用数据的新收口。
 */

import { executeLayerRouting, computeEvidenceScore, buildKeyStatusReport, LayerResult, isFailedData } from "./dataRoutingEngine";
import { fetchChinaFundamentals } from "./fetchChinaFundamentals";
import {
  fetchFMPFundamentals, fetchSimFinFundamentals,
  fetchFinnhubPrice, fetchTiingoPrice, fetchYahooPrice,
  fetchFinnhubNews, fetchMarketauxNews, fetchNewsAPINews,
  fetchTencentNews,
  fetchFREDMacro, fetchWorldBankMacro, fetchIMFMacro,
  fetchQuiverQuantCongress, fetchPolymarketSentiment,
  fetchTwelveDataIndicators, fetchAlphaVantageIndicators,
  fetchYahooOHLCVForIndicators,
} from "./dataLayerFetchers";

// ── 请求参数 ───────────────────────────────────────────────────────────────────
export interface RoutingRequest {
  /** 股票代码（美股: AAPL, A股: 600519.SS, 港股: 0700.HK） */
  ticker: string;
  /** 新闻搜索关键词（默认使用 ticker） */
  newsQuery?: string;
  /** 市场类型（影响哪些层被激活） */
  market: "US" | "CN" | "HK" | "CRYPTO" | "GLOBAL";
  /** 是否需要基本面数据 */
  needFundamentals?: boolean;
  /** 是否需要宏观数据 */
  needMacro?: boolean;
  /** 是否需要另类数据 */
  needAlternative?: boolean;
  /** 是否需要技术指标 */
  needIndicators?: boolean;
}

// ── 路由结果 ───────────────────────────────────────────────────────────────────
export interface RoutingResult {
  ticker: string;
  market: string;
  layerResults: LayerResult[];
  evidenceScore: {
    score: number;
    activeCount: number;
    totalLayers: number;
    activeProviders: string[];
    excludedProviders: Array<{ id: string; reason: string }>;
  };
  /** 合并后的数据文本（用于注入 LLM prompt） */
  combinedData: string;
  /** fallback 触发记录 */
  fallbackLog: Array<{ layer: string; usedProvider: string; reason: string }>;
  /** provider 状态汇总 */
  providerStatusSummary: Record<string, string>;
  /** key 状态报告 */
  keyStatusReport: ReturnType<typeof buildKeyStatusReport>;
}

// ── 主路由函数 ─────────────────────────────────────────────────────────────────
export async function routeDataRequest(req: RoutingRequest): Promise<RoutingResult> {
  const {
    ticker,
    newsQuery = ticker,
    market,
    needFundamentals = true,
    needMacro = true,
    needAlternative = false,
    needIndicators = true,
  } = req;

  const layerResults: LayerResult[] = [];
  const fallbackLog: Array<{ layer: string; usedProvider: string; reason: string }> = [];

  // ── [Price] ─────────────────────────────────────────────────────────────────
  const priceFetchers = new Map([
    ["finnhub", () => fetchFinnhubPrice(ticker)],
    ["tiingo", () => fetchTiingoPrice(ticker)],
    ["yahoo_finance", () => fetchYahooPrice(ticker)],
  ]);
  const priceResult = await executeLayerRouting("price", priceFetchers);
  layerResults.push(priceResult);
  if (priceResult.fallbackUsed && priceResult.activeProvider) {
    const failedProviders = priceResult.providerResults
      .filter(p => p.status === "failed" || p.status === "missing_key")
      .map(p => p.displayName).join(", ");
    fallbackLog.push({ layer: "price", usedProvider: priceResult.activeProvider, reason: `Primary/Backup failed: ${failedProviders}` });
  }

  // ── [News - Global] ─────────────────────────────────────────────────────────
  const newsGlobalFetchers = new Map([
    ["finnhub", () => fetchFinnhubNews(ticker)],
    ["marketaux", () => fetchMarketauxNews(ticker)],
    ["news_api", () => fetchNewsAPINews(newsQuery)],
  ]);
  const newsGlobalResult = await executeLayerRouting("news_global", newsGlobalFetchers);
  layerResults.push(newsGlobalResult);
  if (newsGlobalResult.fallbackUsed && newsGlobalResult.activeProvider) {
    fallbackLog.push({ layer: "news_global", usedProvider: newsGlobalResult.activeProvider, reason: "Primary news source failed" });
  }

  // ── [News - China]（仅 CN/HK 市场）─────────────────────────────────────────
  if (market === "CN" || market === "HK") {
    const newsChinaFetchers = new Map([
      ["tencent_news", () => fetchTencentNews(newsQuery)],
    ]);
    const newsChinaResult = await executeLayerRouting("news_china", newsChinaFetchers);
    layerResults.push(newsChinaResult);
  }

  // ── [Fundamentals - CN]（仅 A股 + 需要基本面）────────────────────────────
  if (needFundamentals && market === "CN") {
    const cnFundamentalsFetchers = new Map([
      ["china_fundamentals", () => fetchChinaFundamentals(ticker)],
    ]);
    const cnFundamentalsResult = await executeLayerRouting("fundamentals", cnFundamentalsFetchers);
    layerResults.push(cnFundamentalsResult);
    if (cnFundamentalsResult.status === "unavailable" || !cnFundamentalsResult.data) {
      fallbackLog.push({ layer: "fundamentals", usedProvider: "none", reason: "CN fundamentals service unavailable or returned no data" });
    }
  }
  // ── [Fundamentals]（仅美股 + 需要基本面）──────────────────────────────────
  if (needFundamentals && market === "US") {
    const fundamentalsFetchers = new Map([
      ["fmp", () => fetchFMPFundamentals(ticker)],
      ["simfin", () => fetchSimFinFundamentals(ticker)],
    ]);
    const fundamentalsResult = await executeLayerRouting("fundamentals", fundamentalsFetchers);
    layerResults.push(fundamentalsResult);
    if (fundamentalsResult.fallbackUsed && fundamentalsResult.activeProvider) {
      fallbackLog.push({ layer: "fundamentals", usedProvider: fundamentalsResult.activeProvider, reason: "FMP failed, using SimFin" });
    }
  }

  // ── [Macro]（需要宏观数据）────────────────────────────────────────────────
  if (needMacro) {
    const macroFetchers = new Map([
      ["fred", () => fetchFREDMacro()],
      ["world_bank", () => fetchWorldBankMacro()],
      ["imf_weo", () => fetchIMFMacro()],
    ]);
    const macroResult = await executeLayerRouting("macro", macroFetchers);
    layerResults.push(macroResult);
    if (macroResult.fallbackUsed && macroResult.activeProvider) {
      fallbackLog.push({ layer: "macro", usedProvider: macroResult.activeProvider, reason: "FRED failed, using fallback" });
    }
  }

  // ── [Alternative]（仅美股 + 需要另类数据）────────────────────────────────
  if (needAlternative && market === "US") {
    const altFetchers = new Map([
      ["quiverquant", () => fetchQuiverQuantCongress(ticker)],
      ["polymarket", () => fetchPolymarketSentiment(ticker)],
    ]);
    const altResult = await executeLayerRouting("alternative", altFetchers);
    layerResults.push(altResult);
  }

  // ── [Indicators]（需要技术指标）──────────────────────────────────────────
  if (needIndicators) {
    if (market === "US") {
      // US: Twelve Data → Alpha Vantage
      const indFetchers = new Map([
        ["twelve_data", () => fetchTwelveDataIndicators(ticker)],
        ["alpha_vantage", () => fetchAlphaVantageIndicators(ticker)],
      ]);
      const indResult = await executeLayerRouting("indicators_us", indFetchers);
      layerResults.push(indResult);
      if (indResult.fallbackUsed && indResult.activeProvider) {
        fallbackLog.push({ layer: "indicators_us", usedProvider: indResult.activeProvider, reason: "Twelve Data failed, using Alpha Vantage" });
      }
    } else {
      // CN/HK: Yahoo OHLCV → Alpha Vantage → 本地计算
      const indFetchers = new Map([
        ["yahoo_finance", () => fetchYahooOHLCVForIndicators(ticker)],
        ["alpha_vantage", () => fetchAlphaVantageIndicators(ticker)],
      ]);
      const indResult = await executeLayerRouting("indicators_cn_hk", indFetchers);
      layerResults.push(indResult);
      if (indResult.fallbackUsed && indResult.activeProvider) {
        fallbackLog.push({ layer: "indicators_cn_hk", usedProvider: indResult.activeProvider, reason: "Yahoo OHLCV failed, using Alpha Vantage" });
      }
    }
  }

  // ── 计算 evidenceScore（STEP 6 修复版）────────────────────────────────────
  const evidenceScore = computeEvidenceScore(layerResults);

  // ── 合并数据文本 ──────────────────────────────────────────────────────────
  const dataParts = layerResults
    .filter(lr => lr.data && !isFailedData(lr.data))
    .map(lr => lr.data!);
  const combinedData = dataParts.join("\n\n---\n\n");

  // ── provider 状态汇总 ─────────────────────────────────────────────────────
  const providerStatusSummary: Record<string, string> = {};
  for (const lr of layerResults) {
    for (const pr of lr.providerResults) {
      providerStatusSummary[pr.id] = pr.status;
    }
  }

  return {
    ticker,
    market,
    layerResults,
    evidenceScore,
    combinedData,
    fallbackLog,
    providerStatusSummary,
    keyStatusReport: buildKeyStatusReport(),
  };
}

/**
 * 将路由结果格式化为 Markdown 报告（用于调试和日志）
 */
export function formatRoutingReport(result: RoutingResult): string {
  const lines: string[] = [
    `# Data Routing Report — ${result.ticker} (${result.market})`,
    `**EvidenceScore: ${result.evidenceScore.score}/100** (${result.evidenceScore.activeCount}/${result.evidenceScore.totalLayers} 层有效)`,
    "",
    "## Provider 状态",
    "| Layer | Provider | Status | Latency |",
    "|-------|----------|--------|---------|",
  ];

  for (const lr of result.layerResults) {
    for (const pr of lr.providerResults) {
      const latency = pr.latencyMs >= 0 ? `${pr.latencyMs}ms` : "N/A";
      lines.push(`| ${lr.layer} | ${pr.displayName} | ${pr.status} | ${latency} |`);
    }
  }

  if (result.fallbackLog.length > 0) {
    lines.push("", "## Fallback 触发记录");
    for (const f of result.fallbackLog) {
      lines.push(`- **${f.layer}** → 使用 ${f.usedProvider}（${f.reason}）`);
    }
  }

  if (result.evidenceScore.excludedProviders.length > 0) {
    lines.push("", "## 排除出 EvidenceScore 的 Provider");
    for (const e of result.evidenceScore.excludedProviders) {
      lines.push(`- ${e.id}（${e.reason}）`);
    }
  }

  return lines.join("\n");
}
