/**
 * semantic_aggregator.ts — DanTree Level 12.2 Semantic Aggregation Layer
 *
 * 职责：
 *   - 将多个 SemanticTransportPacket 聚合为单一 UnifiedSemanticState
 *   - 信号/风险合并（去重 + 加权）
 *   - 置信度聚合（含冲突检测）
 *   - 状态冲突显性化（不隐藏矛盾，保留冲突记录）
 *   - 提供 synthesisController 消费接口
 *   - 提供 ExperienceLayer 机器原生语义输出构建器
 *
 * 协议版本：12.2
 *
 * 设计原则：
 *   - 矛盾必须显式保留在 conflicts[] — 绝不静默折叠
 *   - 语义密度优先于简洁性
 *   - 所有输出保持 advisory_only: true
 */

import type {
  SemanticTransportPacket,
  SemanticSignalObject,
  SemanticRiskObject,
  SemanticConfidence,
  SemanticStateEnvelope,
  SemanticInsightNote,
  SemanticDirection,
  SemanticTimeframe,
  SemanticSourceQuality,
  SemanticConfidenceTrend,
} from "./semantic_protocol";

import type {
  ExperienceLayerOutput,
  DriftDetectionOutput,
  ConfidenceUpdateOutput,
  ManagementBehaviorOutput,
  MarketBehaviorOutput,
  GradientRiskOutput,
} from "./experienceLayer";

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNIFIED SEMANTIC STATE
// ─────────────────────────────────────────────────────────────────────────────

/** 方向冲突记录 */
export interface SemanticConflict {
  /** 冲突字段标识 */
  field: string;
  /** 冲突的值列表（含来源 agent） */
  conflicting_values: Array<{
    agent: string;
    value: string;
    source_quality: SemanticSourceQuality;
  }>;
  /** 冲突严重性 0–1 */
  severity: number;
  /**
   * 冲突处理策略
   * dominant = 最高质量/频率源胜出
   * unresolved = 无法确定主导方向
   */
  resolution: "dominant" | "unresolved";
  /** machine-native 冲突摘要 */
  summary: SemanticInsightNote;
}

/** 聚合置信度（支持 mixed trend） */
export interface AggregatedConfidence {
  score: number;
  trend: SemanticConfidenceTrend | "mixed";
  fragility: number;
  source_quality: SemanticSourceQuality | "mixed";
  /** 置信度离散度（各 packet 分数标准差），越高表示来源分歧越大 */
  dispersion: number;
  /** 是否因来源分歧而降级 */
  downgraded: boolean;
  anchored_on?: string;
}

/** 状态摘要（从多个 state envelopes 聚合） */
export interface AggregatedStateSummary {
  /** 主体制（多数票） */
  regime?: string;
  /** 平均叙事偏差 */
  narrative_gap?: number;
  /** 平均持仓拥挤度 */
  crowding?: number;
  /** 最高脆弱性（保守估计） */
  fragility?: number;
  /** 主驱动因子（最高置信度 packet 的值） */
  policy_bias?: string;
  /** 趋势方向（聚合自 state.direction） */
  trend?: SemanticDirection;
}

/**
 * UnifiedSemanticState — Level 12.2 聚合输出
 *
 * 多个 SemanticTransportPacket → 一个 UnifiedSemanticState
 * 供 synthesisController 在生成自然语言前消费
 */
export interface UnifiedSemanticState {
  protocol_version: "12.2";
  /** 分析实体 */
  entity: string;
  /** 聚合时间框架（优先使用最长的） */
  timeframe: SemanticTimeframe;
  /**
   * 主导方向
   * 如有不可调和的冲突，设为 "mixed"
   * 如来源太少，设为 "unclear"
   */
  dominant_direction: SemanticDirection | "unclear";
  /** 状态摘要 */
  state_summary: AggregatedStateSummary;
  /** 聚合信号（已去重 + 加权 + 排序） */
  signals: SemanticSignalObject[];
  /** 聚合风险（已去重 + 保留最高 severity） */
  risks: SemanticRiskObject[];
  /** 聚合置信度 */
  confidence: AggregatedConfidence;
  /** 显式冲突记录（不可隐藏） */
  conflicts: SemanticConflict[];
  /** 合并后的失效条件 */
  invalidations: SemanticInsightNote[];
  /** 合并后的语义洞察注释 */
  semantic_notes: SemanticInsightNote[];
  /** 参与聚合的 agent 列表 */
  source_agents: string[];
  /** 参与聚合的 packet 数量 */
  packet_count: number;
  advisory_only: true;
  generated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AGGREGATION INPUT
// ─────────────────────────────────────────────────────────────────────────────

export interface AggregationInput {
  /** 待聚合的协议包（至少 1 个） */
  packets: SemanticTransportPacket[];
  /**
   * 可选：各 agent 的权重覆盖
   * 默认权重由 source_quality 决定
   */
  agent_weights?: Record<string, number>;
  /**
   * 信号去重语义相似度阈值（0–1）
   * 默认 0.75：名称前缀相同且 driver_type 相同视为同一信号
   */
  signal_dedup_threshold?: number;
  /**
   * 风险去重阈值
   * 默认 0.80
   */
  risk_dedup_threshold?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_QUALITY_WEIGHT: Record<SemanticSourceQuality, number> = {
  high: 1.0,
  medium: 0.65,
  low: 0.35,
  unverified: 0.15,
};

function _qualityWeight(q: SemanticSourceQuality): number {
  return SOURCE_QUALITY_WEIGHT[q] ?? 0.5;
}

/**
 * 语义相似度（简单：共同 token 比例）
 * 生产环境可替换为 embedding 相似度
 */
function _semanticSimilarity(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/[_\s-]+/));
  const tokB = new Set(b.toLowerCase().split(/[_\s-]+/));
  let intersection = 0;
  for (const t of Array.from(tokA)) if (tokB.has(t)) intersection++;
  const union = tokA.size + tokB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function _stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function _dominantValue<T extends string>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts: Partial<Record<string, number>> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  let best: T | null = null;
  let bestCount = 0;
  for (const [k, c] of Object.entries(counts)) {
    if ((c ?? 0) > bestCount) { bestCount = c ?? 0; best = k as T; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MERGE SIGNALS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * mergeSignals — 信号合并
 *
 * 规则：
 *   - 语义相似度 >= threshold 且 driver_type 相同 → 视为同一信号，加权平均 intensity
 *   - 保留不同 driver_type 的同名信号（实际上是不同维度的驱动）
 *   - 输出按 weighted_intensity 降序
 */
export function mergeSignals(
  allSignals: Array<{ signal: SemanticSignalObject; quality: SemanticSourceQuality }>,
  dedupThreshold = 0.75
): SemanticSignalObject[] {
  const groups: Array<{
    representative: SemanticSignalObject;
    members: Array<{ signal: SemanticSignalObject; weight: number }>;
  }> = [];

  for (const { signal, quality } of allSignals) {
    const weight = _qualityWeight(quality);
    let matched = false;

    for (const group of groups) {
      const sim = _semanticSimilarity(signal.name, group.representative.name);
      if (sim >= dedupThreshold && signal.driver_type === group.representative.driver_type) {
        group.members.push({ signal, weight });
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.push({
        representative: { ...signal },
        members: [{ signal, weight }],
      });
    }
  }

  return groups.map((g) => {
    const totalWeight = g.members.reduce((s, m) => s + m.weight, 0);

    // 加权平均 intensity
    const intensity = g.members.reduce(
      (s, m) => s + m.signal.intensity * m.weight, 0
    ) / totalWeight;

    // 方向：多数票（加权）
    const directionVotes: Record<string, number> = {};
    for (const { signal, weight } of g.members) {
      directionVotes[signal.direction] = (directionVotes[signal.direction] ?? 0) + weight;
    }
    const direction = (Object.entries(directionVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      g.representative.direction) as SemanticSignalObject["direction"];

    // persistence / urgency：取最近出现值（最后一个 member 优先）
    const last = g.members[g.members.length - 1].signal;

    return {
      ...g.representative,
      direction,
      intensity: Math.min(1, Math.max(0, intensity)),
      persistence: last.persistence,
      urgency: last.urgency,
    };
  }).sort((a, b) => b.intensity - a.intensity);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MERGE RISKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * mergeRisks — 风险合并
 *
 * 规则：
 *   - 语义相似度 >= threshold → 同一风险，保留最高 severity
 *   - 保留 timing / containment 的 nuance（不折叠为单值）
 *   - trigger 合并（保留所有不同的触发条件）
 *   - 输出按 severity 降序
 */
export function mergeRisks(
  allRisks: Array<{ risk: SemanticRiskObject; quality: SemanticSourceQuality }>,
  dedupThreshold = 0.65
): SemanticRiskObject[] {
  const groups: Array<{
    risks: Array<{ risk: SemanticRiskObject; quality: SemanticSourceQuality }>;
  }> = [];

  for (const item of allRisks) {
    let matched = false;
    for (const group of groups) {
      const rep = group.risks[0].risk;
      const sim = _semanticSimilarity(item.risk.name, rep.name);
      if (sim >= dedupThreshold) {
        group.risks.push(item);
        matched = true;
        break;
      }
    }
    if (!matched) groups.push({ risks: [item] });
  }

  return groups.map((g) => {
    // 最高 severity（保守估计）
    const maxSeverity = Math.max(...g.risks.map((r) => r.risk.severity));

    // timing：保留最近期的（near > mid > long > unclear）
    const timingOrder = { near: 0, mid: 1, long: 2, unclear: 3 };
    const timing = g.risks
      .map((r) => r.risk.timing)
      .sort((a, b) => (timingOrder[a] ?? 3) - (timingOrder[b] ?? 3))[0];

    // containment：保留最低的（保守）
    const containmentOrder = { low: 0, medium: 1, high: 2 };
    const containment = g.risks
      .map((r) => r.risk.containment)
      .sort((a, b) => (containmentOrder[a] ?? 1) - (containmentOrder[b] ?? 1))[0];

    // trigger：合并所有不重复的触发条件
    const triggers = Array.from(new Set(g.risks.map((r) => r.risk.trigger)));
    const trigger = triggers.join(" || ");

    const rep = g.risks[0].risk;
    return {
      ...rep,
      severity: maxSeverity,
      timing,
      containment,
      trigger,
    };
  }).sort((a, b) => b.severity - a.severity);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. AGGREGATE CONFIDENCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * aggregateConfidence — 置信度聚合
 *
 * 规则：
 *   - 加权平均 score（权重 = source_quality）
 *   - dispersion（标准差）> 0.15 → trend = "mixed"，downgraded = true
 *   - source_quality：多数票；若分散则 "mixed"
 *   - fragility：最大值（保守估计）
 */
export function aggregateConfidence(
  confidences: Array<{ confidence: SemanticConfidence; quality: SemanticSourceQuality }>
): AggregatedConfidence {
  if (confidences.length === 0) {
    return {
      score: 0,
      trend: "stable",
      fragility: 1.0,
      source_quality: "unverified",
      dispersion: 1.0,
      downgraded: true,
    };
  }

  const weights = confidences.map((c) => _qualityWeight(c.quality));
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  // 加权平均 score
  const score = confidences.reduce(
    (s, c, i) => s + c.confidence.score * weights[i], 0
  ) / totalWeight;

  // 离散度
  const dispersion = _stdDev(confidences.map((c) => c.confidence.score));
  const downgraded = dispersion > 0.15;

  // trend 聚合
  const trends = confidences.map((c) => c.confidence.trend);
  const uniqueTrends = new Set(trends);
  let trend: SemanticConfidenceTrend | "mixed";
  if (uniqueTrends.size === 1) {
    trend = trends[0];
  } else if (downgraded) {
    trend = "mixed";
  } else {
    trend = _dominantValue(trends) ?? "stable";
  }

  // source_quality 聚合
  const qualities = confidences.map((c) => c.quality);
  const uniqueQualities = new Set(qualities);
  const source_quality: SemanticSourceQuality | "mixed" =
    uniqueQualities.size === 1
      ? qualities[0]
      : downgraded
        ? "mixed"
        : (_dominantValue(qualities) ?? "medium");

  // fragility：最大值
  const fragility = Math.max(...confidences.map((c) => c.confidence.fragility));

  // anchored_on：高质量 packet 的值
  const best = confidences
    .filter((c) => c.quality === "high")
    .map((c) => c.confidence.anchored_on)
    .find(Boolean);

  return {
    score: Math.min(1, Math.max(0, score)),
    trend,
    fragility,
    source_quality,
    dispersion,
    downgraded,
    ...(best ? { anchored_on: best } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. RESOLVE STATE CONFLICTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * resolveStateConflicts — 显式冲突检测与记录
 *
 * 规则：
 *   - 方向冲突（positive vs negative）→ conflicts[] 必须记录
 *   - 重复方向 → 强化主导性
 *   - 高质量来源权重更高
 *   - 无法解决的冲突：resolution = "unresolved"
 *   - 绝不静默折叠
 */
export function resolveStateConflicts(
  packets: SemanticTransportPacket[]
): {
  dominant_direction: SemanticDirection | "unclear";
  conflicts: SemanticConflict[];
  state_summary: AggregatedStateSummary;
} {
  const conflicts: SemanticConflict[] = [];

  // ── 方向冲突检测 ──────────────────────────────────────────────────────────
  const directionVotes: Partial<Record<SemanticDirection, number>> = {};
  const directionSources: Array<{
    agent: string;
    value: string;
    source_quality: SemanticSourceQuality;
  }> = [];

  for (const packet of packets) {
    const dir = packet.state.direction;
    const quality = packet.confidence.source_quality;
    const weight = _qualityWeight(quality);
    directionVotes[dir] = (directionVotes[dir] ?? 0) + weight;
    directionSources.push({ agent: packet.agent, value: dir, source_quality: quality });
  }

  const uniqueDirections = Object.keys(directionVotes) as SemanticDirection[];
  let dominant_direction: SemanticDirection | "unclear" = "unclear";

  if (uniqueDirections.length === 1) {
    dominant_direction = uniqueDirections[0];
  } else if (uniqueDirections.length > 1) {
    // 检查是否有直接矛盾（positive vs negative）
    const hasPositive = "positive" in directionVotes;
    const hasNegative = "negative" in directionVotes;

    if (hasPositive && hasNegative) {
      const posWeight = directionVotes.positive ?? 0;
      const negWeight = directionVotes.negative ?? 0;
      const severity = Math.min(1, Math.abs(posWeight - negWeight) < 0.3 ? 0.9 : 0.6);

      conflicts.push({
        field: "state.direction",
        conflicting_values: directionSources,
        severity,
        resolution: Math.abs(posWeight - negWeight) > 0.5 ? "dominant" : "unresolved",
        summary: `direction_conflict: positive(w=${posWeight.toFixed(2)}) vs negative(w=${negWeight.toFixed(2)}) — resolution=${Math.abs(posWeight - negWeight) > 0.5 ? "dominant" : "unresolved"}`,
      });

      // 主导方向：权重差足够大时可判断，否则 "mixed"
      if (Math.abs(posWeight - negWeight) > 0.5) {
        dominant_direction = posWeight > negWeight ? "positive" : "negative";
      } else {
        dominant_direction = "mixed" as SemanticDirection;
      }
    } else {
      // 无直接矛盾，取权重最高的
      const sorted = Object.entries(directionVotes).sort((a, b) => b[1] - a[1]);
      dominant_direction = sorted[0][0] as SemanticDirection;
    }
  }

  // ── 置信度冲突检测 ────────────────────────────────────────────────────────
  const confidenceScores = packets.map((p) => p.confidence.score);
  const confDispersion = _stdDev(confidenceScores);
  if (confDispersion > 0.2 && packets.length > 1) {
    conflicts.push({
      field: "confidence.score",
      conflicting_values: packets.map((p) => ({
        agent: p.agent,
        value: p.confidence.score.toFixed(2),
        source_quality: p.confidence.source_quality,
      })),
      severity: Math.min(1, confDispersion * 2),
      resolution: "unresolved",
      summary: `confidence_disagreement: dispersion=${confDispersion.toFixed(2)} — sources_materially_disagree`,
    });
  }

  // ── state summary ─────────────────────────────────────────────────────────
  const regimes = packets.map((p) => p.state.regime);
  const narrative_gaps = packets.map((p) => p.state.narrative_gap);
  const crowdings = packets.map((p) => p.state.crowding);
  const fragilities = packets.map((p) => p.state.fragility);
  const directions = packets.map((p) => p.state.direction);

  const state_summary: AggregatedStateSummary = {
    regime: _dominantValue(regimes) ?? undefined,
    narrative_gap: narrative_gaps.reduce((a, b) => a + b, 0) / narrative_gaps.length,
    crowding: crowdings.reduce((a, b) => a + b, 0) / crowdings.length,
    fragility: Math.max(...fragilities),
    policy_bias: packets
      .filter((p) => p.confidence.source_quality === "high")
      .map((p) => p.state.primary_driver)[0],
    trend: _dominantValue(directions) ?? "neutral",
  };

  return { dominant_direction, conflicts, state_summary };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. MAIN AGGREGATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * aggregateSemanticPackets — 主聚合入口
 *
 * 将多个 SemanticTransportPacket 聚合为 UnifiedSemanticState
 *
 * @example
 *   const unified = aggregateSemanticPackets({
 *     packets: [level11Packet, experiencePacket, positionPacket],
 *   });
 *   // → UnifiedSemanticState (advisory_only: true)
 */
export function aggregateSemanticPackets(
  input: AggregationInput
): UnifiedSemanticState {
  const { packets, signal_dedup_threshold = 0.75, risk_dedup_threshold = 0.80 } = input;

  if (packets.length === 0) {
    throw new Error("[semantic_aggregator] aggregateSemanticPackets: packets array is empty");
  }

  // 实体一致性检查（警告，不阻断）
  const entities = Array.from(new Set(packets.map((p) => p.entity)));
  if (entities.length > 1) {
    console.warn(
      `[semantic_aggregator] Multiple entities detected: ${entities.join(", ")}. ` +
        `Using first: ${entities[0]}`
    );
  }
  const entity = entities[0];

  // 时间框架：优先使用最长的
  const timeframeOrder: SemanticTimeframe[] = ["intraday", "short", "mid", "long", "structural"];
  const timeframe = packets
    .map((p) => p.timeframe)
    .sort((a, b) => timeframeOrder.indexOf(b) - timeframeOrder.indexOf(a))[0];

  // ── 信号合并 ──────────────────────────────────────────────────────────────
  const allSignals = packets.flatMap((p) =>
    p.signals.map((signal) => ({ signal, quality: p.confidence.source_quality }))
  );
  const signals = mergeSignals(allSignals, signal_dedup_threshold);

  // ── 风险合并 ──────────────────────────────────────────────────────────────
  const allRisks = packets.flatMap((p) =>
    p.risks.map((risk) => ({ risk, quality: p.confidence.source_quality }))
  );
  const risks = mergeRisks(allRisks, risk_dedup_threshold);

  // ── 置信度聚合 ────────────────────────────────────────────────────────────
  const confidences = packets.map((p) => ({
    confidence: p.confidence,
    quality: p.confidence.source_quality,
  }));
  const confidence = aggregateConfidence(confidences);

  // ── 状态冲突解析 ──────────────────────────────────────────────────────────
  const { dominant_direction, conflicts, state_summary } = resolveStateConflicts(packets);

  // ── 失效条件合并（去重） ───────────────────────────────────────────────────
  const invalidations = Array.from(new Set(packets.flatMap((p) => p.invalidations)));

  // ── 语义洞察合并 ──────────────────────────────────────────────────────────
  const rawNotes = packets.flatMap((p) => p.insight_notes);
  const seen = new Set<string>();
  const semantic_notes: SemanticInsightNote[] = [];
  for (const note of rawNotes) {
    if (!seen.has(note)) { seen.add(note); semantic_notes.push(note); }
  }
  // 将冲突摘要注入 semantic_notes
  for (const conflict of conflicts) {
    semantic_notes.push(conflict.summary);
  }
  // 置信度降级注释
  if (confidence.downgraded) {
    semantic_notes.push(
      `confidence_downgraded: dispersion=${confidence.dispersion.toFixed(2)} — source_disagreement`
    );
  }

  return {
    protocol_version: "12.2",
    entity,
    timeframe,
    dominant_direction,
    state_summary,
    signals,
    risks,
    confidence,
    conflicts,
    invalidations,
    semantic_notes,
    source_agents: packets.map((p) => p.agent),
    packet_count: packets.length,
    advisory_only: true,
    generated_at: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. EXPERIENCE LAYER — 机器原生语义输出构建器
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ExperienceSemanticState — Experience Layer 机器原生语义输出
 *
 * 不依赖 keyword-bridge，直接从 ExperienceLayerOutput 字段提取语义
 */
export interface ExperienceSemanticState {
  /** drift 方向与强度（machine-native） */
  drift_signal: SemanticInsightNote;
  drift_direction: "strengthening" | "weakening" | "unclear";
  drift_intensity: number;
  /** 置信度演化 */
  confidence_evolution: {
    previous: number;
    current: number;
    delta: number;
    direction: "rising" | "falling" | "stable";
    fragility: number;
  };
  /** 梯度风险 */
  gradient_risk: {
    state: string;
    trend: string;
    severity: number;
  };
  /** 管理层行为（machine-native） */
  management_signal: SemanticInsightNote;
  /** 市场行为（machine-native） */
  market_signal: SemanticInsightNote;
  /** 合并洞察注释 */
  insight_notes: SemanticInsightNote[];
  advisory_only: true;
}

/**
 * buildExperienceSemanticState — 从 ExperienceLayerOutput 构建机器原生语义状态
 *
 * 不依赖 keyword-bridge heuristics，直接映射字段语义。
 * 输出供 aggregateSemanticPackets 消费或直接注入 synthesisController。
 */
export function buildExperienceSemanticState(
  experience: ExperienceLayerOutput,
  previousConfidence?: number
): ExperienceSemanticState {
  const { drift, confidence_update, gradient_risk, management_behavior, market_behavior } = experience;

  // ── drift signal (machine-native microphrase) ─────────────────────────────
  const drift_signal: SemanticInsightNote =
    `drift_direction=${drift.drift_direction} && drift_intensity=${drift.drift_intensity.toFixed(2)} — confidence_change=${drift.confidence_change >= 0 ? "+" : ""}${drift.confidence_change.toFixed(2)}`;

  // ── confidence evolution ──────────────────────────────────────────────────
  // ConfidenceUpdateOutput には previous_confidence がないため、
  // 引数または drift.confidence_change から逆算
  const currConf = confidence_update.updated_confidence;
  const prevConf = previousConfidence ?? Math.max(0, currConf - drift.confidence_change);
  const delta = currConf - prevConf;
  const confDirection: "rising" | "falling" | "stable" =
    confidence_update.confidence_trend;

  // fragility: gradient_risk の状態から導出（ConfidenceUpdateOutput に fragility フィールドなし）
  const riskToFragility: Record<string, number> = {
    low: 0.15, building: 0.40, elevated: 0.70, critical: 0.90,
  };
  const derivedFragility = riskToFragility[gradient_risk.risk_state] ?? 0.50;

  const confidence_evolution = {
    previous: prevConf,
    current: currConf,
    delta,
    direction: confDirection,
    fragility: derivedFragility,
  };

  // ── gradient risk (machine-native) ────────────────────────────────────────
  const riskStateToSeverity: Record<string, number> = {
    low: 0.15,
    building: 0.45,
    elevated: 0.70,
    critical: 0.90,
  };
  const gradient_risk_out = {
    state: gradient_risk.risk_state,
    trend: gradient_risk.risk_trend,
    severity: riskStateToSeverity[gradient_risk.risk_state] ?? 0.5,
  };

  // ── management behavior signal (machine-native) ───────────────────────────
  // ManagementBehaviorOutput: behavior_pattern / interpretation / risk_implication
  const mgmt = management_behavior;
  const management_signal: SemanticInsightNote =
    `management_pattern=${mgmt.behavior_pattern} — risk_implication=${mgmt.risk_implication.slice(0, 60).replace(/\s+/g, "_")}`;

  // ── market behavior signal (machine-native) ───────────────────────────────
  // MarketBehaviorOutput: market_behavior / interpretation / implication_for_thesis
  const mkt = market_behavior;
  const market_signal: SemanticInsightNote =
    `market_behavior=${mkt.market_behavior} — implication=${mkt.implication_for_thesis.slice(0, 60).replace(/\s+/g, "_")}`;

  // ── insight notes ─────────────────────────────────────────────────────────
  const insight_notes: SemanticInsightNote[] = [
    drift_signal,
    management_signal,
    market_signal,
    `gradient_risk=${gradient_risk.risk_state} trend=${gradient_risk.risk_trend}`,
  ];

  // 高风险或强漂移时添加警告注释
  if (gradient_risk.risk_state === "critical" || gradient_risk.risk_state === "elevated") {
    insight_notes.push(`risk_elevated: gradient_risk_state=${gradient_risk.risk_state} — heightened_monitoring_required`);
  }
  if (drift.drift_direction === "weakening" && drift.drift_intensity > 0.6) {
    insight_notes.push(`thesis_drift_warning: weakening_intensity=${drift.drift_intensity.toFixed(2)} — revalidation_recommended`);
  }

  return {
    drift_signal,
    drift_direction: drift.drift_direction,
    drift_intensity: drift.drift_intensity,
    confidence_evolution,
    gradient_risk: gradient_risk_out,
    management_signal,
    market_signal,
    insight_notes,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. SYNTHESIS HANDOFF CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SynthesisSemanticEnvelope — synthesisController 消费的机器原生信封
 *
 * 保持机器语义密度，不生成自然语言。
 * synthesisController 在此基础上生成最终用户可读报告。
 */
export interface SynthesisSemanticEnvelope {
  protocol_version: "12.2";
  entity: string;
  dominant_direction: SemanticDirection | "unclear";
  confidence_score: number;
  confidence_fragility: number;
  confidence_downgraded: boolean;
  top_signals: SemanticSignalObject[];      // 前 3 个
  top_risks: SemanticRiskObject[];          // 前 3 个
  has_conflicts: boolean;
  conflict_count: number;
  unresolved_conflicts: SemanticConflict[];
  key_invalidations: SemanticInsightNote[]; // 前 5 个
  semantic_notes: SemanticInsightNote[];    // 前 8 个
  state_regime?: string;
  state_crowding?: number;
  state_fragility?: number;
  advisory_only: true;
}

/**
 * buildSynthesisSemanticEnvelope — 从 UnifiedSemanticState 构建 synthesis 消费信封
 *
 * 保持机器原生语义，不生成自然语言。
 * synthesisController 负责将此信封转化为最终用户可读输出。
 */
export function buildSynthesisSemanticEnvelope(
  unified: UnifiedSemanticState
): SynthesisSemanticEnvelope {
  const unresolvedConflicts = unified.conflicts.filter(
    (c) => c.resolution === "unresolved"
  );

  return {
    protocol_version: "12.2",
    entity: unified.entity,
    dominant_direction: unified.dominant_direction,
    confidence_score: unified.confidence.score,
    confidence_fragility: unified.confidence.fragility,
    confidence_downgraded: unified.confidence.downgraded,
    top_signals: unified.signals.slice(0, 3),
    top_risks: unified.risks.slice(0, 3),
    has_conflicts: unified.conflicts.length > 0,
    conflict_count: unified.conflicts.length,
    unresolved_conflicts: unresolvedConflicts,
    key_invalidations: unified.invalidations.slice(0, 5),
    semantic_notes: unified.semantic_notes.slice(0, 8),
    state_regime: unified.state_summary.regime,
    state_crowding: unified.state_summary.crowding,
    state_fragility: unified.state_summary.fragility,
    advisory_only: true,
  };
}
