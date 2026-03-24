/**
 * hkshare-session.test.ts
 * 港股交易时段判断 + 节假日识别 + 代码格式识别测试
 *
 * 注意：getHKSession 是异步函数，内部通过 Nager.Date API 获取节假日。
 * 在测试环境中，API 调用会失败并使用 fallback 节假日数据。
 */
import { describe, it, expect } from "vitest";
import { getHKSession as getHKTradingSession, getHKPollIntervalMs as getHKPollInterval } from "./globalHolidays";
import { isHKSymbol } from "./tickerWsHk";

// ─── 辅助函数：构造指定北京时间的 Date 对象 ────────────────────────────────────
function bjTime(weekday: number, hour: number, minute: number): Date {
  // weekday: 0=Sun,1=Mon,...,6=Sat（北京时间）
  // 使用已知日期映射：2026-01-05=Mon, 01-06=Tue, 01-07=Wed, 01-08=Thu, 01-09=Fri, 01-10=Sat, 01-11=Sun
  const bjDates: Record<number, string> = {
    1: "2026-01-05", // Mon
    2: "2026-01-06", // Tue
    3: "2026-01-07", // Wed
    4: "2026-01-08", // Thu
    5: "2026-01-09", // Fri
    6: "2026-01-10", // Sat
    0: "2026-01-11", // Sun
  };
  const dateStr = bjDates[weekday];
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00+08:00`);
}

// ─── 港股交易时段测试 ─────────────────────────────────────────────────────────

describe("getHKTradingSession", () => {
  it("周一 09:30 为 trading（上午盘开盘）", async () => {
    expect(await getHKTradingSession(bjTime(1, 9, 30))).toBe("trading");
  });

  it("周三 11:00 为 trading（上午盘中段）", async () => {
    expect(await getHKTradingSession(bjTime(3, 11, 0))).toBe("trading");
  });

  it("周二 12:00 为 lunch（午休开始）", async () => {
    expect(await getHKTradingSession(bjTime(2, 12, 0))).toBe("lunch");
  });

  it("周四 12:30 为 lunch（午休中段）", async () => {
    expect(await getHKTradingSession(bjTime(4, 12, 30))).toBe("lunch");
  });

  it("周五 13:00 为 trading（下午盘开盘）", async () => {
    expect(await getHKTradingSession(bjTime(5, 13, 0))).toBe("trading");
  });

  it("周三 15:00 为 trading（下午盘中段）", async () => {
    expect(await getHKTradingSession(bjTime(3, 15, 0))).toBe("trading");
  });

  it("周一 16:00 为 post_auction（盘后撮合开始）", async () => {
    expect(await getHKTradingSession(bjTime(1, 16, 0))).toBe("post_auction");
  });

  it("周二 16:09 为 post_auction（盘后撮合中段）", async () => {
    expect(await getHKTradingSession(bjTime(2, 16, 9))).toBe("post_auction");
  });

  it("周二 16:15 为 closed（盘后撮合结束）", async () => {
    expect(await getHKTradingSession(bjTime(2, 16, 15))).toBe("closed");
  });

  it("周三 09:00 为 pre_auction（盘前竞价）", async () => {
    expect(await getHKTradingSession(bjTime(3, 9, 0))).toBe("pre_auction");
  });

  it("周三 09:15 为 pre_auction（盘前竞价中段）", async () => {
    expect(await getHKTradingSession(bjTime(3, 9, 15))).toBe("pre_auction");
  });

  it("周六 10:00 为 closed（周末）", async () => {
    expect(await getHKTradingSession(bjTime(6, 10, 0))).toBe("closed");
  });

  it("周日 14:00 为 closed（周末）", async () => {
    expect(await getHKTradingSession(bjTime(0, 14, 0))).toBe("closed");
  });

  it("周一 20:00 为 closed（夜间）", async () => {
    expect(await getHKTradingSession(bjTime(1, 20, 0))).toBe("closed");
  });

  it("港股圣诞节（2026-12-25）为 closed", async () => {
    const xmas = new Date("2026-12-25T10:00:00+08:00");
    expect(await getHKTradingSession(xmas)).toBe("closed");
  });

  it("港股回归纪念日（2026-07-01）为 closed", async () => {
    const hkday = new Date("2026-07-01T10:00:00+08:00");
    expect(await getHKTradingSession(hkday)).toBe("closed");
  });
});

// ─── 港股轮询间隔测试 ─────────────────────────────────────────────────────────

describe("getHKPollInterval", () => {
  it("trading → 3000ms", () => {
    expect(getHKPollInterval("trading")).toBe(3000);
  });

  it("lunch → 30000ms", () => {
    expect(getHKPollInterval("lunch")).toBe(30000);
  });

  it("pre_auction → 5000ms", () => {
    expect(getHKPollInterval("pre_auction")).toBe(5000);
  });

  it("post_auction → 5000ms", () => {
    expect(getHKPollInterval("post_auction")).toBe(5000);
  });

  it("closed → 30000ms", () => {
    expect(getHKPollInterval("closed")).toBe(30000);
  });
});

// ─── 港股代码识别测试 ─────────────────────────────────────────────────────────

describe("isHKSymbol", () => {
  it("00700.HK 是港股代码", () => {
    expect(isHKSymbol("00700.HK")).toBe(true);
  });

  it("9988.HK 是港股代码", () => {
    expect(isHKSymbol("9988.HK")).toBe(true);
  });

  it("700.HK 是港股代码", () => {
    expect(isHKSymbol("700.HK")).toBe(true);
  });

  it("00700 是港股代码（5位数字）", () => {
    expect(isHKSymbol("00700")).toBe(true);
  });

  it("9988 是港股代码（4位数字）", () => {
    expect(isHKSymbol("9988")).toBe(true);
  });

  it("AAPL 不是港股代码", () => {
    expect(isHKSymbol("AAPL")).toBe(false);
  });

  it("600519 不是港股代码（A股6位）", () => {
    expect(isHKSymbol("600519")).toBe(false);
  });
});
