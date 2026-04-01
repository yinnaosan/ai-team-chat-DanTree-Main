/**
 * executionTimingEngine.ts — DanTree Level 19.0-B
 *
 * Execution / Timing Assistant Phase 1 — Backend Decision-Support Layer
 *
 * Scope (Phase 1 only):
 *   - Entity timing: readiness, entry quality, timing risk, confirmation,
 *     action_bias, no_action_reason
 *   - Basket timing: conservative aggregation + concentration constraint
 *   - Pure functions, no side effects
 *   - No broker integration, no order placement, no scheduler, no persistence
 *
 * NOT in Phase 1:
 *   - Comparison timing (Phase 2)
 *   - Broker/order automation
 *   - UI / routers (Manus handles integration)
 */

import type { EntityThesisState, BasketThesisState } from "./thesisStateEngine";
import type { AlertSummary, AlertSeverity } from "./alertEngine";
import type { ConcentrationRiskResult } from "./portfolioAnalysisEngine";

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOCAL TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ReadinessState = "ready" | "conditional" | "not_ready" | "blocked";

export type EntryQuality = "high" | "moderate" | "low" | "unavailable";

export type TimingRisk = "low" | "medium" | "high" | "critical";

export type ConfirmationState =
  | "confirmed"
  | "partial"
  | "unconfirmed"
  | "conflicted";

export type ActionBias = "BUY" | "HOLD" | "WAIT" | "AVOID" | "NONE";

// ─────────────────────────────────────────────────────────────────────────────
// 2. INPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EntityTimingInput — all optional. Phase 1 tolerates missing/partial inputs.
 */
export interface EntityTimingInput {
  entity: string;
  /** Thesis state from thesisStateEngine */
  thesisState?: EntityThesisState | null;
  /** Alert summary from alertEngine */
  alertSummary?: AlertSummary | null;
  /**
   * Semantic direction from UnifiedSemanticState.dominant_direction.
   * Use exact values: "positive" | "negative" | "mixed" | "neutral" | "unclear"
   */
  semanticDirection?: string | null;
  /**
   * Confidence fragility [0–1] from semantic state.
   * Used for timing_risk derivation.
   */
  semanticFragility?: number | null;
}

/**
 * BasketTimingInput — basket timing derived from entity results + concentration.
 *
 * Phase 1 requires at least 2 entities; throws BasketTimingValidationError if < 2.
 */
export interface BasketTimingInput {
  entities: string[];
  /** Per-entity timing results (order matches entities array) */
  entityResults: ExecutionTimingResult[];
  /** Concentration data from portfolioAnalysisEngine */
  concentrationResult?: ConcentrationRiskResult | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutionTimingResult {
  entity: string;
  generated_at: string;
  advisory_only: true;
  readiness_state: ReadinessState;
  entry_quality: EntryQuality;
  timing_risk: TimingRisk;
  confirmation_state: ConfirmationState;
  action_bias: ActionBias;
  /** Reason when action_bias is WAIT, AVOID, or NONE */
  no_action_reason: string | null;
  timing_summary: string;
}

export interface BasketTimingResult {
  entities: string[];
  generated_at: string;
  advisory_only: true;
  entity_results: ExecutionTimingResult[];
  /** Conservative aggregation: worst readiness across basket */
  basket_readiness: ReadinessState;
  /** Plurality action bias across entity results */
  basket_action_bias: ActionBias;
  /** Concentration constraint message when concentration is high */
  concentration_constraint: string | null;
  basket_timing_summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export class BasketTimingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BasketTimingValidationError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DERIVATION HELPERS — ENTITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * deriveReadinessState — with preflight guards.
 *
 * Guards:
 *  G1: synthetic fallback gate → "conditional" (not "blocked")
 *  G2: thesis_stance="neutral" → "conditional" (not "blocked")
 *  G3: no thesis state at all → "not_ready"
 */
function deriveReadinessState(
  thesisState: EntityThesisState | null | undefined,
  alertSeverity: AlertSeverity | null
): ReadinessState {
  if (!thesisState) return "not_ready";

  const stance = thesisState.current_stance;
  const gateState = thesisState.gate_state;
  const changeMarker = thesisState.thesis_change_marker;

  // Critical alert → blocked regardless
  if (alertSeverity === "critical") return "blocked";

  // Gate is hard block (not fallback) + bearish stance → blocked
  if (gateState === "block" && stance === "bearish") return "blocked";

  // Gate is hard block + reversal marker → blocked
  if (gateState === "block" && changeMarker === "reversal") return "blocked";

  // Gate fallback (G1) or neutral stance (G2) → conditional
  if (gateState === "fallback") return "conditional";
  if (stance === "neutral") return "conditional";
  if (stance === "mixed") return "conditional";
  if (stance === "unavailable") return "not_ready";

  // High alert → not_ready unless strong thesis
  if (alertSeverity === "high") {
    return thesisState.evidence_state === "strong" ? "conditional" : "not_ready";
  }

  // Weakening marker → conditional
  if (changeMarker === "weakening") return "conditional";

  // Bullish + pass gate + strengthening or stable → ready
  if (stance === "bullish" && gateState === "pass") return "ready";

  return "conditional";
}

function deriveEntryQuality(
  thesisState: EntityThesisState | null | undefined,
  semanticFragility: number | null | undefined
): EntryQuality {
  if (!thesisState) return "unavailable";

  const evidence = thesisState.evidence_state;
  const fragility = thesisState.fragility_state;
  const frag = semanticFragility ?? 0;

  if (evidence === "insufficient") return "unavailable";

  if (evidence === "strong" && (fragility === "low" || frag <= 0.3)) return "high";
  if (evidence === "strong" && fragility === "medium") return "moderate";
  if (evidence === "moderate" && fragility !== "critical") return "moderate";
  if (evidence === "weak" || fragility === "high" || fragility === "critical") return "low";

  return "moderate";
}

function deriveTimingRisk(
  thesisState: EntityThesisState | null | undefined,
  alertSeverity: AlertSeverity | null,
  semanticFragility: number | null | undefined
): TimingRisk {
  const frag = semanticFragility ?? 0;

  if (alertSeverity === "critical") return "critical";

  if (frag > 0.80 || (thesisState?.fragility_state === "critical")) return "critical";
  if (frag > 0.60 || alertSeverity === "high" || thesisState?.fragility_state === "high") return "high";
  if (frag > 0.40 || alertSeverity === "medium") return "medium";
  if (thesisState?.thesis_change_marker === "weakening") return "medium";

  return "low";
}

/**
 * deriveConfirmationState — with preflight guard G4:
 *   "unclear" → "unconfirmed" (not "conflicted")
 */
function deriveConfirmationState(
  semanticDirection: string | null | undefined,
  thesisState: EntityThesisState | null | undefined
): ConfirmationState {
  const dir = semanticDirection ?? "unclear";
  const stance = thesisState?.current_stance;

  // G4: "unclear" → "unconfirmed"
  if (dir === "unclear" || !semanticDirection) return "unconfirmed";

  if (dir === "mixed") {
    // mixed direction with conflicting stance → conflicted
    if (stance === "bullish" || stance === "bearish") return "conflicted";
    return "partial";
  }

  // Direction aligns with stance
  if (dir === "positive" && stance === "bullish") return "confirmed";
  if (dir === "negative" && stance === "bearish") return "confirmed";

  // Direction contradicts stance
  if ((dir === "positive" && stance === "bearish") ||
      (dir === "negative" && stance === "bullish")) return "conflicted";

  // Neutral direction with any stance
  if (dir === "neutral") return "partial";

  return "unconfirmed";
}

function deriveActionBias(
  readiness: ReadinessState,
  confirmation: ConfirmationState,
  thesisState: EntityThesisState | null | undefined,
  timingRisk: TimingRisk
): { bias: ActionBias; no_action_reason: string | null } {
  const stance = thesisState?.current_stance;

  if (readiness === "blocked") {
    return { bias: "AVOID", no_action_reason: "Readiness blocked: gate blocked or critical alert." };
  }

  if (timingRisk === "critical") {
    return { bias: "AVOID", no_action_reason: "Timing risk is critical; avoid new exposure." };
  }

  if (confirmation === "conflicted") {
    return { bias: "WAIT", no_action_reason: "Direction and stance are conflicted; wait for resolution." };
  }

  if (stance === "unavailable") {
    return { bias: "NONE", no_action_reason: "Stance unavailable; no action recommended." };
  }

  if (readiness === "not_ready") {
    return { bias: "WAIT", no_action_reason: "Entity not ready: insufficient evidence or unavailable state." };
  }

  if (readiness === "conditional" || timingRisk === "high") {
    if (stance === "bullish" && (confirmation === "confirmed" || confirmation === "partial" || confirmation === "unconfirmed")) {
      return { bias: "HOLD", no_action_reason: "Conditional readiness; hold existing position." };
    }
    return { bias: "WAIT", no_action_reason: "Conditional readiness; wait for confirmation." };
  }

  // Ready
  if (readiness === "ready") {
    if (stance === "bullish" && confirmation === "confirmed") return { bias: "BUY", no_action_reason: null };
    if (stance === "bullish" && confirmation === "partial") return { bias: "HOLD", no_action_reason: null };
    if (stance === "bearish") return { bias: "AVOID", no_action_reason: "Bearish stance confirmed." };
    if (stance === "neutral") return { bias: "HOLD", no_action_reason: "Neutral stance; hold." };
  }

  return { bias: "HOLD", no_action_reason: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SUMMARY BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

export function buildTimingSummary(result: ExecutionTimingResult): string {
  const base =
    `[${result.entity}] Readiness: ${result.readiness_state}. ` +
    `Entry: ${result.entry_quality}. ` +
    `Timing risk: ${result.timing_risk}. ` +
    `Confirmation: ${result.confirmation_state}. ` +
    `Action: ${result.action_bias}.`;

  const reason = result.no_action_reason ? ` Reason: ${result.no_action_reason}` : "";
  return base + reason + " Advisory only — not a recommendation.";
}

export function buildBasketTimingSummary(result: BasketTimingResult): string {
  const entityList = result.entities.join(", ");
  const base =
    `[Basket: ${result.entities.length} entities — ${entityList}] ` +
    `Basket readiness: ${result.basket_readiness}. ` +
    `Basket action: ${result.basket_action_bias}.`;

  const constraint = result.concentration_constraint
    ? ` Constraint: ${result.concentration_constraint}`
    : "";

  return base + constraint + " Advisory only — not a recommendation.";
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. BASKET AGGREGATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const READINESS_ORDER: ReadinessState[] = ["ready", "conditional", "not_ready", "blocked"];

function worstReadiness(results: ExecutionTimingResult[]): ReadinessState {
  if (results.length === 0) return "not_ready";
  return results.reduce<ReadinessState>((worst, r) => {
    return READINESS_ORDER.indexOf(r.readiness_state) >
      READINESS_ORDER.indexOf(worst)
      ? r.readiness_state
      : worst;
  }, "ready");
}

function pluralityActionBias(results: ExecutionTimingResult[]): ActionBias {
  if (results.length === 0) return "NONE";
  const counts: Partial<Record<ActionBias, number>> = {};
  for (const r of results) {
    counts[r.action_bias] = (counts[r.action_bias] ?? 0) + 1;
  }
  let best: ActionBias = "NONE";
  let bestCount = 0;
  for (const [bias, count] of Object.entries(counts) as [ActionBias, number][]) {
    if ((count ?? 0) > bestCount) {
      bestCount = count ?? 0;
      best = bias;
    }
  }
  return best;
}

function deriveConcentrationConstraint(
  concentration: ConcentrationRiskResult | null | undefined
): string | null {
  if (!concentration) return null;
  if (concentration.level === "high") {
    const dominant = concentration.dominant_entity ? ` (dominant: ${concentration.dominant_entity})` : "";
    return `High concentration (HHI=${concentration.hhi_score})${dominant}; size new positions carefully.`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. MAIN ENTITY BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildExecutionTimingResult — derive entity timing from optional inputs.
 *
 * All inputs are optional. Pure function, no side effects.
 */
export function buildExecutionTimingResult(
  input: EntityTimingInput
): ExecutionTimingResult {
  const { entity, thesisState, alertSummary, semanticDirection, semanticFragility } = input;

  const alertSeverity = alertSummary?.highest_severity ?? null;

  const readinessState = deriveReadinessState(thesisState, alertSeverity);
  const entryQuality = deriveEntryQuality(thesisState, semanticFragility);
  const timingRisk = deriveTimingRisk(thesisState, alertSeverity, semanticFragility);
  const confirmationState = deriveConfirmationState(semanticDirection, thesisState);
  const { bias: actionBias, no_action_reason: noActionReason } = deriveActionBias(
    readinessState,
    confirmationState,
    thesisState,
    timingRisk
  );

  const partial: Omit<ExecutionTimingResult, "timing_summary"> = {
    entity,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    readiness_state: readinessState,
    entry_quality: entryQuality,
    timing_risk: timingRisk,
    confirmation_state: confirmationState,
    action_bias: actionBias,
    no_action_reason: noActionReason,
  };

  const result: ExecutionTimingResult = { ...partial, timing_summary: "" };
  result.timing_summary = buildTimingSummary(result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. MAIN BASKET BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildBasketTimingResult — aggregate entity timing results for a basket.
 *
 * Throws BasketTimingValidationError if < 2 entities.
 * Uses conservative (worst-case) aggregation for basket_readiness.
 * Uses plurality for basket_action_bias.
 */
export function buildBasketTimingResult(
  input: BasketTimingInput
): BasketTimingResult {
  if (!input.entities || input.entities.length < 2) {
    throw new BasketTimingValidationError(
      `Basket timing requires at least 2 entities, got ${input.entities?.length ?? 0}`
    );
  }

  const basketReadiness = worstReadiness(input.entityResults);
  const basketActionBias = pluralityActionBias(input.entityResults);
  const concentrationConstraint = deriveConcentrationConstraint(
    input.concentrationResult
  );

  const partial: Omit<BasketTimingResult, "basket_timing_summary"> = {
    entities: input.entities,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    entity_results: input.entityResults,
    basket_readiness: basketReadiness,
    basket_action_bias: basketActionBias,
    concentration_constraint: concentrationConstraint,
  };

  const result: BasketTimingResult = { ...partial, basket_timing_summary: "" };
  result.basket_timing_summary = buildBasketTimingSummary(result);
  return result;
}
