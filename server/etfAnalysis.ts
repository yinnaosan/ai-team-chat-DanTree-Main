/**
 * etfAnalysis.ts — ETF 分析模块
 * 参考：JerBouma/ThePassiveInvestor（被动投资 ETF 分析平台）
 * 功能：
 *   1. ETF 基本信息提取（费率/规模/跟踪指数/分红）
 *   2. 风险收益指标计算（夏普比率/最大回撤/波动率/Beta）
 *   3. 多 ETF 比较分析
 *   4. ETF 适合度评分（基于被动投资原则）
 *   5. 格式化报告生成
 */

import { callDataApi } from "./_core/dataApi";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface ETFBasicInfo {
  symbol: string;
  name: string;
  /** 资产管理规模（百万美元） */
  aum: number | null;
  /** 总费率（expense ratio，如 0.0003 = 0.03%） */
  expenseRatio: number | null;
  /** 跟踪指数 */
  trackingIndex: string | null;
  /** 资产类别 */
  assetClass: string | null;
  /** 地区 */
  region: string | null;
  /** 分红频率 */
  dividendFrequency: string | null;
  /** 年化分红收益率 */
  dividendYield: number | null;
  /** 持仓数量 */
  holdingsCount: number | null;
  /** 当前价格 */
  currentPrice: number | null;
  /** 52 周涨跌幅 */
  yearReturn: number | null;
}

export interface ETFRiskMetrics {
  symbol: string;
  /** 年化波动率 */
  annualizedVol: number;
  /** 夏普比率（假设无风险利率 5%） */
  sharpeRatio: number;
  /** 最大回撤 */
  maxDrawdown: number;
  /** Beta（相对 SPY） */
  beta: number | null;
  /** 3 月收益率 */
  return3m: number | null;
  /** 6 月收益率 */
  return6m: number | null;
  /** 1 年收益率 */
  return1y: number | null;
}

export interface ETFScore {
  symbol: string;
  /** 总分（0-100） */
  totalScore: number;
  /** 费率评分（0-25）：越低越好 */
  costScore: number;
  /** 规模评分（0-25）：越大越好（流动性） */
  scaleScore: number;
  /** 收益评分（0-25）：夏普比率 */
  returnScore: number;
  /** 风险评分（0-25）：最大回撤越小越好 */
  riskScore: number;
  /** 评级 */
  grade: "A+" | "A" | "B+" | "B" | "C" | "D";
  /** 适合被动投资者的理由 */
  summary: string;
}

// ── 数据获取 ──────────────────────────────────────────────────────────────────

/**
 * 获取 ETF 基本信息
 */
export async function getETFBasicInfo(ticker: string): Promise<ETFBasicInfo | null> {
  try {
    const symbol = ticker.toUpperCase();

    // 获取报价数据
    const quoteData = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol, interval: "1d", range: "1y" },
    }) as any;

    const meta = quoteData?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const currentPrice = meta.regularMarketPrice ?? meta.previousClose ?? null;
    const prevClose = meta.previousClose ?? currentPrice;
    const week52High = meta.fiftyTwoWeekHigh ?? null;
    const week52Low = meta.fiftyTwoWeekLow ?? null;

    // 计算 52 周涨跌幅（用 52 周高低均值估算）
    let yearReturn: number | null = null;
    if (week52High && week52Low && currentPrice) {
      const midYear = (week52High + week52Low) / 2;
      yearReturn = (currentPrice - midYear) / midYear;
    }

    // 尝试获取 ETF 详细信息（通过 insights）
    let expenseRatio: number | null = null;
    let trackingIndex: string | null = null;
    let dividendYield: number | null = null;
    let holdingsCount: number | null = null;
    let assetClass: string | null = null;

    try {
      const insightsData = await callDataApi("YahooFinance/get_stock_insights", {
        query: { symbol },
      }) as any;
      const fund = insightsData?.finance?.result?.etfData;
      if (fund) {
        expenseRatio = fund.annualReportExpenseRatio ?? null;
        trackingIndex = fund.trackingIndex ?? null;
        dividendYield = fund.trailingThreeMonthReturns ?? null;
        holdingsCount = fund.holdingsCount ?? null;
        assetClass = fund.categoryName ?? null;
      }
    } catch { /* ignore */ }

    return {
      symbol,
      name: meta.longName ?? meta.shortName ?? symbol,
      aum: meta.marketCap ? meta.marketCap / 1e6 : null,
      expenseRatio,
      trackingIndex,
      assetClass,
      region: null, // 需要额外数据源
      dividendFrequency: null,
      dividendYield,
      holdingsCount,
      currentPrice,
      yearReturn,
    };
  } catch {
    return null;
  }
}

/**
 * 计算 ETF 风险收益指标（基于历史价格数据）
 */
export function calculateETFRiskMetrics(
  symbol: string,
  prices: number[],
  riskFreeRate = 0.05
): ETFRiskMetrics {
  if (prices.length < 2) {
    return {
      symbol,
      annualizedVol: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      beta: null,
      return3m: null,
      return6m: null,
      return1y: null,
    };
  }

  // 日收益率
  const dailyReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      dailyReturns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }

  if (dailyReturns.length === 0) {
    return { symbol, annualizedVol: 0, sharpeRatio: 0, maxDrawdown: 0, beta: null, return3m: null, return6m: null, return1y: null };
  }

  // 年化波动率
  const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / dailyReturns.length;
  const annualizedVol = Math.sqrt(variance * 252);

  // 年化收益率
  const annualizedReturn = meanReturn * 252;

  // 夏普比率
  const sharpeRatio = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;

  // 最大回撤
  let maxDrawdown = 0;
  let peak = prices[0];
  for (const price of prices) {
    if (price > peak) peak = price;
    const drawdown = (peak - price) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // 区间收益率
  const n = prices.length;
  const return3m = n >= 63 ? (prices[n - 1] - prices[n - 63]) / prices[n - 63] : null;
  const return6m = n >= 126 ? (prices[n - 1] - prices[n - 126]) / prices[n - 126] : null;
  const return1y = n >= 252 ? (prices[n - 1] - prices[0]) / prices[0] : null;

  return {
    symbol,
    annualizedVol,
    sharpeRatio,
    maxDrawdown,
    beta: null, // 需要基准数据
    return3m,
    return6m,
    return1y,
  };
}

/**
 * 计算 ETF 适合度评分（基于被动投资原则）
 * 参考 ThePassiveInvestor 的评分逻辑
 */
export function scoreETF(
  info: ETFBasicInfo,
  metrics: ETFRiskMetrics
): ETFScore {
  // 1. 费率评分（0-25）：< 0.1% 满分，> 1% 0 分
  let costScore = 0;
  if (info.expenseRatio !== null) {
    const er = info.expenseRatio;
    if (er <= 0.001) costScore = 25;
    else if (er <= 0.003) costScore = 22;
    else if (er <= 0.005) costScore = 18;
    else if (er <= 0.01) costScore = 12;
    else if (er <= 0.02) costScore = 6;
    else costScore = 0;
  } else {
    costScore = 10; // 未知时给中等分
  }

  // 2. 规模评分（0-25）：AUM > $10B 满分，< $100M 0 分
  let scaleScore = 0;
  if (info.aum !== null) {
    const aumB = info.aum / 1000; // 转换为十亿美元
    if (aumB >= 10) scaleScore = 25;
    else if (aumB >= 5) scaleScore = 20;
    else if (aumB >= 1) scaleScore = 15;
    else if (aumB >= 0.5) scaleScore = 8;
    else if (aumB >= 0.1) scaleScore = 3;
    else scaleScore = 0;
  } else {
    scaleScore = 10;
  }

  // 3. 收益评分（0-25）：基于夏普比率
  let returnScore = 0;
  const sharpe = metrics.sharpeRatio;
  if (sharpe >= 1.5) returnScore = 25;
  else if (sharpe >= 1.0) returnScore = 20;
  else if (sharpe >= 0.5) returnScore = 15;
  else if (sharpe >= 0.0) returnScore = 8;
  else returnScore = 0;

  // 4. 风险评分（0-25）：最大回撤越小越好
  let riskScore = 0;
  const dd = metrics.maxDrawdown;
  if (dd <= 0.05) riskScore = 25;
  else if (dd <= 0.10) riskScore = 20;
  else if (dd <= 0.20) riskScore = 15;
  else if (dd <= 0.30) riskScore = 8;
  else if (dd <= 0.50) riskScore = 3;
  else riskScore = 0;

  const totalScore = costScore + scaleScore + returnScore + riskScore;

  // 评级
  let grade: ETFScore["grade"] = "D";
  if (totalScore >= 90) grade = "A+";
  else if (totalScore >= 80) grade = "A";
  else if (totalScore >= 70) grade = "B+";
  else if (totalScore >= 60) grade = "B";
  else if (totalScore >= 45) grade = "C";

  // 摘要
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (costScore >= 20) strengths.push("超低费率");
  else if (costScore <= 6) weaknesses.push("费率偏高");
  if (scaleScore >= 20) strengths.push("规模大/流动性好");
  else if (scaleScore <= 5) weaknesses.push("规模偏小");
  if (returnScore >= 20) strengths.push("风险调整收益优秀");
  if (riskScore >= 20) strengths.push("回撤控制好");
  else if (riskScore <= 5) weaknesses.push("历史回撤较大");

  const summary = [
    strengths.length > 0 ? `优势：${strengths.join("、")}` : "",
    weaknesses.length > 0 ? `注意：${weaknesses.join("、")}` : "",
  ].filter(Boolean).join("；") || "综合表现中等";

  return { symbol: info.symbol, totalScore, costScore, scaleScore, returnScore, riskScore, grade, summary };
}

// ── 格式化报告 ────────────────────────────────────────────────────────────────

/**
 * 格式化单个 ETF 分析报告
 */
export function formatETFReport(
  info: ETFBasicInfo,
  metrics: ETFRiskMetrics,
  score: ETFScore
): string {
  const lines: string[] = [];
  lines.push(`### 📊 ETF 分析 — ${info.name} (${info.symbol})`);

  lines.push(`\n**基本信息**`);
  lines.push(`| 项目 | 数值 |`);
  lines.push(`|---|---|`);
  if (info.currentPrice) lines.push(`| 当前价格 | $${info.currentPrice.toFixed(2)} |`);
  if (info.aum) lines.push(`| 资产管理规模 | $${(info.aum / 1000).toFixed(1)}B |`);
  if (info.expenseRatio !== null) lines.push(`| 总费率 | ${(info.expenseRatio * 100).toFixed(3)}% |`);
  if (info.trackingIndex) lines.push(`| 跟踪指数 | ${info.trackingIndex} |`);
  if (info.assetClass) lines.push(`| 资产类别 | ${info.assetClass} |`);
  if (info.dividendYield !== null) lines.push(`| 分红收益率 | ${(info.dividendYield * 100).toFixed(2)}% |`);
  if (info.holdingsCount) lines.push(`| 持仓数量 | ${info.holdingsCount} |`);

  lines.push(`\n**风险收益指标**`);
  lines.push(`| 指标 | 数值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 年化波动率 | ${(metrics.annualizedVol * 100).toFixed(2)}% |`);
  lines.push(`| 夏普比率 | ${metrics.sharpeRatio.toFixed(3)} |`);
  lines.push(`| 最大回撤 | ${(metrics.maxDrawdown * 100).toFixed(2)}% |`);
  if (metrics.return3m !== null) lines.push(`| 3 月收益 | ${(metrics.return3m * 100).toFixed(2)}% |`);
  if (metrics.return6m !== null) lines.push(`| 6 月收益 | ${(metrics.return6m * 100).toFixed(2)}% |`);
  if (metrics.return1y !== null) lines.push(`| 1 年收益 | ${(metrics.return1y * 100).toFixed(2)}% |`);

  lines.push(`\n**被动投资适合度评分**`);
  lines.push(`| 维度 | 得分 | 满分 |`);
  lines.push(`|---|---|---|`);
  lines.push(`| 费率 | ${score.costScore} | 25 |`);
  lines.push(`| 规模/流动性 | ${score.scaleScore} | 25 |`);
  lines.push(`| 风险调整收益 | ${score.returnScore} | 25 |`);
  lines.push(`| 回撤控制 | ${score.riskScore} | 25 |`);
  lines.push(`| **综合评分** | **${score.totalScore}** | **100** |`);
  lines.push(`| **评级** | **${score.grade}** | — |`);
  lines.push(`\n> ${score.summary}`);

  lines.push(`\n*数据来源：Yahoo Finance | 分析框架：ThePassiveInvestor 参考实现*`);
  return lines.join("\n");
}

/**
 * 多 ETF 比较摘要（用于注入 GPT prompt）
 */
export function compareETFsSummary(
  etfs: Array<{ info: ETFBasicInfo; metrics: ETFRiskMetrics; score: ETFScore }>
): string {
  if (etfs.length === 0) return "";

  const lines: string[] = [];
  lines.push(`#### ETF 比较分析（${etfs.length} 只）`);
  lines.push(`| ETF | 费率 | AUM | 夏普 | 最大回撤 | 1Y 收益 | 评分 | 评级 |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);

  for (const { info, metrics, score } of etfs) {
    const er = info.expenseRatio !== null ? `${(info.expenseRatio * 100).toFixed(3)}%` : "N/A";
    const aum = info.aum ? `$${(info.aum / 1000).toFixed(1)}B` : "N/A";
    const sharpe = metrics.sharpeRatio.toFixed(2);
    const dd = `${(metrics.maxDrawdown * 100).toFixed(1)}%`;
    const ret1y = metrics.return1y !== null ? `${(metrics.return1y * 100).toFixed(1)}%` : "N/A";
    lines.push(`| ${info.symbol} | ${er} | ${aum} | ${sharpe} | ${dd} | ${ret1y} | ${score.totalScore} | ${score.grade} |`);
  }

  // 推荐
  const best = etfs.reduce((a, b) => a.score.totalScore > b.score.totalScore ? a : b);
  lines.push(`\n**推荐**：${best.info.symbol}（${best.score.grade} 级，${best.score.totalScore} 分）— ${best.score.summary}`);

  return lines.join("\n");
}

/**
 * 检测任务是否涉及 ETF 分析
 */
export function isETFTask(text: string): boolean {
  return /\bETF\b|基金|指数基金|被动投资|SPY|QQQ|VOO|VTI|IVV|EEM|GLD|BND|VNQ|ARKK/i.test(text);
}

/**
 * 从文本中提取 ETF 代码
 */
export function extractETFTickers(text: string): string[] {
  // 常见 ETF 代码列表
  const knownETFs = [
    "SPY", "QQQ", "VOO", "VTI", "IVV", "EEM", "GLD", "SLV", "BND", "AGG",
    "VNQ", "ARKK", "ARKG", "ARKW", "ARKF", "ARKQ", "XLF", "XLK", "XLE",
    "XLV", "XLI", "XLB", "XLP", "XLU", "XLY", "XLRE", "XLC", "VEA", "VWO",
    "EFA", "IJH", "IJR", "MDY", "IWM", "DIA", "TLT", "SHY", "IEF", "HYG",
    "LQD", "EMB", "VIG", "VYM", "SCHD", "DGRO", "NOBL", "DVY", "SDY",
    "IEMG", "INDA", "FXI", "MCHI", "KWEB", "CQQQ", "ASHR",
  ];

  const found = new Set<string>();

  // 匹配已知 ETF
  for (const etf of knownETFs) {
    if (new RegExp(`\\b${etf}\\b`, "i").test(text)) {
      found.add(etf);
    }
  }

  // 匹配通用股票代码格式（2-5 个大写字母）
  const matches = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  for (const m of matches) {
    if (knownETFs.includes(m)) found.add(m);
  }

  return Array.from(found).slice(0, 5); // 最多返回 5 个
}
