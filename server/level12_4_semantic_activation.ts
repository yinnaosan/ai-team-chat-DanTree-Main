/**
 * level12_4_semantic_activation.ts — DanTree Level 12.4
 *
 * Semantic activation helpers for PATH-A + Step3.
 *
 * Design decisions (per OI_RESOLUTION):
 *   OI-L12-003-A: Do NOT mutate DeepResearchContextMap.
 *                 Thread level11Analysis as explicit parameter.
 *   OI-L12-003-B: Attach __unifiedSemanticState to multiAgentResult
 *                 so Step3 injection activates.
 *   OI-L12-002-B: User-facing synthesis remains natural language.
 *                 Semantic state is advisory/supporting context only.
 *
 * Exports:
 *   buildSemanticActivationResult()  — collect packets → aggregate → envelope
 *   attachUnifiedSemanticState()     — safe __unifiedSemanticState attachment
 *   SemanticActivationInput
 *   SemanticActivationResult
 *   SemanticAttachmentTarget
 *
 * Import paths (all relative to server/):
 *   protocol files live in ./protocol/
 *   engine types are co-located: ./level11MultiAssetEngine etc.
 */

import {
  aggregateSemanticPackets,
  buildSynthesisSemanticEnvelope,
  buildExperienceSemanticState,
  type UnifiedSemanticState,
  type SynthesisSemanticEnvelope,
} from "./semantic_aggregator";

import {
  buildLevel11SemanticPacket,
  buildPositionSemanticPacket,
} from "./semantic_packet_builders";

import {
  buildSemanticPacket,
  type SemanticTransportPacket,
  type SemanticTimeframe,
} from "./semantic_protocol";

import type { Level11AnalysisOutput } from "./level11MultiAssetEngine";
import type { ExperienceLayerOutput } from "./experienceLayer";
import type { PositionLayerOutput } from "./level105PositionLayer";

// ─────────────────────────────────────────────────────────────────────────────
// 1. INPUT / OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SemanticActivationInput — explicit inputs to semantic aggregation.
 *
 * level11Analysis is threaded here as an explicit parameter,
 * NOT added to DeepResearchContextMap (OI-L12-003-A).
 */
export interface SemanticActivationInput {
  /** Entity identifier (ticker or asset name) */
  entity: string;
  /** Timeframe override; defaults to "mid" */
  timeframe?: SemanticTimeframe;
  /** PATH-A: Level 11 multi-asset reality output */
  level11Analysis?: Level11AnalysisOutput;
  /** PATH-B: Experience layer output */
  experienceLayer?: ExperienceLayerOutput;
  /** PATH-C: Position layer output */
  positionLayer?: PositionLayerOutput;
  /** Base confidence for position packet; default 0.60 */
  baseConfidence?: number;
}

/**
 * SemanticActivationResult — output of buildSemanticActivationResult().
 *
 * Both fields are optional: if no inputs produce valid packets,
 * result is { packetCount: 0, unifiedState: undefined, synthesisEnvelope: undefined }.
 */
export interface SemanticActivationResult {
  unifiedState?: UnifiedSemanticState;
  synthesisEnvelope?: SynthesisSemanticEnvelope;
  packetCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. EXPERIENCE LAYER PACKET BUILDER (PATH-B)
//
// semantic_protocol_integration.ts does not exist yet in this codebase.
// buildExperienceLayerSemanticPacket() is implemented inline here,
// delegating to buildExperienceSemanticState() from semantic_aggregator.ts
// and wrapping the result into a SemanticTransportPacket via buildSemanticPacket().
//
// OI-L12-001: ExperienceLayerInsight fields remain natural-language strings.
// Keyword bridge is retained for semantic extraction from those strings.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildExperienceLayerSemanticPacket — PATH-B builder.
 *
 * Converts ExperienceLayerOutput into a SemanticTransportPacket.
 * Uses buildExperienceSemanticState() for machine-native field mapping,
 * then wraps into a full protocol packet.
 */
export function buildExperienceLayerSemanticPacket(
  experience: ExperienceLayerOutput,
  entity: string,
  timeframe: SemanticTimeframe = "mid",
  previousConfidence?: number
): SemanticTransportPacket {
  const expState = buildExperienceSemanticState(experience, previousConfidence);

  // Map gradient_risk state to severity number
  const riskSeverityMap: Record<string, number> = {
    low: 0.15,
    building: 0.45,
    elevated: 0.70,
    critical: 0.90,
  };

  const riskSeverity = riskSeverityMap[expState.gradient_risk.state] ?? 0.50;

  return buildSemanticPacket({
    agent: "experience_layer",
    task: "hypothesis_validation",
    entity,
    timeframe,
    state: {
      asset_type: "equity",
      regime: expState.drift_direction === "weakening" ? "risk_off" : "risk_on",
      narrative_gap: 0.2, // experience layer does not assess narrative gap directly
      crowding: 0.5,      // experience layer does not assess crowding directly
      fragility: expState.confidence_evolution.fragility,
      timeframe,
      direction:
        expState.drift_direction === "strengthening"
          ? "positive"
          : expState.drift_direction === "weakening"
            ? "negative"
            : "neutral",
      primary_driver: expState.drift_signal.slice(0, 80),
      hidden_pressure_points: expState.insight_notes.slice(0, 3),
    },
    signals: [
      {
        name: `drift_${expState.drift_direction}`,
        direction:
          expState.drift_direction === "strengthening"
            ? "positive"
            : expState.drift_direction === "weakening"
              ? "negative"
              : "neutral",
        intensity: expState.drift_intensity,
        persistence:
          expState.drift_direction === "strengthening"
            ? "building"
            : expState.drift_direction === "weakening"
              ? "fading"
              : "stable",
        urgency:
          expState.gradient_risk.state === "critical"
            ? "critical"
            : expState.gradient_risk.state === "elevated"
              ? "high"
              : "medium",
        driver_type: "behavior",
        monitoring_signal: expState.management_signal,
        invalidation: `drift_direction_reverses`,
      },
      {
        name: `confidence_${expState.confidence_evolution.direction}`,
        direction:
          expState.confidence_evolution.direction === "rising"
            ? "positive"
            : expState.confidence_evolution.direction === "falling"
              ? "negative"
              : "neutral",
        intensity: Math.min(1, Math.max(0, expState.confidence_evolution.current)),
        persistence:
          expState.confidence_evolution.direction === "rising"
            ? "building"
            : expState.confidence_evolution.direction === "falling"
              ? "fading"
              : "stable",
        urgency: "low",
        driver_type: "real",
        monitoring_signal: expState.market_signal,
      },
    ],
    risks:
      riskSeverity >= 0.45
        ? [
            {
              name: `gradient_risk_${expState.gradient_risk.state}`,
              severity: riskSeverity,
              timing: riskSeverity >= 0.70 ? "near" : "mid",
              containment:
                riskSeverity >= 0.85 ? "low" : riskSeverity >= 0.60 ? "medium" : "high",
              trigger: `gradient_risk_state=${expState.gradient_risk.state}`,
            },
          ]
        : [],
    confidence: {
      score: expState.confidence_evolution.current,
      trend: expState.confidence_evolution.direction,
      fragility: expState.confidence_evolution.fragility,
      source_quality: "medium", // experience layer is heuristic-based
      anchored_on: `drift_direction_${expState.drift_direction}`,
    },
    constraints: [`experience_layer_heuristic_based`],
    invalidations: [
      `drift_direction_reverses_to_${expState.drift_direction === "strengthening" ? "weakening" : "strengthening"}`,
    ],
    insight_notes: expState.insight_notes.slice(0, 5),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MAIN ACTIVATION FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildSemanticActivationResult — collect packets → aggregate → envelope.
 *
 * Supports:
 *   PATH-A: level11Analysis (explicit parameter, NOT via DeepResearchContextMap)
 *   PATH-B: experienceLayer
 *   PATH-C: positionLayer
 *
 * Any combination of paths is valid. Zero inputs → { packetCount: 0 }.
 *
 * @example
 *   // In danTreeSystem.ts, after running all layers:
 *   const semanticResult = buildSemanticActivationResult({
 *     entity: ticker,
 *     level11Analysis,   // PATH-A — explicit threading (OI-L12-003-A)
 *     experienceLayer,   // PATH-B
 *     positionLayer,     // PATH-C
 *   });
 *
 *   const enrichedResult = attachUnifiedSemanticState(
 *     multiAgentResult,
 *     semanticResult.unifiedState
 *   );
 */
export function buildSemanticActivationResult(
  input: SemanticActivationInput
): SemanticActivationResult {
  const {
    entity,
    timeframe = "mid",
    level11Analysis,
    experienceLayer,
    positionLayer,
    baseConfidence = 0.60,
  } = input;

  const packets: SemanticTransportPacket[] = [];

  // PATH-A: Level 11 — explicit parameter threading
  if (level11Analysis) {
    try {
      const l11Packet = buildLevel11SemanticPacket(level11Analysis, {
        entity,
        timeframe,
        agent: "level11_multiasset_engine",
      });
      packets.push(l11Packet);
    } catch (err) {
      console.warn(`[level12_4] PATH-A packet build failed for ${entity}:`, err);
    }
  }

  // PATH-B: Experience layer
  if (experienceLayer) {
    try {
      const expPacket = buildExperienceLayerSemanticPacket(
        experienceLayer,
        entity,
        timeframe,
        baseConfidence
      );
      packets.push(expPacket);
    } catch (err) {
      console.warn(`[level12_4] PATH-B packet build failed for ${entity}:`, err);
    }
  }

  // PATH-C: Position layer
  if (positionLayer) {
    try {
      const posPacket = buildPositionSemanticPacket(positionLayer, {
        entity,
        timeframe,
        agent: "level105_position_layer",
        base_confidence: baseConfidence,
      });
      packets.push(posPacket);
    } catch (err) {
      console.warn(`[level12_4] PATH-C packet build failed for ${entity}:`, err);
    }
  }

  // No packets → empty result
  if (packets.length === 0) {
    return { packetCount: 0 };
  }

  try {
    const unifiedState = aggregateSemanticPackets({ packets });
    const synthesisEnvelope = buildSynthesisSemanticEnvelope(unifiedState);

    return {
      unifiedState,
      synthesisEnvelope,
      packetCount: packets.length,
    };
  } catch (err) {
    console.warn(`[level12_4] Aggregation failed for ${entity}:`, err);
    return { packetCount: packets.length };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ATTACHMENT HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SemanticAttachmentTarget — any object that can receive __unifiedSemanticState.
 *
 * Designed for multiAgentResult in danTreeSystem.ts (OI-L12-003-B).
 * The double-underscore prefix signals this is an internal protocol field,
 * not part of the public interface — preserving READ-ONLY contract.
 */
export type SemanticAttachmentTarget = Record<string, unknown>;

/**
 * attachUnifiedSemanticState — safe __unifiedSemanticState attachment.
 *
 * Returns a new object (spread) with __unifiedSemanticState attached.
 * Never mutates the original object.
 * If unifiedState is undefined, returns the original object unchanged.
 *
 * @example
 *   // In danTreeSystem.ts:
 *   const enrichedResult = attachUnifiedSemanticState(
 *     multiAgentResult,
 *     semanticResult.unifiedState
 *   );
 *   // enrichedResult.__unifiedSemanticState is now set
 *   // Step3 in routers.ts can read it for formatSemanticEnvelopeForPrompt()
 */
export function attachUnifiedSemanticState<T extends SemanticAttachmentTarget>(
  target: T,
  unifiedState: UnifiedSemanticState | undefined
): T & { __unifiedSemanticState?: UnifiedSemanticState } {
  if (!unifiedState) return target;
  return { ...target, __unifiedSemanticState: unifiedState };
}
