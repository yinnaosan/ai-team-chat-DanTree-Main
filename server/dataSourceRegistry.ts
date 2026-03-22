/**
 * ============================================================
 * DATA SOURCE REGISTRY — 数据源统一注册表
 * ============================================================
 *
 * 这是整个平台的"事实总线"入口。
 *
 * ## 设计原则（来自 GPT 架构建议）
 * 1. Source Registry：所有白名单数据源在此注册，不在此注册的来源不得进入 AI 上下文
 * 2. Citation Builder：每次任务自动记录哪些 API 被调用、耗时、数据量、是否命中
 * 3. Source Gating：Step3 GPT 只能引用已命中的 API 数据，无数据时必须说"证据不足"
 * 4. 前端引用展示：citationSummary 写入 message metadata，前端自动展示数据来源卡片
 *
 * ## 新增数据源时，只需在此文件添加一条注册项，其余自动生效：
 * - Settings 页面状态面板
 * - Step2 Citation Tracker
 * - Step3 Source Gating 注入
 * - 前端 DataSourcesFooter 引用卡片
 *
 * ## 字段说明
 * - id: 唯一标识符（snake_case），与 routers.ts 中的变量名对应
 * - displayName: 前端展示名称
 * - category: 分类（与前端 CATEGORY_COLORS 对应）
 * - icon: 前端 emoji 图标
 * - description: 简短说明（展开时显示）
 * - isWhitelisted: 是否为白名单来源（白名单来源的数据 GPT 必须优先引用）
 * - requiresApiKey: 是否需要 API Key（false = 免费公开 API）
 * - envKeyName: 对应的环境变量名（用于健康检测）
 * - dataType: 数据类型（structured = 结构化数字/表格；web = 网页文本）
 */

export type DataSourceCategory =
  | "市场数据"
  | "技术分析"
  | "期权数据"
  | "宏观指标"
  | "新闻情绪"
  | "加密货币"
  | "A股数据"
  | "港股公告"
  | "法律监管"
  | "网页搜索"
  | "公司信息"
  | "其他";

export interface DataSourceDefinition {
  /** 唯一标识符（snake_case），与 routers.ts 中的 latencyMap key 对应 */
  id: string;
  /** 前端展示名称 */
  displayName: string;
  /** 分类（与前端 CATEGORY_COLORS 对应） */
  category: DataSourceCategory;
  /** 前端 emoji 图标 */
  icon: string;
  /** 简短说明（展开时显示） */
  description: string;
  /** 是否为白名单来源（GPT 必须优先引用） */
  isWhitelisted: boolean;
  /** 是否需要 API Key */
  requiresApiKey: boolean;
  /** 对应的环境变量名（无需 Key 时为 null） */
  envKeyName: string | null;
  /** 数据类型 */
  dataType: "structured" | "web";
  /** 官方文档/主页 URL（用于 Settings 页面链接） */
  homepageUrl?: string;
  /** 支持的数据字段（用于 Step2 字段级 fallback 路由） */
  supportsFields?: string[];
  /** 优先级：1=最高优先级（必调），5=最低优先级（备用） */
  priorityRank?: number;
  /** 置信权重：0.0-1.0，越高表示该来源数据对 evidenceScore 贡献越大 */
  confidenceWeight?: number;
  /** 成本分类：free=免费公开 | freemium=免费有限额 | paid=付费 Key */
  costClass?: "free" | "freemium" | "paid";
  /** 字段优先级分层：blocking=必须有（无则降级）| important=重要（无则降信）| optional=可选（无则忽略） */
  fieldPriority?: "blocking" | "important" | "optional";
}

/**
 * 所有数据源的唯一注册表。
 * 新增数据源时，在此数组末尾追加一条记录即可。
 */
export const DATA_SOURCE_REGISTRY: DataSourceDefinition[] = [
  // ── 市场数据 ──────────────────────────────────────────────────────────
  {
    id: "yahoo_finance",
    displayName: "Yahoo Finance",
    category: "市场数据",
    icon: "📈",
    description: "实时股价、历史 OHLCV、市値",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://finance.yahoo.com",
    supportsFields: ["price.current", "price.history", "market_cap", "volume", "52w_high", "52w_low"],
    priorityRank: 1,
    confidenceWeight: 0.95,
    costClass: "free",
    fieldPriority: "blocking",
  },
  {
    id: "finnhub",
    displayName: "Finnhub",
    category: "市场数据",
    icon: "📊",
    description: "实时报价、分析师评级、内部交易",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "FINNHUB_API_KEY",
    dataType: "structured",
    homepageUrl: "https://finnhub.io",
    supportsFields: ["price.current", "analyst.rating", "analyst.target_price", "insider_trading", "earnings.eps"],
    priorityRank: 1,
    confidenceWeight: 0.90,
    costClass: "freemium",
    fieldPriority: "important",
  },
  {
    id: "fmp",
    displayName: "FMP",
    category: "市场数据",
    icon: "💹",
    description: "财务报表、DCF 估値、分析师目标价",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "FMP_API_KEY",
    dataType: "structured",
    homepageUrl: "https://financialmodelingprep.com",
    supportsFields: ["valuation.pe", "valuation.pb", "valuation.ev", "valuation.peg", "financials.income", "financials.balance", "financials.cashflow", "dcf", "analyst.target_price"],
    priorityRank: 1,
    confidenceWeight: 0.92,
    costClass: "freemium",
    fieldPriority: "blocking",
  },
  {
    id: "polygon",
    displayName: "Polygon.io",
    category: "市场数据",
    icon: "🔷",
    description: "市场快照、近期走势、新闻情绪",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "POLYGON_API_KEY",
    dataType: "structured",
    homepageUrl: "https://polygon.io",
    supportsFields: ["price.current", "price.history", "volume", "news.sentiment"],
    priorityRank: 2,
    confidenceWeight: 0.88,
    costClass: "freemium",
    fieldPriority: "important",
  },
  {
    id: "tiingo",
    displayName: "Tiingo",
    category: "市场数据",
    icon: "📉",
    description: "实时估値倍数（P/E、P/B、EV、PEG）",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "TIINGO_API_KEY",
    dataType: "structured",
    homepageUrl: "https://tiingo.com",
    supportsFields: ["valuation.pe", "valuation.pb", "valuation.ev", "valuation.peg", "price.current"],
    priorityRank: 2,
    confidenceWeight: 0.88,
    costClass: "freemium",
    fieldPriority: "important",
  },
  {
    id: "simfin",
    displayName: "SimFin",
    category: "市场数据",
    icon: "🏦",
    description: "财务报表、衍生指标、季度趋势",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "SIMFIN_API_KEY",
    dataType: "structured",
    homepageUrl: "https://simfin.com",
    supportsFields: ["financials.income", "financials.balance", "financials.cashflow", "valuation.pe", "earnings.eps"],
    priorityRank: 2,
    confidenceWeight: 0.85,
    costClass: "freemium",
    fieldPriority: "optional",
  },
  {
    id: "sec_edgar",
    displayName: "SEC EDGAR",
    category: "市场数据",
    icon: "📋",
    description: "XBRL 财务数据、年报、季报、8-K",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://data.sec.gov",
    supportsFields: ["financials.income", "financials.balance", "financials.cashflow", "filings.10k", "filings.10q", "filings.8k"],
    priorityRank: 1,
    confidenceWeight: 0.98,
    costClass: "free",
    fieldPriority: "blocking",
  },
  // ── 技术分析 ──────────────────────────────────────────────────────────
  {
    id: "alpha_vantage_tech",
    displayName: "Alpha Vantage 技术指标",
    category: "技术分析",
    icon: "📐",
    description: "RSI、布林带、EMA、SMA、随机指标",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "ALPHA_VANTAGE_API_KEY",
    dataType: "structured",
    homepageUrl: "https://www.alphavantage.co",
    supportsFields: ["technical.rsi", "technical.bollinger", "technical.ema", "technical.sma", "technical.stochastic", "technical.macd"],
    priorityRank: 2,
    confidenceWeight: 0.85,
    costClass: "freemium",
    fieldPriority: "optional",
  },
  // ── 期权数据 ──────────────────────────────────────────────────────────
  {
    id: "polygon_options",
    costClass: "freemium",
    fieldPriority: "optional",
    displayName: "Polygon 期权链",
    category: "期权数据",
    icon: "⚡",
    description: "Put-Call Ratio、行权价分布、到期日",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "POLYGON_API_KEY",
    dataType: "structured",
    homepageUrl: "https://polygon.io/docs/options",
    supportsFields: ["options.put_call_ratio", "options.open_interest", "options.implied_volatility"],
    priorityRank: 3,
    confidenceWeight: 0.80,
  },
  // ── 宏观指标 ──────────────────────────────────────────────────────────
  {
    id: "fred",
    displayName: "FRED",
    category: "宏观指标",
    icon: "🏛️",
    description: "美联储利率、CPI、失业率、GDP",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "FRED_API_KEY",
    dataType: "structured",
    homepageUrl: "https://fred.stlouisfed.org",
    supportsFields: ["macro.interest_rate", "macro.cpi", "macro.unemployment", "macro.gdp", "macro.yield_curve"],
    priorityRank: 1,
    confidenceWeight: 0.98,
    costClass: "freemium",
    fieldPriority: "important",
  },
  {
    id: "world_bank",
    displayName: "World Bank",
    category: "宏观指标",
    icon: "🌍",
    description: "全球 GDP、通辀、贸易、失业率",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://data.worldbank.org",
    supportsFields: ["macro.gdp", "macro.inflation", "macro.trade", "macro.unemployment"],
    priorityRank: 2,
    confidenceWeight: 0.90,
    costClass: "free",
    fieldPriority: "optional",
  },
  {
    id: "imf_weo",
    displayName: "IMF WEO",
    category: "宏观指标",
    icon: "💱",
    description: "IMF 世界经济展望，含预测数据",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://imf.org/en/Publications/WEO",
    supportsFields: ["macro.gdp_forecast", "macro.inflation_forecast", "macro.current_account"],
    priorityRank: 2,
    confidenceWeight: 0.88,
    costClass: "free",
    fieldPriority: "optional",
  },
  {
    id: "ecb",
    displayName: "ECB",
    category: "宏观指标",
    icon: "🇪🇺",
    description: "欧元区利率、通辀、汇率、货币供应量",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://data.ecb.europa.eu",
    supportsFields: ["macro.interest_rate", "macro.inflation", "macro.exchange_rate", "macro.money_supply"],
    priorityRank: 2,
    confidenceWeight: 0.90,
    costClass: "free",
    fieldPriority: "optional",
  },
  {
    id: "boe",
    displayName: "BoE",
    category: "宏观指标",
    icon: "🇬🇧",
    description: "英国基准利率、国市收益率、M4 货币",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://www.bankofengland.co.uk/statistics",
    supportsFields: ["macro.interest_rate", "macro.bond_yield", "macro.money_supply"],
    priorityRank: 3,
    confidenceWeight: 0.88,
    costClass: "free",
    fieldPriority: "optional",
  },
  {
    id: "hkma",
    displayName: "HKMA",
    category: "宏观指标",
    icon: "🇭🇰",
    description: "港元利率、货币供应量、外汇储备",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://api.hkma.gov.hk",
    supportsFields: ["macro.interest_rate", "macro.money_supply", "macro.fx_reserves"],
    priorityRank: 3,
    confidenceWeight: 0.85,
    costClass: "free",
    fieldPriority: "optional",
  },
  {
    id: "alpha_vantage_econ",
    displayName: "Alpha Vantage 宏观",
    category: "宏观指标",
    icon: "📊",
    description: "利率、CPI、失业率、汇率（AV 宏观）",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "ALPHA_VANTAGE_API_KEY",
    dataType: "structured",
    homepageUrl: "https://www.alphavantage.co/documentation/#economic-indicators",
    supportsFields: ["macro.interest_rate", "macro.cpi", "macro.unemployment", "macro.exchange_rate"],
    priorityRank: 3,
    confidenceWeight: 0.82,
    costClass: "freemium",
    fieldPriority: "optional",
  },
  // ── 新闻情绪 ──────────────────────────────────────────────────────────
  {
    id: "news_api",
    displayName: "NewsAPI",
    category: "新闻情绪",
    icon: "📰",
    description: "全球新闻搜索、头条",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "NEWS_API_KEY",
    dataType: "structured",
    homepageUrl: "https://newsapi.org",
    supportsFields: ["news.headlines", "news.articles"],
    priorityRank: 2,
    confidenceWeight: 0.75,
    costClass: "freemium",
    fieldPriority: "important",
  },
  {
    id: "marketaux",
    displayName: "Marketaux",
    category: "新闻情绪",
    icon: "💬",
    description: "金融新闻情绪评分、实体识别",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "MARKETAUX_API_KEY",
    dataType: "structured",
    homepageUrl: "https://www.marketaux.com",
    supportsFields: ["news.sentiment_score", "news.entity_mentions", "news.articles"],
    priorityRank: 2,
    confidenceWeight: 0.78,
    costClass: "freemium",
    fieldPriority: "optional",
  },
  {
    id: "gdelt",
    displayName: "GDELT",
    category: "新闻情绪",
    icon: "🌐",
    description: "全球事件、地缘风险、新闻情绪",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://www.gdeltproject.org",
    supportsFields: ["news.geopolitical_risk", "news.event_tone", "news.articles"],
    priorityRank: 3,
    confidenceWeight: 0.72,
    costClass: "free",
    fieldPriority: "optional",
  },
  // ── 加密货币 ──────────────────────────────────────────────────────────────────
  {
    id: "coingecko",
    displayName: "CoinGecko",
    category: "加密货币",
    icon: "🪙",
    description: "实时价格、市値、趋势",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "COINGECKO_API_KEY",
    dataType: "structured",
    homepageUrl: "https://www.coingecko.com/en/api",
    supportsFields: ["crypto.price", "crypto.market_cap", "crypto.volume", "crypto.dominance"],
    priorityRank: 1,
    confidenceWeight: 0.90,
    costClass: "freemium",
    fieldPriority: "blocking",
  },
  // ── A股数据 ──────────────────────────────────────────────────────────
  {
    id: "baostock",
    displayName: "Baostock",
    category: "A股数据",
    icon: "🇨🇳",
    description: "A 股历史行情、财务指标",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "http://baostock.com",
    supportsFields: ["price.history", "financials.income", "valuation.pe"],
    priorityRank: 2,
    confidenceWeight: 0.80,
    costClass: "free",
    fieldPriority: "important",
  },
  // ── 港股公告 ──────────────────────────────────────────────────────────────────
  {
    id: "hkex",
    costClass: "free",
    fieldPriority: "important",
    displayName: "HKEXnews",
    category: "港股公告",
    icon: "📢",
    description: "港股公告、年报、监管文件",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://www.hkexnews.hk",
    supportsFields: ["filings.annual_report", "filings.announcements", "filings.regulatory"],
    priorityRank: 2,
    confidenceWeight: 0.85,
  },
  // ── 法律监管 ──────────────────────────────────────────────────────────────────
  {
    id: "court_listener",
    displayName: "CourtListener",
    category: "法律监管",
    icon: "⚖️",
    description: "美国法院诉证、判决历史",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "COURTLISTENER_API_KEY",
    dataType: "structured",
    homepageUrl: "https://www.courtlistener.com",
    supportsFields: ["legal.court_cases", "legal.rulings"],
    priorityRank: 3,
    confidenceWeight: 0.88,
    costClass: "free",
    fieldPriority: "optional",
  },
  {
    id: "congress",
    displayName: "Congress.gov",
    category: "法律监管",
    icon: "🏑",
    description: "美国立法动态、法案",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "CONGRESS_API_KEY",
    dataType: "structured",
    homepageUrl: "https://api.congress.gov",
    supportsFields: ["legal.bills", "legal.legislation_status"],
    priorityRank: 3,
    confidenceWeight: 0.85,
    costClass: "freemium",
    fieldPriority: "optional",
  },
  {
    id: "eur_lex",
    displayName: "EUR-Lex",
    category: "法律监管",
    icon: "📜",
    description: "欧盟法规、MiCA、GDPR 等监管文件",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://eur-lex.europa.eu",
    supportsFields: ["legal.eu_regulations", "legal.directives"],
    priorityRank: 3,
    confidenceWeight: 0.88,
    costClass: "free",
    fieldPriority: "optional",
  },
  // ── 公司信息 ──────────────────────────────────────────────────────────────────
  {
    id: "gleif",
    displayName: "GLEIF",
    category: "公司信息",
    icon: "🏢",
    description: "全球 LEI 法人识别码、母子公司关系",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://www.gleif.org",
    supportsFields: ["company.lei", "company.parent_child", "company.legal_name"],
    priorityRank: 3,
    confidenceWeight: 0.82,
    costClass: "free",
    fieldPriority: "optional",
  },
  // ── 网页搜索 ──────────────────────────────────────────────────────────────────
  {
    id: "tavily",
    displayName: "Tavily 搜索",
    category: "网页搜索",
    icon: "🔍",
    description: "实时网页搜索（限白名单域名）",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "TAVILY_API_KEY",
    dataType: "web",
    homepageUrl: "https://tavily.com",
    supportsFields: ["web.search_results", "web.article_content"],
    priorityRank: 2,
    confidenceWeight: 0.65,
    costClass: "freemium",
    fieldPriority: "optional",
  },
];

// ── 便捷查询函数 ──────────────────────────────────────────────────────────────

/** 通过 id 查找注册项 */
export function getDataSourceById(id: string): DataSourceDefinition | undefined {
  return DATA_SOURCE_REGISTRY.find(d => d.id === id);
}

/** 获取所有白名单数据源 */
export function getWhitelistedSources(): DataSourceDefinition[] {
  return DATA_SOURCE_REGISTRY.filter(d => d.isWhitelisted);
}

/** 获取某分类下的所有数据源 */
export function getSourcesByCategory(category: DataSourceCategory): DataSourceDefinition[] {
  return DATA_SOURCE_REGISTRY.filter(d => d.category === category);
}

// ── Citation Tracker ──────────────────────────────────────────────────────────

export interface CitationEntry {
  /** 数据源 id（对应注册表） */
  sourceId: string;
  /** 数据源显示名称 */
  displayName: string;
  /** 分类 */
  category: DataSourceCategory;
  /** emoji 图标 */
  icon: string;
  /** 简短说明 */
  description: string;
  /** 是否命中（有数据返回） */
  hit: boolean;
  /** 调用耗时（毫秒），-1 表示未调用 */
  latencyMs: number;
  /** 数据摘要（前 200 字，用于 Step3 Source Gating 注入） */
  dataSummary: string;
  /** 是否为白名单来源 */
  isWhitelisted: boolean;
  /** 数据时间戳（API 返回的最新数据时间，如 "2026-02-01"） */
  dataTimestamp?: string;
}

export interface CitationSummary {
  /** 本次任务实际命中的数据源列表 */
  citations: CitationEntry[];
  /** 命中数量 */
  hitCount: number;
  /** 未命中数量（调用了但无数据） */
  missCount: number;
  /** 未调用数量 */
  skippedCount: number;
  /** 总调用耗时（毫秒） */
  totalLatencyMs: number;
  /** 是否有足够证据回答（至少 1 个白名单来源命中） */
  hasEvidenceToBasis: boolean;
  /** 用于 Step3 Source Gating 的注入文本 */
  sourcingBlock: string;
}

/**
 * 构建 CitationSummary
 *
 * @param results - 每个 API 的调用结果：{ sourceId, data, latencyMs }
 * @returns CitationSummary
 *
 * 用法（在 routers.ts Step2 完成后调用）：
 * ```ts
 * const citation = buildCitationSummary([
 *   { sourceId: "yahoo_finance", data: stockMarkdown, latencyMs: latencyMap.get("Yahoo Finance") ?? -1 },
 *   { sourceId: "fred", data: macroMarkdown, latencyMs: latencyMap.get("FRED") ?? -1 },
 *   ...
 * ]);
 * ```
 */
export function buildCitationSummary(
  results: Array<{ sourceId: string; data: string; latencyMs: number }>
): CitationSummary {
  const citations: CitationEntry[] = [];

  for (const r of results) {
    const def = getDataSourceById(r.sourceId);
    if (!def) continue; // 未注册的来源不进入 citation

    const hit = r.data.trim().length > 0;
    citations.push({
      sourceId: r.sourceId,
      displayName: def.displayName,
      category: def.category,
      icon: def.icon,
      description: def.description,
      hit,
      latencyMs: r.latencyMs,
      dataSummary: hit ? r.data.slice(0, 200) : "",
      isWhitelisted: def.isWhitelisted,
      dataTimestamp: extractDataTimestamp(r.data),
    });
  }

  const hitEntries = citations.filter(c => c.hit);
  const missEntries = citations.filter(c => !c.hit && c.latencyMs >= 0);
  const skippedEntries = citations.filter(c => c.latencyMs < 0);
  const totalLatencyMs = citations.reduce((sum, c) => sum + Math.max(0, c.latencyMs), 0);
  const hasEvidenceToBasis = hitEntries.some(c => c.isWhitelisted);

  // 构建 Source Gating 注入文本（注入 Step3 GPT prompt）
  const sourcingBlock = buildSourcingBlock(hitEntries, hasEvidenceToBasis);

  return {
    citations,
    hitCount: hitEntries.length,
    missCount: missEntries.length,
    skippedCount: skippedEntries.length,
    totalLatencyMs,
    hasEvidenceToBasis,
    sourcingBlock,
  };
}

/**
 * 从数据文本中提取最新数据时间戳（尽力匹配，失败返回 undefined）
 */
function extractDataTimestamp(data: string): string | undefined {
  // 匹配常见日期格式：2026-02-01 / 2026年2月1日 / as of 2026-02 / 截至 2026-02
  const patterns = [
    /截至\s*(\d{4}[-年]\d{1,2}[-月]\d{0,2})/,
    /as of\s+(\d{4}-\d{2}-\d{2})/i,
    /date[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{4}年\d{1,2}月)/,
  ];
  for (const p of patterns) {
    const m = data.match(p);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * 构建 Source Gating 注入文本
 * 这段文本将被注入 Step3 GPT prompt，强制 GPT 只引用已命中的来源
 */
function buildSourcingBlock(hitEntries: CitationEntry[], hasEvidence: boolean): string {
  if (hitEntries.length === 0) {
    return `[SOURCE_GATING|CRITICAL]
本次任务未从任何白名单 API 获取到数据。
⛔ 严禁使用训练记忆中的任何数字、价格、财务数据、宏观指标。
✅ 唯一允许的回复：明确告知用户"当前无法获取实时数据，请稍后重试"。
禁止输出任何具体数字或分析结论。`;
  }

  const sourceList = hitEntries
    .map(c => `  • [${c.displayName}]（${c.category}）${c.dataTimestamp ? `数据截至 ${c.dataTimestamp}` : ""}`)
    .join("\n");

  const gatingRule = hasEvidence
    ? `✅ 已获取 ${hitEntries.length} 个白名单数据源的实时数据，可以回答。`
    : `⚠️ 已获取数据但均非白名单来源，请在回复中标注数据来源的可信度。`;

  return `[SOURCE_GATING|MANDATORY]
今日日期：${new Date().toLocaleDateString("zh-CN")}
${gatingRule}

本次任务实际命中的数据源（仅可引用以下来源的数据）：
${sourceList}

⛔ 严禁规则（违反即为错误回复）：
1. 禁止引用未在上述列表中的数据来源
2. 禁止用训练记忆补充任何具体数字（价格、PE、营收、利率等）
3. 禁止声称"根据最新数据"但实际引用的是训练记忆
4. 如某指标在上述来源中未找到 → 明确写"[数据缺失：${'{'}指标名{'}'}]"，不得猜测
5. 每个核心数据点必须标注来源，格式：数值（来源：[API名称]，截至 YYYY-MM-DD）`;
}

/**
 * 将 CitationSummary 转换为前端 ApiSource[] 格式（用于 message metadata）
 */
export function citationToApiSources(summary: CitationSummary): Array<{
  name: string;
  category: string;
  icon: string;
  description: string;
  latencyMs: number;
}> {
  return summary.citations
    .filter(c => c.hit)
    .map(c => ({
      name: c.displayName,
      category: c.category,
      icon: c.icon,
      description: c.description + (c.dataTimestamp ? ` · ${c.dataTimestamp}` : ""),
      latencyMs: c.latencyMs,
    }));
}


// ════════════════════════════════════════════════════════════════════════
// FIELD_FALLBACK_MAP — 字段级降级链
// ════════════════════════════════════════════════════════════════════════
// 每个字段定义一条有序的数据源降级链（按 priorityRank 排列）。
// Step2 检索引擎按此链逐源尝试，命中即停，不再浪费后续 API 调用。
// priority: blocking=必须有（无则整体降级）| important=重要（无则降信）| optional=可选
// ════════════════════════════════════════════════════════════════════════

export type FieldPriority = "blocking" | "important" | "optional";

export interface FieldFallbackEntry {
  /** 字段标识（与 supportsFields 中的值对应） */
  field: string;
  /** 字段优先级 */
  priority: FieldPriority;
  /** 有序降级链：按优先级排列的数据源 ID 列表 */
  sources: string[];
}

export const FIELD_FALLBACK_MAP: FieldFallbackEntry[] = [
  // ── Blocking 字段（缺失则整体降级为 framework_only）──────────────
  {
    field: "price.current",
    priority: "blocking",
    sources: ["yahoo_finance", "finnhub", "polygon", "tiingo", "fmp"],
  },
  {
    field: "valuation.pe",
    priority: "blocking",
    sources: ["fmp", "tiingo", "simfin", "yahoo_finance"],
  },
  {
    field: "financials.income",
    priority: "blocking",
    sources: ["fmp", "sec_edgar", "simfin"],
  },

  // ── Important 字段（缺失则降低 evidenceScore）──────────────────
  {
    field: "valuation.pb",
    priority: "important",
    sources: ["fmp", "tiingo", "simfin"],
  },
  {
    field: "valuation.ev",
    priority: "important",
    sources: ["fmp", "tiingo"],
  },
  {
    field: "valuation.peg",
    priority: "important",
    sources: ["fmp", "tiingo"],
  },
  {
    field: "analyst.rating",
    priority: "important",
    sources: ["finnhub", "fmp"],
  },
  {
    field: "analyst.target_price",
    priority: "important",
    sources: ["finnhub", "fmp"],
  },
  {
    field: "earnings.eps",
    priority: "important",
    sources: ["finnhub", "fmp", "simfin"],
  },
  {
    field: "financials.balance",
    priority: "important",
    sources: ["fmp", "sec_edgar", "simfin"],
  },
  {
    field: "financials.cashflow",
    priority: "important",
    sources: ["fmp", "sec_edgar", "simfin"],
  },
  {
    field: "market_cap",
    priority: "important",
    sources: ["yahoo_finance", "fmp", "polygon"],
  },
  {
    field: "news.sentiment",
    priority: "important",
    sources: ["news_api", "marketaux", "gdelt", "polygon"],
  },
  {
    field: "macro.gdp",
    priority: "important",
    sources: ["fred", "world_bank", "imf_weo"],
  },
  {
    field: "macro.cpi",
    priority: "important",
    sources: ["fred", "world_bank", "ecb"],
  },
  {
    field: "macro.interest_rate",
    priority: "important",
    sources: ["fred", "ecb", "boe", "hkma"],
  },

  // ── Optional 字段（缺失不影响结论）──────────────────────────────
  {
    field: "insider_trading",
    priority: "optional",
    sources: ["finnhub"],
  },
  {
    field: "volume",
    priority: "optional",
    sources: ["yahoo_finance", "polygon"],
  },
  {
    field: "52w_high",
    priority: "optional",
    sources: ["yahoo_finance"],
  },
  {
    field: "52w_low",
    priority: "optional",
    sources: ["yahoo_finance"],
  },
  {
    field: "price.history",
    priority: "optional",
    sources: ["yahoo_finance", "polygon", "tiingo"],
  },
  {
    field: "dcf",
    priority: "optional",
    sources: ["fmp"],
  },
  {
    field: "options.put_call_ratio",
    priority: "optional",
    sources: ["polygon_options"],
  },
  {
    field: "technical.rsi",
    priority: "optional",
    sources: ["alpha_vantage_tech"],
  },
  {
    field: "technical.ema",
    priority: "optional",
    sources: ["alpha_vantage_tech"],
  },
  {
    field: "technical.bollinger",
    priority: "optional",
    sources: ["alpha_vantage_tech"],
  },
  {
    field: "filings.10k",
    priority: "optional",
    sources: ["sec_edgar"],
  },
  {
    field: "filings.10q",
    priority: "optional",
    sources: ["sec_edgar"],
  },
  {
    field: "filings.8k",
    priority: "optional",
    sources: ["sec_edgar"],
  },
  {
    field: "crypto.price",
    priority: "blocking",
    sources: ["coingecko"],
  },
  {
    field: "crypto.market_cap",
    priority: "important",
    sources: ["coingecko"],
  },
  {
    field: "macro.employment",
    priority: "optional",
    sources: ["fred", "world_bank"],
  },
  {
    field: "legal.cases",
    priority: "optional",
    sources: ["court_listener"],
  },
  {
    field: "legal.legislation",
    priority: "optional",
    sources: ["congress", "eur_lex"],
  },
];

/**
 * 根据 required_fields 列表，返回需要调用的数据源 ID 集合（去重）。
 * 按 FIELD_FALLBACK_MAP 的降级链，只取每个字段链中第一个可用的源。
 * @param requiredFields Step1 输出的 required_fields 列表
 * @param availableSources 当前可用的数据源 ID 集合（健康检测 active/degraded 的源）
 * @returns 需要调用的数据源 ID 集合 + 字段覆盖情况
 */
export function resolveFieldSources(
  requiredFields: string[],
  availableSources: Set<string>
): {
  sourcesToCall: Set<string>;
  fieldCoverage: Array<{ field: string; priority: FieldPriority; resolvedSource: string | null }>;
} {
  const sourcesToCall = new Set<string>();
  const fieldCoverage: Array<{ field: string; priority: FieldPriority; resolvedSource: string | null }> = [];

  for (const fieldName of requiredFields) {
    const entry = FIELD_FALLBACK_MAP.find(f => f.field === fieldName);
    if (!entry) {
      // 未在 fallback map 中注册的字段，跳过
      fieldCoverage.push({ field: fieldName, priority: "optional", resolvedSource: null });
      continue;
    }

    let resolved: string | null = null;
    for (const sourceId of entry.sources) {
      if (availableSources.has(sourceId)) {
        sourcesToCall.add(sourceId);
        resolved = sourceId;
        break; // 命中即停
      }
    }
    fieldCoverage.push({ field: fieldName, priority: entry.priority, resolvedSource: resolved });
  }

  return { sourcesToCall, fieldCoverage };
}

/**
 * 从 fieldCoverage 中提取缺失字段分层统计
 */
export function classifyMissingFields(
  fieldCoverage: Array<{ field: string; priority: FieldPriority; resolvedSource: string | null }>
): {
  missingBlocking: string[];
  missingImportant: string[];
  missingOptional: string[];
} {
  const missingBlocking: string[] = [];
  const missingImportant: string[] = [];
  const missingOptional: string[] = [];

  for (const fc of fieldCoverage) {
    if (fc.resolvedSource !== null) continue;
    switch (fc.priority) {
      case "blocking": missingBlocking.push(fc.field); break;
      case "important": missingImportant.push(fc.field); break;
      case "optional": missingOptional.push(fc.field); break;
    }
  }

  return { missingBlocking, missingImportant, missingOptional };
}
