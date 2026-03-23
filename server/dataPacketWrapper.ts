/**
 * dataPacketWrapper.ts
 * V1.5 DATA_PACKET_WRAPPER — 轻量结构化包装层
 *
 * 设计原则（GPT 决策文档 Section 6 / V1.5 决策）：
 * - V1.5 不重构 manusReport（成本过高），改为在现有 markdown 报告外加轻量 wrapper
 * - wrapper 提取 DELIVERABLE / DISCUSSION JSON 块，组装为 DataPacket
 * - DataPacket 注入下游 SYNTHESIS prompt，替代原始 manusReport 文本
 * - 零新增 LLM 调用，纯 CPU 处理
 */

import type { MultiAgentResult } from "./multiAgentAnalysis";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  field: string;         // 数据字段名（如 "PE_ratio", "revenue_growth"）
  value: string;         // 数据值（如 "23.4x"）
  source: string;        // 数据来源（如 "FMP", "Yahoo Finance"）
  quality: "high" | "medium" | "low";  // 数据质量评级
  timestamp?: string;    // 数据时间戳（如 "2024Q3"）
}

export interface SynthesisResult {
  verdict: string;
  confidence: "high" | "medium" | "low";
  key_evidence: string[];
  reasoning: string[];
  counterarguments: string[];
  risks: Array<{ description: string; magnitude: "high" | "medium" | "low" }>;
  next_steps: string[];
}

export interface DiscussionResult {
  key_uncertainty: string;
  weakest_point: string;
  alternative_view: string;
  follow_up_questions: string[];
  exploration_paths: string[];
}

export interface DataPacket {
  // 元数据
  taskId: string;
  ticker: string;
  taskType: string;
  createdAt: number;

  // V1.5 字段需求（来自 FIELD_REQUIREMENT_GENERATOR）
  requiredFields?: string[];
  missingFields?: string[];

  // 证据层（来自 evidenceValidator）
  evidenceItems: EvidenceItem[];
  evidenceQualityScore: number;  // 0-100，基于 high/medium/low 比例

  // 多角色分析层（来自 multiAgentAnalysis）
  multiAgentResult?: {
    consensusSignal: string;
    divergenceNote: string;
    roleClassification: MultiAgentResult["roleClassification"];
    directorSummary: string;
  };

  // 综合分析层（从 manusReport 提取的 DELIVERABLE JSON）
  synthesis?: SynthesisResult;

  // 讨论钩子层（从 manusReport 提取的 DISCUSSION JSON）
  discussion?: DiscussionResult;

  // 原始报告（保留完整 markdown，供 fallback 使用）
  rawReport: string;
}

// ── 核心函数 ──────────────────────────────────────────────────────────────────

/**
 * 从 manusReport markdown 中提取 DELIVERABLE 和 DISCUSSION JSON 块
 */
export function extractStructuredBlocks(report: string): {
  synthesis: SynthesisResult | null;
  discussion: DiscussionResult | null;
} {
  let synthesis: SynthesisResult | null = null;
  let discussion: DiscussionResult | null = null;

  // 提取 %%DELIVERABLE%% ... %%END_DELIVERABLE%%
  const deliverableMatch = report.match(/%%DELIVERABLE%%\s*([\s\S]*?)\s*%%END_DELIVERABLE%%/);
  if (deliverableMatch) {
    try {
      const parsed = JSON.parse(deliverableMatch[1].trim());
      // 验证必要字段
      if (parsed.verdict && parsed.confidence) {
        synthesis = {
          verdict: String(parsed.verdict || ""),
          confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
          key_evidence: Array.isArray(parsed.key_evidence) ? parsed.key_evidence : [],
          reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : [],
          counterarguments: Array.isArray(parsed.counterarguments) ? parsed.counterarguments : [],
          risks: Array.isArray(parsed.risks) ? parsed.risks : [],
          next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
        };
      }
    } catch {
      // JSON 解析失败，静默跳过
    }
  }

  // 提取 %%DISCUSSION%% ... %%END_DISCUSSION%%
  const discussionMatch = report.match(/%%DISCUSSION%%\s*([\s\S]*?)\s*%%END_DISCUSSION%%/);
  if (discussionMatch) {
    try {
      const parsed = JSON.parse(discussionMatch[1].trim());
      if (parsed.key_uncertainty) {
        discussion = {
          key_uncertainty: String(parsed.key_uncertainty || ""),
          weakest_point: String(parsed.weakest_point || ""),
          alternative_view: String(parsed.alternative_view || ""),
          follow_up_questions: Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions : [],
          exploration_paths: Array.isArray(parsed.exploration_paths) ? parsed.exploration_paths : [],
        };
      }
    } catch {
      // JSON 解析失败，静默跳过
    }
  }

  return { synthesis, discussion };
}

/**
 * 从 evidencePacket 字符串中提取结构化证据项
 * evidencePacket 格式：由 buildEvidencePacket 生成的 markdown 文本
 */
export function extractEvidenceItems(evidencePacket: string): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  // 简单解析：按行扫描，识别 "字段: 值 (来源)" 模式
  const lines = evidencePacket.split("\n");
  for (const line of lines) {
    // 匹配格式：- **字段名**: 值 | 来源: xxx
    const match = line.match(/[-*]\s*\*{0,2}([^:*]+)\*{0,2}:\s*([^|]+?)(?:\s*\|\s*来源[:：]\s*(.+))?$/);
    if (match) {
      const field = match[1].trim().replace(/\s+/g, "_").toLowerCase();
      const value = match[2].trim();
      const source = match[3]?.trim() || "unknown";

      // 简单质量评级：有来源且值非空 → high；有值无来源 → medium；其他 → low
      const quality: EvidenceItem["quality"] = source !== "unknown" && value ? "high" : value ? "medium" : "low";

      if (field && value) {
        items.push({ field, value, source, quality });
      }
    }
  }

  return items;
}

/**
 * 计算证据质量综合评分（0-100）
 */
export function calcEvidenceQualityScore(items: EvidenceItem[]): number {
  if (items.length === 0) return 0;
  const weights = { high: 1.0, medium: 0.6, low: 0.2 };
  const total = items.reduce((sum, item) => sum + weights[item.quality], 0);
  const maxPossible = items.length * 1.0;
  return Math.round((total / maxPossible) * 100);
}

/**
 * 主函数：构建 DataPacket
 * 在 manusReport 生成后调用，零新增 LLM 调用
 */
export function buildDataPacket(params: {
  taskId: string;
  ticker: string;
  taskType: string;
  manusReport: string;
  evidencePacket?: string;
  multiAgentResult?: MultiAgentResult;
  requiredFields?: string[];
  missingFields?: string[];
}): DataPacket {
  const { taskId, ticker, taskType, manusReport, evidencePacket, multiAgentResult, requiredFields, missingFields } = params;

  // 提取结构化块
  const { synthesis, discussion } = extractStructuredBlocks(manusReport);

  // 提取证据项
  const evidenceItems = evidencePacket ? extractEvidenceItems(evidencePacket) : [];
  const evidenceQualityScore = calcEvidenceQualityScore(evidenceItems);

  return {
    taskId,
    ticker,
    taskType,
    createdAt: Date.now(),
    requiredFields,
    missingFields,
    evidenceItems,
    evidenceQualityScore,
    multiAgentResult: multiAgentResult ? {
      consensusSignal: multiAgentResult.consensusSignal,
      divergenceNote: multiAgentResult.divergenceNote,
      roleClassification: multiAgentResult.roleClassification,
      directorSummary: multiAgentResult.directorSummary,
    } : undefined,
    synthesis: synthesis ?? undefined,
    discussion: discussion ?? undefined,
    rawReport: manusReport,
  };
}

/**
 * 将 DataPacket 格式化为注入 SYNTHESIS prompt 的结构化摘要
 * 替代原始 manusReport 文本，减少 token 消耗
 */
export function formatDataPacketForPrompt(packet: DataPacket): string {
  const lines: string[] = [
    `[DATA_PACKET v1.5 | ${packet.ticker} | ${packet.taskType} | 证据质量: ${packet.evidenceQualityScore}/100]`,
    "",
  ];

  // 多角色分析摘要
  if (packet.multiAgentResult) {
    const rc = packet.multiAgentResult.roleClassification;
    lines.push("## 多角色分析摘要（V1.5 重映射）");
    lines.push(`共识信号: ${packet.multiAgentResult.consensusSignal.toUpperCase()}`);
    if (packet.multiAgentResult.divergenceNote) {
      lines.push(`分歧: ${packet.multiAgentResult.divergenceNote}`);
    }
    if (rc.valuation_view) {
      lines.push(`估值视角 [${rc.valuation_view.signal}|${rc.valuation_view.confidence}]: ${rc.valuation_view.verdict}`);
    }
    if (rc.business_view) {
      lines.push(`业务质量视角 [${rc.business_view.signal}|${rc.business_view.confidence}]: ${rc.business_view.verdict}`);
    }
    if (rc.risk_view) {
      lines.push(`风险视角 [${rc.risk_view.signal}|${rc.risk_view.confidence}]: ${rc.risk_view.verdict}`);
    }
    if (rc.market_context) {
      lines.push(`市场背景 [${rc.market_context.signal}|${rc.market_context.confidence}]: ${rc.market_context.verdict}`);
    }
    lines.push("");
  }

  // 字段需求状态
  if (packet.requiredFields && packet.requiredFields.length > 0) {
    lines.push("## 字段需求状态（FIELD_REQUIREMENT_GENERATOR）");
    lines.push(`必需字段: ${packet.requiredFields.join(", ")}`);
    if (packet.missingFields && packet.missingFields.length > 0) {
      lines.push(`⚠️ 缺失字段: ${packet.missingFields.join(", ")} — 请在报告中明确标注数据缺失`);
    } else {
      lines.push("✅ 所有必需字段已覆盖");
    }
    lines.push("");
  }

  // 上一轮综合结论（若有）
  if (packet.synthesis) {
    lines.push("## 上一轮综合结论（SYNTHESIS）");
    lines.push(`判断: ${packet.synthesis.verdict}`);
    lines.push(`置信度: ${packet.synthesis.confidence}`);
    if (packet.synthesis.counterarguments.length > 0) {
      lines.push(`反驳论点: ${packet.synthesis.counterarguments.slice(0, 2).join(" | ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
