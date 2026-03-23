/**
 * quantFactorKnowledge.ts
 * 基于 UFund-Me/Qbot 仓库提取的量化因子与策略知识库
 * 在 AI 技术分析时自动引用相关因子定义和信号解读
 */

export interface QuantFactor {
  id: string;
  name: string;
  nameZh: string;
  category: "technical" | "fundamental" | "momentum" | "volatility" | "volume" | "quality";
  formula: string;
  signalInterpretation: string;
  buySignal: string;
  sellSignal: string;
  limitations: string;
  triggerKeywords: string[];
}

export interface QuantStrategy {
  id: string;
  name: string;
  nameZh: string;
  type: "trend" | "mean_reversion" | "momentum" | "fundamental" | "multi_factor";
  description: string;
  coreLogic: string;
  applicableMarkets: string[];
  triggerKeywords: string[];
}

/** 量化因子库（从 Qbot 精选核心因子） */
export const QUANT_FACTORS: QuantFactor[] = [
  {
    id: "macd",
    name: "MACD (Moving Average Convergence Divergence)",
    nameZh: "MACD（指数平滑异同移动平均线）",
    category: "technical",
    formula:
      "DIF = EMA(12) - EMA(26)；DEA = EMA(DIF, 9)；MACD柱 = 2 × (DIF - DEA)",
    signalInterpretation:
      "DIF 与 DEA 的交叉反映短期与长期趋势的动量变化。MACD 柱由负转正表示多头动能增强，由正转负表示空头动能增强。",
    buySignal:
      "DIF 上穿 DEA（金叉）+ MACD 柱由负转正 + 发生在零轴上方（强势市场）",
    sellSignal:
      "DIF 下穿 DEA（死叉）+ MACD 柱由正转负 + 顶背离（价格创新高但 MACD 未创新高）",
    limitations:
      "滞后指标，震荡市中频繁出现假信号；参数（12/26/9）在不同市场需要调整；不适合单独使用，需结合成交量和趋势确认。",
    triggerKeywords: ["MACD", "金叉", "死叉", "背离", "DIF", "DEA", "均线"],
  },
  {
    id: "rsi",
    name: "RSI (Relative Strength Index)",
    nameZh: "RSI（相对强弱指数）",
    category: "technical",
    formula:
      "RSI = 100 - 100 / (1 + RS)；RS = N日平均上涨幅度 / N日平均下跌幅度（通常 N=14）",
    signalInterpretation:
      "RSI 衡量价格变动的速度与幅度。0-100 范围内，超买区（>70）表示短期涨幅过大，超卖区（<30）表示短期跌幅过大。",
    buySignal:
      "RSI 从超卖区（<30）回升至 30 以上 + 底背离（价格创新低但 RSI 未创新低）",
    sellSignal:
      "RSI 从超买区（>70）回落至 70 以下 + 顶背离（价格创新高但 RSI 未创新高）",
    limitations:
      "强趋势市场中 RSI 可在超买/超卖区间长期停留；单独使用容易产生过早的买卖信号；需结合趋势判断使用。",
    triggerKeywords: ["RSI", "超买", "超卖", "相对强弱", "背离", "技术指标"],
  },
  {
    id: "kdj",
    name: "KDJ (Stochastic Oscillator)",
    nameZh: "KDJ（随机指标）",
    category: "technical",
    formula:
      "RSV = (收盘价 - N日最低价) / (N日最高价 - N日最低价) × 100（N=9）；K = EMA(RSV, 3)；D = EMA(K, 3)；J = 3K - 2D",
    signalInterpretation:
      "KDJ 综合反映价格在一定周期内的强弱位置。J 值最敏感，K 次之，D 最稳定。三线金叉/死叉是主要交易信号。",
    buySignal:
      "K 线上穿 D 线（金叉）+ J 值从低位（<20）向上反转 + 发生在超卖区（K/D < 20）",
    sellSignal:
      "K 线下穿 D 线（死叉）+ J 值从高位（>80）向下反转 + 发生在超买区（K/D > 80）",
    limitations:
      "震荡市中信号频繁，容易被套；强趋势市场中可长期处于超买/超卖状态；J 值波动剧烈，需结合 K/D 综合判断。",
    triggerKeywords: ["KDJ", "随机指标", "K线", "D线", "J值", "超买超卖"],
  },
  {
    id: "bollinger-bands",
    name: "Bollinger Bands",
    nameZh: "布林带（BOLL）",
    category: "volatility",
    formula:
      "中轨 = MA(20)；上轨 = MA(20) + 2σ；下轨 = MA(20) - 2σ（σ为20日收盘价标准差）",
    signalInterpretation:
      "布林带通过统计学方法动态描述价格的波动范围。带宽收窄（Squeeze）预示大幅波动即将来临；价格触及上/下轨可能意味着超买/超卖。",
    buySignal:
      "价格触及下轨后反弹 + 带宽处于历史低位（Squeeze 后突破）+ 配合成交量放大",
    sellSignal:
      "价格触及上轨后回落 + 带宽极度扩张（趋势末期）+ 价格跌破中轨",
    limitations:
      "强趋势中价格可沿上/下轨运行，不能简单视为超买/超卖；参数（20日/2倍标准差）在不同波动率环境需调整。",
    triggerKeywords: ["布林带", "BOLL", "波动率", "标准差", "Squeeze", "带宽"],
  },
  {
    id: "ema",
    name: "EMA (Exponential Moving Average)",
    nameZh: "EMA（指数移动平均线）",
    category: "technical",
    formula:
      "EMA(t) = 价格(t) × k + EMA(t-1) × (1-k)；k = 2/(N+1)；常用周期：5/10/20/60/120/250",
    signalInterpretation:
      "EMA 对近期价格赋予更高权重，比 SMA 更敏感。多条 EMA 的排列（多头排列/空头排列）反映趋势强度。",
    buySignal:
      "短期 EMA 上穿长期 EMA（金叉）+ 多头排列（5>10>20>60）+ 价格在所有 EMA 上方",
    sellSignal:
      "短期 EMA 下穿长期 EMA（死叉）+ 空头排列（5<10<20<60）+ 价格在所有 EMA 下方",
    limitations:
      "滞后性仍然存在；震荡市中频繁产生假信号；不同周期的 EMA 组合需根据投资周期选择。",
    triggerKeywords: ["EMA", "均线", "金叉", "死叉", "多头排列", "空头排列", "移动平均"],
  },
  {
    id: "volume-analysis",
    name: "Volume Analysis",
    nameZh: "成交量分析",
    category: "volume",
    formula:
      "量比 = 当日成交量 / 过去5日平均成交量；OBV = 累计（上涨日加成交量，下跌日减成交量）",
    signalInterpretation:
      "成交量是价格趋势的验证工具。「量价配合」是趋势可持续的重要条件：上涨放量、下跌缩量为健康上升趋势；上涨缩量、下跌放量为趋势衰竭信号。",
    buySignal:
      "价格突破关键阻力位 + 成交量显著放大（量比 > 2）+ OBV 同步创新高",
    sellSignal:
      "价格创新高但成交量萎缩（量价背离）+ 高位放量长上影线 + OBV 顶背离",
    limitations:
      "A 股存在大量程序化交易，成交量数据可能被操纵；港股和美股的成交量分析更为可靠。",
    triggerKeywords: ["成交量", "量比", "OBV", "量价", "放量", "缩量", "背离"],
  },
  {
    id: "rsrs",
    name: "RSRS (Resistance Support Relative Strength)",
    nameZh: "RSRS（阻力支撑相对强度）",
    category: "momentum",
    formula:
      "以最近 N 日（通常18日）的最高价对最低价做线性回归，斜率 β 即为 RSRS 指标；标准化 RSRS = (β - β均值) / β标准差",
    signalInterpretation:
      "RSRS 衡量价格的支撑/阻力相对强度。β 越大表示上涨动能越强，支撑越强；β 越小表示下跌动能越强，阻力越强。标准化后可跨市场比较。",
    buySignal:
      "标准化 RSRS > 0.7（高于历史均值 0.7 个标准差）+ 趋势向上",
    sellSignal:
      "标准化 RSRS < -0.7（低于历史均值 0.7 个标准差）+ 趋势向下",
    limitations:
      "参数敏感，不同市场需要调整回归窗口；在剧烈波动市场中可能出现信号延迟。",
    triggerKeywords: ["RSRS", "阻力支撑", "线性回归", "斜率", "动能"],
  },
  {
    id: "peg-ratio",
    name: "PEG Ratio",
    nameZh: "PEG（市盈率相对盈利增长比率）",
    category: "fundamental",
    formula: "PEG = PE / 净利润增长率（%）；PEG < 1 通常被视为低估，PEG > 2 通常被视为高估",
    signalInterpretation:
      "PEG 将估值（PE）与增长速度结合，解决了 PE 无法比较不同增长率公司的问题。适合评估成长型公司的相对估值。",
    buySignal:
      "PEG < 1 + 增长率稳定且可持续 + 行业景气度上行",
    sellSignal:
      "PEG > 2 + 增长率开始放缓 + 行业竞争加剧",
    limitations:
      "依赖增长率预测，预测误差会导致 PEG 失真；不适合周期性行业；高增长阶段的 PEG 可能虚低。",
    triggerKeywords: ["PEG", "市盈率", "增长率", "估值", "成长股", "PE"],
  },
  {
    id: "roic",
    name: "ROIC (Return on Invested Capital)",
    nameZh: "ROIC（投入资本回报率）",
    category: "quality",
    formula:
      "ROIC = NOPAT / 投入资本 = 税后净营业利润 / (股东权益 + 有息负债)；优质公司 ROIC 通常 > 15%",
    signalInterpretation:
      "ROIC 是衡量公司资本配置效率的核心指标。持续高 ROIC（>15%）表明公司具有真实的竞争优势和护城河；ROIC > WACC 意味着公司在创造价值。",
    buySignal:
      "ROIC 持续 > 15% 且稳定或提升 + ROIC > WACC + 行业平均 ROIC 较低（说明公司有差异化优势）",
    sellSignal:
      "ROIC 持续下降 + ROIC 接近或低于 WACC + 竞争加剧导致行业 ROIC 均值下移",
    limitations:
      "计算方式不统一（不同机构对 NOPAT 和投入资本的定义不同）；轻资产公司 ROIC 天然较高，需行业内比较。",
    triggerKeywords: ["ROIC", "资本回报率", "护城河", "竞争优势", "WACC", "资本配置"],
  },
  {
    id: "free-cash-flow",
    name: "Free Cash Flow (FCF)",
    nameZh: "自由现金流（FCF）",
    category: "fundamental",
    formula:
      "FCF = 经营活动现金流 - 资本支出（CAPEX）；FCF Yield = FCF / 市值",
    signalInterpretation:
      "自由现金流是公司真实盈利能力的最佳衡量指标，难以通过会计手段操纵。持续正向 FCF 是公司财务健康的核心标志。",
    buySignal:
      "FCF 持续为正且增长 + FCF Yield > 5% + FCF / 净利润 > 80%（盈利质量高）",
    sellSignal:
      "FCF 持续为负或大幅下降 + 净利润与 FCF 严重背离（盈利质量差）+ CAPEX 大幅增加但收入未增长",
    limitations:
      "重资产行业（制造业、基础设施）FCF 天然较低；高增长阶段公司可能因大量投资导致 FCF 为负，需结合增长阶段判断。",
    triggerKeywords: [
      "自由现金流",
      "FCF",
      "现金流",
      "CAPEX",
      "资本支出",
      "盈利质量",
      "现金流量",
    ],
  },
];

/** 量化策略库（从 Qbot 精选核心策略） */
export const QUANT_STRATEGIES: QuantStrategy[] = [
  {
    id: "macd-strategy",
    name: "MACD Cross Strategy",
    nameZh: "MACD 金叉/死叉策略",
    type: "trend",
    description:
      "基于 MACD 金叉/死叉信号进行趋势跟踪交易，是最经典的技术分析策略之一。",
    coreLogic:
      "DIF 上穿 DEA 时买入（金叉），DIF 下穿 DEA 时卖出（死叉）。结合 MACD 柱的正负转换和零轴位置过滤假信号。",
    applicableMarkets: ["A股", "美股", "港股", "期货", "加密货币"],
    triggerKeywords: ["MACD策略", "金叉", "死叉", "趋势跟踪"],
  },
  {
    id: "kdj-macd-combo",
    name: "KDJ + MACD Combined Strategy",
    nameZh: "KDJ + MACD 组合策略",
    type: "trend",
    description:
      "结合 KDJ 和 MACD 两个指标，通过双重确认减少假信号，提高信号可靠性。",
    coreLogic:
      "买入条件：KDJ 金叉（K 上穿 D）且 MACD 金叉（DIF 上穿 DEA）同时成立；卖出条件：KDJ 死叉且 MACD 死叉同时成立。双重确认显著降低假信号率。",
    applicableMarkets: ["A股", "美股", "港股"],
    triggerKeywords: ["KDJ", "MACD", "组合策略", "双重确认"],
  },
  {
    id: "high-growth-factor",
    name: "High Growth Factor Strategy",
    nameZh: "高增长因子选股策略",
    type: "fundamental",
    description:
      "筛选 EPS 增长率、营业收入增长率、净利润增长率均高于市场中位数，且 PEG < 1 的高增长股票。",
    coreLogic:
      "三年 EPS 增长率 > 市场中位数 + 三年营业收入增长率 > 市场中位数 + 所有增长率为正 + 当年 PEG < 1。每年末重新筛选持仓，等权重配置。",
    applicableMarkets: ["A股"],
    triggerKeywords: ["高增长", "EPS增长", "PEG", "成长股", "因子选股"],
  },
  {
    id: "multi-factor-model",
    name: "Multi-Factor Model",
    nameZh: "多因子模型",
    type: "multi_factor",
    description:
      "综合价值因子（PE/PB/PS）、质量因子（ROIC/ROE/FCF）、动量因子（12-1月动量）、成长因子（营收/利润增速）构建综合评分体系。",
    coreLogic:
      "对每个因子进行行业中性化处理，Z-score 标准化后加权合成综合得分。选取综合得分前 20% 的股票等权重持仓，每月或每季度调仓。",
    applicableMarkets: ["A股", "美股"],
    triggerKeywords: ["多因子", "因子模型", "价值因子", "质量因子", "动量因子", "量化选股"],
  },
  {
    id: "rsrs-timing",
    name: "RSRS Market Timing Strategy",
    nameZh: "RSRS 择时策略",
    type: "momentum",
    description:
      "基于 RSRS 指标进行大盘择时，判断市场整体多空状态，决定是否持仓。",
    coreLogic:
      "计算沪深300指数的标准化 RSRS。当标准化 RSRS > 0.7 时持有指数基金；当标准化 RSRS < -0.7 时空仓或持有债券。通过择时减少大熊市的回撤。",
    applicableMarkets: ["A股"],
    triggerKeywords: ["RSRS", "择时", "大盘", "沪深300", "仓位管理"],
  },
];

/**
 * 根据查询关键词检索相关因子
 */
export function findRelevantFactors(query: string, maxResults = 3): QuantFactor[] {
  const queryLower = query.toLowerCase();
  const scored = QUANT_FACTORS.map((factor) => {
    let score = 0;
    for (const kw of factor.triggerKeywords) {
      if (queryLower.includes(kw.toLowerCase())) score += 2;
    }
    if (queryLower.includes(factor.nameZh.toLowerCase())) score += 5;
    if (queryLower.includes(factor.name.toLowerCase())) score += 5;
    return { factor, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.factor);
}

/**
 * 根据查询关键词检索相关策略
 */
export function findRelevantStrategies(query: string, maxResults = 2): QuantStrategy[] {
  const queryLower = query.toLowerCase();
  const scored = QUANT_STRATEGIES.map((strategy) => {
    let score = 0;
    for (const kw of strategy.triggerKeywords) {
      if (queryLower.includes(kw.toLowerCase())) score += 2;
    }
    if (queryLower.includes(strategy.nameZh.toLowerCase())) score += 5;
    return { strategy, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.strategy);
}

/**
 * 生成量化因子上下文块（注入 AI 分析）
 */
export function buildQuantContextBlock(query: string): string {
  const factors = findRelevantFactors(query, 3);
  const strategies = findRelevantStrategies(query, 2);

  const parts: string[] = [];

  if (factors.length > 0) {
    const factorLines = factors.map(
      (f) =>
        `**${f.nameZh}（${f.name}）**\n` +
        `- 公式：${f.formula}\n` +
        `- 买入信号：${f.buySignal}\n` +
        `- 卖出信号：${f.sellSignal}\n` +
        `- 局限性：${f.limitations}`
    );
    parts.push(`### 📊 相关量化因子（来源：Qbot 因子库）\n\n${factorLines.join("\n\n")}`);
  }

  if (strategies.length > 0) {
    const strategyLines = strategies.map(
      (s) =>
        `**${s.nameZh}**：${s.description}\n> 核心逻辑：${s.coreLogic}`
    );
    parts.push(`### 🤖 相关量化策略（来源：Qbot 策略库）\n\n${strategyLines.join("\n\n")}`);
  }

  if (parts.length === 0) return "";
  return `\n\n---\n${parts.join("\n\n")}\n`;
}
