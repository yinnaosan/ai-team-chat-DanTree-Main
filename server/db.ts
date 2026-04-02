import { eq, desc, and, isNull, sql, inArray, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, messages, tasks, dbConnections, rpaConfigs,
  accessCodes, userAccess, memoryContext, conversations, attachments, conversationGroups,
  InsertMessage, InsertTask, InsertDbConnection, InsertConversation, InsertAttachment,
  InsertConversationGroup, entitySnapshots, InsertEntitySnapshot,
} from "../drizzle/schema";
import { ENV } from './_core/env';

// ─── TrustedSourcesConfig 类型定义 ──────────────────────────────────────────────
export interface TrustedSource {
  id: string;           // 唯一标识，如 "aqr", "gmo"
  name: string;         // 显示名称
  url: string;          // 来源 URL
  category: string;     // 分类，如 "macro", "quant", "fundamentals"
  routingKeys: string[]; // 触发关键词，如 ["量化", "因子", "估值"]
  trustLevel: "primary" | "secondary" | "supplementary"; // 信任等级
  enabled: boolean;
}

export interface RoutingRule {
  id: string;
  pattern: string;      // 匹配模式，如 "美联储", "利率"
  targetSources: string[]; // 匹配时优先调用的来源 ID
  priority: number;     // 优先级（越高越先匹配）
}

export interface TrustedSourcesPolicy {
  requireCitation: boolean;    // 是否强制引用来源
  fallbackToTraining: boolean; // 无数据时是否允许使用训练记忆
  minEvidenceScore: number;    // 最低证据分数（0-1）
  blockOnHardMissing: boolean; // HARD_MISSING 时是否阻断输出
}

export interface TrustedSourcesConfig {
  sources: TrustedSource[];
  routingRules: RoutingRule[];
  policy: TrustedSourcesPolicy;
}

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

/** 获取用户所有会话，按置顶>最近消息时间倒序 */
export async function getConversationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.isPinned), desc(conversations.lastMessageAt))
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
  // 同步更新会话的 lastMessageAt，使列表按最近消息时间排序
  if (msg.conversationId) {
    const now = new Date();
    await db.update(conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(conversations.id, msg.conversationId));
  }
  return (result as any)[0]?.insertId as number;
}

/** 更新消息内容（用于流式输出逐步更新），可选同时更新 metadata */
export async function updateMessageContent(messageId: number, content: string, metadata?: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = { content };
  if (metadata !== undefined) updateData.metadata = metadata;
  await db.update(messages).set(updateData as any).where(eq(messages.id, messageId));
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

/** 删除会话及其所有消息（验证属于该用户） */
export async function deleteConversationAndMessages(conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 验证会话属于该用户
  const conv = await db.select().from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  if (!conv.length) throw new Error("Conversation not found or not authorized");
  // 删除所有消息
  await db.delete(messages).where(eq(messages.conversationId, conversationId));
  // 删除会话本身
  await db.delete(conversations).where(eq(conversations.id, conversationId));
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
  status: "pending" | "manus_working" | "manus_analyzing" | "gpt_reviewing" | "streaming" | "completed" | "failed",
  extra?: { manusResult?: string; gptSummary?: string; streamMsgId?: number }
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
export async function getAttachmentById(attachmentId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(attachments).where(eq(attachments.id, attachmentId)).limit(1);
  return rows[0] ?? null;
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

/**
 * 获取 Owner 的 RPA 配置（作为全站默认值）
 * Owner 由 OWNER_OPEN_ID 环境变量标识
 */
export async function getOwnerRpaConfig() {
  // 硬编码的 Owner 默认守则内容（作为兜底默认值，当数据库查不到时使用）
  const DEFAULT_INVESTMENT_RULES = `我的核心投资理念
我是以基本面为核心的投资者。对我而言，投资的本质绝不是交易屏幕上跳动的价格，而是买入一家公司的所有权。真正的安全边际，永远且只能来源于我是否真正懂这家公司。
我不做认知之外的投资。看不懂的生意、不清晰的盈利模式，我宁可错过，也绝不强行拼凑逻辑。在不确定性面前，我允许自己空仓或延迟决策，因为我不接受被动参与市场。

一、寻找结构性机会与差异化壁垒
我的分析永远自上而下。但在看对方向后，我最看重的是差异化。差异化是带来高利润的唯一来源。我拒绝为缺乏壁垒、陷入同质化红海内卷的企业支付溢价。只有差异化，才能让企业在残酷的竞争中活得"更健康、更长久"。

二、严苛的体检与价值观审查
在具体分析公司时，我不看重短期的季度业绩博弈，我只看重支撑企业长远发展的基石：自由现金流、投入资本回报率（ROIC）以及清晰的增长路径。更重要的是，我相信文化与战略大于管理。我深度考察管理层是否"本分"，是否坚持"用户导向"。我更关注他们"拒绝了什么诱惑"——那些不符合战略和价值观的钱，他们是否忍住不赚？如果发现做错了，他们是否有立刻止损的魄力？

三、风险与收益的绝对匹配
我对风险的评估极其简单而冷酷：我必须得到与我所承担风险绝对匹配的收益。所有结论都必须基于严谨的数据与逻辑推导，我绝不凭感觉或单一信息源做判断。当遇到与自己判断相悖的强烈市场共识时，我绝不固执己见，而是会重新审视整个逻辑链条，确保能够及时纠错。
在仓位管理上，我坚持适度分散，这不仅是为了平衡收益，更是为了让我能够从容面对黑天鹅事件和非市场性风险。我会结合宏观环境（利率、流动性、经济周期）来决定风险暴露，在必要时果断调整仓位，绝不盲目长期持有。

四、知行合一的交易纪律
我不追逐短期热点，不进行高频交易，不依赖纯技术分析。我采用中长期持有为主、择时为辅的策略。我的建仓条件极其苛刻，只有在以下三者同时满足时，我才会扣动扳机：
- 公司正确：优秀的生意模式、差异化壁垒、靠谱的管理层
- 价格合理：估值具有安全边际，匹配我承担的风险
- 资金方向一致：机构资金或宏观流动性支持该方向
一旦这三个条件中的任何一个被破坏，我都会无情地重新评估，甚至果断退出。我的所有决策必须逻辑完整，并且永远优先考虑最坏的情况。
我有过因为坚守纪律而错过机会的经历，但我坦然接受。正如段永平所言：先做对的事情，不做不对的事情，再把对的事情做好。错过不可怕，做错才致命。纪律，就是我的生命线。`;
  const DEFAULT_TASK_INSTRUCTION = `为了确保投资分析的严谨性和客观性，在每次执行任务的生命周期中，必须严格遵守以下底层运行逻辑，并强制执行"三次复查机制"（任务开始前、任务执行中、递交结果前）。

1. 绝对理解：仔细阅读每次给出的指令，确保完全理解用户意图。如遇表述不清或错别字，必须向用户多次确认，绝不允许主观臆断、随意补充或修改指令内容。
3. 实时与真实：在寻找数据或观点时，必须实时、多次、仔细地检索专属资料库。确保所有信息的准确性和时效性，禁止简单重复使用过往搜索到的旧数据。绝对不允许编造或捏造任何虚假数据及信息。
4. 交叉验证：对于存在于多个信息源的同一数据，必须进行多次比对、交叉验证和前后验证，以确保提供的数据准确无误、客观。若数据无法获取或工作量过大，必须如实告知用户。绝对不允许自行估算或编造数据。
5. 去噪：在收集他人的分析观点或建议时，通过对多个观点进行交叉验证和前后验证，识别并标注出可能误导判断的政治倾向、情绪波动等噪音信息。绝对不准篡改或生成虚假的观点及建议。分析方法必须科学、理性。
6. 专业与客观：在分析过程中，必须时刻保持冷静、专业、精确、仔细和全面。不允许为了迎合用户而掩盖方法上的错误或一味附和。绝对不允许编造或捏造虚假数据。
7. 风险排查：在用户做出最终决策并进行确认前，必须多次审查整个分析过程，排查是否存在潜在的风险点或被忽略的关键细节。
8. 统计学检验：对于所引用的观点、分析结论、建议和数据趋势，必须根据其过往的准确性进行可靠性评估。运用统计学方法进行严谨检验，并提供相应的可靠度百分比。绝对不允许编造或捏造虚假数据。
9. 严密逻辑：分析过程必须具备严密的逻辑性，做到环环相扣、有理有据。在处理数据和得出结论时，不允许为了迎合用户的偏好或倾向而改变分析方法或篡改最终结果。
10. 极度严苛：当用户需要详细的分析内容时，必须迅速响应并提供详尽的报告。在处理任务时必须保持极度严苛的态度，绝不允许有任何懈怠或偷懒行为。
11. 核心市场聚焦与推演：在宏观分析中，应重点聚焦美国、香港、中国大陆、欧盟和英国五大核心市场。优先考虑任何可能影响这些市场的关联事件或异动信息。为了实现准确的预判和验证，必须进行严密的逻辑性正推与倒推。
12. 统计严谨性与模型控制：在数据处理和模型构建中，必须使用专业的统计方法解决过度拟合（Overfitting）和欠拟合（Underfitting）问题。尽可能剔除数据噪音，同时保证数据的完整性。绝对禁止为了展现美好的预期或支持特定观点，而篡改统计分析步骤或破坏严谨性。`;
  const DEFAULT_DATA_LIBRARY = `金融投资分析专属数据库清单及用途指南
本清单整理了用户专属的 22 个金融投资分析数据库。这些平台按其在投资分析框架中的核心功能进行分类，并在实际任务执行中作为主要受信任的数据来源，如果需要额外的信息来源则需要仔细验有效性和时效性。

1. 宏观经济与央行政策 (Macro & Central Banks)
这一板块的数据库用于判断经济周期、通胀趋势以及货币政策走向，是宏观择时和资产配置的基础。
- Haver Analytics (https://www.haver.com/)：核心宏观数据解读。用于获取全球宏观经济数据（如 CPI、非农就业）发布后的即时专业解读，评估数据对市场预期的影响。
- Trading Economics (https://tradingeconomics.com/)：跨国宏观数据对比与预测。提供 196 个国家的经济指标对比、经济预测模型和财经日历，用于宏观趋势的前瞻性判断。
- ITC Markets Hawk-Dove (https://www.itcmarkets.com/hawk-dove-cheat-sheet-2/)：央行政策立场量化。提供全球主要央行（美联储、欧央行等）委员的鹰鸽立场量化评级，用于前瞻性预判利率决议方向。
- CME Group (https://www.cmegroup.com/)：利率预期与衍生品定价。通过 FedWatch 工具获取市场对美联储利率变动的精确概率定价，捕捉市场预期差。

2. 量化研究与资产估值 (Quant & Valuation)
用于从长周期的视角判断大类资产的估值高低，以及运用因子模型进行策略分析。
- AQR (https://www.aqr.com/)：量化因子与长期假设。提取动量、价值、质量等经典量化因子的最新表现，以及各大类资产的长期资本市场假设。
- GMO (https://www.gmo.com/americas/research-library/)：资产估值与逆向投资。核心工具是其每月更新的"7年资产类别预期收益率"，用于判断当前哪些资产处于估值泡沫，哪些被极度低估。

3. 机构动向与另类数据 (Institutions & Alternative Data)
追踪"聪明钱"的流向以及非传统维度的事件驱动因素。
- WhaleWisdom (https://whalewisdom.com/)：机构持仓解析。深度解析 13F 文件，追踪顶级对冲基金和机构投资者的最新建仓、增减持动态。
- Quiver Quantitative (https://www.quiverquant.com/)：另类事件驱动。监控美国国会议员交易、企业高管内部买卖、政府合同审批等非传统数据，寻找交易催化剂。
- Polymarket (https://polymarket.com/)：政治风险与黑天鹅定价。基于区块链的预测市场，用于量化地缘政治事件、大选结果等宏观风险发生的概率。

4. 个股基本面与技术分析 (Fundamentals & Technicals)
深入挖掘单家公司的财务健康状况、商业模式，并结合技术面进行精准择时。
- Stock Analysis (https://stockanalysis.com/)：深度基本面体检。提供个股的详细财务报表、分析师盈利预测以及高级量化筛选器，用于评估公司的内在价值。
- Seeking Alpha (https://seekingalpha.com/latest-articles)：多空观点对冲与财报解读。聚合众包的深度研究文章，在分析个股时用于收集多空双方的逻辑，进行交叉验证。
- TradingView Markets (https://www.tradingview.com/markets/)：跨资产图表与技术择时。提供强大的实时图表工具，用于关键支撑/阻力位的判断和技术指标分析。
- Finviz (https://finviz.com/)：市场广度与股票筛选。通过板块热力图快速把握市场资金主线，使用其筛选器定位符合特定技术和基本面形态的个股。

5. 垂直领域与区域市场 (Verticals & Regional Markets)
针对用户特定关注的产业（如新能源、AI）及区域市场（加拿大、中国）的深度数据源。
- 上海有色网 SMM (https://www.smm.cn/)：中国大宗与新能源产业链。唯一专注于中国现货基本面的平台，用于追踪铜、锂等新能源关键材料的真实供需信号（库存、开工率）。
- Bloomberg Canada (https://www.bloomberg.com/canada)：加拿大市场深度跟踪。专注 TSX 市场、加拿大央行政策以及能源/大宗商品领域的宏观深度报道。
- ETF.com (https://www.etf.com/)：被动投资与资金流向。提供全面的 ETF 数据库，用于分析特定行业（如 AI、半导体）的资金净流入/流出情况。
- 聚宽社区 JoinQuant (https://www.joinquant.com/view/community/list?listType=1)：A 股量化策略研究社区。包含大量实盘策略、因子分析、ETF 轮动模型和回测代码，用于 A 股量化投资思路的参考与验证。

6. 宏观洞察与财经快讯 (Insights & News)
获取机构视角的宏观策略分析以及驱动市场的即时新闻。
- Citadel Securities (https://www.citadelsecurities.com/news-and-insights/)：做市商宏观策略。提供关于全球利率、信贷动态以及市场微观结构的高频机构观点。
- Apollo Academy (https://www.apolloacademy.com/)：另类资产与高频宏观。聚焦私募股权、私人信贷领域的投资洞察，其"每日宏观火花"提供高频的经济数据点评。
- Visual Capitalist (https://www.visualcapitalist.com/)：宏观趋势可视化。将复杂的全球经济、科技（如 AI 算力演进）、能源趋势转化为高质量的信息图，直观呈现产业变迁。
- cls.cn：全球宏观快讯驱动。7x24 小时追踪全球央行动态、地缘政治突发事件及关键经济数据发布，用于捕捉短线交易情绪。

7. 合规与制裁筛查 (Compliance & Sanctions)
这一板块用于评估投资标的的法律合规风险，包括制裁名单筛查、政治敏感人物识别和反洗钱合规核查。
- OpenSanctions (https://www.opensanctions.org/datasets/)：全球制裁与合规筛查。覆盖 99,451 个制裁实体（OFAC/EU/UN）和 881,005 个政治敏感人物（PEP），用于评估投资标的的制裁风险、反洗钱合规状态及地缘政治敞口。`;

  const db = await getDb();
  if (!db || !ENV.ownerOpenId) {
    // 数据库不可用时，返回硬编码默认值
    return {
      id: 0,
      userId: 0,
      investmentRules: DEFAULT_INVESTMENT_RULES,
      taskInstruction: DEFAULT_TASK_INSTRUCTION,
      dataLibrary: DEFAULT_DATA_LIBRARY,
      chatgptConversationName: null,
      manusSystemPrompt: null,
      openaiApiKey: null,
      openaiModel: null,
      localProxyUrl: null,
      userCoreRules: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  // 先找 Owner 的 userId
  const ownerUser = await db.select().from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1);
  if (!ownerUser[0]) {
    return {
      id: 0,
      userId: 0,
      investmentRules: DEFAULT_INVESTMENT_RULES,
      taskInstruction: DEFAULT_TASK_INSTRUCTION,
      dataLibrary: DEFAULT_DATA_LIBRARY,
      chatgptConversationName: null,
      manusSystemPrompt: null,
      openaiApiKey: null,
      openaiModel: null,
      localProxyUrl: null,
      userCoreRules: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  const result = await db.select().from(rpaConfigs).where(eq(rpaConfigs.userId, ownerUser[0].id)).limit(1);
  if (!result[0]) {
    return {
      id: 0,
      userId: ownerUser[0].id,
      investmentRules: DEFAULT_INVESTMENT_RULES,
      taskInstruction: DEFAULT_TASK_INSTRUCTION,
      dataLibrary: DEFAULT_DATA_LIBRARY,
      chatgptConversationName: null,
      manusSystemPrompt: null,
      openaiApiKey: null,
      openaiModel: null,
      localProxyUrl: null,
      userCoreRules: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  // 数据库有记录，但如果某个字段为空，用默认值填充
  return {
    ...result[0],
    investmentRules: result[0].investmentRules || DEFAULT_INVESTMENT_RULES,
    taskInstruction: result[0].taskInstruction || DEFAULT_TASK_INSTRUCTION,
    dataLibrary: result[0].dataLibrary || DEFAULT_DATA_LIBRARY,
  };
}

export async function upsertRpaConfig(
  userId: number,
  config: { chatgptConversationName?: string; manusSystemPrompt?: string; openaiApiKey?: string | null; openaiModel?: string | null; localProxyUrl?: string | null; userCoreRules?: string | null; investmentRules?: string | null; taskInstruction?: string | null; dataLibrary?: string | null; trustedSourcesConfig?: TrustedSourcesConfig | null; defaultCostMode?: "A" | "B" | "C" | null; pinnedMetrics?: Array<{label: string; value: string; change?: string; color?: string}> | null; userWatchlist?: string[] | null; columnWidths?: {sidebar?: number; analysis?: number; discussion?: number; insight?: number} | null; lastTicker?: string | null; researchStyle?: {outputStyle?: string; analysisEmphasis?: string[]} | null; aiBehavior?: {responseStyle?: string; initiativeLevel?: string; decisionStyle?: string} | null; chartColorScheme?: "cn" | "us" | null }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getRpaConfig(userId);
  // 过滤掉 null 值以避免 Drizzle 类型不兼容
  const cleanConfig = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== null && v !== undefined)
  ) as typeof config;
  if (existing) {
    await db.update(rpaConfigs).set({ ...cleanConfig } as any).where(eq(rpaConfigs.userId, userId));
  } else {
    await db.insert(rpaConfigs).values({ userId, ...cleanConfig } as any);
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

// ─── Memory Context helpers ─────────────────────────────────────────────
/** 获取对话内的记忆（对话级隔离），如果没有conversationId则获取用户全局记忆 */
export async function getRecentMemory(userId: number, limit = 10, conversationId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = conversationId
    ? and(eq(memoryContext.userId, userId), eq(memoryContext.conversationId, conversationId))
    : eq(memoryContext.userId, userId);
  return db.select().from(memoryContext)
    .where(conditions)
    .orderBy(desc(memoryContext.createdAt))
    .limit(limit);
}
/**
 * 语义相关性记忆召回
 *
 * 评分策略：关键词匹配分（TF-IDF 风格）+ 时间衰减分双维度加权
 *
 * 关键词匹配：将查询分词，与记忆的 taskTitle + keywords + summary 匹配
 *   - 每个匹配词得 1 分，标题匹配得 2 分（标题权重更高）
 *   - 包含股票代码、公司名等实体词匹配得 3 分（实体权重最高）
 * 时间衰减：最近 7 天内 1.0，7-30 天 0.8，30-90 天 0.5，90 天以上 0.3
 * 最终分 = 关键词匹配分 * 时间衰减系数
 * 返回最高分的 topK 条，至少保留最近 minRecent 条（防止全部是旧记忆）
 */
export async function getRelevantMemory(
  userId: number,
  query: string,
  options: { topK?: number; minRecent?: number; conversationId?: number; excludeTypes?: string[] } = {}
) {
  const { topK = 6, minRecent = 2, conversationId, excludeTypes = ["analysis"] } = options;
  const db = await getDb();
  if (!db) return [];

  // 获取该用户所有记忆（最多 50 条，过旧的不召回）
  const conditions = conversationId
    ? and(eq(memoryContext.userId, userId), eq(memoryContext.conversationId, conversationId))
    : eq(memoryContext.userId, userId);
  const allMemoryRaw = await db.select().from(memoryContext)
    .where(conditions)
    .orderBy(desc(memoryContext.createdAt))
    .limit(50);
  // 默认排除 analysis 类型，防止旧结论污染当前分析
  const allMemory = excludeTypes.length > 0
    ? allMemoryRaw.filter(m => !excludeTypes.includes(m.memoryType ?? "analysis"))
    : allMemoryRaw;

  if (allMemory.length === 0) return [];

  // 分词：提取查询中所有 2字以上的词（中文分字符，英文分单词）
  const tokenize = (text: string): string[] => {
    const words: string[] = [];
    // 英文单词
    const englishWords = text.match(/[A-Za-z][A-Za-z0-9.]{1,}/g) || [];
    words.push(...englishWords.map(w => w.toLowerCase()));
    // 中文 2-4 字片语（模拟 n-gram）
    const chinese = text.replace(/[^\u4e00-\u9fa5]/g, "");
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i <= chinese.length - n; i++) {
        words.push(chinese.slice(i, i + n));
      }
    }
    return words;
  };

  const queryTokensArr = tokenize(query);
  // 股票代码模式（如 AAPL、TSLA、BRK.B）
  const tickerPattern = /\b[A-Z]{1,5}(?:\.[A-Z]{1,2})?\b/g;
  const queryTickers = Array.from(new Set(query.match(tickerPattern) || []));

  const now = Date.now();
  const DAY = 86400000;

  const scored = allMemory.map(m => {
    // 时间衰减系数
    const ageDays = (now - new Date(m.createdAt).getTime()) / DAY;
    const timeFactor = ageDays <= 7 ? 1.0 : ageDays <= 30 ? 0.8 : ageDays <= 90 ? 0.5 : 0.3;

    // 关键词匹配分
    let matchScore = 0;
    const titleTokens = tokenize(m.taskTitle || "");
    const summaryTokens = tokenize(m.summary || "");
    const keywordTokens = tokenize(m.keywords || "");

    for (const token of queryTokensArr) {
      if (titleTokens.includes(token)) matchScore += 2;    // 标题匹配权重更高
      if (summaryTokens.includes(token)) matchScore += 1;
      if (keywordTokens.includes(token)) matchScore += 1;
    }

    // 股票代码匹配（最高权重）
    const memoryText = (m.taskTitle || "") + " " + (m.keywords || "");
    for (const ticker of queryTickers) {
      if (memoryText.toUpperCase().includes(ticker)) matchScore += 3;
    }

    // 重要性加成：importance 影响最终得分，确保高价値记忆在相同匹配度下优先被选取
    // importance=1 → -1.0（轻微降权）， importance=3 → 0（中性）， importance=5 → +1.0（显著提升）
    const imp = m.importance ?? 3;
    const importanceBonus = (imp - 3) * 0.5;

    return { memory: m, score: matchScore * timeFactor + importanceBonus, matchScore, timeFactor, importanceBonus };
  });

  // 按分数降序排序
  scored.sort((a, b) => b.score - a.score);

  // 取 topK 条，但至少保留最近 minRecent 条（防止全是旧记忆）
  const topKResults = scored.slice(0, topK).map(s => s.memory);
  const recentResults = allMemory.slice(0, minRecent);

  // 合并去重（保持顺序：topK 先，最近补充）
  const seen = new Set(topKResults.map(m => m.id));
  const merged = [...topKResults];
  for (const m of recentResults) {
    if (!seen.has(m.id)) merged.push(m);
  }

  return merged;
}

/**
 * 根据 importance 计算记忆过期时间
 * importance=1 → 30天， importance=2 → 90天， importance=3 → 180天
 * importance=4 → 365天， importance=5 → 永不过期（null）
 */
function computeExpiresAt(importance: number): Date | null {
  const DAY_MS = 86400000;
  const now = Date.now();
  // importance=5 映射到 null（永不过期），其他映射到天数
  const daysMap: Record<number, number | null> = {
    1: 30,
    2: 90,
    3: 180,
    4: 365,
    5: null, // 永不过期
  };
  // 注意：不能用 ?? ，因为 null ?? 180 会返回 180
  const days = importance in daysMap ? daysMap[importance] : 180;
  return days === null ? null : new Date(now + days! * DAY_MS);
}

export async function saveMemoryContext(data: {
  userId: number;
  taskId: number;
  conversationId?: number;
  taskTitle: string;
  summary: string;
  keywords?: string;
  memoryType?: "preference" | "workflow" | "watchlist" | "analysis";
  importance?: number; // 1-5 重要性评分，默认 3
  expiresAt?: Date;
  agentSignals?: string; // JSON 字符串，存储多 Agent 分析信号
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const imp = Math.min(5, Math.max(1, Math.round(data.importance ?? 3)));
  // 如果调用方没有显式传入 expiresAt，则根据 importance 自动计算
  const expiresAt = data.expiresAt !== undefined ? data.expiresAt : (computeExpiresAt(imp) ?? undefined);
  await db.insert(memoryContext).values({
    ...data,
    memoryType: data.memoryType ?? "analysis",
    importance: imp,
    expiresAt,
  });
}

/** 获取用户对特定股票代码的历史 Agent 信号（最近 N 条） */
export async function getAgentSignalHistory(
  userId: number,
  ticker: string,
  limit = 5
): Promise<Array<{ taskTitle: string; agentSignals: string; createdAt: Date }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      taskTitle: memoryContext.taskTitle,
      agentSignals: memoryContext.agentSignals,
      createdAt: memoryContext.createdAt,
    })
    .from(memoryContext)
    .where(
      and(
        eq(memoryContext.userId, userId),
        sql`${memoryContext.agentSignals} IS NOT NULL`,
        sql`${memoryContext.keywords} LIKE ${`%${ticker.toUpperCase()}%`}`
      )
    )
    .orderBy(desc(memoryContext.createdAt))
    .limit(limit);
  return rows.filter(r => r.agentSignals !== null) as Array<{ taskTitle: string; agentSignals: string; createdAt: Date }>;
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

// ── maybe-finance/maybe 风格：资产负债表查询函数 ──────────────────────────────────────────────────
import { assets, liabilities, netWorthSnapshots } from "../drizzle/schema";
import type { Asset, InsertAsset, Liability, InsertLiability } from "../drizzle/schema";

export async function getUserAssets(userId: number): Promise<Asset[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assets)
    .where(eq(assets.userId, userId))
    .orderBy(desc(assets.updatedAt));
}

export async function createAsset(data: InsertAsset): Promise<Asset> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(assets).values(data) as any;
  const [created] = await db.select().from(assets).where(eq(assets.id, result.insertId));
  return created;
}

export async function updateAsset(id: number, userId: number, data: Partial<InsertAsset>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(assets)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(assets.id, id), eq(assets.userId, userId)));
}

export async function deleteAsset(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(assets).where(and(eq(assets.id, id), eq(assets.userId, userId)));
}

export async function getUserLiabilities(userId: number): Promise<Liability[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(liabilities)
    .where(eq(liabilities.userId, userId))
    .orderBy(desc(liabilities.updatedAt));
}

export async function createLiability(data: InsertLiability): Promise<Liability> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(liabilities).values(data) as any;
  const [created] = await db.select().from(liabilities).where(eq(liabilities.id, result.insertId));
  return created;
}

export async function updateLiability(id: number, userId: number, data: Partial<InsertLiability>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(liabilities)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(liabilities.id, id), eq(liabilities.userId, userId)));
}

export async function deleteLiability(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(liabilities).where(and(eq(liabilities.id, id), eq(liabilities.userId, userId)));
}

export async function saveNetWorthSnapshot(userId: number, totalAssets: string, totalLiabilities: string, netWorth: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(netWorthSnapshots).values({ userId, totalAssets, totalLiabilities, netWorth });
}

export async function getNetWorthHistory(userId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(desc(netWorthSnapshots.snapshotAt))
    .limit(limit);
}

// ── 市场情绪历史持久化 ──────────────────────────────────────────────────────────────
import { sentimentHistory } from "../drizzle/schema";
import type { InsertSentimentHistory } from "../drizzle/schema";

/**
 * 写入当日情绪数据（upsert：同一天只保留最新一条）
 */
export async function upsertDailySentiment(data: Omit<InsertSentimentHistory, "id" | "createdAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // 先删除同日旧记录，再插入新记录
  await db.delete(sentimentHistory).where(eq(sentimentHistory.date, data.date));
  await db.insert(sentimentHistory).values(data);
}

/**
 * 查询最近 N 天的情绪历史（按日期升序，用于趋势图）
 */
export async function getSentimentHistoryRecords(days = 7) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return db.select().from(sentimentHistory)
    .where(gte(sentimentHistory.date, cutoffStr))
    .orderBy(sentimentHistory.date)
    .limit(days);
}

// ─── Memory Context CRUD helpers ─────────────────────────────────────────────
/** 删除单条记忆（仅限记忆所有者） */
export async function deleteMemoryContext(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(memoryContext).where(
    and(eq(memoryContext.id, id), eq(memoryContext.userId, userId))
  );
}

/** 批量删除记忆（仅限记忆所有者） */
export async function deleteMemoryContextBatch(ids: number[], userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return;
  await db.delete(memoryContext).where(
    and(inArray(memoryContext.id, ids), eq(memoryContext.userId, userId))
  );
}

/** 更新记忆的 summary 和 keywords 字段（仅限记忆所有者） */
export async function updateMemoryContext(
  id: number,
  userId: number,
  data: { summary?: string; keywords?: string; importance?: number }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates: Record<string, unknown> = {};
  if (data.summary !== undefined) updates.summary = data.summary;
  if (data.keywords !== undefined) updates.keywords = data.keywords;
  if (data.importance !== undefined) updates.importance = Math.min(5, Math.max(1, Math.round(data.importance)));
  if (Object.keys(updates).length === 0) return;
  await db.update(memoryContext)
    .set(updates)
    .where(and(eq(memoryContext.id, id), eq(memoryContext.userId, userId)));
}

// ─── Entity Snapshot helpers (LEVEL21) ───────────────────────────────────────
/** 插入一条实体快照记录 */
export async function insertEntitySnapshot(data: InsertEntitySnapshot): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(entitySnapshots).values(data);
}

/** 获取指定实体的最新 N 条快照（按时间倒序） */
export async function getEntitySnapshotsByKey(
  entityKey: string,
  limit = 10
) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(entitySnapshots)
    .where(eq(entitySnapshots.entityKey, entityKey))
    .orderBy(desc(entitySnapshots.snapshotTime))
    .limit(limit);
}

/** 获取指定实体的最新一条快照 */
export async function getLatestEntitySnapshot(entityKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(entitySnapshots)
    .where(eq(entitySnapshots.entityKey, entityKey))
    .orderBy(desc(entitySnapshots.snapshotTime))
    .limit(1);
  return rows[0] ?? undefined;
}
