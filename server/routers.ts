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
import { connectToChatGPT, sendToChatGPT, getRpaStatus } from "./rpa";
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
  const CHATGPT_CONVERSATION = "投资manus" as const;

  // ── Manus 系统人设 ────────────────────────────────────────────────────────
  const manusSystemPrompt = userConfig?.manusSystemPrompt ||
    `你是 Manus，一个专注于数据统筹、分析和执行的AI专家助手。

## 角色定位
你是执行层专家，负责任务分解、数据收集、量化分析和统计计算。你的输出必须结构清晰、数据精准，供 GPT 经理审阅后整合成最终回复。

## 强制排版规范（每条回复都必须严格遵守）

每条回复必须包含以下结构要素：

1. **章节标题**：使用 ## 作为一级章节、### 作为二级章节，禁止无标题的纯文本块
2. **关键数据加粗**：所有重要数字、结论、风险点必须用 **加粗** 标注
3. **数据表格**：凡是涉及多维度对比、数据列举、指标汇总，必须使用 Markdown 表格
   \`\`\`
   | 指标 | 数值 | 说明 |
   |------|------|------|
   | ... | ... | ... |
   \`\`\`
4. **结论引用块**：核心结论、重要警告、关键洞察必须放在 > 引用块中
   > 💡 关键结论：...
5. **步骤有序列表**：操作步骤、执行计划使用 1. 2. 3. 有序列表
6. **代码块**：代码、公式、SQL、JSON 必须用三反引号包裹
7. **分隔线**：不同章节之间用 --- 分隔

> ⚠️ 禁止输出无格式的纯文本段落。每个内容块必须有对应的 Markdown 格式标记。

## 语言要求
- 中文回复，专业精准
- 数字保留2位小数，百分比保留1位小数
- 表格数据必须对齐，列宽一致`;

  // ── GPT 经理系统人设 ──────────────────────────────────────────────────────
  const gptManagerPrompt = `你是用户的投资顾问经理（GPT）。

## 你的职责
1. 审阅 Manus 的数据分析报告，判断准确性和完整性
2. 从战略和经验角度补充观点、洞察和建议
3. 决定最终回复的整体框架、语气和重点
4. 你的输出是内部指导意见，供 Manus 整合成最终回复

## 你的风格
- 像资深经理：直接、有判断力、重视实用性
- 明确指出数据中的关键信号和风险
- 给出明确行动建议，不模棱两可
- 中文，专业但不晦涩

## 最终回复格式要求（必须传达给 Manus）
最终给用户的回复必须：
- 有清晰的 ## 标题结构
- 关键数据和结论用 **加粗** 突出
- 核心判断放在 > 引用块中
- 数据对比用表格呈现
- 整体视觉层次丰富，类似 GPT 的专业排版风格`;

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
    await updateTaskStatus(taskId, "manus_working");

    // ════════════════════════════════════════════════════════════════════════
    // Step 1 — Manus 分解任务
    // ════════════════════════════════════════════════════════════════════════
    const decomposeResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: manusSystemPrompt + "\n\n【当前任务】请先分解任务，列出执行步骤和数据需求，然后立即开始执行。",
        },
        { role: "user", content: fullContext },
      ],
    });
    const taskPlan = String(decomposeResponse.choices?.[0]?.message?.content || "");

    // ════════════════════════════════════════════════════════════════════════
    // Step 2 — Manus 执行：数据收集、分析、统计
    // ════════════════════════════════════════════════════════════════════════
    const executeResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: manusSystemPrompt + "\n\n【执行阶段】根据任务分解计划，执行数据收集、分析和统计，输出完整的结构化分析报告。",
        },
        { role: "user", content: fullContext },
        { role: "assistant", content: taskPlan },
        { role: "user", content: "请现在执行分析，输出完整的数据报告。" },
      ],
    });
    const manusReport = String(executeResponse.choices?.[0]?.message?.content || "");
    await updateTaskStatus(taskId, "manus_working", { manusResult: manusReport });

    // ════════════════════════════════════════════════════════════════════════
    // Step 3 — GPT 经理：审阅报告，给出观点和表达框架（内部指导）
    // ════════════════════════════════════════════════════════════════════════
    await updateTaskStatus(taskId, "gpt_reviewing");

    let gptGuidance: string;
    const gptManagerMessage = `【用户原始任务】
${fullContext}

【Manus 数据分析报告】
${manusReport}

请你作为经理：
1. 评估 Manus 报告的准确性和完整性（如有遗漏请指出）
2. 从投资顾问角度补充你的核心观点和洞察
3. 给出最终回复的表达框架建议（重点突出什么、语气如何、结构怎么组织）
4. 这是内部指导，Manus 将据此整合最终回复`;

    const rpaState = getRpaStatus();
    if (rpaState.status === "ready" || rpaState.status === "idle") {
      try {
        gptGuidance = await sendToChatGPT(gptManagerMessage, CHATGPT_CONVERSATION);
      } catch {
        const fb = await invokeLLM({
          messages: [
            { role: "system", content: gptManagerPrompt },
            { role: "user", content: gptManagerMessage },
          ],
        });
        gptGuidance = String(fb.choices?.[0]?.message?.content || "");
      }
    } else {
      const fb = await invokeLLM({
        messages: [
          { role: "system", content: gptManagerPrompt },
          { role: "user", content: gptManagerMessage },
        ],
      });
      gptGuidance = String(fb.choices?.[0]?.message?.content || "");
    }

    // ════════════════════════════════════════════════════════════════════════
    // Step 4 — Manus 整合：按 GPT 经理建议输出最终回复
    // ════════════════════════════════════════════════════════════════════════
    const integrateResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: manusSystemPrompt +
            "\n\n## 整合阶段任务\n" +
            "你已完成数据分析，GPT 经理给出了表达建议。现在请按照经理的框架，将数据分析整合成最终的、直接给用户看的完整回复。\n\n" +
            "**必须遵守的输出规则：**\n" +
            "1. 不要包含任何内部流程说明（不提及 Manus、GPT经理、内部审核等）\n" +
            "2. 直接以专业顾问身份输出给用户的回复\n" +
            "3. 每个章节必须有 ## 标题\n" +
            "4. 关键数字、结论必须 **加粗**\n" +
            "5. 核心判断放在 > 引用块中\n" +
            "6. 数据对比必须用 Markdown 表格\n" +
            "7. 整体排版类似 GPT 专业风格，视觉层次丰富\n" +
            "\n> ⚠️ 禁止输出无格式纯文本。如果你的回复没有标题、没有加粗、没有表格，视为格式不合格，必须重新排版。",
        },
        { role: "user", content: `原始任务：${taskDescription}${attachmentBlock}` },
        { role: "assistant", content: `[数据分析报告]\n${manusReport}` },
        {
          role: "user",
          content: `[经理指导意见]\n${gptGuidance}\n\n请按照以上指导，输出最终的完整回复：`,
        },
      ],
    });
    const manusIntegrated = String(integrateResponse.choices?.[0]?.message?.content || "");

    // ════════════════════════════════════════════════════════════════════════
    // Step 5 — GPT 最终审核：确认质量，直接修正后输出
    // ════════════════════════════════════════════════════════════════════════
    const finalReviewMessage = `【用户任务】${taskDescription}

【Manus 整合回复草稿】
${manusIntegrated}

请你做最终审核：
- 如果内容准确、完整、表达清晰，直接输出原文（不要加任何说明）
- 如果有问题，直接在原文基础上修正，输出修正后的完整版本
- 不要输出任何审核说明、前言或后记，只输出给用户看的最终内容`;

    let finalReply: string;
    if (rpaState.status === "ready" || rpaState.status === "idle") {
      try {
        finalReply = await sendToChatGPT(finalReviewMessage, CHATGPT_CONVERSATION);
      } catch {
        const fb = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "你是投资顾问经理。请对以下回复做最终审核，直接输出最终版本，不要加任何说明。",
            },
            { role: "user", content: finalReviewMessage },
          ],
        });
        finalReply = String(fb.choices?.[0]?.message?.content || manusIntegrated);
      }
    } else {
      const fb = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "你是投资顾问经理。请对以下回复做最终审核，直接输出最终版本，不要加任何说明。",
          },
          { role: "user", content: finalReviewMessage },
        ],
      });
      finalReply = String(fb.choices?.[0]?.message?.content || manusIntegrated);
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
    await updateTaskStatus(taskId, "failed");
    await insertMessage({
      taskId,
      userId,
      conversationId,
      role: "system",
      content: "处理任务时发生错误，请稍后重试。",
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
          .catch(console.error);

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

  // ─── RPA 状态管理 ─────────────────────────────────────────────────────────
  rpa: router({
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      return getRpaStatus();
    }),

    connect: protectedProcedure.mutation(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      const success = await connectToChatGPT();
      return { success, ...getRpaStatus() };
    }),

    test: protectedProcedure
      .input(z.object({ message: z.string().default("你好，请确认连接正常。") }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const response = await sendToChatGPT(input.message, "投资manus");
        return { success: true, response };
      }),

    getConfig: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      const config = await getRpaConfig(ctx.user.id);
      return {
        chatgptConversationName: "投资manus",
        manusConversationName: "金融投资",
        manusSystemPrompt: config?.manusSystemPrompt ?? "",
      };
    }),

    setConfig: protectedProcedure
      .input(z.object({
        chatgptConversationName: z.string().min(1).max(256),
        manusSystemPrompt: z.string().max(8000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        await upsertRpaConfig(ctx.user.id, {
          chatgptConversationName: input.chatgptConversationName,
          manusSystemPrompt: input.manusSystemPrompt,
        });
        return { success: true };
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
