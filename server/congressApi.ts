/**
 * Congress.gov API — 美国国会立法数据库
 * https://api.congress.gov/
 *
 * 认证：API Key（查询参数 api_key=...）
 * 速率限制：5,000 req/hour（免费）
 * 文档：https://api.congress.gov/#/
 *
 * 主要端点：
 * - /bill              — 法案列表与搜索
 * - /bill/{congress}/{type}/{number} — 法案详情
 * - /bill/{congress}/{type}/{number}/text — 法案全文
 * - /bill/{congress}/{type}/{number}/actions — 立法进展
 * - /member            — 国会议员信息
 * - /amendment         — 修正案
 * - /committee         — 委员会信息
 * - /nomination        — 总统提名
 */

const BASE_URL = "https://api.congress.gov/v3";
const API_KEY = process.env.CONGRESS_API_KEY || "";

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface CongressBill {
  congress: number;
  type: string;
  number: string;
  title: string;
  originChamber: string;
  originChamberCode: string;
  introducedDate: string;
  latestAction: {
    actionDate: string;
    text: string;
  };
  sponsors: Array<{
    bioguideId: string;
    fullName: string;
    party: string;
    state: string;
  }>;
  url: string;
  policyArea?: { name: string };
  subjects?: string[];
}

export interface CongressBillDetail extends CongressBill {
  summary?: string;
  textVersions?: Array<{
    type: string;
    date: string;
    formats: Array<{ type: string; url: string }>;
  }>;
  actions?: Array<{
    actionDate: string;
    text: string;
    type: string;
    actionCode?: string;
  }>;
  cosponsors?: Array<{
    bioguideId: string;
    fullName: string;
    party: string;
    state: string;
    sponsorshipDate: string;
  }>;
  committees?: Array<{
    name: string;
    systemCode: string;
    chamber: string;
    activities: Array<{ name: string; date: string }>;
  }>;
}

export interface CongressMember {
  bioguideId: string;
  name: string;
  party: string;
  state: string;
  district?: number;
  chamber: string;
  terms: Array<{ chamber: string; startYear: number; endYear?: number }>;
  url: string;
}

export interface CongressSearchResult {
  count: number;
  bills: CongressBill[];
  pagination: { count: number; next?: string };
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function buildUrl(path: string, params: Record<string, string | number> = {}): string {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "InvestmentPlatform/1.0 (research@investplatform.com)",
      },
      signal: controller.signal,
    });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 核心功能 ────────────────────────────────────────────────────────────────

/**
 * 搜索法案
 * @param query 搜索关键词（公司名、政策领域、法案主题等）
 * @param limit 返回数量（默认 10）
 * @param congress 国会届次（默认最新，119 届）
 */
export async function searchBills(
  query: string,
  limit = 10,
  congress?: number
): Promise<CongressSearchResult> {
  const params: Record<string, string | number> = {
    limit,
    sort: "updateDate+desc",
  };
  if (query) params["query"] = query;
  if (congress) params["congress"] = congress;

  const url = buildUrl("/bill", params);
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) {
    throw new Error(`Congress.gov bill search failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json() as {
    bills?: Array<Record<string, unknown>>;
    pagination?: { count: number; next?: string };
  };

  const bills = (data.bills || []).map(parseBill);
  return {
    count: data.pagination?.count || bills.length,
    bills,
    pagination: data.pagination || { count: bills.length },
  };
}

/**
 * 获取法案详情（含摘要、立法进展、全文链接）
 * @param congress 国会届次（如 119）
 * @param type 法案类型（hr=众议院法案, s=参议院法案, hjres, sjres 等）
 * @param number 法案编号
 */
export async function getBillDetail(
  congress: number,
  type: string,
  number: string
): Promise<CongressBillDetail> {
  const url = buildUrl(`/bill/${congress}/${type.toLowerCase()}/${number}`);
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) {
    throw new Error(`Congress.gov bill detail failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json() as { bill?: Record<string, unknown> };
  const bill = data.bill || {};

  const base = parseBill(bill);

  // 获取法案摘要
  let summary: string | undefined;
  try {
    const summaryUrl = buildUrl(`/bill/${congress}/${type.toLowerCase()}/${number}/summaries`);
    const summaryResp = await fetchWithTimeout(summaryUrl, 8000);
    if (summaryResp.ok) {
      const summaryData = await summaryResp.json() as { summaries?: Array<{ text: string }> };
      const summaries = summaryData.summaries || [];
      if (summaries.length > 0) {
        // 去除 HTML 标签
        summary = summaries[summaries.length - 1].text.replace(/<[^>]+>/g, " ").trim();
      }
    }
  } catch {
    // 摘要获取失败不影响主流程
  }

  // 获取立法进展
  let actions: CongressBillDetail["actions"];
  try {
    const actionsUrl = buildUrl(`/bill/${congress}/${type.toLowerCase()}/${number}/actions`, { limit: 10 });
    const actionsResp = await fetchWithTimeout(actionsUrl, 8000);
    if (actionsResp.ok) {
      const actionsData = await actionsResp.json() as {
        actions?: Array<Record<string, unknown>>;
      };
      actions = (actionsData.actions || []).map((a) => ({
        actionDate: (a.actionDate as string) || "",
        text: (a.text as string) || "",
        type: (a.type as string) || "",
        actionCode: (a.actionCode as string) || undefined,
      }));
    }
  } catch {
    // 进展获取失败不影响主流程
  }

  return { ...base, summary, actions };
}

/**
 * 获取特定政策领域的最新法案
 * @param policyArea 政策领域（如 "Finance and Financial Sector", "Taxation", "Health"）
 * @param limit 返回数量
 */
export async function getBillsByPolicyArea(
  policyArea: string,
  limit = 10
): Promise<CongressSearchResult> {
  return searchBills(policyArea, limit);
}

/**
 * 获取国会议员信息
 * @param state 州代码（如 "CA", "NY"）
 * @param chamber 院（"house" 或 "senate"）
 */
export async function getMembers(
  state?: string,
  chamber?: "house" | "senate",
  limit = 20
): Promise<{ count: number; members: CongressMember[] }> {
  const params: Record<string, string | number> = { limit };
  if (state) params["stateCode"] = state;
  if (chamber) params["chamber"] = chamber;

  const url = buildUrl("/member", params);
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) {
    throw new Error(`Congress.gov member search failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json() as {
    members?: Array<Record<string, unknown>>;
    pagination?: { count: number };
  };

  const members = (data.members || []).map((m) => ({
    bioguideId: (m.bioguideId as string) || "",
    name: (m.name as string) || "",
    party: (m.partyName as string) || (m.party as string) || "",
    state: (m.state as string) || "",
    district: (m.district as number) || undefined,
    chamber: (m.chamber as string) || "",
    terms: (m.terms as Array<{ chamber: string; startYear: number; endYear?: number }>) || [],
    url: `https://www.congress.gov/member/${(m.bioguideId as string)?.toLowerCase() || ""}`,
  }));

  return {
    count: data.pagination?.count || members.length,
    members,
  };
}

/**
 * 获取与特定公司/行业相关的最新立法动态
 * @param companyOrIndustry 公司名或行业关键词
 */
export async function getRelatedLegislation(
  companyOrIndustry: string
): Promise<{
  query: string;
  totalBills: number;
  recentBills: CongressBill[];
  summary: string;
}> {
  const result = await searchBills(companyOrIndustry, 8);

  // 统计政策领域分布
  const policyAreas = result.bills
    .map((b) => b.policyArea?.name)
    .filter(Boolean)
    .reduce((acc: Record<string, number>, area) => {
      acc[area!] = (acc[area!] || 0) + 1;
      return acc;
    }, {});

  const topArea = Object.entries(policyAreas).sort((a, b) => b[1] - a[1])[0];

  // 统计最近立法状态
  const recentActions = result.bills
    .filter((b) => b.latestAction?.text)
    .map((b) => b.latestAction.text)
    .slice(0, 3);

  const summary = [
    `找到 ${result.count} 个相关法案（显示最近 ${result.bills.length} 个）`,
    topArea ? `主要政策领域：${topArea[0]}（${topArea[1]} 个法案）` : "",
    recentActions.length > 0 ? `最新进展：${recentActions[0].substring(0, 100)}` : "",
  ].filter(Boolean).join("；");

  return {
    query: companyOrIndustry,
    totalBills: result.count,
    recentBills: result.bills,
    summary,
  };
}

// ─── 辅助解析 ────────────────────────────────────────────────────────────────

function parseBill(b: Record<string, unknown>): CongressBill {
  const latestAction = (b.latestAction as Record<string, string>) || {};
  const sponsors = (b.sponsors as Array<Record<string, string>>) || [];
  const policyArea = (b.policyArea as Record<string, string>) || undefined;

  return {
    congress: (b.congress as number) || 0,
    type: (b.type as string) || "",
    number: (b.number as string) || "",
    title: (b.title as string) || "",
    originChamber: (b.originChamber as string) || "",
    originChamberCode: (b.originChamberCode as string) || "",
    introducedDate: (b.introducedDate as string) || "",
    latestAction: {
      actionDate: latestAction.actionDate || "",
      text: latestAction.text || "",
    },
    sponsors: sponsors.map((s) => ({
      bioguideId: s.bioguideId || "",
      fullName: s.fullName || "",
      party: s.party || "",
      state: s.state || "",
    })),
    url: (b.url as string) || `https://www.congress.gov/bill/${b.congress}th-congress/${(b.type as string)?.toLowerCase()}-bill/${b.number}`,
    policyArea: policyArea ? { name: policyArea.name || "" } : undefined,
  };
}

// ─── 智能触发 ────────────────────────────────────────────────────────────────

/**
 * 判断是否应该查询 Congress.gov
 * 当任务涉及美国立法、政策、监管法案时触发
 */
export function shouldFetchCongress(taskDescription: string): boolean {
  const keywords = [
    // 英文 — 立法机构
    "congress", "legislation", "bill", "senate", "house of representatives",
    "law", "regulation", "policy", "act", "amendment", "vote", "bipartisan",
    "dodd-frank", "sarbanes-oxley", "inflation reduction act", "chips act",
    "antitrust bill", "tax bill", "tariff", "trade policy",
    "federal reserve act", "banking regulation", "financial regulation",
    // 英文 — 金融监管机构
    "SEC", "CFTC", "FINRA", "OCC", "FDIC", "CFPB", "FTC", "DOJ antitrust",
    "SEC rule", "SEC enforcement", "SEC investigation", "SEC filing requirement",
    "CFTC rule", "CFTC enforcement", "derivatives regulation", "swap regulation",
    "Treasury", "U.S. Treasury", "Treasury Department", "Treasury regulation",
    "IRS", "tax regulation", "capital gains tax", "corporate tax",
    "Basel", "stress test", "Volcker rule", "Glass-Steagall",
    "AML", "anti-money laundering", "KYC regulation", "BSA",
    "crypto regulation", "stablecoin bill", "digital asset regulation",
    "sanctions", "OFAC", "export control", "ITAR",
    // 中文 — 立法机构
    "美国国会", "立法", "法案", "参议院", "众议院", "监管法规",
    "政策法规", "美国法律", "联邦法规", "国会投票", "贸易政策",
    "关税法案", "金融监管法", "税收法案", "反垄断法",
    // 中文 — 金融监管机构
    "证券交易委员会", "SEC监管", "SEC调查", "SEC执法",
    "商品期货交易委员会", "CFTC监管", "衍生品监管",
    "美国财政部", "财政部法规", "财政部监管",
    "反洗錢监管", "客户尽调监管", "制裁法规", "OFAC制裁",
    "加密货币监管", "稳定币法案", "数字资产监管",
    "巴塞尔协议", "压力测试", "沃尔克规则",
  ];
  const lower = taskDescription.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// ─── 格式化输出 ────────────────────────────────────────────────────────────────

/**
 * 格式化立法数据为 Markdown
 */
export function formatLegislationAsMarkdown(data: {
  query: string;
  totalBills: number;
  recentBills: CongressBill[];
  summary: string;
}): string {
  const lines: string[] = [
    `## 🏛️ 美国国会立法动态 — "${data.query}"`,
    "",
    `> **数据来源：** Congress.gov（美国国会图书馆官方 API）| **数据截至：** ${new Date().toISOString().split("T")[0]}`,
    "",
    `**摘要：** ${data.summary}`,
    "",
  ];

  if (data.recentBills.length === 0) {
    lines.push("*未找到相关立法记录。*");
    return lines.join("\n");
  }

  lines.push("### 近期相关法案");
  lines.push("");
  lines.push("| 法案编号 | 标题 | 提出日期 | 政策领域 | 最新进展 |");
  lines.push("|---|---|---|---|---|");

  for (const b of data.recentBills.slice(0, 8)) {
    const billNum = `${b.congress}th ${b.type}-${b.number}`;
    const title = b.title.length > 60 ? b.title.substring(0, 57) + "..." : b.title;
    const policyArea = b.policyArea?.name || "—";
    const latestAction = b.latestAction?.text
      ? b.latestAction.text.substring(0, 60) + (b.latestAction.text.length > 60 ? "..." : "")
      : "—";
    lines.push(`| [${billNum}](${b.url}) | ${title} | ${b.introducedDate || "—"} | ${policyArea} | ${latestAction} |`);
  }

  lines.push("");
  lines.push(`*完整法案记录请访问 [Congress.gov](https://www.congress.gov/search?q=${encodeURIComponent(data.query)})*`);

  return lines.join("\n");
}

// ─── 健康检测 ────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<{
  status: "ok" | "error";
  message: string;
  hasApiKey: boolean;
}> {
  if (!API_KEY) {
    return { status: "error", message: "缺少 CONGRESS_API_KEY 环境变量", hasApiKey: false };
  }
  try {
    const url = buildUrl("/bill", { limit: 1 });
    const resp = await fetchWithTimeout(url, 8000);
    if (resp.ok) {
      return {
        status: "ok",
        message: `Congress.gov API 正常 (HTTP ${resp.status})`,
        hasApiKey: true,
      };
    }
    if (resp.status === 403) {
      return { status: "error", message: "API Key 无效或已过期", hasApiKey: true };
    }
    return {
      status: "error",
      message: `HTTP ${resp.status}: ${resp.statusText}`,
      hasApiKey: true,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
      hasApiKey: true,
    };
  }
}
