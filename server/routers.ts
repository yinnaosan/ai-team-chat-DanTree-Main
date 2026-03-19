import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import {
  insertMessage,
  getMessages,
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
} from "./db";
import { connectToChatGPT, sendToChatGPT, getRpaStatus } from "./rpa";

// ─── 任务协作核心流程 ─────────────────────────────────────────────────────────

async function runCollaborationFlow(taskId: number, userId: number, taskDescription: string) {
  try {
    // Step 1: Manus 执行层分析
    await updateTaskStatus(taskId, "manus_working");
    await insertMessage({
      taskId,
      userId,
      role: "system",
      content: "🔄 Manus 正在分析任务并执行数据处理...",
    });

    // Manus 调用内置 LLM 进行数据分析
    const manusResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是 Manus，一个专注于数据统筹、分析和执行的AI助手。
你的职责：
1. 分析用户任务，拆解执行步骤
2. 执行数据查询、文档处理、数据分析和统计
3. 输出结构化的分析结果，供 ChatGPT 主管进行二次审查
4. 用中文回复，保持专业、简洁

请对以下任务进行分析和执行，输出详细的执行结果：`,
        },
        {
          role: "user",
          content: taskDescription,
        },
      ],
    });

    const manusResult = String(manusResponse.choices?.[0]?.message?.content || "Manus 分析完成");

    // 保存 Manus 的分析结果
    await updateTaskStatus(taskId, "manus_working", { manusResult });
    await insertMessage({
      taskId,
      userId,
      role: "manus",
      content: manusResult,
      metadata: { phase: "execution" },
    });

    // Step 2: 发送给 ChatGPT 主管进行二次检查
    await updateTaskStatus(taskId, "gpt_reviewing");
    await insertMessage({
      taskId,
      userId,
      role: "system",
      content: "🔍 正在通过 RPA 将分析结果发送给 ChatGPT 主管进行审查...",
    });

    const rpaState = getRpaStatus();
    let gptSummary: string;

    if (rpaState.status === "ready" || rpaState.status === "idle") {
      // 尝试通过 RPA 发送给 ChatGPT
      const gptPrompt = `作为主管，请对以下由 Manus 执行层完成的工作进行二次检查和汇总：

【原始任务】
${taskDescription}

【Manus 执行结果】
${manusResult}

请你：
1. 检查 Manus 的分析是否准确、完整
2. 补充任何遗漏的关键点
3. 从战略和决策角度提供建议
4. 输出一份最终的综合报告给用户`;

      try {
        gptSummary = await sendToChatGPT(gptPrompt);
      } catch (rpaErr) {
        // RPA 失败时，使用内置 LLM 模拟 ChatGPT 主管角色
        console.warn("[Collaboration] RPA failed, falling back to LLM:", rpaErr);
        const fallbackResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `你是 ChatGPT，作为团队主管，负责对 Manus 执行层的工作进行二次检查和战略汇总。
注意：当前 RPA 连接不可用，请以主管身份直接审查并汇总。`,
            },
            {
              role: "user",
              content: `原始任务：${taskDescription}\n\nManus执行结果：${manusResult}\n\n请进行审查并给出最终报告。`,
            },
          ],
        });
        gptSummary = `[RPA离线模式] ${String(fallbackResponse.choices?.[0]?.message?.content || "ChatGPT 审查完成")}`;
      }
    } else {
      // RPA 未就绪，使用备用方案
      const fallbackResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "你是 ChatGPT 主管，请审查 Manus 的工作并给出最终报告。注意：RPA 当前未连接，请以主管身份直接回复。",
          },
          {
            role: "user",
            content: `任务：${taskDescription}\n\nManus结果：${manusResult}`,
          },
        ],
      });
      gptSummary = `[RPA未连接] ${String(fallbackResponse.choices?.[0]?.message?.content || "ChatGPT 审查完成")}`;
    }

    // 保存 ChatGPT 的汇总报告
    await insertMessage({
      taskId,
      userId,
      role: "chatgpt",
      content: gptSummary,
      metadata: { phase: "review" },
    });

    await updateTaskStatus(taskId, "completed", { gptSummary });
    await insertMessage({
      taskId,
      userId,
      role: "system",
      content: "✅ 协作任务已完成！ChatGPT 主管已完成审查并提交最终报告。",
    });
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

  // ─── 聊天 & 任务 ────────────────────────────────────────────────────────────
  chat: router({
    // 获取最近消息列表
    getMessages: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
      .query(async ({ input }) => {
        const msgs = await getMessages(input.limit);
        return msgs.reverse(); // 按时间正序返回
      }),

    // 获取某任务的消息
    getTaskMessages: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input }) => {
        return getMessagesByTask(input.taskId);
      }),

    // 提交新任务
    submitTask: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(500),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const description = input.description || input.title;

        // 保存用户消息
        await insertMessage({
          userId,
          role: "user",
          content: input.title,
        });

        // 创建任务记录
        const result = await createTask({
          userId,
          title: input.title,
          description,
          status: "pending",
        });

        // 获取新创建的任务ID（MySQL insertId）
        const taskId = (result as any)[0]?.insertId as number;

        if (!taskId) {
          throw new Error("Failed to create task");
        }

        // 异步执行协作流程（不阻塞请求）
        runCollaborationFlow(taskId, userId, description).catch(console.error);

        return { taskId, status: "started" };
      }),

    // 获取用户任务列表
    getTasks: protectedProcedure.query(async ({ ctx }) => {
      return getTasksByUser(ctx.user.id);
    }),

    // 获取任务详情
    getTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input }) => {
        return getTaskById(input.taskId);
      }),
  }),

  // ─── RPA 状态管理 ───────────────────────────────────────────────────────────
  rpa: router({
    // 获取 RPA 连接状态
    getStatus: protectedProcedure.query(() => {
      return getRpaStatus();
    }),

    // 连接到 ChatGPT 浏览器
    connect: protectedProcedure.mutation(async () => {
      const success = await connectToChatGPT();
      return { success, ...getRpaStatus() };
    }),

    // 测试发送一条消息
    test: protectedProcedure
      .input(z.object({ message: z.string().default("你好，请确认连接正常。") }))
      .mutation(async ({ input }) => {
        const response = await sendToChatGPT(input.message);
        return { success: true, response };
      }),
  }),

  // ─── 数据库连接管理 ──────────────────────────────────────────────────────────
  dbConnect: router({
    // 获取用户的数据库连接列表
    list: protectedProcedure.query(async ({ ctx }) => {
      return getDbConnectionsByUser(ctx.user.id);
    }),

    // 保存新的数据库连接
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
        await saveDbConnection({ ...input, userId: ctx.user.id });
        return { success: true };
      }),

    // 设置活跃连接
    setActive: protectedProcedure
      .input(z.object({ connId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await setActiveDbConnection(ctx.user.id, input.connId);
        return { success: true };
      }),

    // 删除连接
    delete: protectedProcedure
      .input(z.object({ connId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteDbConnection(ctx.user.id, input.connId);
        return { success: true };
      }),

    // 获取活跃连接
    getActive: protectedProcedure.query(async ({ ctx }) => {
      return getActiveDbConnection(ctx.user.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
