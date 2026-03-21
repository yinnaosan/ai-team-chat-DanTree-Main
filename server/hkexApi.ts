/**
 * HKEXnews (Hong Kong Exchanges and Clearing) Disclosure API
 * 香港交易所披露易 API - 港股公告/年报/监管文件
 * 免费公开，无需 API Key
 * 文档: https://www1.hkexnews.hk/search/titleSearchServlet.do
 */

const HKEX_BASE = "https://www1.hkexnews.hk/search/titleSearchServlet.do";
const HKEX_DOC_BASE = "https://www1.hkexnews.hk";
const TIMEOUT_MS = 12000;

// ─── 类型定义 ──────────────────────────────────────────────────────────────

export interface HKEXAnnouncement {
  newsId: string;
  title: string;
  stockCode: string;
  stockName: string;
  dateTime: string;
  fileType: string;
  fileLink: string;
  category: string;
  fileSize: string;
}

export interface HKEXData {
  stockCode: string;
  stockName: string;
  recentAnnouncements: HKEXAnnouncement[];  // 最近公告（最多 5 条）
  annualReports: HKEXAnnouncement[];         // 年报（最多 3 条）
  totalAnnouncements: number;
  fetchedAt: string;
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────

function buildSearchUrl(params: {
  stockId?: string;
  title?: string;
  t1code?: string;
  rowRange?: number;
  fromDate?: string;
  toDate?: string;
}): string {
  const today = new Date();
  const toDate = params.toDate ?? today.toISOString().slice(0, 10).replace(/-/g, "");
  const fromDate = params.fromDate ?? (() => {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  })();

  const p = new URLSearchParams({
    sortDir: "0",
    sortByField: "F_DATE_TIME",
    category: "0",
    market: "SEHK",
    lang: "EN",
    ss: "",
    from: fromDate,
    to: toDate,
    MB: "",
    title: params.title ?? "",
    stockId: params.stockId ?? "",
    t1code: params.t1code ?? "",
    t2Gcode: "",
    t2code: "",
    rowRange: String(params.rowRange ?? 5),
    startRow: "0",
  });
  return `${HKEX_BASE}?${p.toString()}`;
}

function parseAnnouncementItem(item: Record<string, string>): HKEXAnnouncement {
  // 清理 HTML 实体
  const cleanTitle = (item.TITLE ?? "")
    .replace(/&#x3b;/g, ";")
    .replace(/&#x2f;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<br\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();

  return {
    newsId: item.NEWS_ID ?? "",
    title: cleanTitle,
    stockCode: item.STOCK_CODE ?? "",
    stockName: item.STOCK_NAME ?? "",
    dateTime: item.DATE_TIME ?? "",
    fileType: item.FILE_TYPE ?? "",
    fileLink: item.FILE_LINK ? `${HKEX_DOC_BASE}${item.FILE_LINK}` : "",
    category: (item.LONG_TEXT ?? "").replace(/<[^>]+>/g, "").trim(),
    fileSize: item.FILE_INFO ?? "",
  };
}

async function fetchHKEXAnnouncements(params: {
  stockId?: string;
  title?: string;
  t1code?: string;
  rowRange?: number;
  fromDate?: string;
}): Promise<{ items: HKEXAnnouncement[]; total: number }> {
  const url = buildSearchUrl(params);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; InvestBot/1.0)",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { items: [], total: 0 };
    const data = await res.json() as {
      result: string | null;
      recordCnt: number;
    };
    if (!data.result || data.result === "null") return { items: [], total: 0 };
    const rawItems = JSON.parse(data.result) as Array<Record<string, string>>;
    return {
      items: rawItems.map(parseAnnouncementItem),
      total: data.recordCnt ?? rawItems.length,
    };
  } catch {
    return { items: [], total: 0 };
  }
}

// ─── 从任务文本提取港股代码 ────────────────────────────────────────────────

/**
 * 从任务文本中提取港股代码（4-5位数字，如 00700、00005、09988）
 * 支持格式：00700、0700、700.HK、HK:700、腾讯(00700)等
 */
export function extractHKStockCode(taskText: string): string | null {
  // 匹配 .HK 格式
  const hkMatch = taskText.match(/\b(\d{1,5})\.HK\b/i);
  if (hkMatch) return hkMatch[1].padStart(5, "0");

  // 匹配 HK: 格式
  const hkColonMatch = taskText.match(/\bHK[:\s]+(\d{1,5})\b/i);
  if (hkColonMatch) return hkColonMatch[1].padStart(5, "0");

  // 匹配括号中的港股代码
  const bracketMatch = taskText.match(/[（(](\d{4,5})[）)]/);
  if (bracketMatch) return bracketMatch[1].padStart(5, "0");

  // 匹配 5 位数字代码（如 00700）
  const fiveDigitMatch = taskText.match(/\b(0[0-9]{4})\b/);
  if (fiveDigitMatch) return fiveDigitMatch[1];

  return null;
}

/**
 * 检测任务是否与港股相关
 */
export function isHKStockTask(taskText: string): boolean {
  const lower = taskText.toLowerCase();
  const keywords = [
    "港股", "香港股票", "香港交易所", "hkex", "hkexnews", "披露易",
    "恒生指数", "恒指", "hang seng", "hsi",
    ".hk", "hk:", "港交所", "联交所", "sehk",
    "腾讯", "阿里巴巴", "汇丰", "中国平安", "美团", "京东",
    "tencent", "alibaba", "hsbc", "ping an", "meituan",
    "00700", "09988", "00005", "02318", "03690",
  ];
  return keywords.some(kw => lower.includes(kw)) || extractHKStockCode(taskText) !== null;
}

// ─── 主获取函数 ────────────────────────────────────────────────────────────

/**
 * 获取港股公告数据
 * @param stockCodeOrName 股票代码（如 "00700"）或公司名称关键词（如 "tencent"）
 */
export async function fetchHKEXData(stockCodeOrName: string): Promise<HKEXData | null> {
  // 判断是股票代码还是公司名称
  const isCode = /^\d{1,5}$/.test(stockCodeOrName.replace(/^0+/, ""));
  const stockCode = isCode ? stockCodeOrName.padStart(5, "0") : null;

  // 策略：用 stockId（去掉前导零的数字）搜索
  // 注意：stockId 是 HKEX 内部 ID，对于 00005 等小代码数字 ID 恰好相同
  // 对于其他代码，使用 title 搜索作为后备
  const stockIdNum = stockCode ? String(parseInt(stockCode, 10)) : null;

  let recentResult = { items: [] as HKEXAnnouncement[], total: 0 };
  let annualResult = { items: [] as HKEXAnnouncement[], total: 0 };
  let detectedStockCode = stockCode ?? "";
  let detectedStockName = "";

  if (stockIdNum) {
    // 先用 stockId 搜索最近公告
    const r = await fetchHKEXAnnouncements({
      stockId: stockIdNum,
      rowRange: 5,
    });

    // 验证返回的股票代码是否匹配
    if (r.items.length > 0 && r.items[0].stockCode === stockCode) {
      recentResult = r;
      detectedStockName = r.items[0].stockName;

      // 搜索年报
      const arResult = await fetchHKEXAnnouncements({
        stockId: stockIdNum,
        title: "annual report",
        rowRange: 3,
        fromDate: (() => {
          const d = new Date();
          d.setFullYear(d.getFullYear() - 5);
          return d.toISOString().slice(0, 10).replace(/-/g, "");
        })(),
      });
      annualResult = arResult;
    } else {
      // stockId 不匹配，使用公司名称搜索
      const nameQuery = isCode ? "" : stockCodeOrName;
      if (nameQuery) {
        const r2 = await fetchHKEXAnnouncements({
          title: nameQuery,
          rowRange: 5,
        });
        recentResult = r2;
        if (r2.items.length > 0) {
          detectedStockCode = r2.items[0].stockCode;
          detectedStockName = r2.items[0].stockName;
        }
      }
    }
  } else {
    // 用公司名称搜索
    const r = await fetchHKEXAnnouncements({
      title: stockCodeOrName,
      rowRange: 5,
    });
    recentResult = r;
    if (r.items.length > 0) {
      detectedStockCode = r.items[0].stockCode;
      detectedStockName = r.items[0].stockName;
    }
  }

  if (recentResult.items.length === 0 && annualResult.items.length === 0) {
    return null;
  }

  return {
    stockCode: detectedStockCode,
    stockName: detectedStockName,
    recentAnnouncements: recentResult.items,
    annualReports: annualResult.items,
    totalAnnouncements: recentResult.total,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── 格式化为 Markdown ─────────────────────────────────────────────────────

export function formatHKEXDataAsMarkdown(data: HKEXData): string {
  const lines: string[] = [
    `## 港交所披露易数据 — ${data.stockCode} ${data.stockName}`,
    "",
    `**总公告数（近 2 年）：** ${data.totalAnnouncements}`,
    "",
  ];

  if (data.recentAnnouncements.length > 0) {
    lines.push("### 最新公告");
    lines.push("| 日期 | 标题 | 类型 |");
    lines.push("|------|------|------|");
    for (const ann of data.recentAnnouncements) {
      const title = ann.title.length > 60 ? ann.title.slice(0, 57) + "..." : ann.title;
      const category = ann.category.includes("-") ? ann.category.split("-").pop()?.trim() ?? ann.category : ann.category;
      const shortCat = category.length > 40 ? category.slice(0, 37) + "..." : category;
      lines.push(`| ${ann.dateTime} | [${title}](${ann.fileLink}) | ${shortCat} |`);
    }
    lines.push("");
  }

  if (data.annualReports.length > 0) {
    lines.push("### 年报");
    lines.push("| 日期 | 标题 |");
    lines.push("|------|------|");
    for (const ar of data.annualReports) {
      const title = ar.title.length > 70 ? ar.title.slice(0, 67) + "..." : ar.title;
      lines.push(`| ${ar.dateTime} | [${title}](${ar.fileLink}) |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── 健康检测 ──────────────────────────────────────────────────────────────

export async function checkHKEXHealth(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const start = Date.now();
  try {
    // 用 HSBC (00005, stockId=5) 测试
    const result = await fetchHKEXAnnouncements({ stockId: "5", rowRange: 1 });
    const latencyMs = Date.now() - start;
    if (result.items.length > 0) {
      return { ok: true, latencyMs, detail: `HKEXnews: ${result.items[0].stockCode} ${result.items[0].stockName}` };
    }
    return { ok: false, latencyMs, detail: "HKEXnews 返回空数据" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, detail: String(e) };
  }
}
