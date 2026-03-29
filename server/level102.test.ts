/**
 * LEVEL10.2 — Business Understanding Layer Validation Tests
 *
 * 6 Cases:
 * TC-L102-01: computeCompetenceFit — inside sector (technology)
 * TC-L102-02: computeCompetenceFit — outside sector (mining/commodities)
 * TC-L102-03: evaluateBusinessUnderstanding — high moat (SaaS recurring)
 * TC-L102-04: evaluateManagementProxy — disciplined capital allocation
 * TC-L102-05: computeBusinessEligibility — eligible (inside + wide moat + disciplined)
 * TC-L102-06: computeBusinessEligibility — avoid_for_now (outside + weak moat + poor mgmt)
 *
 * advisory_only: ALL outputs must carry advisory_only: true
 * Hard Rules: No auto-trade, no real capital allocation
 */

import { describe, it, expect } from "vitest";
import {
  computeCompetenceFit,
  evaluateBusinessUnderstanding,
  evaluateManagementProxy,
  computeBusinessEligibility,
  type CompetenceFitInput,
  type BusinessUnderstandingInput,
  type ManagementProxyInput,
  type BusinessEligibilityInput,
} from "./businessUnderstandingEngine";

// ─── TC-L102-01: computeCompetenceFit — inside sector ────────────────────────
describe("TC-L102-01: computeCompetenceFit — inside sector (technology)", () => {
  const input: CompetenceFitInput = {
    ticker: "AAPL",
    sector: "technology",
    themes: ["ai", "cloud", "saas"],
    dataQualityScore: 0.9,
    businessDescriptionAvailable: true,
  };

  it("should return competence_fit = inside", () => {
    const result = computeCompetenceFit(input);
    expect(result.competence_fit).toBe("inside");
  });

  it("should have high competence_confidence (>= 0.6)", () => {
    const result = computeCompetenceFit(input);
    expect(result.competence_confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("should carry advisory_only: true", () => {
    const result = computeCompetenceFit(input);
    expect(result.advisory_only).toBe(true);
  });

  it("should include competence_reasons", () => {
    const result = computeCompetenceFit(input);
    expect(result.competence_reasons.length).toBeGreaterThan(0);
  });
});

// ─── TC-L102-02: computeCompetenceFit — outside sector ───────────────────────
describe("TC-L102-02: computeCompetenceFit — outside sector (mining)", () => {
  const input: CompetenceFitInput = {
    ticker: "FCX",
    sector: "mining",
    themes: ["copper", "commodities"],
    dataQualityScore: 0.6,
    businessDescriptionAvailable: true,
  };

  it("should return competence_fit = outside", () => {
    const result = computeCompetenceFit(input);
    expect(result.competence_fit).toBe("outside");
  });

  it("should have lower competence_confidence (< 0.6)", () => {
    const result = computeCompetenceFit(input);
    expect(result.competence_confidence).toBeLessThan(0.6);
  });

  it("should carry advisory_only: true", () => {
    const result = computeCompetenceFit(input);
    expect(result.advisory_only).toBe(true);
  });
});

// ─── TC-L102-03: evaluateBusinessUnderstanding — high moat SaaS ──────────────
describe("TC-L102-03: evaluateBusinessUnderstanding — high moat SaaS", () => {
  const input: BusinessUnderstandingInput = {
    ticker: "CRM",
    sector: "software",
    volatility: 0.2,
    signalConsistency: 0.85,
    businessQualityScore: 0.88,
    eventSensitivity: 0.1,
    valuationSanity: 0.75,
    isRecurringBusiness: true,
    isTechDisruptionTarget: false,
    marginQualityProxy: 0.82,
  };

  it("should return moat_strength = wide or narrow", () => {
    const result = evaluateBusinessUnderstanding(input);
    expect(["wide", "narrow"]).toContain(result.moat_strength);
  });

  it("should return business_model_quality = strong or average", () => {
    const result = evaluateBusinessUnderstanding(input);
    expect(["strong", "average"]).toContain(result.business_model_quality);
  });

  it("should have business_understanding_score >= 0.6", () => {
    const result = evaluateBusinessUnderstanding(input);
    expect(result.business_understanding_score).toBeGreaterThanOrEqual(0.6);
  });

  it("should carry advisory_only: true", () => {
    const result = evaluateBusinessUnderstanding(input);
    expect(result.advisory_only).toBe(true);
  });
});

// ─── TC-L102-04: evaluateManagementProxy — disciplined capital allocation ─────
describe("TC-L102-04: evaluateManagementProxy — disciplined capital allocation", () => {
  const input: ManagementProxyInput = {
    ticker: "MSFT",
    eventReversalCount: 0,
    valuationStretch: 0.2,
    executionConsistency: 0.9,
    dataConfidence: 0.95,
  };

  it("should return capital_allocation_quality = disciplined or mixed", () => {
    const result = evaluateManagementProxy(input);
    expect(["disciplined", "mixed"]).toContain(result.capital_allocation_quality);
  });

  it("should have management_proxy_score >= 0.6", () => {
    const result = evaluateManagementProxy(input);
    expect(result.management_proxy_score).toBeGreaterThanOrEqual(0.6);
  });

  it("should carry advisory_only: true", () => {
    const result = evaluateManagementProxy(input);
    expect(result.advisory_only).toBe(true);
  });
});

// ─── TC-L102-05: computeBusinessEligibility — eligible ───────────────────────
describe("TC-L102-05: computeBusinessEligibility — eligible (inside + wide moat + disciplined)", () => {
  const competenceFit = computeCompetenceFit({
    ticker: "GOOGL",
    sector: "technology",
    themes: ["ai", "cloud", "advertising"],
    dataQualityScore: 0.9,
    businessDescriptionAvailable: true,
  });

  const businessUnderstanding = evaluateBusinessUnderstanding({
    ticker: "GOOGL",
    sector: "technology",
    volatility: 0.25,
    signalConsistency: 0.82,
    businessQualityScore: 0.85,
    eventSensitivity: 0.15,
    valuationSanity: 0.7,
    isRecurringBusiness: true,
    isTechDisruptionTarget: false,
    marginQualityProxy: 0.8,
  });

  const managementProxy = evaluateManagementProxy({
    ticker: "GOOGL",
    eventReversalCount: 0,
    valuationStretch: 0.25,
    executionConsistency: 0.88,
    dataConfidence: 0.9,
  });

  const input: BusinessEligibilityInput = {
    ticker: "GOOGL",
    competenceFit,
    businessUnderstanding,
    managementProxy,
    signalFusionScore: 0.78,
  };

  it("should return eligibility_status = eligible or research_required", () => {
    const result = computeBusinessEligibility(input);
    expect(["eligible", "research_required"]).toContain(result.eligibility_status);
  });

  it("should have business_priority_multiplier >= 1.0", () => {
    const result = computeBusinessEligibility(input);
    expect(result.business_priority_multiplier).toBeGreaterThanOrEqual(1.0);
  });

  it("should carry advisory_only: true", () => {
    const result = computeBusinessEligibility(input);
    expect(result.advisory_only).toBe(true);
  });
});

// ─── TC-L102-06: computeBusinessEligibility — avoid_for_now ──────────────────
describe("TC-L102-06: computeBusinessEligibility — avoid_for_now (outside + weak moat + poor mgmt)", () => {
  const competenceFit = computeCompetenceFit({
    ticker: "VALE",
    sector: "mining",
    themes: ["iron ore", "commodities"],
    dataQualityScore: 0.5,
    businessDescriptionAvailable: false,
  });

  const businessUnderstanding = evaluateBusinessUnderstanding({
    ticker: "VALE",
    sector: "mining",
    volatility: 0.75,
    signalConsistency: 0.2,
    businessQualityScore: 0.25,
    eventSensitivity: 0.8,
    valuationSanity: 0.3,
    isRecurringBusiness: false,
    isTechDisruptionTarget: true,
    marginQualityProxy: 0.2,
  });

  const managementProxy = evaluateManagementProxy({
    ticker: "VALE",
    eventReversalCount: 5,
    valuationStretch: 0.85,
    executionConsistency: 0.15,
    dataConfidence: 0.4,
  });

  const input: BusinessEligibilityInput = {
    ticker: "VALE",
    competenceFit,
    businessUnderstanding,
    managementProxy,
    signalFusionScore: 0.2,
  };

  it("should return eligibility_status = avoid_for_now or research_required", () => {
    const result = computeBusinessEligibility(input);
    expect(["avoid_for_now", "research_required"]).toContain(result.eligibility_status);
  });

  it("should have business_priority_multiplier <= 1.0", () => {
    const result = computeBusinessEligibility(input);
    expect(result.business_priority_multiplier).toBeLessThanOrEqual(1.0);
  });

  it("should carry advisory_only: true", () => {
    const result = computeBusinessEligibility(input);
    expect(result.advisory_only).toBe(true);
  });

  it("should include filter_flags", () => {
    const result = computeBusinessEligibility(input);
    expect(result.filter_flags.length).toBeGreaterThan(0);
  });
});
