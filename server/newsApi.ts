/**
 * NewsAPI Integration
 * 全球新闻搜索 / 头条 / 来源过滤
 * 需要 API Key：NEWS_API_KEY
 */

import { ENV } from "./_core/env";

const NEWS_API_BASE = "https://newsapi.org/v2";

// ---- 类型定义 ----

export interface NewsArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

export interface NewsData {
  query: string;
  totalResults: number;
  articles: NewsArticle[];
  category?: string;
  source: string;
  fetchedAt: number;
}

// ---- 核心函数 ----

async function newsApiFetch(endpoint: string, params: Record<string, string>): Promise<Response> {
  const apiKey = ENV.NEWS_API_KEY;
  if (!apiKey) throw new Error("NEWS_API_KEY not configured");

  const url = new URL(`${NEWS_API_BASE}/${endpoint}`);
  url.searchParams.set("apiKey", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "InvestmentPlatform/1.0" },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 按关键词搜索新闻（过去 7 天）
 */
export async function searchNews(
  query: string,
  pageSize = 10,
  language = "en"
): Promise<NewsArticle[]> {
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await newsApiFetch("everything", {
    q: query,
    from,
    language,
    sortBy: "relevancy",
    pageSize: String(pageSize),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(`NewsAPI search failed: ${res.status} ${err.message ?? ""}`);
  }
  const data = await res.json() as { articles?: NewsArticle[]; totalResults?: number };
  return data.articles ?? [];
}

/**
 * 获取指定类别头条新闻
 */
export async function getTopHeadlines(
  category: "business" | "technology" | "general" | "science" = "business",
  country = "us",
  pageSize = 10
): Promise<NewsArticle[]> {
  const res = await newsApiFetch("top-headlines", {
    category,
    country,
    pageSize: String(pageSize),
  });
  if (!res.ok) throw new Error(`NewsAPI headlines failed: ${res.status}`);
  const data = await res.json() as { articles?: NewsArticle[] };
  return data.articles ?? [];
}

/**
 * 从任务描述中提取新闻搜索关键词
 */
export function extractNewsQuery(taskDescription: string): string | null {
  const text = taskDescription;

  // 股票代码（优先级最高）
  const tickerMatch = text.match(/\b([A-Z]{2,5})\b/);
  if (tickerMatch && !["GDP", "CPI", "ETF", "IPO", "CEO", "CFO", "USA", "USD", "EUR", "GBP"].includes(tickerMatch[1])) {
    return `${tickerMatch[1]} stock news`;
  }

  // 中文公司/话题
  const cnKeywords = [
    { pattern: /茅台|贵州茅台/, query: "Kweichow Moutai" },
    { pattern: /腾讯/, query: "Tencent" },
    { pattern: /阿里巴巴|阿里/, query: "Alibaba" },
    { pattern: /比亚迪/, query: "BYD" },
    { pattern: /宁德时代/, query: "CATL battery" },
    { pattern: /华为/, query: "Huawei" },
    { pattern: /美联储|联储/, query: "Federal Reserve" },
    { pattern: /通胀|通货膨胀/, query: "inflation" },
    { pattern: /加密货币|比特币|BTC/, query: "Bitcoin cryptocurrency" },
    { pattern: /以太坊|ETH/, query: "Ethereum" },
    { pattern: /人工智能|AI/, query: "artificial intelligence AI" },
    { pattern: /芯片|半导体/, query: "semiconductor chip" },
    { pattern: /石油|原油/, query: "crude oil energy" },
    { pattern: /黄金/, query: "gold price" },
    { pattern: /房地产|房市/, query: "real estate housing" },
  ];

  for (const { pattern, query } of cnKeywords) {
    if (pattern.test(text)) return query;
  }

  // 英文关键词直接提取
  const enKeywords = [
    "inflation", "interest rate", "recession", "earnings", "IPO",
    "merger", "acquisition", "bankruptcy", "layoffs", "AI", "chip",
    "oil", "gold", "bitcoin", "crypto", "housing",
  ];
  const lowerText = text.toLowerCase();
  for (const kw of enKeywords) {
    if (lowerText.includes(kw.toLowerCase())) return kw;
  }

  return null;
}

/**
 * 综合获取新闻数据
 */
export async function fetchNewsData(taskDescription: string): Promise<NewsData | null> {
  const apiKey = ENV.NEWS_API_KEY;
  if (!apiKey) return null;

  const query = extractNewsQuery(taskDescription);
  if (!query) return null;

  try {
    const articles = await searchNews(query, 8);
    return {
      query,
      totalResults: articles.length,
      articles,
      source: "NewsAPI",
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn("[NewsAPI] Fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 格式化新闻数据为 Markdown
 */
export function formatNewsDataAsMarkdown(data: NewsData): string {
  const lines: string[] = [];
  lines.push(`## NewsAPI 新闻数据 — 查询：「${data.query}」`);
  lines.push(`> 数据来源：NewsAPI.org | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}`);
  lines.push("");

  if (data.articles.length === 0) {
    lines.push("*暂无相关新闻*");
    return lines.join("\n");
  }

  lines.push(`### 近期相关新闻（共 ${data.articles.length} 条）`);
  lines.push(`| 标题 | 来源 | 发布时间 |`);
  lines.push(`|------|------|----------|`);

  for (const article of data.articles.slice(0, 8)) {
    const title = (article.title ?? "无标题").slice(0, 65).replace(/\|/g, "｜");
    const source = article.source?.name ?? "未知";
    const date = article.publishedAt
      ? new Date(article.publishedAt).toLocaleDateString("zh-CN")
      : "未知";
    lines.push(`| ${title} | ${source} | ${date} |`);
  }

  lines.push("");

  // 摘要（取前 3 条）
  const withDesc = data.articles.filter(a => a.description && a.description.length > 20).slice(0, 3);
  if (withDesc.length > 0) {
    lines.push("### 重点新闻摘要");
    for (const article of withDesc) {
      lines.push(`**${article.title?.slice(0, 80)}**`);
      lines.push(`> ${article.description?.slice(0, 150)}`);
      lines.push(`来源：${article.source?.name} | ${new Date(article.publishedAt).toLocaleDateString("zh-CN")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * NewsAPI 健康检测
 */
export async function checkNewsApiHealth(): Promise<boolean> {
  try {
    const apiKey = ENV.NEWS_API_KEY;
    if (!apiKey) return false;
    const res = await newsApiFetch("top-headlines", { country: "us", pageSize: "1" });
    return res.ok;
  } catch {
    return false;
  }
}
