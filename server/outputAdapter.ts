/**
 * outputAdapter.ts
 * Phase 1A — DanTree Structured Backbone
 *
 * Parallel extraction layer: maps existing %%DELIVERABLE%% fields
 * into a minimal decision_object + DecisionSnapshot.
 * Does NOT replace the existing DELIVERABLE parsing chain.
 *
 * Design constraints:
 * - Additive only: no existing field removed or overwritten
 * - Low blast radius: all errors are non-fatal, caught internally
 * - Source-tagged: every field carries extraction source metadata
 */

import type { FinalOutputSchema } from "./outputSchemaValidator";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StanceDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCERTAIN";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type ActionReadiness = "EXECUTE" | "CONSIDER" | "MONITOR" | "BLOCKED";
export type ExtractionTier = "FULL_SUCCESS" | "PARTIAL_SUCCESS" | "FALLBACK";
export type FieldSource = "LLM" | "PREVIOUS" | "INFERRED" | "MISSING";
export type SnapshotStability = "STABLE" | "CHANGED" | "REVERSED";

export interface KeyArgument {
  argument: string;
  direction: "BULL" | "BEAR";
  strength: "STRONG" | "MEDIUM" | "WEAK";
  source: FieldSource;
}

export interface InvalidationCondition {
  condition: string;
  probability: "HIGH" | "MEDIUM" | "LOW";
  source: FieldSource;
}

export interface DecisionObject {
  // Core fields
  stance: StanceDirection;
  confidence: ConfidenceLevel;
  confidence_reason: string;
  action_readiness: ActionReadiness;
  // Arguments
  key_arguments: KeyArgument[];
  top_bear_argument: string | null;
  // Risk
  invalidation_conditions: InvalidationCondition[];
  // Metadata
  _tier: ExtractionTier;
  _inferred_fields: string[];
  _extraction_log: Array<{ field: string; source: FieldSource }>;
}

export interface DecisionSnapshot {
  current_bias: {
    direction: StanceDirection;
    summary: string;
    confidence: ConfidenceLevel;
  };
  why: {
    argument: string;
    direction: "BULL";
  };
  key_risk: {
    risk: string;
    source: "BEAR_ARGUMENT" | "INVALIDATION_CONDITION";
  };
  next_step: {
    action: string;
    type: "RESEARCH" | "WAIT" | "CONFIRM" | "ACT";
  };
  _meta: {
    generated_at: number;
    based_on_turn: number;
    stability: SnapshotStability;
    is_stale: boolean;
    horizon: string;
    /** Phase 1B Freshness Gate — populated by applyFreshnessGate() */
    field_freshness?: {
      stance: "FRESH_UPDATE" | "REUSE";
      key_arguments: "FRESH_UPDATE" | "REUSE";
    };
  };
}

export interface AdapterResult {
  decision_object: DecisionObject;
  snapshot: DecisionSnapshot;
  health: W1HealthMetrics;
}

// ── W1 Health Metrics ─────────────────────────────────────────────────────────

export interface W1HealthMetrics {
  llm_hit_rate: number;          // H1: ratio of successful LLM extractions
  field_freshness_ratio: number; // H2: ratio of FRESH fields
  partial_success_streak: number;// H3: consecutive PARTIAL_SUCCESS turns
  deferred_queue_depth: number;  // H4: placeholder (0 until queue implemented)
  inference_field_count: number; // H5: count of INFERRED fields
  _tier: ExtractionTier;
  _turn: number;
}

// Session-level health state (in-memory, resets on process restart)
const _sessionHealth = {
  turns_attempted: 0,
  turns_llm_success: 0,
  partial_success_streak: 0,
  current_turn: 0,
};

// ── Inference helpers ─────────────────────────────────────────────────────────

/**
 * Infer StanceDirection from verdict text + bull/bear case balance.
 * Mirrors the existing inferStanceFromVerdict logic in routers.ts.
 */
function inferStance(
  verdict: string,
  bullCase: string[],
  bearCase: string[]
): { stance: StanceDirection; source: FieldSource } {
  const v = verdict.toLowerCase();
  const bullishKw = ["看多", "做多", "买入", "增持", "bullish", "buy", "overweight", "positive outlook", "上涨", "强烈推荐"];
  const bearishKw = ["看空", "做空", "卖出", "减持", "bearish", "sell", "underweight", "negative outlook", "下跌", "规避"];
  const neutralKw = ["中性", "观望", "neutral", "hold", "维持", "不足", "数据不足", "无法判断", "insufficient"];
  const mixedKw = ["分歧", "mixed", "conflicting", "矛盾", "不确定"];

  const hasBull = bullishKw.some(k => v.includes(k));
  const hasBear = bearishKw.some(k => v.includes(k));
  const hasNeutral = neutralKw.some(k => v.includes(k));
  const hasMixed = mixedKw.some(k => v.includes(k));

  if (hasMixed || (hasBull && hasBear)) return { stance: "NEUTRAL", source: "INFERRED" };
  if (hasBull && !hasBear) return { stance: "BULLISH", source: "INFERRED" };
  if (hasBear && !hasBull) return { stance: "BEARISH", source: "INFERRED" };
  if (hasNeutral) return { stance: "NEUTRAL", source: "INFERRED" };

  // Fallback: balance of bull/bear case items
  const hasBullCase = bullCase.length > 0;
  const hasBearCase = bearCase.length > 0;
  if (hasBullCase && hasBearCase) return { stance: "NEUTRAL", source: "INFERRED" };
  if (hasBullCase) return { stance: "BULLISH", source: "INFERRED" };
  if (hasBearCase) return { stance: "BEARISH", source: "INFERRED" };

  return { stance: "UNCERTAIN", source: "INFERRED" };
}

/**
 * Map confidence string (high/medium/low) to uppercase ConfidenceLevel.
 */
function mapConfidence(raw: string): ConfidenceLevel {
  const c = raw.toLowerCase();
  if (c === "high") return "HIGH";
  if (c === "medium") return "MEDIUM";
  return "LOW";
}

/**
 * Infer ActionReadiness from stance (most conservative inference per W1.6).
 */
function inferActionReadiness(stance: StanceDirection): ActionReadiness {
  if (stance === "BULLISH") return "CONSIDER"; // conservative: not EXECUTE
  if (stance === "NEUTRAL") return "MONITOR";
  if (stance === "BEARISH") return "MONITOR";
  return "BLOCKED"; // UNCERTAIN
}

/**
 * Infer argument strength from position in array (first = strongest).
 */
function inferStrength(index: number): "STRONG" | "MEDIUM" | "WEAK" {
  if (index === 0) return "STRONG";
  if (index === 1) return "MEDIUM";
  return "WEAK";
}

/**
 * Map action_readiness to next_step for snapshot.
 */
function mapReadinessToNextStep(
  readiness: ActionReadiness,
  nextSteps: string[]
): DecisionSnapshot["next_step"] {
  const firstStep = nextSteps[0] ?? "";
  switch (readiness) {
    case "EXECUTE":
      return { action: "条件基本满足，可以考虑行动", type: "ACT" };
    case "CONSIDER":
      return { action: firstStep ? `还需确认: ${firstStep.slice(0, 28)}` : "还需确认关键条件", type: "CONFIRM" };
    case "MONITOR":
      return { action: firstStep ? firstStep.slice(0, 30) : "继续补充信息后再评估", type: "RESEARCH" };
    case "BLOCKED":
      return { action: firstStep ? `等待: ${firstStep.slice(0, 24)}` : "等待触发条件", type: "WAIT" };
  }
}

/**
 * Apply inference confidence cap per W1.6.1 §2.
 * INFERRED fields capped at 0.60; chained inference at 0.45.
 * Returns numeric confidence for internal use (not stored in decision_object).
 */
function applyInferenceCap(rawConfidence: ConfidenceLevel, inferredCount: number): ConfidenceLevel {
  if (inferredCount === 0) return rawConfidence;
  // Any INFERRED core field: cap at MEDIUM (≈0.60)
  if (rawConfidence === "HIGH") return "MEDIUM";
  return rawConfidence;
}

// ── Main extraction function ──────────────────────────────────────────────────

/**
 * Extract decision_object from a parsed FinalOutputSchema (DELIVERABLE).
 * Returns null if input is null/degraded (caller should handle gracefully).
 */
export function extractDecisionObject(
  deliverable: FinalOutputSchema | null,
  previousSnapshot: DecisionSnapshot | null = null,
  turnIndex = 0
): AdapterResult | null {
  _sessionHealth.current_turn = turnIndex;
  _sessionHealth.turns_attempted += 1;

  if (!deliverable) {
    _updateHealthOnFallback();
    return null;
  }

  const extractionLog: Array<{ field: string; source: FieldSource }> = [];
  const inferredFields: string[] = [];

  // ── 1. stance (INFERRED from verdict + bull/bear case) ─────────────────────
  const { stance, source: stanceSource } = inferStance(
    deliverable.verdict ?? "",
    deliverable.bull_case ?? [],
    deliverable.bear_case ?? []
  );
  extractionLog.push({ field: "stance", source: stanceSource });
  if (stanceSource === "INFERRED") inferredFields.push("stance");

  // ── 2. confidence (LLM — direct from deliverable) ──────────────────────────
  const confidence = mapConfidence(deliverable.confidence ?? "low");
  extractionLog.push({ field: "confidence", source: "LLM" });

  // ── 3. confidence_reason (LLM — from reasoning[0] or verdict) ─────────────
  const confidenceReason = (deliverable.reasoning?.[0] ?? deliverable.verdict ?? "").slice(0, 80);
  extractionLog.push({ field: "confidence_reason", source: deliverable.reasoning?.length ? "LLM" : "INFERRED" });
  if (!deliverable.reasoning?.length) inferredFields.push("confidence_reason");

  // ── 4. key_arguments (LLM — from bull_case + bear_case) ───────────────────
  const keyArguments: KeyArgument[] = [
    ...(deliverable.bull_case ?? []).map((arg, i): KeyArgument => ({
      argument: arg.slice(0, 80),
      direction: "BULL",
      strength: inferStrength(i),
      source: "LLM",
    })),
    ...(deliverable.bear_case ?? []).map((arg, i): KeyArgument => ({
      argument: arg.slice(0, 80),
      direction: "BEAR",
      strength: inferStrength(i),
      source: "LLM",
    })),
  ];
  extractionLog.push({ field: "key_arguments", source: "LLM" });

  // ── 5. top_bear_argument (LLM — first bear_case item) ─────────────────────
  const topBearArgument = deliverable.bear_case?.[0]?.slice(0, 80) ?? null;
  extractionLog.push({ field: "top_bear_argument", source: topBearArgument ? "LLM" : "MISSING" });

  // ── 6. invalidation_conditions (LLM — from risks) ─────────────────────────
  const invalidationConditions: InvalidationCondition[] = (deliverable.risks ?? []).map(r => ({
    condition: r.description.slice(0, 80),
    probability: r.magnitude === "high" ? "HIGH" : r.magnitude === "medium" ? "MEDIUM" : "LOW",
    source: "LLM" as FieldSource,
  }));
  extractionLog.push({ field: "invalidation_conditions", source: invalidationConditions.length ? "LLM" : "MISSING" });

  // ── 7. action_readiness (INFERRED from stance) ────────────────────────────
  const actionReadiness = inferActionReadiness(stance);
  extractionLog.push({ field: "action_readiness", source: "INFERRED" });
  inferredFields.push("action_readiness");

  // ── 8. Apply inference confidence cap (W1.6.1 §2) ─────────────────────────
  const cappedConfidence = applyInferenceCap(confidence, inferredFields.filter(f => ["stance", "confidence"].includes(f)).length);
  if (cappedConfidence !== confidence) {
    console.log(`[W1_HEALTH] INFERENCE_CAPPED: confidence ${confidence}→${cappedConfidence}`);
  }

  // ── 9. Determine extraction tier ──────────────────────────────────────────
  const tier: ExtractionTier = deliverable.degraded
    ? "FALLBACK"
    : inferredFields.length <= 2
      ? "FULL_SUCCESS"
      : "PARTIAL_SUCCESS";

  // ── 10. Build decision_object ──────────────────────────────────────────────
  const decisionObject: DecisionObject = {
    stance,
    confidence: cappedConfidence,
    confidence_reason: confidenceReason,
    action_readiness: actionReadiness,
    key_arguments: keyArguments,
    top_bear_argument: topBearArgument,
    invalidation_conditions: invalidationConditions,
    _tier: tier,
    _inferred_fields: inferredFields,
    _extraction_log: extractionLog,
  };

  // ── 11. Derive snapshot (SnapshotDeriver — W1.6 §3) ───────────────────────
  const snapshot = deriveSnapshot(decisionObject, deliverable, previousSnapshot, turnIndex);

  // ── 12. Compute health metrics ─────────────────────────────────────────────
  _sessionHealth.turns_llm_success += tier !== "FALLBACK" ? 1 : 0;
  if (tier === "PARTIAL_SUCCESS") {
    _sessionHealth.partial_success_streak += 1;
  } else if (tier === "FULL_SUCCESS") {
    _sessionHealth.partial_success_streak = 0;
  }

  const totalFields = extractionLog.length;
  const freshFields = extractionLog.filter(e => e.source === "LLM").length;
  const health: W1HealthMetrics = {
    llm_hit_rate: _sessionHealth.turns_attempted > 0
      ? _sessionHealth.turns_llm_success / _sessionHealth.turns_attempted
      : 1.0,
    field_freshness_ratio: totalFields > 0 ? freshFields / totalFields : 1.0,
    partial_success_streak: _sessionHealth.partial_success_streak,
    deferred_queue_depth: 0, // placeholder until queue system implemented
    inference_field_count: inferredFields.length,
    _tier: tier,
    _turn: turnIndex,
  };

  // Emit W1_HEALTH log
  console.log("[W1_HEALTH]", JSON.stringify({
    llm_hit_rate: +health.llm_hit_rate.toFixed(2),
    field_freshness_ratio: +health.field_freshness_ratio.toFixed(2),
    partial_success_streak: health.partial_success_streak,
    deferred_queue_depth: health.deferred_queue_depth,
    inference_field_count: health.inference_field_count,
    tier: tier,
    turn: turnIndex,
  }));

  return { decision_object: decisionObject, snapshot, health };
}

// ── SnapshotDeriver (W1.6 §3 minimal) ────────────────────────────────────────

function deriveSnapshot(
  obj: DecisionObject,
  deliverable: FinalOutputSchema,
  previous: DecisionSnapshot | null,
  turnIndex: number
): DecisionSnapshot {
  // current_bias.summary: confidence_reason truncated to 30 chars
  const summary = obj.confidence_reason.slice(0, 30);

  // why: strongest BULL argument
  const bullArgs = obj.key_arguments.filter(a => a.direction === "BULL");
  const bestBull = bullArgs[0]?.argument ?? "暂无多方论据";

  // key_risk: top_bear_argument or first invalidation_condition
  let keyRisk: DecisionSnapshot["key_risk"];
  if (obj.top_bear_argument) {
    keyRisk = { risk: obj.top_bear_argument, source: "BEAR_ARGUMENT" };
  } else if (obj.invalidation_conditions.length > 0) {
    keyRisk = { risk: obj.invalidation_conditions[0].condition, source: "INVALIDATION_CONDITION" };
  } else {
    keyRisk = { risk: "暂无已识别风险", source: "BEAR_ARGUMENT" };
  }

  // next_step: from action_readiness
  const nextStep = mapReadinessToNextStep(obj.action_readiness, deliverable.next_steps ?? []);

  // stability: compare with previous snapshot
  // Priority: REVERSED > CHANGED (confidence) > CHANGED (text) > STABLE
  let stability: SnapshotStability = "STABLE";
  if (previous) {
    if (previous.current_bias.direction !== obj.stance) {
      // 1. Direction change → REVERSED (highest priority)
      stability = "REVERSED";
    } else if (
      previous.current_bias.confidence !== obj.confidence ||
      previous.current_bias.summary !== summary ||
      previous.why.argument !== bestBull
    ) {
      // 2. Same direction but: confidence changed (semantic signal)
      //    OR summary changed OR why.argument changed → CHANGED
      stability = "CHANGED";
    }
    // 3. Otherwise → STABLE (no change detected)
  }

  return {
    current_bias: {
      direction: obj.stance,
      summary,
      confidence: obj.confidence,
    },
    why: {
      argument: bestBull,
      direction: "BULL",
    },
    key_risk: keyRisk,
    next_step: nextStep,
    _meta: {
      generated_at: Date.now(),
      based_on_turn: turnIndex,
      stability,
      is_stale: false,
      horizon: deliverable.horizon ?? "mid-term",
    },
  };
}

// ── Phase 1B: Freshness Gate ─────────────────────────────────────────────────

/**
 * Safe reader: extract key_arguments array from an unknown prevDecisionObject.
 * Returns empty array if the value is absent or not an array.
 */
function readPrevKeyArguments(prevDecisionObject: unknown): KeyArgument[] {
  if (
    prevDecisionObject !== null &&
    typeof prevDecisionObject === "object" &&
    Array.isArray((prevDecisionObject as Record<string, unknown>).key_arguments)
  ) {
    return (prevDecisionObject as Record<string, unknown>).key_arguments as KeyArgument[];
  }
  return [];
}

/**
 * applyFreshnessGate
 *
 * Compares the two target fields (stance summary / key_arguments) against the
 * previous turn's values and decides FRESH_UPDATE vs REUSE for each.
 *
 * Rules:
 *   stance      — compare current_bias.direction; REUSE → keep entire prevSnapshot.current_bias
 *   key_arguments — compare first argument text (trimmed); REUSE → keep entire prev array
 *
 * Writes field_freshness into snapshot._meta.
 * Does NOT touch: is_stale, stability, w1Health, or any other field.
 * Called ONLY on FULL_SUCCESS / PARTIAL_SUCCESS paths; never on FALLBACK.
 */
export function applyFreshnessGate(
  adapterResult: AdapterResult,
  prevSnapshot: DecisionSnapshot | null,
  prevDecisionObject: unknown
): AdapterResult {
  // ── 1. Determine freshness for each field ─────────────────────────────────
  let stanceFreshness: "FRESH_UPDATE" | "REUSE" = "FRESH_UPDATE";
  let keyArgsFreshness: "FRESH_UPDATE" | "REUSE" = "FRESH_UPDATE";

  if (prevSnapshot !== null) {
    // stance: compare direction
    if (adapterResult.snapshot.current_bias.direction === prevSnapshot.current_bias.direction) {
      stanceFreshness = "REUSE";
    }

    // key_arguments: compare first argument text (trim + empty fallback)
    const currFirst = (adapterResult.decision_object.key_arguments[0]?.argument ?? "").trim();
    const prevKeyArgs = readPrevKeyArguments(prevDecisionObject);
    const prevFirst = (prevKeyArgs[0]?.argument ?? "").trim();
    if (currFirst !== "" && prevFirst !== "" && currFirst === prevFirst) {
      keyArgsFreshness = "REUSE";
    }
  }

  // ── 2. Build gated decision_object ───────────────────────────────────────
  const gatedDecisionObject: DecisionObject = {
    ...adapterResult.decision_object,
    key_arguments:
      keyArgsFreshness === "REUSE"
        ? readPrevKeyArguments(prevDecisionObject)
        : adapterResult.decision_object.key_arguments,
  };

  // ── 3. Build gated snapshot ───────────────────────────────────────────────
  const gatedCurrentBias =
    stanceFreshness === "REUSE" && prevSnapshot !== null
      ? prevSnapshot.current_bias
      : adapterResult.snapshot.current_bias;

  const gatedSnapshot: DecisionSnapshot = {
    ...adapterResult.snapshot,
    current_bias: gatedCurrentBias,
    _meta: {
      ...adapterResult.snapshot._meta,
      field_freshness: {
        stance: stanceFreshness,
        key_arguments: keyArgsFreshness,
      },
    },
  };

  // ── 4. Emit diagnostic log ────────────────────────────────────────────────
  console.log("[Phase1B_GATE]", JSON.stringify({
    stance: stanceFreshness,
    key_arguments: keyArgsFreshness,
    has_prev: prevSnapshot !== null,
  }));

  return {
    decision_object: gatedDecisionObject,
    snapshot: gatedSnapshot,
    health: adapterResult.health,
  };
}

function _updateHealthOnFallback() {
  _sessionHealth.partial_success_streak += 1;
  const health: W1HealthMetrics = {
    llm_hit_rate: _sessionHealth.turns_attempted > 0
      ? _sessionHealth.turns_llm_success / _sessionHealth.turns_attempted
      : 0,
    field_freshness_ratio: 0,
    partial_success_streak: _sessionHealth.partial_success_streak,
    deferred_queue_depth: 0,
    inference_field_count: 0,
    _tier: "FALLBACK",
    _turn: _sessionHealth.current_turn,
  };
  console.log("[W1_HEALTH] FALLBACK", JSON.stringify({
    llm_hit_rate: +health.llm_hit_rate.toFixed(2),
    partial_success_streak: health.partial_success_streak,
    tier: "FALLBACK",
  }));
}
