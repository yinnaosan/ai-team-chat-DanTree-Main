import { getConfig, IS_LOCAL_DEV } from "../local.config";

// 辅助函数：优先读取环境变量，否则回退到 local.config.ts
const e = (key: string, localVal?: string): string =>
  process.env[key] || localVal || "";

export const ENV = {
  appId: e("VITE_APP_ID", getConfig("VITE_APP_ID")),
  cookieSecret: e("JWT_SECRET", getConfig("JWT_SECRET")),
  databaseUrl: e("DATABASE_URL", getConfig("DATABASE_URL")),
  oAuthServerUrl: e("OAUTH_SERVER_URL", getConfig("OAUTH_SERVER_URL")),
  ownerOpenId: e("OWNER_OPEN_ID", getConfig("OWNER_OPEN_ID")),
  isProduction: process.env.NODE_ENV === "production",
  isLocalDev: IS_LOCAL_DEV,
  forgeApiUrl: e("BUILT_IN_FORGE_API_URL", getConfig("BUILT_IN_FORGE_API_URL")),
  forgeApiKey: e("BUILT_IN_FORGE_API_KEY", getConfig("BUILT_IN_FORGE_API_KEY")),
  // 金融数据 API Keys
  FINNHUB_API_KEY: e("FINNHUB_API_KEY", getConfig("FINNHUB_API_KEY")),
  ALPHA_VANTAGE_API_KEY: e("ALPHA_VANTAGE_API_KEY", getConfig("ALPHA_VANTAGE_API_KEY")),
  POLYGON_API_KEY: e("POLYGON_API_KEY", getConfig("POLYGON_API_KEY")),
  FMP_API_KEY: e("FMP_API_KEY", getConfig("FMP_API_KEY")),
  COINGECKO_API_KEY: e("COINGECKO_API_KEY", getConfig("COINGECKO_API_KEY")),
  NEWS_API_KEY: e("NEWS_API_KEY", getConfig("NEWS_API_KEY")),
  MARKETAUX_API_KEY: e("MARKETAUX_API_KEY", getConfig("MARKETAUX_API_KEY")),
  FRED_API_KEY: e("FRED_API_KEY", getConfig("FRED_API_KEY")),
  TAVILY_API_KEY: e("TAVILY_API_KEY", getConfig("TAVILY_API_KEY")),
  TAVILY_API_KEY_2: e("TAVILY_API_KEY_2", getConfig("TAVILY_API_KEY_2")),
  TAVILY_API_KEY_3: e("TAVILY_API_KEY_3", getConfig("TAVILY_API_KEY_3")),
  TAVILY_API_KEY_4: e("TAVILY_API_KEY_4", getConfig("TAVILY_API_KEY_4")),
  SIMFIN_API_KEY: e("SIMFIN_API_KEY", getConfig("SIMFIN_API_KEY")),
  TIINGO_API_KEY: e("TIINGO_API_KEY", getConfig("TIINGO_API_KEY")),
  MESSARI_API_KEY: e("MESSARI_API_KEY", getConfig("MESSARI_API_KEY")),
  CONGRESS_API_KEY: e("CONGRESS_API_KEY", getConfig("CONGRESS_API_KEY")),
  COURTLISTENER_API_KEY: e("COURTLISTENER_API_KEY", getConfig("COURTLISTENER_API_KEY")),
};
