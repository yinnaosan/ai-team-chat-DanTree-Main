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

// ─── 四步协作流程（全程静默，只输出一条最终回复）─────────────────────────────
//
//  Step 1 — Manus 分解任务：理解需求，拆解子步骤，识别数据需求
//  Step 2 — Manus 执行：数据收集、分析、统计，生成结构化报告
//  Step 3 — GPT 经理：审阅报告，给出观点、文字建议和表达框架（内部，不输出）
//  Step 4 — Manus 整合：按 GPT 经理建议输出最终结构化 Markdown 回复
//  Step 5 — GPT 最终审核：确认质量，如有问题直接修正后输出
//
//  以上全部在后台静默执行，不向用户显示任何中间过程消息。

async function runCollaborationFlow(
  taskId: number,
  userId: number,
  taskDescription: string,
  conversationId?: number,
  attachmentContext?: string   // 附件提取的文本内容（可选）
) {
  const userConfig = await getRpaConfig(userId);

  // ══════════════════════════════════════════════════════════════════════════
  // 用户核心规则（每次任务必须严格遵守）
  // ══════════════════════════════════════════════════════════════════════════
  const USER_CORE_RULES = `
## 用户核心规则（必须严格遵守）

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


  // ── Manus 幕后数据引擎（不直接面对用户，只负责数据收集和量化分析）────────────────────
  const manusSystemPrompt = (userConfig?.manusSystemPrompt ||
    `你是幕后数据引擎，专门负责数据收集、量化分析和结构化报告。
你的输出将直接供 GPT 使用，不直接展示给用户。

## 输出要求
- 全面收集客观数据和事实，不需要主观建议
- 包含具体数字、指标、趋势、比较数据
- 用 Markdown 表格对比关键数据（至少 3 列）
- 标注数据来源和时间节点
- 中文输出，数字保留2位小数`) + USER_CORE_RULES;

  // ── GPT 主角人设（用户的唯一对话伙伴，负责所有与用户的交流和跟进）────────────────────
  const gptSystemPrompt = `你是用户的首席投资顾问，也是用户唯一的对话伙伴。
你和 Manus（数据引擎）共同工作，但用户只知道你——不要提及 Manus、不要提及内部分工。

## 你的核心职责
1. **主导对话**：所有与用户的交流、解释、跟进问题都由你负责
2. **深度解读数据**：接收 Manus 的客观数据，加入主观判断、投资逻辑和情绪分析
3. **连续跟进**：主动引用历史任务结论，将每次任务纳入整体投资跨度和连续对话中
4. **引导深入**：每次回复末尾必须提出 2-3 个具体的跟进问题，引导用户深入探讨
5. **一致性**：每次回复都是同一个顾问的声音，有记忆、有个性、有持续性` + USER_CORE_RULES;;

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

  const fullContext = taskDescription + memoryBlock + attachmentBlock;

  try {
    // ════════════════════════════════════════════════════════════════════════
    // Step 1 — 并行：Manus 完善任务描述 + GPT 制定分析框架（同时进行，节约时间）
    // ════════════════════════════════════════════════════════════════════════
    await updateTaskStatus(taskId, "manus_working");
    console.log(`[Collaboration] Task ${taskId} Step1: Parallel - Manus enhancing + GPT planning...`);

    const [manusEnhancedResult, gptPlanResult] = await Promise.all([
      // Manus：完善任务描述，补充专业细节和数据收集方向
      invokeLLM({
        messages: [
          { role: "system", content: manusSystemPrompt },
          {
            role: "user",
            content: `你是数据引擎，请先完善以下任务描述，使其更加专业全面，然后列出你将收集的关键数据点。

原始任务：${fullContext}

【投资理念约束】严格按照段永平价值投资体系，重点关注美国、香港、大陆、欧盟、英国市场，聚焦企业内在价值和安全边际相关数据。

请输出：
1. 完善后的任务描述（补充专业术语、明确分析维度，符合价值投资视角）
2. 数据收集清单（具体指标、时间范围、对比基准，优先收集与企业内在价值相关的数据）`,
          },
        ],
      }),
      // GPT：制定分析框架和指令（轻量调用，仅规划不分析）
      userConfig?.openaiApiKey
        ? callOpenAI({
            apiKey: userConfig.openaiApiKey,
            model: userConfig.openaiModel || DEFAULT_MODEL,
            messages: [
              { role: "system", content: gptSystemPrompt },
              {
                role: "user",
                content: `用户任务：${taskDescription.slice(0, 300)}

【投资理念】段永平体系：企业内在价值、安全边际、长期持有。关注市场：美国>香港>大陆>欧盟>英国。

请用80字以内制定数据分析框架：需要哪些数据、分析角度、最终回复结构（符合价值投资视角）。只输出框架，不要分析内容。`,
              },
            ],
            maxTokens: 300, // 限制 token，保持轻量
          })
        : Promise.resolve("标准分析框架：数据收集→趋势分析→跨市场关联→投资建议"),
    ]);

    const manusEnhanced = String(manusEnhancedResult.choices?.[0]?.message?.content || fullContext);
    const gptPlan = typeof gptPlanResult === "string"
      ? gptPlanResult
      : String((gptPlanResult as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || "");
    console.log(`[Collaboration] Task ${taskId} Step1 done. Enhanced=${manusEnhanced.length}, Plan=${gptPlan.length}`);

    // ════════════════════════════════════════════════════════════════════════
    // Step 2 — Manus 按 GPT 框架执行完整数据分析（内置 LLM，免费）
    // ════════════════════════════════════════════════════════════════════════
    console.log(`[Collaboration] Task ${taskId} Step2: Manus executing data analysis...`);
    const manusResponse = await invokeLLM({
      messages: [
        { role: "system", content: manusSystemPrompt },
        {
          role: "user",
          content: `请按照以下分析框架，对完善后的任务进行全面数据收集和量化分析。

分析框架（GPT制定）：${gptPlan}

完善后的任务描述：${manusEnhanced}

【投资理念约束】严格按照段永平价值投资体系筛选数据：
- 优先收集企业内在价值、估值（PE/PB/DCF）、护城河相关数据
- 关注美国、香港、大陆、欧盟、英国市场的跨市场关联数据
- 标注安全边际相关指标（历史估值区间、当前位置）
- 每次任务执行前、执行中、输出前自我复查是否遵守价值投资原则

要求：
• 严格按框架收集数据，包含具体数字、指标、趋势
• 用 Markdown 表格对比关键数据（至少3列）
• 标注数据来源和时间节点
• 专注客观数据，不需要主观建议`,
        },
      ],
    });
    const manusAnalysis = String(manusResponse.choices?.[0]?.message?.content || "");
    console.log(`[Collaboration] Task ${taskId} Step2: Manus analysis done, length=${manusAnalysis.length}`);
    await updateTaskStatus(taskId, "manus_analyzing", { manusResult: manusAnalysis });

    // ════════════════════════════════════════════════════════════════════════
    // Step 3 — GPT 整合输出（OpenAI API，主观判断 + 最终完整回复）
    // ════════════════════════════════════════════════════════════════════════
    await updateTaskStatus(taskId, "gpt_reviewing");
    const gptUserMessage = `【用户原始任务】
${taskDescription}

【Manus 完善后的任务描述】
${manusEnhanced.slice(0, 500)}

【Manus 数据分析报告】
${manusAnalysis}

请基于以上完整数据，输出最终回复。要求：
1. 深度解读数据，补充主观判断、投资策略和情绪分析
2. 严格遵守投资理念（段永平体系）进行判断
3. 关注美国、香港、大陆、欧盟、英国市场的跨市场关联性
4. 进行正推（当前→未来）和倒推（结果→原因）双向验证
5. 回复末尾必须提出2-3个具体的后续跟进问题，每个问题必须用以下格式包裹（不要加其他文字）：
%%FOLLOWUP%%问题内容%%END%%
示例：
%%FOLLOWUP%%苹果公司近期财务数据如何？%%END%%
%%FOLLOWUP%%当前估值是否具备安全边际？%%END%%`;

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
        finalReply = String(fb.choices?.[0]?.message?.content || manusAnalysis);
      }
    } else {
      const fb = await invokeLLM({
        messages: [
          { role: "system", content: gptSystemPrompt },
          { role: "user", content: gptUserMessage },
        ],
      });
      finalReply = String(fb.choices?.[0]?.message?.content || manusAnalysis);
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
      const summaryResponse = await invokeLLM({
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
      };
    }),
    // 保存 API Key 和模型选择
    setConfig: protectedProcedure
      .input(z.object({
        openaiApiKey: z.string().max(256).optional(),
        openaiModel: z.string().max(128).optional(),
        manusSystemPrompt: z.string().max(8000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await upsertRpaConfig(ctx.user.id, {
          openaiApiKey: input.openaiApiKey,
          openaiModel: input.openaiModel,
          manusSystemPrompt: input.manusSystemPrompt,
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
