/**
 * ============================================================
 * DATA ROUTING MATRIX v1 — DanTree Phase 1
 * ============================================================
 *
 * 这是 DanTree 数据路由的唯一权威配置文件。
 *
 * 规则：
 * 1. 本文件只定义路由层级和优先级，不执行任何 API 调用
 * 2. 每层按 Primary → Backup → Backup2 顺序尝试
 * 3. 全部失败 → 标记 unavailable
 * 4. 只有 active + valid data 的 provider 参与 evidenceScore
 *
 * 禁止：
 * - Tavily / Serper / Web search / Scraping
 * - TradingView / 富途 / iFinD / Tushare / efinance / AKShare / Ashare
 * - 新增未经批准的 API
 */

// ── Provider 状态枚举 ──────────────────────────────────────────────────────────
export type ProviderStatus =
  | "active"        // key 有效，API 正常响应
  | "missing_key"   // 环境变量未设置
  | "disabled"      // 永久禁用（如 Tavily）
  | "failed"        // key 存在但 API 调用失败（超时/HTTP错误/plan限制）
  | "fallback_used" // 本层 Primary 失败，当前 provider 作为 fallback 被使用
  | "unavailable";  // 本层所有 provider 全部失败

// ── 路由层定义 ──────────────────────────────────────────────────────────────────
export type RoutingLayer =
  | "fundamentals"
  | "price"
  | "news_global"
  | "news_china"
  | "macro"
  | "alternative"
  | "indicators_us"
  | "indicators_cn_hk";

// ── 市场范围 ──────────────────────────────────────────────────────────────────
export type MarketScope = "US" | "CN" | "HK" | "GLOBAL" | "CRYPTO";

// ── 单个 Provider 配置 ─────────────────────────────────────────────────────────
export interface ProviderConfig {
  /** 对应 dataSourceRegistry 中的 id */
  id: string;
  /** 显示名称 */
  displayName: string;
  /** 环境变量名（null = 无需 key） */
  envKey: string | null;
  /** 是否参与 evidenceScore（只有 active + valid data 时才实际计入） */
  participatesInEvidence: boolean;
}

// ── 路由层配置 ─────────────────────────────────────────────────────────────────
export interface RoutingLayerConfig {
  layer: RoutingLayer;
  displayName: string;
  market: MarketScope[];
  purpose: string;
  primary: ProviderConfig;
  backup?: ProviderConfig;
  backup2?: ProviderConfig;
  /** 是否参与 evidenceScore（层级开关） */
  participatesInEvidence: boolean;
  /** 备注（特殊处理说明） */
  notes?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA ROUTING MATRIX v1
// ══════════════════════════════════════════════════════════════════════════════
export const DATA_ROUTING_MATRIX: RoutingLayerConfig[] = [
  // ── [Fundamentals] ─────────────────────────────────────────────────────────
  {
    layer: "fundamentals",
    displayName: "基本面数据",
    market: ["US"],
    purpose: "财务报表、估值倍数、DCF、分析师目标价",
    primary: {
      id: "fmp",
      displayName: "FMP",
      envKey: "FMP_API_KEY",
      participatesInEvidence: true,
    },
    backup: {
      id: "simfin",
      displayName: "SimFin",
      envKey: "SIMFIN_API_KEY",
      participatesInEvidence: true,
    },
    participatesInEvidence: true,
    notes: "FMP 必须使用 /stable/ 端点（/api/v3/ legacy 已废弃）",
  },

  // ── [Price] ────────────────────────────────────────────────────────────────
  {
    layer: "price",
    displayName: "实时价格",
    market: ["US", "GLOBAL"],
    purpose: "实时报价、OHLCV、市值、成交量",
    primary: {
      id: "finnhub",
      displayName: "Finnhub",
      envKey: "FINNHUB_API_KEY",
      participatesInEvidence: true,
    },
    backup: {
      id: "tiingo",
      displayName: "Tiingo",
      envKey: "TIINGO_API_KEY",
      participatesInEvidence: true,
    },
    backup2: {
      id: "yahoo_finance",
      displayName: "Yahoo Finance",
      envKey: null,
      participatesInEvidence: true,
    },
    participatesInEvidence: true,
    notes: "Polygon.io 当前 plan 不含 price/aggs 端点（403），已降级为 Tiingo 作为 Backup",
  },

  // ── [News - Global] ────────────────────────────────────────────────────────
  {
    layer: "news_global",
    displayName: "全球新闻",
    market: ["US", "GLOBAL"],
    purpose: "新闻情绪、事件检测、头条",
    primary: {
      id: "finnhub",
      displayName: "Finnhub News",
      envKey: "FINNHUB_API_KEY",
      participatesInEvidence: true,
    },
    backup: {
      id: "marketaux",
      displayName: "Marketaux",
      envKey: "MARKETAUX_API_KEY",
      participatesInEvidence: true,
    },
    backup2: {
      id: "news_api",
      displayName: "NewsAPI",
      envKey: "NEWS_API_KEY",
      participatesInEvidence: true,
    },
    participatesInEvidence: true,
    notes: "NewsAPI 调用必须加 User-Agent header，否则返回 400",
  },

  // ── [News - China] ─────────────────────────────────────────────────────────
  {
    layer: "news_china",
    displayName: "中国新闻",
    market: ["CN", "HK"],
    purpose: "A股/港股中文新闻、热点资讯",
    primary: {
      id: "tencent_news",
      displayName: "腾讯新闻",
      envKey: "TENCENT_NEWS_API_KEY",
      participatesInEvidence: true,
    },
    participatesInEvidence: true,
    notes: "腾讯新闻为辅助源（Auxiliary），不作为全球新闻主源。通过 CLI 调用（tencent-news-cli）",
  },

  // ── [Macro] ────────────────────────────────────────────────────────────────
  {
    layer: "macro",
    displayName: "宏观指标",
    market: ["GLOBAL"],
    purpose: "利率、CPI、GDP、失业率、收益率曲线",
    primary: {
      id: "fred",
      displayName: "FRED",
      envKey: "FRED_API_KEY",
      participatesInEvidence: true,
    },
    backup: {
      id: "world_bank",
      displayName: "World Bank",
      envKey: null,
      participatesInEvidence: true,
    },
    backup2: {
      id: "imf_weo",
      displayName: "IMF WEO",
      envKey: null,
      participatesInEvidence: true,
    },
    participatesInEvidence: true,
  },

  // ── [Alternative] ──────────────────────────────────────────────────────────
  {
    layer: "alternative",
    displayName: "另类数据",
    market: ["US"],
    purpose: "国会交易、市场情绪、预测市场",
    primary: {
      id: "quiverquant",
      displayName: "QuiverQuant",
      envKey: "QUIVER_QUANT_API_KEY",
      participatesInEvidence: true,
    },
    backup: {
      id: "polymarket",
      displayName: "Polymarket",
      envKey: null,
      participatesInEvidence: true,
    },
    participatesInEvidence: true,
    notes: "Finviz 已放弃（无 key）。Backup 直接使用 Polymarket（公开 API）",
  },

  // ── [Indicators - US] ──────────────────────────────────────────────────────
  {
    layer: "indicators_us",
    displayName: "技术指标（美股）",
    market: ["US"],
    purpose: "RSI、MACD、EMA、SMA、Bollinger、ATR（美股）",
    primary: {
      id: "twelve_data",
      displayName: "Twelve Data",
      envKey: "TWELVE_DATA_API_KEY",
      participatesInEvidence: true,
    },
    backup: {
      id: "alpha_vantage",
      displayName: "Alpha Vantage",
      envKey: "ALPHA_VANTAGE_API_KEY",
      participatesInEvidence: true,
    },
    participatesInEvidence: true,
    notes: "Twelve Data 提供 OHLCV + 内置指标；Alpha Vantage 作为 fallback",
  },

  // ── [Indicators - CN/HK] ───────────────────────────────────────────────────
  {
    layer: "indicators_cn_hk",
    displayName: "技术指标（A股/港股）",
    market: ["CN", "HK"],
    purpose: "RSI、MACD、EMA、SMA、Bollinger、ATR（A股/港股，本地计算）",
    primary: {
      id: "yahoo_finance",
      displayName: "Yahoo OHLCV",
      envKey: null,
      participatesInEvidence: true,
    },
    backup: {
      id: "alpha_vantage",
      displayName: "Alpha Vantage",
      envKey: "ALPHA_VANTAGE_API_KEY",
      participatesInEvidence: true,
    },
    participatesInEvidence: true,
    notes: "Yahoo 拉取 OHLCV → 本地 Indicator Engine 计算（RSI/MACD/EMA/SMA/Bollinger/ATR）。禁止调用任何免费指标 API 替代",
  },
];

// ── 辅助函数 ────────────────────────────────────────────────────────────────────

/** 通过 layer 获取路由配置 */
export function getLayerConfig(layer: RoutingLayer): RoutingLayerConfig | undefined {
  return DATA_ROUTING_MATRIX.find(l => l.layer === layer);
}

/** 获取某层的所有 provider（按优先级排列） */
export function getLayerProviders(layer: RoutingLayer): ProviderConfig[] {
  const config = getLayerConfig(layer);
  if (!config) return [];
  return [config.primary, config.backup, config.backup2].filter(Boolean) as ProviderConfig[];
}

/** 获取所有需要 API key 的 provider（用于 key 状态检测） */
export function getAllRequiredKeys(): Array<{ id: string; displayName: string; envKey: string; layer: RoutingLayer }> {
  const result: Array<{ id: string; displayName: string; envKey: string; layer: RoutingLayer }> = [];
  for (const layerConfig of DATA_ROUTING_MATRIX) {
    const providers = getLayerProviders(layerConfig.layer);
    for (const p of providers) {
      if (p.envKey && !result.find(r => r.id === p.id)) {
        result.push({ id: p.id, displayName: p.displayName, envKey: p.envKey, layer: layerConfig.layer });
      }
    }
  }
  return result;
}
