/**
 * local.config.ts — 本地运行配置
 *
 * 此文件包含本地运行所需的所有 API Key 和配置。
 * 当环境变量不存在时（即本地下载运行时），自动回退到此文件中的值。
 *
 * ⚠️  安全提示：此文件包含真实 API Key，请勿提交到公开 Git 仓库。
 *     .gitignore 已排除此文件。
 */

export const LOCAL_CONFIG = {
  // ── 本地开发模式 ──────────────────────────────────────────
  // 设为 true 时：跳过 OAuth 登录，自动以 Owner 身份运行
  LOCAL_DEV_MODE: true,

  // ── 系统核心 ──────────────────────────────────────────────
  JWT_SECRET: "oFzuLMLxKz8hvho8XSfdZa",
  OWNER_OPEN_ID: "VZHcqHCKffcABgBykVaBHA",
  OWNER_NAME: "睿 王",
  VITE_APP_ID: "Sfk3bwgkEZLNATmH8kTpez",
  OAUTH_SERVER_URL: "https://api.manus.im",
  VITE_OAUTH_PORTAL_URL: "https://manus.im",

  // ── LLM API（Manus Forge — 与网页版相同的模型）────────────
  BUILT_IN_FORGE_API_URL: "https://forge.manus.ai",
  BUILT_IN_FORGE_API_KEY: "HWNicvae7paFshgdy47Sgn",
  VITE_FRONTEND_FORGE_API_KEY: "kRwyGLZa3GwxoMd9nGTFki",
  VITE_FRONTEND_FORGE_API_URL: "https://forge.manus.ai",

  // ── 数据库（本地使用 SQLite，无需安装 MySQL）────────────────
  // 留空时自动使用项目目录下的 local.db（SQLite）
  DATABASE_URL: "",

  // ── 金融数据 API Keys ─────────────────────────────────────
  FINNHUB_API_KEY: "d6v2ughr01qig546bblgd6v2ughr01qig546bbm0",
  ALPHA_VANTAGE_API_KEY: "RTEA1T8M5T0PXQZR",
  POLYGON_API_KEY: "65gRaMpwHzfm5uxZEcekmt803Y3ci6Yk",
  FMP_API_KEY: "i58yYDwWrdmyuftiynHvKBg3CZ1t6Zgd",
  COINGECKO_API_KEY: "CG-xmz84aGoBNm4t3zss6sunXQT",
  FRED_API_KEY: "fc90d7149fbff8a90993d1a4d0829ba4",
  NEWS_API_KEY: "2365cbaead5b4778a2ad5ba3cabc7632",
  MARKETAUX_API_KEY: "2bmLPIQKxMhcUQpArnbhebSGmuPqIAf7lCAeXhn5",
  SIMFIN_API_KEY: "728bbdab-a951-4577-99b0-1b348bf93783",
  TIINGO_API_KEY: "b30264579ed635263c7fc43d27475699522cca44",
  MESSARI_API_KEY: "rvQ9bfuBOdOFr3+QoZgadqj7iBadOq5-7MDTZjg7sIvGOKdb",

  // ── 网页搜索 ──────────────────────────────────────────────
  TAVILY_API_KEY: "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",
  TAVILY_API_KEY_2: "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",
  TAVILY_API_KEY_3: "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",
  TAVILY_API_KEY_4: "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",

  // ── 法律与监管 ────────────────────────────────────────────
  CONGRESS_API_KEY: "SpLH43dTTokdt5NhJDAMo6Z4dSAHAYGnLsfR8LJz",
  COURTLISTENER_API_KEY: "d79de03f84c80caf0f47bb7881f6f1856611f7b1",
};

/**
 * 从环境变量或本地配置中读取值
 * 优先级：环境变量 > local.config.ts
 */
export function getConfig(key: keyof typeof LOCAL_CONFIG): string {
  const envVal = process.env[key];
  if (envVal !== undefined && envVal !== "") return envVal;
  const localVal = LOCAL_CONFIG[key];
  return typeof localVal === "string" ? localVal : String(localVal);
}

export const IS_LOCAL_DEV =
  process.env.LOCAL_DEV_MODE === "true" ||
  (process.env.NODE_ENV !== "production" && LOCAL_CONFIG.LOCAL_DEV_MODE && !process.env.DATABASE_URL);
