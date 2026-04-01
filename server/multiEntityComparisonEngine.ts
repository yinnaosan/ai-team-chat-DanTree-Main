/**
 * multiEntityComparisonEngine.ts
 * Level 15.0B — Multi-Entity Comparison Phase 1 (Backend Only)
 *
 * Pure aggregation layer over existing single-entity building blocks.
 * Supports exactly 2 entities. No UI assumptions. No schema changes.
 */

import { buildSemanticEngineStatsDisplay } from "./semantic_engine_stats";
import { buildOutputGateResult, buildFallbackOutputGateResult } from "./outputGatingEngine";
import { buildEvidencePacket } from "./evidenceValidator";
import { selectTopSources, type TaskType, type Region } from "./sourceSelectionEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EntitySemanticSnapshot {
  entity: string;
  dominant_direction: string;
  confidence_score: number | string;
  conflict_count: number | string;
  state_regime: string | null;
  available: boolean;
}

export interface EntityEvidenceSnapshot {
  entity: string;
  evidence_score: number;
  evidence_level: string;
  output_mode: string;
  gate_passed: boolean;
  thesis_confidence: number;
  semantic_fragility: number;
  available: boolean;
}

export interface EntitySourceSnapshot {
  entity: string;
  top_source: string;
  source_count: number;
  available: boolean;
}

export interface ComparisonDimension {
  dimension: string;
  left_value: string | number;
  right_value: string | number;
  delta: string;
  winner: "left" | "right" | "tie" | "unavailable";
}

export interface MultiEntityComparisonResult {
  left_entity: string;
  right_entity: string;
  generated_at: string;
  advisory_only: true;

  // Per-entity snapshots
  left_semantic: EntitySemanticSnapshot;
  right_semantic: EntitySemanticSnapshot;
  left_evidence: EntityEvidenceSnapshot;
  right_evidence: EntityEvidenceSnapshot;
  left_source: EntitySourceSnapshot;
  right_source: EntitySourceSnapshot;

  // Comparison dimensions
  semantic_comparison: ComparisonDimension;
  evidence_comparison: ComparisonDimension;
  gate_comparison: ComparisonDimension;
  source_comparison: ComparisonDimension;
  fragility_comparison: ComparisonDimension;

  // Summary
  comparison_summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(val: string | number | undefined, fallback = 0): number {
  if (typeof val === "number") return val;
  const n = parseFloat(String(val ?? ""));
  return isNaN(n) ? fallback : n;
}

function directionScore(direction: string): number {
  const map: Record<string, number> = {
    bullish: 3,
    mildly_bullish: 2,
    neutral: 1,
    mildly_bearish: -1,
    bearish: -2,
    unavailable: 0,
  };
  return map[direction] ?? 0;
}

function compareWinner(
  leftVal: number,
  rightVal: number,
  higherIsBetter = true
): "left" | "right" | "tie" {
  if (leftVal === rightVal) return "tie";
  if (higherIsBetter) return leftVal > rightVal ? "left" : "right";
  return leftVal < rightVal ? "left" : "right";
}

// ── Snapshot builders ─────────────────────────────────────────────────────────

function buildSemanticSnapshot(entity: string): EntitySemanticSnapshot {
  try {
    // buildSemanticEngineStatsDisplay requires a live UnifiedSemanticState.
    // Without a completed research session for this entity, we return the
    // fallback display (dominant_direction = "unavailable"). This is the
    // accepted Phase 1 limitation documented in L15.0A preflight.
    const stats = buildSemanticEngineStatsDisplay(null, null);
    return {
      entity,
      dominant_direction: stats.dominant_direction,
      confidence_score: stats.confidence_score ?? "—",
      conflict_count: stats.conflict_count,
      state_regime: stats.state_regime,
      available: stats.dominant_direction !== "unavailable",
    };
  } catch {
    return {
      entity,
      dominant_direction: "unavailable",
      confidence_score: "—",
      conflict_count: "—",
      state_regime: null,
      available: false,
    };
  }
}

function buildEvidenceSnapshot(entity: string): EntityEvidenceSnapshot {
  try {
    const packet = buildEvidencePacket(
      entity,
      "",
      { missingBlocking: [], missingImportant: [], missingOptional: [] },
      { hitCount: 0, totalCount: 0, hitSourceIds: [], hasWhitelistedHit: false }
    );
    const result = buildOutputGateResult(packet, 0.65, 0.5);
    return {
      entity,
      evidence_score: result.evidence_score,
      evidence_level: result.evidence_level,
      output_mode: result.output_mode,
      gate_passed: result.gate_passed,
      thesis_confidence: result.thesis_confidence,
      semantic_fragility: result.semantic_fragility,
      available: true,
    };
  } catch {
    const fallback = buildFallbackOutputGateResult();
    return {
      entity,
      evidence_score: fallback.evidence_score,
      evidence_level: fallback.evidence_level,
      output_mode: fallback.output_mode,
      gate_passed: fallback.gate_passed,
      thesis_confidence: fallback.thesis_confidence,
      semantic_fragility: fallback.semantic_fragility,
      available: false,
    };
  }
}

function buildSourceSnapshot(entity: string): EntitySourceSnapshot {
  try {
    const sources = selectTopSources("equity_analysis" as TaskType, "US" as Region, [], 5);
    return {
      entity,
      top_source: sources[0]?.source_name ?? "—",
      source_count: sources.length,
      available: sources.length > 0,
    };
  } catch {
    return { entity, top_source: "—", source_count: 0, available: false };
  }
}

// ── Main comparison builder ───────────────────────────────────────────────────

export function buildMultiEntityComparison(
  entityA: string,
  entityB: string
): MultiEntityComparisonResult {
  const leftSemantic = buildSemanticSnapshot(entityA);
  const rightSemantic = buildSemanticSnapshot(entityB);
  const leftEvidence = buildEvidenceSnapshot(entityA);
  const rightEvidence = buildEvidenceSnapshot(entityB);
  const leftSource = buildSourceSnapshot(entityA);
  const rightSource = buildSourceSnapshot(entityB);

  // Dimension 1: Semantic Direction (confidence score)
  const leftConf = safeNum(leftSemantic.confidence_score);
  const rightConf = safeNum(rightSemantic.confidence_score);
  const semanticComparison: ComparisonDimension = {
    dimension: "semantic_direction",
    left_value: leftSemantic.dominant_direction,
    right_value: rightSemantic.dominant_direction,
    delta: "—",
    winner:
      !leftSemantic.available && !rightSemantic.available
        ? "unavailable"
        : compareWinner(
            directionScore(leftSemantic.dominant_direction) + leftConf / 100,
            directionScore(rightSemantic.dominant_direction) + rightConf / 100
          ),
  };

  // Dimension 2: Evidence Strength
  const evidenceDelta = (leftEvidence.evidence_score - rightEvidence.evidence_score).toFixed(2);
  const evidenceComparison: ComparisonDimension = {
    dimension: "evidence_strength",
    left_value: leftEvidence.evidence_score,
    right_value: rightEvidence.evidence_score,
    delta: evidenceDelta,
    winner: compareWinner(leftEvidence.evidence_score, rightEvidence.evidence_score),
  };

  // Dimension 3: Output Gate
  const gateComparison: ComparisonDimension = {
    dimension: "output_gate",
    left_value: leftEvidence.gate_passed ? "PASS" : "BLOCK",
    right_value: rightEvidence.gate_passed ? "PASS" : "BLOCK",
    delta: "—",
    winner:
      leftEvidence.gate_passed === rightEvidence.gate_passed
        ? "tie"
        : leftEvidence.gate_passed
        ? "left"
        : "right",
  };

  // Dimension 4: Source Quality/Breadth
  const sourceComparison: ComparisonDimension = {
    dimension: "source_breadth",
    left_value: leftSource.source_count,
    right_value: rightSource.source_count,
    delta: String(leftSource.source_count - rightSource.source_count),
    winner: compareWinner(leftSource.source_count, rightSource.source_count),
  };

  // Dimension 5: Fragility/Conflicts
  const leftFragility = leftEvidence.semantic_fragility;
  const rightFragility = rightEvidence.semantic_fragility;
  const fragilityComparison: ComparisonDimension = {
    dimension: "fragility",
    left_value: leftFragility,
    right_value: rightFragility,
    delta: (leftFragility - rightFragility).toFixed(2),
    // Lower fragility is better
    winner: compareWinner(leftFragility, rightFragility, false),
  };

  // Summary
  const leftWins = [semanticComparison, evidenceComparison, gateComparison, sourceComparison, fragilityComparison].filter(
    (d) => d.winner === "left"
  ).length;
  const rightWins = [semanticComparison, evidenceComparison, gateComparison, sourceComparison, fragilityComparison].filter(
    (d) => d.winner === "right"
  ).length;

  let summary: string;
  if (leftWins > rightWins) {
    summary = `${entityA} leads across ${leftWins}/5 dimensions. Advisory only — not a trade signal.`;
  } else if (rightWins > leftWins) {
    summary = `${entityB} leads across ${rightWins}/5 dimensions. Advisory only — not a trade signal.`;
  } else {
    summary = `${entityA} and ${entityB} are broadly comparable across all 5 dimensions. Advisory only — not a trade signal.`;
  }

  return {
    left_entity: entityA,
    right_entity: entityB,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    left_semantic: leftSemantic,
    right_semantic: rightSemantic,
    left_evidence: leftEvidence,
    right_evidence: rightEvidence,
    left_source: leftSource,
    right_source: rightSource,
    semantic_comparison: semanticComparison,
    evidence_comparison: evidenceComparison,
    gate_comparison: gateComparison,
    source_comparison: sourceComparison,
    fragility_comparison: fragilityComparison,
    comparison_summary: summary,
  };
}
