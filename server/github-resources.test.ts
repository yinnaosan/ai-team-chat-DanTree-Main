/**
 * github-resources.test.ts
 * 测试 hacker-laws 定律库、Qbot 量化因子库、中文财经新闻源三个模块
 */

import { describe, it, expect } from "vitest";
import {
  buildLawsContextBlock,
  getAllLawsSummary,
  findRelevantLaws,
  INVESTMENT_LAWS,
} from "./hackerLawsKnowledge";
import {
  buildQuantContextBlock,
  findRelevantFactors,
  QUANT_FACTORS,
  QUANT_STRATEGIES,
} from "./quantFactorKnowledge";
import {
  isCnFinanceNewsRelevant,
  formatCnNewsToMarkdown,
  checkCnFinanceNewsHealth,
  type CnNewsAggregateResult,
} from "./cnFinanceNewsApi";

// ─── hacker-laws 定律库测试 ─────────────────────────────────────────────────

describe("hackerLawsKnowledge", () => {
  it("INVESTMENT_LAWS 应包含至少 20 条定律", () => {
    expect(INVESTMENT_LAWS.length).toBeGreaterThanOrEqual(20);
  });

  it("每条定律应有 id、name、summary、investmentApplication 字段", () => {
    for (const law of INVESTMENT_LAWS) {
      expect(law.id).toBeTruthy();
      expect(law.name).toBeTruthy();
      expect(law.summary).toBeTruthy();
      expect(law.investmentApplication).toBeTruthy();
    }
  });

  it("帕累托法则应在定律库中", () => {
    const pareto = INVESTMENT_LAWS.find(l => l.id === "pareto-principle");
    expect(pareto).toBeDefined();
    expect(pareto?.nameZh).toContain("帕累托");
  });

  it("炒作周期应在定律库中", () => {
    const hype = INVESTMENT_LAWS.find(l => l.id === "hype-cycle");
    expect(hype).toBeDefined();
  });

  it("findRelevantLaws 应对技术分析查询返回相关定律", () => {
    // 使用能实际触发定律的关键词："泡沫" 触发炸作周期，"集中度" 触发帕累托
    const laws = findRelevantLaws("AI 技术泡沫 投资情绪");
    expect(laws.length).toBeGreaterThan(0);
  });

  it("findRelevantLaws 应对集中度查询返回相关定律", () => {
    const laws = findRelevantLaws("收入集中度 主要客户 80/20");
    expect(laws.length).toBeGreaterThan(0);
  });

  it("buildLawsContextBlock 对相关查询应返回非空字符串", () => {
    const block = buildLawsContextBlock("AI 人工智能 泡沫 估値 投资情绪");
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("定律");
  });

  it("buildLawsContextBlock 对无关查询应返回空字符串", () => {
    const block = buildLawsContextBlock("今天天气怎么样");
    expect(block).toBe("");
  });

  it("getAllLawsSummary 应返回所有定律的摘要", () => {
    const summary = getAllLawsSummary();
    expect(Array.isArray(summary)).toBe(true);
    expect(summary.length).toBeGreaterThan(0);
    const names = summary.map(s => s.nameZh).join("");
    expect(names).toContain("帕累托");
  });
});

// ─── Qbot 量化因子库测试 ────────────────────────────────────────────────────

describe("quantFactorKnowledge", () => {
  it("QUANT_FACTORS 应包含至少 8 个因子", () => {
    expect(QUANT_FACTORS.length).toBeGreaterThanOrEqual(8);
  });

  it("QUANT_STRATEGIES 应包含至少 4 个策略", () => {
    expect(QUANT_STRATEGIES.length).toBeGreaterThanOrEqual(4);
  });

  it("每个因子应有 id、name、category、formula、signalInterpretation 字段", () => {
    for (const factor of QUANT_FACTORS) {
      expect(factor.id).toBeTruthy();
      expect(factor.name).toBeTruthy();
      expect(factor.category).toBeTruthy();
      expect(factor.formula).toBeTruthy();
      expect(factor.signalInterpretation).toBeTruthy();
    }
  });

  it("MACD 因子应在因子库中", () => {
    const macd = QUANT_FACTORS.find(f => f.id === "macd");
    expect(macd).toBeDefined();
    expect(macd?.name).toContain("MACD");
  });

  it("RSI 因子应在因子库中", () => {
    const rsi = QUANT_FACTORS.find(f => f.id === "rsi");
    expect(rsi).toBeDefined();
  });

  it("RSRS 因子应在因子库中", () => {
    const rsrs = QUANT_FACTORS.find(f => f.id === "rsrs");
    expect(rsrs).toBeDefined();
  });

  it("findRelevantFactors 对技术分析查询应返回相关因子", () => {
    const factors = findRelevantFactors("MACD 技术分析 RSI 信号 布林带");
    expect(factors.length).toBeGreaterThan(0);
    const ids = factors.map(f => f.id);
    expect(ids).toContain("macd");
  });

  it("findRelevantFactors 对价値投资查询应返回基本面因子", () => {
    const factors = findRelevantFactors("价値投资 ROE ROIC 自由现金流");
    expect(factors.length).toBeGreaterThan(0);
  });

  it("buildQuantContextBlock 对技术分析查询应返回非空字符串", () => {
    const block = buildQuantContextBlock("MACD 金叉 RSI 超卖 技术分析");
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("量化");
  });

  it("buildQuantContextBlock 对无关查询应返回空字符串", () => {
    const block = buildQuantContextBlock("今天天气怎么样");
    expect(block).toBe("");
  });
});

// ─── 中文财经新闻源测试 ─────────────────────────────────────────────────────

describe("cnFinanceNewsApi", () => {
  it("isCnFinanceNewsRelevant 对 A 股查询应返回 true", () => {
    expect(isCnFinanceNewsRelevant("A股市场今天走势")).toBe(true);
    expect(isCnFinanceNewsRelevant("沪深300指数分析")).toBe(true);
    expect(isCnFinanceNewsRelevant("茅台股价")).toBe(true);
    expect(isCnFinanceNewsRelevant("港股恒生指数")).toBe(true);
  });

  it("isCnFinanceNewsRelevant 对非 A 股查询应返回 false", () => {
    expect(isCnFinanceNewsRelevant("Apple quarterly earnings")).toBe(false);
    expect(isCnFinanceNewsRelevant("S&P 500 analysis")).toBe(false);
    expect(isCnFinanceNewsRelevant("Bitcoin price today")).toBe(false);
  });

  it("formatCnNewsToMarkdown 对空结果应返回空字符串", () => {
    const emptyResult: CnNewsAggregateResult = {
      wallstreetcn: { source: "华尔街见闻", items: [], fetchedAt: Date.now() },
      jin10: { source: "金十数据", items: [], fetchedAt: Date.now() },
      gelonghui: { source: "格隆汇", items: [], fetchedAt: Date.now() },
      xueqiu: { source: "雪球热股", items: [], fetchedAt: Date.now() },
      totalItems: 0,
      fetchedAt: Date.now(),
    };
    const result = formatCnNewsToMarkdown(emptyResult, "A股分析");
    expect(result).toBe("");
  });

  it("formatCnNewsToMarkdown 对有数据结果应返回包含来源标题的字符串", () => {
    const mockResult: CnNewsAggregateResult = {
      wallstreetcn: {
        source: "华尔街见闻",
        items: [
          {
            id: "1",
            title: "美联储维持利率不变",
            url: "https://wallstreetcn.com/articles/1",
            source: "华尔街见闻",
            publishedAt: Date.now(),
          },
        ],
        fetchedAt: Date.now(),
      },
      jin10: { source: "金十数据", items: [], fetchedAt: Date.now() },
      gelonghui: { source: "格隆汇", items: [], fetchedAt: Date.now() },
      xueqiu: { source: "雪球热股", items: [], fetchedAt: Date.now() },
      totalItems: 1,
      fetchedAt: Date.now(),
    };
    const result = formatCnNewsToMarkdown(mockResult, "A股分析");
    expect(result).toContain("华尔街见闻");
    expect(result).toContain("美联储维持利率不变");
  });

  it("checkCnFinanceNewsHealth 应在超时内返回结果", { timeout: 15000 }, async () => {
    const result = await checkCnFinanceNewsHealth();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("latencyMs");
    expect(result).toHaveProperty("status");
    expect(typeof result.latencyMs).toBe("number");
  });
});
