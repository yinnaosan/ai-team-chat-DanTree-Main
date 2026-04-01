/**
 * sessionHistoryEngine.ts — DanTree Level 20.0-B
 *
 * Session History / Thesis Timeline Phase 1 — Backend Comparison Layer
 *
 * Scope (Phase 1 only):
 *   - Build entity timeline snapshot from thesis state + alert summary + timing
 *   - Build basket timeline snapshot from basket thesis state + basket timing
 *   - Compare current vs previous snapshot (in-memory only)
 *   - Derive SnapshotChangeMarker from delta between snapshots
 *   - Pure functions, no side effects, no persistence
 *
 * NOT in Phase 1:
 *   - Long timeline arrays (Phase 2)
 *   - Timeline visualization (Phase 2)
 *   - Persistence / vector memory / DB writes
 *   - UI / routers (Manus handles integration)
 */

import type {
  EntityThesisState,
  BasketThesisState,
  ThesisChangeMarker,
  ThesisStance,
  ConcentrationState,
} from "./thesisStateEngine";

import type {
  ExecutionTimingResult,
  BasketTimingResult,
  ActionBias,
} from "./executionTimingEngine";

import type { AlertSeverity } from "./alertEngine";

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOCAL TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type SnapshotChangeMarker =
  | "first_observation"
  | "stable"
  | "strengthening"
  | "weakening"
  | "reversal"
  | "diverging"
  | "unknown";

// ─────────────────────────────────────────────────────────────────────────────
// 2. SNAPSHOT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ThesisTimelineSnapshot — entity-level point-in-time snapshot.
 *
 * Captures the key state dimensions at a given session point.
 * All fields are nullable to handle partial availability.
 */
export interface ThesisTimelineSnapshot {
  entity: string;
  snapshot_time: string;
  advisory_only: true;
  /** Current stance from EntityThesisState */
  thesis_stance: ThesisStance | null;
  /** Thesis change marker from EntityThesisState */
  thesis_change_marker: ThesisChangeMarker | null;
  /** Highest alert severity at snapshot time */
  alert_severity: AlertSeverity | null;
  /** Action bias from ExecutionTimingResult */
  timing_bias: ActionBias | null;
  /** Source health from EntityThesisState */
  source_health: string | null;
  /** Condensed human-readable state at snapshot time */
  state_summary_text: string;
}

/**
 * BasketTimelineSnapshot — basket-level point-in-time snapshot.
 */
export interface BasketTimelineSnapshot {
  entities: string[];
  snapshot_time: string;
  advisory_only: true;
  /** Dominant basket thesis from BasketThesisState */
  basket_thesis: string | null;
  /** Basket change marker from BasketThesisState */
  basket_change_marker: string | null;
  /** Highest alert severity across basket */
  basket_alert_severity: AlertSeverity | null;
  /** Basket action bias from BasketTimingResult */
  basket_timing_bias: ActionBias | null;
  /** Concentration state from BasketThesisState */
  concentration_state: ConcentrationState | null;
  /** Condensed basket summary at snapshot time */
  basket_summary_text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. HISTORY RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionHistoryResult {
  entity: string;
  generated_at: string;
  advisory_only: true;
  current_snapshot: ThesisTimelineSnapshot;
  previous_snapshot: ThesisTimelineSnapshot | null;
  /** Delta marker comparing current vs previous */
  change_marker: SnapshotChangeMarker;
  /** Readable delta description */
  delta_summary: string;
}

export interface BasketHistoryResult {
  entities: string[];
  generated_at: string;
  advisory_only: true;
  current_snapshot: BasketTimelineSnapshot;
  previous_snapshot: BasketTimelineSnapshot | null;
  /** Delta marker comparing current vs previous basket state */
  change_marker: SnapshotChangeMarker;
  /** Readable basket delta description */
  delta_summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SNAPSHOT INPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface EntitySnapshotInput {
  entity: string;
  thesisState?: EntityThesisState | null;
  timingResult?: ExecutionTimingResult | null;
  alertSeverity?: AlertSeverity | null;
}

export interface BasketSnapshotInput {
  entities: string[];
  basketThesisState?: BasketThesisState | null;
  basketTimingResult?: BasketTimingResult | null;
  basketAlertSeverity?: AlertSeverity | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SNAPSHOT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildThesisTimelineSnapshot — build entity snapshot from current state.
 */
export function buildThesisTimelineSnapshot(
  input: EntitySnapshotInput
): ThesisTimelineSnapshot {
  const { entity, thesisState, timingResult, alertSeverity } = input;

  const thesisStance = thesisState?.current_stance ?? null;
  const thesisChangeMarker = thesisState?.thesis_change_marker ?? null;
  const effectiveAlertSeverity =
    alertSeverity ?? thesisState?.highest_alert_severity ?? null;
  const timingBias = timingResult?.action_bias ?? null;
  const sourceHealth = thesisState?.source_state ?? null;

  const stancePart = thesisStance ? `stance=${thesisStance}` : "stance=unknown";
  const markerPart = thesisChangeMarker ? `marker=${thesisChangeMarker}` : "";
  const alertPart = effectiveAlertSeverity ? `alert=${effectiveAlertSeverity}` : "";
  const biasPart = timingBias ? `bias=${timingBias}` : "";
  const parts = [stancePart, markerPart, alertPart, biasPart].filter(Boolean);

  const stateSummaryText = `[${entity}] ${parts.join(" | ")}. Advisory only.`;

  return {
    entity,
    snapshot_time: new Date().toISOString(),
    advisory_only: true,
    thesis_stance: thesisStance,
    thesis_change_marker: thesisChangeMarker,
    alert_severity: effectiveAlertSeverity,
    timing_bias: timingBias,
    source_health: sourceHealth,
    state_summary_text: stateSummaryText,
  };
}

/**
 * buildBasketTimelineSnapshot — build basket snapshot from current state.
 */
export function buildBasketTimelineSnapshot(
  input: BasketSnapshotInput
): BasketTimelineSnapshot {
  const { entities, basketThesisState, basketTimingResult, basketAlertSeverity } = input;

  const basketThesis = basketThesisState?.dominant_basket_thesis ?? null;
  const basketChangeMarker = basketThesisState?.basket_change_marker ?? null;
  const effectiveAlertSeverity = basketAlertSeverity ?? null;
  const basketTimingBias = basketTimingResult?.basket_action_bias ?? null;
  const concentrationState = basketThesisState?.concentration_state ?? null;

  const entityList = entities.join(", ");
  const thesisPart = basketThesis ? `thesis=${basketThesis}` : "thesis=unknown";
  const markerPart = basketChangeMarker ? `marker=${basketChangeMarker}` : "";
  const biasPart = basketTimingBias ? `bias=${basketTimingBias}` : "";
  const concentrationPart = concentrationState ? `concentration=${concentrationState}` : "";
  const parts = [thesisPart, markerPart, biasPart, concentrationPart].filter(Boolean);

  const basketSummaryText =
    `[Basket: ${entities.length} — ${entityList}] ${parts.join(" | ")}. Advisory only.`;

  return {
    entities,
    snapshot_time: new Date().toISOString(),
    advisory_only: true,
    basket_thesis: basketThesis,
    basket_change_marker: basketChangeMarker,
    basket_alert_severity: effectiveAlertSeverity,
    basket_timing_bias: basketTimingBias,
    concentration_state: concentrationState,
    basket_summary_text: basketSummaryText,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CHANGE MARKER DERIVATION
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: (AlertSeverity | null)[] = [null, "low", "medium", "high", "critical"];
const BIAS_CONSTRUCTIVE: ActionBias[] = ["BUY", "HOLD"];
const BIAS_DESTRUCTIVE: ActionBias[] = ["AVOID", "WAIT"];

function severityRank(s: AlertSeverity | null): number {
  return SEVERITY_ORDER.indexOf(s);
}

function isBullishStance(s: ThesisStance | null): boolean {
  return s === "bullish";
}

function isBearishStance(s: ThesisStance | null): boolean {
  return s === "bearish";
}

function deriveEntityChangeMarker(
  current: ThesisTimelineSnapshot,
  previous: ThesisTimelineSnapshot | null
): SnapshotChangeMarker {
  if (!previous) return "first_observation";

  const currStance = current.thesis_stance;
  const prevStance = previous.thesis_stance;
  const currMarker = current.thesis_change_marker;
  const currSeverity = current.alert_severity;
  const prevSeverity = previous.alert_severity;
  const currBias = current.timing_bias;
  const prevBias = previous.timing_bias;

  // Reversal: stance flipped between bullish ↔ bearish
  if (
    (isBullishStance(prevStance) && isBearishStance(currStance)) ||
    (isBearishStance(prevStance) && isBullishStance(currStance))
  ) {
    return "reversal";
  }

  // Use thesis change marker if available and definitive
  if (currMarker === "reversal") return "reversal";
  if (currMarker === "strengthening") return "strengthening";
  if (currMarker === "weakening") return "weakening";

  // Alert severity change
  const severityIncreased = severityRank(currSeverity) > severityRank(prevSeverity);
  const severityDecreased = severityRank(currSeverity) < severityRank(prevSeverity);

  // Timing bias shift
  const biasImproved =
    BIAS_DESTRUCTIVE.includes(prevBias as ActionBias) &&
    BIAS_CONSTRUCTIVE.includes(currBias as ActionBias);
  const biasWorsened =
    BIAS_CONSTRUCTIVE.includes(prevBias as ActionBias) &&
    BIAS_DESTRUCTIVE.includes(currBias as ActionBias);

  if (biasWorsened || severityIncreased) return "weakening";
  if (biasImproved || severityDecreased) return "strengthening";

  if (currMarker === "stable") return "stable";

  // No material change detected
  if (currStance === prevStance) return "stable";

  return "unknown";
}

function deriveBasketChangeMarker(
  current: BasketTimelineSnapshot,
  previous: BasketTimelineSnapshot | null
): SnapshotChangeMarker {
  if (!previous) return "first_observation";

  const currThesis = current.basket_thesis;
  const prevThesis = previous.basket_thesis;
  const currBias = current.basket_timing_bias;
  const prevBias = previous.basket_timing_bias;
  const currConcentration = current.concentration_state;
  const prevConcentration = previous.concentration_state;

  // Diverging: thesis shifted from aligned to divergent
  if (prevThesis !== "divergent" && currThesis === "divergent") return "diverging";
  if (prevThesis === "divergent" && currThesis !== "divergent") return "strengthening";

  // Basket marker from BasketThesisState
  const currMarker = current.basket_change_marker;
  if (currMarker === "concentrating") return "weakening";
  if (currMarker === "diverging") return "diverging";

  // Concentration worsened
  const CONCENTRATION_ORDER: (ConcentrationState | null)[] = [null, "safe", "elevated", "high", "critical"];
  const currConcRank = CONCENTRATION_ORDER.indexOf(currConcentration);
  const prevConcRank = CONCENTRATION_ORDER.indexOf(prevConcentration);

  if (currConcRank > prevConcRank) return "weakening";
  if (currConcRank < prevConcRank) return "strengthening";

  // Timing bias change
  const biasWorsened =
    BIAS_CONSTRUCTIVE.includes(prevBias as ActionBias) &&
    BIAS_DESTRUCTIVE.includes(currBias as ActionBias);
  const biasImproved =
    BIAS_DESTRUCTIVE.includes(prevBias as ActionBias) &&
    BIAS_CONSTRUCTIVE.includes(currBias as ActionBias);

  if (biasWorsened) return "weakening";
  if (biasImproved) return "strengthening";

  if (currThesis === prevThesis) return "stable";

  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. DELTA SUMMARY BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildEntityDeltaSummary(
  entity: string,
  current: ThesisTimelineSnapshot,
  previous: ThesisTimelineSnapshot | null,
  changeMarker: SnapshotChangeMarker
): string {
  if (changeMarker === "first_observation") {
    return `[${entity}] First observation recorded. Baseline established. Advisory only.`;
  }

  const stanceChange =
    previous?.thesis_stance !== current.thesis_stance
      ? ` Stance: ${previous?.thesis_stance ?? "unknown"} → ${current.thesis_stance ?? "unknown"}.`
      : "";

  const biasChange =
    previous?.timing_bias !== current.timing_bias
      ? ` Bias: ${previous?.timing_bias ?? "NONE"} → ${current.timing_bias ?? "NONE"}.`
      : "";

  const alertChange =
    previous?.alert_severity !== current.alert_severity
      ? ` Alert: ${previous?.alert_severity ?? "none"} → ${current.alert_severity ?? "none"}.`
      : "";

  return (
    `[${entity}] Change: ${changeMarker}.` +
    stanceChange +
    biasChange +
    alertChange +
    " Advisory only."
  );
}

function buildBasketDeltaSummary(
  current: BasketTimelineSnapshot,
  previous: BasketTimelineSnapshot | null,
  changeMarker: SnapshotChangeMarker
): string {
  const entityList = current.entities.join(", ");

  if (changeMarker === "first_observation") {
    return `[Basket: ${current.entities.length} — ${entityList}] First observation recorded. Advisory only.`;
  }

  const thesisChange =
    previous?.basket_thesis !== current.basket_thesis
      ? ` Thesis: ${previous?.basket_thesis ?? "unknown"} → ${current.basket_thesis ?? "unknown"}.`
      : "";

  const biasChange =
    previous?.basket_timing_bias !== current.basket_timing_bias
      ? ` Bias: ${previous?.basket_timing_bias ?? "NONE"} → ${current.basket_timing_bias ?? "NONE"}.`
      : "";

  const concentrationChange =
    previous?.concentration_state !== current.concentration_state
      ? ` Concentration: ${previous?.concentration_state ?? "unknown"} → ${current.concentration_state ?? "unknown"}.`
      : "";

  return (
    `[Basket: ${current.entities.length} — ${entityList}] Change: ${changeMarker}.` +
    thesisChange +
    biasChange +
    concentrationChange +
    " Advisory only."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. MAIN HISTORY BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildSessionHistoryResult — compare current entity snapshot vs previous.
 *
 * If previous is null → change_marker = "first_observation".
 * Pure function, no DB calls, no side effects.
 */
export function buildSessionHistoryResult(
  current: ThesisTimelineSnapshot,
  previous: ThesisTimelineSnapshot | null
): SessionHistoryResult {
  const changeMarker = deriveEntityChangeMarker(current, previous);
  const deltaSummary = buildEntityDeltaSummary(
    current.entity,
    current,
    previous,
    changeMarker
  );

  return {
    entity: current.entity,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    current_snapshot: current,
    previous_snapshot: previous,
    change_marker: changeMarker,
    delta_summary: deltaSummary,
  };
}

/**
 * buildBasketHistoryResult — compare current basket snapshot vs previous.
 *
 * If previous is null → change_marker = "first_observation".
 * Pure function, no DB calls, no side effects.
 */
export function buildBasketHistoryResult(
  current: BasketTimelineSnapshot,
  previous: BasketTimelineSnapshot | null
): BasketHistoryResult {
  const changeMarker = deriveBasketChangeMarker(current, previous);
  const deltaSummary = buildBasketDeltaSummary(current, previous, changeMarker);

  return {
    entities: current.entities,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    current_snapshot: current,
    previous_snapshot: previous,
    change_marker: changeMarker,
    delta_summary: deltaSummary,
  };
}
