/**
 * WorkspaceOutputModel.ts — DanTree Workspace Output Refactor v1
 *
 * Typed view model for structured workspace output distribution.
 *
 * CONSUMERS:
 *   - adaptToWorkspaceOutput()  → produces this model from raw assistant content
 *   - DiscussionPanel           → consumes .discussion
 *   - InsightsRail              → consumes .insights
 *
 * DESIGN RULE:
 *   Discussion = reasoning + explanation (segmented, not dumped)
 *   Insights   = distilled intelligence + monitoring (cards, not essays)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Discussion View Model
// ─────────────────────────────────────────────────────────────────────────────

export type DiscussionBlockType =
  | "thesis"        // core answer / main conclusion
  | "reasoning"     // key reasoning steps
  | "narrative"     // explanatory prose
  | "chart"         // %%CHART%% payload → rendered by InlineChart
  | "image_chart"   // %%PYIMAGE%% base64 → rendered by PyImageChart
  | "followups";    // suggested next questions

export interface DiscussionBlock {
  type: DiscussionBlockType;
  /** Rendered text content (cleaned of markers) */
  content: string;
  /** For type=chart: raw %%CHART%% payload string — consumed by InlineChart */
  chartRaw?: string;
  /** For type=image_chart: base64 PNG string — consumed by PyImageChart */
  chartBase64?: string;
  /** For type=followups: list of followup strings */
  followups?: string[];
}

export interface DiscussionViewModel {
  /** Ordered blocks to render in Discussion pane */
  blocks: DiscussionBlock[];
  /** Entity this output relates to */
  entity?: string;
  /** True if output was cleanly parsed; false = fallback to raw */
  isStructured: boolean;
  /** Raw fallback content if structure extraction failed */
  rawFallback?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights View Model
// ─────────────────────────────────────────────────────────────────────────────

export interface InsightNowItem {
  text: string;
  sub: string;
  sentiment: "positive" | "negative" | "neutral" | "warning";
}

export interface InsightMonitorItem {
  trigger: string;     // what to watch for
  context: string;     // why it matters
  urgency: "high" | "medium" | "low";
}

export interface InsightRelatedName {
  symbol: string;
  relationship: string;   // "supplier" | "peer" | "customer" | "index" | ""
  change?: string;
  positive?: boolean;
}

export interface InsightQuickFact {
  label: string;
  value: string;
  sub?: string;
}

export interface InsightKeyLevel {
  label: string;
  value: string;
  color: "green" | "red" | "neutral";
}

export interface InsightNewsItem {
  headline: string;
  source?: string;
  sentiment?: "positive" | "negative" | "neutral";
}

export interface InsightsViewModel {
  /** NOW: current most relevant signals */
  now: InsightNowItem[];
  /** MONITOR: trigger conditions to watch */
  monitor: InsightMonitorItem[];
  /** RELATED: names that matter for this thesis */
  related: InsightRelatedName[];
  /** QUICK FACTS: distilled key numbers */
  quickFacts: InsightQuickFact[];
  /** KEY LEVELS: price boundaries / action levels */
  keyLevels: InsightKeyLevel[];
  /** NEWS: recent relevant headlines */
  news: InsightNewsItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level Workspace Output Model
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkspaceOutputV1 {
  entity?: string;
  generatedAt: string;
  discussion: DiscussionViewModel;
  insights: InsightsViewModel;
  /** Source metadata for debugging/extension */
  _meta: {
    hadAnswerObject: boolean;
    hadStructuredMarkers: boolean;
    parseQuality: "full" | "partial" | "raw";
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state constructors
// ─────────────────────────────────────────────────────────────────────────────

export function emptyInsightsViewModel(): InsightsViewModel {
  return { now: [], monitor: [], related: [], quickFacts: [], keyLevels: [], news: [] };
}

export function emptyWorkspaceOutput(entity?: string): WorkspaceOutputV1 {
  return {
    entity,
    generatedAt: new Date().toISOString(),
    discussion: { blocks: [], entity, isStructured: false },
    insights: emptyInsightsViewModel(),
    _meta: { hadAnswerObject: false, hadStructuredMarkers: false, parseQuality: "raw" },
  };
}
