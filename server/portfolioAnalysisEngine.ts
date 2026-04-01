/**
 * portfolioAnalysisEngine.ts — DanTree Level 16.0-B
 *
 * Portfolio-Level Analysis Phase 1 — Backend Result Layer
 *
 * Scope (Phase 1 only):
 *   - Basket analysis for 2–8 entities
 *   - 5 portfolio dimensions: thesis_overlap, concentration_risk,
 *     shared_fragility, evidence_dispersion, gate_distribution
 *   - Pure in-memory aggregation, no schema changes
 *   - Tolerates missing/unavailable semantic state gracefully
 *
 * NOT in scope for Phase 1:
 *   - UI, alerts, rebalancing, execution, weights, PnL, persistence
 *   - tRPC route (added by Manus in integration step)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. INPUT
// ─────────────────────────────────────────────────────────────────────────────

export interface BasketAnalysisInput {
  /** Validated 2–8 entities (tickers or asset names) */
  entities: string[];
  taskType?: "portfolio_review";
  region?: "US";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOCAL TYPES — narrow, local to this task
// ─────────────────────────────────────────────────────────────────────────────

/** Direction bucket used for thesis overlap grouping */
export type DirectionBucket =
  | "positive"
  | "negative"
  | "mixed"
  | "neutral"
  | "unclear"
  | "unavailable";

/** Gate decision for a single entity in the basket */
export type EntityGateDecision = "PASS" | "BLOCK" | "UNAVAILABLE";

/**
 * BasketEntitySnapshot — per-entity summary within a portfolio basket.
 *
 * Evidence score and semantic state may be unavailable (Phase 1 tolerance).
 * All numeric fields fall back to null when not available.
 */
export interface BasketEntitySnapshot {
  entity: string;
  /** Direction from semantic state, or "unavailable" if not computed */
  direction: DirectionBucket;
  /** Confidence score [0–1], null if unavailable */
  confidence_score: number | null;
  /** Confidence fragility [0–1], null if unavailable */
  fragility: number | null;
  /** Evidence score [0–100], null if unavailable */
  evidence_score: number | null;
  /** Gate decision derived from evidence_score */
  gate_decision: EntityGateDecision;
  /** Whether semantic state was available for this entity */
  semantic_available: boolean;
}

/** Single portfolio dimension result */
export interface PortfolioAnalysisDimension<T> {
  value: T;
  label: string;
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DIMENSION SHAPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ThesisOverlapResult {
  /** Dominant direction bucket across the basket */
  dominant_direction: DirectionBucket;
  /** How many entities share the dominant direction */
  overlap_count: number;
  /** Total entities in basket */
  basket_size: number;
  /** Fraction sharing dominant direction [0–1] */
  overlap_ratio: number;
  /** Per-direction entity counts */
  direction_distribution: Record<DirectionBucket, number>;
}

export interface ConcentrationRiskResult {
  /**
   * Herfindahl-Hirschman Index (HHI) normalized to [0–1].
   * Derived from evidence_score distribution as proxy for position weight.
   * 1.0 = maximum concentration (single entity dominates), 0 = perfectly equal.
   */
  hhi_score: number;
  /** Human-readable concentration level */
  level: "low" | "moderate" | "high";
  /** Entity with highest evidence_score (proxy for largest position) */
  dominant_entity: string | null;
}

export interface SharedFragilityResult {
  /** Average confidence_fragility across basket [0–1] */
  avg_fragility: number;
  /** Whether average fragility exceeds 0.6 (flagged as portfolio-level concern) */
  fragility_flag: boolean;
  /** Number of entities with fragility > 0.6 */
  high_fragility_count: number;
}

export interface EvidenceDispersionResult {
  /** Standard deviation of evidence_score across basket */
  std_dev: number;
  /** Min evidence_score in basket (null if all unavailable) */
  min_score: number | null;
  /** Max evidence_score in basket (null if all unavailable) */
  max_score: number | null;
  /** Mean evidence_score in basket (null if all unavailable) */
  mean_score: number | null;
  /** Number of entities with available evidence scores */
  scored_entity_count: number;
}

export interface GateDistributionResult {
  pass_count: number;
  block_count: number;
  unavailable_count: number;
  /** Basket is "investable" only if majority (> 50%) of entities PASS */
  basket_investable: boolean;
  /** Entity-level gate decisions */
  entity_gates: Record<string, EntityGateDecision>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RESULT
// ─────────────────────────────────────────────────────────────────────────────

export interface PortfolioAnalysisResult {
  entities: string[];
  basket_size: number;
  generated_at: string;
  advisory_only: true;
  /** Per-entity snapshots */
  entity_snapshots: BasketEntitySnapshot[];
  /** Dimension 1: thesis overlap */
  thesis_overlap: PortfolioAnalysisDimension<ThesisOverlapResult>;
  /** Dimension 2: concentration risk */
  concentration_risk: PortfolioAnalysisDimension<ConcentrationRiskResult>;
  /** Dimension 3: shared fragility */
  shared_fragility: PortfolioAnalysisDimension<SharedFragilityResult>;
  /** Dimension 4: evidence dispersion */
  evidence_dispersion: PortfolioAnalysisDimension<EvidenceDispersionResult>;
  /** Dimension 5: gate distribution */
  gate_distribution: PortfolioAnalysisDimension<GateDistributionResult>;
  /** Human-readable basket summary (advisory) */
  basket_summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. BASKET VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const BASKET_MIN = 2;
const BASKET_MAX = 8;

export class BasketValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BasketValidationError";
  }
}

export function validateBasket(entities: string[]): void {
  if (!Array.isArray(entities)) {
    throw new BasketValidationError("entities must be an array");
  }
  if (entities.length < BASKET_MIN) {
    throw new BasketValidationError(
      `Portfolio basket requires at least ${BASKET_MIN} entities, got ${entities.length}`
    );
  }
  if (entities.length > BASKET_MAX) {
    throw new BasketValidationError(
      `Portfolio basket supports at most ${BASKET_MAX} entities, got ${entities.length}`
    );
  }
  const nonStrings = entities.filter((e) => typeof e !== "string" || e.trim().length === 0);
  if (nonStrings.length > 0) {
    throw new BasketValidationError("All entities must be non-empty strings");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SNAPSHOT BUILDER (Phase 1 — fallback-safe)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EntitySnapshotInput — optional per-entity data for Phase 1.
 *
 * All fields are optional. Phase 1 must tolerate complete absence of data.
 * In Manus integration, these can be populated from semantic_aggregator /
 * buildSemanticEngineStatsDisplay results.
 */
export interface EntitySnapshotInput {
  entity: string;
  direction?: DirectionBucket;
  confidence_score?: number | null;
  fragility?: number | null;
  evidence_score?: number | null;
}

function buildEntitySnapshot(input: EntitySnapshotInput): BasketEntitySnapshot {
  const direction: DirectionBucket = input.direction ?? "unavailable";
  const confidence_score = input.confidence_score ?? null;
  const fragility = input.fragility ?? null;
  const evidence_score = input.evidence_score ?? null;
  const semantic_available =
    direction !== "unavailable" || confidence_score !== null || fragility !== null;

  // Gate: PASS if evidence_score >= 50, BLOCK if < 50, UNAVAILABLE if null
  let gate_decision: EntityGateDecision = "UNAVAILABLE";
  if (evidence_score !== null) {
    gate_decision = evidence_score >= 50 ? "PASS" : "BLOCK";
  }

  return {
    entity: input.entity,
    direction,
    confidence_score,
    fragility,
    evidence_score,
    gate_decision,
    semantic_available,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. DIMENSION ENGINES
// ─────────────────────────────────────────────────────────────────────────────

function computeThesisOverlap(snapshots: BasketEntitySnapshot[]): ThesisOverlapResult {
  const distribution: Record<DirectionBucket, number> = {
    positive: 0,
    negative: 0,
    mixed: 0,
    neutral: 0,
    unclear: 0,
    unavailable: 0,
  };

  for (const snap of snapshots) {
    distribution[snap.direction]++;
  }

  // Find dominant direction (highest count, excluding "unavailable")
  const buckets: DirectionBucket[] = ["positive", "negative", "mixed", "neutral", "unclear"];
  let dominant: DirectionBucket = "unavailable";
  let maxCount = 0;

  for (const bucket of buckets) {
    if (distribution[bucket] > maxCount) {
      maxCount = distribution[bucket];
      dominant = bucket;
    }
  }

  const overlapCount = maxCount;
  const overlapRatio = snapshots.length > 0 ? overlapCount / snapshots.length : 0;

  return {
    dominant_direction: dominant,
    overlap_count: overlapCount,
    basket_size: snapshots.length,
    overlap_ratio: overlapRatio,
    direction_distribution: distribution,
  };
}

function computeConcentrationRisk(snapshots: BasketEntitySnapshot[]): ConcentrationRiskResult {
  // Use evidence_score as proxy for position weight (Phase 1 approximation)
  const scores = snapshots.map((s) => (s.evidence_score !== null ? s.evidence_score : 50));
  const total = scores.reduce((a, b) => a + b, 0);

  if (total === 0) {
    return { hhi_score: 0, level: "low", dominant_entity: null };
  }

  // HHI = sum of squared market shares
  const shares = scores.map((s) => s / total);
  const hhi = shares.reduce((sum, share) => sum + share * share, 0);

  // Normalize: pure monopoly (1/n) for n entities → 1/n HHI, maximum = 1
  const level: "low" | "moderate" | "high" =
    hhi >= 0.5 ? "high" : hhi >= 0.3 ? "moderate" : "low";

  const maxIdx = scores.indexOf(Math.max(...scores));
  const dominantEntity = maxIdx >= 0 ? snapshots[maxIdx].entity : null;

  return { hhi_score: Math.round(hhi * 1000) / 1000, level, dominant_entity: dominantEntity };
}

function computeSharedFragility(snapshots: BasketEntitySnapshot[]): SharedFragilityResult {
  const fragilityValues = snapshots
    .map((s) => s.fragility)
    .filter((f): f is number => f !== null);

  if (fragilityValues.length === 0) {
    return { avg_fragility: 0, fragility_flag: false, high_fragility_count: 0 };
  }

  const avgFragility =
    fragilityValues.reduce((a, b) => a + b, 0) / fragilityValues.length;

  const highFragilityCount = fragilityValues.filter((f) => f > 0.6).length;
  const fragilityFlag = avgFragility > 0.6;

  return {
    avg_fragility: Math.round(avgFragility * 1000) / 1000,
    fragility_flag: fragilityFlag,
    high_fragility_count: highFragilityCount,
  };
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeEvidenceDispersion(snapshots: BasketEntitySnapshot[]): EvidenceDispersionResult {
  const scores = snapshots
    .map((s) => s.evidence_score)
    .filter((s): s is number => s !== null);

  if (scores.length === 0) {
    return {
      std_dev: 0,
      min_score: null,
      max_score: null,
      mean_score: null,
      scored_entity_count: 0,
    };
  }

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

  return {
    std_dev: Math.round(stdDev(scores) * 100) / 100,
    min_score: Math.min(...scores),
    max_score: Math.max(...scores),
    mean_score: Math.round(mean * 100) / 100,
    scored_entity_count: scores.length,
  };
}

function computeGateDistribution(snapshots: BasketEntitySnapshot[]): GateDistributionResult {
  let passCount = 0;
  let blockCount = 0;
  let unavailableCount = 0;
  const entityGates: Record<string, EntityGateDecision> = {};

  for (const snap of snapshots) {
    entityGates[snap.entity] = snap.gate_decision;
    if (snap.gate_decision === "PASS") passCount++;
    else if (snap.gate_decision === "BLOCK") blockCount++;
    else unavailableCount++;
  }

  const basketInvestable = passCount > snapshots.length / 2;

  return {
    pass_count: passCount,
    block_count: blockCount,
    unavailable_count: unavailableCount,
    basket_investable: basketInvestable,
    entity_gates: entityGates,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. BASKET SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

function buildBasketSummary(
  entities: string[],
  overlap: ThesisOverlapResult,
  concentration: ConcentrationRiskResult,
  fragility: SharedFragilityResult,
  dispersion: EvidenceDispersionResult,
  gate: GateDistributionResult
): string {
  const entityList = entities.join(", ");
  const directionNote =
    overlap.overlap_ratio >= 0.75
      ? `strongly aligned on ${overlap.dominant_direction} direction`
      : overlap.overlap_ratio >= 0.5
        ? `moderately aligned on ${overlap.dominant_direction} direction`
        : `mixed directional signals across basket`;

  const concentrationNote =
    concentration.level === "high"
      ? `High concentration risk (HHI=${concentration.hhi_score})`
      : concentration.level === "moderate"
        ? `Moderate concentration (HHI=${concentration.hhi_score})`
        : `Low concentration (HHI=${concentration.hhi_score})`;

  const fragilityNote = fragility.fragility_flag
    ? `Portfolio fragility elevated (avg=${fragility.avg_fragility}, ${fragility.high_fragility_count} high-fragility entities)`
    : `Portfolio fragility acceptable (avg=${fragility.avg_fragility})`;

  const gateNote = gate.basket_investable
    ? `Basket passes gate (${gate.pass_count}/${entities.length} entities PASS)`
    : `Basket blocked (${gate.block_count}/${entities.length} entities BLOCK)`;

  return (
    `[Portfolio Analysis | ${entities.length} entities: ${entityList}] ` +
    `Thesis: ${directionNote}. ` +
    `${concentrationNote}. ` +
    `${fragilityNote}. ` +
    `${gateNote}. ` +
    `Advisory only — not a recommendation.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. MAIN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * analyzePortfolioBasket — Phase 1 basket analysis engine.
 *
 * Accepts optional per-entity snapshot inputs.
 * Missing/null inputs are tolerated with safe fallback values.
 * Does NOT call any external API or database.
 *
 * @param input    BasketAnalysisInput (entities validated 2..8)
 * @param snapshots Optional per-entity data (direction, scores, fragility)
 * @returns PortfolioAnalysisResult with all 5 dimensions
 */
export function analyzePortfolioBasket(
  input: BasketAnalysisInput,
  snapshots?: EntitySnapshotInput[]
): PortfolioAnalysisResult {
  validateBasket(input.entities);

  // Deduplicate entities (preserve order, keep first occurrence)
  const seen = new Set<string>();
  const uniqueEntities: string[] = [];
  for (const e of input.entities) {
    const key = e.trim().toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEntities.push(e.trim());
    }
  }

  // Build entity snapshots — merge provided data or use fallback
  const snapshotMap = new Map<string, EntitySnapshotInput>();
  if (snapshots) {
    for (const s of snapshots) {
      snapshotMap.set(s.entity.trim().toUpperCase(), s);
    }
  }

  const entitySnapshots: BasketEntitySnapshot[] = uniqueEntities.map((entity) => {
    const provided = snapshotMap.get(entity.toUpperCase());
    return buildEntitySnapshot(provided ?? { entity });
  });

  // Compute all 5 dimensions
  const overlapValue = computeThesisOverlap(entitySnapshots);
  const concentrationValue = computeConcentrationRisk(entitySnapshots);
  const fragilityValue = computeSharedFragility(entitySnapshots);
  const dispersionValue = computeEvidenceDispersion(entitySnapshots);
  const gateValue = computeGateDistribution(entitySnapshots);

  const summary = buildBasketSummary(
    uniqueEntities,
    overlapValue,
    concentrationValue,
    fragilityValue,
    dispersionValue,
    gateValue
  );

  return {
    entities: uniqueEntities,
    basket_size: uniqueEntities.length,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    entity_snapshots: entitySnapshots,
    thesis_overlap: { value: overlapValue, label: "thesis_overlap", advisory_only: true },
    concentration_risk: { value: concentrationValue, label: "concentration_risk", advisory_only: true },
    shared_fragility: { value: fragilityValue, label: "shared_fragility", advisory_only: true },
    evidence_dispersion: { value: dispersionValue, label: "evidence_dispersion", advisory_only: true },
    gate_distribution: { value: gateValue, label: "gate_distribution", advisory_only: true },
    basket_summary: summary,
  };
}
