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
    description: "实时股价、历史 OHLCV、市值",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://finance.yahoo.com",
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
  },
  {
    id: "fmp",
    displayName: "FMP",
    category: "市场数据",
    icon: "💹",
    description: "财务报表、DCF 估值、分析师目标价",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "FMP_API_KEY",
    dataType: "structured",
    homepageUrl: "https://financialmodelingprep.com",
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
  },
  {
    id: "tiingo",
    displayName: "Tiingo",
    category: "市场数据",
    icon: "📉",
    description: "实时估值倍数（P/E、P/B、EV、PEG）",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "TIINGO_API_KEY",
    dataType: "structured",
    homepageUrl: "https://tiingo.com",
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
  },
  // ── 期权数据 ──────────────────────────────────────────────────────────
  {
    id: "polygon_options",
    displayName: "Polygon 期权链",
    category: "期权数据",
    icon: "⚡",
    description: "Put-Call Ratio、行权价分布、到期日",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "POLYGON_API_KEY",
    dataType: "structured",
    homepageUrl: "https://polygon.io/docs/options",
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
  },
  {
    id: "world_bank",
    displayName: "World Bank",
    category: "宏观指标",
    icon: "🌍",
    description: "全球 GDP、通胀、贸易、失业率",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://data.worldbank.org",
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
  },
  {
    id: "ecb",
    displayName: "ECB",
    category: "宏观指标",
    icon: "🇪🇺",
    description: "欧元区利率、通胀、汇率、货币供应量",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://data.ecb.europa.eu",
  },
  {
    id: "boe",
    displayName: "BoE",
    category: "宏观指标",
    icon: "🇬🇧",
    description: "英国基准利率、国债收益率、M4 货币",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://www.bankofengland.co.uk/statistics",
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
  },
  // ── 加密货币 ──────────────────────────────────────────────────────────
  {
    id: "coingecko",
    displayName: "CoinGecko",
    category: "加密货币",
    icon: "🪙",
    description: "实时价格、市值、趋势",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "COINGECKO_API_KEY",
    dataType: "structured",
    homepageUrl: "https://www.coingecko.com/en/api",
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
  },
  // ── 港股公告 ──────────────────────────────────────────────────────────
  {
    id: "hkex",
    displayName: "HKEXnews",
    category: "港股公告",
    icon: "📢",
    description: "港股公告、年报、监管文件",
    isWhitelisted: true,
    requiresApiKey: false,
    envKeyName: null,
    dataType: "structured",
    homepageUrl: "https://www.hkexnews.hk",
  },
  // ── 法律监管 ──────────────────────────────────────────────────────────
  {
    id: "court_listener",
    displayName: "CourtListener",
    category: "法律监管",
    icon: "⚖️",
    description: "美国法院诉讼、判决历史",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "COURTLISTENER_API_KEY",
    dataType: "structured",
    homepageUrl: "https://www.courtlistener.com",
  },
  {
    id: "congress",
    displayName: "Congress.gov",
    category: "法律监管",
    icon: "🏛",
    description: "美国立法动态、法案",
    isWhitelisted: true,
    requiresApiKey: true,
    envKeyName: "CONGRESS_API_KEY",
    dataType: "structured",
    homepageUrl: "https://api.congress.gov",
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
  },
  // ── 公司信息 ──────────────────────────────────────────────────────────
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
  },
  // ── 网页搜索 ──────────────────────────────────────────────────────────
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
