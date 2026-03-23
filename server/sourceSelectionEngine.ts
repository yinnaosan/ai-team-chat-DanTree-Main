/**
 * SOURCE_SELECTION_ENGINE (V1.5)
 * 
 * Provides field-level source routing with in-memory health cache (5-min TTL).
 * Priority order: field_coverage > reliability > freshness > health > latency > cost
 * 
 * Design principles:
 * - No new LLM calls
 * - No major source connector rewrite
 * - Simple route scoring, extensible in V2
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type SourceHealth = "active" | "degraded" | "error" | "unknown";

export interface SourceCandidate {
  name: string;
  reliability: number;   // 0-1: historical success rate
  freshness: number;     // 0-1: 1=realtime, 0=stale
  cost: number;          // 0-1: 0=free, 1=expensive
  latency: number;       // estimated ms
}

export interface RouteResult {
  field: string;
  primary: string;
  fallbacks: string[];
  score: number;
  health: SourceHealth;
}

// ── Source Registry: field → candidate sources ────────────────────────────────

const SOURCE_REGISTRY: Record<string, SourceCandidate[]> = {
  // Price & valuation
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
  // Financials
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
  // Analyst
  "analyst.target_price": [
    { name: "finnhub", reliability: 0.85, freshness: 0.7, cost: 0.3, latency: 400 },
    { name: "fmp",     reliability: 0.82, freshness: 0.7, cost: 0.4, latency: 600 },
  ],
  "analyst.recommendation": [
    { name: "finnhub", reliability: 0.85, freshness: 0.7, cost: 0.3, latency: 400 },
    { name: "fmp",     reliability: 0.82, freshness: 0.7, cost: 0.4, latency: 600 },
  ],
  // Sentiment
  "sentiment.signal": [
    { name: "news_api",  reliability: 0.80, freshness: 0.9, cost: 0.2, latency: 700 },
    { name: "marketaux", reliability: 0.78, freshness: 0.9, cost: 0.3, latency: 800 },
    { name: "tavily",    reliability: 0.82, freshness: 1.0, cost: 0.3, latency: 1500 },
  ],
  // Macro
  "macro.primary_series": [
    { name: "fred",       reliability: 0.95, freshness: 0.7, cost: 0.0, latency: 600 },
    { name: "world_bank", reliability: 0.90, freshness: 0.5, cost: 0.0, latency: 800 },
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
  // Crypto
  "volume": [
    { name: "coingecko",   reliability: 0.90, freshness: 0.9, cost: 0.0, latency: 600 },
    { name: "yahoo_finance", reliability: 0.85, freshness: 0.8, cost: 0.0, latency: 500 },
  ],
  "onchain_or_exchange_signal_if_available": [
    { name: "coingecko", reliability: 0.85, freshness: 0.9, cost: 0.0, latency: 600 },
  ],
  // Peer comparison
  "peer.comparison": [
    { name: "fmp",    reliability: 0.85, freshness: 0.7, cost: 0.4, latency: 600 },
    { name: "finnhub", reliability: 0.80, freshness: 0.7, cost: 0.3, latency: 400 },
  ],
  // Policy
  "policy_context": [
    { name: "tavily",   reliability: 0.80, freshness: 1.0, cost: 0.3, latency: 1500 },
    { name: "congress", reliability: 0.75, freshness: 0.8, cost: 0.0, latency: 900 },
  ],
};

// ── In-memory Health Cache (5-min TTL) ────────────────────────────────────────

const HEALTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface HealthCacheEntry {
  health: SourceHealth;
  timestamp: number;
}

const healthCache = new Map<string, HealthCacheEntry>();

export function setSourceHealth(sourceName: string, health: SourceHealth): void {
  healthCache.set(sourceName, { health, timestamp: Date.now() });
}

export function getSourceHealth(sourceName: string): SourceHealth {
  const entry = healthCache.get(sourceName);
  if (!entry) return "unknown";
  if (Date.now() - entry.timestamp > HEALTH_CACHE_TTL) {
    healthCache.delete(sourceName);
    return "unknown";
  }
  return entry.health;
}

export function clearExpiredHealthCache(): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(healthCache.entries())) {
    if (now - entry.timestamp > HEALTH_CACHE_TTL) {
      healthCache.delete(key);
    }
  }
}

// ── Route Scoring ─────────────────────────────────────────────────────────────
// Priority: field_coverage(1.0) > reliability(0.8) > freshness(0.6) > health(0.5) > latency(0.3) > cost(0.2)

function scoreSource(candidate: SourceCandidate, health: SourceHealth): number {
  const healthScore = health === "active" ? 1.0
    : health === "unknown" ? 0.7
    : health === "degraded" ? 0.4
    : 0.0; // error

  const latencyScore = Math.max(0, 1 - candidate.latency / 3000); // normalize to 0-1 (3s = 0)

  return (
    candidate.reliability * 0.8 +
    candidate.freshness   * 0.6 +
    healthScore           * 0.5 +
    latencyScore          * 0.3 +
    (1 - candidate.cost)  * 0.2
  );
}

// ── Main: selectSourcesForFields ─────────────────────────────────────────────

export function selectSourcesForFields(fields: string[]): RouteResult[] {
  clearExpiredHealthCache();
  const results: RouteResult[] = [];

  for (const field of fields) {
    const candidates = SOURCE_REGISTRY[field];
    if (!candidates || candidates.length === 0) {
      results.push({ field, primary: "generic", fallbacks: [], score: 0, health: "unknown" });
      continue;
    }

    // Score all candidates
    const scored = candidates.map(c => ({
      ...c,
      health: getSourceHealth(c.name),
      score: scoreSource(c, getSourceHealth(c.name)),
    })).sort((a, b) => b.score - a.score);

    // Filter out error sources for primary (use as fallback only)
    const viable = scored.filter(s => s.health !== "error");
    const primary = viable[0] ?? scored[0];
    const fallbacks = (viable.length > 1 ? viable.slice(1, 3) : scored.slice(1, 3)).map(s => s.name);

    results.push({
      field,
      primary: primary.name,
      fallbacks,
      score: primary.score,
      health: primary.health,
    });
  }

  return results;
}

// ── Directional Threshold Check ───────────────────────────────────────────────
// If core blocking fields are satisfied, stop optional source expansion

export function isDirectionalThresholdReached(
  blockingFields: string[],
  satisfiedFields: Set<string>
): boolean {
  return blockingFields.every(f => satisfiedFields.has(f));
}

// ── Build route trace for DATA_PACKET_WRAPPER ─────────────────────────────────

export function buildFieldRouteTrace(routeResults: RouteResult[]): Record<string, string> {
  const trace: Record<string, string> = {};
  for (const r of routeResults) {
    trace[r.field] = r.primary;
  }
  return trace;
}
