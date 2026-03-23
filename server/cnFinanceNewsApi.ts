/**
 * cnFinanceNewsApi.ts
 * 中文财经新闻聚合模块
 * 数据源参考 ourongxing/newsnow 仓库的爬虫逻辑
 * 覆盖：华尔街见闻、金十数据、格隆汇、雪球热股
 */

export interface CnNewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number; // UTC ms
  important?: boolean;
  extra?: string;
}

export interface CnNewsResult {
  source: string;
  items: CnNewsItem[];
  fetchedAt: number;
  error?: string;
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 华尔街见闻（快讯 live feed） ───────────────────────────────────────────

interface WscnLiveItem {
  uri: string;
  id: number;
  title?: string;
  content_text: string;
  display_time: number;
}

interface WscnLiveRes {
  data: { items: WscnLiveItem[] };
}

export async function fetchWallStreetCnLive(): Promise<CnNewsResult> {
  const source = "华尔街见闻";
  try {
    const url =
      "https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=20";
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: WscnLiveRes = await res.json();
    const items: CnNewsItem[] = json.data.items.map((k) => ({
      id: String(k.id),
      title: k.title || k.content_text.slice(0, 80),
      url: k.uri || `https://wallstreetcn.com/articles/${k.id}`,
      source,
      publishedAt: k.display_time * 1000,
    }));
    return { source, items, fetchedAt: Date.now() };
  } catch (err) {
    return { source, items: [], fetchedAt: Date.now(), error: String(err) };
  }
}

// ─── 金十数据（实时快讯） ────────────────────────────────────────────────────

interface Jin10Item {
  id: string;
  time: string;
  important: number;
  data: {
    title?: string;
    content?: string;
  };
  channel?: number[];
}

export async function fetchJin10News(): Promise<CnNewsResult> {
  const source = "金十数据";
  try {
    const url = `https://www.jin10.com/flash_newest.js?t=${Date.now()}`;
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.jin10.com/" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rawText = await res.text();
    const jsonStr = rawText
      .replace(/^var\s+newest\s*=\s*/, "")
      .replace(/;*$/, "")
      .trim();
    const data: Jin10Item[] = JSON.parse(jsonStr);

    const items: CnNewsItem[] = data
      .filter(
        (k) =>
          (k.data.title || k.data.content) &&
          !k.channel?.includes(5) // 过滤广告频道
      )
      .slice(0, 20)
      .map((k) => {
        const rawText = (k.data.title || k.data.content || "").replace(/<\/?b>/g, "");
        const match = rawText.match(/^【([^】]*)】(.*)$/);
        const title = match ? match[1] : rawText;
        return {
          id: k.id,
          title: title.slice(0, 100),
          url: `https://flash.jin10.com/detail/${k.id}`,
          source,
          publishedAt: parseJin10Time(k.time),
          important: !!k.important,
        };
      });

    return { source, items, fetchedAt: Date.now() };
  } catch (err) {
    return { source, items: [], fetchedAt: Date.now(), error: String(err) };
  }
}

function parseJin10Time(timeStr: string): number {
  // 格式如 "03-23 14:30:00" 或 "14:30:00"
  try {
    const now = new Date();
    if (timeStr.includes("-")) {
      const [datePart, timePart] = timeStr.split(" ");
      const [month, day] = datePart.split("-").map(Number);
      const [h, m, s] = timePart.split(":").map(Number);
      return new Date(now.getFullYear(), month - 1, day, h, m, s).getTime();
    } else {
      const [h, m, s] = timeStr.split(":").map(Number);
      const d = new Date(now);
      d.setHours(h, m, s, 0);
      return d.getTime();
    }
  } catch {
    return Date.now();
  }
}

// ─── 格隆汇（港股/A股深度资讯） ─────────────────────────────────────────────

export async function fetchGelonghuiNews(): Promise<CnNewsResult> {
  const source = "格隆汇";
  try {
    // 使用格隆汇 RSS feed（更稳定）
    const url = "https://www.gelonghui.com/rss";
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/rss+xml, application/xml" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseRssItems(xml, source, 15);
    return { source, items, fetchedAt: Date.now() };
  } catch (err) {
    return { source, items: [], fetchedAt: Date.now(), error: String(err) };
  }
}

// ─── 雪球热股排行 ────────────────────────────────────────────────────────────

interface XueqiuStockItem {
  code: string;
  name: string;
  percent: number;
  exchange: string;
  ad?: number;
}

interface XueqiuStockRes {
  data: { items: XueqiuStockItem[] };
}

export async function fetchXueqiuHotStocks(): Promise<CnNewsResult> {
  const source = "雪球热股";
  try {
    // 先获取 cookie
    const cookieRes = await fetchWithTimeout("https://xueqiu.com/hq", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const setCookieHeader = cookieRes.headers.get("set-cookie") || "";

    const url =
      "https://stock.xueqiu.com/v5/stock/hot_stock/list.json?size=20&_type=10&type=10";
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Cookie: setCookieHeader,
        Referer: "https://xueqiu.com/",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: XueqiuStockRes = await res.json();

    const items: CnNewsItem[] = json.data.items
      .filter((k) => !k.ad)
      .map((k) => ({
        id: k.code,
        title: `${k.name} ${k.percent > 0 ? "+" : ""}${k.percent.toFixed(2)}%`,
        url: `https://xueqiu.com/s/${k.code}`,
        source,
        publishedAt: Date.now(),
        extra: k.exchange,
      }));

    return { source, items, fetchedAt: Date.now() };
  } catch (err) {
    return { source, items: [], fetchedAt: Date.now(), error: String(err) };
  }
}

// ─── RSS 解析工具 ─────────────────────────────────────────────────────────────

function parseRssItems(xml: string, source: string, limit = 15): CnNewsItem[] {
  const items: CnNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = itemRegex.exec(xml)) !== null && count < limit) {
    const block = match[1];
    const title = extractXmlTag(block, "title");
    const link = extractXmlTag(block, "link");
    const pubDate = extractXmlTag(block, "pubDate");
    const guid = extractXmlTag(block, "guid") || link;

    if (title && link) {
      items.push({
        id: guid || link,
        title: title.replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
        url: link.replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
        source,
        publishedAt: pubDate ? new Date(pubDate).getTime() : Date.now(),
      });
      count++;
    }
  }
  return items;
}

function extractXmlTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : "";
}

// ─── 聚合入口 ─────────────────────────────────────────────────────────────────

export interface CnNewsAggregateResult {
  wallstreetcn: CnNewsResult;
  jin10: CnNewsResult;
  gelonghui: CnNewsResult;
  xueqiu: CnNewsResult;
  totalItems: number;
  fetchedAt: number;
}

/**
 * 并行拉取所有中文财经新闻源
 * 任意源失败不影响其他源
 */
export async function fetchAllCnFinanceNews(): Promise<CnNewsAggregateResult> {
  const [wallstreetcn, jin10, gelonghui, xueqiu] = await Promise.all([
    fetchWallStreetCnLive(),
    fetchJin10News(),
    fetchGelonghuiNews(),
    fetchXueqiuHotStocks(),
  ]);

  const totalItems =
    wallstreetcn.items.length +
    jin10.items.length +
    gelonghui.items.length +
    xueqiu.items.length;

  return {
    wallstreetcn,
    jin10,
    gelonghui,
    xueqiu,
    totalItems,
    fetchedAt: Date.now(),
  };
}

/**
 * 判断查询是否需要中文财经新闻
 */
export function isCnFinanceNewsRelevant(query: string): boolean {
  const keywords = [
    "A股", "港股", "沪深", "创业板", "科创板", "北交所",
    "中国股市", "A股市场", "港股市场",
    "华尔街见闻", "金十", "格隆汇", "雪球",
    "财联社", "中国经济", "人民币",
    "茅台", "宁德", "比亚迪", "腾讯", "阿里", "百度", "小米", "华为",
    "沪指", "深成指", "恒生", "国内", "A股行情",
  ];
  const queryLower = query.toLowerCase();
  return keywords.some((kw) => queryLower.includes(kw.toLowerCase()));
}

/**
 * 将新闻聚合结果格式化为 Markdown（注入 AI 分析上下文）
 */
export function formatCnNewsToMarkdown(result: CnNewsAggregateResult, query: string): string {
  if (result.totalItems === 0) return "";

  const sections: string[] = [];

  // 华尔街见闻快讯（最多 5 条）
  if (result.wallstreetcn.items.length > 0) {
    const lines = result.wallstreetcn.items.slice(0, 5).map((item) => {
      const time = new Date(item.publishedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Shanghai",
      });
      return `- [${time}] [${item.title}](${item.url})`;
    });
    sections.push(`**华尔街见闻快讯**\n${lines.join("\n")}`);
  }

  // 金十数据（最多 5 条，优先重要新闻）
  if (result.jin10.items.length > 0) {
    const sorted = [...result.jin10.items].sort((a, b) =>
      (b.important ? 1 : 0) - (a.important ? 1 : 0)
    );
    const lines = sorted.slice(0, 5).map((item) => {
      const time = new Date(item.publishedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Shanghai",
      });
      const star = item.important ? " ⭐" : "";
      return `- [${time}]${star} [${item.title}](${item.url})`;
    });
    sections.push(`**金十数据快讯**\n${lines.join("\n")}`);
  }

  // 格隆汇（最多 4 条）
  if (result.gelonghui.items.length > 0) {
    const lines = result.gelonghui.items.slice(0, 4).map((item) => {
      return `- [${item.title}](${item.url})`;
    });
    sections.push(`**格隆汇资讯**\n${lines.join("\n")}`);
  }

  // 雪球热股（最多 8 条）
  if (result.xueqiu.items.length > 0) {
    const lines = result.xueqiu.items.slice(0, 8).map((item) => {
      return `- [${item.title}](${item.url})`;
    });
    sections.push(`**雪球热股排行**\n${lines.join("\n")}`);
  }

  if (sections.length === 0) return "";

  return (
    `\n\n---\n### 📰 中文财经实时资讯（来源：华尔街见闻 / 金十 / 格隆汇 / 雪球）\n\n` +
    sections.join("\n\n") +
    `\n\n> 数据获取时间：${new Date(result.fetchedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} CST\n`
  );
}

/**
 * 健康检测
 */
export async function checkCnFinanceNewsHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  status: string;
  message: string;
}> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      "https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=1",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { ok: true, latencyMs, status: "ok", message: "华尔街见闻 API 正常" };
    }
    return {
      ok: false,
      latencyMs,
      status: "error",
      message: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      status: "error",
      message: String(err),
    };
  }
}
