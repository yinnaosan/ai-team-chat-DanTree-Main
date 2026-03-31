/**
 * semantic_packet_builders.ts — DanTree Level 12.3
 *
 * 职责：
 *   - buildLevel11SemanticPacket(): Level11AnalysisOutput → SemanticTransportPacket
 *   - buildPositionSemanticPacket(): PositionLayerOutput → SemanticTransportPacket
 *
 * 设计原则：
 *   - 直接映射 Level11/Position 字段到协议语义对象，不依赖 keyword heuristics
 *   - 输出完全兼容 aggregateSemanticPackets()
 *   - advisory_only: true 强制执行
 *   - 所有 insight_notes 为 machine-native microphrases
 */

import {
  buildSemanticPacket,
  type SemanticTransportPacket,
  type SemanticSignalObject,
  type SemanticRiskObject,
  type SemanticInsightNote,
  type SemanticDirection,
  type SemanticTimeframe,
  type SemanticAssetType,
  type SemanticDriverType,
  type SemanticUrgency,
  type SemanticPersistence,
  type SemanticSourceQuality,
} from "./semantic_protocol";

import type {
  Level11AnalysisOutput,
  AssetType,
  SentimentPhase,
  DriverSignal,
  PolicyRealityOutput,
  PropagationChainOutput,
} from "./level11MultiAssetEngine";

import type {
  PositionLayerOutput,
  AsymmetryLabel,
  RestrictionLevel,
} from "./level105PositionLayer";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TYPE MAPPING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Level11 AssetType → SemanticAssetType */
function _mapAssetType(t: AssetType): SemanticAssetType {
  const map: Partial<Record<string, SemanticAssetType>> = {
    equity: "equity",
    commodity: "commodity",
    index: "index",
    etf_macro: "etf_macro",
    etf_sector: "etf_sector",
    etf_equity: "etf_equity",
  };
  return map[t] ?? "equity";
}

/** Level11 DriverType → SemanticDriverType */
function _mapDriverType(t: "real" | "narrative" | "mixed"): SemanticDriverType {
  if (t === "real") return "real";
  if (t === "narrative") return "narrative";
  return "behavior"; // mixed → behavior（最接近的语义）
}

/** SentimentPhase → SemanticDirection */
function _sentimentToDirection(phase: SentimentPhase): SemanticDirection {
  const positive: SentimentPhase[] = ["early_bull"];
  const negative: SentimentPhase[] = ["capitulation", "fragile"];
  const mixed: SentimentPhase[] = ["overheat", "consensus"];
  if (positive.includes(phase)) return "positive";
  if (negative.includes(phase)) return "negative";
  if (mixed.includes(phase)) return "mixed";
  return "neutral"; // skepticism
}

/** SentimentPhase → crowdedness + urgency */
function _sentimentToUrgency(phase: SentimentPhase): SemanticUrgency {
  if (phase === "overheat" || phase === "capitulation") return "high";
  if (phase === "fragile" || phase === "consensus") return "medium";
  return "low";
}

/** SentimentPhase → persistence */
function _sentimentToPersistence(phase: SentimentPhase): SemanticPersistence {
  if (phase === "early_bull") return "building";
  if (phase === "capitulation" || phase === "fragile") return "reversing";
  if (phase === "overheat") return "fading";
  return "stable";
}

/** DriverSignal strength → SemanticUrgency */
function _strengthToUrgency(strength: number): SemanticUrgency {
  if (strength >= 0.75) return "high";
  if (strength >= 0.50) return "medium";
  if (strength >= 0.30) return "low";
  return "low";
}

/** DriverSignal strength → SemanticPersistence */
function _strengthToPersistence(strength: number, type: "real" | "narrative" | "mixed"): SemanticPersistence {
  // real drivers tend to be stable; narrative can fade
  if (type === "narrative") return strength > 0.6 ? "stable" : "fading";
  return strength > 0.7 ? "building" : "stable";
}

/** PolicyRealityOutput → SemanticSourceQuality */
function _executionStrengthToQuality(strength: string): SemanticSourceQuality {
  if (strength === "strong") return "high";
  if (strength === "moderate") return "medium";
  return "low";
}

/** AsymmetryLabel → SemanticDirection */
function _asymmetryToDirection(label: AsymmetryLabel): SemanticDirection {
  if (label === "highly_favorable" || label === "favorable") return "positive";
  if (label === "poor") return "negative";
  return "neutral";
}

/** RestrictionLevel → SemanticUrgency */
function _restrictionToUrgency(level: RestrictionLevel): SemanticUrgency {
  if (level === "hard") return "critical";
  if (level === "soft") return "medium";
  return "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. buildLevel11SemanticPacket
// ─────────────────────────────────────────────────────────────────────────────

export interface Level11PacketOptions {
  /** 分析实体（ticker 或资产名） */
  entity: string;
  /** 分析时间框架，默认 "mid" */
  timeframe?: SemanticTimeframe;
  /** 发送 agent 标识，默认 "level11_multiasset_engine" */
  agent?: string;
}

/**
 * buildLevel11SemanticPacket — Level11AnalysisOutput → SemanticTransportPacket
 *
 * 映射规则：
 *   - real_drivers.drivers → signals（strength → intensity, driver.type → driver_type）
 *   - sentiment_state → signals（情绪信号）+ state.crowding + state.direction
 *   - scenario_map.invalidations → invalidations
 *   - policy_reality（可选）→ signals + risks
 *   - propagation_chain（可选）→ risks
 *   - incentives.hidden_pressure_points → insight_notes
 */
export function buildLevel11SemanticPacket(
  level11: Level11AnalysisOutput,
  options: Level11PacketOptions
): SemanticTransportPacket {
  const {
    classification,
    real_drivers,
    sentiment_state,
    scenario_map,
    incentives,
    policy_reality,
    propagation_chain,
  } = level11;

  const agent = options.agent ?? "level11_multiasset_engine";
  const timeframe = options.timeframe ?? "mid";

  // ── signals: real drivers → SemanticSignalObject[] ───────────────────────
  const driverSignals: SemanticSignalObject[] = real_drivers.drivers
    .slice(0, 6) // 最多取 6 个
    .map((d: DriverSignal): SemanticSignalObject => ({
      name: d.driver.toLowerCase().replace(/\s+/g, "_"),
      direction: d.type === "narrative" ? "mixed" : "positive",
      intensity: Math.min(1, Math.max(0, d.strength)),
      persistence: _strengthToPersistence(d.strength, d.type),
      urgency: _strengthToUrgency(d.strength),
      driver_type: _mapDriverType(d.type),
      monitoring_signal: d.monitoring_signal,
      invalidation: d.risk_if_wrong,
    }));

  // ── sentiment signal ──────────────────────────────────────────────────────
  const sentimentSignal: SemanticSignalObject = {
    name: `sentiment_phase_${sentiment_state.sentiment_phase}`,
    direction: _sentimentToDirection(sentiment_state.sentiment_phase),
    intensity: Math.min(1, sentiment_state.risk_of_reversal * 0.8 + 0.2),
    persistence: _sentimentToPersistence(sentiment_state.sentiment_phase),
    urgency: _sentimentToUrgency(sentiment_state.sentiment_phase),
    driver_type: "behavior",
    monitoring_signal: `crowdedness_level=${sentiment_state.crowdedness.toFixed(2)}`,
    invalidation: `sentiment_phase_shifts_to_opposite`,
  };

  // ── policy signal（可选） ─────────────────────────────────────────────────
  const policySignal: SemanticSignalObject | null = policy_reality ? {
    name: `policy_${policy_reality.execution_strength}_execution`,
    direction: policy_reality.execution_strength === "strong" ? "positive"
      : policy_reality.execution_strength === "weak" ? "negative" : "mixed",
    intensity: policy_reality.execution_strength === "strong" ? 0.75
      : policy_reality.execution_strength === "moderate" ? 0.50 : 0.30,
    persistence: "stable",
    urgency: "medium",
    driver_type: "policy",
    monitoring_signal: `policy_execution_strength=${policy_reality.execution_strength}`,
    invalidation: policy_reality.reversibility ?? "policy_reverses_unexpectedly",
  } : null;

  const signals: SemanticSignalObject[] = [
    ...driverSignals,
    sentimentSignal,
    ...(policySignal ? [policySignal] : []),
  ];

  // ── risks: propagation chain → SemanticRiskObject[] ──────────────────────
  const risks: SemanticRiskObject[] = [];

  if (propagation_chain?.chain) {
    propagation_chain.chain.slice(0, 4).forEach((link) => {
      risks.push({
        name: `propagation_${link.from.toLowerCase()}_to_${link.to.toLowerCase()}`,
        severity: Math.min(1, Math.max(0, link.confidence)),
        timing: link.lag === "immediate" ? "near"
          : link.lag === "short_term" ? "near" : "mid",
        containment: link.confidence > 0.7 ? "low" : "medium",
        trigger: `${link.from}_moves_significantly`,
        mitigation_path: `diversify_away_from_${link.from.toLowerCase()}_correlation`,
      });
    });
  }

  // scenario bear case → risk
  if (scenario_map.bear_case) {
    risks.push({
      name: "bear_scenario_materialization",
      severity: 0.65,
      timing: "mid",
      containment: "medium",
      trigger: scenario_map.key_triggers[0] ?? "macro_deterioration",
      mitigation_path: "monitor_key_triggers && maintain_stop_discipline",
    });
  }

  // ── state ─────────────────────────────────────────────────────────────────
  const sentimentDirection = _sentimentToDirection(sentiment_state.sentiment_phase);
  const primaryDriverDirection: SemanticDirection =
    real_drivers.drivers[0]?.type === "narrative" ? "mixed" : "positive";

  const dominant_direction: SemanticDirection =
    sentimentDirection === "negative" && primaryDriverDirection === "positive"
      ? "mixed"
      : primaryDriverDirection;

  // ── confidence ────────────────────────────────────────────────────────────
  const avgDriverStrength = real_drivers.drivers.length > 0
    ? real_drivers.drivers.reduce((s, d) => s + d.strength, 0) / real_drivers.drivers.length
    : 0.5;

  const sentimentPenalty = sentiment_state.risk_of_reversal * 0.15;
  const rawConfidence = Math.max(0.2, Math.min(0.92, avgDriverStrength - sentimentPenalty));

  const sourceQuality: SemanticSourceQuality = policy_reality
    ? _executionStrengthToQuality(policy_reality.execution_strength)
    : "medium";

  // ── insight_notes ─────────────────────────────────────────────────────────
  const insightNotes: SemanticInsightNote[] = [];

  // primary real vs narrative driver gap
  if (real_drivers.primary_real_driver && real_drivers.primary_narrative_driver) {
    insightNotes.push(
      `real_driver=${real_drivers.primary_real_driver.replace(/\s+/g, "_")} vs narrative_driver=${real_drivers.primary_narrative_driver.replace(/\s+/g, "_")}`
    );
  }

  // sentiment phase note
  insightNotes.push(
    `sentiment_phase=${sentiment_state.sentiment_phase} && crowdedness=${sentiment_state.crowdedness.toFixed(2)} && reversal_risk=${sentiment_state.risk_of_reversal.toFixed(2)}`
  );

  // incentive hidden pressure points
  if (incentives.hidden_pressure_points?.length) {
    incentives.hidden_pressure_points.slice(0, 3).forEach((p) => {
      const note = p.replace(/\s+/g, "_").slice(0, 100);
      insightNotes.push(note);
    });
  }

  // policy reality note
  if (policy_reality) {
    insightNotes.push(
      `policy_signal=${policy_reality.execution_strength}_execution && market_pricing=${policy_reality.market_pricing?.replace(/\s+/g, "_").slice(0, 40) ?? "unknown"}`
    );
  }

  // scenario summary
  insightNotes.push(
    `scenario_base=${scenario_map.base_case.replace(/\s+/g, "_").slice(0, 60)}`
  );

  // ── invalidations ─────────────────────────────────────────────────────────
  const invalidations: SemanticInsightNote[] = [
    ...scenario_map.invalidations.map((s) => s.replace(/\s+/g, "_").slice(0, 80)),
    ...real_drivers.drivers.slice(0, 3).map((d) =>
      d.risk_if_wrong.replace(/\s+/g, "_").slice(0, 80)
    ),
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

  return buildSemanticPacket({
    agent,
    task: "real_driver_identification",
    entity: options.entity,
    timeframe,
    state: {
      asset_type: _mapAssetType(classification.asset_type),
      regime: "risk_on", // L11 doesn't output regime directly; default, can be overridden
      narrative_gap: Math.min(1, Math.max(0,
        real_drivers.drivers.filter((d) => d.type === "narrative").length /
        Math.max(1, real_drivers.drivers.length)
      )),
      crowding: sentiment_state.crowdedness,
      fragility: sentiment_state.risk_of_reversal,
      timeframe,
      direction: dominant_direction,
      primary_driver: real_drivers.primary_real_driver.replace(/\s+/g, "_").slice(0, 60),
      hidden_pressure_points: incentives.hidden_pressure_points?.slice(0, 3).map(
        (p) => p.replace(/\s+/g, "_").slice(0, 80)
      ),
    },
    signals,
    risks,
    confidence: {
      score: rawConfidence,
      trend: avgDriverStrength > 0.65 ? "rising" : avgDriverStrength < 0.4 ? "falling" : "stable",
      fragility: sentiment_state.risk_of_reversal,
      source_quality: sourceQuality,
      anchored_on: real_drivers.primary_real_driver.replace(/\s+/g, "_").slice(0, 60),
    },
    constraints: [
      `analysis_mode=${classification.analysis_mode?.slice(0, 60) ?? "standard"}`,
      `driver_count=${real_drivers.drivers.length}`,
    ],
    invalidations,
    insight_notes: insightNotes,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. buildPositionSemanticPacket
// ─────────────────────────────────────────────────────────────────────────────

export interface PositionPacketOptions {
  /** 分析实体 */
  entity: string;
  /** 时间框架，默认 "mid" */
  timeframe?: SemanticTimeframe;
  /** agent 标识，默认 "level105_position_layer" */
  agent?: string;
  /**
   * 用于派生 confidence 的外部置信度基准
   * 通常来自 thesis.thesis_confidence
   */
  base_confidence?: number;
}

/**
 * buildPositionSemanticPacket — PositionLayerOutput → SemanticTransportPacket
 *
 * 映射规则：
 *   - asymmetry → 主要信号（方向 + 强度）
 *   - no_bet_discipline → 风险信号（restriction_level → severity）
 *   - sizing → 约束条件
 *   - advisory_only 强制为 true
 */
export function buildPositionSemanticPacket(
  position: PositionLayerOutput,
  options: PositionPacketOptions
): SemanticTransportPacket {
  const { asymmetry, sizing, no_bet_discipline } = position;
  const agent = options.agent ?? "level105_position_layer";
  const timeframe = options.timeframe ?? "mid";
  const baseConfidence = options.base_confidence ?? 0.60;

  // ── signals ───────────────────────────────────────────────────────────────
  const signals: SemanticSignalObject[] = [];

  // 非对称性信号
  signals.push({
    name: `asymmetry_${asymmetry.asymmetry_label}`,
    direction: _asymmetryToDirection(asymmetry.asymmetry_label),
    intensity: Math.min(1, Math.max(0, asymmetry.asymmetry_score)),
    persistence: asymmetry.asymmetry_score > 0.65 ? "building" : "stable",
    urgency: asymmetry.asymmetry_score > 0.75 ? "high" : "medium",
    driver_type: "structure",
    monitoring_signal: `asymmetry_score=${asymmetry.asymmetry_score.toFixed(2)}`,
    invalidation: `asymmetry_drops_below_0.30`,
  });

  // 仓位纪律信号
  signals.push({
    name: `no_bet_discipline_${no_bet_discipline.restriction_level}`,
    direction: no_bet_discipline.bet_allowed ? "positive" : "negative",
    intensity: no_bet_discipline.bet_allowed
      ? Math.max(0.3, asymmetry.asymmetry_score * 0.8)
      : 0.85, // 禁止下注时信号强度高（警告性）
    persistence: "stable",
    urgency: _restrictionToUrgency(no_bet_discipline.restriction_level),
    driver_type: "structure",
    monitoring_signal: `bet_allowed=${no_bet_discipline.bet_allowed} && restriction=${no_bet_discipline.restriction_level}`,
    invalidation: no_bet_discipline.bet_allowed
      ? `restriction_level_increases_to_hard`
      : `bet_conditions_improve`,
  });

  // sizing 信号（仅在允许下注时）
  if (no_bet_discipline.bet_allowed) {
    signals.push({
      name: `position_sizing_${sizing.size_bucket}`,
      direction: sizing.target_position_pct > 0 ? "positive" : "neutral",
      intensity: Math.min(1, sizing.target_position_pct / 15), // 最大 15%
      persistence: "stable",
      urgency: "low",
      driver_type: "structure",
      monitoring_signal: `target_pct=${sizing.target_position_pct.toFixed(1)}% bucket=${sizing.size_bucket}`,
    });
  }

  // ── risks ─────────────────────────────────────────────────────────────────
  const risks: SemanticRiskObject[] = [];

  // no-bet 风险（禁止下注时为高风险）
  if (!no_bet_discipline.bet_allowed) {
    risks.push({
      name: "hard_no_bet_restriction",
      severity: 0.85,
      timing: "near",
      containment: "low",
      trigger: no_bet_discipline.reason.replace(/\s+/g, "_").slice(0, 80),
      mitigation_path: "await_improved_asymmetry_or_risk_reduction",
    });
  } else if (no_bet_discipline.restriction_level === "soft") {
    risks.push({
      name: "soft_bet_restriction_active",
      severity: 0.50,
      timing: "near",
      containment: "medium",
      trigger: no_bet_discipline.reason.replace(/\s+/g, "_").slice(0, 80),
      mitigation_path: "reduce_position_size && monitor_conditions",
    });
  }

  // 低非对称性风险
  if (asymmetry.asymmetry_score < 0.35) {
    risks.push({
      name: "poor_asymmetry_risk",
      severity: 0.72,
      timing: "near",
      containment: "medium",
      trigger: `asymmetry_score_below_0.35 current=${asymmetry.asymmetry_score.toFixed(2)}`,
      mitigation_path: "wait_for_better_risk_reward_entry",
    });
  }

  // ── confidence ────────────────────────────────────────────────────────────
  // Position layer confidence = base × asymmetry_score × bet_allowed_factor
  const betFactor = no_bet_discipline.bet_allowed ? 1.0 : 0.4;
  const positionConfidence = Math.min(0.92, Math.max(0.15,
    baseConfidence * asymmetry.asymmetry_score * betFactor
  ));

  const confidenceTrend = asymmetry.asymmetry_label === "highly_favorable" ? "rising"
    : asymmetry.asymmetry_label === "poor" ? "falling" : "stable";

  // ── constraints ───────────────────────────────────────────────────────────
  const constraints: SemanticInsightNote[] = [
    `size_bucket=${sizing.size_bucket} && target_pct=${sizing.target_position_pct.toFixed(1)}%`,
    `bet_allowed=${no_bet_discipline.bet_allowed} && restriction=${no_bet_discipline.restriction_level}`,
  ];

  // ── invalidations ─────────────────────────────────────────────────────────
  const invalidations: SemanticInsightNote[] = [
    `asymmetry_drops_below_0.25`,
    `restriction_level_becomes_hard`,
    `target_position_pct_reaches_zero`,
  ];

  // ── insight_notes ─────────────────────────────────────────────────────────
  const insightNotes: SemanticInsightNote[] = [
    `asymmetry_score=${asymmetry.asymmetry_score.toFixed(2)} label=${asymmetry.asymmetry_label}`,
    `sizing=${sizing.size_bucket} target_pct=${sizing.target_position_pct.toFixed(1)}%`,
    `no_bet_discipline: bet_allowed=${no_bet_discipline.bet_allowed} restriction=${no_bet_discipline.restriction_level}`,
  ];

  // asymmetry rationale（machine-native 截断）
  if (asymmetry.why) {
    insightNotes.push(
      `asymmetry_rationale=${asymmetry.why.replace(/\s+/g, "_").slice(0, 80)}`
    );
  }

  // ── direction（从非对称性导出） ───────────────────────────────────────────
  const dominantDirection = _asymmetryToDirection(asymmetry.asymmetry_label);

  return buildSemanticPacket({
    agent,
    task: "position_integration",
    entity: options.entity,
    timeframe,
    state: {
      asset_type: "equity", // position layer は汎用；呼び出し元で override 可能
      regime: no_bet_discipline.bet_allowed ? "risk_on" : "risk_off",
      narrative_gap: 0,        // position layer はナラティブを直接評価しない
      crowding: 0.5,           // position layer は crowding を直接評価しない
      fragility: no_bet_discipline.bet_allowed
        ? Math.max(0.1, 1 - asymmetry.asymmetry_score)
        : 0.85,
      timeframe,
      direction: dominantDirection,
      primary_driver: `asymmetry_${asymmetry.asymmetry_label}_score_${asymmetry.asymmetry_score.toFixed(2)}`,
    },
    signals,
    risks,
    confidence: {
      score: positionConfidence,
      trend: confidenceTrend,
      fragility: no_bet_discipline.bet_allowed ? 0.3 : 0.8,
      source_quality: asymmetry.asymmetry_score >= 0.65 ? "high" : "medium",
      anchored_on: `asymmetry_score_${asymmetry.asymmetry_label}`,
    },
    constraints,
    invalidations,
    insight_notes: insightNotes,
  });
}
