/**
 * financialMetrics.ts
 * 标准化财务指标解读模块
 * 参考 JerBouma/FinanceToolkit 的指标分类体系
 * 输入来自 FMP API 的财务报表数据，输出带信号解读的 Markdown 分析文本
 */

import type { FmpKeyMetrics, FmpIncomeStatement, FmpBalanceSheet, FmpCashFlow, FmpProfile } from "./fmpApi";

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || isNaN(v)) return "N/A";
  return v.toFixed(decimals);
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null || isNaN(v)) return "N/A";
  return `${(v * 100).toFixed(decimals)}%`;
}

function fmtB(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "N/A";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toFixed(0);
}

type Signal = "强势" | "良好" | "中性" | "偏弱" | "警示";

function signal(label: string, emoji: string): string {
  return `${emoji} ${label}`;
}

function rateSignal(value: number | null | undefined, thresholds: [number, number, number, number]): Signal {
  if (value == null || isNaN(value)) return "中性";
  const [excellent, good, neutral, weak] = thresholds;
  if (value >= excellent) return "强势";
  if (value >= good) return "良好";
  if (value >= neutral) return "中性";
  if (value >= weak) return "偏弱";
  return "警示";
}

const SIGNAL_EMOJI: Record<Signal, string> = {
  强势: "🟢",
  良好: "🔵",
  中性: "🟡",
  偏弱: "🟠",
  警示: "🔴",
};

function signalBadge(s: Signal): string {
  return `${SIGNAL_EMOJI[s]} ${s}`;
}

// ── 指标分类（参考 FinanceToolkit 体系） ──────────────────────────────────────

/**
 * 盈利能力指标（Profitability Ratios）
 * 参考：FinanceToolkit profitability module
 */
export function analyzeProfitability(
  income: FmpIncomeStatement[],
  metrics: FmpKeyMetrics[],
  profile?: FmpProfile | null
): string {
  if (income.length === 0 || metrics.length === 0) return "";
  const lines: string[] = [];
  const latest = income[0];
  const m = metrics[0];

  lines.push(`### 📊 盈利能力分析（Profitability）`);

  // 毛利率
  const grossMargin = latest.grossProfitRatio;
  const gmSignal = rateSignal(grossMargin, [0.5, 0.35, 0.2, 0.1]);
  // 营业利润率
  const opMargin = latest.operatingIncomeRatio;
  const omSignal = rateSignal(opMargin, [0.25, 0.15, 0.08, 0.03]);
  // 净利润率
  const netMargin = latest.netIncomeRatio;
  const nmSignal = rateSignal(netMargin, [0.2, 0.1, 0.05, 0.01]);
  // ROE
  const roe = m.roe;
  const roeSignal = rateSignal(roe, [0.2, 0.12, 0.06, 0.0]);
  // ROIC
  const roic = m.roic;
  const roicSignal = rateSignal(roic, [0.15, 0.1, 0.05, 0.0]);

  lines.push(`| 指标 | 数值 | 信号 | 说明 |`);
  lines.push(`|------|------|------|------|`);
  lines.push(`| 毛利率 | ${fmtPct(grossMargin)} | ${signalBadge(gmSignal)} | 产品/服务定价能力 |`);
  lines.push(`| 营业利润率 | ${fmtPct(opMargin)} | ${signalBadge(omSignal)} | 运营效率 |`);
  lines.push(`| 净利润率 | ${fmtPct(netMargin)} | ${signalBadge(nmSignal)} | 最终盈利能力 |`);
  lines.push(`| ROE（净资产收益率） | ${fmtPct(roe)} | ${signalBadge(roeSignal)} | 股东回报效率 |`);
  lines.push(`| ROIC（投入资本回报率） | ${fmtPct(roic)} | ${signalBadge(roicSignal)} | 资本配置效率 |`);

  // 趋势分析（如有多年数据）
  if (income.length >= 3) {
    const margins = income.slice(0, 3).map(s => s.netIncomeRatio);
    const trend = margins[0] > margins[1] && margins[1] > margins[2] ? "📈 净利润率持续改善" :
                  margins[0] < margins[1] && margins[1] < margins[2] ? "📉 净利润率持续下滑" :
                  "➡️ 净利润率相对稳定";
    lines.push(`\n> **利润率趋势**：${trend}（近3年：${margins.map(m => fmtPct(m)).join(" → ")}）`);
  }

  return lines.join("\n");
}

/**
 * 流动性指标（Liquidity Ratios）
 * 参考：FinanceToolkit liquidity module
 */
export function analyzeLiquidity(
  balance: FmpBalanceSheet[],
  metrics: FmpKeyMetrics[]
): string {
  if (balance.length === 0 || metrics.length === 0) return "";
  const lines: string[] = [];
  const b = balance[0];
  const m = metrics[0];

  lines.push(`\n### 💧 流动性分析（Liquidity）`);

  // 流动比率
  const currentRatio = m.currentRatio;
  const crSignal = rateSignal(currentRatio, [2.0, 1.5, 1.0, 0.8]);
  // 速动比率（用现金/流动负债近似）
  const quickRatio = b.totalCurrentAssets > 0 && b.totalCurrentLiabilities > 0
    ? (b.cashAndCashEquivalents) / b.totalCurrentLiabilities
    : null;
  const qrSignal = rateSignal(quickRatio, [1.0, 0.7, 0.5, 0.3]);
  // 现金比率
  const cashRatio = b.totalCurrentLiabilities > 0
    ? b.cashAndCashEquivalents / b.totalCurrentLiabilities
    : null;
  const cashRatioSignal = rateSignal(cashRatio, [0.5, 0.3, 0.2, 0.1]);

  lines.push(`| 指标 | 数值 | 信号 | 说明 |`);
  lines.push(`|------|------|------|------|`);
  lines.push(`| 流动比率 | ${fmt(currentRatio)} | ${signalBadge(crSignal)} | >2 充裕，<1 警示 |`);
  lines.push(`| 速动比率（现金/流动负债） | ${fmt(quickRatio)} | ${signalBadge(qrSignal)} | 不含库存的短期偿债能力 |`);
  lines.push(`| 现金比率 | ${fmt(cashRatio)} | ${signalBadge(cashRatioSignal)} | 纯现金覆盖短期债务 |`);
  lines.push(`| 现金及等价物 | ${fmtB(b.cashAndCashEquivalents)} | — | 账面现金储备 |`);
  lines.push(`| 净营运资本 | ${fmtB(m.workingCapital)} | — | 流动资产 - 流动负债 |`);

  return lines.join("\n");
}

/**
 * 偿债能力指标（Solvency Ratios）
 * 参考：FinanceToolkit solvency module
 */
export function analyzeSolvency(
  balance: FmpBalanceSheet[],
  metrics: FmpKeyMetrics[],
  income: FmpIncomeStatement[]
): string {
  if (balance.length === 0 || metrics.length === 0) return "";
  const lines: string[] = [];
  const m = metrics[0];

  lines.push(`\n### 🏦 偿债能力分析（Solvency）`);

  // 债务/权益
  const debtToEquity = m.debtToEquity;
  const deSignal = rateSignal(debtToEquity != null ? -debtToEquity : null, [-0.5, -1.0, -2.0, -3.0]); // 越低越好，反转
  const deSignalFixed: Signal = debtToEquity == null ? "中性" :
    debtToEquity < 0.5 ? "强势" : debtToEquity < 1.0 ? "良好" : debtToEquity < 2.0 ? "中性" : debtToEquity < 3.0 ? "偏弱" : "警示";
  // 净债务/EBITDA
  const netDebtToEbitda = m.netDebtToEBITDA;
  const ndSignal: Signal = netDebtToEbitda == null ? "中性" :
    netDebtToEbitda < 0 ? "强势" : netDebtToEbitda < 1 ? "良好" : netDebtToEbitda < 2 ? "中性" : netDebtToEbitda < 4 ? "偏弱" : "警示";
  // 利息覆盖率
  const interestCoverage = m.interestCoverage;
  const icSignal: Signal = interestCoverage == null ? "中性" :
    interestCoverage > 10 ? "强势" : interestCoverage > 5 ? "良好" : interestCoverage > 2 ? "中性" : interestCoverage > 1 ? "偏弱" : "警示";
  // 债务/总资产
  const debtToAssets = m.debtToAssets;
  const daSignal: Signal = debtToAssets == null ? "中性" :
    debtToAssets < 0.2 ? "强势" : debtToAssets < 0.4 ? "良好" : debtToAssets < 0.6 ? "中性" : debtToAssets < 0.8 ? "偏弱" : "警示";

  lines.push(`| 指标 | 数值 | 信号 | 说明 |`);
  lines.push(`|------|------|------|------|`);
  lines.push(`| 债务/权益比 | ${fmt(debtToEquity)} | ${signalBadge(deSignalFixed)} | <1 健康，>3 高杠杆 |`);
  lines.push(`| 净债务/EBITDA | ${fmt(netDebtToEbitda)} | ${signalBadge(ndSignal)} | <2 安全，>4 高风险 |`);
  lines.push(`| 利息覆盖率 | ${fmt(interestCoverage)}x | ${signalBadge(icSignal)} | >5 充裕，<2 危险 |`);
  lines.push(`| 债务/总资产 | ${fmtPct(debtToAssets)} | ${signalBadge(daSignal)} | <40% 稳健 |`);

  return lines.join("\n");
}

/**
 * 估值指标（Valuation Ratios）
 * 参考：FinanceToolkit valuation module
 */
export function analyzeValuation(
  metrics: FmpKeyMetrics[],
  income: FmpIncomeStatement[]
): string {
  if (metrics.length === 0) return "";
  const lines: string[] = [];
  const m = metrics[0];

  lines.push(`\n### 💰 估值分析（Valuation）`);

  // PE
  const peSignal: Signal = m.peRatio == null ? "中性" :
    m.peRatio < 15 ? "强势" : m.peRatio < 25 ? "良好" : m.peRatio < 35 ? "中性" : m.peRatio < 50 ? "偏弱" : "警示";
  // PB
  const pbSignal: Signal = m.pbRatio == null ? "中性" :
    m.pbRatio < 1 ? "强势" : m.pbRatio < 3 ? "良好" : m.pbRatio < 5 ? "中性" : m.pbRatio < 10 ? "偏弱" : "警示";
  // EV/EBITDA
  const evEbitdaSignal: Signal = m.enterpriseValueOverEBITDA == null ? "中性" :
    m.enterpriseValueOverEBITDA < 8 ? "强势" : m.enterpriseValueOverEBITDA < 15 ? "良好" :
    m.enterpriseValueOverEBITDA < 25 ? "中性" : m.enterpriseValueOverEBITDA < 40 ? "偏弱" : "警示";
  // P/FCF
  const pfcfSignal: Signal = m.pfcfRatio == null ? "中性" :
    m.pfcfRatio < 15 ? "强势" : m.pfcfRatio < 25 ? "良好" : m.pfcfRatio < 40 ? "中性" : m.pfcfRatio < 60 ? "偏弱" : "警示";
  // EV/Sales
  const evSalesSignal: Signal = m.evToSales == null ? "中性" :
    m.evToSales < 2 ? "强势" : m.evToSales < 5 ? "良好" : m.evToSales < 10 ? "中性" : m.evToSales < 20 ? "偏弱" : "警示";

  lines.push(`| 指标 | 数值 | 信号 | 基准参考 |`);
  lines.push(`|------|------|------|---------|`);
  lines.push(`| P/E（市盈率） | ${fmt(m.peRatio)} | ${signalBadge(peSignal)} | <15 低估，>50 高估 |`);
  lines.push(`| P/B（市净率） | ${fmt(m.pbRatio)} | ${signalBadge(pbSignal)} | <1 破净，>10 溢价高 |`);
  lines.push(`| EV/EBITDA | ${fmt(m.enterpriseValueOverEBITDA)} | ${signalBadge(evEbitdaSignal)} | <8 低估，>25 高估 |`);
  lines.push(`| P/FCF（市现率） | ${fmt(m.pfcfRatio)} | ${signalBadge(pfcfSignal)} | <15 低估，>60 高估 |`);
  lines.push(`| EV/Sales | ${fmt(m.evToSales)} | ${signalBadge(evSalesSignal)} | <2 低估，>20 高估 |`);
  lines.push(`| 自由现金流收益率 | ${fmtPct(m.freeCashFlowYield)} | — | 越高越好 |`);
  lines.push(`| 股息收益率 | ${fmtPct(m.dividendYield)} | — | — |`);
  lines.push(`| 格雷厄姆数 | $${fmt(m.grahamNumber)} | — | 安全边际参考值 |`);

  return lines.join("\n");
}

/**
 * 效率指标（Efficiency Ratios）
 * 参考：FinanceToolkit efficiency module
 */
export function analyzeEfficiency(metrics: FmpKeyMetrics[]): string {
  if (metrics.length === 0) return "";
  const lines: string[] = [];
  const m = metrics[0];

  lines.push(`\n### ⚙️ 运营效率分析（Efficiency）`);

  lines.push(`| 指标 | 数值 | 说明 |`);
  lines.push(`|------|------|------|`);
  lines.push(`| 应收账款周转天数（DSO） | ${fmt(m.daysSalesOutstanding)} 天 | 越短越好 |`);
  lines.push(`| 应付账款周转天数（DPO） | ${fmt(m.daysPayablesOutstanding)} 天 | 越长越好（供应商议价力） |`);
  lines.push(`| 库存周转天数（DIO） | ${fmt(m.daysOfInventoryOnHand)} 天 | 越短越好 |`);
  lines.push(`| 应收账款周转率 | ${fmt(m.receivablesTurnover)}x | — |`);
  lines.push(`| 库存周转率 | ${fmt(m.inventoryTurnover)}x | — |`);
  lines.push(`| 资本支出/营收 | ${fmtPct(m.capexToRevenue)} | 越低越好（轻资产模式） |`);
  lines.push(`| 研发支出/营收 | ${fmtPct(m.researchAndDdevelopementToRevenue)} | 创新投入强度 |`);

  // 现金转换周期（CCC = DSO + DIO - DPO）
  if (m.daysSalesOutstanding != null && m.daysOfInventoryOnHand != null && m.daysPayablesOutstanding != null) {
    const ccc = m.daysSalesOutstanding + m.daysOfInventoryOnHand - m.daysPayablesOutstanding;
    const cccSignal: Signal = ccc < 0 ? "强势" : ccc < 30 ? "良好" : ccc < 60 ? "中性" : ccc < 90 ? "偏弱" : "警示";
    lines.push(`| **现金转换周期（CCC）** | **${fmt(ccc)} 天** | ${signalBadge(cccSignal)} — 负值表示先收款后付款 |`);
  }

  return lines.join("\n");
}

/**
 * 现金流质量分析（Cash Flow Quality）
 * 参考：FinanceToolkit cash flow module
 */
export function analyzeCashFlow(
  cashFlows: FmpCashFlow[],
  income: FmpIncomeStatement[],
  metrics: FmpKeyMetrics[]
): string {
  if (cashFlows.length === 0) return "";
  const lines: string[] = [];
  const c = cashFlows[0];
  const m = metrics[0];

  lines.push(`\n### 💵 现金流质量分析（Cash Flow Quality）`);

  // 自由现金流转化率（FCF/净利润）
  const fcfConversion = income.length > 0 && income[0].netIncome !== 0
    ? c.freeCashFlow / income[0].netIncome
    : null;
  const fcfCSignal: Signal = fcfConversion == null ? "中性" :
    fcfConversion > 1.2 ? "强势" : fcfConversion > 0.8 ? "良好" : fcfConversion > 0.5 ? "中性" : fcfConversion > 0 ? "偏弱" : "警示";

  // 经营现金流/净利润（收益质量）
  const earningsQuality = m?.incomeQuality;
  const eqSignal: Signal = earningsQuality == null ? "中性" :
    earningsQuality > 1.2 ? "强势" : earningsQuality > 0.8 ? "良好" : earningsQuality > 0.5 ? "中性" : earningsQuality > 0 ? "偏弱" : "警示";

  lines.push(`| 指标 | 数值 | 信号 | 说明 |`);
  lines.push(`|------|------|------|------|`);
  lines.push(`| 经营现金流 | ${fmtB(c.operatingCashFlow)} | — | 核心业务产生的现金 |`);
  lines.push(`| 资本支出 | ${fmtB(Math.abs(c.capitalExpenditure))} | — | 维持/扩张业务的投资 |`);
  lines.push(`| 自由现金流（FCF） | ${fmtB(c.freeCashFlow)} | — | 可自由支配的现金 |`);
  lines.push(`| FCF 转化率（FCF/净利润） | ${fmt(fcfConversion)} | ${signalBadge(fcfCSignal)} | >1 表示盈利质量高 |`);
  lines.push(`| 收益质量（经营现金流/净利润） | ${fmt(earningsQuality)} | ${signalBadge(eqSignal)} | >1 表示利润含金量高 |`);

  // 多年趋势
  if (cashFlows.length >= 3) {
    const fcfs = cashFlows.slice(0, 3).map(cf => fmtB(cf.freeCashFlow));
    lines.push(`\n> **FCF 趋势（近3年）**：${fcfs.join(" → ")}`);
  }

  return lines.join("\n");
}

/**
 * 综合财务健康评分（参考 FinanceToolkit 综合评估方法）
 */
export function calculateHealthScore(
  income: FmpIncomeStatement[],
  balance: FmpBalanceSheet[],
  cashFlows: FmpCashFlow[],
  metrics: FmpKeyMetrics[]
): { score: number; grade: string; summary: string } {
  if (metrics.length === 0 || income.length === 0) {
    return { score: 0, grade: "N/A", summary: "数据不足" };
  }

  const m = metrics[0];
  const i = income[0];
  const c = cashFlows[0] ?? null;

  let score = 0;
  const factors: string[] = [];

  // 盈利能力（30分）
  if (m.roe != null && m.roe > 0.15) { score += 10; factors.push("ROE 优秀"); }
  else if (m.roe != null && m.roe > 0.08) { score += 6; }
  if (i.netIncomeRatio != null && i.netIncomeRatio > 0.1) { score += 10; factors.push("净利润率健康"); }
  else if (i.netIncomeRatio != null && i.netIncomeRatio > 0.05) { score += 6; }
  if (m.roic != null && m.roic > 0.1) { score += 10; factors.push("ROIC 超过资本成本"); }
  else if (m.roic != null && m.roic > 0.05) { score += 6; }

  // 偿债能力（25分）
  if (m.debtToEquity != null && m.debtToEquity < 0.5) { score += 10; factors.push("低杠杆"); }
  else if (m.debtToEquity != null && m.debtToEquity < 1.5) { score += 6; }
  if (m.interestCoverage != null && m.interestCoverage > 5) { score += 10; factors.push("利息覆盖充裕"); }
  else if (m.interestCoverage != null && m.interestCoverage > 2) { score += 5; }
  if (m.currentRatio != null && m.currentRatio > 1.5) { score += 5; factors.push("流动性充足"); }
  else if (m.currentRatio != null && m.currentRatio > 1.0) { score += 3; }

  // 现金流质量（25分）
  if (c) {
    if (c.freeCashFlow > 0) { score += 10; factors.push("正自由现金流"); }
    const fcfConv = i.netIncome !== 0 ? c.freeCashFlow / i.netIncome : null;
    if (fcfConv != null && fcfConv > 0.8) { score += 10; factors.push("FCF 转化率高"); }
    else if (fcfConv != null && fcfConv > 0.5) { score += 6; }
    if (m.incomeQuality != null && m.incomeQuality > 0.8) { score += 5; factors.push("收益质量高"); }
  }

  // 成长性（20分）
  if (income.length >= 2) {
    const revGrowth = income[0].revenue > 0 && income[1].revenue > 0
      ? (income[0].revenue - income[1].revenue) / income[1].revenue
      : null;
    if (revGrowth != null && revGrowth > 0.15) { score += 10; factors.push("营收高速增长"); }
    else if (revGrowth != null && revGrowth > 0.05) { score += 6; }
    else if (revGrowth != null && revGrowth > 0) { score += 3; }

    const niGrowth = income[0].netIncome > 0 && income[1].netIncome > 0
      ? (income[0].netIncome - income[1].netIncome) / Math.abs(income[1].netIncome)
      : null;
    if (niGrowth != null && niGrowth > 0.15) { score += 10; factors.push("净利润高速增长"); }
    else if (niGrowth != null && niGrowth > 0.05) { score += 6; }
    else if (niGrowth != null && niGrowth > 0) { score += 3; }
  }

  const grade = score >= 85 ? "A+" : score >= 75 ? "A" : score >= 65 ? "B+" :
                score >= 55 ? "B" : score >= 45 ? "C+" : score >= 35 ? "C" : "D";

  const summary = factors.length > 0
    ? `优势：${factors.slice(0, 4).join("、")}`
    : "各项指标表现一般";

  return { score, grade, summary };
}

/**
 * 主函数：生成完整的标准化财务指标分析报告
 */
export function formatFinancialMetrics(
  symbol: string,
  income: FmpIncomeStatement[],
  balance: FmpBalanceSheet[],
  cashFlows: FmpCashFlow[],
  metrics: FmpKeyMetrics[],
  profile?: FmpProfile | null
): string {
  if (metrics.length === 0 && income.length === 0) return "";

  const lines: string[] = [];
  lines.push(`## 📈 标准化财务指标分析 — ${symbol}`);
  lines.push(`*参考 FinanceToolkit 分类体系 | 数据来源：Financial Modeling Prep*\n`);

  // 综合健康评分
  const health = calculateHealthScore(income, balance, cashFlows, metrics);
  lines.push(`> **综合财务健康评分：${health.score}/100（${health.grade}）** — ${health.summary}`);
  lines.push("");

  // 各维度分析
  lines.push(analyzeProfitability(income, metrics, profile));
  lines.push(analyzeLiquidity(balance, metrics));
  lines.push(analyzeSolvency(balance, metrics, income));
  lines.push(analyzeValuation(metrics, income));
  lines.push(analyzeEfficiency(metrics));
  lines.push(analyzeCashFlow(cashFlows, income, metrics));

  return lines.filter(l => l !== "").join("\n");
}
