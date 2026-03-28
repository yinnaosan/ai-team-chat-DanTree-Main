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
  decimal,
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
  // 成本控制模式：A=minimal(quick), B=standard, C=restricted(deep with limits)
  defaultCostMode: mysqlEnum("defaultCostMode", ["A", "B", "C"]).default("B").notNull(),
  // Pinned Metrics 持久化：存储用户固定的关键指标配置（JSON 数组）
  pinnedMetrics: json("pinnedMetrics"),
  // 用户自选股列表（JSON 数组，如 ["AAPL", "TSLA", "BTC"]）
  userWatchlist: json("userWatchlist"),
  // 工作台列宽配置（JSON，如 {sidebar: 220, analysis: 320, discussion: 380, insight: 280}）
  columnWidths: json("columnWidths"),
  // 最后访问的标的（用于跨 session 持久化 currentTicker）
  lastTicker: varchar("lastTicker", { length: 32 }),
  // 研究风格：输出风格 + 分析重点偏好
  researchStyle: json("researchStyle"),
  // AI 行为配置：responseStyle / initiativeLevel / decisionStyle
  aiBehavior: json("aiBehavior"),
  // 图表涨跌颜色方案：cn=红涨绿跌（中国），us=绿涨红跌（美国）
  chartColorScheme: varchar("chartColorScheme", { length: 8 }),
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
  // 记忆重要性评分（1=一般信息, 2=有用, 3=重要, 4=很重要, 5=核心记忆）
  importance: int("importance").default(3).notNull(),
  // 记忆过期时间（null 表示永不过期）
  expiresAt: timestamp("expiresAt"),
  // 多 Agent 分析信号（JSON 字符串）
  // 格式: { ticker, macro, technical, fundamental, sentiment, compositeSignal, analyzedAt }
  agentSignals: text("agentSignals"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MemoryContext = typeof memoryContext.$inferSelect;
export type InsertMemoryContext = typeof memoryContext.$inferInsert;

// ── maybe-finance/maybe 风格：个人资产负债表模块 ─────────────────────────────────────────────────
/**
 * 资产账户表
 * 参考 maybe-finance/maybe 的 Account 模型设计
 * 支持：股票持仓、现金账户、房产、加密货币、其他资产
 */
export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  category: mysqlEnum("category", [
    "stocks",      // 股票/ETF
    "crypto",      // 加密货币
    "cash",        // 现金/存款
    "real_estate", // 房产
    "bonds",       // 债券
    "other",       // 其他
  ]).notNull().default("other"),
  ticker: varchar("ticker", { length: 20 }),        // 股票代码（可选）
  quantity: decimal("quantity", { precision: 18, scale: 8 }),  // 持有数量
  costBasis: decimal("costBasis", { precision: 18, scale: 2 }), // 成本价（USD）
  currentValue: decimal("currentValue", { precision: 18, scale: 2 }).notNull(), // 当前市值（USD）
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

/**
 * 负债表
 * 参考 maybe-finance/maybe 的 Liability 模型设计
 * 支持：房贷、车贷、信用卡、学生贷款、其他负债
 */
export const liabilities = mysqlTable("liabilities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  category: mysqlEnum("category", [
    "mortgage",       // 房贷
    "car_loan",       // 车贷
    "credit_card",    // 信用卡
    "student_loan",   // 学生贷款
    "personal_loan",  // 个人贷款
    "other",          // 其他
  ]).notNull().default("other"),
  outstandingBalance: decimal("outstandingBalance", { precision: 18, scale: 2 }).notNull(), // 未偿余额（USD）
  interestRate: decimal("interestRate", { precision: 6, scale: 4 }),  // 年利率（小数，如 0.05 = 5%）
  monthlyPayment: decimal("monthlyPayment", { precision: 18, scale: 2 }), // 月供（USD）
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Liability = typeof liabilities.$inferSelect;
export type InsertLiability = typeof liabilities.$inferInsert;

/**
 * 净资产快照表
 * 参考 maybe-finance/maybe 的 NetWorthSnapshot 模型设计
 * 每次用户更新资产/负债时自动记录净资产快照，用于趋势图
 */
export const netWorthSnapshots = mysqlTable("net_worth_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  totalAssets: decimal("totalAssets", { precision: 18, scale: 2 }).notNull(),    // 总资产（USD）
  totalLiabilities: decimal("totalLiabilities", { precision: 18, scale: 2 }).notNull(), // 总负债（USD）
  netWorth: decimal("netWorth", { precision: 18, scale: 2 }).notNull(),           // 净资产（USD）
  snapshotAt: timestamp("snapshotAt").defaultNow().notNull(),
});

export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
export type InsertNetWorthSnapshot = typeof netWorthSnapshots.$inferInsert;

/**
 * 市场情绪历史表
 * 每次调用 getNewsFeed 时写入当日情绪分析结果，用于 7 日趋势图
 */
export const sentimentHistory = mysqlTable("sentiment_history", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(),          // YYYY-MM-DD
  score: int("score").notNull(),                             // 0-100 情绪指数
  label: varchar("label", { length: 20 }).notNull(),         // bullish / bearish / neutral
  articleCount: int("articleCount").notNull().default(0),    // 分析的新闻数量
  positiveCount: int("positiveCount").notNull().default(0),  // 正面新闻数
  negativeCount: int("negativeCount").notNull().default(0),  // 负面新闻数
  neutralCount: int("neutralCount").notNull().default(0),    // 中性新闻数
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SentimentHistory = typeof sentimentHistory.$inferSelect;
export type InsertSentimentHistory = typeof sentimentHistory.$inferInsert;

// ── LEVEL2C: Loop Telemetry Table ─────────────────────────────────────────────
export const loopTelemetry = mysqlTable("loop_telemetry", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  primaryTicker: varchar("primaryTicker", { length: 20 }).notNull().default(""),
  triggerType: varchar("triggerType", { length: 60 }).notNull(),
  triggerReason: text("triggerReason").notNull(),
  evidenceScoreAtTrigger: decimal("evidenceScoreAtTrigger", { precision: 5, scale: 3 }).notNull().default("0"),
  confidenceAtTrigger: varchar("confidenceAtTrigger", { length: 20 }).notNull().default(""),
  hypothesisCandidateCount: int("hypothesisCandidateCount").notNull().default(0),
  selectedHypothesisId: varchar("selectedHypothesisId", { length: 20 }).notNull().default(""),
  selectedFocusArea: varchar("selectedFocusArea", { length: 60 }).notNull().default(""),
  secondPassSuccess: int("secondPassSuccess").notNull().default(0),
  evidenceDelta: decimal("evidenceDelta", { precision: 5, scale: 3 }).notNull().default("0"),
  verdictChanged: int("verdictChanged").notNull().default(0),
  outputMode: varchar("outputMode", { length: 20 }).notNull().default(""),
  loopDurationMs: int("loopDurationMs").notNull().default(0),
  llmCallsUsed: int("llmCallsUsed").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LoopTelemetry = typeof loopTelemetry.$inferSelect;
export type InsertLoopTelemetry = typeof loopTelemetry.$inferInsert;

// ── LEVEL3A: Analysis Memory Table ────────────────────────────────────────────
export const analysisMemory = mysqlTable("analysis_memory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  taskType: varchar("taskType", { length: 40 }).notNull().default(""),
  verdict: varchar("verdict", { length: 20 }).notNull().default(""),
  confidenceLevel: varchar("confidenceLevel", { length: 20 }).notNull().default(""),
  evidenceScore: decimal("evidenceScore", { precision: 5, scale: 3 }).notNull().default("0"),
  bullCaseSummary: text("bullCaseSummary"),
  bearCaseSummary: text("bearCaseSummary"),
  keyUncertainty: text("keyUncertainty"),
  openHypotheses: text("openHypotheses"),
  outputMode: varchar("outputMode", { length: 20 }).notNull().default(""),
  loopRan: int("loopRan").notNull().default(0),
  taskId: int("taskId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AnalysisMemory = typeof analysisMemory.$inferSelect;
export type InsertAnalysisMemory = typeof analysisMemory.$inferInsert;

// ── LEVEL3B: Source Reliability Table ─────────────────────────────────────────
export const sourceReliability = mysqlTable("source_reliability", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sourceId: varchar("sourceId", { length: 40 }).notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull().default(""),
  taskType: varchar("taskType", { length: 40 }).notNull().default(""),
  dataPresent: int("dataPresent").notNull().default(0),
  dataUsed: int("dataUsed").notNull().default(0),
  fieldsCovered: int("fieldsCovered").notNull().default(0),
  evidenceContribution: decimal("evidenceContribution", { precision: 5, scale: 3 }).notNull().default("0"),
  latencyMs: int("latencyMs").notNull().default(0),
  errorOccurred: int("errorOccurred").notNull().default(0),
  taskId: int("taskId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SourceReliability = typeof sourceReliability.$inferSelect;
export type InsertSourceReliability = typeof sourceReliability.$inferInsert;

// ─── Radar Candidates (SELECT-stage candidate pool) ──────────────────────────
export const radarCandidates = mysqlTable("radar_candidates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  candidateId: varchar("candidateId", { length: 64 }).notNull(),   // radar item id
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  opportunityState: varchar("opportunityState", { length: 20 }).notNull().default("SELECT"),
  cycle: varchar("cycle", { length: 20 }).notNull().default("Mid"),
  confidence: int("confidence").notNull().default(50),
  whySurface: text("whySurface").notNull().default(""),
  whyTrend: text("whyTrend").notNull().default(""),
  whyHidden: text("whyHidden").notNull().default(""),
  riskSummary: text("riskSummary").notNull().default(""),
  relatedTickers: varchar("relatedTickers", { length: 255 }).notNull().default(""),  // comma-separated
  watchlistReady: int("watchlistReady").notNull().default(1),
  status: varchar("status", { length: 16 }).notNull().default("SELECT"),  // SELECT | WATCH | PROMOTED | PASS
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});
export type RadarCandidate = typeof radarCandidates.$inferSelect;
export type InsertRadarCandidate = typeof radarCandidates.$inferInsert;

// ─── Cycle Engine Cache (4h TTL macro cycle output) ─────────────────────────────────────────
export const cycleEngineCache = mysqlTable("cycle_engine_cache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cache_key", { length: 64 }).notNull().default("global"),
  stage: varchar("stage", { length: 32 }).notNull(),
  stageLabel: varchar("stage_label", { length: 32 }).notNull(),
  marketStyle: varchar("market_style", { length: 16 }).notNull(),
  marketStyleLabel: varchar("market_style_label", { length: 64 }).notNull(),
  sectorRotation: json("sector_rotation").notNull(),
  whySurface: text("why_surface").notNull(),
  whyTrend: text("why_trend").notNull(),
  whyHidden: text("why_hidden").notNull(),
  riskWarnings: json("risk_warnings").notNull(),
  confidence: int("confidence").notNull().default(0),
  dataSnapshot: json("data_snapshot").notNull(),
  generatedAt: bigintCol("generated_at", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type CycleEngineCache = typeof cycleEngineCache.$inferSelect;
export type InsertCycleEngineCache = typeof cycleEngineCache.$inferInsert;

// ─── Decision History (records each DecisionStrip output) ────────────────────
export const decisionHistory = mysqlTable("decision_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  ticker: varchar("ticker", { length: 32 }).notNull(),
  action: varchar("action", { length: 16 }).notNull(),
  state: varchar("state", { length: 64 }),
  timingSignal: text("timing_signal"),
  whySurface: text("why_surface"),
  whyTrend: text("why_trend"),
  whyHidden: text("why_hidden"),
  cycle: varchar("cycle", { length: 64 }),
  source: varchar("source", { length: 32 }).notNull().default("manual"),
  createdAt: bigintCol("created_at", { mode: "number" }).notNull(),
});
export type DecisionHistoryRow = typeof decisionHistory.$inferSelect;
export type InsertDecisionHistory = typeof decisionHistory.$inferInsert;

// ── LEVEL3 Memory Engine: memory_records ─────────────────────────────────────
export const memoryRecords = mysqlTable("memory_records", {
  id:               varchar("id", { length: 36 }).primaryKey(),
  ticker:           varchar("ticker", { length: 20 }).notNull(),
  userId:           varchar("user_id", { length: 36 }).notNull(),
  memoryType:       mysqlEnum("memory_type", ["action_record", "thesis_snapshot", "risk_flag", "catalyst_note"]).notNull(),
  // Level 1 fields
  action:           varchar("action", { length: 20 }),
  verdict:          text("verdict"),
  confidence:       varchar("confidence", { length: 20 }),
  evidenceScore:    decimal("evidence_score", { precision: 5, scale: 4 }),
  sourceQuery:      text("source_query"),
  tags:             json("tags").$type<string[]>(),
  // Reasoning-grade fields
  thesisCore:       text("thesis_core"),
  riskStructure:    json("risk_structure").$type<string[]>(),
  counterarguments: json("counterarguments").$type<string[]>(),
  failureModes:     json("failure_modes").$type<string[]>(),
  reasoningPattern: varchar("reasoning_pattern", { length: 60 }),
  scenarioType:     varchar("scenario_type", { length: 60 }),
  outcomeLabel:     mysqlEnum("outcome_label", ["success", "failure", "invalidated"]),
  // Memory influence flags
  affectsStep0:      boolean("affects_step0").notNull().default(false),
  affectsController: boolean("affects_controller").notNull().default(false),
  affectsRouting:    boolean("affects_routing").notNull().default(false),
  // LEVEL3.5 Evolution fields
  failureIntensityScore: decimal("failure_intensity_score", { precision: 5, scale: 4 }),
  successStrengthScore:  decimal("success_strength_score", { precision: 5, scale: 4 }),
  freshnessScore:        decimal("freshness_score", { precision: 5, scale: 4 }).notNull().default("1.0000"),
  changeLog:             json("change_log").$type<Array<{ ts: number; from: string | null; to: string; reason: string }>>(),
  // Lifecycle
  createdAt:        bigintCol("created_at", { mode: "number" }).notNull(),
  expiresAt:        bigintCol("expires_at", { mode: "number" }),
  isActive:         boolean("is_active").notNull().default(true),
  embeddingReady:   boolean("embedding_ready").notNull().default(false),
});
export type MemoryRecordRow = typeof memoryRecords.$inferSelect;
export type InsertMemoryRecord = typeof memoryRecords.$inferInsert;


// ─────────────────────────────────────────────────────────────────────────────
// DANTREE LEVEL4.1 — Execution Layer Persistence
// ─────────────────────────────────────────────────────────────────────────────

// watch_items: persisted WatchItem state
export const watchItems = mysqlTable("watch_items", {
  watchId:           varchar("watch_id", { length: 64 }).primaryKey(),
  userId:            varchar("user_id", { length: 64 }).notNull(),
  primaryTicker:     varchar("primary_ticker", { length: 20 }).notNull(),
  watchType:         varchar("watch_type", { length: 40 }).notNull(),
  watchStatus:       varchar("watch_status", { length: 20 }).notNull().default("active"),
  currentActionBias: varchar("current_action_bias", { length: 10 }).notNull().default("NONE"),
  thesisSummary:     text("thesis_summary").notNull(),
  riskConditions:    json("risk_conditions").$type<string[]>().default([]),
  triggerConditions: json("trigger_conditions").$type<unknown[]>().default([]),
  priority:          varchar("priority", { length: 20 }).notNull().default("medium"),
  linkedMemoryIds:   json("linked_memory_ids").$type<string[]>().default([]),
  linkedLoopIds:     json("linked_loop_ids").$type<string[]>().default([]),
  notes:             text("notes"),
  lastEvaluatedAt:   bigintCol("last_evaluated_at", { mode: "number" }),
  lastTriggeredAt:   bigintCol("last_triggered_at", { mode: "number" }),
  createdAt:         bigintCol("created_at", { mode: "number" }).notNull(),
  updatedAt:         bigintCol("updated_at", { mode: "number" }).notNull(),
});
export type WatchItemRow = typeof watchItems.$inferSelect;
export type InsertWatchItem = typeof watchItems.$inferInsert;

// watch_audit_log: append-only audit trail for all watch state transitions
export const watchAuditLog = mysqlTable("watch_audit_log", {
  auditId:     varchar("audit_id", { length: 64 }).primaryKey(),
  watchId:     varchar("watch_id", { length: 64 }).notNull(),
  eventType:   varchar("event_type", { length: 40 }).notNull(),
  fromStatus:  varchar("from_status", { length: 40 }),
  toStatus:    varchar("to_status", { length: 40 }),
  triggerId:   varchar("trigger_id", { length: 64 }),
  actionId:    varchar("action_id", { length: 64 }),
  payloadJson: json("payload_json").$type<Record<string, unknown>>(),
  createdAt:   bigintCol("created_at", { mode: "number" }).notNull(),
});
export type WatchAuditLogRow = typeof watchAuditLog.$inferSelect;
export type InsertWatchAuditLog = typeof watchAuditLog.$inferInsert;

// watch_alerts: persisted alerts with dedup/cooldown support
export const watchAlerts = mysqlTable("watch_alerts", {
  alertId:        varchar("alert_id", { length: 64 }).primaryKey(),
  watchId:        varchar("watch_id", { length: 64 }).notNull(),
  triggerId:      varchar("trigger_id", { length: 64 }),
  actionId:       varchar("action_id", { length: 64 }),
  severity:       varchar("severity", { length: 20 }).notNull(),
  title:          varchar("title", { length: 255 }).notNull(),
  message:        text("message").notNull(),
  workflowStatus: varchar("workflow_status", { length: 30 }).notNull().default("new"),
  cooldownKey:    varchar("cooldown_key", { length: 128 }).notNull(),
  schedulerRunId: varchar("scheduler_run_id", { length: 64 }),
  createdAt:      bigintCol("created_at", { mode: "number" }).notNull(),
});
export type WatchAlertRow = typeof watchAlerts.$inferSelect;
export type InsertWatchAlert = typeof watchAlerts.$inferInsert;

// watch_workflows: persisted workflow lifecycle tracking
export const watchWorkflows = mysqlTable("watch_workflows", {
  workflowId:     varchar("workflow_id", { length: 64 }).primaryKey(),
  watchId:        varchar("watch_id", { length: 64 }).notNull(),
  triggerId:      varchar("trigger_id", { length: 64 }),
  actionId:       varchar("action_id", { length: 64 }),
  workflowStep:   varchar("workflow_step", { length: 40 }).notNull().default("triggered"),
  status:         varchar("status", { length: 20 }).notNull().default("open"),
  summary:        text("summary"),
  schedulerRunId: varchar("scheduler_run_id", { length: 64 }),
  createdAt:      bigintCol("created_at", { mode: "number" }).notNull(),
  updatedAt:      bigintCol("updated_at", { mode: "number" }).notNull(),
});
export type WatchWorkflowRow = typeof watchWorkflows.$inferSelect;
export type InsertWatchWorkflow = typeof watchWorkflows.$inferInsert;

// scheduler_runs: audit log for every batch evaluation run
export const schedulerRuns = mysqlTable("scheduler_runs", {
  runId:          varchar("run_id", { length: 64 }).primaryKey(),
  startedAt:      bigintCol("started_at", { mode: "number" }).notNull(),
  finishedAt:     bigintCol("finished_at", { mode: "number" }),
  runStatus:      varchar("run_status", { length: 20 }).notNull().default("running"),
  watchesScanned: int("watches_scanned").notNull().default(0),
  triggersFired:  int("triggers_fired").notNull().default(0),
  actionsCreated: int("actions_created").notNull().default(0),
  alertsCreated:  int("alerts_created").notNull().default(0),
  errorsCount:    int("errors_count").notNull().default(0),
  abortedEarly:   boolean("aborted_early").notNull().default(false),
  dryRun:         boolean("dry_run").notNull().default(false),
  summaryJson:    json("summary_json").$type<Record<string, unknown>>(),
});
export type SchedulerRunRow = typeof schedulerRuns.$inferSelect;
export type InsertSchedulerRun = typeof schedulerRuns.$inferInsert;
