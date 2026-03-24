/**
 * ashare-throttle.test.ts
 * 测试A股交易时段判断函数和动态轮询间隔逻辑
 */
import { describe, it, expect } from "vitest";
import { getAShareTradingSession, getASharePollInterval } from "./tickerWsCn";

/** 构造指定北京时间的 UTC Date 对象 */
function bjTime(day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun", h: number, m: number): Date {
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
  };
  const bjDow = dayMap[day];
  // 构造一个 UTC 时间使得北京时间（UTC+8）恰好为目标时间
  // 找到 2026-03-23（周一）作为基准周一
  // 2026-03-23 00:00:00 UTC = 2026-03-23 08:00:00 BJT
  const baseMonday = new Date("2026-03-23T00:00:00Z"); // UTC 周一
  const daysOffset = bjDow === 0 ? 6 : bjDow - 1; // 相对周一的天数
  const utcH = h - 8; // 北京时间转UTC（简化，不考虑跨日）
  const utcHAdj = utcH < 0 ? utcH + 24 : utcH;
  const dayAdj = utcH < 0 ? daysOffset - 1 : daysOffset;
  const d = new Date(baseMonday);
  d.setUTCDate(d.getUTCDate() + dayAdj);
  d.setUTCHours(utcHAdj, m, 0, 0);
  return d;
}

describe("getAShareTradingSession", () => {
  it("周一 09:30 → trading（上午盘开盘）", () => {
    expect(getAShareTradingSession(bjTime("Mon", 9, 30))).toBe("trading");
  });

  it("周三 10:00 → trading（上午盘中）", () => {
    expect(getAShareTradingSession(bjTime("Wed", 10, 0))).toBe("trading");
  });

  it("周五 11:29 → trading（上午盘最后一分钟）", () => {
    expect(getAShareTradingSession(bjTime("Fri", 11, 29))).toBe("trading");
  });

  it("周二 11:30 → lunch（午休开始）", () => {
    expect(getAShareTradingSession(bjTime("Tue", 11, 30))).toBe("lunch");
  });

  it("周四 12:00 → lunch（午休中）", () => {
    expect(getAShareTradingSession(bjTime("Thu", 12, 0))).toBe("lunch");
  });

  it("周一 12:59 → lunch（午休最后一分钟）", () => {
    expect(getAShareTradingSession(bjTime("Mon", 12, 59))).toBe("lunch");
  });

  it("周三 13:00 → trading（下午盘开盘）", () => {
    expect(getAShareTradingSession(bjTime("Wed", 13, 0))).toBe("trading");
  });

  it("周五 14:59 → trading（下午盘最后一分钟）", () => {
    expect(getAShareTradingSession(bjTime("Fri", 14, 59))).toBe("trading");
  });

  it("周二 15:00 → post_market（盘后）", () => {
    expect(getAShareTradingSession(bjTime("Tue", 15, 0))).toBe("post_market");
  });

  it("周四 15:29 → post_market（盘后中）", () => {
    expect(getAShareTradingSession(bjTime("Thu", 15, 29))).toBe("post_market");
  });

  it("周一 09:00 → pre_market（盘前）", () => {
    expect(getAShareTradingSession(bjTime("Mon", 9, 0))).toBe("pre_market");
  });

  it("周三 20:00 → closed（夜间）", () => {
    expect(getAShareTradingSession(bjTime("Wed", 20, 0))).toBe("closed");
  });

  it("周六 10:00 → closed（周末）", () => {
    expect(getAShareTradingSession(bjTime("Sat", 10, 0))).toBe("closed");
  });

  it("周日 14:00 → closed（周末）", () => {
    expect(getAShareTradingSession(bjTime("Sun", 14, 0))).toBe("closed");
  });
});

describe("getASharePollInterval", () => {
  it("trading → 3000ms", () => {
    expect(getASharePollInterval("trading")).toBe(3_000);
  });

  it("lunch → 30000ms", () => {
    expect(getASharePollInterval("lunch")).toBe(30_000);
  });

  it("closed → 30000ms", () => {
    expect(getASharePollInterval("closed")).toBe(30_000);
  });

  it("pre_market → 10000ms", () => {
    expect(getASharePollInterval("pre_market")).toBe(10_000);
  });

  it("post_market → 10000ms", () => {
    expect(getASharePollInterval("post_market")).toBe(10_000);
  });
});
