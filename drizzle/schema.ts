import {
  int,
  bigint as bigintCol,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 会话分组表：用户可以把多个会话收纳进一个小组
export const conversationGroups = mysqlTable("conversation_groups", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 32 }).default("blue").notNull(), // 分组颜色标识
  isCollapsed: boolean("isCollapsed").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConversationGroup = typeof conversationGroups.$inferSelect;
export type InsertConversationGroup = typeof conversationGroups.$inferInsert;

// 会话表：每次点击「新任务」创建一个独立会话
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: text("title"),                  // 会话标题（第一条用户消息的前55字）
  groupId: int("groupId"),                // 所属小组（可为空）
  isPinned: boolean("isPinned").default(false).notNull(),
  isFavorited: boolean("isFavorited").default(false).notNull(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(), // 最近消息时间（用于排序）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// 任务表：用户提交的协作任务
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: mysqlEnum("status", [
    "pending",
    "gpt_planning",
    "manus_working",
    "manus_analyzing",
    "gpt_reviewing",
    "streaming",
    "completed",
    "failed",
  ])
    .default("pending")
    .notNull(),
  manusResult: text("manusResult"),   // Manus执行结果（数据库实际为LONGTEXT）
  gptSummary: text("gptSummary"),     // ChatGPT汇总报告（数据库实际为LONGTEXT）
  conversationId: int("conversationId"),  // 所属会话
  isPinned: boolean("isPinned").default(false).notNull(),     // 是否置顶
  isFavorited: boolean("isFavorited").default(false).notNull(), // 是否收藏
  analysisMode: mysqlEnum("analysisMode", ["quick", "standard", "deep"]).default("standard").notNull(), // 分析深度模式
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// 消息表：群聊消息历史
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId"),              // 关联任务（可选）
  userId: int("userId"),              // 关联用户（可选）
  role: mysqlEnum("role", [
    "user",
    "manus",
    "chatgpt",
    "system",
    "assistant",
  ]).notNull(),
  content: text("content").notNull(),
  conversationId: int("conversationId"), // 所属会话
  metadata: json("metadata"),         // 额外信息（如数据库查询结果摘要）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// 数据库连接配置表：用户的金融数据库连接信息
export const dbConnections = mysqlTable("db_connections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  dbType: mysqlEnum("dbType", ["mysql", "postgresql", "sqlite"]).notNull(),
  host: varchar("host", { length: 256 }),
  port: int("port"),
  database: varchar("database", { length: 128 }),
  username: varchar("username", { length: 128 }),
  password: text("password"),         // 生产环境应加密存储
  filePath: text("filePath"),         // SQLite 文件路径
  isActive: boolean("isActive").default(false).notNull(),
  lastTestedAt: timestamp("lastTestedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DbConnection = typeof dbConnections.$inferSelect;
export type InsertDbConnection = typeof dbConnections.$inferInsert;

// OpenAI API 配置表：存储用户的 ChatGPT API 配置
export const rpaConfigs = mysqlTable("rpa_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  // OpenAI API Key
  openaiApiKey: varchar("openaiApiKey", { length: 256 }),
  // 使用的模型（默认 gpt-4o-mini）
  openaiModel: varchar("openaiModel", { length: 128 }).default("gpt-4o-mini"),
  // Manus 底层指令（用户已训练好的系统提示词）
  manusSystemPrompt: text("manusSystemPrompt"),
  // 第一部分：投资守则（用户投资喜好、理念、个人情况）
  investmentRules: text("investmentRules"),
  // 第二部分：全局任务指令（AI执行规范，不随任务变动）
  taskInstruction: text("taskInstruction"),
  // 第三部分：资料数据库（优先数据来源：链接/API/权威资料）
  dataLibrary: text("dataLibrary"),
  // 第四部分：结构化可信数据源配置（trusted_sources + routing_rules + policy）
  trustedSourcesConfig: json("trustedSourcesConfig"),
  // 兼容旧字段（废弃，保留不删）
  userCoreRules: text("userCoreRules"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RpaConfig = typeof rpaConfigs.$inferSelect;
export type InsertRpaConfig = typeof rpaConfigs.$inferInsert;

// 访问密码表：Owner 生成的邀请码
export const accessCodes = mysqlTable("access_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 128 }),       // 备注，如「给张三」
  maxUses: bigintCol("maxUses", { mode: "number" }).default(1).notNull(),    // 最多可使用次数（-1 表示无限）
  usedCount: bigintCol("usedCount", { mode: "number" }).default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  expiresAt: timestamp("expiresAt"),               // 可选过期时间
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccessCode = typeof accessCodes.$inferSelect;
export type InsertAccessCode = typeof accessCodes.$inferInsert;

// 用户访问权限表：记录哪些用户已通过密码验证
export const userAccess = mysqlTable("user_access", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  accessCodeId: int("accessCodeId").notNull(),     // 使用的哪个密码
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),               // 被撤销的时间
});

export type UserAccess = typeof userAccess.$inferSelect;
export type InsertUserAccess = typeof userAccess.$inferInsert;

// 文件附件表：拖拽上传的文件元数据
export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  conversationId: int("conversationId"),  // 所属会话
  messageId: int("messageId"),            // 关联消息（可选）
  filename: varchar("filename", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  size: int("size").notNull(),            // 字节数
  s3Key: text("s3Key").notNull(),
  s3Url: text("s3Url").notNull(),
  // 提取的文本内容（用于AI分析）
  extractedText: text("extractedText"),
  // 文件类型分类
  fileCategory: mysqlEnum("fileCategory", ["document", "image", "video", "audio", "other"]).default("other").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

// 全局记忆上下文表：跨任务的长期记忆摘要
export const memoryContext = mysqlTable("memory_context", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 每条记忆对应一个已完成的任务
  taskId: int("taskId").notNull(),
  // 所属对话（用于对话级记忆隔离）
  conversationId: int("conversationId"),
  // 任务摘要（由 LLM 自动生成，用于后续任务的上下文注入）
  summary: text("summary").notNull(),
  // 原始任务标题
  taskTitle: text("taskTitle").notNull(),
  // 关键词（便于相关任务检索）
  keywords: text("keywords"),
  // 记忆分层：preference=用户偏好/workflow=工作流程/watchlist=监控列表/analysis=分析结果
  memoryType: mysqlEnum("memoryType", ["preference", "workflow", "watchlist", "analysis"]).default("analysis").notNull(),
  // 记忆过期时间（null 表示永不过期）
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MemoryContext = typeof memoryContext.$inferSelect;
export type InsertMemoryContext = typeof memoryContext.$inferInsert;
