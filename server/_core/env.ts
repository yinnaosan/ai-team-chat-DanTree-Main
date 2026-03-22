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
  // 优先级：环境变量 > local.config.ts > 硬编码回退值（确保生产环境无需手动配置也能使用）
  FINNHUB_API_KEY: e("FINNHUB_API_KEY", getConfig("FINNHUB_API_KEY")) || "d6v2ughr01qig546bblgd6v2ughr01qig546bbm0",
  ALPHA_VANTAGE_API_KEY: e("ALPHA_VANTAGE_API_KEY", getConfig("ALPHA_VANTAGE_API_KEY")) || "RTEA1T8M5T0PXQZR",
  POLYGON_API_KEY: e("POLYGON_API_KEY", getConfig("POLYGON_API_KEY")) || "65gRaMpwHzfm5uxZEcekmt803Y3ci6Yk",
  FMP_API_KEY: e("FMP_API_KEY", getConfig("FMP_API_KEY")) || "i58yYDwWrdmyuftiynHvKBg3CZ1t6Zgd",
  COINGECKO_API_KEY: e("COINGECKO_API_KEY", getConfig("COINGECKO_API_KEY")) || "CG-xmz84aGoBNm4t3zss6sunXQT",
  NEWS_API_KEY: e("NEWS_API_KEY", getConfig("NEWS_API_KEY")) || "2365cbaead5b4778a2ad5ba3cabc7632",
  MARKETAUX_API_KEY: e("MARKETAUX_API_KEY", getConfig("MARKETAUX_API_KEY")) || "2bmLPIQKxMhcUQpArnbhebSGmuPqIAf7lCAeXhn5",
  FRED_API_KEY: e("FRED_API_KEY", getConfig("FRED_API_KEY")) || "fc90d7149fbff8a90993d1a4d0829ba4",
  TAVILY_API_KEY: e("TAVILY_API_KEY", getConfig("TAVILY_API_KEY")) || "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",
  TAVILY_API_KEY_2: e("TAVILY_API_KEY_2", getConfig("TAVILY_API_KEY_2")) || "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",
  TAVILY_API_KEY_3: e("TAVILY_API_KEY_3", getConfig("TAVILY_API_KEY_3")) || "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",
  TAVILY_API_KEY_4: e("TAVILY_API_KEY_4", getConfig("TAVILY_API_KEY_4")) || "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",
  SIMFIN_API_KEY: e("SIMFIN_API_KEY", getConfig("SIMFIN_API_KEY")) || "728bbdab-a951-4577-99b0-1b348bf93783",
  TIINGO_API_KEY: e("TIINGO_API_KEY", getConfig("TIINGO_API_KEY")) || "b30264579ed635263c7fc43d27475699522cca44",
  MESSARI_API_KEY: e("MESSARI_API_KEY", getConfig("MESSARI_API_KEY")) || "rvQ9bfuBOdOFr3+QoZgadqj7iBadOq5-7MDTZjg7sIvGOKdb",
  CONGRESS_API_KEY: e("CONGRESS_API_KEY", getConfig("CONGRESS_API_KEY")) || "SpLH43dTTokdt5NhJDAMo6Z4dSAHAYGnLsfR8LJz",
  COURTLISTENER_API_KEY: e("COURTLISTENER_API_KEY", getConfig("COURTLISTENER_API_KEY")) || "d79de03f84c80caf0f47bb7881f6f1856611f7b1",
};
