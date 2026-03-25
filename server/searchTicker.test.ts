/**
 * searchTicker 路由测试
 * 测试中文名称映射、英文名称搜索、股票代码搜索
 */
import { describe, it, expect } from "vitest";

// 从 routers.ts 中提取的中文名称映射逻辑（独立测试）
const CN_NAME_MAP: Record<string, { symbol: string; name: string; cnName: string; exchange: string; market: string }[]> = {
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
};

/** 模拟中文搜索逻辑 */
function searchByChinese(q: string) {
  const matches: typeof CN_NAME_MAP[string] = [];
  for (const [key, vals] of Object.entries(CN_NAME_MAP)) {
    if (key.includes(q) || q.includes(key)) {
      matches.push(...vals);
    }
  }
  const seen = new Set<string>();
  return matches.filter(m => {
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
});

describe("searchTicker - 语言检测", () => {
  it("中文字符检测正确", () => {
    expect(hasChinese("腾讯")).toBe(true);
    expect(hasChinese("茅台600519")).toBe(true);
    expect(hasChinese("AAPL")).toBe(false);
    expect(hasChinese("apple")).toBe(false);
    expect(hasChinese("600519")).toBe(false);
    expect(hasChinese("700.HK")).toBe(false);
  });
});

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
    const requiredCompanies = ["腾讯", "阿里巴巴", "茅台", "比亚迪", "苹果", "特斯拉", "英伟达", "微软"];
    for (const company of requiredCompanies) {
      expect(CN_NAME_MAP[company], `${company} 不在映射表中`).toBeDefined();
    }
  });
});

describe("searchTicker - 去重逻辑", () => {
  it("搜索腾讯控股不返回重复的 700.HK", () => {
    // 腾讯 和 腾讯控股 都映射到 700.HK，搜索"腾讯"时不应重复
    const results = searchByChinese("腾讯");
    const symbols = results.map(r => r.symbol);
    const uniqueSymbols = new Set(symbols);
    expect(symbols.length).toBe(uniqueSymbols.size);
  });
});
