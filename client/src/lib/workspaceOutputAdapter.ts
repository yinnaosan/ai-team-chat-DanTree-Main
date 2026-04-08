/**
 * workspaceOutputAdapter.ts — DanTree Workspace Output Refactor v1
 *
 * Adapter: raw assistant message content → WorkspaceOutputV1
 *
 * INPUT:
 *   content: string           — assistant message text (may contain %%MARKERS%%)
 *   answerObject?: object     — metadata.answerObject if present
 *   entity?: string           — current ticker
 *
 * OUTPUT:
 *   WorkspaceOutputV1         — typed view model for Discussion + Insights
 *
 * STRATEGY:
 *   1. Use existing parseFollowups + parseChartBlocks as transitional utilities
 *   2. Extract structured sections from markdown headings / markers
 *   3. Populate Insights from answerObject fields (bull_case, risks, etc.)
 *   4. Extract related names, key numbers, catalysts from narrative heuristics
 *   5. Always produce a safe fallback — never throw, never block rendering
 */

import {
  type WorkspaceOutputV1,
  type DiscussionBlock,
  type DiscussionViewModel,
  type InsightsViewModel,
  type InsightNowItem,
  type InsightMonitorItem,
  type InsightRelatedName,
  type InsightQuickFact,
  type InsightKeyLevel,
  emptyInsightsViewModel,
  emptyWorkspaceOutput,
} from "./WorkspaceOutputModel";

// ─────────────────────────────────────────────────────────────────────────────
// Re-export parse helpers (preserved, not replaced)
// ─────────────────────────────────────────────────────────────────────────────

export function parseFollowups(content: string): { cleanContent: string; followups: string[] } {
  const followups: string[] = [];
  const stripped = content
    .replace(/%%DELIVERABLE%%[\s\S]*?%%END_DELIVERABLE%%/g, "")
    .replace(/%%DISCUSSION%%[\s\S]*?%%END_DISCUSSION%%/g, "")
    .replace(/%%DELIVERABLE%%[\s\S]*/g, "")
    .replace(/%%DISCUSSION%%[\s\S]*/g, "");
  const cleanContent = stripped.replace(/%%FOLLOWUP%%([ \S]*?)%%END%%/g, (_, q) => {
    const trimmed = q.trim();
    if (trimmed) followups.push(trimmed);
    return "";
  }).trim();
  return { cleanContent, followups };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split content by markdown headings (## / ###) into named sections.
 * Returns map of { headingText → bodyText }
 */
function extractSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = text.split(/^#{1,3}\s+(.+)$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].trim().toLowerCase();
    const body = (parts[i + 1] ?? "").trim();
    if (body) sections.set(heading, body);
  }
  return sections;
}

/**
 * Split content by `---` separators into paragraphs.
 * GPT often uses `---` instead of markdown headings.
 */
function extractParagraphs(text: string): string[] {
  return text
    .split(/\n---+\n/)
    .map(p => p.trim())
    .filter(p => p.length > 30);
}

/** Extract bullet points from a text block */
function extractBullets(text: string): string[] {
  return text
    .split("\n")
    .map(l => l.replace(/^[-*•]\s+/, "").trim())
    .filter(l => l.length > 8);
}

/** Heuristic: find ticker-like tokens (1-5 uppercase letters) in text */
function extractTickers(text: string, exclude?: string): string[] {
  const matches = text.match(/\b([A-Z]{1,5})\b/g) ?? [];
  const common = new Set(["AI", "US", "GDP", "EPS", "PE", "YOY", "QOQ", "IPO", "ETF", "FED", "CPI", "PCE", "NFP", "AND", "THE", "FOR", "NOT", "BUT", "CEO", "CFO", "FCF", "RSI", "DCF", "FMP", "SEC"]);
  return Array.from(new Set(matches))
    .filter(t => !common.has(t) && t !== exclude)
    .slice(0, 6);
}

/** Heuristic: extract price-like patterns $NNN */
function extractPriceLevel(text: string, label: string): InsightKeyLevel | null {
  const m = text.match(/\$[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const color: InsightKeyLevel["color"] =
    label.includes("目标") || label.includes("target") ? "green"
    : label.includes("止损") || label.includes("stop") ? "red"
    : "neutral";
  return { label, value: m[0], color };
}

/** Extract a % number near a keyword */
function extractPct(text: string): string | null {
  const m = text.match(/([+-]?\d+(?:\.\d+)?%)/);
  return m ? m[1] : null;
}

/**
 * Extract sentences containing specific keywords from full text.
 * Works with both heading-based and paragraph-based content.
 */
function extractSentencesWithKeywords(text: string, keywords: string[]): string[] {
  // Split into sentences (Chinese + English)
  const sentences = text.split(/[。！？\n]/).map(s => s.trim()).filter(s => s.length > 15);
  const results: string[] = [];
  const lower = keywords.map(k => k.toLowerCase());
  
  for (const sentence of sentences) {
    const sl = sentence.toLowerCase();
    if (lower.some(k => sl.includes(k))) {
      // Clean up markdown formatting
      const clean = sentence
        .replace(/\*\*/g, "")
        .replace(/^[-*•]\s*/, "")
        .trim();
      if (clean.length > 15 && clean.length < 200) {
        results.push(clean);
      }
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section classifiers — determines which heading belongs where
// (mirrors Claude outputRoutingAdapter v1.6 classifiers)
// ─────────────────────────────────────────────────────────────────────────────

const IS_THESIS   = (k: string) => /thesis|核心|判断|结论|summary|verdict/.test(k);
const IS_DRIVER   = (k: string) => /driver|驱动|catalyst|bull|多头|reason|推理|关键/.test(k);
const IS_RISK     = (k: string) => /risk|风险|bear|空头|concern|threat|warning|监控|watch/.test(k);
const IS_INSIGHTS = (k: string) => /now|monitor|related|fact|news|新闻|相关|数据|levels|价位|催化/.test(k);
const IS_NARRATIVE = (k: string) => !IS_THESIS(k) && !IS_DRIVER(k) && !IS_RISK(k) && !IS_INSIGHTS(k);

// ─────────────────────────────────────────────────────────────────────────────
// Discussion adapter
// ─────────────────────────────────────────────────────────────────────────────

function buildDiscussionViewModel(
  cleanContent: string,
  followups: string[],
  chartBlocks: Array<{ type: string; raw?: string; text?: string; base64?: string }>,
  answerObject?: any,
  entity?: string
): DiscussionViewModel {
  const blocks: DiscussionBlock[] = [];
  const sections = extractSections(cleanContent);

  // ── Narrative blocks only (thesis/drivers/risks go to DecisionSpine, NOT here) ──
  // Step 1: sections classified as narrative
  let narrativeAdded = 0;
  for (const [key, body] of Array.from(sections.entries())) {
    if (narrativeAdded >= 4) break;
    if (!IS_NARRATIVE(key)) continue;
    if (body.length > 40) {
      blocks.push({ type: "narrative", content: body.slice(0, 800) });
      narrativeAdded++;
    }
  }

  // Step 2: fallback — no markdown headings found, extract pure narrative paragraphs
  // Aggressively skip thesis/driver/risk content using the same classifiers
  if (blocks.length === 0) {
    const thesisText = (answerObject?.verdict ?? "").slice(0, 60).toLowerCase();
    const driverTexts: string[] = (answerObject?.bull_case ?? []).concat(answerObject?.reasoning ?? [])
      .map((s: string) => s.slice(0, 40).toLowerCase());
    const riskTexts: string[] = (answerObject?.risks ?? []).map((r: any) => (r.description ?? "").slice(0, 40).toLowerCase());

    const allParas = cleanContent.split("\n\n").filter(p => p.trim().length > 30);
    for (const p of allParas.slice(0, 8)) {
      const pLow = p.trim().toLowerCase();
      // Skip if this paragraph IS the thesis
      if (thesisText && pLow.startsWith(thesisText.slice(0, 40))) continue;
      // Skip if it starts with a known driver text
      if (driverTexts.some(d => d && pLow.startsWith(d))) continue;
      // Skip if it starts with a known risk text
      if (riskTexts.some(r => r && pLow.startsWith(r))) continue;
      // Skip chart-like paragraphs
      if (p.includes("%%CHART%%") || p.includes("%%PYIMAGE%%")) continue;
      // Skip short verdict-like sentences (< 80 chars at position 0)
      if (p.trim().length < 80 && allParas.indexOf(p) === 0) continue;
      blocks.push({ type: "narrative", content: p.trim().slice(0, 800) });
      if (blocks.length >= 4) break;
    }
  }

  // 4. Chart blocks — %%CHART%% → InlineChart, %%PYIMAGE%% → PyImageChart
  for (const block of chartBlocks) {
    if (block.type === "chart" && block.raw) {
      blocks.push({ type: "chart", content: "", chartRaw: block.raw });
    } else if (block.type === "image_chart" && block.base64) {
      blocks.push({ type: "image_chart", content: "", chartBase64: block.base64 });
    }
  }

  // 5. Followups
  if (followups.length > 0) {
    blocks.push({ type: "followups", content: "", followups: followups.slice(0, 4) });
  }

  return {
    blocks,
    entity,
    isStructured: blocks.length > 1,
    // STRICT: rawFallback is NEVER set. Adapter failure → empty blocks → error state in UI.
    rawFallback: undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights adapter — ENHANCED heuristic (works with any GPT output format)
// ─────────────────────────────────────────────────────────────────────────────

function buildInsightsViewModel(
  content: string,
  answerObject?: any,
  entity?: string
): InsightsViewModel {
  const sections = extractSections(content);
  const insights = emptyInsightsViewModel();

  // ── NOW: positive signals ──────────────────────────────────────────────────
  // Priority 1: answerObject.bull_case
  // Priority 2: heading-based extraction
  // Priority 3: ENHANCED — full-text keyword extraction for positive signals
  const bullSection = Array.from(sections.entries()).find(([k]) =>
    k.includes("多头") || k.includes("bull") || k.includes("支撑") || k.includes("驱动")
  )?.[1] ?? "";

  const bullItems: string[] = answerObject?.bull_case?.length
    ? answerObject.bull_case
    : bullSection
      ? extractBullets(bullSection)
      : extractSentencesWithKeywords(content, [
          "利好", "驱动", "增长", "扩张", "加速", "支撑", "积极",
          "强劲", "利多", "上行", "突破", "创新高",
          "bullish", "positive", "growth", "catalyst", "upside"
        ]).slice(0, 4);

  insights.now = bullItems.slice(0, 3).map(text => ({
    text: text.replace(/\*\*/g, "").slice(0, 100),
    sub: answerObject?.bull_case?.length ? "多头证据" : "正面信号",
    sentiment: "positive" as const,
  }));

  // ── MONITOR: risks / triggers ──────────────────────────────────────────────
  // Priority 1: answerObject.risks
  // Priority 2: heading-based extraction
  // Priority 3: ENHANCED — full-text keyword extraction for risk signals
  const riskSection = Array.from(sections.entries()).find(([k]) =>
    k.includes("风险") || k.includes("risk") || k.includes("监控") || k.includes("watch")
  )?.[1] ?? "";

  if (answerObject?.risks?.length) {
    insights.monitor = answerObject.risks.slice(0, 3).map((r: any) => ({
      trigger: r.description?.slice(0, 60) ?? "",
      context: `风险 · ${r.magnitude ?? "medium"}`,
      urgency: (r.magnitude === "high" ? "high" : r.magnitude === "low" ? "low" : "medium") as InsightMonitorItem["urgency"],
    }));
  } else if (riskSection) {
    insights.monitor = extractBullets(riskSection).slice(0, 3).map(text => ({
      trigger: text.slice(0, 60),
      context: "监控项",
      urgency: "medium" as const,
    }));
  } else {
    // ENHANCED: extract risk signals from full text
    const riskSentences = extractSentencesWithKeywords(content, [
      "风险", "担忧", "下跌", "威胁", "警戒", "回落", "不确定",
      "卖出", "减持", "高估", "泡沫", "过热", "地缘政治",
      "risk", "concern", "threat", "downside", "overvalued", "sell"
    ]);
    insights.monitor = riskSentences.slice(0, 3).map(text => ({
      trigger: text.replace(/\*\*/g, "").slice(0, 80),
      context: "风险信号",
      urgency: "medium" as const,
    }));
  }

  // ── RELATED: ticker heuristics ─────────────────────────────────────────────
  const relatedSection = Array.from(sections.entries()).find(([k]) =>
    k.includes("相关") || k.includes("related") || k.includes("peer") || k.includes("competitor")
  )?.[1] ?? "";

  const tickers = extractTickers(relatedSection || content, entity?.toUpperCase());
  insights.related = tickers.slice(0, 5).map(symbol => ({
    symbol,
    relationship: "",
  }));

  // ── QUICK FACTS: key numbers ───────────────────────────────────────────────
  const facts: InsightQuickFact[] = [];
  
  if (answerObject?.confidence) {
    facts.push({
      label: "AI 置信度",
      value: answerObject.confidence === "high" ? "高" : answerObject.confidence === "medium" ? "中" : "低",
      sub: answerObject.verdict?.slice(0, 20),
    });
  }

  // ENHANCED: Extract key financial metrics from content
  // Pattern: "指标名=数值" or "指标名：数值" or "指标名 数值"
  const metricPatterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /EV\/Sales[=:：]\s*([\d.]+)x/i, label: "EV/Sales" },
    { regex: /P\/E[=:：\s]+([\d.]+)/i, label: "P/E" },
    { regex: /净利率[=:：\s]*([\d.]+%)/i, label: "净利率" },
    { regex: /流动比率[=:：\s]*([\d.]+)x/i, label: "流动比率" },
    { regex: /RSI\(?\d*\)?\s*[=:：]\s*([\d.]+)/i, label: "RSI" },
    { regex: /FCF转化率[=:：\s]*([\d.]+)/i, label: "FCF转化率" },
    { regex: /自由现金流[^$]*\$([\d,.]+[BMK]?)/i, label: "自由现金流" },
    { regex: /52周[^$]*\$([\d,.]+)[^$]*\$([\d,.]+)/i, label: "52周区间" },
  ];

  for (const { regex, label } of metricPatterns) {
    if (facts.length >= 4) break;
    const m = content.match(regex);
    if (m) {
      const value = label === "52周区间" ? `$${m[1]}-$${m[2]}` : m[1].includes("%") ? m[1] : `${m[1]}`;
      facts.push({ label, value });
    }
  }

  // Fallback: find "XX%" patterns near keywords
  if (facts.length < 2) {
    const pctMatches = Array.from(content.matchAll(/(\w[\w\s]{0,20}?)\s+([+-]?\d+(?:\.\d+)?%)/g)).slice(0, 3);
    for (const m of pctMatches) {
      if (facts.length >= 4) break;
      const label = m[1].trim().replace(/\*\*/g, "").slice(-20);
      if (label.length > 2) {
        facts.push({ label, value: m[2] });
      }
    }
  }

  insights.quickFacts = facts.slice(0, 4);

  // ── KEY LEVELS ─────────────────────────────────────────────────────────────
  const levelsSection = Array.from(sections.entries()).find(([k]) =>
    k.includes("价位") || k.includes("levels") || k.includes("目标") || k.includes("支撑") || k.includes("止损")
  )?.[1] ?? "";

  const levels: InsightKeyLevel[] = [];
  const levelPatterns: Array<[string, InsightKeyLevel["color"]]> = [
    ["目标价", "green"], ["target", "green"],
    ["止损", "red"], ["stop loss", "red"],
    ["支撑", "neutral"], ["support", "neutral"],
    ["阻力", "neutral"], ["resistance", "neutral"],
    ["安全边际", "green"], ["参考带", "neutral"],
    ["介入区间", "green"], ["entry", "green"],
  ];
  
  const searchText = levelsSection || content;
  for (const [label, color] of levelPatterns) {
    const lines = searchText.split("\n").filter((l: string) => l.toLowerCase().includes(label));
    for (const line of lines.slice(0, 1)) {
      // Match $NNN or $NNN-$NNN patterns
      const priceRange = line.match(/\$([\d,]+(?:\.\d+)?)\s*[-–~]\s*\$([\d,]+(?:\.\d+)?)/);
      const singlePrice = line.match(/\$([\d,]+(?:\.\d+)?)/);
      if (priceRange) {
        levels.push({ label, value: `$${priceRange[1]}-$${priceRange[2]}`, color });
        break;
      } else if (singlePrice) {
        levels.push({ label, value: `$${singlePrice[1]}`, color });
        break;
      }
    }
  }
  
  // ENHANCED: Also extract current price as a key level
  if (entity) {
    const currentPriceMatch = content.match(new RegExp(`当前价[^$]*\\$(\\d[\\d,.]+)`, "i"));
    if (currentPriceMatch && !levels.some(l => l.label === "当前价")) {
      levels.push({ label: "当前价", value: `$${currentPriceMatch[1]}`, color: "neutral" });
    }
  }
  
  insights.keyLevels = levels.slice(0, 5);

  // ── NEWS: headlines from content ───────────────────────────────────────────
  // Priority 1: heading-based extraction
  // Priority 2: ENHANCED — extract news references from full text
  const newsSection = Array.from(sections.entries()).find(([k]) =>
    k.includes("新闻") || k.includes("news") || k.includes("近期") || k.includes("recent")
  )?.[1] ?? "";

  if (newsSection) {
    insights.news = extractBullets(newsSection).slice(0, 3).map(headline => ({
      headline: headline.slice(0, 80),
    }));
  } else {
    // ENHANCED: Extract news-like sentences from full text
    // Look for patterns like "来源：XXX" or "据XXX报道" or "NewsAPI" references
    const newsSentences = extractSentencesWithKeywords(content, [
      "来源：", "据", "报道", "表示", "宣布", "消息",
      "NewsAPI", "Marketaux", "Polygon.io", "Motley Fool",
      "摩根", "高盛", "花旗", "美银", "瑞银",
    ]);
    
    // Deduplicate and clean
    const seen = new Set<string>();
    const newsItems: Array<{ headline: string; source?: string; sentiment?: "positive" | "negative" | "neutral" | undefined }> = [];
    
    for (const sentence of newsSentences) {
      if (newsItems.length >= 3) break;
      const key = sentence.slice(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);
      
      // Try to extract source
      const sourceMatch = sentence.match(/来源[：:]\s*([^，,）)]+)/);
      const source = sourceMatch?.[1]?.trim();
      
      // Determine sentiment
      const hasPositive = /利好|增长|扩张|积极|上涨|突破/.test(sentence);
      const hasNegative = /风险|下跌|担忧|威胁|回落/.test(sentence);
      const sentiment = hasPositive ? "positive" as const : hasNegative ? "negative" as const : undefined;
      
      newsItems.push({
        headline: sentence.replace(/\*\*/g, "").replace(/（来源[：:].*?）/g, "").trim().slice(0, 80),
        source,
        sentiment,
      });
    }
    
    insights.news = newsItems;
  }

  return insights;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main adapter (exported)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdapterInput {
  /** Raw assistant message content */
  content: string;
  /** metadata.answerObject if available */
  answerObject?: any;
  /** Current entity/ticker */
  entity?: string;
}

/**
 * adaptToWorkspaceOutput
 *
 * INPUT:  AdapterInput (raw content + optional structured metadata)
 * OUTPUT: WorkspaceOutputV1 (typed view model for Discussion + Insights)
 *
 * Never throws. Returns emptyWorkspaceOutput on any failure.
 */
export function adaptToWorkspaceOutput(input: AdapterInput): WorkspaceOutputV1 {
  try {
    const { content, answerObject, entity } = input;

    if (!content?.trim()) return emptyWorkspaceOutput(entity);

    // 1. Strip markers, extract followups (preserve existing utility)
    const { cleanContent, followups } = parseFollowups(content);

    // 2. Extract chart blocks — handles both %%CHART%% and %%PYIMAGE%%
    const chartBlocks: Array<{ type: string; raw?: string; base64?: string; text?: string }> = [];
    let chartStripped = cleanContent;

    // Extract %%CHART%% blocks (InlineChart)
    const chartRegex = /%%CHART%%([\s\S]*?)%%END_CHART%%/g;
    let chartMatch: RegExpExecArray | null;
    while ((chartMatch = chartRegex.exec(cleanContent)) !== null) {
      chartBlocks.push({ type: "chart", raw: chartMatch[1].trim() });
    }
    chartStripped = chartStripped.replace(/%%CHART%%[\s\S]*?%%END_CHART%%/g, "");

    // Extract %%PYIMAGE%% blocks (PyImageChart)
    const pyRegex = /%%PYIMAGE%%([\s\S]*?)%%END_PYIMAGE%%/g;
    let pyMatch: RegExpExecArray | null;
    while ((pyMatch = pyRegex.exec(cleanContent)) !== null) {
      chartBlocks.push({ type: "image_chart", base64: pyMatch[1].trim() });
    }
    chartStripped = chartStripped.replace(/%%PYIMAGE%%[\s\S]*?%%END_PYIMAGE%%/g, "").trim();

    // 3. Build discussion + insights view models
    const discussion = buildDiscussionViewModel(chartStripped, followups, chartBlocks, answerObject, entity);
    const insights = buildInsightsViewModel(chartStripped, answerObject, entity);

    const parseQuality: WorkspaceOutputV1["_meta"]["parseQuality"] =
      discussion.blocks.length > 2 ? "full"
      : discussion.blocks.length > 0 ? "partial"
      : "raw";

    return {
      entity,
      generatedAt: new Date().toISOString(),
      discussion,
      insights,
      _meta: {
        hadAnswerObject: !!answerObject,
        hadStructuredMarkers: followups.length > 0 || chartBlocks.length > 0,
        parseQuality,
      },
    };
  } catch {
    return emptyWorkspaceOutput(input.entity);
  }
}
