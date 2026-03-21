/**
 * CoinGecko + Baostock 单元测试
 */
import { describe, it, expect } from "vitest";
import {
  isCryptoTask,
  extractCryptoIds,
  formatCryptoData,
  type CoinGeckoData,
  type CoinMarketData,
  type GlobalMarketData,
  type TrendingCoin,
} from "./coinGeckoApi";
import {
  isAStockTask,
  extractAStockCodes,
  formatAStockData,
  type BaoStockData,
  type AStockKData,
} from "./baoStockApi";

// ─── CoinGecko 测试 ────────────────────────────────────────────────────────

describe("isCryptoTask", () => {
  it("检测英文加密货币关键词", () => {
    expect(isCryptoTask("Analyze Bitcoin price trend")).toBe(true);
    expect(isCryptoTask("ETH vs BTC comparison")).toBe(true);
    expect(isCryptoTask("DeFi protocol analysis")).toBe(true);
    expect(isCryptoTask("NFT market overview")).toBe(true);
  });

  it("检测中文加密货币关键词", () => {
    expect(isCryptoTask("分析比特币价格走势")).toBe(true);
    expect(isCryptoTask("加密货币市场分析")).toBe(true);
    expect(isCryptoTask("区块链技术应用")).toBe(true);
    expect(isCryptoTask("稳定币USDT风险")).toBe(true);
  });

  it("非加密货币任务返回 false", () => {
    expect(isCryptoTask("分析苹果公司股票")).toBe(false);
    expect(isCryptoTask("美联储利率决议")).toBe(false);
    expect(isCryptoTask("中国GDP增长")).toBe(false);
  });
});

describe("extractCryptoIds", () => {
  it("识别英文代币符号", () => {
    const ids = extractCryptoIds("Compare BTC and ETH performance");
    expect(ids).toContain("bitcoin");
    expect(ids).toContain("ethereum");
  });

  it("识别中文代币名称", () => {
    const ids = extractCryptoIds("分析比特币和以太坊的价格");
    expect(ids).toContain("bitcoin");
    expect(ids).toContain("ethereum");
  });

  it("识别稳定币", () => {
    const ids = extractCryptoIds("USDT and USDC depegging risk");
    expect(ids).toContain("tether");
    expect(ids).toContain("usd-coin");
  });

  it("最多返回 10 个", () => {
    const ids = extractCryptoIds("btc eth bnb sol xrp ada avax doge dot matic link ltc");
    expect(ids.length).toBeLessThanOrEqual(10);
  });

  it("无关键词返回空数组", () => {
    const ids = extractCryptoIds("分析苹果公司财报");
    expect(ids).toHaveLength(0);
  });
});

describe("formatCryptoData", () => {
  const mockCoin: CoinMarketData = {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    current_price: 70000,
    market_cap: 1380000000000,
    market_cap_rank: 1,
    fully_diluted_valuation: 1470000000000,
    total_volume: 35000000000,
    high_24h: 71000,
    low_24h: 69000,
    price_change_24h: 1500,
    price_change_percentage_24h: 2.19,
    price_change_percentage_7d: 5.5,
    price_change_percentage_30d: 12.3,
    market_cap_change_24h: 28000000000,
    market_cap_change_percentage_24h: 2.07,
    circulating_supply: 19700000,
    total_supply: 21000000,
    max_supply: 21000000,
    ath: 73750,
    ath_change_percentage: -5.1,
    ath_date: "2024-03-14T07:10:36.635Z",
    atl: 67.81,
    atl_change_percentage: 103000,
    atl_date: "2013-07-06T00:00:00.000Z",
    last_updated: "2026-03-21T06:00:00.000Z",
  };

  const mockGlobal: GlobalMarketData = {
    active_cryptocurrencies: 15000,
    markets: 1050,
    total_market_cap: { usd: 2800000000000 },
    total_volume: { usd: 120000000000 },
    market_cap_percentage: { btc: 52.5, eth: 17.3 },
    market_cap_change_percentage_24h_usd: 1.8,
    updated_at: 1742540400,
  };

  const mockTrending: TrendingCoin = {
    id: "solana",
    coin_id: 4128,
    name: "Solana",
    symbol: "SOL",
    market_cap_rank: 5,
    score: 0,
  };

  const mockData: CoinGeckoData = {
    topCoins: [mockCoin],
    globalMarket: mockGlobal,
    trendingCoins: [mockTrending],
    specificCoins: [],
    source: "CoinGecko",
    fetchedAt: "2026-03-21T06:00:00.000Z",
  };

  it("包含全球市场概览", () => {
    const output = formatCryptoData(mockData);
    expect(output).toContain("全球加密货币市场概览");
    expect(output).toContain("$2.80T");
    expect(output).toContain("52.5%");
  });

  it("包含 Top 币种表格", () => {
    const output = formatCryptoData(mockData);
    expect(output).toContain("Bitcoin");
    expect(output).toContain("BTC");
    expect(output).toContain("$70,000");
  });

  it("包含趋势币种", () => {
    const output = formatCryptoData(mockData);
    expect(output).toContain("搜索热度");
    expect(output).toContain("Solana");
  });

  it("包含数据来源标注", () => {
    const output = formatCryptoData(mockData);
    expect(output).toContain("CoinGecko");
  });

  it("指定币种数据优先显示", () => {
    const dataWithSpecific: CoinGeckoData = {
      ...mockData,
      specificCoins: [mockCoin],
    };
    const output = formatCryptoData(dataWithSpecific);
    expect(output).toContain("指定币种实时数据");
  });
});

// ─── Baostock 测试 ────────────────────────────────────────────────────────

describe("isAStockTask", () => {
  it("检测 A 股关键词", () => {
    expect(isAStockTask("分析茅台A股走势")).toBe(true);
    expect(isAStockTask("沪深300指数分析")).toBe(true);
    expect(isAStockTask("A股市场行情")).toBe(true);
    expect(isAStockTask("sh.600519 贵州茅台")).toBe(true);
  });

  it("非 A 股任务返回 false", () => {
    expect(isAStockTask("分析苹果公司AAPL")).toBe(false);
    expect(isAStockTask("Bitcoin price analysis")).toBe(false);
    expect(isAStockTask("美联储利率决议")).toBe(false);
  });
});

describe("extractAStockCodes", () => {
  it("识别 sh./sz. 格式代码", () => {
    const codes = extractAStockCodes("分析 sh.600519 贵州茅台");
    expect(codes).toContain("sh.600519");
  });

  it("识别纯 6 位数字代码", () => {
    const codes = extractAStockCodes("分析600519的走势");
    expect(codes).toContain("sh.600519");
  });

  it("识别深市代码", () => {
    const codes = extractAStockCodes("分析000001平安银行");
    expect(codes).toContain("sz.000001");
  });

  it("识别公司名称", () => {
    const codes = extractAStockCodes("分析贵州茅台的财务状况");
    expect(codes).toContain("sh.600519");
  });

  it("识别多个代码", () => {
    const codes = extractAStockCodes("对比贵州茅台和招商银行");
    expect(codes).toContain("sh.600519");
    expect(codes).toContain("sh.600036");
  });

  it("最多返回 5 个", () => {
    const codes = extractAStockCodes("分析茅台 招行 平安 格力 美的 宁德时代");
    expect(codes.length).toBeLessThanOrEqual(5);
  });
});

describe("formatAStockData", () => {
  const mockKData: AStockKData[] = [
    { date: "2026-03-18", code: "sh.600519", open: "1800.00", high: "1850.00", low: "1790.00", close: "1830.00", volume: "5000000", amount: "9150000000", turn: "0.40", peTTM: "25.6", pbMRQ: "8.2" },
    { date: "2026-03-19", code: "sh.600519", open: "1835.00", high: "1870.00", low: "1820.00", close: "1855.00", volume: "5500000", amount: "10202500000", turn: "0.44", peTTM: "25.9", pbMRQ: "8.3" },
    { date: "2026-03-20", code: "sh.600519", open: "1860.00", high: "1900.00", low: "1845.00", close: "1880.00", volume: "6000000", amount: "11280000000", turn: "0.48", peTTM: "26.2", pbMRQ: "8.4" },
  ];

  const mockData: BaoStockData = {
    symbol: "sh.600519",
    name: "贵州茅台",
    recentKData: mockKData,
    profitData: [],
    growthData: [],
    source: "Baostock（上交所/深交所）",
    fetchedAt: "2026-03-21T06:00:00.000Z",
  };

  it("包含标题和股票代码", () => {
    const output = formatAStockData(mockData);
    expect(output).toContain("贵州茅台");
    expect(output).toContain("sh.600519");
  });

  it("包含最新行情", () => {
    const output = formatAStockData(mockData);
    expect(output).toContain("最新行情");
    expect(output).toContain("¥1880.00");
  });

  it("包含近期行情表格", () => {
    const output = formatAStockData(mockData);
    expect(output).toContain("近期行情");
    expect(output).toContain("2026-03-18");
    expect(output).toContain("2026-03-20");
  });

  it("包含数据来源标注", () => {
    const output = formatAStockData(mockData);
    expect(output).toContain("Baostock");
  });

  it("成交额转换为亿", () => {
    const output = formatAStockData(mockData);
    // 11280000000 / 1e8 = 112.80
    expect(output).toContain("112.80");
  });
});

// ─── 扩展名称库测试 ────────────────────────────────────────────

import {
  A_STOCK_NAME_MAP,
  yahooToBoastockCode,
  baostockToYahooCode,
  isAStockYahooCode,
  getAStockName,
} from "./baoStockApi";

describe("名称库覆盖度", () => {
  it("包含白酒行业主要公司", () => {
    expect(A_STOCK_NAME_MAP["贵州茅台"]).toBe("sh.600519");
    expect(A_STOCK_NAME_MAP["五粮液"]).toBe("sz.000858");
    expect(A_STOCK_NAME_MAP["泸州老窖"]).toBe("sz.000568");
    expect(A_STOCK_NAME_MAP["山西汾酒"]).toBe("sh.600809");
  });

  it("包含主要银行", () => {
    expect(A_STOCK_NAME_MAP["招商银行"]).toBe("sh.600036");
    expect(A_STOCK_NAME_MAP["工行"]).toBe("sh.601398");
    expect(A_STOCK_NAME_MAP["建行"]).toBe("sh.601939");
    expect(A_STOCK_NAME_MAP["平安银行"]).toBe("sz.000001");
  });

  it("包含新能源主要公司", () => {
    expect(A_STOCK_NAME_MAP["宁德时代"]).toBe("sh.300750");
    expect(A_STOCK_NAME_MAP["隆基绿能"]).toBe("sh.601012");
    expect(A_STOCK_NAME_MAP["通威股份"]).toBe("sh.600438");
  });

  it("名称库条目超过 150 条", () => {
    expect(Object.keys(A_STOCK_NAME_MAP).length).toBeGreaterThan(150);
  });

  it("所有代码格式合法（sh./sz. 开头或空字符串）", () => {
    for (const [name, code] of Object.entries(A_STOCK_NAME_MAP)) {
      if (code) {
        expect(code).toMatch(/^(sh|sz)\.\d{6}$/);
      }
    }
  });
});

describe("代码格式转换函数", () => {
  it("yahooToBoastockCode: .SS 转换为 sh.", () => {
    expect(yahooToBoastockCode("600519.SS")).toBe("sh.600519");
    expect(yahooToBoastockCode("600036.SS")).toBe("sh.600036");
  });

  it("yahooToBoastockCode: .SZ 转换为 sz.", () => {
    expect(yahooToBoastockCode("000001.SZ")).toBe("sz.000001");
    expect(yahooToBoastockCode("300750.SZ")).toBe("sz.300750");
  });

  it("yahooToBoastockCode: 非 A 股代码返回 null", () => {
    expect(yahooToBoastockCode("0700.HK")).toBeNull();
    expect(yahooToBoastockCode("AAPL")).toBeNull();
    expect(yahooToBoastockCode("BABA")).toBeNull();
  });

  it("baostockToYahooCode: sh. 转换为 .SS", () => {
    expect(baostockToYahooCode("sh.600519")).toBe("600519.SS");
    expect(baostockToYahooCode("sh.600036")).toBe("600036.SS");
  });

  it("baostockToYahooCode: sz. 转换为 .SZ", () => {
    expect(baostockToYahooCode("sz.000001")).toBe("000001.SZ");
    expect(baostockToYahooCode("sz.300750")).toBe("300750.SZ");
  });

  it("isAStockYahooCode: 正确识别 A 股代码", () => {
    expect(isAStockYahooCode("600519.SS")).toBe(true);
    expect(isAStockYahooCode("000001.SZ")).toBe(true);
    expect(isAStockYahooCode("0700.HK")).toBe(false);
    expect(isAStockYahooCode("AAPL")).toBe(false);
    expect(isAStockYahooCode("BABA")).toBe(false);
  });
});

describe("公司名称反查函数 getAStockName", () => {
  it("返回最完整的名称", () => {
    // 贵州茅台 和 茅台 都映射到 sh.600519，应返回贵州茅台
    expect(getAStockName("sh.600519")).toBe("贵州茅台");
    expect(getAStockName("sh.600036")).toBe("招商银行");
    expect(getAStockName("sh.601398")).toBe("工商银行");
  });

  it("未知代码返回代码本身", () => {
    expect(getAStockName("sh.999999")).toBe("sh.999999");
  });
});

describe("去重逻辑：extractAStockCodes 识别 Yahoo 格式 A 股代码", () => {
  it("识别 600519.SS 并转换为 sh. 格式", () => {
    const codes = extractAStockCodes("分析 600519.SS 贵州茅台");
    expect(codes).toContain("sh.600519");
    // 不应有重复的 sh.600519
    const count = codes.filter(c => c === "sh.600519").length;
    expect(count).toBe(1);
  });

  it("识别 000001.SZ 并转换为 sz. 格式", () => {
    const codes = extractAStockCodes("分析 000001.SZ 平安银行");
    expect(codes).toContain("sz.000001");
  });

  it("混合格式输入不重复", () => {
    // 同时包含 sh.600519 和 600519.SS，应只返回一个 sh.600519
    const codes = extractAStockCodes("sh.600519 和 600519.SS 分析茅台");
    const count = codes.filter(c => c === "sh.600519").length;
    expect(count).toBe(1);
  });

  it("港股代码不被识别为 A 股", () => {
    const codes = extractAStockCodes("分析腾讯 0700.HK");
    // 腾讯是港股，不应被 Baostock 处理
    expect(codes).toHaveLength(0);
  });
});
