/**
 * financeReportParser.test.ts — 财报 PDF 解析测试
 */

import { describe, it, expect } from "vitest";
import {
  detectReportType,
  isFinanceReport,
  formatFinanceReportResult,
  type FinanceReportResult,
  type ReportType,
} from "./financeReportParser";

// ── 报告类型检测测试 ───────────────────────────────────────────────────────────

describe("FinanceReportParser — Report Type Detection", () => {
  it("should detect annual report from text", () => {
    const text = "Apple Inc. Annual Report 2024 Form 10-K filed with the SEC";
    expect(detectReportType(text)).toBe("annual_report");
  });

  it("should detect quarterly report from text", () => {
    const text = "Quarterly Report Form 10-Q for the third quarter ended September 2024";
    expect(detectReportType(text)).toBe("quarterly_report");
  });

  it("should detect interim report from Chinese text", () => {
    const text = "腾讯控股有限公司 2024年中期报告 半年报";
    expect(detectReportType(text)).toBe("interim_report");
  });

  it("should detect research report from text", () => {
    const text = "投资评级：买入 目标价：$200 研究报告 equity research";
    expect(detectReportType(text)).toBe("research_report");
  });

  it("should detect earnings release from Chinese text", () => {
    // 业绩公告（使用 earnings release 英文关键词）
    const text = "Company Q4 2024 Earnings Release: revenue grew 15%, net income up significantly";
    expect(detectReportType(text)).toBe("earnings_release");
  });

  it("should return unknown for non-financial text", () => {
    const text = "这是一篇关于天气预报的文章，今天多云转晴";
    expect(detectReportType(text)).toBe("unknown");
  });
});

// ── 财报检测测试 ───────────────────────────────────────────────────────────────

describe("FinanceReportParser — Finance Report Detection", () => {
  it("should detect annual report by filename", () => {
    expect(isFinanceReport("AAPL_annual_report_2024.pdf")).toBe(true);
    expect(isFinanceReport("tesla_10-k_2024.pdf")).toBe(true);
    expect(isFinanceReport("腾讯2024年报.pdf")).toBe(true);
  });

  it("should detect finance report by content", () => {
    const text = "Net income for the quarter was $25 billion, earnings per share of $1.52";
    expect(isFinanceReport("document.pdf", text)).toBe(true);
  });

  it("should not flag non-financial documents", () => {
    expect(isFinanceReport("meeting_notes.pdf")).toBe(false);
    expect(isFinanceReport("presentation.pdf")).toBe(false);
  });
});

// ── 报告格式化测试 ─────────────────────────────────────────────────────────────

describe("FinanceReportParser — Report Formatting", () => {
  const mockResult: FinanceReportResult = {
    filename: "AAPL_10K_2024.pdf",
    reportType: "annual_report" as ReportType,
    companyName: "Apple Inc.",
    ticker: "AAPL",
    reportPeriod: "FY2024",
    metrics: {
      revenue: 391035,
      revenueGrowthYoY: 0.02,
      grossProfit: 180683,
      grossMargin: 0.462,
      netIncome: 93736,
      netMargin: 0.2397,
      netIncomeGrowthYoY: 0.11,
      eps: 6.08,
      epsGrowthYoY: 0.13,
      operatingCashFlow: 118254,
      freeCashFlow: 108807,
      cashAndEquivalents: 29965,
      currency: "USD",
      reportPeriod: "FY2024",
    },
    riskFactors: [
      { category: "市场风险", description: "全球经济放缓可能影响消费电子需求", severity: "medium" },
      { category: "供应链风险", description: "台积电产能集中风险", severity: "high" },
    ],
    keyHighlights: [
      "服务业务收入同比增长13%，达到968亿美元",
      "iPhone 16系列销量超预期",
      "回购股票1100亿美元",
    ],
    managementDiscussion: "公司在AI功能集成方面取得重大进展，Apple Intelligence推动用户升级需求。",
    rawTextLength: 45000,
    extractionMethod: "pdftotext",
  };

  it("should format a complete finance report", () => {
    const report = formatFinanceReportResult(mockResult);

    expect(report).toContain("Apple Inc.");
    expect(report).toContain("年度报告");
    expect(report).toContain("FY2024");
    expect(report).toContain("391035M");
    expect(report).toContain("+2.0%");
    expect(report).toContain("6.08");
    expect(report).toContain("FinanceReportAnalysis");
  });

  it("should include risk factors with severity icons", () => {
    const report = formatFinanceReportResult(mockResult);
    expect(report).toContain("🔴"); // high severity
    expect(report).toContain("🟡"); // medium severity
    expect(report).toContain("供应链风险");
  });

  it("should include key highlights", () => {
    const report = formatFinanceReportResult(mockResult);
    expect(report).toContain("服务业务收入同比增长13%");
    expect(report).toContain("Apple Intelligence");
  });

  it("should include cash flow data", () => {
    const report = formatFinanceReportResult(mockResult);
    expect(report).toContain("118254M");  // operating cash flow
    expect(report).toContain("108807M");  // free cash flow
  });

  it("should handle missing metrics gracefully", () => {
    const minimalResult: FinanceReportResult = {
      filename: "unknown.pdf",
      reportType: "unknown" as ReportType,
      metrics: {},
      riskFactors: [],
      keyHighlights: [],
      rawTextLength: 100,
      extractionMethod: "heuristic",
    };
    const report = formatFinanceReportResult(minimalResult);
    expect(report).toContain("FinanceReportAnalysis");
    expect(report).not.toContain("undefined");
    expect(report).not.toContain("NaN");
  });
});
