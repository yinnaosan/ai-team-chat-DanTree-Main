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
import { getFileCategory, extractFileContent, formatFileSize } from "./fileProcessor";
import { TRPCError } from "@trpc/server";

// ─── 访问权限检查（Owner 或已授权用户）────────────────────────────────────────

async function requireAccess(userId: number, openId: string) {
  if (openId === ENV.ownerOpenId) return;
  const access = await getUserAccess(userId);
  if (!access) {
    throw new TRPCError({ code: "FORBIDDEN", message: "请先输入访问密码" });
  }
}

// ─── 带重试的 invokeLLM 包装（针对上游临时 500 错误）────────────────────
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

// ─── 三步协作流程（全程静默，只输出一条最终回复）─────────────────────────────
//
//  Step 1 — GPT 主导规划：制定分析框架，开始处理擅长的主观判断/逻辑推理部分
//  Step 2 — Manus 执行：先完善任务描述，再按 GPT 框架收集数据、整理表格
//  Step 3 — GPT 整合输出：接收 Manus 完整报告，深度思考，输出最终回复
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
  // ════════════════════════════════════════════════════════════════════════════
  // 用户核心规则（每次任务必须严格遵守）
  // ════════════════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════════════════
  // 「投资理念 & 任务守则」三部分强制注入（最高优先级，GPT & Manus 必须遵守）
  // ════════════════════════════════════════════════════════════════════════════

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
  // 兼容旧变量（废弃，保留不删）
  const GLOBAL_TASK_INSTRUCTION = "";

  // ── Manus 幕后数据引擎──────────────
  const manusSystemPrompt = `[INTERNAL: You are the data engine. Recipient: GPT. Task: collect structured data for GPT analysis.]
输出格式：纯数据结构（表格/数字/指标），无解释性语句，无开头语，无结尾语。直接输出数据。` + USER_CORE_RULES + GLOBAL_TASK_INSTRUCTION;

  // ── GPT 主角人设（用户的唯一对话伙伴，负责所有与用户的交流和跟进）──────────────────────────────────────────────
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
- 分析板块行情时优先使用 heatmap；分析个股走势时优先使用 candlestick` + USER_CORE_RULES + GLOBAL_TASK_INSTRUCTION;

  // ── 历史记忆上下文 ────────────────────────────────────────────────────────
  // 对话级记忆：优先获取当前对话内的记忆，如果对话无记忆则回落到用户全局记忆
  const conversationMemory = conversationId ? await getRecentMemory(userId, 8, conversationId) : [];
  const recentMemory = conversationMemory.length > 0 ? conversationMemory : await getRecentMemory(userId, 5);
  const memoryBlock = recentMemory.length > 0
    ? `\n\n【历史任务记忆（最近${recentMemory.length}条，用于跨任务连续跟进）】\n` +
      recentMemory.map((m, i) =>
        `${i + 1}. [${new Date(m.createdAt).toLocaleDateString("zh-CN")}] ${m.taskTitle}\n   摘要：${m.summary}`
      ).join("\n")
    : "";

  // ── 附件上下文 ────────────────────────────────────────────────────────────
  const attachmentBlock = attachmentContext
    ? `\n\n【用户上传的文件内容】\n${attachmentContext}`
    : "";

  // ── 对话历史（同对话框内最近5轮，用于任务连续性）────────────────────────────
  let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (conversationId) {
    try {
      const recentMsgs = await getMessagesByConversation(conversationId);
      // 取最近10条（5轮对话），排除当前正在处理的任务消息（只取 completed 的）
      const historyMsgs = recentMsgs
        .filter(m => m.role === "user" || (m.role === "assistant" && m.metadata && (m.metadata as any).phase === "final"))
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

  // ══ 分析模式配置 ═══════════════════════════════════════════════════════════════════════
  const modeConfig = {
    quick: {
      label: "快速模式",
      step1MaxTokens: 600,
      step2MaxWords: 2000,
      step3MaxTokens: 1200,
      step1Hint: "快速模式：输出简洁。框架不超过 3 层，数据需求不超过 5 条。",
      step2Hint: "快速模式：总输出不超过 2000 字。只输出核心指标。",
      step3Hint: "快速模式：输出简洁报告，不超过 800 字。直接给出结论和关键数据，省略详细推理过程。",
    },
    standard: {
      label: "标准模式",
      step1MaxTokens: 1200,
      step2MaxWords: 6000,
      step3MaxTokens: 2400,
      step1Hint: "",
      step2Hint: "",
      step3Hint: "",
    },
    deep: {
      label: "深度模式",
      step1MaxTokens: 2000,
      step2MaxWords: 10000,
      step3MaxTokens: 4000,
      step1Hint: "深度模式：尽可能全面。框架要包含宏观环境、行业地位、企业基本面、估值、安全边际全部层次。数据需求尽可能详细。",
      step2Hint: "深度模式：尽可能全面收集数据，总输出不超过 10000 字。包含历史数据对比、竞争对标全面对比。",
      step3Hint: "深度模式：输出最全面、最详细的投资分析报告。每个论点展开完整推理链，不得因篇幅省略任何分析维度。",
    },
  }[analysisMode];

  try {
    // ════════════════════════════════════════════════════════════════════════
    // Step 1 — GPT 主导规划：制定分析框架，开始处理擅长的主观/逻辑部分
    // ════════════════════════════════════════════════════════════════════════
    await updateTaskStatus(taskId, "manus_working");
    console.log(`[Collaboration] Task ${taskId} Step1: GPT planning & initial analysis...`);

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

    let gptStep1Output: string;
    if (userConfig?.openaiApiKey) {
      try {
        const step1Res = await callOpenAI({
          apiKey: userConfig.openaiApiKey,
          model: userConfig.openaiModel || DEFAULT_MODEL,
          messages: [
            { role: "system", content: gptSystemPrompt },
            { role: "user", content: gptStep1UserMsg },
          ],
          maxTokens: modeConfig.step1MaxTokens,
        });
        gptStep1Output = step1Res;
      } catch (e) {
        console.warn(`[Collaboration] Task ${taskId} Step1: GPT failed, using fallback framework`);
        gptStep1Output = `## 分析框架\n标准价值投资分析：估值→护城河→财务健康→安全边际\n## Manus 数据需求清单\n财务数据、估值指标、市场表现、行业对比`;
      }
    } else {
      gptStep1Output = `## 分析框架\n标准价值投资分析：估值→护城河→财务健康→安全边际\n## Manus 数据需求清单\n财务数据、估值指标、市场表现、行业对比`;
    }
    console.log(`[Collaboration] Task ${taskId} Step1 done. GPT framework+analysis length=${gptStep1Output.length}`);

    // ════════════════════════════════════════════════════════════════════════
    // Step 2 — Manus 先完善任务，再按 GPT 框架执行数据收集（内置 LLM）
    // ════════════════════════════════════════════════════════════════════════
    await updateTaskStatus(taskId, "manus_working");
    console.log(`[Collaboration] Task ${taskId} Step2: Manus enhancing + data collection...`);
    const step2UserContent = `你是幕后数据引擎，输出给首席顾问使用。这是内部数据传递，不是用户面向报告。

【任务】
${fullContext}

【首席顾问的分析框架与数据需求】
${gptStep1Output}

---
**输出规则：**

1. 纯数据输出：只输出数字、表格、指标名称。无需开头语、过渡语、总结语、解释性文字、来源标注
2. 格式：优先表格（指标 | 当前值 | 行业均 | 竞争对手 | 历史均），表格不够用时再用简短列表
3. 数据精度：保留两位小数；标注时间节点（Q/FY）；标注币种
4. 覆盖全部需求清单中的每个指标，缺少的用 N/A 标注，不得略过
5. 如涉及多市场，加一行传导关系说明（一句话即可）
6. **总输出不超过 ${modeConfig.step2MaxWords} 字**，不重复数据，不填充废话
7. 禁止：主观建议、模糊表达、重复数据、超过 ${modeConfig.step2MaxWords} 字
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
      console.log(`[Collaboration] Task ${taskId} Step2: Manus report done, length=${manusReport.length}`);
    } catch (manusErr) {
      // Manus LLM 上游不稳定时，自动降级用 GPT 完成数据收集
      console.warn(`[Collaboration] Task ${taskId} Step2: Manus FAILED, falling back to GPT for data collection:`, (manusErr as Error)?.message);
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
          console.log(`[Collaboration] Task ${taskId} Step2: GPT fallback done, length=${manusReport.length}`);
        } catch (gptFallbackErr) {
          console.warn(`[Collaboration] Task ${taskId} Step2: GPT fallback also failed, using GPT Step1 output as data`);
          manusReport = `## 数据收集（基于已有分析）\n\n由于数据引擎暂时不可用，以下基于 GPT 初步分析：\n\n${gptStep1Output}`;
        }
      } else {
        // 没有 GPT Key，用 Step1 的初步分析作为数据基础继续
        manusReport = `## 数据收集（基于已有分析）\n\n由于数据引擎暂时不可用，以下基于初步分析框架：\n\n${gptStep1Output}`;
      }
    }
    await updateTaskStatus(taskId, "manus_analyzing", { manusResult: manusReport });

    // ════════════════════════════════════════════════════════════════════════
    // Step 3 — GPT 整合输出（接收 Manus 报告，深度思考，输出最终回复）
    // ════════════════════════════════════════════════════════════════════════
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

    // ── 先写入占位消息（streaming 状态），前端立即开始接收流 ───────────────────
    const streamMsgId = await insertMessage({
      taskId,
      userId,
      conversationId,
      role: "assistant",
      content: "",
      metadata: { phase: "streaming" },
    });
    await updateTaskStatus(taskId, "streaming", { streamMsgId });

    let finalReply: string;
    if (userConfig?.openaiApiKey) {
      try {
        console.log(`[Collaboration] Task ${taskId} Step3: Streaming GPT (${userConfig.openaiModel || DEFAULT_MODEL})...`);
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
            lastDbUpdate = Date.now();
          }
        }
        // 最终完整写入
        await updateMessageContent(streamMsgId, accumulated);
        finalReply = accumulated;
        console.log(`[Collaboration] Task ${taskId} Step3: Streaming done, length=${finalReply.length}`);
      } catch (gptErr) {
        const errMsg = (gptErr as Error)?.message || "";
        console.error(`[Collaboration] Task ${taskId} Step3: GPT FAILED, falling back to invokeLLM:`, errMsg);
        if (errMsg.includes("TPM") || errMsg.includes("tokens per min") || errMsg.includes("Request too large")) {
          console.warn(`[Collaboration] Task ${taskId} Step3: TPM limit hit — Manus report length=${manusReport.length}.`);
        }
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

    // ── 标记消息为 final，更新任务状态 ─────────────────────────────────────────
    // 用 updateMessageContent 已写入内容，这里只需更新 metadata
    const msgId = streamMsgId;
    await updateTaskStatus(taskId, "completed", { gptSummary: finalReply });

    // ── 自动生成任务摘要保存到长期记忆 ───────────────────────────────────────
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
          keywords: taskDescription.slice(0, 50),
        });
      }
    } catch (memErr) {
      console.warn("[Memory] Failed to save memory context:", memErr);
    }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Collaboration] Task', taskId, 'FAILED:', errMsg);
    console.error('[Collaboration] Full error:', err);
    await updateTaskStatus(taskId, "failed");
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

// ─── tRPC Routers ─────────────────────────────────────────────────────────────

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

  // ─── 访问控制 ─────────────────────────────────────────────────────────────
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

  // ─── 会话管理 ─────────────────────────────────────────────────────────────
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

  // ─── 文件上传 ─────────────────────────────────────────────────────────────
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

  // ─── 聊天 & 任务 ──────────────────────────────────────────────────────────
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

  // ─── ChatGPT API 配置 ────────────────────────────────────────────────────────────────────────────────────────
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
  }),
    // ─── 数据库连接管理 ───────────────────────────────────────────────────────
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
