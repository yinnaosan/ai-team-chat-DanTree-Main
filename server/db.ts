import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, messages, tasks, dbConnections, rpaConfigs,
  accessCodes, userAccess, memoryContext, conversations, attachments, conversationGroups,
  InsertMessage, InsertTask, InsertDbConnection, InsertConversation, InsertAttachment,
  InsertConversationGroup,
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

// ─── Conversation helpers ─────────────────────────────────────────────────────

/** 创建新会话，返回会话ID */
export async function createConversation(data: { userId: number; title?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(conversations).values({
    userId: data.userId,
    title: data.title || null,
  });
  return (result as any)[0]?.insertId as number;
}

/** 获取用户所有会话，按置顶>收藏>时间倒序 */
export async function getConversationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.isPinned), desc(conversations.isFavorited), desc(conversations.updatedAt))
    .limit(200);
}

/** 更新会话标题 */
export async function updateConversationTitle(convId: number, title: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(conversations).set({ title }).where(eq(conversations.id, convId));
}

/** 置顶/取消置顶会话 */
export async function setConversationPinned(convId: number, userId: number, pinned: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(conversations).set({ isPinned: pinned }).where(and(eq(conversations.id, convId), eq(conversations.userId, userId)));
}

/** 收藏/取消收藏会话 */
export async function setConversationFavorited(convId: number, userId: number, favorited: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(conversations).set({ isFavorited: favorited }).where(and(eq(conversations.id, convId), eq(conversations.userId, userId)));
}

// ─── Message helpers ─────────────────────────────────────────────────────────

export async function insertMessage(msg: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(messages).values(msg);
  return (result as any)[0]?.insertId as number;
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

/** 按会话ID获取消息 */
export async function getMessagesByConversation(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
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
  return db.select().from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.isPinned), desc(tasks.isFavorited), desc(tasks.createdAt))
    .limit(100);
}

export async function setPinned(taskId: number, userId: number, pinned: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set({ isPinned: pinned }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
}

export async function setFavorited(taskId: number, userId: number, favorited: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set({ isFavorited: favorited }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
}

export async function getTaskById(taskId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return result[0];
}

// ─── Attachment helpers ───────────────────────────────────────────────────────

export async function insertAttachment(data: InsertAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(attachments).values(data);
  return (result as any)[0]?.insertId as number;
}

export async function getAttachmentsByConversation(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(attachments)
    .where(eq(attachments.conversationId, conversationId))
    .orderBy(attachments.createdAt);
}

export async function getAttachmentsByMessage(messageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(attachments)
    .where(eq(attachments.messageId, messageId));
}

export async function updateAttachmentMessage(attachmentId: number, messageId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(attachments).set({ messageId }).where(eq(attachments.id, attachmentId));
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
  await db.update(dbConnections).set({ isActive: false }).where(eq(dbConnections.userId, userId));
  await db.update(dbConnections).set({ isActive: true }).where(and(eq(dbConnections.id, connId), eq(dbConnections.userId, userId)));
}

export async function deleteDbConnection(userId: number, connId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dbConnections).where(and(eq(dbConnections.id, connId), eq(dbConnections.userId, userId)));
}

// ─── RPA Config helpers ───────────────────────────────────────────────────────

export async function getRpaConfig(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(rpaConfigs).where(eq(rpaConfigs.userId, userId)).limit(1);
  return result[0] ?? null;
}

export async function upsertRpaConfig(
  userId: number,
  config: { chatgptConversationName?: string; manusSystemPrompt?: string; openaiApiKey?: string | null; localProxyUrl?: string | null }
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

// ─── Access Code helpers ──────────────────────────────────────────────────────

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

export async function verifyAccessCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(accessCodes)
    .where(and(eq(accessCodes.code, code), eq(accessCodes.isActive, true)))
    .limit(1);
  const record = result[0];
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;
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

// ─── User Access helpers ──────────────────────────────────────────────────────

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
  await db.insert(userAccess)
    .values({ userId, accessCodeId })
    .onDuplicateKeyUpdate({ set: { accessCodeId, revokedAt: null, grantedAt: new Date() } });
}

export async function revokeUserAccess(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(userAccess).set({ revokedAt: new Date() }).where(eq(userAccess.userId, userId));
}

// ─── Memory Context helpers ───────────────────────────────────────────────────

export async function getRecentMemory(userId: number, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(memoryContext)
    .where(eq(memoryContext.userId, userId))
    .orderBy(desc(memoryContext.createdAt))
    .limit(limit);
}

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

// ─── Conversation Group helpers ───────────────────────────────────────────────

/** 创建分组 */
export async function createConversationGroup(data: InsertConversationGroup) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(conversationGroups).values(data);
  return (result as any)[0]?.insertId as number;
}

/** 获取用户所有分组，按 sortOrder 升序 */
export async function getConversationGroupsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversationGroups)
    .where(eq(conversationGroups.userId, userId))
    .orderBy(conversationGroups.sortOrder, conversationGroups.createdAt);
}

/** 删除分组（不删除其中的会话，只清除 groupId 引用） */
export async function deleteConversationGroup(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 先解绑该组内的所有会话
  await db.update(conversations).set({ groupId: null }).where(
    and(eq(conversations.groupId, groupId), eq(conversations.userId, userId))
  );
  // 再删除分组
  await db.delete(conversationGroups).where(
    and(eq(conversationGroups.id, groupId), eq(conversationGroups.userId, userId))
  );
}

/** 将会话移入/移出分组（groupId 为 null 表示移出） */
export async function setConversationGroup(convId: number, userId: number, groupId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(conversations).set({ groupId }).where(
    and(eq(conversations.id, convId), eq(conversations.userId, userId))
  );
}

/** 重命名分组 */
export async function renameConversationGroup(groupId: number, userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(conversationGroups).set({ name }).where(
    and(eq(conversationGroups.id, groupId), eq(conversationGroups.userId, userId))
  );
}

/** 折叠/展开分组 */
export async function setGroupCollapsed(groupId: number, userId: number, isCollapsed: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(conversationGroups).set({ isCollapsed }).where(
    and(eq(conversationGroups.id, groupId), eq(conversationGroups.userId, userId))
  );
}

/** 搜索对话：按标题或消息内容关键词搜索 */
export async function searchConversations(userId: number, keyword: string) {
  const db = await getDb();
  if (!db) return [];
  const { like, or } = await import("drizzle-orm");

  // 搜索标题匹配的会话
  const titleMatches = await db.select().from(conversations)
    .where(and(eq(conversations.userId, userId), like(conversations.title, `%${keyword}%`)))
    .orderBy(desc(conversations.updatedAt))
    .limit(20);

  // 搜索消息内容匹配的会话（取对应会话ID）
  const msgMatches = await db.selectDistinct({ conversationId: messages.conversationId })
    .from(messages)
    .where(and(eq(messages.userId, userId), like(messages.content, `%${keyword}%`)))
    .limit(20);

  const msgConvIds = msgMatches
    .map(m => m.conversationId)
    .filter((id): id is number => id !== null);

  // 合并去重
  const combined = titleMatches.map(c => c.id).concat(msgConvIds);
  const allIdsArr = Array.from(new Set(combined));
  if (allIdsArr.length === 0) return [];

  // 获取所有匹配会话的完整信息
  const { inArray } = await import("drizzle-orm");
  const results = await db.select().from(conversations)
    .where(and(eq(conversations.userId, userId), inArray(conversations.id, allIdsArr)))
    .orderBy(desc(conversations.updatedAt))
    .limit(30);

  return results;
}
