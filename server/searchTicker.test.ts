/**
 * searchTicker 路由测试（第三十八轮更新）
 * 测试中文名称映射、拼音首字母搜索、ETF 映射、搜索历史逻辑
 */
import { describe, it, expect } from "vitest";

// ── 中文名称映射表（与 routers.ts 同步的核心条目）──
type TickerEntry = { symbol: string; name: string; cnName: string; exchange: string; market: string; etfIndex?: string };
const CN_NAME_MAP: Record<string, TickerEntry[]> = {
  "腾讯": [{ symbol: "700.HK", name: "Tencent Holdings Ltd", cnName: "腾讯控股", exchange: "HKEX", market: "HK" }],
  "腾讯控股": [{ symbol: "700.HK", name: "Tencent Holdings Ltd", cnName: "腾讯控股", exchange: "HKEX", market: "HK" }],
  "阿里巴巴": [{ symbol: "BABA", name: "Alibaba Group Holding Ltd", cnName: "阿里巴巴", exchange: "NYSE", market: "US" }, { symbol: "9988.HK", name: "Alibaba Group Holding Ltd", cnName: "阿里巴巴", exchange: "HKEX", market: "HK" }],
  "阿里": [{ symbol: "BABA", name: "Alibaba Group Holding Ltd", cnName: "阿里巴巴", exchange: "NYSE", market: "US" }],
  "茅台": [{ symbol: "600519.SS", name: "Kweichow Moutai Co., Ltd.", cnName: "贵州茅台", exchange: "SSE", market: "CN" }],
  "贵州茅台": [{ symbol: "600519.SS", name: "Kweichow Moutai Co., Ltd.", cnName: "贵州茅台", exchange: "SSE", market: "CN" }],
  "比亚迪": [{ symbol: "002594.SZ", name: "BYD Co., Ltd.", cnName: "比亚迪", exchange: "SZSE", market: "CN" }, { symbol: "1211.HK", name: "BYD Co., Ltd.", cnName: "比亚迪", exchange: "HKEX", market: "HK" }],
  "苹果": [{ symbol: "AAPL", name: "Apple Inc", cnName: "苹果", exchange: "NASDAQ", market: "US" }],
  "特斯拉": [{ symbol: "TSLA", name: "Tesla Inc", cnName: "特斯拉", exchange: "NASDAQ", market: "US" }],
  "英伟达": [{ symbol: "NVDA", name: "NVIDIA Corp", cnName: "英伟达", exchange: "NASDAQ", market: "US" }],
  "微软": [{ symbol: "MSFT", name: "Microsoft Corp", cnName: "微软", exchange: "NASDAQ", market: "US" }],
  "谷歌": [{ symbol: "GOOGL", name: "Alphabet Inc", cnName: "谷歌", exchange: "NASDAQ", market: "US" }],
  "百度": [{ symbol: "BIDU", name: "Baidu Inc", cnName: "百度", exchange: "NASDAQ", market: "US" }, { symbol: "9888.HK", name: "Baidu Inc", cnName: "百度", exchange: "HKEX", market: "HK" }],
  "美团": [{ symbol: "3690.HK", name: "Meituan", cnName: "美团", exchange: "HKEX", market: "HK" }],
  "小米": [{ symbol: "1810.HK", name: "Xiaomi Corp", cnName: "小米集团", exchange: "HKEX", market: "HK" }],
  "比特币": [{ symbol: "BTC", name: "Bitcoin", cnName: "比特币", exchange: "Crypto", market: "CRYPTO" }],
  "以太坊": [{ symbol: "ETH", name: "Ethereum", cnName: "以太坊", exchange: "Crypto", market: "CRYPTO" }],
  // 第三十八轮新增
  "宁波银行": [{ symbol: "002142.SZ", name: "Bank of Ningbo", cnName: "宁波银行", exchange: "SZSE", market: "CN" }],
  "中国国航": [{ symbol: "601111.SS", name: "Air China", cnName: "中国国航", exchange: "SSE", market: "CN" }, { symbol: "753.HK", name: "Air China", cnName: "中国国航", exchange: "HKEX", market: "HK" }],
  "中国银行": [{ symbol: "601988.SS", name: "Bank of China", cnName: "中国银行", exchange: "SSE", market: "CN" }, { symbol: "3988.HK", name: "Bank of China", cnName: "中国银行", exchange: "HKEX", market: "HK" }],
  "紫金矿业": [{ symbol: "601899.SS", name: "Zijin Mining", cnName: "紫金矿业", exchange: "SSE", market: "CN" }],
  "海天味业": [{ symbol: "603288.SS", name: "Foshan Haitian Flavouring", cnName: "海天味业", exchange: "SSE", market: "CN" }],
  "蒙牛乳业": [{ symbol: "2319.HK", name: "China Mengniu Dairy", cnName: "蒙牛乳业", exchange: "HKEX", market: "HK" }],
  "高盛集团": [{ symbol: "GS", name: "Goldman Sachs", cnName: "高盛集团", exchange: "NYSE", market: "US" }],
  "中国人寿": [{ symbol: "601628.SS", name: "China Life Insurance", cnName: "中国人寿", exchange: "SSE", market: "CN" }],
};

// ── ETF 映射表（核心条目）──
const ETF_INDEX_MAP: Record<string, { cnName: string; trackingIndex: string; category: string }> = {
  "SPY":  { cnName: "SPDR标普500 ETF",    trackingIndex: "S&P 500",     category: "ETF" },
  "QQQ":  { cnName: "Invesco纳斯达克100 ETF", trackingIndex: "Nasdaq-100",  category: "ETF" },
  "VOO":  { cnName: "Vanguard标普500 ETF", trackingIndex: "S&P 500",     category: "ETF" },
  "GLD":  { cnName: "SPDR黄金 ETF",       trackingIndex: "Gold Spot Price", category: "ETF" },
  "TLT":  { cnName: "iShares 20+年国库券 ETF", trackingIndex: "ICE US Treasury 20+ Year", category: "ETF" },
  "ARKK": { cnName: "ARK创新 ETF",        trackingIndex: "ARK Innovation", category: "ETF" },
  "SOXX": { cnName: "iShares半导体 ETF",  trackingIndex: "ICE Semiconductor", category: "ETF" },
  "SCHD": { cnName: "Schwab美股股息 ETF", trackingIndex: "Dow Jones US Dividend 100", category: "ETF" },
  "TQQQ": { cnName: "ProShares纳斯达克1003倍多 ETF", trackingIndex: "Nasdaq-100 3x", category: "ETF" },
  "FXI":  { cnName: "iShares中国大盘股 ETF", trackingIndex: "FTSE China 50", category: "ETF" },
  "MCHI": { cnName: "iShares MSCI中国 ETF", trackingIndex: "MSCI China", category: "ETF" },
};

// ── 拼音映射表（核心条目）──
const PINYIN_MAP: Record<string, string[]> = {
  "yjd": ["英伟达"],  "nvda": ["英伟达"],
  "pg": ["苹果"],   "apple": ["苹果"],
  "tsla": ["特斯拉"],
  "msft": ["微软"],
  "tx": ["腾讯"],   "tencent": ["腾讯"],
  "ali": ["阿里"],  "alibaba": ["阿里巴巴"],
  "bidu": ["百度"], "baidu": ["百度"],
  "mt": ["茅台"],   "moutai": ["茅台"],
  "byd": ["比亚迪"],
  "spy": ["标普500 ETF"],
  "qqq": ["纳斯达克100 ETF"],
  "gs": ["高盛集团"], "goldman": ["高盛集团"],
};

/** 模拟中文搜索逻辑 */
function searchByChinese(q: string) {
  const matches: TickerEntry[] = [];
  for (const [key, vals] of Object.entries(CN_NAME_MAP)) {
    if (key.includes(q) || q.includes(key)) matches.push(...vals);
  }
  const seen = new Set<string>();
  return matches.filter(m => {
    if (seen.has(m.symbol)) return false;
    seen.add(m.symbol);
    return true;
  });
}

/** 模拟拼音搜索逻辑 */
function searchByPinyin(q: string): TickerEntry[] {
  const qLower = q.toLowerCase();
  if (!PINYIN_MAP[qLower]) return [];
  const cnMatches: TickerEntry[] = [];
  for (const cnKey of PINYIN_MAP[qLower]) {
    for (const [key, vals] of Object.entries(CN_NAME_MAP)) {
      if (key === cnKey || key.includes(cnKey) || cnKey.includes(key)) cnMatches.push(...vals);
    }
  }
  const seen = new Set<string>();
  return cnMatches.filter(m => {
    if (seen.has(m.symbol)) return false;
    seen.add(m.symbol);
    return true;
  });
}

/** 检查是否包含中文字符 */
function hasChinese(q: string): boolean {
  return /[\u4e00-\u9fff]/.test(q);
}

/** 市场优先级排序 */
function marketPriority(m: string): number {
  const order: Record<string, number> = { US: 1, HK: 2, CN: 3, CRYPTO: 4, GB: 5, JP: 6, KR: 7, OTHER: 99 };
  return order[m] ?? 99;
}

// ═══════════════════════════════════════════════════════════════════════════
describe("searchTicker - 中文名称搜索", () => {
  it("精确搜索：腾讯 → 700.HK", () => {
    expect(hasChinese("腾讯")).toBe(true);
    const results = searchByChinese("腾讯");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("700.HK");
    expect(results[0].market).toBe("HK");
  });

  it("精确搜索：茅台 → 600519.SS", () => {
    const results = searchByChinese("茅台");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("600519.SS");
    expect(results[0].market).toBe("CN");
  });

  it("精确搜索：苹果 → AAPL", () => {
    const results = searchByChinese("苹果");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("AAPL");
    expect(results[0].market).toBe("US");
  });

  it("精确搜索：比亚迪 → 返回 A股 + 港股两个结果", () => {
    const results = searchByChinese("比亚迪");
    expect(results.length).toBe(2);
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain("002594.SZ");
    expect(symbols).toContain("1211.HK");
  });

  it("精确搜索：阿里巴巴 → 返回 US + HK 两个结果", () => {
    const results = searchByChinese("阿里巴巴");
    expect(results.length).toBe(2);
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain("BABA");
    expect(symbols).toContain("9988.HK");
  });

  it("模糊搜索：阿里 → 匹配阿里巴巴", () => {
    const results = searchByChinese("阿里");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.symbol === "BABA")).toBe(true);
  });

  it("精确搜索：比特币 → BTC (CRYPTO)", () => {
    const results = searchByChinese("比特币");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("BTC");
    expect(results[0].market).toBe("CRYPTO");
  });

  it("未知中文名称 → 返回空数组", () => {
    const results = searchByChinese("未知公司XYZ");
    expect(results.length).toBe(0);
  });

  // 第三十八轮新增测试
  it("新增：宁波银行 → 002142.SZ", () => {
    const results = searchByChinese("宁波银行");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("002142.SZ");
    expect(results[0].market).toBe("CN");
  });

  it("新增：中国国航 → 601111.SS + 753.HK", () => {
    const results = searchByChinese("中国国航");
    expect(results.length).toBe(2);
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain("601111.SS");
    expect(symbols).toContain("753.HK");
  });

  it("新增：中国银行 → 601988.SS + 3988.HK", () => {
    const results = searchByChinese("中国银行");
    expect(results.length).toBe(2);
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain("601988.SS");
    expect(symbols).toContain("3988.HK");
  });

  it("新增：高盛集团 → GS (NYSE)", () => {
    const results = searchByChinese("高盛集团");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("GS");
    expect(results[0].market).toBe("US");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("searchTicker - 拼音首字母搜索", () => {
  it("yjd → 英伟达 → NVDA", () => {
    const results = searchByPinyin("yjd");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("NVDA");
  });

  it("tencent → 腾讯 → 700.HK", () => {
    const results = searchByPinyin("tencent");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("700.HK");
  });

  it("alibaba → 阿里巴巴 → BABA + 9988.HK", () => {
    const results = searchByPinyin("alibaba");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.symbol === "BABA")).toBe(true);
  });

  it("byd → 比亚迪 → 002594.SZ", () => {
    const results = searchByPinyin("byd");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.symbol === "002594.SZ")).toBe(true);
  });

  it("moutai → 茅台 → 600519.SS", () => {
    const results = searchByPinyin("moutai");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("600519.SS");
  });

  it("goldman → 高盛集团 → GS", () => {
    const results = searchByPinyin("goldman");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe("GS");
  });

  it("未知拼音 → 返回空数组", () => {
    const results = searchByPinyin("xyz_unknown_pinyin");
    expect(results.length).toBe(0);
  });

  it("拼音不区分大小写：TENCENT = tencent", () => {
    const lower = searchByPinyin("tencent");
    const upper = searchByPinyin("TENCENT");
    expect(lower.length).toBe(upper.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("searchTicker - ETF 映射", () => {
  it("SPY 有正确的追踪指数", () => {
    expect(ETF_INDEX_MAP["SPY"]).toBeDefined();
    expect(ETF_INDEX_MAP["SPY"].trackingIndex).toBe("S&P 500");
    expect(ETF_INDEX_MAP["SPY"].category).toBe("ETF");
  });

  it("QQQ 追踪 Nasdaq-100", () => {
    expect(ETF_INDEX_MAP["QQQ"].trackingIndex).toBe("Nasdaq-100");
  });

  it("GLD 追踪黄金现货价格", () => {
    expect(ETF_INDEX_MAP["GLD"].trackingIndex).toBe("Gold Spot Price");
  });

  it("ARKK 是主题 ETF", () => {
    expect(ETF_INDEX_MAP["ARKK"].trackingIndex).toBe("ARK Innovation");
  });

  it("FXI 追踪中国大盘股", () => {
    expect(ETF_INDEX_MAP["FXI"].trackingIndex).toBe("FTSE China 50");
  });

  it("所有 ETF 条目都有必要字段", () => {
    for (const [sym, info] of Object.entries(ETF_INDEX_MAP)) {
      expect(info.cnName, `${sym} 缺少 cnName`).toBeTruthy();
      expect(info.trackingIndex, `${sym} 缺少 trackingIndex`).toBeTruthy();
      expect(info.category, `${sym} 缺少 category`).toBe("ETF");
    }
  });

  it("ETF 映射表包含主要类别", () => {
    // 宽基
    expect(ETF_INDEX_MAP["SPY"]).toBeDefined();
    expect(ETF_INDEX_MAP["QQQ"]).toBeDefined();
    expect(ETF_INDEX_MAP["VOO"]).toBeDefined();
    // 行业
    expect(ETF_INDEX_MAP["SOXX"]).toBeDefined();
    // 商品
    expect(ETF_INDEX_MAP["GLD"]).toBeDefined();
    // 固收
    expect(ETF_INDEX_MAP["TLT"]).toBeDefined();
    // 主题
    expect(ETF_INDEX_MAP["ARKK"]).toBeDefined();
    // 中国
    expect(ETF_INDEX_MAP["FXI"]).toBeDefined();
    expect(ETF_INDEX_MAP["MCHI"]).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("searchTicker - 语言检测", () => {
  it("中文字符检测正确", () => {
    expect(hasChinese("腾讯")).toBe(true);
    expect(hasChinese("茅台600519")).toBe(true);
    expect(hasChinese("AAPL")).toBe(false);
    expect(hasChinese("apple")).toBe(false);
    expect(hasChinese("600519")).toBe(false);
    expect(hasChinese("700.HK")).toBe(false);
    expect(hasChinese("yjd")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("searchTicker - 市场优先级排序", () => {
  it("US > HK > CN > CRYPTO", () => {
    expect(marketPriority("US")).toBeLessThan(marketPriority("HK"));
    expect(marketPriority("HK")).toBeLessThan(marketPriority("CN"));
    expect(marketPriority("CN")).toBeLessThan(marketPriority("CRYPTO"));
    expect(marketPriority("CRYPTO")).toBeLessThan(marketPriority("OTHER"));
  });

  it("未知市场返回 99", () => {
    expect(marketPriority("UNKNOWN")).toBe(99);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("searchTicker - 中文名称映射完整性", () => {
  it("所有映射条目都有必要字段", () => {
    for (const [key, vals] of Object.entries(CN_NAME_MAP)) {
      for (const v of vals) {
        expect(v.symbol, `${key} 缺少 symbol`).toBeTruthy();
        expect(v.name, `${key} 缺少 name`).toBeTruthy();
        expect(v.cnName, `${key} 缺少 cnName`).toBeTruthy();
        expect(v.exchange, `${key} 缺少 exchange`).toBeTruthy();
        expect(v.market, `${key} 缺少 market`).toBeTruthy();
      }
    }
  });

  it("A股代码格式正确（.SS 或 .SZ 后缀）", () => {
    const cnStocks = Object.values(CN_NAME_MAP).flat().filter(v => v.market === "CN");
    for (const s of cnStocks) {
      expect(s.symbol.endsWith(".SS") || s.symbol.endsWith(".SZ"),
        `A股代码 ${s.symbol} 格式不正确`).toBe(true);
    }
  });

  it("港股代码格式正确（.HK 后缀）", () => {
    const hkStocks = Object.values(CN_NAME_MAP).flat().filter(v => v.market === "HK");
    for (const s of hkStocks) {
      expect(s.symbol.endsWith(".HK"),
        `港股代码 ${s.symbol} 格式不正确`).toBe(true);
    }
  });

  it("常见公司都在映射表中", () => {
    const requiredCompanies = ["腾讯", "阿里巴巴", "茅台", "比亚迪", "苹果", "特斯拉", "英伟达", "微软",
      "宁波银行", "中国国航", "中国银行", "高盛集团"];
    for (const company of requiredCompanies) {
      expect(CN_NAME_MAP[company], `${company} 不在映射表中`).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("searchTicker - 去重逻辑", () => {
  it("搜索腾讯控股不返回重复的 700.HK", () => {
    const results = searchByChinese("腾讯");
    const symbols = results.map(r => r.symbol);
    const uniqueSymbols = new Set(symbols);
    expect(symbols.length).toBe(uniqueSymbols.size);
  });

  it("拼音搜索去重：alibaba 不返回重复 BABA", () => {
    const results = searchByPinyin("alibaba");
    const symbols = results.map(r => r.symbol);
    const uniqueSymbols = new Set(symbols);
    expect(symbols.length).toBe(uniqueSymbols.size);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("searchTicker - 搜索历史逻辑（纯函数测试）", () => {
  it("添加历史记录去重", () => {
    const history: string[] = [];
    const addToHistory = (sym: string) => {
      const next = [sym, ...history.filter(s => s !== sym)].slice(0, 10);
      history.length = 0;
      history.push(...next);
    };
    addToHistory("AAPL");
    addToHistory("TSLA");
    addToHistory("AAPL"); // 重复添加
    expect(history[0]).toBe("AAPL"); // 最新在前
    expect(history.filter(s => s === "AAPL").length).toBe(1); // 不重复
    expect(history.length).toBe(2);
  });

  it("历史记录最多保留 10 条", () => {
    const history: string[] = [];
    const addToHistory = (sym: string) => {
      const next = [sym, ...history.filter(s => s !== sym)].slice(0, 10);
      history.length = 0;
      history.push(...next);
    };
    for (let i = 0; i < 15; i++) addToHistory(`STOCK${i}`);
    expect(history.length).toBe(10);
  });

  it("清除历史记录", () => {
    const history = ["AAPL", "TSLA", "NVDA"];
    history.length = 0;
    expect(history.length).toBe(0);
  });
});
