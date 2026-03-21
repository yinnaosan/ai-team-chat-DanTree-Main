/**
 * IMF DataMapper API Integration Tests
 * 测试 imfApi.ts 模块的核心功能
 */
import { describe, it, expect } from "vitest";
import {
  detectCountriesFromText,
  selectIndicatorsFromText,
  formatImfDataAsMarkdown,
  IMF_INDICATORS,
  type ImfDataResult,
} from "./imfApi";

// ─── 国家识别测试 ──────────────────────────────────────────────────────────────
describe("IMF API - Country Detection", () => {
  it("should detect Chinese country names", () => {
    const result = detectCountriesFromText("分析中国和美国的GDP增长率对比");
    expect(result).toContain("CHN");
    expect(result).toContain("USA");
  });

  it("should detect English country names", () => {
    const result = detectCountriesFromText("Compare Japan and Germany economic outlook");
    expect(result).toContain("JPN");
    expect(result).toContain("DEU");
  });

  it("should detect ISO3 codes directly", () => {
    const result = detectCountriesFromText("IND BRA KOR economic comparison");
    expect(result).toContain("IND");
    expect(result).toContain("BRA");
    expect(result).toContain("KOR");
  });

  it("should detect abbreviations like US and UK", () => {
    const result = detectCountriesFromText("US economy vs UK economy");
    expect(result).toContain("USA");
    expect(result).toContain("GBR");
  });

  it("should return default countries when no match found", () => {
    const result = detectCountriesFromText("分析股票市场走势");
    expect(result.length).toBeGreaterThan(0);
    // 默认返回主要经济体
    expect(result).toContain("CHN");
    expect(result).toContain("USA");
  });

  it("should handle eurozone and global aggregates", () => {
    const result = detectCountriesFromText("欧元区和全球经济展望");
    expect(result).toContain("EUQ");
    expect(result).toContain("WLD");
  });

  it("should limit to max 12 countries", () => {
    const text = "中国 美国 日本 德国 英国 法国 印度 巴西 韩国 澳大利亚 加拿大 俄罗斯 沙特 南非 墨西哥";
    const result = detectCountriesFromText(text);
    expect(result.length).toBeLessThanOrEqual(12);
  });
});

// ─── 指标选择测试 ──────────────────────────────────────────────────────────────
describe("IMF API - Indicator Selection", () => {
  it("should select GDP indicators for GDP queries", () => {
    const result = selectIndicatorsFromText("分析中国GDP增长率和经济规模");
    const codes = result.map((i) => i.code);
    expect(codes).toContain("NGDP_RPCH");
  });

  it("should select inflation indicators for inflation queries", () => {
    const result = selectIndicatorsFromText("通胀率上升对经济的影响");
    const codes = result.map((i) => i.code);
    expect(codes).toContain("PCPIPCH");
  });

  it("should select debt indicators for fiscal queries", () => {
    const result = selectIndicatorsFromText("政府债务和财政赤字分析");
    const codes = result.map((i) => i.code);
    expect(codes.some((c) => ["GGXWDG_NGDP", "GGXCNL_NGDP"].includes(c))).toBe(true);
  });

  it("should select current account for trade queries", () => {
    const result = selectIndicatorsFromText("经常账户顺差和贸易逆差");
    const codes = result.map((i) => i.code);
    expect(codes).toContain("BCA_NGDPD");
  });

  it("should return default indicators when no keyword matches", () => {
    const result = selectIndicatorsFromText("随机文字没有特定关键词");
    expect(result.length).toBeGreaterThan(0);
    // 默认返回核心 4 个
    const codes = result.map((i) => i.code);
    expect(codes).toContain("NGDP_RPCH");
  });

  it("should limit to max 6 indicators", () => {
    const text = "gdp 增长 通胀 失业 债务 贸易 储蓄 投资 ppp 人均";
    const result = selectIndicatorsFromText(text);
    expect(result.length).toBeLessThanOrEqual(6);
  });
});

// ─── 指标定义完整性测试 ────────────────────────────────────────────────────────
describe("IMF API - Indicator Definitions", () => {
  it("should have all required indicator fields", () => {
    for (const ind of IMF_INDICATORS) {
      expect(ind.code).toBeTruthy();
      expect(ind.label).toBeTruthy();
      expect(ind.unit).toBeTruthy();
      expect(Array.isArray(ind.keywords)).toBe(true);
      expect(ind.keywords.length).toBeGreaterThan(0);
    }
  });

  it("should have at least 10 indicators defined", () => {
    expect(IMF_INDICATORS.length).toBeGreaterThanOrEqual(10);
  });

  it("should include core WEO indicators", () => {
    const codes = IMF_INDICATORS.map((i) => i.code);
    expect(codes).toContain("NGDP_RPCH");  // GDP 增长率
    expect(codes).toContain("PCPIPCH");    // 通胀率
    expect(codes).toContain("LUR");        // 失业率
    expect(codes).toContain("GGXWDG_NGDP"); // 政府债务
    expect(codes).toContain("BCA_NGDPD");  // 经常账户
  });
});

// ─── Markdown 格式化测试 ───────────────────────────────────────────────────────
describe("IMF API - Markdown Formatting", () => {
  const mockResult: ImfDataResult = {
    countries: ["CHN", "USA"],
    indicators: [
      { code: "NGDP_RPCH", label: "GDP实际增长率", unit: "%", keywords: ["gdp"] },
      { code: "PCPIPCH", label: "CPI通胀率", unit: "%", keywords: ["通胀"] },
    ],
    data: {
      NGDP_RPCH: {
        CHN: { "2022": 3.1, "2023": 5.4, "2024": 5.0, "2025": 4.8, "2026": 4.2 },
        USA: { "2022": 2.5, "2023": 2.9, "2024": 2.8, "2025": 2.0, "2026": 2.1 },
      },
      PCPIPCH: {
        CHN: { "2022": 2.0, "2023": 0.2, "2024": 0.3, "2025": 0.0, "2026": 0.5 },
        USA: { "2022": 8.0, "2023": 4.1, "2024": 2.9, "2025": 2.7, "2026": 2.3 },
      },
    },
    years: [2022, 2023, 2024, 2025, 2026],
    fetchedAt: new Date().toISOString(),
  };

  it("should generate valid Markdown with table headers", () => {
    const md = formatImfDataAsMarkdown(mockResult);
    expect(md).toContain("## 📊 IMF WEO");
    expect(md).toContain("| 国家 |");
    expect(md).toContain("中国");
    expect(md).toContain("美国");
  });

  it("should include prediction year marker E for future years", () => {
    // 创建一个包含未来年份的 mock（当前年 + 3 年）
    const futureYear = new Date().getFullYear() + 1;
    const futureResult: ImfDataResult = {
      ...mockResult,
      years: [futureYear - 2, futureYear - 1, futureYear, futureYear + 1, futureYear + 2],
      data: {
        NGDP_RPCH: {
          CHN: Object.fromEntries(
            [futureYear - 2, futureYear - 1, futureYear, futureYear + 1, futureYear + 2].map(y => [String(y), 5.0])
          ),
          USA: Object.fromEntries(
            [futureYear - 2, futureYear - 1, futureYear, futureYear + 1, futureYear + 2].map(y => [String(y), 2.0])
          ),
        },
        PCPIPCH: {
          CHN: Object.fromEntries(
            [futureYear - 2, futureYear - 1, futureYear, futureYear + 1, futureYear + 2].map(y => [String(y), 1.0])
          ),
          USA: Object.fromEntries(
            [futureYear - 2, futureYear - 1, futureYear, futureYear + 1, futureYear + 2].map(y => [String(y), 2.5])
          ),
        },
      },
    };
    const md = formatImfDataAsMarkdown(futureResult);
    // 未来年份应标注 E
    expect(md).toMatch(/\d{4}E/);
  });

  it("should include data source attribution", () => {
    const md = formatImfDataAsMarkdown(mockResult);
    expect(md).toContain("IMF World Economic Outlook");
  });

  it("should return empty string for null input", () => {
    const md = formatImfDataAsMarkdown(null as unknown as ImfDataResult);
    expect(md).toBe("");
  });

  it("should handle N/A for missing values", () => {
    const resultWithMissing: ImfDataResult = {
      ...mockResult,
      data: {
        NGDP_RPCH: {
          CHN: { "2022": null, "2023": 5.4, "2024": null, "2025": 4.8, "2026": null },
          USA: { "2022": 2.5, "2023": null, "2024": 2.8, "2025": null, "2026": 2.1 },
        },
      },
    };
    const md = formatImfDataAsMarkdown(resultWithMissing);
    expect(md).toContain("N/A");
  });
});
