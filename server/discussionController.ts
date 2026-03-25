/**
 * LEVEL1A2 Phase4: Discussion Structured Controller
 *
 * RULE: Discussion hooks are a FIRST-CLASS system output, not appended prose.
 * RULE: Structured object is the source of truth.
 * RULE: Generated questions must be thesis-specific (not generic).
 * RULE: Replaces/dominates legacy generic follow-up for stock_analysis,
 *       macro_analysis, and comparison tasks.
 *
 * OBJECT SCHEMA (authoritative):
 * {
 *   key_uncertainty: string,
 *   weakest_point: string,
 *   alternative_view: string,
 *   follow_up_questions: string[],
 *   exploration_paths: string[],
 *   open_hypotheses: string[],
 *   deeper_dive: string
 * }
 */

import type { NormalizedTaxonomy } from "./agentTaxonomyNormalizer";
import type { StructuredSynthesis } from "./synthesisController";
import type { IntentContext } from "./intentInterpreter";

// ── Structured Discussion Object ──────────────────────────────────────────────

export interface StructuredDiscussion {
  key_uncertainty: string;
  weakest_point: string;
  alternative_view: string;
  follow_up_questions: string[];
  exploration_paths: string[];
  open_hypotheses: string[];
  deeper_dive: string;
}

// ── Supported Task Types (legacy generic follow-up replaced) ─────────────────

const SUPPORTED_TASK_TYPES: IntentContext["task_type"][] = [
  "stock_analysis",
  "macro_analysis",
  "event_driven",
];

// ── Key Uncertainty Builder ───────────────────────────────────────────────────

function buildKeyUncertainty(
  taxonomy: NormalizedTaxonomy,
  synthesis: StructuredSynthesis,
): string {
  // Use the first invalidation condition as the key uncertainty
  if (taxonomy.risk.invalidation_conditions.length > 0) {
    return taxonomy.risk.invalidation_conditions[0];
  }

  // Fall back to the first hidden risk
  if (taxonomy.risk.hidden_risks.length > 0) {
    return taxonomy.risk.hidden_risks[0];
  }

  // Fall back to the first counterargument
  if (synthesis.counterarguments.length > 0) {
    return synthesis.counterarguments[0];
  }

  return "当前分析的核心不确定性尚未明确，建议补充更多数据";
}

// ── Weakest Point Builder ─────────────────────────────────────────────────────

function buildWeakestPoint(
  taxonomy: NormalizedTaxonomy,
  synthesis: StructuredSynthesis,
): string {
  // Weakest point = where evidence is thinnest
  if (taxonomy.valuation.valuation_risks.length > 0) {
    return `估值假设最脆弱处: ${taxonomy.valuation.valuation_risks[0]}`;
  }

  if (synthesis.limitation_note) {
    return synthesis.limitation_note;
  }

  if (taxonomy.risk.thesis_failure_points.length > 0) {
    return `论点最薄弱处: ${taxonomy.risk.thesis_failure_points[0]}`;
  }

  return "当前分析的最薄弱环节需要更多数据支撑";
}

// ── Alternative View Builder ──────────────────────────────────────────────────

function buildAlternativeView(
  taxonomy: NormalizedTaxonomy,
  synthesis: StructuredSynthesis,
): string {
  // Use risk revisions as the primary alternative view
  if (taxonomy.revisions.length > 0) {
    return taxonomy.revisions[0];
  }

  // Use counterarguments
  if (synthesis.counterarguments.length > 1) {
    return synthesis.counterarguments[1];
  }

  // Use conflicts
  if (taxonomy.conflicts.length > 0) {
    return `信号分歧视角: ${taxonomy.conflicts[0]}`;
  }

  return "当前无明显对立观点，但建议关注市场共识变化";
}

// ── Follow-up Questions Builder ───────────────────────────────────────────────

function buildFollowUpQuestions(
  taxonomy: NormalizedTaxonomy,
  synthesis: StructuredSynthesis,
  intentCtx: IntentContext,
  ticker?: string | null,
): string[] {
  const questions: string[] = [];
  const tickerLabel = ticker ?? "该标的";

  if (intentCtx.task_type === "stock_analysis") {
    // Thesis-specific questions based on valuation
    if (taxonomy.valuation.premium_or_discount.length > 0) {
      const signal = taxonomy.valuation.premium_or_discount[0];
      if (signal.includes("高估")) {
        questions.push(`${tickerLabel} 当前估值溢价的合理性是什么？有哪些催化剂可以支撑？`);
        questions.push(`如果利率上升 100bp，${tickerLabel} 的 DCF 估值会如何变化？`);
      } else if (signal.includes("低估")) {
        questions.push(`${tickerLabel} 低估的原因是暂时性的还是结构性的？`);
        questions.push(`市场为什么给予 ${tickerLabel} 折价？有哪些被忽视的风险？`);
      }
    }

    // Risk-specific questions
    if (taxonomy.risk.invalidation_conditions.length > 0) {
      questions.push(`如果 ${taxonomy.risk.invalidation_conditions[0]}，投资论点是否仍然成立？`);
    }

    // Growth questions
    if (taxonomy.business.growth_claims.length > 0) {
      questions.push(`${tickerLabel} 的增长预期是否已经充分反映在当前股价中？`);
    }

  } else if (intentCtx.task_type === "macro_analysis") {
    if (taxonomy.market_context.macro_signals.length > 0) {
      questions.push(`当前宏观信号 "${taxonomy.market_context.macro_signals[0].slice(0, 50)}" 对不同资产类别的影响有何差异？`);
    }
    questions.push("如果这一宏观趋势逆转，哪些资产最先受益/受损？");
    questions.push("历史上类似的宏观环境持续了多久？最终如何演变？");

  } else if (intentCtx.task_type === "event_driven") {
    questions.push("这一事件的影响是一次性的还是会改变长期基本面？");
    questions.push("市场对这一事件的反应是否过度？");
  }

  // Add a counterargument-based question
  if (synthesis.counterarguments.length > 0 && questions.length < 4) {
    questions.push(`反驳观点: "${synthesis.counterarguments[0].slice(0, 60)}" — 你如何回应这一挑战？`);
  }

  return questions.slice(0, 4);
}

// ── Exploration Paths Builder ─────────────────────────────────────────────────

function buildExplorationPaths(
  taxonomy: NormalizedTaxonomy,
  intentCtx: IntentContext,
  ticker?: string | null,
): string[] {
  const paths: string[] = [];
  const tickerLabel = ticker ?? "该标的";

  if (intentCtx.task_type === "stock_analysis") {
    paths.push(`深入分析 ${tickerLabel} 的竞争护城河和行业地位`);
    if (taxonomy.business.growth_claims.length > 0) {
      paths.push(`量化 ${tickerLabel} 的增长驱动因素和可持续性`);
    }
    paths.push(`对比分析 ${tickerLabel} 与同行业竞争对手的估值差异`);
  } else if (intentCtx.task_type === "macro_analysis") {
    paths.push("构建宏观情景分析（基准/乐观/悲观）");
    paths.push("分析宏观因素对具体行业的传导机制");
  }

  // Add risk exploration
  if (taxonomy.risk.hidden_risks.length > 0) {
    paths.push(`深入研究隐性风险: ${taxonomy.risk.hidden_risks[0].slice(0, 60)}`);
  }

  return paths.slice(0, 3);
}

// ── Open Hypotheses Builder ───────────────────────────────────────────────────

function buildOpenHypotheses(
  taxonomy: NormalizedTaxonomy,
  synthesis: StructuredSynthesis,
): string[] {
  const hypotheses: string[] = [];

  // Conflicts generate open hypotheses
  for (const conflict of taxonomy.conflicts.slice(0, 2)) {
    hypotheses.push(`待验证: ${conflict}`);
  }

  // Invalidation conditions as hypotheses
  for (const condition of taxonomy.risk.invalidation_conditions.slice(0, 1)) {
    hypotheses.push(`假设检验: ${condition}`);
  }

  // If synthesis has low confidence, add hypothesis about data quality
  if (synthesis.confidence === "low") {
    hypotheses.push("假设: 补充关键数据后，结论方向是否会改变？");
  }

  return hypotheses.slice(0, 3);
}

// ── Deeper Dive Builder ───────────────────────────────────────────────────────

function buildDeeperDive(
  taxonomy: NormalizedTaxonomy,
  intentCtx: IntentContext,
  ticker?: string | null,
): string {
  const tickerLabel = ticker ?? "该标的";

  if (intentCtx.task_type === "stock_analysis") {
    const topRisk = taxonomy.risk.thesis_failure_points[0];
    if (topRisk) {
      return `建议深入研究: ${topRisk.slice(0, 100)} — 这是当前分析中最需要进一步验证的核心假设`;
    }
    return `建议深入研究 ${tickerLabel} 的长期竞争优势和护城河可持续性`;
  } else if (intentCtx.task_type === "macro_analysis") {
    return "建议构建完整的宏观情景模型，量化不同情景下的资产配置影响";
  }

  return "建议补充更多数据后进行更深入的分析";
}

// ── Main Controller ───────────────────────────────────────────────────────────

export function buildStructuredDiscussion(
  taxonomy: NormalizedTaxonomy,
  synthesis: StructuredSynthesis,
  intentCtx: IntentContext,
  ticker?: string | null,
): StructuredDiscussion {
  return {
    key_uncertainty: buildKeyUncertainty(taxonomy, synthesis),
    weakest_point: buildWeakestPoint(taxonomy, synthesis),
    alternative_view: buildAlternativeView(taxonomy, synthesis),
    follow_up_questions: buildFollowUpQuestions(taxonomy, synthesis, intentCtx, ticker),
    exploration_paths: buildExplorationPaths(taxonomy, intentCtx, ticker),
    open_hypotheses: buildOpenHypotheses(taxonomy, synthesis),
    deeper_dive: buildDeeperDive(taxonomy, intentCtx, ticker),
  };
}

// ── Legacy Override Check ─────────────────────────────────────────────────────

/**
 * Returns true if this task type should use structured discussion
 * instead of legacy generic follow-up.
 */
export function shouldUseStructuredDiscussion(intentCtx: IntentContext): boolean {
  return SUPPORTED_TASK_TYPES.includes(intentCtx.task_type);
}

// ── Prompt Formatter ──────────────────────────────────────────────────────────

export function formatStructuredDiscussionForPrompt(discussion: StructuredDiscussion): string {
  const lines: string[] = [
    "[STRUCTURED_DISCUSSION_CONTROLLER | LEVEL1A2]",
    `KEY_UNCERTAINTY: ${discussion.key_uncertainty}`,
    `WEAKEST_POINT: ${discussion.weakest_point}`,
    `ALTERNATIVE_VIEW: ${discussion.alternative_view}`,
    "",
    "FOLLOW_UP_QUESTIONS (thesis-specific, not generic):",
    ...discussion.follow_up_questions.map(q => `  Q: ${q}`),
    "",
    "EXPLORATION_PATHS:",
    ...discussion.exploration_paths.map(p => `  PATH: ${p}`),
    "",
    "OPEN_HYPOTHESES:",
    ...discussion.open_hypotheses.map(h => `  H: ${h}`),
    "",
    `DEEPER_DIVE: ${discussion.deeper_dive}`,
    "[/STRUCTURED_DISCUSSION_CONTROLLER]",
  ];
  return lines.join("\n");
}

// ── Report Section Formatter ──────────────────────────────────────────────────

export function formatStructuredDiscussionForReport(
  discussion: StructuredDiscussion,
): string {
  if (discussion.follow_up_questions.length === 0) return "";

  const lines: string[] = [
    "---",
    "## 延伸思考",
    "",
    `**核心不确定性：** ${discussion.key_uncertainty}`,
    "",
    `**分析最薄弱处：** ${discussion.weakest_point}`,
    "",
    `**对立观点：** ${discussion.alternative_view}`,
    "",
    "**深入探讨方向：**",
    ...discussion.follow_up_questions.map(q => `- ${q}`),
  ];

  if (discussion.open_hypotheses.length > 0) {
    lines.push("", "**待验证假设：**");
    lines.push(...discussion.open_hypotheses.map(h => `- ${h}`));
  }

  if (discussion.deeper_dive) {
    lines.push("", `**推荐深入研究：** ${discussion.deeper_dive}`);
  }

  return lines.join("\n");
}
