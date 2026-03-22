/**
 * evidenceValidator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GPT 架构改造说明书 Phase 2：EVIDENCE_PACKET 构建器 + Evidence Validator
 *
 * 核心功能：
 * 1. buildEvidencePacket()  — 将 DATA_REPORT 转为可校验的事实包
 * 2. validateEvidence()     — 检测数字/当前表述/估值结论是否绑定了证据
 * 3. computeEvidenceScore() — 计算 0-100 的证据充分度得分
 *
 * evidence_score 控制 Step3 输出强度（outputMode）：
 *   ≥ 70 → DECISIVE：强判断 + 投资建议（明确立场+幅度）
 *   50-69 → DIRECTIONAL：方向性判断（偏高/谨慎），禁止具体目标价
 *   < 50  → FRAMEWORK_ONLY：仅输出研究框架，不得给出任何价格/方向判断
 *
 * 2026-03-22 重构：evidenceScore 现在基于两个维度：
 *   A. API 实际命中数据（citationHitCount）— 主要评分依据，不依赖 LLM 格式化输出
 *   B. LLM 解析的 facts（如有）— 加分项
 */

export interface EvidenceFact {
  /** 事实描述（来自 DATA_REPORT） */
  claim: string;
  /** 数值（如有） */
  value?: string | number;
  /** 单位（如 USD, %, x） */
  unit?: string;
  /** 数据时间戳（ISO 8601 或 YYYY-MM 格式） */
  timestamp?: string;
  /** 数据来源 API 名称（如 "FMP", "FRED", "Polygon.io"） */
  source: string;
  /** 数据新鲜度：fresh（≤30天）| stale（31-180天）| outdated（>180天） */
  freshness: "fresh" | "stale" | "outdated" | "unknown";
}

export interface HardMissingItem {
  /** 缺失的数据类型 */
  dataType: string;
  /** 缺失原因 */
  reason: string;
  /** 是否为阻断性缺失（true = 无法继续分析） */
  blocking: boolean;
}

export interface EvidencePacket {
  /** 任务描述 */
  taskDescription: string;
  /** 已收集的事实列表 */
  facts: EvidenceFact[];
  /** 严重缺失的数据项 */
  hardMissing: HardMissingItem[];
  /** 证据充分度得分 0-100 */
  evidenceScore: number;
  /** 证据充分度等级 */
  evidenceLevel: "sufficient" | "partial" | "insufficient";
  /** 是否允许输出投资建议 */
  allowInvestmentAdvice: boolean;
  /** 给 Step3 GPT 的指令 */
  step3Instruction: string;
  /** 输出强度模式：decisive=强判断 | directional=方向性 | framework_only=仅框架 */
  outputMode: "decisive" | "directional" | "framework_only";
  /** 已验证的事实白名单（可直接引用的 claim 列表） */
  claimWhitelist: string[];
  /** P0-3: 字段级缺失分层统计 */
  missingBlocking: string[];
  missingImportant: string[];
  missingOptional: string[];
}

/** P0-3: 字段级缺失分层输入 */
export interface FieldMissingTiers {
  missingBlocking: string[];
  missingImportant: string[];
  missingOptional: string[];
}

/** API 命中统计（从 citationSummary 传入） */
export interface ApiHitStats {
  /** 命中的白名单数据源数量 */
  hitCount: number;
  /** 总数据源数量（包括未命中的） */
  totalCount: number;
  /** 命中的数据源 ID 列表 */
  hitSourceIds: string[];
  /** 是否有白名单来源命中 */
  hasWhitelistedHit: boolean;
}

/**
 * 从 Manus DATA_REPORT 文本中提取结构化事实
 * 支持两种格式：
 * 1. 行格式：[FACT] value=... unit=... timestamp=... source=... claim=...
 * 2. JSON 格式：[EVIDENCE_PACKET] { "facts": {...}, "missing": [...], "source_status": [...] } [/EVIDENCE_PACKET]
 */
export function parseDataReport(dataReport: string): {
  facts: EvidenceFact[];
  hardMissing: HardMissingItem[];
} {
  // 先尝试 JSON EVIDENCE_PACKET 解析
  const jsonResult = parseJsonEvidencePacket(dataReport);
  if (jsonResult) return jsonResult;

  // 回退到行格式解析
  return parseLineFormat(dataReport);
}

/**
 * 解析 JSON 格式的 EVIDENCE_PACKET
 * 格式：[EVIDENCE_PACKET] { "facts": {...}, "missing": [...], "source_status": [...] } [/EVIDENCE_PACKET]
 */
function parseJsonEvidencePacket(dataReport: string): {
  facts: EvidenceFact[];
  hardMissing: HardMissingItem[];
} | null {
  const packetMatch = dataReport.match(/\[EVIDENCE_PACKET\]\s*([\s\S]*?)\s*\[\/EVIDENCE_PACKET\]/);
  if (!packetMatch) return null;

  try {
    const raw = JSON.parse(packetMatch[1]);
    const facts: EvidenceFact[] = [];
    const hardMissing: HardMissingItem[] = [];

    // 解析 facts 对象（key-value 格式）
    if (raw.facts && typeof raw.facts === "object") {
      for (const [key, val] of Object.entries(raw.facts)) {
        if (val && typeof val === "object") {
          const v = val as Record<string, unknown>;
          facts.push({
            claim: key,
            value: v.value != null ? String(v.value) : undefined,
            unit: typeof v.unit === "string" ? v.unit : undefined,
            timestamp: typeof v.timestamp === "string" ? v.timestamp : undefined,
            source: typeof v.source === "string" ? v.source : "unknown",
            freshness: computeFreshness(typeof v.timestamp === "string" ? v.timestamp : undefined),
          });
        }
      }
    }

    // 解析 missing 数组
    if (Array.isArray(raw.missing)) {
      for (const m of raw.missing) {
        if (m && typeof m === "object") {
          hardMissing.push({
            dataType: typeof m.field === "string" ? m.field : "unknown",
            reason: typeof m.reason === "string" ? m.reason : "未知原因",
            blocking: m.hard_missing === true,
          });
        }
      }
    }

    // 至少解析出一些内容才算成功
    if (facts.length > 0 || hardMissing.length > 0) {
      return { facts, hardMissing };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 行格式解析（旧格式兼容）
 */
function parseLineFormat(dataReport: string): {
  facts: EvidenceFact[];
  hardMissing: HardMissingItem[];
} {
  const facts: EvidenceFact[] = [];
  const hardMissing: HardMissingItem[] = [];

  const lines = dataReport.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    // 解析 [FACT] 行
    if (trimmed.startsWith("[FACT]")) {
      const fact: Partial<EvidenceFact> = {};
      const pairs = trimmed.slice(6).trim().split(/\s+(?=\w+=)/);
      for (const pair of pairs) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx === -1) continue;
        const key = pair.slice(0, eqIdx).trim();
        const val = pair.slice(eqIdx + 1).trim();
        if (key === "value") fact.value = val;
        else if (key === "unit") fact.unit = val;
        else if (key === "timestamp") fact.timestamp = val;
        else if (key === "source") fact.source = val;
        else if (key === "claim") fact.claim = val;
      }
      if (fact.source && fact.claim) {
        fact.freshness = computeFreshness(fact.timestamp);
        facts.push(fact as EvidenceFact);
      }
    }

    // 解析 [HARD_MISSING] 行
    if (trimmed.startsWith("[HARD_MISSING]")) {
      const item: Partial<HardMissingItem> = {};
      const pairs = trimmed.slice(14).trim().split(/\s+(?=\w+=)/);
      for (const pair of pairs) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx === -1) continue;
        const key = pair.slice(0, eqIdx).trim();
        const val = pair.slice(eqIdx + 1).trim();
        if (key === "dataType") item.dataType = val;
        else if (key === "reason") item.reason = val;
        else if (key === "blocking") item.blocking = val === "true";
      }
      if (item.dataType) {
        hardMissing.push({
          dataType: item.dataType,
          reason: item.reason ?? "未知原因",
          blocking: item.blocking ?? false,
        });
      }
    }
  }

  // 额外：尝试从 DATA_REPORT 中的 field: value unit (date) [source] 格式提取
  for (const line of lines) {
    const trimmed = line.trim();
    // 匹配 field_name: value unit (YYYY-MM-DD) [source]
    const fieldMatch = trimmed.match(/^([\w.]+):\s*(.+?)\s+(\w+)\s+\((\d{4}-\d{2}(?:-\d{2})?)\)\s+\[(.+?)\]$/);
    if (fieldMatch) {
      const [, field, value, unit, timestamp, source] = fieldMatch;
      // 避免重复（如果已经从 [FACT] 解析过）
      if (!facts.some(f => f.claim === field && f.source === source)) {
        facts.push({
          claim: field,
          value,
          unit,
          timestamp,
          source,
          freshness: computeFreshness(timestamp),
        });
      }
    }

    // 匹配 field_name: [DATA_UNAVAILABLE] reason
    const unavailMatch = trimmed.match(/^([\w.]+):\s*\[DATA_UNAVAILABLE\]\s*(.*)$/);
    if (unavailMatch) {
      const [, field, reason] = unavailMatch;
      if (!hardMissing.some(h => h.dataType === field)) {
        hardMissing.push({
          dataType: field,
          reason: reason || "数据不可用",
          blocking: false,
        });
      }
    }

    // 匹配 field_name: [HARD_MISSING] 标记
    const hardMissingMatch = trimmed.match(/^([\w.]+):\s*.*\[HARD_MISSING\]$/);
    if (hardMissingMatch) {
      const [, field] = hardMissingMatch;
      const existing = hardMissing.find(h => h.dataType === field);
      if (existing) {
        existing.blocking = true;
      } else {
        hardMissing.push({
          dataType: field,
          reason: "标记为 HARD_MISSING",
          blocking: true,
        });
      }
    }
  }

  return { facts, hardMissing };
}

/**
 * 计算数据新鲜度
 */
function computeFreshness(
  timestamp?: string
): "fresh" | "stale" | "outdated" | "unknown" {
  if (!timestamp) return "unknown";
  try {
    const ts = new Date(timestamp);
    if (isNaN(ts.getTime())) return "unknown";
    const daysDiff = (Date.now() - ts.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff <= 30) return "fresh";
    if (daysDiff <= 180) return "stale";
    return "outdated";
  } catch {
    return "unknown";
  }
}

/**
 * 计算证据充分度得分（0-100）
 *
 * 2026-03-22 重构：双维度评分
 * 维度 A — API 实际命中（主要评分依据，不依赖 LLM 格式化输出）
 *   - 每命中 1 个白名单 API 数据源：+12 分（上限 60 分）
 *   - 有 ≥3 个不同 API 源命中：+10 分
 * 维度 B — LLM 解析的 facts（加分项）
 *   - 有 facts：+5 分
 *   - 每个 fresh fact：+2 分（上限 10 分）
 * 扣分：
 *   - blocking hardMissing：-20 分/项
 *   - non-blocking hardMissing：-5 分/项
 *   - 字段级缺失：blocking -20/项, important -5/项, optional -1/项
 */
export function computeEvidenceScore(
  facts: EvidenceFact[],
  hardMissing: HardMissingItem[],
  fieldMissing?: FieldMissingTiers,
  apiHitStats?: ApiHitStats
): number {
  let score = 0;

  // ── 维度 A：API 实际命中（主要评分依据）──
  if (apiHitStats) {
    // 每命中 1 个 API 源 +12 分（上限 60 分）
    score += Math.min(apiHitStats.hitCount * 12, 60);
    // 来源多样性加分：≥3 个不同 API 源 +10 分
    if (apiHitStats.hitCount >= 3) score += 10;
    // 有白名单来源命中 +5 分
    if (apiHitStats.hasWhitelistedHit) score += 5;
  }

  // ── 维度 B：LLM 解析的 facts（加分项）──
  if (facts.length > 0) score += 5;
  const freshBonus = Math.min(
    facts.filter((f) => f.freshness === "fresh").length * 2,
    10
  );
  score += freshBonus;

  // ── 扣分 ──
  const blockingCount = hardMissing.filter((h) => h.blocking).length;
  const nonBlockingCount = hardMissing.filter((h) => !h.blocking).length;
  score -= blockingCount * 20;
  score -= nonBlockingCount * 5;

  // P0-3: 字段级缺失扣分（降低扣分力度，避免 optional 字段过度惩罚）
  if (fieldMissing) {
    score -= fieldMissing.missingBlocking.length * 20;
    score -= fieldMissing.missingImportant.length * 5;
    score -= fieldMissing.missingOptional.length * 1;
  }

  // ── 兜底：如果没有 apiHitStats 但有 facts，使用旧逻辑 ──
  if (!apiHitStats && facts.length > 0) {
    score += 25; // 旧逻辑基础分补偿
    const uniqueSources = new Set(facts.map((f) => f.source)).size;
    if (uniqueSources >= 3) score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * 构建 EVIDENCE_PACKET
 * 输入：Manus 的 DATA_REPORT 文本 + 任务描述 + 可选字段级缺失分层 + API 命中统计
 * 输出：结构化证据包 + Step3 指令 + outputMode + claimWhitelist
 */
export function buildEvidencePacket(
  taskDescription: string,
  dataReport: string,
  fieldMissing?: FieldMissingTiers,
  apiHitStats?: ApiHitStats
): EvidencePacket {
  const { facts, hardMissing } = parseDataReport(dataReport);
  const evidenceScore = computeEvidenceScore(facts, hardMissing, fieldMissing, apiHitStats);

  const mb = fieldMissing?.missingBlocking ?? [];
  const mi = fieldMissing?.missingImportant ?? [];
  const mo = fieldMissing?.missingOptional ?? [];

  let evidenceLevel: EvidencePacket["evidenceLevel"];
  let allowInvestmentAdvice: boolean;
  let step3Instruction: string;
  let outputMode: EvidencePacket["outputMode"];

  // 构建 claim 白名单（fresh/stale 事实可直接引用）
  const claimWhitelist = facts
    .filter(f => f.freshness === "fresh" || f.freshness === "stale")
    .map(f => f.claim);

  // 字段缺失摘要（注入 Step3 指令）
  const fieldMissingSummary = mb.length > 0 || mi.length > 0
    ? `\n字段覆盖缺口：${mb.length > 0 ? `[阻断] ${mb.join(", ")}` : ""}${mi.length > 0 ? ` [重要] ${mi.join(", ")}` : ""}${mo.length > 0 ? ` [可选] ${mo.join(", ")}` : ""}`
    : "";

  // API 命中摘要
  const apiHitSummary = apiHitStats
    ? `\n已命中 ${apiHitStats.hitCount}/${apiHitStats.totalCount} 个数据源：${apiHitStats.hitSourceIds.join(", ")}`
    : "";

  if (evidenceScore >= 70) {
    evidenceLevel = "sufficient";
    allowInvestmentAdvice = true;
    outputMode = "decisive";
    step3Instruction = `[EVIDENCE_LEVEL: SUFFICIENT | score=${evidenceScore} | outputMode=DECISIVE]
证据充分，输出强判断：每个结论必须给出明确立场+幅度（如「高估30-40%」「建议减仓」），禁止模糊表述。
每个数字/结论必须引用对应的数据来源和时间戳。允许输出投资建议，但必须注明数据来源和时间。
${apiHitSummary}${fieldMissingSummary}`;
  } else if (evidenceScore >= 50) {
    evidenceLevel = "partial";
    allowInvestmentAdvice = false;
    outputMode = "directional";
    step3Instruction = `[EVIDENCE_LEVEL: PARTIAL | score=${evidenceScore} | outputMode=DIRECTIONAL]
证据部分充分，输出方向性判断：可给出趋势方向（如「偏高」「谨慎」），但禁止给出具体目标价/买卖建议。
每个结论后必须标注「（数据不完整，仅供参考）」。
${apiHitSummary}${fieldMissingSummary}`;
  } else {
    evidenceLevel = mb.length > 0 ? "insufficient" : "partial";
    allowInvestmentAdvice = false;
    outputMode = "framework_only";
    step3Instruction = `[EVIDENCE_LEVEL: LOW | score=${evidenceScore} | outputMode=DIRECTIONAL]
数据覆盖有限，基于现有数据给出方向性分析：直接分析已有数据，不要说"数据不足"或"无法判断"。
对于数据缺口，在分析末尾用一句话自然提及（如"受限于当前数据，以下维度有待补充：xxx"），不要作为主要内容。
禁止输出"研究框架"、"缺失的关键数据"等内部系统术语。
${apiHitSummary}${fieldMissingSummary}`;
  }

  return {
    taskDescription,
    facts,
    hardMissing,
    evidenceScore,
    evidenceLevel,
    allowInvestmentAdvice,
    step3Instruction,
    outputMode,
    claimWhitelist,
    missingBlocking: mb,
    missingImportant: mi,
    missingOptional: mo,
  };
}

/**
 * 验证 GPT 回复是否符合证据约束
 * 返回：pass（通过）| rewrite（需要重写）| blocked（阻断）
 */
export function validateGptResponse(
  response: string,
  packet: EvidencePacket
): {
  verdict: "pass" | "rewrite" | "blocked";
  violations: string[];
} {
  const violations: string[] = [];

  // 规则 1：insufficient 级别时，GPT 不应给出具体目标价（但可以给方向性判断）
  if (packet.evidenceLevel === "insufficient") {
    const strictKeywords = ["目标价", "买入价", "卖出价"];
    const hasStrict = strictKeywords.some((kw) => response.includes(kw));
    if (hasStrict) {
      violations.push(
        "insufficient 证据级别下不允许输出具体目标价"
      );
    }
  }

  // 规则 2：framework_only 模式时，不允许具体买卖建议（但允许方向性判断）
  if (packet.outputMode === "framework_only") {
    const judgmentKeywords = ["强烈推荐买入", "强烈建议卖出", "目标价"];
    const hasJudgment = judgmentKeywords.some((kw) => response.includes(kw));
    if (hasJudgment) {
      violations.push(
        "framework_only 模式下不允许输出具体买卖建议或目标价"
      );
    }
  }

  // 规则 3：directional 模式时，不允许具体投资建议
  if (packet.outputMode === "directional" && !packet.allowInvestmentAdvice) {
    const investmentKeywords = ["买入", "卖出", "目标价", "强烈推荐", "强烈建议"];
    const hasInvestment = investmentKeywords.some((kw) =>
      response.includes(kw)
    );
    if (hasInvestment) {
      violations.push(
        "directional 模式下不允许输出具体投资建议（买入/卖出/目标价）"
      );
    }
  }

  // 规则 4：检测训练记忆数据特征（年份与当前年份差距过大的数字）
  const currentYear = new Date().getFullYear();
  const oldYearPattern = new RegExp(
    `\\b(${currentYear - 3}|${currentYear - 4}|${currentYear - 5})\\b`,
    "g"
  );
  const oldYearMatches = response.match(oldYearPattern);
  if (oldYearMatches && oldYearMatches.length > 2) {
    violations.push(
      `回复中出现多个旧年份数据（${oldYearMatches.slice(0, 3).join(", ")}），可能使用了训练记忆数据`
    );
  }

  if (violations.length === 0) return { verdict: "pass", violations: [] };
  if (packet.evidenceLevel === "insufficient") {
    return { verdict: "blocked", violations };
  }
  return { verdict: "rewrite", violations };
}
