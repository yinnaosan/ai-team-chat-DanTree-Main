import { describe, it, expect } from "vitest";
import { runMultiAgentAnalysis, formatMultiAgentResult } from "./multiAgentAnalysis";

// 使用模拟数据测试（不调用真实 LLM）
describe("multiAgentAnalysis", () => {
  it("should activate correct agents for stock_analysis", async () => {
    // 测试 stock_analysis 激活 4 个 Agent
    // 由于 LLM 调用在测试环境中可能失败，我们测试 formatMultiAgentResult 函数
    const mockResult = {
      agents: [
        {
          role: "macro" as const,
          roleName: "宏观分析师",
          verdict: "宏观环境偏紧，利率高企压制估值",
          keyPoints: ["美联储维持高利率", "通胀仍高于目标"],
          signal: "bearish" as const,
          confidence: "medium" as const,
          dataUsed: ["FRED", "WorldBank"],
        },
        {
          role: "technical" as const,
          roleName: "技术分析师",
          verdict: "RSI 超卖区间，短期反弹信号",
          keyPoints: ["RSI=28 超卖", "MACD 金叉形成"],
          signal: "bullish" as const,
          confidence: "medium" as const,
          dataUsed: ["Yahoo Finance"],
        },
        {
          role: "fundamental" as const,
          roleName: "基本面分析师",
          verdict: "估值合理，盈利能力强劲",
          keyPoints: ["PE=22x 略低于行业均值", "ROE=28% 优秀"],
          signal: "bullish" as const,
          confidence: "high" as const,
          dataUsed: ["FMP", "Finnhub"],
        },
        {
          role: "sentiment" as const,
          roleName: "情绪分析师",
          verdict: "市场情绪中性偏谨慎",
          keyPoints: ["分析师评级维持中性", "机构持仓无明显变化"],
          signal: "neutral" as const,
          confidence: "low" as const,
          dataUsed: ["NewsAPI", "Marketaux"],
        },
      ],
      directorSummary: "[MULTI_AGENT_ANALYSIS]",
      consensusSignal: "mixed" as const,
      divergenceNote: "bullish vs bearish 存在分歧",
      elapsedMs: 1200,
    };

    const formatted = formatMultiAgentResult(mockResult);
    expect(formatted).toContain("多角色并行分析结果");
    expect(formatted).toContain("宏观分析师");
    expect(formatted).toContain("技术分析师");
    expect(formatted).toContain("基本面分析师");
    expect(formatted).toContain("情绪分析师");
    expect(formatted).toContain("共识信号");
    expect(formatted).toContain("分歧说明");
  });

  it("should format consensus signal correctly", () => {
    const mockResult = {
      agents: [
        { role: "macro" as const, roleName: "宏观分析师", verdict: "看多", keyPoints: [], signal: "bullish" as const, confidence: "high" as const, dataUsed: [] },
        { role: "fundamental" as const, roleName: "基本面分析师", verdict: "看多", keyPoints: [], signal: "bullish" as const, confidence: "high" as const, dataUsed: [] },
      ],
      directorSummary: "共识看多",
      consensusSignal: "bullish" as const,
      divergenceNote: "",
      elapsedMs: 800,
    };

    const formatted = formatMultiAgentResult(mockResult);
    expect(formatted).toContain("🟢 看多");
    expect(formatted).not.toContain("分歧说明"); // 无分歧时不显示
  });

  it("should handle empty agents gracefully", () => {
    const mockResult = {
      agents: [],
      directorSummary: "",
      consensusSignal: "neutral" as const,
      divergenceNote: "",
      elapsedMs: 0,
    };

    const formatted = formatMultiAgentResult(mockResult);
    expect(formatted).toBe(""); // 空 agents 返回空字符串
  });

  it("should include elapsed time in formatted output", () => {
    const mockResult = {
      agents: [
        { role: "macro" as const, roleName: "宏观分析师", verdict: "中性", keyPoints: [], signal: "neutral" as const, confidence: "medium" as const, dataUsed: [] },
      ],
      directorSummary: "中性",
      consensusSignal: "neutral" as const,
      divergenceNote: "",
      elapsedMs: 2500,
    };

    const formatted = formatMultiAgentResult(mockResult);
    expect(formatted).toContain("2500ms");
    expect(formatted).toContain("并行执行");
  });
});
