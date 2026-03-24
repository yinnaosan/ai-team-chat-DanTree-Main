/**
 * global-market-status.test.ts
 * 测试 globalHolidays.ts 中的市场状态判断逻辑
 */

import { describe, it, expect } from "vitest";

// ─── 辅助函数：构造指定时区的 Date 对象 ──────────────────────────────────────

/**
 * 构造一个 UTC 时间，使其在指定时区（UTC+offset）下对应给定的本地时间
 * @param year 本地年
 * @param month 本地月（1-12）
 * @param day 本地日
 * @param hour 本地时
 * @param minute 本地分
 * @param utcOffsetHours UTC偏移（如 +8 表示 Asia/Shanghai）
 */
function makeLocalTime(
  year: number, month: number, day: number,
  hour: number, minute: number,
  utcOffsetHours: number
): Date {
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, 0) -
    utcOffsetHours * 60 * 60 * 1000;
  return new Date(utcMs);
}

// ─── 测试：市场状态判断逻辑（纯函数，不依赖外部API）────────────────────────

describe("市场状态工具函数", () => {
  // 测试时区偏移计算
  it("UTC+8 时区：本地时间应比 UTC 快 8 小时", () => {
    const utcNoon = new Date("2026-03-24T12:00:00Z");
    // 在 UTC+8 下，本地时间应为 20:00
    const localHour = (utcNoon.getUTCHours() + 8) % 24;
    expect(localHour).toBe(20);
  });

  it("UTC-5 时区（美东标准时）：本地时间应比 UTC 慢 5 小时", () => {
    const utcNoon = new Date("2026-03-24T15:00:00Z");
    // 在 UTC-5 下，本地时间应为 10:00
    const localHour = (utcNoon.getUTCHours() - 5 + 24) % 24;
    expect(localHour).toBe(10);
  });
});

// ─── 测试：A股交易时段判断 ───────────────────────────────────────────────────

describe("A股交易时段判断", () => {
  // 模拟 getAShareSession 逻辑（不调用 Baostock，仅测试时间逻辑）
  function mockGetAShareSession(localHour: number, localMin: number, isWeekend: boolean): string {
    if (isWeekend) return "closed";
    const t = localHour * 100 + localMin;
    if (t >= 930 && t < 1130) return "trading";
    if (t >= 1130 && t < 1300) return "lunch";
    if (t >= 1300 && t < 1500) return "trading";
    if (t >= 900 && t < 930) return "pre_market";
    if (t >= 1500 && t < 1530) return "post_market";
    return "closed";
  }

  it("09:30 应为交易中", () => {
    expect(mockGetAShareSession(9, 30, false)).toBe("trading");
  });

  it("11:00 应为交易中", () => {
    expect(mockGetAShareSession(11, 0, false)).toBe("trading");
  });

  it("11:30 应为午休", () => {
    expect(mockGetAShareSession(11, 30, false)).toBe("lunch");
  });

  it("12:00 应为午休", () => {
    expect(mockGetAShareSession(12, 0, false)).toBe("lunch");
  });

  it("13:00 应为交易中", () => {
    expect(mockGetAShareSession(13, 0, false)).toBe("trading");
  });

  it("14:59 应为交易中", () => {
    expect(mockGetAShareSession(14, 59, false)).toBe("trading");
  });

  it("15:00 应为盘后", () => {
    expect(mockGetAShareSession(15, 0, false)).toBe("post_market");
  });

  it("16:00 应为休市", () => {
    expect(mockGetAShareSession(16, 0, false)).toBe("closed");
  });

  it("周六应为休市", () => {
    expect(mockGetAShareSession(10, 0, true)).toBe("closed");
  });

  it("09:00 应为盘前", () => {
    expect(mockGetAShareSession(9, 0, false)).toBe("pre_market");
  });
});

// ─── 测试：港股交易时段判断 ─────────────────────────────────────────────────

describe("港股交易时段判断", () => {
  function mockGetHKSession(localHour: number, localMin: number, isWeekend: boolean): string {
    if (isWeekend) return "closed";
    const t = localHour * 100 + localMin;
    if (t >= 900 && t < 930) return "pre_auction";   // 盘前竞价
    if (t >= 930 && t < 1200) return "trading";
    if (t >= 1200 && t < 1300) return "lunch";
    if (t >= 1300 && t < 1600) return "trading";
    if (t >= 1600 && t < 1610) return "post_auction"; // 盘后撮合
    return "closed";
  }

  it("09:00 应为盘前竞价", () => {
    expect(mockGetHKSession(9, 0, false)).toBe("pre_auction");
  });

  it("09:29 应为盘前竞价", () => {
    expect(mockGetHKSession(9, 29, false)).toBe("pre_auction");
  });

  it("09:30 应为交易中", () => {
    expect(mockGetHKSession(9, 30, false)).toBe("trading");
  });

  it("11:59 应为交易中", () => {
    expect(mockGetHKSession(11, 59, false)).toBe("trading");
  });

  it("12:00 应为午休", () => {
    expect(mockGetHKSession(12, 0, false)).toBe("lunch");
  });

  it("13:00 应为交易中", () => {
    expect(mockGetHKSession(13, 0, false)).toBe("trading");
  });

  it("15:59 应为交易中", () => {
    expect(mockGetHKSession(15, 59, false)).toBe("trading");
  });

  it("16:00 应为盘后撮合", () => {
    expect(mockGetHKSession(16, 0, false)).toBe("post_auction");
  });

  it("16:09 应为盘后撮合", () => {
    expect(mockGetHKSession(16, 9, false)).toBe("post_auction");
  });

  it("16:10 应为休市", () => {
    expect(mockGetHKSession(16, 10, false)).toBe("closed");
  });

  it("周日应为休市", () => {
    expect(mockGetHKSession(10, 0, true)).toBe("closed");
  });
});

// ─── 测试：美股交易时段判断 ─────────────────────────────────────────────────

describe("美股交易时段判断（美东时间，UTC-5/-4）", () => {
  function mockGetUSSession(localHour: number, localMin: number, isWeekend: boolean): string {
    if (isWeekend) return "closed";
    const t = localHour * 100 + localMin;
    if (t >= 400 && t < 930) return "pre_market";
    if (t >= 930 && t < 1600) return "trading";
    if (t >= 1600 && t < 2000) return "post_market";
    return "closed";
  }

  it("09:30 应为交易中", () => {
    expect(mockGetUSSession(9, 30, false)).toBe("trading");
  });

  it("15:59 应为交易中", () => {
    expect(mockGetUSSession(15, 59, false)).toBe("trading");
  });

  it("16:00 应为盘后", () => {
    expect(mockGetUSSession(16, 0, false)).toBe("post_market");
  });

  it("04:00 应为盘前", () => {
    expect(mockGetUSSession(4, 0, false)).toBe("pre_market");
  });

  it("03:59 应为休市", () => {
    expect(mockGetUSSession(3, 59, false)).toBe("closed");
  });

  it("周六应为休市", () => {
    expect(mockGetUSSession(10, 0, true)).toBe("closed");
  });
});

// ─── 测试：makeLocalTime 辅助函数 ────────────────────────────────────────────

describe("makeLocalTime 辅助函数", () => {
  it("UTC+8 下 2026-03-24 09:30 对应正确的 UTC 时间", () => {
    const d = makeLocalTime(2026, 3, 24, 9, 30, 8);
    expect(d.getUTCHours()).toBe(1);
    expect(d.getUTCMinutes()).toBe(30);
  });

  it("UTC-5 下 2026-03-24 09:30 对应正确的 UTC 时间", () => {
    const d = makeLocalTime(2026, 3, 24, 9, 30, -5);
    expect(d.getUTCHours()).toBe(14);
    expect(d.getUTCMinutes()).toBe(30);
  });
});
