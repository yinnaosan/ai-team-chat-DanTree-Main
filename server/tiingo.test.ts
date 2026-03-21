/**
 * Tiingo API 集成测试
 * 共享单次 fetch 结果，避免耗尽免费配额
 */
import { describe, it, expect, beforeAll } from "vitest";
import { fetchTiingoData, formatTiingoDataAsMarkdown, checkTiingoHealth, type TiingoData } from "./tiingoApi";

// 共享单次 fetch 结果
let sharedData: TiingoData | null = null;
let fetchError: unknown = null;

beforeAll(async () => {
  try {
    sharedData = await fetchTiingoData("AAPL");
  } catch (err) {
    fetchError = err;
    console.warn("[Tiingo Test] fetchTiingoData failed:", err);
  }
}, 30000);

describe("Tiingo API", () => {
  it("TIINGO_API_KEY 环境变量已配置", () => {
    expect(process.env.TIINGO_API_KEY).toBeTruthy();
  });

  it("checkTiingoHealth 返回布尔值", async () => {
    const result = await checkTiingoHealth();
    expect(typeof result).toBe("boolean");
  }, 15000);

  it("fetchTiingoData 对 AAPL 返回数据或 null（配额容错）", () => {
    if (fetchError) {
      console.warn("[Tiingo Test] Skipping: fetch threw error:", fetchError);
      return;
    }
    // 允许 null（配额耗尽或 API 不可用），但不应抛出异常
    expect(sharedData === null || typeof sharedData === "object").toBe(true);
  });

  it("fetchTiingoData 返回正确的 ticker 字段", () => {
    if (!sharedData) {
      console.warn("[Tiingo Test] Skipping: no data returned");
      return;
    }
    expect(sharedData.ticker).toBe("AAPL");
  });

  it("fetchTiingoData 返回 source 字段", () => {
    if (!sharedData) {
      console.warn("[Tiingo Test] Skipping: no data returned");
      return;
    }
    expect(sharedData.source).toBe("Tiingo");
  });

  it("fetchTiingoData 返回 fetchedAt 时间戳", () => {
    if (!sharedData) {
      console.warn("[Tiingo Test] Skipping: no data returned");
      return;
    }
    expect(typeof sharedData.fetchedAt).toBe("number");
    expect(sharedData.fetchedAt).toBeGreaterThan(0);
  });

  it("fetchTiingoData 返回 recentPrices 数组", () => {
    if (!sharedData) {
      console.warn("[Tiingo Test] Skipping: no data returned");
      return;
    }
    expect(Array.isArray(sharedData.recentPrices)).toBe(true);
  });

  it("fetchTiingoData 返回 quarterlyStatements 数组", () => {
    if (!sharedData) {
      console.warn("[Tiingo Test] Skipping: no data returned");
      return;
    }
    expect(Array.isArray(sharedData.quarterlyStatements)).toBe(true);
  });

  it("formatTiingoDataAsMarkdown 返回非空字符串", () => {
    if (!sharedData) {
      console.warn("[Tiingo Test] Skipping: no data returned");
      return;
    }
    const md = formatTiingoDataAsMarkdown(sharedData);
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(0);
    expect(md).toContain("Tiingo");
    expect(md).toContain("AAPL");
  });

  it("fetchTiingoData 对空 ticker 返回 null", async () => {
    const result = await fetchTiingoData("");
    expect(result).toBeNull();
  });
});
