/**
 * Marketaux API Integration
 * 专业金融新闻 / 情绪评分 / 实体识别
 * 需要 API Key：MARKETAUX_API_KEY
 */

import { ENV } from "./_core/env";

const MARKETAUX_BASE = "https://api.marketaux.com/v1";

// ---- 类型定义 ----

export interface MarketauxEntity {
  symbol: string;
  name: string;
  exchange: string | null;
  exchange_long: string | null;
  country: string | null;
  type: string;
  industry: string | null;
  match_score: number;
  sentiment_score: number;
  highlights: Array<{
    highlight: string;
    sentiment: number;
    highlighted_in: string;
  }>;
}

export interface MarketauxArticle {
  uuid: string;
  title: string;
  description: string;
  snippet: string;
  url: string;
  image_url: string | null;
  language: string;
  published_at: string;
  source: string;
  relevance_score: number | null;
  entities: MarketauxEntity[];
  similar: unknown[];
}

export interface MarketauxData {
  symbols: string[];
  articles: MarketauxArticle[];
  sentimentSummary: {
    avgSentiment: number;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    label: string;
  };
  source: string;
  fetchedAt: number;
}

// ---- 核心函数 ----

async function marketauxFetch(endpoint: string, params: Record<string, string>): Promise<Response> {
  const apiKey = ENV.MARKETAUX_API_KEY;
  if (!apiKey) throw new Error("MARKETAUX_API_KEY not configured");

  const url = new URL(`${MARKETAUX_BASE}/${endpoint}`);
  url.searchParams.set("api_token", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 按股票代码获取金融新闻（含情绪评分）
 */
export async function fetchMarketauxNewsBySymbol(
  symbols: string[],
  limit = 10
): Promise<MarketauxArticle[]> {
  const symbolStr = symbols.join(",");
  const res = await marketauxFetch("news/all", {
    symbols: symbolStr,
    filter_entities: "true",
    language: "en",
    limit: String(limit),
    sort: "published_desc",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Marketaux failed: ${res.status} ${err.error?.message ?? ""}`);
  }
  const data = await res.json() as { data?: MarketauxArticle[] };
  return data.data ?? [];
}

/**
 * 按关键词搜索金融新闻
 */
export async function fetchMarketauxNewsByKeyword(
  query: string,
  limit = 8
): Promise<MarketauxArticle[]> {
  const res = await marketauxFetch("news/all", {
    search: query,
    filter_entities: "true",
    language: "en",
    limit: String(limit),
    sort: "relevance_score",
  });
  if (!res.ok) throw new Error(`Marketaux keyword search failed: ${res.status}`);
  const data = await res.json() as { data?: MarketauxArticle[] };
  return data.data ?? [];
}

/**
 * 计算情绪汇总统计
 */
function calcSentimentSummary(articles: MarketauxArticle[]) {
  if (articles.length === 0) {
    return { avgSentiment: 0, positiveCount: 0, negativeCount: 0, neutralCount: 0, label: "中性" };
  }

  let totalScore = 0;
  let count = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  for (const article of articles) {
    for (const entity of article.entities ?? []) {
      const score = entity.sentiment_score ?? 0;
      totalScore += score;
      count++;
      if (score > 0.05) positiveCount++;
      else if (score < -0.05) negativeCount++;
      else neutralCount++;
    }
  }

  const avg = count > 0 ? Math.round((totalScore / count) * 1000) / 1000 : 0;
  const label = avg > 0.1 ? "正面" : avg < -0.1 ? "负面" : "中性";

  return { avgSentiment: avg, positiveCount, negativeCount, neutralCount, label };
}

/**
 * 从任务描述中提取股票代码
 */
export function extractSymbolsFromTask(taskDescription: string): string[] {
  const symbols: string[] = [];

  // 美股代码（2-5位大写字母）
  const usTickerPattern = /\b([A-Z]{2,5})\b/g;
  const excluded = new Set(["GDP", "CPI", "ETF", "IPO", "CEO", "CFO", "USA", "USD", "EUR", "GBP", "JPY", "CNY", "HKD", "THE", "FOR", "AND", "NOT", "BUT"]);
  let match;
  while ((match = usTickerPattern.exec(taskDescription)) !== null) {
    if (!excluded.has(match[1])) {
      symbols.push(match[1]);
    }
  }

  // 港股代码（0700.HK 格式）
  const hkPattern = /\b(\d{4,5}\.HK)\b/gi;
  while ((match = hkPattern.exec(taskDescription)) !== null) {
    symbols.push(match[1].toUpperCase());
  }

  return Array.from(new Set(symbols)).slice(0, 5); // 最多 5 个代码
}

/**
 * 综合获取 Marketaux 数据
 */
export async function fetchMarketauxData(taskDescription: string): Promise<MarketauxData | null> {
  const apiKey = ENV.MARKETAUX_API_KEY;
  if (!apiKey) return null;

  const symbols = extractSymbolsFromTask(taskDescription);
  if (symbols.length === 0) return null;

  try {
    const articles = await fetchMarketauxNewsBySymbol(symbols, 10);
    const sentimentSummary = calcSentimentSummary(articles);

    return {
      symbols,
      articles,
      sentimentSummary,
      source: "Marketaux",
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn("[Marketaux] Fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 格式化 Marketaux 数据为 Markdown
 */
export function formatMarketauxDataAsMarkdown(data: MarketauxData): string {
  const lines: string[] = [];
  lines.push(`## Marketaux 金融新闻情绪 — ${data.symbols.join(", ")}`);
  lines.push(`> 数据来源：Marketaux.com | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}`);
  lines.push("");

  const { avgSentiment, positiveCount, negativeCount, neutralCount, label } = data.sentimentSummary;
  lines.push("### 市场情绪汇总");
  lines.push(`| 指标 | 数值 |`);
  lines.push(`|------|------|`);
  lines.push(`| 综合情绪 | ${avgSentiment > 0 ? "+" : ""}${avgSentiment} (${label}) |`);
  lines.push(`| 正面报道 | ${positiveCount} 条 |`);
  lines.push(`| 负面报道 | ${negativeCount} 条 |`);
  lines.push(`| 中性报道 | ${neutralCount} 条 |`);
  lines.push("");

  if (data.articles.length > 0) {
    lines.push(`### 近期金融新闻（共 ${data.articles.length} 条）`);
    lines.push(`| 标题 | 来源 | 情绪 | 日期 |`);
    lines.push(`|------|------|------|------|`);

    for (const article of data.articles.slice(0, 8)) {
      const title = (article.title ?? "无标题").slice(0, 55).replace(/\|/g, "｜");
      const source = article.source ?? "未知";
      const entityScore = article.entities?.[0]?.sentiment_score;
      const sentiment = entityScore !== undefined
        ? (entityScore > 0.05 ? "📈正" : entityScore < -0.05 ? "📉负" : "➡️中")
        : "—";
      const date = article.published_at
        ? new Date(article.published_at).toLocaleDateString("zh-CN")
        : "未知";
      lines.push(`| ${title} | ${source} | ${sentiment} | ${date} |`);
    }
    lines.push("");

    // 关键亮点（高情绪分文章）
    const highSentiment = data.articles
      .filter(a => a.entities?.some(e => Math.abs(e.sentiment_score) > 0.3))
      .slice(0, 2);

    if (highSentiment.length > 0) {
      lines.push("### 高情绪信号新闻");
      for (const article of highSentiment) {
        const topEntity = article.entities?.sort((a, b) => Math.abs(b.sentiment_score) - Math.abs(a.sentiment_score))[0];
        lines.push(`**${article.title?.slice(0, 80)}**`);
        if (topEntity?.highlights?.[0]) {
          lines.push(`> ${topEntity.highlights[0].highlight?.slice(0, 150)}`);
        }
        lines.push(`情绪评分：${topEntity?.sentiment_score?.toFixed(3) ?? "N/A"} | 来源：${article.source}`);
        lines.push("");
      }
    }
  } else {
    lines.push("*暂无相关金融新闻*");
  }

  return lines.join("\n");
}

/**
 * Marketaux 健康检测
 */
export async function checkMarketauxHealth(): Promise<boolean> {
  try {
    const apiKey = ENV.MARKETAUX_API_KEY;
    if (!apiKey) return false;
    const res = await marketauxFetch("news/all", {
      symbols: "AAPL",
      filter_entities: "true",
      language: "en",
      limit: "1",
    });
    return res.ok;
  } catch {
    return false;
  }
}
