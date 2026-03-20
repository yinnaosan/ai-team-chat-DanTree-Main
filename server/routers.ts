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
} from "./db";
import { storagePut } from "./storage";
import { callOpenAI, testOpenAIConnection, DEFAULT_MODEL } from "./rpa";
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
  attachmentContext?: string   // 附件提取的文本内容（可选）
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

  // 如果用户已保存自定义守则，优先使用；否则使用默认守则
  const USER_CORE_RULES = userConfig?.userCoreRules
    ? `

## 用户自定义投资守则（必须严格遵守）
${userConfig.userCoreRules}`
    : `

## 用户核心规则（必须严格遵守）
${DEFAULT_CORE_RULES}`;


  // ── Manus 幕后数据引擎（不直接面对用户，只负责数据收集和量化分析）──────────────────
  const manusSystemPrompt = (userConfig?.manusSystemPrompt ||
    `你是幕后数据引擎，专门负责数据收集、量化分析和结构化报告。
你的输出将直接供 GPT 使用，不直接展示给用户。

## 输出要求
- 全面收集客观数据和事实，不需要主观建议
- 包含具体数字、指标、趋势、比较数据
- 用 Markdown 表格对比关键数据（至少 3 列）
- 标注数据来源和时间节点
- 中文输出，数字保留2位小数`) + USER_CORE_RULES;

  // ── GPT 主角人设（用户的唯一对话伙伴，负责所有与用户的交流和跟进）──────────────────
  const gptSystemPrompt = `你是用户的首席投资顾问，也是用户唯一的对话伙伴。
你和 Manus（数据引擎）共同工作，但用户只知道你——不要提及 Manus、不要提及内部分工。

## 你的核心职责
1. **主导对话**：所有与用户的交流、解释、跟进问题都由你负责
2. **深度解读数据**：接收 Manus 的客观数据，加入主观判断、投资逻辑和情绪分析
3. **连续跟进**：主动引用历史任务结论，将每次任务纳入整体投资跨度和连续对话中
4. **引导深入**：每次回复末尾必须提出 2-3 个具体的跟进问题，引导用户深入探讨
5. **一致性**：每次回复都是同一个顾问的声音，有记忆、有个性、有持续性

## 数据图表规范
当用户要求绘制图表、走势图、对比图、数据可视化时，必须在回复中嵌入以下格式的图表标记：
示例：[CHART_START] {"type":"line","title":"图表标题","data":[{"name":"标签","value":100}],"xKey":"name","yKey":"value","unit":"单位"} [CHART_END]
注意：[CHART_START] 和 [CHART_END] 是实际输出时要写成 PERCENT_PERCENTCHART PERCENT_PERCENT 和 PERCENT_PERCENTEND_CHART PERCENT_PERCENT（即百分号加大写关键词）
- type 可选：line（折线）| bar（柱状）| area（面积）| pie（饼图）
- data 数组最多20个数据点
- 多系列时使用 series 字段：[{"key":"字段名","color":"#hex","name":"显示名"}]
- 图表标记前后可以有正常的 Markdown 文字说明` + USER_CORE_RULES;

  // ── 历史记忆上下文 ────────────────────────────────────────────────────────
  const recentMemory = await getRecentMemory(userId, 8);
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
你的任务（Step 1）：
1. **判断连续性**：结合对话历史，判断这是上一个任务的延续还是全新任务。如果是延续，主动引用上下文。
2. **制定分析框架**：明确需要哪些数据、从什么角度分析、最终回复的结构（符合价值投资视角）。
3. **开始处理你擅长的部分**：对主观判断、逻辑推理、市场情绪、投资策略等你能直接处理的内容，现在就开始分析，输出初步观点。
4. **列出数据需求**：明确告诉 Manus 需要收集哪些具体数据、指标、时间范围。

输出格式：
## 任务判断
（延续/新任务，理由）
## 分析框架
（结构化框架）
## 我的初步分析
（主观判断、逻辑推理、投资逻辑——你直接能处理的部分）
## Manus 数据需求清单
（具体数据指标、时间范围、对比基准）`;

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
          maxTokens: 1200,
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
    const step2UserContent = `你是幕后数据引擎，请分两步完成以下工作：

【原始任务】
${fullContext}

【GPT 分析框架与数据需求】
${gptStep1Output}

---
**第一步：完善任务描述**
- 补充专业术语和分析维度（符合价值投资视角）
- 明确分析范围和边界
- 识别任务是否为历史任务的延续，如是则注明关联点

**第二步：数据收集与整理**
- 严格按照 GPT 的数据需求清单收集数据
- 优先收集：估值（PE/PB/DCF）、护城河指标、财务健康数据、安全边际
- 关注市场：美国>香港>大陆>欧盟>英国，标注跨市场关联
- 用 Markdown 表格对比关键数据（至少3列），标注数据来源和时间节点
- 根据任务复杂度自适应输出长度（简单任务500字，复杂任务不超过2000字）
- 专注客观数据，不需要主观建议（主观分析由 GPT 负责）`;

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
            maxTokens: 2000,
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
    const gptUserMessage = `【用户原始任务】
${taskDescription}${historyBlock}

【你在 Step1 的初步分析】
${gptStep1Output}

【Manus 数据报告（完善描述 + 数据收集）】
${manusReport}

---
现在请整合以上所有内容，输出最终回复。要求：
1. 将你的初步分析与 Manus 的数据深度结合，形成完整的投资判断
2. 严格遵守投资理念（段永平体系）：内在价值、安全边际、长期持有
3. 进行正推（当前→未来）和倒推（结果→原因）双向验证
4. 如果是历史任务的延续，主动引用上下文，保持对话连贯性
5. 回复末尾必须提出2-3个具体的后续跟进问题。格式要求：
   - 每个问题必须完整包裹在标记内：%%FOLLOWUP%%问题内容%%END%%
   - 不要在标记外再写数字列表（1. 2. 3.），直接连续写三个标记即可
   - 示例：%%FOLLOWUP%%苹果Q2营收预期是多少？%%END%%
   %%FOLLOWUP%%客户端升级周期对利润率影响如何？%%END%%
   %%FOLLOWUP%%与上季度相比库存去化进展怎样？%%END%%`;

    let finalReply: string;
    if (userConfig?.openaiApiKey) {
      try {
        console.log(`[Collaboration] Task ${taskId} Step3: Calling GPT (${userConfig.openaiModel || DEFAULT_MODEL})...`);
        finalReply = await callOpenAI({
          apiKey: userConfig.openaiApiKey,
          model: userConfig.openaiModel || DEFAULT_MODEL,
          messages: [
            { role: "system", content: gptSystemPrompt },
            { role: "user", content: gptUserMessage },
          ],
        });
        console.log(`[Collaboration] Task ${taskId} Step3: GPT final reply OK, length=${finalReply.length}`);
      } catch (gptErr) {
        console.error(`[Collaboration] Task ${taskId} Step3: GPT FAILED, falling back to invokeLLM:`, (gptErr as Error)?.message);
        const fb = await invokeLLM({
          messages: [
            { role: "system", content: gptSystemPrompt },
            { role: "user", content: gptUserMessage },
          ],
        });
        finalReply = String(fb.choices?.[0]?.message?.content || manusReport);
      }
    } else {
      const fb = await invokeLLM({
        messages: [
          { role: "system", content: gptSystemPrompt },
          { role: "user", content: gptUserMessage },
        ],
      });
      finalReply = String(fb.choices?.[0]?.message?.content || manusReport);
    }

        // ── 只向用户输出一条最终回复 ─────────────────────────────────────────────
    const msgId = await insertMessage({
      taskId,
      userId,
      conversationId,
      role: "assistant",
      content: finalReply,
      metadata: { phase: "final" },
    });

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
        runCollaborationFlow(taskId, userId, description, conversationId, attachmentContext)
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

    getMemory: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        return getRecentMemory(ctx.user.id, input.limit);
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
      };
    }),
    // 保存 API Key 和模型选择
    setConfig: protectedProcedure
      .input(z.object({
        openaiApiKey: z.string().max(256).optional(),
        openaiModel: z.string().max(128).optional(),
        manusSystemPrompt: z.string().max(8000).optional(),
        userCoreRules: z.string().max(10000).optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await upsertRpaConfig(ctx.user.id, {
          openaiApiKey: input.openaiApiKey,
          openaiModel: input.openaiModel,
          manusSystemPrompt: input.manusSystemPrompt,
          userCoreRules: input.userCoreRules,
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
