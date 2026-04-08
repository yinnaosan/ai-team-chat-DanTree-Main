/**
 * thesisStateEngine.ts — DanTree Level 18.0-B
 *
 * Thesis / State Tracking Phase 1 — Backend Evaluation Layer
 *
 * Scope (Phase 1 only):
 *   - EntityThesisState: derived from semantic stats + gate + source + alert summary
 *   - BasketThesisState: derived from PortfolioAnalysisResult only
 *   - Pure functions, no side effects
 *   - No DB, no LLM, no scheduler, no persistence, no timeline
 *
 * NOT in Phase 1:
 *   - Comparison thesis tracking (Phase 2)
 *   - Direction-flip / thesis reversal nuance (deferred: OI-L15-003)
 *   - Vector memory, timeline history, execution/timing logic
 *   - UI / routers (Manus handles integration)
 */

import type { AlertSummary, AlertSeverity } from "./alertEngine";
import type {
  PortfolioAnalysisResult,
  DirectionBucket,
} from "./portfolioAnalysisEngine";
import type { SourceSelectionResult, SourceHealth } from "./sourceSelectionEngine";

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOCAL TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export type ThesisStance =
  | "bullish"
  | "bearish"
  | "neutral"
  | "mixed"
  | "unavailable";

export type EvidenceState = "strong" | "moderate" | "weak" | "insufficient";

export type GateState = "pass" | "block" | "fallback";

export type FragilityState = "low" | "medium" | "high" | "critical";

export type SourceState = "healthy" | "degraded" | "unavailable";

export type ThesisChangeMarker =
  | "stable"
  | "strengthening"
  | "weakening"
  | "reversal"
  | "unknown";

export type DominantBasketThesis =
  | "aligned_bullish"
  | "aligned_bearish"
  | "mixed"
  | "divergent"
  | "unavailable";

export type OverlapIntensity = "high" | "medium" | "low" | "none";

export type ConcentrationState = "safe" | "elevated" | "high" | "critical";

export type BasketFragilityState = "low" | "medium" | "high";

export type BasketChangeMarker =
  | "stable"
  | "concentrating"
  | "diverging"
  | "unknown";

// ─────────────────────────────────────────────────────────────────────────────
// 2. INPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SemanticStatsInput — optional semantic stats for entity state derivation.
 * All fields are optional; missing data degrades gracefully.
 */
export interface SemanticStatsInput {
  /** Dominant direction from UnifiedSemanticState */
  dominant_direction?: string | null;
  /** Confidence score [0–1] */
  confidence_score?: number | null;
  /** Confidence fragility [0–1] */
  confidence_fragility?: number | null;
  /** Whether confidence was downgraded */
  confidence_downgraded?: boolean;
}

/**
 * GateResultInput — gate + evidence data for entity state derivation.
 */
export interface GateResultInput {
  /** Whether the gate passed */
  gate_passed: boolean;
  /** True for synthetic/fallback placeholder → gate_state = "fallback" */
  is_synthetic_fallback?: boolean;
  /** Evidence score [0–100] */
  evidence_score?: number | null;
  /** Output mode string from gate evaluation */
  gate_mode?: string | null;
}

/**
 * EntityThesisStateInput — all optional inputs for entity state derivation.
 */
export interface EntityThesisStateInput {
  entity: string;
  semantic_stats?: SemanticStatsInput | null;
  gate_result?: GateResultInput | null;
  source_result?: SourceSelectionResult | null;
  alert_summary?: AlertSummary | null;
  /** Snapshot-derived stance from entity_snapshots.thesis_stance (TVM Writeback) */
  snapshot_stance?: ThesisStance | null;
}

/**
 * BasketThesisStateInput — basket state derived from PortfolioAnalysisResult.
 */
export interface BasketThesisStateInput {
  portfolioResult: PortfolioAnalysisResult | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityThesisState {
  entity: string;
  generated_at: string;
  advisory_only: true;
  current_stance: ThesisStance;
  stance_confidence: number | null;
  evidence_state: EvidenceState;
  evidence_score: number | null;
  gate_state: GateState;
  gate_mode: string | null;
  fragility_state: FragilityState;
  fragility_score: number | null;
  source_state: SourceState;
  top_source: string | null;
  alert_count: number;
  highest_alert_severity: AlertSeverity | null;
  thesis_change_marker: ThesisChangeMarker;
  state_summary_text: string;
}

export interface BasketThesisState {
  entities: string[];
  basket_size: number;
  generated_at: string;
  advisory_only: true;
  dominant_basket_thesis: DominantBasketThesis;
  overlap_intensity: OverlapIntensity;
  concentration_state: ConcentrationState;
  basket_fragility_state: BasketFragilityState;
  shared_fragility_flag: boolean;
  basket_change_marker: BasketChangeMarker;
  basket_state_summary_text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DERIVATION HELPERS — ENTITY
// ─────────────────────────────────────────────────────────────────────────────

function deriveStance(
  semanticStats: SemanticStatsInput | null | undefined
): ThesisStance {
  const dir = semanticStats?.dominant_direction;
  if (!dir) return "unavailable";
  if (dir === "positive") return "bullish";
  if (dir === "negative") return "bearish";
  if (dir === "mixed") return "mixed";
  if (dir === "neutral") return "neutral";
  return "unavailable";
}

function deriveEvidenceState(score: number | null | undefined): EvidenceState {
  if (score == null) return "insufficient";
  if (score >= 70) return "strong";
  if (score >= 50) return "moderate";
  if (score >= 30) return "weak";
  return "insufficient";
}

function deriveGateState(gate: GateResultInput | null | undefined): GateState {
  if (!gate) return "fallback";
  if (gate.is_synthetic_fallback) return "fallback";
  return gate.gate_passed ? "pass" : "block";
}

function deriveFragilityState(
  score: number | null | undefined
): FragilityState {
  if (score == null) return "low";
  if (score > 0.85) return "critical";
  if (score > 0.65) return "high";
  if (score > 0.40) return "medium";
  return "low";
}

function deriveSourceState(
  sourceResult: SourceSelectionResult | null | undefined
): { state: SourceState; topSource: string | null } {
  if (!sourceResult) return { state: "unavailable", topSource: null };

  const selected = sourceResult.selected_sources;
  if (!selected || selected.length === 0) return { state: "unavailable", topSource: null };

  const topSource = selected[0].source_name;

  // Check for any degraded/error routes
  const badHealth: SourceHealth[] = ["degraded", "error"];
  const routeResults = sourceResult.route_results ?? [];
  const hasIssue = routeResults.some((r) =>
    badHealth.includes(r.health)
  );
  const allBad = routeResults.length > 0 && routeResults.every((r) =>
    badHealth.includes(r.health)
  );
  const state: SourceState = allBad ? "degraded" : hasIssue ? "degraded" : "healthy";
  return { state, topSource };
}

function deriveThesisChangeMarker(
  stance: ThesisStance,
  fragility: FragilityState,
  gateState: GateState,
  evidenceState: EvidenceState,
  highestAlertSeverity: AlertSeverity | null
): ThesisChangeMarker {
  if (stance === "unavailable") return "unknown";

  // Reversal signal: gate blocked AND high/critical alerts
  if (
    gateState === "block" &&
    (highestAlertSeverity === "critical" || highestAlertSeverity === "high")
  ) {
    return "reversal";
  }

  // Weakening: fragility is high/critical OR evidence is weak/insufficient
  if (
    fragility === "critical" ||
    (fragility === "high" && evidenceState !== "strong") ||
    evidenceState === "insufficient"
  ) {
    return "weakening";
  }

  // Strengthening: strong evidence + low fragility + gate pass
  if (
    evidenceState === "strong" &&
    (fragility === "low" || fragility === "medium") &&
    gateState === "pass"
  ) {
    return "strengthening";
  }

  return "stable";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SUMMARY TEXT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

export function buildThesisStateSummaryText(state: EntityThesisState): string {
  const stanceLabel =
    state.current_stance === "unavailable"
      ? "unavailable"
      : state.current_stance;

  const confPart =
    state.stance_confidence != null
      ? ` (confidence: ${(state.stance_confidence * 100).toFixed(0)}%)`
      : "";

  const evidencePart = `Evidence: ${state.evidence_state}${
    state.evidence_score != null ? ` [score=${state.evidence_score.toFixed(0)}]` : ""
  }.`;

  const gatePart = `Gate: ${state.gate_state}${state.gate_mode ? ` [${state.gate_mode}]` : ""}.`;

  const fragilityPart = `Fragility: ${state.fragility_state}${
    state.fragility_score != null
      ? ` [${(state.fragility_score * 100).toFixed(0)}%]`
      : ""
  }.`;

  const alertPart =
    state.alert_count > 0
      ? ` ${state.alert_count} alert${state.alert_count > 1 ? "s" : ""}` +
        (state.highest_alert_severity ? ` [max: ${state.highest_alert_severity}]` : "") +
        "."
      : " No alerts.";

  const markerPart = `Thesis: ${state.thesis_change_marker}.`;

  return (
    `[${state.entity}] Stance: ${stanceLabel}${confPart}. ` +
    `${evidencePart} ${gatePart} ${fragilityPart}${alertPart} ${markerPart} Advisory only.`
  );
}

export function buildBasketStateSummaryText(state: BasketThesisState): string {
  const entityList = state.entities.join(", ");
  const thesisPart = `Basket thesis: ${state.dominant_basket_thesis} (overlap: ${state.overlap_intensity}).`;
  const concentrationPart = `Concentration: ${state.concentration_state}.`;
  const fragilityPart = `Fragility: ${state.basket_fragility_state}${
    state.shared_fragility_flag ? " [shared fragility flagged]" : ""
  }.`;
  const markerPart = `Basket marker: ${state.basket_change_marker}.`;

  return (
    `[Basket: ${state.basket_size} entities — ${entityList}] ` +
    `${thesisPart} ${concentrationPart} ${fragilityPart} ${markerPart} Advisory only.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MAIN ENTITY BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildEntityThesisState — derive EntityThesisState from optional inputs.
 *
 * All inputs are optional. Missing/null inputs degrade gracefully.
 * Pure function: no side effects, no DB calls.
 */
export function buildEntityThesisState(
  input: EntityThesisStateInput
): EntityThesisState {
  const { entity, semantic_stats, gate_result, source_result, alert_summary } = input;

  // Stance: prefer semantic_stats, fall back to snapshot_stance from TVM Writeback
  const rawStance = deriveStance(semantic_stats);
  const currentStance: ThesisStance =
    rawStance !== "unavailable"
      ? rawStance
      : (input.snapshot_stance && input.snapshot_stance !== "unavailable"
          ? input.snapshot_stance
          : "unavailable");
  const stanceConfidence = semantic_stats?.confidence_score ?? null;

  // Evidence
  const evidenceScore = gate_result?.evidence_score ?? null;
  const evidenceState = deriveEvidenceState(evidenceScore);

  // Gate
  const gateState = deriveGateState(gate_result);
  const gateMode = gate_result?.gate_mode ?? null;

  // Fragility
  const fragilityScore = semantic_stats?.confidence_fragility ?? null;
  const fragilityState = deriveFragilityState(fragilityScore);

  // Source
  const { state: sourceState, topSource } = deriveSourceState(source_result);

  // Alerts
  const alertCount = alert_summary?.alert_count ?? 0;
  const highestAlertSeverity = alert_summary?.highest_severity ?? null;

  // Thesis change marker
  const thesisChangeMarker = deriveThesisChangeMarker(
    currentStance,
    fragilityState,
    gateState,
    evidenceState,
    highestAlertSeverity
  );

  const partialState: Omit<EntityThesisState, "state_summary_text"> = {
    entity,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    current_stance: currentStance,
    stance_confidence: stanceConfidence,
    evidence_state: evidenceState,
    evidence_score: evidenceScore,
    gate_state: gateState,
    gate_mode: gateMode,
    fragility_state: fragilityState,
    fragility_score: fragilityScore,
    source_state: sourceState,
    top_source: topSource,
    alert_count: alertCount,
    highest_alert_severity: highestAlertSeverity,
    thesis_change_marker: thesisChangeMarker,
  };

  const state: EntityThesisState = {
    ...partialState,
    state_summary_text: "",
  };
  state.state_summary_text = buildThesisStateSummaryText(state);

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. BASKET DERIVATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function deriveDominantBasketThesis(
  direction: DirectionBucket,
  overlapRatio: number
): DominantBasketThesis {
  if (direction === "unavailable") return "unavailable";
  if (overlapRatio < 0.5) return "divergent";
  if (direction === "positive") return "aligned_bullish";
  if (direction === "negative") return "aligned_bearish";
  if (direction === "mixed") return "mixed";
  return "mixed"; // neutral / unclear with majority
}

function deriveOverlapIntensity(overlapRatio: number): OverlapIntensity {
  if (overlapRatio >= 0.85) return "high";
  if (overlapRatio >= 0.60) return "medium";
  if (overlapRatio >= 0.40) return "low";
  return "none";
}

function deriveConcentrationState(
  level: "low" | "moderate" | "high",
  hhi: number
): ConcentrationState {
  if (level === "high" && hhi > 0.6) return "critical";
  if (level === "high") return "high";
  if (level === "moderate") return "elevated";
  return "safe";
}

function deriveBasketFragilityState(
  avgFragility: number,
  fragilityFlag: boolean
): BasketFragilityState {
  if (fragilityFlag && avgFragility > 0.75) return "high";
  if (fragilityFlag || avgFragility > 0.5) return "medium";
  return "low";
}

function deriveBasketChangeMarker(
  dominantThesis: DominantBasketThesis,
  concentrationState: ConcentrationState,
  overlapIntensity: OverlapIntensity
): BasketChangeMarker {
  if (dominantThesis === "unavailable") return "unknown";
  if (concentrationState === "critical" || concentrationState === "high") return "concentrating";
  if (dominantThesis === "divergent" || overlapIntensity === "none") return "diverging";
  return "stable";
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. MAIN BASKET BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildBasketThesisState — derive BasketThesisState from PortfolioAnalysisResult.
 *
 * Returns a fallback state when portfolioResult is null.
 * Pure function: no side effects, no DB calls.
 */
export function buildBasketThesisState(
  input: BasketThesisStateInput
): BasketThesisState {
  const { portfolioResult } = input;

  if (!portfolioResult) {
    const fallback: BasketThesisState = {
      entities: [],
      basket_size: 0,
      generated_at: new Date().toISOString(),
      advisory_only: true,
      dominant_basket_thesis: "unavailable",
      overlap_intensity: "none",
      concentration_state: "safe",
      basket_fragility_state: "low",
      shared_fragility_flag: false,
      basket_change_marker: "unknown",
      basket_state_summary_text: "",
    };
    fallback.basket_state_summary_text = buildBasketStateSummaryText(fallback);
    return fallback;
  }

  const overlap = portfolioResult.thesis_overlap.value;
  const concentration = portfolioResult.concentration_risk.value;
  const fragility = portfolioResult.shared_fragility.value;

  const dominantBasketThesis = deriveDominantBasketThesis(
    overlap.dominant_direction,
    overlap.overlap_ratio
  );
  const overlapIntensity = deriveOverlapIntensity(overlap.overlap_ratio);
  const concentrationState = deriveConcentrationState(
    concentration.level,
    concentration.hhi_score
  );
  const basketFragilityState = deriveBasketFragilityState(
    fragility.avg_fragility,
    fragility.fragility_flag
  );
  const sharedFragilityFlag = fragility.fragility_flag;
  const basketChangeMarker = deriveBasketChangeMarker(
    dominantBasketThesis,
    concentrationState,
    overlapIntensity
  );

  const partialState: Omit<BasketThesisState, "basket_state_summary_text"> = {
    entities: portfolioResult.entities,
    basket_size: portfolioResult.basket_size,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    dominant_basket_thesis: dominantBasketThesis,
    overlap_intensity: overlapIntensity,
    concentration_state: concentrationState,
    basket_fragility_state: basketFragilityState,
    shared_fragility_flag: sharedFragilityFlag,
    basket_change_marker: basketChangeMarker,
  };

  const state: BasketThesisState = {
    ...partialState,
    basket_state_summary_text: "",
  };
  state.basket_state_summary_text = buildBasketStateSummaryText(state);

  return state;
}
