/**
 * Phase 4C Stage 5 — Semantic Gate for structured_analysis
 *
 * Validates each subfield against its semantic role using structural rules.
 * Does NOT compare to answerObject. Does NOT use textual similarity.
 * Observational only — never throws, never blocks existing flow.
 *
 * Design spec: reports/phase4c/stage5_semantic_gate_design.md
 * Author: Manus AI (implementation) / Claude (design)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldResult {
  pass: boolean;
  score: number;       // 0–100
  reason: string;      // 'OK' or failure description
  warnings: string[];  // soft-rule warnings
}

export interface SemanticGateResult {
  overall: "HARD_FAIL" | "SOFT_FAIL" | "PASS" | "FULL_PASS";
  weighted_score: number;
  hard_fail_fields: string[];
  warnings: string[];
  fields: Record<string, FieldResult>;
}

export interface StructuredAnalysis {
  primary_bull?: string;
  primary_bear?: string;
  primary_risk_condition?: string;
  confidence_summary?: string;
  stance_rationale?: string;
}

export interface GateContext {
  verdict?: string;
  stance?: string;
}

// ─── Field Weights ────────────────────────────────────────────────────────────

const WEIGHTS: Record<string, number> = {
  primary_risk_condition: 0.25,
  confidence_summary:     0.20,
  primary_bull:           0.20,
  primary_bear:           0.20,
  stance_rationale:       0.15,
};

// ─── Regex Patterns ───────────────────────────────────────────────────────────

const CONDITIONAL_TRIGGER =
  /如果|若|一旦|当(?!前|时|下)|假如|倘若|万一|\bif\b|\bwhen\b|\bonce\b|\bshould\b/i;

const CONSEQUENCE_WORD =
  /则|导致|意味着|将会|将使|将导|would|implies|result in|trigger/i;

const CONFIDENCE_LEVEL =
  /高置信度|中置信度|低置信度|置信度.{0,4}[高中低]|[高中低].{0,4}置信|\bHIGH\b|\bMEDIUM\b|\bLOW\b|置信度为[高中低]/i;

const REASON_WORD =
  /因为|由于|鉴于|因此|基于|because|since|given|数据不足|无法量化/i;

const BULLISH_SIGNAL =
  /增长|上涨|超预期|强劲|看多|买入|增持|bullish|upside|beat|growth|positive|outperform/i;

const BEARISH_SIGNAL =
  /风险|下跌|利空|压力|看空|做空|卖出|减持|bearish|downside|miss|concern|negative|underperform/i;

const BEARISH_IN_BULL_MAIN =
  /看空|做空|卖出|减持|下跌风险|估值偏高|bearish|overvalued|sell|underweight/i;

const BULLISH_IN_BEAR_MAIN =
  /买入|增持|强烈推荐|大幅上涨|bullish|strong buy|outperform/i;

const STANCE_WORD =
  /BULLISH|BEARISH|NEUTRAL|看多|看空|中性|多头|空头/i;

const REASON_CONNECTOR =
  /因为|由于|鉴于|because|given|since/i;

// ─── Helper ───────────────────────────────────────────────────────────────────

function mainClause(text: string): string {
  return text.split(/但|然而|不过|however|but/i)[0] ?? text;
}

// ─── Field Evaluators ─────────────────────────────────────────────────────────

function evalPrimaryRiskCondition(v: string | undefined): FieldResult {
  const warnings: string[] = [];

  // H1 – non-empty
  if (!v || v.trim().length === 0) {
    return { pass: false, score: 0, reason: "PRC-H1: empty", warnings };
  }
  const t = v.trim();

  // H2 – length >= 30
  if (t.length < 30) {
    return { pass: false, score: 0, reason: `PRC-H2: too short (${t.length} < 30)`, warnings };
  }

  // H3 – conditional trigger word
  if (!CONDITIONAL_TRIGGER.test(t)) {
    return { pass: false, score: 0, reason: "PRC-H3: no conditional trigger word (如果/若/if/when…)", warnings };
  }

  // Passed all hard rules — start at 100, apply soft deductions
  let score = 100;

  if (!CONSEQUENCE_WORD.test(t)) {
    score -= 10;
    warnings.push("PRC-S1: no consequence word (则/导致/would…)");
  }
  if (t.length < 50) {
    score -= 5;
    warnings.push("PRC-S2: length 30-49 (full expression needs ≥50)");
  }
  if (!/\d|%|百分/.test(t)) {
    score -= 5;
    warnings.push("PRC-S3: no quantitative info (numbers/percentages)");
  }

  return { pass: true, score: Math.max(0, score), reason: "OK", warnings };
}

function evalConfidenceSummary(v: string | undefined, verdict?: string): FieldResult {
  const warnings: string[] = [];

  if (!v || v.trim().length === 0) {
    return { pass: false, score: 0, reason: "CS-H1: empty", warnings };
  }
  const t = v.trim();

  if (t.length < 25) {
    return { pass: false, score: 0, reason: `CS-H2: too short (${t.length} < 25)`, warnings };
  }

  if (!CONFIDENCE_LEVEL.test(t)) {
    return { pass: false, score: 0, reason: "CS-H3: no confidence level word (高/中/低置信度/HIGH/MEDIUM/LOW…)", warnings };
  }

  let score = 100;

  if (!REASON_WORD.test(t)) {
    score -= 15;
    warnings.push("CS-S1: no reason connector (因为/由于/because…)");
  }
  if (t.length < 40) {
    score -= 5;
    warnings.push("CS-S2: length 25-39 chars");
  }
  // CS-S3: check overlap with verdict
  if (verdict && verdict.length >= 20) {
    const verdictPrefix = verdict.slice(0, 20).toLowerCase();
    const tLower = t.toLowerCase();
    const overlap = verdictPrefix.split("").filter((c) => tLower.includes(c)).length;
    if (overlap / verdictPrefix.length > 0.85) {
      score -= 10;
      warnings.push("CS-S3: high overlap with verdict prefix (synthesis may be repetition)");
    }
  }

  return { pass: true, score: Math.max(0, score), reason: "OK", warnings };
}

function evalPrimaryBull(v: string | undefined): FieldResult {
  const warnings: string[] = [];

  if (!v || v.trim().length === 0) {
    return { pass: false, score: 0, reason: "PB-H1: empty", warnings };
  }
  const t = v.trim();

  if (t.length < 20) {
    return { pass: false, score: 0, reason: `PB-H2: too short (${t.length} < 20)`, warnings };
  }

  // H3 – main clause must not contain bearish words
  const mc = mainClause(t);
  if (BEARISH_IN_BULL_MAIN.test(mc)) {
    return { pass: false, score: 0, reason: "PB-H3: main clause contains bearish direction word", warnings };
  }

  let score = 100;

  if (!BULLISH_SIGNAL.test(t)) {
    score -= 10;
    warnings.push("PB-S1: no bullish signal word (增长/上涨/bullish/upside…)");
  }
  if (t.length < 30) {
    score -= 5;
    warnings.push("PB-S2: length 20-29 chars");
  }

  return { pass: true, score: Math.max(0, score), reason: "OK", warnings };
}

function evalPrimaryBear(v: string | undefined): FieldResult {
  const warnings: string[] = [];

  if (!v || v.trim().length === 0) {
    return { pass: false, score: 0, reason: "PBR-H1: empty", warnings };
  }
  const t = v.trim();

  if (t.length < 20) {
    return { pass: false, score: 0, reason: `PBR-H2: too short (${t.length} < 20)`, warnings };
  }

  const mc = mainClause(t);
  if (BULLISH_IN_BEAR_MAIN.test(mc)) {
    return { pass: false, score: 0, reason: "PBR-H3: main clause contains strong bullish word", warnings };
  }

  let score = 100;

  if (!BEARISH_SIGNAL.test(t)) {
    score -= 10;
    warnings.push("PBR-S1: no bearish signal word (风险/下跌/bearish/downside…)");
  }
  if (t.length < 30) {
    score -= 5;
    warnings.push("PBR-S2: length 20-29 chars");
  }

  return { pass: true, score: Math.max(0, score), reason: "OK", warnings };
}

function evalStanceRationale(v: string | undefined): FieldResult {
  const warnings: string[] = [];

  if (!v || v.trim().length === 0) {
    return { pass: false, score: 0, reason: "SR-H1: empty", warnings };
  }
  const t = v.trim();

  if (t.length < 20) {
    return { pass: false, score: 0, reason: `SR-H2: too short (${t.length} < 20)`, warnings };
  }

  if (!STANCE_WORD.test(t)) {
    return { pass: false, score: 0, reason: "SR-H3: no stance word (BULLISH/BEARISH/NEUTRAL/看多/看空/中性…)", warnings };
  }

  let score = 100;

  if (!REASON_CONNECTOR.test(t)) {
    score -= 10;
    warnings.push("SR-S1: no reason connector (因为/由于/because/given…)");
  }

  return { pass: true, score: Math.max(0, score), reason: "OK", warnings };
}

// ─── Main Evaluator ───────────────────────────────────────────────────────────

export function evaluateStructuredAnalysisSemantics(
  sa: StructuredAnalysis,
  context: GateContext = {}
): SemanticGateResult {
  try {
    const fields: Record<string, FieldResult> = {
      primary_risk_condition: evalPrimaryRiskCondition(sa.primary_risk_condition),
      confidence_summary:     evalConfidenceSummary(sa.confidence_summary, context.verdict),
      primary_bull:           evalPrimaryBull(sa.primary_bull),
      primary_bear:           evalPrimaryBear(sa.primary_bear),
      stance_rationale:       evalStanceRationale(sa.stance_rationale),
    };

    const hard_fail_fields: string[] = [];
    const warnings: string[] = [];
    let weighted_score = 0;

    for (const [fieldName, result] of Object.entries(fields)) {
      const weight = WEIGHTS[fieldName] ?? 0;
      weighted_score += result.score * weight;
      if (!result.pass) {
        hard_fail_fields.push(`${fieldName}: ${result.reason}`);
      }
      for (const w of result.warnings) {
        warnings.push(`${fieldName}: ${w}`);
      }
    }

    weighted_score = Math.round(weighted_score);

    let overall: SemanticGateResult["overall"];
    if (hard_fail_fields.length > 0) {
      overall = "HARD_FAIL";
    } else if (weighted_score < 65) {
      overall = "SOFT_FAIL";
    } else if (weighted_score >= 85) {
      overall = "FULL_PASS";
    } else {
      overall = "PASS";
    }

    return { overall, weighted_score, hard_fail_fields, warnings, fields };
  } catch (err) {
    // Never throw — return a safe fallback
    return {
      overall: "HARD_FAIL",
      weighted_score: 0,
      hard_fail_fields: [`gate_error: ${String(err)}`],
      warnings: [],
      fields: {},
    };
  }
}
