/**
 * globalHolidays.ts
 * 全球主要股票市场实时交易日历服务
 *
 * 数据来源：
 *   - A股(CN)：Baostock query_trade_dates() — 官方交易日历，含调休工作日
 *   - 美股(US)：Polygon /v1/marketstatus/now — 实时开闭市状态
 *   - 港股(HK) / 英股(GB) / 德股(DE) / 法股(FR)：
 *       Nager.Date API 获取节假日 + 本地时间计算交易时段
 *
 * 缓存策略：
 *   - 交易日历（是否为交易日）：缓存24小时（每天凌晨自动过期）
 *   - 实时市场状态（开/闭市）：缓存5分钟
 *   - 节假日列表：缓存24小时
 */

import { execSync } from "child_process";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export type MarketCode = "CN" | "HK" | "US" | "GB" | "DE" | "FR";

export type TradingSession =
  | "trading"       // 正常交易时段
  | "pre_auction"   // 盘前竞价（港股 09:00-09:30）
  | "post_auction"  // 盘后撮合（港股 16:00-16:10）
  | "pre_market"    // 盘前（A股 09:00-09:30，美股盘前）
  | "post_market"   // 盘后（A股 15:00-15:30，美股盘后）
  | "lunch"         // 午休（A股 11:30-13:00，港股 12:00-13:00）
  | "closed";       // 休市（非交易日/夜间）

export interface MarketStatus {
  market: MarketCode;
  name: string;
  session: TradingSession;
  isOpen: boolean;
  localTime: string;    // 本地时间字符串（HH:MM）
  timezone: string;
  pollIntervalMs: number; // 建议的轮询间隔（毫秒）
}

// ─── 市场基本信息 ─────────────────────────────────────────────────────────────

export const MARKET_INFO: Record<MarketCode, {
  name: string;
  timezone: string;
  utcOffsetHours: number; // 标准时区偏移（夏令时需动态计算）
}> = {
  CN: { name: "上交所/深交所", timezone: "Asia/Shanghai", utcOffsetHours: 8 },
  HK: { name: "香港交易所", timezone: "Asia/Hong_Kong", utcOffsetHours: 8 },
  US: { name: "NYSE/NASDAQ", timezone: "America/New_York", utcOffsetHours: -5 },
  GB: { name: "伦敦证券交易所", timezone: "Europe/London", utcOffsetHours: 0 },
  DE: { name: "法兰克福证券交易所", timezone: "Europe/Berlin", utcOffsetHours: 1 },
  FR: { name: "泛欧交易所巴黎", timezone: "Europe/Paris", utcOffsetHours: 1 },
};

// ─── 缓存 ─────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const tradingDayCache = new Map<string, CacheEntry<boolean>>();   // "CN:2026-03-24" → true/false
const holidayCache = new Map<string, CacheEntry<Set<string>>>();  // "US:2026" → Set<dates>
const polygonStatusCache: { value: boolean | null; expiresAt: number } = {
  value: null,
  expiresAt: 0,
};

const TRADING_DAY_TTL = 24 * 60 * 60 * 1000;  // 24小时
const HOLIDAY_TTL = 24 * 60 * 60 * 1000;       // 24小时
const POLYGON_TTL = 5 * 60 * 1000;             // 5分钟

// ─── 工具函数：获取指定时区的本地时间 ────────────────────────────────────────

function getLocalTime(now: Date, timezone: string): {
  dateStr: string;   // "YYYY-MM-DD"
  timeStr: string;   // "HH:MM"
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  minuteOfDay: number; // 0-1439
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";

  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const minuteOfDay = hour * 60 + minute;

  // 获取星期几
  const localDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const dayOfWeek = localDate.getDay();

  return { dateStr, timeStr, dayOfWeek, minuteOfDay };
}

// ─── A股：Baostock 交易日历查询 ───────────────────────────────────────────────

function queryBaostockTradeDate(dateStr: string): boolean {
  const cacheKey = `CN:${dateStr}`;
  const cached = tradingDayCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  try {
    const script = `
import baostock as bs
import sys
lg = bs.login()
rs = bs.query_trade_dates(start_date='${dateStr}', end_date='${dateStr}')
if rs.error_code == '0' and rs.next():
    row = rs.get_row_data()
    print(row[1])  # '1' = 交易日, '0' = 非交易日
else:
    print('0')
bs.logout()
`.trim();

    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, {
      timeout: 10000,
      encoding: "utf8",
    }).trim();

    const isTradeDay = result === "1";
    tradingDayCache.set(cacheKey, {
      value: isTradeDay,
      expiresAt: Date.now() + TRADING_DAY_TTL,
    });
    return isTradeDay;
  } catch (err) {
    console.warn(`[GlobalHolidays] Baostock query failed for ${dateStr}, falling back to weekday check:`, err);
    // Fallback：按星期几判断（不考虑节假日）
    const d = new Date(dateStr + "T00:00:00+08:00");
    const dow = d.getDay();
    return dow !== 0 && dow !== 6;
  }
}

// ─── 美股：Polygon 实时市场状态 ───────────────────────────────────────────────

async function queryPolygonMarketStatus(): Promise<boolean> {
  if (polygonStatusCache.value !== null && Date.now() < polygonStatusCache.expiresAt) {
    return polygonStatusCache.value;
  }

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.warn("[GlobalHolidays] POLYGON_API_KEY not set, falling back to time-based check");
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(
      `https://api.polygon.io/v1/marketstatus/now?apiKey=${apiKey}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as { market: string };
    const isOpen = data.market === "open";

    polygonStatusCache.value = isOpen;
    polygonStatusCache.expiresAt = Date.now() + POLYGON_TTL;
    return isOpen;
  } catch (err) {
    console.warn("[GlobalHolidays] Polygon API failed:", err);
    polygonStatusCache.value = false;
    polygonStatusCache.expiresAt = Date.now() + 60 * 1000; // 1分钟后重试
    return false;
  }
}

// ─── 港股/英股/欧股：Nager.Date 节假日 ───────────────────────────────────────

const NAGER_COUNTRY: Partial<Record<MarketCode, string>> = {
  HK: "HK",
  GB: "GB",
  DE: "DE",
  FR: "FR",
};

// Fallback 节假日数据（Nager.Date API 不可用时使用）
const FALLBACK_HOLIDAYS: Partial<Record<MarketCode, Set<string>>> = {
  HK: new Set([
    "2026-01-01", "2026-01-28", "2026-01-29", "2026-01-30",
    "2026-04-03", "2026-04-04", "2026-04-06", "2026-04-05",
    "2026-05-01", "2026-05-27", "2026-06-19", "2026-07-01",
    "2026-09-25", "2026-10-01", "2026-10-17", "2026-12-25", "2026-12-26",
  ]),
  GB: new Set([
    "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04",
    "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  ]),
  DE: new Set([
    "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01",
    "2026-05-14", "2026-05-25", "2026-10-03", "2026-12-25", "2026-12-26",
  ]),
  FR: new Set([
    "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01",
    "2026-12-25", "2026-12-26",
  ]),
};

async function getNagerHolidays(market: MarketCode, year: number): Promise<Set<string>> {
  const cacheKey = `${market}:${year}`;
  const cached = holidayCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const countryCode = NAGER_COUNTRY[market];
  if (!countryCode) return new Set();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as Array<{
      date: string;
      global: boolean;
      types: string[];
    }>;

    const holidays = new Set<string>();
    for (const h of data) {
      if (h.global && (h.types.includes("Public") || h.types.includes("Bank"))) {
        holidays.add(h.date);
      }
    }

    holidayCache.set(cacheKey, { value: holidays, expiresAt: Date.now() + HOLIDAY_TTL });
    console.log(`[GlobalHolidays] Fetched ${holidays.size} holidays for ${market}/${year} from Nager.Date`);
    return holidays;
  } catch (err) {
    console.warn(`[GlobalHolidays] Nager.Date failed for ${market}/${year}, using fallback:`, err);
    const fallback = FALLBACK_HOLIDAYS[market] ?? new Set<string>();
    holidayCache.set(cacheKey, { value: fallback, expiresAt: Date.now() + HOLIDAY_TTL });
    return fallback;
  }
}

// ─── A股交易时段判断 ──────────────────────────────────────────────────────────

export function getAShareSession(now: Date = new Date()): TradingSession {
  const { dateStr, dayOfWeek, minuteOfDay } = getLocalTime(now, "Asia/Shanghai");

  // 先查 Baostock 交易日历（同步，有缓存）
  const isTradeDay = queryBaostockTradeDate(dateStr);
  if (!isTradeDay) return "closed";

  // 是交易日，判断具体时段
  if (minuteOfDay < 9 * 60) return "closed";           // 09:00 前
  if (minuteOfDay < 9 * 60 + 30) return "pre_market";  // 09:00-09:30 盘前
  if (minuteOfDay < 11 * 60 + 30) return "trading";    // 09:30-11:30 上午盘
  if (minuteOfDay < 13 * 60) return "lunch";            // 11:30-13:00 午休
  if (minuteOfDay < 15 * 60) return "trading";          // 13:00-15:00 下午盘
  if (minuteOfDay < 15 * 60 + 30) return "post_market"; // 15:00-15:30 盘后
  return "closed";                                       // 15:30 后
}

export function getASharePollIntervalMs(session: TradingSession): number {
  switch (session) {
    case "trading":     return 3_000;
    case "pre_market":
    case "post_market": return 10_000;
    case "lunch":       return 30_000;
    default:            return 30_000;
  }
}

// ─── 港股交易时段判断 ──────────────────────────────────────────────────────────

export async function getHKSession(now: Date = new Date()): Promise<TradingSession> {
  const { dateStr, dayOfWeek, minuteOfDay } = getLocalTime(now, "Asia/Hong_Kong");

  // 周末直接关闭
  if (dayOfWeek === 0 || dayOfWeek === 6) return "closed";

  // 检查节假日
  const year = parseInt(dateStr.slice(0, 4), 10);
  const holidays = await getNagerHolidays("HK", year);
  if (holidays.has(dateStr)) return "closed";

  // 判断时段
  if (minuteOfDay < 9 * 60) return "closed";                       // 09:00 前
  if (minuteOfDay < 9 * 60 + 30) return "pre_auction";             // 09:00-09:30 盘前竞价
  if (minuteOfDay < 12 * 60) return "trading";                     // 09:30-12:00 上午盘
  if (minuteOfDay < 13 * 60) return "lunch";                       // 12:00-13:00 午休
  if (minuteOfDay < 16 * 60) return "trading";                     // 13:00-16:00 下午盘
  if (minuteOfDay < 16 * 60 + 10) return "post_auction";           // 16:00-16:10 盘后撮合
  return "closed";
}

export function getHKPollIntervalMs(session: TradingSession): number {
  switch (session) {
    case "trading":      return 3_000;
    case "pre_auction":
    case "post_auction": return 5_000;
    case "lunch":        return 30_000;
    default:             return 30_000;
  }
}

// ─── 美股交易时段判断 ──────────────────────────────────────────────────────────

export async function getUSSession(now: Date = new Date()): Promise<TradingSession> {
  const { minuteOfDay, dayOfWeek } = getLocalTime(now, "America/New_York");

  // 周末
  if (dayOfWeek === 0 || dayOfWeek === 6) return "closed";

  // 使用 Polygon 实时状态（有5分钟缓存）
  const isOpen = await queryPolygonMarketStatus();
  if (isOpen) return "trading";

  // Polygon 说关闭，再判断是盘前/盘后还是真正关闭
  if (minuteOfDay >= 4 * 60 && minuteOfDay < 9 * 60 + 30) return "pre_market";
  if (minuteOfDay >= 16 * 60 && minuteOfDay < 20 * 60) return "post_market";
  return "closed";
}

export function getUSPollIntervalMs(session: TradingSession): number {
  switch (session) {
    case "trading":      return 3_000;
    case "pre_market":
    case "post_market":  return 10_000;
    default:             return 30_000;
  }
}

// ─── 英股/德股/法股交易时段判断 ──────────────────────────────────────────────

async function getEuropeanSession(
  market: "GB" | "DE" | "FR",
  timezone: string,
  openMin: number,
  closeMin: number,
  now: Date = new Date()
): Promise<TradingSession> {
  const { dateStr, dayOfWeek, minuteOfDay } = getLocalTime(now, timezone);

  if (dayOfWeek === 0 || dayOfWeek === 6) return "closed";

  const year = parseInt(dateStr.slice(0, 4), 10);
  const holidays = await getNagerHolidays(market, year);
  if (holidays.has(dateStr)) return "closed";

  if (minuteOfDay >= openMin && minuteOfDay < closeMin) return "trading";
  return "closed";
}

export async function getGBSession(now: Date = new Date()): Promise<TradingSession> {
  return getEuropeanSession("GB", "Europe/London", 8 * 60, 16 * 60 + 30, now);
}

export async function getDESession(now: Date = new Date()): Promise<TradingSession> {
  return getEuropeanSession("DE", "Europe/Berlin", 9 * 60, 17 * 60 + 30, now);
}

export async function getFRSession(now: Date = new Date()): Promise<TradingSession> {
  return getEuropeanSession("FR", "Europe/Paris", 9 * 60, 17 * 60 + 30, now);
}

// ─── 统一市场状态查询 ─────────────────────────────────────────────────────────

export async function getMarketStatus(market: MarketCode, now: Date = new Date()): Promise<MarketStatus> {
  const info = MARKET_INFO[market];
  const { timeStr } = getLocalTime(now, info.timezone);

  let session: TradingSession;
  switch (market) {
    case "CN": session = getAShareSession(now); break;
    case "HK": session = await getHKSession(now); break;
    case "US": session = await getUSSession(now); break;
    case "GB": session = await getGBSession(now); break;
    case "DE": session = await getDESession(now); break;
    case "FR": session = await getFRSession(now); break;
    default:   session = "closed";
  }

  const isOpen = session === "trading";

  let pollIntervalMs: number;
  switch (market) {
    case "CN": pollIntervalMs = getASharePollIntervalMs(session); break;
    case "HK": pollIntervalMs = getHKPollIntervalMs(session); break;
    case "US": pollIntervalMs = getUSPollIntervalMs(session); break;
    default:   pollIntervalMs = session === "trading" ? 5_000 : 30_000;
  }

  return {
    market,
    name: info.name,
    session,
    isOpen,
    localTime: timeStr,
    timezone: info.timezone,
    pollIntervalMs,
  };
}

/**
 * 获取所有市场的当前状态（用于全局市场状态栏）
 */
export async function getAllMarketStatuses(now: Date = new Date()): Promise<MarketStatus[]> {
  const markets: MarketCode[] = ["CN", "HK", "US", "GB", "DE", "FR"];
  return Promise.all(markets.map(m => getMarketStatus(m, now)));
}

/**
 * 预热缓存：服务器启动时调用，提前加载节假日数据
 */
export async function warmupHolidayCache(): Promise<void> {
  const currentYear = new Date().getFullYear();
  const nagerMarkets: MarketCode[] = ["HK", "GB", "DE", "FR"];
  await Promise.allSettled(
    nagerMarkets.flatMap(m => [
      getNagerHolidays(m, currentYear),
      getNagerHolidays(m, currentYear + 1),
    ])
  );
  console.log("[GlobalHolidays] Nager.Date cache warmed up");
}

/**
 * 强制清除缓存
 */
export function invalidateCache(market?: MarketCode): void {
  if (market) {
    const keysToDelete = Array.from(tradingDayCache.keys()).filter(k => k.startsWith(`${market}:`));
    keysToDelete.forEach(k => tradingDayCache.delete(k));
    const hKeysToDelete = Array.from(holidayCache.keys()).filter(k => k.startsWith(`${market}:`));
    hKeysToDelete.forEach(k => holidayCache.delete(k));
  } else {
    tradingDayCache.clear();
    holidayCache.clear();
    polygonStatusCache.value = null;
    polygonStatusCache.expiresAt = 0;
  }
}
