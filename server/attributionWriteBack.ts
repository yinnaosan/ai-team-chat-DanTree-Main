/**
 * DANTREE LEVEL9.1 — Attribution Write-Back Module
 *
 * Module 1: buildAttributionMap — extracts structured attribution from
 *           already-computed LEVEL9 module outputs (NO recomputation).
 * Module 4: validateAttributionWrite — verifies DB fields match pipeline output.
 *
 * HARD RULES:
 * - NO decision logic changes
 * - NO recomputation of any scores
 * - ONLY extract from existing outputs
 * - advisory_only: always true
 * - All fields nullable (backward compat)
 */

import type { InvestorThinkingOutput } from "./investorThinkingLayer";
import type { RegimeOutput } from "./regimeEngine";
import type { FactorInteractionOutput } from "./factorInteractionEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StructuredAttribution {
  /** [0, 1] — from InvestorThinkingOutput.business_quality.business_quality_score */
  business_quality_score: number | null;
  /** "wide" | "narrow" | "none" — bucketed from business_quality.moat_strength */
  moat_strength: string | null;
  /** Event type string — from signal context (e.g. "earnings", "macro", "none") */
  event_type: string | null;
  /** [0, 1] — event severity proxy */
  event_severity: number | null;
  /** [0, 1] — adjusted danger score (after factor interaction if available) */
  danger_score: number | null;
  /** [0, 1] — adjusted alpha score */
  alpha_score: number | null;
  /** [0, 1] — adjusted trigger score */
  trigger_score: number | null;
  /** [0, 1] — adjusted memory score */
  memory_score: number | null;
  /** Dominant factor driving the decision */
  dominant_factor: string | null;
  /** Regime tag at decision time */
  regime_tag: string | null;
  /** Falsification tags array */
  falsification_tags_json: string[] | null;
}

/** Attribution map: ticker → StructuredAttribution */
export type AttributionMap = Map<string, StructuredAttribution>;

// ─────────────────────────────────────────────────────────────────────────────
// Module 1: buildAttributionMap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a per-ticker attribution map from already-computed LEVEL9 outputs.
 * NO recomputation — only extraction.
 *
 * @param investorThinkingMap  ticker → InvestorThinkingOutput (from runInvestorThinking)
 * @param regimeOutput         single global regime (applies to all tickers)
 * @param interactionMap       ticker → FactorInteractionOutput (optional, post-interaction scores)
 */
export function buildAttributionMap(
  investorThinkingMap: Map<string, InvestorThinkingOutput>,
  regimeOutput: RegimeOutput | null,
  interactionMap?: Map<string, FactorInteractionOutput>
): AttributionMap {
  const result: AttributionMap = new Map();

  for (const [ticker, thinking] of Array.from(investorThinkingMap.entries())) {
    const interaction = interactionMap?.get(ticker) ?? null;

    // Moat strength: bucket from numeric [0,1] → string
    const moatNum = thinking.business_quality.moat_strength;
    const moatStrength = moatNum >= 0.65 ? "wide" : moatNum >= 0.40 ? "narrow" : "none";

    // Event type: extract from business_flags or event_bias
    const eventBias = thinking.event_adjustment.event_bias;
    const eventType = deriveEventType(eventBias, thinking.business_quality.business_flags);

    // Event severity: proxy from event_adjustment weights deviation from 1.0
    const eventSeverity = deriveEventSeverity(thinking.event_adjustment);

    // Use interaction-adjusted scores if available, else use thinking-adjusted scores
    const alphaScore = interaction?.adjusted_alpha_score ?? thinking.adjusted_alpha_score;
    const dangerScore = interaction?.adjusted_danger_score ?? thinking.adjusted_danger_score;
    const triggerScore = interaction?.adjusted_trigger_score ?? thinking.adjusted_trigger_score;

    // Falsification tags: extract from why_might_be_wrong + key_risk_flags
    const falsificationTags = extractFalsificationTags(thinking);

    const attribution: StructuredAttribution = {
      business_quality_score: roundTo4(thinking.business_quality.business_quality_score),
      moat_strength: moatStrength,
      event_type: eventType,
      event_severity: roundTo4(eventSeverity),
      danger_score: roundTo4(dangerScore),
      alpha_score: roundTo4(alphaScore),
      trigger_score: roundTo4(triggerScore),
      memory_score: roundTo4(thinking.adjusted_memory_score),
      dominant_factor: thinking.dominant_factor,
      regime_tag: regimeOutput?.regime_tag ?? null,
      falsification_tags_json: falsificationTags.length > 0 ? falsificationTags : null,
    };

    result.set(ticker, attribution);
    console.log(
      `[AttributionWrite] Built attribution for ${ticker}: ` +
      `BQ=${attribution.business_quality_score}, moat=${attribution.moat_strength}, ` +
      `regime=${attribution.regime_tag}, dominant=${attribution.dominant_factor}`
    );
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 4: validateAttributionWrite
// ─────────────────────────────────────────────────────────────────────────────

export interface AttributionValidationResult {
  ticker: string;
  attribution_exists: boolean;
  db_fields_populated: boolean;
  values_match: boolean;
  missing_fields: string[];
  mismatch_fields: string[];
  advisory_only: true;
}

/**
 * Validate that a DB decision row matches the pipeline attribution map.
 * Used after persistPipelineRun to verify write-back correctness.
 */
export function validateAttributionWrite(
  ticker: string,
  attributionMap: AttributionMap,
  dbRow: Record<string, unknown>
): AttributionValidationResult {
  const attribution = attributionMap.get(ticker);
  const missingFields: string[] = [];
  const mismatchFields: string[] = [];

  if (!attribution) {
    console.warn(`[AttributionWrite] MISSING attribution for ticker=${ticker}`);
    return {
      ticker,
      attribution_exists: false,
      db_fields_populated: false,
      values_match: false,
      missing_fields: ["all"],
      mismatch_fields: [],
      advisory_only: true,
    };
  }

  // Check each field
  const FIELDS_TO_CHECK: Array<keyof StructuredAttribution> = [
    "business_quality_score",
    "moat_strength",
    "event_type",
    "event_severity",
    "danger_score",
    "alpha_score",
    "trigger_score",
    "memory_score",
    "dominant_factor",
    "regime_tag",
    "falsification_tags_json",
  ];

  let allPopulated = true;
  let allMatch = true;

  for (const field of FIELDS_TO_CHECK) {
    const expected = attribution[field];
    const actual = dbRow[snakeToCamel(field)];

    if (expected !== null && (actual === null || actual === undefined)) {
      missingFields.push(field);
      allPopulated = false;
    } else if (expected !== null && actual !== null) {
      // Numeric comparison with tolerance
      if (typeof expected === "number" && typeof actual === "string") {
        const actualNum = parseFloat(actual as string);
        if (Math.abs(actualNum - expected) > 0.0001) {
          mismatchFields.push(field);
          allMatch = false;
        }
      } else if (field === "falsification_tags_json") {
        // JSON comparison
        const expectedStr = JSON.stringify(expected);
        const actualStr = typeof actual === "string" ? actual : JSON.stringify(actual);
        if (expectedStr !== actualStr) {
          mismatchFields.push(field);
          allMatch = false;
        }
      } else if (expected !== actual) {
        mismatchFields.push(field);
        allMatch = false;
      }
    }
  }

  if (missingFields.length > 0) {
    console.warn(`[AttributionWrite] MISSING fields for ${ticker}: ${missingFields.join(", ")}`);
  }
  if (mismatchFields.length > 0) {
    console.warn(`[AttributionWrite] MISMATCH fields for ${ticker}: ${mismatchFields.join(", ")}`);
  }
  if (allPopulated && allMatch) {
    console.log(`[AttributionWrite] SUCCESS: ${ticker} attribution validated ✓`);
  }

  return {
    ticker,
    attribution_exists: true,
    db_fields_populated: allPopulated,
    values_match: allMatch,
    missing_fields: missingFields,
    mismatch_fields: mismatchFields,
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function deriveEventType(
  eventBias: "bullish" | "bearish" | "neutral" | "volatile",
  businessFlags: string[]
): string {
  // Check flags for specific event types
  const flagStr = businessFlags.join(" ").toLowerCase();
  if (flagStr.includes("earnings")) return "earnings";
  if (flagStr.includes("macro")) return "macro";
  if (flagStr.includes("regulatory")) return "regulatory";
  if (flagStr.includes("tech") || flagStr.includes("disruption")) return "tech_disruption";
  if (flagStr.includes("geopolitical")) return "geopolitical";
  // Fall back to event bias
  if (eventBias === "volatile") return "volatility_event";
  if (eventBias === "bullish") return "positive_catalyst";
  if (eventBias === "bearish") return "negative_catalyst";
  return "none";
}

function deriveEventSeverity(eventAdj: InvestorThinkingOutput["event_adjustment"]): number {
  // Severity = max deviation from 1.0 across all weights
  const deviations = [
    Math.abs(eventAdj.adjusted_alpha_weight - 1.0),
    Math.abs(eventAdj.adjusted_risk_weight - 1.0),
    Math.abs(eventAdj.adjusted_macro_weight - 1.0),
    Math.abs(eventAdj.adjusted_momentum_weight - 1.0),
  ];
  const maxDev = Math.max(...deviations);
  // Normalize: max possible deviation is 1.0 (weight range [0.5, 2.0])
  return Math.min(1.0, maxDev);
}

function extractFalsificationTags(thinking: InvestorThinkingOutput): string[] {
  const tags: string[] = [];
  const { falsification, business_quality } = thinking;

  // Extract compact tags from key_risk_flags
  for (const flag of falsification.key_risk_flags) {
    const tag = compactifyFlag(flag);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }

  // Add business quality flags as tags
  for (const flag of business_quality.business_flags) {
    const tag = compactifyFlag(flag);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }

  // Cap at 8 tags
  return tags.slice(0, 8);
}

function compactifyFlag(flag: string): string | null {
  if (!flag || flag.length < 3) return null;
  // Convert "Valuation is stretched" → "valuation_stretched"
  return flag
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40);
}

/** Convert snake_case to camelCase for DB row field lookup */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
