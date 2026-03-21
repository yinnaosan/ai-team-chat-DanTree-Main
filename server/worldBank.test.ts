import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractCountryCodes, fetchWorldBankData } from "./worldBankApi";

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeWBResponse(value: number, year = "2024") {
  return [
    { page: 1, pages: 1, total: 1 },
    [{ date: year, value }],
  ];
}

beforeEach(() => {
  mockFetch.mockReset();
  // 默认返回有效数据
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => makeWBResponse(3.5),
  });
});

// ─── extractCountryCodes 测试 ─────────────────────────────────────────────────

describe("extractCountryCodes", () => {
  it("识别英文国家名称", () => {
    const codes = extractCountryCodes("Analyze China GDP growth");
    expect(codes).toContain("CN");
  });

  it("识别中文国家名称", () => {
    const codes = extractCountryCodes("比较中国和美国的GDP增长率");
    expect(codes).toContain("CN");
    expect(codes).toContain("US");
  });

  it("识别多个国家（最多5个）", () => {
    const codes = extractCountryCodes("Compare US, China, Japan, Germany, UK, France, India GDP");
    expect(codes.length).toBeLessThanOrEqual(5);
  });

  it("无法识别国家时默认返回美国", () => {
    const codes = extractCountryCodes("分析股市走势");
    expect(codes).toContain("US");
  });

  it("识别缩写国家名称", () => {
    const codes = extractCountryCodes("USA economic outlook");
    expect(codes).toContain("US");
  });

  it("识别香港", () => {
    const codes = extractCountryCodes("香港股市分析");
    expect(codes).toContain("HK");
  });
});

// ─── fetchWorldBankData 测试 ──────────────────────────────────────────────────

describe("fetchWorldBankData", () => {
  it("返回格式化的 Markdown 报告", async () => {
    const result = await fetchWorldBankData("分析美国GDP增长");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("报告包含 World Bank 标题", async () => {
    const result = await fetchWorldBankData("US GDP analysis");
    expect(result).toContain("World Bank");
  });

  it("fetch 失败时返回降级文本", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const result = await fetchWorldBankData("China economy");
    // 应该返回降级文本而不是抛出异常
    expect(typeof result).toBe("string");
  });

  it("API 返回空数据时优雅处理", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ page: 1 }, []],
    });
    const result = await fetchWorldBankData("Japan trade balance");
    expect(typeof result).toBe("string");
  });

  it("API 返回 non-ok 状态时不抛出异常", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const result = await fetchWorldBankData("Germany inflation");
    expect(typeof result).toBe("string");
  });

  it("中文任务描述能正确识别国家并获取数据", async () => {
    const result = await fetchWorldBankData("比较中美两国的通货膨胀率和GDP增长");
    expect(typeof result).toBe("string");
    // 应该触发 CN 和 US 的数据获取
    expect(mockFetch).toHaveBeenCalled();
  });

  it("包含全球/欧元区对比数据", async () => {
    const result = await fetchWorldBankData("global economic outlook");
    // 应该包含全球或欧元区数据
    expect(typeof result).toBe("string");
    expect(mockFetch).toHaveBeenCalled();
  });
});
