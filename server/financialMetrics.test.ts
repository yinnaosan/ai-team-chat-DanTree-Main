/**
 * financialMetrics.test.ts
 * 标准化财务指标解读模块单元测试
 */

import { describe, it, expect } from "vitest";
import {
  analyzeProfitability,
  analyzeLiquidity,
  analyzeSolvency,
  analyzeValuation,
  analyzeEfficiency,
  analyzeCashFlow,
  calculateHealthScore,
  formatFinancialMetrics,
} from "./financialMetrics";
import type {
  FmpIncomeStatement,
  FmpBalanceSheet,
  FmpCashFlow,
  FmpKeyMetrics,
} from "./fmpApi";

// ── 测试数据（模拟 Apple 级别的优质公司） ──────────────────────────────────────
const mockIncome: FmpIncomeStatement[] = [
  {
    date: "2024-09-30",
    symbol: "AAPL",
    reportedCurrency: "USD",
    period: "FY",
    revenue: 391035000000,
    costOfRevenue: 210352000000,
    grossProfit: 180683000000,
    grossProfitRatio: 0.4621,
    researchAndDevelopmentExpenses: 31370000000,
    operatingExpenses: 54847000000,
    operatingIncome: 125820000000,
    operatingIncomeRatio: 0.3218,
    ebitda: 134661000000,
    ebitdaratio: 0.3443,
    netIncome: 93736000000,
    netIncomeRatio: 0.2397,
    eps: 6.11,
    epsdiluted: 6.08,
    weightedAverageShsOut: 15343783000,
    weightedAverageShsOutDil: 15408095000,
  },
  {
    date: "2023-09-30",
    symbol: "AAPL",
    reportedCurrency: "USD",
    period: "FY",
    revenue: 383285000000,
    costOfRevenue: 214137000000,
    grossProfit: 169148000000,
    grossProfitRatio: 0.4413,
    researchAndDevelopmentExpenses: 29915000000,
    operatingExpenses: 54847000000,
    operatingIncome: 114301000000,
    operatingIncomeRatio: 0.2982,
    ebitda: 123429000000,
    ebitdaratio: 0.322,
    netIncome: 96995000000,
    netIncomeRatio: 0.253,
    eps: 6.16,
    epsdiluted: 6.13,
    weightedAverageShsOut: 15744231000,
    weightedAverageShsOutDil: 15812547000,
  },
];

const mockBalance: FmpBalanceSheet[] = [
  {
    date: "2024-09-30",
    symbol: "AAPL",
    period: "FY",
    totalAssets: 364980000000,
    totalCurrentAssets: 152987000000,
    cashAndCashEquivalents: 29943000000,
    totalLiabilities: 308030000000,
    totalCurrentLiabilities: 176392000000,
    longTermDebt: 85750000000,
    totalStockholdersEquity: 56950000000,
    totalDebt: 101304000000,
    netDebt: 71361000000,
  },
];

const mockCashFlow: FmpCashFlow[] = [
  {
    date: "2024-09-30",
    symbol: "AAPL",
    period: "FY",
    operatingCashFlow: 118254000000,
    capitalExpenditure: -9447000000,
    freeCashFlow: 108807000000,
    dividendsPaid: -15234000000,
    commonStockRepurchased: -94949000000,
    netCashProvidedByOperatingActivities: 118254000000,
    netCashUsedForInvestingActivites: -6935000000,
    netCashUsedProvidedByFinancingActivities: -121983000000,
  },
];

const mockMetrics: FmpKeyMetrics[] = [
  {
    symbol: "AAPL",
    date: "2024-09-30",
    period: "FY",
    revenuePerShare: 25.52,
    netIncomePerShare: 6.11,
    operatingCashFlowPerShare: 7.71,
    freeCashFlowPerShare: 7.1,
    cashPerShare: 1.95,
    bookValuePerShare: 3.71,
    tangibleBookValuePerShare: 3.71,
    shareholdersEquityPerShare: 3.71,
    interestDebtPerShare: 6.61,
    marketCap: 3500000000000,
    enterpriseValue: 3571361000000,
    peRatio: 35.2,
    priceToSalesRatio: 8.95,
    pocfratio: 29.6,
    pfcfRatio: 32.2,
    pbRatio: 61.5,
    ptbRatio: 61.5,
    evToSales: 9.13,
    enterpriseValueOverEBITDA: 26.5,
    evToOperatingCashFlow: 30.2,
    evToFreeCashFlow: 32.8,
    earningsYield: 0.0284,
    freeCashFlowYield: 0.031,
    debtToEquity: 1.78,
    debtToAssets: 0.277,
    netDebtToEBITDA: 0.53,
    currentRatio: 0.867,
    interestCoverage: 29.5,
    incomeQuality: 1.26,
    dividendYield: 0.0044,
    payoutRatio: 0.153,
    salesGeneralAndAdministrativeToRevenue: 0.063,
    researchAndDdevelopementToRevenue: 0.0802,
    intangiblesToTotalAssets: 0.0,
    capexToOperatingCashFlow: 0.0799,
    capexToRevenue: 0.0242,
    capexToDepreciation: 0.373,
    stockBasedCompensationToRevenue: 0.028,
    grahamNumber: 21.26,
    roic: 0.548,
    returnOnTangibleAssets: 0.257,
    grahamNetNet: -8.15,
    workingCapital: -23405000000,
    tangibleAssetValue: 56950000000,
    netCurrentAssetValue: -23043000000,
    investedCapital: 158254000000,
    averageReceivables: 29508000000,
    averagePayables: 59076000000,
    averageInventory: 6331000000,
    daysSalesOutstanding: 27.5,
    daysPayablesOutstanding: 102.3,
    daysOfInventoryOnHand: 10.9,
    receivablesTurnover: 13.27,
    payablesTurnover: 3.57,
    inventoryTurnover: 33.49,
    roe: 1.645,
    capexPerShare: 0.62,
  },
];

// ── 测试套件 ──────────────────────────────────────────────────────────────────

describe("analyzeProfitability", () => {
  it("应返回包含盈利能力分析的 Markdown", () => {
    const result = analyzeProfitability(mockIncome, mockMetrics);
    expect(result).toContain("盈利能力分析");
    expect(result).toContain("毛利率");
    expect(result).toContain("ROE");
    expect(result).toContain("ROIC");
  });

  it("应正确显示毛利率数值", () => {
    const result = analyzeProfitability(mockIncome, mockMetrics);
    expect(result).toContain("46.2%"); // 0.4621 * 100
  });

  it("空数据时应返回空字符串", () => {
    expect(analyzeProfitability([], [])).toBe("");
  });
});

describe("analyzeLiquidity", () => {
  it("应返回包含流动性分析的 Markdown", () => {
    const result = analyzeLiquidity(mockBalance, mockMetrics);
    expect(result).toContain("流动性分析");
    expect(result).toContain("流动比率");
    expect(result).toContain("现金比率");
  });
});

describe("analyzeSolvency", () => {
  it("应返回包含偿债能力分析的 Markdown", () => {
    const result = analyzeSolvency(mockBalance, mockMetrics, mockIncome);
    expect(result).toContain("偿债能力分析");
    expect(result).toContain("债务/权益比");
    expect(result).toContain("利息覆盖率");
  });

  it("高利息覆盖率应显示强势信号", () => {
    const result = analyzeSolvency(mockBalance, mockMetrics, mockIncome);
    expect(result).toContain("🟢"); // 29.5x 利息覆盖率应为强势
  });
});

describe("analyzeValuation", () => {
  it("应返回包含估值分析的 Markdown", () => {
    const result = analyzeValuation(mockMetrics, mockIncome);
    expect(result).toContain("估值分析");
    expect(result).toContain("P/E");
    expect(result).toContain("EV/EBITDA");
    expect(result).toContain("格雷厄姆数");
  });
});

describe("analyzeEfficiency", () => {
  it("应返回包含运营效率分析的 Markdown", () => {
    const result = analyzeEfficiency(mockMetrics);
    expect(result).toContain("运营效率分析");
    expect(result).toContain("DSO");
    expect(result).toContain("DPO");
    expect(result).toContain("现金转换周期");
  });

  it("Apple 的 CCC 应为负值（强势信号）", () => {
    const result = analyzeEfficiency(mockMetrics);
    // CCC = DSO(27.5) + DIO(10.9) - DPO(102.3) = -63.9
    expect(result).toContain("🟢"); // 负 CCC 应为强势
  });
});

describe("analyzeCashFlow", () => {
  it("应返回包含现金流分析的 Markdown", () => {
    const result = analyzeCashFlow(mockCashFlow, mockIncome, mockMetrics);
    expect(result).toContain("现金流质量分析");
    expect(result).toContain("自由现金流");
    expect(result).toContain("FCF 转化率");
  });
});

describe("calculateHealthScore", () => {
  it("Apple 级别公司应获得高分", () => {
    const { score, grade } = calculateHealthScore(mockIncome, mockBalance, mockCashFlow, mockMetrics);
    expect(score).toBeGreaterThan(60);
    expect(["A+", "A", "B+", "B"]).toContain(grade);
  });

  it("空数据时应返回 0 分", () => {
    const { score, grade } = calculateHealthScore([], [], [], []);
    expect(score).toBe(0);
    expect(grade).toBe("N/A");
  });
});

describe("formatFinancialMetrics", () => {
  it("应生成包含所有分析维度的完整报告", () => {
    const result = formatFinancialMetrics(
      "AAPL",
      mockIncome,
      mockBalance,
      mockCashFlow,
      mockMetrics
    );
    expect(result).toContain("标准化财务指标分析");
    expect(result).toContain("AAPL");
    expect(result).toContain("综合财务健康评分");
    expect(result).toContain("盈利能力分析");
    expect(result).toContain("流动性分析");
    expect(result).toContain("偿债能力分析");
    expect(result).toContain("估值分析");
    expect(result).toContain("运营效率分析");
    expect(result).toContain("现金流质量分析");
  });

  it("空数据时应返回空字符串", () => {
    expect(formatFinancialMetrics("AAPL", [], [], [], [])).toBe("");
  });
});
