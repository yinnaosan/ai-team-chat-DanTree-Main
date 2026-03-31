/**
 * semantic_engine_stats.examples.ts — DanTree Level 12.8
 *
 * Usage examples for buildSemanticEngineStatsDisplay and
 * formatSemanticEngineStatsLine.
 *
 * These examples show how to consume UnifiedSemanticState /
 * SynthesisSemanticEnvelope at the display/terminal layer.
 */

import {
  buildSemanticEngineStatsDisplay,
  formatSemanticEngineStatsLine,
  type SemanticEngineStatsDisplay,
} from "./semantic_engine_stats";
import type {
  UnifiedSemanticState,
  SynthesisSemanticEnvelope,
} from "./semantic_aggregator";

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 1: Full 3-path aggregated state (PATH-A + B + C)
// ─────────────────────────────────────────────────────────────────────────────

const EXAMPLE_UNIFIED_STATE: UnifiedSemanticState = {
  protocol_version: "12.2",
  entity: "AAPL",
  timeframe: "mid",
  dominant_direction: "positive",
  state_summary: {
    regime: "risk_on",
    narrative_gap: 0.35,
    crowding: 0.68,
    fragility: 0.42,
    trend: "positive",
  } as any,
  signals: [
    { name: "services_margin_expansion", direction: "positive", intensity: 0.78, persistence: "building", urgency: "medium", driver_type: "real" } as any,
    { name: "sentiment_phase_consensus", direction: "mixed", intensity: 0.54, persistence: "stable", urgency: "medium", driver_type: "behavior" } as any,
  ],
  risks: [
    { name: "china_regulatory_risk", severity: 0.62, timing: "near", containment: "low", trigger: "ban_expands" } as any,
  ],
  confidence: {
    score: 0.71,
    trend: "stable",
    fragility: 0.32,
    source_quality: "high",
    dispersion: 0.04,
    downgraded: false,
  } as any,
  conflicts: [],
  invalidations: ["services_margin_contracts_below_72pct", "AI_monetization_collapses"],
  semantic_notes: [
    "real_driver=services_margin vs narrative_driver=AI_premium — gap_widening",
    "crowding_high && fragility_moderate",
  ],
  source_agents: ["level11_multiasset_engine", "experience_layer", "level105_position_layer"],
  packet_count: 3,
  generated_at: new Date().toISOString(),
  advisory_only: true,
};

const EXAMPLE_ENVELOPE: SynthesisSemanticEnvelope = {
  protocol_version: "12.2",
  entity: "AAPL",
  dominant_direction: "positive",
  confidence_score: 0.68,
  confidence_fragility: 0.32,
  confidence_downgraded: false,
  top_signals: EXAMPLE_UNIFIED_STATE.signals.slice(0, 3) as any,
  top_risks: EXAMPLE_UNIFIED_STATE.risks.slice(0, 3) as any,
  has_conflicts: false,
  conflict_count: 0,
  unresolved_conflicts: [],
  key_invalidations: EXAMPLE_UNIFIED_STATE.invalidations.slice(0, 5),
  semantic_notes: EXAMPLE_UNIFIED_STATE.semantic_notes.slice(0, 8),
  state_regime: "risk_on",
  state_crowding: 0.68,
  state_fragility: 0.42,
  advisory_only: true,
};

/**
 * Example 1: Full stats from both unified state and envelope.
 *
 * Expected output:
 *   dominant_direction: "positive"
 *   confidence_score:   0.68  (envelope takes priority)
 *   conflict_count:     0
 *   state_regime:       "risk_on"
 *   packet_count:       3
 *   semantic_available: true
 */
export const EXAMPLE_FULL_STATS: SemanticEngineStatsDisplay =
  buildSemanticEngineStatsDisplay(EXAMPLE_UNIFIED_STATE, EXAMPLE_ENVELOPE);

/**
 * Example 1 — compact line for prompt/log:
 *   "SEMANTIC[AAPL] dir=positive conf=0.68 frag=0.32 conflicts=0 packets=3 regime=risk_on signals=2 risks=1"
 */
export const EXAMPLE_FULL_LINE: string =
  formatSemanticEngineStatsLine(EXAMPLE_FULL_STATS);

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 2: Envelope only (PATH-B/C without PATH-A)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Example 2: Only envelope available (no unifiedState).
 *
 * Expected: packet_count = null, other fields from envelope.
 */
export const EXAMPLE_ENVELOPE_ONLY_STATS: SemanticEngineStatsDisplay =
  buildSemanticEngineStatsDisplay(null, EXAMPLE_ENVELOPE);

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 3: No semantic state (safe fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Example 3: No semantic state — safe fallback.
 *
 * Expected: semantic_available = false, all fields at fallback values.
 */
export const EXAMPLE_FALLBACK_STATS: SemanticEngineStatsDisplay =
  buildSemanticEngineStatsDisplay(undefined, undefined);

export const EXAMPLE_FALLBACK_LINE: string =
  formatSemanticEngineStatsLine(EXAMPLE_FALLBACK_STATS);
// → "SEMANTIC[unavailable] semantic_available=false"

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 4: Conflict scenario
// ─────────────────────────────────────────────────────────────────────────────

const EXAMPLE_CONFLICT_ENVELOPE: SynthesisSemanticEnvelope = {
  ...EXAMPLE_ENVELOPE,
  dominant_direction: "mixed",
  has_conflicts: true,
  conflict_count: 1,
  unresolved_conflicts: [
    {
      field: "state.direction",
      conflicting_values: [
        { agent: "level11_multiasset_engine", value: "positive", source_quality: "high" },
        { agent: "experience_layer", value: "negative", source_quality: "medium" },
      ],
      severity: 0.75,
      resolution: "unresolved",
      summary: "direction_conflict: positive(w=1.00) vs negative(w=0.65) — resolution=unresolved",
    } as any,
  ],
  confidence_downgraded: true,
};

/**
 * Example 4: Conflict scenario — downgraded confidence, unresolved direction.
 */
export const EXAMPLE_CONFLICT_STATS: SemanticEngineStatsDisplay =
  buildSemanticEngineStatsDisplay(null, EXAMPLE_CONFLICT_ENVELOPE);

export const EXAMPLE_CONFLICT_LINE: string =
  formatSemanticEngineStatsLine(EXAMPLE_CONFLICT_STATS);
// → includes "dir=mixed conflicts=1 downgraded=true"
