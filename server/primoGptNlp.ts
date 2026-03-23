/**
 * primoGptNlp.ts
 * PrimoGPT 风格的 NLP 情绪特征提取管道
 * 参考: ivebotunac/PrimoGPT - LLM + FinBERT 情绪分析架构
 *
 * 核心功能：
 * 1. 结构化情绪极性评分（-1 到 +1）
 * 2. 关键实体识别（公司、人物、事件）
 * 3. 情绪趋势分析（新闻时间序列）
 * 4. 市场影响因子提取
 */
import { invokeLLM } from "./_core/llm";

export interface NewsItem {
  title: string;
  description?: string;
  publishedAt: string;
  source?: string;
}

export interface SentimentFeature {
  score: number;          // -1 (极度悲观) 到 +1 (极度乐观)
  label: "very_bullish" | "bullish" | "neutral" | "bearish" | "very_bearish";
  confidence: number;     // 0-1
  entities: {
    companies: string[];
    people: string[];
    events: string[];
  };
  catalysts: string[];    // 短期催化剂
  risks: string[];        // 风险因素
  keywords: string[];     // 高频关键词
}

export interface SentimentTimeSeries {
  date: string;
  score: number;
  label: string;
  articleCount: number;
  topHeadline: string;
}

export interface NLPAnalysisResult {
  ticker: string;
  overallScore: number;         // 综合情绪分 -1 到 +1
  overallLabel: string;
  features: SentimentFeature[];
  timeSeries: SentimentTimeSeries[];
  summary: string;
  bullishSignals: string[];
  bearishSignals: string[];
  sentimentMomentum: "improving" | "deteriorating" | "stable";
  analysisTimestamp: number;
}

/**
 * 单条新闻情绪评分（FinBERT 风格的 LLM 替代）
 */
async function scoreSingleNews(news: NewsItem): Promise<SentimentFeature> {
  const text = `${news.title}. ${news.description ?? ""}`.slice(0, 500);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `你是专业的金融情绪分析模型（类 FinBERT）。
对给定的金融新闻文本进行情绪分析，输出严格 JSON：
{
  "score": <-1到+1的浮点数，-1=极度悲观，0=中性，+1=极度乐观>,
  "label": <"very_bullish"|"bullish"|"neutral"|"bearish"|"very_bearish">,
  "confidence": <0到1的置信度>,
  "entities": {
    "companies": [<公司名列表>],
    "people": [<人物名列表>],
    "events": [<事件类型列表，如"earnings","merger","lawsuit">]
  },
  "catalysts": [<短期正面催化剂，最多3个>],
  "risks": [<风险因素，最多3个>],
  "keywords": [<高频金融关键词，最多5个>]
}`,
      },
      { role: "user", content: `分析以下金融新闻：\n${text}` },
    ],
    maxTokens: 300,
    response_format: { type: "json_object" } as any,
  });

  const raw = response.choices[0]?.message?.content;
  const content = typeof raw === "string" ? raw : "{}";
  try {
    return JSON.parse(content) as SentimentFeature;
  } catch {
    return {
      score: 0,
      label: "neutral",
      confidence: 0.5,
      entities: { companies: [], people: [], events: [] },
      catalysts: [],
      risks: [],
      keywords: [],
    };
  }
}

/**
 * 批量新闻情绪分析（PrimoGPT 核心管道）
 */
export async function analyzeNewsSentiment(
  ticker: string,
  newsItems: NewsItem[],
): Promise<NLPAnalysisResult> {
  if (newsItems.length === 0) {
    return {
      ticker,
      overallScore: 0,
      overallLabel: "neutral",
      features: [],
      timeSeries: [],
      summary: "无新闻数据",
      bullishSignals: [],
      bearishSignals: [],
      sentimentMomentum: "stable",
      analysisTimestamp: Date.now(),
    };
  }

  // 限制分析数量（最多 15 条，节约算力）
  const limitedNews = newsItems.slice(0, 15);

  // 并行分析每条新闻（最多 5 条并行，避免 rate limit）
  const batchSize = 5;
  const features: SentimentFeature[] = [];
  for (let i = 0; i < limitedNews.length; i += batchSize) {
    const batch = limitedNews.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(n => scoreSingleNews(n)));
    features.push(...batchResults);
  }

  // 计算综合情绪分（加权平均，置信度为权重）
  const totalWeight = features.reduce((sum, f) => sum + f.confidence, 0);
  const overallScore = totalWeight > 0
    ? features.reduce((sum, f) => sum + f.score * f.confidence, 0) / totalWeight
    : 0;

  // 生成时间序列（按日期分组）
  const dateGroups = new Map<string, { scores: number[]; headlines: string[] }>();
  limitedNews.forEach((news, i) => {
    const date = news.publishedAt.split("T")[0];
    if (!dateGroups.has(date)) dateGroups.set(date, { scores: [], headlines: [] });
    const group = dateGroups.get(date)!;
    group.scores.push(features[i]?.score ?? 0);
    group.headlines.push(news.title);
  });

  const timeSeries: SentimentTimeSeries[] = Array.from(dateGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { scores, headlines }]) => {
      const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
      const label = avgScore > 0.3 ? "bullish" : avgScore < -0.3 ? "bearish" : "neutral";
      return {
        date,
        score: Math.round(avgScore * 100) / 100,
        label,
        articleCount: scores.length,
        topHeadline: headlines[0],
      };
    });

  // 情绪动量（最近 3 天 vs 之前）
  let sentimentMomentum: "improving" | "deteriorating" | "stable" = "stable";
  if (timeSeries.length >= 4) {
    const recent = timeSeries.slice(-3).reduce((s, t) => s + t.score, 0) / 3;
    const older = timeSeries.slice(0, -3).reduce((s, t) => s + t.score, 0) / Math.max(timeSeries.length - 3, 1);
    if (recent - older > 0.1) sentimentMomentum = "improving";
    else if (older - recent > 0.1) sentimentMomentum = "deteriorating";
  }

  // 汇总看多/看空信号
  const bullishSignals = features.flatMap(f => f.catalysts).filter(Boolean).slice(0, 5);
  const bearishSignals = features.flatMap(f => f.risks).filter(Boolean).slice(0, 5);

  // 综合标签
  const overallLabel = overallScore > 0.5 ? "very_bullish"
    : overallScore > 0.15 ? "bullish"
    : overallScore < -0.5 ? "very_bearish"
    : overallScore < -0.15 ? "bearish"
    : "neutral";

  // 生成摘要
  const summary = await generateSentimentSummary(ticker, overallScore, bullishSignals, bearishSignals, timeSeries);

  return {
    ticker,
    overallScore: Math.round(overallScore * 100) / 100,
    overallLabel,
    features,
    timeSeries,
    summary,
    bullishSignals,
    bearishSignals,
    sentimentMomentum,
    analysisTimestamp: Date.now(),
  };
}

/**
 * 生成情绪分析摘要（PrimoGPT 综合报告）
 */
async function generateSentimentSummary(
  ticker: string,
  score: number,
  bullish: string[],
  bearish: string[],
  ts: SentimentTimeSeries[],
): Promise<string> {
  const trendDesc = ts.length >= 2
    ? `情绪趋势：${ts[0].date} 到 ${ts[ts.length - 1].date}，共 ${ts.length} 个交易日`
    : "数据点不足";

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "你是专业的金融情绪分析报告撰写员。用简洁专业的中文输出 2-3 句话的情绪摘要。",
      },
      {
        role: "user",
        content: `${ticker} 综合情绪分：${score.toFixed(2)}（-1到+1）
${trendDesc}
看多信号：${bullish.slice(0, 3).join("；") || "无"}
看空信号：${bearish.slice(0, 3).join("；") || "无"}
请生成简洁的情绪分析摘要。`,
      },
    ],
    maxTokens: 150,
  });

  const raw = response.choices[0]?.message?.content;
  return (typeof raw === "string" ? raw : null) ?? `${ticker} 综合情绪评分 ${score.toFixed(2)}，市场情绪${score > 0 ? "偏正面" : score < 0 ? "偏负面" : "中性"}。`;
}
