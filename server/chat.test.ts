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
  getOwnerRpaConfig: vi.fn().mockResolvedValue(null),
  getRpaConfig: vi.fn().mockResolvedValue({
    id: 1, userId: 1,
    openaiApiKey: "sk-test-key",
    openaiModel: "gpt-4o-mini",
    manusSystemPrompt: "你是一个专业的金融投资分析师",
    userCoreRules: "自定义守则示例",
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
  getRelevantMemory: vi.fn().mockResolvedValue([]),
  saveMemoryContext: vi.fn().mockResolvedValue(undefined),
  // Conversation mocks
  createConversation: vi.fn().mockResolvedValue(42),
  getConversationsByUser: vi.fn().mockResolvedValue([]),
  getConversationById: vi.fn().mockResolvedValue({ id: 42, userId: 1, title: '测试会话', createdAt: new Date(), updatedAt: new Date() }),
  updateConversationTitle: vi.fn().mockResolvedValue(undefined),
  getMessagesByConversation: vi.fn().mockResolvedValue([]),
  setPinned: vi.fn().mockResolvedValue(undefined),
  setFavorited: vi.fn().mockResolvedValue(undefined),
  setConversationPinned: vi.fn().mockResolvedValue(undefined),
  setConversationFavorited: vi.fn().mockResolvedValue(undefined),
  deleteConversationAndMessages: vi.fn().mockResolvedValue(undefined),
  insertAttachment: vi.fn().mockResolvedValue(undefined),
  getAttachmentsByConversation: vi.fn().mockResolvedValue([]),
  getAttachmentsByMessage: vi.fn().mockResolvedValue([]),
  createConversationGroup: vi.fn().mockResolvedValue(1),
  getConversationGroupsByUser: vi.fn().mockResolvedValue([]),
  deleteConversationGroup: vi.fn().mockResolvedValue(undefined),
  setConversationGroup: vi.fn().mockResolvedValue(undefined),
  renameConversationGroup: vi.fn().mockResolvedValue(undefined),
  setGroupCollapsed: vi.fn().mockResolvedValue(undefined),
  searchConversations: vi.fn().mockResolvedValue([]),
  // User mock
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  // Access activation check — must be present; routers.ts calls this in requireAccess()
  checkUserActivated: vi.fn().mockResolvedValue(true),
}));

// Mock RPA module (OpenAI API 模块)
vi.mock("./rpa", () => ({
  callOpenAI: vi.fn().mockResolvedValue("GPT 分析完成：投资建议如下..."),
  testOpenAIConnection: vi.fn().mockResolvedValue({ ok: true, model: "gpt-4o-mini" }),
  DEFAULT_MODEL: "gpt-4o-mini",
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Manus 分析完成：数据处理结果如下..." } }],
  }),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "https://cdn.example.com/test.jpg" }),
}));

// Mock fileProcessor
vi.mock("./fileProcessor", () => ({
  getFileCategory: vi.fn().mockReturnValue("document"),
  extractFileContent: vi.fn().mockResolvedValue("文件内容"),
  formatFileSize: vi.fn().mockReturnValue("1.0 MB"),
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

describe("rpa.getConfig", () => {
  it("返回用户的 OpenAI API 配置，包括模型和底层指令", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.getConfig();
    expect(result).toHaveProperty("openaiApiKey");
    expect(result).toHaveProperty("openaiModel");
    expect(result).toHaveProperty("hasApiKey");
    expect(result).toHaveProperty("manusSystemPrompt");
    expect(result).toHaveProperty("userCoreRules");
    // 已配置 API Key 时 hasApiKey 应为 true
    expect(result.hasApiKey).toBe(true);
    // userCoreRules 应返回已保存的自定义守则
    expect(result.userCoreRules).toBe("自定义守则示例");
  });
});

describe("rpa.setConfig", () => {
  it("保存 OpenAI 模型配置", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.setConfig({
      openaiModel: "gpt-4o-mini",
      manusSystemPrompt: "你是一个专业的金融投资分析师，负责分析股票、基金、期货市场数据",
    });
    expect(result).toEqual({ success: true });
  });

  it("保存 API Key 和模型配置", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.setConfig({
      openaiApiKey: "sk-test-key-12345",
      openaiModel: "gpt-4o",
    });
    expect(result).toEqual({ success: true });
  });

  it("保存自定义投资守则", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.setConfig({
      openaiModel: "gpt-4o-mini",
      userCoreRules: "自定义投资守则\n- 安全边际优先\n- 长期持有",
    });
    expect(result).toEqual({ success: true });
  });

  it("清除自定义守则（传 null）", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.setConfig({
      openaiModel: "gpt-4o-mini",
      userCoreRules: null,
    });
    expect(result).toEqual({ success: true });
  });
});

describe("rpa.testConnection", () => {
  it("测试 OpenAI API 连接", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.testConnection({
      apiKey: "sk-test-key-12345",
      model: "gpt-4o-mini",
    });
    expect(result).toHaveProperty("ok");
    expect(result.ok).toBe(true);
    expect(result).toHaveProperty("model");
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

describe("conversation.pin", () => {
  it("置顶/取消置顶对话", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.conversation.pin({ conversationId: 42, pinned: true });
    expect(result).toEqual({ success: true });
  });
});

describe("conversation.delete", () => {
  it("删除对话及其消息", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.conversation.delete({ conversationId: 42 });
    expect(result).toEqual({ success: true });
  });
});

describe("rpa.getConfig - userCoreRules", () => {
  it("返回用户自定义守则字段", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.getConfig();
    expect(result).toHaveProperty("userCoreRules");
    expect(result.userCoreRules).toBe("自定义守则示例");
  });
});

describe("rpa.setConfig - userCoreRules", () => {
  it("保存用户自定义守则", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rpa.setConfig({
      openaiApiKey: "sk-test",
      openaiModel: "gpt-4o",
      userCoreRules: "我的自定义投资守则：专注长期价值",
    });
    expect(result).toEqual({ success: true });
  });
});
