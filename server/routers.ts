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
  getAllMessagesByUser,
  getMessagesByTask,
  createTask,
  updateTaskStatus,
  getTasksByUser,
  getTaskById,
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
} from "./db";
import { connectToChatGPT, sendToChatGPT, getRpaStatus } from "./rpa";
import { TRPCError } from "@trpc/server";

// ─── 访问权限检查中间件（Owner 或已授权用户均可访问）────────────────────────────

async function requireAccess(userId: number, openId: string) {
  // Owner 始终有权限
  if (openId === ENV.ownerOpenId) return;
  // 检查是否已通过密码授权
  const access = await getUserAccess(userId);
  if (!access) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "请先输入访问密码",
    });
  }
}

// ─── 任务协作核心流程 ─────────────────────────────────────────────────────────

async function runCollaborationFlow(taskId: number, userId: number, taskDescription: string) {
  // 加载用户配置：对话框名称 + Manus 底层指令
  const userConfig = await getRpaConfig(userId);
  // ChatGPT主管使用「投资manus」，Manus执行层使用「金融投资」
  const targetConversation = userConfig?.chatgptConversationName || "投资manus";
  const manusConversation = "金融投资";
  const manusBasePrompt = userConfig?.manusSystemPrompt ||
    `你是 Manus，一个专注于数据统筹、分析和执行的AI助手。
你的职责：
1. 分析用户任务，拆解执行步骤
2. 执行数据查询、文档处理、数据分析和统计
3. 输出结构化的分析结果，供 ChatGPT 主管进行二次审查
4. 用中文回复，保持专业、简洁`;

  // ★ 加载历史记忆上下文（最近10条任务摘要）
  const recentMemory = await getRecentMemory(userId, 10);
  const memoryBlock = recentMemory.length > 0
    ? `\n\n【历史任务记忆（最近${recentMemory.length}条，用于跨任务连续跟进）】\n` +
      recentMemory.map((m, i) =>
        `${i + 1}. [${new Date(m.createdAt).toLocaleDateString("zh-CN")}] ${m.taskTitle}\n   摘要：${m.summary}`
      ).join("\n")
    : "";

  try {
    // 后台静默执行：仅更新任务状态，不向用户显示中间过程消息
    await updateTaskStatus(taskId, "manus_working");

    // ─── Step 1（静默）：Manus 执行层分析 ────────────────────────────────────────
    const manusResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: manusBasePrompt + memoryBlock +
            "\n\n请对以下任务进行分析和执行，输出结构化的分析结果，供 ChatGPT 主管决定最终回复框架：",
        },
        { role: "user", content: taskDescription },
      ],
    });
    const manusResult = String(manusResponse.choices?.[0]?.message?.content || "Manus 分析完成");
    await updateTaskStatus(taskId, "manus_working", { manusResult });

    // ─── Step 2（静默）：ChatGPT 主管决定最终回复框架 ──────────────────────────
    await updateTaskStatus(taskId, "gpt_reviewing");

    const gptPrompt =
`你是用户的主管。Manus 已完成数据分析，现在由你决定最终回复的整体框架和表达方式。

【用户任务】
${taskDescription}
${memoryBlock}

【Manus 执行层分析结果（供参考）】
${manusResult}

请你：
1. 检查 Manus 的分析是否准确、完整
2. 结合历史任务上下文，补充遗漏的关键点
3. 以主管角度决定最终回复的整体框架和表达方式
4. 直接输出给用户看的最终整合回复（不要包含上面的内部流程说明）`;

    let gptDraft: string;
    const rpaState = getRpaStatus();
    if (rpaState.status === "ready" || rpaState.status === "idle") {
      try {
        gptDraft = await sendToChatGPT(gptPrompt, targetConversation);
      } catch (rpaErr) {
        console.warn("[Collaboration] RPA failed, falling back to LLM:", rpaErr);
        const fb = await invokeLLM({
          messages: [
            { role: "system", content: `你是 ChatGPT，作为用户主管，负责决定最终回复框架。RPA 连接不可用，请直接以主管身份回复。` },
            { role: "user", content: gptPrompt },
          ],
        });
        gptDraft = String(fb.choices?.[0]?.message?.content || "ChatGPT 审查完成");
      }
    } else {
      const fb = await invokeLLM({
        messages: [
          { role: "system", content: "你是 ChatGPT 主管，请审查 Manus 的工作并以主管身份直接回复用户。" },
          { role: "user", content: gptPrompt },
        ],
      });
      gptDraft = String(fb.choices?.[0]?.message?.content || "ChatGPT 审查完成");
    }

    // ─── Step 3（静默）：Manus 对 ChatGPT 草稿做最终校验 ──────────────────────────
    const verifyResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: manusBasePrompt +
            "\n\n你的职责是对 ChatGPT 主管起草的回复进行最终校验：" +
            "检查数据准确性、逻辑一致性。" +
            "如果内容完全正确，直接输出原文不作任何修改。" +
            "如果有错误或遗漏，在原文基础上直接补充修正，不要加入任何说明性文字。",
        },
        {
          role: "user",
          content: `原始任务：${taskDescription}\n\nChatGPT 主管草稿：\n${gptDraft}`,
        },
      ],
    });
    const finalReply = String(verifyResponse.choices?.[0]?.message?.content || gptDraft);

    // ─── 只向用户输出一条最终整合回复（role: "assistant"） ──────────────────────
    await insertMessage({
      taskId,
      userId,
      role: "assistant",
      content: finalReply,
      metadata: { phase: "final", manusResult, gptDraft },
    });

    await updateTaskStatus(taskId, "completed", { gptSummary: finalReply });

    // ★ Step 3: 自动生成任务摘要并保存到长期记忆
    try {
      const summaryResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "请用2-3句话简洁总结以下任务的核心结论，供后续任务参考。输出纯文本，不要标题或列表。",
          },
          {
            role: "user",
            content: `任务：${taskDescription}\n\nManus结果：${manusResult}\n\nChatGPT主管草稿：${gptDraft}\n\n最终回复：${finalReply}`,
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
      role: "system",
      content: `❌ 任务执行失败：${errMsg}`,
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

  // ─── 访问控制 ────────────────────────────────────────────────────────────────
  access: router({
    // 检查当前用户是否有访问权限（Owner 或已授权用户）
    check: protectedProcedure.query(async ({ ctx }) => {
      const isOwner = ctx.user.openId === ENV.ownerOpenId;
      if (isOwner) return { hasAccess: true, isOwner: true };
      const access = await getUserAccess(ctx.user.id);
      return { hasAccess: !!access, isOwner: false };
    }),

    // 用户输入密码验证
    verify: protectedProcedure
      .input(z.object({ code: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        const record = await verifyAccessCode(input.code);
        if (!record) {
          throw new TRPCError({ code: "FORBIDDEN", message: "密码无效或已过期" });
        }
        await grantUserAccess(ctx.user.id, record.id);
        await incrementCodeUsage(record.id);
        return { success: true };
      }),

    // Owner：生成新访问密码
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

    // Owner：查看所有密码
    listCodes: ownerProcedure.query(async () => {
      return listAccessCodes();
    }),

    // Owner：撤销密码
    revokeCode: ownerProcedure
      .input(z.object({ codeId: z.number() }))
      .mutation(async ({ input }) => {
        await revokeAccessCode(input.codeId);
        return { success: true };
      }),

    // Owner：撤销某用户的访问权限
    revokeUser: ownerProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        await revokeUserAccess(input.userId);
        return { success: true };
      }),
  }),

  // ─── 聊天 & 任务 ────────────────────────────────────────────────────────────
  chat: router({
    // 登录即加载全部历史消息（跨会话永久保留）
    getAllMessages: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      return getAllMessages();
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

    submitTask: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(500),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        const userId = ctx.user.id;
        const description = input.description || input.title;

        await insertMessage({ userId, role: "user", content: input.title });

        const result = await createTask({
          userId,
          title: input.title,
          description,
          status: "pending",
        });

        const taskId = (result as any)[0]?.insertId as number;
        if (!taskId) throw new Error("Failed to create task");

        runCollaborationFlow(taskId, userId, description).catch(console.error);
        return { taskId, status: "started" };
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

    // ★ 获取用户的历史记忆列表
    getMemory: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
      .query(async ({ ctx, input }) => {
        await requireAccess(ctx.user.id, ctx.user.openId);
        return getRecentMemory(ctx.user.id, input.limit);
      }),
  }),

  // ─── RPA 状态管理 ───────────────────────────────────────────────────────────
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
        const config = await getRpaConfig(ctx.user.id);
        const conversationName = config?.chatgptConversationName || "投资";
        const response = await sendToChatGPT(input.message, conversationName);
        return { success: true, response };
      }),

    getConfig: protectedProcedure.query(async ({ ctx }) => {
      await requireAccess(ctx.user.id, ctx.user.openId);
      const config = await getRpaConfig(ctx.user.id);
      return {
        chatgptConversationName: config?.chatgptConversationName ?? "投资",
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

  // ─── 数据库连接管理 ──────────────────────────────────────────────────────────
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
