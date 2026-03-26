/**
 * LEVEL1C: Output Gating Controller (Phase 4)
 *
 * Decides how strong the final answer is allowed to be based on:
 * - EvidenceStrengthReport (from Phase 2)
 * - EvidenceConflictBundle (from Phase 3)
 * - Existing runtime outputMode (from evidenceValidator.ts / buildEvidencePacket)
 *
 * Rule: stricter gating wins — Level1C never relaxes existing Level1A2 gating.
 * Zero new LLM calls. Fully deterministic.
 */

import type { EvidenceStrengthReport, EvidenceConflictBundle } from "./postFetchEvidenceEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AllowedOutputMode = "decisive" | "directional" | "framework_only";
export type ConfidenceCeiling = "high" | "medium" | "low";

export interface OutputGatingDecision {
  allowed_output_mode: AllowedOutputMode;
  confidence_ceiling: ConfidenceCeiling;
  allow_price_target: boolean;
  allow_strong_recommendation: boolean;
  require_disclaimer: boolean;
  gating_reason: string;
}

// ── Gating Logic ──────────────────────────────────────────────────────────────

/**
 * Compute Level1C output gating decision.
 *
 * @param strengthReport   EvidenceStrengthReport from Phase 2
 * @param conflictBundle   EvidenceConflictBundle from Phase 3
 * @param existingMode     Current outputMode from Level1A2 evidencePacket (if any)
 */
export function computeOutputGating(
  strengthReport: EvidenceStrengthReport,
  conflictBundle: EvidenceConflictBundle,
  existingMode?: AllowedOutputMode
): OutputGatingDecision {
  const { tier, blocking_fields_missing, evidence_score } = strengthReport;
  const { major_conflicts, conflict_count } = conflictBundle;

  // Determine if any major conflict affects blocking fields
  const hasCriticalConflict = major_conflicts.some(c =>
    strengthReport.blocking_fields_missing.length === 0 // blocking present but conflicted
      ? false
      : true
  ) || major_conflicts.length > 0;

  // Determine raw Level1C mode
  let level1cMode: AllowedOutputMode;
  let confidenceCeiling: ConfidenceCeiling;
  let allowPriceTarget = false;
  let allowStrongRecommendation = false;
  let requireDisclaimer = false;
  let reason = "";

  if (tier === "strong" && !hasCriticalConflict && blocking_fields_missing.length === 0) {
    // Strong evidence + low conflict → decisive
    level1cMode = "decisive";
    confidenceCeiling = "high";
    allowPriceTarget = true;
    allowStrongRecommendation = true;
    requireDisclaimer = false;
    reason = `Evidence tier=strong (score=${evidence_score.toFixed(2)}), no blocking fields missing, no major conflicts.`;
  } else if (
    (tier === "adequate" || tier === "strong") &&
    major_conflicts.length <= 1 &&
    blocking_fields_missing.length === 0
  ) {
    // Adequate evidence + manageable conflict → directional
    level1cMode = "directional";
    confidenceCeiling = "medium";
    allowPriceTarget = false;
    allowStrongRecommendation = false;
    requireDisclaimer = false;
    reason = `Evidence tier=${tier} (score=${evidence_score.toFixed(2)}), ${major_conflicts.length} major conflict(s), blocking fields present.`;
  } else {
    // Weak evidence OR major unresolved conflict on critical fields → framework_only
    level1cMode = "framework_only";
    confidenceCeiling = "low";
    allowPriceTarget = false;
    allowStrongRecommendation = false;
    requireDisclaimer = true;
    const reasons: string[] = [];
    if (tier === "weak" || tier === "very_weak") reasons.push(`Evidence tier=${tier} (score=${evidence_score.toFixed(2)})`);
    if (blocking_fields_missing.length > 0) reasons.push(`Missing blocking fields: [${blocking_fields_missing.join(", ")}]`);
    if (major_conflicts.length > 1) reasons.push(`${major_conflicts.length} major data conflicts`);
    reason = reasons.join("; ") || "Insufficient evidence quality.";
  }

  // ── Stricter rule wins: merge with existing Level1A2 mode ────────────────
  const modeRank: Record<AllowedOutputMode, number> = {
    decisive: 3,
    directional: 2,
    framework_only: 1,
  };

  let finalMode = level1cMode;
  let finalReason = reason;

  if (existingMode && modeRank[existingMode] < modeRank[level1cMode]) {
    // Existing Level1A2 is stricter → use it
    finalMode = existingMode;
    finalReason = `Level1A2 gating (${existingMode}) is stricter than Level1C (${level1cMode}). Stricter rule applied. Level1C reason: ${reason}`;
    // Adjust ceiling/flags accordingly
    if (existingMode === "framework_only") {
      confidenceCeiling = "low";
      allowPriceTarget = false;
      allowStrongRecommendation = false;
      requireDisclaimer = true;
    } else if (existingMode === "directional") {
      confidenceCeiling = confidenceCeiling === "high" ? "medium" : confidenceCeiling;
      allowPriceTarget = false;
      allowStrongRecommendation = false;
    }
  } else if (existingMode && modeRank[existingMode] > modeRank[level1cMode]) {
    // Level1C is stricter → use Level1C
    finalReason = `Level1C gating (${level1cMode}) is stricter than Level1A2 (${existingMode}). Stricter rule applied. ${reason}`;
  }

  return {
    allowed_output_mode: finalMode,
    confidence_ceiling: confidenceCeiling,
    allow_price_target: allowPriceTarget,
    allow_strong_recommendation: allowStrongRecommendation,
    require_disclaimer: requireDisclaimer,
    gating_reason: finalReason,
  };
}

/**
 * Convert OutputGatingDecision to a Step3 instruction block.
 * Injected into the Step3 system prompt to enforce output strength.
 */
export function buildGatingInstruction(gating: OutputGatingDecision): string {
  const { allowed_output_mode, confidence_ceiling, allow_price_target, allow_strong_recommendation, require_disclaimer, gating_reason } = gating;

  const modeBlock = allowed_output_mode === "decisive"
    ? `[LEVEL1C_GATING: DECISIVE | ceiling=${confidence_ceiling}]
证据质量充分，允许强判断输出。可写明确立场+幅度（如「高估30-40%」「建议增持」）。
${allow_price_target ? "✓ 允许目标价" : "✗ 不允许目标价"}
${allow_strong_recommendation ? "✓ 允许强烈买卖建议" : "✗ 不允许强烈买卖建议"}`
    : allowed_output_mode === "directional"
    ? `[LEVEL1C_GATING: DIRECTIONAL | ceiling=${confidence_ceiling}]
证据部分充分，仅允许方向性判断（「偏高/偏低/中性」「方向性看好/谨慎」）。
禁止具体目标价和强烈买卖建议。每个结论后标注「（仅供参考）」。`
    : `[LEVEL1C_GATING: FRAMEWORK_ONLY | ceiling=${confidence_ceiling}]
证据不足或存在重大冲突，仅允许框架性分析。
禁止任何具体结论、目标价、买卖建议。
${require_disclaimer ? "⚠️ 必须在输出开头添加免责声明：「本分析基于不完整数据，结论仅供参考，不构成投资建议。」" : ""}`;

  return `${modeBlock}
[GATING_REASON]: ${gating_reason}`;
}
