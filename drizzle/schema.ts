import {
  int,
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

// 任务表：用户提交的协作任务
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: mysqlEnum("status", [
    "pending",
    "manus_working",
    "gpt_reviewing",
    "completed",
    "failed",
  ])
    .default("pending")
    .notNull(),
  manusResult: text("manusResult"),   // Manus执行结果
  gptSummary: text("gptSummary"),     // ChatGPT汇总报告
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

// RPA 配置表：存储用户的 RPA 设置
const rpaConfigs = mysqlTable("rpa_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  // ChatGPT 目标对话框名称（如「投资」）
  chatgptConversationName: varchar("chatgptConversationName", { length: 256 }).default("投资"),
  // Manus 底层指令（用户已训练好的系统提示词）
  manusSystemPrompt: text("manusSystemPrompt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export { rpaConfigs };
export type RpaConfig = typeof rpaConfigs.$inferSelect;
export type InsertRpaConfig = typeof rpaConfigs.$inferInsert;

// 访问密码表：Owner 生成的邀请码
export const accessCodes = mysqlTable("access_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 128 }),       // 备注，如「给张三」
  maxUses: int("maxUses").default(1).notNull(),    // 最多可使用次数（-1 表示无限）
  usedCount: int("usedCount").default(0).notNull(),
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

// 全局记忆上下文表：跨任务的长期记忆摘要
export const memoryContext = mysqlTable("memory_context", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 每条记忆对应一个已完成的任务
  taskId: int("taskId").notNull(),
  // 任务摘要（由 LLM 自动生成，用于后续任务的上下文注入）
  summary: text("summary").notNull(),
  // 原始任务标题
  taskTitle: text("taskTitle").notNull(),
  // 关键词（便于相关任务检索）
  keywords: text("keywords"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MemoryContext = typeof memoryContext.$inferSelect;
export type InsertMemoryContext = typeof memoryContext.$inferInsert;
