/**
 * SEC EDGAR API 单元测试
 * 测试 secEdgarApi.ts 中的所有核心函数
 *
 * 注意：secEdgarApi.ts 内部有一个 _tickerMap 模块级缓存（24小时TTL）。
 * 在测试中，每次 tickerToCik 调用都会先检查缓存，若缓存未命中才 fetch tickers.json。
 * 因此 getCompanySubmissions 等函数的测试需要单独 mock，不依赖 tickers.json。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCompanySubmissions,
  getRecentFilings,
  getStockFullData,
  formatSecData,
  checkHealth,
  shouldFetchSecEdgar,
  type SecEdgarStockData,
  type EdgarCompanyInfo,
  type EdgarXbrlData,
} from "./secEdgarApi";

// ─── Mock fetch ────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  };
}

// ─── 测试数据 ──────────────────────────────────────────────────────────────

const MOCK_TICKERS_JSON = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" },
  "2": { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
  "3": { cik_str: 1652044, ticker: "GOOGL", title: "Alphabet Inc." },
};

const MOCK_SUBMISSIONS: Partial<EdgarCompanyInfo> = {
  cik: "0000320193",
  name: "Apple Inc.",
  sic: "3571",
  sicDescription: "Electronic Computers",
  tickers: ["AAPL"],
  exchanges: ["Nasdaq"],
  fiscalYearEnd: "0930",
  stateOfIncorporation: "CA",
  stateOfIncorporationDescription: "California",
  filings: {
    recent: {
      accessionNumber: [
        "0000320193-24-000123",
        "0000320193-24-000100",
        "0000320193-23-000077",
        "0000320193-23-000050",
      ],
      filingDate: ["2024-11-01", "2024-08-02", "2023-11-03", "2023-08-04"],
      reportDate: ["2024-09-28", "2024-06-29", "2023-09-30", "2023-07-01"],
      form: ["10-K", "10-Q", "10-K", "10-Q"],
      primaryDocument: ["aapl-20240928.htm", "aapl-20240629.htm", "aapl-20230930.htm", "aapl-20230701.htm"],
      primaryDocDescription: ["10-K", "10-Q", "10-K", "10-Q"],
      size: [12000000, 8000000, 11000000, 7500000],
    },
  },
};

const MOCK_XBRL_FACTS: Partial<EdgarXbrlData> = {
  cik: "0000320193",
  entityName: "Apple Inc.",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        label: "Revenue from Contract with Customer",
        description: "Amount of revenue...",
        units: {
          USD: [
            { end: "2024-09-28", val: 391035000000, accn: "0000320193-24-000123", fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01" },
            { end: "2023-09-30", val: 383285000000, accn: "0000320193-23-000077", fy: 2023, fp: "FY", form: "10-K", filed: "2023-11-03" },
            { end: "2022-09-24", val: 394328000000, accn: "0000320193-22-000108", fy: 2022, fp: "FY", form: "10-K", filed: "2022-10-28" },
          ],
        },
      },
      NetIncomeLoss: {
        label: "Net Income (Loss)",
        description: "Net income or loss...",
        units: {
          USD: [
            { end: "2024-09-28", val: 93736000000, accn: "0000320193-24-000123", fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01" },
            { end: "2023-09-30", val: 96995000000, accn: "0000320193-23-000077", fy: 2023, fp: "FY", form: "10-K", filed: "2023-11-03" },
          ],
        },
      },
      EarningsPerShareBasic: {
        label: "Earnings Per Share, Basic",
        description: "EPS basic...",
        units: {
          "USD/shares": [
            { end: "2024-09-28", val: 6.11, accn: "0000320193-24-000123", fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01" },
            { end: "2023-09-30", val: 6.16, accn: "0000320193-23-000077", fy: 2023, fp: "FY", form: "10-K", filed: "2023-11-03" },
          ],
        },
      },
      Assets: {
        label: "Assets",
        description: "Total assets...",
        units: {
          USD: [
            { end: "2024-09-28", val: 364980000000, accn: "0000320193-24-000123", fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01" },
            { end: "2023-09-30", val: 352583000000, accn: "0000320193-23-000077", fy: 2023, fp: "FY", form: "10-K", filed: "2023-11-03" },
          ],
        },
      },
      Liabilities: {
        label: "Liabilities",
        description: "Total liabilities...",
        units: {
          USD: [
            { end: "2024-09-28", val: 308030000000, accn: "0000320193-24-000123", fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01" },
          ],
        },
      },
      NetCashProvidedByUsedInOperatingActivities: {
        label: "Net Cash Provided by Operating Activities",
        description: "Operating cash flow...",
        units: {
          USD: [
            { end: "2024-09-28", val: 118254000000, accn: "0000320193-24-000123", fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01" },
          ],
        },
      },
      ResearchAndDevelopmentExpense: {
        label: "Research and Development Expense",
        description: "R&D expense...",
        units: {
          USD: [
            { end: "2024-09-28", val: 31370000000, accn: "0000320193-24-000123", fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01" },
          ],
        },
      },
    },
  },
};

// ─── 测试套件 ──────────────────────────────────────────────────────────────

describe("secEdgarApi — getCompanySubmissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("正确构造 CIK URL（补零至 10 位）", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(MOCK_SUBMISSIONS));
    await getCompanySubmissions("320193");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("CIK0000320193.json"),
      expect.any(Object)
    );
  });

  it("返回公司基本信息", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(MOCK_SUBMISSIONS));
    const result = await getCompanySubmissions("0000320193");
    expect(result.name).toBe("Apple Inc.");
    expect(result.sic).toBe("3571");
  });

  it("HTTP 错误时抛出异常", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, false, 404));
    await expect(getCompanySubmissions("0000320193")).rejects.toThrow("404");
  });
});

describe("secEdgarApi — getRecentFilings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("正确过滤 10-K 和 10-Q 文件", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(MOCK_SUBMISSIONS));
    const filings = await getRecentFilings("0000320193", ["10-K", "10-Q"]);
    expect(filings.length).toBe(4);
    expect(filings.every(f => ["10-K", "10-Q"].includes(f.form))).toBe(true);
  });

  it("只获取 10-K 文件", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(MOCK_SUBMISSIONS));
    const filings = await getRecentFilings("0000320193", ["10-K"]);
    expect(filings.length).toBe(2);
    expect(filings.every(f => f.form === "10-K")).toBe(true);
  });

  it("生成正确的文件直链 URL", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(MOCK_SUBMISSIONS));
    const filings = await getRecentFilings("0000320193", ["10-K"]);
    expect(filings[0].url).toContain("sec.gov/Archives/edgar/data/320193");
    expect(filings[0].url).toContain("aapl-20240928.htm");
  });

  it("返回 filingDate 和 reportDate", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(MOCK_SUBMISSIONS));
    const filings = await getRecentFilings("0000320193", ["10-K"]);
    expect(filings[0].filingDate).toBe("2024-11-01");
    expect(filings[0].reportDate).toBe("2024-09-28");
  });
});

describe("secEdgarApi — getStockFullData", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * getStockFullData 内部调用顺序：
   * 1. tickerToCik → 先检查缓存（_tickerMap），若缓存命中则不 fetch；若未命中则 fetch tickers.json
   * 2. getCompanySubmissions → fetch submissions
   * 3. getCompanyFacts → fetch companyfacts
   * 4. getRecentFilings → 内部再 fetch submissions
   *
   * 由于 _tickerMap 是模块级缓存，在同一测试文件中第一次调用后会被缓存。
   * 为了确保测试隔离，我们使用 mockFetch.mockImplementation 按 URL 路由 mock。
   */

  it("成功获取 AAPL 完整数据", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) return Promise.resolve(makeResponse(MOCK_TICKERS_JSON));
      if (url.includes("submissions/CIK")) return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      if (url.includes("companyfacts/CIK")) return Promise.resolve(makeResponse(MOCK_XBRL_FACTS));
      return Promise.resolve(makeResponse({ hits: { hits: [] } }));
    });

    const data = await getStockFullData("AAPL");
    expect(data.ticker).toBe("AAPL");
    expect(data.cik).toBe("0000320193");
    expect(data.companyName).toBe("Apple Inc.");
    expect(data.sic).toBe("3571");
    expect(data.exchanges).toContain("Nasdaq");
  });

  it("正确提取营收数据", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) return Promise.resolve(makeResponse(MOCK_TICKERS_JSON));
      if (url.includes("submissions/CIK")) return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      if (url.includes("companyfacts/CIK")) return Promise.resolve(makeResponse(MOCK_XBRL_FACTS));
      return Promise.resolve(makeResponse({ hits: { hits: [] } }));
    });

    const data = await getStockFullData("AAPL");
    expect(data.keyFinancials.revenue.length).toBeGreaterThan(0);
    expect(data.keyFinancials.revenue[0].value).toBe(391035000000);
    expect(data.keyFinancials.revenue[0].period).toBe("2024-09-28");
  });

  it("正确提取 EPS（USD/shares 单位，不是 USD）", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) return Promise.resolve(makeResponse(MOCK_TICKERS_JSON));
      if (url.includes("submissions/CIK")) return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      if (url.includes("companyfacts/CIK")) return Promise.resolve(makeResponse(MOCK_XBRL_FACTS));
      return Promise.resolve(makeResponse({ hits: { hits: [] } }));
    });

    const data = await getStockFullData("AAPL");
    expect(data.keyFinancials.eps.length).toBeGreaterThan(0);
    expect(data.keyFinancials.eps[0].value).toBe(6.11);
  });

  it("正确提取总资产和总负债", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) return Promise.resolve(makeResponse(MOCK_TICKERS_JSON));
      if (url.includes("submissions/CIK")) return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      if (url.includes("companyfacts/CIK")) return Promise.resolve(makeResponse(MOCK_XBRL_FACTS));
      return Promise.resolve(makeResponse({ hits: { hits: [] } }));
    });

    const data = await getStockFullData("AAPL");
    expect(data.keyFinancials.totalAssets[0].value).toBe(364980000000);
    expect(data.keyFinancials.totalLiabilities[0].value).toBe(308030000000);
  });

  it("正确提取经营现金流", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) return Promise.resolve(makeResponse(MOCK_TICKERS_JSON));
      if (url.includes("submissions/CIK")) return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      if (url.includes("companyfacts/CIK")) return Promise.resolve(makeResponse(MOCK_XBRL_FACTS));
      return Promise.resolve(makeResponse({ hits: { hits: [] } }));
    });

    const data = await getStockFullData("AAPL");
    expect(data.keyFinancials.operatingCashFlow.length).toBeGreaterThan(0);
    expect(data.keyFinancials.operatingCashFlow[0].value).toBe(118254000000);
  });

  it("正确提取研发费用", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) return Promise.resolve(makeResponse(MOCK_TICKERS_JSON));
      if (url.includes("submissions/CIK")) return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      if (url.includes("companyfacts/CIK")) return Promise.resolve(makeResponse(MOCK_XBRL_FACTS));
      return Promise.resolve(makeResponse({ hits: { hits: [] } }));
    });

    const data = await getStockFullData("AAPL");
    expect(data.keyFinancials.researchAndDevelopment.length).toBeGreaterThan(0);
    expect(data.keyFinancials.researchAndDevelopment[0].value).toBe(31370000000);
  });

  it("CIK 查找失败时返回空数据（不抛出异常）", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) return Promise.resolve(makeResponse({}));
      // 全文搜索也返回空
      return Promise.resolve(makeResponse({ hits: { hits: [] } }));
    });

    const data = await getStockFullData("NONEXISTENT_XYZ_123");
    expect(data.ticker).toBe("NONEXISTENT_XYZ_123");
    expect(data.cik).toBeNull();
    expect(data.keyFinancials.revenue).toHaveLength(0);
  });

  it("source 字段为 SEC EDGAR", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) return Promise.resolve(makeResponse(MOCK_TICKERS_JSON));
      if (url.includes("submissions/CIK")) return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      if (url.includes("companyfacts/CIK")) return Promise.resolve(makeResponse(MOCK_XBRL_FACTS));
      return Promise.resolve(makeResponse({ hits: { hits: [] } }));
    });

    const data = await getStockFullData("AAPL");
    expect(data.source).toBe("SEC EDGAR");
  });
});

describe("secEdgarApi — formatSecData", () => {
  const mockData: SecEdgarStockData = {
    ticker: "AAPL",
    cik: "0000320193",
    companyName: "Apple Inc.",
    sic: "3571",
    sicDescription: "Electronic Computers",
    exchanges: ["Nasdaq"],
    fiscalYearEnd: "0930",
    stateOfIncorporation: "California",
    recentFilings: [
      {
        accessionNumber: "0000320193-24-000123",
        filingDate: "2024-11-01",
        reportDate: "2024-09-28",
        form: "10-K",
        primaryDocument: "aapl-20240928.htm",
        primaryDocDescription: "10-K",
        size: 12000000,
        url: "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm",
      },
    ],
    keyFinancials: {
      revenue: [
        { period: "2024-09-28", value: 391035000000, form: "10-K" },
        { period: "2023-09-30", value: 383285000000, form: "10-K" },
      ],
      netIncome: [
        { period: "2024-09-28", value: 93736000000, form: "10-K" },
      ],
      eps: [
        { period: "2024-09-28", value: 6.11, form: "10-K" },
      ],
      totalAssets: [
        { period: "2024-09-28", value: 364980000000, form: "10-K" },
      ],
      totalLiabilities: [
        { period: "2024-09-28", value: 308030000000, form: "10-K" },
      ],
      operatingCashFlow: [
        { period: "2024-09-28", value: 118254000000, form: "10-K" },
      ],
      researchAndDevelopment: [
        { period: "2024-09-28", value: 31370000000, form: "10-K" },
      ],
    },
    source: "SEC EDGAR",
    fetchedAt: "2025-01-01T00:00:00.000Z",
  };

  it("包含公司名称和 CIK", () => {
    const md = formatSecData(mockData);
    expect(md).toContain("Apple Inc.");
    expect(md).toContain("0000320193");
  });

  it("包含行业 SIC 代码", () => {
    const md = formatSecData(mockData);
    expect(md).toContain("Electronic Computers");
    expect(md).toContain("3571");
  });

  it("包含交易所信息", () => {
    const md = formatSecData(mockData);
    expect(md).toContain("Nasdaq");
  });

  it("包含营收数据（以 B 为单位）", () => {
    const md = formatSecData(mockData);
    expect(md).toContain("$391.04B");
  });

  it("包含净利润和净利率", () => {
    const md = formatSecData(mockData);
    expect(md).toContain("$93.74B");
    expect(md).toContain("%");
  });

  it("包含 EPS 数据", () => {
    const md = formatSecData(mockData);
    expect(md).toContain("$6.11");
  });

  it("包含净资产计算（总资产 - 总负债）", () => {
    const md = formatSecData(mockData);
    // 净资产 = 364980 - 308030 = 56950 亿美元 = $56.95B
    expect(md).toContain("$56.95B");
  });

  it("包含经营现金流", () => {
    const md = formatSecData(mockData);
    expect(md).toContain("$118.25B");
  });

  it("包含研发费用", () => {
    const md = formatSecData(mockData);
    expect(md).toContain("$31.37B");
  });

  it("包含 SEC 文件链接", () => {
    const md = formatSecData(mockData);
    expect(md).toContain("sec.gov");
    expect(md).toContain("10-K");
  });

  it("空数据时不崩溃", () => {
    const emptyData: SecEdgarStockData = {
      ticker: "TEST",
      cik: null,
      companyName: null,
      recentFilings: [],
      keyFinancials: {
        revenue: [],
        netIncome: [],
        eps: [],
        totalAssets: [],
        totalLiabilities: [],
        operatingCashFlow: [],
        researchAndDevelopment: [],
      },
      source: "SEC EDGAR",
      fetchedAt: new Date().toISOString(),
    };
    expect(() => formatSecData(emptyData)).not.toThrow();
    const md = formatSecData(emptyData);
    expect(md).toContain("TEST");
  });
});

describe("secEdgarApi — shouldFetchSecEdgar", () => {
  it("检测到 SEC 关键词时返回 true", () => {
    expect(shouldFetchSecEdgar("分析苹果公司的 SEC 年报")).toBe(true);
    expect(shouldFetchSecEdgar("查看 AAPL 的 10-K 报告")).toBe(true);
    expect(shouldFetchSecEdgar("EDGAR XBRL 财务数据")).toBe(true);
  });

  it("检测到财务报表关键词时返回 true", () => {
    expect(shouldFetchSecEdgar("分析苹果公司的财务报表")).toBe(true);
    expect(shouldFetchSecEdgar("查看英伟达的年报")).toBe(true);
    expect(shouldFetchSecEdgar("美股财报分析")).toBe(true);
  });

  it("检测到财务指标关键词时返回 true", () => {
    expect(shouldFetchSecEdgar("分析公司的营收和净利润趋势")).toBe(true);
    expect(shouldFetchSecEdgar("计算 EPS 和每股收益")).toBe(true);
    expect(shouldFetchSecEdgar("查看总资产和资产负债表")).toBe(true);
    expect(shouldFetchSecEdgar("分析经营现金流")).toBe(true);
  });

  it("检测到英文财务关键词时返回 true", () => {
    expect(shouldFetchSecEdgar("analyze revenue and net income")).toBe(true);
    expect(shouldFetchSecEdgar("earnings per share analysis")).toBe(true);
    expect(shouldFetchSecEdgar("balance sheet total assets")).toBe(true);
    expect(shouldFetchSecEdgar("cash flow from operations")).toBe(true);
  });

  it("普通问题不触发 SEC EDGAR", () => {
    expect(shouldFetchSecEdgar("今天天气怎么样")).toBe(false);
    expect(shouldFetchSecEdgar("比特币价格")).toBe(false);
    expect(shouldFetchSecEdgar("美联储利率决议")).toBe(false);
    expect(shouldFetchSecEdgar("港股行情分析")).toBe(false);
  });
});

describe("secEdgarApi — checkHealth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("健康检测成功时返回 ok: true", async () => {
    // checkHealth 内部调用 getCompanySubmissions("0000320193")
    // getCompanySubmissions 直接 fetch submissions URL（不经过 tickerToCik）
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("submissions/CIK")) return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      return Promise.resolve(makeResponse({}));
    });
    const result = await checkHealth();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.detail).toContain("Apple Inc.");
  });

  it("网络错误时返回 ok: false", async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));
    const result = await checkHealth();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Network error");
  });

  it("HTTP 错误时返回 ok: false", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(makeResponse({}, false, 503)));
    const result = await checkHealth();
    expect(result.ok).toBe(false);
  });

  it("返回数据异常时返回 ok: false", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(makeResponse({ name: null })));
    const result = await checkHealth();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("返回数据异常");
  });
});
