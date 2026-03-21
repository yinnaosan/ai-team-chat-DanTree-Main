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
import { getStockData as getAlphaVantageStockData, getEconomicData as getAlphaVantageEconomicData, formatStockData as formatAVStockData, formatEconomicData as formatAVEconomicData, checkHealth as checkAVHealth } from "./alphaVantageApi";
import { getStockFullData as getPolygonData, formatPolygonData, checkHealth as checkPolygonHealth } from "./polygonApi";
import { getStockFullData as getFmpData, formatFmpData, checkHealth as checkFmpHealth } from "./fmpApi";
import { getStockFullData as getSecData, formatSecData, checkHealth as checkSecHealth } from "./secEdgarApi";
import { getCryptoData, formatCryptoData, isCryptoTask, pingCoinGecko } from "./coinGeckoApi";
import { getAStockData, formatAStockData, isAStockTask, extractAStockCodes, pingBaostock } from "./baoStockApi";
import { fetchGdeltData, formatGdeltDataAsMarkdown, checkGdeltHealth } from "./gdeltApi";
import { fetchNewsData, formatNewsDataAsMarkdown, checkNewsApiHealth, extractNewsQuery } from "./newsApi";
import { fetchMarketauxData, formatMarketauxDataAsMarkdown, checkMarketauxHealth } from "./marketauxApi";
import { fetchSimFinData, formatSimFinDataAsMarkdown, checkSimFinHealth } from "./simfinApi";

// --- 访问权限检查（Owner 或已授权用户）----------------------------------------

async function requireAccess(userId: number, openId: string) {
  if (openId === ENV.ownerOpenId) return;
  const access = await getUserAccess(userId);
  if (!access) {
    throw new TRPCError({ code: "FORBIDDEN", message: "请先输入访问密码" });
  }
}

// --- 带重试的 invokeLLM 包装（针对上游临时 500 错误）--------------------
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
  const DEFAULT_CORE_RULES = ` 用户核心规则（必须严格遵守）

### 投资理念（段永平体系）
- 以企业内在价值为核心，不做短线投机
- 买入前问：如果市场关闭10年，我还愿意持有吗？
- 只投资自己真正理解的企业
- 安全边际优先，宁可错过也不冒险
- 长期持有优质企业，让复利发挥作用
- 分散风险但不过度分散（集中在最有把握的机会）

### 重点关注市场（按优先级）
1. 美国（纳斯达克、NYSE）— 最高优先级
2. 香港（恒生、港股通）
3. 中国大陆（A股、沪深）
4. 欧盟（DAX、CAC40、欧元区）
5. 英国（FTSE100）
- 分析时必须考虑市场间关联性、异动传导和跨市场影响
- 必须进行逻辑正推（当前→未来）和倒推（结果→原因）双向验证

### 回复格式规范（GPT风格，必须执行）
- 每个章节必须有 ## 二级标题
- 关键数字、结论、风险点必须 **加粗**
- 核心判断和投资建议放在 > 引用块中
- 数据对比必须用 Markdown 表格（不少于3列）
- 整体排版有视觉层次，禁止输出纯文本段落
- 中文输出，专业但不晦涩

### 任务执行规范
- 每次任务执行前、执行中、输出前必须自我复查是否遵守以上规则
- 回复末尾必须提供2-3个具体的后续跟进问题，引导用户深入探讨
  - 任务之间有上下文关联，需主动引用历史任务结论进行对比和跟进`;

  // ----------------------------------------------------------------------------
  // 「投资理念 & 任务守则」三部分强制注入（最高优先级，GPT & Manus 必须遵守）
  // ----------------------------------------------------------------------------

  // 第一部分：投资守则（用户投资喜好、理念、个人情况）
  const PART1_INVESTMENT_RULES = userConfig?.investmentRules?.trim()
    ? `

## ═══ 第一部分：投资守则（最高优先级，必须严格遵守）═══
${userConfig.investmentRules.trim()}`
    : `

## ═══ 第一部分：投资守则（最高优先级，必须严格遵守）═══
${DEFAULT_CORE_RULES}`;

  // 第二部分：全局任务指令（AI执行规范，不随任务变动）
  const PART2_TASK_INSTRUCTION = userConfig?.taskInstruction?.trim()
    ? `

## ═══ 第二部分：全局任务指令（必须严格执行）═══
${userConfig.taskInstruction.trim()}`
    : (userConfig?.manusSystemPrompt?.trim()
      ? `

## ═══ 第二部分：全局任务指令（必须严格执行）═══
${userConfig.manusSystemPrompt.trim()}`
      : "");

  // 第三部分：资料数据库（优先数据来源）
  const PART3_DATA_LIBRARY = userConfig?.dataLibrary?.trim()
    ? `

## ═══ 第三部分：资料数据库（最高优先级数据来源）═══
【重要】以下资料数据库是用户指定的权威数据来源。执行任务时：
1. 优先从这些来源获取数据、新闻、观点和论证
2. 如果这些来源无法提供所需信息，再使用外部数据（必须标注来源和可靠性）
3. 禁止编造数据，如无法获取必须说明

${userConfig.dataLibrary.trim()}`
    : "";

  // 合并三部分，构建完整的守则块
  const USER_CORE_RULES = PART1_INVESTMENT_RULES + PART2_TASK_INSTRUCTION + PART3_DATA_LIBRARY;

  // Manus 幕后数据引擎
  const manusSystemPrompt = `[INTERNAL: You are the data engine. Recipient: GPT. Task: collect structured data for GPT analysis.]
输出格式：纯数据结构（表格/数字/指标），无解释性语句，无开头语，无结尾语。直接输出数据。

❗❗❗ 数据真实性强制规则（最高优先级，严格执行）：
1. 【第一优先】如果上下文中已提供「已获取的实时数据」，必须直接使用这些数据，不得重新编造或修改
2. 【第二优先】如果实时数据中没有某个指标，必须明确标注 N/A（未获取实时数据），严禁用训练记忆或历史知识填充
3. 【绝对禁止】编造、猜测、或使用训练数据作为实时数据输出——如果没有真实来源，必须标注 N/A
4. 【数据来源】每个数据点必须标注来源：[Yahoo Finance]、[FRED]、[Tavily: 网址]、[N/A]四种之一` + USER_CORE_RULES;

  // -- GPT 主角人设（用户的唯一对话伙伴，负责所有与用户的交流和跟进）----------------------------------------------
  const gptSystemPrompt = `你是用户的首席投资顾问，拥有 CFA 级别的专业能力和严谨的分析风格。
你和 Manus（数据引擎）共同工作，但用户只知道你——不要提及 Manus、不要提及内部分工。

## 专业性标准（核心，每次必须达到）
1. **精确性**：所有数据引用必须具体到小数点（如 PE=23.4x，不是“大约 20 多倍”）；时间节点必须标注（Q3 2024）
2. **明确判断**：对每个核心问题必须给出明确立场（高估/合理/低估、买入/持有/减仓），禁止模糊表述如“可以考虑”“有一定可能”
3. **推理链完整**：展示完整的推导过程：数据事实 → 分析逻辑 → 判断结论，不允许跳过中间步骤
4. **量化支撑**：每个论点必须有具体数字支撑，禁止纯文字描述性判断
5. **风险量化**：明确指出主要风险及其可能影响幅度（如“利率上升 100bp 将压缩估值 8-12%”）
6. **双向验证**：正推（当前基本面→未来预期）+ 倒推（如果判断正确，未来 12 个月应出现哪些可验证数据）

## 禁止事项（严格执行）
- 禁止输出“大约”“可能”“有待观察”“市场存分歧”等模糊表述作为核心结论
- 禁止在没有数据支撑的情况下给出判断
- 禁止把“分析框架”当作最终回复——框架是过程，结论才是交付物
- 禁止将 Manus 数据报告直接转述——必须加入自己的判断和解读

## 数据图表规范（强制执行）
**每次回复只要涉及数据、趋势、对比、走势，必须主动生成图表**，无需用户要求。

图表嵌入格式（直接输出以下标记，%%是字面量百分号）：

%%CHART%%
{"type":"line","title":"图表标题","data":[{"name":"2024Q1","value":100}],"xKey":"name","yKey":"value","unit":"元"}
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
{"type":"bar","title":"美团 vs 抖音营收对比","data":[{"name":"2022","meituan":1791,"douyin":800},{"name":"2023","meituan":2767,"douyin":1500}],"xKey":"name","series":[{"key":"meituan","color":"#6366f1","name":"美团"},{"key":"douyin","color":"#22c55e","name":"抖音"}],"unit":"亿元"}
%%END_CHART%%
**K线图格式（支持成交量 + MA5/MA20）：**
%%CHART%%
{"type":"candlestick","title":"股价K线","data":[{"name":"2024-01","open":100,"high":110,"low":95,"close":105,"volume":5000000},{"name":"2024-02","open":105,"high":115,"low":100,"close":112,"volume":6200000}],"xKey":"name"}
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
    const userLibraryUrls = userConfig?.dataLibrary
      ? userConfig.dataLibrary
          .split(/[\n,]+/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.startsWith("http"))
      : [];

    // GPT Step1 prompt：制定框架 + 开始主观分析
    const gptStep1UserMsg = `【用户当前消息】
${taskDescription}${historyBlock}${memoryBlock ? "\n\n" + memoryBlock : ""}${attachmentBlock}

---
【当前分析模式：${modeConfig.label}】${modeConfig.step1Hint ? "\n" + modeConfig.step1Hint : ""}

你的任务（Step 1）——作为首席投资顾问，先建立严谨的分析框架，再向数据引擎发出精确的数据需求：

1. **判断连续性**：结合对话历史，判断是延续还是新任务。如是延续，引用上一次的具体结论（不是模糊的"上次分析了"）。
2. **建立分析框架**：明确本次分析的层次结构（如：宏观环境 → 行业地位 → 企业基本面 → 估值 → 安全边际 → 投资建议）。
3. **初步判断（必须具体）**：对主观逻辑、市场情绪、投资逻辑给出初步判断和假设，必须包含具体的方向性结论（如"初步判断该公司护城河尚在，但待数据验证利润率走向"）。
4. **精确数据需求清单**：向数据引擎发出精确指令，包括：
   - 具体指标名称（如：Trailing PE、Forward PE、EV/EBITDA、自由现金流收益率）
   - 时间范围（如：最近 5 年财务数据、近 12 个月股价走势）
   - 对比基准（如：行业均值、主要竞争对手、历史平均估值）
   - 关键风险指标（如：负债率、利息覆盖倍数、应收账款周转天数）

输出格式：
## 任务判断
（延续/新任务 + 具体引用点）
## 分析框架
（分析层次结构）
## 初步判断
（必须包含方向性结论，不允许纯框架描述）
## 数据引擎精确需求清单
（具体指标名称 + 时间范围 + 对比基准 + 关键风险指标）`;

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
    const refinedTavilyQuery = extractDataNeedsQuery(gptStep1Output, taskDescription);

    // ── Step1 完成后：FRED + World Bank + IMF + 多源金融数据 + Tavily 精炼补充搜索 ────────────────────
    // 检测 A 股代码（用于触发 Baostock）
    const aStockCodes = extractAStockCodes(taskDescription + " " + gptStep1Output);
    const primaryAStockCode = aStockCodes[0] || null;

    const [macroDataResult, worldBankResult, imfDataResult, refinedTavilyResult,
      finnhubResult, fmpResult, polygonResult, secResult, avEconomicResult,
      cryptoResult, aStockResult, gdeltResult, newsApiResult, marketauxResult, simfinResult] = await Promise.allSettled([
      // FRED：用 Step1 输出的关键词，宏观数据匹配更精准
      getMacroDataByKeywords(taskDescription + " " + gptStep1Output),
      // World Bank：全球宏观数据（GDP/通胀/贸易/失业率等），根据任务自动识别国家
      fetchWorldBankData(taskDescription + " " + gptStep1Output),
      // IMF WEO：IMF 世界经测展望数据（含预测年），覆盖 GDP/通胀/失业率/财政债务/经常账户等
      fetchImfData(taskDescription + " " + gptStep1Output),
      // Tavily 精炼搜索：用 Step1 数据需求清单作为 query（仅当精炼 query 与原始不同时才补充搜索）
      isTavilyConfigured() && refinedTavilyQuery !== taskDescription
        ? searchForTask(refinedTavilyQuery, userLibraryUrls)
        : Promise.resolve(""),
      // Finnhub：实时报价/分析师评级/内部交易/公司新闻（仅当检测到股票代码时）
      primaryTicker && process.env.FINNHUB_API_KEY
        ? getFinnhubData(primaryTicker).then(d => formatFinnhubData(d))
        : Promise.resolve(""),
      // FMP：财务报表/DCF估值/分析师目标价/关键指标（仅当检测到股票代码时）
      primaryTicker && process.env.FMP_API_KEY
        ? getFmpData(primaryTicker).then(d => formatFmpData(d))
        : Promise.resolve(""),
      // Polygon.io：市场快照/公司详情/近期走势/新闻情绪（仅当检测到股票代码时）
      primaryTicker && process.env.POLYGON_API_KEY
        ? getPolygonData(primaryTicker).then(d => formatPolygonData(d))
        : Promise.resolve(""),
      // SEC EDGAR：XBRL 财务数据/年报/季报（仅当检测到美股代码时）
      primaryTicker && !primaryTicker.includes(".") // 只对美股进行 SEC 查询
        ? getSecData(primaryTicker).then(d => formatSecData(d))
        : Promise.resolve(""),
      // Alpha Vantage：宏观经测指标（利率/CPI/失业率/汇率）
      process.env.ALPHA_VANTAGE_API_KEY
        ? getAlphaVantageEconomicData().then(d => formatAVEconomicData(d))
        : Promise.resolve(""),
      // CoinGecko：加密货币实时价格/市值/趋势（检测到加密货币相关任务时触发）
      isCryptoTask(taskDescription + " " + gptStep1Output) && process.env.COINGECKO_API_KEY
        ? getCryptoData(taskDescription + " " + gptStep1Output).then(d => formatCryptoData(d))
        : Promise.resolve(""),
      // Baostock：A股历史行情/财务指标（检测到 A 股代码时触发）
      primaryAStockCode
        ? getAStockData(primaryAStockCode).then(d => formatAStockData(d))
        : Promise.resolve(""),
      // GDELT：全球事件/地缘风险/新闻情绪（检测到地缘政治/宏观事件任务时触发）
      fetchGdeltData(taskDescription + " " + gptStep1Output)
        .then(d => d ? formatGdeltDataAsMarkdown(d) : "")
        .catch(() => ""),
      // NewsAPI：全球新闻搜索/头条（仅当检测到股票代码/公司名/宏观事件关键词时触发）
      ENV.NEWS_API_KEY && extractNewsQuery(taskDescription + " " + gptStep1Output) !== null
        ? fetchNewsData(taskDescription + " " + gptStep1Output)
            .then(d => d ? formatNewsDataAsMarkdown(d) : "")
            .catch(() => "")
        : Promise.resolve(""),
      // Marketaux：金融新闻情绪评分/实体识别（检测到股票代码时触发）
      ENV.MARKETAUX_API_KEY && primaryTicker
        ? fetchMarketauxData(taskDescription + " " + gptStep1Output)
            .then(d => d ? formatMarketauxDataAsMarkdown(d) : "")
            .catch(() => "")
        : Promise.resolve(""),
      // SimFin：财务报表/衡生指标/股价历史（仅对美股代码触发）
      ENV.SIMFIN_API_KEY && primaryTicker && !primaryTicker.includes(".")
        ? fetchSimFinData(primaryTicker)
            .then(d => d ? formatSimFinDataAsMarkdown(d) : "")
            .catch(() => "")
        : Promise.resolve(""),
    ]);

        // ── 合并所有数据源结果 ──────────────────────────────────────────
    const stockData = stockDataResult;
    const macroData = macroDataResult;
    const worldBankData = worldBankResult;
    // IMF 数据：将 ImfDataResult 转为 Markdown 字符串
    const imfMarkdown =
      imfDataResult.status === "fulfilled" && imfDataResult.value
        ? formatImfDataAsMarkdown(imfDataResult.value)
        : "";
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
      simfinMarkdown,       // SimFin 财务报表/衡生指标/股价历史
    ].filter(Boolean).join("\n\n---\n\n");
    const webContentBlock = webSearchData.value || "";
    // 合并用于 GPT Step3 的完整数据块（保持向后兼容）
    const realTimeDataBlock = [structuredDataBlock, webContentBlock].filter(Boolean).join("\n\n---\n\n");
    const step2UserContent = `你是幕后数据引擎，输出给首席顾问使用。这是内部数据传递，不是用户面向报告。

【任务】
${fullContext}

【首席顾问的分析框架与数据需求】
${gptStep1Output}${structuredDataBlock ? `\n\n---\n\n【A. 结构化实时数据（Yahoo Finance / FRED / World Bank / IMF WEO，直接使用）】\n${structuredDataBlock}` : ""}${webContentBlock ? `\n\n---\n\n【B. 网页内容数据（来自用户资料数据库，需提取整理）】\n以下是从用户指定数据源抓取的网页原始内容，请从中提取：\n- 所有数字指标（估値倍数、目标价、评级、财务数据等）\n- 分析师核心观点和评级（买入/持有/卖出 + 目标价）\n- 关键定性结论（竞争格局、催化剂、风险因素）\n- 资金流向、持仓变化等机构动向数据\n\n${webContentBlock}` : ""}

---
**输出规则：**

1. **A区（结构化数据）**：直接输出数字和表格，无需解释
2. **B区（网页内容）**：提取并整理以下三类信息：
   - 数据表格：估值指标、财务数据、价格目标（保留数字精度）
   - 分析师共识：评级分布（买入X家/持有X家/卖出X家）、平均目标价、最高/最低目标价
   - 关键信号：最重要的3-5条定性结论（每条不超过30字，来自网页原文）
3. 格式：优先表格（指标 | 当前值 | 行业均 | 竞争对手 | 历史均），表格不够用时再用简短列表
4. 数据精度：保留两位小数；标注时间节点（Q/FY）；标注币种；标注来源域名
5. 覆盖全部需求清单中的每个指标，缺少的用 N/A 标注，不得略过
6. 如涉及多市场，加一行传导关系说明（一句话即可）
7. **总输出不超过 ${modeConfig.step2MaxWords} 字**，不重复数据，不填充废话
8. 禁止：主观建议、模糊表达、重复数据、超过 ${modeConfig.step2MaxWords} 字
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
    const gptUserMessage = `【用户原始任务】
${taskDescription}${historyBlock}

【你在 Step1 的初步分析】
${gptStep1Output}

【Manus 数据报告（完善描述 + 数据收集）】
${manusReport}

---
【当前分析模式：${modeConfig.label}】${modeConfig.step3Hint ? "\n" + modeConfig.step3Hint : ""}

你现在是这次任务的最终决策者。请基于以上所有信息，输出一份**完整、深度、有明确判断**的分析回复。

**核心要求（不可省略）：**
1. **整合推理**：将 Manus 的数据与你的框架深度融合，逐步展开推理过程，不要只给结论——要让用户看到你是如何从数据推导出判断的
2. **明确立场**：对用户的核心问题给出清晰的判断（买/卖/持有、高估/低估、机会/风险等），不要模糊回避
3. **量化支撑**：用 Manus 提供的具体数据（估值倍数、财务指标、价格等）支撑每一个论点，数据要精确引用
4. **双向验证**：正推（当前基本面→未来预期）+ 倒推（如果判断正确，哪些数据应该出现），增强结论可信度
5. **风险与边界**：明确指出判断成立的前提条件和主要风险，不回避不确定性
6. **上下文连贯**：如果是历史任务的延续，主动引用之前的分析结论，保持对话连贯性
7. **格式要求**：使用 Markdown 标题、加粗、表格等结构化输出，重点数据和判断要突出显示

**输出要求：**
- 报告必须详细完整，不得因篇幅原因省略任何重要分析维度
- 每个论点都要有完整的推理链，不能只给结论
- 涉及数字的地方必须精确引用 Manus 数据，不能用"约"、"大概"等模糊表述
- 最终判断要明确、可操作（如：目标价位区间、建仓时机条件、止损线设置）

**回复末尾必须提出2-3个具体的后续跟进问题。格式要求：**
- 每个问题必须完整包裹在标记内：%%FOLLOWUP%%问题内容%%END%%
- 不要在标记外再写数字列表（1. 2. 3.），直接连续写三个标记即可
- 示例：%%FOLLOWUP%%苹果Q2营收预期是多少？%%END%%
%%FOLLOWUP%%客户端升级周期对利润率影响如何？%%END%%
%%FOLLOWUP%%与上季度相比库存去化进展怎样？%%END%%`;

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
    type ApiSourceEntry = { name: string; category: string; icon?: string };
    const apiSources: ApiSourceEntry[] = [];
    // 市场数据类
    if (stockData.status === "fulfilled" && stockData.value) {
      apiSources.push({ name: "Yahoo Finance", category: "市场数据", icon: "📊" });
    }
    if (finnhubMarkdown) apiSources.push({ name: "Finnhub", category: "市场数据", icon: "📈" });
    if (fmpMarkdown) apiSources.push({ name: "FMP", category: "市场数据", icon: "💹" });
    if (polygonMarkdown) apiSources.push({ name: "Polygon.io", category: "市场数据", icon: "🔸" });
    if (secMarkdown) apiSources.push({ name: "SEC EDGAR", category: "市场数据", icon: "🏦" });
    // 宏观指标类
    if (macroData.status === "fulfilled" && macroData.value) {
      apiSources.push({ name: "FRED", category: "宏观指标", icon: "🏦" });
    }
    if (worldBankData.status === "fulfilled" && worldBankData.value) {
      apiSources.push({ name: "World Bank", category: "宏观指标", icon: "🌍" });
    }
    if (imfMarkdown) apiSources.push({ name: "IMF WEO", category: "宏观指标", icon: "🌐" });
    if (avEconomicMarkdown) apiSources.push({ name: "Alpha Vantage", category: "宏观指标", icon: "📊" });
    // 新闻情绪类
    if (gdeltMarkdown) apiSources.push({ name: "GDELT", category: "新闻情绪", icon: "🌏" });
    if (newsApiMarkdown) apiSources.push({ name: "NewsAPI", category: "新闻情绪", icon: "📰" });
    if (marketauxMarkdown) apiSources.push({ name: "Marketaux", category: "新闻情绪", icon: "💯" });
    // 加密货币类
    if (cryptoMarkdown) apiSources.push({ name: "CoinGecko", category: "加密货币", icon: "🪙" });
    // A股数据类
    if (aStockMarkdown) apiSources.push({ name: "Baostock", category: "A股数据", icon: "🇳" });
    // 财务数据类（归入市场数据分组）
    if (simfinMarkdown) apiSources.push({ name: "SimFin", category: "市场数据", icon: "💼" });

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
      return {
        openaiApiKey: config?.openaiApiKey ? "•".repeat(8) + config.openaiApiKey.slice(-4) : "",
        openaiModel: config?.openaiModel ?? DEFAULT_MODEL,
        hasApiKey: !!config?.openaiApiKey,
        manusSystemPrompt: config?.manusSystemPrompt ?? "",
        userCoreRules: config?.userCoreRules ?? "",
        // 三部分守则
        investmentRules: config?.investmentRules ?? "",
        taskInstruction: config?.taskInstruction ?? "",
        dataLibrary: config?.dataLibrary ?? "",
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

    // 获取实时数据源状态
    getDataSourceStatus: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      const tavilyKeys = getTavilyKeyStatuses();
      const fredConfigured = !!process.env.FRED_API_KEY;

      // 并行健康检测：World Bank + IMF + Finnhub + FMP + Polygon + SEC EDGAR + Alpha Vantage + CoinGecko + Baostock + GDELT + NewsAPI + Marketaux + SimFin
      const [wbHealth, imfHealth, finnhubHealth, fmpHealth, polygonHealth, secHealth, avHealth, cgHealth, bsHealth, gdeltHealth, newsApiHealth, marketauxHealth, simfinHealth] = await Promise.allSettled([
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
        checkImfApiHealth().then((r) => r.status),
        // Finnhub
        process.env.FINNHUB_API_KEY
          ? checkFinnhubHealth().then(r => r.ok ? "active" as const : "error" as const)
          : Promise.resolve("error" as const),
        // FMP
        process.env.FMP_API_KEY
          ? checkFmpHealth().then(r => r.ok ? "active" as const : "error" as const)
          : Promise.resolve("error" as const),
        // Polygon.io
        process.env.POLYGON_API_KEY
          ? checkPolygonHealth().then(r => r.ok ? "active" as const : "error" as const)
          : Promise.resolve("error" as const),
        // SEC EDGAR
        checkSecHealth().then(r => r.ok ? "active" as const : "error" as const),
        // Alpha Vantage
        process.env.ALPHA_VANTAGE_API_KEY
          ? checkAVHealth().then(r => r.ok ? "active" as const : "error" as const)
          : Promise.resolve("error" as const),
        // CoinGecko
        process.env.COINGECKO_API_KEY
          ? pingCoinGecko().then(ok => ok ? "active" as const : "error" as const)
          : Promise.resolve("error" as const),
        // Baostock（A股）：Python 子进程库，仅在本地沙筆环境可用
        // 当探针失败时返回 "warning"（表示环境限制）而非 "error"（表示配置错误）
        pingBaostock().then(ok => ok ? "active" as const : "warning" as const).catch(() => "warning" as const),
        // GDELT：免费公开，无需 Key，但受频率限制（5s 间隔）
        // 健康检测时不实际请求（避免触发限速），直接返回 active
        Promise.resolve("active" as const),
        // NewsAPI
        process.env.NEWS_API_KEY
          ? checkNewsApiHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const)
          : Promise.resolve("error" as const),
        // Marketaux
        process.env.MARKETAUX_API_KEY
          ? checkMarketauxHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const)
          : Promise.resolve("error" as const),
        // SimFin
        process.env.SIMFIN_API_KEY
          ? checkSimFinHealth().then(ok => ok ? "active" as const : "error" as const).catch(() => "error" as const)
          : Promise.resolve("error" as const),
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

      return {
        tavily: tavilyKeys,
        tavilyConfigured: isTavilyConfigured(),
        fred: { configured: fredConfigured, status: fredConfigured ? "active" as const : "error" as const },
        yahoo: { configured: true, status: "active" as const },
        worldBank: { configured: true, status: worldBankStatus },
        imf: { configured: true, status: imfStatus },
        finnhub: { configured: !!process.env.FINNHUB_API_KEY, status: finnhubStatus },
        fmp: { configured: !!process.env.FMP_API_KEY, status: fmpStatus },
        polygon: { configured: !!process.env.POLYGON_API_KEY, status: polygonStatus },
        secEdgar: { configured: true, status: secStatus },
        alphaVantage: { configured: !!process.env.ALPHA_VANTAGE_API_KEY, status: avStatus },
        coinGecko: { configured: !!process.env.COINGECKO_API_KEY, status: cgStatus },
        baostock: { configured: true, status: bsStatus },
        gdelt: { configured: true, status: gdeltStatus },
        newsApi: { configured: !!process.env.NEWS_API_KEY, status: newsApiStatus },
        marketaux: { configured: !!process.env.MARKETAUX_API_KEY, status: marketauxStatus },
        simfin: { configured: !!process.env.SIMFIN_API_KEY, status: simfinStatus },
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
