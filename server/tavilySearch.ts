/**
 * Tavily Search API integration
 * Provides real-time web search for financial news, research reports, and market data
 * from sites like Seeking Alpha, Bloomberg, Reuters, 雪球, 东方财富, etc.
 */

const TAVILY_BASE_URL = "https://api.tavily.com";

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
}

/**
 * Search the web using Tavily API
 */
async function tavilySearch(
  query: string,
  options: {
    searchDepth?: "basic" | "advanced";
    maxResults?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
    includeAnswer?: boolean;
    topic?: "general" | "news" | "finance";
  } = {}
): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured");

  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    search_depth: options.searchDepth ?? "basic",
    max_results: options.maxResults ?? 5,
    include_answer: options.includeAnswer ?? true,
    include_raw_content: false,
    topic: options.topic ?? "finance",
  };

  if (options.includeDomains?.length) {
    body.include_domains = options.includeDomains;
  }
  if (options.excludeDomains?.length) {
    body.exclude_domains = options.excludeDomains;
  }

  const res = await fetch(`${TAVILY_BASE_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Tavily API error ${res.status}: ${detail}`);
  }

  return res.json();
}

/**
 * Check if Tavily API is configured
 */
export function isTavilyConfigured(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

/**
 * Search for financial news and analysis about a topic
 */
export async function searchFinancialNews(query: string, maxResults = 5): Promise<string> {
  if (!isTavilyConfigured()) {
    return ""; // Silently skip if not configured
  }

  try {
    const response = await tavilySearch(query, {
      searchDepth: "basic",
      maxResults,
      includeAnswer: true,
      topic: "finance",
    });

    const lines: string[] = [`## 实时搜索结果（来源：Tavily Web Search）\n`, `**搜索关键词**: ${query}\n`];

    if (response.answer) {
      lines.push(`**AI摘要**: ${response.answer}\n`);
    }

    if (response.results.length > 0) {
      lines.push("**相关文章**:");
      for (const result of response.results.slice(0, maxResults)) {
        const date = result.published_date ? ` (${result.published_date})` : "";
        lines.push(`\n### ${result.title}${date}`);
        lines.push(`来源: ${result.url}`);
        if (result.content) {
          // Truncate content to avoid token overflow
          const snippet = result.content.slice(0, 400).replace(/\n+/g, " ");
          lines.push(`摘要: ${snippet}...`);
        }
      }
    }

    return lines.join("\n");
  } catch (err: any) {
    console.error("[Tavily] Search failed:", err.message);
    return ""; // Fail silently, don't block the main task
  }
}

/**
 * Search for stock-specific news and analysis
 */
export async function searchStockNews(ticker: string, companyName?: string): Promise<string> {
  const query = companyName
    ? `${companyName} ${ticker} 最新分析 股价 财报 2025 2026`
    : `${ticker} stock analysis latest news 2025 2026`;

  return searchFinancialNews(query, 4);
}

/**
 * Search for macro/economic news
 */
export async function searchMacroNews(topic: string): Promise<string> {
  const query = `${topic} 最新动态 2025 2026 投资影响`;
  return searchFinancialNews(query, 4);
}

/**
 * Search user's configured data sources (from their data library)
 */
export async function searchUserDataSources(
  query: string,
  dataSources: string[]
): Promise<string> {
  if (!isTavilyConfigured() || dataSources.length === 0) return "";

  // Extract domains from URLs
  const domains: string[] = [];
  for (const source of dataSources) {
    try {
      const url = new URL(source.startsWith("http") ? source : `https://${source}`);
      domains.push(url.hostname.replace("www.", ""));
    } catch {
      // Skip invalid URLs
    }
  }

  if (domains.length === 0) return "";

  try {
    const response = await tavilySearch(query, {
      searchDepth: "advanced",
      maxResults: 5,
      includeDomains: domains.slice(0, 10), // Tavily supports up to 10 domains
      includeAnswer: true,
      topic: "finance",
    });

    const lines: string[] = [`## 来自您数据库的实时内容\n`, `**搜索关键词**: ${query}\n`];

    if (response.answer) {
      lines.push(`**综合摘要**: ${response.answer}\n`);
    }

    for (const result of response.results) {
      const date = result.published_date ? ` (${result.published_date})` : "";
      lines.push(`\n### ${result.title}${date}`);
      lines.push(`来源: ${result.url}`);
      if (result.content) {
        const snippet = result.content.slice(0, 500).replace(/\n+/g, " ");
        lines.push(`内容: ${snippet}`);
      }
    }

    return lines.join("\n");
  } catch (err: any) {
    console.error("[Tavily] User data source search failed:", err.message);
    return "";
  }
}

/**
 * Determine search queries based on task description
 */
export async function searchForTask(
  taskDescription: string,
  userDataSources?: string[]
): Promise<string> {
  if (!isTavilyConfigured()) return "";

  const parts: string[] = [];

  // Search user's configured data sources first (highest priority)
  if (userDataSources && userDataSources.length > 0) {
    const userSourceData = await searchUserDataSources(taskDescription, userDataSources);
    if (userSourceData) parts.push(userSourceData);
  }

  // General financial news search
  const generalNews = await searchFinancialNews(taskDescription, 3);
  if (generalNews) parts.push(generalNews);

  return parts.join("\n\n---\n\n");
}
