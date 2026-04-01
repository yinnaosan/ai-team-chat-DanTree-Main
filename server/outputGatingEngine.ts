/**
 * [LEVEL13.2-B] Output Gating Result Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrapper that aggregates existing evidence/confidence signals into a
 * single read-only OutputGateResult object.
 *
 * DOES NOT rewrite or duplicate evidenceValidator.ts logic.
 * Reads from: EvidencePacket (evidenceValidator.ts), thesis_confidence
 * (deepResearchEngine.ts), semantic_fragility (synthesisController.ts).
 *
 * advisory_only: all outputs are advisory.
 */

import type { EvidencePacket } from "./evidenceValidator";

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT GATE RESULT
// ─────────────────────────────────────────────────────────────────────────────

export interface OutputGateResult {
  /** Evidence score 0–100 (from EvidencePacket.evidenceScore) */
  evidence_score: number;
  /** Evidence level (from EvidencePacket.evidenceLevel) */
  evidence_level: "sufficient" | "partial" | "insufficient";
  /** Output mode (from EvidencePacket.outputMode) */
  output_mode: "decisive" | "directional" | "framework_only";
  /** Thesis confidence 0–1 (from buildInvestmentThesis) */
  thesis_confidence: number;
  /** Semantic fragility 0–1 (from SynthesisSemanticEnvelope.state_fragility) */
  semantic_fragility: number;
  /** Whether investment advice is allowed (from EvidencePacket.allowInvestmentAdvice) */
  allow_investment_advice: boolean;
  /** Gate passed: evidence_score >= 40 && no blocking missing fields */
  gate_passed: boolean;
  /** Human-readable explanation of gate decision */
  gate_reason: string;
  /** Blocking missing fields (from EvidencePacket.missingBlocking) */
  blocking_fields: string[];
  /** Number of data conflicts (from EvidencePacket.conflictList.length) */
  conflict_count: number;
  /** Data freshness label (from EvidencePacket.freshnessLabel) */
  freshness: "realtime" | "latest_available" | "recent" | "stale";
  /** advisory_only flag — all outputs are advisory */
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an OutputGateResult from existing engine outputs.
 * Pure aggregation — no new computation.
 *
 * @param packet - EvidencePacket from buildEvidencePacket()
 * @param thesisConfidence - 0–1 from buildInvestmentThesis().thesis_confidence
 * @param semanticFragility - 0–1 from SynthesisSemanticEnvelope.state_fragility (default 0.5 if unavailable)
 */
export function buildOutputGateResult(
  packet: EvidencePacket,
  thesisConfidence: number,
  semanticFragility: number = 0.5
): OutputGateResult {
  const hasBlockingMissing = packet.missingBlocking.length > 0;
  const gate_passed = packet.evidenceScore >= 40 && !hasBlockingMissing;

  let gate_reason: string;
  if (gate_passed) {
    if (packet.evidenceScore >= 70) {
      gate_reason = `Gate passed — strong evidence (score: ${packet.evidenceScore}/100, mode: ${packet.outputMode})`;
    } else {
      gate_reason = `Gate passed — partial evidence (score: ${packet.evidenceScore}/100, mode: ${packet.outputMode})`;
    }
  } else if (hasBlockingMissing) {
    gate_reason = `Gate blocked — ${packet.missingBlocking.length} blocking field(s) missing: ${packet.missingBlocking.slice(0, 2).join(", ")}${packet.missingBlocking.length > 2 ? "..." : ""}`;
  } else {
    gate_reason = `Gate blocked — insufficient evidence (score: ${packet.evidenceScore}/100, threshold: 40)`;
  }

  return {
    evidence_score: packet.evidenceScore,
    evidence_level: packet.evidenceLevel,
    output_mode: packet.outputMode,
    thesis_confidence: Math.min(1, Math.max(0, thesisConfidence)),
    semantic_fragility: Math.min(1, Math.max(0, semanticFragility)),
    allow_investment_advice: packet.allowInvestmentAdvice,
    gate_passed,
    gate_reason,
    blocking_fields: packet.missingBlocking,
    conflict_count: packet.conflictList.length,
    freshness: packet.freshnessLabel,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK (for stats query when no live packet is available)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a safe fallback OutputGateResult for use in tRPC stats queries
 * when no live EvidencePacket is available (e.g., no active research session).
 */
export function buildFallbackOutputGateResult(): OutputGateResult {
  return {
    evidence_score: 0,
    evidence_level: "insufficient",
    output_mode: "framework_only",
    thesis_confidence: 0,
    semantic_fragility: 0.5,
    allow_investment_advice: false,
    gate_passed: false,
    gate_reason: "No active research session — fallback state",
    blocking_fields: [],
    conflict_count: 0,
    freshness: "stale",
    advisory_only: true,
  };
}
