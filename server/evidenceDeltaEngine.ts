/**
 * DANTREE_LEVEL2 Phase4: Evidence Delta Engine
 * Computes the delta between Level1 and Level2 evidence.
 * Determines how much the second pass changed the evidence picture.
 */

import type { FinalOutputSchema } from "./outputSchemaValidator";
import type { SecondPassOutput } from "./secondPassExecutionWrapper";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvidenceDelta {
  // Quantitative delta
  evidence_score_before: number;
  evidence_score_after: number;
  evidence_score_delta: number;         // Positive = improved

  // Qualitative delta
  confidence_before: "high" | "medium" | "low";
  confidence_after: "high" | "medium" | "low";
  confidence_changed: boolean;

  // Verdict delta
  verdict_update: "confirms" | "weakens" | "refutes" | "neutral";
  verdict_stability: "stable" | "shifted" | "reversed";

  // New information
  new_evidence_count: number;
  new_risk_introduced: boolean;
  net_supporting_evidence: number;     // Supporting - contradicting evidence count
  net_contradicting_evidence: number;

  // Convergence signal
  convergence_signal: "converged" | "diverged" | "inconclusive";
  convergence_reason: string;
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Compute the evidence delta between Level1 and Level2 outputs.
 */
export function computeEvidenceDelta(params: {
  level1Output: FinalOutputSchema;
  secondPassOutput: SecondPassOutput;
  evidenceScoreBefore: number;
}): EvidenceDelta {
  const { level1Output, secondPassOutput, evidenceScoreBefore } = params;

  // ── Confidence delta ──────────────────────────────────────────────────────
  const confidenceBefore = level1Output.confidence;
  const confidenceAfter = computeNewConfidence(
    confidenceBefore,
    secondPassOutput.confidence_delta,
    secondPassOutput.verdict_update
  );
  const confidenceChanged = confidenceBefore !== confidenceAfter;

  // ── Evidence score delta ──────────────────────────────────────────────────
  const evidenceScoreDelta = computeScoreDelta(
    secondPassOutput.evidence_items,
    secondPassOutput.verdict_update,
    secondPassOutput.confidence_delta
  );
  const evidenceScoreAfter = Math.min(1.0, Math.max(0.0, evidenceScoreBefore + evidenceScoreDelta));

  // ── Verdict stability ─────────────────────────────────────────────────────
  const verdictStability = computeVerdictStability(secondPassOutput.verdict_update);

  // ── Net evidence counts ───────────────────────────────────────────────────
  const supporting = secondPassOutput.evidence_items.filter(e => e.supports_thesis).length;
  const contradicting = secondPassOutput.evidence_items.filter(e => !e.supports_thesis).length;

  // ── Convergence signal ────────────────────────────────────────────────────
  const { convergenceSignal, convergenceReason } = computeConvergenceSignal({
    verdictUpdate: secondPassOutput.verdict_update,
    confidenceDelta: secondPassOutput.confidence_delta,
    evidenceScoreDelta,
    newRiskFound: secondPassOutput.new_risk_found,
    confidenceAfter,
  });

  return {
    evidence_score_before: evidenceScoreBefore,
    evidence_score_after: evidenceScoreAfter,
    evidence_score_delta: evidenceScoreDelta,
    confidence_before: confidenceBefore,
    confidence_after: confidenceAfter,
    confidence_changed: confidenceChanged,
    verdict_update: secondPassOutput.verdict_update,
    verdict_stability: verdictStability,
    new_evidence_count: secondPassOutput.evidence_items.length,
    new_risk_introduced: secondPassOutput.new_risk_found,
    net_supporting_evidence: supporting,
    net_contradicting_evidence: contradicting,
    convergence_signal: convergenceSignal,
    convergence_reason: convergenceReason,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeNewConfidence(
  before: "high" | "medium" | "low",
  delta: "improved" | "unchanged" | "degraded",
  verdictUpdate: "confirms" | "weakens" | "refutes" | "neutral"
): "high" | "medium" | "low" {
  const levels: Array<"low" | "medium" | "high"> = ["low", "medium", "high"];
  const idx = levels.indexOf(before);

  if (verdictUpdate === "refutes") {
    // Refutation always degrades confidence
    return levels[Math.max(0, idx - 1)];
  }

  if (delta === "improved" && verdictUpdate === "confirms") {
    return levels[Math.min(2, idx + 1)];
  }

  if (delta === "degraded" || verdictUpdate === "weakens") {
    return levels[Math.max(0, idx - 1)];
  }

  return before;
}

function computeScoreDelta(
  evidenceItems: SecondPassOutput["evidence_items"],
  verdictUpdate: "confirms" | "weakens" | "refutes" | "neutral",
  confidenceDelta: "improved" | "unchanged" | "degraded"
): number {
  if (evidenceItems.length === 0) return 0;

  // Base delta from verdict update
  const verdictDeltaMap: Record<string, number> = {
    confirms: 0.08,
    neutral: 0.0,
    weakens: -0.05,
    refutes: -0.12,
  };
  let delta = verdictDeltaMap[verdictUpdate] ?? 0;

  // Adjust by evidence strength
  const strongSupporting = evidenceItems.filter(e => e.supports_thesis && e.strength === "strong").length;
  const strongContra = evidenceItems.filter(e => !e.supports_thesis && e.strength === "strong").length;
  delta += strongSupporting * 0.03;
  delta -= strongContra * 0.03;

  // Adjust by confidence delta
  if (confidenceDelta === "improved") delta += 0.03;
  if (confidenceDelta === "degraded") delta -= 0.03;

  return Math.max(-0.20, Math.min(0.20, delta));
}

function computeVerdictStability(
  verdictUpdate: "confirms" | "weakens" | "refutes" | "neutral"
): "stable" | "shifted" | "reversed" {
  if (verdictUpdate === "confirms" || verdictUpdate === "neutral") return "stable";
  if (verdictUpdate === "weakens") return "shifted";
  return "reversed"; // refutes
}

function computeConvergenceSignal(params: {
  verdictUpdate: "confirms" | "weakens" | "refutes" | "neutral";
  confidenceDelta: "improved" | "unchanged" | "degraded";
  evidenceScoreDelta: number;
  newRiskFound: boolean;
  confidenceAfter: "high" | "medium" | "low";
}): { convergenceSignal: "converged" | "diverged" | "inconclusive"; convergenceReason: string } {
  const { verdictUpdate, confidenceDelta, evidenceScoreDelta, newRiskFound, confidenceAfter } = params;

  // Converged: thesis confirmed, confidence improved or high, no new critical risk
  if (
    verdictUpdate === "confirms" &&
    (confidenceDelta === "improved" || confidenceAfter === "high") &&
    !newRiskFound
  ) {
    return {
      convergenceSignal: "converged",
      convergenceReason: "Second pass confirms thesis with improved evidence. No new risks. Loop complete.",
    };
  }

  // Also converged: neutral finding with acceptable confidence
  if (verdictUpdate === "neutral" && confidenceAfter !== "low" && evidenceScoreDelta >= -0.02) {
    return {
      convergenceSignal: "converged",
      convergenceReason: "Second pass found no material new information. Original thesis stands.",
    };
  }

  // Diverged: thesis refuted or significantly weakened
  if (verdictUpdate === "refutes" || (verdictUpdate === "weakens" && newRiskFound)) {
    return {
      convergenceSignal: "diverged",
      convergenceReason: `Second pass ${verdictUpdate === "refutes" ? "refuted" : "significantly weakened"} the original thesis${newRiskFound ? " and introduced a new risk" : ""}. Verdict update required.`,
    };
  }

  // Inconclusive: mixed signals
  return {
    convergenceSignal: "inconclusive",
    convergenceReason: `Second pass produced mixed signals (verdict: ${verdictUpdate}, confidence: ${confidenceDelta}). Proceeding with best available synthesis.`,
  };
}
