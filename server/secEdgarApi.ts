/**
 * SEC EDGAR API 模块
 * 数据来源：SEC EDGAR (https://www.sec.gov/cgi-bin/browse-edgar)
 * 提供：公司财务报告（10-K/10-Q/8-K）、XBRL 财务数据、机构持仓（13F）
 * 注意：SEC EDGAR 为免费公开 API，需设置 User-Agent 标头
 */

const EDGAR_BASE = "https://data.sec.gov";
const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";
const USER_AGENT = "InvestmentPlatform admin@investplatform.com";

async function fetchEdgar<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`SEC EDGAR HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
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
        USD?: Array<{ end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string; frame?: string }>;
        shares?: Array<{ end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string }>;
        pure?: Array<{ end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string }>;
      };
    }>;
    dei?: Record<string, unknown>;
  };
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────

/** 将 ticker 转换为 CIK（通过搜索） */
export async function tickerToCik(ticker: string): Promise<string | null> {
  try {
    const url = `${EDGAR_SEARCH}?q=%22${encodeURIComponent(ticker.toUpperCase())}%22&forms=10-K&dateRange=custom&startdt=2020-01-01`;
    const data = await fetchEdgar<{ hits: { hits: Array<{ _source: { entity_id: string; entity_name: string; tickers: string[] } }> } }>(url);
    const hits = data.hits?.hits ?? [];
    // 精确匹配 ticker
    const match = hits.find(h => h._source.tickers?.includes(ticker.toUpperCase()));
    if (match) return match._source.entity_id;
    // 回退：使用公司搜索 API
    const companyUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(ticker.toUpperCase())}%22&forms=10-K`;
    const companyData = await fetchEdgar<{ hits: { hits: Array<{ _source: { entity_id: string } }> } }>(companyUrl);
    return companyData.hits?.hits?.[0]?._source?.entity_id ?? null;
  } catch {
    return null;
  }
}

/** 格式化 CIK（补零至 10 位） */
function formatCik(cik: string): string {
  return cik.replace(/^CIK/, "").padStart(10, "0");
}

// ─── 核心函数 ──────────────────────────────────────────────────────────────

/** 获取公司提交记录（含最近文件列表） */
export async function getCompanySubmissions(cik: string): Promise<EdgarCompanyInfo> {
  const formattedCik = formatCik(cik);
  return fetchEdgar<EdgarCompanyInfo>(`${EDGAR_BASE}/submissions/CIK${formattedCik}.json`);
}

/** 获取公司 XBRL 财务事实数据 */
export async function getCompanyFacts(cik: string): Promise<EdgarXbrlData> {
  const formattedCik = formatCik(cik);
  return fetchEdgar<EdgarXbrlData>(`${EDGAR_BASE}/api/xbrl/companyfacts/CIK${formattedCik}.json`);
}

/** 获取单一财务概念数据（如营收、净利润） */
export async function getCompanyConcept(
  cik: string,
  taxonomy: "us-gaap" | "dei",
  concept: string
): Promise<{ entityName: string; units: Record<string, Array<{ end: string; val: number; form: string; filed: string }>> }> {
  const formattedCik = formatCik(cik);
  return fetchEdgar(`${EDGAR_BASE}/api/xbrl/companyconcept/CIK${formattedCik}/${taxonomy}/${concept}.json`);
}

/** 获取最近的财务报告列表 */
export async function getRecentFilings(cik: string, forms: string[] = ["10-K", "10-Q", "8-K"]): Promise<EdgarCompanyFiling[]> {
  const info = await getCompanySubmissions(cik);
  const recent = info.filings?.recent;
  if (!recent) return [];

  const filings: EdgarCompanyFiling[] = [];
  const count = recent.accessionNumber.length;
  for (let i = 0; i < count && filings.length < 20; i++) {
    if (forms.includes(recent.form[i])) {
      filings.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i],
        form: recent.form[i],
        primaryDocument: recent.primaryDocument[i],
        primaryDocDescription: recent.primaryDocDescription[i],
        size: recent.size[i],
      });
    }
  }
  return filings;
}

/** 健康检测 */
export async function checkHealth(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const t0 = Date.now();
  try {
    // 使用苹果公司 CIK 测试
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

// ─── 综合数据（供 Step2 数据引擎调用） ────────────────────────────────────

export interface SecEdgarStockData {
  ticker: string;
  cik: string | null;
  companyName: string | null;
  recentFilings: EdgarCompanyFiling[];
  keyFinancials: {
    revenue: Array<{ period: string; value: number; form: string }>;
    netIncome: Array<{ period: string; value: number; form: string }>;
    eps: Array<{ period: string; value: number; form: string }>;
    totalAssets: Array<{ period: string; value: number; form: string }>;
  };
  source: string;
  fetchedAt: string;
}

/** 提取关键财务数据（年报 10-K，最近 5 年） */
function extractFinancialSeries(
  facts: EdgarXbrlData,
  concept: string,
  form = "10-K",
  limit = 5
): Array<{ period: string; value: number; form: string }> {
  const data = facts.facts?.["us-gaap"]?.[concept];
  if (!data?.units?.USD) return [];
  return data.units.USD
    .filter(d => d.form === form && d.end)
    .sort((a, b) => b.end.localeCompare(a.end))
    .slice(0, limit)
    .map(d => ({ period: d.end, value: d.val, form: d.form }));
}

export async function getStockFullData(ticker: string): Promise<SecEdgarStockData> {
  const sym = ticker.toUpperCase();
  let cik: string | null = null;
  let companyName: string | null = null;
  let recentFilings: EdgarCompanyFiling[] = [];
  const keyFinancials = { revenue: [], netIncome: [], eps: [], totalAssets: [] } as SecEdgarStockData["keyFinancials"];

  try {
    cik = await tickerToCik(sym);
    if (!cik) throw new Error(`找不到 ${sym} 的 CIK`);

    const [submissions, facts] = await Promise.allSettled([
      getCompanySubmissions(cik),
      getCompanyFacts(cik),
    ]);

    if (submissions.status === "fulfilled") {
      companyName = submissions.value.name;
      recentFilings = await getRecentFilings(cik, ["10-K", "10-Q", "8-K"]);
    }

    if (facts.status === "fulfilled") {
      const f = facts.value;
      // 营收：优先 RevenueFromContractWithCustomerExcludingAssessedTax，回退 Revenues
      keyFinancials.revenue = extractFinancialSeries(f, "RevenueFromContractWithCustomerExcludingAssessedTax") ||
        extractFinancialSeries(f, "Revenues");
      keyFinancials.netIncome = extractFinancialSeries(f, "NetIncomeLoss");
      keyFinancials.eps = extractFinancialSeries(f, "EarningsPerShareBasic").map(d => ({
        ...d,
        value: d.value, // EPS 单位为 USD/share
      }));
      keyFinancials.totalAssets = extractFinancialSeries(f, "Assets");
    }
  } catch {
    // 静默失败，返回部分数据
  }

  return {
    ticker: sym,
    cik,
    companyName,
    recentFilings: recentFilings.slice(0, 10),
    keyFinancials,
    source: "SEC EDGAR",
    fetchedAt: new Date().toISOString(),
  };
}

/** 格式化 SEC EDGAR 数据为 Markdown */
export function formatSecData(data: SecEdgarStockData): string {
  const lines: string[] = [];
  lines.push(`## SEC EDGAR 财务数据 — ${data.ticker}`);
  lines.push(`*数据来源：SEC EDGAR XBRL API | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}*`);
  if (data.companyName) lines.push(`*公司：${data.companyName}  CIK：${data.cik}*\n`);

  const { revenue, netIncome, eps, totalAssets } = data.keyFinancials;

  if (revenue.length > 0) {
    lines.push(`### 年度营收（10-K，最近 ${revenue.length} 年）`);
    lines.push(`| 财年末 | 营收 |`);
    lines.push(`|--------|------|`);
    for (const d of revenue) {
      lines.push(`| ${d.period} | $${(d.value / 1e9).toFixed(2)}B |`);
    }
  }

  if (netIncome.length > 0) {
    lines.push(`\n### 年度净利润（10-K，最近 ${netIncome.length} 年）`);
    lines.push(`| 财年末 | 净利润 |`);
    lines.push(`|--------|--------|`);
    for (const d of netIncome) {
      lines.push(`| ${d.period} | $${(d.value / 1e9).toFixed(2)}B |`);
    }
  }

  if (eps.length > 0) {
    lines.push(`\n### 年度 EPS（10-K，最近 ${eps.length} 年）`);
    lines.push(`| 财年末 | EPS |`);
    lines.push(`|--------|-----|`);
    for (const d of eps) {
      lines.push(`| ${d.period} | $${d.value.toFixed(2)} |`);
    }
  }

  if (totalAssets.length > 0) {
    lines.push(`\n### 年度总资产（10-K，最近 ${totalAssets.length} 年）`);
    lines.push(`| 财年末 | 总资产 |`);
    lines.push(`|--------|--------|`);
    for (const d of totalAssets) {
      lines.push(`| ${d.period} | $${(d.value / 1e9).toFixed(2)}B |`);
    }
  }

  if (data.recentFilings.length > 0) {
    lines.push(`\n### 最近 SEC 报告`);
    lines.push(`| 报告类型 | 提交日期 | 报告期 |`);
    lines.push(`|----------|----------|--------|`);
    for (const f of data.recentFilings.slice(0, 8)) {
      const accn = f.accessionNumber.replace(/-/g, "");
      const url = `https://www.sec.gov/Archives/edgar/data/${data.cik}/${accn}/${f.primaryDocument}`;
      lines.push(`| [${f.form}](${url}) | ${f.filingDate} | ${f.reportDate || "N/A"} |`);
    }
  }

  return lines.join("\n");
}
