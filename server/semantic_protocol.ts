/**
 * semantic_protocol.ts — DanTree Level 12.1 AI-Native Semantic Communication Protocol
 *
 * 设计原则：
 *   - 机器原生语义密度：非自然语言段落，非单词标签
 *   - 每个字段携带方向 + 强度 + 持续性 + 脆弱性 + 置信度
 *   - 最小歧义：协议对象是唯一内部 agent 通信媒介
 *   - 可扩展：支持 development / runtime 双模式
 *
 * 协议版本：12.1
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRIMITIVE SEMANTIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** 方向性 */
export type SemanticDirection = "positive" | "negative" | "mixed" | "neutral";

/** 持续性状态 */
export type SemanticPersistence = "building" | "stable" | "fading" | "reversing";

/** 紧迫性 */
export type SemanticUrgency = "low" | "medium" | "high" | "critical";

/** 时间框架 */
export type SemanticTimeframe = "intraday" | "short" | "mid" | "long" | "structural";

/** 数据源质量 */
export type SemanticSourceQuality = "high" | "medium" | "low" | "unverified";

/** 驱动因子类型 */
export type SemanticDriverType =
  | "real"
  | "narrative"
  | "policy"
  | "structure"
  | "behavior"
  | "technical"
  | "flow";

/** 风险时机 */
export type SemanticRiskTiming = "near" | "mid" | "long" | "unclear";

/** 控制能力 */
export type SemanticContainment = "low" | "medium" | "high";

/** Confidence 趋势 */
export type SemanticConfidenceTrend = "rising" | "falling" | "stable";

/** 资产类型 */
export type SemanticAssetType =
  | "equity"
  | "commodity"
  | "index"
  | "etf_macro"
  | "etf_sector"
  | "etf_equity"
  | "fx"
  | "rates"
  | "crypto";

/** 宏观市场体制 */
export type SemanticRegime =
  | "risk_on"
  | "risk_off"
  | "transition"
  | "event_shock"
  | "policy_driven"
  | "technical_squeeze";

// ─────────────────────────────────────────────────────────────────────────────
// 2. SEMANTIC TASK TYPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SemanticTaskType — agent 任务类型（比 TaskType 更细粒度）
 */
export type SemanticTaskType =
  | "asset_classification"      // 资产分类
  | "driver_routing"            // 驱动因子路由
  | "real_driver_identification"// 真实 vs 叙事驱动识别
  | "incentive_analysis"        // 行为激励分析
  | "policy_reality"            // 政策现实分析
  | "sentiment_detection"       // 情绪状态检测
  | "cross_asset_propagation"   // 跨资产传导
  | "scenario_reasoning"        // 情景推演
  | "narrative_composition"     // 叙事合成
  | "position_integration"      // 仓位整合
  | "risk_assessment"           // 风险评估
  | "opportunity_radar"         // 机会雷达
  | "cycle_analysis"            // 周期分析
  | "hypothesis_validation";    // 假说验证

// ─────────────────────────────────────────────────────────────────────────────
// 3. CORE SEMANTIC SUB-OBJECTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SemanticConfidence — 置信度对象
 * 不只是一个数字，携带趋势、脆弱性、数据源质量
 */
export interface SemanticConfidence {
  /** 0–1 置信度分数 */
  score: number;
  /** 置信度趋势 */
  trend: SemanticConfidenceTrend;
  /**
   * 脆弱性：置信度在新信息出现后崩塌的概率
   * 0 = 非常稳固，1 = 极度脆弱
   */
  fragility: number;
  /** 数据源质量评级 */
  source_quality: SemanticSourceQuality;
  /** 置信度的核心依赖（如果此条件改变，置信度失效） */
  anchored_on?: string;
}

/**
 * SemanticSignalObject — 信号对象
 * 捕获信号的方向、强度、持续性、紧迫性、驱动类型
 */
export interface SemanticSignalObject {
  /** 信号标识符（machine-native，如 "real_yield_decline"） */
  name: string;
  /** 对当前资产的方向性影响 */
  direction: SemanticDirection;
  /** 信号强度 0–1 */
  intensity: number;
  /** 信号持续性状态 */
  persistence: SemanticPersistence;
  /** 行动紧迫性 */
  urgency: SemanticUrgency;
  /** 驱动因子类型 */
  driver_type: SemanticDriverType;
  /**
   * 信号监控指标（什么变化意味着信号方向改变）
   * machine-native phrase，非自然语言段落
   */
  monitoring_signal?: string;
  /**
   * 信号失效条件
   * machine-native phrase，如 "fed_pivot_reverses"
   */
  invalidation?: string;
}

/**
 * SemanticRiskObject — 风险对象
 * 捕获风险的严重性、时机、控制能力、触发条件
 */
export interface SemanticRiskObject {
  /** 风险标识符（machine-native，如 "policy_reversal"） */
  name: string;
  /** 风险严重性 0–1 */
  severity: number;
  /** 风险发生时机 */
  timing: SemanticRiskTiming;
  /** 当前可控制程度 */
  containment: SemanticContainment;
  /**
   * 风险触发条件
   * machine-native phrase，如 "execution_gap_widens"
   */
  trigger: string;
  /**
   * 风险缓解路径（如果存在）
   * machine-native phrase
   */
  mitigation_path?: string;
}

/**
 * SemanticInsightNote — 机器语义洞察注释
 *
 * 规则：
 *   - 使用机器原生语义短语（semantic microphrases）
 *   - 禁止自然语言段落
 *   - 禁止单字标签（丢失语义密度）
 *
 * 合法示例：
 *   "policy_signal>execution_reality"
 *   "narrative_strength decoupled_from earnings_followthrough"
 *   "crowding_high && fragility_rising"
 *
 * 非法示例（过长）：
 *   "The Federal Reserve has signaled..."
 * 非法示例（过短）：
 *   "bullish"
 */
export type SemanticInsightNote = string;

/**
 * SemanticStateEnvelope — 资产/分析状态包络
 * 捕获当前状态的多维度描述
 */
export interface SemanticStateEnvelope {
  /** 资产类型 */
  asset_type: SemanticAssetType;
  /** 当前宏观体制 */
  regime: SemanticRegime;
  /**
   * 叙事强度（市场叙事 vs 现实的偏离程度）
   * 0 = 叙事完全对应现实，1 = 叙事严重脱离现实
   */
  narrative_gap: number;
  /**
   * 定位拥挤度（市场持仓集中度）
   * 0 = 冷门，1 = 极度拥挤
   */
  crowding: number;
  /**
   * 状态脆弱性（当前状态在外部冲击下崩塌的概率）
   * 0 = 稳固，1 = 极脆弱
   */
  fragility: number;
  /** 时间框架 */
  timeframe: SemanticTimeframe;
  /** 状态方向（相对于持仓的影响方向） */
  direction: SemanticDirection;
  /**
   * 主驱动因子标识（machine-native）
   * 如 "real_yield_compression"、"earnings_revision_cycle"
   */
  primary_driver: string;
  /**
   * 隐藏压力点（非显性风险）
   * machine-native microphrases
   */
  hidden_pressure_points?: SemanticInsightNote[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CORE TRANSPORT PACKET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SemanticTransportPacket — DanTree AI-to-AI 语义传输包
 *
 * 这是 DanTree 所有内部 agent 通信的统一载体。
 * 所有字段均为机器语义对象，禁止自然语言段落。
 *
 * @example
 *   见 semantic_protocol.examples.ts
 */
export interface SemanticTransportPacket {
  /** 协议版本 */
  protocol_version: "12.1";
  /** 发送 agent 标识 */
  agent: string;
  /** 任务类型 */
  task: SemanticTaskType;
  /** 分析实体（股票代码、资产名、宏观指标） */
  entity: string;
  /** 分析时间框架 */
  timeframe: SemanticTimeframe;
  /** 资产/分析状态包络 */
  state: SemanticStateEnvelope;
  /** 信号列表（按 intensity 降序） */
  signals: SemanticSignalObject[];
  /** 风险列表（按 severity 降序） */
  risks: SemanticRiskObject[];
  /** 整体置信度 */
  confidence: SemanticConfidence;
  /**
   * 约束条件（影响结论的结构性约束）
   * machine-native microphrases
   */
  constraints: SemanticInsightNote[];
  /**
   * 失效条件（使当前分析结论失效的条件）
   * machine-native microphrases
   */
  invalidations: SemanticInsightNote[];
  /**
   * 洞察注释（非显性关键观察）
   * machine-native microphrases，非自然语言段落
   */
  insight_notes: SemanticInsightNote[];
  /**
   * 强制为 true：协议包仅供决策支持，不触发自动交易
   */
  advisory_only: true;
  /** 包生成时间戳（ISO 8601） */
  generated_at?: string;
  /** 可选扩展字段（用于 runtime 模式附加数据） */
  extensions?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PROTOCOL VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * LONG_FORM_PATTERN — 检测自然语言段落的正则
 * 超过 120 字符且包含多个空格的字符串视为自然语言段落
 */
const LONG_FORM_PATTERN = /^.{120,}$/;

/**
 * SINGLE_LABEL_PATTERN — 检测过度压缩的单词标签
 * 少于 4 字符且不含下划线/操作符的字符串视为过度压缩
 */
const SINGLE_LABEL_PATTERN = /^[a-zA-Z]{1,3}$/;

function _validateConfidence(c: unknown, path: string, errors: string[]): void {
  if (!c || typeof c !== "object") {
    errors.push(`${path}: confidence must be an object`);
    return;
  }
  const conf = c as Partial<SemanticConfidence>;
  if (typeof conf.score !== "number" || conf.score < 0 || conf.score > 1)
    errors.push(`${path}.score: must be number in [0, 1]`);
  if (!["rising", "falling", "stable"].includes(conf.trend ?? ""))
    errors.push(`${path}.trend: must be "rising"|"falling"|"stable"`);
  if (typeof conf.fragility !== "number" || conf.fragility < 0 || conf.fragility > 1)
    errors.push(`${path}.fragility: must be number in [0, 1]`);
  if (!["high", "medium", "low", "unverified"].includes(conf.source_quality ?? ""))
    errors.push(`${path}.source_quality: must be "high"|"medium"|"low"|"unverified"`);
}

function _validateSignal(s: unknown, idx: number, errors: string[]): void {
  if (!s || typeof s !== "object") {
    errors.push(`signals[${idx}]: must be an object`);
    return;
  }
  const sig = s as Partial<SemanticSignalObject>;
  if (!sig.name || typeof sig.name !== "string")
    errors.push(`signals[${idx}].name: required string`);
  if (!["positive", "negative", "mixed", "neutral"].includes(sig.direction ?? ""))
    errors.push(`signals[${idx}].direction: invalid value`);
  if (typeof sig.intensity !== "number" || sig.intensity < 0 || sig.intensity > 1)
    errors.push(`signals[${idx}].intensity: must be number in [0, 1]`);
  if (!["building", "stable", "fading", "reversing"].includes(sig.persistence ?? ""))
    errors.push(`signals[${idx}].persistence: invalid value`);
  if (!["low", "medium", "high", "critical"].includes(sig.urgency ?? ""))
    errors.push(`signals[${idx}].urgency: invalid value`);
  if (!["real", "narrative", "policy", "structure", "behavior", "technical", "flow"].includes(sig.driver_type ?? ""))
    errors.push(`signals[${idx}].driver_type: invalid value`);
}

function _validateRisk(r: unknown, idx: number, errors: string[]): void {
  if (!r || typeof r !== "object") {
    errors.push(`risks[${idx}]: must be an object`);
    return;
  }
  const risk = r as Partial<SemanticRiskObject>;
  if (!risk.name || typeof risk.name !== "string")
    errors.push(`risks[${idx}].name: required string`);
  if (typeof risk.severity !== "number" || risk.severity < 0 || risk.severity > 1)
    errors.push(`risks[${idx}].severity: must be number in [0, 1]`);
  if (!["near", "mid", "long", "unclear"].includes(risk.timing ?? ""))
    errors.push(`risks[${idx}].timing: invalid value`);
  if (!["low", "medium", "high"].includes(risk.containment ?? ""))
    errors.push(`risks[${idx}].containment: invalid value`);
  if (!risk.trigger || typeof risk.trigger !== "string")
    errors.push(`risks[${idx}].trigger: required string`);
}

function _validateInsightNotes(
  notes: unknown[],
  field: string,
  errors: string[],
  warnings: string[]
): void {
  notes.forEach((note, idx) => {
    if (typeof note !== "string") {
      errors.push(`${field}[${idx}]: must be a string`);
      return;
    }
    if (LONG_FORM_PATTERN.test(note)) {
      errors.push(
        `${field}[${idx}]: natural language paragraph detected (>120 chars). ` +
          `Use machine-native semantic microphrases.`
      );
    }
    if (SINGLE_LABEL_PATTERN.test(note)) {
      warnings.push(
        `${field}[${idx}]: single-label detected ("${note}"). ` +
          `Consider richer semantic phrase.`
      );
    }
  });
}

/**
 * validateSemanticPacket — 协议包验证器
 *
 * 验证：
 *   - 必填字段存在
 *   - advisory_only === true
 *   - 无自然语言段落（>120字符）
 *   - confidence / signals / risks 符合 schema
 *   - protocol_version 存在
 *
 * @returns ValidationResult { valid, errors, warnings }
 */
export function validateSemanticPacket(packet: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!packet || typeof packet !== "object") {
    return { valid: false, errors: ["packet: must be an object"], warnings };
  }

  const p = packet as Partial<SemanticTransportPacket>;

  // 必填字段检查
  if (p.protocol_version !== "12.1")
    errors.push(`protocol_version: must be "12.1", got "${p.protocol_version}"`);
  if (!p.agent || typeof p.agent !== "string")
    errors.push("agent: required string");
  if (!p.task || typeof p.task !== "string")
    errors.push("task: required SemanticTaskType string");
  if (!p.entity || typeof p.entity !== "string")
    errors.push("entity: required string");
  if (!p.timeframe || typeof p.timeframe !== "string")
    errors.push("timeframe: required SemanticTimeframe string");

  // advisory_only 强制为 true
  if (p.advisory_only !== true)
    errors.push("advisory_only: must be exactly true — protocol packets cannot trigger automated actions");

  // state 验证
  if (!p.state || typeof p.state !== "object") {
    errors.push("state: required SemanticStateEnvelope object");
  } else {
    const s = p.state as Partial<SemanticStateEnvelope>;
    if (typeof s.narrative_gap !== "number" || s.narrative_gap < 0 || s.narrative_gap > 1)
      errors.push("state.narrative_gap: must be number in [0, 1]");
    if (typeof s.crowding !== "number" || s.crowding < 0 || s.crowding > 1)
      errors.push("state.crowding: must be number in [0, 1]");
    if (typeof s.fragility !== "number" || s.fragility < 0 || s.fragility > 1)
      errors.push("state.fragility: must be number in [0, 1]");
    if (!s.primary_driver)
      errors.push("state.primary_driver: required string");
    if (s.hidden_pressure_points) {
      _validateInsightNotes(s.hidden_pressure_points, "state.hidden_pressure_points", errors, warnings);
    }
  }

  // signals 验证
  if (!Array.isArray(p.signals)) {
    errors.push("signals: must be an array");
  } else {
    p.signals.forEach((sig, idx) => _validateSignal(sig, idx, errors));
  }

  // risks 验证
  if (!Array.isArray(p.risks)) {
    errors.push("risks: must be an array");
  } else {
    p.risks.forEach((risk, idx) => _validateRisk(risk, idx, errors));
  }

  // confidence 验证
  _validateConfidence(p.confidence, "confidence", errors);

  // constraints / invalidations / insight_notes 验证
  if (!Array.isArray(p.constraints))
    errors.push("constraints: must be an array");
  else
    _validateInsightNotes(p.constraints, "constraints", errors, warnings);

  if (!Array.isArray(p.invalidations))
    errors.push("invalidations: must be an array");
  else
    _validateInsightNotes(p.invalidations, "invalidations", errors, warnings);

  if (!Array.isArray(p.insight_notes))
    errors.push("insight_notes: must be an array");
  else
    _validateInsightNotes(p.insight_notes, "insight_notes", errors, warnings);

  return { valid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. PROTOCOL TRANSFORMER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildSemanticPacket — 构建标准协议包
 * 自动注入 protocol_version、generated_at、advisory_only
 */
export function buildSemanticPacket(
  params: Omit<SemanticTransportPacket, "protocol_version" | "advisory_only" | "generated_at">
): SemanticTransportPacket {
  const packet: SemanticTransportPacket = {
    protocol_version: "12.1",
    advisory_only: true,
    generated_at: new Date().toISOString(),
    ...params,
  };

  const validation = validateSemanticPacket(packet);
  if (!validation.valid) {
    throw new Error(
      `[semantic_protocol] buildSemanticPacket: invalid packet.\n` +
        validation.errors.join("\n")
    );
  }

  return packet;
}

/**
 * normalizeSemanticPacket — 标准化协议包
 *
 * 执行：
 *   - signals 按 intensity 降序排列
 *   - risks 按 severity 降序排列
 *   - 强制 advisory_only = true
 *   - 强制 protocol_version = "12.1"
 */
export function normalizeSemanticPacket(
  packet: SemanticTransportPacket
): SemanticTransportPacket {
  return {
    ...packet,
    protocol_version: "12.1",
    advisory_only: true,
    signals: [...packet.signals].sort((a, b) => b.intensity - a.intensity),
    risks: [...packet.risks].sort((a, b) => b.severity - a.severity),
    generated_at: packet.generated_at ?? new Date().toISOString(),
  };
}

/**
 * compressSemanticNotes — 语义注释压缩
 *
 * 规则：
 *   - 移除重复注释
 *   - 移除纯单词标签（SINGLE_LABEL_PATTERN）
 *   - 截断超过 120 字符的自然语言段落（保留前 80 字符 + 警告标记）
 *   - 保留数组结构（不合并为字符串）
 *
 * 压缩保留语义密度：不将 "crowding_high && fragility_rising" 压缩为 "crowded"
 */
export function compressSemanticNotes(
  notes: SemanticInsightNote[]
): SemanticInsightNote[] {
  const seen = new Set<string>();
  const compressed: SemanticInsightNote[] = [];

  for (const note of notes) {
    if (typeof note !== "string") continue;

    // 去重
    const normalized = note.trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    // 过滤过度压缩的单词标签
    if (SINGLE_LABEL_PATTERN.test(normalized)) continue;

    // 截断自然语言段落（保留语义前缀 + 警告）
    if (LONG_FORM_PATTERN.test(normalized)) {
      compressed.push(`${normalized.slice(0, 80)}...[compressed:natural_lang_detected]`);
      continue;
    }

    compressed.push(normalized);
  }

  return compressed;
}
