/**
 * dataStandardizer.ts — OpenBB 风格的数据标准化层
 *
 * 参考架构：
 *   - OpenBB Platform: https://github.com/OpenBB-finance/OpenBBTerminal
 *   - 统一所有 24+ API 接口的数据格式
 *   - 提供数据质量评分、智能融合、冲突解决
 *
 * 核心设计原则：
 *   1. 每个数据点都有来源、时间戳和质量分
 *   2. 多源数据通过加权融合，不简单丢弃
 *   3. 数据质量分影响 GPT 分析的置信度
 */

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type DataSourceId =
  | "yahoo_finance" | "finnhub" | "fmp" | "polygon" | "sec_edgar"
  | "alpha_vantage" | "local_indicators" | "coingecko" | "fred"
  | "world_bank" | "imf_weo" | "ecb" | "boe" | "hkma"
  | "news_api" | "marketaux" | "gdelt" | "tavily" | "serper"
  | "tiingo" | "simfin" | "alpaca" | "efinance" | "gleif"
  | "hkex" | "court_listener" | "congress" | "eur_lex";

export type DataCategory =
  | "price"           // 价格数据（当前价、历史价）
  | "fundamentals"    // 基本面（PE、PB、EPS、营收等）
  | "technical"       // 技术指标（RSI、MACD、BB等）
  | "macro"           // 宏观经济（GDP、CPI、利率等）
  | "news"            // 新闻情绪
  | "options"         // 期权数据
  | "filings"         // 监管文件（10-K、10-Q等）
  | "crypto"          // 加密货币
  | "etf"             // ETF 数据
  | "forex"           // 外汇
  | "legal"           // 法律/监管
  | "ownership"       // 持股结构
  | "analyst";        // 分析师评级

export interface StandardizedDataPoint {
  /** 字段标识符，如 "price.current"、"fundamentals.pe_ratio" */
  field: string;
  /** 字段值（数字、字符串或对象） */
  value: number | string | Record<string, unknown> | null;
  /** 数据来源 */
  sourceId: DataSourceId;
  /** 数据时间戳（Unix ms） */
  timestamp: number;
  /** 数据质量分 0-100 */
  quality: number;
  /** 数据分类 */
  category: DataCategory;
  /** 单位（如 "USD"、"%"、"亿元"） */
  unit?: string;
  /** 附加元数据 */
  meta?: Record<string, unknown>;
}

export interface FusedDataPoint {
  field: string;
  value: number | string | Record<string, unknown> | null;
  /** 融合后的质量分（加权平均） */
  quality: number;
  /** 参与融合的来源列表 */
  sources: Array<{ sourceId: DataSourceId; value: number | string | Record<string, unknown> | null; quality: number }>;
  /** 融合策略 */
  fusionStrategy: "latest" | "weighted_avg" | "consensus" | "single";
  /** 是否存在数据冲突 */
  hasConflict: boolean;
  /** 冲突描述（如有） */
  conflictNote?: string;
}

export interface StandardizedReport {
  /** 标的代码 */
  ticker: string;
  /** 报告生成时间 */
  generatedAt: number;
  /** 融合后的数据点 */
  data: Record<string, FusedDataPoint>;
  /** 总体数据质量分 */
  overallQuality: number;
  /** 数据覆盖率（已覆盖字段数 / 总字段数） */
  coverageRate: number;
  /** 数据源贡献统计 */
  sourceContributions: Record<string, number>;
  /** 数据质量摘要（供 GPT 参考） */
  qualitySummary: string;
}

// ── 数据源可靠性权重 ──────────────────────────────────────────────────────────

/**
 * 各数据源的基础可靠性权重（0-1）
 * 参考 OpenBB 的 provider 优先级设计
 */
const SOURCE_RELIABILITY: Record<DataSourceId, number> = {
  // 一级：官方/监管数据源
  sec_edgar:      0.98,
  fred:           0.97,
  ecb:            0.97,
  boe:            0.96,
  hkma:           0.96,
  world_bank:     0.95,
  imf_weo:        0.95,
  gleif:          0.94,
  congress:       0.94,
  court_listener: 0.93,
  eur_lex:        0.93,
  hkex:           0.93,

  // 二级：主流金融数据平台
  fmp:            0.90,
  polygon:        0.89,
  finnhub:        0.88,
  yahoo_finance:  0.87,
  alpha_vantage:  0.86,
  tiingo:         0.85,
  simfin:         0.84,
  alpaca:         0.83,

  // 三级：专项数据源
  coingecko:      0.88,  // 加密货币领域权威
  efinance:       0.80,  // A股数据
  local_indicators: 0.85, // 本地计算（无 API 误差）

  // 四级：新闻/情绪数据
  marketaux:      0.75,
  news_api:       0.72,
  gdelt:          0.70,
  tavily:         0.65,
  serper:         0.63,
};

// ── 字段分类映射 ──────────────────────────────────────────────────────────────

const FIELD_CATEGORY_MAP: Record<string, DataCategory> = {
  "price.current":        "price",
  "price.open":           "price",
  "price.high":           "price",
  "price.low":            "price",
  "price.close":          "price",
  "price.change":         "price",
  "price.change_pct":     "price",
  "price.52w_high":       "price",
  "price.52w_low":        "price",
  "price.volume":         "price",
  "price.avg_volume":     "price",
  "price.market_cap":     "price",

  "fundamentals.pe":      "fundamentals",
  "fundamentals.pb":      "fundamentals",
  "fundamentals.ps":      "fundamentals",
  "fundamentals.ev":      "fundamentals",
  "fundamentals.eps":     "fundamentals",
  "fundamentals.revenue": "fundamentals",
  "fundamentals.net_income": "fundamentals",
  "fundamentals.gross_margin": "fundamentals",
  "fundamentals.roe":     "fundamentals",
  "fundamentals.roa":     "fundamentals",
  "fundamentals.debt_equity": "fundamentals",
  "fundamentals.current_ratio": "fundamentals",
  "fundamentals.fcf":     "fundamentals",
  "fundamentals.dividend_yield": "fundamentals",

  "technical.rsi14":      "technical",
  "technical.macd":       "technical",
  "technical.ema20":      "technical",
  "technical.ema50":      "technical",
  "technical.sma200":     "technical",
  "technical.bb_upper":   "technical",
  "technical.bb_lower":   "technical",
  "technical.atr14":      "technical",
  "technical.adx14":      "technical",

  "macro.gdp":            "macro",
  "macro.cpi":            "macro",
  "macro.interest_rate":  "macro",
  "macro.unemployment":   "macro",
  "macro.m2":             "macro",

  "analyst.rating":       "analyst",
  "analyst.target_price": "analyst",
  "analyst.buy_count":    "analyst",
  "analyst.sell_count":   "analyst",

  "news.sentiment":       "news",
  "news.headline_count":  "news",

  "options.put_call_ratio": "options",
  "options.iv":           "options",

  "crypto.price":         "crypto",
  "crypto.market_cap":    "crypto",
  "crypto.dominance":     "crypto",
};

// ── 核心函数 ──────────────────────────────────────────────────────────────────

/**
 * 计算数据点质量分（0-100）
 * 综合考虑：来源可靠性 + 数据时效性 + 值有效性
 */
export function calcDataQuality(
  sourceId: DataSourceId,
  value: number | string | Record<string, unknown> | null,
  timestamp: number,
  maxAgeHours = 24
): number {
  // 1. 来源可靠性分（0-60）
  const reliability = SOURCE_RELIABILITY[sourceId] ?? 0.5;
  const reliabilityScore = reliability * 60;

  // 2. 数据时效性分（0-30）
  const ageMs = Date.now() - timestamp;
  const ageHours = ageMs / (1000 * 60 * 60);
  const freshnessScore = Math.max(0, 30 * (1 - ageHours / maxAgeHours));

  // 3. 值有效性分（0-10）
  let validityScore = 0;
  if (value !== null && value !== undefined) {
    if (typeof value === "number") {
      validityScore = isFinite(value) && !isNaN(value) ? 10 : 0;
    } else if (typeof value === "string") {
      validityScore = value.trim().length > 0 ? 8 : 0;
    } else if (typeof value === "object") {
      validityScore = Object.keys(value).length > 0 ? 9 : 0;
    }
  }

  return Math.round(reliabilityScore + freshnessScore + validityScore);
}

/**
 * 融合多个数据源的同一字段数据
 * 策略：
 *   - 数值型：加权平均（权重 = 质量分）
 *   - 字符串型：取质量分最高的
 *   - 对象型：深度合并，冲突字段取质量分高的
 */
export function fuseDataPoints(points: StandardizedDataPoint[]): FusedDataPoint {
  if (points.length === 0) {
    return {
      field: "",
      value: null,
      quality: 0,
      sources: [],
      fusionStrategy: "single",
      hasConflict: false,
    };
  }

  if (points.length === 1) {
    return {
      field: points[0].field,
      value: points[0].value,
      quality: points[0].quality,
      sources: [{ sourceId: points[0].sourceId, value: points[0].value, quality: points[0].quality }],
      fusionStrategy: "single",
      hasConflict: false,
    };
  }

  const sources = points.map(p => ({ sourceId: p.sourceId, value: p.value, quality: p.quality }));
  const totalQuality = points.reduce((s, p) => s + p.quality, 0);
  const avgQuality = Math.round(totalQuality / points.length);

  // 数值型：加权平均
  const numericPoints = points.filter(p => typeof p.value === "number" && isFinite(p.value as number));
  if (numericPoints.length > 0) {
    const weightedSum = numericPoints.reduce((s, p) => s + (p.value as number) * p.quality, 0);
    const weightSum = numericPoints.reduce((s, p) => s + p.quality, 0);
    const fusedValue = weightSum > 0 ? weightedSum / weightSum : null;

    // 检查冲突：最大值与最小值偏差 > 20%
    const values = numericPoints.map(p => p.value as number);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const hasConflict = minVal > 0 && (maxVal - minVal) / minVal > 0.20;

    return {
      field: points[0].field,
      value: fusedValue !== null ? parseFloat(fusedValue.toFixed(6)) : null,
      quality: avgQuality,
      sources,
      fusionStrategy: "weighted_avg",
      hasConflict,
      conflictNote: hasConflict
        ? `数值偏差 ${(((maxVal - minVal) / minVal) * 100).toFixed(1)}%（${minVal.toFixed(2)} ~ ${maxVal.toFixed(2)}）`
        : undefined,
    };
  }

  // 字符串型：取质量分最高的
  const stringPoints = points.filter(p => typeof p.value === "string");
  if (stringPoints.length > 0) {
    const best = stringPoints.reduce((a, b) => a.quality >= b.quality ? a : b);
    const allValues = new Set(stringPoints.map(p => p.value as string));
    return {
      field: points[0].field,
      value: best.value,
      quality: best.quality,
      sources,
      fusionStrategy: "consensus",
      hasConflict: allValues.size > 1,
      conflictNote: allValues.size > 1 ? `来源不一致：${Array.from(allValues).join(" / ")}` : undefined,
    };
  }

  // 最新优先（fallback）
  const latest = points.reduce((a, b) => a.timestamp >= b.timestamp ? a : b);
  return {
    field: points[0].field,
    value: latest.value,
    quality: latest.quality,
    sources,
    fusionStrategy: "latest",
    hasConflict: false,
  };
}

/**
 * 将多个 API 数据点集合标准化为统一报告
 * @param ticker 标的代码
 * @param rawPoints 原始数据点列表
 * @returns 标准化报告
 */
export function standardizeData(
  ticker: string,
  rawPoints: StandardizedDataPoint[]
): StandardizedReport {
  // 按字段分组
  const byField: Record<string, StandardizedDataPoint[]> = {};
  for (const point of rawPoints) {
    if (!byField[point.field]) byField[point.field] = [];
    byField[point.field].push(point);
  }

  // 融合每个字段
  const data: Record<string, FusedDataPoint> = {};
  for (const field of Object.keys(byField)) {
    data[field] = fuseDataPoints(byField[field]);
  }

  // 计算总体质量分
  const allQualities = Object.values(data).map(d => d.quality);
  const overallQuality = allQualities.length > 0
    ? Math.round(allQualities.reduce((s, q) => s + q, 0) / allQualities.length)
    : 0;

  // 计算覆盖率（相对于已知字段总数）
  const totalKnownFields = Object.keys(FIELD_CATEGORY_MAP).length;
  const coveredFields = Object.keys(data).length;
  const coverageRate = Math.min(1, coveredFields / totalKnownFields);

  // 数据源贡献统计
  const sourceContributions: Record<string, number> = {};
  for (const point of rawPoints) {
    sourceContributions[point.sourceId] = (sourceContributions[point.sourceId] ?? 0) + 1;
  }

  // 生成质量摘要
  const conflictFields = Object.entries(data)
    .filter(([, d]) => d.hasConflict)
    .map(([f]) => f);

  const qualitySummary = [
    `数据质量：${overallQuality}/100`,
    `字段覆盖：${coveredFields} 个字段（覆盖率 ${(coverageRate * 100).toFixed(0)}%）`,
    `数据来源：${Object.keys(sourceContributions).length} 个 API（${Object.entries(sourceContributions).map(([k, v]) => `${k}:${v}`).join(", ")}）`,
    conflictFields.length > 0 ? `数据冲突：${conflictFields.join(", ")}` : "无数据冲突",
  ].join("\n");

  return {
    ticker,
    generatedAt: Date.now(),
    data,
    overallQuality,
    coverageRate,
    sourceContributions,
    qualitySummary,
  };
}

/**
 * 从 Yahoo Finance 原始数据提取标准化数据点
 */
export function extractFromYahooFinance(
  ticker: string,
  raw: Record<string, unknown>
): StandardizedDataPoint[] {
  const now = Date.now();
  const points: StandardizedDataPoint[] = [];

  const addPoint = (field: string, value: number | string | null, unit?: string) => {
    if (value === null || value === undefined) return;
    const category = FIELD_CATEGORY_MAP[field] ?? "price";
    points.push({
      field,
      value,
      sourceId: "yahoo_finance",
      timestamp: now,
      quality: calcDataQuality("yahoo_finance", value, now),
      category,
      unit,
    });
  };

  // 价格数据
  if (raw.currentPrice) addPoint("price.current", raw.currentPrice as number, "USD");
  if (raw.open) addPoint("price.open", raw.open as number, "USD");
  if (raw.dayHigh) addPoint("price.high", raw.dayHigh as number, "USD");
  if (raw.dayLow) addPoint("price.low", raw.dayLow as number, "USD");
  if (raw.previousClose) addPoint("price.close", raw.previousClose as number, "USD");
  if (raw.volume) addPoint("price.volume", raw.volume as number);
  if (raw.averageVolume) addPoint("price.avg_volume", raw.averageVolume as number);
  if (raw.marketCap) addPoint("price.market_cap", raw.marketCap as number, "USD");
  if (raw.fiftyTwoWeekHigh) addPoint("price.52w_high", raw.fiftyTwoWeekHigh as number, "USD");
  if (raw.fiftyTwoWeekLow) addPoint("price.52w_low", raw.fiftyTwoWeekLow as number, "USD");

  // 基本面
  if (raw.trailingPE) addPoint("fundamentals.pe", raw.trailingPE as number);
  if (raw.priceToBook) addPoint("fundamentals.pb", raw.priceToBook as number);
  if (raw.priceToSalesTrailing12Months) addPoint("fundamentals.ps", raw.priceToSalesTrailing12Months as number);
  if (raw.enterpriseValue) addPoint("fundamentals.ev", raw.enterpriseValue as number, "USD");
  if (raw.trailingEps) addPoint("fundamentals.eps", raw.trailingEps as number, "USD");
  if (raw.totalRevenue) addPoint("fundamentals.revenue", raw.totalRevenue as number, "USD");
  if (raw.netIncomeToCommon) addPoint("fundamentals.net_income", raw.netIncomeToCommon as number, "USD");
  if (raw.grossMargins) addPoint("fundamentals.gross_margin", (raw.grossMargins as number) * 100, "%");
  if (raw.returnOnEquity) addPoint("fundamentals.roe", (raw.returnOnEquity as number) * 100, "%");
  if (raw.returnOnAssets) addPoint("fundamentals.roa", (raw.returnOnAssets as number) * 100, "%");
  if (raw.debtToEquity) addPoint("fundamentals.debt_equity", raw.debtToEquity as number);
  if (raw.currentRatio) addPoint("fundamentals.current_ratio", raw.currentRatio as number);
  if (raw.freeCashflow) addPoint("fundamentals.fcf", raw.freeCashflow as number, "USD");
  if (raw.dividendYield) addPoint("fundamentals.dividend_yield", (raw.dividendYield as number) * 100, "%");

  // 分析师
  if (raw.recommendationKey) addPoint("analyst.rating", raw.recommendationKey as string);
  if (raw.targetMeanPrice) addPoint("analyst.target_price", raw.targetMeanPrice as number, "USD");

  return points;
}

/**
 * 从本地技术指标提取标准化数据点
 */
export function extractFromLocalIndicators(
  ticker: string,
  raw: {
    rsi14?: (number | null)[];
    macdLine?: (number | null)[];
    macdSignal?: (number | null)[];
    ema20?: (number | null)[];
    ema50?: (number | null)[];
    sma200?: (number | null)[];
    bbUpper?: (number | null)[];
    bbLower?: (number | null)[];
    atr14?: (number | null)[];
    adx14?: (number | null)[];
  }
): StandardizedDataPoint[] {
  const now = Date.now();
  const points: StandardizedDataPoint[] = [];

  const lastValid = (arr?: (number | null)[]) => {
    if (!arr) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== null && arr[i] !== undefined && isFinite(arr[i]!)) return arr[i]!;
    }
    return null;
  };

  const addTech = (field: string, value: number | null) => {
    if (value === null) return;
    points.push({
      field,
      value,
      sourceId: "local_indicators",
      timestamp: now,
      quality: calcDataQuality("local_indicators", value, now),
      category: "technical",
    });
  };

  addTech("technical.rsi14", lastValid(raw.rsi14));
  addTech("technical.macd", lastValid(raw.macdLine));
  addTech("technical.ema20", lastValid(raw.ema20));
  addTech("technical.ema50", lastValid(raw.ema50));
  addTech("technical.sma200", lastValid(raw.sma200));
  addTech("technical.bb_upper", lastValid(raw.bbUpper));
  addTech("technical.bb_lower", lastValid(raw.bbLower));
  addTech("technical.atr14", lastValid(raw.atr14));
  addTech("technical.adx14", lastValid(raw.adx14));

  return points;
}

/**
 * 生成标准化报告的 Markdown 摘要（供 GPT 分析参考）
 */
export function formatStandardizedReport(report: StandardizedReport): string {
  const lines: string[] = [
    `## 数据标准化报告 — ${report.ticker}`,
    ``,
    `**数据质量评分：${report.overallQuality}/100**  |  **字段覆盖率：${(report.coverageRate * 100).toFixed(0)}%**`,
    ``,
    `### 数据质量摘要`,
    report.qualitySummary,
    ``,
  ];

  // 按分类分组展示
  const byCategory: Record<string, Array<[string, FusedDataPoint]>> = {};
  for (const [field, point] of Object.entries(report.data)) {
    const cat = FIELD_CATEGORY_MAP[field] ?? "price";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push([field, point]);
  }

  const catLabels: Record<string, string> = {
    price: "价格数据",
    fundamentals: "基本面",
    technical: "技术指标",
    macro: "宏观经济",
    news: "新闻情绪",
    options: "期权数据",
    filings: "监管文件",
    crypto: "加密货币",
    etf: "ETF",
    forex: "外汇",
    legal: "法律/监管",
    ownership: "持股结构",
    analyst: "分析师",
  };

  for (const cat of Object.keys(byCategory)) {
    const entries = byCategory[cat];
    lines.push(`### ${catLabels[cat] ?? cat}`);
    lines.push(`| 字段 | 値 | 质量分 | 来源 | 冲突 |`);
    lines.push(`|------|-----|--------|------|------|`);
    for (const [field, point] of entries) {
      const val = point.value !== null
        ? (typeof point.value === "number" ? point.value.toFixed(2) : String(point.value))
        : "N/A";
      const sources = point.sources.map((s: { sourceId: string }) => s.sourceId).join(", ");
      const conflict = point.hasConflict ? `⚠️ ${point.conflictNote ?? "冲突"}` : "✓";
      lines.push(`| ${field} | ${val} | ${point.quality} | ${sources} | ${conflict} |`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}
