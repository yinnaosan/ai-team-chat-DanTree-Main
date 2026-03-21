/**
 * SEC EDGAR API 模块
 * 数据来源：
 *   - https://data.sec.gov  — 公司提交记录、XBRL 财务事实
 *   - https://efts.sec.gov  — 全文搜索（8-K/10-K/10-Q 文件检索）
 *   - https://www.sec.gov/files/company_tickers.json — Ticker → CIK 映射表
 *
 * 注意：
 *   - 免费公开 API，无需 API Key
 *   - 必须设置 User-Agent 标头（SEC 要求）
 *   - 限速：每秒不超过 10 次请求，超限可能被封 IP
 *   - 仅适用于在美国上市的公司（美股）
 */

const EDGAR_BASE = "https://data.sec.gov";
const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const USER_AGENT = "InvestmentPlatform research@investplatform.com";

// ─── 速率限制器（≤10 req/s） ────────────────────────────────────────────────

let _lastRequestTime = 0;
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - _lastRequestTime;
  if (elapsed < 110) {
    await new Promise(r => setTimeout(r, 110 - elapsed));
  }
  _lastRequestTime = Date.now();
}

async function fetchEdgar<T>(url: string, timeoutMs = 12000): Promise<T> {
  await rateLimit();
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`SEC EDGAR HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

// ─── Ticker → CIK 映射缓存 ─────────────────────────────────────────────────

let _tickerMap: Map<string, { cik: string; title: string }> | null = null;
let _tickerMapFetchedAt = 0;
const TICKER_MAP_TTL = 24 * 60 * 60 * 1000; // 24 小时缓存

async function getTickerMap(): Promise<Map<string, { cik: string; title: string }>> {
  const now = Date.now();
  if (_tickerMap && now - _tickerMapFetchedAt < TICKER_MAP_TTL) {
    return _tickerMap;
  }
  try {
    const data = await fetchEdgar<Record<string, { cik_str: number; ticker: string; title: string }>>(TICKERS_URL, 15000);
    const map = new Map<string, { cik: string; title: string }>();
    for (const item of Object.values(data)) {
      map.set(item.ticker.toUpperCase(), {
        cik: String(item.cik_str).padStart(10, "0"),
        title: item.title,
      });
    }
    _tickerMap = map;
    _tickerMapFetchedAt = now;
    return map;
  } catch {
    return new Map();
  }
}

/** 将 Ticker 转换为 CIK（优先使用本地映射表，回退到全文搜索） */
export async function tickerToCik(ticker: string): Promise<{ cik: string; title: string } | null> {
  const sym = ticker.toUpperCase();

  // 1. 优先使用 company_tickers.json 映射表（最快，无额外请求）
  const map = await getTickerMap();
  if (map.has(sym)) return map.get(sym)!;

  // 2. 回退：通过全文搜索查找 CIK
  try {
    const url = `${EDGAR_SEARCH}?q=%22${encodeURIComponent(sym)}%22&forms=10-K&dateRange=custom&startdt=2020-01-01`;
    const data = await fetchEdgar<{
      hits: {
        hits: Array<{
          _source: {
            ciks: string[];
            display_names: string[];
          };
        }>;
      };
    }>(url);
    const hits = data.hits?.hits ?? [];
    // 在 display_names 中精确匹配 ticker（格式："Company Name  (TICKER)  (CIK ...)"）
    const match = hits.find(h =>
      h._source.display_names?.some(name => name.includes(`(${sym})`))
    );
    if (match && match._source.ciks?.[0]) {
      const cik = match._source.ciks[0].replace(/^0+/, "").padStart(10, "0");
      const title = match._source.display_names?.[0]?.split("  (")[0] ?? sym;
      return { cik, title };
    }
  } catch {
    // 静默失败
  }
  return null;
}

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface EdgarCompanyFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
  primaryDocDescription: string;
  size: number;
  /** SEC EDGAR 文件直链 */
  url?: string;
}

export interface EdgarCompanyInfo {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  ein: string;
  category: string;
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  stateOfIncorporationDescription: string;
  addresses: {
    mailing: { street1: string; city: string; stateOrCountry: string; zipCode: string };
    business: { street1: string; city: string; stateOrCountry: string; zipCode: string };
  };
  phone: string;
  flags: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
      size: number[];
    };
  };
}

export interface EdgarXbrlData {
  cik: string;
  entityName: string;
  facts: {
    "us-gaap"?: Record<string, {
      label: string;
      description: string;
      units: {
        USD?: Array<{ start?: string; end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string; frame?: string }>;
        "USD/shares"?: Array<{ start?: string; end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string; frame?: string }>;
        shares?: Array<{ end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string }>;
        pure?: Array<{ end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string }>;
      };
    }>;
    dei?: Record<string, unknown>;
  };
}

// ─── 核心 API 函数 ─────────────────────────────────────────────────────────

/** 获取公司提交记录（含最近文件列表） */
export async function getCompanySubmissions(cik: string): Promise<EdgarCompanyInfo> {
  const formattedCik = cik.padStart(10, "0");
  return fetchEdgar<EdgarCompanyInfo>(`${EDGAR_BASE}/submissions/CIK${formattedCik}.json`);
}

/** 获取公司 XBRL 财务事实数据（全量，数据量较大） */
export async function getCompanyFacts(cik: string): Promise<EdgarXbrlData> {
  const formattedCik = cik.padStart(10, "0");
  return fetchEdgar<EdgarXbrlData>(`${EDGAR_BASE}/api/xbrl/companyfacts/CIK${formattedCik}.json`, 20000);
}

/** 获取单一财务概念数据（轻量，推荐用于特定指标） */
export async function getCompanyConcept(
  cik: string,
  taxonomy: "us-gaap" | "dei",
  concept: string
): Promise<{
  entityName: string;
  units: Record<string, Array<{ start?: string; end: string; val: number; form: string; filed: string; fp?: string; fy?: number }>>;
}> {
  const formattedCik = cik.padStart(10, "0");
  return fetchEdgar(`${EDGAR_BASE}/api/xbrl/companyconcept/CIK${formattedCik}/${taxonomy}/${concept}.json`);
}

/** 获取最近的财务报告列表（10-K/10-Q/8-K） */
export async function getRecentFilings(
  cik: string,
  forms: string[] = ["10-K", "10-Q", "8-K"],
  limit = 15
): Promise<EdgarCompanyFiling[]> {
  const info = await getCompanySubmissions(cik);
  const recent = info.filings?.recent;
  if (!recent) return [];

  const filings: EdgarCompanyFiling[] = [];
  const count = recent.accessionNumber.length;
  for (let i = 0; i < count && filings.length < limit; i++) {
    if (forms.includes(recent.form[i])) {
      const accn = recent.accessionNumber[i].replace(/-/g, "");
      const url = `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, "")}/${accn}/${recent.primaryDocument[i]}`;
      filings.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i],
        form: recent.form[i],
        primaryDocument: recent.primaryDocument[i],
        primaryDocDescription: recent.primaryDocDescription[i],
        size: recent.size[i],
        url,
      });
    }
  }
  return filings;
}

// ─── 财务数据提取工具 ──────────────────────────────────────────────────────

interface FinancialEntry {
  period: string;
  value: number;
  form: string;
  fy?: number;
}

/**
 * 从 XBRL facts 中提取指定财务概念的年度数据
 * @param facts XBRL 财务事实数据
 * @param concept 财务概念名称（us-gaap）
 * @param unit 单位（USD / USD/shares / shares / pure）
 * @param form 报告类型（10-K / 10-Q）
 * @param limit 最多返回条数
 */
function extractFinancialSeries(
  facts: EdgarXbrlData,
  concept: string,
  unit: "USD" | "USD/shares" | "shares" | "pure" = "USD",
  form = "10-K",
  limit = 5
): FinancialEntry[] {
  const conceptData = facts.facts?.["us-gaap"]?.[concept];
  if (!conceptData) return [];

  const entries = (conceptData.units as Record<string, Array<{ start?: string; end: string; val: number; form: string; filed: string; fp?: string; fy?: number }>>)[unit] ?? [];

  return entries
    .filter(d => d.form === form && d.end && (form !== "10-K" || d.fp === "FY"))
    .sort((a, b) => b.end.localeCompare(a.end))
    // 去重（同一财年可能有多条记录，取最新提交的）
    .filter((d, idx, arr) => idx === 0 || d.end !== arr[idx - 1].end)
    .slice(0, limit)
    .map(d => ({ period: d.end, value: d.val, form: d.form, fy: d.fy }));
}

// ─── 综合数据（供 Step2 数据引擎调用） ────────────────────────────────────

export interface SecEdgarStockData {
  ticker: string;
  cik: string | null;
  companyName: string | null;
  sic?: string;
  sicDescription?: string;
  exchanges?: string[];
  fiscalYearEnd?: string;
  stateOfIncorporation?: string;
  recentFilings: EdgarCompanyFiling[];
  keyFinancials: {
    revenue: FinancialEntry[];
    netIncome: FinancialEntry[];
    eps: FinancialEntry[];
    totalAssets: FinancialEntry[];
    totalLiabilities: FinancialEntry[];
    operatingCashFlow: FinancialEntry[];
    researchAndDevelopment: FinancialEntry[];
  };
  source: string;
  fetchedAt: string;
}

export async function getStockFullData(ticker: string): Promise<SecEdgarStockData> {
  const sym = ticker.toUpperCase();
  let cik: string | null = null;
  let companyName: string | null = null;
  let sic: string | undefined;
  let sicDescription: string | undefined;
  let exchanges: string[] | undefined;
  let fiscalYearEnd: string | undefined;
  let stateOfIncorporation: string | undefined;
  let recentFilings: EdgarCompanyFiling[] = [];
  const keyFinancials: SecEdgarStockData["keyFinancials"] = {
    revenue: [],
    netIncome: [],
    eps: [],
    totalAssets: [],
    totalLiabilities: [],
    operatingCashFlow: [],
    researchAndDevelopment: [],
  };

  try {
    const cikInfo = await tickerToCik(sym);
    if (!cikInfo) throw new Error(`找不到 ${sym} 的 CIK`);
    cik = cikInfo.cik;
    companyName = cikInfo.title;

    // 并行获取提交记录和财务事实
    const [submissionsResult, factsResult] = await Promise.allSettled([
      getCompanySubmissions(cik),
      getCompanyFacts(cik),
    ]);

    if (submissionsResult.status === "fulfilled") {
      const sub = submissionsResult.value;
      companyName = sub.name || companyName;
      sic = sub.sic;
      sicDescription = sub.sicDescription;
      exchanges = sub.exchanges?.filter(Boolean);
      fiscalYearEnd = sub.fiscalYearEnd;
      stateOfIncorporation = sub.stateOfIncorporationDescription || sub.stateOfIncorporation;
      recentFilings = await getRecentFilings(cik, ["10-K", "10-Q", "8-K"], 12);
    }

    if (factsResult.status === "fulfilled") {
      const f = factsResult.value;

      // 营收：优先使用 ASC 606 新准则概念，回退到旧准则
      keyFinancials.revenue =
        extractFinancialSeries(f, "RevenueFromContractWithCustomerExcludingAssessedTax", "USD", "10-K", 5);
      if (keyFinancials.revenue.length === 0) {
        keyFinancials.revenue = extractFinancialSeries(f, "Revenues", "USD", "10-K", 5);
      }
      if (keyFinancials.revenue.length === 0) {
        keyFinancials.revenue = extractFinancialSeries(f, "SalesRevenueNet", "USD", "10-K", 5);
      }

      // 净利润
      keyFinancials.netIncome = extractFinancialSeries(f, "NetIncomeLoss", "USD", "10-K", 5);

      // EPS（注意：单位是 USD/shares，不是 USD）
      keyFinancials.eps = extractFinancialSeries(f, "EarningsPerShareBasic", "USD/shares", "10-K", 5);
      if (keyFinancials.eps.length === 0) {
        keyFinancials.eps = extractFinancialSeries(f, "EarningsPerShareDiluted", "USD/shares", "10-K", 5);
      }

      // 总资产
      keyFinancials.totalAssets = extractFinancialSeries(f, "Assets", "USD", "10-K", 5);

      // 总负债
      keyFinancials.totalLiabilities = extractFinancialSeries(f, "Liabilities", "USD", "10-K", 5);

      // 经营活动现金流
      keyFinancials.operatingCashFlow =
        extractFinancialSeries(f, "NetCashProvidedByUsedInOperatingActivities", "USD", "10-K", 5);

      // 研发费用（科技公司重要指标）
      keyFinancials.researchAndDevelopment =
        extractFinancialSeries(f, "ResearchAndDevelopmentExpense", "USD", "10-K", 5);
    }
  } catch {
    // 静默失败，返回部分数据
  }

  return {
    ticker: sym,
    cik,
    companyName,
    sic,
    sicDescription,
    exchanges,
    fiscalYearEnd,
    stateOfIncorporation,
    recentFilings: recentFilings.slice(0, 12),
    keyFinancials,
    source: "SEC EDGAR",
    fetchedAt: new Date().toISOString(),
  };
}

// ─── 格式化输出 ────────────────────────────────────────────────────────────

/** 格式化 SEC EDGAR 数据为 Markdown */
export function formatSecData(data: SecEdgarStockData): string {
  const lines: string[] = [];
  lines.push(`## SEC EDGAR 财务数据 — ${data.ticker}`);
  lines.push(`*数据来源：SEC EDGAR XBRL API | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*`);

  if (data.companyName) {
    lines.push(`\n**公司：** ${data.companyName}  |  **CIK：** ${data.cik}`);
  }
  if (data.sicDescription) {
    lines.push(`**行业（SIC）：** ${data.sicDescription} (${data.sic})`);
  }
  if (data.exchanges?.length) {
    lines.push(`**交易所：** ${data.exchanges.join(", ")}`);
  }
  if (data.stateOfIncorporation) {
    lines.push(`**注册地：** ${data.stateOfIncorporation}`);
  }
  if (data.fiscalYearEnd) {
    lines.push(`**财年末：** ${data.fiscalYearEnd}`);
  }

  const { revenue, netIncome, eps, totalAssets, totalLiabilities, operatingCashFlow, researchAndDevelopment } = data.keyFinancials;

  // 综合财务摘要表
  if (revenue.length > 0 || netIncome.length > 0) {
    lines.push(`\n### 年度财务摘要（10-K，最近 ${Math.max(revenue.length, netIncome.length)} 年）`);
    const periodsSet = new Set([...revenue.map(d => d.period), ...netIncome.map(d => d.period)]);
    const periods = Array.from(periodsSet).sort().reverse().slice(0, 5);

    lines.push(`| 财年末 | 营收 | 净利润 | 净利率 |`);
    lines.push(`|--------|------|--------|--------|`);
    for (const p of periods) {
      const rev = revenue.find(d => d.period === p);
      const ni = netIncome.find(d => d.period === p);
      const margin = rev && ni && rev.value !== 0
        ? `${((ni.value / rev.value) * 100).toFixed(1)}%`
        : "N/A";
      lines.push(`| ${p} | ${rev ? `$${(rev.value / 1e9).toFixed(2)}B` : "N/A"} | ${ni ? `$${(ni.value / 1e9).toFixed(2)}B` : "N/A"} | ${margin} |`);
    }
  }

  if (eps.length > 0) {
    lines.push(`\n### 年度 EPS（10-K，基本每股收益）`);
    lines.push(`| 财年末 | EPS |`);
    lines.push(`|--------|-----|`);
    for (const d of eps) {
      lines.push(`| ${d.period} | $${d.value.toFixed(2)} |`);
    }
  }

  if (totalAssets.length > 0 || totalLiabilities.length > 0) {
    lines.push(`\n### 资产负债（10-K）`);
    lines.push(`| 财年末 | 总资产 | 总负债 | 净资产 |`);
    lines.push(`|--------|--------|--------|--------|`);
    const periodsSet2 = new Set([...totalAssets.map(d => d.period), ...totalLiabilities.map(d => d.period)]);
    const periods = Array.from(periodsSet2).sort().reverse().slice(0, 5);
    for (const p of periods) {
      const assets = totalAssets.find(d => d.period === p);
      const liab = totalLiabilities.find(d => d.period === p);
      const equity = assets && liab ? `$${((assets.value - liab.value) / 1e9).toFixed(2)}B` : "N/A";
      lines.push(`| ${p} | ${assets ? `$${(assets.value / 1e9).toFixed(2)}B` : "N/A"} | ${liab ? `$${(liab.value / 1e9).toFixed(2)}B` : "N/A"} | ${equity} |`);
    }
  }

  if (operatingCashFlow.length > 0) {
    lines.push(`\n### 经营活动现金流（10-K）`);
    lines.push(`| 财年末 | 经营现金流 |`);
    lines.push(`|--------|-----------|`);
    for (const d of operatingCashFlow) {
      lines.push(`| ${d.period} | $${(d.value / 1e9).toFixed(2)}B |`);
    }
  }

  if (researchAndDevelopment.length > 0) {
    lines.push(`\n### 研发费用（10-K）`);
    lines.push(`| 财年末 | 研发费用 |`);
    lines.push(`|--------|---------|`);
    for (const d of researchAndDevelopment) {
      lines.push(`| ${d.period} | $${(d.value / 1e9).toFixed(2)}B |`);
    }
  }

  if (data.recentFilings.length > 0) {
    lines.push(`\n### 最近 SEC 报告文件`);
    lines.push(`| 报告类型 | 提交日期 | 报告期 | 文件 |`);
    lines.push(`|----------|----------|--------|------|`);
    for (const f of data.recentFilings.slice(0, 10)) {
      const docLink = f.url ? `[查看](${f.url})` : "N/A";
      lines.push(`| ${f.form} | ${f.filingDate} | ${f.reportDate || "N/A"} | ${docLink} |`);
    }
  }

  return lines.join("\n");
}

// ─── 健康检测 ──────────────────────────────────────────────────────────────

/** 健康检测（使用苹果公司 CIK 测试） */
export async function checkHealth(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const t0 = Date.now();
  try {
    // 轻量测试：只获取提交记录，不获取全量 XBRL 数据
    const info = await getCompanySubmissions("0000320193");
    const latencyMs = Date.now() - t0;
    if (info.name) {
      return { ok: true, latencyMs, detail: `${info.name} (CIK: ${info.cik})` };
    }
    return { ok: false, latencyMs, detail: "返回数据异常" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, detail: String(e) };
  }
}

// ─── 任务关键词检测（供 Step2 条件触发） ──────────────────────────────────

/**
 * 检测任务描述是否需要 SEC EDGAR 数据
 * 触发条件：美股分析、财务报表、SEC 文件、XBRL、10-K/10-Q/8-K 等关键词
 */
export function shouldFetchSecEdgar(taskDescription: string): boolean {
  const text = taskDescription.toLowerCase();
  const triggers = [
    "sec", "edgar", "10-k", "10-q", "8-k", "xbrl",
    "annual report", "quarterly report", "earnings report",
    "financial statement", "财务报表", "年报", "季报",
    "sec filing", "sec 文件", "美股财报",
    "revenue", "net income", "eps", "earnings per share",
    "total assets", "balance sheet", "cash flow",
    "营收", "净利润", "每股收益", "总资产", "资产负债", "现金流",
    "研发费用", "r&d expense",
  ];
  return triggers.some(t => text.includes(t));
}
