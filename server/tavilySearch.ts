/**
 * Tavily Search API — 四Key轮换机制
 *
 * 优先级：Key1 → Key2 → Key3 → Key4
 * 单个Key返回 429/403/401 时自动切换下一个
 * 全部Key失败时调用 notifyOwner 发站内通知
 *
 * 数据获取优先级（Step2数据引擎）：
 * 1. 用户数据库链接（Tavily Extract直接抓取 + 域名范围搜索）
 * 2. Yahoo Finance（股价/财务数据）
 * 3. FRED（宏观经济数据）
 * 4. 通用金融新闻搜索（兜底）
 *
 * ⚠️ 严禁AI编造数据：无真实来源时必须明确说明"未能获取实时数据"
 */

import { notifyOwner } from "./_core/notification";

// 四个Key按顺序排列，过滤掉未配置的
const TAVILY_KEYS = [
  process.env.TAVILY_API_KEY,
  process.env.TAVILY_API_KEY_2,
  process.env.TAVILY_API_KEY_3,
  process.env.TAVILY_API_KEY_4,
].filter(Boolean) as string[];

// 记录每个Key的状态（内存级，重启后重置）
type KeyStatus = "active" | "exhausted" | "error";
const keyStatusMap = new Map<string, KeyStatus>();

// 防止重复发送通知
let allKeysExhaustedNotified = false;

export function isTavilyConfigured(): boolean {
  return TAVILY_KEYS.length > 0;
}

/** 获取四个Key的当前状态（供设置页展示） */
export function getTavilyKeyStatuses(): Array<{
  index: number;
  masked: string;
  status: KeyStatus;
  configured: boolean;
}> {
  const allKeys = [
    process.env.TAVILY_API_KEY,
    process.env.TAVILY_API_KEY_2,
    process.env.TAVILY_API_KEY_3,
    process.env.TAVILY_API_KEY_4,
  ];
  return allKeys.map((key, i) => ({
    index: i + 1,
    masked: key ? key.slice(0, 12) + "..." + key.slice(-6) : "",
    status: key ? (keyStatusMap.get(key) ?? "active") : "error",
    configured: !!key,
  }));
}

/** 判断是否是额度耗尽/认证失败的错误码 */
function isExhaustedError(status: number): boolean {
  return status === 429 || status === 403 || status === 401;
}

/** 发送所有Key耗尽通知（只发一次） */
async function notifyAllKeysExhausted(): Promise<void> {
  if (allKeysExhaustedNotified) return;
  allKeysExhaustedNotified = true;

  const statusSummary = TAVILY_KEYS.map((k, i) => {
    const s = keyStatusMap.get(k) ?? "active";
    return `Key${i + 1}(${k.slice(0, 10)}...): ${s}`;
  }).join("\n");

  console.error("[Tavily] All keys exhausted or failed");

  try {
    await notifyOwner({
      title: "⚠️ Tavily API 所有Key已耗尽",
      content: `DanTree 数据引擎的 Tavily 搜索功能已无法使用，请前往设置补充新的 API Key。\n\n当前状态：\n${statusSummary}\n\n请访问 https://app.tavily.com 获取新的 API Key，然后在设置页「资料数据库」Tab 更新。`,
    });
  } catch (err) {
    console.error("[Tavily] Failed to send owner notification:", err);
  }
}

export interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score?: number;
  published_date?: string;
}

/** 核心搜索请求，带四Key轮换 */
async function tavilySearchRequest(
  payload: Record<string, unknown>
): Promise<TavilyResult[]> {
  if (TAVILY_KEYS.length === 0) return [];

  let anyActive = false;

  for (let i = 0; i < TAVILY_KEYS.length; i++) {
    const key = TAVILY_KEYS[i];
    const currentStatus = keyStatusMap.get(key) ?? "active";
    if (currentStatus === "exhausted") continue;

    anyActive = true;

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, api_key: key }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        keyStatusMap.set(key, "active");
        allKeysExhaustedNotified = false; // 重置通知状态
        const data = await res.json() as { results: TavilyResult[] };
        return data.results ?? [];
      }

      if (isExhaustedError(res.status)) {
        console.warn(`[Tavily] Key ${i + 1} exhausted (HTTP ${res.status}), switching to next`);
        keyStatusMap.set(key, "exhausted");
        continue;
      }

      console.error(`[Tavily] Key ${i + 1} HTTP ${res.status}`);
      keyStatusMap.set(key, "error");
      continue;
    } catch (err) {
      console.error(`[Tavily] Key ${i + 1} network error:`, err);
      keyStatusMap.set(key, "error");
      continue;
    }
  }

  // 全部Key失败
  await notifyAllKeysExhausted();
  return [];
}

/** 核心Extract请求（直接抓取URL内容），带四Key轮换 */
async function tavilyExtractRequest(urls: string[]): Promise<TavilyResult[]> {
  if (TAVILY_KEYS.length === 0 || urls.length === 0) return [];

  for (let i = 0; i < TAVILY_KEYS.length; i++) {
    const key = TAVILY_KEYS[i];
    if ((keyStatusMap.get(key) ?? "active") === "exhausted") continue;

    try {
      const res = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, api_key: key }),
        signal: AbortSignal.timeout(20000),
      });

      if (res.ok) {
        keyStatusMap.set(key, "active");
        const data = await res.json() as { results: TavilyResult[] };
        return data.results ?? [];
      }

      if (isExhaustedError(res.status)) {
        keyStatusMap.set(key, "exhausted");
        continue;
      }

      keyStatusMap.set(key, "error");
      continue;
    } catch {
      keyStatusMap.set(key, "error");
      continue;
    }
  }

  await notifyAllKeysExhausted();
  return [];
}

// ─────────────────────────────────────────────
// 对外暴露的高层函数
// ─────────────────────────────────────────────

/**
 * 【最高优先级】从用户数据库链接获取真实内容
 * Step1: 直接抓取指定URL（Tavily Extract）
 * Step2: 在这些域名范围内关键词搜索
 */
export async function searchFromUserLibrary(
  query: string,
  libraryUrls: string[]
): Promise<string> {
  if (!isTavilyConfigured() || libraryUrls.length === 0) return "";

  const results: TavilyResult[] = [];

  // Step A: 直接抓取最多3个URL的完整内容
  const topUrls = libraryUrls.slice(0, 3);
  try {
    const extracted = await tavilyExtractRequest(topUrls);
    results.push(...extracted);
  } catch (err) {
    console.error("[Tavily] Extract failed:", err);
  }

  // Step B: 在用户数据库域名范围内关键词搜索
  const domains = libraryUrls
    .map(url => {
      try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
      catch { return null; }
    })
    .filter(Boolean) as string[];

  const uniqueDomains = Array.from(new Set(domains)).slice(0, 10);

  if (uniqueDomains.length > 0) {
    const searchResults = await tavilySearchRequest({
      query,
      max_results: 5,
      search_depth: "advanced",
      include_domains: uniqueDomains,
      include_answer: true,
      topic: "finance",
    });
    results.push(...searchResults);
  }

  if (results.length === 0) return "";

  const formatted = results
    .slice(0, 6)
    .map((r, i) => {
      const date = r.published_date ? ` (${r.published_date})` : "";
      return `### 来源${i + 1}：${r.title}${date}\n**URL**: ${r.url}\n${r.content?.slice(0, 800) ?? ""}`;
    })
    .join("\n\n---\n\n");

  return `## 用户数据库实时内容（来源：Tavily 抓取）\n\n${formatted}`;
}

/**
 * 通用金融新闻搜索（兜底，不限定域名）
 */
export async function searchFinancialNews(query: string, maxResults = 5): Promise<string> {
  if (!isTavilyConfigured()) return "";

  const results = await tavilySearchRequest({
    query,
    max_results: maxResults,
    search_depth: "basic",
    include_answer: true,
    topic: "finance",
  });

  if (results.length === 0) return "";

  const formatted = results
    .map((r, i) => {
      const date = r.published_date ? ` (${r.published_date})` : "";
      return `### 搜索结果${i + 1}：${r.title}${date}\n**URL**: ${r.url}\n${r.content?.slice(0, 600) ?? ""}`;
    })
    .join("\n\n---\n\n");

  return `## 实时网络搜索结果（来源：Tavily）\n\n${formatted}`;
}

/**
 * 股票专项搜索
 */
export async function searchStockNews(ticker: string, companyName?: string): Promise<string> {
  const query = companyName
    ? `${companyName} ${ticker} 最新分析 股价 财报 2025 2026`
    : `${ticker} stock analysis latest news 2025 2026`;
  return searchFinancialNews(query, 4);
}

/**
 * 宏观经济专项搜索
 */
export async function searchMacroNews(topic: string): Promise<string> {
  const query = `${topic} 最新动态 2025 2026 投资影响`;
  return searchFinancialNews(query, 4);
}

/**
 * 综合搜索：优先用户数据库 → 通用搜索兜底
 */
export async function searchForTask(
  taskDescription: string,
  userDataSources?: string[]
): Promise<string> {
  if (!isTavilyConfigured()) return "";

  const parts: string[] = [];

  // 优先：用户数据库链接
  if (userDataSources && userDataSources.length > 0) {
    const userSourceData = await searchFromUserLibrary(taskDescription, userDataSources);
    if (userSourceData) parts.push(userSourceData);
  }

  // 兜底：通用金融新闻
  const generalNews = await searchFinancialNews(taskDescription, 3);
  if (generalNews) parts.push(generalNews);

  return parts.join("\n\n---\n\n");
}
