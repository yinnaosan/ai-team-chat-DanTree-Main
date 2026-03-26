/**
 * DANTREE_LEVEL2 Phase5: Verdict Updater
 * Updates the Level1 verdict based on the second pass evidence delta.
 * Produces a final merged verdict that reflects both passes.
 */

import type { FinalOutputSchema, RiskItem } from "./outputSchemaValidator";
import type { SecondPassOutput } from "./secondPassExecutionWrapper";
import type { EvidenceDelta } from "./evidenceDeltaEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpdatedVerdict {
  // Core verdict
  final_verdict: string;
  final_confidence: "high" | "medium" | "low";
  verdict_changed: boolean;

  // Change narrative
  change_narrative: string;           // One sentence explaining what changed
  change_type: "reinforced" | "qualified" | "reversed" | "unchanged";

  // Merged evidence
  merged_key_evidence: string[];      // Level1 + Level2 key evidence (deduplicated)
  merged_risks: RiskItem[];  // Level1 + any new Level2 risks

  // Second pass contribution
  second_pass_contribution: string;   // What the second pass added
  second_pass_finding: string;        // The targeted finding from second pass
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Merge Level1 output with second pass results to produce an updated verdict.
 */
export function updateVerdict(params: {
  level1Output: FinalOutputSchema;
  secondPassOutput: SecondPassOutput;
  evidenceDelta: EvidenceDelta;
}): UpdatedVerdict {
  const { level1Output, secondPassOutput, evidenceDelta } = params;

  // ── Determine change type ─────────────────────────────────────────────────
  const changeType = computeChangeType(secondPassOutput.verdict_update, evidenceDelta);

  // ── Build final verdict ───────────────────────────────────────────────────
  const finalVerdict = buildFinalVerdict(
    level1Output.verdict,
    secondPassOutput,
    evidenceDelta,
    changeType
  );

  // ── Build change narrative ────────────────────────────────────────────────
  const changeNarrative = buildChangeNarrative(
    changeType,
    evidenceDelta,
    secondPassOutput.targeted_finding,
    level1Output.confidence,
    evidenceDelta.confidence_after
  );

  // ── Merge evidence ────────────────────────────────────────────────────────
  const mergedKeyEvidence = mergeEvidence(
    level1Output.bull_case,
    secondPassOutput.evidence_items
  );

  // ── Merge risks ───────────────────────────────────────────────────────────
  const mergedRisks = mergeRisks(level1Output.risks, secondPassOutput);

  // ── Second pass contribution ──────────────────────────────────────────────
  const contribution = buildContribution(changeType, secondPassOutput, evidenceDelta);

  return {
    final_verdict: finalVerdict,
    final_confidence: evidenceDelta.confidence_after,
    verdict_changed: changeType !== "unchanged",
    change_narrative: changeNarrative,
    change_type: changeType,
    merged_key_evidence: mergedKeyEvidence,
    merged_risks: mergedRisks,
    second_pass_contribution: contribution,
    second_pass_finding: secondPassOutput.targeted_finding,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeChangeType(
  verdictUpdate: SecondPassOutput["verdict_update"],
  delta: EvidenceDelta
): UpdatedVerdict["change_type"] {
  if (verdictUpdate === "refutes") return "reversed";
  if (verdictUpdate === "weakens") return "qualified";
  if (verdictUpdate === "confirms" && delta.confidence_changed) return "reinforced";
  return "unchanged";
}

function buildFinalVerdict(
  originalVerdict: string,
  secondPass: SecondPassOutput,
  delta: EvidenceDelta,
  changeType: UpdatedVerdict["change_type"]
): string {
  const confidencePrefix = delta.confidence_after === "low"
    ? "[低置信度] "
    : delta.confidence_after === "medium"
    ? "[方向性判断] "
    : "";

  switch (changeType) {
    case "reversed":
      // Verdict refuted — prepend reversal signal
      return `${confidencePrefix}[二次分析修正] ${secondPass.targeted_finding}`;

    case "qualified":
      // Verdict weakened — add qualification
      return `${confidencePrefix}${originalVerdict}（注：${secondPass.targeted_finding}）`;

    case "reinforced":
      // Verdict confirmed with higher confidence — strengthen wording
      return originalVerdict.replace(/^\[方向性判断\] /, "").replace(/^\[低置信度方向性判断\] /, "");

    case "unchanged":
    default:
      return originalVerdict;
  }
}

function buildChangeNarrative(
  changeType: UpdatedVerdict["change_type"],
  delta: EvidenceDelta,
  targetedFinding: string,
  confidenceBefore: string,
  confidenceAfter: string
): string {
  const confidenceChange = confidenceBefore !== confidenceAfter
    ? `置信度从 ${confidenceBefore} 变为 ${confidenceAfter}。`
    : "";

  switch (changeType) {
    case "reversed":
      return `二次分析推翻了初始判断：${targetedFinding}。${confidenceChange}`;
    case "qualified":
      return `二次分析对初始判断提出了重要修正：${targetedFinding}。${confidenceChange}`;
    case "reinforced":
      return `二次分析强化了初始判断：${targetedFinding}。${confidenceChange}`;
    case "unchanged":
    default:
      return `二次分析未发现实质性新信息，初始判断维持不变。${confidenceChange}`;
  }
}

function mergeEvidence(
  level1Evidence: string[],
  secondPassItems: SecondPassOutput["evidence_items"]
): string[] {
  const secondPassStrong = secondPassItems
    .filter(e => e.strength === "strong")
    .map(e => e.claim);

  const secondPassModerate = secondPassItems
    .filter(e => e.strength === "moderate")
    .map(e => e.claim);

  // Merge: Level1 evidence + strong second pass evidence + moderate second pass
  const merged = [
    ...level1Evidence.slice(0, 4),
    ...secondPassStrong.slice(0, 2),
    ...secondPassModerate.slice(0, 1),
  ];

  // Deduplicate by similarity (simple: remove exact duplicates)
  return Array.from(new Set(merged)).slice(0, 6);
}

function mergeRisks(
  level1Risks: RiskItem[],
  secondPass: SecondPassOutput
): RiskItem[] {
  const merged = [...level1Risks];

  if (secondPass.new_risk_found && secondPass.new_risk_description) {
    // Add new risk from second pass (marked as second-pass discovered)
    merged.push({
      description: `[二次分析发现] ${secondPass.new_risk_description}`,
      magnitude: "high",  // New risks from second pass are treated as high by default
      reason: "Identified during second reasoning pass",
    });
  }

  return merged;
}

function buildContribution(
  changeType: UpdatedVerdict["change_type"],
  secondPass: SecondPassOutput,
  delta: EvidenceDelta
): string {
  const evidenceCount = secondPass.evidence_items.length;
  const strongCount = secondPass.evidence_items.filter(e => e.strength === "strong").length;

  const base = `二次分析提供了 ${evidenceCount} 条新证据（${strongCount} 条强证据），证据分数变化：${delta.evidence_score_delta > 0 ? "+" : ""}${(delta.evidence_score_delta * 100).toFixed(1)}%。`;

  switch (changeType) {
    case "reversed":
      return base + " 核心发现推翻了初始判断，需要重新评估投资决策。";
    case "qualified":
      return base + " 核心发现对初始判断提出了重要限制条件。";
    case "reinforced":
      return base + " 核心发现强化了初始判断的可靠性。";
    default:
      return base + " 二次分析未发现实质性新信息。";
  }
}
