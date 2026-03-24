/**
 * ashare-compare.test.ts
 * 测试A股代码识别逻辑 + 对比图时间轴对齐算法
 */
import { describe, it, expect } from "vitest";
import { isAShareSymbol } from "./tickerWsCn";

// ─── A股代码识别测试 ──────────────────────────────────────────────────────────
describe("isAShareSymbol", () => {
  it("识别6位纯数字", () => {
    expect(isAShareSymbol("600519")).toBe(true);
    expect(isAShareSymbol("000001")).toBe(true);
    expect(isAShareSymbol("300750")).toBe(true);
  });

  it("识别 sh./sz./bj. 前缀", () => {
    expect(isAShareSymbol("sh.600519")).toBe(true);
    expect(isAShareSymbol("sz.000001")).toBe(true);
    expect(isAShareSymbol("bj.430047")).toBe(true);
    expect(isAShareSymbol("SH.600519")).toBe(true);
  });

  it("识别 .SS/.SZ/.BJ 后缀", () => {
    expect(isAShareSymbol("600519.SS")).toBe(true);
    expect(isAShareSymbol("000001.SZ")).toBe(true);
    expect(isAShareSymbol("600519.ss")).toBe(true);
  });

  it("不识别美股代码", () => {
    expect(isAShareSymbol("AAPL")).toBe(false);
    expect(isAShareSymbol("TSLA")).toBe(false);
    expect(isAShareSymbol("SPY")).toBe(false);
    expect(isAShareSymbol("QQQ")).toBe(false);
  });

  it("不识别港股代码", () => {
    expect(isAShareSymbol("00700.HK")).toBe(false);
    expect(isAShareSymbol("09988")).toBe(false); // 5位数字，港股
  });
});

// ─── 时间轴对齐算法测试 ──────────────────────────────────────────────────────
describe("时间轴对齐（取交集）", () => {
  type Candle = { time: number; close: number };

  function alignAndNormalize(main: Candle[], compare: Candle[]) {
    if (!main.length || !compare.length) return { main: [], compare: [] };

    const compareSet = new Set(compare.map(c => c.time));
    const mainSet    = new Set(main.map(c => c.time));

    const alignedMain    = main.filter(c => compareSet.has(c.time));
    const alignedCompare = compare.filter(c => mainSet.has(c.time));

    if (!alignedMain.length || !alignedCompare.length) {
      // 回退：各自归一化
      const mb = main[0].close, cb = compare[0].close;
      return {
        main:    main.map(c => ({ time: c.time, pct: ((c.close - mb) / mb) * 100 })),
        compare: compare.map(c => ({ time: c.time, pct: ((c.close - cb) / cb) * 100 })),
      };
    }

    const mb = alignedMain[0].close;
    const cb = alignedCompare[0].close;
    return {
      main:    alignedMain.map(c => ({ time: c.time, pct: ((c.close - mb) / mb) * 100 })),
      compare: alignedCompare.map(c => ({ time: c.time, pct: ((c.close - cb) / cb) * 100 })),
    };
  }

  it("完全重叠时间轴：正确归一化", () => {
    const main    = [{ time: 1000, close: 100 }, { time: 2000, close: 110 }];
    const compare = [{ time: 1000, close: 200 }, { time: 2000, close: 220 }];
    const result = alignAndNormalize(main, compare);
    expect(result.main[0].pct).toBeCloseTo(0);
    expect(result.main[1].pct).toBeCloseTo(10);
    expect(result.compare[0].pct).toBeCloseTo(0);
    expect(result.compare[1].pct).toBeCloseTo(10);
  });

  it("部分重叠：裁剪到交集后归一化", () => {
    // main 有 t=1000,2000,3000；compare 只有 t=2000,3000
    const main    = [{ time: 1000, close: 100 }, { time: 2000, close: 110 }, { time: 3000, close: 121 }];
    const compare = [{ time: 2000, close: 200 }, { time: 3000, close: 220 }];
    const result = alignAndNormalize(main, compare);
    // 交集为 t=2000,3000，以 t=2000 为基准
    expect(result.main.length).toBe(2);
    expect(result.compare.length).toBe(2);
    expect(result.main[0].pct).toBeCloseTo(0);   // 基准点
    expect(result.main[1].pct).toBeCloseTo(10);  // 121/110 - 1 = 10%
    expect(result.compare[0].pct).toBeCloseTo(0);
    expect(result.compare[1].pct).toBeCloseTo(10);
  });

  it("完全不重叠（美股 vs A股）：各自独立归一化", () => {
    const main    = [{ time: 1000, close: 100 }, { time: 2000, close: 110 }];
    const compare = [{ time: 5000, close: 50  }, { time: 6000, close: 55  }];
    const result = alignAndNormalize(main, compare);
    // 回退到各自归一化
    expect(result.main[0].pct).toBeCloseTo(0);
    expect(result.main[1].pct).toBeCloseTo(10);
    expect(result.compare[0].pct).toBeCloseTo(0);
    expect(result.compare[1].pct).toBeCloseTo(10);
  });
});
