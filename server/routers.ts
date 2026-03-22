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
import { searchForTask, isTavilyConfigured, getTavilyKeyStatuses } from "./tavilySearch";
import { getStockFullData as getFinnhubData, formatFinnhubData, checkHealth as checkFinnhubHealth } from "./finnhubApi";
import { getStockData as getAlphaVantageStockData, getEconomicData as getAlphaVantageEconomicData, formatStockData as formatAVStockData, formatEconomicData as formatAVEconomicData, checkHealth as checkAVHealth, getTechnicalIndicators, formatTechnicalIndicators } from "./alphaVantageApi";
import { getStockFullData as getPolygonData, formatPolygonData, checkHealth as checkPolygonHealth, getOptionsChain, formatOptionsChain } from "./polygonApi";
import { getStockFullData as getFmpData, formatFmpData, checkHealth as checkFmpHealth } from "./fmpApi";
import { getStockFullData as getSecData, formatSecData, checkHealth as checkSecHealth } from "./secEdgarApi";
import { getCryptoData, formatCryptoData, isCryptoTask, pingCoinGecko } from "./coinGeckoApi";
import { getAStockData, formatAStockData, isAStockTask, extractAStockCodes, pingBaostock } from "./baoStockApi";
import { fetchGdeltData, formatGdeltDataAsMarkdown, checkGdeltHealth } from "./gdeltApi";
import { fetchNewsData, formatNewsDataAsMarkdown, checkNewsApiHealth, extractNewsQuery } from "./newsApi";
import { fetchMarketauxData, formatMarketauxDataAsMarkdown, checkMarketauxHealth } from "./marketauxApi";
import { fetchSimFinData, formatSimFinDataAsMarkdown, checkSimFinHealth } from "./simfinApi";
import { fetchTiingoData, formatTiingoDataAsMarkdown, checkTiingoHealth } from "./tiingoApi";
import { fetchECBData, formatECBDataAsMarkdown, checkECBHealth, isECBRelevantTask } from "./ecbApi";
import { fetchHKEXData, formatHKEXDataAsMarkdown, checkHKEXHealth, isHKStockTask, extractHKStockCode } from "./hkexApi";
import { fetchBoeData, formatBoeDataAsMarkdown, checkBoeHealth, isBoeRelevantTask } from "./boeApi";
import { fetchHkmaData, formatHkmaDataAsMarkdown, checkHkmaHealth, isHkmaRelevantTask } from "./hkmaApi";
import { getCompanyLitigationHistory, formatLitigationAsMarkdown, shouldFetchCourtListener, checkHealth as checkCourtListenerHealth } from "./courtListenerApi";
import { getRelatedLegislation, formatLegislationAsMarkdown, shouldFetchCongress, checkHealth as checkCongressHealth } from "./congressApi";
import { searchEuRegulations, formatEuRegulationsAsMarkdown, shouldFetchEurLex, checkHealth as checkEurLexHealth } from "./eurLexApi";
import { getCompanyLeiInfo, formatGleifAsMarkdown, shouldFetchGleif, checkGleifHealth } from "./gleifApi";

// --- 访问权限检查（Owner 或已授权用户）----------------------------------------

async function requireAccess(userId: number, openId: string) {
  if (openId === ENV.ownerOpenId) return;
  const access = await getUserAccess(userId);
  if (!access) {
    throw new TRPCError({ code: "FORBIDDEN", message: "请先输入访问密码" });
  }
}

// --- 带重试的 invokeLLM 包装（针对上游临时 500 错误）--------------------
// ── 数据源状态缓存（服务端内存缓存，避免每次请求都并行测试所有 API）──────────────
type DataSourceStatusResult = {
  tavily: ReturnType<typeof getTavilyKeyStatuses>;
  tavilyConfigured: boolean;
  fred: { configured: boolean; status: "active" | "error" | "timeout" };
  yahoo: { configured: boolean; status: "active" | "error" | "timeout" };
  worldBank: { configured: boolean; status: "active" | "error" | "timeout" };
  imf: { configured: boolean; status: "active" | "error" | "timeout" };
  finnhub: { configured: boolean; status: "active" | "error" | "timeout" };
  fmp: { configured: boolean; status: "active" | "error" | "timeout" };
  polygon: { configured: boolean; status: "active" | "error" | "timeout" };
  secEdgar: { configured: boolean; status: "active" | "error" | "timeout" };
  alphaVantage: { configured: boolean; status: "active" | "error" | "timeout" };
  coinGecko: { configured: boolean; status: "active" | "error" | "timeout" };
  baostock: { configured: boolean; status: "active" | "error" | "timeout" | "warning" };
  gdelt: { configured: boolean; status: "active" | "error" | "timeout" };
  newsApi: { configured: boolean; status: "active" | "error" | "timeout" };
  marketaux: { configured: boolean; status: "active" | "error" | "timeout" };
  simfin: { configured: boolean; status: "active" | "error" | "timeout" };
  tiingo: { configured: boolean; status: "active" | "error" | "timeout" };
  ecb: { configured: boolean; status: "active" | "error" | "timeout" };
  hkex: { configured: boolean; status: "active" | "error" | "timeout" };
  boe: { configured: boolean; status: "active" | "error" | "timeout" };
  hkma: { configured: boolean; status: "active" | "error" | "timeout" };
  courtListener: { configured: boolean; status: "active" | "error" | "timeout" };
  congress: { configured: boolean; status: "active" | "error" | "timeout" };
  eurLex: { configured: boolean; status: "active" | "error" | "timeout" };
  gleif: { configured: boolean; status: "active" | "error" | "timeout" };
};
let dataSourceStatusCache: DataSourceStatusResult | null = null;
let dataSourceStatusCacheTime = 0;
let dataSourceStatusRefreshing = false;

// 返回一个所有状态为 "error" 的默认值（用于缓存未就绪时的占位）
function buildDefaultDataSourceStatus(): DataSourceStatusResult {
  const err = { configured: true, status: "error" as const };
  return {
    tavily: getTavilyKeyStatuses(),
    tavilyConfigured: isTavilyConfigured(),
    fred: { configured: !!ENV.FRED_API_KEY, status: "error" as const },
    yahoo: { configured: true, status: "error" as const },
    worldBank: err, imf: err,
    finnhub: { configured: !!ENV.FINNHUB_API_KEY, status: "error" as const },
    fmp: { configured: !!ENV.FMP_API_KEY, status: "error" as const },
    polygon: { configured: !!ENV.POLYGON_API_KEY, status: "error" as const },
    secEdgar: err,
    alphaVantage: { configured: !!ENV.ALPHA_VANTAGE_API_KEY, status: "error" as const },
    coinGecko: { configured: !!ENV.COINGECKO_API_KEY, status: "error" as const },
    baostock: { configured: true, status: "warning" as const },
    gdelt: { configured: true, status: "error" as const },
    newsApi: { configured: !!ENV.NEWS_API_KEY, status: "error" as const },
    marketaux: { configured: !!ENV.MARKETAUX_API_KEY, status: "error" as const },
    simfin: { configured: !!ENV.SIMFIN_API_KEY, status: "error" as const },
    tiingo: { configured: !!ENV.TIINGO_API_KEY, status: "error" as const },
    ecb: err, hkex: err, boe: err, hkma: err,
    courtListener: err,
    congress: { configured: !!ENV.CONGRESS_API_KEY, status: "error" as const },
    eurLex: err, gleif: err,
  };
}

// 后台异步刷新数据源状态缓存
async function refreshDataSourceStatusInBackground(): Promise<DataSourceStatusResult> {
  const withTimeout = <T>(p: Promise<T>, fallback: T, ms = 8000): Promise<T> =>
    Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

  const [wbHealth, imfHealth, finnhubHealth, fmpHealth, polygonHealth, secHealth, avHealth, cgHealth, bsHealth, gdeltHealth, newsApiHealth, marketauxHealth, simfinHealth, tiingoHealth, ecbHealth, hkexHealth, boeHealth, hkmaHealth, courtListenerHealth, congressHealth, eurLexHealth, gleifHealth] = await Promise.allSettled([
    // World Bank
    (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(
          "https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.KD.ZG?format=json&mrv=1&per_page=1",
          { signal: controller.signal }
        );
        clearTimeout(timer);
        return res.ok ? "active" as const : "error" as const;
      } catch (e: unknown) {
        clearTimeout(timer);
        const msg = e instanceof Error ? e.message : String(e);
        return (msg.includes("abort") || msg.includes("timeout") ? "timeout" : "error") as "active" | "error" | "timeout";
      }
    })(),
    withTimeout(checkImfApiHealth().then((r) => r.status as "active"|"error"|"timeout"), "timeout" as const),
    withTimeout(ENV.FINNHUB_API_KEY ? checkFinnhubHealth().then(r => r.ok ? "active" as const : "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    withTimeout(ENV.FMP_API_KEY ? checkFmpHealth().then(r => r.ok ? "active" as const : "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    withTimeout(ENV.POLYGON_API_KEY ? checkPolygonHealth().then(r => r.ok ? "active" as const : "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    withTimeout(checkSecHealth().then(r => r.ok ? "active" as const : "error" as const), "timeout" as const),
    withTimeout(ENV.ALPHA_VANTAGE_API_KEY ? checkAVHealth().then(r => r.ok ? "active" as const : "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    withTimeout(ENV.COINGECKO_API_KEY ? pingCoinGecko().then(ok => ok ? "active" as const : "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    withTimeout(pingBaostock().then(ok => ok ? "active" as const : "warning" as const).catch(() => "warning" as const), "warning" as const, 5000),
    Promise.resolve("active" as const),
    withTimeout(ENV.NEWS_API_KEY ? checkNewsApiHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    withTimeout(ENV.MARKETAUX_API_KEY ? checkMarketauxHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    withTimeout(ENV.SIMFIN_API_KEY ? checkSimFinHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    withTimeout(ENV.TIINGO_API_KEY ? checkTiingoHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    withTimeout(checkECBHealth().then(r => r.ok ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
    withTimeout(checkHKEXHealth().then(r => r.ok ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
    withTimeout(checkBoeHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
    withTimeout(checkHkmaHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
    withTimeout(checkCourtListenerHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
    withTimeout(ENV.CONGRESS_API_KEY ? checkCongressHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const) : Promise.resolve("error" as const), "timeout" as const),
    Promise.resolve(checkEurLexHealth().status === "ok" ? "active" as const : "error" as const),
    withTimeout(checkGleifHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
  ]);

  const tavilyKeys = getTavilyKeyStatuses();
  const fredConfigured = !!ENV.FRED_API_KEY;

  const result: DataSourceStatusResult = {
    tavily: tavilyKeys,
    tavilyConfigured: isTavilyConfigured(),
    fred: { configured: fredConfigured, status: fredConfigured ? "active" as const : "error" as const },
    yahoo: { configured: true, status: "active" as const },
    worldBank: { configured: true, status: wbHealth.status === "fulfilled" ? wbHealth.value : "error" as const },
    imf: { configured: true, status: imfHealth.status === "fulfilled" ? imfHealth.value : "error" as const },
    finnhub: { configured: !!ENV.FINNHUB_API_KEY, status: finnhubHealth.status === "fulfilled" ? finnhubHealth.value : "error" as const },
    fmp: { configured: !!ENV.FMP_API_KEY, status: fmpHealth.status === "fulfilled" ? fmpHealth.value : "error" as const },
    polygon: { configured: !!ENV.POLYGON_API_KEY, status: polygonHealth.status === "fulfilled" ? polygonHealth.value : "error" as const },
    secEdgar: { configured: true, status: secHealth.status === "fulfilled" ? secHealth.value : "error" as const },
    alphaVantage: { configured: !!ENV.ALPHA_VANTAGE_API_KEY, status: avHealth.status === "fulfilled" ? avHealth.value : "error" as const },
    coinGecko: { configured: !!ENV.COINGECKO_API_KEY, status: cgHealth.status === "fulfilled" ? cgHealth.value : "error" as const },
    baostock: { configured: true, status: bsHealth.status === "fulfilled" ? bsHealth.value : "warning" as const },
    gdelt: { configured: true, status: gdeltHealth.status === "fulfilled" ? gdeltHealth.value : "active" as const },
    newsApi: { configured: !!ENV.NEWS_API_KEY, status: newsApiHealth.status === "fulfilled" ? newsApiHealth.value : "error" as const },
    marketaux: { configured: !!ENV.MARKETAUX_API_KEY, status: marketauxHealth.status === "fulfilled" ? marketauxHealth.value : "error" as const },
    simfin: { configured: !!ENV.SIMFIN_API_KEY, status: simfinHealth.status === "fulfilled" ? simfinHealth.value : "error" as const },
    tiingo: { configured: !!ENV.TIINGO_API_KEY, status: tiingoHealth.status === "fulfilled" ? tiingoHealth.value : "error" as const },
    ecb: { configured: true, status: ecbHealth.status === "fulfilled" ? ecbHealth.value : "error" as const },
    hkex: { configured: true, status: hkexHealth.status === "fulfilled" ? hkexHealth.value : "error" as const },
    boe: { configured: true, status: boeHealth.status === "fulfilled" ? boeHealth.value : "error" as const },
    hkma: { configured: true, status: hkmaHealth.status === "fulfilled" ? hkmaHealth.value : "error" as const },
    courtListener: { configured: true, status: courtListenerHealth.status === "fulfilled" ? courtListenerHealth.value : "error" as const },
    congress: { configured: !!ENV.CONGRESS_API_KEY, status: congressHealth.status === "fulfilled" ? congressHealth.value : "error" as const },
    eurLex: { configured: true, status: eurLexHealth.status === "fulfilled" ? eurLexHealth.value : "active" as const },
    gleif: { configured: true, status: gleifHealth.status === "fulfilled" ? gleifHealth.value : "error" as const },
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
  const PART3_DATA_LIBRARY = userLibraryDomains.length > 0
    ? `\n[LIB_DOMAINS] ${userLibraryDomains.join('|')}`
    : "";

  // 合并三部分，构建完整的守则块
  const USER_CORE_RULES = PART1_INVESTMENT_RULES + PART2_TASK_INSTRUCTION + PART3_DATA_LIBRARY;

  // Manus 幕后数据引擎
  const manusSystemPrompt = `[SYS:MANUS|ROLE:data_engine|RECIPIENT:GPT]
OUT:table/num/metric_only|no_intro|no_outro|direct_data
DATA_INTEGRITY[MAX]:
1. realtime_ctx→use_as_is|no_modify
2. missing→N/A|no_hallucinate|no_training_fill
3. PROHIBIT:fabricate|guess|training_data_as_realtime
4. LABEL:[yahoo_finance]|[fred]|[tavily:domain]|[api:name]|[N/A]` + USER_CORE_RULES;

  // -- GPT 主角人设（用户的唯一对话伙伴，负责所有与用户的交流和跟进）----------------------------------------------
  const NOW = new Date();
  const currentDateStr = `${NOW.getFullYear()}年${NOW.getMonth()+1}月${NOW.getDate()}日`;
  const currentYearStr = String(NOW.getFullYear());
  const lastYearStr = String(NOW.getFullYear() - 1);
  const twoYearsAgoStr = String(NOW.getFullYear() - 2);
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
- data 数组最多 24 个数据点（热力图可到 30 个）
- 图表必须紧跟相关文字分析，不能孤立出现
- 每次回复至少包含 1 个图表（如果有任何数据可视化机会）
- 分析板块行情时优先使用 heatmap；分析个股走势时优先使用 candlestick` + USER_CORE_RULES;

  // -- 历史记忆上下文 --------------------------------------------------------
  // 语义相关性召回：对话级优先，全局兑底，关键词匹配 + 时间衰减双维度评分
  const relevantMemory = await getRelevantMemory(
    userId,
    taskDescription,
    { topK: 6, minRecent: 2, conversationId: conversationId ?? undefined }
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

    // GPT Step1 prompt：任务拆分 + 精准资源指令（TASK_SPEC）+ 并行执行 GPT 自己的分析
    // ── 可用 API 目录（供 GPT 按需精确指定，不要全部调用）──────────────────────
    const AVAILABLE_APIS_CATALOG = `
[市场行情] yahoo_finance(ticker,period) | finnhub(ticker) | polygon(ticker) | tiingo(ticker,metrics)
[深度财务] fmp(ticker,statements,years) | simfin(ticker,period) | sec_edgar(ticker,forms)
[技术分析] alpha_vantage_tech(ticker,indicators) | polygon_options(ticker)
[宏观数据] fred(series_ids,limit) | world_bank(countries,indicators) | imf_wb(countries,indicators) | ecb(series) | boe(series) | hkma(series) | alpha_vantage_econ(indicators)
[地区专项] baostock(code,period) | hkex(code,doc_types)
[加密货币] coingecko(coins,metrics)
[新闻情绪] news_api(query,sources) | marketaux(ticker,sentiment) | gdelt(query,themes)
[网页搜索] tavily_search(query) ← 限定在用户资源库域名内搜索
资源库域名: ${userLibraryDomains.slice(0, 8).join(' | ')}${userLibraryDomains.length > 8 ? ' ...' : ''}`;

    const gptStep1UserMsg = `[GPT←TASK|STEP1|MODE:${modeConfig.label}]
QUERY: ${taskDescription}${historyBlock ? '\nHIST:' + historyBlock.slice(0, 800) : ''}${memoryBlock ? '\n' + memoryBlock.slice(0, 600) : ''}${attachmentBlock ? '\nATTACH:' + attachmentBlock.slice(0, 400) : ''}${modeConfig.step1Hint ? '\nHINT:' + modeConfig.step1Hint : ''}
${AVAILABLE_APIS_CATALOG}
[INSTRUCTIONS]
你是首席投资顾问（GPT）。Step1 同步完成两件事：

■ PART-A：任务规划与资源分配（目的：让 Manus 拿到后直接上手，无需重新思考框架）
① 判断任务类型（新任务/延续，如延续引用上次具体结论）
② 建立分析框架（3-5层，明确核心问题和分析角度）
③ 资源分配（分两组）：
   [GPT_RESOURCES] — GPT 自己分析时需要参考的数据（由系统同步获取后在 Step3 提供给你）
   [MANUS_RESOURCES] — Manus 负责收集整理的数据（Manus 独立执行）
   ⚠ 资源选取原则：
   • 只选任务真正需要的 API，不堆砌，不重复
   • params 精确指定字段和时间范围（如 fields:["revenue","netIncome"] 而非取全量）
   • 快速问答/闲聊：两组均为空数组，不调用任何 API
   • tavily_query：只在需要市场观点/新闻/行业报告时才填，否则为 null

■ PART-B：GPT 主观分析（同步执行，不等数据，基于专业知识立即输出）
• 投资逻辑推演（护城河/竞争优势/行业格局/商业模式）
• 宏观叙事判断（政策方向/市场情绪/周期位置/利率环境）
• 风险识别（尾部风险/结构性风险/黑天鹅/监管风险）
• 历史类比（与历史相似情形对比，给出方向性判断）
⚠ PART-B 必须有实质性判断，禁止用「待数据验证」替代内容

[OUTPUT - 严格遵守此格式，Manus 将直接解析执行]
## TASK_ANALYSIS
（任务类型|连续性|核心问题，3句以内）
## ANALYSIS_FRAMEWORK
（分析层次，每层一行，格式：层级→核心问题）
## RESOURCE_SPEC
${"```"}json
{
  "gpt_resources": [
    {"name": "API名称", "params": {"ticker": "AAPL", "period": "1y"}, "purpose": "验证我的估值判断"}
  ],
  "manus_resources": [
    {"name": "API名称", "params": {"ticker": "AAPL", "statements": ["IS","BS"], "years": 3}, "purpose": "完整财务报表供深度分析"},
    {"name": "fred", "params": {"series_ids": ["FEDFUNDS","CPIAUCSL"], "limit": 24}, "purpose": "宏观利率环境数据"}
  ],
  "tavily_query": "苹果AI战略分析师观点 ${currentYearStr} 或 null",
  "company_names": ["苹果", "Apple Inc."],
  "priority": "quick|standard|deep",
  "reasoning": "资源选取理由（一句话）"
}
${"```"}
## GPT_ANALYSIS
（PART-B 实质性分析，必须包含方向性判断，禁止纯框架描述）`;
    

    // ── 并行启动：Step1 GPT + Yahoo Finance + Tavily 初始搜索 + 多源金融数据 ──────────────
    // 提取 ticker 供多源数据使用
    const { extractTickers } = await import("./yahooFinance");
    const detectedTickers = extractTickers(taskDescription);
    const primaryTicker = detectedTickers[0] ?? null; // 主要股票代码（用于深度分析）

    // 预先提取 A 股代码（用于后续去重）
    const { extractAStockCodes: extractAStockCodesEarly } = await import("./baoStockApi");
    const earlyAStockCodes = extractAStockCodesEarly(taskDescription);

    const [step1Result, stockDataResult, earlyTavilyResult] = await Promise.allSettled([
      // A. Step1：GPT 规划框架
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
        : Promise.resolve(null),
      // B. Yahoo Finance：去重版，跳过已由 Baostock 处理的 A 股代码
      earlyAStockCodes.length > 0
        ? fetchStockDataForTaskWithDedup(taskDescription, earlyAStockCodes)
        : fetchStockDataForTask(taskDescription),
      // C. Tavily 初始搜索：用原始消息作初始 query（粗粒度，先跑起来）
      isTavilyConfigured()
        ? searchForTask(taskDescription, userLibraryUrls)
        : Promise.resolve(""),
    ]);

    // 解析 Step1 结果
    const FALLBACK_STEP1 = `## 分析框架\n标准价值投资分析：估值→护城河→财务健康→安全边际\n## Manus 数据需求清单\n财务数据、估值指标、市场表现、行业对比`;
    let gptStep1Output: string;
    if (step1Result.status === "fulfilled" && step1Result.value) {
      gptStep1Output = step1Result.value as string;
    } else {
      gptStep1Output = FALLBACK_STEP1;
    }
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
      apis: Array<{ name: string; params: Record<string, unknown>; purpose: string }>;
      tavily_query: string | null;
      company_names?: string[];  // GPT 提取的公司名称实体（用于 GLEIF 精确查询）
      priority: "quick" | "standard" | "deep";
      reasoning: string;
    }
    const parseResourcePlan = (step1Text: string): ResourcePlan & { taskSpec: TaskSpec | null } => {
      // 默认规划（兜底，当 GPT 未输出 TASK_SPEC 时使用）
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
          || step1Text.match(/```json([\s\S]*?{[\s\S]*?"apis"[\s\S]*?})```/m);
        if (specMatch) {
          const spec = JSON.parse(specMatch[1].trim()) as TaskSpec;
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
    const aStockCodes = extractAStockCodes(taskDescription + " " + gptStep1Output);
    const primaryAStockCode = aStockCodes[0] || null;

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

    const [macroDataResult, worldBankResult, imfDataResult, refinedTavilyResult,
      finnhubResult, fmpResult, polygonResult, secResult, avEconomicResult,
      cryptoResult, aStockResult, gdeltResult, newsApiResult, marketauxResult,
      simfinResult, tiingoResult, techIndicatorsResult, optionsChainResult,
      ecbResult, hkexResult, boeResult, hkmaResult,
      courtListenerResult, congressResult, eurLexResult, gleifResult] = await Promise.allSettled([
      // FRED：用 Step1 输出的关键词，宏观数据匹配更精准
      resourcePlan.dataSources.macroData
        ? timed("FRED", getMacroDataByKeywords(taskDescription + " " + gptStep1Output))
        : Promise.resolve(""),
      // World Bank：全球宏观数据（GDP/通谀/贸易/失业率等），根据任务自动识别国家
      resourcePlan.dataSources.macroData
        ? timed("World Bank", fetchWorldBankData(taskDescription + " " + gptStep1Output))
        : Promise.resolve(""),
      // IMF WEO：IMF 世界经测展望数据（含预测年），覆盖 GDP/通谀/失业率/财政债务/经常账户等
      resourcePlan.dataSources.macroData
        ? timed("IMF WEO", fetchImfData(taskDescription + " " + gptStep1Output))
        : Promise.resolve(""),
      // Tavily 精炼搜索：用 Step1 数据需求清单作为 query（仅当精炼 query 与原始不同时才补充搜索）
      resourcePlan.dataSources.webSearch && isTavilyConfigured() && refinedTavilyQuery !== taskDescription
        ? timed("Tavily", searchForTask(refinedTavilyQuery, userLibraryUrls))
        : Promise.resolve(""),
      // Finnhub：实时报价/分析师评级/内部交易/公司新闻（仅当检测到股票代码时）
      resourcePlan.dataSources.deepFinancials && primaryTicker && ENV.FINNHUB_API_KEY
        ? timed("Finnhub", getFinnhubData(primaryTicker).then(d => formatFinnhubData(d)))
        : Promise.resolve(""),
      // FMP：财务报表/DCF估値/分析师目标价/关键指标（仅当检测到股票代码时）
      resourcePlan.dataSources.deepFinancials && primaryTicker && ENV.FMP_API_KEY
        ? timed("FMP", getFmpData(primaryTicker).then(d => formatFmpData(d)))
        : Promise.resolve(""),
      // Polygon.io：市场快照/公司详情/近期走势/新闻情绪（仅当检测到股票代码时）
      primaryTicker && ENV.POLYGON_API_KEY
        ? timed("Polygon.io", getPolygonData(primaryTicker).then(d => formatPolygonData(d)))
        : Promise.resolve(""),
      // SEC EDGAR：XBRL 财务数据/年报/季报（仅当检测到美股代码时）
      resourcePlan.dataSources.secFilings && primaryTicker && !primaryTicker.includes(".")
        ? timed("SEC EDGAR", getSecData(primaryTicker).then(d => formatSecData(d)))
        : Promise.resolve(""),
      // Alpha Vantage：宏观经测指标（利率/CPI/失业率/汇率）
      resourcePlan.dataSources.macroData && ENV.ALPHA_VANTAGE_API_KEY
        ? timed("Alpha Vantage", getAlphaVantageEconomicData().then(d => formatAVEconomicData(d)))
        : Promise.resolve(""),
      // CoinGecko：加密货币实时价格/市値/趋势（检测到加密货币相关任务时触发）
      resourcePlan.dataSources.cryptoData && isCryptoTask(taskDescription + " " + gptStep1Output) && ENV.COINGECKO_API_KEY
        ? timed("CoinGecko", getCryptoData(taskDescription + " " + gptStep1Output).then(d => formatCryptoData(d)))
        : Promise.resolve(""),
      // Baostock：A股历史行情/财务指标（检测到 A 股代码时触发）
      primaryAStockCode
        ? timed("Baostock", getAStockData(primaryAStockCode).then(d => formatAStockData(d)))
        : Promise.resolve(""),
      // GDELT：全球事件/地缘风险/新闻情绪（检测到地缘政治/宏观事件任务时触发）
      resourcePlan.dataSources.newsAndSentiment
        ? timed("GDELT", fetchGdeltData(taskDescription + " " + gptStep1Output)
            .then(d => d ? formatGdeltDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // NewsAPI：全球新闻搜索/头条（仅当检测到股票代码/公司名/宏观事件关键词时触发）
      resourcePlan.dataSources.newsAndSentiment && ENV.NEWS_API_KEY && extractNewsQuery(taskDescription + " " + gptStep1Output) !== null
        ? timed("NewsAPI", fetchNewsData(taskDescription + " " + gptStep1Output)
            .then(d => d ? formatNewsDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // Marketaux：金融新闻情绪评分/实体识别（检测到股票代码时触发）
      resourcePlan.dataSources.newsAndSentiment && ENV.MARKETAUX_API_KEY && primaryTicker
        ? timed("Marketaux", fetchMarketauxData(taskDescription + " " + gptStep1Output)
            .then(d => d ? formatMarketauxDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // SimFin：财务报表/衍生指标/股价历史（仅对美股代码触发）
      resourcePlan.dataSources.deepFinancials && ENV.SIMFIN_API_KEY && primaryTicker && !primaryTicker.includes(".")
        ? timed("SimFin", fetchSimFinData(primaryTicker)
            .then(d => d ? formatSimFinDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // Tiingo：实时估値倍数（P/E、P/B、EV、PEG）+ 历史 OHLCV + 季度财务报表（仅对美股代码触发）
      resourcePlan.dataSources.deepFinancials && ENV.TIINGO_API_KEY && primaryTicker && !primaryTicker.includes(".")
        ? timed("Tiingo", fetchTiingoData(primaryTicker)
            .then(d => d ? formatTiingoDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // Alpha Vantage 技术指标：RSI/布林带/EMA/SMA/随机指标（仅当资源规划要求技术面且检测到股票代码时）
      resourcePlan.dataSources.technicalIndicators && primaryTicker && ENV.ALPHA_VANTAGE_API_KEY
        ? timed("Alpha Vantage 技术指标", getTechnicalIndicators(primaryTicker)
            .then((d: Awaited<ReturnType<typeof getTechnicalIndicators>>) => d ? formatTechnicalIndicators(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // Polygon.io 期权链：Put-Call Ratio/行权价分布/到期日分布（仅当资源规划要求期权且检测到美股代码时）
      resourcePlan.dataSources.optionsChain && primaryTicker && !primaryTicker.includes(".") && ENV.POLYGON_API_KEY
        ? timed("Polygon 期权链", getOptionsChain(primaryTicker)
            .then((d: Awaited<ReturnType<typeof getOptionsChain>>) => d ? formatOptionsChain(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // ECB：欧元区利率/通谀/汇率/货币供应量（宏观数据任务且涉及欧元区时触发）
      resourcePlan.dataSources.macroData && isECBRelevantTask(taskDescription + " " + gptStep1Output)
        ? timed("ECB", fetchECBData()
            .then(d => d ? formatECBDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // HKEXnews：港股公告/年报/监管文件（检测到港股代码或港股相关任务时触发）
      isHKTask
        ? timed("HKEXnews", fetchHKEXData(hkStockCode ?? (taskDescription + " " + gptStep1Output).slice(0, 50))
            .then(d => d ? formatHKEXDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // BoE：英国基准利率/国巫t收益率/汇率/货币供应量（宏观数据任务且涉及英国/英镑时触发）
      resourcePlan.dataSources.macroData && isBoeRelevantTask(taskDescription + " " + gptStep1Output)
        ? timed("BoE", fetchBoeData()
            .then(d => d ? formatBoeDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // HKMA：港元利率/货币供应量/銀行间流动性/外汇储备（宏观数据任务且涉及香港/港元时触发）
      resourcePlan.dataSources.macroData && isHkmaRelevantTask(taskDescription + " " + gptStep1Output)
        ? timed("HKMA", fetchHkmaData()
            .then(d => d ? formatHkmaDataAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // CourtListener：美国法院诉讼/判决历史（检测到公司诉讼/法律风险相关任务时触发）
      shouldFetchCourtListener(taskDescription + " " + gptStep1Output)
        ? timed("CourtListener", getCompanyLitigationHistory(taskDescription.slice(0, 100))
            .then(d => d ? formatLitigationAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // Congress.gov：美国立法动态/法案（检测到监管/立法/法案相关任务时触发）
      shouldFetchCongress(taskDescription + " " + gptStep1Output)
        ? timed("Congress.gov", getRelatedLegislation(taskDescription.slice(0, 100))
            .then(d => d ? formatLegislationAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // EUR-Lex：欧盟法规/监管文件（检测到欧盟监管/MiCA/GDPR 等相关任务时触发）
      shouldFetchEurLex(taskDescription + " " + gptStep1Output)
        ? timed("EUR-Lex", Promise.resolve(searchEuRegulations(taskDescription.slice(0, 100)))
            .then(d => d ? formatEuRegulationsAsMarkdown(d) : "")
            .catch(() => ""))
        : Promise.resolve(""),
      // GLEIF：全球 LEI 法人识别码/法人结构/母子公司关系
      // 优先级：GPT Step1 提取的 company_names > 正则从文本提取 > 任务描述前100字
      (() => {
        if (!shouldFetchGleif(taskDescription + " " + gptStep1Output)) return Promise.resolve("");
        // 1. 优先使用 GPT Step1 提取的公司名称实体
        const step1CompanyNames = resourcePlan.taskSpec?.company_names;
        if (step1CompanyNames && step1CompanyNames.length > 0) {
          const primaryName = step1CompanyNames[0].trim();
          return timed("GLEIF", getCompanyLeiInfo(primaryName)
            .then(d => d ? formatGleifAsMarkdown(d) : "")
            .catch(() => ""));
        }
        // 2. 兑底：用正则从任务描述中提取公司名称（匹配大写开头的单词或常见公司名称模式）
        const companyMatch = taskDescription.match(/([A-Z][a-zA-Z\s&]{2,30}(?:Inc\.?|Corp\.?|Ltd\.?|LLC\.?|Group|Holdings?|Holding|Co\.?|Company|Bank|Capital|Partners|Fund|Trust|AG|SA|GmbH|PLC|NV|BV))/)
          || taskDescription.match(/([\u4e00-\u9fa5]{2,8}(?:\u516c\u53f8|\u96c6\u56e2|\u96c6\u56e2\u516c\u53f8|\u63a7\u80a1|\u9ad8\u79d1\u6280|\u9ad8\u79d1\u6280\u516c\u53f8|\u9280\u884c|\u8bc1\u5238|\u57fa\u91d1|\u4fe1\u6258|\u4fdd\u9669))/)
        if (companyMatch) {
          return timed("GLEIF", getCompanyLeiInfo(companyMatch[1].trim())
            .then(d => d ? formatGleifAsMarkdown(d) : "")
            .catch(() => ""));
        }
        // 3. 最后兑底：任务描述前 80 字
        return timed("GLEIF", getCompanyLeiInfo(taskDescription.slice(0, 80))
          .then(d => d ? formatGleifAsMarkdown(d) : "")
          .catch(() => ""));
      })(),
    ]);

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
    // 合并 Tavily 初始搜索 + 精炼搜索（去重：精炼结果优先，初始结果补充）    // 适配新的 TaskSearchResult 类型
    const earlyTavilyResult2 = earlyTavilyResult.status === "fulfilled" ? earlyTavilyResult.value : null;
    const refinedTavilyResult2 = refinedTavilyResult.status === "fulfilled" ? refinedTavilyResult.value : null;
    const earlyTavilyStr = typeof earlyTavilyResult2 === "string" ? earlyTavilyResult2 : (earlyTavilyResult2?.content ?? "");
    const refinedTavilyStr = typeof refinedTavilyResult2 === "string" ? refinedTavilyResult2 : (refinedTavilyResult2?.content ?? "");
    // 收集来源列表（优先精炼结果的来源，其次初始结果）
    const tavilySources = [
      ...(typeof refinedTavilyResult2 === "object" && refinedTavilyResult2?.sources ? refinedTavilyResult2.sources : []),
      ...(typeof earlyTavilyResult2 === "object" && earlyTavilyResult2?.sources ? earlyTavilyResult2.sources : []),
    ];
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
    const aStockMarkdown = aStockResult.status === "fulfilled" && aStockResult.value ? aStockResult.value : "";
    const gdeltMarkdown = gdeltResult.status === "fulfilled" && gdeltResult.value ? gdeltResult.value : "";
    const newsApiMarkdown = newsApiResult.status === "fulfilled" && newsApiResult.value ? newsApiResult.value : "";
    const marketauxMarkdown = marketauxResult.status === "fulfilled" && marketauxResult.value ? marketauxResult.value : "";
    const simfinMarkdown = simfinResult.status === "fulfilled" && simfinResult.value ? simfinResult.value : "";
    const tiingoMarkdown = tiingoResult.status === "fulfilled" && tiingoResult.value ? tiingoResult.value : "";
    const techIndicatorsMarkdown = techIndicatorsResult.status === "fulfilled" && techIndicatorsResult.value ? techIndicatorsResult.value : "";
    const optionsChainMarkdown = optionsChainResult.status === "fulfilled" && optionsChainResult.value ? optionsChainResult.value : "";
    const ecbMarkdown = ecbResult.status === "fulfilled" && ecbResult.value ? ecbResult.value : "";
    const hkexMarkdown = hkexResult.status === "fulfilled" && hkexResult.value ? hkexResult.value : "";
    const boeMarkdown = boeResult.status === "fulfilled" && boeResult.value ? boeResult.value : "";
    const hkmaMarkdown = hkmaResult.status === "fulfilled" && hkmaResult.value ? hkmaResult.value : "";
    const courtListenerMarkdown = courtListenerResult.status === "fulfilled" && courtListenerResult.value ? courtListenerResult.value : "";
    const congressMarkdown = congressResult.status === "fulfilled" && congressResult.value ? congressResult.value : "";
    const eurLexMarkdown = eurLexResult.status === "fulfilled" && eurLexResult.value ? eurLexResult.value : "";
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
    ].filter(Boolean).join("\n\n---\n\n");
    const webContentBlock = webSearchData.value || "";
    // 合并用于 GPT Step3 的完整数据块（保持向后兼容）
    const realTimeDataBlock = [structuredDataBlock, webContentBlock].filter(Boolean).join("\n\n---\n\n");
    // Step2 Manus prompt（压缩 AI 内部语言）
    const step2UserContent = `[MANUS←GPT|STEP2|INTERNAL]
TASK:${taskDescription.slice(0, 200)}
GPT_FRAMEWORK:
${gptStep1Output}
${structuredDataBlock ? `[PRE_DATA:structured]\n${structuredDataBlock}` : ""}
${webContentBlock ? `[PRE_DATA:web_raw]\n${webContentBlock}` : ""}
[MANUS_INSTRUCTIONS]
ROLE: data_executor — GPT 是决策大脑，你是专业数据执行者
MISSION: 执行 GPT 在 RESOURCE_SPEC.manus_resources 中指定的数据任务，确保数据完整准确

STEP1_REVIEW（执行前快速核查，不推翻 GPT 规划，仅做执行层专业判断）:
□ 每个 manus_resource：params 是否足够精确？时间范围是否合适？
□ GPT 框架中提到但 manus_resources 未列入的关键数据 → 补充，标注[MANUS_ADD]
□ 明显冗余重叠的资源 → 合并或去除，标注[MANUS_REMOVE]
□ PRE_DATA 已有的数据 → 直接使用，标注[CACHED]，不重复调用

EXECUTION:
1. 输出 RESOURCE_REVIEW（每个 api 一行：EXECUTE|ADD|REMOVE|ADJUST → 理由，最多8字）
2. 按审查后的清单精准调用 API，收集数据
3. tavily：仅在 GPT 指定的资源库域名内搜索，提取结构化数据

OUTPUT_FORMAT (strict):
[RESOURCE_REVIEW]
api_name: EXECUTE|ADD|REMOVE|ADJUST → reason
[DATA_REPORT]
数字/表格/指标为主 | 标注来源和时间 | 缺失标 N/A | 不写分析评论（那是 GPT 的工作）
limit: ${modeConfig.step2MaxWords} tokens — 在输入端控制精度，不靠截断
${modeConfig.step2Hint ? modeConfig.step2Hint : ""}`;

    let manusReport: string;
    try {
      const manusResponse = await invokeLLMWithRetry({
        messages: [
          { role: "system", content: manusSystemPrompt },
          { role: "user", content: step2UserContent },
        ],
      });
      manusReport = String(manusResponse.choices?.[0]?.message?.content || "");
    } catch (manusErr) {
      // Manus LLM 上游不稳定时，自动降级用 GPT 完成数据收集
      if (userConfig?.openaiApiKey) {
        try {
          manusReport = await callOpenAI({
            apiKey: userConfig.openaiApiKey,
            model: userConfig.openaiModel || DEFAULT_MODEL,
            messages: [
              { role: "system", content: manusSystemPrompt },
              { role: "user", content: step2UserContent },
            ],
            maxTokens: modeConfig.step1MaxTokens * 2,
          });
        } catch {
          manusReport = realTimeDataBlock
            ? `## 实时数据汇总\n\n${realTimeDataBlock}`
            : `## 数据收集（基于已有分析）\n\n${gptStep1Output}`;
        }
      } else {
        manusReport = realTimeDataBlock
          ? `## 实时数据汇总\n\n${realTimeDataBlock}`
          : `## 数据收集（基于已有分析）\n\n${gptStep1Output}`;
      }
    }
    await updateTaskStatus(taskId, "manus_analyzing", { manusResult: manusReport });

    // ------------------------------------------------------------------------
    // Step 3 - GPT 整合输出（接收 Manus 报告，深度思考，输出最终回复）
    // ------------------------------------------------------------------------
    await updateTaskStatus(taskId, "gpt_reviewing");

    // 注：不截断 Manus 报告，完整传递。通过 Step2 指令已要求 Manus 严格控制输出在 6000 字以内。
    // Step3 GPT prompt（内部接收压缩格式，输出人类语言）
    const gptUserMessage = `[GPT←MANUS|STEP3|FINALIZE]
Q:${taskDescription.slice(0, 300)}${historyBlock ? '\nHIST_CTX:' + historyBlock.slice(0, 600) : ''}
[GPT_ANALYSIS_S1]
${gptStep1Output}
[MANUS_DATA_REPORT]
${manusReport}
[MODE:${modeConfig.label}]${modeConfig.step3Hint ? '\n' + modeConfig.step3Hint : ''}
━━━ FINALIZE: OUTPUT IN HUMAN LANGUAGE ━━━
你是首席分析师（GPT）。你在 S1 已完成主观分析框架，Manus 已完成数据收集。
现在将两者深度融合，输出最终专业报告给用户。

MANDATORY（不可省略）:
① CONCLUSION_FIRST: 每段第一句就是结论，格式「**[判断]**（数据→逻辑）」，禁止先铺垫再结论
② POSITION: 对核心问题给出明确立场+幅度（「高估30-40%」不是「偏高」；「建议减仓」不是「可以考虑」）
③ CONSENSUS_VS_MINE: 主动对比「市场普遍认为X → 但数据显示Y → 因此我判断Z」，体现独立思考
④ QUANTIFY: 引用 Manus 精确数字（PE=23.4x 而非"约20x"），标注时间（如 ${lastYearStr}Q3）
⑤ VALUATION: 若有 P/E|P/B|EV|PEG → 与行业均值+历史均值对比 → 给出估值结论（含幅度）
⑥ ANTI_THESIS: 主动提出「如果我错了，最可能的原因是：___」— 展示思维深度
⑦ DUAL_VERIFY: 正向（现在→未来）+ 反向（若判断正确→12个月内会出现什么可验证数据）
⑧ RISK: 量化主要风险（如"利率上升100bp → 估值压缩8-12%"）
⑨ CONTINUITY: 若为延续任务 → 明确引用上次结论，说明本次更新了什么判断
⑩ CHARTS: 每个数据/趋势/对比机会嵌入 %%CHART%%...%%END_CHART%%（至少1个）
⑪ FOLLOWUP: 结尾给出3个追问 %%FOLLOWUP%%问题%%END%%

PROHIBIT: 「平衡分析」「两方面来看」「既有机会也有风险」等中立废话 | 模糊结论 | 纯框架无数据 | 照搬 Manus 报告 | 先铺垫后结论
FORMAT: ##标题 | **加粗**关键数据 | >引用块用于判断 | 表格≥3列 | 中文输出
%%FOLLOWUP%%请问下一个追问问题？%%END%%
%%FOLLOWUP%%请问下一个追问问题？%%END%%
%%FOLLOWUP%%请问下一个追问问题？%%END%%`;

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
    if (userConfig?.openaiApiKey) {
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
          // 每 300ms 批量写入数据库一次（避免频繁写库）
          if (Date.now() - lastDbUpdate > 300) {
            await updateMessageContent(streamMsgId, accumulated);
            emitTaskChunk(taskId, streamMsgId, accumulated); // SSE 实时推送
            lastDbUpdate = Date.now();
          }
        }
        // 最终完整写入，并推送最后一个 chunk（防止最后 300ms 内的内容丢失）
        await updateMessageContent(streamMsgId, accumulated);
        emitTaskChunk(taskId, streamMsgId, accumulated); // 确保前端收到完整内容
        finalReply = accumulated;
      } catch (gptErr) {
        const errMsg = (gptErr as Error)?.message || "";
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
      const fb = await invokeLLM({
        messages: [
          { role: "system", content: gptSystemPrompt },
          { role: "user", content: gptUserMessage },
        ],
      });
      finalReply = String(fb.choices?.[0]?.message?.content || manusReport);
      await updateMessageContent(streamMsgId, finalReply);
    }

    // -- 收集实际使用的 API 数据源（用于前端归因展示） ----------------------------------
    type ApiSourceEntry = { name: string; category: string; icon?: string; description?: string; latencyMs?: number };
    const apiSources: ApiSourceEntry[] = [];
    // 辅助函数：从 latencyMap 读取耗时
    const ms = (key: string) => latencyMap.get(key);
    // 市场数据类
    if (stockData.status === "fulfilled" && stockData.value) {
      apiSources.push({ name: "Yahoo Finance", category: "市场数据", icon: "📊", description: "实时报价/历史行情", latencyMs: ms("Yahoo Finance")  });
    }
    if (finnhubMarkdown) apiSources.push({ name: "Finnhub", category: "市场数据", icon: "📈", description: "分析师评级/内部交易", latencyMs: ms("Finnhub")  });
    if (fmpMarkdown) apiSources.push({ name: "FMP", category: "市场数据", icon: "💹", description: "DCF估值/财务报表", latencyMs: ms("FMP")  });
    if (polygonMarkdown) apiSources.push({ name: "Polygon.io", category: "市场数据", icon: "🔸", description: "市场快照/新闻情绪", latencyMs: ms("Polygon.io")  });
    if (secMarkdown) apiSources.push({ name: "SEC EDGAR", category: "市场数据", icon: "🏦", description: "XBRL年报/季报", latencyMs: ms("SEC EDGAR")  });
    if (simfinMarkdown) apiSources.push({ name: "SimFin", category: "市场数据", icon: "💼", description: "财务报表/季度趋势", latencyMs: ms("SimFin")  });
    if (tiingoMarkdown) apiSources.push({ name: "Tiingo", category: "市场数据", icon: "📈", description: "实时估值倍数", latencyMs: ms("Tiingo")  });
    if (techIndicatorsMarkdown) apiSources.push({ name: "Alpha Vantage 技术指标", category: "技术分析", icon: "📉", description: "RSI/布林带/EMA/SMA", latencyMs: ms("Alpha Vantage 技术指标")  });
    if (optionsChainMarkdown) apiSources.push({ name: "Polygon 期权链", category: "期权数据", icon: "📀", description: "Put-Call Ratio/隐含波动率", latencyMs: ms("Polygon 期权链")  });
    // 宏观指标类
    if (macroData.status === "fulfilled" && macroData.value) {
      apiSources.push({ name: "FRED", category: "宏观指标", icon: "🏦", description: "美联储宏观数据", latencyMs: ms("FRED")  });
    }
    if (worldBankData.status === "fulfilled" && worldBankData.value) {
      apiSources.push({ name: "World Bank", category: "宏观指标", icon: "🌍", description: "GDP/贸易/发展", latencyMs: ms("World Bank")  });
    }
    if (imfMarkdown) apiSources.push({ name: "IMF WEO", category: "宏观指标", icon: "🌐", description: "全球经测展望", latencyMs: ms("IMF WEO")  });
    if (avEconomicMarkdown) apiSources.push({ name: "Alpha Vantage", category: "宏观指标", icon: "📊", description: "CPI/利率/汇率", latencyMs: ms("Alpha Vantage")  });
    // 新闻情绪类
    if (gdeltMarkdown) apiSources.push({ name: "GDELT", category: "新闻情绪", icon: "🌏", description: "地缘风险/全球事件", latencyMs: ms("GDELT")  });
    if (newsApiMarkdown) apiSources.push({ name: "NewsAPI", category: "新闻情绪", icon: "📰", description: "全球新闻搜索", latencyMs: ms("NewsAPI")  });
    if (marketauxMarkdown) apiSources.push({ name: "Marketaux", category: "新闻情绪", icon: "💯", description: "情绪评分/实体识别", latencyMs: ms("Marketaux")  });
    // 加密货币类
    if (cryptoMarkdown) apiSources.push({ name: "CoinGecko", category: "加密货币", icon: "🪙", description: "实时价格/市値", latencyMs: ms("CoinGecko")  });
    // A股数据类
    if (aStockMarkdown) apiSources.push({ name: "Baostock", category: "A股数据", icon: "🇳", description: "A股历史行情", latencyMs: ms("Baostock")  });
    // 港股数据类
    if (hkexMarkdown) apiSources.push({ name: "HKEXnews", category: "港股公告", icon: "🇭🇰", description: "港股公告/年报", latencyMs: ms("HKEXnews")  });
    // 欧元区宏观类
    if (ecbMarkdown) apiSources.push({ name: "ECB", category: "宏观指标", icon: "🇪🇺", description: "欧元区利率/通胀/汇率", latencyMs: ms("ECB")  });
    // 英国宏观类
    if (boeMarkdown) apiSources.push({ name: "Bank of England", category: "宏观指标", icon: "🇬🇧", description: "英国利率/国债收益率/货币供应量", latencyMs: ms("BoE")  });
    // 香港宏观类
    if (hkmaMarkdown) apiSources.push({ name: "HKMA", category: "宏观指标", icon: "🇭🇰", description: "港元利率/货币供应量/外汇储备", latencyMs: ms("HKMA")  });
    // 法律与监管类
    if (courtListenerMarkdown) apiSources.push({ name: "CourtListener", category: "法律监管", icon: "⚖️", description: "美国法院诉讼/判决历史", latencyMs: ms("CourtListener")  });
    if (congressMarkdown) apiSources.push({ name: "Congress.gov", category: "法律监管", icon: "🏹", description: "美国立法动态/法案进展", latencyMs: ms("Congress.gov")  });
    if (eurLexMarkdown) apiSources.push({ name: "EUR-Lex", category: "法律监管", icon: "🇪🇺", description: "欧盟法规/MiCA/GDPR/DORA", latencyMs: ms("EUR-Lex")  });
    if (gleifMarkdown) apiSources.push({ name: "GLEIF", category: "法律监管", icon: "🏛️", description: "全球 LEI 法人识别码/法人结构", latencyMs: ms("GLEIF")  });

    // -- 标记消息为 final，更新任务状态 -----------------------------------------
    const msgId = streamMsgId;
    // 将数据来源列表写入消息 metadata，供前端归因展示
    const metadataToSave: Record<string, unknown> = {};
    if (tavilySources.length > 0) metadataToSave.dataSources = tavilySources;
    if (apiSources.length > 0) metadataToSave.apiSources = apiSources;
    if (Object.keys(metadataToSave).length > 0) {
      await updateMessageContent(streamMsgId, finalReply, metadataToSave);
    }
    await updateTaskStatus(taskId, "completed", { gptSummary: finalReply });
    emitTaskDone(taskId, msgId, finalReply); // SSE 完成推送

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
        await saveMemoryContext({
          userId,
          taskId,
          conversationId: conversationId ?? undefined,
          taskTitle: taskDescription.slice(0, 100),
          summary,
          // 提取股票代码 + 任务描述前 80 字作为关键词（提升语义召回精度）
          keywords: (() => {
            const tickers = taskDescription.match(/\b[A-Z]{1,5}(?:\.[A-Z]{1,2})?\b/g) || [];
            const tickerStr = Array.from(new Set(tickers)).join(" ");
            return (tickerStr + " " + taskDescription.slice(0, 80)).trim().slice(0, 150);
          })(),
        });
      }
    } catch {
      // memory save failure is non-critical, silently skip
    }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await updateTaskStatus(taskId, "failed");
    emitTaskError(taskId, errMsg); // SSE 错误推送
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

        // 写入用户消息
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
        if (input.attachmentIds && input.attachmentIds.length > 0) {
          const attachmentTexts: string[] = [];
          for (const attId of input.attachmentIds) {
            const atts = await getAttachmentsByMessage(attId);
            for (const att of atts) {
              if (att.extractedText) attachmentTexts.push(att.extractedText);
            }
          }
          if (attachmentTexts.length > 0) {
            attachmentContext = attachmentTexts.join("\n\n---\n\n");
          }
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
      const tavilyKeys = getTavilyKeyStatuses();
      const fredConfigured = !!ENV.FRED_API_KEY;

      // 超时包装：每个 checkHealth 最多等待 8 秒，防止慢 API 拖垮整个健康检测
      const withTimeout = <T>(p: Promise<T>, fallback: T, ms = 8000): Promise<T> =>
        Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);
      // 并行健康检测：World Bank + IMF + Finnhub + FMP + Polygon + SEC EDGAR + Alpha Vantage + CoinGecko + Baostock + GDELT + NewsAPI + Marketaux + SimFin + Tiingo + ECB + HKEXnews
      const [wbHealth, imfHealth, finnhubHealth, fmpHealth, polygonHealth, secHealth, avHealth, cgHealth, bsHealth, gdeltHealth, newsApiHealth, marketauxHealth, simfinHealth, tiingoHealth, ecbHealth, hkexHealth, boeHealth, hkmaHealth, courtListenerHealth, congressHealth, eurLexHealth, gleifHealth] = await Promise.allSettled([
        // World Bank
        (async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          try {
            const res = await fetch(
              "https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.KD.ZG?format=json&mrv=1&per_page=1",
              { signal: controller.signal }
            );
            clearTimeout(timer);
            return res.ok ? "active" : "error";
          } catch (e: unknown) {
            clearTimeout(timer);
            const msg = e instanceof Error ? e.message : String(e);
            return msg.includes("abort") || msg.includes("timeout") ? "timeout" : "error";
          }
        })(),
        // IMF DataMapper
        withTimeout(checkImfApiHealth().then((r) => r.status as "active"|"error"|"timeout"), "timeout" as const),
        // Finnhub
        withTimeout(
          ENV.FINNHUB_API_KEY
            ? checkFinnhubHealth().then(r => r.ok ? "active" as const : "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // FMP
        withTimeout(
          ENV.FMP_API_KEY
            ? checkFmpHealth().then(r => r.ok ? "active" as const : "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // Polygon.io
        withTimeout(
          ENV.POLYGON_API_KEY
            ? checkPolygonHealth().then(r => r.ok ? "active" as const : "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // SEC EDGAR
        withTimeout(checkSecHealth().then(r => r.ok ? "active" as const : "error" as const), "timeout" as const),
        // Alpha Vantage
        withTimeout(
          ENV.ALPHA_VANTAGE_API_KEY
            ? checkAVHealth().then(r => r.ok ? "active" as const : "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // CoinGecko
        withTimeout(
          ENV.COINGECKO_API_KEY
            ? pingCoinGecko().then(ok => ok ? "active" as const : "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // Baostock（A股）：Python 子进程库，仅在本地沙筆环境可用
        withTimeout(
          pingBaostock().then(ok => ok ? "active" as const : "warning" as const).catch(() => "warning" as const),
          "warning" as const, 5000
        ),
        // GDELT：免费公开，无需 Key，但受频率限制（5s 间隔）
        Promise.resolve("active" as const),
        // NewsAPI
        withTimeout(
          ENV.NEWS_API_KEY
            ? checkNewsApiHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // Marketaux
        withTimeout(
          ENV.MARKETAUX_API_KEY
            ? checkMarketauxHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // SimFin
        withTimeout(
          ENV.SIMFIN_API_KEY
            ? checkSimFinHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // Tiingo
        withTimeout(
          ENV.TIINGO_API_KEY
            ? checkTiingoHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // ECB：免费公开 API，无需 Key
        withTimeout(checkECBHealth().then(r => r.ok ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
        // HKEXnews：免费公开 API，无需 Key
        withTimeout(checkHKEXHealth().then(r => r.ok ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
        // BoE：免费公开 API，无需 Key
        withTimeout(checkBoeHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
        // HKMA：免费公开 API，无需 Key
        withTimeout(checkHkmaHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
        // CourtListener：免费使用，有 Key 时请求限制更高
        withTimeout(checkCourtListenerHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
        // Congress.gov：需要 API Key
        withTimeout(
          ENV.CONGRESS_API_KEY
            ? checkCongressHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const)
            : Promise.resolve("error" as const),
          "timeout" as const
        ),
        // EUR-Lex：本地静态数据，无需网络
        Promise.resolve(checkEurLexHealth().status === "ok" ? "active" as const : "error" as const),
        // GLEIF：免费公开 API，无需 Key
        withTimeout(checkGleifHealth().then(r => r.status === "ok" ? "active" as const : "error" as const).catch(() => "error" as const), "timeout" as const),
      ]);

      const worldBankStatus = wbHealth.status === "fulfilled" ? wbHealth.value : "error";
      const imfStatus = imfHealth.status === "fulfilled" ? imfHealth.value : "error";
      const finnhubStatus = finnhubHealth.status === "fulfilled" ? finnhubHealth.value : "error";
      const fmpStatus = fmpHealth.status === "fulfilled" ? fmpHealth.value : "error";
      const polygonStatus = polygonHealth.status === "fulfilled" ? polygonHealth.value : "error";
      const secStatus = secHealth.status === "fulfilled" ? secHealth.value : "error";
      const avStatus = avHealth.status === "fulfilled" ? avHealth.value : "error";
      const cgStatus = cgHealth.status === "fulfilled" ? cgHealth.value : "error";
      const bsStatus = bsHealth.status === "fulfilled" ? bsHealth.value : "error";
      const gdeltStatus = gdeltHealth.status === "fulfilled" ? gdeltHealth.value : "active"; // GDELT 免费公开，默认 active
      const newsApiStatus = newsApiHealth.status === "fulfilled" ? newsApiHealth.value : "error";
      const marketauxStatus = marketauxHealth.status === "fulfilled" ? marketauxHealth.value : "error";
      const simfinStatus = simfinHealth.status === "fulfilled" ? simfinHealth.value : "error";
      const tiingoStatus = tiingoHealth.status === "fulfilled" ? tiingoHealth.value : "error";
      const ecbStatus = ecbHealth.status === "fulfilled" ? ecbHealth.value : "error";
      const hkexStatus = hkexHealth.status === "fulfilled" ? hkexHealth.value : "error";
      const boeStatus = boeHealth.status === "fulfilled" ? boeHealth.value : "error";
      const hkmaStatus = hkmaHealth.status === "fulfilled" ? hkmaHealth.value : "error";
      const courtListenerStatus = courtListenerHealth.status === "fulfilled" ? courtListenerHealth.value : "error";
      const congressStatus = congressHealth.status === "fulfilled" ? congressHealth.value : "error";
      const eurLexStatus = eurLexHealth.status === "fulfilled" ? eurLexHealth.value : "active"; // EUR-Lex 本地数据，默认 active
      const gleifStatus = gleifHealth.status === "fulfilled" ? gleifHealth.value : "error";

      return {
        tavily: tavilyKeys,
        tavilyConfigured: isTavilyConfigured(),
        fred: { configured: fredConfigured, status: fredConfigured ? "active" as const : "error" as const },
        yahoo: { configured: true, status: "active" as const },
        worldBank: { configured: true, status: worldBankStatus },
        imf: { configured: true, status: imfStatus },
        finnhub: { configured: !!ENV.FINNHUB_API_KEY, status: finnhubStatus },
        fmp: { configured: !!ENV.FMP_API_KEY, status: fmpStatus },
        polygon: { configured: !!ENV.POLYGON_API_KEY, status: polygonStatus },
        secEdgar: { configured: true, status: secStatus },
        alphaVantage: { configured: !!ENV.ALPHA_VANTAGE_API_KEY, status: avStatus },
        coinGecko: { configured: !!ENV.COINGECKO_API_KEY, status: cgStatus },
        baostock: { configured: true, status: bsStatus },
        gdelt: { configured: true, status: gdeltStatus },
        newsApi: { configured: !!ENV.NEWS_API_KEY, status: newsApiStatus },
        marketaux: { configured: !!ENV.MARKETAUX_API_KEY, status: marketauxStatus },
        simfin: { configured: !!ENV.SIMFIN_API_KEY, status: simfinStatus },
        tiingo: { configured: !!ENV.TIINGO_API_KEY, status: tiingoStatus },
        ecb: { configured: true, status: ecbStatus },
        hkex: { configured: true, status: hkexStatus },
        boe: { configured: true, status: boeStatus },
        hkma: { configured: true, status: hkmaStatus },
        courtListener: { configured: true, status: courtListenerStatus },
        congress: { configured: !!ENV.CONGRESS_API_KEY, status: congressStatus },
        eurLex: { configured: true, status: eurLexStatus },
        gleif: { configured: true, status: gleifStatus },
      };
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
});

export type AppRouter = typeof appRouter;
