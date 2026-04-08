/**
 * LEVEL1C: Post-Fetch Evidence Engine
 * Phase 1: Post-Fetch Validation (cross-source field comparison)
 * Phase 2: Evidence Strength Scoring
 * Phase 3: Conflict Resolution and Surfacing
 *
 * Runs AFTER Step2 data retrieval, BEFORE final output rendering.
 * Zero new LLM calls. Fully deterministic.
 */

// ── Phase 1: Post-Fetch Validation Types ─────────────────────────────────────

export type ConsistencyLevel =
  | "aligned"
  | "minor_divergence"
  | "major_conflict"
  | "insufficient_comparison";

export type ConfidenceAdjustment = "boost" | "neutral" | "penalty";

export interface PostFetchValidationResult {
  field_name: string;
  sources_checked: string[];
  values: Array<{ source: string; value: unknown; freshness?: "fresh" | "stale" | "unknown" }>;
  consistency: ConsistencyLevel;
  spread_percent: number;
  canonical_source: string;
  canonical_value: unknown;
  confidence_adjustment: ConfidenceAdjustment;
  note: string;
}

// ── Phase 2: Evidence Strength Scoring Types ──────────────────────────────────

export type EvidenceTier = "strong" | "adequate" | "weak" | "very_weak";

export interface EvidenceStrengthReport {
  evidence_score: number;       // 0.0 – 1.0
  coverage_score: number;
  consistency_score: number;
  freshness_score: number;
  reliability_score: number;
  tier: EvidenceTier;
  blocking_fields_missing: string[];
  important_fields_missing: string[];
  conflicted_fields: string[];
  strong_fields: string[];
  weak_fields: string[];
  summary: string;
}

// ── Phase 3: Conflict Bundle Types ───────────────────────────────────────────

export interface ConflictEntry {
  field_name: string;
  competing_sources: string[];
  competing_values: unknown[];
  chosen_canonical_source: string;
  reason_chosen: string;
}

export interface EvidenceConflictBundle {
  has_conflict: boolean;
  conflict_count: number;
  major_conflicts: ConflictEntry[];
  minor_conflicts: ConflictEntry[];
  resolution_notes: string[];
  user_visible_warning: string;
}

// ── Source Reliability Map (mirrors LEVEL1B SOURCE_DEFINITIONS) ───────────────

const SOURCE_RELIABILITY: Record<string, number> = {
  yahoo_finance: 0.88,
  fred: 0.95,
  // bloomberg: 0.98, // ⛔ DISABLED — no API access, web scraping prohibited
  aqr: 0.95,
  citadel: 0.93,
  gmo: 0.92,
  finnhub: 0.85,
  fmp: 0.87,
  polygon: 0.86,
  simfin: 0.84,
  alpha_vantage: 0.82,
  tiingo: 0.83,
  sec: 0.97,
  world_bank: 0.91,
  imf: 0.93,
  ecb: 0.94,
  boe: 0.93,
  hkma: 0.90,
  news_api: 0.72,
  marketaux: 0.70,
  coingecko: 0.82,
  congress: 0.88,
  gleif: 0.90,
};

function getReliability(sourceId: string): number {
  const lower = sourceId.toLowerCase().replace(/[^a-z_]/g, "_");
  for (const [key, val] of Object.entries(SOURCE_RELIABILITY)) {
    if (lower.includes(key)) return val;
  }
  return 0.70; // default for unknown sources
}

// ── Phase 1: Post-Fetch Validation Engine ─────────────────────────────────────

/**
 * FieldDataPoint: one source's returned value for a field.
 */
export interface FieldDataPoint {
  source: string;
  value: unknown;
  freshness?: "fresh" | "stale" | "unknown";
}

/**
 * Validate a single field across multiple sources.
 */
export function validateField(
  fieldName: string,
  dataPoints: FieldDataPoint[]
): PostFetchValidationResult {
  if (dataPoints.length < 2) {
    // Only one source — insufficient comparison
    const single = dataPoints[0];
    return {
      field_name: fieldName,
      sources_checked: single ? [single.source] : [],
      values: dataPoints.map(d => ({ source: d.source, value: d.value, freshness: d.freshness })),
      consistency: "insufficient_comparison",
      spread_percent: 0,
      canonical_source: single?.source ?? "",
      canonical_value: single?.value ?? null,
      confidence_adjustment: "neutral",
      note: "Only one source available — cannot cross-validate.",
    };
  }

  const sources = dataPoints.map(d => d.source);
  const values = dataPoints.map(d => ({ source: d.source, value: d.value, freshness: d.freshness }));

  // Detect numeric vs string
  const numericPoints = dataPoints.filter(d => typeof d.value === "number" && isFinite(d.value as number));
  const isNumeric = numericPoints.length >= 2;

  let consistency: ConsistencyLevel;
  let spreadPercent = 0;
  let note = "";
  let canonicalSource = "";
  let canonicalValue: unknown = null;
  let confidenceAdj: ConfidenceAdjustment = "neutral";

  if (isNumeric) {
    const nums = numericPoints.map(d => d.value as number);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    spreadPercent = avg !== 0 ? ((max - min) / Math.abs(avg)) * 100 : 0;

    if (spreadPercent <= 5) {
      consistency = "aligned";
      confidenceAdj = numericPoints.length >= 3 ? "boost" : "neutral";
      note = `Numeric spread ${spreadPercent.toFixed(1)}% — sources aligned.`;
    } else if (spreadPercent <= 15) {
      consistency = "minor_divergence";
      confidenceAdj = "neutral";
      note = `Numeric spread ${spreadPercent.toFixed(1)}% — minor divergence.`;
    } else {
      consistency = "major_conflict";
      confidenceAdj = "penalty";
      note = `Numeric spread ${spreadPercent.toFixed(1)}% — major conflict detected.`;
    }

    // Pick canonical: highest reliability among aligned sources (or all if conflict)
    const candidatePool = consistency === "major_conflict" ? numericPoints : numericPoints;
    let bestReliability = -1;
    for (const dp of candidatePool) {
      const rel = getReliability(dp.source);
      if (rel > bestReliability) {
        bestReliability = rel;
        canonicalSource = dp.source;
        canonicalValue = dp.value;
      }
    }
  } else {
    // String/category comparison
    const stringPoints = dataPoints.filter(d => d.value !== null && d.value !== undefined);
    const normalizedValues = stringPoints.map(d => String(d.value).toLowerCase().trim());
    const uniqueValues = new Set(normalizedValues);

    if (uniqueValues.size === 1) {
      consistency = "aligned";
      confidenceAdj = stringPoints.length >= 3 ? "boost" : "neutral";
      note = `String values aligned across ${stringPoints.length} sources.`;
    } else {
      consistency = "major_conflict";
      confidenceAdj = "penalty";
      note = `String conflict: ${Array.from(uniqueValues).join(" vs ")}`;
    }

    // Canonical: highest reliability
    let bestReliability = -1;
    for (const dp of stringPoints) {
      const rel = getReliability(dp.source);
      if (rel > bestReliability) {
        bestReliability = rel;
        canonicalSource = dp.source;
        canonicalValue = dp.value;
      }
    }
  }

  // Freshness penalty: if canonical source is stale, downgrade
  const canonicalPoint = dataPoints.find(d => d.source === canonicalSource);
  if (canonicalPoint?.freshness === "stale") {
    note += " [Freshness penalty: canonical source is stale]";
    if (confidenceAdj === "boost") confidenceAdj = "neutral";
    else if (confidenceAdj === "neutral") confidenceAdj = "penalty";
  }

  return {
    field_name: fieldName,
    sources_checked: sources,
    values,
    consistency,
    spread_percent: spreadPercent,
    canonical_source: canonicalSource,
    canonical_value: canonicalValue,
    confidence_adjustment: confidenceAdj,
    note,
  };
}

/**
 * Run post-fetch validation for a set of fields.
 * fieldDataMap: { fieldName: FieldDataPoint[] }
 */
export function runPostFetchValidation(
  fieldDataMap: Record<string, FieldDataPoint[]>
): PostFetchValidationResult[] {
  return Object.entries(fieldDataMap).map(([fieldName, dataPoints]) =>
    validateField(fieldName, dataPoints)
  );
}

// ── Phase 2: Evidence Strength Scoring ────────────────────────────────────────

export interface EvidenceScoringInput {
  validationResults: PostFetchValidationResult[];
  blockingFields: string[];
  importantFields: string[];
  fetchedFields: string[];
  sourceReliabilities?: Record<string, number>; // optional override
}

export function scoreEvidenceStrength(input: EvidenceScoringInput): EvidenceStrengthReport {
  const { validationResults, blockingFields, importantFields, fetchedFields } = input;

  // Coverage score
  const blockingPresent = blockingFields.filter(f => fetchedFields.includes(f));
  const blockingMissing = blockingFields.filter(f => !fetchedFields.includes(f));
  const importantPresent = importantFields.filter(f => fetchedFields.includes(f));
  const importantMissing = importantFields.filter(f => !fetchedFields.includes(f));

  const blockingCoverage = blockingFields.length > 0
    ? blockingPresent.length / blockingFields.length
    : 1.0;
  const importantCoverage = importantFields.length > 0
    ? importantPresent.length / importantFields.length
    : 1.0;
  const coverageScore = blockingCoverage * 0.7 + importantCoverage * 0.3;

  // Consistency score
  const validatedFields = validationResults.filter(r => r.consistency !== "insufficient_comparison");
  const alignedCount = validationResults.filter(r => r.consistency === "aligned").length;
  const majorConflictCount = validationResults.filter(r => r.consistency === "major_conflict").length;
  const totalValidated = validationResults.length;

  const consistencyScore = totalValidated > 0
    ? Math.max(0, (alignedCount - majorConflictCount * 2) / totalValidated)
    : 0.75; // no multi-source data → neutral

  // Freshness score
  const freshValues = validationResults.flatMap(r => r.values).filter(v => v.freshness === "fresh");
  const staleValues = validationResults.flatMap(r => r.values).filter(v => v.freshness === "stale");
  const totalValues = validationResults.flatMap(r => r.values).length;
  const freshnessScore = totalValues > 0
    ? (freshValues.length - staleValues.length * 0.5) / totalValues
    : 0.70;

  // Reliability score (average canonical source reliability)
  const canonicalReliabilities = validationResults
    .filter(r => r.canonical_source)
    .map(r => getReliability(r.canonical_source));
  const reliabilityScore = canonicalReliabilities.length > 0
    ? canonicalReliabilities.reduce((a, b) => a + b, 0) / canonicalReliabilities.length
    : 0.75;

  // Weighted evidence score
  let evidenceScore =
    coverageScore * 0.40 +
    Math.max(0, Math.min(1, consistencyScore)) * 0.25 +
    Math.max(0, Math.min(1, freshnessScore)) * 0.15 +
    reliabilityScore * 0.20;

  // Hard penalties
  if (blockingMissing.length > 0) {
    evidenceScore -= blockingMissing.length * 0.15;
  }
  if (majorConflictCount > 0) {
    evidenceScore -= majorConflictCount * 0.10;
  }
  evidenceScore = Math.max(0, Math.min(1, evidenceScore));

  // Tier
  let tier: EvidenceTier;
  if (evidenceScore >= 0.80) tier = "strong";
  else if (evidenceScore >= 0.60) tier = "adequate";
  else if (evidenceScore >= 0.40) tier = "weak";
  else tier = "very_weak";

  // Field categorization
  const conflictedFields = validationResults
    .filter(r => r.consistency === "major_conflict")
    .map(r => r.field_name);
  const strongFields = validationResults
    .filter(r => r.consistency === "aligned" && r.confidence_adjustment !== "penalty")
    .map(r => r.field_name);
  const weakFields = [
    ...blockingMissing,
    ...validationResults.filter(r => r.confidence_adjustment === "penalty").map(r => r.field_name),
  ];

  const summary = `Evidence tier: ${tier.toUpperCase()} (score=${evidenceScore.toFixed(2)}). ` +
    `Coverage: ${(coverageScore * 100).toFixed(0)}% (blocking: ${blockingPresent.length}/${blockingFields.length}). ` +
    `Conflicts: ${majorConflictCount} major. ` +
    (blockingMissing.length > 0 ? `Missing blocking: [${blockingMissing.join(", ")}]. ` : "") +
    (conflictedFields.length > 0 ? `Conflicted: [${conflictedFields.join(", ")}].` : "All validated fields consistent.");

  return {
    evidence_score: evidenceScore,
    coverage_score: coverageScore,
    consistency_score: Math.max(0, Math.min(1, consistencyScore)),
    freshness_score: Math.max(0, Math.min(1, freshnessScore)),
    reliability_score: reliabilityScore,
    tier,
    blocking_fields_missing: blockingMissing,
    important_fields_missing: importantMissing,
    conflicted_fields: conflictedFields,
    strong_fields: strongFields,
    weak_fields: weakFields,
    summary,
  };
}

// ── Phase 3: Conflict Resolution and Surfacing ────────────────────────────────

export function buildEvidenceConflictBundle(
  validationResults: PostFetchValidationResult[],
  blockingFields: string[]
): EvidenceConflictBundle {
  const majorConflicts: ConflictEntry[] = [];
  const minorConflicts: ConflictEntry[] = [];
  const resolutionNotes: string[] = [];

  for (const result of validationResults) {
    if (result.consistency === "major_conflict") {
      const entry: ConflictEntry = {
        field_name: result.field_name,
        competing_sources: result.sources_checked,
        competing_values: result.values.map(v => v.value),
        chosen_canonical_source: result.canonical_source,
        reason_chosen: `Highest reliability source (${getReliability(result.canonical_source).toFixed(2)}) selected as canonical.`,
      };
      majorConflicts.push(entry);
      resolutionNotes.push(
        `[${result.field_name}] Major conflict: ${result.note} → canonical: ${result.canonical_source}=${result.canonical_value}`
      );
    } else if (result.consistency === "minor_divergence") {
      const entry: ConflictEntry = {
        field_name: result.field_name,
        competing_sources: result.sources_checked,
        competing_values: result.values.map(v => v.value),
        chosen_canonical_source: result.canonical_source,
        reason_chosen: `Minor divergence (${result.spread_percent.toFixed(1)}%). Highest reliability source used.`,
      };
      minorConflicts.push(entry);
      resolutionNotes.push(
        `[${result.field_name}] Minor divergence: spread=${result.spread_percent.toFixed(1)}% → canonical: ${result.canonical_source}`
      );
    }
  }

  const hasConflict = majorConflicts.length > 0 || minorConflicts.length > 0;
  const criticalConflicts = majorConflicts.filter(c => blockingFields.includes(c.field_name));

  let userVisibleWarning = "";
  if (criticalConflicts.length > 0) {
    userVisibleWarning = `⚠️ 数据冲突警告：关键字段 [${criticalConflicts.map(c => c.field_name).join(", ")}] 在多个数据源间存在重大差异（偏差>15%）。本次分析已选用最高可信度来源，但结论置信度已相应下调。`;
  } else if (majorConflicts.length > 0) {
    userVisibleWarning = `⚠️ 数据分歧提示：字段 [${majorConflicts.map(c => c.field_name).join(", ")}] 在数据源间存在差异，已使用最高可信度来源作为基准。`;
  } else if (minorConflicts.length > 0) {
    userVisibleWarning = `ℹ️ 数据轻微差异：字段 [${minorConflicts.map(c => c.field_name).join(", ")}] 在各来源间存在小幅偏差（≤15%），不影响主要结论。`;
  }

  return {
    has_conflict: hasConflict,
    conflict_count: majorConflicts.length + minorConflicts.length,
    major_conflicts: majorConflicts,
    minor_conflicts: minorConflicts,
    resolution_notes: resolutionNotes,
    user_visible_warning: userVisibleWarning,
  };
}

// ── Convenience: Run All Three Phases Together ────────────────────────────────

export interface Level1CEvidenceResult {
  validation_results: PostFetchValidationResult[];
  strength_report: EvidenceStrengthReport;
  conflict_bundle: EvidenceConflictBundle;
}

export function runLevel1CEvidenceEngine(
  fieldDataMap: Record<string, FieldDataPoint[]>,
  blockingFields: string[],
  importantFields: string[],
  fetchedFields: string[]
): Level1CEvidenceResult {
  const validationResults = runPostFetchValidation(fieldDataMap);
  const strengthReport = scoreEvidenceStrength({
    validationResults,
    blockingFields,
    importantFields,
    fetchedFields,
  });
  const conflictBundle = buildEvidenceConflictBundle(validationResults, blockingFields);

  return {
    validation_results: validationResults,
    strength_report: strengthReport,
    conflict_bundle: conflictBundle,
  };
}
