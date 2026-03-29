/**
 * DANTREE LEVEL10.2 — Business Understanding Engine
 * Phase 1: computeCompetenceFit (Circle of Competence)
 * Phase 2: evaluateBusinessUnderstanding (Moat + Business Model)
 * Phase 3: evaluateManagementProxy (Management + Capital Allocation)
 *
 * HARD RULES:
 * - advisory_only: true always
 * - No trading/execution logic
 * - No auto-optimization
 * - Prefer "unknown" over false confidence
 * - Simple, auditable heuristics only
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompetenceFit = "inside" | "borderline" | "outside";
export type MoatStrength = "weak" | "narrow" | "wide" | "unknown";
export type BusinessModelQuality = "fragile" | "average" | "strong" | "unknown";
export type CapitalAllocationQuality = "poor" | "mixed" | "disciplined" | "unknown";
export type EligibilityStatus = "eligible" | "research_required" | "avoid_for_now";

export interface CompetenceFitInput {
  ticker: string;
  sector: string;
  themes: string[];
  dataQualityScore: number; // 0.0 - 1.0
  businessDescriptionAvailable: boolean;
}

export interface CompetenceFitOutput {
  ticker: string;
  competence_fit: CompetenceFit;
  competence_confidence: number;
  competence_reasons: string[];
  advisory_only: true;
}

export interface BusinessUnderstandingInput {
  ticker: string;
  sector: string;
  volatility: number;           // 0.0 - 1.0 (normalized)
  signalConsistency: number;    // 0.0 - 1.0
  businessQualityScore: number; // from existing BQ
  eventSensitivity: number;     // 0.0 - 1.0
  valuationSanity: number;      // 0.0 - 1.0 (1.0 = reasonable, 0.0 = stretched)
  isRecurringBusiness: boolean;
  isTechDisruptionTarget: boolean;
  marginQualityProxy: number;   // 0.0 - 1.0
}

export interface BusinessUnderstandingOutput {
  ticker: string;
  business_understanding_score: number;
  moat_strength: MoatStrength;
  business_model_quality: BusinessModelQuality;
  business_flags: string[];
  why_this_business_might_be_good: string[];
  why_this_business_might_be_fragile: string[];
  advisory_only: true;
}

export interface ManagementProxyInput {
  ticker: string;
  eventReversalCount: number;   // # of violent reversals in recent history
  valuationStretch: number;     // 0.0 - 1.0 (1.0 = very stretched)
  executionConsistency: number; // 0.0 - 1.0
  dataConfidence: number;       // 0.0 - 1.0
}

export interface ManagementProxyOutput {
  ticker: string;
  management_proxy_score: number;
  capital_allocation_quality: CapitalAllocationQuality;
  management_flags: string[];
  allocation_flags: string[];
  advisory_only: true;
}

export interface BusinessEligibilityInput {
  ticker: string;
  competenceFit: CompetenceFitOutput;
  businessUnderstanding: BusinessUnderstandingOutput;
  managementProxy: ManagementProxyOutput;
  signalFusionScore: number; // existing fusion score from Level7
}

export interface BusinessEligibilityOutput {
  ticker: string;
  business_eligible: boolean;
  eligibility_status: EligibilityStatus;
  eligibility_reason: string;
  business_priority_multiplier: number;
  filter_flags: string[];
  advisory_only: true;
}

// ─── SECTOR ALLOWLIST (Circle of Competence) ─────────────────────────────────

const INSIDE_SECTORS = new Set([
  "technology",
  "semiconductors",
  "software",
  "platforms",
  "internet",
  "consumer electronics",
  "cloud computing",
  "artificial intelligence",
  "e-commerce",
]);

const BORDERLINE_SECTORS = new Set([
  "consumer discretionary",
  "consumer staples",
  "healthcare",
  "medical devices",
  "biotech",
  "fintech",
  "financial services",
  "industrial technology",
]);

const OUTSIDE_SECTORS = new Set([
  "mining",
  "oil & gas",
  "energy",
  "utilities",
  "real estate",
  "reit",
  "commodities",
  "shipping",
  "agriculture",
  "defense",
]);

// ─── Phase 1: computeCompetenceFit ───────────────────────────────────────────

export function computeCompetenceFit(input: CompetenceFitInput): CompetenceFitOutput {
  const { ticker, sector, themes, dataQualityScore, businessDescriptionAvailable } = input;
  const sectorLower = sector.toLowerCase();
  const reasons: string[] = [];
  let fitScore = 0.5; // neutral start

  // Step 1: Sector classification
  const insideSectorArr = Array.from(INSIDE_SECTORS);
  const outsideSectorArr = Array.from(OUTSIDE_SECTORS);
  const borderlineSectorArr = Array.from(BORDERLINE_SECTORS);

  let sectorFit: CompetenceFit = "borderline";
  const insideMatch = insideSectorArr.find(s => sectorLower.includes(s));
  if (insideMatch) {
    sectorFit = "inside";
    fitScore += 0.3;
    reasons.push(`Sector "${sector}" is within competence scope`);
  }
  if (sectorFit !== "inside") {
    const outsideMatch = outsideSectorArr.find(s => sectorLower.includes(s));
    if (outsideMatch) {
      sectorFit = "outside";
      fitScore -= 0.4;
      reasons.push(`Sector "${sector}" is outside competence scope`);
    }
  }
  if (sectorFit === "borderline") {
    const borderlineMatch = borderlineSectorArr.find(s => sectorLower.includes(s));
    if (borderlineMatch) {
      reasons.push(`Sector "${sector}" is borderline — research required`);
    } else {
      fitScore -= 0.1;
      reasons.push(`Sector "${sector}" is unclassified — defaulting to borderline`);
    }
  }

  // Step 2: Theme boost
  const techThemes = ["ai", "cloud", "saas", "platform", "software", "semiconductor", "data"];
  const themeHits = themes.filter(t => techThemes.some(tt => t.toLowerCase().includes(tt)));
  if (themeHits.length >= 2) {
    fitScore += 0.15;
    reasons.push(`Strong tech themes detected: ${themeHits.slice(0, 2).join(", ")}`);
  }

  // Step 3: Data quality penalty
  if (dataQualityScore < 0.4) {
    fitScore -= 0.25;
    reasons.push(`Low data quality (${(dataQualityScore * 100).toFixed(0)}%) — cannot confirm competence`);
  } else if (dataQualityScore < 0.6) {
    fitScore -= 0.1;
    reasons.push(`Moderate data quality — borderline confidence`);
  }

  // Step 4: Business description penalty
  if (!businessDescriptionAvailable) {
    fitScore -= 0.15;
    reasons.push("Business description unavailable — competence cannot be confirmed");
  }

  // Step 5: Resolve final fit
  fitScore = Math.max(0, Math.min(1, fitScore));
  let competence_fit: CompetenceFit;
  if (fitScore >= 0.65) {
    competence_fit = "inside";
  } else if (fitScore >= 0.35) {
    competence_fit = "borderline";
  } else {
    competence_fit = "outside";
  }

  // Override: low data quality blocks "inside" even with good sector
  if (dataQualityScore < 0.4 && competence_fit === "inside") {
    competence_fit = "borderline";
    reasons.push("Downgraded to borderline: data quality too low to confirm inside");
  }

  return {
    ticker,
    competence_fit,
    competence_confidence: parseFloat(fitScore.toFixed(3)),
    competence_reasons: reasons,
    advisory_only: true,
  };
}

// ─── Phase 2: evaluateBusinessUnderstanding ──────────────────────────────────

export function evaluateBusinessUnderstanding(
  input: BusinessUnderstandingInput
): BusinessUnderstandingOutput {
  const {
    ticker, sector, volatility, signalConsistency, businessQualityScore,
    eventSensitivity, valuationSanity, isRecurringBusiness,
    isTechDisruptionTarget, marginQualityProxy,
  } = input;

  const goodReasons: string[] = [];
  const fragileReasons: string[] = [];
  const flags: string[] = [];
  let score = 0.5;

  // Heuristic 1: Low volatility + consistent signal + quality sector → positive
  if (volatility < 0.3 && signalConsistency > 0.65) {
    score += 0.15;
    goodReasons.push("Low volatility with consistent signal — stable business profile");
  }

  // Heuristic 2: High volatility + event dependency + weak sector → fragile
  if (volatility > 0.65 && eventSensitivity > 0.6) {
    score -= 0.2;
    fragileReasons.push("High volatility + event dependency — fragile execution profile");
    flags.push("HIGH_VOLATILITY_EVENT_DEPENDENCY");
  }

  // Heuristic 3: Tech disruption against low-BQ incumbent → moat penalty
  if (isTechDisruptionTarget && businessQualityScore < 0.45) {
    score -= 0.25;
    fragileReasons.push("Tech disruption risk against low-quality incumbent — moat penalty");
    flags.push("TECH_DISRUPTION_MOAT_PENALTY");
  }

  // Heuristic 4: Recurring/repeatable business → positive
  if (isRecurringBusiness) {
    score += 0.1;
    goodReasons.push("Recurring/repeatable business model — supports quality");
  }

  // BQ score integration
  if (businessQualityScore > 0.7) {
    score += 0.1;
    goodReasons.push(`High BQ score (${(businessQualityScore * 100).toFixed(0)}%) — quality signal`);
  } else if (businessQualityScore < 0.4) {
    score -= 0.1;
    fragileReasons.push(`Low BQ score (${(businessQualityScore * 100).toFixed(0)}%) — quality concern`);
  }

  // Valuation sanity
  if (valuationSanity < 0.35) {
    score -= 0.1;
    fragileReasons.push("Stretched valuation — reduces margin of safety");
    flags.push("STRETCHED_VALUATION");
  } else if (valuationSanity > 0.7) {
    score += 0.05;
    goodReasons.push("Reasonable valuation — margin of safety present");
  }

  // Margin quality
  if (marginQualityProxy > 0.65) {
    score += 0.08;
    goodReasons.push("Strong margin profile — supports business quality");
  } else if (marginQualityProxy < 0.35) {
    fragileReasons.push("Weak margin profile — business quality concern");
    flags.push("WEAK_MARGINS");
  }

  score = Math.max(0, Math.min(1, score));

  // Determine moat strength
  let moat_strength: MoatStrength;
  const hasData = businessQualityScore > 0 || marginQualityProxy > 0;
  if (!hasData) {
    moat_strength = "unknown";
  } else if (score >= 0.72 && !isTechDisruptionTarget) {
    moat_strength = "wide";
  } else if (score >= 0.55) {
    moat_strength = "narrow";
  } else if (score < 0.35) {
    moat_strength = "weak";
  } else {
    moat_strength = "unknown";
  }

  // Determine business model quality
  let business_model_quality: BusinessModelQuality;
  if (fragileReasons.length >= 2 || (isTechDisruptionTarget && businessQualityScore < 0.45)) {
    business_model_quality = "fragile";
  } else if (score >= 0.68 && goodReasons.length >= 2) {
    business_model_quality = "strong";
  } else if (score >= 0.45) {
    business_model_quality = "average";
  } else {
    business_model_quality = "unknown";
  }

  return {
    ticker,
    business_understanding_score: parseFloat(score.toFixed(3)),
    moat_strength,
    business_model_quality,
    business_flags: flags,
    why_this_business_might_be_good: goodReasons,
    why_this_business_might_be_fragile: fragileReasons,
    advisory_only: true,
  };
}

// ─── Phase 3: evaluateManagementProxy ────────────────────────────────────────

export function evaluateManagementProxy(input: ManagementProxyInput): ManagementProxyOutput {
  const { ticker, eventReversalCount, valuationStretch, executionConsistency, dataConfidence } = input;

  const mgmtFlags: string[] = [];
  const allocFlags: string[] = [];
  let score = 0.5;

  // Low data confidence → unknown
  if (dataConfidence < 0.3) {
    return {
      ticker,
      management_proxy_score: 0.5,
      capital_allocation_quality: "unknown",
      management_flags: ["INSUFFICIENT_DATA_FOR_MANAGEMENT_ASSESSMENT"],
      allocation_flags: [],
      advisory_only: true,
    };
  }

  // Heuristic 1: Repeated violent event-driven reversals → governance caution
  if (eventReversalCount >= 3) {
    score -= 0.25;
    mgmtFlags.push(`REPEATED_EVENT_REVERSALS (count=${eventReversalCount}) — governance/expectation caution`);
  } else if (eventReversalCount >= 2) {
    score -= 0.1;
    mgmtFlags.push("MODERATE_EVENT_REVERSALS — caution warranted");
  }

  // Heuristic 2: Stretched valuation + poor follow-through → promotional risk
  if (valuationStretch > 0.7 && executionConsistency < 0.45) {
    score -= 0.2;
    allocFlags.push("STRETCHED_VALUATION_POOR_EXECUTION — promotional risk caution");
    mgmtFlags.push("EXECUTION_CREDIBILITY_CONCERN");
  }

  // Heuristic 3: High quality / stable / consistent execution → modest positive
  if (executionConsistency > 0.72 && eventReversalCount <= 1) {
    score += 0.2;
    mgmtFlags.push("CONSISTENT_EXECUTION — modest positive proxy");
  }

  // Heuristic 4: Disciplined capital allocation proxy
  if (valuationStretch < 0.4 && executionConsistency > 0.65) {
    score += 0.1;
    allocFlags.push("DISCIPLINED_ALLOCATION_PROXY — reasonable valuation + consistent execution");
  }

  score = Math.max(0, Math.min(1, score));

  // Determine capital allocation quality
  let capital_allocation_quality: CapitalAllocationQuality;
  if (dataConfidence < 0.5) {
    capital_allocation_quality = "unknown";
  } else if (score >= 0.68 && allocFlags.some(f => f.includes("DISCIPLINED"))) {
    capital_allocation_quality = "disciplined";
  } else if (score >= 0.45) {
    capital_allocation_quality = "mixed";
  } else {
    capital_allocation_quality = "poor";
  }

  return {
    ticker,
    management_proxy_score: parseFloat(score.toFixed(3)),
    capital_allocation_quality,
    management_flags: mgmtFlags,
    allocation_flags: allocFlags,
    advisory_only: true,
  };
}

// ─── Phase 4: computeBusinessEligibility ─────────────────────────────────────

export function computeBusinessEligibility(
  input: BusinessEligibilityInput
): BusinessEligibilityOutput {
  const { ticker, competenceFit, businessUnderstanding, managementProxy, signalFusionScore } = input;
  const flags: string[] = [];

  // Rule 1: Outside competence → research_required or avoid_for_now
  if (competenceFit.competence_fit === "outside") {
    const status: EligibilityStatus =
      businessUnderstanding.business_model_quality === "fragile" ? "avoid_for_now" : "research_required";
    return {
      ticker,
      business_eligible: false,
      eligibility_status: status,
      eligibility_reason: `Outside circle of competence: ${competenceFit.competence_reasons[0] ?? "sector not within scope"}`,
      business_priority_multiplier: 0.3,
      filter_flags: ["OUTSIDE_COMPETENCE", ...flags],
      advisory_only: true,
    };
  }

  // Rule 2: Fragile business + weak moat + poor/mixed management → avoid_for_now
  const isFragile = businessUnderstanding.business_model_quality === "fragile";
  const isWeakMoat = businessUnderstanding.moat_strength === "weak";
  const isPoorMgmt = managementProxy.capital_allocation_quality === "poor";
  const isMixedMgmt = managementProxy.capital_allocation_quality === "mixed";

  if (isFragile && isWeakMoat && (isPoorMgmt || isMixedMgmt)) {
    flags.push("FRAGILE_BUSINESS_WEAK_MOAT_POOR_MANAGEMENT");
    return {
      ticker,
      business_eligible: false,
      eligibility_status: "avoid_for_now",
      eligibility_reason: "Fragile business model + weak moat + poor/mixed management proxy",
      business_priority_multiplier: 0.2,
      filter_flags: flags,
      advisory_only: true,
    };
  }

  // Rule 3: Strong signal but poor business → downgrade (business-first principle)
  if (signalFusionScore > 0.7 && businessUnderstanding.business_understanding_score < 0.4) {
    flags.push("STRONG_SIGNAL_WEAK_BUSINESS_DOWNGRADED");
    return {
      ticker,
      business_eligible: true,
      eligibility_status: "research_required",
      eligibility_reason: "Strong signal but weak business understanding — business-first filter applied",
      business_priority_multiplier: 0.6,
      filter_flags: flags,
      advisory_only: true,
    };
  }

  // Rule 4: Unknown/partial → not top conviction
  const hasUnknowns =
    businessUnderstanding.moat_strength === "unknown" ||
    businessUnderstanding.business_model_quality === "unknown" ||
    managementProxy.capital_allocation_quality === "unknown";

  if (hasUnknowns && competenceFit.competence_fit === "borderline") {
    flags.push("PARTIAL_INFORMATION_BORDERLINE");
    return {
      ticker,
      business_eligible: true,
      eligibility_status: "research_required",
      eligibility_reason: "Borderline competence with unknown business/management fields — not top conviction",
      business_priority_multiplier: 0.7,
      filter_flags: flags,
      advisory_only: true,
    };
  }

  // Rule 5: Inside competence + strong business → eligible
  const isInsideCompetence = competenceFit.competence_fit === "inside";
  const isStrongBusiness =
    businessUnderstanding.business_model_quality === "strong" ||
    businessUnderstanding.moat_strength === "wide" ||
    businessUnderstanding.moat_strength === "narrow";
  const isDisciplined = managementProxy.capital_allocation_quality === "disciplined";

  let multiplier = 1.0;
  if (isInsideCompetence && isStrongBusiness) {
    multiplier = isDisciplined ? 1.2 : 1.1;
    flags.push("INSIDE_COMPETENCE_STRONG_BUSINESS");
  } else if (isInsideCompetence) {
    multiplier = 1.0;
  } else {
    // borderline with ok business
    multiplier = 0.85;
    flags.push("BORDERLINE_COMPETENCE_MODERATE_BUSINESS");
  }

  return {
    ticker,
    business_eligible: true,
    eligibility_status: "eligible",
    eligibility_reason: isInsideCompetence && isStrongBusiness
      ? "Inside competence with strong/understandable business"
      : "Borderline competence — eligible with reduced priority",
    business_priority_multiplier: multiplier,
    filter_flags: flags,
    advisory_only: true,
  };
}

// ─── Convenience: buildBusinessContext ───────────────────────────────────────

export interface BusinessContext {
  competenceFit: CompetenceFitOutput;
  businessUnderstanding: BusinessUnderstandingOutput;
  managementProxy: ManagementProxyOutput;
  eligibility: BusinessEligibilityOutput;
}

/**
 * Run all 4 business-understanding phases in sequence.
 * Returns the full business context for a ticker.
 */
export function buildBusinessContext(params: {
  ticker: string;
  sector: string;
  themes: string[];
  dataQualityScore: number;
  businessDescriptionAvailable: boolean;
  volatility: number;
  signalConsistency: number;
  businessQualityScore: number;
  eventSensitivity: number;
  valuationSanity: number;
  isRecurringBusiness: boolean;
  isTechDisruptionTarget: boolean;
  marginQualityProxy: number;
  eventReversalCount: number;
  valuationStretch: number;
  executionConsistency: number;
  dataConfidence: number;
  signalFusionScore: number;
}): BusinessContext {
  const competenceFit = computeCompetenceFit({
    ticker: params.ticker,
    sector: params.sector,
    themes: params.themes,
    dataQualityScore: params.dataQualityScore,
    businessDescriptionAvailable: params.businessDescriptionAvailable,
  });

  const businessUnderstanding = evaluateBusinessUnderstanding({
    ticker: params.ticker,
    sector: params.sector,
    volatility: params.volatility,
    signalConsistency: params.signalConsistency,
    businessQualityScore: params.businessQualityScore,
    eventSensitivity: params.eventSensitivity,
    valuationSanity: params.valuationSanity,
    isRecurringBusiness: params.isRecurringBusiness,
    isTechDisruptionTarget: params.isTechDisruptionTarget,
    marginQualityProxy: params.marginQualityProxy,
  });

  const managementProxy = evaluateManagementProxy({
    ticker: params.ticker,
    eventReversalCount: params.eventReversalCount,
    valuationStretch: params.valuationStretch,
    executionConsistency: params.executionConsistency,
    dataConfidence: params.dataConfidence,
  });

  const eligibility = computeBusinessEligibility({
    ticker: params.ticker,
    competenceFit,
    businessUnderstanding,
    managementProxy,
    signalFusionScore: params.signalFusionScore,
  });

  return { competenceFit, businessUnderstanding, managementProxy, eligibility };
}
