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
 *   30-49 → FRAMEWORK_ONLY：仅输出研究框架，不得给出任何价格/方向判断
 *   < 30  → BLOCKED：证据严重不足，拒绝分析
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
}

/**
 * 从 Manus DATA_REPORT 文本中提取结构化事实
 * DATA_REPORT 格式示例：
 * ```
 * [FACT] value=185.42 unit=USD timestamp=2026-03-21 source=Polygon.io claim=AAPL 收盘价
 * [FACT] value=28.5 unit=x timestamp=2026-03 source=FMP claim=AAPL 市盈率（TTM）
 * [HARD_MISSING] dataType=财务报表 reason=FMP API 无数据 blocking=true
 * ```
 */
export function parseDataReport(dataReport: string): {
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
 * 评分规则：
 * - 基础分：有 facts 则 30 分
 * - 每个 fresh fact：+5 分（上限 40 分）
 * - 每个 stale fact：+2 分（上限 15 分）
 * - 有 blocking hardMissing：-30 分/项（下限 0）
 * - 有非 blocking hardMissing：-10 分/项
 * - 来源多样性加分：≥3 个不同来源 +10 分
 */
export function computeEvidenceScore(
  facts: EvidenceFact[],
  hardMissing: HardMissingItem[]
): number {
  let score = 0;

  if (facts.length > 0) score += 30;

  const freshBonus = Math.min(
    facts.filter((f) => f.freshness === "fresh").length * 5,
    40
  );
  const staleBonus = Math.min(
    facts.filter((f) => f.freshness === "stale").length * 2,
    15
  );
  score += freshBonus + staleBonus;

  const blockingCount = hardMissing.filter((h) => h.blocking).length;
  const nonBlockingCount = hardMissing.filter((h) => !h.blocking).length;
  score -= blockingCount * 30;
  score -= nonBlockingCount * 10;

  const uniqueSources = new Set(facts.map((f) => f.source)).size;
  if (uniqueSources >= 3) score += 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * 构建 EVIDENCE_PACKET
 * 输入：Manus 的 DATA_REPORT 文本 + 任务描述
 * 输出：结构化证据包 + Step3 指令 + outputMode + claimWhitelist
 */
export function buildEvidencePacket(
  taskDescription: string,
  dataReport: string
): EvidencePacket {
  const { facts, hardMissing } = parseDataReport(dataReport);
  const evidenceScore = computeEvidenceScore(facts, hardMissing);

  let evidenceLevel: EvidencePacket["evidenceLevel"];
  let allowInvestmentAdvice: boolean;
  let step3Instruction: string;
  let outputMode: EvidencePacket["outputMode"];

  // 构建 claim 白名单（fresh/stale 事实可直接引用）
  const claimWhitelist = facts
    .filter(f => f.freshness === "fresh" || f.freshness === "stale")
    .map(f => f.claim);

  if (evidenceScore >= 70) {
    evidenceLevel = "sufficient";
    allowInvestmentAdvice = true;
    outputMode = "decisive";
    step3Instruction = `[EVIDENCE_LEVEL: SUFFICIENT | score=${evidenceScore} | outputMode=DECISIVE]
证据充分，输出强判断：每个结论必须给出明确立场+幅度（如「高估30-40%」「建议减仓」），禁止模糊表述。
每个数字/结论必须引用对应的 [FACT] 来源和时间戳。允许输出投资建议，但必须注明数据来源和时间。
已验证事实（${claimWhitelist.length}条）可直接引用，其余数据标注来源后方可使用。`;
  } else if (evidenceScore >= 50) {
    evidenceLevel = "partial";
    allowInvestmentAdvice = false;
    outputMode = "directional";
    step3Instruction = `[EVIDENCE_LEVEL: PARTIAL | score=${evidenceScore} | outputMode=DIRECTIONAL]
证据部分充分，输出方向性判断：可给出趋势方向（如「偏高」「谨慎」），但禁止给出具体目标价/买卖建议。
每个结论后必须标注「（数据不完整，仅供参考）」。
缺失数据：${hardMissing.map((h) => h.dataType).join("、") || "无"}`;
  } else if (evidenceScore >= 30) {
    evidenceLevel = "partial";
    allowInvestmentAdvice = false;
    outputMode = "framework_only";
    step3Instruction = `[EVIDENCE_LEVEL: PARTIAL_LOW | score=${evidenceScore} | outputMode=FRAMEWORK_ONLY]
证据不足，只能输出研究框架：列出需要收集的数据维度和分析思路，不得给出任何价格/方向判断。
明确说明「当前数据不足以支撑判断，以下为研究框架供参考」。
缺失数据：${hardMissing.map((h) => h.dataType).join("、") || "无"}`;
  } else {
    evidenceLevel = "insufficient";
    allowInvestmentAdvice = false;
    outputMode = "framework_only";
    const blockingItems = hardMissing.filter((h) => h.blocking);
    step3Instruction = `[EVIDENCE_LEVEL: INSUFFICIENT | score=${evidenceScore} | outputMode=FRAMEWORK_ONLY]
[HARD_MISSING] 证据严重不足，禁止进行分析或给出任何结论。
必须输出：「当前无法获取足够的实时数据来回答此问题。缺失的关键数据：${blockingItems.map((h) => h.dataType).join("、") || "全部核心数据"}。请稍后重试或换一个可以获取实时数据的问题。」
禁止使用训练记忆数据补充。`;
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

  // 规则 1：insufficient 级别时，GPT 不应给出分析性内容
  if (packet.evidenceLevel === "insufficient") {
    const analysisKeywords = [
      "建议",
      "推荐",
      "应该",
      "预计",
      "估计",
      "目标价",
      "买入",
      "卖出",
      "持有",
    ];
    const hasAnalysis = analysisKeywords.some((kw) => response.includes(kw));
    if (hasAnalysis) {
      violations.push(
        "insufficient 证据级别下不允许输出分析性内容或投资建议"
      );
    }
  }

  // 规则 2：framework_only 模式时，不允许具体价格/方向判断
  if (packet.outputMode === "framework_only") {
    const judgmentKeywords = ["买入", "卖出", "目标价", "强烈推荐", "强烈建议", "高估", "低估"];
    const hasJudgment = judgmentKeywords.some((kw) => response.includes(kw));
    if (hasJudgment) {
      violations.push(
        "framework_only 模式下不允许输出具体投资判断（买入/卖出/目标价/高估/低估）"
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
