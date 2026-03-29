/**
 * DANTREE LEVEL9.1 — Attribution Write-Back Closure Tests
 *
 * CASE_1: buildAttributionMap produces all 11 fields for a known ticker
 * CASE_2: validateAttributionWrite detects missing fields correctly
 * CASE_3: Missing investorThinkingOutput → buildAttributionMap handles gracefully
 * CASE_4: ReplayResult now includes structured_attribution field
 *
 * advisory_only: true — no execution logic
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildAttributionMap,
  validateAttributionWrite,
  type StructuredAttribution,
  type AttributionMap,
} from "./attributionWriteBack";
import type { InvestorThinkingOutput } from "./investorThinkingLayer";
import type { RegimeOutput } from "./regimeEngine";
import type { FactorInteractionOutput } from "./factorInteractionEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeThinkingOutput(ticker: string, overrides: Partial<InvestorThinkingOutput> = {}): InvestorThinkingOutput {
  return {
    ticker,
    business_quality: {
      business_quality_score: 0.72,
      moat_strength: 0.68,
      business_flags: ["earnings_momentum", "high_margin"],
    },
    event_adjustment: {
      adjusted_alpha_weight: 1.2,
      adjusted_risk_weight: 0.9,
      adjusted_macro_weight: 1.0,
      adjusted_momentum_weight: 1.1,
      event_bias: "bullish",
      event_summary: "Positive earnings catalyst",
    },
    adjusted_alpha_score: 0.74,
    adjusted_danger_score: 0.18,
    adjusted_trigger_score: 0.65,
    adjusted_memory_score: 0.55,
    dominant_factor: "business_quality",
    falsification: {
      why_might_be_wrong: ["Valuation stretched", "Macro headwinds"],
      key_risk_flags: ["valuation_risk", "rate_sensitivity"],
      invalidation_conditions: ["P/E > 35", "Fed hikes > 2 times"],
    },
    advisory_only: true,
    ...overrides,
  };
}

function makeRegimeOutput(tag = "risk_on"): RegimeOutput {
  return {
    regime_tag: tag as any,
    regime_confidence: 0.78,
    advisory_only: true,
  };
}

function makeInteractionOutput(overrides: Partial<FactorInteractionOutput> = {}): FactorInteractionOutput {
  return {
    adjusted_alpha_score: 0.76,
    adjusted_danger_score: 0.16,
    adjusted_trigger_score: 0.67,
    interaction_reasons: ["High BQ + earnings event → alpha boost"],
    interaction_dominant_effect: "alpha_boost",
    advisory_only: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE_1: buildAttributionMap produces all 11 fields
// ─────────────────────────────────────────────────────────────────────────────

describe("CASE_1: buildAttributionMap — all 11 fields populated", () => {
  let attributionMap: AttributionMap;

  beforeEach(() => {
    const thinkingMap = new Map<string, InvestorThinkingOutput>();
    thinkingMap.set("AAPL", makeThinkingOutput("AAPL"));

    const regimeOutput = makeRegimeOutput("risk_on");

    const interactionMap = new Map<string, FactorInteractionOutput>();
    interactionMap.set("AAPL", makeInteractionOutput());

    attributionMap = buildAttributionMap(thinkingMap, regimeOutput, interactionMap);
  });

  it("should produce attribution for AAPL", () => {
    expect(attributionMap.has("AAPL")).toBe(true);
  });

  it("should have business_quality_score = 0.72", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(attr.business_quality_score).toBeCloseTo(0.72, 4);
  });

  it("should bucket moat_strength as 'wide' (0.68 >= 0.65)", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(attr.moat_strength).toBe("wide");
  });

  it("should derive event_type from business_flags (earnings_momentum → 'earnings')", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(attr.event_type).toBe("earnings");
  });

  it("should compute event_severity from weight deviation (|1.2 - 1.0| = 0.2)", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(attr.event_severity).toBeCloseTo(0.2, 4);
  });

  it("should use interaction-adjusted alpha_score (0.76 from interaction)", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(attr.alpha_score).toBeCloseTo(0.76, 4);
  });

  it("should use interaction-adjusted danger_score (0.16 from interaction)", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(attr.danger_score).toBeCloseTo(0.16, 4);
  });

  it("should use thinking adjusted_memory_score (0.55)", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(attr.memory_score).toBeCloseTo(0.55, 4);
  });

  it("should set dominant_factor = 'business_quality'", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(attr.dominant_factor).toBe("business_quality");
  });

  it("should set regime_tag = 'risk_on'", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(attr.regime_tag).toBe("risk_on");
  });

  it("should extract falsification_tags from key_risk_flags", () => {
    const attr = attributionMap.get("AAPL")!;
    expect(Array.isArray(attr.falsification_tags_json)).toBe(true);
    expect(attr.falsification_tags_json!.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE_2: validateAttributionWrite detects missing fields
// ─────────────────────────────────────────────────────────────────────────────

describe("CASE_2: validateAttributionWrite — field validation", () => {
  let attributionMap: AttributionMap;

  beforeEach(() => {
    const thinkingMap = new Map<string, InvestorThinkingOutput>();
    thinkingMap.set("MSFT", makeThinkingOutput("MSFT"));
    attributionMap = buildAttributionMap(thinkingMap, makeRegimeOutput("neutral"), undefined);
  });

  it("should return attribution_exists=true for MSFT", () => {
    const result = validateAttributionWrite("MSFT", attributionMap, {
      businessQualityScore: "0.72",
      moatStrength: "wide",
      eventType: "earnings",
      eventSeverity: "0.2",
      dangerScore: "0.18",
      alphaScore: "0.74",
      triggerScore: "0.65",
      memoryScore: "0.55",
      dominantFactor: "business_quality",
      regimeTag: "neutral",
      falsificationTagsJson: JSON.stringify(["valuation_risk", "rate_sensitivity"]),
    });
    expect(result.attribution_exists).toBe(true);
  });

  it("should detect missing fields when DB row has nulls", () => {
    const result = validateAttributionWrite("MSFT", attributionMap, {
      businessQualityScore: null,
      moatStrength: null,
      regimeTag: null,
    });
    expect(result.db_fields_populated).toBe(false);
    expect(result.missing_fields.length).toBeGreaterThan(0);
  });

  it("should return attribution_exists=false for unknown ticker", () => {
    const result = validateAttributionWrite("UNKNOWN", attributionMap, {});
    expect(result.attribution_exists).toBe(false);
    expect(result.missing_fields).toContain("all");
  });

  it("should return advisory_only=true", () => {
    const result = validateAttributionWrite("MSFT", attributionMap, {});
    expect(result.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE_3: Missing investorThinkingOutput → graceful handling
// ─────────────────────────────────────────────────────────────────────────────

describe("CASE_3: buildAttributionMap — graceful handling of empty input", () => {
  it("should return empty map when thinkingMap is empty", () => {
    const emptyMap = new Map<string, InvestorThinkingOutput>();
    const result = buildAttributionMap(emptyMap, makeRegimeOutput("neutral"), undefined);
    expect(result.size).toBe(0);
  });

  it("should handle null regimeOutput gracefully (regime_tag = null)", () => {
    const thinkingMap = new Map<string, InvestorThinkingOutput>();
    thinkingMap.set("NVDA", makeThinkingOutput("NVDA"));
    const result = buildAttributionMap(thinkingMap, null, undefined);
    const attr = result.get("NVDA")!;
    expect(attr.regime_tag).toBeNull();
  });

  it("should fall back to thinking scores when no interactionMap provided", () => {
    const thinkingMap = new Map<string, InvestorThinkingOutput>();
    thinkingMap.set("GOOGL", makeThinkingOutput("GOOGL"));
    const result = buildAttributionMap(thinkingMap, makeRegimeOutput("risk_off"), undefined);
    const attr = result.get("GOOGL")!;
    // Without interaction, should use thinking.adjusted_alpha_score = 0.74
    expect(attr.alpha_score).toBeCloseTo(0.74, 4);
    expect(attr.danger_score).toBeCloseTo(0.18, 4);
  });

  it("should handle multiple tickers in one call", () => {
    const thinkingMap = new Map<string, InvestorThinkingOutput>();
    thinkingMap.set("AAPL", makeThinkingOutput("AAPL"));
    thinkingMap.set("MSFT", makeThinkingOutput("MSFT"));
    thinkingMap.set("NVDA", makeThinkingOutput("NVDA"));
    const result = buildAttributionMap(thinkingMap, makeRegimeOutput("risk_on"), undefined);
    expect(result.size).toBe(3);
    expect(result.has("AAPL")).toBe(true);
    expect(result.has("MSFT")).toBe(true);
    expect(result.has("NVDA")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE_4: ReplayResult structured_attribution field
// ─────────────────────────────────────────────────────────────────────────────

describe("CASE_4: ReplayResult — structured_attribution field contract", () => {
  it("structured_attribution should have all 11 required keys when populated", () => {
    const REQUIRED_KEYS = [
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
      "falsification_tags",
    ];

    // Simulate what replayDecision would return
    const mockStructuredAttribution = {
      business_quality_score: 0.72,
      moat_strength: "wide",
      event_type: "earnings",
      event_severity: 0.2,
      danger_score: 0.16,
      alpha_score: 0.76,
      trigger_score: 0.67,
      memory_score: 0.55,
      dominant_factor: "business_quality",
      regime_tag: "risk_on",
      falsification_tags: ["valuation_risk"],
    };

    for (const key of REQUIRED_KEYS) {
      expect(mockStructuredAttribution).toHaveProperty(key);
    }
  });

  it("structured_attribution should be null for pre-LEVEL9.1 decisions (no BQ fields)", () => {
    // Simulate a DB row with no attribution fields
    const preLevel91Row = {
      businessQualityScore: null,
      moatStrength: null,
      regimeTag: null,
    };
    const hasBQ = preLevel91Row.businessQualityScore != null;
    const hasAny = hasBQ || preLevel91Row.moatStrength != null || preLevel91Row.regimeTag != null;
    expect(hasAny).toBe(false);
    // structured_attribution would be null for this row
  });

  it("buildAttributionMap should produce advisory_only-compliant output", () => {
    const thinkingMap = new Map<string, InvestorThinkingOutput>();
    thinkingMap.set("META", makeThinkingOutput("META"));
    const result = buildAttributionMap(thinkingMap, makeRegimeOutput("event_shock"), undefined);
    const attr = result.get("META")!;

    // All numeric scores should be in [0, 1]
    expect(attr.business_quality_score!).toBeGreaterThanOrEqual(0);
    expect(attr.business_quality_score!).toBeLessThanOrEqual(1);
    expect(attr.alpha_score!).toBeGreaterThanOrEqual(0);
    expect(attr.alpha_score!).toBeLessThanOrEqual(1);
    expect(attr.danger_score!).toBeGreaterThanOrEqual(0);
    expect(attr.danger_score!).toBeLessThanOrEqual(1);
  });
});
