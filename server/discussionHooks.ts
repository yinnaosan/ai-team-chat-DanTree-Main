/**
 * discussionHooks.ts
 * LEVEL1A_PHASE_6 — Discussion Hooks
 *
 * OBJECTIVE: Aggregate and format discussion hooks from multiple sources
 * into a structured DiscussionResult that is:
 * 1. Persisted to DataPacket (already supported by dataPacketWrapper)
 * 2. Injected into the final report as an interactive section
 * 3. Passed to frontend for rendering as clickable follow-up prompts
 *
 * SOURCES:
 * - interpretation agent's discussionHooks (LEVEL1A Phase4)
 * - Step3 structured output's follow_up_questions / exploration_paths
 * - ResearchPlan hypotheses (unanswered ones become discussion hooks)
 */

import type { IntentContext } from "./intentInterpreter";
import type { ResearchPlan } from "./researchPlanner";
import type { MultiAgentResult } from "./multiAgentAnalysis";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscussionHookSet {
  /** Core uncertainty that most affects the conclusion */
  key_uncertainty: string;
  /** Weakest link in the current analysis */
  weakest_point: string;
  /** Alternative view that challenges the main thesis */
  alternative_view: string;
  /** Clickable follow-up questions for the user */
  follow_up_questions: string[];
  /** Deeper research direction */
  deeper_dive: string;
  /** Unanswered hypotheses from ResearchPlan */
  open_hypotheses: string[];
}

// ── Fallback generators ───────────────────────────────────────────────────────

function buildFallbackHooks(
  intent: IntentContext,
  plan: ResearchPlan,
): DiscussionHookSet {
  const ticker = intent.entity_scope[0] ?? "该标的";

  const followUps: string[] = [];
  if (intent.risk_focus) {
    followUps.push(`${ticker} 的主要下行风险是什么？`);
    followUps.push(`如果宏观环境恶化，${ticker} 的估值会如何变化？`);
  }
  if (intent.growth_focus) {
    followUps.push(`${ticker} 未来 3 年的增速预期是否可持续？`);
    followUps.push(`市场对 ${ticker} 增速的定价是否合理？`);
  }
  if (intent.comparison_needed) {
    followUps.push(`${ticker} 与同行相比的核心竞争优势是什么？`);
  }
  // Generic fallbacks
  if (followUps.length < 3) {
    followUps.push(`${ticker} 当前最值得关注的催化剂是什么？`);
    followUps.push(`这次分析中最大的数据缺口是什么？`);
    followUps.push(`如果主要论点被证伪，关键信号是什么？`);
  }

  const openHypotheses = plan.hypotheses
    .filter(h => h.priority === "high")
    .map(h => h.statement);

  return {
    key_uncertainty: `${ticker} 的核心不确定性尚未充分量化`,
    weakest_point: "当前分析依赖的部分数据可能存在时效性问题",
    alternative_view: `若宏观环境显著改变，${ticker} 的当前估值逻辑可能失效`,
    follow_up_questions: followUps.slice(0, 5),
    deeper_dive: `建议深入研究 ${ticker} 的护城河可持续性和资本配置效率`,
    open_hypotheses: openHypotheses.slice(0, 3),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * buildDiscussionHookSet
 *
 * Aggregates discussion hooks from all available sources.
 * Gracefully falls back to intent/plan-derived hooks when agent output is missing.
 *
 * @param intent  IntentContext from Phase1
 * @param plan  ResearchPlan from Phase2
 * @param multiAgentResult  MultiAgentResult (may be undefined)
 * @param step3FollowUpQuestions  follow_up_questions from Step3 structured output
 * @param step3ExplorationPaths  exploration_paths from Step3 structured output
 */
export function buildDiscussionHookSet(
  intent: IntentContext,
  plan: ResearchPlan,
  multiAgentResult: MultiAgentResult | undefined,
  step3FollowUpQuestions: string[] = [],
  step3ExplorationPaths: string[] = [],
): DiscussionHookSet {
  const agentHooks = multiAgentResult?.discussionHooks;

  // Build follow_up_questions: merge agent + step3 + plan hypotheses
  const allFollowUps: string[] = [
    ...(agentHooks?.follow_up_questions ?? []),
    ...step3FollowUpQuestions,
  ];

  // Add unanswered high-priority hypotheses as follow-up questions
  const openHypotheses = plan.hypotheses
    .filter(h => h.priority === "high")
    .map(h => `验证假设: ${h.statement}`);

  // Deduplicate follow-ups
  const seen = new Set<string>();
  const deduped = allFollowUps.filter(q => {
    const key = q.slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);

  // If we have agent hooks, use them as primary source
  if (agentHooks && agentHooks.key_uncertainty) {
    return {
      key_uncertainty: agentHooks.key_uncertainty,
      weakest_point: agentHooks.weakest_point,
      alternative_view: agentHooks.alternative_view,
      follow_up_questions: deduped.length >= 2 ? deduped : [
        ...deduped,
        ...openHypotheses.slice(0, 3 - deduped.length),
      ],
      deeper_dive: agentHooks.deeper_dive || step3ExplorationPaths[0] || "",
      open_hypotheses: openHypotheses.slice(0, 3),
    };
  }

  // Fallback: derive from intent + plan
  const fallback = buildFallbackHooks(intent, plan);

  // Merge step3 follow-ups into fallback
  if (step3FollowUpQuestions.length > 0) {
    fallback.follow_up_questions = [
      ...step3FollowUpQuestions.slice(0, 3),
      ...fallback.follow_up_questions.slice(0, 2),
    ].slice(0, 5);
  }
  if (step3ExplorationPaths.length > 0) {
    fallback.deeper_dive = step3ExplorationPaths[0];
  }

  return fallback;
}

/**
 * formatDiscussionHookSetForReport
 *
 * Renders DiscussionHookSet as a Markdown section for the final report.
 * This section is appended after the main analysis.
 */
export function formatDiscussionHookSetForReport(hooks: DiscussionHookSet): string {
  const lines: string[] = [
    "---",
    "## 深度讨论入口",
    "",
    `**核心不确定性：** ${hooks.key_uncertainty}`,
    "",
    `**分析薄弱环节：** ${hooks.weakest_point}`,
    "",
    `**对立观点：** ${hooks.alternative_view}`,
    "",
    "**延伸追问：**",
  ];

  for (const q of hooks.follow_up_questions) {
    lines.push(`- ${q}`);
  }

  if (hooks.deeper_dive) {
    lines.push("");
    lines.push(`**深入研究方向：** ${hooks.deeper_dive}`);
  }

  if (hooks.open_hypotheses.length > 0) {
    lines.push("");
    lines.push("**待验证假设：**");
    for (const h of hooks.open_hypotheses) {
      lines.push(`- ${h}`);
    }
  }

  return lines.join("\n");
}

/**
 * formatDiscussionHookSetForPrompt
 *
 * Serializes DiscussionHookSet into a compact AI-readable block.
 * Used in Step3 prompt to instruct GPT on discussion output.
 */
export function formatDiscussionHookSetForPrompt(hooks: DiscussionHookSet): string {
  return `[DISCUSSION_HOOKS | LEVEL1A]
KEY_UNCERTAINTY: ${hooks.key_uncertainty}
WEAKEST_POINT: ${hooks.weakest_point}
ALTERNATIVE_VIEW: ${hooks.alternative_view}
FOLLOW_UP_QUESTIONS: ${hooks.follow_up_questions.join(" | ")}
DEEPER_DIVE: ${hooks.deeper_dive}
OPEN_HYPOTHESES: ${hooks.open_hypotheses.join(" | ") || "none"}
[/DISCUSSION_HOOKS]`;
}
