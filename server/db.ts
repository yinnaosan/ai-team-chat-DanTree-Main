import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, messages, tasks, dbConnections, rpaConfigs,
  accessCodes, userAccess, memoryContext,
  InsertMessage, InsertTask, InsertDbConnection,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User helpers ────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Message helpers ─────────────────────────────────────────────────────────

export async function insertMessage(msg: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(messages).values(msg);
}

export async function getMessages(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messages).orderBy(desc(messages.createdAt)).limit(limit);
}

/** 获取用户全部历史消息（登录即加载，按时间升序） */
export async function getAllMessagesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(messages.createdAt);
}

/** 获取所有消息（不过滤用户，包含系统消息），按时间升序 */
export async function getAllMessages() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messages).orderBy(messages.createdAt);
}

export async function getMessagesByTask(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messages).where(eq(messages.taskId, taskId)).orderBy(messages.createdAt);
}

// ─── Task helpers ─────────────────────────────────────────────────────────────

export async function createTask(task: InsertTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tasks).values(task);
  return result;
}

export async function updateTaskStatus(
  taskId: number,
  status: "pending" | "manus_working" | "gpt_reviewing" | "completed" | "failed",
  extra?: { manusResult?: string; gptSummary?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set({ status, ...extra }).where(eq(tasks.id, taskId));
}

export async function getTasksByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(desc(tasks.createdAt)).limit(50);
}

export async function getTaskById(taskId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return result[0];
}

// ─── DB Connection helpers ────────────────────────────────────────────────────

export async function saveDbConnection(conn: InsertDbConnection) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(dbConnections).values(conn);
}

export async function getDbConnectionsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dbConnections).where(eq(dbConnections.userId, userId));
}

export async function getActiveDbConnection(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(dbConnections)
    .where(and(eq(dbConnections.userId, userId), eq(dbConnections.isActive, true)))
    .limit(1);
  return result[0];
}

export async function setActiveDbConnection(userId: number, connId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 先全部设为非活跃
  await db.update(dbConnections).set({ isActive: false }).where(eq(dbConnections.userId, userId));
  // 再激活指定连接
  await db.update(dbConnections).set({ isActive: true }).where(and(eq(dbConnections.id, connId), eq(dbConnections.userId, userId)));
}

export async function deleteDbConnection(userId: number, connId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dbConnections).where(and(eq(dbConnections.id, connId), eq(dbConnections.userId, userId)));
}

// ─── RPA Config helpers ──────────────────────────────────────────────────────────────────────────────

export async function getRpaConfig(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(rpaConfigs).where(eq(rpaConfigs.userId, userId)).limit(1);
  return result[0] ?? null;
}

export async function upsertRpaConfig(
  userId: number,
  config: { chatgptConversationName?: string; manusSystemPrompt?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getRpaConfig(userId);
  if (existing) {
    await db.update(rpaConfigs).set({ ...config }).where(eq(rpaConfigs.userId, userId));
  } else {
    await db.insert(rpaConfigs).values({ userId, ...config });
  }
}

// ─── Access Code helpers ──────────────────────────────────────────────────────────────────────────────

export async function createAccessCode(data: { code: string; label?: string; maxUses?: number; expiresAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(accessCodes).values({
    code: data.code,
    label: data.label,
    maxUses: data.maxUses ?? 1,
    expiresAt: data.expiresAt,
  });
}

export async function listAccessCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accessCodes).orderBy(desc(accessCodes.createdAt));
}

export async function revokeAccessCode(codeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(accessCodes).set({ isActive: false }).where(eq(accessCodes.id, codeId));
}

/** 验证密码，成功返回密码记录，失败返回 null */
export async function verifyAccessCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(accessCodes)
    .where(and(
      eq(accessCodes.code, code),
      eq(accessCodes.isActive, true),
    ))
    .limit(1);
  const record = result[0];
  if (!record) return null;
  // 检查是否过期
  if (record.expiresAt && record.expiresAt < new Date()) return null;
  // 检查使用次数（-1 表示无限）
  if (record.maxUses !== -1 && record.usedCount >= record.maxUses) return null;
  return record;
}

export async function incrementCodeUsage(codeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(accessCodes)
    .set({ usedCount: sql`${accessCodes.usedCount} + 1` })
    .where(eq(accessCodes.id, codeId));
}

// ─── User Access helpers ──────────────────────────────────────────────────────────────────────────────

export async function getUserAccess(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(userAccess)
    .where(and(eq(userAccess.userId, userId), isNull(userAccess.revokedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function grantUserAccess(userId: number, accessCodeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // upsert—如果已有记录则更新
  await db.insert(userAccess)
    .values({ userId, accessCodeId })
    .onDuplicateKeyUpdate({ set: { accessCodeId, revokedAt: null, grantedAt: new Date() } });
}

export async function revokeUserAccess(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(userAccess).set({ revokedAt: new Date() }).where(eq(userAccess.userId, userId));
}

// ─── Memory Context helpers ────────────────────────────────────────────────────────────────────────────

/** 获取用户最近 N 条记忆，用于注入上下文 */
export async function getRecentMemory(userId: number, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(memoryContext)
    .where(eq(memoryContext.userId, userId))
    .orderBy(desc(memoryContext.createdAt))
    .limit(limit);
}

/** 任务完成后保存记忆摘要 */
export async function saveMemoryContext(data: {
  userId: number;
  taskId: number;
  taskTitle: string;
  summary: string;
  keywords?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(memoryContext).values(data);
}
