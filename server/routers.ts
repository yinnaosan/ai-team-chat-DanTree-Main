import { z } from "zod";
import { nanoid } from "nanoid";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, ownerProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import {
  insertMessage,
  getMessages,
  getAllMessages,
  getMessagesByTask,
  getMessagesByConversation,
  createTask,
  updateTaskStatus,
  getTasksByUser,
  getTaskById,
  createConversation,
  getConversationsByUser,
  updateConversationTitle,
  setConversationPinned,
  setConversationFavorited,
  deleteConversationAndMessages,
  insertAttachment,
  getAttachmentsByConversation,
  getAttachmentsByMessage,
  getAttachmentById,
  saveDbConnection,
  getDbConnectionsByUser,
  getActiveDbConnection,
  setActiveDbConnection,
  deleteDbConnection,
  getRpaConfig,
  getOwnerRpaConfig,
  upsertRpaConfig,
  createAccessCode,
  listAccessCodes,
  revokeAccessCode,
  verifyAccessCode,
  incrementCodeUsage,
  getUserAccess,
  grantUserAccess,
  revokeUserAccess,
  getRecentMemory,
  getRelevantMemory,
  saveMemoryContext,
  getAgentSignalHistory,
  setPinned,
  setFavorited,
  createConversationGroup,
  getConversationGroupsByUser,
  deleteConversationGroup,
  setConversationGroup,
  renameConversationGroup,
  setGroupCollapsed,
  getAllMessagesByUser,
  searchConversations,
  updateMessageContent,
  upsertDailySentiment,
  getSentimentHistoryRecords,
  deleteMemoryContext,
  deleteMemoryContextBatch,
  updateMemoryContext,
} from "./db";
import { storagePut } from "./storage";
import { callOpenAI, callOpenAIStream, testOpenAIConnection, DEFAULT_MODEL } from "./rpa";
import { emitTaskStatus, emitTaskChunk, emitTaskDone, emitTaskError } from "./taskStream";
import { getFileCategory, extractFileContent, formatFileSize } from "./fileProcessor";
import { TRPCError } from "@trpc/server";
import { fetchStockDataForTask, fetchStockDataForTaskWithDedup } from "./yahooFinance";
import { getMacroDataByKeywords } from "./fredApi";
import { fetchWorldBankData } from "./worldBankApi";
import { fetchImfData, formatImfDataAsMarkdown, checkImfApiHealth } from "./imfApi";
import { isTavilyConfigured, getTavilyKeyStatuses, getSerperKeyStatuses, isSerperConfigured, getActiveSearchEngine } from "./tavilySearch";
import { runMultiAgentAnalysis } from "./multiAgentAnalysis";
import { getStockFullData as getFinnhubData, formatFinnhubData, checkHealth as checkFinnhubHealth } from "./finnhubApi";
import { getStockData as getAlphaVantageStockData, getEconomicData as getAlphaVantageEconomicData, formatStockData as formatAVStockData, formatEconomicData as formatAVEconomicData, checkHealth as checkAVHealth } from "./alphaVantageApi";
import { getLocalTechnicalIndicators, formatLocalTechnicalIndicators, getOHLCVForChart } from "./localIndicators";
import { getStockFullData as getPolygonData, formatPolygonData, checkHealth as checkPolygonHealth, getOptionsChain, formatOptionsChain } from "./polygonApi";
import { getStockFullData as getFmpData, formatFmpData, checkHealth as checkFmpHealth } from "./fmpApi";
import { calculateHealthScore } from "./financialMetrics";
import { getStockFullData as getSecData, formatSecData, checkHealth as checkSecHealth } from "./secEdgarApi";
import { getCryptoData, formatCryptoData, isCryptoTask, pingCoinGecko } from "./coinGeckoApi";
import { fetchEFinanceData, formatEFinanceDataAsMarkdown, isEFinanceTask, extractStockCodes as extractEFinanceCodes, pingEFinance } from "./efinanceApi";

import { fetchNewsData, formatNewsDataAsMarkdown, checkNewsApiHealth, extractNewsQuery } from "./newsApi";
import { fetchMarketauxData, formatMarketauxDataAsMarkdown, checkMarketauxHealth } from "./marketauxApi";

import { fetchECBData, formatECBDataAsMarkdown, checkECBHealth, isECBRelevantTask } from "./ecbApi";
import { fetchHKEXData, formatHKEXDataAsMarkdown, checkHKEXHealth, isHKStockTask, extractHKStockCode } from "./hkexApi";
import { fetchBoeData, formatBoeDataAsMarkdown, checkBoeHealth, isBoeRelevantTask } from "./boeApi";
import { fetchHkmaData, formatHkmaDataAsMarkdown, checkHkmaHealth, isHkmaRelevantTask } from "./hkmaApi";

import { getRelatedLegislation, formatLegislationAsMarkdown, shouldFetchCongress, checkHealth as checkCongressHealth } from "./congressApi";

import { getCompanyLeiInfo, formatGleifAsMarkdown, shouldFetchGleif, checkGleifHealth } from "./gleifApi";
import { buildCitationSummary, citationToApiSources, resolveFieldSources, classifyMissingFields, FIELD_FALLBACK_MAP } from "./dataSourceRegistry";
import { buildEvidencePacket } from "./evidenceValidator";
import { buildDataPacket, formatDataPacketForPrompt } from "./dataPacketWrapper";
import { createBudgetTracker, removeBudgetTracker, getCachedSearch, setCachedSearch, type BudgetProfile } from "./resourceBudget";
import { isAlpacaConfigured, checkAlpacaHealth, getAlpacaAccount, getAlpacaPositions, getAlpacaClock, formatAlpacaAccount, formatAlpacaPositions, formatAlpacaClock, placeAlpacaOrder, formatAlpacaOrder, getAlpacaOrders, cancelAlpacaOrder } from "./alpacaApi";
import { generateTechnicalSignalReport, generateSignalBadge } from "./technicalSignals";
import { generateOptionSummary } from "./optionPricing";
import { generateRiskSummary, parametricVaR } from "./currencyRisk";
import { isETFTask, extractETFTickers, getETFBasicInfo, calculateETFRiskMetrics, scoreETF, compareETFsSummary } from "./etfAnalysis";
import { executeCode, validateCode, getPresetChartCode, generateAutoChart } from "./codeExecution";
import { calcAlphaFactors, convertToOHLCVSeries } from "./alphaFactors";
import { getDeFiOverview, searchDeFiProtocols, formatDeFiOverview, needsDeFiData, extractDeFiProtocols } from "./defiDataApi";
import { getEquityClassification, formatFinanceDatabaseReport, extractTickersForClassification } from "./financeDatabaseApi";
import { getTwelveDataAnalysis, checkTwelveDataHealth, isTwelveDataConfigured } from "./twelveDataApi";
import { getForexAnalysis, checkExchangeRatesHealth } from "./exchangeRatesApi";
import { getPortfolioOptimizationAnalysis, checkPortfolioOptimizerHealth } from "./portfolioOptimizerApi";
import { buildLawsContextBlock, getAllLawsSummary } from "./hackerLawsKnowledge";
import { runBacktest as runFactorBacktest, BACKTEST_FACTORS } from "./backtestEngine";
import { buildQuantContextBlock } from "./quantFactorKnowledge";
import { fetchAllCnFinanceNews, formatCnNewsToMarkdown, isCnFinanceNewsRelevant, checkCnFinanceNewsHealth } from "./cnFinanceNewsApi";
import { buildEnhancedNewsBlock, buildTrendRadarAnalysisPrompt, buildSourceAttribution, filterLowQualityNews, detectCrossSourceResonance, type NewsItem as TRNewsItem } from "./trendRadarEnhancer";
import { fetchXueqiuData, formatXueqiuDataAsMarkdown, isXueqiuRelevant, toXueqiuSymbol, checkXueqiuHealth } from "./xueqiuApi";
// ── LEVEL1A: DanTree Reasoning Pipeline ──────────────────────────────────────
import { buildIntentContext, formatIntentContextForPrompt } from "./intentInterpreter";
import { buildResearchPlan, formatResearchPlanForPrompt } from "./researchPlanner";
import { generateFieldRequirements, formatFieldRequirementsForPrompt } from "./fieldRequirementGenerator";
import { buildSynthesisEnrichment, formatSynthesisEnrichmentForPrompt } from "./synthesisEngine";
import { buildDiscussionHookSet, formatDiscussionHookSetForReport } from "./discussionHooks";
// ── LEVEL1A2 Imports ────────────────────────────────────────────────────────
import { normalizeAgentTaxonomy } from "./agentTaxonomyNormalizer";
import { buildStructuredSynthesis, formatStructuredSynthesisForPrompt } from "./synthesisController";
import { buildStructuredDiscussion, shouldUseStructuredDiscussion, formatStructuredDiscussionForReport } from "./discussionController";
import { evaluateRuntimeGate, formatGatingDecisionForPrompt } from "./runtimeGating";
// ── LEVEL1A3 Imports ────────────────────────────────────────────────────────
import {
  validateFinalOutput,
  buildSafeFallbackOutput,
  renderFinalOutputToMarkdown,
  renderDiscussionToMarkdown,
  buildStep3JsonOnlySystemMessage,
  buildStep3JsonOnlyUserMessage,
  formatNormalizedTaxonomyForPrompt,
  type FinalOutputSchema,
} from "./outputSchemaValidator";

// ── LEVEL2 Reasoning Loop Imports ────────────────────────────────────────────
import { evaluateTrigger, initLoopState, advanceLoopState, type LoopState } from "./loopStateTriggerEngine";
import { generateFollowUpTask } from "./followUpTaskGenerator";
// ── LEVEL2B: Multi-Hypothesis Engine ─────────────────────────────────────────
import { runHypothesisEngine, type MemorySeed, type MemoryConflict } from "./hypothesisEngine";
import { detectMemoryConflict } from "./memoryConflictDetector";
import { executeSecondPass } from "./secondPassExecutionWrapper";
import { computeEvidenceDelta } from "./evidenceDeltaEngine";
import { updateVerdict } from "./verdictUpdater";
import { evaluateStopCondition } from "./loopStopController";
import { buildConvergedOutput, type ConvergedOutput } from "./finalConvergedOutput";
// ── LEVEL2C: Telemetry Writer ─────────────────────────────────────────────────
import { writeLoopTelemetry } from "./loopTelemetryWriter";
// ── LEVEL3A: Analysis Memory Writer + Retrieval ───────────────────────────────
import { writeAnalysisMemory, getAnalysisMemory, extractMemoryFromOutput, buildPriorAnalysisContextBlock } from "./analysisMemoryWriter";
// ── LEVEL1B: Source Selection Engine ─────────────────────────────────────────
import { runSourceSelection, type TaskType as SourceTaskType, type Region as SourceRegion } from "./sourceSelectionEngine";
// ── LEVEL1C: Post-Fetch Evidence Engine + Output Gating ──────────────────────
import { runLevel1CEvidenceEngine, type FieldDataPoint } from "./postFetchEvidenceEngine";
import { computeOutputGating, buildGatingInstruction } from "./outputGatingController";

// --- 访问权限检查（Owner 或已授权用户）----------------------------------------

async function requireAccess(userId: number, openId: string) {
  if (openId === ENV.ownerOpenId) return;
  const access = await getUserAccess(userId);
  if (!access) {
    throw new TRPCError({ code: "FORBIDDEN", message: "请先输入访问密码" });
  }
}

// --- 带重试的 invokeLLM 包装（针对上游临时 500 错误）--------------------
// ── 数据源状态缓存（服务端内存缓存，避免每次请求都并行测试所有 API）──────────────────────
// 完全屁平化结构，避免 SuperJSON 深度截断（[Max Depth]）
// 五态健康状态：unknown=未检测 | checking=检测中 | active=正常 | degraded=降级 | error=失败
type ApiHealthStatus = "unknown" | "checking" | "active" | "degraded" | "error" | "not_configured" | "warning" | "timeout";
type DataSourceStatusResult = {
  // Tavily 汇总（避免嵌套数组）
  tavilyConfigured: boolean;
  tavilyActiveCount: number;  // 有效 Key 数量
  tavilyTotal: number;        // 总 Key 数量
  // 各 API 状态（屁平化：xxx Status + xxxConfigured）
  // 五态：unknown=未检测 | checking=检测中 | active=正常 | degraded=降级 | error=失败
  fredStatus: ApiHealthStatus; fredConfigured: boolean;
  yahooStatus: ApiHealthStatus; yahooConfigured: boolean;
  worldBankStatus: ApiHealthStatus; worldBankConfigured: boolean;
  imfStatus: ApiHealthStatus; imfConfigured: boolean;
  finnhubStatus: ApiHealthStatus; finnhubConfigured: boolean;
  fmpStatus: ApiHealthStatus; fmpConfigured: boolean;
  polygonStatus: ApiHealthStatus; polygonConfigured: boolean;
  secEdgarStatus: ApiHealthStatus; secEdgarConfigured: boolean;
  alphaVantageStatus: ApiHealthStatus; alphaVantageConfigured: boolean;
  coinGeckoStatus: ApiHealthStatus; coinGeckoConfigured: boolean;
  efinanceStatus: ApiHealthStatus; efinanceConfigured: boolean;
  baostockStatus: ApiHealthStatus; baostockConfigured: boolean;
  gdeltStatus: ApiHealthStatus; gdeltConfigured: boolean;
  simfinStatus: ApiHealthStatus; simfinConfigured: boolean;
  courtListenerStatus: ApiHealthStatus; courtListenerConfigured: boolean;
  eurLexStatus: ApiHealthStatus; eurLexConfigured: boolean;
  newsApiStatus: ApiHealthStatus; newsApiConfigured: boolean;
  marketauxStatus: ApiHealthStatus; marketauxConfigured: boolean;
  tiingoStatus: ApiHealthStatus; tiingoConfigured: boolean;
  ecbStatus: ApiHealthStatus; ecbConfigured: boolean;
  hkexStatus: ApiHealthStatus; hkexConfigured: boolean;
  boeStatus: ApiHealthStatus; boeConfigured: boolean;
  hkmaStatus: ApiHealthStatus; hkmaConfigured: boolean;
  congressStatus: ApiHealthStatus; congressConfigured: boolean;
  gleifStatus: ApiHealthStatus; gleifConfigured: boolean;
  // Alpaca Paper Trading（模拟交易）
  alpacaStatus: ApiHealthStatus; alpacaConfigured: boolean;
  // Twelve Data（实时行情/历史 OHLCV/技术指标）
  twelveDataStatus: ApiHealthStatus; twelveDataConfigured: boolean;
  // Frankfurter（外汇汇率，免费公开）
  exchangeRatesStatus: ApiHealthStatus; exchangeRatesConfigured: boolean;
  // Portfolio Optimizer（投资组合优化，免费公开）
  portfolioOptimizerStatus: ApiHealthStatus; portfolioOptimizerConfigured: boolean;
  // 雪球（游客 Token，自动获取，无需配置）
  xueqiuStatus: ApiHealthStatus; xueqiuConfigured: boolean;
  // Serper（Tavily 备用搜索引擎）
  serperConfigured: boolean;
  serperActiveCount: number;
  serperTotal: number;
  activeSearchEngine: "tavily" | "serper" | "none";
};
let dataSourceStatusCache: DataSourceStatusResult | null = null;
let dataSourceStatusCacheTime = 0;
let dataSourceStatusRefreshing = false;

// 缓存 TTL：高成本 API Key 源 30 分钟，免费公开源 6 小时
const CACHE_TTL_KEYED = 30 * 60 * 1000;   // 30 min
const CACHE_TTL_FREE = 6 * 60 * 60 * 1000; // 6 hours
let lastKeyedCheckTime = 0;
let lastFreeCheckTime = 0;

// 智能默认状态：有 Key → unknown（待检测），无 Key → not_configured
function smartDefault(hasKey: boolean, isFreePublic: boolean): ApiHealthStatus {
  if (isFreePublic) return "active"; // 免费公开源默认 active
  return hasKey ? "unknown" : "not_configured";
}

function buildDefaultDataSourceStatus(): DataSourceStatusResult {
  const tavilyKeys = getTavilyKeyStatuses();
  return {
    tavilyConfigured: isTavilyConfigured(),
    tavilyActiveCount: tavilyKeys.filter(k => k.configured && k.status === "active").length,
    tavilyTotal: tavilyKeys.filter(k => k.configured).length,
    fredStatus: smartDefault(!!ENV.FRED_API_KEY, false), fredConfigured: !!ENV.FRED_API_KEY,
    yahooStatus: "active", yahooConfigured: true,
    worldBankStatus: "active", worldBankConfigured: true,
    imfStatus: "active", imfConfigured: true,
    finnhubStatus: smartDefault(!!ENV.FINNHUB_API_KEY, false), finnhubConfigured: !!ENV.FINNHUB_API_KEY,
    fmpStatus: smartDefault(!!ENV.FMP_API_KEY, false), fmpConfigured: !!ENV.FMP_API_KEY,
    polygonStatus: smartDefault(!!ENV.POLYGON_API_KEY, false), polygonConfigured: !!ENV.POLYGON_API_KEY,
    secEdgarStatus: "active", secEdgarConfigured: true,
    alphaVantageStatus: smartDefault(!!ENV.ALPHA_VANTAGE_API_KEY, false), alphaVantageConfigured: !!ENV.ALPHA_VANTAGE_API_KEY,
    coinGeckoStatus: smartDefault(!!ENV.COINGECKO_API_KEY, false), coinGeckoConfigured: !!ENV.COINGECKO_API_KEY,
    efinanceStatus: "active", efinanceConfigured: true,
    baostockStatus: "active", baostockConfigured: true,
    gdeltStatus: "active", gdeltConfigured: true,
    newsApiStatus: smartDefault(!!ENV.NEWS_API_KEY, false), newsApiConfigured: !!ENV.NEWS_API_KEY,
    marketauxStatus: smartDefault(!!ENV.MARKETAUX_API_KEY, false), marketauxConfigured: !!ENV.MARKETAUX_API_KEY,
    simfinStatus: smartDefault(!!ENV.SIMFIN_API_KEY, false), simfinConfigured: !!ENV.SIMFIN_API_KEY,
    tiingoStatus: smartDefault(!!ENV.TIINGO_API_KEY, false), tiingoConfigured: !!ENV.TIINGO_API_KEY,
    ecbStatus: "active", ecbConfigured: true,
    hkexStatus: "active", hkexConfigured: true,
    boeStatus: "active", boeConfigured: true,
    hkmaStatus: "active", hkmaConfigured: true,
    courtListenerStatus: "active", courtListenerConfigured: true,
    congressStatus: smartDefault(!!ENV.CONGRESS_API_KEY, false), congressConfigured: !!ENV.CONGRESS_API_KEY,
    eurLexStatus: "active", eurLexConfigured: true,
    gleifStatus: "active", gleifConfigured: true,
    alpacaStatus: smartDefault(isAlpacaConfigured(), false), alpacaConfigured: isAlpacaConfigured(),
    twelveDataStatus: smartDefault(!!ENV.TWELVE_DATA_API_KEY, false), twelveDataConfigured: !!ENV.TWELVE_DATA_API_KEY,
    exchangeRatesStatus: "active", exchangeRatesConfigured: true,
    portfolioOptimizerStatus: "active", portfolioOptimizerConfigured: true,
    xueqiuStatus: "active", xueqiuConfigured: true,
    serperConfigured: isSerperConfigured(),
    serperActiveCount: getSerperKeyStatuses().filter(k => k.configured && k.status === "active").length,
    serperTotal: getSerperKeyStatuses().filter(k => k.configured).length,
    activeSearchEngine: getActiveSearchEngine(),
  };
}

// 后台异步刷新数据源状态缓存
async function refreshDataSourceStatusInBackground(): Promise<DataSourceStatusResult> {
  const withTimeout = <T>(p: Promise<T>, fallback: T, ms = 8000): Promise<T> =>
    Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

  // 批量并发执行工具：每批 batchSize 个，避免大量并发请求超时
  async function runBatched<T>(tasks: (() => Promise<T>)[], batchSize = 5): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize).map(t => t());
      const batchResults = await Promise.allSettled(batch);
      for (const r of batchResults) {
        results.push(r.status === "fulfilled" ? r.value : ("error" as unknown as T));
      }
    }
    return results;
  }

  // 阶段 1：免费公开 API（无需密钥，直接标记 active）
  const freePublicApis = {
    yahoo: "active" as ApiHealthStatus,
    fred: (!!ENV.FRED_API_KEY ? "active" : "error") as ApiHealthStatus,
    worldBank: "active" as ApiHealthStatus,
    imf: "active" as ApiHealthStatus,
    secEdgar: "active" as ApiHealthStatus,
    baostock: "active" as ApiHealthStatus,
    gdelt: "active" as ApiHealthStatus,
    ecb: "active" as ApiHealthStatus,
    boe: "active" as ApiHealthStatus,
    hkma: "active" as ApiHealthStatus,
    eurLex: "active" as ApiHealthStatus,
    gleif: "active" as ApiHealthStatus,
  };

  // 阶段 2：需要 API Key 的数据源（分批检测，每批 5 个）
  const keyedChecks: Array<{ key: string; check: () => Promise<ApiHealthStatus> }> = [
    // 无 Key 的源直接标 not_configured，不发真实请求
    { key: "finnhub",       check: () => withTimeout(ENV.FINNHUB_API_KEY ? checkFinnhubHealth().then(r => r.ok ? "active" : "degraded") : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
    { key: "fmp",           check: () => withTimeout(ENV.FMP_API_KEY ? checkFmpHealth().then(r => r.ok ? "active" : "degraded") : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
    { key: "polygon",       check: () => withTimeout(ENV.POLYGON_API_KEY ? checkPolygonHealth().then(r => r.ok ? "active" : "degraded") : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
    { key: "alphaVantage",  check: () => withTimeout(ENV.ALPHA_VANTAGE_API_KEY ? checkAVHealth().then(r => r.ok ? "active" : (r.isRateLimit ? "degraded" : "error")) : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
    { key: "coinGecko",     check: () => withTimeout(ENV.COINGECKO_API_KEY ? pingCoinGecko().then(ok => ok ? "active" : "degraded") : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
    { key: "newsApi",       check: () => withTimeout(ENV.NEWS_API_KEY ? checkNewsApiHealth().then(ok => ok ? "active" : "degraded").catch(() => "error") : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
    { key: "marketaux",     check: () => withTimeout(ENV.MARKETAUX_API_KEY ? checkMarketauxHealth().then(ok => ok ? "active" : "degraded").catch(() => "error") : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
      // [已移除]
      // [已移除]
    { key: "hkex",          check: () => withTimeout(checkHKEXHealth().then(r => r.ok ? "active" : "degraded").catch(() => "error"), "timeout", 8000) as Promise<ApiHealthStatus> },
      // [已移除]
    { key: "congress",      check: () => withTimeout(ENV.CONGRESS_API_KEY ? checkCongressHealth().then(r => r.status === "ok" ? "active" : "degraded").catch(() => "error") : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
    { key: "alpaca",        check: () => withTimeout(isAlpacaConfigured() ? checkAlpacaHealth().then(r => r.status === "active" ? "active" : "error").catch(() => "error") : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
    { key: "twelveData",    check: () => withTimeout(ENV.TWELVE_DATA_API_KEY ? checkTwelveDataHealth().then(r => r.status === "ok" ? "active" : r.status === "degraded" ? "degraded" : "error").catch(() => "error") : Promise.resolve("not_configured"), "timeout", 8000) as Promise<ApiHealthStatus> },
  ];

  const keyedResults = await runBatched(keyedChecks.map(c => c.check), 5);
  const keyedMap: Record<string, ApiHealthStatus> = {};
  keyedChecks.forEach((c, i) => { keyedMap[c.key] = keyedResults[i]; });

  const tavilyKeys = getTavilyKeyStatuses();

  // 用 freePublicApis + keyedMap 构建最终结果（无需 22 个并发请求）
  const result: DataSourceStatusResult = {
    tavilyConfigured: isTavilyConfigured(),
    tavilyActiveCount: tavilyKeys.filter(k => k.configured && ["active","warning"].includes(k.status)).length,
    tavilyTotal: tavilyKeys.filter(k => k.configured).length,
    fredStatus: freePublicApis.fred, fredConfigured: !!ENV.FRED_API_KEY,
    yahooStatus: freePublicApis.yahoo, yahooConfigured: true,
    worldBankStatus: freePublicApis.worldBank, worldBankConfigured: true,
    imfStatus: freePublicApis.imf, imfConfigured: true,
    finnhubStatus: keyedMap["finnhub"] ?? "error", finnhubConfigured: !!ENV.FINNHUB_API_KEY,
    fmpStatus: keyedMap["fmp"] ?? "error", fmpConfigured: !!ENV.FMP_API_KEY,
    polygonStatus: keyedMap["polygon"] ?? "error", polygonConfigured: !!ENV.POLYGON_API_KEY,
    secEdgarStatus: freePublicApis.secEdgar, secEdgarConfigured: true,
    alphaVantageStatus: keyedMap["alphaVantage"] ?? "error", alphaVantageConfigured: !!ENV.ALPHA_VANTAGE_API_KEY,
    coinGeckoStatus: keyedMap["coinGecko"] ?? "error", coinGeckoConfigured: !!ENV.COINGECKO_API_KEY,
    efinanceStatus: freePublicApis.baostock, efinanceConfigured: true,
    baostockStatus: freePublicApis.baostock, baostockConfigured: true,
    gdeltStatus: freePublicApis.gdelt, gdeltConfigured: true,
    newsApiStatus: keyedMap["newsApi"] ?? "error", newsApiConfigured: !!ENV.NEWS_API_KEY,
    marketauxStatus: keyedMap["marketaux"] ?? "error", marketauxConfigured: !!ENV.MARKETAUX_API_KEY,
    simfinStatus: keyedMap["simfin"] ?? "error", simfinConfigured: !!ENV.SIMFIN_API_KEY,
    tiingoStatus: keyedMap["tiingo"] ?? "error", tiingoConfigured: !!ENV.TIINGO_API_KEY,
    ecbStatus: freePublicApis.ecb, ecbConfigured: true,
    hkexStatus: keyedMap["hkex"] ?? "error", hkexConfigured: true,
    boeStatus: freePublicApis.boe, boeConfigured: true,
    hkmaStatus: freePublicApis.hkma, hkmaConfigured: true,
    courtListenerStatus: keyedMap["courtListener"] ?? "error", courtListenerConfigured: true,
    congressStatus: keyedMap["congress"] ?? "error", congressConfigured: !!ENV.CONGRESS_API_KEY,
    eurLexStatus: freePublicApis.eurLex, eurLexConfigured: true,
    gleifStatus: freePublicApis.gleif, gleifConfigured: true,
    alpacaStatus: keyedMap["alpaca"] ?? "error", alpacaConfigured: isAlpacaConfigured(),
    twelveDataStatus: keyedMap["twelveData"] ?? (ENV.TWELVE_DATA_API_KEY ? "unknown" : "not_configured"), twelveDataConfigured: !!ENV.TWELVE_DATA_API_KEY,
    exchangeRatesStatus: "active", exchangeRatesConfigured: true,
    portfolioOptimizerStatus: "active", portfolioOptimizerConfigured: true,
    xueqiuStatus: "active", xueqiuConfigured: true,
    serperConfigured: isSerperConfigured(),
    serperActiveCount: getSerperKeyStatuses().filter(k => k.configured && k.status === "active").length,
    serperTotal: getSerperKeyStatuses().filter(k => k.configured).length,
    activeSearchEngine: getActiveSearchEngine(),
  };
  dataSourceStatusCache = result;
  dataSourceStatusCacheTime = Date.now();
  return result;
}

async function invokeLLMWithRetry(
  params: Parameters<typeof invokeLLM>[0],
  maxRetries = 3
): Promise<ReturnType<typeof invokeLLM>> {
  let lastError: unknown;
  // 指数退避：第1次重试等1s，第2次等3s，第3次等9s
  const delays = [1000, 3000, 9000];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await invokeLLM(params);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      // 只对上游临时错误重试（500/502/503/超时）
      const isRetryable = msg.includes("500") || msg.includes("502") || msg.includes("503")
        || msg.includes("upstream") || msg.includes("timeout") || msg.includes("ECONNRESET");
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = delays[attempt] ?? 9000;
      console.warn(`[LLM] Attempt ${attempt + 1} failed (${msg}), retrying in ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw lastError;
}

// --- 三步协作流程（全程静默，只输出一条最终回复）-----------------------------
//
//  Step 1 - GPT 主导规划：制定分析框架，开始处理擅长的主观判断/逻辑推理部分
//  Step 2 - Manus 执行：先完善任务描述，再按 GPT 框架收集数据、整理表格
//  Step 3 - GPT 整合输出：接收 Manus 完整报告，深度思考，输出最终回复
//
//  同一对话框内，新消息默认视为上一个任务的延续（除非用户明确说新任务）。
//  以上全部在后台静默执行，不向用户显示任何中间过程消息。

async function runCollaborationFlow(
  taskId: number,
  userId: number,
  taskDescription: string,
  conversationId?: number,
  attachmentContext?: string,   // 附件提取的文本内容（可选）
  analysisMode: "quick" | "standard" | "deep" = "standard"  // 分析深度模式
) {
  const userConfig = await getRpaConfig(userId);

  // ── Resource Budget Controller 初始化 ──
  const budgetProfile: BudgetProfile = analysisMode === "deep" ? "deep" : "standard";
  const budget = createBudgetTracker(String(taskId), budgetProfile);

  // ----------------------------------------------------------------------------
  // 用户核心规则（每次任务必须严格遵守）
  // ----------------------------------------------------------------------------
  // 如果用户已自定义守则，优先使用自定义守则；否则使用默认守则
  // 默认投资守则（压缩格式，节省 token）
  const DEFAULT_CORE_RULES = `[RULES|PRIORITY=MAX]
PHILOSOPHY: value>price|hold10y?|understand_biz|margin_of_safety|compounding|concentrate_conviction
MARKETS: US(NASDAQ/NYSE)>HK(HSI)>CN(A-share)>EU(DAX/CAC)>UK(FTSE)|cross-market_contagion_required
ANALYSIS: forward_logic(now→future)+reverse_logic(outcome→cause) mandatory
FORMAT: ##headers|**bold_key**|>blockquote_judgment|table≥3col|no_plain_text|zh_output
EXEC: self-check_before/during/after|2-3_followup_Qs|context_continuity`;

  // ----------------------------------------------------------------------------
  // 「投资理念 & 任务守则」三部分强制注入（最高优先级，GPT & Manus 必须遵守）
  // ----------------------------------------------------------------------------

  // 第一部分：投资守则（用户投资喜好、理念、个人情况）
  // 资料库域名提取（供 PART3 和 Step1 共用）
  const userLibraryUrls: string[] = userConfig?.dataLibrary?.trim()
    ? userConfig.dataLibrary
        .split(/[\n,]+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.startsWith("http"))
    : [];
  const _domainSet = new Set(
    userLibraryUrls.map(url => { try { return new URL(url).hostname; } catch { return url; } })
  );
  const userLibraryDomains: string[] = Array.from(_domainSet);

    const PART1_INVESTMENT_RULES = userConfig?.investmentRules?.trim()
    ? `\n[RULES]\n${userConfig.investmentRules.trim()}`
    : `\n[RULES]\n${DEFAULT_CORE_RULES}`;

  // 第二部分：全局任务指令（AI执行规范，不随任务变动）
  const PART2_TASK_INSTRUCTION = userConfig?.taskInstruction?.trim()
    ? `\n[TASK_INSTR]\n${userConfig.taskInstruction.trim()}`
    : (userConfig?.manusSystemPrompt?.trim()
      ? `\n[TASK_INSTR]\n${userConfig.manusSystemPrompt.trim()}`
      : "");

  // 第三部分：资料数据库（优先数据来源）
  // 优先使用结构化 trustedSourcesConfig，回退到旧的域名列表
  const tsc = (userConfig as any)?.trustedSourcesConfig as import('./db').TrustedSourcesConfig | null | undefined;
  let PART3_DATA_LIBRARY = "";
  if (tsc?.sources?.length) {
    // 结构化模式：注入 trusted_sources 列表 + routing_rules + policy
    const enabledSources = tsc.sources.filter((s: import('./db').TrustedSource) => s.enabled);
    const sourceList = enabledSources
      .map((s: import('./db').TrustedSource) => `${s.id}(${s.trustLevel}):${s.url}`)
      .join('|');
    const routingList = (tsc.routingRules || []).slice(0, 10)
      .map((r: import('./db').RoutingRule) => `${r.pattern}→${r.targetSources.join(',')}`)
      .join(';');
    const policy = tsc.policy;
    PART3_DATA_LIBRARY = `\n[TRUSTED_SOURCES] ${sourceList}`
      + (routingList ? `\n[ROUTING_RULES] ${routingList}` : "")
      + `\n[POLICY] fallback_training=${policy?.fallbackToTraining ? 'yes' : 'NO'}|min_evidence=${policy?.minEvidenceScore ?? 0.6}|block_hard_missing=${policy?.blockOnHardMissing ? 'YES' : 'no'}`;
  } else if (userLibraryDomains.length > 0) {
    // 旧模式：域名列表
    PART3_DATA_LIBRARY = `\n[LIB_DOMAINS] ${userLibraryDomains.join('|')}`;
  }

  // 合并三部分，构建完整的守则块
  const USER_CORE_RULES = PART1_INVESTMENT_RULES + PART2_TASK_INSTRUCTION + PART3_DATA_LIBRARY;

  // -- 日期变量（必须先于两个系统 prompt 定义）----------------------------------------------
  const NOW = new Date();
  const currentDateStr = `${NOW.getFullYear()}年${NOW.getMonth()+1}月${NOW.getDate()}日`;
  const currentYearStr = String(NOW.getFullYear());
  const lastYearStr = String(NOW.getFullYear() - 1);
  const twoYearsAgoStr = String(NOW.getFullYear() - 2);

  // Manus 幕后数据引擎
  const manusSystemPrompt = `[SYS:MANUS|ROLE:data_engine|RECIPIENT:GPT]
TODAY:${currentDateStr}|TRAINING_CUTOFF:2024-early
OUT:table/num/metric_only|no_intro|no_outro|direct_data
DATA_INTEGRITY[MAX]:
1. realtime_ctx→use_as_is|no_modify
2. missing→output_exactly_"[DATA_UNAVAILABLE:source_name]"|NEVER_guess|NEVER_use_training_memory
3. PROHIBIT:fabricate|guess|training_data_as_realtime|fill_blanks_with_memory
4. LABEL:[yahoo_finance]|[fred]|[tavily:domain]|[api:name]|[DATA_UNAVAILABLE:source]
5. CRITICAL:if_API_returns_no_data→write_"[DATA_UNAVAILABLE]"→do_NOT_invent_plausible_numbers
6. YEAR_CHECK:any_data_you_output_must_come_from_API_response|if_year_is_${currentYearStr}_verify_it_came_from_API
7. A_SHARE_HK_DATA:yahoo_finance支持A股指数(000300.SS/000001.SS)和港股(^HSI/0700.HK)│非交易时段返回上一交易日收盘│标注“数据截至上一交易日”│严禁输出“数据不足”或错误提示` + USER_CORE_RULES;

  // -- GPT 主角人设（用户的唯一对话伙伴，负责所有与用户的交流和跟进）----------------------------------------------
  const gptSystemPrompt = `【重要系统信息】今天是 ${currentDateStr}。你的训练数据截止于 2024 年初，因此你对 ${currentYearStr} 年及 ${lastYearStr} 年的实时事件没有记忆。所有涉及当前市场状况、最新财务数据、近期新闻的内容，必须以 Manus 提供的实时 API 数据为准，严禁用训练记忆填充当前数据。

你是用户的首席投资顾问，拥有 CFA 级别的专业能力和严谨的分析风格。
你和 Manus（数据引擎）共同工作，但用户只知道你——不要提及 Manus、不要提及内部分工。

## 核心人设：一针见血的判断者
你不是数据播报员，你是有独立判断的分析师。你的价值在于：
- **结论先行**：每个分析段落第一句就是结论，数据和推理在后面支撑，不允许铺垫半天才给结论
- **敢于逆市**：当市场共识与数据矛盾时，明确指出「市场错了」并说明原因
- **反常识检验**：主动问自己「如果我的判断是错的，最可能的原因是什么」并在回复中展示这个思考
- **量级感**：不只说方向，要说幅度（「高估 30-40%」而不是「偏高」）

## 专业性标准（核心，每次必须达到）
1. **结论先行**：每段第一句给结论，后面才是数据支撑。格式：**结论**（数据1, 数据2 → 逻辑推导）
2. **精确性**：所有数据引用必须具体到小数点（如 PE=23.4x，不是"大约 20 多倍"）；时间节点必须标注（如 Q3 ${lastYearStr}）
3. **明确立场**：对每个核心问题必须给出明确立场（高估/合理/低估、买入/持有/减仓），禁止模糊表述
4. **市场共识 vs 我的判断**：主动对比「市场普遍认为 X，但数据显示 Y，因此我判断 Z」
5. **风险量化**：明确指出主要风险及其可能影响幅度（如"利率上升 100bp 将压缩估值 8-12%"）
6. **双向验证**：正推（当前基本面→未来预期）+ 倒推（如果判断正确，未来 12 个月应出现哪些可验证数据）

## 禁止事项（严格执行）
- 禁止「平衡分析」「两方面来看」「既有机会也有风险」等中立描述作为结论
- 禁止"大约""可能""有待观察""市场存分歧"等模糊表述作为核心结论
- 禁止在没有数据支撑的情况下给出判断
- 禁止把"分析框架"当作最终回复——框架是过程，结论才是交付物
- 禁止将 Manus 数据报告直接转述——必须加入自己的判断和解读
- 禁止先铺垫背景再给结论——用户需要的是判断，不是科普

## 数据图表规范（强制执行）
**每次回复只要涉及数据、趋势、对比、走势，必须主动生成图表**，无需用户要求。

图表嵌入格式（直接输出以下标记，%%是字面量百分号）：

%%CHART%%
{"type":"line","title":"图表标题","data":[{"name":"${lastYearStr}Q1","value":100}],"xKey":"name","yKey":"value","unit":"元"}
%%END_CHART%%

**图表类型选择规则：**
- "line"（折线图）：时间序列、价格走势、营收趋势
- "area"（面积图）：累计增长、市场份额变化
- "bar"（柱状图）：分类对比、季度营收对比、多公司横向比较
- "scatter"（散点图）：相关性分析、估值散点、风险收益分布
- "pie"（饼图）：市场份额、营收结构、资产配置
- "candlestick"【K线图】：股价走势（需提供 open/high/low/close，可选包含 volume 成交量字段）
- "heatmap"【热力图】：板块涨跌热力图（data 中每项需 name+value，可选 size 权重）
- "waterfall"【瀑布图】：财务利润拆解（营收→毛利→EBITDA→净利润），data 中每项需 name+value+type（total/subtotal/positive/negative）
- "gauge"【仪表盘】：综合评分、情绪指数、评级分数（0-100分制），需提供 value/min/max/thresholds
- "dual_axis"【双轴图】：价格+成交量、营收+增速等双指标对比，需提供 leftKey/rightKey/leftUnit/rightUnit
- "combo"【复合图】：柱状+折线复合（如营收柱+增速折线），需提供 bars 和 lines 数组

**多系列图表（多条折线/多组柱状）：**
%%CHART%%
{"type":"bar","title":"美团 vs 抖音营收对比","data":[{"name":"${twoYearsAgoStr}","meituan":1791,"douyin":800},{"name":"${lastYearStr}","meituan":2767,"douyin":1500}],"xKey":"name","series":[{"key":"meituan","color":"#6366f1","name":"美团"},{"key":"douyin","color":"#22c55e","name":"抖音"}],"unit":"亿元"}
%%END_CHART%%
**K线图格式（支持成交量 + MA5/MA20）：**
%%CHART%%
{"type":"candlestick","title":"股价K线","data":[{"name":"${lastYearStr}-01","open":100,"high":110,"low":95,"close":105,"volume":5000000},{"name":"${lastYearStr}-02","open":105,"high":115,"low":100,"close":112,"volume":6200000}],"xKey":"name"}
%%END_CHART%%
**热力图格式（板块涨跌）：**
%%CHART%%
{"type":"heatmap","title":"板块涨跌热力图","data":[{"name":"科技","value":3.2,"size":120},{"name":"金融","value":-1.5,"size":90},{"name":"消费","value":0.8,"size":70}]}
%%END_CHART%%
**瀑布图格式（财务利润拆解）：**
%%CHART%%
{"type":"waterfall","title":"利润拆解","unit":"亿元","data":[{"name":"营业收入","value":1000,"type":"total"},{"name":"营业成本","value":-600,"type":"negative"},{"name":"毛利润","value":400,"type":"subtotal"},{"name":"期间费用","value":-150,"type":"negative"},{"name":"净利润","value":250,"type":"subtotal"}]}
%%END_CHART%%
**仪表盘格式（综合评分）：**
%%CHART%%
{"type":"gauge","title":"综合投资评分","value":72,"min":0,"max":100,"unit":"分","thresholds":[{"value":40,"color":"#ef4444","label":"谨慎"},{"value":70,"color":"#f59e0b","label":"中性"},{"value":100,"color":"#22c55e","label":"积极"}]}
%%END_CHART%%
**双轴图格式（价格+成交量）：**
%%CHART%%
{"type":"dual_axis","title":"股价与成交量","data":[{"name":"${lastYearStr}-01","price":150,"volume":8000}],"xKey":"name","leftKey":"price","rightKey":"volume","leftUnit":"USD","rightUnit":"万"}
%%END_CHART%%
**复合图格式（营收+增速）：**
%%CHART%%
{"type":"combo","title":"营收与增速","data":[{"name":"${twoYearsAgoStr}Q1","revenue":500,"growth":12},{"name":"${twoYearsAgoStr}Q2","revenue":550,"growth":15}],"xKey":"name","bars":[{"key":"revenue","name":"营收","color":"#6366f1"}],"lines":[{"key":"growth","name":"增速","color":"#22c55e","unit":"%"}]}
%%END_CHART%%
**annotations 字段（必填）：** 每个图表必须包含 "annotations" 字段，提供简洁专业的数据解读和投资启示（不超过 60 字）。
示例："annotations": "NVDA市盈率为行业均値的1.97倍，处于历史高位区间，高溢价反映市场对其AI节带市场地位的高预期"

**散点图示例（相关性分析）：**
%%CHART%%
{"type":"scatter","title":"市盈率 vs 成长率关系","data":[{"pe":15,"growth":8},{"pe":25,"growth":18},{"pe":35,"growth":28}],"xKey":"pe","yKey":"growth","unit":"%","annotations":"正相关（R²>0.7）说明市场对成长定价合理，R²越高越具投资参考价値"}
%%END_CHART%%

- data 数组最多 24 个数据点（热力图可到30 个）
- 图表必须紧跟相关文字分析，不能孤立出现
- 每次回复至少包含 1 个图表（如果有任何数据可视化机会）
- 分析板块行情时优先使用 heatmap；分析个股走势时优先使用 candlestick；分析财务结构时使用 waterfall；给出综合评分时使用 gauge；分析营收趋势时使用 combo` + USER_CORE_RULES;

  // -- 历史记忆上下文 --------------------------------------------------------
  // P2-12: 检测用户是否显式延续任务，决定是否注入 analysis 类型记忆
  const continuationPatterns = /(延续|接着|继续|上次|上一次|之前的分析|上回|接上次|continue|follow.?up|last.?analysis|previous|recap)/i;
  const isExplicitContinuation = continuationPatterns.test(taskDescription);
  const memoryExcludeTypes = isExplicitContinuation ? [] : ["analysis"];
  // 语义相关性召回：对话级优先，全局兑底，关键词匹配 + 时间衰减双维度评分
  const relevantMemory = await getRelevantMemory(
    userId,
    taskDescription,
    { topK: 6, minRecent: 2, conversationId: conversationId ?? undefined, excludeTypes: memoryExcludeTypes }
  );
  const memoryBlock = relevantMemory.length > 0
    ? `\n\n【历史任务记忆（按相关性排序，共${relevantMemory.length}条，用于跨任务连续跟进）】\n` +
      relevantMemory.map((m, i) =>
        `${i + 1}. [${new Date(m.createdAt).toLocaleDateString("zh-CN")}] ${m.taskTitle}\n   摘要：${m.summary}`
      ).join("\n")
    : "";

  // -- 附件上下文 ------------------------------------------------------------
  const attachmentBlock = attachmentContext
    ? `\n\n【用户上传的文件内容】\n${attachmentContext}`
    : "";

  // -- 对话历史（同对话框内最近5轮，用于任务连续性）----------------------------
  let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (conversationId) {
    try {
      const recentMsgs = await getMessagesByConversation(conversationId);
      // 取最近10条（5轮对话），排除当前正在处理的任务消息（只取 completed 的）
      const historyMsgs = recentMsgs
        // 包含所有 user 消息 + 非空的 assistant 消息（streaming/completed 状态均可用）
        .filter(m => m.role === "user" || (m.role === "assistant" && String(m.content || "").trim().length > 0))
        .slice(-10)
        .map(m => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 800) }));
      conversationHistory = historyMsgs;
    } catch (e) {
      console.warn("[Collaboration] Failed to load conversation history:", e);
    }
  }

  const historyBlock = conversationHistory.length > 0
    ? `\n\n【当前对话框历史（最近${conversationHistory.length}条，默认视为同一任务的延续）】\n` +
      conversationHistory.map(m => `${m.role === "user" ? "用户" : "顾问"}：${m.content}`).join("\n---\n")
    : "";

  const fullContext = taskDescription + memoryBlock + attachmentBlock;

  // -- 分析模式配置 -----------------------------------------------------------------------
  const modeConfig = {
    quick: {
      label: "快速模式",
      step1MaxTokens: 600,
      step2MaxWords: 4000,  // 提高：容纳网页内容提取（原 2000）
      step3MaxTokens: 1200,
      step1Hint: "快速模式：输出简洁。框架不超过 3 层，数据需求不超过 5 条。",
      step2Hint: "快速模式：总输出不超过 4000 字。A区只输出核心指标，B区只提取最关键的 3 条信息。",
      step3Hint: "快速模式：输出简洁报告，不超过 800 字。直接给出结论和关键数据，省略详细推理过程。",
    },
    standard: {
      label: "标准模式",
      step1MaxTokens: 1200,
      step2MaxWords: 10000,  // 提高：容纳网页内容提取（原 6000）
      step3MaxTokens: 2400,
      step1Hint: "",
      step2Hint: "",
      step3Hint: "",
    },
    deep: {
      label: "深度模式",
      step1MaxTokens: 2000,
      step2MaxWords: 16000,  // 提高：容纳大量网页内容提取（原 10000）
      step3MaxTokens: 4000,
      step1Hint: "深度模式：尽可能全面。框架要包含宏观环境、行业地位、企业基本面、估值、安全边际全部层次。数据需求尽可能详细。",
      step2Hint: "深度模式：尽可能全面收集数据，总输出不超过 16000 字。包含历史数据对比、竞争对标全面对比，B区网页内容尽可能全面提取。",
      step3Hint: "深度模式：输出最全面、最详细的投资分析报告。每个论点展开完整推理链，不得因篇幅省略任何分析维度。",
    },
  }[analysisMode];

  try {
    // ------------------------------------------------------------------------
    // Step 1 & Step 2 早期数据 — 真正并行化
    //
    // 并行策略：
    //   A. Yahoo Finance + Tavily（用原始消息作初始 query）→ 与 Step1 同时启动
    //   B. Step1 GPT 规划 → 同时启动
    //   C. Step1 完成后：
    //      - 从 Step1 输出提取「数据需求清单」精炼 Tavily query → 补充搜索
    //      - FRED 用 Step1 关键词启动（宏观数据需要精确关键词）
    // ------------------------------------------------------------------------
    await updateTaskStatus(taskId, "manus_working");

    // 解析用户数据库链接（支持换行和逗号分隔）
    // userLibraryUrls 已在函数顶部定义
    // P2-9: 将 trustedSourcesConfig 中的域名也合并到搜索域名列表中
    const trustedSourceUrls: string[] = tsc?.sources
      ?.filter((s: import('./db').TrustedSource) => s.enabled)
      ?.map((s: import('./db').TrustedSource) => s.url)
      ?.filter(Boolean) ?? [];
    const allSearchUrls = Array.from(new Set([...userLibraryUrls, ...trustedSourceUrls]));
    // ── LEVEL1A2 Phase1: 前置解析（在 Step1 prompt 构建之前）─────────────────────────────────
    // 注意: task_parse 尚未就绪，用 null 初始化；Step1 完成后将用 task_parse 重建一次
    const earlyIntentCtx = buildIntentContext(
      null, // task_parse not yet available
      taskDescription,
      [] // ticker not yet extracted
    );
    const earlyResearchPlan = buildResearchPlan(earlyIntentCtx);
    const earlyFieldReqs = generateFieldRequirements(earlyResearchPlan, earlyIntentCtx);
    const earlyFieldReqBlock = formatFieldRequirementsForPrompt(earlyFieldReqs);
    const earlyIntentContextBlock = formatIntentContextForPrompt(earlyIntentCtx);
    // ── LEVEL1A2 Phase1 END ───────────────────────────────────────────────────────────────
    // GPT Step1 prompt：任务拆分 + 精准资源指令（TASK_SPEC）+ 并行执行 GPT 自己的分析
    // ── 可用 API 目录（供 GPT 按需精确指定，不要全部调用）───────────────────────
    const AVAILABLE_APIS_CATALOG = `
[市场行情] yahoo_finance(ticker,period) | finnhub(ticker) | polygon(ticker) | tiingo(ticker,metrics)
[深度财务] fmp(ticker,statements,years) | simfin(ticker,period) | sec_edgar(ticker,forms)
[技术分析] alpha_vantage_tech(ticker,indicators) | polygon_options(ticker)
[宏观数据] fred(series_ids,limit) | world_bank(countries,indicators) | imf_wb(countries,indicators) | ecb(series) | boe(series) | hkma(series) | alpha_vantage_econ(indicators)
[地区专项] baostock(code,period) | hkex(code,doc_types)
[加密货币] coingecko(coins,metrics)
[新闻情绪] news_api(query,sources) | marketaux(ticker,sentiment) | gdelt(query,themes)
[网页搜索] tavily_search(query) ← 限定在用户资源库 + Trusted Sources 域名内搜索
资源库域名: ${(() => { const tsDomains = trustedSourceUrls.map(u => { try { return new URL(u).hostname; } catch { return u; } }); const allDomains = Array.from(new Set([...userLibraryDomains, ...tsDomains])); return allDomains.slice(0, 10).join(' | ') + (allDomains.length > 10 ? ' ...' : ''); })()}
[任务类型→数据粒度映射（period 参数规则）]
- 技术分析/短线/K线/波段: yahoo_finance period="3mo" | "6mo"
- 季报分析/季度业绩: yahoo_finance period="1y"，fmp statements=["quarterly"]
- 年报/长期基本面/价值投资: yahoo_finance period="2y" | "5y"，fmp statements=["annual"]
- 宏观/行业对比: yahoo_finance period="5y"，fred/world_bank 优先
- 默认（不确定）: yahoo_finance period="1y"
[A股/港股指数 ticker 映射（必须使用以下代码，否则 Yahoo Finance 无法识别）]
- 沪深300 / CSI300 → ticker="000300.SS"
- 上证指数 / 上证综指 → ticker="000001.SS"
- 深证成指 → ticker="399001.SZ"
- 创业板指 → ticker="399006.SZ"
- 科创50 → ticker="000688.SS"
- 中证500 → ticker="000905.SS"
- 恒生指数 / 恒指 / HSI → ticker="^HSI"
- 恒生科技 → ticker="^HSTECH"
- 日经225 → ticker="^N225"
- 腾讯 → ticker="0700.HK" | 美团 → ticker="3690.HK" | 小米 → ticker="1810.HK"
[A股/港股数据说明] yahoo_finance 支持 A 股指数和港股，非交易时段自动返回上一交易日收盘数据（无需报错）`;

    const gptStep1UserMsg = `[GPT←TASK|STEP1|MODE:${modeConfig.label}]
QUERY: ${taskDescription}${historyBlock ? '\nHIST:' + historyBlock.slice(0, 800) : ''}${memoryBlock ? '\n' + memoryBlock.slice(0, 600) : ''}${attachmentBlock ? '\nATTACH:' + attachmentBlock.slice(0, 400) : ''}${modeConfig.step1Hint ? '\nHINT:' + modeConfig.step1Hint : ''}
${earlyIntentContextBlock}
${earlyFieldReqBlock}
${AVAILABLE_APIS_CATALOG}
[INSTRUCTIONS]
你是首席投资顾问（GPT）。Step1 只做一件事：**任务解析与检索规划**，不输出任何投资结论或主观判断。

**职责边界（严格遵守）：**
• GPT 负责：识别任务类型、拆解研究问题、提出待验证假设、设计检索计划
• Manus 负责：按计划调用 API、抓取数据、清洗计算、返回结构化事实包
• 禁止在 Step1 出现：买入/卖出/持有/高估/低估/目标价/结论性摘要/方向性判断
• 禁止用「待数据验证」替代假设——假设必须是可被数据证伪的具体陈述
**INTENT_CONTEXT_LAYER（task_type 分类规则）：**
• stock_analysis：涉及具体股票/ETF 的估值、财务、技术分析
• macro_analysis：宏观经济、利率、通胀、汇率、行业趋势
• crypto_analysis：加密货币、DeFi、链上数据
• portfolio_review：持仓组合、资产配置、再平衡
• event_driven：财报、并购、政策事件、突发新闻
• discussion：开放性讨论、投资理念、无明确标的
• general：无法归类时使用
**time_mode 分类规则：**
• realtime：需要当前价格/实时行情（优先 polygon/alpaca）
• latest_available：需要最新可用数据（非实时也可，优先 fmp/finnhub）
• recent：近期趋势（1-3个月，优先 yahoo_finance/news_api）
• historical：历史回测/长期对比（1年+，优先 sec_edgar/simfin）

**三阶段检索计划（core / conditional / deep）：**
• core：每个任务必须执行的 2-4 个最关键数据源（并发上限 3）
• conditional：满足特定条件才扩展（如涉及宏观→FRED，涉及舆情→news_api）（并发上限 3）
• deep：仅 depth_mode=deep 或用户特别要求时触发（并发上限 2）
• required=true 的源失败时，必须标记为 hard_missing，不允许 GPT 在 Step3 自行脑补

[OUTPUT - 严格遵守此格式，Manus 将直接解析执行]
## TASK_PARSE
（任务类型 | 涉及实体 | 时间范围 | 是否延续任务，3句以内）
## HYPOTHESES
（每个假设一行，格式：[Hx] 假设陈述 | 需要字段：field1, field2）
## RESOURCE_SPEC
${"```"}json
{
  "task_parse": {
    "task_type": "stock_analysis|macro_analysis|crypto_analysis|portfolio_review|event_driven|discussion|general",
    "symbols": ["AAPL"],
    "markets": ["US"],
    "time_scope": "current|historical|forecast",
    "time_mode": "realtime|latest_available|recent|historical",
    "depth_mode": "quick|standard|deep",
    "interaction_mode": "execution|discussion",
    "risk_focus": false,
    "comparison_needed": false,
    "user_goal": "一句话归纳用户核心诉求"
  },
  "hypotheses": [
    {
      "id": "h1",
      "statement": "当前估值是否偏高",
      "required_fields": ["price.current", "valuation.ttm_pe"],
      "priority": "high"
    }
  ],
  "source_groups": ["market_data", "filings", "macro", "news", "web"],
  "retrieval_plan": {
    "core": [
      {"name": "yahoo_finance", "params": {"ticker": "AAPL", "period": "1y"}, "required": true, "purpose": "当前价格和基础估值"}
    ],
    "conditional": [
      {"name": "fred", "params": {"series_ids": ["FEDFUNDS"], "limit": 12}, "required": false, "triggerIf": "涉及利率敏感性", "purpose": "宏观利率环境"}
    ],
    "deep": [
      {"name": "simfin", "params": {"ticker": "AAPL"}, "required": false, "purpose": "详细财务衍生指标"}
    ]
  },
  "tavily_query": "苹果AI战略分析师观点 ${currentYearStr}",
  "company_names": ["苹果", "Apple Inc."],
  "priority_map": {"h1": "high", "h2": "medium"},
  "action_candidates": ["comparison", "chart", "sensitivity"],
  "fallback_plan": "若 fmp 不可用，改用 simfin + tiingo 组合替代财务数据",
  "reasoning": "检索计划选取理由（一句话）"
}
${"```"}`;
    

    // ── 并行启动：Step1 GPT + Yahoo Finance + Tavily 初始搜索 + 多源金融数据 ──────────────
    // 提取 ticker 供多源数据使用
    const { extractTickers } = await import("./yahooFinance");
    const detectedTickers = extractTickers(taskDescription);
    const primaryTicker = detectedTickers[0] ?? null; // 主要股票代码（用于深度分析）
    // 预先提取 A 股代码（用于后续去重）
      // [已移除]
      // [已移除]
    // 先单独执行 Step1，获取 period 参数后再调用 Yahoo Financece
    const step1Result = await Promise.resolve(
      userConfig?.openaiApiKey
        ? callOpenAI({
            apiKey: userConfig.openaiApiKey,
            model: userConfig.openaiModel || DEFAULT_MODEL,
            messages: [
              { role: "system", content: gptSystemPrompt },
              { role: "user", content: gptStep1UserMsg },
            ],
            maxTokens: modeConfig.step1MaxTokens,
          })
        : Promise.resolve(null)
    ).then(v => ({ status: "fulfilled" as const, value: v })).catch(e => ({ status: "rejected" as const, reason: e }));

    // 解析 Step1 结果，提取 period 参数
    const FALLBACK_STEP1 = `## 分析框架\n标准价値投资分析：估値→护城河→财务健康→安全边际\n## Manus 数据需求清单\n财务数据、估値指标、市场表现、行业对比`;
    let gptStep1Output: string;
    if (step1Result.status === "fulfilled" && step1Result.value) {
      gptStep1Output = step1Result.value as string;
    } else {
      gptStep1Output = FALLBACK_STEP1;
    }

    // 从 Step1 输出中提取 yahoo_finance period 参数
    const extractYahooPeriod = (step1Text: string): string => {
      // 尝试从 RESOURCE_SPEC JSON 中提取
      const periodMatch = step1Text.match(/"yahoo_finance"[^}]*"period"\s*:\s*"([^"]+)"/)
        || step1Text.match(/yahoo_finance.*?period[":\s]+(["']?)([1-9][a-z]+)\1/);
      if (periodMatch) {
        const p = periodMatch[2] || periodMatch[1];
        if (["1mo", "3mo", "6mo", "1y", "2y", "5y"].includes(p)) return p;
      }
      // 根据任务描述关键词推断
      if (/技术分析|短线|K线|波段|短期/i.test(taskDescription)) return "3mo";
      if (/季报|季度业绩|季度财务/i.test(taskDescription)) return "1y";
      if (/年报|长期|价値投资|年度财务/i.test(taskDescription)) return "2y";
      if (/宏观|行业对比|历史走势/i.test(taskDescription)) return "5y";
      return "1y"; // 默认
    };
    const yahooPeriod = extractYahooPeriod(gptStep1Output);

    // 并行执行 Yahoo Finance（使用从 Step1 提取的 period）和空结果占位
    const [stockDataResult, earlyTavilyResult] = await Promise.allSettled([
      // B. Yahoo Finance：使用任务类型匹配的时间范围
      fetchStockDataForTask(taskDescription, yahooPeriod),
      // C. 网页搜索已关闭，纯 API 模式
      Promise.resolve(""),
    ]);

    await updateTaskStatus(taskId, "manus_working");

    // ── 解析 Step1 资源规划 JSON ─────────────────────────────────────────────
    interface ResourcePlan {
      dataSources: {
        technicalIndicators: boolean;
        optionsChain: boolean;
        macroData: boolean;
        newsAndSentiment: boolean;
        cryptoData: boolean;
        deepFinancials: boolean;
        secFilings: boolean;
        webSearch: boolean;
      };
      priority: "quick" | "standard" | "deep";
      reasoning: string;
    }
    // taskSpec 扩展字段（新版 TASK_SPEC 格式，含精确 API 参数）
    type ResourcePlanWithSpec = ResourcePlan & { taskSpec: { apis: Array<{ name: string; params: Record<string, unknown>; purpose: string }>; tavily_query: string | null; priority: string; reasoning: string } | null };
    // ── 新版 TASK_SPEC 解析：将精确 API 名称映射到布尔开关 ──────────────────
    interface TaskSpec {
      apis: Array<{ name: string; params: Record<string, unknown>; purpose: string; phase?: string; required?: boolean }>;
      tavily_query: string | null;
      company_names?: string[];  // GPT 提取的公司名称实体（用于 GLEIF 精确查询）
      priority: "quick" | "standard" | "deep";
      reasoning: string;
      // 新格式扩展字段（Retrieval-First 架构）
      hypotheses?: Array<{ id: string; statement: string; required_fields: string[]; priority: string }>;
      retrieval_plan?: {
        core?: Array<{ name: string; params: Record<string, unknown>; required?: boolean; purpose?: string }>;
        conditional?: Array<{ name: string; params: Record<string, unknown>; required?: boolean; purpose?: string; triggerIf?: string }>;
        deep?: Array<{ name: string; params: Record<string, unknown>; required?: boolean; purpose?: string }>;
      };
      task_parse?: {
        task_type?: string;
        symbols?: string[];
        markets?: string[];
        time_scope?: string;
        depth_mode?: "quick" | "standard" | "deep";
        interaction_mode?: "execution" | "discussion";
        risk_focus?: boolean;
        comparison_needed?: boolean;
        user_goal?: string;
      };
      // V1.5 顶层字段（从 task_parse 提升，方便直接访问）
      task_type?: string;
      interaction_mode?: "execution" | "discussion";
      risk_focus?: boolean;
      comparison_needed?: boolean;
      user_goal?: string;
    }
    const parseResourcePlan = (step1Text: string): ResourcePlan & { taskSpec: TaskSpec | null } => {
      // 默认规划（兆底，当 GPT 未输出 TASK_SPEC 时使用）
      const defaultPlan: ResourcePlan & { taskSpec: TaskSpec | null } = {
        dataSources: {
          technicalIndicators: false,
          optionsChain: false,
          macroData: false,
          newsAndSentiment: true,
          cryptoData: false,
          deepFinancials: false,
          secFilings: false,
          webSearch: true,
        },
        priority: "standard",
        reasoning: "fallback default",
        taskSpec: null,
      };
      try {
        // 优先解析新格式 RESOURCE_SPEC JSON
        const specMatch = step1Text.match(/##\s*RESOURCE_SPEC[\s\S]*?```json([\s\S]*?)```/m)
          || step1Text.match(/```json([\s\S]*?{[\s\S]*?"retrieval_plan"[\s\S]*?})```/m)
          || step1Text.match(/```json([\s\S]*?{[\s\S]*?"apis"[\s\S]*?})```/m);
        if (specMatch) {
          const raw = JSON.parse(specMatch[1].trim()) as Record<string, unknown>;
          // 尝试解析新格式（含 retrieval_plan.core/conditional/deep）
          let spec: TaskSpec;
          if (raw.retrieval_plan) {
            // 新格式：将 core+conditional+deep 合并为平平 apis 列表，保持向后兼容
            type RetrievalEntry = { name: string; params: Record<string, unknown>; required?: boolean; purpose?: string; triggerIf?: string };
            type RetrievalPlan = { core?: RetrievalEntry[]; conditional?: RetrievalEntry[]; deep?: RetrievalEntry[] };
            const rp = raw.retrieval_plan as RetrievalPlan;
            const allApis: Array<{ name: string; params: Record<string, unknown>; purpose: string; phase: string; required: boolean }> = [
              ...(rp.core || []).map(a => ({ ...a, phase: "core", required: a.required !== false, purpose: a.purpose || "" })),
              ...(rp.conditional || []).map(a => ({ ...a, phase: "conditional", required: false, purpose: a.purpose || "" })),
              ...(rp.deep || []).map(a => ({ ...a, phase: "deep", required: false, purpose: a.purpose || "" })),
            ];
            spec = {
              apis: allApis,
              tavily_query: (raw.tavily_query as string | null) ?? null,
              company_names: raw.company_names as string[] | undefined,
              priority: ((raw.task_parse as Record<string, unknown>)?.depth_mode as "quick" | "standard" | "deep") ?? "standard",
              reasoning: (raw.reasoning as string) ?? "",
              // 保留新格式字段供后续使用
              hypotheses: raw.hypotheses as TaskSpec["hypotheses"],
              retrieval_plan: rp,
              task_parse: raw.task_parse as TaskSpec["task_parse"],
            } as TaskSpec;
          } else {
            spec = raw as unknown as TaskSpec;
          }
          const apiNames = (spec.apis || []).map((a) => a.name.toLowerCase());
          // API 名称 → 布尔开关映射（精确控制，不堆砌）
          const has = (names: string[]) => names.some((n) => apiNames.includes(n));
          return {
            dataSources: {
              technicalIndicators: has(["alpha_vantage_tech"]),
              optionsChain: has(["polygon_options"]),
              macroData: has(["fred", "world_bank", "imf_wb", "ecb", "boe", "hkma", "alpha_vantage_econ"]),
              newsAndSentiment: has(["news_api", "marketaux", "gdelt"]) || spec.tavily_query != null,
              cryptoData: has(["coingecko"]),
              deepFinancials: has(["fmp", "simfin", "tiingo", "finnhub", "polygon", "sec_edgar"]),
              secFilings: has(["sec_edgar"]),
              webSearch: spec.tavily_query != null,
            },
            priority: spec.priority ?? "standard",
            reasoning: spec.reasoning ?? "",
            taskSpec: spec,
          };
        }
        // 兼容旧格式（布尔开关 JSON）
        const legacyMatch = step1Text.match(/##\s*资源规划[\s\S]*?({[\s\S]*?})/m);
        if (legacyMatch) {
          const jsonStr = legacyMatch[1]
            .replace(/true\/false/g, "false")
            .replace(/"quick\/standard\/deep"/g, '"standard"');
          const parsed = JSON.parse(jsonStr) as ResourcePlan;
          return {
            dataSources: { ...defaultPlan.dataSources, ...(parsed.dataSources ?? {}) },
            priority: parsed.priority ?? "standard",
            reasoning: parsed.reasoning ?? "",
            taskSpec: null,
          };
        }
        return defaultPlan;
      } catch {
        return defaultPlan;
      }
    };
    const resourcePlan = parseResourcePlan(gptStep1Output);

    // ── FIELD_REQUIREMENT_GENERATOR (V1.5) ──────────────────────────────────
    // 在数据拉取前，根据 task_type 生成字段优先级分层，供 evidenceValidator 和 SOURCE_SELECTION_ENGINE 使用
    type FieldTierMap = { blocking: string[]; important: string[]; optional: string[] };
    const FIELD_TIER_DEFAULTS: Record<string, FieldTierMap> = {
      stock_analysis: {
        blocking:  ["price.current", "valuation.pe"],
        important: ["revenue", "net_income", "free_cash_flow", "market_cap"],
        optional:  ["analyst.target_price", "analyst.recommendation", "sentiment.signal", "macro.rate_context", "peer.comparison"],
      },
      macro_analysis: {
        blocking:  ["macro.primary_series", "macro.current_level"],
        important: ["macro.trend", "macro.cross_asset_impact"],
        optional:  ["sentiment.signal", "policy_context"],
      },
      crypto_analysis: {
        blocking:  ["price.current", "market_cap"],
        important: ["volume", "onchain_or_exchange_signal_if_available"],
        optional:  ["sentiment.signal", "macro.rate_context"],
      },
    };
    const detectedTaskType = resourcePlan.taskSpec?.task_type ?? "stock_analysis";
    const fieldTiers: FieldTierMap = FIELD_TIER_DEFAULTS[detectedTaskType] ?? {
      blocking:  ["price.current"],
      important: [],
      optional:  [],
    };
     // ── FIELD_REQUIREMENT_GENERATOR END ─────────────────────────────────────
    // ── LEVEL1A: DanTree Reasoning Pipeline ────────────────────────────────
    // Phase1: Intent Interpreter
    const intentCtx = buildIntentContext(
      resourcePlan.taskSpec?.task_parse ?? null,
      taskDescription,
      primaryTicker ? [primaryTicker] : []
    );
    // Phase2: Research Planner
    const researchPlan = buildResearchPlan(intentCtx);
    // Phase3: Field Requirements (replaces inline FIELD_TIER_DEFAULTS)
    const level1aFieldReqs = generateFieldRequirements(researchPlan, intentCtx);
    // Merge LEVEL1A field requirements into existing fieldTiers (non-destructive)
    if (level1aFieldReqs.blocking.length > 0) {
      for (const f of level1aFieldReqs.blocking) {
        if (!fieldTiers.blocking.includes(f)) fieldTiers.blocking.push(f);
      }
    }
    if (level1aFieldReqs.important.length > 0) {
      for (const f of level1aFieldReqs.important) {
        if (!fieldTiers.important.includes(f)) fieldTiers.important.push(f);
      }
    }
    // Build prompt injection blocks for Step1 and Step3
    const intentContextBlock = formatIntentContextForPrompt(intentCtx);
    const researchPlanBlock = formatResearchPlanForPrompt(researchPlan);
    const fieldReqBlock = formatFieldRequirementsForPrompt(level1aFieldReqs);
    // ── LEVEL1A END ───────────────────────────────────────────────────────────────
    // ── 智能默认値覆盖：当检测到股票代码时，自动启用核心财务数据源 ───
    // 不依赖 GPT Step1 的规划结果，确保 FMP/SimFin/Finnhub/SEC 等核心源始终被调用
    if (primaryTicker) {
      resourcePlan.dataSources.deepFinancials = true;
      resourcePlan.dataSources.secFilings = true;
      resourcePlan.dataSources.newsAndSentiment = true;
    }
    // 宏观分析任务也自动启用宏观数据源
    const isMacroTask = /宏观|利率|GDP|CPI|通胀|就业|PMI|央行|美联储|Fed|macro|interest rate|inflation/i.test(taskDescription);
    if (isMacroTask) {
      resourcePlan.dataSources.macroData = true;
    }

    // ── 从 Step1 输出提取精炼搜索关键词（优化2）────────────────────────────
    // 提取「数据引擎精确需求清单」部分作为 Tavily 精炼 query
    const extractDataNeedsQuery = (step1Text: string, fallback: string): string => {
      const match = step1Text.match(/##\s*数据引擎精确需求清单([\s\S]*?)(?=##|$)/);
      if (match && match[1].trim().length > 20) {
        // 取前 300 字作为 query（Tavily query 不宜过长）
        return match[1].trim().slice(0, 300);
      }
      return fallback;
    };
    // 优先使用 TASK_SPEC 中的精确 tavily_query，其次提取数据需求清单，最后用原始任务描述
    const refinedTavilyQuery = resourcePlan.taskSpec?.tavily_query
      || extractDataNeedsQuery(gptStep1Output, taskDescription);

    // ── Step1 完成后：FRED + World Bank + IMF + 多源金融数据 + Tavily 精炼补充搜索 ────────────────────
    // 检测 A 股代码（用于触发 Baostock）
      // [已移除]
    const primaryAStockCode: string | null = null;  // [已移除 Baostock]

    // 检测港股代码（用于触发 HKEXnews）
    const hkStockCode = extractHKStockCode(taskDescription + " " + gptStep1Output);
    const isHKTask = isHKStockTask(taskDescription + " " + gptStep1Output);

    // 计时辅助函数：包装 Promise 并记录耗时（ms）
    const latencyMap = new Map<string, number>();
    const timed = <T>(key: string, p: Promise<T>): Promise<T> => {
      const start = Date.now();
      return p.then(
        (v) => { latencyMap.set(key, Date.now() - start); return v; },
        (e) => { latencyMap.set(key, Date.now() - start); return Promise.reject(e); }
      );
    };

    // ── LEVEL1B: Source Selection (runs before Step2 fetch) ───────────────────────
    const level1bTaskType: SourceTaskType = (
      detectedTaskType === "stock_analysis" ? "stock_analysis"
      : detectedTaskType === "macro_analysis" ? "macro_analysis"
      : detectedTaskType === "crypto_analysis" ? "crypto_analysis"
      : detectedTaskType === "portfolio_review" ? "portfolio_review"
      : detectedTaskType === "event_driven" ? "event_driven"
      : "general"
    ) as SourceTaskType;
    const level1bRegion: SourceRegion = (
      isHKTask ? "HK"
      : /欧元|欧洲|ECB|EUR|euro|eurozone/i.test(taskDescription) ? "EU"
      : primaryTicker && /^\d{5,6}$/.test(primaryTicker) ? "CN"
      : "US"
    ) as SourceRegion;
    const level1bFields = [
      ...level1aFieldReqs.blocking,
      ...level1aFieldReqs.important.slice(0, 5),
    ];
    const level1bSelectionResult = runSourceSelection(level1bFields, level1bTaskType, level1bRegion, 3);
    // Log selection to console (non-blocking, no LLM calls)
    if (level1bSelectionResult.selection_log.length > 0) {
      console.log(level1bSelectionResult.selection_log.join("\n"));
    }
    // ── Step2 三阶段检索引擎（core → conditional → deep）────────────────────────
    // 辅助：批量并发执行，每批最多 concurrency 个
    const runBatch = async <T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<PromiseSettledResult<T>[]> => {
      const results: PromiseSettledResult<T>[] = [];
      for (let i = 0; i < tasks.length; i += concurrency) {
        const batch = tasks.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(batch.map(t => t()));
        results.push(...batchResults);
      }
      return results;
    };

    // ── Phase 2A: core 阶段（并发上限 3，必要数据源）─────────────────────────
    const coreTasks: Array<() => Promise<string>> = [
      // FMP：财务报表/DCF估值/分析师目标价（必要源）
      () => resourcePlan.dataSources.deepFinancials && primaryTicker && ENV.FMP_API_KEY
        ? timed("FMP", getFmpData(primaryTicker).then(d => formatFmpData(d)))
        : Promise.resolve(""),
      // SEC EDGAR：XBRL 财务数据/年报/季报（必要源）
      () => resourcePlan.dataSources.secFilings && primaryTicker && !primaryTicker.includes(".")
        ? timed("SEC EDGAR", getSecData(primaryTicker).then(d => formatSecData(d)))
        : Promise.resolve(""),
      // Polygon.io：市场快照/公司详情/近期走势（必要源）
      () => primaryTicker && ENV.POLYGON_API_KEY
        ? timed("Polygon.io", getPolygonData(primaryTicker).then(d => formatPolygonData(d)))
        : Promise.resolve(""),
    ];
    const [fmpResult, secResult, polygonResult] = await runBatch(coreTasks, 3);
    // 中间状态更新：核心数据收集完成
    await updateTaskStatus(taskId, "manus_working");

    // ── Phase 2B: conditional 阶段（并发上限 3，按条件触发）──────────────────
    const conditionalTasks: Array<() => Promise<string>> = [
      // FRED：宏观数据
      () => resourcePlan.dataSources.macroData
        ? timed("FRED", getMacroDataByKeywords(taskDescription + " " + gptStep1Output))
        : Promise.resolve(""),
      // World Bank
      () => resourcePlan.dataSources.macroData
        ? timed("World Bank", fetchWorldBankData(taskDescription + " " + gptStep1Output))
        : Promise.resolve(""),
      // IMF WEO
      () => resourcePlan.dataSources.macroData
        ? timed("IMF WEO", fetchImfData(taskDescription + " " + gptStep1Output).then(d => d ? formatImfDataAsMarkdown(d) : ""))
        : Promise.resolve(""),
      // 网页搜索已关闭，纯 API 模式
      () => Promise.resolve(""),
      // Finnhub
      () => resourcePlan.dataSources.deepFinancials && primaryTicker && ENV.FINNHUB_API_KEY
        ? timed("Finnhub", getFinnhubData(primaryTicker).then(d => formatFinnhubData(d)))
        : Promise.resolve(""),
      // Alpha Vantage 宏观
      () => resourcePlan.dataSources.macroData && ENV.ALPHA_VANTAGE_API_KEY
        ? timed("Alpha Vantage", getAlphaVantageEconomicData().then(d => formatAVEconomicData(d)))
        : Promise.resolve(""),
      // CoinGecko
      () => resourcePlan.dataSources.cryptoData && isCryptoTask(taskDescription + " " + gptStep1Output) && ENV.COINGECKO_API_KEY
        ? timed("CoinGecko", getCryptoData(taskDescription + " " + gptStep1Output).then(d => formatCryptoData(d)))
        : Promise.resolve(""),
      // [已移除 Baostock]
      () => Promise.resolve(""),
      // [已移除 GDELT]
      () => Promise.resolve(""),
      // NewsAPI
      () => resourcePlan.dataSources.newsAndSentiment && ENV.NEWS_API_KEY && extractNewsQuery(taskDescription + " " + gptStep1Output) !== null
        ? timed("NewsAPI", fetchNewsData(taskDescription + " " + gptStep1Output)
            .then(d => d ? formatNewsDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // Marketaux
      () => resourcePlan.dataSources.newsAndSentiment && ENV.MARKETAUX_API_KEY && primaryTicker
        ? timed("Marketaux", fetchMarketauxData(taskDescription + " " + gptStep1Output)
            .then(d => d ? formatMarketauxDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // ECB
      () => resourcePlan.dataSources.macroData && isECBRelevantTask(taskDescription + " " + gptStep1Output)
        ? timed("ECB", fetchECBData()
            .then(d => d ? formatECBDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // HKEXnews
      () => isHKTask
        ? timed("HKEXnews", fetchHKEXData(hkStockCode ?? (taskDescription + " " + gptStep1Output).slice(0, 50))
            .then(d => d ? formatHKEXDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // BoE
      () => resourcePlan.dataSources.macroData && isBoeRelevantTask(taskDescription + " " + gptStep1Output)
        ? timed("BoE", fetchBoeData()
            .then(d => d ? formatBoeDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // HKMA
      () => resourcePlan.dataSources.macroData && isHkmaRelevantTask(taskDescription + " " + gptStep1Output)
        ? timed("HKMA", fetchHkmaData()
            .then(d => d ? formatHkmaDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // [已移除 CourtListener]
      () => Promise.resolve(""),
      // Congress.gov
      () => shouldFetchCongress(taskDescription + " " + gptStep1Output)
        ? timed("Congress.gov", getRelatedLegislation(taskDescription.slice(0, 100))
            .then(d => d ? formatLegislationAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // [已移除 EUR-Lex]
      () => Promise.resolve(""),
      // GLEIF
      () => {
        if (!shouldFetchGleif(taskDescription + " " + gptStep1Output)) return Promise.resolve("");
        const step1CompanyNames = resourcePlan.taskSpec?.company_names;
        if (step1CompanyNames && step1CompanyNames.length > 0) {
          const primaryName = step1CompanyNames[0].trim();
          return timed("GLEIF", getCompanyLeiInfo(primaryName)
            .then(d => d ? formatGleifAsMarkdown(d) : "")
            .catch(() => ""));
        }
        const companyMatch = taskDescription.match(/([A-Z][a-zA-Z\s&]{2,30}(?:Inc\.?|Corp\.?|Ltd\.?|LLC\.?|Group|Holdings?|Holding|Co\.?|Company|Bank|Capital|Partners|Fund|Trust|AG|SA|GmbH|PLC|NV|BV))/)
          || taskDescription.match(/([一-龥]{2,8}(?:公司|集团|集团公司|控股|高科技|高科技公司|銀行|证券|基金|信托|保险))/);
        if (companyMatch) {
          return timed("GLEIF", getCompanyLeiInfo(companyMatch[1].trim())
            .then(d => d ? formatGleifAsMarkdown(d) : "")
            .catch(() => ""));
        }
        return timed("GLEIF", getCompanyLeiInfo(taskDescription.slice(0, 80))
          .then(d => d ? formatGleifAsMarkdown(d) : "")
          .catch(() => ""));
      },
    ];
    const [
      macroDataResult, worldBankResult, imfDataResult, refinedTavilyResult,
      finnhubResult, avEconomicResult, cryptoResult, _aStockResult,
      _gdeltResult, newsApiResult, marketauxResult, ecbResult,
      hkexResult, boeResult, hkmaResult, _courtListenerResult,
      congressResult, _eurLexResult, gleifResult,
    ] = await runBatch(conditionalTasks, 3);
    // 中间状态更新：条件性数据收集完成，进入深度分析阶段
    emitTaskStatus(taskId, "data_fetching"); // SSE: 数据获取中
    await updateTaskStatus(taskId, "manus_analyzing");
    emitTaskStatus(taskId, "evidence_eval"); // SSE: 证据评估中

    // ── Phase 2C: deep 阶段（并发上限 2，仅 deepFinancials 或 deep 模式时触发）──
    const isDeepMode = resourcePlan.priority === "deep" || resourcePlan.dataSources.deepFinancials;
    const deepTasks: Array<() => Promise<string>> = [
      // [已移除 SimFin]
      () => Promise.resolve(""),
      // [已移除 Tiingo]
      () => Promise.resolve(""),
      // 本地技术指标（indicatorts 本地计算，无需 API 配额）+ 技术信号自动标注
      () => resourcePlan.dataSources.technicalIndicators && primaryTicker
        ? timed("本地技术指标+信号标注", getLocalTechnicalIndicators(primaryTicker)
            .then(async d => {
              if (!d) return "";
              const indicatorStr = formatLocalTechnicalIndicators(d);
              // 追加技术信号自动标注报告
              let combined = indicatorStr;
              try {
                const signalReport = generateTechnicalSignalReport(d);
                combined += "\n\n" + signalReport.detailedMarkdown;
              } catch { /* ignore */ }
              // 追加期权定价摘要（Q-Fin + Quantsbin）
              try {
                const currentPrice = d.priceData?.current;
                if (currentPrice && currentPrice > 0 && !primaryTicker!.includes(".")) {
                  // 用 ATR14 估算年化波动率：ATR/Price * sqrt(252)
                  const atr = d.atr14?.at(-1) ?? 0;
                  const sigma = atr > 0 ? Math.min(Math.max((atr / currentPrice) * Math.sqrt(252), 0.05), 2.0) : 0.25;
                  const optionSummary = await generateOptionSummary(primaryTicker!, currentPrice, sigma);
                  combined += "\n\n" + optionSummary;
                }
              } catch { /* ignore */ }
              return combined;
            })
            .catch(() => ""))
        : Promise.resolve(""),
      // Polygon.io 期权链
      () => resourcePlan.dataSources.optionsChain && primaryTicker && !primaryTicker.includes(".") && ENV.POLYGON_API_KEY
        ? timed("期权链", getOptionsChain(primaryTicker)
            .then((d: Awaited<ReturnType<typeof getOptionsChain>>) => d ? formatOptionsChain(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // ETF 分析（ThePassiveInvestor 参考）
      () => isETFTask(taskDescription) && primaryTicker
        ? timed("ETF分析", (async () => {
            try {
              const etfTickers = extractETFTickers(taskDescription + " " + primaryTicker);
              if (etfTickers.length === 0) return "";
              const etfDataList = await Promise.all(
                etfTickers.slice(0, 3).map(async (t) => {
                  const info = await getETFBasicInfo(t).catch(() => null);
                  return info;
                })
              );
              const validETFs = etfDataList.filter(Boolean) as Awaited<ReturnType<typeof getETFBasicInfo>>[];
              if (validETFs.length === 0) return "";
              const etfResults = validETFs.map(info => {
                const metrics = calculateETFRiskMetrics(info!.symbol, [], 0.05);
                const score = scoreETF(info!, metrics);
                return { info: info!, metrics, score };
              });
              return compareETFsSummary(etfResults);
            } catch { return ""; }
          })())
        : Promise.resolve(""),
      // 自动图表生成（yorkeccak/finance 架构：OHLCV + 技术指标 → matplotlib K线图）
      () => primaryTicker && resourcePlan.dataSources.technicalIndicators
        ? timed("自动图表生成", (async () => {
            try {
              const chartData = await getOHLCVForChart(primaryTicker!);
              if (!chartData) return "";
              const base64 = await generateAutoChart(
                primaryTicker!,
                chartData.ohlcv,
                {
                  rsi14: chartData.rsi14,
                  macdLine: chartData.macdLine,
                  macdSignal: chartData.macdSignal,
                  bbUpper: chartData.bbUpper,
                  bbMiddle: chartData.bbMiddle,
                  bbLower: chartData.bbLower,
                  ema20: chartData.ema20,
                  ema50: chartData.ema50,
                  sma200: chartData.sma200,
                },
                "full"
              );
              if (!base64) return "";
              // 返回特殊标记，供 manusReport 嵌入
              return `%%PYIMAGE%%${base64}%%END_PYIMAGE%%`;
            } catch { return ""; }
          })())
        : Promise.resolve(""),
      // Alpha 因子计算（microsoft/qlib 架构：WorldQuant Alpha101 + Alpha158）
      () => primaryTicker && resourcePlan.dataSources.technicalIndicators
        ? timed("Alpha因子", (async () => {
            try {
              const chartData = await getOHLCVForChart(primaryTicker!);
              if (!chartData) return "";
              const ohlcvSeries = convertToOHLCVSeries(chartData.ohlcv);
              const alphaReport = calcAlphaFactors(primaryTicker!, ohlcvSeries);
              // 结构化 JSON 标记供前端可视化，文本摘要供 GPT 分析
              const alphaJson = JSON.stringify({
                ticker: alphaReport.ticker,
                compositeScore: alphaReport.compositeScore,
                overallSignal: alphaReport.overallSignal,
                factors: alphaReport.factors.map(f => ({
                  name: f.name,
                  category: f.category,
                  signal: f.signal,
                  strength: f.strength,
                  value: f.value,
                  zScore: f.zScore,
                  description: f.description,
                })),
                generatedAt: alphaReport.generatedAt,
              });
              return `%%ALPHA_FACTORS%%${alphaJson}%%END_ALPHA_FACTORS%%\n\n${alphaReport.summary}`;
            } catch { return ""; }
          })())
        : Promise.resolve(""),
      // DeFi 链上数据（goat-sdk/goat 架构：DeFiLlama TVL + Yield 池）
      () => needsDeFiData(taskDescription)
        ? timed("DeFi链上数据", (async () => {
            try {
              const protocols = extractDeFiProtocols(taskDescription);
              if (protocols.length > 0) {
                // 有特定协议 → 搜索协议详情
                const results = await Promise.all(
                  protocols.slice(0, 3).map(p => searchDeFiProtocols(p).catch(() => []))
                );
                const allProtocols = results.flat().slice(0, 10);
                if (allProtocols.length === 0) {
                  const overview = await getDeFiOverview();
                  return formatDeFiOverview(overview);
                }
                return `## DeFi 协议数据（goat-sdk/goat · DeFiLlama）\n\n` +
                  allProtocols.map(p => `**${p.name}** (${p.category}) TVL: $${(p.tvl/1e9).toFixed(2)}B | 24h: ${p.change1d !== undefined ? (p.change1d >= 0 ? '+' : '') + p.change1d.toFixed(1) + '%' : 'N/A'} | 链: ${p.chain}`).join('\n');
              } else {
                // 通用 DeFi 查询 → 总览数据
                const overview = await getDeFiOverview();
                return formatDeFiOverview(overview);
              }
            } catch { return ""; }
          })())
        : Promise.resolve(""),
      // 全球股票分类（JerBouma/FinanceDatabase：30万+ 股票分类 + 同业公司）
      () => primaryTicker && !primaryTicker.includes(".")
        ? timed("股票分类", (async () => {
            try {
              const result = await getEquityClassification(primaryTicker!);
              if (!result.classification) return "";
              return formatFinanceDatabaseReport(result);
            } catch { return ""; }
          })())
        : Promise.resolve(""),
      // Twelve Data：实时报价 + RSI/MACD（作为 Yahoo Finance 备用源）
      () => primaryTicker && isTwelveDataConfigured()
        ? timed("Twelve Data", getTwelveDataAnalysis(primaryTicker!).catch(() => ""))
        : Promise.resolve(""),
      // Frankfurter：外汇汇率（免费公开，无需 Key）
      () => resourcePlan.dataSources.macroData || /汇率|外汇|人民币|港元|美元|日元|欧元|USD|EUR|JPY|CNY|HKD|GBP|forex|currency/i.test(taskDescription + " " + gptStep1Output)
        ? timed("外汇汇率", getForexAnalysis(taskDescription + " " + gptStep1Output).catch(() => ""))
        : Promise.resolve(""),
      // 财务健康评分（JerBouma/FinanceToolkit 150+ 指标 → calculateHealthScore）
      () => primaryTicker && ENV.FMP_API_KEY && resourcePlan.dataSources.deepFinancials
        ? timed("财务健康", (async () => {
            try {
              const fmpRaw = await getFmpData(primaryTicker!);
              const health = calculateHealthScore(
                fmpRaw.incomeStatements,
                fmpRaw.balanceSheets,
                fmpRaw.cashFlows,
                fmpRaw.keyMetrics
              );
              if (health.grade === "N/A") return "";
              // 计算四个维度分数供雷达图使用（复用已获取的 fmpRaw，避免重复 API 调用）
              const fmpRawForRadar = fmpRaw;
              const profitabilityScore = fmpRawForRadar ? (() => {
                const m = fmpRawForRadar.keyMetrics[0]; const i = fmpRawForRadar.incomeStatements[0];
                let s = 0;
                if (m?.roe != null) s += m.roe > 0.15 ? 10 : m.roe > 0.08 ? 6 : 0;
                if (i?.netIncomeRatio != null) s += i.netIncomeRatio > 0.1 ? 10 : i.netIncomeRatio > 0.05 ? 6 : 0;
                if (m?.roic != null) s += m.roic > 0.1 ? 10 : m.roic > 0.05 ? 6 : 0;
                return Math.round(s / 30 * 100);
              })() : 0;
              const solvencyScore = fmpRawForRadar ? (() => {
                const m = fmpRawForRadar.keyMetrics[0];
                let s = 0;
                if (m?.debtToEquity != null) s += m.debtToEquity < 0.5 ? 10 : m.debtToEquity < 1.5 ? 6 : 0;
                if (m?.interestCoverage != null) s += m.interestCoverage > 5 ? 10 : m.interestCoverage > 2 ? 5 : 0;
                if (m?.currentRatio != null) s += m.currentRatio > 1.5 ? 5 : m.currentRatio > 1.0 ? 3 : 0;
                return Math.round(s / 25 * 100);
              })() : 0;
              const cashflowScore = fmpRawForRadar ? (() => {
                const c = fmpRawForRadar.cashFlows[0]; const i = fmpRawForRadar.incomeStatements[0]; const m = fmpRawForRadar.keyMetrics[0];
                if (!c) return 0;
                let s = 0;
                if (c.freeCashFlow > 0) s += 10;
                const fcfConv = i?.netIncome !== 0 ? c.freeCashFlow / (i?.netIncome || 1) : null;
                if (fcfConv != null) s += fcfConv > 0.8 ? 10 : fcfConv > 0.5 ? 6 : 0;
                if (m?.incomeQuality != null && m.incomeQuality > 0.8) s += 5;
                return Math.round(s / 25 * 100);
              })() : 0;
              const growthScore = fmpRawForRadar ? (() => {
                const income = fmpRawForRadar.incomeStatements;
                if (income.length < 2) return 0;
                let s = 0;
                const revGrowth = income[0].revenue > 0 && income[1].revenue > 0 ? (income[0].revenue - income[1].revenue) / income[1].revenue : null;
                if (revGrowth != null) s += revGrowth > 0.15 ? 10 : revGrowth > 0.05 ? 6 : revGrowth > 0 ? 3 : 0;
                const niGrowth = income[0].netIncome > 0 && income[1].netIncome > 0 ? (income[0].netIncome - income[1].netIncome) / Math.abs(income[1].netIncome) : null;
                if (niGrowth != null) s += niGrowth > 0.15 ? 10 : niGrowth > 0.05 ? 6 : niGrowth > 0 ? 3 : 0;
                return Math.round(s / 20 * 100);
              })() : 0;
              const healthJson = JSON.stringify({
                ticker: primaryTicker,
                score: health.score,
                grade: health.grade,
                summary: health.summary,
                dimensions: {
                  profitability: profitabilityScore,
                  solvency: solvencyScore,
                  cashflow: cashflowScore,
                  growth: growthScore,
                },
                generatedAt: Date.now(),
              });
              return `%%HEALTH_SCORE%%${healthJson}%%END_HEALTH_SCORE%%\n\n` +
                `## 财务健康评分（FinanceToolkit）\n\n` +
                `**综合评分：${health.score}/100（${health.grade}）**\n\n${health.summary}\n\n` +
                `> 评分维度：盈利能力（30分）+ 偿债能力（25分）+ 现金流质量（25分）+ 成长性（20分）`;
            } catch { return ""; }
          })())
        : Promise.resolve(""),
      // 雪球深度数据（机构评级/资金流向/财务指标/行情详情，仅 A股/港股触发）
      () => (primaryTicker && isXueqiuRelevant(taskDescription + " " + gptStep1Output, primaryTicker))
        ? timed("雪球数据", fetchXueqiuData(toXueqiuSymbol(primaryTicker))
            .then(d => formatXueqiuDataAsMarkdown(d))
            .catch(() => ""))
        : Promise.resolve(""),
      // 中文财经新闻（华尔街见闻/金十/格隆汇/雪球）
      () => isCnFinanceNewsRelevant(taskDescription + " " + gptStep1Output)
        ? fetchAllCnFinanceNews().then(r => {
            // ── V2.1 TrendRadar 集成：过滤 + 权重排序 + 共振检测 ──
            const allItems = [
              ...r.wallstreetcn.items,
              ...r.jin10.items,
              ...r.gelonghui.items,
              ...r.xueqiu.items,
            ].map((item, idx) => ({
              title: item.title,
              source: item.source,
              url: item.url,
              publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined,
              rank: idx + 1,
            }));
            if (allItems.length === 0) return formatCnNewsToMarkdown(r, taskDescription);
            const enhancedBlock = buildEnhancedNewsBlock(allItems, 20);
            const originalBlock = formatCnNewsToMarkdown(r, taskDescription);
            return enhancedBlock
              ? `## 中文财经新闻（TrendRadar 增强版）\n${enhancedBlock}\n\n---\n\n${originalBlock}`
              : originalBlock;
          }).catch(() => "")
        : Promise.resolve(""),
    ];
    const [_simfinResult, _tiingoResult, techIndicatorsResult, optionsChainResult, etfResult, autoChartResult, alphaResult, defiResult, financeDbResult, twelveDataResult, forexResult, healthScoreResult, xueqiuResult, cnFinanceNewsResult] = await runBatch(deepTasks, 2);

        // ── 合并所有数据源结果 ──────────────────────────────────────────
    const stockData = stockDataResult;
    const macroData = macroDataResult;
    const worldBankData = worldBankResult;
    // IMF 数据：将 ImfDataResult 转为 Markdown 字符串
    const imfMarkdown = (() => {
      if (imfDataResult.status !== "fulfilled" || !imfDataResult.value) return "";
      const v = imfDataResult.value;
      if (typeof v === "string") return v; // 资源规划跳过时返回的空字符串
      return formatImfDataAsMarkdown(v);
    })();
    // 合并 Tavily 初始搜索 + 精炼搜索（三阶段改造后，refinedTavilyResult 已是 string 类型）
    const earlyTavilyResult2 = earlyTavilyResult.status === "fulfilled" ? earlyTavilyResult.value : null;
    const earlyTavilyStr = typeof earlyTavilyResult2 === "string" ? earlyTavilyResult2 : (earlyTavilyResult2 && typeof earlyTavilyResult2 === "object" && "content" in earlyTavilyResult2 ? (earlyTavilyResult2 as { content: string }).content : "");
    const refinedTavilyStr = refinedTavilyResult.status === "fulfilled" ? (refinedTavilyResult.value as string) : "";
    // 来源列表：三阶段改造后 Tavily 已内联转为 string，来源信息在 Tavily 模块内处理
    const tavilySources: Array<{ url: string; title?: string }> = [];
    // Bug8 修复：合并初始搜索 + 精炼搜索结果
    let webSearchStr: string;
    if (refinedTavilyStr && earlyTavilyStr && refinedTavilyStr !== earlyTavilyStr) {
      webSearchStr = refinedTavilyStr + "\n\n---\n\n" + earlyTavilyStr;
    } else {
      webSearchStr = refinedTavilyStr || earlyTavilyStr;
    }
    const webSearchData = { status: "fulfilled" as const, value: webSearchStr };

    // 将结构化数据与网页内容分开，让 Manus 分别处理
    // 结构化数据来源：Yahoo Finance / FRED / World Bank / IMF / Finnhub / FMP / Polygon / SEC EDGAR / Alpha Vantage
    const finnhubMarkdown = finnhubResult.status === "fulfilled" && finnhubResult.value ? finnhubResult.value : "";
    const fmpMarkdown = fmpResult.status === "fulfilled" && fmpResult.value ? fmpResult.value : "";
    const polygonMarkdown = polygonResult.status === "fulfilled" && polygonResult.value ? polygonResult.value : "";
    const secMarkdown = secResult.status === "fulfilled" && secResult.value ? secResult.value : "";
    const avEconomicMarkdown = avEconomicResult.status === "fulfilled" && avEconomicResult.value ? avEconomicResult.value : "";
    const cryptoMarkdown = cryptoResult.status === "fulfilled" && cryptoResult.value ? cryptoResult.value : "";
    const etfMarkdown = etfResult?.status === "fulfilled" && etfResult.value ? etfResult.value : "";
    const alphaMarkdown = alphaResult?.status === "fulfilled" && alphaResult.value ? alphaResult.value : "";
    const defiMarkdown = defiResult?.status === "fulfilled" && defiResult.value ? defiResult.value : "";
    const financeDbMarkdown = financeDbResult?.status === "fulfilled" && financeDbResult.value ? financeDbResult.value : "";
    const twelveDataMarkdown = twelveDataResult?.status === "fulfilled" && twelveDataResult.value ? twelveDataResult.value : "";
    const forexMarkdown = forexResult?.status === "fulfilled" && forexResult.value ? forexResult.value : "";
    const healthScoreMarkdown = healthScoreResult?.status === "fulfilled" && healthScoreResult.value ? healthScoreResult.value : "";
    const aStockMarkdown = "";  // [已移除 Baostock]
    const gdeltMarkdown = "";  // [已移除 GDELT]
    const newsApiMarkdown = newsApiResult.status === "fulfilled" && newsApiResult.value ? newsApiResult.value : "";
    const marketauxMarkdown = marketauxResult.status === "fulfilled" && marketauxResult.value ? marketauxResult.value : "";
    const simfinMarkdown = "";  // [已移除 SimFin]
    const tiingoMarkdown = "";  // [已移除 Tiingo]
    const techIndicatorsMarkdown = techIndicatorsResult.status === "fulfilled" && techIndicatorsResult.value ? techIndicatorsResult.value : "";
    const optionsChainMarkdown = optionsChainResult.status === "fulfilled" && optionsChainResult.value ? optionsChainResult.value : "";
    const ecbMarkdown = ecbResult.status === "fulfilled" && ecbResult.value ? ecbResult.value : "";
    const hkexMarkdown = hkexResult.status === "fulfilled" && hkexResult.value ? hkexResult.value : "";
    const boeMarkdown = boeResult.status === "fulfilled" && boeResult.value ? boeResult.value : "";
    const hkmaMarkdown = hkmaResult.status === "fulfilled" && hkmaResult.value ? hkmaResult.value : "";
    const courtListenerMarkdown = "";  // [已移除 CourtListener]
    const congressMarkdown = congressResult.status === "fulfilled" && congressResult.value ? congressResult.value : "";
    const eurLexMarkdown = "";  // [已移除 EUR-Lex]
    const gleifMarkdown = gleifResult.status === "fulfilled" && gleifResult.value ? gleifResult.value : "";
    const structuredDataBlock = [
      stockData.status === "fulfilled" && stockData.value ? stockData.value : "",
      macroData.status === "fulfilled" && macroData.value ? macroData.value : "",
      worldBankData.status === "fulfilled" && worldBankData.value ? worldBankData.value : "",
      imfMarkdown,
      avEconomicMarkdown,  // Alpha Vantage 宏观指标（利率/CPI/失业率/汇率）
      finnhubMarkdown,     // Finnhub 实时报价/分析师评级/内部交易
      fmpMarkdown,         // FMP 财务报表/DCF估值/分析师目标价
      polygonMarkdown,     // Polygon.io 市场快照/近期走势/新闻情绪
      secMarkdown,         // SEC EDGAR XBRL 财务数据/年报/季报
      cryptoMarkdown,      // CoinGecko 加密货币实时价格/市值/趋势
      aStockMarkdown,      // Baostock A股历史行情/财务指标
      gdeltMarkdown,       // GDELT 全球事件/地缘风险/新闻情绪
      newsApiMarkdown,     // NewsAPI 全球新闻搜索/头条
      marketauxMarkdown,   // Marketaux 金融新闻情绪评分/实体识别
      simfinMarkdown,       // SimFin 财务报表/衍生指标/股价历史
      tiingoMarkdown,        // Tiingo 实时估值倍数（P/E、P/B、EV、PEG）+ 历史 OHLCV + 季度财务报表
      techIndicatorsMarkdown, // Alpha Vantage 技术指标（RSI/布林带/EMA/SMA/随机指标）
      optionsChainMarkdown,   // Polygon.io 期权链（Put-Call Ratio/行权价分布/到期日分布）
      ecbMarkdown,            // ECB 欧元区利率/通胀/汇率/货币供应量
      hkexMarkdown,           // HKEXnews 港股公告/年报/监管文件
      boeMarkdown,             // BoE 英国基准利率/国巫t收益率/汇率/货币供应量
      hkmaMarkdown,            // HKMA 港元利率/货币供应量/银行间流动性/外汇储备
      courtListenerMarkdown,   // CourtListener 美国法院诉讼/判决历史
      congressMarkdown,        // Congress.gov 美国立法动态/法案
      eurLexMarkdown,          // EUR-Lex 欧盟法规/监管文件
      gleifMarkdown,           // GLEIF 全球 LEI 法人识别码/法人结构/母子公司关系
      twelveDataMarkdown,        // Twelve Data 实时报价/RSI/MACD（Yahoo Finance 备用源）
      forexMarkdown,             // Frankfurter 外汇汇率（免费公开，基于欧洲央行）
      etfResult?.status === "fulfilled" && etfResult.value ? etfResult.value : "",  // ETF 分析（ThePassiveInvestor）
      alphaResult?.status === "fulfilled" && alphaResult.value ? alphaResult.value : "",  // Alpha 因子（qlib Alpha101 + Alpha158）
      defiResult?.status === "fulfilled" && defiResult.value ? defiResult.value : "",  // DeFi 链上数据（goat-sdk/goat · DeFiLlama）
      financeDbResult?.status === "fulfilled" && financeDbResult.value ? financeDbResult.value : "",  // 全球股票分类（JerBouma/FinanceDatabase）
      healthScoreResult?.status === "fulfilled" && healthScoreResult.value ? healthScoreResult.value : "",  // 财务健康评分（JerBouma/FinanceToolkit 150+ 指标）
      // 雪球深度数据（机构评级/资金流向/财务指标/行情详情，仅 A股/港股）
      xueqiuResult?.status === "fulfilled" && xueqiuResult.value ? xueqiuResult.value : "",
      // 中文财经新闻（华尔街见闻/金十/格隆汇/雪球）
      cnFinanceNewsResult?.status === "fulfilled" && cnFinanceNewsResult.value ? cnFinanceNewsResult.value : "",
      // hacker-laws 定律知识库（帕累托/炒作周期/梅特卡夫/古德哈特等）
      buildLawsContextBlock(taskDescription),
      // Qbot 量化因子知识库（MACD/RSI/KDJ/布林带/RSRS/ROIC/FCF）
      buildQuantContextBlock(taskDescription),
      // 历史 Agent 信号记忆（跨任务积累，参考 TradingAgents 记忆机制）
      await (async () => {
        if (!primaryTicker) return "";
        try {
          const history = await getAgentSignalHistory(userId, primaryTicker, 3);
          if (!history.length) return "";
          const lines = history.map(h => {
            const sig = JSON.parse(h.agentSignals);
            const date = new Date(sig.analyzedAt).toLocaleDateString("zh-CN");
            return `- ${date}: 共识信号=${sig.consensusSignal}, 宏观=${sig.macro?.signal ?? "N/A"}, 技术=${sig.technical?.signal ?? "N/A"}, 基本面=${sig.fundamental?.signal ?? "N/A"}, 情绪=${sig.sentiment?.signal ?? "N/A"}`;
          }).join("\n");
          return `## 历史 Agent 信号记忆（${primaryTicker}，最近 ${history.length} 次分析）\n${lines}`;
        } catch { return ""; }
      })(),
    ].filter(Boolean).join("\n\n---\n\n");
    const webContentBlock = webSearchData.value || "";
    // 合并用于 GPT Step3 的完整数据块（保持向后兼容）
    const realTimeDataBlock = [structuredDataBlock, webContentBlock].filter(Boolean).join("\n\n---\n\n");
    // ── Step2 直接数据聚合（无 LLM 调用，参考 TradingAgents/FinRobot 模式）──────────────
    // 直接将结构化 API 数据作为 DATA_REPORT，无需中间 LLM 整理层
    // 这样节省 1 次 LLM 调用（约 10-20 秒），数据更原始、更可靠
    // 提取自动图表 base64（如有）
    const autoChartBase64 = autoChartResult?.status === "fulfilled" && autoChartResult.value
      ? autoChartResult.value
      : "";
    // 图表区块：在报告顶部插入 matplotlib 图表（%%PYIMAGE%% 标记供前端解析）
    const chartBlock = autoChartBase64 && autoChartBase64.startsWith("%%PYIMAGE%%")
      ? `\n\n${autoChartBase64}\n\n`
      : "";
    const manusReport = realTimeDataBlock
      ? `## 实时数据汇总（直接 API 数据，无 LLM 处理）${chartBlock}\n\n${realTimeDataBlock}`
      : `## 数据收集（基于已有分析框架）${chartBlock}\n\n${gptStep1Output}`;

    // ── V2.1 DATA_PACKET freshness 标签计算 ──────────────────────────────────
    const hasLiveApiData = (polygonMarkdown ?? "").length > 100;
    const hasRecentData = manusReport.includes("2025") || manusReport.includes("2026");
    const hasAnyData = manusReport.length > 200;
    const dataPacketFreshness: "realtime" | "latest_available" | "recent" | "stale" =
      hasLiveApiData ? "realtime" :
      hasRecentData ? "latest_available" :
      hasAnyData ? "recent" : "stale";
    // ─────────────────────────────────────────────────────────────────────────    await updateTaskStatus(taskId, "manus_analyzing", { manusResult: manusReport });
    // 注：manus_analyzing 将 manusResult 写入 DB

    // ── Step2 完成后立即构建 CitationSummary（此时 latencyMap 已全部就绪）─────────────
    const ms = (key: string) => latencyMap.get(key) ?? -1;
    const citationSummary = buildCitationSummary([
      // 市场数据
      { sourceId: "yahoo_finance",        data: (stockData.status === "fulfilled" && stockData.value) ? stockData.value : "",  latencyMs: ms("Yahoo Finance") },
      { sourceId: "finnhub",              data: finnhubMarkdown,        latencyMs: ms("Finnhub") },
      { sourceId: "fmp",                  data: fmpMarkdown,            latencyMs: ms("FMP") },
      { sourceId: "polygon",              data: polygonMarkdown,        latencyMs: ms("Polygon.io") },
      { sourceId: "sec_edgar",            data: secMarkdown,            latencyMs: ms("SEC EDGAR") },
      { sourceId: "simfin",               data: simfinMarkdown,         latencyMs: ms("SimFin") },
      { sourceId: "tiingo",               data: tiingoMarkdown,         latencyMs: ms("Tiingo") },
      // 技术分析
      { sourceId: "local_indicators",     data: techIndicatorsMarkdown, latencyMs: ms("本地技术指标") },
      // 期权数据
      { sourceId: "polygon_options",      data: optionsChainMarkdown,   latencyMs: ms("Polygon 期权链") },
      // 宏观指标
      { sourceId: "fred",                 data: (macroData.status === "fulfilled" && macroData.value) ? macroData.value : "",  latencyMs: ms("FRED") },
      { sourceId: "world_bank",           data: (worldBankData.status === "fulfilled" && worldBankData.value) ? worldBankData.value : "", latencyMs: ms("World Bank") },
      { sourceId: "imf_weo",              data: imfMarkdown,            latencyMs: ms("IMF WEO") },
      { sourceId: "alpha_vantage_econ",   data: avEconomicMarkdown,     latencyMs: ms("Alpha Vantage") },
      { sourceId: "ecb",                  data: ecbMarkdown,            latencyMs: ms("ECB") },
      { sourceId: "boe",                  data: boeMarkdown,            latencyMs: ms("BoE") },
      { sourceId: "hkma",                 data: hkmaMarkdown,           latencyMs: ms("HKMA") },
      // 新闻情绪
      { sourceId: "gdelt",                data: gdeltMarkdown,          latencyMs: ms("GDELT") },
      { sourceId: "news_api",             data: newsApiMarkdown,        latencyMs: ms("NewsAPI") },
      { sourceId: "marketaux",            data: marketauxMarkdown,      latencyMs: ms("Marketaux") },
      // 加密货币
      { sourceId: "coingecko",            data: cryptoMarkdown,         latencyMs: ms("CoinGecko") },
      // A股数据
      { sourceId: "baostock",             data: aStockMarkdown,         latencyMs: ms("Baostock") },
      { sourceId: "xueqiu",              data: xueqiuResult?.status === "fulfilled" && xueqiuResult.value ? xueqiuResult.value : "", latencyMs: ms("雪球数据") },
      // 港股公告
      { sourceId: "hkex",                 data: hkexMarkdown,           latencyMs: ms("HKEXnews") },
      // 法律监管
      { sourceId: "court_listener",       data: courtListenerMarkdown,  latencyMs: ms("CourtListener") },
      { sourceId: "congress",             data: congressMarkdown,       latencyMs: ms("Congress.gov") },
      { sourceId: "eur_lex",              data: eurLexMarkdown,         latencyMs: ms("EUR-Lex") },
      // 公司信息
      { sourceId: "gleif",                data: gleifMarkdown,          latencyMs: ms("GLEIF") },
      // 网页搜索（Tavily）
      { sourceId: "tavily",               data: webSearchStr,           latencyMs: ms("Tavily") },
    ]);
     // 兑容前端 ApiSource[] 格式（从注册表自动生成，无需手动维护）
    const apiSources = citationToApiSources(citationSummary);

    // ── Evidence Validator：构建证据包，计算 evidence_score，生成 Step3 指令 ────────────────
    // P0-3: 字段级 fallback 覆盖检查 — 用 FIELD_FALLBACK_MAP 分析字段缺失分层
    const hypothesisFields = resourcePlan.taskSpec?.hypotheses
      ?.flatMap((h: { required_fields: string[] }) => h.required_fields) ?? [];
    // 从 citationSummary 中提取实际命中的数据源 ID 集合
    const hitSourceIds = new Set(
      citationSummary.citations.filter(c => c.hit).map(c => c.sourceId)
    );
    const { fieldCoverage } = resolveFieldSources(
      hypothesisFields.length > 0 ? hypothesisFields : ["price.current", "valuation.pe", "financials.income"],
      hitSourceIds
    );
    const { missingBlocking, missingImportant, missingOptional } = classifyMissingFields(fieldCoverage);

    // 构建 API 命中统计（从 citationSummary 提取，不依赖 LLM 格式化输出）
    const hitSourceIdsList = citationSummary.citations.filter(c => c.hit).map(c => c.sourceId);
    const apiHitStats = {
      hitCount: citationSummary.hitCount,
      totalCount: citationSummary.citations.length,
      hitSourceIds: hitSourceIdsList,
      hasWhitelistedHit: citationSummary.hasEvidenceToBasis,
    };

     const evidencePacket = buildEvidencePacket(taskDescription, manusReport, {
      missingBlocking,
      missingImportant,
      missingOptional,
    }, apiHitStats);
    // ── LEVEL1C: Post-Fetch Evidence Engine ──────────────────────────────────────
    // Build fieldDataMap from citationSummary: extract numeric values from dataSummary
    // for cross-source comparison (price, pe_ratio, market_cap)
    const level1cFieldDataMap: Record<string, FieldDataPoint[]> = {};
    const hitCitations = citationSummary.citations.filter(c => c.hit && c.dataSummary.length > 10);
    // Extract price.current from each source's dataSummary
    for (const citation of hitCitations) {
      const priceMatch = citation.dataSummary.match(/(?:price|Price|\$|USD)[:\s]*([0-9,]+\.?[0-9]*)/i);
      if (priceMatch) {
        const val = parseFloat(priceMatch[1].replace(/,/g, ""));
        if (!isNaN(val) && val > 0) {
          if (!level1cFieldDataMap["price.current"]) level1cFieldDataMap["price.current"] = [];
          level1cFieldDataMap["price.current"].push({
            source: citation.sourceId,
            value: val,
            freshness: citation.dataTimestamp ? (new Date(citation.dataTimestamp) > new Date(Date.now() - 86400000) ? "fresh" : "stale") : "unknown",
          });
        }
      }
      // Extract P/E ratio
      const peMatch = citation.dataSummary.match(/(?:P\/E|PE|pe_ratio|peRatio)[:\s]*([0-9]+\.?[0-9]*)/i);
      if (peMatch) {
        const val = parseFloat(peMatch[1]);
        if (!isNaN(val) && val > 0 && val < 10000) {
          if (!level1cFieldDataMap["valuation.pe"]) level1cFieldDataMap["valuation.pe"] = [];
          level1cFieldDataMap["valuation.pe"].push({
            source: citation.sourceId,
            value: val,
            freshness: citation.dataTimestamp ? (new Date(citation.dataTimestamp) > new Date(Date.now() - 86400000) ? "fresh" : "stale") : "unknown",
          });
        }
      }
      // Extract market cap (in billions)
      const mcapMatch = citation.dataSummary.match(/(?:market.?cap|Market.?Cap)[:\s]*([0-9,]+\.?[0-9]*)[\s]*(B|T|M)?/i);
      if (mcapMatch) {
        let val = parseFloat(mcapMatch[1].replace(/,/g, ""));
        const unit = mcapMatch[2]?.toUpperCase();
        if (unit === "T") val *= 1000;
        else if (unit === "M") val /= 1000;
        if (!isNaN(val) && val > 0) {
          if (!level1cFieldDataMap["valuation.market_cap"]) level1cFieldDataMap["valuation.market_cap"] = [];
          level1cFieldDataMap["valuation.market_cap"].push({
            source: citation.sourceId,
            value: val,
            freshness: citation.dataTimestamp ? (new Date(citation.dataTimestamp) > new Date(Date.now() - 86400000) ? "fresh" : "stale") : "unknown",
          });
        }
      }
    }
    const level1cResult = runLevel1CEvidenceEngine(
      level1cFieldDataMap,
      missingBlocking,
      missingImportant,
      hitCitations.map(c => c.sourceId)
    );
    // Compute Level1C output gating (stricter rule wins over Level1A2)
    const level1cGating = computeOutputGating(
      level1cResult.strength_report,
      level1cResult.conflict_bundle,
      evidencePacket.outputMode as "decisive" | "directional" | "framework_only" | undefined
    );
    const level1cGatingInstruction = buildGatingInstruction(level1cGating);
    // ── LEVEL1C END ───────────────────────────────────────────────────────────────
    // ------------------------------------------------------------------------
    // Step 3 - GPT 整合输出（两阶段渲染）
    // Phase A: 结构化 answer object（JSON Schema，内部使用，不流式）
    // Phase B: 自然语言渲染（基于 answer object，流式输出给用户）
    // ------------------------------------------------------------------------
    emitTaskStatus(taskId, "multi_agent"); // SSE: 多智能体分析中
    await updateTaskStatus(taskId, "gpt_reviewing");
    emitTaskStatus(taskId, "synthesis"); // SSE: 综合分析中

    // ── V2.1 ACTION_ENGINE：根据 task_type 自动决定触发哪些 action ─────────────
    const resolvedTaskType = resourcePlan.taskSpec?.task_parse?.task_type ?? "general";
    const actionCandidatesFromStep1: string[] = (resourcePlan.taskSpec as any)?.action_candidates ?? [];
    const autoActions: string[] = [...actionCandidatesFromStep1];
    // 按 task_type 自动补充 action
    if (resolvedTaskType === "stock_analysis") {
      if (!autoActions.includes("comparison")) autoActions.push("comparison");
      if (!autoActions.includes("chart")) autoActions.push("chart");
      if (!autoActions.includes("sensitivity")) autoActions.push("sensitivity");
    } else if (resolvedTaskType === "portfolio_review") {
      if (!autoActions.includes("allocation")) autoActions.push("allocation");
      if (!autoActions.includes("comparison")) autoActions.push("comparison");
    } else if (resolvedTaskType === "macro_analysis") {
      if (!autoActions.includes("chart")) autoActions.push("chart");
    } else if (resolvedTaskType === "crypto_analysis") {
      if (!autoActions.includes("chart")) autoActions.push("chart");
      if (!autoActions.includes("comparison")) autoActions.push("comparison");
    }
    // ACTION_ENGINE 结果注入 Step3 prompt（在 Step3 构建时使用 autoActions）
    // ─────────────────────────────────────────────────────────────────────────
    // ── 并行多 Agent 分析（参考 TradingAgents/AutoHedge 架构）──────────────────────
    // 仅在深度/标准模式且任务类型为 stock_analysis/macro_analysis 时激活
    // 避免在快速模式下增加延迟
    const multiAgentTaskType = resolvedTaskType;
    let multiAgentBlock = "";
    let savedAgentSignalsJson: string | undefined;
    let multiAgentResult: Awaited<ReturnType<typeof runMultiAgentAnalysis>> | undefined;
    if (modeConfig.label !== "quick" && (multiAgentTaskType === "stock_analysis" || multiAgentTaskType === "macro_analysis")) {
      try {
        multiAgentResult = await runMultiAgentAnalysis(
          taskDescription,
          manusReport.slice(0, 6000),
          multiAgentTaskType,
          modeConfig.label === "deep" ? 400 : 300,
        );
        multiAgentBlock = multiAgentResult.directorSummary;
        // 提取 Alpha 因子快照（从 alphaResult 中解析 JSON 标记）
        let alphaFactorsSnapshot: { compositeScore?: number; overallSignal?: string; factors?: Array<{ name: string; value: number; signal: string }> } | null = null;
        try {
          const alphaRaw = alphaResult?.status === "fulfilled" ? alphaResult.value : "";
          const alphaMatch = alphaRaw?.match(/%%ALPHA_FACTORS%%([\s\S]*?)%%END_ALPHA_FACTORS%%/);
          if (alphaMatch?.[1]) {
            const parsed = JSON.parse(alphaMatch[1]);
            alphaFactorsSnapshot = {
              compositeScore: parsed.compositeScore,
              overallSignal: parsed.overallSignal,
              factors: (parsed.factors || []).map((f: { name: string; value: number; signal: string }) => ({ name: f.name, value: f.value, signal: f.signal })),
            };
          }
        } catch { /* ignore */ }
        // 序列化 Agent 信号供记忆持久化
        // 从技术指标结果中提取 sigma（期权定价用的年化波动率）
        let optionSigma: number | null = null;
        try {
          const techRaw = techIndicatorsResult?.status === "fulfilled" ? techIndicatorsResult.value : "";
          if (techRaw) {
            const sigmaMatch = techRaw.match(/%%OPTION_PRICING%%([\s\S]*?)%%END_OPTION_PRICING%%/);
            if (sigmaMatch?.[1]) {
              const parsed = JSON.parse(sigmaMatch[1]);
              if (typeof parsed.sigma === "number") optionSigma = parsed.sigma;
            }
          }
        } catch { /* ignore */ }
        savedAgentSignalsJson = JSON.stringify({
          ticker: primaryTicker || null,
          macro: multiAgentResult.agents.find(a => a.role === "macro"),
          technical: multiAgentResult.agents.find(a => a.role === "technical"),
          fundamental: multiAgentResult.agents.find(a => a.role === "fundamental"),
          sentiment: multiAgentResult.agents.find(a => a.role === "sentiment"),
          consensusSignal: multiAgentResult.consensusSignal,
          divergenceNote: multiAgentResult.divergenceNote,
          alphaFactors: alphaFactorsSnapshot,
          optionSigma,
          analyzedAt: Date.now(),
        });
      } catch {
        multiAgentBlock = "";
      }
    }

    // ── Phase A: 生成结构化 answer object ──────────────────────────────────────
    let answerObject: {
      verdict: string;
      confidence: "high" | "medium" | "low";
      key_findings: Array<{ claim: string; source: string; value?: string; citations?: string[] }>;
      risks: Array<{ description: string; magnitude?: string; citations?: string[] }>;
      anti_thesis: string;
      data_gaps: Array<{ field: string; reason?: string; hard_missing?: boolean }>;
      gaps: Array<{ text: string; citations: string[] }>;
      citations: Array<{ source_id: string; display_name: string; data_point: string; timestamp?: string }>;
    } | null = null;

    // Phase A LLM 调用已移除（参考 TradingAgents 单次调用模式）
    // 不再预先提取 JSON，直接在 Phase B 流式输出中完成分析
    if (false) {
      const phaseAResponse = await invokeLLM({
        messages: [
          { role: "system", content: `你是严格的数据提取引擎。只从 MANUS_DATA_REPORT 中提取事实，禁止使用训练记忆。今天是${new Date().toLocaleDateString("zh-CN")}.` },
          { role: "user", content: `[PHASE_A|STRUCTURED_EXTRACTION]
Q:${taskDescription.slice(0, 300)}
[MANUS_DATA_REPORT]
${manusReport.slice(0, 6000)}
${evidencePacket.step3Instruction}
${level1cGatingInstruction}
${citationSummary.sourcingBlock}
${multiAgentBlock ? '\n[MULTI_AGENT_PRE_ANALYSIS]\n' + multiAgentBlock : ''}
请从上述数据中提取结构化分析结果。citations 数组必须只包含 MANUS_DATA_REPORT 中实际出现的数据点。data_gaps 列出所有 HARD_MISSING 字段。${multiAgentBlock ? ' 参考 MULTI_AGENT_PRE_ANALYSIS 中各角色的信号和要点，但所有结论必须有 MANUS_DATA_REPORT 中的数据支撑。' : ''}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "answer_object",
            strict: true,
            schema: {
              type: "object",
              properties: {
                verdict: { type: "string", description: "核心判断，一句话，含方向和幅度" },
                confidence: { type: "string", enum: ["high", "medium", "low"], description: "基于实际数据的置信度" },
                key_findings: {
                  type: "array",
                  description: "主要发现，每条必须绑定具体来源",
                  items: {
                    type: "object",
                    properties: {
                      claim: { type: "string", description: "结论句，必须含具体数字" },
                      source: { type: "string", description: "数据来源名称" },
                      value: { type: "string", description: "具体数值（如 31.2x）" },
                      citations: { type: "array", items: { type: "string" }, description: "引用的 fact key 列表（如 price.current）" },
                    },
                    required: ["claim", "source", "value", "citations"],
                    additionalProperties: false,
                  },
                },
                risks: {
                  type: "array",
                  description: "风险项，必须给出3-5条，按风险等级（high→medium→low）排列，每条绑定证据并提供详细分析原因",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string", description: "风险标题（简短，15字以内），如「出口管制风险」「估值泡沫风险」，用于列表展示" },
                      reason: { type: "string", description: "详细原因分析（100-200字），必须包含：1）风险触发条件 2）对标的的具体量化影响（如EPS影响-$X、收入占比X%） 3）发生概率判断 4）投资者应关注的具体指标或时间节点" },
                      magnitude: { type: "string", description: "风险幅度：high/medium/low" },
                      citations: { type: "array", items: { type: "string" }, description: "支撑此风险的 fact key" },
                    },
                    required: ["description", "reason", "magnitude", "citations"],
                    additionalProperties: false,
                  },
                },
                anti_thesis: { type: "string", description: "如果判断错误，最可能的原因" },
                data_gaps: {
                  type: "array",
                  description: "HARD_MISSING 字段列表",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      reason: { type: "string" },
                      hard_missing: { type: "boolean" },
                    },
                    required: ["field", "reason", "hard_missing"],
                    additionalProperties: false,
                  },
                },
                gaps: {
                  type: "array",
                  description: "证据缺口说明，没有 citations 的结论句必须放入此处而不是 key_findings",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "缺口说明，格式：「未获取XXX，因此无法对YYY给出高置信判断」" },
                      citations: { type: "array", items: { type: "string" }, description: "空数组表示无证据" },
                    },
                    required: ["text", "citations"],
                    additionalProperties: false,
                  },
                },
                citations: {
                  type: "array",
                  description: "全部已验证引用（只能来自 MANUS_DATA_REPORT）",
                  items: {
                    type: "object",
                    properties: {
                      source_id: { type: "string" },
                      display_name: { type: "string" },
                      data_point: { type: "string" },
                      timestamp: { type: "string" },
                    },
                    required: ["source_id", "display_name", "data_point", "timestamp"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["verdict", "confidence", "key_findings", "risks", "anti_thesis", "data_gaps", "gaps", "citations"],
              additionalProperties: false,
            },
          },
        } as any,
      });
      const rawContent = String(phaseAResponse.choices?.[0]?.message?.content || "");
      if (rawContent) {
        try { answerObject = JSON.parse(rawContent); } catch { /* ignore parse error */ }
      }
    }
    // Phase A 已禁用（if(false)），answerObject 始终为 null

    // Phase A 结果摘要（保留占位符，多 Agent 分析结果如果有则注入）
    const hardMissingFields: string[] = [];
    const phaseABlock = multiAgentBlock
      ? `[MULTI_AGENT_PRE_ANALYSIS]
${multiAgentBlock}`
      : "[DIRECT_ANALYSIS: 直接基于 MANUS_DATA_REPORT 分析]";

    // ── 动态 FOLLOWUP 策略：根据 task_type 和 outputMode 决定追问数量和方向 ──────────────────────────────────
    const taskType = resourcePlan.taskSpec?.task_parse?.task_type ?? "general";
    const outputMode = evidencePacket.outputMode;
    let followupInstruction: string;
    if (outputMode === "framework_only") {
      // 证据不足：引导用户补充证据
      followupInstruction = `⑪ FOLLOWUP: 结尾给出 2 个证据补充问题（帮用户明确下一步应获取哪些数据）和 1 个研究框架问题 %%FOLLOWUP%%问题%%END%%`;
    } else if (taskType === "general" || taskType === "event_driven") {
      // 聊天型/事件驱动：轻量化，只给 1-2 个自然追问
      followupInstruction = `⑪ FOLLOWUP: 结尾给出 1-2 个自然追问（服务投资决策，不要机械式补三个） %%FOLLOWUP%%问题%%END%%`;
    } else {
      // 深度分析（stock_analysis/macro_analysis）：给出研究延伸问题
      followupInstruction = `⑪ FOLLOWUP: 结尾给出 3 个研究延伸问题（帮用户深化分析，而非重复已知信息） %%FOLLOWUP%%问题%%END%%`;
    }

    // ── V2.1 ACTION_ENGINE：将 autoActions 注入 Step3 prompt ─────────────────
    const actionEngineBlock = autoActions.length > 0
      ? `
[ACTION_ENGINE] 本次分析已自动启用以下 action：${autoActions.join(", ")}。请在报告中相应地包含：${
          autoActions.includes("comparison") ? "横向对比（竞争对手/行业均值）；" : ""
        }${autoActions.includes("chart") ? "%%CHART%% 图表（至少1个）；" : ""
        }${autoActions.includes("sensitivity") ? "敏感性分析（关键假设变动影响）；" : ""
        }${autoActions.includes("allocation") ? "资产配置建议（权重/比例）；" : ""
        }[/ACTION_ENGINE]`
      : "";
    // ─────────────────────────────────────────────────────────────────────────
    // 检测是否为新闻/市场分析类查询，如是则注入 TrendRadar 六板块分析框架
    const isNewsAnalysisQuery = /新闻|市场动态|趋势|情绪|热点|头条|资讯|公告|事件|动态|影响|评估|news|trend|market update/i.test(taskDescription);
    const trendRadarFramework = isNewsAnalysisQuery
      ? `\n\n[TRENDRADAR_FRAMEWORK]\n${buildTrendRadarAnalysisPrompt()}\n[/TRENDRADAR_FRAMEWORK]`
      : "";

    // ── V1.5 DATA_PACKET_WRAPPER：轻量结构化包装（零新增 LLM 调用）──────────────
    const dataPacket = buildDataPacket({
      taskId: String(taskId),
      ticker: primaryTicker || "",
      taskType: resolvedTaskType,
      manusReport,
      evidencePacket: manusReport,
      multiAgentResult: multiAgentResult ?? undefined,
      requiredFields: (resourcePlan as any)?.fieldRequirements?.required_fields ?? [],
      missingFields: missingBlocking,
    });
    const dataPacketSummary = formatDataPacketForPrompt(dataPacket);
    // ── LEVEL1A Phase5: Synthesis Enrichment ────────────────────────────────
    const synthesisEnrichment = buildSynthesisEnrichment(
      intentCtx,
      researchPlan,
      multiAgentResult ?? undefined,
      (answerObject as any)?.anti_thesis ?? undefined,
      evidencePacket.evidenceScore ?? 50,
      evidencePacket.outputMode ?? "directional",
    );
    const synthesisEnrichmentBlock = formatSynthesisEnrichmentForPrompt(synthesisEnrichment);
    // ── LEVEL1A2 Phase5: Structured Synthesis Controller + Runtime Gate ──────
    const normalizedTaxonomy = normalizeAgentTaxonomy(multiAgentResult ?? null);
    const structuredSynthesis = buildStructuredSynthesis(
      normalizedTaxonomy,
      intentCtx,
      evidencePacket.evidenceScore ?? 50,
      evidencePacket.outputMode ?? "directional",
      missingBlocking.length > 0,
      (answerObject as any)?.anti_thesis ?? undefined,
      primaryTicker,
    );
    const structuredSynthesisBlock = formatStructuredSynthesisForPrompt(structuredSynthesis);
    const runtimeGate = evaluateRuntimeGate(
      intentCtx,
      evidencePacket.evidenceScore ?? 50,
      missingBlocking.length > 0,
      missingBlocking.length,
    );
    const runtimeGateBlock = formatGatingDecisionForPrompt(runtimeGate);
    // ── LEVEL1A END Synthesis ────────────────────────────────────────────────────────────
    // Step3 GPT prompt（Phase B：基于 Phase A 结果，渲染自然语言）
    const gptUserMessage = `[GPT←MANUS|STEP3|FINALIZE]${trendRadarFramework}${actionEngineBlock}}
Q:${taskDescription.slice(0, 300)}${historyBlock ? '\nHIST_CTX:' + historyBlock.slice(0, 600) : ''}
[GPT_RETRIEVAL_PLAN_S1]
${gptStep1Output.slice(0, 800)}
[MANUS_DATA_REPORT]
${manusReport}
${evidencePacket.step3Instruction}
${level1cGatingInstruction}
${citationSummary.sourcingBlock}
${phaseABlock}
[DATA_PACKET_V1_5]
${dataPacketSummary}
[/DATA_PACKET_V1_5]
${intentContextBlock}
${researchPlanBlock}
${synthesisEnrichmentBlock}
${structuredSynthesisBlock}
${runtimeGateBlock}
[MODE:${modeConfig.label}]${modeConfig.step3Hint ? '\n' + modeConfig.step3Hint : ''}
━━━ FINALIZE: OUTPUT IN HUMAN LANGUAGE ━━━
你是首席分析师（GPT）。Manus 已完成数据收集，现在基于实际数据输出最终专业报告给用户。
如果 PHASE_A_ANSWER_OBJECT 存在，以其 verdict/key_findings/risks/anti_thesis 为骨架展开论述，确保每个论点均引用对应 citation 。

**Citation 约束（最重要）：**
- 每个数字、百分比、价格、指标必须来自 MANUS_DATA_REPORT，格式：数字（时间，来源）
- 禁止使用训练记忆中的任何数据补全空白
- HARD_MISSING 字段必须在正文中标注「当前数据不可用」，不得用历史经验补全
- 如果所有关键数据均为 HARD_MISSING，输出「当前证据不足，无法给出可靠判断」

**输出强度门控（OUTPUT_MODE = ${outputMode}）：**
${outputMode === "decisive" ? `- 当前为 DECISIVE 模式：允许写强判断（「高估30-40%」「明确买入/增持」）
- 必须给出明确立场 + 幅度 + 反驳论点
- 每个强结论必须有 ≥2 条独立证据支撑` : outputMode === "directional" ? `- 当前为 DIRECTIONAL 模式：只能写方向性判断（「偏高/偏低/中性」「方向性看好/谨慎」）
- 禁止写具体幅度（不能写「高估30%」，只能写「可能存在高估」）
- 必须明确标注「证据尚不充分，以下为方向性判断」
- 列出缺失字段和补充建议` : `- 当前为 FRAMEWORK_ONLY 模式：只能输出研究框架
- 禁止任何强判断和方向性结论
- 必须明确写「当前证据不足，以下为研究框架而非投资建议」
- 列出所有缺失的 blocking 字段和获取建议
- 不得用训练记忆数据填充框架`}
${(missingBlocking.length > 0 || missingImportant.length > 0) ? `
**字段缺失报告：**
${missingBlocking.length > 0 ? `- 阻断缺失（必须标注）：${missingBlocking.join(", ")}` : ""}
${missingImportant.length > 0 ? `- 重要缺失（应标注）：${missingImportant.join(", ")}` : ""}` : ""}

MANDATORY（不可省略）:
① CONCLUSION_FIRST: 每段第一句就是结论，格式「**[判断]**（数据→逻辑）」，禁止先铺垫再结论
② POSITION: 对核心问题给出明确立场+幅度（「高体7何30-40%」不是「偏高」；「建议减仓」不是「可以考虑」）
③ CONSENSUS_VS_MINE: 主动对比「市场普遍认为X → 但数据显示Y → 因此我判断Z」，体现独立思考
④ QUANTIFY: 引用 Manus 精确数字（PE=23.4x 而非“约20x”），标注时间（如 ${lastYearStr}Q3）
⑤ VALUATION: 若有 P/E|P/B|EV|PEG → 与行业均值+历史均值对比 → 给出估值结论（含幅度）
⑥ ANTI_THESIS: 主动提出「如果我错了，最可能的原因是：___」— 展示思维深度
⑦ DUAL_VERIFY: 正向（现在→未来）+ 反向（若判断正确→12个月内会出现什么可验证数据）
⑧ RISK: 针对当前标的生成 3-5 条具体量化风险，必须覆盖不同维度（估值风险/业务风险/宏观风险/竞争风险/技术风险），每条必须含具体数字和幅度；禁止通用模板风险（如「市场波动」「宏观不确定性」等无量化废话）
⑨ CONTINUITY: 若为延续任务 → 明确引用上次结论，说明本次更新了什么判断
⑩ CHARTS: 每个数据/趋势/对比机会嵌入 %%CHART%%...%%END_CHART%%（至少 1 个）
${followupInstruction}

PROHIBIT: 「平衡分析」「两方面来看」「既有机会也有风险」等中立废话 | 模糊结论 | 纯框架无数据 | 照晗 Manus 报告 | 先铺垫后结论 | 用训练记忆数据补全空白
FORMAT: ##标题 | **加粗**关键数据 | >引用块用于判断 | 表格≥3列 | 中文输出

⑫ STRUCTURED_OUTPUT（必须，在回复最末尾输出，不得省略）:
完成所有自然语言内容后，在回复的绝对末尾追加以下两个 JSON 块。
严格遵守：纯 JSON，无注释，无 trailing comma，无 markdown 代码围栏，所有 key 必须存在，无内容时用空字符串或空数组。

%%DELIVERABLE%%
{
  "verdict": "一句话核心判断（含方向和幅度）",
  "confidence": "high|medium|low",
  "horizon": "short-term|mid-term|long-term",
  "bull_case": [
    "BULL看多理由１：【必须是利好内容】无论结论方向是看多还是看空，此处必须填写支持看多的利好论点（如业务增长/估值安全边际/技术领先），绝对禁止填写利空内容",
    "BULL看多理由２：【必须是利好内容】不同维度的看多利好（业务/技术/市场/竞争四选一）"
  ],
  "reasoning": ["推理链1", "推理链2"],
  "bear_case": [
    "BEAR看空理由１：【必须是利空内容】无论结论方向是看多还是看空，此处必须填写支持看空的利空论点（如高估值/宏观风险/竞争加剧），绝对禁止填写利好内容",
    "BEAR看空理由２：【必须是利空内容】不同维度的看空利空（估值/业务/宏观/情绪四选一）",
    "BEAR看空理由３：【必须是利空内容】最强看空论点：如果只有一个利空能推翻看多结论，是什么"
  ],
  "risks": [
    {"description": "风险标题（15字内）", "reason": "详细原因：风险触发条件+具体量化影响+发生概率+关注指标，100-200字", "magnitude": "high"},
    {"description": "第二条风险标题", "reason": "详细原因：...", "magnitude": "medium"},
    {"description": "第三条风险标题", "reason": "详细原因：...", "magnitude": "low"}
  ],
  "next_steps": ["建议行动1（含触发条件）", "建议行动2（含时间窗口）"]
}
%%END_DELIVERABLE%%

%%DISCUSSION%%
{
  "key_uncertainty": "当前最大的不确定性（必须与本次分析主题直接相关，不得泛化）",
  "weakest_point": "本次分析最薄弱的环节（指出具体数据缺失或逻辑漏洞）",
  "alternative_view": "与本结论相反的合理观点（必须有具体论据支撑，不得仅说'也有人认为'）",
  "follow_up_questions": [
    "追问1（必须基于本次分析的核心论点，不得是通用问题）",
    "追问2（必须针对 counterarguments 中最强反驳展开）",
    "追问3（必须涉及 key_uncertainty 的验证方法或数据来源）"
  ],
  "exploration_paths": ["延伸研究方向1（含具体数据源或分析方法）", "延伸研究方向2（含时间窗口）"]
}
%%END_DISCUSSION%%

规则：%%DELIVERABLE%% 和 %%END_DELIVERABLE%% 之间只能有 JSON，%%DISCUSSION%% 和 %%END_DISCUSSION%% 之间只能有 JSON。这两个块必须是回复的最后内容，之后不得有任何文字。如果无法生成有效 JSON，则完全省略这两个块，不得输出残缺 JSON。`;
    // ── LEVEL1A3 Phase3: JSON-only Render Path ────────────────────────────────────────────
    // Activates for standard/deep analysis on structured task types
    const useJsonOnlyMode = analysisMode !== "quick" &&
      resolvedTaskType !== "general" &&
      resolvedTaskType !== "event_driven";
    const normalizedTaxonomyBlock = useJsonOnlyMode
      ? formatNormalizedTaxonomyForPrompt(normalizedTaxonomy)
      : "";
    // ── LEVEL3A: Retrieve prior analysis memory (non-fatal, zero LLM calls) ──────────
    let priorMemoryBlock = "";
    let memoryUsed = false;
    let memoryTicker = "";
    let memoryRecordCreatedAt = "";
    let memorySummary = "";
    if (useJsonOnlyMode && primaryTicker) {
      const memResult = await getAnalysisMemory({
        userId,
        ticker: primaryTicker,
        taskType: resolvedTaskType,
      });
      if (memResult.found) {
        priorMemoryBlock = buildPriorAnalysisContextBlock(memResult.memory);
        memoryUsed = true;
        memoryTicker = memResult.memory.ticker;
        memoryRecordCreatedAt = memResult.memory.createdAt;
        memorySummary = `上次分析：${memResult.memory.verdict} (置信度: ${memResult.memory.confidenceLevel})`;
        console.log(`[LEVEL3A] Prior memory found for ${primaryTicker}, injecting into Step3`);
      }
    }
    // ── LEVEL3A END ─────────────────────────────────────────────────────────────────

    // ── LEVEL3B: Build MemorySeed + MemoryConflict (non-fatal, zero LLM calls) ──────────
    let memorySeedForEngine: MemorySeed | undefined;
    let memoryConflictForEngine: MemoryConflict | undefined;
    if (useJsonOnlyMode && primaryTicker) {
      try {
        const memResult2 = await getAnalysisMemory({
          userId,
          ticker: primaryTicker,
          taskType: resolvedTaskType,
        });
        if (memResult2.found) {
          const m = memResult2.memory;
          memorySeedForEngine = {
            memory_found: true,
            prior_open_hypotheses: m.openHypotheses ?? [],
            prior_key_uncertainty: m.keyUncertainty ?? "",
            prior_verdict: m.verdict ?? "",
            prior_confidence: m.confidenceLevel ?? "unknown",
          };
          // Conflict detection will run after level1a3Output is available (see LEVEL2 block)
        } else {
          memorySeedForEngine = {
            memory_found: false,
            prior_open_hypotheses: [],
            prior_key_uncertainty: "",
            prior_verdict: "",
            prior_confidence: "unknown",
          };
        }
      } catch (memSeedErr) {
        console.warn("[LEVEL3B] MemorySeed build failed (non-fatal):", memSeedErr);
      }
    }
    // ── LEVEL3B END ─────────────────────────────────────────────────────────────────

    const jsonOnlySystemMsg = useJsonOnlyMode ? buildStep3JsonOnlySystemMessage() : "";
    const jsonOnlyUserMsg = useJsonOnlyMode ? buildStep3JsonOnlyUserMessage({
      ticker: primaryTicker,
      taskDescription,
      outputMode,
      structuredSynthesisBlock,
      runtimeGateBlock,
      normalizedTaxonomyBlock,
      dataPacketSummary,
      evidenceScore: evidencePacket.evidenceScore ?? 50,
      missingBlocking,
      missingImportant,
      historyBlock: priorMemoryBlock
        ? priorMemoryBlock + (historyBlock ? "\n" + historyBlock : "")
        : (historyBlock ?? ""),
      modeHint: modeConfig?.step3Hint ?? "",
    }) : "";
    // ── LEVEL1A3 END Phase3 ─────────────────────────────────────────────────
    // -- 先写入占位消息（streaming 状态），前端立即开始接收流 -------------------
    const streamMsgId = await insertMessage({
      taskId,
      userId,
      conversationId,
      role: "assistant",
      content: "",
      metadata: { phase: "streaming" },
    });
    await updateTaskStatus(taskId, "streaming", { streamMsgId });
    emitTaskStatus(taskId, "streaming", { streamMsgId }); // SSE 推送

    let finalReply: string;
    let level1a3Output: FinalOutputSchema | null = null; // LEVEL1A3 structured output
    if (useJsonOnlyMode) {
      // ── LEVEL1A3: JSON-only Render Path (standard/deep + structured task types) ──
      // GPT is a RENDERER, not an author. GPT only fills the schema.
      let rawJsonOutput = "";
      try {
        if (userConfig?.openaiApiKey) {
          rawJsonOutput = await callOpenAI({
            apiKey: userConfig.openaiApiKey,
            model: userConfig.openaiModel || DEFAULT_MODEL,
            messages: [
              { role: "system", content: jsonOnlySystemMsg },
              { role: "user", content: jsonOnlyUserMsg },
            ],
            maxTokens: modeConfig?.step3MaxTokens ?? 2400,
          });
        } else {
          const fb = await invokeLLMWithRetry({
            messages: [
              { role: "system", content: jsonOnlySystemMsg },
              { role: "user", content: jsonOnlyUserMsg },
            ],
          });
          rawJsonOutput = String(fb.choices?.[0]?.message?.content || "");
        }
        // ── LEVEL1A3 Phase5: Validation Layer ──
        let validationResult = validateFinalOutput(rawJsonOutput);
        if (!validationResult.valid) {
          // Retry once with error context
          const retryMsg = jsonOnlyUserMsg + `\n\nPREVIOUS_ATTEMPT_ERRORS: ${validationResult.errors.join(", ")}\nFix these errors and output valid JSON only.`;
          let retryRaw = "";
          if (userConfig?.openaiApiKey) {
            retryRaw = await callOpenAI({
              apiKey: userConfig.openaiApiKey,
              model: userConfig.openaiModel || DEFAULT_MODEL,
              messages: [
                { role: "system", content: jsonOnlySystemMsg },
                { role: "user", content: retryMsg },
              ],
              maxTokens: modeConfig?.step3MaxTokens ?? 2400,
            });
          } else {
            const retryFb = await invokeLLMWithRetry({
              messages: [
                { role: "system", content: jsonOnlySystemMsg },
                { role: "user", content: retryMsg },
              ],
            });
            retryRaw = String(retryFb.choices?.[0]?.message?.content || "");
          }
          validationResult = validateFinalOutput(retryRaw);
        }
        if (validationResult.valid && validationResult.output) {
          level1a3Output = validationResult.output;
        } else {
          // Fallback: use safe fallback output
          level1a3Output = buildSafeFallbackOutput(
            primaryTicker,
            outputMode,
            evidencePacket.evidenceScore ?? 50,
          );
        }
      } catch (jsonErr) {
        // Fallback on any error
        level1a3Output = buildSafeFallbackOutput(
          primaryTicker,
          outputMode,
          evidencePacket.evidenceScore ?? 50,
        );
      }
      // ── LEVEL1A3 Phase3: System Renders Markdown from JSON ──
      const renderedReport = renderFinalOutputToMarkdown(level1a3Output, primaryTicker, outputMode);
      const renderedDiscussion = renderDiscussionToMarkdown(level1a3Output.discussion);
      finalReply = renderedReport + renderedDiscussion;
      await updateMessageContent(streamMsgId, finalReply);
      emitTaskChunk(taskId, streamMsgId, finalReply);
    } else if (userConfig?.openaiApiKey) {
      // ── Legacy Path: streaming with OpenAI key (quick mode or general/event tasks) ──
      try {
        let accumulated = "";
        let lastDbUpdate = Date.now();
        const stream = callOpenAIStream({
          apiKey: userConfig.openaiApiKey,
          model: userConfig.openaiModel || DEFAULT_MODEL,
          messages: [
            { role: "system", content: gptSystemPrompt },
            { role: "user", content: gptUserMessage },
          ],
        });
        for await (const chunk of stream) {
          accumulated += chunk;
          if (Date.now() - lastDbUpdate > 300) {
            await updateMessageContent(streamMsgId, accumulated);
            emitTaskChunk(taskId, streamMsgId, accumulated);
            lastDbUpdate = Date.now();
          }
        }
        await updateMessageContent(streamMsgId, accumulated);
        emitTaskChunk(taskId, streamMsgId, accumulated);
        finalReply = accumulated;
      } catch (gptErr) {
        const fb = await invokeLLMWithRetry({
          messages: [
            { role: "system", content: gptSystemPrompt },
            { role: "user", content: gptUserMessage },
          ],
        });
        finalReply = String(fb.choices?.[0]?.message?.content || manusReport);
        await updateMessageContent(streamMsgId, finalReply);
      }
    } else {
      // ── Legacy Path: invokeLLM (no OpenAI key) ──
      const fb = await invokeLLM({
        messages: [
          { role: "system", content: gptSystemPrompt },
          { role: "user", content: gptUserMessage },
        ],
      });
      finalReply = String(fb.choices?.[0]?.message?.content || manusReport);
      await updateMessageContent(streamMsgId, finalReply);
    }

    // -- FOLLOWUP 兄底：如果 GPT 未输出追问标记，根据 outputMode 动态生成 ---
    if (!finalReply.includes("%%FOLLOWUP%%")) {
      const shortTask = taskDescription.slice(0, 60);
      if (outputMode === "framework_only") {
        // 证据不足：引导补充证据
        finalReply += `\n\n%%FOLLOWUP%%对于「${shortTask}」，建议优先获取哪些关键数据？%%END%%\n%%FOLLOWUP%%当前证据不足，应如何设计下一步验证计划？%%END%%`;
      } else if (taskType === "general" || taskType === "event_driven") {
        // 聊天型：只给 1 个自然追问
        finalReply += `\n\n%%FOLLOWUP%%对于「${shortTask}」，你最关注哪个方向？%%END%%`;
      } else {
        // 深度分析：给出研究延伸问题
        finalReply += `\n\n%%FOLLOWUP%%对于「${shortTask}」，能否进一步分析其竞争优势和论证边界？%%END%%\n%%FOLLOWUP%%如果宏观环境发生变化，该判断的失效条件是什么？%%END%%\n%%FOLLOWUP%%当前所处行业周期对该判断有什么影响？%%END%%`;
      }
      await updateMessageContent(streamMsgId, finalReply);
    }
    // -- 标记消息为 final，更新任务状态 -----------------------------------------
    const msgId = streamMsgId;
    // 将数据来源列表写入消息 metadata，供前端归因展示
    const metadataToSave: Record<string, unknown> = {};
    if (tavilySources.length > 0) metadataToSave.dataSources = tavilySources;
    if (apiSources.length > 0) metadataToSave.apiSources = apiSources;
    // 将 citationSummary 命中条目写入 metadata，供前端展示完整引用卡片
    const citationHits = citationSummary.citations.filter(c => c.hit);
    if (citationHits.length > 0) {
      metadataToSave.citationHits = citationHits.map(c => ({
        id: c.sourceId,
        name: c.displayName,
        category: c.category,
        icon: c.icon,
        description: c.description,
        latencyMs: c.latencyMs,
        dataTimestamp: c.dataTimestamp,
        isWhitelisted: c.isWhitelisted,
      }));
    }
    // ── V2.1 OPTION_B: 解析 DELIVERABLE + DISCUSSION 结构化标记块 ──────────────
    // 在 finalReply 中提取 %%DELIVERABLE%% 和 %%DISCUSSION%% 块，写入 metadata
    // 严格 graceful degradation：parse 失败不 abort 任务
    const DELIVERABLE_RE = /%%DELIVERABLE%%([\s\S]*?)%%END_DELIVERABLE%%/;
    const DISCUSSION_RE = /%%DISCUSSION%%([\s\S]*?)%%END_DISCUSSION%%/;

    const deliverableMatch = finalReply.match(DELIVERABLE_RE);
    const discussionMatch = finalReply.match(DISCUSSION_RE);

    // 解析 DELIVERABLE
    if (deliverableMatch) {
      try {
        const parsed = JSON.parse(deliverableMatch[1].trim());
        // 验证 required keys
        const requiredKeys = ["verdict", "confidence", "bull_case", "reasoning", "bear_case", "risks", "next_steps"];
        const hasAllKeys = requiredKeys.every(k => k in parsed);
        if (hasAllKeys) {
          metadataToSave.answerObject = parsed;
          console.log("[V2.1] structured_parse_success: DELIVERABLE");
        } else {
          const missing = requiredKeys.filter(k => !(k in parsed));
          console.warn("[V2.1] structured_parse_failure: DELIVERABLE missing keys:", missing);
          metadataToSave.answerObject = null;
        }
      } catch (e) {
        console.warn("[V2.1] malformed_json_detected: DELIVERABLE", e instanceof Error ? e.message : e);
        metadataToSave.answerObject = null;
      }
    } else {
      console.warn("[V2.1] deliverable_missing: no %%DELIVERABLE%% block found");
      metadataToSave.answerObject = null;
    }

    // 解析 DISCUSSION
    if (discussionMatch) {
      try {
        const parsed = JSON.parse(discussionMatch[1].trim());
        const requiredKeys = ["key_uncertainty", "weakest_point", "alternative_view", "follow_up_questions", "exploration_paths"];
        const hasAllKeys = requiredKeys.every(k => k in parsed);
        if (hasAllKeys) {
          metadataToSave.discussionObject = parsed;
          console.log("[V2.1] structured_parse_success: DISCUSSION");
        } else {
          const missing = requiredKeys.filter(k => !(k in parsed));
          console.warn("[V2.1] structured_parse_failure: DISCUSSION missing keys:", missing);
          metadataToSave.discussionObject = null;
        }
      } catch (e) {
        console.warn("[V2.1] malformed_json_detected: DISCUSSION", e instanceof Error ? e.message : e);
        metadataToSave.discussionObject = null;
      }
    } else {
      console.warn("[V2.1] discussion_missing: no %%DISCUSSION%% block found");
      metadataToSave.discussionObject = null;
    }

    // 从 finalReply 中剥离 marker 块（visible reply 不含标记）
    finalReply = finalReply
      .replace(/%%DELIVERABLE%%[\s\S]*?%%END_DELIVERABLE%%/g, "")
      .replace(/%%DISCUSSION%%[\s\S]*?%%END_DISCUSSION%%/g, "")
      .trimEnd();

    // ── LEVEL1A2 Phase6: Structured Discussion Controller ──────────────────
    // Extract step3 follow_up_questions and exploration_paths from parsed DISCUSSION
    const step3FollowUps: string[] = (metadataToSave.discussionObject as any)?.follow_up_questions ?? [];
    const step3ExplorationPaths: string[] = (metadataToSave.discussionObject as any)?.exploration_paths ?? [];
    // LEVEL1A2: Build structured discussion as first-class output
    const structuredDiscussion = buildStructuredDiscussion(
      normalizedTaxonomy,
      structuredSynthesis,
      intentCtx,
      primaryTicker,
    );
    // LEVEL1A: Legacy discussion hook set (kept for backward compat)
    const discussionHookSet = buildDiscussionHookSet(
      intentCtx,
      researchPlan,
      multiAgentResult ?? undefined,
      step3FollowUps.length > 0 ? step3FollowUps : structuredDiscussion.follow_up_questions,
      step3ExplorationPaths.length > 0 ? step3ExplorationPaths : structuredDiscussion.exploration_paths,
    );
    // Append Discussion section to finalReply
    if (intentCtx.task_type !== "general" && intentCtx.interaction_mode !== "discussion") {
      if (shouldUseStructuredDiscussion(intentCtx)) {
        // LEVEL1A2: Use structured discussion (first-class output)
        const structuredSection = formatStructuredDiscussionForReport(structuredDiscussion);
        if (structuredSection) finalReply = finalReply + "\n\n" + structuredSection;
      } else {
        // Legacy fallback
        const hooksSection = formatDiscussionHookSetForReport(discussionHookSet);
        finalReply = finalReply + "\n\n" + hooksSection;
      }
    }
    // Save both structured discussion and legacy hook set to metadata
    metadataToSave.structuredDiscussion = structuredDiscussion;
    metadataToSave.discussionHookSet = discussionHookSet;
    // ── LEVEL1A3 Phase4: Discussion as First-Class Output ──
    // If JSON-only mode was used, save the full structured output to metadata
    if (level1a3Output !== null) {
      metadataToSave.level1a3Output = level1a3Output;
      // Override structuredDiscussion with level1a3Output.discussion (authoritative)
      metadataToSave.structuredDiscussion = level1a3Output.discussion;
    }
    metadataToSave.useJsonOnlyMode = useJsonOnlyMode;
    metadataToSave.intentContext = {
      task_type: intentCtx.task_type,
      interaction_mode: intentCtx.interaction_mode,
      risk_focus: intentCtx.risk_focus,
      growth_focus: intentCtx.growth_focus,
      entity_scope: intentCtx.entity_scope,
    };
    // ── LEVEL1A END Discussion ────────────────────────────────────────────────────────────
    // 证据强度和输出模式信息保留（见下方）
    // 将 evidenceScore 和 outputMode 写入 metadata（供前端展示证据强度指示）
    metadataToSave.evidenceScore = evidencePacket.evidenceScore;
    metadataToSave.outputMode = evidencePacket.outputMode;
    if (missingBlocking.length > 0) metadataToSave.missingBlocking = missingBlocking;
    if (missingImportant.length > 0) metadataToSave.missingImportant = missingImportant;
    if (missingOptional.length > 0) metadataToSave.missingOptional = missingOptional;
    // 将资源预算摘要写入 metadata
    metadataToSave.resourceBudget = budget.getSummary().utilization;
    // ── LEVEL3A: Memory signal metadata ──────────────────────────────────────────────────────
    if (memoryUsed) {
      metadataToSave.memoryUsed = true;
      metadataToSave.memoryTicker = memoryTicker;
      metadataToSave.memoryRecordCreatedAt = memoryRecordCreatedAt;
      metadataToSave.memorySummary = memorySummary;
    }
    // ── LEVEL3A END ─────────────────────────────────────────────────────────────────
    // ── LEVEL3B: Memory reasoning signal metadata (pre-loop, for frontend) ───────────
    // Note: memoryConflictForEngine is built inside the LEVEL2 block (after level1a3Output).
    // We write a placeholder here; the convergedMetadata update will carry the final values.
    if (memorySeedForEngine?.memory_found) {
      metadataToSave.memorySeedUsed = true;
      metadataToSave.memoryInfluenceSummary = memorySeedForEngine.prior_verdict
        ? `上次分析：${memorySeedForEngine.prior_verdict} (置信度: ${memorySeedForEngine.prior_confidence})`
        : "";
    }
    // ── LEVEL3B END ─────────────────────────────────────────────────────────────────
    // ── LEVEL4: Auto-trigger Action Engine (non-LEVEL2 path) ─────────────────────────
    if (primaryTicker) {
      try {
        const { extractLevel4Input, runLevel4ActionEngine } = await import("./level4ActionEngine");
        const level4Input = extractLevel4Input(primaryTicker, metadataToSave as Record<string, unknown>);
        // Inject real numeric technical data for Timing Engine
        try {
          const indData = await getLocalTechnicalIndicators(primaryTicker);
          if (indData) {
            const rsi14 = indData.rsi14?.[0] ?? null;
            const macdLine = indData.macdLine?.[0] ?? null;
            const macdSignalLine = indData.macdSignal?.[0] ?? null;
            const ohlcvData = await getOHLCVForChart(primaryTicker).catch(() => null);
            const volumes = ohlcvData?.ohlcv?.volumes ?? [];
            const latestVol = volumes[0] ?? null;
            const avgVol20 = volumes.length >= 20
              ? volumes.slice(0, 20).reduce((a: number, b: number) => a + b, 0) / 20
              : (volumes.length > 0 ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length : null);
            level4Input.realTechnicalData = {
              rsi14,
              macdLine,
              macdSignalLine,
              macdHistogram: macdLine != null && macdSignalLine != null ? macdLine - macdSignalLine : null,
              ema20: indData.ema20?.[0] ?? null,
              ema50: indData.ema50?.[0] ?? null,
              sma200: indData.sma200?.[0] ?? null,
              currentPrice: indData.priceData?.current ?? null,
              bbUpper: indData.bbUpper?.[0] ?? null,
              bbMiddle: indData.bbMiddle?.[0] ?? null,
              bbLower: indData.bbLower?.[0] ?? null,
              latestVolume: latestVol,
              avgVolume20: avgVol20,
              volumeRatio: latestVol != null && avgVol20 != null && avgVol20 > 0 ? latestVol / avgVol20 : null,
            };
          }
        } catch { /* non-fatal: timing engine uses fallback */ }
        const level4Result = await runLevel4ActionEngine(level4Input);
        metadataToSave.level4Result = level4Result;
        metadataToSave.level4GeneratedAt = Date.now();
      } catch (_l4err) {
        // Level4 failure must NOT break main analysis
      }
    }
    // ── LEVEL4 END ───────────────────────────────────────────────────────────────────
    if (Object.keys(metadataToSave).length > 0) {
      await updateMessageContent(streamMsgId, finalReply, metadataToSave);
    }

    // ── LEVEL2: Reasoning Loop ───────────────────────────────────────────
    // Only run in standard/deep mode with JSON-only output and sufficient evidence
    let convergedOutput: ConvergedOutput | null = null;
    if (useJsonOnlyMode && level1a3Output !== null && (analysisMode as string) !== "quick") {
      try {
        // ── LEVEL3B: Build MemoryConflict now that level1a3Output is available ──────────
        if (memorySeedForEngine?.memory_found) {
          try {
            memoryConflictForEngine = detectMemoryConflict({
              priorVerdict: memorySeedForEngine.prior_verdict,
              currentVerdict: level1a3Output.verdict ?? "",
              priorConfidence: memorySeedForEngine.prior_confidence,
              currentConfidence: level1a3Output.confidence ?? "unknown",
              priorBullCase: undefined,
              currentBearCase: level1a3Output.bear_case?.[0] ?? "",
              priorBearCase: undefined,
              currentBullCase: level1a3Output.bull_case?.[0] ?? "",
            });
            if (memoryConflictForEngine.has_conflict) {
              console.log(`[LEVEL3B] Memory conflict detected: ${memoryConflictForEngine.conflict_type} — ${memoryConflictForEngine.summary}`);
            }
          } catch (conflictErr) {
            console.warn("[LEVEL3B] MemoryConflict detection failed (non-fatal):", conflictErr);
          }
        }
        // ── LEVEL3B END ─────────────────────────────────────────────────────────────────

        const triggerDecision = evaluateTrigger({
          loopState: initLoopState(),
          intentCtx,
          analysisMode: analysisMode as string,
          evidenceScore: evidencePacket.evidenceScore,
          level1a3Output,
          structuredSynthesis,
          memorySeed: memorySeedForEngine,
          memoryConflict: memoryConflictForEngine,
        });

         if (triggerDecision.should_trigger) {
          // Initialize loop state
          let loopState: LoopState = initLoopState();
          // ── LEVEL2B: Multi-Hypothesis Selection ──────────────────────────────────────────────
          const hypothesisResult = runHypothesisEngine({
            level1a3Output,
            structuredDiscussion,
            triggerDecision,
            intentCtx,
            budgetRemaining: loopState.budget_max - loopState.budget_used,
            memorySeed: memorySeedForEngine,
            memoryConflict: memoryConflictForEngine,
          });
          // Generate follow-up task (hypothesis-driven or legacy fallback)
          const followUpTask = generateFollowUpTask({
            triggerDecision,
            intentCtx,
            level1a3Output,
            structuredSynthesis,
            primaryTicker,
            originalTaskDescription: hypothesisResult.selected
              ? `[HYPOTHESIS: ${hypothesisResult.selected.statement.slice(0, 120)}] ${taskDescription}`
              : taskDescription,
            evidenceScore: evidencePacket.evidenceScore,
          });

          // Execute second pass
          const secondPassResult = await executeSecondPass({
            followUpTask,
            level1a3Output,
            loopState,
            dataContext: dataPacketSummary,
          });

          // Advance loop state
          loopState = advanceLoopState(loopState, triggerDecision, secondPassResult.llm_calls_used);

          if (secondPassResult.success && secondPassResult.parsed_output) {
            // Compute evidence delta
            const evidenceDelta = computeEvidenceDelta({
              level1Output: level1a3Output,
              secondPassOutput: secondPassResult.parsed_output,
              evidenceScoreBefore: evidencePacket.evidenceScore / 100,
            });

            // Update verdict
            const updatedVerdict = updateVerdict({
              level1Output: level1a3Output,
              secondPassOutput: secondPassResult.parsed_output,
              evidenceDelta,
            });

            // Evaluate stop condition
            const stopDecision = evaluateStopCondition({
              loopState,
              evidenceDelta,
              updatedVerdict,
              secondPassSucceeded: true,
            });

            // Build converged output
            convergedOutput = buildConvergedOutput({
              level1Output: level1a3Output,
              loopRan: true,
              loopState,
              evidenceDelta,
              updatedVerdict,
              stopDecision,
            });

            // Update message with converged output
            const convergedMetadata = {
              ...metadataToSave,
              level1a3Output: convergedOutput.final_schema,
              level2LoopMetadata: convergedOutput.loop_metadata,
              // ── LEVEL3B: Memory reasoning signals (final, with conflict data) ──────────
              memorySeedUsed: !!memorySeedForEngine?.memory_found,
              memoryConflict: memoryConflictForEngine ?? null,
              memoryInfluencedTrigger: triggerDecision.memory_influenced,
              memoryInfluenceSummary: triggerDecision.memory_influence_summary ||
                (memorySeedForEngine?.memory_found
                  ? `上次分析：${memorySeedForEngine.prior_verdict} (置信度: ${memorySeedForEngine.prior_confidence})`
                  : ""),
              // ── LEVEL3B END ───────────────────────────────────────────────────────────────────────────────────────
              // ── LEVEL1B: Source Selection Signal ───────────────────────────────────────────────────────────────────────────────────────
              sourceSelectionSummary: level1bSelectionResult.selected_sources.map(s => `${s.source_name}(${s.score.toFixed(2)})`).join(", "),
              sourceValidationNote: level1bSelectionResult.validation.note,
              sourceConfidenceAdjustment: level1bSelectionResult.validation.confidence_adjustment,
              // ── LEVEL1B END ─────────────────────────────────────────────────────────────────────────────────────────────────
              // ── LEVEL1C: Post-Fetch Evidence Signal ─────────────────────────────────────────────────────────────────────────────────────────────────
              evidenceStrengthScore: level1cResult.strength_report.evidence_score,
              evidenceConflictCount: level1cResult.conflict_bundle.conflict_count,
              evidenceGatingMode: level1cGating.allowed_output_mode,
              evidenceConflictFields: level1cResult.conflict_bundle.major_conflicts.map((c: import('./postFetchEvidenceEngine').ConflictEntry) => c.field_name).join(", ") || undefined,
              // ── LEVEL1C END ─────────────────────────────────────────────────────────────────────────────────────────────────
            };
            // Append loop summary to finalReply if verdict changed
            let convergedReply = finalReply;
            if (convergedOutput.loop_metadata.verdict_changed && convergedOutput.loop_metadata.loop_summary) {
              convergedReply = finalReply + "\n\n---\n" + convergedOutput.loop_metadata.loop_summary;
            }

            // ── LEVEL4: Auto-trigger Action Engine (LEVEL2 converged path) ───────────────
            if (primaryTicker) {
              try {
                const { extractLevel4Input, runLevel4ActionEngine } = await import("./level4ActionEngine");
                const level4Input = extractLevel4Input(primaryTicker, convergedMetadata as Record<string, unknown>);
                // Inject real numeric technical data for Timing Engine
                try {
                  const indData = await getLocalTechnicalIndicators(primaryTicker);
                  if (indData) {
                    const rsi14 = indData.rsi14?.[0] ?? null;
                    const macdLine = indData.macdLine?.[0] ?? null;
                    const macdSignalLine = indData.macdSignal?.[0] ?? null;
                    const ohlcvData = await getOHLCVForChart(primaryTicker).catch(() => null);
            const volumes = ohlcvData?.ohlcv?.volumes ?? [];
                    const latestVol = volumes[0] ?? null;
                    const avgVol20 = volumes.length >= 20
                      ? volumes.slice(0, 20).reduce((a: number, b: number) => a + b, 0) / 20
                      : (volumes.length > 0 ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length : null);
                    level4Input.realTechnicalData = {
                      rsi14,
                      macdLine,
                      macdSignalLine,
                      macdHistogram: macdLine != null && macdSignalLine != null ? macdLine - macdSignalLine : null,
                      ema20: indData.ema20?.[0] ?? null,
                      ema50: indData.ema50?.[0] ?? null,
                      sma200: indData.sma200?.[0] ?? null,
                      currentPrice: indData.priceData?.current ?? null,
                      bbUpper: indData.bbUpper?.[0] ?? null,
                      bbMiddle: indData.bbMiddle?.[0] ?? null,
                      bbLower: indData.bbLower?.[0] ?? null,
                      latestVolume: latestVol,
                      avgVolume20: avgVol20,
                      volumeRatio: latestVol != null && avgVol20 != null && avgVol20 > 0 ? latestVol / avgVol20 : null,
                    };
                  }
                } catch { /* non-fatal: timing engine uses fallback */ }
                const level4Result = await runLevel4ActionEngine(level4Input);
                (convergedMetadata as Record<string, unknown>).level4Result = level4Result;
                (convergedMetadata as Record<string, unknown>).level4GeneratedAt = Date.now();
              } catch (_l4err) {
                // Level4 failure must NOT break main analysis
              }
            }
            // ── LEVEL4 END ─────────────────────────────────────────────────────────────────
            await updateMessageContent(streamMsgId, convergedReply, convergedMetadata);

            // ── LEVEL2C: Write telemetry (non-fatal) ─────────────────────────────────────────────────
            await writeLoopTelemetry({
              taskId,
              userId,
              primaryTicker,
              triggerDecision,
              loopState,
              hypothesisCandidates: hypothesisResult.selection.candidates,
              selectedHypothesis: hypothesisResult.selected ?? null,
              secondPassSuccess: secondPassResult.success,
              evidenceDelta,
              verdictChanged: convergedOutput.loop_metadata.verdict_changed,
              outputMode: analysisMode as string,
              loopDurationMs: 0,
            });
          }
        }
      } catch (loopErr) {
        // LEVEL2 loop failure is non-fatal — Level1 output already saved
        console.error("[LEVEL2] Reasoning loop error (non-fatal):", loopErr);
      }
    }
    // ── LEVEL2 END ──────────────────────────────────────────────────────────────────────────

    await updateTaskStatus(taskId, "completed", { gptSummary: finalReply });
    emitTaskDone(taskId, msgId, finalReply); // SSE 完成推送
    removeBudgetTracker(String(taskId)); // 清理预算跟踪器

    // ── LEVEL3A: Write analysis memory (non-fatal, zero LLM calls) ────────────────────
    if (level1a3Output && primaryTicker) {
      const memFields = extractMemoryFromOutput(level1a3Output, outputMode);
      await writeAnalysisMemory({
        userId,
        taskId,
        ticker: primaryTicker,
        taskType: resolvedTaskType,
        verdict: memFields.verdict,
        confidenceLevel: memFields.confidenceLevel,
        evidenceScore: evidencePacket?.evidenceScore ?? 50,
        bullCaseSummary: memFields.bullCaseSummary,
        bearCaseSummary: memFields.bearCaseSummary,
        keyUncertainty: memFields.keyUncertainty,
        openHypotheses: memFields.openHypotheses,
        outputMode,
        loopRan: !!convergedOutput?.loop_metadata?.loop_ran,
      });
    }
    // ── LEVEL3A END ─────────────────────────────────────────────────────────────────

    // -- 自动生成任务摘要保存到长期记忆 ---------------------------------------
    try {
      const summaryResponse = await invokeLLMWithRetry({
        messages: [
          {
            role: "system",
            content: "请用2-3句话简洁总结以下任务的核心结论，供后续任务参考。输出纯文本，不要标题或列表。",
          },
          {
            role: "user",
            content: `任务：${taskDescription.slice(0, 200)}\n\n最终回复摘要：${finalReply.slice(0, 500)}`,
          },
        ],
      });
      const summary = String(summaryResponse.choices?.[0]?.message?.content || "");
      if (summary) {
        // ── LLM 自动分类 memoryType ──────────────────────────────────────────
        let memoryType: "preference" | "workflow" | "watchlist" | "analysis" = "analysis";
        try {
          const classifyResp = await invokeLLMWithRetry({
            messages: [
              {
                role: "system",
                content: `你是一个专业的金融记忆分类助手，专注于 A 股、港股、美股投资场景。根据任务描述和摘要，将记忆分类为以下四种类型之一：

- preference：用户的投资偏好、风险偏好、交易风格、关注市场等个人倾向
  示例：「我喜欢价值投资」「偏好低估值蓝筹股」「不做短线」「关注 A 股消费板块」「风险承受能力中等」「段永平投资理念认同者」

- workflow：用户常用的分析流程、操作步骤、工作方法、使用习惯
  示例：「每次分析先看 PE/PB」「用 DCF 估值」「先看宏观再选行业再选股」「每周一复盘」「用 MACD+RSI 判断入场时机」

- watchlist：用户关注的股票代码、公司名称、行业板块、资产类别
  示例：「关注茅台/平安/腾讯」「600519 贵州茅台」「00700 腾讯控股」「新能源板块」「半导体行业」「黄金 ETF」「比特币」

- analysis：具体的分析结论、市场判断、研究发现、数据解读
  示例：「茅台当前 PE 偏高」「美联储降息利好 A 股」「中芯国际技术面突破」「Q3 财报超预期」「港股恒生指数超跌反弹」

只输出一个单词：preference、workflow、watchlist 或 analysis。不要有任何其他内容。`,
              },
              {
                role: "user",
                content: `任务：${taskDescription.slice(0, 150)}\n摘要：${summary.slice(0, 200)}`,
              },
            ],
          });
          const classified = String(classifyResp.choices?.[0]?.message?.content || "").trim().toLowerCase();
          if (["preference", "workflow", "watchlist", "analysis"].includes(classified)) {
            memoryType = classified as typeof memoryType;
          }
        } catch {
          // classification failure is non-critical, default to "analysis"
        }
        // ── 提取关键词（股票代码 + A股代码 + 任务描述前80字）────────────────
        const keywords = (() => {
          const enTickers = taskDescription.match(/\b[A-Z]{1,5}(?:\.[A-Z]{1,2})?\b/g) || [];
          const cnTickers = taskDescription.match(/\b[036]\d{5}\b/g) || [];
          const hkTickers = taskDescription.match(/\b\d{5}\b/g) || [];
          const allTickers = Array.from(new Set([...enTickers, ...cnTickers, ...hkTickers])).join(" ");
          return (allTickers + " " + taskDescription.slice(0, 80)).trim().slice(0, 200);
        })();
        // ── LLM 自动评估重要性分数（1-5）──────────────────────────────────
        let importance = 3; // 默认重要性
        try {
          const importanceResp = await invokeLLMWithRetry({
            messages: [
              {
                role: "system",
                content: `你是一个金融记忆重要性评估助手。根据任务描述和摘要，评估该记忆对用户未来投资决策的长期价值：
1 = 一般信息：短期市场动态、日常查询，不影响长期决策
2 = 有用：行业动态、财报数据，短期参考价值中等
3 = 重要：股票分析结论、市场判断，对投资决策有直接影响
4 = 很重要：用户投资偏好、核心持仓分析、重要宏观判断
5 = 核心记忆：投资理念、长期持仓逻辑、个人投资原则确认

只输出一个数字（1、2、3、4 或 5）。不要有任何其他内容。`,
              },
              {
                role: "user",
                content: `类型：${memoryType}\n任务：${taskDescription.slice(0, 150)}\n摘要：${summary.slice(0, 200)}`,
              },
            ],
          });
          const impStr = String(importanceResp.choices?.[0]?.message?.content || "").trim();
          const impNum = parseInt(impStr, 10);
          if (!isNaN(impNum) && impNum >= 1 && impNum <= 5) {
            importance = impNum;
          }
        } catch {
          // importance scoring failure is non-critical, default to 3
        }
        await saveMemoryContext({
          userId,
          taskId,
          conversationId: conversationId ?? undefined,
          taskTitle: taskDescription.slice(0, 100),
          summary,
          keywords,
          memoryType,
          importance,
          agentSignals: savedAgentSignalsJson,
        });
      }
    } catch {
      // memory save failure is non-critical, silently skip
    }

    // -- 异步 LLM 生成精简对话框标题（3-5 字，类似 ChatGPT 风格）-----------
    if (conversationId) {
      (async () => {
        try {
          const titleResp = await invokeLLMWithRetry({
            messages: [
              { role: "system", content: "你是一个标题生成助手。根据用户的问题，生成一个3-5个汉字的精简标题，直接输出标题文字，不要任何标点、引号或解释。" },
              { role: "user", content: taskDescription.slice(0, 150) },
            ],
          });
          const newTitle = String(titleResp.choices?.[0]?.message?.content || "").trim().slice(0, 20);
          if (newTitle && newTitle.length >= 2) {
            await updateConversationTitle(conversationId!, newTitle);
          }
        } catch {
          // title generation is non-critical, silently skip
        }
      })();
    }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await updateTaskStatus(taskId, "failed");
    emitTaskError(taskId, errMsg); // SSE 错误推送
    removeBudgetTracker(String(taskId)); // 清理预算跟踪器
    await insertMessage({
      taskId,
      userId,
      conversationId,
      role: "system",
      content: `处理任务时发生错误：${errMsg}`,
      metadata: { error: errMsg },
    });
  }
}

// --- tRPC Routers -------------------------------------------------------------

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // --- 访问控制 -------------------------------------------------------------
  access: router({
    check: protectedProcedure.query(async ({ ctx }) => {
      const isOwner = ctx.user.openId === ENV.ownerOpenId;
      if (isOwner) return { hasAccess: true, isOwner: true };
      const access = await getUserAccess(ctx.user.id);
      return { hasAccess: !!access, isOwner: false };
    }),

    verify: protectedProcedure
      .input(z.object({ code: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        const record = await verifyAccessCode(input.code);
        if (!record) throw new TRPCError({ code: "FORBIDDEN", message: "密码无效或已过期" });
        await grantUserAccess(ctx.user.id, record.id);
        await incrementCodeUsage(record.id);
        return { success: true };
      }),

    generateCode: ownerProcedure
      .input(z.object({
        label: z.string().max(128).optional(),
        maxUses: z.number().min(-1).default(1),
        expiresInDays: z.number().min(1).optional(),
      }))
      .mutation(async ({ input }) => {
        const code = nanoid(12);
        const expiresAt = input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 86400000)
          : undefined;
        await createAccessCode({ code, label: input.label, maxUses: input.maxUses, expiresAt });
        return { code };
      }),

    listCodes: ownerProcedure.query(async () => listAccessCodes()),

    revokeCode: ownerProcedure
      .input(z.object({ codeId: z.number() }))
      .mutation(async ({ input }) => {
        await revokeAccessCode(input.codeId);
        return { success: true };
      }),

    revokeUser: ownerProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        await revokeUserAccess(input.userId);
        return { success: true };
      }),
  }),

  // --- 会话管理 -------------------------------------------------------------
  conversation: router({
    // 创建新会话（点击「新任务」时调用）
    create: protectedProcedure.mutation(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      const convId = await createConversation({ userId: ctx.user.id });
      return { conversationId: convId };
    }),

    // 获取所有会话列表
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      return getConversationsByUser(ctx.user.id);
    }),

    // 获取某会话的消息
    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        return getMessagesByConversation(input.conversationId);
      }),

    // 获取某会话的附件
    getAttachments: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        return getAttachmentsByConversation(input.conversationId);
      }),

    // 置顶/取消置顶会话
    pin: protectedProcedure
      .input(z.object({ conversationId: z.number(), pinned: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await setConversationPinned(input.conversationId, ctx.user.id, input.pinned);
        return { success: true };
      }),

    // 收藏/取消收藏会话
    favorite: protectedProcedure
      .input(z.object({ conversationId: z.number(), favorited: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await setConversationFavorited(input.conversationId, ctx.user.id, input.favorited);
        return { success: true };
      }),

    // 删除会话及其所有消息
    delete: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await deleteConversationAndMessages(input.conversationId, ctx.user.id);
        return { success: true };
      }),

    // 重命名会话标题
    rename: protectedProcedure
      .input(z.object({ conversationId: z.number(), title: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await updateConversationTitle(input.conversationId, input.title.trim().slice(0, 100));
        return { success: true };
      }),
  }),

  // --- 文件上传 -------------------------------------------------------------
  file: router({
    // 上传文件到 S3，提取内容，返回附件ID
    upload: protectedProcedure
      .input(z.object({
        filename: z.string().max(512),
        mimeType: z.string().max(128),
        size: z.number().max(50 * 1024 * 1024), // 最大50MB
        base64Data: z.string(),                  // base64编码的文件内容
        conversationId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);

        // 解码 base64
        const buffer = Buffer.from(input.base64Data, "base64");
        const fileCategory = getFileCategory(input.mimeType);

        // 生成唯一 S3 key
        const ext = input.filename.split(".").pop() || "bin";
        const s3Key = `attachments/${ctx.user.id}/${nanoid(16)}.${ext}`;

        // 上传到 S3
        const { url: s3Url } = await storagePut(s3Key, buffer, input.mimeType);

        // 提取文件内容（异步，不阻塞响应）
        let extractedText: string | null = null;
        try {
          extractedText = await extractFileContent(buffer, input.mimeType, input.filename, s3Url);
        } catch (e) {
          console.warn("[FileUpload] Content extraction failed:", e);
        }

        // 保存附件元数据到数据库
        const attachmentId = await insertAttachment({
          userId: ctx.user.id,
          conversationId: input.conversationId,
          filename: input.filename,
          mimeType: input.mimeType,
          size: input.size,
          s3Key,
          s3Url,
          extractedText,
          fileCategory,
        });

        return {
          attachmentId,
          filename: input.filename,
          mimeType: input.mimeType,
          size: input.size,
          s3Url,
          fileCategory,
          extractedText: extractedText ? extractedText.slice(0, 200) + "..." : null,
        };
      }),
  }),

  // --- 聊天 & 任务 ----------------------------------------------------------
  chat: router({
    // 全部历史消息（跨会话，按用户过滤）
    getAllMessages: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      return getAllMessagesByUser(ctx.user.id);
    }),

    getMessages: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const msgs = await getMessages(input.limit);
        return msgs.reverse();
      }),

    getTaskMessages: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        return getMessagesByTask(input.taskId);
      }),

    // 按会话ID获取消息（独立对话框隔离）
    getConversationMessages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        return getMessagesByConversation(input.conversationId);
      }),

    // 获取用户的所有会话列表
    listConversations: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      return getConversationsByUser(ctx.user.id);
    }),

    // 搜索会话（按标题或消息内容）
    searchConversations: protectedProcedure
      .input(z.object({ keyword: z.string().min(1).max(100) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        return searchConversations(ctx.user.id, input.keyword);
      }),

    // 获取用户所有分组（含分组内的会话）
    listGroups: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      const groups = await getConversationGroupsByUser(ctx.user.id);
      const convs = await getConversationsByUser(ctx.user.id);
      return groups.map(g => ({
        ...g,
        conversations: convs.filter(c => c.groupId === g.id),
      }));
    }),

    // 创建新分组
    createGroup: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(64), color: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const id = await createConversationGroup({
          userId: ctx.user.id,
          name: input.name,
          color: input.color ?? "blue",
        });
        return { id };
      }),

    // 删除分组（会话不删除，只解绑）
    deleteGroup: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await deleteConversationGroup(input.groupId, ctx.user.id);
        return { success: true };
      }),

    // 重命名分组
    renameGroup: protectedProcedure
      .input(z.object({ groupId: z.number(), name: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await renameConversationGroup(input.groupId, ctx.user.id, input.name);
        return { success: true };
      }),

    // 将会话移入/移出分组
    moveToGroup: protectedProcedure
      .input(z.object({ conversationId: z.number(), groupId: z.number().nullable() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await setConversationGroup(input.conversationId, ctx.user.id, input.groupId);
        return { success: true };
      }),

    // 折叠/展开分组
    toggleGroupCollapse: protectedProcedure
      .input(z.object({ groupId: z.number(), isCollapsed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await setGroupCollapsed(input.groupId, ctx.user.id, input.isCollapsed);
        return { success: true };
      }),

    // 创建新会话（点击「新任务」时调用）
    createConversation: protectedProcedure
      .input(z.object({ title: z.string().optional(), groupId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const id = await createConversation({ userId: ctx.user.id, title: input.title });
        return { id };
      }),

    // 提交任务（支持会话ID和附件）
    submitTask: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        conversationId: z.number().optional(),
        attachmentIds: z.array(z.number()).optional(), // 已上传的附件ID列表
        analysisMode: z.enum(["quick", "standard", "deep"]).default("standard"),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const userId = ctx.user.id;
        const description = input.description || input.title;

        // 确定会话ID：如果没有传入，创建新会话
        let conversationId = input.conversationId;
        if (!conversationId) {
          conversationId = await createConversation({ userId, title: input.title.slice(0, 55) });
        } else {
          // 如果是该会话的第一条消息，更新会话标题
          const existing = await getMessagesByConversation(conversationId);
          if (existing.length === 0) {
            await updateConversationTitle(conversationId, input.title.slice(0, 55));
          }
        }

        // 写入用户消息（附件信息暂存，待附件查询后更新 metadata）
        const userMsgId = await insertMessage({
          userId,
          conversationId,
          role: "user",
          content: input.title,
        });

        // 创建任务记录
        const result = await createTask({
          userId,
          conversationId,
          title: input.title,
          description,
          status: "pending",
          analysisMode: input.analysisMode,
        });
        const taskId = (result as any)[0]?.insertId as number;
        if (!taskId) throw new Error("Failed to create task");

        // 收集附件内容作为上下文
        let attachmentContext: string | undefined;
        let attachmentInfoList: Array<{ filename: string; mimeType: string; size: number; s3Url: string }> = [];
        if (input.attachmentIds && input.attachmentIds.length > 0) {
          const attachmentTexts: string[] = [];
          for (const attId of input.attachmentIds) {
            const att = await getAttachmentById(attId);
            if (att) {
              attachmentInfoList.push({ filename: att.filename, mimeType: att.mimeType, size: att.size, s3Url: att.s3Url });
              if (att.extractedText) attachmentTexts.push(att.extractedText);
            }
          }
          if (attachmentTexts.length > 0) {
            attachmentContext = attachmentTexts.join("\n\n---\n\n");
          }
        }

        // 将附件信息写入用户消息 metadata（供前端显示附件卡片）
        if (attachmentInfoList.length > 0) {
          await updateMessageContent(userMsgId, input.title, { attachments: attachmentInfoList });
        }
        // 异步执行四步协作流程
        runCollaborationFlow(taskId, userId, description, conversationId, attachmentContext, input.analysisMode)
          .catch((err) => {
            console.error('[runCollaborationFlow] FATAL ERROR:', err?.message || err);
            console.error('[runCollaborationFlow] Stack:', err?.stack);
          });

        return { taskId, conversationId, status: "started" };
      }),

    getTasks: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      return getTasksByUser(ctx.user.id);
    }),

    getTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        return getTaskById(input.taskId);
      }),

    pinTask: protectedProcedure
      .input(z.object({ taskId: z.number(), pinned: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await setPinned(input.taskId, ctx.user.id, input.pinned);
        return { success: true };
      }),

    favoriteTask: protectedProcedure
      .input(z.object({ taskId: z.number(), favorited: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await setFavorited(input.taskId, ctx.user.id, input.favorited);
        return { success: true };
      }),

    retryTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const userId = ctx.user.id;
        const task = await getTaskById(input.taskId);
        if (!task || task.userId !== userId) throw new Error("Task not found");
        if (task.status !== "failed") throw new Error("Only failed tasks can be retried");

        // 重置任务状态为pending，清空旧结果
        await updateTaskStatus(input.taskId, "pending", { manusResult: undefined, gptSummary: undefined });

        // 重新异步执行协作流程
        const description = task.description || task.title;
        const conversationId = task.conversationId ?? undefined;
        runCollaborationFlow(input.taskId, userId, description, conversationId)
          .catch((err) => {
            console.error('[retryTask] FATAL ERROR:', err?.message || err);
          });

        return { taskId: input.taskId, status: "started" };
      }),

    getMemory: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(20), conversationId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        return getRecentMemory(ctx.user.id, input.limit, input.conversationId);
      }),

    // Alpha 因子历史趋势查询（供前端 Sparkline 图表使用）
    getAlphaFactorHistory: protectedProcedure
      .input(z.object({ ticker: z.string().min(1).max(20), limit: z.number().min(1).max(10).default(5) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const history = await getAgentSignalHistory(ctx.user.id, input.ticker, input.limit);
        // 解析每条记录中的 alphaFactors 字段
        return history
          .map(h => {
            try {
              const signals = JSON.parse(h.agentSignals);
              if (!signals.alphaFactors) return null;
              return {
                analyzedAt: h.createdAt,
                compositeScore: signals.alphaFactors.compositeScore as number,
                overallSignal: signals.alphaFactors.overallSignal as string,
                factors: signals.alphaFactors.factors as Array<{ name: string; value: number; signal: string }>,
                optionSigma: typeof signals.optionSigma === "number" ? signals.optionSigma as number : null,
              };
            } catch { return null; }
          })
           .filter(Boolean)
          .reverse(); // 按时间正序排列（旧→新）
      }),

    // alphalens: 计算 Alpha 因子 IC 信息系数
    computeAlphaIC: protectedProcedure
      .input(z.object({
        factors: z.array(z.object({
          name: z.string(),
          history: z.array(z.object({
            date: z.string(),
            value: z.number(),
            forward_return: z.number(),
          })),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { computeAlphaIC } = await import("./alphalensApi.js");
        return computeAlphaIC(input.factors);
      }),

    // bidask: 估算买卖价差（流动性因子）
    estimateLiquidity: protectedProcedure
      .input(z.object({
        ticker: z.string().min(1).max(20),
        ohlc: z.array(z.object({
          date: z.string(),
          open: z.number(),
          high: z.number(),
          low: z.number(),
          close: z.number(),
        })).min(5),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { estimateLiquidity } = await import("./alphalensApi.js");
        return estimateLiquidity(input.ticker, input.ohlc);
      }),

    hestonPrice: protectedProcedure
      .input(z.object({
        S: z.number(),
        K: z.number(),
        T: z.number(),
        r: z.number(),
        sigma: z.number(),
        kappa: z.number().optional(),
        theta: z.number().optional(),
        xi: z.number().optional(),
        rho: z.number().optional(),
        option_type: z.enum(["call", "put"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { hestonPrice } = await import("./hestonApi.js");
        return hestonPrice(input);
      }),

    hestonChain: protectedProcedure
      .input(z.object({
        S: z.number(),
        T: z.number(),
        r: z.number(),
        sigma: z.number(),
        kappa: z.number().optional(),
        theta: z.number().optional(),
        xi: z.number().optional(),
        rho: z.number().optional(),
        strikes: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { hestonOptionChain } = await import("./hestonApi.js");
        return hestonOptionChain(
          input.S, input.T, input.r, input.sigma,
          input.kappa ?? 2.0,
          input.theta ?? input.sigma ** 2,
          input.xi ?? 0.3,
          input.rho ?? -0.7,
          input.strikes
        );
      }),

    analyzeNewsSentiment: protectedProcedure
      .input(z.object({
        ticker: z.string(),
        newsItems: z.array(z.object({
          title: z.string(),
          description: z.string().optional(),
          publishedAt: z.string(),
          source: z.string().optional(),
        })).max(20),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { analyzeNewsSentiment } = await import("./primoGptNlp.js");
        return analyzeNewsSentiment(input.ticker, input.newsItems);
      }),
    getNewsFeed: protectedProcedure
      .input(z.object({
        ticker: z.string(),
        maxArticles: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { searchNews } = await import("./newsApi.js");
        const { analyzeNewsSentiment } = await import("./primoGptNlp.js");
        const articles = await searchNews(input.ticker, input.maxArticles ?? 12);
        // PrimoGPT 情绪分析（最多分析 8 条，节约算力）
        let sentimentMap: Map<number, string> = new Map();
        let overallSentimentScore = 0;
        let overallSentimentLabel = "neutral";
        try {
          const newsForAnalysis = articles.slice(0, 8).map((a: import("./newsApi.js").NewsArticle) => ({
            title: a.title,
            description: a.description ?? undefined,
            publishedAt: a.publishedAt,
            source: a.source.name,
          }));
          const nlpResult = await analyzeNewsSentiment(input.ticker, newsForAnalysis);
          overallSentimentScore = Math.round(nlpResult.overallScore * 100);
          overallSentimentLabel = nlpResult.overallLabel;
          // 映射每条新闻的情绪
          nlpResult.features.forEach((feat, idx) => {
            const label = feat.label === "very_bullish" || feat.label === "bullish" ? "positive" :
                          feat.label === "very_bearish" || feat.label === "bearish" ? "negative" : "neutral";
            sentimentMap.set(idx, label);
          });
        } catch {
          // 情绪分析失败不影响新闻加载
        }
        // 写入当日情绪数据到数据库（upsert）
        const todayStr = new Date().toISOString().slice(0, 10);
        const positiveCount = Array.from(sentimentMap.values()).filter(v => v === "positive").length;
        const negativeCount = Array.from(sentimentMap.values()).filter(v => v === "negative").length;
        const neutralCount = Array.from(sentimentMap.values()).filter(v => v === "neutral").length;
        try {
          await upsertDailySentiment({
            date: todayStr,
            score: overallSentimentScore,
            label: overallSentimentLabel,
            articleCount: articles.length,
            positiveCount,
            negativeCount,
            neutralCount,
          });
        } catch { /* 写入失败不影响返回 */ }
        // 从数据库读取 7 日历史
        let sentimentHistoryData: Array<{ date: string; score: number }> = [];
        try {
          const records = await getSentimentHistoryRecords(7);
          sentimentHistoryData = records.map(r => ({
            date: r.date.slice(5), // MM-DD
            score: r.score,
          }));
        } catch { /* 读取失败使用空数组 */ }
        // 若历史数据不足 7 天，用模拟数据补全
        if (sentimentHistoryData.length < 2) {
          const today = Date.now();
          const DAY = 86400000;
          const seed = overallSentimentScore;
          sentimentHistoryData = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date(today - i * DAY);
            const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const offset = Math.round((Math.sin((seed * 0.1 + i) * 0.7) * 18) + (Math.cos(i * 1.3) * 12));
            const score = Math.max(-100, Math.min(100, seed + offset));
            sentimentHistoryData.push({ date: label, score });
          }
        }
        return {
          articles: articles.map((a: import("./newsApi.js").NewsArticle, idx: number) => ({
            title: a.title,
            description: a.description ?? undefined,
            source: a.source.name,
            url: a.url,
            publishedAt: a.publishedAt,
            sentiment: sentimentMap.get(idx) ?? undefined,
          })),
          marketSentiment: {
            score: overallSentimentScore,
            label: overallSentimentLabel,
          },
          sentimentHistory: sentimentHistoryData,
        };
      }),

    /** LEVEL4 Action Engine — transform existing analysis output into actionable decision */
    getLevel4Action: protectedProcedure
      .input(z.object({
        messageId: z.number(),
        ticker: z.string().min(1).max(20),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { messages } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const rows = await db.select().from(messages).where(
          and(eq(messages.id, input.messageId), eq(messages.userId, ctx.user.id))
        ).limit(1);
        if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        const msg = rows[0];
        const metadata = (msg.metadata
          ? (typeof msg.metadata === "string" ? JSON.parse(msg.metadata as string) : msg.metadata)
          : {}) as Record<string, unknown>;
        const { extractLevel4Input, runLevel4ActionEngine } = await import("./level4ActionEngine");
        const level4Input = extractLevel4Input(input.ticker, metadata);
        const result = await runLevel4ActionEngine(level4Input);
        return result;
      }),
  }),
  // --- AI 记忆管理 -----------------------------------------------------------------------------------------
  memory: router({
    /** 获取当前用户的所有记忆条目（支持按 memoryType 过滤） */
    list: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(50),
        memoryType: z.enum(["preference", "workflow", "watchlist", "analysis", "all"]).default("all"),
      }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const memories = await getRecentMemory(ctx.user.id, input.limit);
        if (input.memoryType === "all") return memories;
        return memories.filter((m: { memoryType?: string }) => m.memoryType === input.memoryType);
      }),
    /** 更新记忆的 summary、keywords、importance 字段 */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        summary: z.string().min(1).max(2000).optional(),
        keywords: z.string().max(500).optional(),
        importance: z.number().min(1).max(5).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await updateMemoryContext(input.id, ctx.user.id, {
          summary: input.summary,
          keywords: input.keywords,
          importance: input.importance,
        });
        return { success: true };
      }),
    /** 删除单条记忆 */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await deleteMemoryContext(input.id, ctx.user.id);
        return { success: true };
      }),
    /** 批量删除记忆 */
    deleteBatch: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await deleteMemoryContextBatch(input.ids, ctx.user.id);
        return { success: true, deletedCount: input.ids.length };
      }),
    /**
     * 语义化搜索：用 LLM 将用户自然语言转换为关键词，再对 keywords/summary/taskTitle 做多字段匹配
     * 返回带相关度分数的记忆列表
     */
    search: protectedProcedure
      .input(z.object({
        query: z.string().min(1).max(200),
        limit: z.number().min(1).max(50).default(20),
      }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        // Step 1: LLM 将自然语言转换为搜索关键词列表
        let searchKeywords: string[] = [input.query];
        try {
          const kwResp = await invokeLLMWithRetry({
            messages: [
              {
                role: "system",
                content: `你是一个金融搜索关键词提取助手。将用户的自然语言查询扩展为3-6个搜索关键词，包括同义词、相关股票代码、行业名称。
输出格式：用逗号分隔的关键词列表，不要有其他内容。
示例：用户输入“我关注的股票” → 输出“股票,watchlist,关注,持仓”`,
              },
              { role: "user", content: input.query },
            ],
          });
          const kwStr = String(kwResp.choices?.[0]?.message?.content || "").trim();
          if (kwStr) {
            searchKeywords = kwStr.split(/[,，]/).map(k => k.trim()).filter(Boolean);
          }
        } catch {
          // fallback to original query
        }
        // Step 2: 获取用户所有记忆，对每条记忆计算相关度分数
        const allMemories = await getRecentMemory(ctx.user.id, 100);
        const scored = allMemories.map((m: {
          id: number; taskTitle: string | null; summary: string | null;
          keywords: string | null; memoryType: string | null;
          conversationId: number | null; expiresAt: Date | null; createdAt: Date | null;
        }) => {
          const text = [
            m.taskTitle ?? "",
            m.summary ?? "",
            m.keywords ?? "",
          ].join(" ").toLowerCase();
          let score = 0;
          for (const kw of searchKeywords) {
            const kwLower = kw.toLowerCase();
            if (text.includes(kwLower)) {
              // 标题匹配权重最高
              if ((m.taskTitle ?? "").toLowerCase().includes(kwLower)) score += 3;
              // keywords 字段匹配权重其次
              if ((m.keywords ?? "").toLowerCase().includes(kwLower)) score += 2;
              // summary 匹配权重最低
              if ((m.summary ?? "").toLowerCase().includes(kwLower)) score += 1;
            }
          }
          return { ...m, _score: score };
        });
        // 过滤分数 > 0 的结果，按分数降序排列
        return scored
          .filter(m => m._score > 0)
          .sort((a, b) => b._score - a._score)
          .slice(0, input.limit);
      }),
  }),
  // --- ChatGPT API 配置 ----------------------------------------------------------------------------------------
  rpa: router({
    // 获取当前 API 配置状态
    getConfig: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      const config = await getRpaConfig(ctx.user.id);
      const isOwner = ctx.user.openId === ENV.ownerOpenId;
      // 非 Owner 用户：若三个守则字段为空，自动回退读取 Owner 的默认值
      let ownerConfig: NonNullable<Awaited<ReturnType<typeof getOwnerRpaConfig>>> | null = null;
      if (!isOwner) {
        const needsDefault =
          !config?.investmentRules?.trim() ||
          !config?.taskInstruction?.trim() ||
          !config?.dataLibrary?.trim();
        if (needsDefault) {
          ownerConfig = await getOwnerRpaConfig();
        }
      }
      return {
        openaiApiKey: config?.openaiApiKey ? "•".repeat(8) + config.openaiApiKey.slice(-4) : "",
        openaiModel: config?.openaiModel ?? DEFAULT_MODEL,
        hasApiKey: !!config?.openaiApiKey,
        manusSystemPrompt: config?.manusSystemPrompt ?? "",
        userCoreRules: config?.userCoreRules ?? "",
        // 三部分守则：优先用户自定义，否则回退 Owner 默认值
        investmentRules: config?.investmentRules?.trim()
          ? config.investmentRules
          : (ownerConfig?.investmentRules ?? ""),
        taskInstruction: config?.taskInstruction?.trim()
          ? config.taskInstruction
          : (ownerConfig?.taskInstruction ?? ""),
        dataLibrary: config?.dataLibrary?.trim()
          ? config.dataLibrary
          : (ownerConfig?.dataLibrary ?? ""),
        // 标记是否使用了 Owner 默认值（前端可据此显示提示）
        isUsingOwnerDefaults: !isOwner && !!ownerConfig && (
          !config?.investmentRules?.trim() ||
          !config?.taskInstruction?.trim() ||
          !config?.dataLibrary?.trim()
        ),
        // 结构化可信来源配置
        trustedSourcesConfig: config?.trustedSourcesConfig ?? null,
        // 成本控制模式
        defaultCostMode: (config?.defaultCostMode as "A" | "B" | "C" | null) ?? "B",
        // Pinned Metrics 持久化
        pinnedMetrics: (config?.pinnedMetrics as Array<{label: string; value: string; change?: string; color?: string}> | null) ?? [],
        // 用户自选股列表
        userWatchlist: (config?.userWatchlist as string[] | null) ?? ["AAPL", "TSLA", "NVDA", "BTC"],
        // 工作台列宽配置
        columnWidths: (config?.columnWidths as {sidebar?: number; analysis?: number; discussion?: number; insight?: number} | null) ?? null,
        // 最后访问的标的
        lastTicker: config?.lastTicker ?? null,
        // 研究风格
        researchStyle: (config?.researchStyle as {outputStyle?: string; analysisEmphasis?: string[]} | null) ?? null,
        // AI 行为配置
        aiBehavior: (config?.aiBehavior as {responseStyle?: string; initiativeLevel?: string; decisionStyle?: string} | null) ?? null,
        // 图表涨跌颜色方案：cn=红涨绿跌（中国），us=绿涨红跌（美国）
        chartColorScheme: (config?.chartColorScheme as "cn" | "us" | null) ?? "cn",
      };
    }),
    // 保存 API Key 和模型选择
    setConfig: protectedProcedure
      .input(z.object({
        openaiApiKey: z.string().max(256).optional(),
        openaiModel: z.string().max(128).optional(),
        manusSystemPrompt: z.string().max(8000).optional(),
        userCoreRules: z.string().max(10000).optional().nullable(),
        // 三部分守则
        investmentRules: z.string().max(20000).optional().nullable(),
        taskInstruction: z.string().max(20000).optional().nullable(),
        dataLibrary: z.string().max(50000).optional().nullable(),
        // 结构化可信来源配置
        trustedSourcesConfig: z.object({
          sources: z.array(z.object({
            id: z.string(),
            name: z.string(),
            url: z.string(),
            category: z.string(),
            routingKeys: z.array(z.string()),
            trustLevel: z.enum(["primary", "secondary", "supplementary"]),
            enabled: z.boolean(),
          })),
          routingRules: z.array(z.object({
            id: z.string(),
            pattern: z.string(),
            targetSources: z.array(z.string()),
            priority: z.number(),
          })),
          policy: z.object({
            requireCitation: z.boolean(),
            fallbackToTraining: z.boolean(),
            minEvidenceScore: z.number().min(0).max(1),
            blockOnHardMissing: z.boolean(),
          }),
        }).optional().nullable(),
        // 成本控制模式：A=minimal, B=standard, C=restricted
        defaultCostMode: z.enum(["A", "B", "C"]).optional(),
        // Pinned Metrics 持久化
        pinnedMetrics: z.array(z.object({
          label: z.string(),
          value: z.string(),
          change: z.string().optional(),
          color: z.string().optional(),
        })).optional().nullable(),
        // 用户自选股列表
        userWatchlist: z.array(z.string()).optional().nullable(),
        // 工作台列宽配置
        columnWidths: z.object({
          sidebar: z.number().min(160).max(400).optional(),
          analysis: z.number().min(240).max(600).optional(),
          discussion: z.number().min(280).max(600).optional(),
          insight: z.number().min(200).max(500).optional(),
        }).optional().nullable(),
        // 最后访问的标的
        lastTicker: z.string().max(32).optional().nullable(),
        // 研究风格
        researchStyle: z.object({
          outputStyle: z.string().optional(),
          analysisEmphasis: z.array(z.string()).optional(),
        }).optional().nullable(),
        // AI 行为配置
        aiBehavior: z.object({
          responseStyle: z.string().optional(),
          initiativeLevel: z.string().optional(),
          decisionStyle: z.string().optional(),
        }).optional().nullable(),
        // 图表涨跌颜色方案
        chartColorScheme: z.enum(["cn", "us"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await upsertRpaConfig(ctx.user.id, {
          openaiApiKey: input.openaiApiKey,
          openaiModel: input.openaiModel,
          manusSystemPrompt: input.manusSystemPrompt,
          userCoreRules: input.userCoreRules,
          // 三部分守则
          investmentRules: input.investmentRules,
          taskInstruction: input.taskInstruction,
          dataLibrary: input.dataLibrary,
          // 结构化可信来源配置
          trustedSourcesConfig: input.trustedSourcesConfig ?? undefined,
          // 成本控制模式
          defaultCostMode: input.defaultCostMode,
          // Pinned Metrics 持久化
          pinnedMetrics: input.pinnedMetrics ?? undefined,
          // 用户自选股列表
          userWatchlist: input.userWatchlist ?? undefined,
          // 工作台列宽配置
          columnWidths: input.columnWidths ?? undefined,
          // 最后访问的标的
          lastTicker: input.lastTicker ?? undefined,
          // 研究风格
          researchStyle: input.researchStyle ?? undefined,
          // AI 行为配置
          aiBehavior: input.aiBehavior ?? undefined,
          // 图表涨跌颜色方案
          chartColorScheme: input.chartColorScheme,
        });
        return { success: true };
      }),
    // 测试 API Key 连接
    testConnection: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(1),
        model: z.string().default(DEFAULT_MODEL),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const result = await testOpenAIConnection(input.apiKey, input.model);
        return result;
      }),
    // 检测资料数据库 URL 可访问性
    checkLibraryUrls: protectedProcedure
      .input(z.object({
        urls: z.array(z.string()).max(50),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);

        // 并发检测所有 URL（最多同时 10 个，避免超时堆积）
        const CONCURRENCY = 10;
        const TIMEOUT_MS = 8000;

        async function checkUrl(url: string): Promise<{
          url: string;
          status: "ok" | "error" | "timeout" | "invalid";
          statusCode?: number;
          latencyMs?: number;
          error?: string;
        }> {
          // 校验 URL 格式
          let normalized: string;
          try {
            normalized = url.startsWith("http") ? url : `https://${url}`;
            new URL(normalized); // 验证格式
          } catch {
            return { url, status: "invalid", error: "URL 格式无效" };
          }

          const start = Date.now();
          try {
            const res = await fetch(normalized, {
              method: "HEAD", // HEAD 请求只获取响应头，不下载内容，速度快
              signal: AbortSignal.timeout(TIMEOUT_MS),
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; DanTree-HealthCheck/1.0)",
              },
              redirect: "follow",
            });
            const latencyMs = Date.now() - start;

            if (res.ok || res.status === 405) {
              // 405 Method Not Allowed 表示服务器在线但不支持 HEAD，视为可访问
              return { url, status: "ok", statusCode: res.status, latencyMs };
            }

            // 4xx/5xx 错误
            return {
              url,
              status: "error",
              statusCode: res.status,
              latencyMs,
              error: `HTTP ${res.status}`,
            };
          } catch (err) {
            const latencyMs = Date.now() - start;
            const isTimeout = err instanceof Error && err.name === "TimeoutError";
            return {
              url,
              status: isTimeout ? "timeout" : "error",
              latencyMs,
              error: isTimeout ? `超时（>${TIMEOUT_MS / 1000}s）` : (err instanceof Error ? err.message : String(err)),
            };
          }
        }

        // 分批并发执行
        const results: Awaited<ReturnType<typeof checkUrl>>[] = [];
        for (let i = 0; i < input.urls.length; i += CONCURRENCY) {
          const batch = input.urls.slice(i, i + CONCURRENCY);
          const batchResults = await Promise.all(batch.map(checkUrl));
          results.push(...batchResults);
        }

        return results;
      }),

    // 获取实时数据源状态（服务端缓存架构：前端请求立即返回缓存，后台每5分钟刷新）
    getDataSourceStatus: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);

      // 如果缓存有效（5分钟内），直接返回缓存
      const now = Date.now();
      if (dataSourceStatusCache && (now - dataSourceStatusCacheTime) < 5 * 60 * 1000) {
        return dataSourceStatusCache;
      }

      // 如果已有后台刷新任务在跑，返回旧缓存（或 null 触发前端 loading）
      if (dataSourceStatusRefreshing) {
        return dataSourceStatusCache ?? buildDefaultDataSourceStatus();
      }

      // 启动后台刷新，立即返回旧缓存（或默认值）
      dataSourceStatusRefreshing = true;
      refreshDataSourceStatusInBackground().finally(() => { dataSourceStatusRefreshing = false; });
      return dataSourceStatusCache ?? buildDefaultDataSourceStatus();
    }),

    // 强制刷新数据源状态（忽略缓存）
    refreshDataSourceStatus: protectedProcedure.mutation(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      dataSourceStatusCache = null;
      dataSourceStatusCacheTime = 0;
      dataSourceStatusRefreshing = true;
      const result = await refreshDataSourceStatusInBackground().finally(() => { dataSourceStatusRefreshing = false; });
      return result;
    }),

    // 内部实现（已移至顶部 refreshDataSourceStatusInBackground 函数）
    _getDataSourceStatusImpl: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      // 已将实际健康检测逻辑移至顶部 refreshDataSourceStatusInBackground 函数
      // 此过程仅为兼容保留，直接返回当前缓存
      return dataSourceStatusCache ?? buildDefaultDataSourceStatus();
    }),

    // 备用（不再使用）——下面是已删除的重复实现，保留为占位避免编译错误
    _getDataSourceStatusImplDEPRECATED: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      return dataSourceStatusCache ?? buildDefaultDataSourceStatus();
    }),
  }),
    // --- Alpaca Paper Trading 路由 -------------------------------------------
  alpaca: router({
    // 获取账户信息
    getAccount: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      if (!isAlpacaConfigured()) return { configured: false, account: null };
      try {
        const account = await getAlpacaAccount();
        return { configured: true, account, formatted: formatAlpacaAccount(account) };
      } catch {
        return { configured: true, account: null, error: true };
      }
    }),
    // 获取持仓列表
    getPositions: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      if (!isAlpacaConfigured()) return { configured: false, positions: [] };
      try {
        const positions = await getAlpacaPositions();
        return { configured: true, positions, formatted: formatAlpacaPositions(positions) };
      } catch {
        return { configured: true, positions: [], error: true };
      }
    }),
    // 获取市场时钟
    getClock: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      if (!isAlpacaConfigured()) return { configured: false, clock: null };
      try {
        const clock = await getAlpacaClock();
        return { configured: true, clock, formatted: formatAlpacaClock(clock) };
      } catch {
        return { configured: true, clock: null, error: true };
      }
    }),
    // 模拟下单
    placeOrder: protectedProcedure
      .input(z.object({
        symbol: z.string().min(1).max(10),
        qty: z.number().positive(),
        side: z.enum(["buy", "sell"]),
        type: z.enum(["market", "limit", "stop", "stop_limit"]).default("market"),
        limitPrice: z.number().positive().optional(),
        stopPrice: z.number().positive().optional(),
        timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).default("day"),
        note: z.string().max(200).optional(), // 下单备注（如何来自 GPT 建议）
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        if (!isAlpacaConfigured()) throw new Error("Alpaca API 未配置");
        const order = await placeAlpacaOrder({
          symbol: input.symbol.toUpperCase(),
          qty: input.qty,
          side: input.side,
          type: input.type,
          limit_price: input.limitPrice,
          stop_price: input.stopPrice,
          time_in_force: input.timeInForce,
        });
        return { success: true, order, formatted: formatAlpacaOrder(order), note: input.note };
      }),
    // 获取订单列表
    getOrders: protectedProcedure
      .input(z.object({
        status: z.enum(["open", "closed", "all"]).default("open"),
        limit: z.number().min(1).max(100).default(20),
      }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        if (!isAlpacaConfigured()) return { configured: false, orders: [] };
        const orders = await getAlpacaOrders(input.status, input.limit);
        return { configured: true, orders };
      }),
    // 取消订单
    cancelOrder: protectedProcedure
      .input(z.object({ orderId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        if (!isAlpacaConfigured()) throw new Error("Alpaca API 未配置");
        await cancelAlpacaOrder(input.orderId);
        return { success: true };
      }),
  }),
    // --- 沙箋代码执行路由 -------------------------------------------
  codeExec: router({
    // 执行 Python 代码（安全沙箋）
    run: protectedProcedure
      .input(z.object({
        code: z.string().min(1).max(50000),
        data: z.record(z.string(), z.unknown()).optional(),
        timeout: z.number().min(1000).max(60000).default(30000),
        outputType: z.enum(["image", "json", "text", "auto"]).default("auto"),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        // 先进行安全检查
        const validation = validateCode(input.code);
        if (!validation.safe) {
          return { success: false, outputType: "error" as const, error: validation.reason };
        }
        return executeCode({
          code: input.code,
          data: input.data,
          timeout: input.timeout,
          outputType: input.outputType,
        });
      }),
    // 获取预设图表代码
    getPreset: protectedProcedure
      .input(z.object({
        chartType: z.enum(["price_line", "candlestick", "portfolio_pie", "returns_bar"]),
        data: z.record(z.string(), z.unknown()).default({}),
      }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const code = getPresetChartCode(input.chartType, input.data);
        return { code, available: code !== null };
      }),
  }),
    // --- 数据库连接管理 -------------------------------------------------------
  dbConnect: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      return getDbConnectionsByUser(ctx.user.id);
    }),

    save: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        dbType: z.enum(["mysql", "postgresql", "sqlite"]),
        host: z.string().optional(),
        port: z.number().optional(),
        database: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        filePath: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await saveDbConnection({ ...input, userId: ctx.user.id });
        return { success: true };
      }),

    setActive: protectedProcedure
      .input(z.object({ connId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await setActiveDbConnection(ctx.user.id, input.connId);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ connId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await deleteDbConnection(ctx.user.id, input.connId);
        return { success: true };
      }),

    getActive: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      return getActiveDbConnection(ctx.user.id);
    }),
  }),

  // ── maybe-finance/maybe 风格：资产负债表模块 ─────────────────────────────────────────────────
  netWorth: router({
    getAssets: protectedProcedure.query(async ({ ctx }) => {
      const { getUserAssets } = await import("./db");
      return getUserAssets(ctx.user.id);
    }),
    createAsset: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        category: z.enum(["stocks", "crypto", "cash", "real_estate", "bonds", "other"]),
        ticker: z.string().max(20).optional(),
        quantity: z.string().optional(),
        costBasis: z.string().optional(),
        currentValue: z.string(),
        currency: z.string().default("USD"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createAsset, saveNetWorthSnapshot, getUserAssets, getUserLiabilities } = await import("./db");
        const asset = await createAsset({ ...input, userId: ctx.user.id });
        const allAssets = await getUserAssets(ctx.user.id);
        const allLiabilities = await getUserLiabilities(ctx.user.id);
        const totalAssets = allAssets.reduce((s, a) => s + parseFloat(a.currentValue), 0);
        const totalLiabilities = allLiabilities.reduce((s, l) => s + parseFloat(l.outstandingBalance), 0);
        await saveNetWorthSnapshot(ctx.user.id, totalAssets.toFixed(2), totalLiabilities.toFixed(2), (totalAssets - totalLiabilities).toFixed(2));
        return asset;
      }),
    updateAsset: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        category: z.enum(["stocks", "crypto", "cash", "real_estate", "bonds", "other"]).optional(),
        ticker: z.string().max(20).optional(),
        quantity: z.string().optional(),
        costBasis: z.string().optional(),
        currentValue: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateAsset, saveNetWorthSnapshot, getUserAssets, getUserLiabilities } = await import("./db");
        const { id, ...data } = input;
        await updateAsset(id, ctx.user.id, data as any);
        const allAssets = await getUserAssets(ctx.user.id);
        const allLiabilities = await getUserLiabilities(ctx.user.id);
        const totalAssets = allAssets.reduce((s, a) => s + parseFloat(a.currentValue), 0);
        const totalLiabilities = allLiabilities.reduce((s, l) => s + parseFloat(l.outstandingBalance), 0);
        await saveNetWorthSnapshot(ctx.user.id, totalAssets.toFixed(2), totalLiabilities.toFixed(2), (totalAssets - totalLiabilities).toFixed(2));
        return { success: true };
      }),
    deleteAsset: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteAsset } = await import("./db");
        await deleteAsset(input.id, ctx.user.id);
        return { success: true };
      }),
    getLiabilities: protectedProcedure.query(async ({ ctx }) => {
      const { getUserLiabilities } = await import("./db");
      return getUserLiabilities(ctx.user.id);
    }),
    createLiability: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        category: z.enum(["mortgage", "car_loan", "credit_card", "student_loan", "personal_loan", "other"]),
        outstandingBalance: z.string(),
        interestRate: z.string().optional(),
        monthlyPayment: z.string().optional(),
        currency: z.string().default("USD"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createLiability, saveNetWorthSnapshot, getUserAssets, getUserLiabilities } = await import("./db");
        const liability = await createLiability({ ...input, userId: ctx.user.id });
        const allAssets = await getUserAssets(ctx.user.id);
        const allLiabilities = await getUserLiabilities(ctx.user.id);
        const totalAssets = allAssets.reduce((s, a) => s + parseFloat(a.currentValue), 0);
        const totalLiabilities = allLiabilities.reduce((s, l) => s + parseFloat(l.outstandingBalance), 0);
        await saveNetWorthSnapshot(ctx.user.id, totalAssets.toFixed(2), totalLiabilities.toFixed(2), (totalAssets - totalLiabilities).toFixed(2));
        return liability;
      }),
    updateLiability: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        category: z.enum(["mortgage", "car_loan", "credit_card", "student_loan", "personal_loan", "other"]).optional(),
        outstandingBalance: z.string().optional(),
        interestRate: z.string().optional(),
        monthlyPayment: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateLiability, saveNetWorthSnapshot, getUserAssets, getUserLiabilities } = await import("./db");
        const { id, ...data } = input;
        await updateLiability(id, ctx.user.id, data as any);
        const allAssets = await getUserAssets(ctx.user.id);
        const allLiabilities = await getUserLiabilities(ctx.user.id);
        const totalAssets = allAssets.reduce((s, a) => s + parseFloat(a.currentValue), 0);
        const totalLiabilities = allLiabilities.reduce((s, l) => s + parseFloat(l.outstandingBalance), 0);
        await saveNetWorthSnapshot(ctx.user.id, totalAssets.toFixed(2), totalLiabilities.toFixed(2), (totalAssets - totalLiabilities).toFixed(2));
        return { success: true };
      }),
    deleteLiability: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteLiability } = await import("./db");
        await deleteLiability(input.id, ctx.user.id);
        return { success: true };
      }),
    getHistory: protectedProcedure.query(async ({ ctx }) => {
      const { getNetWorthHistory } = await import("./db");
      return getNetWorthHistory(ctx.user.id);
    }),
  }),
  backtest: router({
    // 因子回测：基于技术因子的历史回测
    factorRun: protectedProcedure
      .input(z.object({
        ticker: z.string().min(1).max(20),
        factorId: z.enum(["macd", "rsi", "bollinger", "ma_cross", "momentum", "kdj"]),
        period: z.enum(["6mo", "1y", "2y"]).default("1y"),
      }))
      .mutation(async ({ input }) => {
        return runFactorBacktest(input.ticker, input.factorId, input.period);
      }),
    getFactors: publicProcedure
      .query(() => {
        return BACKTEST_FACTORS;
      }),
    run: protectedProcedure
      .input(z.object({
        strategy: z.enum(["momentum", "mean_reversion", "ma_crossover", "alpha_factor", "buy_hold"]),
        spot: z.number().optional(),
        sigma: z.number().optional(),
        days: z.number().optional(),
        lookback: z.number().optional(),
        window: z.number().optional(),
        fast: z.number().optional(),
        slow: z.number().optional(),
        prices: z.array(z.number()).optional(),
        alpha_scores: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { runBacktest } = await import("./qbotApi");
        return runBacktest(input);
      }),
    compare: protectedProcedure
      .input(z.object({
        spot: z.number(),
        sigma: z.number(),
        days: z.number().optional(),
        prices: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { runStrategyComparison } = await import("./qbotApi");
        return runStrategyComparison(input.spot, input.sigma, input.days ?? 252, input.prices);
      }),
  }),
  trendRadar: router({
    scan: protectedProcedure
      .input(z.object({
        ticker: z.string(),
        newsItems: z.array(z.object({
          title: z.string(),
          description: z.string().optional(),
          source: z.string().optional(),
          url: z.string().optional(),
          publishedAt: z.string().optional(),
        })),
        maxItems: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { runTrendRadar } = await import("./trendRadarApi");
        // 若前端未传入新闻，自动从 NewsAPI 拉取最新相关新闻
        let newsItems = input.newsItems;
        if (!newsItems || newsItems.length === 0) {
          try {
            const { searchNews } = await import("./newsApi");
            const articles = await searchNews(input.ticker, 15);
            newsItems = articles.map(a => ({
              title: a.title,
              description: a.description ?? undefined,
              source: a.source?.name ?? undefined,
              url: a.url ?? undefined,
              publishedAt: a.publishedAt ?? undefined,
            }));
          } catch {
            // 若新闻获取失败，继续使用空数组（服务端会返回 neutral 结果）
          }
        }
        return runTrendRadar(input.ticker, newsItems, input.maxItems ?? 8);
      }),
  }),
  worldMonitor: router({
    analyze: protectedProcedure
      .input(z.object({
        ticker: z.string(),
        vix: z.number().optional(),
        sp500Change: z.number().optional(),
        btcChange: z.number().optional(),
        goldChange: z.number().optional(),
        dxyChange: z.number().optional(),
        yieldSpread: z.number().optional(),
        sectorPerformance: z.record(z.string(), z.number()).optional(),
        relatedTickers: z.array(z.object({ symbol: z.string(), change: z.number() })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { runWorldMonitor } = await import("./worldMonitorApi");
        const { ticker, ...marketData } = input;
        return runWorldMonitor(ticker, marketData);
      }),
  }),
  market: router({
    // 获取单只股票的实时行情（价格、涨跌幅、PE 等）
    getQuote: protectedProcedure
      .input(z.object({ symbol: z.string().min(1).max(20) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const sym = input.symbol.toUpperCase().trim();
        try {
          const { getQuote, getBasicFinancials } = await import("./finnhubApi");
          const [quote, metrics] = await Promise.allSettled([
            getQuote(sym),
            getBasicFinancials(sym),
          ]);
          const q = quote.status === "fulfilled" ? quote.value : null;
          const m = metrics.status === "fulfilled" ? metrics.value : null;
          return {
            symbol: sym,
            price: q?.c ?? null,
            change: q?.d ?? null,
            changePercent: q?.dp ?? null,
            high: q?.h ?? null,
            low: q?.l ?? null,
            open: q?.o ?? null,
            prevClose: q?.pc ?? null,
            pe: m?.metric?.peNormalizedAnnual ?? null,
            pb: m?.metric?.pbAnnual ?? null,
            roe: m?.metric?.roeTTM ?? null,
            eps: m?.metric?.epsNormalizedAnnual ?? null,
            marketCap: null,
            timestamp: q?.t ?? null,
          };
        } catch (err) {
          return { symbol: sym, price: null, change: null, changePercent: null, high: null, low: null, open: null, prevClose: null, pe: null, pb: null, roe: null, eps: null, marketCap: null, timestamp: null };
        }
      }),
    // 批量获取多只股票的实时行情（用于 Pinned Metrics 栏）
    getBatchQuotes: protectedProcedure
      .input(z.object({ symbols: z.array(z.string().min(1).max(20)).max(10) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { getQuote } = await import("./finnhubApi");
        const results = await Promise.allSettled(
          input.symbols.map(sym => getQuote(sym.toUpperCase().trim()))
        );
        return input.symbols.map((sym, i) => {
          const r = results[i];
          if (r.status === "fulfilled") {
            return { symbol: sym.toUpperCase(), price: r.value.c, change: r.value.d, changePercent: r.value.dp, prevClose: r.value.pc };
          }
          return { symbol: sym.toUpperCase(), price: null, change: null, changePercent: null, prevClose: null };
        });
      }),
    // 获取股价历史 OHLCV 数据（用于图表）
    getPriceHistory: protectedProcedure
      .input(z.object({
        symbol: z.string().min(1).max(20),
        interval: z.enum(["1min", "5min", "15min", "30min", "1h", "4h", "1day", "1week", "1month", "1year"]).default("1day"),
        outputsize: z.number().min(20).max(5000).default(500),  // 扩展至 5000 支持长期历史
      }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const sym = input.symbol.toUpperCase().trim();
        const errors: string[] = [];

        // ── Source 0: 年K特殊处理（Yahoo Finance月K聚合为年K）─────────────────
        if (input.interval === "1year") {
          try {
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1mo&range=max&includePrePost=false`;
            const yahooRes = await fetch(yahooUrl, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(10000),
            });
            if (yahooRes.ok) {
              const yahooData = await yahooRes.json() as any;
              const result = yahooData?.chart?.result?.[0];
              const timestamps: number[] = result?.timestamp ?? [];
              const ohlcv = result?.indicators?.quote?.[0];
              if (timestamps.length > 0 && ohlcv) {
                // 按年聚合月K数据
                const yearMap = new Map<string, { open: number; high: number; low: number; close: number; volume: number; count: number }>();
                timestamps.forEach((ts: number, i: number) => {
                  const year = new Date(ts * 1000).getFullYear().toString();
                  const o = ohlcv.open?.[i] ?? 0;
                  const h = ohlcv.high?.[i] ?? 0;
                  const l = ohlcv.low?.[i] ?? 0;
                  const c = ohlcv.close?.[i] ?? 0;
                  const v = ohlcv.volume?.[i] ?? 0;
                  if (o <= 0 || c <= 0) return;
                  const existing = yearMap.get(year);
                  if (!existing) {
                    yearMap.set(year, { open: o, high: h, low: l, close: c, volume: v, count: 1 });
                  } else {
                    existing.high = Math.max(existing.high, h);
                    existing.low = Math.min(existing.low, l);
                    existing.close = c; // 最后一个月的收盘价作为年收盘
                    existing.volume += v;
                    existing.count++;
                  }
                });
                const candles = Array.from(yearMap.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .slice(-input.outputsize)
                  .map(([year, d]) => ({
                    time: `${year}-01-01`,
                    open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume,
                  }));
                if (candles.length > 0) {
                  return { symbol: sym, interval: input.interval, candles, source: "yahoo_finance" };
                }
              }
            }
            errors.push("Yahoo Finance (年K): empty candles");
          } catch (e: any) {
            errors.push(`Yahoo Finance (年K): ${e?.message ?? e}`);
          }
          console.warn(`[getPriceHistory] 年K all sources failed for ${sym}:`, errors);
          return { symbol: sym, interval: input.interval, candles: [] as any[], errors };
        }

        // ── Source 1: TwelveData ─────────────────────────────────────────────
        try {
          const { fetchTwelveData } = await import("./twelveDataApi") as any;
          const isIntradayTD = ["1min","5min","15min","30min","1h","4h"].includes(input.interval);
          const data = await fetchTwelveData("time_series", {
            symbol: sym,
            interval: input.interval,
            outputsize: String(input.outputsize),
            // 请求UTC时区，避免TwelveData返回交易所本地时间导致时间戳偏移
            ...(isIntradayTD ? { timezone: "UTC" } : {}),
          });
          if (data?.values && Array.isArray(data.values) && data.values.length > 0) {
            const candles = [...data.values].reverse().map((v: any) => ({
              // TwelveData datetime with timezone=UTC: "2024-01-15 14:30:00" (UTC)
              // Convert to Unix seconds for intraday so lightweight-charts handles time axis correctly
              time: (v.datetime.length > 10 && isIntradayTD)
                ? Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000)
                : v.datetime.substring(0, 10),
              open: parseFloat(v.open),
              high: parseFloat(v.high),
              low: parseFloat(v.low),
              close: parseFloat(v.close),
              volume: v.volume ? parseInt(v.volume) : undefined,
            }));
            return { symbol: sym, interval: input.interval, candles, source: "twelve_data" };
          }
          errors.push("TwelveData: empty values");
        } catch (e: any) {
          errors.push(`TwelveData: ${e?.message ?? e}`);
        }

        // ── Source 2: Polygon.io (日线/周线 only, US stocks) ─────────────────
        if (["1day", "1week", "1month"].includes(input.interval)) {
          try {
            const { getAggregates } = await import("./polygonApi");
            const toDate = new Date().toISOString().split("T")[0];
            // 根据 interval 和 outputsize 动态计算起始日期
            const msPerBar = input.interval === "1month" ? 31 * 24 * 3600 * 1000
              : input.interval === "1week" ? 7 * 24 * 3600 * 1000
              : 24 * 3600 * 1000; // 1day
            const fromDate = new Date(Date.now() - input.outputsize * msPerBar * 1.1) // 多取 10% 容错
              .toISOString().split("T")[0];
            const timespan = input.interval === "1day" ? "day"
              : input.interval === "1week" ? "week" : "month";
            const bars = await getAggregates(sym, fromDate, toDate, 1, timespan as any);
            if (bars && bars.length > 0) {
              const candles = bars.slice(-input.outputsize).map((b: any) => ({
                time: new Date(b.t).toISOString().split("T")[0],
                open: b.o,
                high: b.h,
                low: b.l,
                close: b.c,
                volume: b.v,
              }));
              return { symbol: sym, interval: input.interval, candles, source: "polygon" };
            }
            errors.push("Polygon: empty bars");
          } catch (e: any) {
            errors.push(`Polygon: ${e?.message ?? e}`);
          }
        }

        // ── Source 3: Alpha Vantage (日线 only) ──────────────────────────────
        if (input.interval === "1day") {
          try {
            const { fetchAV } = await import("./alphaVantageApi") as any;
            const avData = await fetchAV({
              function: "TIME_SERIES_DAILY",
              symbol: sym,
              outputsize: input.outputsize > 100 ? "full" : "compact",
            });
            const series = avData?.["Time Series (Daily)"] as Record<string, any> | undefined;
            if (series && Object.keys(series).length > 0) {
              const candles = Object.entries(series)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-input.outputsize)
                .map(([date, v]: [string, any]) => ({
                  time: date,
                  open: parseFloat(v["1. open"]),
                  high: parseFloat(v["2. high"]),
                  low: parseFloat(v["3. low"]),
                  close: parseFloat(v["4. close"]),
                  volume: parseInt(v["5. volume"]),
                }));
              return { symbol: sym, interval: input.interval, candles, source: "alpha_vantage" };
            }
            errors.push("AlphaVantage: empty series");
          } catch (e: any) {
            errors.push(`AlphaVantage: ${e?.message ?? e}`);
          }
        }

        // ── Source 4: Yahoo Finance (via yfinance-compatible endpoint) ────────
        try {
          const yahooInterval = input.interval === "1day" ? "1d"
            : input.interval === "1week" ? "1wk"
            : input.interval === "1month" ? "1mo"
            : input.interval === "1h" ? "1h"
            : input.interval === "4h" ? "1h"
            : "1d";
          // 根据 outputsize 和 interval 动态计算需要的时间范围
          const yahooRange = (() => {
            if (["1week", "1month"].includes(input.interval)) return "max"; // 周K/月K拉取全部历史
            if (input.interval === "1day") {
              if (input.outputsize >= 1000) return "10y";
              if (input.outputsize >= 500) return "5y";
              if (input.outputsize >= 250) return "2y";
              return "1y";
            }
            // 日内数据保持原有逻辑
            return input.outputsize > 200 ? "5y" : input.outputsize > 100 ? "2y" : input.outputsize > 60 ? "1y" : "6mo";
          })();
          const yahooSym = sym.includes(".") ? sym : sym;
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=${yahooInterval}&range=${yahooRange}&includePrePost=false`;
          const yahooRes = await fetch(yahooUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (yahooRes.ok) {
            const yahooData = await yahooRes.json() as any;
            const result = yahooData?.chart?.result?.[0];
            const timestamps: number[] = result?.timestamp ?? [];
            const ohlcv = result?.indicators?.quote?.[0];
            if (timestamps.length > 0 && ohlcv) {
              const isIntradayYahoo = ["1min","5min","15min","30min","1h","4h"].includes(input.interval);
              const candles = timestamps
                .slice(-input.outputsize)
                .map((ts: number, i: number) => ({
                  // For intraday, keep Unix seconds; for daily+, use date string
                  time: isIntradayYahoo ? ts : new Date(ts * 1000).toISOString().split("T")[0],
                  open: ohlcv.open?.[i] ?? 0,
                  high: ohlcv.high?.[i] ?? 0,
                  low: ohlcv.low?.[i] ?? 0,
                  close: ohlcv.close?.[i] ?? 0,
                  volume: ohlcv.volume?.[i] ?? 0,
                }))
                .filter((c: any) => c.open > 0 && c.close > 0);
              if (candles.length > 0) {
                return { symbol: sym, interval: input.interval, candles, source: "yahoo_finance" };
              }
            }
            errors.push("Yahoo Finance: empty candles");
          } else {
            errors.push(`Yahoo Finance: HTTP ${yahooRes.status}`);
          }
        } catch (e: any) {
          errors.push(`Yahoo Finance: ${e?.message ?? e}`);
        }

        // All sources failed
        console.warn(`[getPriceHistory] All sources failed for ${sym}:`, errors);
        return { symbol: sym, interval: input.interval, candles: [] as any[], errors };
      }),

    // 获取全球主要市场实时状态（A股/港股/美股/英股/德股/法股）
    getAllMarketStatuses: protectedProcedure
      .query(async ({ ctx }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { getAllMarketStatuses } = await import("./globalHolidays");
        return getAllMarketStatuses();
      }),

    // 节假日缓存状态（Settings页面展示）
    getHolidayCacheStatus: protectedProcedure
      .query(async ({ ctx }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { getHolidayCacheStatus } = await import("./globalHolidays");
        return getHolidayCacheStatus();
      }),

    // 手动触发节假日缓存刷新（Settings页面「立即同步」按钮）
    refreshHolidayCache: protectedProcedure
      .input(z.object({ market: z.enum(["HK", "GB", "DE", "FR"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const { refreshHolidayCache } = await import("./globalHolidays");
        await refreshHolidayCache(input.market as any);
        const { getHolidayCacheStatus } = await import("./globalHolidays");
        return getHolidayCacheStatus();
      }),

    /**
     * 获取指定市场的主要指数快照（用于 GlobalMarketBar 点击弹出浮层）
     * 支持市场：CN / HK / US / GB / DE / FR
     */
    // 获取分析师评级历史（过去 12 个月 buy/hold/sell 月度汇总）
    getAnalystRecommendations: protectedProcedure
      .input(z.object({ symbol: z.string().min(1).max(20) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const sym = input.symbol.toUpperCase().trim();
        try {
          const { getRecommendations } = await import("./finnhubApi");
          const recs = await getRecommendations(sym);
          // 返回最近 12 个月，按时间升序（旧→新）
          return recs
            .slice(0, 12)
            .reverse()
            .map(r => ({
              period: r.period,
              buy: (r.buy ?? 0) + (r.strongBuy ?? 0),
              hold: r.hold ?? 0,
              sell: (r.sell ?? 0) + (r.strongSell ?? 0),
            }));
        } catch {
          return [];
        }
      }),
    getMarketIndexSnapshot: protectedProcedure
      .input(z.object({ market: z.enum(["CN", "HK", "US", "GB", "DE", "FR"]) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);

        // 各市场主要指数配置
        const MARKET_INDICES: Record<string, Array<{ symbol: string; name: string; source: "finnhub" | "efinance" | "polygon" }>> = {
          US: [
            { symbol: "SPY",  name: "S&P 500 ETF",   source: "finnhub" },
            { symbol: "QQQ",  name: "Nasdaq 100 ETF", source: "finnhub" },
            { symbol: "DIA",  name: "Dow Jones ETF",  source: "finnhub" },
          ],
          CN: [
            { symbol: "000001", name: "上证指数", source: "efinance" },
            { symbol: "399001", name: "深证成指", source: "efinance" },
            { symbol: "000300", name: "沪深300",   source: "efinance" },
          ],
          HK: [
            { symbol: "HSI",   name: "恒生指数",   source: "finnhub" },
            { symbol: "HSCEI", name: "国企指数",   source: "finnhub" },
            { symbol: "00700", name: "腾讯控股",   source: "efinance" },
          ],
          GB: [
            { symbol: "ISF",   name: "FTSE 100 ETF",  source: "finnhub" },
            { symbol: "GBPUSD",name: "GBP/USD",       source: "finnhub" },
          ],
          DE: [
            { symbol: "EWG",   name: "DAX ETF",       source: "finnhub" },
            { symbol: "EURUSD",name: "EUR/USD",        source: "finnhub" },
          ],
          FR: [
            { symbol: "EWQ",   name: "CAC 40 ETF",    source: "finnhub" },
            { symbol: "EURUSD",name: "EUR/USD",        source: "finnhub" },
          ],
        };

        const indices = MARKET_INDICES[input.market] ?? [];
        const { getQuote } = await import("./finnhubApi");

        const results = await Promise.allSettled(
          indices.map(async (idx) => {
            if (idx.source === "finnhub") {
              const q = await getQuote(idx.symbol);
              return {
                symbol: idx.symbol,
                name: idx.name,
                price: q.c ?? null,
                change: q.d ?? null,
                pctChange: q.dp ?? null,
                prevClose: q.pc ?? null,
                high: q.h ?? null,
                low: q.l ?? null,
              };
            }
            // efinance 快照（A股/港股）
            const { execFile } = await import("child_process");
            const { promisify } = await import("util");
            const execFileAsync = promisify(execFile);
            const script = `
import sys, json
import efinance as ef
code = sys.argv[1]
try:
    snap = ef.stock.get_quote_snapshot(code)
    if snap is not None:
        s = snap.to_dict() if hasattr(snap, 'to_dict') else dict(snap)
        def fv(k):
            v = s.get(k)
            if v is None or str(v) in ["nan","None",""]: return None
            try: return float(v)
            except: return None
        print(json.dumps({"price":fv("最新价"),"change":fv("涨跌额"),"pctChange":fv("涨跌幅"),"prevClose":fv("昨收"),"high":fv("最高"),"low":fv("最低")}))
    else:
        print(json.dumps({"error":"no_data"}))
except Exception as e:
    print(json.dumps({"error":str(e)}))
`;
            const { stdout } = await execFileAsync("python3", ["-c", script, idx.symbol], { timeout: 8000, maxBuffer: 256 * 1024 });
            const snap = JSON.parse(stdout.trim());
            if (snap.error) throw new Error(snap.error);
            return {
              symbol: idx.symbol,
              name: idx.name,
              price: snap.price,
              change: snap.change,
              pctChange: snap.pctChange,
              prevClose: snap.prevClose,
              high: snap.high,
              low: snap.low,
            };
          })
        );

        return results.map((r, i) => {
          const base = { symbol: indices[i].symbol, name: indices[i].name };
          if (r.status === "fulfilled") {
            return { ...base, ...r.value, error: null };
          }
          return { ...base, price: null, change: null, pctChange: null, prevClose: null, high: null, low: null, error: (r.reason as Error).message };
        });
      }),

    // 股票搜索：支持股票代码、英文名称、中文名称搜索，覆盖美股/港股/A股/ETF
    searchTicker: protectedProcedure
      .input(z.object({ query: z.string().min(1).max(50) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const q = input.query.trim();

        // 中文名称映射表（中文 → 股票代码）
        type TickerEntry = { symbol: string; name: string; cnName: string; exchange: string; market: string; etfIndex?: string };
        const CN_NAME_MAP: Record<string, TickerEntry[]> = {
          "腾讯": [{ symbol: "700.HK", name: "Tencent Holdings Ltd", cnName: "腾讯控股", exchange: "HKEX", market: "HK" }],
          "腾讯控股": [{ symbol: "700.HK", name: "Tencent Holdings Ltd", cnName: "腾讯控股", exchange: "HKEX", market: "HK" }],
          "阿里巴巴": [{ symbol: "BABA", name: "Alibaba Group Holding Ltd", cnName: "阿里巴巴", exchange: "NYSE", market: "US" }, { symbol: "9988.HK", name: "Alibaba Group Holding Ltd", cnName: "阿里巴巴", exchange: "HKEX", market: "HK" }],
          "阿里": [{ symbol: "BABA", name: "Alibaba Group Holding Ltd", cnName: "阿里巴巴", exchange: "NYSE", market: "US" }],
          "茅台": [{ symbol: "600519.SS", name: "Kweichow Moutai Co., Ltd.", cnName: "贵州茅台", exchange: "SSE", market: "CN" }],
          "贵州茅台": [{ symbol: "600519.SS", name: "Kweichow Moutai Co., Ltd.", cnName: "贵州茅台", exchange: "SSE", market: "CN" }],
          "比亚迪": [{ symbol: "002594.SZ", name: "BYD Co., Ltd.", cnName: "比亚迪", exchange: "SZSE", market: "CN" }, { symbol: "1211.HK", name: "BYD Co., Ltd.", cnName: "比亚迪", exchange: "HKEX", market: "HK" }],
          "宁德时代": [{ symbol: "300750.SZ", name: "Contemporary Amperex Technology Co., Ltd.", cnName: "宁德时代", exchange: "SZSE", market: "CN" }],
          "CATL": [{ symbol: "300750.SZ", name: "Contemporary Amperex Technology Co., Ltd.", cnName: "宁德时代", exchange: "SZSE", market: "CN" }],
          "工商银行": [{ symbol: "601398.SS", name: "Industrial and Commercial Bank of China", cnName: "工商银行", exchange: "SSE", market: "CN" }, { symbol: "1398.HK", name: "ICBC", cnName: "工商银行", exchange: "HKEX", market: "HK" }],
          "建设银行": [{ symbol: "601939.SS", name: "China Construction Bank", cnName: "建设银行", exchange: "SSE", market: "CN" }, { symbol: "939.HK", name: "CCB", cnName: "建设银行", exchange: "HKEX", market: "HK" }],
          "招商银行": [{ symbol: "600036.SS", name: "China Merchants Bank", cnName: "招商银行", exchange: "SSE", market: "CN" }, { symbol: "3968.HK", name: "China Merchants Bank", cnName: "招商银行", exchange: "HKEX", market: "HK" }],
          "中国平安": [{ symbol: "601318.SS", name: "Ping An Insurance", cnName: "中国平安", exchange: "SSE", market: "CN" }, { symbol: "2318.HK", name: "Ping An Insurance", cnName: "中国平安", exchange: "HKEX", market: "HK" }],
          "平安": [{ symbol: "601318.SS", name: "Ping An Insurance", cnName: "中国平安", exchange: "SSE", market: "CN" }],
          "中国移动": [{ symbol: "600941.SS", name: "China Mobile", cnName: "中国移动", exchange: "SSE", market: "CN" }, { symbol: "941.HK", name: "China Mobile", cnName: "中国移动", exchange: "HKEX", market: "HK" }],
          "中国联通": [{ symbol: "600050.SS", name: "China Unicom", cnName: "中国联通", exchange: "SSE", market: "CN" }, { symbol: "762.HK", name: "China Unicom", cnName: "中国联通", exchange: "HKEX", market: "HK" }],
          "中国电信": [{ symbol: "601728.SS", name: "China Telecom", cnName: "中国电信", exchange: "SSE", market: "CN" }, { symbol: "728.HK", name: "China Telecom", cnName: "中国电信", exchange: "HKEX", market: "HK" }],
          "美团": [{ symbol: "3690.HK", name: "Meituan", cnName: "美团", exchange: "HKEX", market: "HK" }],
          "京东": [{ symbol: "JD", name: "JD.com Inc", cnName: "京东", exchange: "NASDAQ", market: "US" }, { symbol: "9618.HK", name: "JD.com Inc", cnName: "京东", exchange: "HKEX", market: "HK" }],
          "拼多多": [{ symbol: "PDD", name: "PDD Holdings Inc", cnName: "拼多多", exchange: "NASDAQ", market: "US" }],
          "百度": [{ symbol: "BIDU", name: "Baidu Inc", cnName: "百度", exchange: "NASDAQ", market: "US" }, { symbol: "9888.HK", name: "Baidu Inc", cnName: "百度", exchange: "HKEX", market: "HK" }],
          "网易": [{ symbol: "NTES", name: "NetEase Inc", cnName: "网易", exchange: "NASDAQ", market: "US" }, { symbol: "9999.HK", name: "NetEase Inc", cnName: "网易", exchange: "HKEX", market: "HK" }],
          "小米": [{ symbol: "1810.HK", name: "Xiaomi Corp", cnName: "小米集团", exchange: "HKEX", market: "HK" }],
          "小米集团": [{ symbol: "1810.HK", name: "Xiaomi Corp", cnName: "小米集团", exchange: "HKEX", market: "HK" }],
          "华为": [],
          "中芯国际": [{ symbol: "688981.SS", name: "SMIC", cnName: "中芯国际", exchange: "SSE", market: "CN" }, { symbol: "981.HK", name: "SMIC", cnName: "中芯国际", exchange: "HKEX", market: "HK" }],
          "海尔": [{ symbol: "600690.SS", name: "Haier Smart Home", cnName: "海尔智家", exchange: "SSE", market: "CN" }],
          "格力": [{ symbol: "000651.SZ", name: "Gree Electric Appliances", cnName: "格力电器", exchange: "SZSE", market: "CN" }],
          "美的": [{ symbol: "000333.SZ", name: "Midea Group", cnName: "美的集团", exchange: "SZSE", market: "CN" }],
          "五粮液": [{ symbol: "000858.SZ", name: "Wuliangye Yibin", cnName: "五粮液", exchange: "SZSE", market: "CN" }],
          "恒瑞医药": [{ symbol: "600276.SS", name: "Jiangsu Hengrui Medicine", cnName: "恒瑞医药", exchange: "SSE", market: "CN" }],
          "迈瑞医疗": [{ symbol: "300760.SZ", name: "Mindray Medical", cnName: "迈瑞医疗", exchange: "SZSE", market: "CN" }],
          "隆基绿能": [{ symbol: "601012.SS", name: "LONGi Green Energy", cnName: "隆基绿能", exchange: "SSE", market: "CN" }],
          "通威股份": [{ symbol: "600438.SS", name: "Tongwei Co., Ltd.", cnName: "通威股份", exchange: "SSE", market: "CN" }],
          "中国石油": [{ symbol: "601857.SS", name: "PetroChina", cnName: "中国石油", exchange: "SSE", market: "CN" }, { symbol: "857.HK", name: "PetroChina", cnName: "中国石油", exchange: "HKEX", market: "HK" }],
          "中国石化": [{ symbol: "600028.SS", name: "Sinopec", cnName: "中国石化", exchange: "SSE", market: "CN" }, { symbol: "386.HK", name: "Sinopec", cnName: "中国石化", exchange: "HKEX", market: "HK" }],
          "万科": [{ symbol: "000002.SZ", name: "Vanke Co., Ltd.", cnName: "万科A", exchange: "SZSE", market: "CN" }],
          "碧桂园": [{ symbol: "2007.HK", name: "Country Garden Holdings", cnName: "碧桂园", exchange: "HKEX", market: "HK" }],
          "恒大": [{ symbol: "3333.HK", name: "China Evergrande Group", cnName: "中国恒大", exchange: "HKEX", market: "HK" }],
          "苹果": [{ symbol: "AAPL", name: "Apple Inc", cnName: "苹果", exchange: "NASDAQ", market: "US" }],
          "特斯拉": [{ symbol: "TSLA", name: "Tesla Inc", cnName: "特斯拉", exchange: "NASDAQ", market: "US" }],
          "英伟达": [{ symbol: "NVDA", name: "NVIDIA Corp", cnName: "英伟达", exchange: "NASDAQ", market: "US" }],
          "微软": [{ symbol: "MSFT", name: "Microsoft Corp", cnName: "微软", exchange: "NASDAQ", market: "US" }],
          "谷歌": [{ symbol: "GOOGL", name: "Alphabet Inc", cnName: "谷歌", exchange: "NASDAQ", market: "US" }],
          "亚马逊": [{ symbol: "AMZN", name: "Amazon.com Inc", cnName: "亚马逊", exchange: "NASDAQ", market: "US" }],
          "脸书": [{ symbol: "META", name: "Meta Platforms Inc", cnName: "Meta", exchange: "NASDAQ", market: "US" }],
          "Meta": [{ symbol: "META", name: "Meta Platforms Inc", cnName: "Meta", exchange: "NASDAQ", market: "US" }],
          "奈飞": [{ symbol: "NFLX", name: "Netflix Inc", cnName: "奈飞", exchange: "NASDAQ", market: "US" }],
          "奥特曼": [],
          "英特尔": [{ symbol: "INTC", name: "Intel Corp", cnName: "英特尔", exchange: "NASDAQ", market: "US" }],
          "高通": [{ symbol: "QCOM", name: "Qualcomm Inc", cnName: "高通", exchange: "NASDAQ", market: "US" }],
          "台积电": [{ symbol: "TSM", name: "Taiwan Semiconductor Manufacturing", cnName: "台积电", exchange: "NYSE", market: "US" }],
          "三星": [{ symbol: "005930.KS", name: "Samsung Electronics", cnName: "三星电子", exchange: "KRX", market: "KR" }],
          "汇丰": [{ symbol: "HSBC", name: "HSBC Holdings", cnName: "汇丰控股", exchange: "NYSE", market: "US" }, { symbol: "5.HK", name: "HSBC Holdings", cnName: "汇丰控股", exchange: "HKEX", market: "HK" }],
          "汇丰控股": [{ symbol: "HSBC", name: "HSBC Holdings", cnName: "汇丰控股", exchange: "NYSE", market: "US" }, { symbol: "5.HK", name: "HSBC Holdings", cnName: "汇丰控股", exchange: "HKEX", market: "HK" }],
          "港交所": [{ symbol: "388.HK", name: "Hong Kong Exchanges and Clearing", cnName: "港交所", exchange: "HKEX", market: "HK" }],
          "友邦保险": [{ symbol: "1299.HK", name: "AIA Group", cnName: "友邦保险", exchange: "HKEX", market: "HK" }],
          "AIA": [{ symbol: "1299.HK", name: "AIA Group", cnName: "友邦保险", exchange: "HKEX", market: "HK" }],
          "长和": [{ symbol: "1.HK", name: "CK Hutchison Holdings", cnName: "长和", exchange: "HKEX", market: "HK" }],
          "李嘉诚": [{ symbol: "1.HK", name: "CK Hutchison Holdings", cnName: "长和", exchange: "HKEX", market: "HK" }],
          "比特币": [{ symbol: "BTC", name: "Bitcoin", cnName: "比特币", exchange: "Crypto", market: "CRYPTO" }],
          "以太坊": [{ symbol: "ETH", name: "Ethereum", cnName: "以太坊", exchange: "Crypto", market: "CRYPTO" }],
          "瑞幸咖啡": [{ symbol: "LKNCY", name: "Luckin Coffee Inc", cnName: "瑞幸咖啡", exchange: "OTC", market: "US" }],
          "蔚来": [{ symbol: "NIO", name: "NIO Inc", cnName: "蔚来", exchange: "NYSE", market: "US" }, { symbol: "9866.HK", name: "NIO Inc", cnName: "蔚来", exchange: "HKEX", market: "HK" }],
          "理想汽车": [{ symbol: "LI", name: "Li Auto Inc", cnName: "理想汽车", exchange: "NASDAQ", market: "US" }, { symbol: "2015.HK", name: "Li Auto Inc", cnName: "理想汽车", exchange: "HKEX", market: "HK" }],
          "小鹏汽车": [{ symbol: "XPEV", name: "XPeng Inc", cnName: "小鹏汽车", exchange: "NYSE", market: "US" }, { symbol: "9868.HK", name: "XPeng Inc", cnName: "小鹏汽车", exchange: "HKEX", market: "HK" }],
          "快手": [{ symbol: "1024.HK", name: "Kuaishou Technology", cnName: "快手", exchange: "HKEX", market: "HK" }],
          "哔哩哔哩": [{ symbol: "BILI", name: "Bilibili Inc", cnName: "哔哩哔哩", exchange: "NASDAQ", market: "US" }, { symbol: "9626.HK", name: "Bilibili Inc", cnName: "哔哩哔哩", exchange: "HKEX", market: "HK" }],
          "B站": [{ symbol: "BILI", name: "Bilibili Inc", cnName: "哔哩哔哩", exchange: "NASDAQ", market: "US" }],
          "滴滴": [{ symbol: "DIDIY", name: "DiDi Global Inc", cnName: "滴滴出行", exchange: "OTC", market: "US" }],
          "携程": [{ symbol: "TCOM", name: "Trip.com Group", cnName: "携程", exchange: "NASDAQ", market: "US" }, { symbol: "9961.HK", name: "Trip.com Group", cnName: "携程", exchange: "HKEX", market: "HK" }],
          "新东方": [{ symbol: "EDU", name: "New Oriental Education", cnName: "新东方", exchange: "NYSE", market: "US" }, { symbol: "9901.HK", name: "New Oriental Education", cnName: "新东方", exchange: "HKEX", market: "HK" }],
          "好未来": [{ symbol: "TAL", name: "TAL Education Group", cnName: "好未来", exchange: "NYSE", market: "US" }],
          "中国恒大": [{ symbol: "3333.HK", name: "China Evergrande Group", cnName: "中国恒大", exchange: "HKEX", market: "HK" }],
          "龙湖集团": [{ symbol: "960.HK", name: "Longfor Group Holdings", cnName: "龙湖集团", exchange: "HKEX", market: "HK" }],
          "中海外": [{ symbol: "688.HK", name: "COLI", cnName: "中国海外发展", exchange: "HKEX", market: "HK" }],

          // ── 银行行业 ──
          "中国银行": [{ symbol: "601988.SS", name: "Bank of China", cnName: "中国银行", exchange: "SSE", market: "CN" }, { symbol: "3988.HK", name: "Bank of China", cnName: "中国银行", exchange: "HKEX", market: "HK" }],
          "中国农业银行": [{ symbol: "601288.SS", name: "Agricultural Bank of China", cnName: "中国农业银行", exchange: "SSE", market: "CN" }, { symbol: "1288.HK", name: "Agricultural Bank of China", cnName: "农业银行", exchange: "HKEX", market: "HK" }],
          "农业银行": [{ symbol: "601288.SS", name: "Agricultural Bank of China", cnName: "中国农业银行", exchange: "SSE", market: "CN" }],
          "交通银行": [{ symbol: "601328.SS", name: "Bank of Communications", cnName: "交通银行", exchange: "SSE", market: "CN" }, { symbol: "3328.HK", name: "Bank of Communications", cnName: "交通银行", exchange: "HKEX", market: "HK" }],
          "兴业银行": [{ symbol: "601166.SS", name: "Industrial Bank", cnName: "兴业银行", exchange: "SSE", market: "CN" }],
          "浦发银行": [{ symbol: "600000.SS", name: "Shanghai Pudong Development Bank", cnName: "浦发银行", exchange: "SSE", market: "CN" }],
          "平安银行": [{ symbol: "000001.SZ", name: "Ping An Bank", cnName: "平安银行", exchange: "SZSE", market: "CN" }],
          "宁波银行": [{ symbol: "002142.SZ", name: "Bank of Ningbo", cnName: "宁波银行", exchange: "SZSE", market: "CN" }],
          "北京银行": [{ symbol: "601169.SS", name: "Bank of Beijing", cnName: "北京银行", exchange: "SSE", market: "CN" }],
          "光大银行": [{ symbol: "601818.SS", name: "China Everbright Bank", cnName: "光大银行", exchange: "SSE", market: "CN" }],
          "民生银行": [{ symbol: "600016.SS", name: "China Minsheng Bank", cnName: "民生银行", exchange: "SSE", market: "CN" }],
          "中信银行": [{ symbol: "998.HK", name: "China CITIC Bank", cnName: "中信银行", exchange: "HKEX", market: "HK" }],
          "华夏银行": [{ symbol: "600015.SS", name: "Hua Xia Bank", cnName: "华夏银行", exchange: "SSE", market: "CN" }],
          "邮储银行": [{ symbol: "601658.SS", name: "Postal Savings Bank of China", cnName: "邮储银行", exchange: "SSE", market: "CN" }, { symbol: "1658.HK", name: "Postal Savings Bank", cnName: "邮储银行", exchange: "HKEX", market: "HK" }],

          // ── 航空/交通 ──
          "中国国航": [{ symbol: "601111.SS", name: "Air China", cnName: "中国国航", exchange: "SSE", market: "CN" }, { symbol: "753.HK", name: "Air China", cnName: "中国国航", exchange: "HKEX", market: "HK" }],
          "国航": [{ symbol: "601111.SS", name: "Air China", cnName: "中国国航", exchange: "SSE", market: "CN" }],
          "中国南方航空": [{ symbol: "600029.SS", name: "China Southern Airlines", cnName: "中国南方航空", exchange: "SSE", market: "CN" }, { symbol: "1055.HK", name: "China Southern Airlines", cnName: "南方航空", exchange: "HKEX", market: "HK" }],
          "南方航空": [{ symbol: "600029.SS", name: "China Southern Airlines", cnName: "中国南方航空", exchange: "SSE", market: "CN" }],
          "中国东方航空": [{ symbol: "600115.SS", name: "China Eastern Airlines", cnName: "中国东方航空", exchange: "SSE", market: "CN" }, { symbol: "670.HK", name: "China Eastern Airlines", cnName: "东方航空", exchange: "HKEX", market: "HK" }],
          "东方航空": [{ symbol: "600115.SS", name: "China Eastern Airlines", cnName: "中国东方航空", exchange: "SSE", market: "CN" }],
          "中国国际航空": [{ symbol: "753.HK", name: "Air China", cnName: "中国国航", exchange: "HKEX", market: "HK" }],
          "安踏航空": [{ symbol: "AAL", name: "American Airlines", cnName: "美国航空", exchange: "NASDAQ", market: "US" }],
          "美国航空": [{ symbol: "AAL", name: "American Airlines", cnName: "美国航空", exchange: "NASDAQ", market: "US" }],
          "达美航空": [{ symbol: "DAL", name: "Delta Air Lines", cnName: "达美航空", exchange: "NYSE", market: "US" }],
          "联合航空": [{ symbol: "UAL", name: "United Airlines", cnName: "联合航空", exchange: "NASDAQ", market: "US" }],

          // ── 能源/矿业 ──
          "中国神华": [{ symbol: "600028.SS", name: "China Petroleum & Chemical", cnName: "中国石化", exchange: "SSE", market: "CN" }],
          "中海石油": [{ symbol: "883.HK", name: "CNOOC", cnName: "中海石油", exchange: "HKEX", market: "HK" }],
          "CNOOC": [{ symbol: "883.HK", name: "CNOOC", cnName: "中海石油", exchange: "HKEX", market: "HK" }],
          "中国建材": [{ symbol: "3323.HK", name: "CNBM", cnName: "中国建材", exchange: "HKEX", market: "HK" }],
          "洛阳馒钉": [{ symbol: "601600.SS", name: "Aluminum Corporation of China", cnName: "中国铝业", exchange: "SSE", market: "CN" }, { symbol: "2600.HK", name: "Chalco", cnName: "中国铝业", exchange: "HKEX", market: "HK" }],
          "中国铝业": [{ symbol: "601600.SS", name: "Aluminum Corporation of China", cnName: "中国铝业", exchange: "SSE", market: "CN" }],
          "鵰沙矿业": [{ symbol: "601899.SS", name: "Zijin Mining", cnName: "紫金矿业", exchange: "SSE", market: "CN" }, { symbol: "2899.HK", name: "Zijin Mining", cnName: "紫金矿业", exchange: "HKEX", market: "HK" }],
          "紫金矿业": [{ symbol: "601899.SS", name: "Zijin Mining", cnName: "紫金矿业", exchange: "SSE", market: "CN" }],
          "当升能源": [{ symbol: "600111.SS", name: "China Northern Rare Earth", cnName: "北方稀土", exchange: "SSE", market: "CN" }],
          "北方稀土": [{ symbol: "600111.SS", name: "China Northern Rare Earth", cnName: "北方稀土", exchange: "SSE", market: "CN" }],
          "埃克森美": [{ symbol: "XOM", name: "Exxon Mobil", cnName: "埃克森美石油", exchange: "NYSE", market: "US" }],
          "埃克森美石油": [{ symbol: "XOM", name: "Exxon Mobil", cnName: "埃克森美石油", exchange: "NYSE", market: "US" }],
          "诺德石油": [{ symbol: "CVX", name: "Chevron", cnName: "雪佛龙石油", exchange: "NYSE", market: "US" }],
          "雪佛龙石油": [{ symbol: "CVX", name: "Chevron", cnName: "雪佛龙石油", exchange: "NYSE", market: "US" }],

          // ── 消费/零售 ──
          "永辉流行": [{ symbol: "YSX", name: "Yonghui Superstores", cnName: "永辉超市", exchange: "SSE", market: "CN" }],
          "永辉超市": [{ symbol: "601933.SS", name: "Yonghui Superstores", cnName: "永辉超市", exchange: "SSE", market: "CN" }],
          "高弹集团": [{ symbol: "002572.SZ", name: "Gaopeng Group", cnName: "高弹集团", exchange: "SZSE", market: "CN" }],
          "海天味业": [{ symbol: "603288.SS", name: "Foshan Haitian Flavouring", cnName: "海天味业", exchange: "SSE", market: "CN" }],
          "伊利洗流行": [{ symbol: "600887.SS", name: "Inner Mongolia Yili", cnName: "伊利股份", exchange: "SSE", market: "CN" }],
          "伊利股份": [{ symbol: "600887.SS", name: "Inner Mongolia Yili", cnName: "伊利股份", exchange: "SSE", market: "CN" }],
          "蒙牛乳业": [{ symbol: "2319.HK", name: "China Mengniu Dairy", cnName: "蒙牛乳业", exchange: "HKEX", market: "HK" }],
          "中国海大化工": [{ symbol: "600309.SS", name: "Wanhua Chemical", cnName: "万华化学", exchange: "SSE", market: "CN" }],
          "万华化学": [{ symbol: "600309.SS", name: "Wanhua Chemical", cnName: "万华化学", exchange: "SSE", market: "CN" }],
          "青岛啊哈啤酒": [{ symbol: "600600.SS", name: "Tsingtao Brewery", cnName: "青岛啊哈啤酒", exchange: "SSE", market: "CN" }, { symbol: "168.HK", name: "Tsingtao Brewery", cnName: "青岛啊哈啤酒", exchange: "HKEX", market: "HK" }],
          "青岛啊哈": [{ symbol: "600600.SS", name: "Tsingtao Brewery", cnName: "青岛啊哈啤酒", exchange: "SSE", market: "CN" }],
          "华润万家": [{ symbol: "000568.SZ", name: "Luzhou Laojiao", cnName: "泸州老窖", exchange: "SZSE", market: "CN" }],
          "泸州老窖": [{ symbol: "000568.SZ", name: "Luzhou Laojiao", cnName: "泸州老窖", exchange: "SZSE", market: "CN" }],
          "山西汾水": [{ symbol: "600596.SS", name: "Shanxi Fenjiu", cnName: "汾酒股份", exchange: "SSE", market: "CN" }],
          "汾酒股份": [{ symbol: "600596.SS", name: "Shanxi Fenjiu", cnName: "汾酒股份", exchange: "SSE", market: "CN" }],
          "古井贡酒": [{ symbol: "000596.SZ", name: "Gujing Distillery", cnName: "古井贡酒", exchange: "SZSE", market: "CN" }],
          "沃尔玛特": [{ symbol: "WMT", name: "Walmart Inc", cnName: "沃尔玛特", exchange: "NYSE", market: "US" }],
          "亚马逊中国": [{ symbol: "AMZN", name: "Amazon.com Inc", cnName: "亚马逊", exchange: "NASDAQ", market: "US" }],

          // ── 医药/医疗 ──
          "中国生物制药": [{ symbol: "1177.HK", name: "Sino Biopharmaceutical", cnName: "中国生物制药", exchange: "HKEX", market: "HK" }],
          "复星医药": [{ symbol: "002294.SZ", name: "Humanwell Healthcare", cnName: "人福医药", exchange: "SZSE", market: "CN" }],
          "人福医药": [{ symbol: "600079.SS", name: "Humanwell Healthcare", cnName: "人福医药", exchange: "SSE", market: "CN" }],
          "中国医药": [{ symbol: "1093.HK", name: "CSPC Pharmaceutical", cnName: "石药集团", exchange: "HKEX", market: "HK" }],
          "石药集团": [{ symbol: "1093.HK", name: "CSPC Pharmaceutical", cnName: "石药集团", exchange: "HKEX", market: "HK" }],
          "沃涎巴德": [{ symbol: "PFE", name: "Pfizer Inc", cnName: "辉瑞制药", exchange: "NYSE", market: "US" }],
          "辉瑞制药": [{ symbol: "PFE", name: "Pfizer Inc", cnName: "辉瑞制药", exchange: "NYSE", market: "US" }],
          "强生制药": [{ symbol: "JNJ", name: "Johnson & Johnson", cnName: "约翰逊逊", exchange: "NYSE", market: "US" }],
          "约翰逊逊": [{ symbol: "JNJ", name: "Johnson & Johnson", cnName: "约翰逊逊", exchange: "NYSE", market: "US" }],
          "小源制药": [{ symbol: "MRNA", name: "Moderna Inc", cnName: "莫德纳", exchange: "NASDAQ", market: "US" }],
          "莫德纳": [{ symbol: "MRNA", name: "Moderna Inc", cnName: "莫德纳", exchange: "NASDAQ", market: "US" }],

          // ── 金融/保险 ──
          "中国人寿": [{ symbol: "601628.SS", name: "China Life Insurance", cnName: "中国人寿", exchange: "SSE", market: "CN" }, { symbol: "2628.HK", name: "China Life Insurance", cnName: "中国人寿", exchange: "HKEX", market: "HK" }],
          "中国太保": [{ symbol: "601601.SS", name: "China Pacific Insurance", cnName: "中国太保", exchange: "SSE", market: "CN" }, { symbol: "2601.HK", name: "China Pacific Insurance", cnName: "中国太保", exchange: "HKEX", market: "HK" }],
          "中国人保": [{ symbol: "1339.HK", name: "PICC Group", cnName: "中国人保", exchange: "HKEX", market: "HK" }],
          "中信证券": [{ symbol: "600030.SS", name: "CITIC Securities", cnName: "中信证券", exchange: "SSE", market: "CN" }, { symbol: "6030.HK", name: "CITIC Securities", cnName: "中信证券", exchange: "HKEX", market: "HK" }],
          "国泰君安": [{ symbol: "601211.SS", name: "Guotai Junan Securities", cnName: "国泰君安", exchange: "SSE", market: "CN" }],
          "海通证券": [{ symbol: "600837.SS", name: "Haitong Securities", cnName: "海通证券", exchange: "SSE", market: "CN" }],
          "华泰证券": [{ symbol: "601688.SS", name: "Huatai Securities", cnName: "华泰证券", exchange: "SSE", market: "CN" }],
          "高盛证券": [{ symbol: "600859.SS", name: "GF Securities", cnName: "广发证券", exchange: "SSE", market: "CN" }],
          "广发证券": [{ symbol: "000776.SZ", name: "GF Securities", cnName: "广发证券", exchange: "SZSE", market: "CN" }],
          "高盛高盛": [{ symbol: "GS", name: "Goldman Sachs", cnName: "高盛集团", exchange: "NYSE", market: "US" }],
          "高盛集团": [{ symbol: "GS", name: "Goldman Sachs", cnName: "高盛集团", exchange: "NYSE", market: "US" }],
          "摩根大通": [{ symbol: "MS", name: "Morgan Stanley", cnName: "摩根大通", exchange: "NYSE", market: "US" }],
          "摩根大通天津": [{ symbol: "MS", name: "Morgan Stanley", cnName: "摩根大通", exchange: "NYSE", market: "US" }],
          "花旗銀行": [{ symbol: "C", name: "Citigroup Inc", cnName: "花旗銀行", exchange: "NYSE", market: "US" }],
          "美国銀行": [{ symbol: "BAC", name: "Bank of America", cnName: "美国銀行", exchange: "NYSE", market: "US" }],
          "摩根大通天津公司": [{ symbol: "JPM", name: "JPMorgan Chase", cnName: "摩根大通", exchange: "NYSE", market: "US" }],
          "摩根大通公司": [{ symbol: "JPM", name: "JPMorgan Chase", cnName: "摩根大通", exchange: "NYSE", market: "US" }],
          "JPMorgan": [{ symbol: "JPM", name: "JPMorgan Chase", cnName: "摩根大通", exchange: "NYSE", market: "US" }],
          "巴克莱": [{ symbol: "BRKB", name: "Berkshire Hathaway", cnName: "伯克希尔哈撒韦", exchange: "NYSE", market: "US" }],
          "伯克希尔": [{ symbol: "BRK.B", name: "Berkshire Hathaway", cnName: "伯克希尔哈撒韦", exchange: "NYSE", market: "US" }],
          "巴菲特": [{ symbol: "BRK.B", name: "Berkshire Hathaway", cnName: "伯克希尔哈撒韦", exchange: "NYSE", market: "US" }],

          // ── 科技/半导体 ──
          "中兴通讯": [{ symbol: "000063.SZ", name: "ZTE Corp", cnName: "中兴通讯", exchange: "SZSE", market: "CN" }, { symbol: "763.HK", name: "ZTE Corp", cnName: "中兴通讯", exchange: "HKEX", market: "HK" }],
          "中兴": [{ symbol: "000063.SZ", name: "ZTE Corp", cnName: "中兴通讯", exchange: "SZSE", market: "CN" }],
          "南方电网": [{ symbol: "600116.SS", name: "Three Gorges Energy", cnName: "长江三峡能源", exchange: "SSE", market: "CN" }],
          "长江电力": [{ symbol: "600900.SS", name: "China Yangtze Power", cnName: "长江电力", exchange: "SSE", market: "CN" }],
          "长江三峡": [{ symbol: "600900.SS", name: "China Yangtze Power", cnName: "长江电力", exchange: "SSE", market: "CN" }],
          "华能电力": [{ symbol: "902.HK", name: "China Resources Power", cnName: "华能电力", exchange: "HKEX", market: "HK" }],
          "华天科技": [{ symbol: "000725.SZ", name: "BOE Technology", cnName: "京东方科技", exchange: "SZSE", market: "CN" }],
          "京东方科技": [{ symbol: "000725.SZ", name: "BOE Technology", cnName: "京东方科技", exchange: "SZSE", market: "CN" }],
          "安防科技": [{ symbol: "002916.SZ", name: "Shenzhen Inovance", cnName: "汇川科技", exchange: "SZSE", market: "CN" }],
          "汇川科技": [{ symbol: "300124.SZ", name: "Shenzhen Inovance", cnName: "汇川科技", exchange: "SZSE", market: "CN" }],
          "中联重科": [{ symbol: "300024.SZ", name: "Siasun Robot", cnName: "新松机器人", exchange: "SZSE", market: "CN" }],
          "新松机器人": [{ symbol: "300024.SZ", name: "Siasun Robot", cnName: "新松机器人", exchange: "SZSE", market: "CN" }],
          "立讯信息": [{ symbol: "000100.SZ", name: "TCL Technology", cnName: "TCL科技", exchange: "SZSE", market: "CN" }],
          "TCL科技": [{ symbol: "000100.SZ", name: "TCL Technology", cnName: "TCL科技", exchange: "SZSE", market: "CN" }],
          "工业富联": [{ symbol: "002049.SZ", name: "Unigroup Guoxin", cnName: "紫光国芯", exchange: "SZSE", market: "CN" }],
          "紫光国芯": [{ symbol: "002049.SZ", name: "Unigroup Guoxin", cnName: "紫光国芯", exchange: "SZSE", market: "CN" }],
          "华为技术": [{ symbol: "002502.SZ", name: "Huawei Technologies", cnName: "华为技术", exchange: "SZSE", market: "CN" }],
          "微博": [{ symbol: "WB", name: "Weibo Corp", cnName: "微博", exchange: "NASDAQ", market: "US" }],
          "押注平台": [{ symbol: "LAIX", name: "LAIX Inc", cnName: "押注平台", exchange: "NYSE", market: "US" }],
          "满帮": [{ symbol: "MANU", name: "Manchester United", cnName: "曼彻斯特联队", exchange: "NYSE", market: "US" }],

          // ── 房地产 ──
          "中国恒大集团": [{ symbol: "3333.HK", name: "China Evergrande Group", cnName: "中国恒大", exchange: "HKEX", market: "HK" }],
          "万科地产": [{ symbol: "000002.SZ", name: "Vanke Co., Ltd.", cnName: "万科A", exchange: "SZSE", market: "CN" }],
          "保利地产": [{ symbol: "600048.SS", name: "Poly Developments", cnName: "保利发展", exchange: "SSE", market: "CN" }],
          "保利发展": [{ symbol: "600048.SS", name: "Poly Developments", cnName: "保利发展", exchange: "SSE", market: "CN" }],
          "金地商业": [{ symbol: "600383.SS", name: "Gemdale Corp", cnName: "金地商业", exchange: "SSE", market: "CN" }],
          "新城发展": [{ symbol: "000002.SZ", name: "Vanke Co., Ltd.", cnName: "万科A", exchange: "SZSE", market: "CN" }],
          "建发股份": [{ symbol: "600153.SS", name: "Jianfa Group", cnName: "建发股份", exchange: "SSE", market: "CN" }],

          // ── 新能源/电动车 ──
          "小鹏": [{ symbol: "XPEV", name: "XPeng Inc", cnName: "小鹏汽车", exchange: "NYSE", market: "US" }],
          "小鹏汽车公司": [{ symbol: "XPEV", name: "XPeng Inc", cnName: "小鹏汽车", exchange: "NYSE", market: "US" }],
          "小鹏小鹏": [{ symbol: "XPEV", name: "XPeng Inc", cnName: "小鹏汽车", exchange: "NYSE", market: "US" }],
          "理想": [{ symbol: "LI", name: "Li Auto Inc", cnName: "理想汽车", exchange: "NASDAQ", market: "US" }],
          "中山车业": [{ symbol: "601633.SS", name: "Great Wall Motor", cnName: "长城汽车", exchange: "SSE", market: "CN" }, { symbol: "2333.HK", name: "Great Wall Motor", cnName: "长城汽车", exchange: "HKEX", market: "HK" }],
          "长城汽车": [{ symbol: "601633.SS", name: "Great Wall Motor", cnName: "长城汽车", exchange: "SSE", market: "CN" }],
          "吉利汽车": [{ symbol: "175.HK", name: "Geely Automobile", cnName: "吉利汽车", exchange: "HKEX", market: "HK" }],
          "上汽集团": [{ symbol: "600104.SS", name: "SAIC Motor", cnName: "上汽集团", exchange: "SSE", market: "CN" }],
          "一汽解放": [{ symbol: "000800.SZ", name: "FAW Car", cnName: "一汽解放", exchange: "SZSE", market: "CN" }],
          "广汽集团": [{ symbol: "601238.SS", name: "GAC Group", cnName: "广汽集团", exchange: "SSE", market: "CN" }, { symbol: "2238.HK", name: "GAC Group", cnName: "广汽集团", exchange: "HKEX", market: "HK" }],
          "广汽": [{ symbol: "601238.SS", name: "GAC Group", cnName: "广汽集团", exchange: "SSE", market: "CN" }],
          "福特汽车": [{ symbol: "F", name: "Ford Motor", cnName: "福特汽车", exchange: "NYSE", market: "US" }],
          "通用汽车": [{ symbol: "GM", name: "General Motors", cnName: "通用汽车", exchange: "NYSE", market: "US" }],
          "丰田汽车": [{ symbol: "TM", name: "Toyota Motor", cnName: "丰田汽车", exchange: "NYSE", market: "US" }],
          "本田技研": [{ symbol: "HMC", name: "Honda Motor", cnName: "本田技研", exchange: "NYSE", market: "US" }],
          "宝马": [{ symbol: "BMWYY", name: "BMW AG", cnName: "宝马", exchange: "OTC", market: "US" }],
          "大众汽车": [{ symbol: "VWAGY", name: "Volkswagen AG", cnName: "大众汽车", exchange: "OTC", market: "US" }],
        };

        // ── ETF 追踪指数映射表 ──
        const ETF_INDEX_MAP: Record<string, { cnName: string; trackingIndex: string; category: string }> = {
          // 美股宽基指数 ETF
          "SPY":  { cnName: "SPDR标普500 ETF",    trackingIndex: "S&P 500",           category: "ETF" },
          "VOO":  { cnName: "Vanguard标普500 ETF", trackingIndex: "S&P 500",           category: "ETF" },
          "IVV":  { cnName: "iShares标普500 ETF",  trackingIndex: "S&P 500",           category: "ETF" },
          "QQQ":  { cnName: "Invesco纳斯达克100 ETF",  trackingIndex: "Nasdaq-100",       category: "ETF" },
          "QQQM": { cnName: "Invesco纳斯达克100 ETF(小)",trackingIndex: "Nasdaq-100",       category: "ETF" },
          "VTI":  { cnName: "Vanguard全市场 ETF",   trackingIndex: "CRSP US Total Market",category: "ETF" },
          "IWM":  { cnName: "iShares罗珀2000 ETF",  trackingIndex: "Russell 2000",      category: "ETF" },
          "MDY":  { cnName: "SPDR中盘股 ETF",     trackingIndex: "S&P MidCap 400",    category: "ETF" },
          "DIA":  { cnName: "SPDR道琼工业 ETF",  trackingIndex: "Dow Jones Industrial",category: "ETF" },
          // 行业 ETF
          "XLK":  { cnName: "SPDR科技行业 ETF",   trackingIndex: "S&P Technology",    category: "ETF" },
          "XLF":  { cnName: "SPDR金融行业 ETF",   trackingIndex: "S&P Financials",    category: "ETF" },
          "XLE":  { cnName: "SPDR能源行业 ETF",   trackingIndex: "S&P Energy",        category: "ETF" },
          "XLV":  { cnName: "SPDR医疗行业 ETF",   trackingIndex: "S&P Health Care",   category: "ETF" },
          "XLI":  { cnName: "SPDR工业行业 ETF",   trackingIndex: "S&P Industrials",   category: "ETF" },
          "XLY":  { cnName: "SPDR可选消费 ETF",   trackingIndex: "S&P Consumer Disc", category: "ETF" },
          "XLP":  { cnName: "SPDR必需消费 ETF",   trackingIndex: "S&P Consumer Staples",category: "ETF" },
          "XLU":  { cnName: "SPDR公用事业 ETF",   trackingIndex: "S&P Utilities",     category: "ETF" },
          "XLB":  { cnName: "SPDR材料行业 ETF",   trackingIndex: "S&P Materials",     category: "ETF" },
          "XLC":  { cnName: "SPDR通信服务 ETF",   trackingIndex: "S&P Communication", category: "ETF" },
          "XLRE": { cnName: "SPDR房地产 ETF",     trackingIndex: "S&P Real Estate",    category: "ETF" },
          // 国际/新兴市场 ETF
          "EEM":  { cnName: "iShares新兴市场 ETF",  trackingIndex: "MSCI Emerging Markets",category: "ETF" },
          "VWO":  { cnName: "Vanguard新兴市场 ETF", trackingIndex: "FTSE Emerging Markets",category: "ETF" },
          "VEA":  { cnName: "Vanguard已开发市场 ETF",trackingIndex: "FTSE Developed ex-US",category: "ETF" },
          "EFA":  { cnName: "iShares已开发市场 ETF",trackingIndex: "MSCI EAFE",          category: "ETF" },
          "FXI":  { cnName: "iShares中国大盘股 ETF",trackingIndex: "FTSE China 50",      category: "ETF" },
          "MCHI": { cnName: "iShares MSCI中国 ETF",   trackingIndex: "MSCI China",         category: "ETF" },
          "KWEB": { cnName: "KraneShares中国互联网 ETF",trackingIndex: "CSI Overseas China Internet",category: "ETF" },
          "ASHR": { cnName: "Xtrackers A股 ETF",      trackingIndex: "CSI 300",            category: "ETF" },
          "CQQQ": { cnName: "Invesco中国科技 ETF",  trackingIndex: "AlphaShares China Technology",category: "ETF" },
          "INDA": { cnName: "iShares MSCI印度 ETF",   trackingIndex: "MSCI India",         category: "ETF" },
          "IEMG": { cnName: "iShares新兴市场核心 ETF",trackingIndex: "MSCI Emerging Markets IMI",category: "ETF" },
          // 商品/实物 ETF
          "GLD":  { cnName: "SPDR黄金 ETF",      trackingIndex: "Gold Spot Price",    category: "ETF" },
          "IAU":  { cnName: "iShares黄金 ETF",    trackingIndex: "Gold Spot Price",    category: "ETF" },
          "SLV":  { cnName: "iShares白銀 ETF",    trackingIndex: "Silver Spot Price",  category: "ETF" },
          "GDX":  { cnName: "VanEck金矿 ETF",     trackingIndex: "NYSE Arca Gold Miners",category: "ETF" },
          "USO":  { cnName: "United States Oil ETF",  trackingIndex: "WTI Crude Oil",     category: "ETF" },
          "UNG":  { cnName: "United States Natural Gas ETF",trackingIndex: "Natural Gas",      category: "ETF" },
          // 固收益/利率 ETF
          "TLT":  { cnName: "iShares 20+年国库券 ETF",trackingIndex: "ICE US Treasury 20+ Year",category: "ETF" },
          "IEF":  { cnName: "iShares 7-10年国库券 ETF",trackingIndex: "ICE US Treasury 7-10 Year",category: "ETF" },
          "SHY":  { cnName: "iShares 1-3年国库券 ETF",trackingIndex: "ICE US Treasury 1-3 Year",category: "ETF" },
          "AGG":  { cnName: "iShares综合市场应应 ETF",trackingIndex: "Bloomberg US Aggregate Bond",category: "ETF" },
          "BND":  { cnName: "Vanguard综合市场应应 ETF",trackingIndex: "Bloomberg US Aggregate Bond",category: "ETF" },
          "HYG":  { cnName: "iShares高收益企业应应 ETF",trackingIndex: "Markit iBoxx USD Liquid HY",category: "ETF" },
          "LQD":  { cnName: "iShares投资级企业应应 ETF",trackingIndex: "Markit iBoxx USD Liquid IG",category: "ETF" },
          // 成长/价值 ETF
          "VIG":  { cnName: "Vanguard股息增长 ETF",  trackingIndex: "S&P US Dividend Growers",category: "ETF" },
          "VYM":  { cnName: "Vanguard高股息 ETF",     trackingIndex: "FTSE High Dividend Yield",category: "ETF" },
          "SCHD": { cnName: "Schwab美股股息 ETF",   trackingIndex: "Dow Jones US Dividend 100",category: "ETF" },
          "DGRO": { cnName: "iShares核心股息增长 ETF",trackingIndex: "Morningstar US Dividend Growth",category: "ETF" },
          "NOBL": { cnName: "ProShares股息贵族 ETF",trackingIndex: "S&P 500 Dividend Aristocrats",category: "ETF" },
          // 主题/创新 ETF
          "ARKK": { cnName: "ARK创新 ETF",        trackingIndex: "ARK Innovation",     category: "ETF" },
          "ARKG": { cnName: "ARK基因组学革命 ETF",  trackingIndex: "ARK Genomic Revolution",category: "ETF" },
          "ARKW": { cnName: "ARK下一代互联网 ETF",  trackingIndex: "ARK Next Generation Internet",category: "ETF" },
          "ARKF": { cnName: "ARK金融科技 ETF",    trackingIndex: "ARK Fintech Innovation",category: "ETF" },
          "ARKQ": { cnName: "ARK自动化技术 ETF",  trackingIndex: "ARK Autonomous Technology",category: "ETF" },
          "BOTZ": { cnName: "Global X机器人 ETF",   trackingIndex: "Indxx Global Robotics & AI",category: "ETF" },
          "ROBO": { cnName: "ROBO Global机器人 ETF",  trackingIndex: "ROBO Global Robotics & Automation",category: "ETF" },
          "SOXX": { cnName: "iShares半导体 ETF",    trackingIndex: "ICE Semiconductor",  category: "ETF" },
          "SMH":  { cnName: "VanEck半导体 ETF",     trackingIndex: "MVIS US Listed Semiconductor",category: "ETF" },
          "SOXL": { cnName: "Direxion半导体3倍多 ETF",trackingIndex: "ICE Semiconductor 3x",category: "ETF" },
          // 杠杆/指数多空 ETF
          "TQQQ": { cnName: "ProShares纳斯达克1003倍多 ETF",trackingIndex: "Nasdaq-100 3x",      category: "ETF" },
          "UPRO": { cnName: "ProShares标普5003倍多 ETF",trackingIndex: "S&P 500 3x",         category: "ETF" },
          "SPXU": { cnName: "ProShares标普5003倍空 ETF",trackingIndex: "S&P 500 -3x",        category: "ETF" },
          "SQQQ": { cnName: "ProShares纳斯达克1003倍空 ETF",trackingIndex: "Nasdaq-100 -3x",     category: "ETF" },
          // 房地产 ETF
          "VNQ":  { cnName: "Vanguard房地产 ETF",    trackingIndex: "MSCI US REIT",       category: "ETF" },
          "IYR":  { cnName: "iShares房地产 ETF",    trackingIndex: "Dow Jones US Real Estate",category: "ETF" },
        };

        // ── 拼音首字母映射表（拼音缩写 → 中文名称） ──
        const PINYIN_MAP: Record<string, string[]> = {
          // 科技巨头
          "yjd": ["英伟达"],  "nvda": ["英伟达"],
          "pg": ["苹果"],  "apple": ["苹果"],
          "tsla": ["特斯拉"],
          "msft": ["微软"],  "gg": ["谷歌"],
          "amzn": ["亚马逊"],
          "meta": ["Meta"],  "fb": ["Meta"],
          "nflx": ["奈飞"],
          "intc": ["英特尔"],
          "qcom": ["高通"],
          "tsm": ["台积电"],
          // 中国科技
          "tx": ["腾讯"],  "tencent": ["腾讯"],
          "ali": ["阿里"],  "alibaba": ["阿里巴巴"],
          "bidu": ["百度"],  "baidu": ["百度"],
          "jd": ["京东"],
          "pdd": ["拼多多"],
          "ntes": ["网易"],  "netease": ["网易"],
          "xm": ["小米"],  "xiaomi": ["小米"],
          "mt": ["茅台"],  "moutai": ["茅台"],
          "byd": ["比亚迪"],
          "catl": ["宁德时代"],
          "nio": ["蔚来"],
          "li": ["理想汽车"],
          "xpev": ["小鹏汽车"],
          "bili": ["哔哩哔哩"],  "bilibili": ["哔哩哔哩"],
          "tcom": ["携程"],  "ctrip": ["携程"],
          // 港股
          "hsbc": ["汇丰控股"],
          "aia": ["友邦保险"],
          "hkex": ["港交所"],
          // 金融
          "gs": ["高盛集团"],  "goldman": ["高盛集团"],
          "ms": ["摩根大通"],  "morgan": ["摩根大通"],
          "jpm": ["摩根大通"],  "jpmorgan": ["摩根大通"],
          "bac": ["美国銀行"],
          "c": ["花旗銀行"],
          "brk": ["巴菲特"],  "berkshire": ["伯克希尔"],
          // 能源
          "xom": ["埃克森美石油"],  "exxon": ["埃克森美石油"],
          "cvx": ["雪佛龙石油"],  "chevron": ["雪佛龙石油"],
          // 汽车
          "tsla2": ["特斯拉"],
          "tm": ["丰田汽车"],  "toyota": ["丰田汽车"],
          "hmc": ["本田技研"],  "honda": ["本田技研"],
          "f": ["福特汽车"],  "ford": ["福特汽车"],
          "gm": ["通用汽车"],
          // 加密
          "btc": ["比特币"],  "bitcoin": ["比特币"],
          "eth": ["以太坊"],  "ethereum": ["以太坊"],
          // ETF 拼音
          "spy": ["标普500 ETF"],
          "qqq": ["纳斯达克100 ETF"],
          "voo": ["标普500 ETF"],
          "gld": ["黄金 ETF"],
          "tlt": ["长期国库券 ETF"],
          "arkk": ["ARK创新 ETF"],
        };

        // 检查是否包含中文字符
        const hasChinese = /[\u4e00-\u9fff]/.test(q);

        // 拼音首字母搜索：纯英文且在拼音映射表中
        const qLower = q.toLowerCase();
        if (!hasChinese && PINYIN_MAP[qLower]) {
          // 将拼音映射的中文名称转化为搜索结果
          const cnMatches: TickerEntry[] = [];
          for (const cnKey of PINYIN_MAP[qLower]) {
            for (const [key, vals] of Object.entries(CN_NAME_MAP)) {
              if (key === cnKey || key.includes(cnKey) || cnKey.includes(key)) {
                cnMatches.push(...vals);
              }
            }
          }
          const seen = new Set<string>();
          const unique = cnMatches.filter(m => {
            if (seen.has(m.symbol)) return false;
            seen.add(m.symbol);
            return true;
          });
          if (unique.length > 0) {
            return unique.map(m => ({
              symbol: m.symbol,
              name: m.name,
              cnName: m.cnName,
              exchange: m.exchange,
              market: m.market,
              type: ETF_INDEX_MAP[m.symbol] ? "ETF" : "Common Stock",
              etfIndex: ETF_INDEX_MAP[m.symbol]?.trackingIndex,
            }));
          }
        }

        // ETF 代码直接搜索（如输入 SPY、QQQ 等）
        const qUpper = q.toUpperCase();
        if (!hasChinese && ETF_INDEX_MAP[qUpper]) {
          const etfInfo = ETF_INDEX_MAP[qUpper];
          return [{
            symbol: qUpper,
            name: etfInfo.cnName,
            cnName: etfInfo.cnName,
            exchange: "NASDAQ",
            market: "US",
            type: "ETF",
            etfIndex: etfInfo.trackingIndex,
          }];
        }

        // 中文搜索：直接从映射表返回
        if (hasChinese) {
          const matches: typeof CN_NAME_MAP[string] = [];
          for (const [key, vals] of Object.entries(CN_NAME_MAP)) {
            if (key.includes(q) || q.includes(key)) {
              matches.push(...vals);
            }
          }
          // 去重
          const seen = new Set<string>();
          const unique = matches.filter(m => {
            if (seen.has(m.symbol)) return false;
            seen.add(m.symbol);
            return true;
          });
          return unique.map(m => ({
            symbol: m.symbol,
            name: m.name,
            cnName: m.cnName,
            exchange: m.exchange,
            market: m.market,
            type: ETF_INDEX_MAP[m.symbol] ? "ETF" : "Common Stock",
            etfIndex: ETF_INDEX_MAP[m.symbol]?.trackingIndex,
          }));
        }

        // 英文/代码搜索：并行调用 Finnhub + FMP
        type SearchResult = { symbol: string; name: string; cnName?: string; exchange: string; market: string; type: string; etfIndex?: string };

        const EXCHANGE_MARKET_MAP: Record<string, string> = {
          NASDAQ: "US", NYSE: "US", AMEX: "US", OTC: "US",
          HKEX: "HK", "HONG KONG": "HK",
          SSE: "CN", SHH: "CN", SZSE: "CN", SHZ: "CN",
          TSX: "CA", LSE: "GB", FSE: "DE", TYO: "JP", KRX: "KR",
          Crypto: "CRYPTO",
        };

        const getMarket = (exchange: string): string => {
          const upper = exchange.toUpperCase();
          for (const [key, mkt] of Object.entries(EXCHANGE_MARKET_MAP)) {
            if (upper.includes(key)) return mkt;
          }
          // 从 symbol 后缀推断
          if (q.endsWith(".HK") || q.match(/^\d{3,5}\.HK$/i)) return "HK";
          if (q.endsWith(".SS") || q.endsWith(".SZ")) return "CN";
          return "OTHER";
        };

        // 从中文映射表反查 cnName
        const getCnName = (symbol: string): string | undefined => {
          for (const vals of Object.values(CN_NAME_MAP)) {
            const match = vals.find(v => v.symbol === symbol);
            if (match) return match.cnName;
          }
          return undefined;
        };

        const [finnhubRes, fmpRes] = await Promise.allSettled([
          // Finnhub search
          (async () => {
            const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${ENV.FINNHUB_API_KEY}`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
            const data = await resp.json() as { result?: Array<{ symbol: string; description: string; type: string; displaySymbol: string }> };
            return (data.result ?? []).slice(0, 12).map(r => {
              const sym = r.symbol;
              // 推断市场
              let market = "US";
              if (sym.endsWith(".HK") || /^\d{3,5}\.HK$/.test(sym)) market = "HK";
              else if (sym.endsWith(".SS") || sym.endsWith(".SZ")) market = "CN";
              else if (sym.endsWith(".T") || sym.endsWith(".TYO")) market = "JP";
              else if (sym.endsWith(".KS")) market = "KR";
              else if (sym.endsWith(".L")) market = "GB";
              else if (sym.endsWith(".DE") || sym.endsWith(".F") || sym.endsWith(".MU")) market = "DE";
              else if (sym.endsWith(".PA")) market = "FR";
              else if (sym.endsWith(".TO")) market = "CA";
              const exchange = market === "HK" ? "HKEX" : market === "CN" ? (sym.endsWith(".SS") ? "SSE" : "SZSE") : market;
              const isEtf = ETF_INDEX_MAP[sym];
              return {
                symbol: sym,
                name: r.description,
                cnName: getCnName(sym) ?? isEtf?.cnName,
                exchange,
                market,
                type: isEtf ? "ETF" : (r.type || "Common Stock"),
                etfIndex: isEtf?.trackingIndex,
              } as SearchResult;
            });
          })(),
          // FMP search
          (async () => {
            const url = `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(q)}&limit=10&apikey=${ENV.FMP_API_KEY}`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
            const data = await resp.json() as Array<{ symbol: string; name: string; exchange: string; exchangeFullName: string }>;
            if (!Array.isArray(data)) return [];
            return data.slice(0, 10).map(r => {
              const market = getMarket(r.exchange ?? "");
              const isEtf = ETF_INDEX_MAP[r.symbol];
              return {
                symbol: r.symbol,
                name: r.name,
                cnName: getCnName(r.symbol) ?? isEtf?.cnName,
                exchange: r.exchange ?? "UNKNOWN",
                market,
                type: isEtf ? "ETF" : "Common Stock",
                etfIndex: isEtf?.trackingIndex,
              } as SearchResult;
            });
          })(),
        ]);

        const finnhubList = finnhubRes.status === "fulfilled" ? finnhubRes.value : [];
        const fmpList = fmpRes.status === "fulfilled" ? fmpRes.value : [];

        // 合并去重，优先 Finnhub（更准确），FMP 补充
        const seen = new Set<string>();
        const merged: SearchResult[] = [];

        // 市场优先级排序函数
        const marketPriority = (m: string) => {
          const order: Record<string, number> = { US: 1, HK: 2, CN: 3, CRYPTO: 4, GB: 5, JP: 6, KR: 7, OTHER: 99 };
          return order[m] ?? 99;
        };

        const allResults = [...finnhubList, ...fmpList];
        // 按市场优先级排序
        allResults.sort((a, b) => marketPriority(a.market) - marketPriority(b.market));

        for (const r of allResults) {
          if (!seen.has(r.symbol)) {
            seen.add(r.symbol);
            merged.push(r);
          }
        }

        // 过滤掉明显不相关的结果（如德国/奥地利等欧洲交易所的重复上市）
        // 保留主要市场结果，最多返回 15 条
        const filtered = merged
          .filter(r => {
            // 过滤掉德国/奥地利/法国交易所的重复上市（除非用户明确搜索这些市场）
            const isEuropeanDuplicate = r.symbol.endsWith(".DE") || r.symbol.endsWith(".F") ||
              r.symbol.endsWith(".MU") || r.symbol.endsWith(".VI") || r.symbol.endsWith(".PA") ||
              r.symbol.endsWith(".TG") || r.symbol.endsWith(".DU");
            if (isEuropeanDuplicate && r.market === "DE") return false;
            return true;
          })
          .slice(0, 15);

        return filtered;
      }),
  }),

  // ── LEVEL2E: Telemetry Dashboard Routes ─────────────────────────────────────────────────
  telemetry: router({
    // Get recent loop telemetry rows for dashboard
    getLoopStats: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return { rows: [], summary: null };
        const { loopTelemetry } = await import("../drizzle/schema");
        const { desc } = await import("drizzle-orm");
        const rows = await db
          .select()
          .from(loopTelemetry)
          .orderBy(desc(loopTelemetry.createdAt))
          .limit(input.limit);
        // Compute summary stats
        const total = rows.length;
        if (total === 0) return { rows: [], summary: null };
        type TRow = typeof rows[number];
        const triggered = rows.filter((r: TRow) => r.triggerType !== "no_trigger").length;
        const verdictChangedCount = rows.filter((r: TRow) => r.verdictChanged === 1).length;
        const avgDelta = rows.reduce((s: number, r: TRow) => s + Number(r.evidenceDelta), 0) / total;
        const triggerTypeDistribution: Record<string, number> = {};
        for (const r of rows) {
          triggerTypeDistribution[r.triggerType] = (triggerTypeDistribution[r.triggerType] ?? 0) + 1;
        }
        return {
          rows,
          summary: {
            total,
            triggered,
            triggerRate: triggered / total,
            verdictChangedCount,
            verdictChangeRate: verdictChangedCount / Math.max(triggered, 1),
            avgEvidenceDelta: avgDelta,
            triggerTypeDistribution,
          },
        };
      }),
  }),

});

export type AppRouter = typeof appRouter;

// NOTE: netWorth router appended below the closing }); of appRouter
// This is a workaround - the actual router needs to be added inside appRouter
