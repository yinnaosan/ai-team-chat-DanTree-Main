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
  const common = new Set(["AI", "US", "GDP", "EPS", "PE", "YOY", "QOQ", "IPO", "ETF", "FED", "CPI", "PCE", "NFP", "AND", "THE", "FOR", "NOT", "BUT"]);
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

  // 1. Thesis block — from answerObject.verdict or first paragraph
  const thesisText = answerObject?.verdict
    ?? Array.from(sections.entries()).find(([k]) => k.includes("thesis") || k.includes("核心") || k.includes("判断"))?.[1]
    ?? cleanContent.split("\n\n")[0]?.trim();

  if (thesisText?.length > 20) {
    blocks.push({ type: "thesis", content: thesisText.slice(0, 600) });
  }

  // 2. Reasoning blocks — from answerObject.reasoning or ## 推理 section
  const reasoningItems: string[] =
    answerObject?.reasoning?.length
      ? answerObject.reasoning
      : answerObject?.key_points?.length
        ? answerObject.key_points
        : extractBullets(
            Array.from(sections.entries()).find(([k]) => k.includes("推理") || k.includes("reason") || k.includes("分析"))?.[1] ?? ""
          );

  if (reasoningItems.length > 0) {
    blocks.push({
      type: "reasoning",
      content: reasoningItems.slice(0, 5).join("\n"),
    });
  }

  // 3. Narrative blocks — remaining text sections (excluding already-used ones)
  const usedKeys = ["thesis", "核心", "判断", "推理", "reason", "分析"];
  let narrativeAdded = 0;
  for (const [key, body] of Array.from(sections.entries())) {
    if (narrativeAdded >= 3) break;
    if (usedKeys.some(k => key.includes(k))) continue;
    // Skip sections better suited for insights
    if (["related", "相关", "监控", "watch", "levels", "价位", "new", "新闻", "catalyst", "催化"].some(k => key.includes(k))) continue;
    if (body.length > 40) {
      blocks.push({ type: "narrative", content: body.slice(0, 800) });
      narrativeAdded++;
    }
  }

  // If no sections found, use paragraphs from cleanContent (skip first = thesis)
  if (blocks.length <= 1 && cleanContent.length > 200) {
    const paras = cleanContent.split("\n\n").filter(p => p.trim().length > 40).slice(1, 4);
    for (const para of paras) {
      blocks.push({ type: "narrative", content: para.trim().slice(0, 800) });
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
// Insights adapter
// ─────────────────────────────────────────────────────────────────────────────

function buildInsightsViewModel(
  content: string,
  answerObject?: any,
  entity?: string
): InsightsViewModel {
  const sections = extractSections(content);
  const insights = emptyInsightsViewModel();

  // ── NOW: positive signals ──────────────────────────────────────────────────
  const bullItems: string[] = answerObject?.bull_case?.length
    ? answerObject.bull_case
    : extractBullets(
        Array.from(sections.entries()).find(([k]) => k.includes("多头") || k.includes("bull") || k.includes("支撑") || k.includes("驱动"))?.[1] ?? ""
      );

  insights.now = bullItems.slice(0, 3).map(text => ({
    text: text.slice(0, 80),
    sub: "多头证据",
    sentiment: "positive" as const,
  }));

  // ── MONITOR: risks / triggers ──────────────────────────────────────────────
  const riskItems = answerObject?.risks?.length
    ? answerObject.risks.map((r: any) => ({
        trigger: r.description?.slice(0, 60) ?? "",
        context: `风险 · ${r.magnitude ?? "medium"}`,
        urgency: (r.magnitude === "high" ? "high" : r.magnitude === "low" ? "low" : "medium") as InsightMonitorItem["urgency"],
      }))
    : extractBullets(
        Array.from(sections.entries()).find(([k]) => k.includes("风险") || k.includes("risk") || k.includes("监控") || k.includes("watch"))?.[1] ?? ""
      ).slice(0, 3).map(text => ({
        trigger: text.slice(0, 60),
        context: "监控项",
        urgency: "medium" as const,
      }));

  insights.monitor = riskItems.slice(0, 3);

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
  // Heuristic: find "XX%" patterns near keywords
  const pctMatches = Array.from(content.matchAll(/(\w[\w\s]{0,20}?)\s+([+-]?\d+(?:\.\d+)?%)/g)).slice(0, 3);
  for (const m of pctMatches) {
    const label = m[1].trim().slice(-20);
    facts.push({ label, value: m[2] });
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
  ];
  for (const [label, color] of levelPatterns) {
    const lines = (levelsSection || content).split("\n").filter((l: string) => l.toLowerCase().includes(label));
    for (const line of lines.slice(0, 1)) {
      const price = line.match(/\$[\d,]+(?:\.\d+)?/);
      if (price) {
        levels.push({ label, value: price[0], color });
        break;
      }
    }
  }
  insights.keyLevels = levels.slice(0, 5);

  // ── NEWS: headlines from content ───────────────────────────────────────────
  const newsSection = Array.from(sections.entries()).find(([k]) =>
    k.includes("新闻") || k.includes("news") || k.includes("近期") || k.includes("recent")
  )?.[1] ?? "";

  insights.news = extractBullets(newsSection).slice(0, 3).map(headline => ({
    headline: headline.slice(0, 80),
  }));

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
