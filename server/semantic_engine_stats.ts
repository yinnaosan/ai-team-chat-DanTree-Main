/**
 * semantic_engine_stats.ts — DanTree Level 12.8
 *
 * Thin presentation-only layer: converts UnifiedSemanticState /
 * SynthesisSemanticEnvelope into a compact, display-safe stats object
 * for DanTree Terminal / Engine Stats usage.
 *
 * Rules:
 *   - No mutation of protocol objects
 *   - No protocol version changes
 *   - Never throws on undefined / null / partial inputs (OI-L12-008-B)
 *   - Sane fallbacks for every field
 *   - No frontend/UI path assumptions
 */

import type {
  UnifiedSemanticState,
  SynthesisSemanticEnvelope,
} from "./semantic_aggregator";

// ─────────────────────────────────────────────────────────────────────────────
// 1. DISPLAY TYPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SemanticEngineStatsDisplay — compact display-safe engine stats.
 *
 * All fields are nullable-safe. Consumers must not assume any field is present.
 * `semantic_available` is the primary gate: if false, all other fields are
 * fallbacks and should be treated as "not computed".
 */
export type SemanticEngineStatsDisplay = {
  /** The dominant direction from semantic aggregation, or "unavailable" */
  dominant_direction: string;
  /** Overall confidence score [0–1], or null if not available */
  confidence_score: number | null;
  /** Number of detected conflicts (0 when unavailable) */
  conflict_count: number;
  /** Current macro regime string, or null if not available */
  state_regime: string | null;
  /** Number of semantic packets aggregated, or null if not available */
  packet_count: number | null;
  /** Whether any semantic state was available for this entity */
  semantic_available: boolean;
  /** Whether confidence was downgraded due to source disagreement */
  confidence_downgraded: boolean;
  /** Confidence fragility [0–1], or null if not available */
  confidence_fragility: number | null;
  /** Number of signals in the aggregated state */
  signal_count: number;
  /** Number of risks in the aggregated state */
  risk_count: number;
  /** Entity name, or null if not available */
  entity: string | null;
  /** Timeframe of the aggregated state, or null */
  timeframe: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. FALLBACK CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_STATS: SemanticEngineStatsDisplay = {
  dominant_direction: "unavailable",
  confidence_score: null,
  conflict_count: 0,
  state_regime: null,
  packet_count: null,
  semantic_available: false,
  confidence_downgraded: false,
  confidence_fragility: null,
  signal_count: 0,
  risk_count: 0,
  entity: null,
  timeframe: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. MAIN BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildSemanticEngineStatsDisplay — convert semantic state to display object.
 *
 * Priority rules:
 *   - `confidence_score`:    synthesisEnvelope first, then unifiedState.confidence.score
 *   - `conflict_count`:      synthesisEnvelope.conflict_count first, then
 *                            unifiedState.conflicts.length
 *   - `state_regime`:        synthesisEnvelope.state_regime when present
 *   - `packet_count`:        unifiedState.packet_count when available
 *   - `semantic_available`:  true if either input is non-null/non-undefined
 *
 * Never throws. Returns FALLBACK_STATS on complete absence of inputs.
 *
 * @param unifiedState  Optional UnifiedSemanticState from aggregation
 * @param envelope      Optional SynthesisSemanticEnvelope from buildSynthesisSemanticEnvelope()
 */
export function buildSemanticEngineStatsDisplay(
  unifiedState?: UnifiedSemanticState | null,
  envelope?: SynthesisSemanticEnvelope | null
): SemanticEngineStatsDisplay {
  // Neither input available → return full fallback
  if (!unifiedState && !envelope) {
    return { ...FALLBACK_STATS };
  }

  const semanticAvailable = !!(unifiedState || envelope);

  // dominant_direction: envelope first (already computed), then unifiedState
  const dominantDirection: string =
    envelope?.dominant_direction ??
    unifiedState?.dominant_direction ??
    "unavailable";

  // confidence_score: envelope.confidence_score first
  const confidenceScore: number | null =
    envelope?.confidence_score != null
      ? envelope.confidence_score
      : unifiedState?.confidence?.score != null
        ? unifiedState.confidence.score
        : null;

  // confidence_fragility: envelope first
  const confidenceFragility: number | null =
    envelope?.confidence_fragility != null
      ? envelope.confidence_fragility
      : unifiedState?.confidence?.fragility != null
        ? unifiedState.confidence.fragility
        : null;

  // confidence_downgraded: envelope first
  const confidenceDowngraded: boolean =
    envelope?.confidence_downgraded ??
    unifiedState?.confidence?.downgraded ??
    false;

  // conflict_count: envelope.conflict_count first
  const conflictCount: number =
    envelope?.conflict_count != null
      ? envelope.conflict_count
      : (unifiedState?.conflicts?.length ?? 0);

  // state_regime: only from envelope (unifiedState.state_summary.regime if available)
  const stateRegime: string | null =
    envelope?.state_regime ??
    (unifiedState?.state_summary?.regime as string | undefined) ??
    null;

  // packet_count: from unifiedState
  const packetCount: number | null =
    unifiedState?.packet_count != null ? unifiedState.packet_count : null;

  // signal/risk counts: envelope top arrays or unifiedState full arrays
  const signalCount: number =
    envelope?.top_signals?.length ??
    unifiedState?.signals?.length ??
    0;

  const riskCount: number =
    envelope?.top_risks?.length ??
    unifiedState?.risks?.length ??
    0;

  // entity / timeframe: unifiedState or envelope
  const entity: string | null =
    unifiedState?.entity ?? envelope?.entity ?? null;

  const timeframe: string | null =
    (unifiedState?.timeframe as string | undefined) ?? null;

  return {
    dominant_direction: dominantDirection,
    confidence_score: confidenceScore,
    conflict_count: conflictCount,
    state_regime: stateRegime,
    packet_count: packetCount,
    semantic_available: semanticAvailable,
    confidence_downgraded: confidenceDowngraded,
    confidence_fragility: confidenceFragility,
    signal_count: signalCount,
    risk_count: riskCount,
    entity,
    timeframe,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. COMPACT STRING FORMATTER (for prompt/log injection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * formatSemanticEngineStatsLine — single-line compact string for logs/prompts.
 *
 * Example output:
 *   "SEMANTIC[AAPL] dir=positive conf=0.72 frag=0.31 conflicts=0 packets=3 regime=risk_on"
 *   "SEMANTIC[unavailable] semantic_available=false"
 */
export function formatSemanticEngineStatsLine(
  stats: SemanticEngineStatsDisplay
): string {
  if (!stats.semantic_available) {
    return "SEMANTIC[unavailable] semantic_available=false";
  }

  const parts: string[] = [
    `SEMANTIC[${stats.entity ?? "unknown"}]`,
    `dir=${stats.dominant_direction}`,
    stats.confidence_score != null
      ? `conf=${stats.confidence_score.toFixed(2)}`
      : "conf=null",
    stats.confidence_fragility != null
      ? `frag=${stats.confidence_fragility.toFixed(2)}`
      : null,
    `conflicts=${stats.conflict_count}`,
    stats.packet_count != null ? `packets=${stats.packet_count}` : null,
    stats.state_regime ? `regime=${stats.state_regime}` : null,
    stats.confidence_downgraded ? "downgraded=true" : null,
    `signals=${stats.signal_count}`,
    `risks=${stats.risk_count}`,
  ].filter((p): p is string => p !== null);

  return parts.join(" ");
}
