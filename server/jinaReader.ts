/**
 * Jina AI Reader - 公开网页内容抓取
 * 使用 https://r.jina.ai/{url} 抓取任意公开网页的干净 Markdown 内容
 * 无需 API Key，完全免费，支持 JavaScript 渲染的动态网站
 */

const JINA_BASE = "https://r.jina.ai/";
const JINA_TIMEOUT_MS = 15000; // 15秒超时
const MAX_CONTENT_LENGTH = 3000; // 每个页面最多保留3000字符

export interface JinaResult {
  url: string;
  title: string;
  content: string;
  success: boolean;
  error?: string;
}

/**
 * 用 Jina Reader 抓取单个 URL 的内容
 */
export async function fetchWithJina(url: string): Promise<JinaResult> {
  const jinaUrl = `${JINA_BASE}${url}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);

  try {
    const res = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/plain, text/markdown",
        "X-Return-Format": "markdown",
        "X-Timeout": "12",
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return { url, title: "", content: "", success: false, error: `HTTP ${res.status}` };
    }

    const text = await res.text();

    // 提取标题（Jina 返回的 Markdown 第一行通常是 # 标题）
    const titleMatch = text.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : url;

    // 截断内容，避免过长
    const content = text.slice(0, MAX_CONTENT_LENGTH);

    return { url, title, content, success: true };
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { url, title: "", content: "", success: false, error: msg };
  }
}

/**
 * 并行抓取多个 URL（最多同时抓取 4 个，避免超时堆积）
 */
export async function fetchMultipleWithJina(
  urls: string[],
  maxConcurrent = 4
): Promise<JinaResult[]> {
  const results: JinaResult[] = [];
  const chunks: string[][] = [];

  for (let i = 0; i < urls.length; i += maxConcurrent) {
    chunks.push(urls.slice(i, i + maxConcurrent));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(chunk.map(url => fetchWithJina(url)));
    for (const r of chunkResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      }
    }
  }

  return results;
}

/**
 * 从用户数据库链接中抓取内容，格式化为 AI 可读的文本块
 * @param libraryUrls 用户数据库中的链接列表
 * @param maxUrls 最多抓取几个链接（默认5个，避免太慢）
 */
export async function fetchUserLibraryContent(
  libraryUrls: string[],
  maxUrls = 5
): Promise<string> {
  if (libraryUrls.length === 0) return "";

  // 过滤有效 URL，优先选前 maxUrls 个
  const validUrls = libraryUrls
    .filter(u => u.startsWith("http"))
    .slice(0, maxUrls);

  if (validUrls.length === 0) return "";

  const results = await fetchMultipleWithJina(validUrls);
  const successful = results.filter(r => r.success && r.content.trim().length > 100);

  if (successful.length === 0) return "";

  const formatted = successful
    .map((r, i) => `### 数据来源 ${i + 1}：${r.title}\n**URL**: ${r.url}\n\n${r.content}`)
    .join("\n\n---\n\n");

  return `## 用户数据库网页内容（来源：Jina Reader 实时抓取）\n\n${formatted}`;
}
