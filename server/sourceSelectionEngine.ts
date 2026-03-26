/**
 * SOURCE_SELECTION_ENGINE (LEVEL1B)
 *
 * LEVEL1B upgrades over V1.5:
 * 1. SourceRegistry with category/region/freshness_requirement/user_preferred metadata
 * 2. Dynamic scoring: reliability + task_type_relevance + region_relevance + freshness - penalty
 * 3. selectTopSources(): returns top 2-3 sources per task (not per field)
 * 4. Multi-source validation: cross-check consistency + confidence_adjustment
 * 5. Pipeline integration: runSourceSelection(fields, taskType, region) → SourceSelectionResult
 *
 * NON-NEGOTIABLE: No new LLM calls. Deterministic. Auditable.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type SourceHealth = "active" | "degraded" | "error" | "unknown";
export type SourceCategory = "financial" | "macro" | "news" | "community" | "research" | "regulatory";
export type FreshnessRequirement = "high" | "medium" | "low";
export type Region = "US" | "CN" | "EU" | "HK" | "GLOBAL";
export type TaskType =
  | "stock_analysis"
  | "macro_analysis"
  | "crypto_analysis"
  | "portfolio_review"
  | "event_driven"
  | "discussion"
  | "general";

// LEVEL1B: Full source metadata (Phase 1 - Source Registry)
export interface SourceDefinition {
  source_name: string;
  category: SourceCategory;
  priority: number;           // 1-10: higher = preferred
  reliability_score: number;  // 0-1
  freshness_requirement: FreshnessRequirement;
  supports_fields: string[];
  region: Region;
  user_preferred?: boolean;   // AQR / Citadel / GMO / Bloomberg / Yahoo / FRED
  // V1.5 compat
  freshness: number;          // 0-1: 1=realtime
  cost: number;               // 0-1: 0=free
  latency: number;            // ms
}

// LEVEL1B Phase 2: Dynamic score output
export interface SourceScore {
  source_name: string;
  score: number;
  reason: string;
}

// LEVEL1B Phase 3: Selection output
export interface SelectedSource {
  source_name: string;
  score: number;
  category: SourceCategory;
  reason: string;
}

// LEVEL1B Phase 4: Multi-source validation
export interface ValidationResult {
  consistency: boolean;
  confidence_adjustment: "boost" | "penalty" | "neutral";
  conflict_fields: string[];
  note: string;
}

// LEVEL1B Phase 5: Full pipeline result
export interface SourceSelectionResult {
  selected_sources: SelectedSource[];
  route_results: RouteResult[];
  validation: ValidationResult;
  field_route_trace: Record<string, string>;
  selection_log: string[];
}

// V1.5 compat
export interface SourceCandidate {
  name: string;
  reliability: number;
  freshness: number;
  cost: number;
  latency: number;
}

export interface RouteResult {
  field: string;
  primary: string;
  fallbacks: string[];
  score: number;
  health: SourceHealth;
}

// ── LEVEL1B Phase 1: Source Registry ─────────────────────────────────────────
export const SOURCE_DEFINITIONS: Record<string, SourceDefinition> = {
  // ── User Preferred Sources ─────────────────────────────────────────────────
  "yahoo_finance": {
    source_name: "yahoo_finance", category: "financial", priority: 9,
    reliability_score: 0.95, freshness_requirement: "high",
    supports_fields: ["price.current", "valuation.pe", "market_cap", "revenue", "analyst.recommendation", "volume"],
    region: "GLOBAL", user_preferred: true,
    freshness: 0.9, cost: 0.0, latency: 500,
  },
  "fred": {
    source_name: "fred", category: "macro", priority: 9,
    reliability_score: 0.95, freshness_requirement: "medium",
    supports_fields: ["macro.primary_series", "macro.rate_context", "macro.trend", "macro.cross_asset_impact"],
    region: "US", user_preferred: true,
    freshness: 0.7, cost: 0.0, latency: 600,
  },
  "bloomberg": {
    source_name: "bloomberg", category: "financial", priority: 10,
    reliability_score: 0.98, freshness_requirement: "high",
    supports_fields: ["price.current", "valuation.pe", "market_cap", "analyst.target_price", "macro.primary_series"],
    region: "GLOBAL", user_preferred: true,
    freshness: 1.0, cost: 1.0, latency: 300,
  },
  "aqr": {
    source_name: "aqr", category: "research", priority: 8,
    reliability_score: 0.92, freshness_requirement: "low",
    supports_fields: ["research.factor_analysis", "research.risk_premia", "research.portfolio_construction"],
    region: "US", user_preferred: true,
    freshness: 0.2, cost: 0.0, latency: 2000,
  },
  "citadel": {
    source_name: "citadel", category: "research", priority: 8,
    reliability_score: 0.90, freshness_requirement: "low",
    supports_fields: ["research.market_microstructure", "research.quantitative_strategies"],
    region: "US", user_preferred: true,
    freshness: 0.2, cost: 0.0, latency: 2000,
  },
  "gmo": {
    source_name: "gmo", category: "research", priority: 8,
    reliability_score: 0.90, freshness_requirement: "low",
    supports_fields: ["research.asset_allocation", "research.valuation_framework", "research.macro_outlook"],
    region: "GLOBAL", user_preferred: true,
    freshness: 0.15, cost: 0.0, latency: 2000,
  },
  // ── Financial Data Sources ─────────────────────────────────────────────────
  "finnhub": {
    source_name: "finnhub", category: "financial", priority: 7,
    reliability_score: 0.90, freshness_requirement: "high",
    supports_fields: ["price.current", "analyst.target_price", "analyst.recommendation", "sentiment.signal"],
    region: "US", freshness: 1.0, cost: 0.3, latency: 400,
  },
  "fmp": {
    source_name: "fmp", category: "financial", priority: 7,
    reliability_score: 0.88, freshness_requirement: "medium",
    supports_fields: ["revenue", "net_income", "free_cash_flow", "valuation.pe", "peer.comparison"],
    region: "US", freshness: 0.8, cost: 0.4, latency: 600,
  },
  "polygon": {
    source_name: "polygon", category: "financial", priority: 7,
    reliability_score: 0.87, freshness_requirement: "high",
    supports_fields: ["price.current", "volume", "options.chain"],
    region: "US", freshness: 1.0, cost: 0.4, latency: 500,
  },
  "twelve_data": {
    source_name: "twelve_data", category: "financial", priority: 6,
    reliability_score: 0.85, freshness_requirement: "high",
    supports_fields: ["price.current", "technical.rsi", "technical.macd", "technical.bollinger"],
    region: "GLOBAL", freshness: 1.0, cost: 0.3, latency: 450,
  },
  "simfin": {
    source_name: "simfin", category: "financial", priority: 6,
    reliability_score: 0.88, freshness_requirement: "low",
    supports_fields: ["revenue", "net_income", "free_cash_flow", "valuation.pe"],
    region: "US", freshness: 0.6, cost: 0.2, latency: 800,
  },
  "tiingo": {
    source_name: "tiingo", category: "financial", priority: 6,
    reliability_score: 0.87, freshness_requirement: "medium",
    supports_fields: ["price.current", "revenue", "valuation.pe"],
    region: "US", freshness: 0.85, cost: 0.2, latency: 550,
  },
  "alpha_vantage": {
    source_name: "alpha_vantage", category: "financial", priority: 5,
    reliability_score: 0.80, freshness_requirement: "medium",
    supports_fields: ["technical.rsi", "technical.macd", "technical.bollinger", "price.current"],
    region: "US", freshness: 0.7, cost: 0.1, latency: 700,
  },
  // ── Macro Sources ──────────────────────────────────────────────────────────
  "world_bank": {
    source_name: "world_bank", category: "macro", priority: 7,
    reliability_score: 0.90, freshness_requirement: "low",
    supports_fields: ["macro.primary_series", "macro.trend", "macro.gdp", "macro.inflation"],
    region: "GLOBAL", freshness: 0.5, cost: 0.0, latency: 800,
  },
  "imf": {
    source_name: "imf", category: "macro", priority: 7,
    reliability_score: 0.88, freshness_requirement: "low",
    supports_fields: ["macro.primary_series", "macro.trend", "macro.gdp", "macro.inflation"],
    region: "GLOBAL", freshness: 0.4, cost: 0.0, latency: 1000,
  },
  "ecb": {
    source_name: "ecb", category: "macro", priority: 7,
    reliability_score: 0.88, freshness_requirement: "medium",
    supports_fields: ["macro.rate_context", "macro.primary_series"],
    region: "EU", freshness: 0.6, cost: 0.0, latency: 700,
  },
  "boe": {
    source_name: "boe", category: "macro", priority: 6,
    reliability_score: 0.87, freshness_requirement: "medium",
    supports_fields: ["macro.rate_context", "macro.primary_series"],
    region: "EU", freshness: 0.6, cost: 0.0, latency: 750,
  },
  "hkma": {
    source_name: "hkma", category: "macro", priority: 6,
    reliability_score: 0.87, freshness_requirement: "medium",
    supports_fields: ["macro.rate_context", "macro.primary_series"],
    region: "HK", freshness: 0.6, cost: 0.0, latency: 750,
  },
  // ── News & Sentiment ───────────────────────────────────────────────────────
  "news_api": {
    source_name: "news_api", category: "news", priority: 6,
    reliability_score: 0.80, freshness_requirement: "high",
    supports_fields: ["sentiment.signal", "news.recent"],
    region: "GLOBAL", freshness: 0.9, cost: 0.2, latency: 700,
  },
  "marketaux": {
    source_name: "marketaux", category: "news", priority: 6,
    reliability_score: 0.78, freshness_requirement: "high",
    supports_fields: ["sentiment.signal", "news.recent"],
    region: "US", freshness: 0.9, cost: 0.3, latency: 800,
  },
  "tavily": {
    source_name: "tavily", category: "news", priority: 7,
    reliability_score: 0.82, freshness_requirement: "high",
    supports_fields: ["news.recent", "policy_context", "macro.cross_asset_impact"],
    region: "GLOBAL", freshness: 1.0, cost: 0.3, latency: 1500,
  },
  // ── Crypto ────────────────────────────────────────────────────────────────
  "coingecko": {
    source_name: "coingecko", category: "financial", priority: 8,
    reliability_score: 0.90, freshness_requirement: "high",
    supports_fields: ["price.current", "volume", "onchain_or_exchange_signal_if_available"],
    region: "GLOBAL", freshness: 0.9, cost: 0.0, latency: 600,
  },
  // ── Regulatory ────────────────────────────────────────────────────────────
  "sec": {
    source_name: "sec", category: "regulatory", priority: 8,
    reliability_score: 0.95, freshness_requirement: "medium",
    supports_fields: ["sec.filings", "insider.transactions"],
    region: "US", freshness: 0.6, cost: 0.0, latency: 900,
  },
  "congress": {
    source_name: "congress", category: "regulatory", priority: 5,
    reliability_score: 0.75, freshness_requirement: "medium",
    supports_fields: ["policy_context"],
    region: "US", freshness: 0.8, cost: 0.0, latency: 900,
  },
};

// ── Task-type to category relevance map ──────────────────────────────────────
const TASK_TYPE_CATEGORY_RELEVANCE: Record<TaskType, Partial<Record<SourceCategory, number>>> = {
  stock_analysis:   { financial: 1.0, news: 0.7, research: 0.5, regulatory: 0.6, macro: 0.3, community: 0.2 },
  macro_analysis:   { macro: 1.0, news: 0.6, research: 0.5, financial: 0.3, regulatory: 0.2, community: 0.1 },
  crypto_analysis:  { financial: 1.0, news: 0.8, community: 0.6, macro: 0.3, research: 0.2, regulatory: 0.2 },
  portfolio_review: { financial: 0.9, research: 0.8, macro: 0.6, news: 0.4, regulatory: 0.3, community: 0.1 },
  event_driven:     { news: 1.0, financial: 0.7, regulatory: 0.6, macro: 0.4, research: 0.3, community: 0.3 },
  discussion:       { research: 0.8, news: 0.7, financial: 0.5, macro: 0.5, regulatory: 0.3, community: 0.4 },
  general:          { financial: 0.6, macro: 0.6, news: 0.6, research: 0.5, regulatory: 0.4, community: 0.3 },
};

// ── In-memory Health Cache (5-min TTL) ────────────────────────────────────────
const HEALTH_CACHE_TTL = 5 * 60 * 1000;
interface HealthCacheEntry { health: SourceHealth; timestamp: number; }
const healthCache = new Map<string, HealthCacheEntry>();

export function setSourceHealth(sourceName: string, health: SourceHealth): void {
  healthCache.set(sourceName, { health, timestamp: Date.now() });
}
export function getSourceHealth(sourceName: string): SourceHealth {
  const entry = healthCache.get(sourceName);
  if (!entry) return "unknown";
  if (Date.now() - entry.timestamp > HEALTH_CACHE_TTL) { healthCache.delete(sourceName); return "unknown"; }
  return entry.health;
}
export function clearExpiredHealthCache(): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(healthCache.entries())) {
    if (now - entry.timestamp > HEALTH_CACHE_TTL) healthCache.delete(key);
  }
}

// ── LEVEL1B Phase 2: Dynamic Scoring Engine ──────────────────────────────────
// Formula: score = reliability + relevance + freshness - penalty
export function scoreSourceDynamic(
  def: SourceDefinition,
  taskType: TaskType,
  region: Region,
  health: SourceHealth
): SourceScore {
  const categoryRelevance = TASK_TYPE_CATEGORY_RELEVANCE[taskType]?.[def.category] ?? 0.3;
  const regionRelevance = (def.region === region || def.region === "GLOBAL") ? 1.0 : 0.4;
  const userPreferredBonus = def.user_preferred ? 0.2 : 0.0;
  const healthPenalty = health === "error" ? 0.8 : health === "degraded" ? 0.3 : health === "unknown" ? 0.1 : 0.0;
  const score =
    def.reliability_score * 0.8 +
    categoryRelevance     * 0.5 +
    regionRelevance       * 0.3 +
    def.freshness         * 0.4 +
    userPreferredBonus    * 0.2 -
    healthPenalty;
  const reasons: string[] = [];
  if (def.user_preferred) reasons.push("user_preferred");
  if (categoryRelevance >= 0.8) reasons.push(`high_relevance_for_${taskType}`);
  if (regionRelevance >= 0.9) reasons.push(`region_match_${region}`);
  if (healthPenalty > 0) reasons.push(`health_penalty_${health}`);
  return { source_name: def.source_name, score: Math.max(0, score), reason: reasons.join(", ") || "standard_scoring" };
}

// ── LEVEL1B Phase 3: Source Selection Logic ──────────────────────────────────
export function selectTopSources(
  taskType: TaskType,
  region: Region,
  requiredFields: string[],
  maxSources = 3
): SelectedSource[] {
  clearExpiredHealthCache();
  const scored = Object.values(SOURCE_DEFINITIONS).map(def => {
    const health = getSourceHealth(def.source_name);
    const scoreResult = scoreSourceDynamic(def, taskType, region, health);
    const fieldCoverage = requiredFields.filter(f => def.supports_fields.includes(f)).length;
    const fieldBonus = fieldCoverage > 0 ? Math.min(fieldCoverage * 0.1, 0.3) : 0;
    return {
      ...def, health,
      final_score: scoreResult.score + fieldBonus,
      reason: scoreResult.reason + (fieldBonus > 0 ? `,covers_${fieldCoverage}_required_fields` : ""),
    };
  }).filter(s => s.health !== "error").sort((a, b) => b.final_score - a.final_score);

  const selected: SelectedSource[] = [];
  const usedCategories = new Set<SourceCategory>();
  let hasHighReliability = false;

  for (const s of scored) {
    if (selected.length >= maxSources) break;
    if (usedCategories.has(s.category) && selected.length >= 2) continue;
    selected.push({ source_name: s.source_name, score: s.final_score, category: s.category, reason: s.reason });
    usedCategories.add(s.category);
    if (s.reliability_score >= 0.88) hasHighReliability = true;
  }

  if (!hasHighReliability && selected.length > 0) {
    const highRel = scored.find(s => s.reliability_score >= 0.88 && !selected.find(x => x.source_name === s.source_name));
    if (highRel) {
      if (selected.length >= maxSources) selected.pop();
      selected.push({ source_name: highRel.source_name, score: highRel.final_score, category: highRel.category, reason: highRel.reason + ",forced_high_reliability" });
    }
  }
  return selected;
}

// ── LEVEL1B Phase 4: Multi-Source Validation ─────────────────────────────────
export function validateMultiSource(
  sourceResults: Array<{ source: string; value: number | string | null; field: string }>
): ValidationResult {
  if (sourceResults.length < 2) {
    return { consistency: true, confidence_adjustment: "neutral", conflict_fields: [], note: "single_source_no_validation" };
  }
  const conflictFields: string[] = [];
  const fieldGroups: Record<string, Array<number | string | null>> = {};
  for (const r of sourceResults) {
    if (!fieldGroups[r.field]) fieldGroups[r.field] = [];
    fieldGroups[r.field].push(r.value);
  }
  for (const [field, values] of Object.entries(fieldGroups)) {
    const numericValues = values.filter(v => typeof v === "number") as number[];
    if (numericValues.length >= 2) {
      const max = Math.max(...numericValues);
      const min = Math.min(...numericValues);
      const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      if (avg > 0 && (max - min) / avg > 0.15) conflictFields.push(field);
    }
    const stringValues = values.filter(v => typeof v === "string" && v) as string[];
    if (stringValues.length >= 2) {
      const unique = new Set(stringValues.map(s => s.toLowerCase().trim()));
      if (unique.size > 1) conflictFields.push(field);
    }
  }
  const consistency = conflictFields.length === 0;
  const confidence_adjustment: ValidationResult["confidence_adjustment"] =
    conflictFields.length > 0 ? "penalty" : sourceResults.length >= 3 ? "boost" : "neutral";
  return {
    consistency, confidence_adjustment, conflict_fields: conflictFields,
    note: consistency ? `${sourceResults.length} sources aligned` : `Conflict detected in: ${conflictFields.join(", ")}`,
  };
}

// ── V1.5 compat: field-level registry ────────────────────────────────────────
const SOURCE_REGISTRY: Record<string, SourceCandidate[]> = {
  "price.current": [
    { name: "yahoo_finance", reliability: 0.95, freshness: 0.9, cost: 0.0, latency: 500 },
    { name: "finnhub",       reliability: 0.90, freshness: 1.0, cost: 0.3, latency: 400 },
    { name: "fmp",           reliability: 0.88, freshness: 0.8, cost: 0.4, latency: 600 },
    { name: "twelve_data",   reliability: 0.85, freshness: 1.0, cost: 0.3, latency: 450 },
    { name: "polygon",       reliability: 0.87, freshness: 1.0, cost: 0.4, latency: 500 },
  ],
  "valuation.pe": [
    { name: "yahoo_finance", reliability: 0.92, freshness: 0.8, cost: 0.0, latency: 500 },
    { name: "fmp",           reliability: 0.90, freshness: 0.8, cost: 0.4, latency: 600 },
    { name: "finnhub",       reliability: 0.85, freshness: 0.8, cost: 0.3, latency: 400 },
  ],
  "market_cap": [
    { name: "yahoo_finance", reliability: 0.95, freshness: 0.9, cost: 0.0, latency: 500 },
    { name: "fmp",           reliability: 0.90, freshness: 0.8, cost: 0.4, latency: 600 },
    { name: "finnhub",       reliability: 0.88, freshness: 0.8, cost: 0.3, latency: 400 },
  ],
  "revenue": [
    { name: "fmp",    reliability: 0.92, freshness: 0.7, cost: 0.4, latency: 600 },
    { name: "simfin", reliability: 0.88, freshness: 0.6, cost: 0.2, latency: 800 },
    { name: "yahoo_finance", reliability: 0.85, freshness: 0.6, cost: 0.0, latency: 500 },
  ],
  "net_income": [
    { name: "fmp",    reliability: 0.92, freshness: 0.7, cost: 0.4, latency: 600 },
    { name: "simfin", reliability: 0.88, freshness: 0.6, cost: 0.2, latency: 800 },
  ],
  "free_cash_flow": [
    { name: "fmp",    reliability: 0.90, freshness: 0.7, cost: 0.4, latency: 600 },
    { name: "simfin", reliability: 0.85, freshness: 0.6, cost: 0.2, latency: 800 },
  ],
  "analyst.target_price": [
    { name: "finnhub", reliability: 0.85, freshness: 0.7, cost: 0.3, latency: 400 },
    { name: "fmp",     reliability: 0.82, freshness: 0.7, cost: 0.4, latency: 600 },
  ],
  "analyst.recommendation": [
    { name: "finnhub", reliability: 0.85, freshness: 0.7, cost: 0.3, latency: 400 },
    { name: "fmp",     reliability: 0.82, freshness: 0.7, cost: 0.4, latency: 600 },
  ],
  "sentiment.signal": [
    { name: "news_api",  reliability: 0.80, freshness: 0.9, cost: 0.2, latency: 700 },
    { name: "marketaux", reliability: 0.78, freshness: 0.9, cost: 0.3, latency: 800 },
    { name: "finnhub",   reliability: 0.75, freshness: 0.8, cost: 0.3, latency: 400 },
  ],
  "news.recent": [
    { name: "tavily",    reliability: 0.82, freshness: 1.0, cost: 0.3, latency: 1500 },
    { name: "news_api",  reliability: 0.80, freshness: 0.9, cost: 0.2, latency: 700 },
    { name: "marketaux", reliability: 0.78, freshness: 0.9, cost: 0.3, latency: 800 },
  ],
  "technical.rsi": [
    { name: "twelve_data",   reliability: 0.88, freshness: 1.0, cost: 0.3, latency: 450 },
    { name: "alpha_vantage", reliability: 0.80, freshness: 0.7, cost: 0.1, latency: 700 },
  ],
  "technical.macd": [
    { name: "twelve_data",   reliability: 0.88, freshness: 1.0, cost: 0.3, latency: 450 },
    { name: "alpha_vantage", reliability: 0.80, freshness: 0.7, cost: 0.1, latency: 700 },
  ],
  "technical.bollinger": [
    { name: "twelve_data",   reliability: 0.88, freshness: 1.0, cost: 0.3, latency: 450 },
    { name: "alpha_vantage", reliability: 0.80, freshness: 0.7, cost: 0.1, latency: 700 },
  ],
  "macro.primary_series": [
    { name: "fred",       reliability: 0.95, freshness: 0.7, cost: 0.0, latency: 600 },
    { name: "world_bank", reliability: 0.90, freshness: 0.5, cost: 0.0, latency: 800 },
    { name: "imf",        reliability: 0.88, freshness: 0.4, cost: 0.0, latency: 1000 },
  ],
  "macro.current_level": [
    { name: "fred",       reliability: 0.95, freshness: 0.7, cost: 0.0, latency: 600 },
    { name: "world_bank", reliability: 0.90, freshness: 0.5, cost: 0.0, latency: 800 },
  ],
  "macro.trend": [
    { name: "fred",       reliability: 0.93, freshness: 0.7, cost: 0.0, latency: 600 },
    { name: "world_bank", reliability: 0.88, freshness: 0.5, cost: 0.0, latency: 800 },
    { name: "imf",        reliability: 0.85, freshness: 0.4, cost: 0.0, latency: 1000 },
  ],
  "macro.cross_asset_impact": [
    { name: "fred",    reliability: 0.88, freshness: 0.7, cost: 0.0, latency: 600 },
    { name: "tavily",  reliability: 0.80, freshness: 1.0, cost: 0.3, latency: 1500 },
  ],
  "macro.rate_context": [
    { name: "fred",    reliability: 0.95, freshness: 0.7, cost: 0.0, latency: 600 },
    { name: "ecb",     reliability: 0.88, freshness: 0.6, cost: 0.0, latency: 700 },
  ],
  "volume": [
    { name: "coingecko",     reliability: 0.90, freshness: 0.9, cost: 0.0, latency: 600 },
    { name: "yahoo_finance", reliability: 0.85, freshness: 0.8, cost: 0.0, latency: 500 },
  ],
  "onchain_or_exchange_signal_if_available": [
    { name: "coingecko", reliability: 0.85, freshness: 0.9, cost: 0.0, latency: 600 },
  ],
  "peer.comparison": [
    { name: "fmp",     reliability: 0.85, freshness: 0.7, cost: 0.4, latency: 600 },
    { name: "finnhub", reliability: 0.80, freshness: 0.7, cost: 0.3, latency: 400 },
  ],
  "policy_context": [
    { name: "tavily",   reliability: 0.80, freshness: 1.0, cost: 0.3, latency: 1500 },
    { name: "congress", reliability: 0.75, freshness: 0.8, cost: 0.0, latency: 900 },
  ],
  "sec.filings": [
    { name: "sec", reliability: 0.95, freshness: 0.6, cost: 0.0, latency: 900 },
    { name: "fmp", reliability: 0.85, freshness: 0.6, cost: 0.4, latency: 600 },
  ],
  "insider.transactions": [
    { name: "sec",     reliability: 0.95, freshness: 0.6, cost: 0.0, latency: 900 },
    { name: "finnhub", reliability: 0.85, freshness: 0.7, cost: 0.3, latency: 400 },
  ],
};

// ── V1.5 compat: scoreSource ──────────────────────────────────────────────────
function scoreSource(candidate: SourceCandidate, health: SourceHealth): number {
  const healthScore = health === "active" ? 1.0 : health === "unknown" ? 0.7 : health === "degraded" ? 0.4 : 0.0;
  const latencyScore = Math.max(0, 1 - candidate.latency / 3000);
  return candidate.reliability * 0.8 + candidate.freshness * 0.6 + healthScore * 0.5 + latencyScore * 0.3 + (1 - candidate.cost) * 0.2;
}

// ── V1.5 compat: selectSourcesForFields ──────────────────────────────────────
export function selectSourcesForFields(fields: string[]): RouteResult[] {
  clearExpiredHealthCache();
  const results: RouteResult[] = [];
  for (const field of fields) {
    const candidates = SOURCE_REGISTRY[field];
    if (!candidates || candidates.length === 0) {
      results.push({ field, primary: "generic", fallbacks: [], score: 0, health: "unknown" });
      continue;
    }
    const scored = candidates.map(c => ({
      ...c, health: getSourceHealth(c.name), score: scoreSource(c, getSourceHealth(c.name)),
    })).sort((a, b) => b.score - a.score);
    const viable = scored.filter(s => s.health !== "error");
    const primary = viable[0] ?? scored[0];
    const fallbacks = (viable.length > 1 ? viable.slice(1, 3) : scored.slice(1, 3)).map(s => s.name);
    results.push({ field, primary: primary.name, fallbacks, score: primary.score, health: primary.health });
  }
  return results;
}

// ── LEVEL1B Phase 5: Full Pipeline Entry Point ────────────────────────────────
export function runSourceSelection(
  fields: string[],
  taskType: TaskType,
  region: Region,
  maxSources = 3
): SourceSelectionResult {
  const selectionLog: string[] = [];
  const selectedSources = selectTopSources(taskType, region, fields, maxSources);
  selectionLog.push(`[LEVEL1B] Task: ${taskType}, Region: ${region}, Fields: ${fields.join(", ")}`);
  selectionLog.push(`[LEVEL1B] Selected ${selectedSources.length} sources: ${selectedSources.map(s => s.source_name).join(", ")}`);
  const routeResults = selectSourcesForFields(fields);
  selectionLog.push(`[LEVEL1B] Field routes: ${routeResults.map(r => `${r.field}→${r.primary}`).join(", ")}`);
  const healthConflicts = selectedSources.filter(s => getSourceHealth(s.source_name) === "degraded");
  const validation: ValidationResult = {
    consistency: healthConflicts.length === 0,
    confidence_adjustment: healthConflicts.length > 0 ? "penalty" : "neutral",
    conflict_fields: [],
    note: healthConflicts.length > 0
      ? `Pre-fetch: ${healthConflicts.map(s => s.source_name).join(", ")} degraded`
      : "Pre-fetch: all selected sources healthy",
  };
  const fieldRouteTrace = buildFieldRouteTrace(routeResults);
  return { selected_sources: selectedSources, route_results: routeResults, validation, field_route_trace: fieldRouteTrace, selection_log: selectionLog };
}

// ── Directional Threshold Check (V1.5 compat) ─────────────────────────────────
export function isDirectionalThresholdReached(blockingFields: string[], satisfiedFields: Set<string>): boolean {
  return blockingFields.every(f => satisfiedFields.has(f));
}

// ── Build route trace (V1.5 compat) ──────────────────────────────────────────
export function buildFieldRouteTrace(routeResults: RouteResult[]): Record<string, string> {
  const trace: Record<string, string> = {};
  for (const r of routeResults) { trace[r.field] = r.primary; }
  return trace;
}
