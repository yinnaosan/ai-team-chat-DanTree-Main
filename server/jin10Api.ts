/**
 * jin10Api.ts
 * Jin10 官方 MCP 接口客户端
 * 协议：MCP 2024-11-05 over Streamable HTTP（SSE 响应）
 *
 * 提供：
 *   fetchJin10FlashNews()  — 实时快讯（list_flash）
 *   fetchJin10Calendar()   — 财经日历（list_calendar）
 *   fetchJin10Quote()      — 宏观报价（get_quote）
 */

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface Jin10FlashItem {
  id: string;
  title: string;
  content: string;
  url: string;
  source: "金十数据";
  publishedAt: number; // UTC ms
  important: boolean;
}

export interface Jin10FlashResult {
  items: Jin10FlashItem[];
  hasMore: boolean;
  fetchedAt: number;
  error?: string;
  via: "mcp" | "fallback";
}

export interface Jin10CalendarItem {
  title: string;
  pubTime: string;       // "2026-04-11 08:30"
  actual: string | null;
  consensus: string | null;
  previous: string | null;
  revised: string | null;
  affectTxt: string | null;
  star: number;          // 1-3，重要程度
}

export interface Jin10CalendarResult {
  items: Jin10CalendarItem[];
  fetchedAt: number;
  error?: string;
}

export interface Jin10QuoteItem {
  code: string;
  name: string;
  price: string;
  change: string;        // ups_price
  changePct: string;     // ups_percent
  open: string;
  high: string;
  low: string;
  volume: number;
  time: string;          // ISO 8601
}

export interface Jin10QuoteResult {
  quotes: Record<string, Jin10QuoteItem | null>;
  fetchedAt: number;
  error?: string;
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

const BASE_URL = "https://mcp.jin10.com/mcp";
const SESSION_TTL_MS = 25_000;  // 25s，低于服务端 30s 超时
const TOOL_TIMEOUT_MS = 8_000;  // 单次工具调用超时

/** 默认报价 codes（按探测结果使用官方 code 格式） */
export const DEFAULT_QUOTE_CODES = [
  "000001",   // 上证指数
  "000300",   // 沪深300
  "HSI",      // 恒生指数
  "XAUUSD",   // 现货黄金
  "USOIL",    // WTI原油
  "UKOIL",    // 布伦特原油
  "EURUSD",   // 欧元/美元
  "USDCNH",   // 美元/人民币
  "XAGUSD",   // 现货白银
];

/** 重要快讯关键词（命中则 important=true） */
const IMPORTANT_KEYWORDS = [
  "央行", "美联储", "加息", "降息", "CPI", "GDP", "非农",
  "重磅", "突发", "紧急", "暴跌", "暴涨", "熔断", "停牌",
  "制裁", "战争", "危机", "违约", "破产", "退市",
];

// ── Session 池 ────────────────────────────────────────────────────────────────

interface Session {
  sid: string;
  createdAt: number;
}

let _session: Session | null = null;

function isSessionValid(s: Session | null): s is Session {
  return s !== null && Date.now() - s.createdAt < SESSION_TTL_MS;
}

function getToken(): string {
  const token = process.env.JIN10_MCP_TOKEN;
  if (!token) throw new Error("JIN10_MCP_TOKEN not configured");
  return token;
}

// ── SSE 解析 ──────────────────────────────────────────────────────────────────

async function parseSSE(response: Response): Promise<unknown[]> {
  const text = await response.text();
  const results: unknown[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6).trim();
      if (data && data !== "[DONE]") {
        try { results.push(JSON.parse(data)); } catch { /* skip malformed */ }
      }
    }
  }
  return results;
}

// ── 低层 MCP 调用 ─────────────────────────────────────────────────────────────

async function mcpPost(body: object, sid?: string): Promise<unknown[]> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json, text/event-stream",
  };
  if (sid) headers["mcp-session-id"] = sid;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
    return parseSSE(res);
  } finally {
    clearTimeout(timer);
  }
}

// ── Session 管理 ──────────────────────────────────────────────────────────────

async function ensureSession(): Promise<string> {
  if (isSessionValid(_session)) return _session.sid;

  // Step 1: initialize
  const initBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "dantree-server", version: "1.0" },
    },
  };

  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  let sid: string;
  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify(initBody),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MCP initialize HTTP ${res.status}`);
    sid = res.headers.get("mcp-session-id") || "";
    if (!sid) throw new Error("MCP initialize: no mcp-session-id in response headers");
    await parseSSE(res); // consume body
  } finally {
    clearTimeout(timer);
  }

  // Step 2: notifications/initialized
  await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized" }, sid);

  _session = { sid, createdAt: Date.now() };
  return sid;
}

// ── tools/call 包装 ───────────────────────────────────────────────────────────

async function callTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const sid = await ensureSession();
  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name: toolName, arguments: args },
  };
  const events = await mcpPost(body, sid) as Array<{ result?: { content?: Array<{ text?: string }> }; error?: unknown }>;
  const evt = events.find((e) => e.result || e.error);
  if (!evt) throw new Error(`tools/call ${toolName}: no result event`);
  if (evt.error) throw new Error(`tools/call ${toolName} error: ${JSON.stringify(evt.error)}`);
  const text = evt.result?.content?.[0]?.text;
  if (!text) throw new Error(`tools/call ${toolName}: empty content`);
  return JSON.parse(text);
}

// ── fetchJin10FlashNews ───────────────────────────────────────────────────────

/**
 * 获取金十数据实时快讯（list_flash 第一页）
 * title 规则：接口有 title 则用，否则截断 content 前 70 字符
 */
export async function fetchJin10FlashNews(): Promise<Jin10FlashResult> {
  try {
    const raw = await callTool("list_flash", {}) as {
      data?: {
        has_more?: boolean;
        items?: Array<{
          id?: string;
          content?: string;
          title?: string;
          time?: string;
          url?: string;
          important?: boolean | number;
        }>;
      };
    };

    const rawItems = raw?.data?.items ?? [];
    const hasMore = raw?.data?.has_more ?? false;

    const items: Jin10FlashItem[] = rawItems.map((k, idx) => {
      const content = k.content ?? "";
      const rawTitle = k.title && k.title.trim() ? k.title.trim() : "";

      // title 生成规则：优先 title，否则截断 content
      let title: string;
      if (rawTitle) {
        title = rawTitle.slice(0, 100);
      } else {
        // 尝试提取【...】括号内容作为 title
        const bracketMatch = content.match(/^【([^】]{1,50})】/);
        title = bracketMatch ? bracketMatch[1] : content.slice(0, 70);
      }

      // important 判断：接口字段 || 关键词命中
      const isImportantByField = typeof k.important === "boolean" ? k.important : !!k.important;
      const isImportantByKeyword = IMPORTANT_KEYWORDS.some((kw) => content.includes(kw));
      const important = isImportantByField || isImportantByKeyword;

      // publishedAt：解析 ISO 8601 时间字符串
      let publishedAt = Date.now();
      if (k.time) {
        const parsed = new Date(k.time).getTime();
        if (!isNaN(parsed)) publishedAt = parsed;
      }

      // id：优先接口 id，否则用 url 末尾或 index
      const id = k.id ?? k.url?.split("/").pop() ?? String(idx);

      return {
        id,
        title,
        content,
        url: k.url ?? `https://flash.jin10.com/detail/${id}`,
        source: "金十数据",
        publishedAt,
        important,
      };
    });

    return { items, hasMore, fetchedAt: Date.now(), via: "mcp" };
  } catch (err) {
    return { items: [], hasMore: false, fetchedAt: Date.now(), error: String(err), via: "mcp" };
  }
}

// ── fetchJin10Calendar ────────────────────────────────────────────────────────

/**
 * 获取当前自然周财经日历（list_calendar）
 * 返回全部条目，调用方可按 star >= 2 过滤高重要性事件
 */
export async function fetchJin10Calendar(): Promise<Jin10CalendarResult> {
  try {
    const raw = await callTool("list_calendar", {}) as Array<{
      title?: string;
      pub_time?: string;
      actual?: string | null;
      consensus?: string | null;
      previous?: string | null;
      revised?: string | null;
      affect_txt?: string | null;
      star?: number;
    }>;

    const items: Jin10CalendarItem[] = (Array.isArray(raw) ? raw : []).map((k) => ({
      title: k.title ?? "",
      pubTime: k.pub_time ?? "",
      actual: k.actual ?? null,
      consensus: k.consensus ?? null,
      previous: k.previous ?? null,
      revised: k.revised ?? null,
      affectTxt: k.affect_txt ?? null,
      star: k.star ?? 1,
    }));

    return { items, fetchedAt: Date.now() };
  } catch (err) {
    return { items: [], fetchedAt: Date.now(), error: String(err) };
  }
}

// ── fetchJin10Quote ───────────────────────────────────────────────────────────

/**
 * 批量获取宏观报价（get_quote）
 * 并行调用，单个失败不影响其他
 * @param codes 官方 code 列表，默认使用 DEFAULT_QUOTE_CODES
 */
export async function fetchJin10Quote(
  codes: string[] = DEFAULT_QUOTE_CODES
): Promise<Jin10QuoteResult> {
  const results: Record<string, Jin10QuoteItem | null> = {};

  await Promise.all(
    codes.map(async (code) => {
      try {
        const raw = await callTool("get_quote", { code }) as {
          data?: {
            code?: string;
            name?: string;
            close?: string;
            ups_price?: string;
            ups_percent?: string;
            open?: string;
            high?: string;
            low?: string;
            volume?: number;
            time?: string;
          };
          status?: number;
        };

        if (raw?.status === 200 && raw.data) {
          const d = raw.data;
          results[code] = {
            code: d.code ?? code,
            name: d.name ?? code,
            price: d.close ?? "",
            change: d.ups_price ?? "",
            changePct: d.ups_percent ?? "",
            open: d.open ?? "",
            high: d.high ?? "",
            low: d.low ?? "",
            volume: d.volume ?? 0,
            time: d.time ?? "",
          };
        } else {
          results[code] = null;
        }
      } catch {
        results[code] = null;
      }
    })
  );

  return { quotes: results, fetchedAt: Date.now() };
}

// ── 格式化工具 ────────────────────────────────────────────────────────────────

/**
 * 将快讯结果格式化为 Markdown（注入 AI 分析上下文）
 */
export function formatJin10FlashToMarkdown(result: Jin10FlashResult, limit = 10): string {
  if (result.items.length === 0) return "";

  const sorted = [...result.items].sort((a, b) => {
    // 重要新闻优先，然后按时间倒序
    if (a.important !== b.important) return a.important ? -1 : 1;
    return b.publishedAt - a.publishedAt;
  });

  const lines = sorted.slice(0, limit).map((item) => {
    const time = new Date(item.publishedAt).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Shanghai",
    });
    const star = item.important ? " ⭐" : "";
    return `- [${time}]${star} [${item.title}](${item.url})`;
  });

  return `**金十数据快讯**（MCP 官方接口）\n${lines.join("\n")}`;
}

/**
 * 将财经日历格式化为 Markdown（仅显示 star >= 2 的事件）
 */
export function formatJin10CalendarToMarkdown(result: Jin10CalendarResult, minStar = 2): string {
  const filtered = result.items.filter((k) => k.star >= minStar);
  if (filtered.length === 0) return "";

  const lines = filtered.slice(0, 10).map((k) => {
    const actual = k.actual ? `实际: **${k.actual}**` : "待公布";
    const consensus = k.consensus ? ` 预期: ${k.consensus}` : "";
    const affect = k.affectTxt ? ` [${k.affectTxt}]` : "";
    const stars = "★".repeat(k.star);
    return `- ${k.pubTime} ${stars} **${k.title}** — ${actual}${consensus}${affect}`;
  });

  return `**财经日历（本周重要事件）**\n${lines.join("\n")}`;
}

/**
 * 将报价结果格式化为 Markdown
 */
export function formatJin10QuoteToMarkdown(result: Jin10QuoteResult): string {
  const validQuotes = Object.values(result.quotes).filter((q): q is Jin10QuoteItem => q !== null);
  if (validQuotes.length === 0) return "";

  const lines = validQuotes.map((q) => {
    const sign = parseFloat(q.changePct) >= 0 ? "▲" : "▼";
    return `- **${q.name}**（${q.code}）: ${q.price}  ${sign}${q.changePct}%`;
  });

  return `**宏观市场报价**\n${lines.join("\n")}`;
}
