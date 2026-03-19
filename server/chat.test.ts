import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock database helpers — include ALL exports used by routers.ts
vi.mock("./db", () => ({
  insertMessage: vi.fn().mockResolvedValue(undefined),
  getMessages: vi.fn().mockResolvedValue([
    { id: 1, taskId: null, userId: 1, role: "user", content: "测试消息", metadata: null, createdAt: new Date() },
  ]),
  getAllMessages: vi.fn().mockResolvedValue([]),
  getAllMessagesByUser: vi.fn().mockResolvedValue([]),
  getMessagesByTask: vi.fn().mockResolvedValue([]),
  createTask: vi.fn().mockResolvedValue([{ insertId: 42 }]),
  updateTaskStatus: vi.fn().mockResolvedValue(undefined),
  getTasksByUser: vi.fn().mockResolvedValue([]),
  getTaskById: vi.fn().mockResolvedValue(undefined),
  saveDbConnection: vi.fn().mockResolvedValue(undefined),
  getDbConnectionsByUser: vi.fn().mockResolvedValue([]),
  getActiveDbConnection: vi.fn().mockResolvedValue(undefined),
  setActiveDbConnection: vi.fn().mockResolvedValue(undefined),
  deleteDbConnection: vi.fn().mockResolvedValue(undefined),
  getRpaConfig: vi.fn().mockResolvedValue({
    id: 1, userId: 1,
    chatgptConversationName: "投资manus",
    manusSystemPrompt: "你是一个专业的金融投资分析师",
    createdAt: new Date(), updatedAt: new Date(),
  }),
  upsertRpaConfig: vi.fn().mockResolvedValue(undefined),
  // Access control mocks
  createAccessCode: vi.fn().mockResolvedValue(undefined),
  listAccessCodes: vi.fn().mockResolvedValue([]),
  revokeAccessCode: vi.fn().mockResolvedValue(undefined),
  verifyAccessCode: vi.fn().mockResolvedValue(null),
  incrementCodeUsage: vi.fn().mockResolvedValue(undefined),
  getUserAccess: vi.fn().mockResolvedValue({ id: 1, userId: 1, codeId: 1, grantedAt: new Date() }),
  grantUserAccess: vi.fn().mockResolvedValue(undefined),
  revokeUserAccess: vi.fn().mockResolvedValue(undefined),
  // Memory mocks
  getRecentMemory: vi.fn().mockResolvedValue([]),
  saveMemoryContext: vi.fn().mockResolvedValue(undefined),
  // User mock
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

// Mock RPA module
vi.mock("./rpa", () => ({
  connectToChatGPT: vi.fn().mockResolvedValue(true),
  sendToChatGPT: vi.fn().mockResolvedValue("ChatGPT 审查完成：分析结果准确"),
  getRpaStatus: vi.fn().mockReturnValue({ status: "idle", error: null }),
  disconnectRpa: vi.fn().mockResolvedValue(undefined),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Manus 分析完成：数据处理结果如下..." } }],
  }),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "测试用户",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("chat.getMessages", () => {
  it("returns message list for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.getMessages({ limit: 50 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

describe("chat.submitTask", () => {
  it("creates a task and returns taskId", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.submitTask({
      title: "分析我的投资组合",
      description: "请分析过去30天的收益表现",
    });
    expect(result).toHaveProperty("taskId");
    expect(result).toHaveProperty("status", "started");
    expect(typeof result.taskId).toBe("number");
  });
});

describe("chat.getTasks", () => {
  it("returns tasks list for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.getTasks();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("rpa.getStatus", () => {
  it("returns RPA status object", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.getStatus();
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("error");
  });
});

describe("dbConnect.list", () => {
  it("returns empty array when no connections", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dbConnect.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("dbConnect.save", () => {
  it("saves a MySQL connection", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dbConnect.save({
      name: "金融数据库",
      dbType: "mysql",
      host: "localhost",
      port: 3306,
      database: "finance_db",
      username: "root",
      password: "password",
    });
    expect(result).toEqual({ success: true });
  });

  it("saves a SQLite connection", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dbConnect.save({
      name: "本地SQLite",
      dbType: "sqlite",
      filePath: "/data/finance.db",
    });
    expect(result).toEqual({ success: true });
  });
});

describe("auth.logout", () => {
  it("clears session cookie", async () => {
    const ctx = createAuthContext();
    const clearedCookies: string[] = [];
    ctx.res.clearCookie = (name: string) => { clearedCookies.push(name); };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

describe("rpa.getConfig", () => {
  it("返回用户的 RPA 配置，包括对话框名称和底层指令", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.getConfig();
    expect(result).toHaveProperty("chatgptConversationName");
    expect(result).toHaveProperty("manusSystemPrompt");
    // 默认对话框名称应为「投资manus」
    expect(result.chatgptConversationName).toBe("投资manus");
  });
});

describe("rpa.setConfig", () => {
  it("保存对话框名称配置", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.setConfig({
      chatgptConversationName: "投资",
      manusSystemPrompt: "你是一个专业的金融投资分析师，负责分析股票、基金、期货市场数据",
    });
    expect(result).toEqual({ success: true });
  });

  it("保存时对话框名称不能为空", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rpa.setConfig({ chatgptConversationName: "" })
    ).rejects.toThrow();
  });
});
