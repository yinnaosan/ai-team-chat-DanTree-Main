/**
 * World Monitor-style global financial radar
 * Inspired by koala73/worldmonitor (42.8k stars)
 * Cross-stream signal correlation for stocks, crypto, commodities, macro
 */

import { invokeLLM } from "./_core/llm";

export interface GlobalSignal {
  asset: string;
  assetType: "stock" | "crypto" | "commodity" | "forex" | "index" | "macro";
  signal: "bullish" | "bearish" | "neutral";
  strength: number;   // 0-100
  correlation: number; // -100 to 100, correlation with target ticker
  reason: string;
  dataPoint?: string;  // e.g., "BTC +5.2%", "VIX 28.3"
}

export interface CrossStreamAnalysis {
  ticker: string;
  timestamp: string;
  globalSignals: GlobalSignal[];
  correlationMatrix: {
    asset: string;
    correlation: number;
    lagDays: number;
  }[];
  riskIndicators: {
    vixLevel: "low" | "elevated" | "high" | "extreme";
    creditSpread: "tight" | "normal" | "wide" | "distressed";
    dollarStrength: "weak" | "neutral" | "strong";
    yieldCurve: "normal" | "flat" | "inverted";
  };
  worldPulse: {
    usMarket: number;    // -100 to 100
    europeMarket: number;
    asiaMarket: number;
    emergingMarkets: number;
    cryptoMarket: number;
    commodities: number;
  };
  aiNarrative: string;
}

export async function runWorldMonitor(
  ticker: string,
  marketData: {
    vix?: number;
    sp500Change?: number;
    btcChange?: number;
    goldChange?: number;
    dxyChange?: number;
    yieldSpread?: number;
    sectorPerformance?: Record<string, number>;
    relatedTickers?: Array<{ symbol: string; change: number }>;
  }
): Promise<CrossStreamAnalysis> {
  const contextLines: string[] = [];

  if (marketData.vix !== undefined) contextLines.push(`VIX 恐慌指数: ${marketData.vix.toFixed(1)}`);
  if (marketData.sp500Change !== undefined) contextLines.push(`S&P 500 日涨跌: ${marketData.sp500Change.toFixed(2)}%`);
  if (marketData.btcChange !== undefined) contextLines.push(`BTC 日涨跌: ${marketData.btcChange.toFixed(2)}%`);
  if (marketData.goldChange !== undefined) contextLines.push(`黄金日涨跌: ${marketData.goldChange.toFixed(2)}%`);
  if (marketData.dxyChange !== undefined) contextLines.push(`美元指数(DXY)日涨跌: ${marketData.dxyChange.toFixed(2)}%`);
  if (marketData.yieldSpread !== undefined) contextLines.push(`10Y-2Y 利差: ${marketData.yieldSpread.toFixed(2)}%`);

  if (marketData.sectorPerformance) {
    const sectors = Object.entries(marketData.sectorPerformance)
      .map(([k, v]) => `${k}: ${v.toFixed(1)}%`)
      .join(", ");
    contextLines.push(`板块表现: ${sectors}`);
  }

  if (marketData.relatedTickers && marketData.relatedTickers.length > 0) {
    const related = marketData.relatedTickers
      .map((t) => `${t.symbol}: ${t.change.toFixed(1)}%`)
      .join(", ");
    contextLines.push(`相关股票: ${related}`);
  }

  const contextText = contextLines.length > 0
    ? contextLines.join("\n")
    : "暂无实时市场数据，请基于通用市场知识进行分析。";

  const prompt = `你是 World Monitor 全球金融雷达系统，专注于跨资产类别的信号关联分析。

目标股票: ${ticker}
当前市场数据:
${contextText}

请分析全球市场信号对 ${ticker} 的影响，返回严格 JSON 格式：
{
  "globalSignals": [
    {
      "asset": "资产名称",
      "assetType": "stock|crypto|commodity|forex|index|macro",
      "signal": "bullish|bearish|neutral",
      "strength": 0-100整数,
      "correlation": -100到100整数（与${ticker}的相关性）,
      "reason": "信号原因（中文，15字以内）",
      "dataPoint": "具体数据点（如 VIX 28.3）"
    }
  ],
  "correlationMatrix": [
    { "asset": "资产名称", "correlation": -100到100整数, "lagDays": 0-5整数 }
  ],
  "riskIndicators": {
    "vixLevel": "low|elevated|high|extreme",
    "creditSpread": "tight|normal|wide|distressed",
    "dollarStrength": "weak|neutral|strong",
    "yieldCurve": "normal|flat|inverted"
  },
  "worldPulse": {
    "usMarket": -100到100整数,
    "europeMarket": -100到100整数,
    "asiaMarket": -100到100整数,
    "emergingMarkets": -100到100整数,
    "cryptoMarket": -100到100整数,
    "commodities": -100到100整数
  },
  "aiNarrative": "全球市场脉搏叙事（中文，60字以内）"
}

要求：
1. globalSignals 返回 6-10 个最相关的跨资产信号
2. correlationMatrix 返回 4-6 个关键相关资产
3. 基于提供的实际数据进行分析，无数据时使用通用知识`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是专业全球宏观分析师，只返回合法 JSON。" },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "world_monitor_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              globalSignals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    asset: { type: "string" },
                    assetType: { type: "string", enum: ["stock", "crypto", "commodity", "forex", "index", "macro"] },
                    signal: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                    strength: { type: "number" },
                    correlation: { type: "number" },
                    reason: { type: "string" },
                    dataPoint: { type: "string" },
                  },
                  required: ["asset", "assetType", "signal", "strength", "correlation", "reason", "dataPoint"],
                  additionalProperties: false,
                },
              },
              correlationMatrix: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    asset: { type: "string" },
                    correlation: { type: "number" },
                    lagDays: { type: "number" },
                  },
                  required: ["asset", "correlation", "lagDays"],
                  additionalProperties: false,
                },
              },
              riskIndicators: {
                type: "object",
                properties: {
                  vixLevel: { type: "string", enum: ["low", "elevated", "high", "extreme"] },
                  creditSpread: { type: "string", enum: ["tight", "normal", "wide", "distressed"] },
                  dollarStrength: { type: "string", enum: ["weak", "neutral", "strong"] },
                  yieldCurve: { type: "string", enum: ["normal", "flat", "inverted"] },
                },
                required: ["vixLevel", "creditSpread", "dollarStrength", "yieldCurve"],
                additionalProperties: false,
              },
              worldPulse: {
                type: "object",
                properties: {
                  usMarket: { type: "number" },
                  europeMarket: { type: "number" },
                  asiaMarket: { type: "number" },
                  emergingMarkets: { type: "number" },
                  cryptoMarket: { type: "number" },
                  commodities: { type: "number" },
                },
                required: ["usMarket", "europeMarket", "asiaMarket", "emergingMarkets", "cryptoMarket", "commodities"],
                additionalProperties: false,
              },
              aiNarrative: { type: "string" },
            },
            required: ["globalSignals", "correlationMatrix", "riskIndicators", "worldPulse", "aiNarrative"],
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
      timestamp: new Date().toISOString(),
      ...parsed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Return fallback with basic structure
    return {
      ticker,
      timestamp: new Date().toISOString(),
      globalSignals: [],
      correlationMatrix: [],
      riskIndicators: {
        vixLevel: marketData.vix
          ? marketData.vix < 15 ? "low" : marketData.vix < 25 ? "elevated" : marketData.vix < 35 ? "high" : "extreme"
          : "elevated",
        creditSpread: "normal",
        dollarStrength: marketData.dxyChange !== undefined
          ? marketData.dxyChange > 0.5 ? "strong" : marketData.dxyChange < -0.5 ? "weak" : "neutral"
          : "neutral",
        yieldCurve: marketData.yieldSpread !== undefined
          ? marketData.yieldSpread < 0 ? "inverted" : marketData.yieldSpread < 0.5 ? "flat" : "normal"
          : "normal",
      },
      worldPulse: {
        usMarket: Math.round((marketData.sp500Change ?? 0) * 10),
        europeMarket: 0,
        asiaMarket: 0,
        emergingMarkets: 0,
        cryptoMarket: Math.round((marketData.btcChange ?? 0) * 5),
        commodities: Math.round((marketData.goldChange ?? 0) * 10),
      },
      aiNarrative: `World Monitor 分析暂时不可用 (${msg.slice(0, 50)})`,
    };
  }
}
