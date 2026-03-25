/**
 * synthesisEngine.ts
 * LEVEL1A_PHASE_5 — Synthesis Engine
 *
 * OBJECTIVE: Provide intent-aware synthesis prompt injection and
 * counterarguments extraction. Wraps existing dataPacketWrapper
 * with LEVEL1A context blocks.
 *
 * DESIGN PRINCIPLE: Zero new LLM calls — enriches Step3 prompt only.
 * The `counterarguments` field is extracted from existing `anti_thesis`
 * in answerObject and from interpretation agent's `alternative_view`.
 */

import type { IntentContext } from "./intentInterpreter";
import type { ResearchPlan } from "./researchPlanner";
import type { MultiAgentResult } from "./multiAgentAnalysis";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SynthesisEnrichment {
  /** Counterarguments extracted from anti_thesis + interpretation agent */
  counterarguments: string[];
  /** Confidence adjustment based on evidence score and divergence */
  confidence_note: string;
  /** Whether synthesis should be decisive, directional, or framework_only */
  output_mode: "decisive" | "directional" | "framework_only";
  /** Intent-specific synthesis instructions */
  synthesis_instructions: string;
}

// ── Counterargument extraction ────────────────────────────────────────────────

/**
 * extractCounterarguments
 *
 * Collects counterarguments from:
 * 1. answerObject.anti_thesis (Step3 Phase A output)
 * 2. interpretation agent's alternative_view (LEVEL1A discussionHooks)
 * 3. divergenceNote from multi-agent analysis
 *
 * Returns deduplicated list, max 5 items.
 */
export function extractCounterarguments(
  antiThesis: string | undefined,
  multiAgentResult: MultiAgentResult | undefined,
): string[] {
  const items: string[] = [];

  // Source 1: anti_thesis from answerObject
  if (antiThesis && antiThesis.trim().length > 10) {
    items.push(antiThesis.trim());
  }

  // Source 2: interpretation agent's alternative_view
  const altView = multiAgentResult?.discussionHooks?.alternative_view;
  if (altView && altView.trim().length > 5) {
    items.push(altView.trim());
  }

  // Source 3: divergenceNote (signals disagreement between agents)
  const divergence = multiAgentResult?.divergenceNote;
  if (divergence && divergence.trim().length > 5) {
    items.push(`信号分歧: ${divergence.trim()}`);
  }

  // Deduplicate by content similarity (simple exact dedup)
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

// ── Output mode determination ─────────────────────────────────────────────────

/**
 * determineOutputMode
 *
 * Maps evidence score + intent to output mode.
 * Overrides evidenceValidator's outputMode when intent is "discussion".
 */
export function determineOutputMode(
  evidenceScore: number,
  intent: IntentContext,
  existingOutputMode: "decisive" | "directional" | "framework_only",
): "decisive" | "directional" | "framework_only" {
  // Discussion mode always uses framework_only (open-ended)
  if (intent.interaction_mode === "discussion") return "framework_only";
  // Defer to evidenceValidator's outputMode for execution mode
  return existingOutputMode;
}

// ── Synthesis instructions builder ───────────────────────────────────────────

/**
 * buildSynthesisInstructions
 *
 * Generates intent-specific synthesis instructions injected into Step3 prompt.
 * These instructions guide GPT to tailor output format and emphasis.
 */
export function buildSynthesisInstructions(
  intent: IntentContext,
  plan: ResearchPlan,
  outputMode: "decisive" | "directional" | "framework_only",
): string {
  const lines: string[] = [];

  // Base instruction by output mode
  if (outputMode === "decisive") {
    lines.push("OUTPUT_MODE=DECISIVE: 必须给出明确的方向性判断，避免模糊措辞。");
  } else if (outputMode === "directional") {
    lines.push("OUTPUT_MODE=DIRECTIONAL: 给出倾向性判断，但需标注关键不确定性。");
  } else {
    lines.push("OUTPUT_MODE=FRAMEWORK_ONLY: 构建分析框架，不强求结论，重点呈现多方观点。");
  }

  // Intent-specific emphasis
  if (intent.risk_focus) {
    lines.push("RISK_FOCUS=TRUE: 在 risks 数组中至少包含 3 个具体风险，每个风险必须标注 magnitude。");
  }
  if (intent.growth_focus) {
    lines.push("GROWTH_FOCUS=TRUE: key_findings 中必须包含增速相关数据点（revenue_growth / EPS_growth / forward_pe）。");
  }
  if (intent.comparison_needed) {
    lines.push("COMPARISON_NEEDED=TRUE: verdict 中必须包含与同行/基准的相对表现对比。");
  }
  if (intent.time_mode === "historical") {
    lines.push("TIME_MODE=HISTORICAL: 分析重点为长期趋势和历史对比，避免过度强调短期价格。");
  }
  if (intent.time_mode === "realtime") {
    lines.push("TIME_MODE=REALTIME: 优先使用最新价格数据，标注数据时间戳。");
  }

  // Hypothesis coverage check
  const highPriorityHyps = plan.hypotheses.filter(h => h.priority === "high");
  if (highPriorityHyps.length > 0) {
    lines.push(`HYPOTHESIS_COVERAGE: 综合结论必须明确回应以下假设: ${highPriorityHyps.map(h => h.id + ": " + h.statement).join(" | ")}`);
  }

  // Counterargument requirement
  lines.push("COUNTERARGUMENTS: 必须在 anti_thesis 字段中提供至少 1 个对立论点，不得留空。");

  return lines.join("\n");
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * buildSynthesisEnrichment
 *
 * Produces SynthesisEnrichment from intent + plan + multi-agent result.
 * Called after multi-agent analysis, before Step3 prompt construction.
 *
 * @param intent  IntentContext from Phase1
 * @param plan  ResearchPlan from Phase2
 * @param multiAgentResult  MultiAgentResult (may be undefined for quick mode)
 * @param antiThesis  anti_thesis from answerObject Phase A (may be undefined)
 * @param evidenceScore  Evidence quality score from evidenceValidator
 * @param existingOutputMode  outputMode from evidenceValidator
 */
export function buildSynthesisEnrichment(
  intent: IntentContext,
  plan: ResearchPlan,
  multiAgentResult: MultiAgentResult | undefined,
  antiThesis: string | undefined,
  evidenceScore: number,
  existingOutputMode: "decisive" | "directional" | "framework_only",
): SynthesisEnrichment {
  const output_mode = determineOutputMode(evidenceScore, intent, existingOutputMode);
  const counterarguments = extractCounterarguments(antiThesis, multiAgentResult);
  const synthesis_instructions = buildSynthesisInstructions(intent, plan, output_mode);

  // Confidence note
  let confidence_note = "";
  if (evidenceScore >= 70) {
    confidence_note = `证据质量充足 (score=${evidenceScore})，可支持高置信度结论。`;
  } else if (evidenceScore >= 50) {
    confidence_note = `证据质量部分 (score=${evidenceScore})，结论应标注关键数据缺口。`;
  } else {
    confidence_note = `证据质量不足 (score=${evidenceScore})，结论必须保守，明确标注数据限制。`;
  }

  if (multiAgentResult?.divergenceNote) {
    confidence_note += ` 多角色分歧: ${multiAgentResult.divergenceNote}`;
  }

  return {
    counterarguments,
    confidence_note,
    output_mode,
    synthesis_instructions,
  };
}

/**
 * formatSynthesisEnrichmentForPrompt
 *
 * Serializes SynthesisEnrichment into a compact prompt injection block.
 * Injected into Step3 prompt alongside INTENT_CONTEXT and RESEARCH_PLAN.
 */
export function formatSynthesisEnrichmentForPrompt(enrichment: SynthesisEnrichment): string {
  const counterargsBlock = enrichment.counterarguments.length > 0
    ? enrichment.counterarguments.map((c, i) => `  [CA${i + 1}] ${c}`).join("\n")
    : "  (none — must generate at least one in anti_thesis)";

  return `[SYNTHESIS_ENRICHMENT | LEVEL1A]
OUTPUT_MODE: ${enrichment.output_mode}
CONFIDENCE_NOTE: ${enrichment.confidence_note}
COUNTERARGUMENTS_POOL:
${counterargsBlock}
SYNTHESIS_INSTRUCTIONS:
${enrichment.synthesis_instructions}
[/SYNTHESIS_ENRICHMENT]`;
}
