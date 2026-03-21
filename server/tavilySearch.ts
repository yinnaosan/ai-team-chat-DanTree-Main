/**
 * Tavily Search API — 四Key轮换机制
 *
 * 优先级：Key1 → Key2 → Key3 → Key4
 * 单个Key返回 429/403/401 时自动切换下一个
 * 全部Key失败时调用 notifyOwner 发站内通知
 *
 * 数据获取策略（Step2数据引擎）：
 * 1. Tavily 限定域名搜索（include_domains）→ 返回真实存在的相关页面URL
 * 2. Jina Reader 抓取 Tavily 返回的真实URL，获取完整页面内容
 * 3. Yahoo Finance（股价/财务数据）
 * 4. FRED（宏观经济数据）
 * 5. 通用金融新闻搜索（兜底）
 *
 * ⚠️ 严禁AI编造数据：无真实来源时必须明确说明"未能获取实时数据"
 * ⚠️ 所有URL均来自Tavily搜索结果，100%真实有效，绝不由LLM生成
 */

import { notifyOwner } from "./_core/notification";
import { fetchMultipleWithJina } from "./jinaReader";

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

  for (let i = 0; i < TAVILY_KEYS.length; i++) {
    const key = TAVILY_KEYS[i];
    const currentStatus = keyStatusMap.get(key) ?? "active";
    if (currentStatus === "exhausted") continue;

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

// ─────────────────────────────────────────────
// 对外暴露的高层函数
// ─────────────────────────────────────────────

/**
 * 从用户数据库域名中搜索任务相关内容
 *
 * 核心策略（安全可靠，URL 100% 真实）：
 * 1. 从用户数据库 URL 提取域名列表
 * 2. Tavily include_domains 限定搜索 → 返回真实存在的相关页面 URL
 * 3. Jina Reader 抓取 Tavily 返回的真实页面，获取完整内容
 *
 * 不再直接 Extract 首页 URL（首页内容与任务无关）
 * 不再由 LLM 生成 URL（LLM 可能生成不存在的链接）
 */
export async function searchFromUserLibrary(
  query: string,
  libraryUrls: string[]
): Promise<string> {
  if (libraryUrls.length === 0) return "";
  if (!isTavilyConfigured()) return "";

  // Step 1: 从用户数据库 URL 提取域名列表
  const domains = libraryUrls
    .map(url => {
      try {
        const normalized = url.startsWith("http") ? url : `https://${url}`;
        return new URL(normalized).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })
    .filter((d): d is string => d !== null && d.length > 0);

  const uniqueDomains = Array.from(new Set(domains)).slice(0, 15); // 最多15个域名

  if (uniqueDomains.length === 0) return "";

  // Step 2: Tavily 限定域名搜索，获取真实存在的相关页面 URL
  // include_domains 确保所有结果都来自用户指定的网站
  const tavilyResults = await tavilySearchRequest({
    query,
    max_results: 8,
    search_depth: "advanced",
    include_domains: uniqueDomains,
    include_answer: false, // 不需要 Tavily 的摘要答案，我们要原始页面内容
    topic: "finance",
  });

  if (tavilyResults.length === 0) {
    // Tavily 在这些域名内没找到相关内容，返回空
    return "";
  }

  // Step 3: 提取 Tavily 返回的真实 URL（这些 URL 100% 存在）
  // 优先选择 score 高的结果，最多取 5 个
  const realUrls = tavilyResults
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5)
    .map(r => r.url);

  // Step 4: 用 Jina Reader 抓取这些真实页面的完整内容
  // Jina 支持 JavaScript 渲染，能处理动态网站（雪球、东方财富等）
  const jinaResults = await fetchMultipleWithJina(realUrls, 3);
  const jinaSuccessful = jinaResults.filter(r => r.success && r.content.trim().length > 100);

  const allParts: string[] = [];

  // 优先展示 Jina 抓取的完整内容
  if (jinaSuccessful.length > 0) {
    const jinaFormatted = jinaSuccessful
      .map((r, i) => {
        // 找到对应的 Tavily 元数据（标题、发布日期）
        const tavilyMeta = tavilyResults.find(t => t.url === r.url);
        const date = tavilyMeta?.published_date ? ` (${tavilyMeta.published_date})` : "";
        const title = r.title || tavilyMeta?.title || r.url;
        return `### 来源${i + 1}：${title}${date}\n**URL**: ${r.url}\n\n${r.content.slice(0, 2000)}`;
      })
      .join("\n\n---\n\n");
    allParts.push(`## 用户数据库实时内容（Tavily搜索定位 → Jina深度抓取）\n\n${jinaFormatted}`);
  }

  // 对于 Jina 抓取失败的 URL，回退使用 Tavily 自带的摘要内容
  const jinaSuccessUrls = new Set(jinaSuccessful.map(r => r.url));
  const tavilyFallback = tavilyResults.filter(
    r => !jinaSuccessUrls.has(r.url) && r.content && r.content.length > 100
  );

  if (tavilyFallback.length > 0) {
    const fallbackFormatted = tavilyFallback
      .slice(0, 3)
      .map((r, i) => {
        const date = r.published_date ? ` (${r.published_date})` : "";
        return `### 补充来源${i + 1}：${r.title}${date}\n**URL**: ${r.url}\n${r.content.slice(0, 800)}`;
      })
      .join("\n\n---\n\n");
    allParts.push(`## 补充数据（Tavily摘要）\n\n${fallbackFormatted}`);
  }

  return allParts.join("\n\n---\n\n");
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

  // 兜底：通用金融新闻（仅当用户数据库没有结果时）
  if (parts.length === 0) {
    const generalNews = await searchFinancialNews(taskDescription, 3);
    if (generalNews) parts.push(generalNews);
  }

  return parts.join("\n\n---\n\n");
}
