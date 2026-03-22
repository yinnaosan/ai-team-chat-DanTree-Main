/**
 * Web Search Engine — Serper + Tavily 双引擎降级链
 *
 * 优先级：Serper 3 Key 轮换 → Tavily 4 Key 轮换
 * Serper 作为主引擎（稳定可用），Tavily 作为备用（当前环境 IP 被 403 封锁）
 * Serper 全部失败时自动降级到 Tavily（以防将来 IP 解封）
 * Serper 返回 Google 搜索结果，格式适配为 TavilyResult
 *
 * 数据获取策略（Step2数据引擎）：
 * 1. 搜索引擎限定域名搜索 → 返回真实存在的相关页面URL
 * 2. Jina Reader 抓取返回的真实URL，获取完整页面内容
 * 3. Yahoo Finance（股价/财务数据）
 * 4. FRED（宏观经济数据）
 * 5. 通用金融新闻搜索（兜底）
 *
 * ⚠️ 严禁AI编造数据：无真实来源时必须明确说明"未能获取实时数据"
 * ⚠️ 所有URL均来自搜索引擎结果，100%真实有效，绝不由LLM生成
 */

import { notifyOwner } from "./_core/notification";
import { fetchMultipleWithJina } from "./jinaReader";
import { ENV } from "./_core/env";

// ─────────────────────────────────────────────
// Tavily 四Key轮换
// ─────────────────────────────────────────────

const TAVILY_KEYS = [
  ENV.TAVILY_API_KEY || "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",
  ENV.TAVILY_API_KEY_2 || "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",
  ENV.TAVILY_API_KEY_3 || "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",
  ENV.TAVILY_API_KEY_4 || "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",
].filter(Boolean) as string[];

// ─────────────────────────────────────────────
// Serper 三Key轮换（Tavily 降级备用）
// ─────────────────────────────────────────────

const SERPER_KEYS = [
  ENV.SERPER_API_KEY,
  ENV.SERPER_API_KEY_2,
  ENV.SERPER_API_KEY_3,
].filter(Boolean) as string[];

// Key 状态追踪（内存级，重启后重置）
type KeyStatus = "active" | "exhausted" | "error";
const keyStatusMap = new Map<string, KeyStatus>();

// 引擎级别状态
let tavilyAllDown = false;
let serperAllDown = false;
let allKeysExhaustedNotified = false;

export function isTavilyConfigured(): boolean {
  return TAVILY_KEYS.length > 0 || SERPER_KEYS.length > 0;
}

export function isSerperConfigured(): boolean {
  return SERPER_KEYS.length > 0;
}

/** 获取当前使用的搜索引擎（Serper 优先） */
export function getActiveSearchEngine(): "tavily" | "serper" | "none" {
  if (!serperAllDown && SERPER_KEYS.some(k => (keyStatusMap.get(k) ?? "active") !== "exhausted")) {
    return "serper";
  }
  if (!tavilyAllDown && TAVILY_KEYS.some(k => (keyStatusMap.get(k) ?? "active") !== "exhausted")) {
    return "tavily";
  }
  return "none";
}

/** 获取 Tavily 四个Key的当前状态（供设置页展示） */
export function getTavilyKeyStatuses(): Array<{
  index: number;
  masked: string;
  status: KeyStatus;
  configured: boolean;
}> {
  const allKeys = [
    ENV.TAVILY_API_KEY || "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",
    ENV.TAVILY_API_KEY_2 || "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",
    ENV.TAVILY_API_KEY_3 || "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",
    ENV.TAVILY_API_KEY_4 || "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",
  ];
  return allKeys.map((key, i) => ({
    index: i + 1,
    masked: key ? key.slice(0, 12) + "..." + key.slice(-6) : "",
    status: key ? (keyStatusMap.get(key) ?? "active") : "error",
    configured: !!key,
  }));
}

/** 获取 Serper 三个Key的当前状态（供设置页展示） */
export function getSerperKeyStatuses(): Array<{
  index: number;
  masked: string;
  status: KeyStatus;
  configured: boolean;
}> {
  const allKeys = [
    ENV.SERPER_API_KEY || "",
    ENV.SERPER_API_KEY_2 || "",
    ENV.SERPER_API_KEY_3 || "",
  ];
  return allKeys.map((key, i) => ({
    index: i + 1,
    masked: key ? key.slice(0, 8) + "..." + key.slice(-6) : "",
    status: key ? (keyStatusMap.get(key) ?? "active") : "error",
    configured: !!key,
  }));
}

function isExhaustedError(status: number): boolean {
  return status === 429 || status === 403 || status === 401;
}

async function notifyAllKeysExhausted(): Promise<void> {
  if (allKeysExhaustedNotified) return;
  allKeysExhaustedNotified = true;
  console.error("[WebSearch] All Tavily + Serper keys exhausted or failed");
  try {
    await notifyOwner({
      title: "⚠️ 搜索引擎 API 全部不可用",
      content: `Tavily（4 Key）和 Serper（3 Key）均已失败，网页搜索功能暂时不可用。\n\n请检查 API Key 额度或网络状态。`,
    });
  } catch (err) {
    console.error("[WebSearch] Failed to send owner notification:", err);
  }
}

// ─────────────────────────────────────────────
// 统一搜索结果类型
// ─────────────────────────────────────────────

export interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score?: number;
  published_date?: string;
}

// ─────────────────────────────────────────────
// Tavily 搜索请求（四Key轮换）
// ─────────────────────────────────────────────

async function tavilySearchRequest(
  payload: Record<string, unknown>
): Promise<TavilyResult[] | null> {
  // 返回 null 表示 Tavily 全部失败，需要降级到 Serper
  if (TAVILY_KEYS.length === 0) return null;

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
        tavilyAllDown = false;
        allKeysExhaustedNotified = false;
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

  // Tavily 全部失败
  tavilyAllDown = true;
  console.warn("[Tavily] All keys failed, falling back to Serper");
  return null;
}

// ─────────────────────────────────────────────
// Serper 搜索请求（三Key轮换）
// ─────────────────────────────────────────────

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  position?: number;
}

/** 将 Serper 结果适配为 TavilyResult 格式 */
function serperToTavilyResults(organic: SerperOrganicResult[]): TavilyResult[] {
  return organic.map((r, i) => ({
    url: r.link,
    title: r.title,
    content: r.snippet || "",
    score: 1 - i * 0.1, // 按排名递减
    published_date: r.date,
  }));
}

async function serperSearchRequest(
  query: string,
  maxResults: number = 5,
  options?: { gl?: string; hl?: string }
): Promise<TavilyResult[]> {
  if (SERPER_KEYS.length === 0) return [];

  for (let i = 0; i < SERPER_KEYS.length; i++) {
    const key = SERPER_KEYS[i];
    const currentStatus = keyStatusMap.get(key) ?? "active";
    if (currentStatus === "exhausted") continue;

    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: query,
          num: maxResults,
          gl: options?.gl || "us",
          hl: options?.hl || "en",
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        keyStatusMap.set(key, "active");
        allKeysExhaustedNotified = false;
        const data = await res.json() as { organic: SerperOrganicResult[] };
        console.log(`[Serper] Key ${i + 1} success, ${data.organic?.length ?? 0} results`);
        return serperToTavilyResults(data.organic ?? []);
      }

      if (isExhaustedError(res.status)) {
        console.warn(`[Serper] Key ${i + 1} exhausted (HTTP ${res.status}), switching to next`);
        keyStatusMap.set(key, "exhausted");
        continue;
      }

      console.error(`[Serper] Key ${i + 1} HTTP ${res.status}`);
      keyStatusMap.set(key, "error");
      continue;
    } catch (err) {
      console.error(`[Serper] Key ${i + 1} network error:`, err);
      keyStatusMap.set(key, "error");
      continue;
    }
  }

  // Serper 也全部失败
  await notifyAllKeysExhausted();
  return [];
}

// ─────────────────────────────────────────────
// 统一搜索入口（Tavily → Serper 降级链）
// ─────────────────────────────────────────────

/**
 * 核心搜索请求：先尝试 Serper（主引擎），失败后降级到 Tavily（备用）
 */
async function unifiedSearchRequest(
  payload: Record<string, unknown>
): Promise<TavilyResult[]> {
  const query = (payload.query as string) || "";
  const maxResults = (payload.max_results as number) || 5;
  const includeDomains = payload.include_domains as string[] | undefined;

  // ===== Serper 优先 =====
  if (!serperAllDown && SERPER_KEYS.length > 0) {
    let serperQuery = query;
    if (includeDomains && includeDomains.length > 0) {
      const siteFilter = includeDomains.slice(0, 3).map(d => `site:${d}`).join(" OR ");
      serperQuery = `${query} (${siteFilter})`;
    }
    const serperResults = await serperSearchRequest(serperQuery, maxResults);
    if (serperResults.length > 0) return serperResults;
    // Serper 全部失败
    serperAllDown = true;
    console.warn("[Serper] All keys failed, falling back to Tavily");
  }

  // ===== Tavily 备用 =====
  if (!tavilyAllDown) {
    const tavilyResults = await tavilySearchRequest(payload);
    if (tavilyResults !== null) {
      serperAllDown = false; // Tavily 成功，下次还是先试 Serper
      return tavilyResults;
    }
  }

  // 两个引擎都失败
  await notifyAllKeysExhausted();
  return [];
}

// ─────────────────────────────────────────────
// 对外暴露的高层函数
// ─────────────────────────────────────────────

export interface SearchResult {
  content: string;
  sources: Array<{ domain: string; url: string; title: string; success: boolean }>;
}

export async function searchFromUserLibrary(
  query: string,
  libraryUrls: string[]
): Promise<SearchResult> {
  const emptyResult: SearchResult = { content: "", sources: [] };
  if (libraryUrls.length === 0) return emptyResult;
  if (!isTavilyConfigured()) return emptyResult;

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

  const uniqueDomains = Array.from(new Set(domains)).slice(0, 15);
  if (uniqueDomains.length === 0) return emptyResult;

  // Step 2: 统一搜索（Tavily → Serper 降级）
  const searchResults = await unifiedSearchRequest({
    query,
    max_results: 8,
    search_depth: "advanced",
    include_domains: uniqueDomains,
    include_answer: false,
    topic: "finance",
  });

  if (searchResults.length === 0) return emptyResult;

  // Step 3: 提取高分 URL，最多 5 个
  const sortedResults = searchResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topResults = sortedResults.slice(0, 5);
  const realUrls = topResults.map(r => r.url);

  // Step 4: Jina 抓取完整内容
  const jinaResults = await fetchMultipleWithJina(realUrls, 3);
  const jinaSuccessful = jinaResults.filter(r => r.success && r.content.trim().length > 100);

  const allParts: string[] = [];
  const sources: SearchResult["sources"] = [];

  for (const r of topResults) {
    const jinaResult = jinaResults.find(j => j.url === r.url);
    const domain = (() => { try { return new URL(r.url).hostname.replace(/^www\./, ""); } catch { return r.url; } })();
    sources.push({
      domain,
      url: r.url,
      title: r.title || domain,
      success: !!(jinaResult?.success && jinaResult.content.trim().length > 100),
    });
  }

  if (jinaSuccessful.length > 0) {
    const jinaFormatted = jinaSuccessful
      .map((r, i) => {
        const tavilyMeta = searchResults.find(t => t.url === r.url);
        const date = tavilyMeta?.published_date ? ` (${tavilyMeta.published_date})` : "";
        const title = r.title || tavilyMeta?.title || r.url;
        return `### 来源${i + 1}：${title}${date}\n**URL**: ${r.url}\n\n${r.content.slice(0, 2000)}`;
      })
      .join("\n\n---\n\n");
    const engine = getActiveSearchEngine();
    const engineLabel = engine === "serper" ? "Serper" : "Tavily";
    allParts.push(`## 用户数据库实时内容（${engineLabel}搜索定位 → Jina深度抓取）\n\n${jinaFormatted}`);
  }

  const jinaSuccessUrls = new Set(jinaSuccessful.map(r => r.url));
  const fallback = searchResults.filter(
    r => !jinaSuccessUrls.has(r.url) && r.content && r.content.length > 100
  );

  if (fallback.length > 0) {
    const fallbackFormatted = fallback
      .slice(0, 3)
      .map((r, i) => {
        const date = r.published_date ? ` (${r.published_date})` : "";
        return `### 补充来源${i + 1}：${r.title}${date}\n**URL**: ${r.url}\n${r.content.slice(0, 800)}`;
      })
      .join("\n\n---\n\n");
    allParts.push(`## 补充数据（搜索摘要）\n\n${fallbackFormatted}`);
  }

  return { content: allParts.join("\n\n---\n\n"), sources };
}

/**
 * 通用金融新闻搜索（兜底，不限定域名）
 */
export async function searchFinancialNews(query: string, maxResults = 5): Promise<string> {
  if (!isTavilyConfigured()) return "";

  const results = await unifiedSearchRequest({
    query,
    max_results: maxResults,
    search_depth: "basic",
    include_answer: true,
    topic: "finance",
  });

  if (results.length === 0) return "";

  const engine = getActiveSearchEngine();
  const engineLabel = engine === "serper" ? "Serper/Google" : "Tavily";

  const formatted = results
    .map((r, i) => {
      const date = r.published_date ? ` (${r.published_date})` : "";
      return `### 搜索结果${i + 1}：${r.title}${date}\n**URL**: ${r.url}\n${r.content?.slice(0, 600) ?? ""}`;
    })
    .join("\n\n---\n\n");

  return `## 实时网络搜索结果（来源：${engineLabel}）\n\n${formatted}`;
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

export interface TaskSearchResult {
  content: string;
  sources: SearchResult["sources"];
}

/**
 * 综合搜索：优先用户数据库 → 通用搜索兜底
 */
export async function searchForTask(
  taskDescription: string,
  userDataSources?: string[]
): Promise<TaskSearchResult> {
  if (!isTavilyConfigured()) return { content: "", sources: [] };

  const parts: string[] = [];
  let sources: SearchResult["sources"] = [];

  // 优先：用户数据库链接
  if (userDataSources && userDataSources.length > 0) {
    const userSourceData = await searchFromUserLibrary(taskDescription, userDataSources);
    if (userSourceData.content) {
      parts.push(userSourceData.content);
      sources = userSourceData.sources;
    }
  }

  // 兜底：通用金融新闻（仅当用户数据库没有结果时）
  if (parts.length === 0) {
    const generalNews = await searchFinancialNews(taskDescription, 3);
    if (generalNews) parts.push(generalNews);
  }

  return { content: parts.join("\n\n---\n\n"), sources };
}
