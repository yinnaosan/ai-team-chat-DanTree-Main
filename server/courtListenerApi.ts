/**
 * CourtListener API — 美国联邦法院判决与诉讼数据库
 * https://www.courtlistener.com/api/rest/v4/
 *
 * 认证：Token Authentication（需要 COURTLISTENER_API_KEY）
 * 速率限制：5,000 req/day（免费），认证用户更高
 *
 * 主要端点：
 * - /opinions/   — 判决书全文（含文本）
 * - /clusters/   — 案件判决集群（含引用、法官）
 * - /dockets/    — 诉讼案件元数据
 * - /search/     — 全文搜索（判决 + 诉讼）
 */

import { ENV } from "./_core/env";

const BASE_URL = "https://www.courtlistener.com/api/rest/v4";
const API_KEY = ENV.COURTLISTENER_API_KEY || "d79de03f84c80caf0f47bb7881f6f1856611f7b1";

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface CourtListenerOpinion {
  id: number;
  resource_uri: string;
  cluster_id: number;
  case_name: string;
  date_filed: string;
  court: string;
  court_id: string;
  plain_text: string;
  html: string;
  download_url: string;
  absolute_url: string;
  citations: string[];
  judges: string;
  nature_of_suit: string;
  status: string;
}

export interface CourtListenerDocket {
  id: number;
  case_name: string;
  docket_number: string;
  court_id: string;
  date_filed: string;
  date_terminated: string | null;
  cause: string;
  nature_of_suit: string;
  jurisdiction_type: string;
  absolute_url: string;
  pacer_case_id: string | null;
}

export interface CourtListenerSearchResult {
  count: number;
  results: Array<{
    id: number;
    case_name: string;
    case_name_short: string;
    docket_number: string;
    court_id: string;
    date_filed: string;
    status: string;
    snippet: string;
    absolute_url: string;
    citations: string[];
    judges: string;
    nature_of_suit: string;
  }>;
}

export interface CourtListenerCompanyLitigation {
  company: string;
  totalCases: number;
  recentCases: Array<{
    caseId: number;
    caseName: string;
    docketNumber: string;
    court: string;
    dateFiled: string;
    dateTerminated: string | null;
    cause: string;
    natureOfSuit: string;
    status: string;
    url: string;
  }>;
  summary: string;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "User-Agent": "InvestmentPlatform/1.0 (research@investplatform.com)",
  };
  if (API_KEY) {
    headers["Authorization"] = `Token ${API_KEY}`;
  }
  return headers;
}

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: getHeaders(),
      signal: controller.signal,
    });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 核心功能 ────────────────────────────────────────────────────────────────

/**
 * 搜索判决书（opinions）
 * @param query 搜索关键词（公司名、法律术语等）
 * @param limit 返回数量（默认 5）
 */
export async function searchOpinions(
  query: string,
  limit = 5
): Promise<CourtListenerSearchResult> {
  const url = `${BASE_URL}/opinions/?q=${encodeURIComponent(query)}&page_size=${limit}&order_by=-score`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) {
    throw new Error(`CourtListener opinions search failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json() as {
    count: number;
    results: Array<Record<string, unknown>>;
  };

  return {
    count: data.count,
    results: (data.results || []).map((r) => ({
      id: r.id as number,
      case_name: (r.case_name as string) || "",
      case_name_short: (r.case_name_short as string) || "",
      docket_number: (r.docket_number as string) || "",
      court_id: (r.court_id as string) || "",
      date_filed: (r.date_filed as string) || "",
      status: (r.status as string) || "",
      snippet: (r.snippet as string) || "",
      absolute_url: `https://www.courtlistener.com${r.absolute_url as string || ""}`,
      citations: (r.citations as string[]) || [],
      judges: (r.judges as string) || "",
      nature_of_suit: (r.nature_of_suit as string) || "",
    })),
  };
}

/**
 * 搜索诉讼案件（dockets）
 * @param companyName 公司名称
 * @param limit 返回数量（默认 10）
 */
export async function searchDockets(
  companyName: string,
  limit = 10
): Promise<{ count: number; dockets: CourtListenerDocket[] }> {
  const url = `${BASE_URL}/dockets/?q=${encodeURIComponent(companyName)}&page_size=${limit}&order_by=-date_filed`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) {
    throw new Error(`CourtListener dockets search failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json() as {
    count: number;
    results: Array<Record<string, unknown>>;
  };

  return {
    count: data.count,
    dockets: (data.results || []).map((r) => ({
      id: r.id as number,
      case_name: (r.case_name as string) || "",
      docket_number: (r.docket_number as string) || "",
      court_id: (r.court_id as string) || "",
      date_filed: (r.date_filed as string) || "",
      date_terminated: (r.date_terminated as string | null) || null,
      cause: (r.cause as string) || "",
      nature_of_suit: (r.nature_of_suit as string) || "",
      jurisdiction_type: (r.jurisdiction_type as string) || "",
      absolute_url: `https://www.courtlistener.com${r.absolute_url as string || ""}`,
      pacer_case_id: (r.pacer_case_id as string | null) || null,
    })),
  };
}

/**
 * 获取公司诉讼历史摘要（合并 opinions + dockets）
 * @param companyName 公司名称
 */
export async function getCompanyLitigationHistory(
  companyName: string
): Promise<CourtListenerCompanyLitigation> {
  const [opinionsResult, docketsResult] = await Promise.allSettled([
    searchOpinions(companyName, 5),
    searchDockets(companyName, 10),
  ]);

  const opinions = opinionsResult.status === "fulfilled" ? opinionsResult.value : { count: 0, results: [] };
  const dockets = docketsResult.status === "fulfilled" ? docketsResult.value : { count: 0, dockets: [] };

  const recentCases = dockets.dockets.map((d) => ({
    caseId: d.id,
    caseName: d.case_name,
    docketNumber: d.docket_number,
    court: d.court_id.toUpperCase(),
    dateFiled: d.date_filed,
    dateTerminated: d.date_terminated,
    cause: d.cause,
    natureOfSuit: d.nature_of_suit,
    status: d.date_terminated ? "Terminated" : "Active",
    url: d.absolute_url,
  }));

  // 统计活跃 vs 已结案
  const activeCases = recentCases.filter((c) => c.status === "Active").length;
  const terminatedCases = recentCases.filter((c) => c.status === "Terminated").length;

  // 统计常见诉讼类型
  const suitTypes = recentCases
    .map((c) => c.natureOfSuit)
    .filter(Boolean)
    .reduce((acc: Record<string, number>, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});
  const topSuitType = Object.entries(suitTypes).sort((a, b) => b[1] - a[1])[0];

  const summary = [
    `共找到 ${dockets.count} 个诉讼案件（显示最近 ${recentCases.length} 个）`,
    `活跃案件 ${activeCases} 个，已结案 ${terminatedCases} 个`,
    topSuitType ? `最常见诉讼类型：${topSuitType[0]}（${topSuitType[1]} 次）` : "",
    opinions.count > 0 ? `相关判决书 ${opinions.count} 份` : "",
  ].filter(Boolean).join("；");

  return {
    company: companyName,
    totalCases: dockets.count,
    recentCases,
    summary,
  };
}

/**
 * 智能触发判断：是否应该查询 CourtListener
 * 当任务涉及法律诉讼、监管处罚、合规风险时触发
 */
export function shouldFetchCourtListener(taskDescription: string): boolean {
  const keywords = [
    // 英文关键词
    "lawsuit", "litigation", "court", "sue", "sued", "legal action",
    "class action", "settlement", "penalty", "fine", "enforcement",
    "SEC enforcement", "DOJ", "antitrust", "fraud", "securities fraud",
    "regulatory", "compliance risk", "legal risk", "court case",
    "federal court", "district court", "appeals court", "PACER",
    // 中文关键词
    "诉讼", "起诉", "法院", "判决", "罚款", "处罚", "合规风险",
    "法律风险", "监管处罚", "集体诉讼", "和解", "证券欺诈",
    "反垄断", "执法行动", "违规", "法律纠纷",
  ];
  const lower = taskDescription.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * 格式化诉讼历史为 Markdown
 */
export function formatLitigationAsMarkdown(data: CourtListenerCompanyLitigation): string {
  const lines: string[] = [
    `## ⚖️ ${data.company} — 美国联邦法院诉讼记录`,
    "",
    `> **数据来源：** CourtListener（Free Law Project）| **数据截至：** ${new Date().toISOString().split("T")[0]}`,
    "",
    `**摘要：** ${data.summary}`,
    "",
  ];

  if (data.recentCases.length === 0) {
    lines.push("*未找到相关联邦法院诉讼记录。*");
    return lines.join("\n");
  }

  lines.push("### 近期诉讼案件");
  lines.push("");
  lines.push("| 案件名称 | 法院 | 案号 | 起诉日期 | 状态 | 诉讼类型 |");
  lines.push("|---|---|---|---|---|---|");

  for (const c of data.recentCases.slice(0, 8)) {
    const name = c.caseName.length > 50 ? c.caseName.substring(0, 47) + "..." : c.caseName;
    const status = c.status === "Active" ? "🔴 进行中" : "✅ 已结案";
    lines.push(
      `| [${name}](${c.url}) | ${c.court} | ${c.docketNumber || "—"} | ${c.dateFiled || "—"} | ${status} | ${c.natureOfSuit || "—"} |`
    );
  }

  lines.push("");
  lines.push(`*完整记录请访问 [CourtListener](https://www.courtlistener.com/?q=${encodeURIComponent(data.company)})*`);

  return lines.join("\n");
}

/**
 * 健康检测
 */
export async function checkHealth(): Promise<{
  status: "ok" | "error";
  message: string;
  authenticated: boolean;
}> {
  try {
    const url = `${BASE_URL}/courts/?page_size=1`;
    const resp = await fetchWithTimeout(url, 8000);
    if (resp.ok) {
      return {
        status: "ok",
        message: `CourtListener API 正常 (HTTP ${resp.status})`,
        authenticated: !!API_KEY,
      };
    }
    return {
      status: "error",
      message: `HTTP ${resp.status}: ${resp.statusText}`,
      authenticated: !!API_KEY,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
      authenticated: false,
    };
  }
}
