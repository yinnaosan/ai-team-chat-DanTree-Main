/**
 * marketHolidays.ts
 * 全球主要市场节假日数据库（2024-2026）
 * 格式：YYYY-MM-DD（UTC 日期字符串）
 *
 * 数据来源：各交易所官方公告
 * - 美股 NYSE/NASDAQ：https://www.nyse.com/markets/hours-calendars
 * - A股 SSE/SZSE：中国证监会
 * - 港股 HKEX：https://www.hkex.com.hk
 * - 英股 LSE：https://www.londonstockexchange.com
 * - 欧股 XETRA/Euronext：各交易所官网
 */

export type MarketHolidayKey = "us" | "cn" | "hk" | "uk" | "eu";

/** 节假日条目 */
export interface HolidayEntry {
  date: string;   // YYYY-MM-DD
  name: string;   // 节假日名称
}

// ─── 美股 NYSE/NASDAQ 节假日 ──────────────────────────────────────────────────
const US_HOLIDAYS: HolidayEntry[] = [
  // 2024
  { date: "2024-01-01", name: "元旦" },
  { date: "2024-01-15", name: "马丁·路德·金纪念日" },
  { date: "2024-02-19", name: "总统日" },
  { date: "2024-03-29", name: "耶稣受难日" },
  { date: "2024-05-27", name: "阵亡将士纪念日" },
  { date: "2024-06-19", name: "六月节" },
  { date: "2024-07-04", name: "独立日" },
  { date: "2024-09-02", name: "劳动节" },
  { date: "2024-11-28", name: "感恩节" },
  { date: "2024-11-29", name: "感恩节次日（半日）" },
  { date: "2024-12-24", name: "平安夜（半日）" },
  { date: "2024-12-25", name: "圣诞节" },
  // 2025
  { date: "2025-01-01", name: "元旦" },
  { date: "2025-01-09", name: "吉米·卡特国家哀悼日" },
  { date: "2025-01-20", name: "马丁·路德·金纪念日" },
  { date: "2025-02-17", name: "总统日" },
  { date: "2025-04-18", name: "耶稣受难日" },
  { date: "2025-05-26", name: "阵亡将士纪念日" },
  { date: "2025-06-19", name: "六月节" },
  { date: "2025-07-04", name: "独立日" },
  { date: "2025-09-01", name: "劳动节" },
  { date: "2025-11-27", name: "感恩节" },
  { date: "2025-11-28", name: "感恩节次日（半日）" },
  { date: "2025-12-24", name: "平安夜（半日）" },
  { date: "2025-12-25", name: "圣诞节" },
  // 2026
  { date: "2026-01-01", name: "元旦" },
  { date: "2026-01-19", name: "马丁·路德·金纪念日" },
  { date: "2026-02-16", name: "总统日" },
  { date: "2026-04-03", name: "耶稣受难日" },
  { date: "2026-05-25", name: "阵亡将士纪念日" },
  { date: "2026-06-19", name: "六月节" },
  { date: "2026-07-03", name: "独立日（提前观察）" },
  { date: "2026-09-07", name: "劳动节" },
  { date: "2026-11-26", name: "感恩节" },
  { date: "2026-11-27", name: "感恩节次日（半日）" },
  { date: "2026-12-24", name: "平安夜（半日）" },
  { date: "2026-12-25", name: "圣诞节" },
];

// ─── A股 SSE/SZSE 节假日 ─────────────────────────────────────────────────────
const CN_HOLIDAYS: HolidayEntry[] = [
  // 2024
  { date: "2024-01-01", name: "元旦" },
  { date: "2024-02-09", name: "春节" },
  { date: "2024-02-12", name: "春节" },
  { date: "2024-02-13", name: "春节" },
  { date: "2024-02-14", name: "春节" },
  { date: "2024-02-15", name: "春节" },
  { date: "2024-02-16", name: "春节" },
  { date: "2024-04-04", name: "清明节" },
  { date: "2024-04-05", name: "清明节" },
  { date: "2024-05-01", name: "劳动节" },
  { date: "2024-05-02", name: "劳动节" },
  { date: "2024-05-03", name: "劳动节" },
  { date: "2024-06-10", name: "端午节" },
  { date: "2024-09-16", name: "中秋节" },
  { date: "2024-09-17", name: "中秋节" },
  { date: "2024-10-01", name: "国庆节" },
  { date: "2024-10-02", name: "国庆节" },
  { date: "2024-10-03", name: "国庆节" },
  { date: "2024-10-04", name: "国庆节" },
  { date: "2024-10-07", name: "国庆节" },
  // 2025
  { date: "2025-01-01", name: "元旦" },
  { date: "2025-01-28", name: "春节" },
  { date: "2025-01-29", name: "春节" },
  { date: "2025-01-30", name: "春节" },
  { date: "2025-01-31", name: "春节" },
  { date: "2025-02-03", name: "春节" },
  { date: "2025-02-04", name: "春节" },
  { date: "2025-04-04", name: "清明节" },
  { date: "2025-05-01", name: "劳动节" },
  { date: "2025-05-02", name: "劳动节" },
  { date: "2025-05-05", name: "劳动节" },
  { date: "2025-05-31", name: "端午节" },
  { date: "2025-06-02", name: "端午节" },
  { date: "2025-10-01", name: "国庆节" },
  { date: "2025-10-02", name: "国庆节" },
  { date: "2025-10-03", name: "国庆节" },
  { date: "2025-10-06", name: "国庆节" },
  { date: "2025-10-07", name: "国庆节" },
  { date: "2025-10-08", name: "国庆节/中秋节" },
  // 2026（预估，以官方公告为准）
  { date: "2026-01-01", name: "元旦" },
  { date: "2026-02-17", name: "春节" },
  { date: "2026-02-18", name: "春节" },
  { date: "2026-02-19", name: "春节" },
  { date: "2026-02-20", name: "春节" },
  { date: "2026-02-23", name: "春节" },
  { date: "2026-02-24", name: "春节" },
  { date: "2026-04-06", name: "清明节" },
  { date: "2026-05-01", name: "劳动节" },
  { date: "2026-05-04", name: "劳动节" },
  { date: "2026-05-05", name: "劳动节" },
  { date: "2026-06-19", name: "端午节" },
  { date: "2026-09-25", name: "中秋节" },
  { date: "2026-10-01", name: "国庆节" },
  { date: "2026-10-02", name: "国庆节" },
  { date: "2026-10-05", name: "国庆节" },
  { date: "2026-10-06", name: "国庆节" },
  { date: "2026-10-07", name: "国庆节" },
  { date: "2026-10-08", name: "国庆节" },
];

// ─── 港股 HKEX 节假日 ────────────────────────────────────────────────────────
const HK_HOLIDAYS: HolidayEntry[] = [
  // 2024
  { date: "2024-01-01", name: "元旦" },
  { date: "2024-02-12", name: "农历新年" },
  { date: "2024-02-13", name: "农历新年" },
  { date: "2024-02-14", name: "农历新年" },
  { date: "2024-03-29", name: "耶稣受难日" },
  { date: "2024-04-01", name: "复活节星期一" },
  { date: "2024-04-04", name: "清明节" },
  { date: "2024-05-15", name: "佛诞" },
  { date: "2024-05-22", name: "端午节" },
  { date: "2024-07-01", name: "香港回归纪念日" },
  { date: "2024-09-18", name: "中秋节翌日" },
  { date: "2024-10-01", name: "国庆节" },
  { date: "2024-10-11", name: "重阳节" },
  { date: "2024-12-25", name: "圣诞节" },
  { date: "2024-12-26", name: "圣诞节翌日" },
  // 2025
  { date: "2025-01-01", name: "元旦" },
  { date: "2025-01-29", name: "农历新年" },
  { date: "2025-01-30", name: "农历新年" },
  { date: "2025-01-31", name: "农历新年" },
  { date: "2025-04-04", name: "清明节" },
  { date: "2025-04-18", name: "耶稣受难日" },
  { date: "2025-04-19", name: "耶稣受难日翌日" },
  { date: "2025-04-21", name: "复活节星期一" },
  { date: "2025-05-05", name: "佛诞" },
  { date: "2025-05-31", name: "端午节" },
  { date: "2025-07-01", name: "香港回归纪念日" },
  { date: "2025-10-01", name: "国庆节" },
  { date: "2025-10-07", name: "重阳节" },
  { date: "2025-10-08", name: "中秋节翌日" },
  { date: "2025-12-25", name: "圣诞节" },
  { date: "2025-12-26", name: "圣诞节翌日" },
  // 2026（预估）
  { date: "2026-01-01", name: "元旦" },
  { date: "2026-02-17", name: "农历新年" },
  { date: "2026-02-18", name: "农历新年" },
  { date: "2026-02-19", name: "农历新年" },
  { date: "2026-04-03", name: "耶稣受难日" },
  { date: "2026-04-06", name: "清明节" },
  { date: "2026-04-07", name: "复活节星期二" },
  { date: "2026-05-25", name: "佛诞" },
  { date: "2026-06-19", name: "端午节" },
  { date: "2026-07-01", name: "香港回归纪念日" },
  { date: "2026-10-01", name: "国庆节" },
  { date: "2026-10-26", name: "重阳节" },
  { date: "2026-12-25", name: "圣诞节" },
  { date: "2026-12-26", name: "圣诞节翌日" },
];

// ─── 英股 LSE 节假日 ─────────────────────────────────────────────────────────
const UK_HOLIDAYS: HolidayEntry[] = [
  // 2024
  { date: "2024-01-01", name: "元旦" },
  { date: "2024-03-29", name: "耶稣受难日" },
  { date: "2024-04-01", name: "复活节星期一" },
  { date: "2024-05-06", name: "劳动节" },
  { date: "2024-05-27", name: "春季银行假日" },
  { date: "2024-08-26", name: "夏季银行假日" },
  { date: "2024-12-25", name: "圣诞节" },
  { date: "2024-12-26", name: "节礼日" },
  // 2025
  { date: "2025-01-01", name: "元旦" },
  { date: "2025-04-18", name: "耶稣受难日" },
  { date: "2025-04-21", name: "复活节星期一" },
  { date: "2025-05-05", name: "劳动节" },
  { date: "2025-05-26", name: "春季银行假日" },
  { date: "2025-08-25", name: "夏季银行假日" },
  { date: "2025-12-25", name: "圣诞节" },
  { date: "2025-12-26", name: "节礼日" },
  // 2026
  { date: "2026-01-01", name: "元旦" },
  { date: "2026-04-03", name: "耶稣受难日" },
  { date: "2026-04-06", name: "复活节星期一" },
  { date: "2026-05-04", name: "劳动节" },
  { date: "2026-05-25", name: "春季银行假日" },
  { date: "2026-08-31", name: "夏季银行假日" },
  { date: "2026-12-25", name: "圣诞节" },
  { date: "2026-12-26", name: "节礼日" },
];

// ─── 欧股 XETRA/Euronext 节假日 ──────────────────────────────────────────────
const EU_HOLIDAYS: HolidayEntry[] = [
  // 2024
  { date: "2024-01-01", name: "元旦" },
  { date: "2024-03-29", name: "耶稣受难日" },
  { date: "2024-04-01", name: "复活节星期一" },
  { date: "2024-05-01", name: "劳动节" },
  { date: "2024-12-24", name: "平安夜" },
  { date: "2024-12-25", name: "圣诞节" },
  { date: "2024-12-26", name: "节礼日" },
  { date: "2024-12-31", name: "新年前夕" },
  // 2025
  { date: "2025-01-01", name: "元旦" },
  { date: "2025-04-18", name: "耶稣受难日" },
  { date: "2025-04-21", name: "复活节星期一" },
  { date: "2025-05-01", name: "劳动节" },
  { date: "2025-12-24", name: "平安夜" },
  { date: "2025-12-25", name: "圣诞节" },
  { date: "2025-12-26", name: "节礼日" },
  { date: "2025-12-31", name: "新年前夕" },
  // 2026
  { date: "2026-01-01", name: "元旦" },
  { date: "2026-04-03", name: "耶稣受难日" },
  { date: "2026-04-06", name: "复活节星期一" },
  { date: "2026-05-01", name: "劳动节" },
  { date: "2026-12-24", name: "平安夜" },
  { date: "2026-12-25", name: "圣诞节" },
  { date: "2026-12-26", name: "节礼日" },
  { date: "2026-12-31", name: "新年前夕" },
];

// ─── 节假日查询 API ───────────────────────────────────────────────────────────

const HOLIDAY_DB: Record<MarketHolidayKey, HolidayEntry[]> = {
  us: US_HOLIDAYS,
  cn: CN_HOLIDAYS,
  hk: HK_HOLIDAYS,
  uk: UK_HOLIDAYS,
  eu: EU_HOLIDAYS,
};

/**
 * 将 Date 对象格式化为 YYYY-MM-DD（UTC 日期）
 */
function toDateStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 检查指定日期是否为某市场的节假日
 * @returns HolidayEntry 如果是节假日，否则 null
 */
export function getHoliday(market: MarketHolidayKey, date?: Date): HolidayEntry | null {
  const d = date ?? new Date();
  const dateStr = toDateStr(d);
  const holidays = HOLIDAY_DB[market];
  return holidays.find(h => h.date === dateStr) ?? null;
}

/**
 * 检查今天是否为某市场的节假日
 */
export function isTodayHoliday(market: MarketHolidayKey): HolidayEntry | null {
  return getHoliday(market);
}

/**
 * 获取某市场下一个节假日（从今天起）
 */
export function getNextHoliday(market: MarketHolidayKey): HolidayEntry | null {
  const today = toDateStr(new Date());
  const holidays = HOLIDAY_DB[market];
  return holidays.find(h => h.date > today) ?? null;
}
