/**
 * semantic_protocol_integration.ts — DanTree Level 12.1 Phase 1 Integration Layer
 *
 * 集成策略：wrapper-first，不修改 Claude 协议层，不修改业务逻辑
 *
 * Phase 1 集成路径：
 *   PATH-A: Level11 analysis → narrative synthesis handoff
 *   PATH-B: Experience Layer → synthesis handoff
 *   PATH-C: Position Layer → synthesis/decision handoff
 *
 * 约束：
 *   - No DB changes
 *   - No Level 11 / 11.5 / 12 logic redesign
 *   - Backward compatible: all wrappers return original output + optional protocol packet
 *   - Claude protocol layer (semantic_protocol.ts) is source of truth — DO NOT modify
 */

import {
  SemanticTransportPacket,
  SemanticStateEnvelope,
  SemanticSignalObject,
  SemanticRiskObject,
  SemanticConfidence,
  SemanticInsightNote,
  buildSemanticPacket,
  validateSemanticPacket,
  normalizeSemanticPacket,
  compressSemanticNotes,
  ValidationResult,
} from "./semantic_protocol";

import type { Level11AnalysisOutput } from "./level11MultiAssetEngine";
import type { ExperienceLayerInsight } from "./experienceLayer";
import type { ResearchNarrativeOutput } from "./deepResearchEngine";

// ─────────────────────────────────────────────────────────────────────────────
// ENFORCEMENT GUARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NATURAL_LANG_THRESHOLD — 超过此字符数且含多个空格的字符串视为自然语言段落
 * 对齐 semantic_protocol.ts 中的 LONG_FORM_PATTERN（120 chars）
 */
const NATURAL_LANG_THRESHOLD = 120;

/**
 * rejectNaturalLanguageInternalPayload
 *
 * Enforcement guard: 检测内部 agent payload 是否包含自然语言段落。
 * 仅在已集成路径上调用，不全局拦截。
 *
 * Rules:
 *   - payload 为 string → 直接检测
 *   - payload 为 object → 检测所有 string 类型的 leaf values
 *   - 短语义短语（< 120 chars，无多个空格）→ 允许
 *   - 长自然语言段落（>= 120 chars，含空格）→ warn / throw
 *
 * @param payload - 待检测的内部 agent 通信 payload
 * @param path - 调用路径标识（用于日志）
 * @param mode - "warn"（默认，仅警告）| "throw"（严格模式，抛出错误）
 */
export function rejectNaturalLanguageInternalPayload(
  payload: unknown,
  path: string,
  mode: "warn" | "throw" = "warn"
): { violations: string[]; clean: boolean } {
  const violations: string[] = [];

  function checkValue(value: unknown, keyPath: string): void {
    if (typeof value === "string") {
      const trimmed = value.trim();
      // 检测：长度超阈值 且 含多个空格（自然语言特征）
      if (trimmed.length >= NATURAL_LANG_THRESHOLD && /\s{1,}/.test(trimmed)) {
        const spaceCount = (trimmed.match(/\s+/g) ?? []).length;
        if (spaceCount > 5) {
          violations.push(`[${path}] ${keyPath}: natural_lang_detected (${trimmed.length} chars, ${spaceCount} spaces)`);
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, idx) => checkValue(item, `${keyPath}[${idx}]`));
    } else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        checkValue(v, `${keyPath}.${k}`);
      }
    }
  }

  checkValue(payload, "payload");

  if (violations.length > 0) {
    const msg = `[semantic_protocol_enforcement] Natural language detected in integrated path:\n${violations.join("\n")}`;
    if (mode === "throw") {
      throw new Error(msg);
    } else {
      console.warn(msg);
    }
  }

  return { violations, clean: violations.length === 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG VISIBILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * debugSemanticPacket
 *
 * Developer-visible debug output for SemanticTransportPacket inspection.
 * Logs to console in development mode only.
 * No UI required — just enough to verify packet contents during testing.
 */
export function debugSemanticPacket(
  packet: SemanticTransportPacket,
  label: string
): void {
  if (process.env.NODE_ENV === "production") return;

  const validation = validateSemanticPacket(packet);
  const topSignal = packet.signals[0];
  const topRisk = packet.risks[0];

  console.log(
    `[SemanticProtocol:DEBUG] ${label}\n` +
    `  agent=${packet.agent} task=${packet.task} entity=${packet.entity}\n` +
    `  timeframe=${packet.timeframe} protocol=${packet.protocol_version}\n` +
    `  state: regime=${packet.state.regime} direction=${packet.state.direction}\n` +
    `         narrative_gap=${packet.state.fragility.toFixed(2)} crowding=${packet.state.crowding.toFixed(2)} fragility=${packet.state.fragility.toFixed(2)}\n` +
    `  signals[0]: ${topSignal ? `${topSignal.name} (${topSignal.direction}, intensity=${topSignal.intensity.toFixed(2)})` : "none"}\n` +
    `  risks[0]:   ${topRisk ? `${topRisk.name} (severity=${topRisk.severity.toFixed(2)}, timing=${topRisk.timing})` : "none"}\n` +
    `  confidence: score=${packet.confidence.score.toFixed(2)} trend=${packet.confidence.trend} fragility=${packet.confidence.fragility.toFixed(2)}\n` +
    `  validation: ${validation.valid ? "PASS" : "FAIL"} errors=${validation.errors.length} warnings=${validation.warnings.length}\n` +
    `  advisory_only=${packet.advisory_only} generated_at=${packet.generated_at ?? "N/A"}`
  );

  if (!validation.valid) {
    console.warn(`[SemanticProtocol:VALIDATION_FAIL] ${label}:`, validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.warn(`[SemanticProtocol:WARNINGS] ${label}:`, validation.warnings);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH-A: Level11 Analysis → Narrative Synthesis Handoff
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildLevel11SemanticPacket
 *
 * PATH-A wrapper: 将 Level11AnalysisOutput 转换为 SemanticTransportPacket。
 * 用于 Level11 → narrative synthesis handoff 路径。
 *
 * 调用位置：composeResearchNarrative() 接收 level11Analysis 参数时
 * 不修改 Level11 业务逻辑，仅在 handoff 边界构建协议包。
 */
export function buildLevel11SemanticPacket(
  l11: Level11AnalysisOutput,
  ticker: string
): SemanticTransportPacket {
  const assetType = l11.classification.asset_type as SemanticStateEnvelope["asset_type"];
  const regime = _mapRegime(l11.sentiment_state?.sentiment_phase);
  const direction = _mapDirection(l11.real_drivers?.drivers?.[0]?.type);

  // Build signals from real_drivers + sentiment
  const signals: SemanticSignalObject[] = [];

  // Top real driver → signal
  const topRealDriver = l11.real_drivers?.drivers?.find(d => d.type === "real");
  if (topRealDriver) {
    signals.push({
      name: _toMachinePhrase(topRealDriver.driver),
      direction: "positive",
      intensity: Math.min(0.9, topRealDriver.strength ?? 0.7),
      persistence: "stable",
      urgency: "medium",
      driver_type: "real",
      monitoring_signal: topRealDriver.monitoring_signal
        ? _toMachinePhrase(topRealDriver.monitoring_signal)
        : undefined,
      invalidation: topRealDriver.risk_if_wrong
        ? _toMachinePhrase(topRealDriver.risk_if_wrong)
        : undefined,
    });
  }

  // Top narrative driver → signal
  const topNarrativeDriver = l11.real_drivers?.drivers?.find(d => d.type === "narrative");
  if (topNarrativeDriver) {
    signals.push({
      name: _toMachinePhrase(topNarrativeDriver.driver),
      direction: "mixed",
      intensity: Math.min(0.8, topNarrativeDriver.strength ?? 0.6),
      persistence: "fading",
      urgency: "medium",
      driver_type: "narrative",
    });
  }

  // Sentiment crowdedness → signal
  if (l11.sentiment_state) {
    const sp = l11.sentiment_state;
    if (sp.crowdedness >= 0.5) {
      signals.push({
        name: "sentiment_crowding_pressure",
        direction: "negative",
        intensity: sp.crowdedness,
        persistence: sp.crowdedness >= 0.8 ? "building" : "stable",
        urgency: sp.crowdedness >= 0.8 ? "high" : "medium",
        driver_type: "behavior",
        monitoring_signal: "positioning_vs_historical_percentile",
        invalidation: "crowding_unwind_catalyst_absent",
      });
    }
  }

  // Build risks from scenario_map bear case + sentiment reversal
  const risks: SemanticRiskObject[] = [];

  if (l11.scenario_map) {
    const sm = l11.scenario_map;
    const topTrigger = sm.key_triggers?.[0];
    if (topTrigger) {
      risks.push({
        name: _toMachinePhrase(topTrigger),
        severity: 0.65,
        timing: "near",
        containment: "medium",
        trigger: _toMachinePhrase(topTrigger),
      });
    }
  }

  if (l11.sentiment_state && l11.sentiment_state.risk_of_reversal >= 0.5) {
    risks.push({
      name: "sentiment_reversal_risk",
      severity: l11.sentiment_state.risk_of_reversal,
      timing: "near",
      containment: l11.sentiment_state.risk_of_reversal >= 0.7 ? "low" : "medium",
      trigger: "positioning_unwind_catalyst",
      mitigation_path: "reduce_crowded_exposure_before_catalyst",
    });
  }

  // Confidence from real_drivers signal_vs_noise
  const confidenceScore = _extractConfidenceScore(l11);
  const confidence: SemanticConfidence = {
    score: confidenceScore,
    trend: "stable",
    fragility: l11.sentiment_state?.risk_of_reversal ?? 0.4,
    source_quality: "medium",
    anchored_on: topRealDriver
      ? _toMachinePhrase(topRealDriver.driver)
      : "multi_factor_signal_convergence",
  };

  // Insight notes from Level11 key observations
  const rawNotes: SemanticInsightNote[] = [];
  if (l11.real_drivers?.signal_vs_noise_summary) {
    rawNotes.push(_toMachinePhrase(l11.real_drivers.signal_vs_noise_summary));
  }
  if (l11.incentives?.narrative_fragility) {
    rawNotes.push(`narrative_fragility_${l11.incentives.narrative_fragility.replace(/\s+/g, "_").toLowerCase()}`);
  }
  if (l11.sentiment_state) {
    rawNotes.push(
      `sentiment_phase_${l11.sentiment_state.sentiment_phase}`,
      `crowding_${l11.sentiment_state.crowdedness.toFixed(2)}`,
      `reversal_risk_${l11.sentiment_state.risk_of_reversal.toFixed(2)}`
    );
  }

  const insight_notes = compressSemanticNotes(rawNotes);

  // Constraints from policy reality
  const constraints: SemanticInsightNote[] = [];
  if (l11.policy_reality) {
    constraints.push(
      `policy_execution_${l11.policy_reality.execution_strength.replace(/\s+/g, "_").toLowerCase()}`,
      `policy_consistency_${l11.policy_reality.execution_consistency.replace(/\s+/g, "_").toLowerCase()}`
    );
  }
  if (constraints.length === 0) {
    constraints.push("no_policy_constraint_identified");
  }

  // Invalidations from scenario map
  const invalidations: SemanticInsightNote[] = [];
  if (l11.scenario_map?.key_triggers) {
    l11.scenario_map.key_triggers.slice(0, 2).forEach(t => {
      invalidations.push(_toMachinePhrase(t));
    });
  }
  if (invalidations.length === 0) {
    invalidations.push("no_explicit_invalidation_identified");
  }

  const packet = buildSemanticPacket({
    agent: "level11_multiasset_engine",
    task: "driver_routing",
    entity: ticker,
    timeframe: "short",
    state: {
      asset_type: assetType,
      regime,
      narrative_gap: l11.incentives?.narrative_fragility === "high" ? 0.7
        : l11.incentives?.narrative_fragility === "medium" ? 0.45 : 0.2,
      crowding: l11.sentiment_state?.crowdedness ?? 0.4,
      fragility: l11.sentiment_state?.risk_of_reversal ?? 0.4,
      timeframe: "short",
      direction,
      primary_driver: topRealDriver
        ? _toMachinePhrase(topRealDriver.driver)
        : "multi_factor_composite",
      hidden_pressure_points: compressSemanticNotes(
        (l11.real_drivers?.drivers ?? [])
          .filter(d => d.type === "narrative")
          .slice(0, 3)
          .map(d => `narrative_pressure_${_toMachinePhrase(d.driver)}`)
      ),
    },
    signals: signals.length > 0 ? signals : [{
      name: "insufficient_signal_density",
      direction: "neutral",
      intensity: 0.3,
      persistence: "stable",
      urgency: "low",
      driver_type: "real",
    }],
    risks: risks.length > 0 ? risks : [{
      name: "unquantified_tail_risk",
      severity: 0.3,
      timing: "unclear",
      containment: "medium",
      trigger: "unknown_catalyst",
    }],
    confidence,
    constraints,
    invalidations,
    insight_notes: insight_notes.length > 0 ? insight_notes : ["signal_density_insufficient_for_high_confidence"],
  });

  const normalized = normalizeSemanticPacket(packet);
  debugSemanticPacket(normalized, `PATH-A:level11→narrative_synthesis:${ticker}`);
  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH-B: Experience Layer → Synthesis Handoff
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildExperienceLayerSemanticPacket
 *
 * PATH-B wrapper: 将 ExperienceLayerInsight 转换为 SemanticTransportPacket。
 * 用于 Experience Layer → synthesis handoff 路径。
 *
 * 调用位置：composeResearchNarrative() 接收 experienceInsightText 参数时
 */
export function buildExperienceLayerSemanticPacket(
  insight: ExperienceLayerInsight,
  ticker: string,
  confidenceScore?: number
): SemanticTransportPacket {
  // Detect drift direction from insight text
  const driftDirection = insight.drift_interpretation.includes("weakening") ? "negative"
    : insight.drift_interpretation.includes("strengthening") ? "positive"
    : "neutral";

  // Detect confidence trend
  const confidenceTrend = insight.confidence_evolution.includes("declining") || insight.confidence_evolution.includes("falling") ? "falling"
    : insight.confidence_evolution.includes("building") || insight.confidence_evolution.includes("rising") ? "rising"
    : "stable";

  // Detect risk state
  const riskState = insight.risk_gradient.includes("elevated") ? "elevated"
    : insight.risk_gradient.includes("building") ? "building"
    : "low";

  const signals: SemanticSignalObject[] = [
    {
      name: "thesis_drift_signal",
      direction: driftDirection as SemanticSignalObject["direction"],
      intensity: driftDirection === "negative" ? 0.65 : driftDirection === "positive" ? 0.7 : 0.4,
      persistence: driftDirection === "negative" ? "fading" : driftDirection === "positive" ? "building" : "stable",
      urgency: riskState === "elevated" ? "high" : "medium",
      driver_type: "behavior",
      monitoring_signal: "thesis_signal_convergence_vs_divergence",
    },
  ];

  const risks: SemanticRiskObject[] = [];
  if (riskState === "elevated" || riskState === "building") {
    risks.push({
      name: `risk_gradient_${riskState}`,
      severity: riskState === "elevated" ? 0.7 : 0.5,
      timing: "near",
      containment: riskState === "elevated" ? "low" : "medium",
      trigger: "early_warning_signal_acceleration",
      mitigation_path: "position_size_reduction_on_confirmation",
    });
  }

  const confidence: SemanticConfidence = {
    score: confidenceScore ?? 0.55,
    trend: confidenceTrend,
    fragility: riskState === "elevated" ? 0.65 : riskState === "building" ? 0.45 : 0.25,
    source_quality: "medium",
    anchored_on: "thesis_signal_continuity",
  };

  const insight_notes = compressSemanticNotes([
    `drift_${driftDirection}`,
    `confidence_trend_${confidenceTrend}`,
    `risk_state_${riskState}`,
    "experience_layer_judgment_applied",
  ]);

  const packet = buildSemanticPacket({
    agent: "experience_layer_engine",
    task: "hypothesis_validation",
    entity: ticker,
    timeframe: "mid",
    state: {
      asset_type: "equity",
      regime: driftDirection === "negative" ? "risk_off" : "risk_on",
      narrative_gap: driftDirection === "negative" ? 0.55 : 0.3,
      crowding: 0.4,
      fragility: riskState === "elevated" ? 0.65 : 0.35,
      timeframe: "mid",
      direction: driftDirection as SemanticSignalObject["direction"],
      primary_driver: "thesis_drift_and_confidence_evolution",
    },
    signals,
    risks: risks.length > 0 ? risks : [{
      name: "no_material_risk_detected",
      severity: 0.2,
      timing: "unclear",
      containment: "high",
      trigger: "unexpected_thesis_invalidation",
    }],
    confidence,
    constraints: ["experience_layer_judgment_is_retrospective"],
    invalidations: ["thesis_invalidation_conditions_met"],
    insight_notes,
  });

  const normalized = normalizeSemanticPacket(packet);
  debugSemanticPacket(normalized, `PATH-B:experience_layer→synthesis:${ticker}`);
  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH-C: Position Layer → Synthesis/Decision Handoff
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PositionLayerHandoffInput — Position Layer handoff 的最小输入接口
 * 兼容 level105PositionLayer.ts 的输出结构
 */
export interface PositionLayerHandoffInput {
  ticker: string;
  size_bucket: string;           // SizeBucket105
  target_position_pct: number;
  asymmetry_score?: number;      // 0–1
  asymmetry_label?: string;      // "poor"|"neutral"|"favorable"|"highly_favorable"
  adjustment_direction?: string; // "increase"|"decrease"|"hold"|"avoid"
  concentration_risk?: string;   // "low"|"medium"|"high"
  regime_tag?: string;
  drift_trend?: string;
  advisory_only: true;
}

/**
 * buildPositionLayerSemanticPacket
 *
 * PATH-C wrapper: 将 Position Layer 输出转换为 SemanticTransportPacket。
 * 用于 Position Layer → synthesis/decision handoff 路径。
 */
export function buildPositionLayerSemanticPacket(
  positionOutput: PositionLayerHandoffInput
): SemanticTransportPacket {
  const ticker = positionOutput.ticker;
  const asymmetry = positionOutput.asymmetry_score ?? 0.5;
  const direction = positionOutput.adjustment_direction === "increase" ? "positive"
    : positionOutput.adjustment_direction === "decrease" || positionOutput.adjustment_direction === "avoid" ? "negative"
    : "neutral";

  const signals: SemanticSignalObject[] = [
    {
      name: `position_sizing_${positionOutput.size_bucket}`,
      direction: direction as SemanticSignalObject["direction"],
      intensity: asymmetry,
      persistence: positionOutput.drift_trend === "weakening" ? "fading"
        : positionOutput.drift_trend === "strengthening" ? "building" : "stable",
      urgency: positionOutput.concentration_risk === "high" ? "high"
        : positionOutput.concentration_risk === "medium" ? "medium" : "low",
      driver_type: "structure",
      monitoring_signal: "asymmetry_score_vs_target_position_pct",
      invalidation: "asymmetry_deteriorates_below_0.3",
    },
  ];

  const risks: SemanticRiskObject[] = [];
  if (positionOutput.concentration_risk === "high") {
    risks.push({
      name: "concentration_risk_high",
      severity: 0.75,
      timing: "near",
      containment: "low",
      trigger: "portfolio_capacity_exceeded",
      mitigation_path: "reduce_position_to_starter_bucket",
    });
  }
  if (positionOutput.drift_trend === "weakening") {
    risks.push({
      name: "thesis_drift_weakening",
      severity: 0.6,
      timing: "near",
      containment: "medium",
      trigger: "drift_acceleration_confirmed",
      mitigation_path: "staged_position_reduction",
    });
  }

  const confidence: SemanticConfidence = {
    score: asymmetry,
    trend: positionOutput.drift_trend === "weakening" ? "falling"
      : positionOutput.drift_trend === "strengthening" ? "rising" : "stable",
    fragility: positionOutput.concentration_risk === "high" ? 0.7
      : positionOutput.concentration_risk === "medium" ? 0.45 : 0.25,
    source_quality: "high",
    anchored_on: `asymmetry_label_${positionOutput.asymmetry_label ?? "neutral"}`,
  };

  const insight_notes = compressSemanticNotes([
    `size_bucket_${positionOutput.size_bucket}`,
    `target_pct_${positionOutput.target_position_pct.toFixed(1)}`,
    `asymmetry_${positionOutput.asymmetry_label ?? "neutral"}`,
    `concentration_${positionOutput.concentration_risk ?? "unknown"}`,
    `regime_${positionOutput.regime_tag ?? "untagged"}`,
    `drift_${positionOutput.drift_trend ?? "stable"}`,
  ]);

  const packet = buildSemanticPacket({
    agent: "level105_position_layer",
    task: "position_integration",
    entity: ticker,
    timeframe: "short",
    state: {
      asset_type: "equity",
      regime: positionOutput.concentration_risk === "high" ? "risk_off"
        : direction === "positive" ? "risk_on" : "transition",
      narrative_gap: 0.2,
      crowding: positionOutput.concentration_risk === "high" ? 0.8
        : positionOutput.concentration_risk === "medium" ? 0.5 : 0.3,
      fragility: positionOutput.concentration_risk === "high" ? 0.7 : 0.35,
      timeframe: "short",
      direction: direction as SemanticSignalObject["direction"],
      primary_driver: `position_sizing_asymmetry_${positionOutput.asymmetry_label ?? "neutral"}`,
    },
    signals,
    risks: risks.length > 0 ? risks : [{
      name: "no_material_position_risk",
      severity: 0.2,
      timing: "unclear",
      containment: "high",
      trigger: "unexpected_asymmetry_deterioration",
    }],
    confidence,
    constraints: [
      `portfolio_capacity_constraint`,
      `advisory_only_no_auto_execution`,
    ],
    invalidations: [
      `asymmetry_score_falls_below_0.3`,
      `concentration_risk_escalates_to_high`,
    ],
    insight_notes,
  });

  const normalized = normalizeSemanticPacket(packet);
  debugSemanticPacket(normalized, `PATH-C:position_layer→synthesis:${ticker}`);
  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION REGISTRY — 记录已集成路径
// ─────────────────────────────────────────────────────────────────────────────

export const SEMANTIC_INTEGRATION_REGISTRY = {
  protocol_version: "12.1",
  phase: "1",
  integrated_paths: [
    {
      id: "PATH-A",
      from: "level11_multiasset_engine",
      to: "narrative_synthesis",
      function: "buildLevel11SemanticPacket",
      task_type: "driver_routing",
      status: "integrated",
    },
    {
      id: "PATH-B",
      from: "experience_layer_engine",
      to: "synthesis_handoff",
      function: "buildExperienceLayerSemanticPacket",
      task_type: "hypothesis_validation",
      status: "integrated",
    },
    {
      id: "PATH-C",
      from: "level105_position_layer",
      to: "synthesis_decision",
      function: "buildPositionLayerSemanticPacket",
      task_type: "position_integration",
      status: "integrated",
    },
  ],
  remaining_natural_language_paths: [
    {
      id: "PATH-D",
      location: "deepResearchEngine.ts:composeResearchNarrative()",
      description: "ResearchNarrativeOutput.narrative fields are natural language strings",
      reason: "final_user_facing_output — intentional natural language",
      migration_phase: "not_required",
    },
    {
      id: "PATH-E",
      location: "synthesisController.ts:StructuredSynthesis",
      description: "key_evidence, reasoning, counterarguments, risks, next_steps are string[]",
      reason: "user_facing_synthesis — intentional natural language",
      migration_phase: "phase_2_candidate",
    },
    {
      id: "PATH-F",
      location: "synthesisEngine.ts:SynthesisEnrichment",
      description: "synthesis_instructions is natural language prompt",
      reason: "llm_prompt_template — intentional natural language",
      migration_phase: "not_required",
    },
    {
      id: "PATH-G",
      location: "rpa.ts:callOpenAI()",
      description: "user-supplied openaiApiKey direct path",
      reason: "user_key_pathway — out_of_scope",
      migration_phase: "task_001D_candidate",
    },
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * _toMachinePhrase — 将自然语言字符串转换为机器语义短语
 * 规则：截断到 80 字符，空格替换为下划线，转小写，移除特殊字符
 */
function _toMachinePhrase(text: string): string {
  return text
    .trim()
    .slice(0, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_\s\-\.]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * _mapRegime — 将 Level11 sentiment_phase 映射到 SemanticRegime
 */
function _mapRegime(sentimentPhase?: string): SemanticStateEnvelope["regime"] {
  if (!sentimentPhase) return "transition";
  const phase = sentimentPhase.toLowerCase();
  if (phase.includes("euphoria") || phase.includes("greed") || phase.includes("bull")) return "risk_on";
  if (phase.includes("fear") || phase.includes("panic") || phase.includes("bear")) return "risk_off";
  if (phase.includes("event") || phase.includes("shock")) return "event_shock";
  if (phase.includes("policy")) return "policy_driven";
  if (phase.includes("squeeze") || phase.includes("technical")) return "technical_squeeze";
  return "transition";
}

/**
 * _mapDirection — 将 driver type 映射到 SemanticDirection
 */
function _mapDirection(driverType?: string): SemanticStateEnvelope["direction"] {
  if (!driverType) return "mixed";
  if (driverType === "real") return "positive";
  if (driverType === "narrative") return "mixed";
  return "neutral";
}

/**
 * _extractConfidenceScore — 从 Level11AnalysisOutput 提取置信度分数
 */
function _extractConfidenceScore(l11: Level11AnalysisOutput): number {
  const drivers = l11.real_drivers?.drivers ?? [];
  if (drivers.length === 0) return 0.4;
  const avgConfidence = drivers.reduce((sum, d) => sum + (d.strength ?? 0.5), 0) / drivers.length;
  // 降低叙事驱动主导时的置信度
  const narrativeRatio = drivers.filter(d => d.type === "narrative").length / drivers.length;
  return Math.max(0.2, Math.min(0.9, avgConfidence * (1 - narrativeRatio * 0.3)));
}
