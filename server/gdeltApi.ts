/**
 * GDELT Project API Integration
 * 全球事件数据库 - 地缘风险、新闻情绪、话题热度
 * 免费公开，无需 API Key，但需严格遵守 5 秒请求间隔
 */

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const REQUEST_INTERVAL_MS = 5500; // 5.5 秒间隔，略超 5 秒要求

// 全局请求队列，确保不超过频率限制
let lastRequestTime = 0;

async function rateLimitedFetch(url: string, timeoutMs = 15000): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---- 类型定义 ----

export interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  socialimage?: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

export interface GdeltTimelinePoint {
  date: string;
  value: number;
}

export interface GdeltNewsData {
  query: string;
  articles: GdeltArticle[];
  timeline?: GdeltTimelinePoint[];
  toneStats?: {
    avgTone: number;
    positiveCount: number;
    negativeCount: number;
  };
  source: string;
  fetchedAt: number;
}

// ---- 核心函数 ----

/**
 * 按关键词搜索全球新闻（最近 24 小时）
 */
export async function fetchGdeltNews(
  query: string,
  maxRecords = 10,
  timespan = "1d"
): Promise<GdeltArticle[]> {
  const encoded = encodeURIComponent(query);
  const url = `${GDELT_BASE}?query=${encoded}&mode=artlist&maxrecords=${maxRecords}&format=json&timespan=${timespan}&sort=DateDesc`;
  const res = await rateLimitedFetch(url);
  if (!res.ok) throw new Error(`GDELT artlist failed: ${res.status}`);
  const data = await res.json() as { articles?: GdeltArticle[] };
  return data.articles ?? [];
}

/**
 * 获取话题热度时间线（过去 1 个月）
 */
export async function fetchGdeltTimeline(
  query: string,
  timespan = "1m"
): Promise<GdeltTimelinePoint[]> {
  const encoded = encodeURIComponent(query);
  const url = `${GDELT_BASE}?query=${encoded}&mode=timelinevol&format=json&timespan=${timespan}`;
  const res = await rateLimitedFetch(url);
  if (!res.ok) throw new Error(`GDELT timeline failed: ${res.status}`);
  const data = await res.json() as { timeline?: Array<{ date: string; value: number }> };
  if (!data.timeline) return [];
  return data.timeline.map(p => ({ date: p.date, value: p.value }));
}

/**
 * 获取话题情绪分析（语气图表）
 */
export async function fetchGdeltTone(
  query: string,
  timespan = "1m"
): Promise<{ avgTone: number; positiveCount: number; negativeCount: number } | null> {
  const encoded = encodeURIComponent(query);
  const url = `${GDELT_BASE}?query=${encoded}&mode=tonechart&format=json&timespan=${timespan}`;
  const res = await rateLimitedFetch(url);
  if (!res.ok) return null;
  const data = await res.json() as {
    tonechart?: Array<{ bin: number; count: number }>;
  };
  if (!data.tonechart || data.tonechart.length === 0) return null;

  let totalTone = 0;
  let totalCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  for (const point of data.tonechart) {
    totalTone += point.bin * point.count;
    totalCount += point.count;
    if (point.bin > 0) positiveCount += point.count;
    else if (point.bin < 0) negativeCount += point.count;
  }

  return {
    avgTone: totalCount > 0 ? Math.round((totalTone / totalCount) * 100) / 100 : 0,
    positiveCount,
    negativeCount,
  };
}

/**
 * 从任务描述中提取 GDELT 查询关键词
 */
export function extractGdeltQuery(taskDescription: string): string | null {
  const text = taskDescription.toLowerCase();

  // 地缘政治关键词
  const geopoliticalKeywords = [
    "地缘", "地缘政治", "战争", "冲突", "制裁", "贸易战", "关税",
    "geopolitical", "war", "conflict", "sanction", "trade war", "tariff",
    "ukraine", "russia", "china", "taiwan", "中东", "middle east",
    "nato", "北约", "外交", "diplomatic",
  ];

  // 宏观经济新闻关键词
  const macroKeywords = [
    "通胀", "通货膨胀", "inflation", "利率", "interest rate",
    "美联储", "fed", "federal reserve", "央行", "central bank",
    "经济衰退", "recession", "gdp", "就业", "unemployment",
    "能源", "oil", "石油", "原油", "crude",
  ];

  // 公司/行业新闻
  const companyPattern = /([A-Z]{2,5})\s*(股票|新闻|分析|research|news|analysis)/i;
  const companyMatch = taskDescription.match(companyPattern);
  if (companyMatch) return companyMatch[1];

  for (const kw of geopoliticalKeywords) {
    if (text.includes(kw)) return kw.length > 3 ? kw : geopoliticalKeywords[0];
  }

  for (const kw of macroKeywords) {
    if (text.includes(kw)) return kw;
  }

  return null;
}

/**
 * 综合获取 GDELT 数据（新闻 + 情绪）
 */
export async function fetchGdeltData(taskDescription: string): Promise<GdeltNewsData | null> {
  const query = extractGdeltQuery(taskDescription);
  if (!query) return null;

  try {
    // 只获取新闻列表（情绪分析需要额外请求，受频率限制，按需启用）
    const articles = await fetchGdeltNews(query, 8, "3d");

    return {
      query,
      articles,
      source: "GDELT Project",
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn("[GDELT] Fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 格式化 GDELT 数据为 Markdown
 */
export function formatGdeltDataAsMarkdown(data: GdeltNewsData): string {
  const lines: string[] = [];
  lines.push(`## GDELT 全球事件数据 — 查询：「${data.query}」`);
  lines.push(`> 数据来源：GDELT Project | 获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}`);
  lines.push("");

  if (data.toneStats) {
    const { avgTone, positiveCount, negativeCount } = data.toneStats;
    const sentiment = avgTone > 1 ? "偏正面" : avgTone < -1 ? "偏负面" : "中性";
    lines.push(`### 媒体情绪概览`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 平均语气分 | ${avgTone > 0 ? "+" : ""}${avgTone} (${sentiment}) |`);
    lines.push(`| 正面报道数 | ${positiveCount} |`);
    lines.push(`| 负面报道数 | ${negativeCount} |`);
    lines.push("");
  }

  if (data.articles.length > 0) {
    lines.push(`### 近期相关新闻（最新 ${data.articles.length} 条）`);
    lines.push(`| 标题 | 来源 | 日期 |`);
    lines.push(`|------|------|------|`);
    for (const article of data.articles.slice(0, 8)) {
      const title = article.title?.slice(0, 60) ?? "无标题";
      const domain = article.domain ?? "未知";
      const date = article.seendate
        ? article.seendate.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
        : "未知";
      lines.push(`| ${title} | ${domain} | ${date} |`);
    }
    lines.push("");
  } else {
    lines.push("*暂无相关新闻数据*");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * GDELT 健康检测（轻量探针）
 */
export async function checkGdeltHealth(): Promise<boolean> {
  try {
    const url = `${GDELT_BASE}?query=economy&mode=artlist&maxrecords=1&format=json&timespan=1d`;
    const res = await rateLimitedFetch(url, 10000);
    return res.ok;
  } catch {
    return false;
  }
}
