/**
 * TrendRadar-style hot topic aggregation and AI filtering
 * Inspired by sansan0/TrendRadar (49.6k stars)
 * Uses existing news APIs + LLM to provide intelligent topic radar
 */

import { invokeLLM } from "./_core/llm";

export interface TrendItem {
  title: string;
  source: string;
  url?: string;
  publishedAt?: string;
  relevanceScore: number;   // 0-100, AI-assessed relevance to ticker
  sentimentScore: number;   // -100 to 100
  category: "earnings" | "macro" | "sector" | "regulatory" | "technical" | "other";
  impact: "high" | "medium" | "low";
  summary: string;
}

export interface TrendRadarResult {
  ticker: string;
  scanTime: string;
  hotTopics: TrendItem[];
  marketPulse: {
    overallSentiment: number;   // -100 to 100
    momentumSignal: "bullish" | "bearish" | "neutral";
    keyRisks: string[];
    keyOpportunities: string[];
    watchlist: string[];        // Related tickers to watch
  };
  aiSummary: string;
}

export async function runTrendRadar(
  ticker: string,
  newsItems: Array<{ title: string; description?: string; source?: string; url?: string; publishedAt?: string }>,
  maxItems: number = 8
): Promise<TrendRadarResult> {
  if (!newsItems || newsItems.length === 0) {
    return {
      ticker,
      scanTime: new Date().toISOString(),
      hotTopics: [],
      marketPulse: {
        overallSentiment: 0,
        momentumSignal: "neutral",
        keyRisks: ["暂无新闻数据"],
        keyOpportunities: [],
        watchlist: [],
      },
      aiSummary: "暂无足够新闻数据进行热点分析。",
    };
  }

  const newsText = newsItems
    .slice(0, 20)
    .map((n, i) => `[${i + 1}] ${n.title}${n.description ? ` — ${n.description.slice(0, 100)}` : ""} (来源: ${n.source ?? "未知"}, 时间: ${n.publishedAt ?? "未知"})`)
    .join("\n");

  const prompt = `你是一个专业的金融市场情报分析师，参考 TrendRadar 热点雷达系统的分析框架。

股票代码: ${ticker}
新闻列表:
${newsText}

请对以上新闻进行智能分析，返回严格的 JSON 格式：
{
  "hotTopics": [
    {
      "title": "新闻标题（精简版）",
      "source": "来源",
      "relevanceScore": 0-100的整数（与${ticker}的相关度）,
      "sentimentScore": -100到100的整数（负=利空，正=利好）,
      "category": "earnings|macro|sector|regulatory|technical|other",
      "impact": "high|medium|low",
      "summary": "一句话核心影响分析（中文，20字以内）"
    }
  ],
  "marketPulse": {
    "overallSentiment": -100到100的整数,
    "momentumSignal": "bullish|bearish|neutral",
    "keyRisks": ["风险1", "风险2"],
    "keyOpportunities": ["机会1", "机会2"],
    "watchlist": ["相关股票代码1", "相关股票代码2"]
  },
  "aiSummary": "综合市场脉搏分析（中文，50字以内）"
}

要求：
1. hotTopics 最多返回 ${maxItems} 条，按 relevanceScore 降序排列
2. 只保留与 ${ticker} 高度相关的新闻（relevanceScore >= 40）
3. JSON 必须合法，不要包含注释`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是专业金融分析师，只返回合法 JSON，不包含任何额外文字。" },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "trend_radar_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              hotTopics: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    source: { type: "string" },
                    relevanceScore: { type: "number" },
                    sentimentScore: { type: "number" },
                    category: { type: "string", enum: ["earnings", "macro", "sector", "regulatory", "technical", "other"] },
                    impact: { type: "string", enum: ["high", "medium", "low"] },
                    summary: { type: "string" },
                  },
                  required: ["title", "source", "relevanceScore", "sentimentScore", "category", "impact", "summary"],
                  additionalProperties: false,
                },
              },
              marketPulse: {
                type: "object",
                properties: {
                  overallSentiment: { type: "number" },
                  momentumSignal: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                  keyRisks: { type: "array", items: { type: "string" } },
                  keyOpportunities: { type: "array", items: { type: "string" } },
                  watchlist: { type: "array", items: { type: "string" } },
                },
                required: ["overallSentiment", "momentumSignal", "keyRisks", "keyOpportunities", "watchlist"],
                additionalProperties: false,
              },
              aiSummary: { type: "string" },
            },
            required: ["hotTopics", "marketPulse", "aiSummary"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned empty response");

    const parsed = typeof content === "string" ? JSON.parse(content) : content;

    return {
      ticker,
      scanTime: new Date().toISOString(),
      hotTopics: parsed.hotTopics ?? [],
      marketPulse: parsed.marketPulse ?? {
        overallSentiment: 0,
        momentumSignal: "neutral",
        keyRisks: [],
        keyOpportunities: [],
        watchlist: [],
      },
      aiSummary: parsed.aiSummary ?? "",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ticker,
      scanTime: new Date().toISOString(),
      hotTopics: newsItems.slice(0, maxItems).map((n) => ({
        title: n.title,
        source: n.source ?? "未知",
        url: n.url,
        publishedAt: n.publishedAt,
        relevanceScore: 50,
        sentimentScore: 0,
        category: "other" as const,
        impact: "medium" as const,
        summary: "AI 分析暂时不可用",
      })),
      marketPulse: {
        overallSentiment: 0,
        momentumSignal: "neutral",
        keyRisks: [`AI 分析失败: ${msg}`],
        keyOpportunities: [],
        watchlist: [],
      },
      aiSummary: "AI 热点分析暂时不可用，显示原始新闻数据。",
    };
  }
}
