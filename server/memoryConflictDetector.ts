/**
 * DANTREE_LEVEL3B Phase2: Memory Conflict Detector
 * Detects when current reasoning materially conflicts with prior verdict or thesis.
 * Uses deterministic mapping rules only — zero LLM calls.
 * MODULE_ID: LEVEL3B_CONFLICT_DETECTOR
 */

import type { MemoryConflict } from "./hypothesisEngine";

// ── Verdict Direction Mapping ─────────────────────────────────────────────────

const BULLISH_KEYWORDS = [
  "看多", "买入", "增持", "bullish", "buy", "outperform", "overweight",
  "strong buy", "positive", "上涨", "上行", "做多",
];

const BEARISH_KEYWORDS = [
  "看空", "卖出", "减持", "bearish", "sell", "underperform", "underweight",
  "strong sell", "negative", "下跌", "下行", "做空",
];

const NEUTRAL_KEYWORDS = [
  "中性", "持有", "观望", "neutral", "hold", "market perform", "equal weight",
  "in-line", "不确定", "unclear",
];

type VerdictDirection = "bullish" | "bearish" | "neutral" | "unknown";

function classifyVerdictDirection(verdict: string): VerdictDirection {
  const lower = verdict.toLowerCase();
  if (BULLISH_KEYWORDS.some(k => lower.includes(k))) return "bullish";
  if (BEARISH_KEYWORDS.some(k => lower.includes(k))) return "bearish";
  if (NEUTRAL_KEYWORDS.some(k => lower.includes(k))) return "neutral";
  return "unknown";
}

// ── Confidence Level Mapping ──────────────────────────────────────────────────

const CONFIDENCE_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

function confidenceRank(c: string): number {
  return CONFIDENCE_RANK[c.toLowerCase()] ?? 0;
}

// ── Main Conflict Detector ────────────────────────────────────────────────────

export interface ConflictDetectorInput {
  priorVerdict: string;
  currentVerdict: string;
  priorConfidence: string;
  currentConfidence: string;
  priorBullCase?: string;
  currentBearCase?: string;
  priorBearCase?: string;
  currentBullCase?: string;
}

/**
 * Detect memory conflict between prior analysis and current analysis.
 * Deterministic rules only — no LLM calls.
 * Returns MemoryConflict object.
 */
export function detectMemoryConflict(input: ConflictDetectorInput): MemoryConflict {
  const {
    priorVerdict,
    currentVerdict,
    priorConfidence,
    currentConfidence,
    priorBullCase = "",
    currentBearCase = "",
    priorBearCase = "",
    currentBullCase = "",
  } = input;

  // No prior data → no conflict
  if (!priorVerdict || !currentVerdict) {
    return {
      has_conflict: false,
      conflict_type: "none",
      prior_verdict: priorVerdict,
      current_verdict: currentVerdict,
      prior_confidence: priorConfidence,
      current_confidence: currentConfidence,
      summary: "",
    };
  }

  const priorDir = classifyVerdictDirection(priorVerdict);
  const currentDir = classifyVerdictDirection(currentVerdict);
  const priorRank = confidenceRank(priorConfidence);
  const currentRank = confidenceRank(currentConfidence);

  // ── Rule 1: Verdict Flip ──────────────────────────────────────────────────
  // Prior bullish → current bearish, or prior bearish → current bullish
  if (
    (priorDir === "bullish" && currentDir === "bearish") ||
    (priorDir === "bearish" && currentDir === "bullish")
  ) {
    return {
      has_conflict: true,
      conflict_type: "verdict_flip",
      prior_verdict: priorVerdict,
      current_verdict: currentVerdict,
      prior_confidence: priorConfidence,
      current_confidence: currentConfidence,
      summary: `判断方向逆转：上次 ${priorDir === "bullish" ? "看多" : "看空"}（${priorConfidence}）→ 本次 ${currentDir === "bullish" ? "看多" : "看空"}（${currentConfidence}）`,
    };
  }

  // ── Rule 2: Confidence Drop ───────────────────────────────────────────────
  // Prior high/medium → current significantly lower (drop by ≥ 1 level)
  if (priorRank >= 2 && currentRank < priorRank - 0) {
    // Only flag if drop is meaningful (high→low or medium→low)
    if (priorRank - currentRank >= 2) {
      return {
        has_conflict: true,
        conflict_type: "confidence_drop",
        prior_verdict: priorVerdict,
        current_verdict: currentVerdict,
        prior_confidence: priorConfidence,
        current_confidence: currentConfidence,
        summary: `置信度大幅下降：上次 ${priorConfidence} → 本次 ${currentConfidence}，判断稳定性减弱`,
      };
    }
  }

  // ── Rule 3: Thesis Tension ────────────────────────────────────────────────
  // Prior bull case is materially contradicted by current bear case
  if (priorBullCase && currentBearCase) {
    const priorBullNorm = priorBullCase.toLowerCase();
    const currentBearNorm = currentBearCase.toLowerCase();
    // Check if current bear case directly addresses prior bull case themes
    const thesisTensionKeywords = [
      "增长", "growth", "收入", "revenue", "利润", "profit",
      "市场份额", "market share", "扩张", "expansion",
    ];
    const hasTension = thesisTensionKeywords.some(
      k => priorBullNorm.includes(k) && currentBearNorm.includes(k)
    );
    if (hasTension) {
      return {
        has_conflict: true,
        conflict_type: "thesis_tension",
        prior_verdict: priorVerdict,
        current_verdict: currentVerdict,
        prior_confidence: priorConfidence,
        current_confidence: currentConfidence,
        summary: `论点张力：上次看多逻辑（${priorBullCase.slice(0, 60)}）与本次看空风险存在直接矛盾`,
      };
    }
  }

  // ── Rule 4: Risk Escalation ───────────────────────────────────────────────
  // Prior bear case risk becomes the primary current bear case
  if (priorBearCase && currentBearCase) {
    const priorBearNorm = priorBearCase.toLowerCase();
    const currentBearNorm = currentBearCase.toLowerCase();
    // Check if the same risk theme appears in both (escalated from background to primary)
    const riskKeywords = [
      "关税", "tariff", "监管", "regulation", "竞争", "competition",
      "利率", "interest rate", "通胀", "inflation", "债务", "debt",
    ];
    const sharedRisk = riskKeywords.find(
      k => priorBearNorm.includes(k) && currentBearNorm.includes(k)
    );
    if (sharedRisk) {
      return {
        has_conflict: true,
        conflict_type: "risk_escalation",
        prior_verdict: priorVerdict,
        current_verdict: currentVerdict,
        prior_confidence: priorConfidence,
        current_confidence: currentConfidence,
        summary: `风险升级：上次已识别的风险（${sharedRisk}）在本次分析中显著加剧，成为主要威胁`,
      };
    }
  }

  // ── No conflict ───────────────────────────────────────────────────────────
  return {
    has_conflict: false,
    conflict_type: "none",
    prior_verdict: priorVerdict,
    current_verdict: currentVerdict,
    prior_confidence: priorConfidence,
    current_confidence: currentConfidence,
    summary: "",
  };
}
