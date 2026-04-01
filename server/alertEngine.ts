/**
 * alertEngine.ts — DanTree Level 17.0-B
 *
 * Alert Engine Phase 1 — Backend Evaluation Layer
 *
 * Scope (Phase 1 only):
 *   - 5 alert types: gate_downgrade, evidence_weakening, fragility_spike,
 *     source_deterioration, basket_concentration_warning
 *   - Pure functions, no side effects
 *   - No DB calls, no LLM calls, no scheduler, no delivery
 *   - Ephemeral evaluation from existing result objects
 *
 * NOT in Phase 1:
 *   - Direction-flip alerts (deferred: OI-L15-003)
 *   - Comparison alerts (deferred: Phase 2)
 *   - Persistence, push/email delivery, watchlist trigger extension
 *   - UI / scheduler
 */

import type {
  SourceSelectionResult,
  SourceHealth,
} from "./sourceSelectionEngine";

import type {
  PortfolioAnalysisResult,
} from "./portfolioAnalysisEngine";

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOCAL ALERT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AlertType =
  | "gate_downgrade"
  | "evidence_weakening"
  | "fragility_spike"
  | "source_deterioration"
  | "basket_concentration_warning";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export type AlertScope = "entity" | "basket";

// ─────────────────────────────────────────────────────────────────────────────
// 2. ALERT RESULT & SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertResult {
  alert_type: AlertType;
  severity: AlertSeverity;
  scope: AlertScope;
  /** Present for entity-scoped alerts */
  entity?: string;
  /** Present for basket-scoped alerts */
  basket_entities?: string[];
  message: string;
  reason: string;
  triggered_at: string;
  advisory_only: true;
}

export interface AlertSummary {
  alerts: AlertResult[];
  alert_count: number;
  /** null when no alerts */
  highest_severity: AlertSeverity | null;
  summary_text: string;
  advisory_only: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ENTITY-LEVEL INPUT TYPES (Phase 1 minimal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EntityGateResult — gate evaluation result for a single entity.
 *
 * gate_passed: false triggers gate_downgrade alert.
 * is_synthetic_fallback: true skips gate alert (Phase 1 guard against false positives).
 * evidence_score: triggers evidence_weakening if < 40.
 * semantic_fragility: triggers fragility_spike if > 0.65.
 */
export interface EntityGateResult {
  entity: string;
  gate_passed: boolean;
  /** True when result is a synthetic/fallback placeholder — skip gate alert */
  is_synthetic_fallback?: boolean;
  /** Evidence score [0–100]; null if unavailable */
  evidence_score?: number | null;
  /** Semantic fragility [0–1]; null if unavailable */
  semantic_fragility?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. THRESHOLDS
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLD_EVIDENCE_WEAKENING = 40;
const THRESHOLD_FRAGILITY_SPIKE = 0.65;
const DEGRADED_HEALTH_STATES: SourceHealth[] = ["degraded", "error"];

// ─────────────────────────────────────────────────────────────────────────────
// 5. SEVERITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: AlertSeverity[] = ["low", "medium", "high", "critical"];

function maxSeverity(a: AlertSeverity, b: AlertSeverity): AlertSeverity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function highestSeverityFrom(alerts: AlertResult[]): AlertSeverity | null {
  if (alerts.length === 0) return null;
  return alerts.reduce<AlertSeverity>(
    (max, alert) => maxSeverity(max, alert.severity),
    "low"
  );
}

function now(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ENTITY ALERT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildGateDowngradeAlert — fires when gate_passed === false.
 *
 * Skips alert when is_synthetic_fallback === true to avoid false positives
 * from entities with no real data.
 */
function buildGateDowngradeAlert(
  gateResult: EntityGateResult
): AlertResult | null {
  if (gateResult.is_synthetic_fallback === true) return null;
  if (gateResult.gate_passed) return null;

  return {
    alert_type: "gate_downgrade",
    severity: "high",
    scope: "entity",
    entity: gateResult.entity,
    message: `Gate BLOCK: ${gateResult.entity} failed output gate evaluation.`,
    reason: "gate_passed=false; entity did not meet minimum evidence threshold for output.",
    triggered_at: now(),
    advisory_only: true,
  };
}

/**
 * buildEvidenceWeakeningAlert — fires when evidence_score < 40.
 */
function buildEvidenceWeakeningAlert(
  gateResult: EntityGateResult
): AlertResult | null {
  const score = gateResult.evidence_score;
  if (score == null) return null;
  if (score >= THRESHOLD_EVIDENCE_WEAKENING) return null;

  const severity: AlertSeverity = score < 20 ? "critical" : score < 30 ? "high" : "medium";

  return {
    alert_type: "evidence_weakening",
    severity,
    scope: "entity",
    entity: gateResult.entity,
    message: `Evidence weakening: ${gateResult.entity} evidence score is ${score.toFixed(0)} (threshold: ${THRESHOLD_EVIDENCE_WEAKENING}).`,
    reason: `evidence_score=${score.toFixed(1)} < ${THRESHOLD_EVIDENCE_WEAKENING}; data quality insufficient for reliable analysis.`,
    triggered_at: now(),
    advisory_only: true,
  };
}

/**
 * buildFragilitySpikeAlert — fires when semantic_fragility > 0.65.
 */
function buildFragilitySpikeAlert(
  gateResult: EntityGateResult
): AlertResult | null {
  const fragility = gateResult.semantic_fragility;
  if (fragility == null) return null;
  if (fragility <= THRESHOLD_FRAGILITY_SPIKE) return null;

  const severity: AlertSeverity =
    fragility > 0.85 ? "critical" : fragility > 0.75 ? "high" : "medium";

  return {
    alert_type: "fragility_spike",
    severity,
    scope: "entity",
    entity: gateResult.entity,
    message: `Fragility spike: ${gateResult.entity} semantic fragility is ${fragility.toFixed(2)} (threshold: ${THRESHOLD_FRAGILITY_SPIKE}).`,
    reason: `semantic_fragility=${fragility.toFixed(2)} > ${THRESHOLD_FRAGILITY_SPIKE}; confidence may collapse under new information.`,
    triggered_at: now(),
    advisory_only: true,
  };
}

/**
 * buildSourceDeteriorationAlerts — fires for each route with degraded/error health.
 */
function buildSourceDeteriorationAlerts(
  sourceResult: SourceSelectionResult,
  entity: string
): AlertResult[] {
  const alerts: AlertResult[] = [];

  for (const route of sourceResult.route_results) {
    if (DEGRADED_HEALTH_STATES.includes(route.health)) {
      const severity: AlertSeverity = route.health === "error" ? "high" : "medium";
      alerts.push({
        alert_type: "source_deterioration",
        severity,
        scope: "entity",
        entity,
        message: `Source deterioration: ${route.primary} (field: ${route.field}) is ${route.health} for ${entity}.`,
        reason: `route_results[${route.field}].health="${route.health}"; data source may be unreliable.`,
        triggered_at: now(),
        advisory_only: true,
      });
    }
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. BASKET ALERT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildBasketConcentrationAlert — fires when concentration_risk.value.level is "high".
 *
 * Note: portfolioAnalysisEngine.ts ConcentrationRiskResult.level is
 * "low" | "moderate" | "high" (no "very_high" in current implementation).
 */
function buildBasketConcentrationAlert(
  portfolioResult: PortfolioAnalysisResult
): AlertResult | null {
  const level = portfolioResult.concentration_risk.value.level;
  if (level !== "high") return null;

  const hhi = portfolioResult.concentration_risk.value.hhi_score;
  const dominant = portfolioResult.concentration_risk.value.dominant_entity;
  const severity: AlertSeverity = hhi > 0.6 ? "critical" : "high";

  return {
    alert_type: "basket_concentration_warning",
    severity,
    scope: "basket",
    basket_entities: portfolioResult.entities,
    message: `Basket concentration warning: concentration level is "${level}" (HHI=${hhi}).${dominant ? ` Dominant entity: ${dominant}.` : ""}`,
    reason: `concentration_risk.level="${level}"; HHI=${hhi}; portfolio may be over-exposed to a single entity's risk.`,
    triggered_at: now(),
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. MAIN EXPORTED FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildEntityAlerts — evaluate all entity-scoped Phase 1 alerts.
 *
 * Alert types covered:
 *   - gate_downgrade (from gateResult)
 *   - evidence_weakening (from gateResult.evidence_score)
 *   - fragility_spike (from gateResult.semantic_fragility)
 *   - source_deterioration (from sourceResult.route_results)
 *
 * @param gateResult   Gate + evidence + fragility data for the entity
 * @param sourceResult Source selection result (may be null if unavailable)
 * @param entity       Entity identifier (ticker or name)
 */
export function buildEntityAlerts(
  gateResult: EntityGateResult | null,
  sourceResult: SourceSelectionResult | null,
  entity: string
): AlertResult[] {
  const alerts: AlertResult[] = [];

  if (gateResult) {
    const gateAlert = buildGateDowngradeAlert(gateResult);
    if (gateAlert) alerts.push(gateAlert);

    const evidenceAlert = buildEvidenceWeakeningAlert(gateResult);
    if (evidenceAlert) alerts.push(evidenceAlert);

    const fragilityAlert = buildFragilitySpikeAlert(gateResult);
    if (fragilityAlert) alerts.push(fragilityAlert);
  }

  if (sourceResult) {
    const sourceAlerts = buildSourceDeteriorationAlerts(sourceResult, entity);
    alerts.push(...sourceAlerts);
  }

  return alerts;
}

/**
 * buildBasketAlerts — evaluate all basket-scoped Phase 1 alerts.
 *
 * Alert types covered:
 *   - basket_concentration_warning (from portfolioResult.concentration_risk)
 *
 * @param portfolioResult Portfolio analysis result from portfolioAnalysisEngine
 */
export function buildBasketAlerts(
  portfolioResult: PortfolioAnalysisResult | null
): AlertResult[] {
  if (!portfolioResult) return [];

  const alerts: AlertResult[] = [];

  const concentrationAlert = buildBasketConcentrationAlert(portfolioResult);
  if (concentrationAlert) alerts.push(concentrationAlert);

  return alerts;
}

/**
 * buildAlertSummary — aggregate AlertResult[] into AlertSummary.
 *
 * @param alerts Array of AlertResult (may be empty)
 */
export function buildAlertSummary(alerts: AlertResult[]): AlertSummary {
  const alertCount = alerts.length;
  const highestSeverity = highestSeverityFrom(alerts);

  let summaryText: string;
  if (alertCount === 0) {
    summaryText = "No alerts triggered. All monitored conditions within normal parameters.";
  } else {
    const severityCounts: Partial<Record<AlertSeverity, number>> = {};
    for (const alert of alerts) {
      severityCounts[alert.severity] = (severityCounts[alert.severity] ?? 0) + 1;
    }
    const severitySummary = (["critical", "high", "medium", "low"] as AlertSeverity[])
      .filter((s) => severityCounts[s])
      .map((s) => `${severityCounts[s]} ${s}`)
      .join(", ");

    const typeSet = new Set(alerts.map((a) => a.alert_type));
    const types = Array.from(typeSet).join(", ");

    summaryText =
      `${alertCount} alert${alertCount > 1 ? "s" : ""} triggered` +
      ` [${severitySummary}]. Types: ${types}.` +
      ` Highest severity: ${highestSeverity}.` +
      ` Advisory only — review recommended.`;
  }

  return {
    alerts,
    alert_count: alertCount,
    highest_severity: highestSeverity,
    summary_text: summaryText,
    advisory_only: true,
  };
}
