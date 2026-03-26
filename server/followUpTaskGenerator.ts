/**
 * DANTREE_LEVEL2 Phase2: Follow-up Task Generator
 * Generates a targeted second-pass task based on Level1 output weaknesses.
 */

import type { IntentContext } from "./intentInterpreter";
import type { FinalOutputSchema } from "./outputSchemaValidator";
import type { TriggerDecision } from "./loopStateTriggerEngine";
import type { StructuredSynthesis } from "./synthesisController";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FollowUpTask {
  task_description: string;      // Targeted follow-up question for second pass
  focus_area: string;            // What the second pass should focus on
  data_hints: string[];          // Specific data points to look for
  constraint: string;            // What NOT to redo (avoid full blind rerun)
  generated_from: string;        // Source of the follow-up (trigger_type)
  primary_ticker: string;
  original_task: string;
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Generate a targeted follow-up task for the second reasoning pass.
 * The follow-up is constrained to address the specific weakness identified
 * by the trigger engine — it does NOT re-run the full analysis.
 */
export function generateFollowUpTask(params: {
  triggerDecision: TriggerDecision;
  intentCtx: IntentContext;
  level1a3Output: FinalOutputSchema | null;
  structuredSynthesis: StructuredSynthesis | null;
  primaryTicker: string;
  originalTaskDescription: string;
  evidenceScore: number;
}): FollowUpTask {
  const {
    triggerDecision,
    intentCtx,
    level1a3Output,
    structuredSynthesis,
    primaryTicker,
    originalTaskDescription,
    evidenceScore,
  } = params;

  const ticker = primaryTicker || "the target";
  const shortTask = originalTaskDescription.slice(0, 100);

  // ── Route by trigger type ─────────────────────────────────────────────────

  switch (triggerDecision.trigger_type) {

    case "low_confidence": {
      // Low confidence → focus on finding the most critical missing evidence
      const keyUncertainty = level1a3Output?.discussion.key_uncertainty
        ?? "the key unknown factor";
      const weakestPoint = level1a3Output?.discussion.weakest_point
        ?? "the weakest argument";
      return {
        task_description: `[SECOND_PASS: LOW_CONFIDENCE] For ${ticker}, the initial analysis returned LOW confidence. Focus exclusively on resolving: "${keyUncertainty}". Address the weakest point: "${weakestPoint}". Do NOT regenerate the full analysis — only provide targeted evidence to strengthen or refute the initial thesis.`,
        focus_area: `Resolve key uncertainty: ${keyUncertainty}`,
        data_hints: extractDataHints(level1a3Output, "low_confidence"),
        constraint: `Do not repeat the full analysis. Focus only on: ${keyUncertainty}`,
        generated_from: "low_confidence",
        primary_ticker: ticker,
        original_task: shortTask,
      };
    }

    case "weak_evidence": {
      // Weak evidence → find specific quantitative data points
      const missingDataTypes = getMissingDataTypes(intentCtx.task_type, evidenceScore);
      return {
        task_description: `[SECOND_PASS: WEAK_EVIDENCE] For ${ticker}, the initial analysis had weak evidence (score: ${evidenceScore.toFixed(2)}). Fetch and analyze: ${missingDataTypes.join(", ")}. Do NOT regenerate the full analysis — only provide the missing data points and their implications for the initial verdict.`,
        focus_area: `Strengthen evidence base: ${missingDataTypes.slice(0, 2).join(", ")}`,
        data_hints: missingDataTypes,
        constraint: "Do not repeat the full analysis. Only provide missing quantitative data.",
        generated_from: "weak_evidence",
        primary_ticker: ticker,
        original_task: shortTask,
      };
    }

    case "critical_risk_unresolved": {
      // Critical risk → deep-dive on the highest-magnitude risk
      const highRisk = level1a3Output?.risks.find(r => r.magnitude === "high");
      const riskDesc = highRisk?.description ?? "the critical risk factor";
      const riskReason = highRisk?.reason ?? "unknown cause";
      return {
        task_description: `[SECOND_PASS: CRITICAL_RISK] For ${ticker}, a HIGH-magnitude risk was identified: "${riskDesc}" (reason: ${riskReason}). Investigate this risk specifically: What is the probability of materialization? What is the quantitative impact on valuation? Are there any mitigating factors not captured in the initial analysis? Do NOT regenerate the full analysis.`,
        focus_area: `Deep-dive on critical risk: ${riskDesc}`,
        data_hints: [
          `Probability of ${riskDesc}`,
          `Quantitative impact on ${ticker} valuation`,
          `Historical precedents for similar risk`,
          `Mitigating factors or hedges`,
        ],
        constraint: `Focus only on risk: "${riskDesc}". Do not repeat the full analysis.`,
        generated_from: "critical_risk_unresolved",
        primary_ticker: ticker,
        original_task: shortTask,
      };
    }

    case "high_uncertainty": {
      // High uncertainty from synthesis → focus on alternative view
      const altView = level1a3Output?.discussion.alternative_view
        ?? "the alternative interpretation";
      const followUpQ = level1a3Output?.discussion.follow_up_questions[0]
        ?? `What additional data would change the ${ticker} thesis?`;
      return {
        task_description: `[SECOND_PASS: HIGH_UNCERTAINTY] For ${ticker}, the synthesis flagged high uncertainty. Evaluate: "${altView}". Answer: "${followUpQ}". Do NOT regenerate the full analysis — only address the alternative view and the most critical follow-up question.`,
        focus_area: `Evaluate alternative view: ${altView.slice(0, 80)}`,
        data_hints: extractDataHints(level1a3Output, "high_uncertainty"),
        constraint: `Focus only on the alternative view and follow-up question. Do not repeat the full analysis.`,
        generated_from: "high_uncertainty",
        primary_ticker: ticker,
        original_task: shortTask,
      };
    }

    default: {
      // Fallback: generic targeted follow-up
      const hypothesis = level1a3Output?.discussion.open_hypotheses[0]
        ?? `Is the initial ${ticker} thesis robust to macro changes?`;
      return {
        task_description: `[SECOND_PASS: GENERAL] For ${ticker}, test the hypothesis: "${hypothesis}". Do NOT regenerate the full analysis — only provide evidence for or against this specific hypothesis.`,
        focus_area: `Test hypothesis: ${hypothesis.slice(0, 80)}`,
        data_hints: extractDataHints(level1a3Output, "general"),
        constraint: "Do not repeat the full analysis. Only test the specific hypothesis.",
        generated_from: "general",
        primary_ticker: ticker,
        original_task: shortTask,
      };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDataHints(
  output: FinalOutputSchema | null,
  triggerType: string
): string[] {
  if (!output) return ["Recent earnings data", "Analyst consensus", "Sector comparison"];

  const hints: string[] = [];

  // Extract from follow-up questions
  if (output.discussion.follow_up_questions.length > 0) {
    hints.push(...output.discussion.follow_up_questions.slice(0, 2));
  }

  // Extract from exploration paths
  if (output.discussion.exploration_paths.length > 0) {
    hints.push(output.discussion.exploration_paths[0]);
  }

  // Add type-specific hints
  if (triggerType === "low_confidence") {
    hints.push("Recent earnings surprise", "Analyst rating changes", "Insider trading activity");
  } else if (triggerType === "weak_evidence") {
    hints.push("Quantitative valuation metrics", "Peer comparison data", "Historical growth rates");
  }

  return hints.slice(0, 4);
}

function getMissingDataTypes(taskType: string, evidenceScore: number): string[] {
  const base = ["recent earnings data", "analyst consensus price targets", "peer valuation multiples"];

  if (taskType === "stock_analysis") {
    return [
      ...base,
      "insider trading activity (last 90 days)",
      "institutional ownership changes",
      "short interest ratio",
    ].slice(0, 4);
  }

  if (taskType === "macro_analysis") {
    return [
      "latest Fed/PBOC policy statements",
      "recent macro indicators (CPI, PMI, GDP)",
      "sector rotation signals",
      "credit spread movements",
    ];
  }

  if (taskType === "sector_analysis") {
    return [
      "sector ETF fund flows",
      "top-3 sector leaders' recent earnings",
      "sector P/E vs historical average",
      "regulatory news in the sector",
    ];
  }

  return base;
}
