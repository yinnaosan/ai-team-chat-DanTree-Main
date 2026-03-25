/**
 * LEVEL1A2 Phase3: Synthesis Structured Controller
 *
 * RULE: This object is the authoritative source for Step3 rendering.
 * RULE: If structured object and prose diverge, structured object wins.
 * RULE: counterarguments, risks, next_steps are MANDATORY.
 * RULE: No new LLM calls — builds from existing data.
 *
 * BUILD ORDER:
 * 1. normalizedTaxonomy (from agentTaxonomyNormalizer)
 * 2. evidenceScore + outputMode (from evidenceValidator)
 * 3. answerObject.anti_thesis (from Phase A, may be null)
 * 4. intentCtx (from intentInterpreter)
 */

import type { NormalizedTaxonomy } from "./agentTaxonomyNormalizer";
import type { IntentContext } from "./intentInterpreter";

// ── Structured Synthesis Object ───────────────────────────────────────────────

export interface StructuredSynthesis {
  verdict: string;
  confidence: "high" | "medium" | "low";
  key_evidence: string[];
  reasoning: string[];
  counterarguments: string[];
  risks: string[];
  next_steps: string[];
  freshness_note: string;
  limitation_note: string;
}

// ── Confidence Mapping ────────────────────────────────────────────────────────

function mapEvidenceToConfidence(
  evidenceScore: number,
  outputMode: string,
  hasBlockingMissing: boolean,
): "high" | "medium" | "low" {
  if (hasBlockingMissing) return "low";
  if (outputMode === "decisive" && evidenceScore >= 70) return "high";
  if (outputMode === "directional" || evidenceScore >= 40) return "medium";
  return "low";
}

// ── Verdict Builder ───────────────────────────────────────────────────────────

function buildVerdict(
  taxonomy: NormalizedTaxonomy,
  antiThesis: string | undefined,
  confidence: "high" | "medium" | "low",
): string {
  // Use valuation premium/discount as primary verdict signal
  const premiumSignal = taxonomy.valuation.premium_or_discount[0];
  if (premiumSignal) {
    const prefix = confidence === "low" ? "[低置信度方向性判断] " : confidence === "medium" ? "[方向性判断] " : "";
    return `${prefix}${premiumSignal}`;
  }

  // Fallback: use first valuation claim
  const firstClaim = taxonomy.valuation.core_claims[0];
  if (firstClaim) {
    return confidence === "low"
      ? `[低置信度] 初步判断: ${firstClaim.slice(0, 100)}`
      : firstClaim.slice(0, 150);
  }

  // Minimal fallback when no agent data
  return antiThesis
    ? `待定 — 主要不确定性: ${antiThesis.slice(0, 100)}`
    : "数据不足，无法形成明确判断";
}

// ── Key Evidence Builder ──────────────────────────────────────────────────────

function buildKeyEvidence(taxonomy: NormalizedTaxonomy): string[] {
  const evidence: string[] = [];

  // Valuation claims first (most relevant for investment decisions)
  evidence.push(...taxonomy.valuation.core_claims.slice(0, 2));

  // Business quality/growth
  evidence.push(...taxonomy.business.quality_claims.slice(0, 1));
  evidence.push(...taxonomy.business.growth_claims.slice(0, 1));

  // Market context (supporting)
  const macroSignal = taxonomy.market_context.macro_signals[0];
  if (macroSignal) evidence.push(`[宏观背景] ${macroSignal}`);

  return evidence.filter(Boolean).slice(0, 5);
}

// ── Reasoning Builder ─────────────────────────────────────────────────────────

function buildReasoning(
  taxonomy: NormalizedTaxonomy,
  intentCtx: IntentContext,
): string[] {
  const reasoning: string[] = [];

  // Build reasoning chain based on task type
  if (intentCtx.task_type === "stock_analysis" || intentCtx.task_type === "event_driven") {
    if (taxonomy.valuation.premium_or_discount.length > 0) {
      reasoning.push(`估值维度: ${taxonomy.valuation.premium_or_discount.join("; ")}`);
    }
    if (taxonomy.business.profitability_claims.length > 0) {
      reasoning.push(`盈利能力: ${taxonomy.business.profitability_claims.join("; ")}`);
    }
    if (taxonomy.market_context.technical_signals.length > 0) {
      reasoning.push(`技术面支撑: ${taxonomy.market_context.technical_signals[0]}`);
    }
  } else if (intentCtx.task_type === "macro_analysis") {
    reasoning.push(...taxonomy.market_context.macro_signals.slice(0, 3));
  }

  // Add conflict note if signals disagree
  if (taxonomy.conflicts.length > 0) {
    reasoning.push(`⚠️ 信号分歧: ${taxonomy.conflicts[0]}`);
  }

  return reasoning.filter(Boolean).slice(0, 4);
}

// ── Counterarguments Builder ──────────────────────────────────────────────────

function buildCounterarguments(
  taxonomy: NormalizedTaxonomy,
  antiThesis: string | undefined,
): string[] {
  const counterargs: string[] = [];

  // Risk challenges to valuation/business (from taxonomy revisions)
  counterargs.push(...taxonomy.revisions.slice(0, 2));

  // Anti-thesis from answer object
  if (antiThesis && antiThesis.length > 10) {
    counterargs.push(`反论: ${antiThesis.slice(0, 200)}`);
  }

  // Conflicts as counterarguments
  counterargs.push(...taxonomy.conflicts.slice(0, 1));

  // Ensure at least one counterargument
  if (counterargs.length === 0) {
    const failurePoint = taxonomy.risk.thesis_failure_points[0];
    if (failurePoint) {
      counterargs.push(`主要反驳点: ${failurePoint}`);
    } else {
      counterargs.push("当前数据不足以形成有力反驳论点，建议补充更多数据后重新评估");
    }
  }

  return counterargs.slice(0, 3);
}

// ── Risks Builder ─────────────────────────────────────────────────────────────

function buildRisks(taxonomy: NormalizedTaxonomy): string[] {
  const risks: string[] = [];

  // Primary: thesis failure points
  risks.push(...taxonomy.risk.thesis_failure_points.slice(0, 2));

  // Secondary: hidden risks
  risks.push(...taxonomy.risk.hidden_risks.slice(0, 1));

  // Valuation-specific risks
  risks.push(...taxonomy.valuation.valuation_risks.slice(0, 1));

  // Ensure at least one risk
  if (risks.length === 0) {
    risks.push("市场流动性风险、宏观政策不确定性");
  }

  return risks.slice(0, 4);
}

// ── Next Steps Builder ────────────────────────────────────────────────────────

function buildNextSteps(
  taxonomy: NormalizedTaxonomy,
  intentCtx: IntentContext,
  confidence: "high" | "medium" | "low",
): string[] {
  const steps: string[] = [];

  if (confidence === "low") {
    steps.push("补充关键缺失数据后重新分析");
    steps.push("关注: " + (taxonomy.risk.invalidation_conditions[0] ?? "核心假设验证"));
  } else if (confidence === "medium") {
    steps.push("持续跟踪以下信号变化");
    if (taxonomy.risk.invalidation_conditions.length > 0) {
      steps.push(`失效条件监控: ${taxonomy.risk.invalidation_conditions[0]}`);
    }
  } else {
    // High confidence
    if (intentCtx.task_type === "stock_analysis") {
      steps.push("建立仓位前确认: 估值安全边际 + 催化剂时间窗口");
    } else {
      steps.push("基于当前分析框架制定具体行动计划");
    }
  }

  // Add data gap next steps
  if (taxonomy.risk.hidden_risks.length > 0) {
    steps.push(`深入调研: ${taxonomy.risk.hidden_risks[0].slice(0, 80)}`);
  }

  return steps.slice(0, 3);
}

// ── Limitation Note Builder ───────────────────────────────────────────────────

function buildLimitationNote(
  evidenceScore: number,
  hasBlockingMissing: boolean,
  outputMode: string,
): string {
  if (hasBlockingMissing) {
    return `[数据限制] 关键字段缺失，当前为低置信度方向性判断，不建议作为主要决策依据`;
  }
  if (evidenceScore < 40) {
    return `[证据不足] 证据评分 ${evidenceScore}/100，结论仅供参考`;
  }
  if (outputMode === "directional") {
    return `[方向性判断] 证据评分 ${evidenceScore}/100，结论具有方向性参考价值`;
  }
  return "";
}

// ── Main Controller ───────────────────────────────────────────────────────────

export function buildStructuredSynthesis(
  taxonomy: NormalizedTaxonomy,
  intentCtx: IntentContext,
  evidenceScore: number,
  outputMode: string,
  hasBlockingMissing: boolean,
  antiThesis: string | undefined,
  ticker?: string | null,
): StructuredSynthesis {
  const confidence = mapEvidenceToConfidence(evidenceScore, outputMode, hasBlockingMissing);
  const verdict = buildVerdict(taxonomy, antiThesis, confidence);
  const key_evidence = buildKeyEvidence(taxonomy);
  const reasoning = buildReasoning(taxonomy, intentCtx);
  const counterarguments = buildCounterarguments(taxonomy, antiThesis);
  const risks = buildRisks(taxonomy);
  const next_steps = buildNextSteps(taxonomy, intentCtx, confidence);
  const limitation_note = buildLimitationNote(evidenceScore, hasBlockingMissing, outputMode);

  const freshness_note = ticker
    ? `分析基于最新可用数据，建议在重大事件（财报、政策变化）后重新评估`
    : `分析基于当前可用数据`;

  return {
    verdict,
    confidence,
    key_evidence,
    reasoning,
    counterarguments,
    risks,
    next_steps,
    freshness_note,
    limitation_note,
  };
}

// ── Prompt Formatter ──────────────────────────────────────────────────────────

export function formatStructuredSynthesisForPrompt(synthesis: StructuredSynthesis): string {
  const lines: string[] = [
    "[STRUCTURED_SYNTHESIS_CONTROLLER | LEVEL1A2]",
    `VERDICT: ${synthesis.verdict}`,
    `CONFIDENCE: ${synthesis.confidence}`,
    "",
    "KEY_EVIDENCE:",
    ...synthesis.key_evidence.map(e => `  - ${e}`),
    "",
    "REASONING_CHAIN:",
    ...synthesis.reasoning.map(r => `  - ${r}`),
    "",
    "COUNTERARGUMENTS (mandatory — must appear in output):",
    ...synthesis.counterarguments.map(c => `  - ${c}`),
    "",
    "RISKS (mandatory — must appear in output):",
    ...synthesis.risks.map(r => `  - ${r}`),
    "",
    "NEXT_STEPS (mandatory — must appear in output):",
    ...synthesis.next_steps.map(s => `  - ${s}`),
    "",
  ];

  if (synthesis.freshness_note) {
    lines.push(`FRESHNESS: ${synthesis.freshness_note}`);
  }
  if (synthesis.limitation_note) {
    lines.push(`LIMITATION: ${synthesis.limitation_note}`);
  }

  lines.push("[/STRUCTURED_SYNTHESIS_CONTROLLER]");
  lines.push("");
  lines.push("SYNTHESIS_RENDER_RULE: Your final answer MUST include all mandatory sections above.");
  lines.push("SYNTHESIS_RENDER_RULE: If structured object and prose diverge, structured object wins.");
  lines.push("SYNTHESIS_RENDER_RULE: Generic summary style is FORBIDDEN.");

  return lines.join("\n");
}
