import { describe, it, expect } from "vitest";
import { fetchHKEXData, formatHKEXDataAsMarkdown, checkHKEXHealth, isHKStockTask, extractHKStockCode } from "./hkexApi";

describe("HKEXnews API", () => {
  it("should detect HK stock tasks", () => {
    expect(isHKStockTask("腾讯控股 00700 分析")).toBe(true);
    expect(isHKStockTask("港股 HSBC 汇丰银行")).toBe(true);
    expect(isHKStockTask("香港交易所公告")).toBe(true);
    expect(isHKStockTask("披露易公告搜索")).toBe(true);
    expect(isHKStockTask("苹果公司美股分析")).toBe(false);
    expect(isHKStockTask("比特币价格")).toBe(false);
  });

  it("should extract HK stock codes", () => {
    const code1 = extractHKStockCode("腾讯控股 00700 的年报");
    expect(code1).toBe("00700");

    // 4位数字需要前导零才能匹配（防止误匹配年份数字）
    const code2 = extractHKStockCode("汇丰銀行 00005 分析");
    expect(code2).toBe("00005");

    const noCode = extractHKStockCode("港股市场整体分析");
    expect(noCode).toBeNull();
  });

  it("should fetch HKEX announcements for a known company", async () => {
    const data = await fetchHKEXData("HSBC");
    expect(data).toBeDefined();
    if (data) {
      expect(data.query).toBeDefined();
      expect(Array.isArray(data.announcements)).toBe(true);
    }
  }, 30000);

  it("should format HKEX data as markdown", async () => {
    const data = await fetchHKEXData("Tencent");
    if (!data) return;
    const md = formatHKEXDataAsMarkdown(data);
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(20);
  }, 30000);

  it("should pass health check", async () => {
    const health = await checkHKEXHealth();
    expect(health).toBeDefined();
    expect(typeof health.ok).toBe("boolean");
    expect(typeof health.latencyMs).toBe("number");
  }, 20000);
});
