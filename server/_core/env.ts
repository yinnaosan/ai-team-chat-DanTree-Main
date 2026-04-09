import { IS_LOCAL_DEV, getConfig } from "../local.config";

// 辅助函数：优先读取环境变量，否则回退到硬编码值
// 注意：不使用 getConfig()，因为生产构建会 tree-shake 掉 LOCAL_CONFIG 对象
const e = (envKey: string, hardcoded: string): string =>
  (process.env[envKey] && process.env[envKey] !== "undefined" && process.env[envKey] !== "")
    ? process.env[envKey]!
    : hardcoded;

export const ENV = {
  // 系统核心（这些由平台注入，不需要硬编码回退）
  appId: process.env.VITE_APP_ID || getConfig("VITE_APP_ID"),
  cookieSecret: process.env.JWT_SECRET || getConfig("JWT_SECRET"),
  databaseUrl: process.env.DATABASE_URL || getConfig("DATABASE_URL"),
  oAuthServerUrl: process.env.OAUTH_SERVER_URL || getConfig("OAUTH_SERVER_URL"),
  ownerOpenId: process.env.OWNER_OPEN_ID || getConfig("OWNER_OPEN_ID"),
  isProduction: process.env.NODE_ENV === "production",
  isLocalDev: IS_LOCAL_DEV,
  // 当用户配置了自己的 OpenAI Key，直接调用 OpenAI API；否则使用平台内置 Key
  forgeApiUrl: process.env.OPENAI_API_KEY
    ? "https://api.openai.com"
    : (process.env.BUILT_IN_FORGE_API_URL || getConfig("BUILT_IN_FORGE_API_URL")),
  forgeApiKey: process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY || getConfig("BUILT_IN_FORGE_API_KEY"),

  // ── 金融数据 API Keys ──────────────────────────────────────────────────────
  // 优先级：process.env > 硬编码（不经过 getConfig，避免生产构建 tree-shaking 问题）
  FINNHUB_API_KEY:        e("FINNHUB_API_KEY",        "d6v2ughr01qig546bblgd6v2ughr01qig546bbm0"),
  ALPHA_VANTAGE_API_KEY:  e("ALPHA_VANTAGE_API_KEY",  "RTEA1T8M5T0PXQZR"),
  POLYGON_API_KEY:        e("POLYGON_API_KEY",        "65gRaMpwHzfm5uxZEcekmt803Y3ci6Yk"),
  FMP_API_KEY:            e("FMP_API_KEY",            "i58yYDwWrdmyuftiynHvKBg3CZ1t6Zgd"),
  COINGECKO_API_KEY:      e("COINGECKO_API_KEY",      "CG-xmz84aGoBNm4t3zss6sunXQT"),
  NEWS_API_KEY:           e("NEWS_API_KEY",           "2365cbaead5b4778a2ad5ba3cabc7632"),
  MARKETAUX_API_KEY:      e("MARKETAUX_API_KEY",      "2bmLPIQKxMhcUQpArnbhebSGmuPqIAf7lCAeXhn5"),
  FRED_API_KEY:           e("FRED_API_KEY",           "fc90d7149fbff8a90993d1a4d0829ba4"),
  TAVILY_API_KEY:         e("TAVILY_API_KEY",         "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"),
  TAVILY_API_KEY_2:       e("TAVILY_API_KEY_2",       "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"),
  TAVILY_API_KEY_3:       e("TAVILY_API_KEY_3",       "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"),
  TAVILY_API_KEY_4:       e("TAVILY_API_KEY_4",       "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"),
  SIMFIN_API_KEY:         e("SIMFIN_API_KEY",         "728bbdab-a951-4577-99b0-1b348bf93783"),
  TIINGO_API_KEY:         e("TIINGO_API_KEY",         "b30264579ed635263c7fc43d27475699522cca44"),
  MESSARI_API_KEY:        e("MESSARI_API_KEY",        "rvQ9bfuBOdOFr3+QoZgadqj7iBadOq5-7MDTZjg7sIvGOKdb"),
  CONGRESS_API_KEY:       e("CONGRESS_API_KEY",       "SpLH43dTTokdt5NhJDAMo6Z4dSAHAYGnLsfR8LJz"),
  COURTLISTENER_API_KEY:  e("COURTLISTENER_API_KEY",  "d79de03f84c80caf0f47bb7881f6f1856611f7b1"),
  SERPER_API_KEY:          e("SERPER_API_KEY",          "fd00fed2c50e13d7e63979ad916c9bb52250af1d"),
  SERPER_API_KEY_2:        e("SERPER_API_KEY_2",        "7d5ec70b47c60ddd093515d7970fe68de1715ee2"),
  SERPER_API_KEY_3:        e("SERPER_API_KEY_3",        "58dbca508a4db758bf2d0c69f05c7c6204c93635"),
  // ── Alpaca Paper Trading（模拟交易，需用户自行配置） ────────────────────────
  ALPACA_API_KEY:          e("ALPACA_API_KEY",          ""),
  ALPACA_API_SECRET:       e("ALPACA_API_SECRET",       ""),
  // ── Tushare A 股增强数据（FinanceMCP 架构，需用户自行配置） ─────────────────
  TUSHARE_TOKEN:           e("TUSHARE_TOKEN",           ""),
  // ── Twelve Data（实时行情/历史 OHLCV/技术指标，免费 800次/天） ────────────────────
  TWELVE_DATA_API_KEY:     e("TWELVE_DATA_API_KEY",     "4ea6995e91b847818ec735266f64d93d"),
  // ── QuiverQuant（国会交易/另类数据） ──────────────────────────────────────────
  QUIVER_QUANT_API_KEY:    e("QUIVER_QUANT_API_KEY",    "e3f5fc497e6e71812266f257273b66cde34016ba"),
  // ── 腾讯新闻（中文新闻，通过 CLI 调用） ─────────────────────────────────────
  TENCENT_NEWS_API_KEY:    e("TENCENT_NEWS_API_KEY",    "95b0b0c9-e4d0-458c-a271-ef0847d84283"),
};
