/**
 * DANTREE LEVEL5 — Market Snapshot Provider
 *
 * Phase 1: Data Source Integration — Finnhub / TwelveData / Polygon / FMP (multi-source)
 * Phase 2: Snapshot Layer — Standardized MarketSnapshot format
 *
 * Design principles:
 * - Deterministic: no LLM calls
 * - Multi-source with graceful fallback (Finnhub → TwelveData → Polygon → FMP)
 * - Standardized MarketSnapshot format consumed by LEVEL4 TriggerInput
 * - All timestamps in UTC milliseconds
 * - auto_trade_allowed: ALWAYS false (safety invariant)
 */

// ── Standardized MarketSnapshot ───────────────────────────────────────────────

/**
 * Standardized market snapshot consumed by LEVEL4 trigger engine.
 * All numeric fields are optional — missing fields are treated as "not available".
 */
export interface MarketSnapshot {
  /** Primary ticker symbol (e.g., "AAPL") */
  ticker: string;

  /** Current price (latest trade or close) */
  current_price?: number;

  /** Previous close price */
  previous_price?: number;

  /** Price change amount (current - previous) */
  price_change?: number;

  /** Price change percentage */
  price_change_pct?: number;

  /** Intraday high */
  day_high?: number;

  /** Intraday low */
  day_low?: number;

  /** Opening price */
  open_price?: number;

  /** 52-week high */
  week52_high?: number;

  /** 52-week low */
  week52_low?: number;

  /** Volume */
  volume?: number;

  /** Market cap (in USD millions) */
  market_cap_usd_m?: number;

  /** P/E ratio */
  pe_ratio?: number;

  /** EPS (trailing twelve months) */
  eps_ttm?: number;

  /** Whether market is currently open */
  is_market_open?: boolean;

  /** Exchange name */
  exchange?: string;

  /** Currency */
  currency?: string;

  /** Company name */
  company_name?: string;

  /** Industry/sector */
  industry?: string;

  /** Whether earnings event was recently detected (within 7 days) */
  earnings_event_detected?: boolean;

  /** Risk score from LEVEL3 memory (0-1), if available */
  risk_score?: number;

  /** Previous risk score from LEVEL3 memory, if available */
  previous_risk_score?: number;

  /** Memory contradiction detected from LEVEL3 */
  memory_contradiction?: boolean;

  /** Memory contradiction type */
  memory_contradiction_type?: string;

  /** Learning threshold breach from LEVEL3.6 */
  learning_threshold_breach?: boolean;

  /** Failure intensity score from LEVEL3.6 (0-1) */
  failure_intensity_score?: number;

  /** Macro change detected */
  macro_change_detected?: boolean;

  /** Macro change magnitude (0-1) */
  macro_change_magnitude?: number;

  /** Current valuation metric (e.g., P/E) */
  current_valuation?: number;

  /** Previous valuation metric */
  previous_valuation?: number;

  /** Data source that provided this snapshot */
  data_source: "finnhub" | "twelve_data" | "polygon" | "fmp" | "mock" | "unavailable";

  /** UTC timestamp when snapshot was fetched */
  evaluated_at: number;

  /** Whether this snapshot is from a real data source (not mock) */
  is_real_data: boolean;

  /** Any fetch errors encountered (non-fatal) */
  fetch_errors?: string[];
}

/**
 * Batch snapshot map: ticker → MarketSnapshot
 */
export type SnapshotMap = Record<string, MarketSnapshot>;

// ── Source-specific fetch functions ──────────────────────────────────────────

/**
 * Fetch snapshot from Finnhub (primary source for US equities).
 * Returns null if Finnhub is not configured or request fails.
 */
async function fetchFromFinnhub(ticker: string): Promise<Partial<MarketSnapshot> | null> {
  try {
    const { getQuote, getCompanyProfile, getBasicFinancials, checkHealth } = await import("./finnhubApi");
    const health = await checkHealth();
    if (!health.ok) return null;

    const [quote, profile, metrics] = await Promise.allSettled([
      getQuote(ticker),
      getCompanyProfile(ticker),
      getBasicFinancials(ticker),
    ]);

    const q = quote.status === "fulfilled" ? quote.value : null;
    const p = profile.status === "fulfilled" ? profile.value : null;
    const m = metrics.status === "fulfilled" ? metrics.value : null;

    if (!q || q.c === 0) return null;

    return {
      current_price: q.c,
      previous_price: q.pc,
      price_change: q.d,
      price_change_pct: q.dp,
      day_high: q.h,
      day_low: q.l,
      open_price: q.o,
      market_cap_usd_m: p?.marketCapitalization ?? undefined,
      company_name: p?.name ?? undefined,
      industry: p?.finnhubIndustry ?? undefined,
      exchange: p?.exchange ?? undefined,
      currency: p?.currency ?? undefined,
      pe_ratio: (m as any)?.metric?.peBasicExclExtraTTM ?? undefined,
      eps_ttm: (m as any)?.metric?.epsTTM ?? undefined,
      week52_high: (m as any)?.metric?.["52WeekHigh"] ?? undefined,
      week52_low: (m as any)?.metric?.["52WeekLow"] ?? undefined,
      data_source: "finnhub",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch snapshot from TwelveData (fallback for US + international equities).
 * Returns null if TwelveData is not configured or request fails.
 */
async function fetchFromTwelveData(ticker: string): Promise<Partial<MarketSnapshot> | null> {
  try {
    const { getTwelveDataQuote, isTwelveDataConfigured } = await import("./twelveDataApi");
    if (!isTwelveDataConfigured()) return null;

    const quote = await getTwelveDataQuote(ticker);
    if (!quote || !quote.close) return null;

    const currentPrice = parseFloat(quote.close);
    const prevClose = parseFloat(quote.previous_close || "0");
    const change = parseFloat(quote.change || "0");
    const changePct = parseFloat(quote.percent_change || "0");

    if (isNaN(currentPrice) || currentPrice === 0) return null;

    return {
      current_price: currentPrice,
      previous_price: prevClose || undefined,
      price_change: change,
      price_change_pct: changePct,
      day_high: parseFloat(quote.high) || undefined,
      day_low: parseFloat(quote.low) || undefined,
      open_price: parseFloat(quote.open) || undefined,
      week52_high: parseFloat(quote.fifty_two_week?.high || "0") || undefined,
      week52_low: parseFloat(quote.fifty_two_week?.low || "0") || undefined,
      volume: parseFloat(quote.volume || "0") || undefined,
      is_market_open: quote.is_market_open,
      exchange: quote.exchange ?? undefined,
      currency: quote.currency ?? undefined,
      company_name: quote.name ?? undefined,
      data_source: "twelve_data",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch snapshot from Polygon (fallback for US equities + options data).
 * Returns null if Polygon is not configured or request fails.
 */
async function fetchFromPolygon(ticker: string): Promise<Partial<MarketSnapshot> | null> {
  try {
    const { getStockFullData } = await import("./polygonApi");
    const data = await getStockFullData(ticker);
    if (!data) return null;

    const quote = (data as any).quote;
    if (!quote) return null;

    return {
      current_price: quote.last?.price ?? quote.prevDay?.c ?? undefined,
      previous_price: quote.prevDay?.c ?? undefined,
      price_change: quote.todaysChange ?? undefined,
      price_change_pct: quote.todaysChangePerc ?? undefined,
      day_high: quote.day?.h ?? undefined,
      day_low: quote.day?.l ?? undefined,
      open_price: quote.day?.o ?? undefined,
      volume: quote.day?.v ?? undefined,
      data_source: "polygon",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch snapshot from FMP (Financial Modeling Prep) — fallback.
 * Returns null if FMP is not configured or request fails.
 */
async function fetchFromFmp(ticker: string): Promise<Partial<MarketSnapshot> | null> {
  try {
    const { getStockFullData } = await import("./fmpApi");
    const data = await getStockFullData(ticker);
    if (!data) return null;

    const profile = (data as any).profile;
    const quote = (data as any).quote;
    if (!quote) return null;

    return {
      current_price: quote.price ?? undefined,
      previous_price: quote.previousClose ?? undefined,
      price_change: quote.change ?? undefined,
      price_change_pct: quote.changesPercentage ?? undefined,
      day_high: quote.dayHigh ?? undefined,
      day_low: quote.dayLow ?? undefined,
      open_price: quote.open ?? undefined,
      volume: quote.volume ?? undefined,
      market_cap_usd_m: quote.marketCap ? quote.marketCap / 1_000_000 : undefined,
      pe_ratio: quote.pe ?? undefined,
      eps_ttm: quote.eps ?? undefined,
      company_name: profile?.companyName ?? undefined,
      industry: profile?.industry ?? undefined,
      exchange: profile?.exchange ?? undefined,
      currency: profile?.currency ?? undefined,
      week52_high: quote.yearHigh ?? undefined,
      week52_low: quote.yearLow ?? undefined,
      data_source: "fmp",
    };
  } catch {
    return null;
  }
}

// ── Core getMarketSnapshot ────────────────────────────────────────────────────

/**
 * Get a standardized MarketSnapshot for a single ticker.
 *
 * Source priority: Finnhub → TwelveData → Polygon → FMP → unavailable
 *
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @param memoryContext - Optional LEVEL3 memory context to enrich snapshot
 */
export async function getMarketSnapshot(
  ticker: string,
  memoryContext?: {
    risk_score?: number;
    previous_risk_score?: number;
    memory_contradiction?: boolean;
    memory_contradiction_type?: string;
    learning_threshold_breach?: boolean;
    failure_intensity_score?: number;
  }
): Promise<MarketSnapshot> {
  const fetchErrors: string[] = [];
  const now = Date.now();

  // Try sources in priority order
  let partial: Partial<MarketSnapshot> | null = null;

  // 1. Finnhub (primary)
  try {
    partial = await fetchFromFinnhub(ticker);
  } catch (e) {
    fetchErrors.push(`finnhub: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. TwelveData (fallback)
  if (!partial) {
    try {
      partial = await fetchFromTwelveData(ticker);
    } catch (e) {
      fetchErrors.push(`twelve_data: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. Polygon (fallback)
  if (!partial) {
    try {
      partial = await fetchFromPolygon(ticker);
    } catch (e) {
      fetchErrors.push(`polygon: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 4. FMP (last resort)
  if (!partial) {
    try {
      partial = await fetchFromFmp(ticker);
    } catch (e) {
      fetchErrors.push(`fmp: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const isRealData = partial !== null;
  const source = partial?.data_source ?? "unavailable";

  // Build final snapshot
  const snapshot: MarketSnapshot = {
    ticker,
    evaluated_at: now,
    is_real_data: isRealData,
    data_source: source as MarketSnapshot["data_source"],
    fetch_errors: fetchErrors.length > 0 ? fetchErrors : undefined,

    // Price data from source
    current_price: partial?.current_price,
    previous_price: partial?.previous_price,
    price_change: partial?.price_change,
    price_change_pct: partial?.price_change_pct,
    day_high: partial?.day_high,
    day_low: partial?.day_low,
    open_price: partial?.open_price,
    week52_high: partial?.week52_high,
    week52_low: partial?.week52_low,
    volume: partial?.volume,
    market_cap_usd_m: partial?.market_cap_usd_m,
    pe_ratio: partial?.pe_ratio,
    eps_ttm: partial?.eps_ttm,
    is_market_open: partial?.is_market_open,
    exchange: partial?.exchange,
    currency: partial?.currency,
    company_name: partial?.company_name,
    industry: partial?.industry,

    // Valuation (use P/E as primary valuation metric)
    current_valuation: partial?.pe_ratio,

    // LEVEL3 memory enrichment
    risk_score: memoryContext?.risk_score,
    previous_risk_score: memoryContext?.previous_risk_score,
    memory_contradiction: memoryContext?.memory_contradiction,
    memory_contradiction_type: memoryContext?.memory_contradiction_type,
    learning_threshold_breach: memoryContext?.learning_threshold_breach,
    failure_intensity_score: memoryContext?.failure_intensity_score,
  };

  return snapshot;
}

/**
 * Get snapshots for multiple tickers in parallel.
 * Returns a map of ticker → MarketSnapshot.
 *
 * @param tickers - Array of ticker symbols
 * @param memoryContextMap - Optional map of ticker → memory context
 * @param concurrency - Max parallel requests (default: 5)
 */
export async function getBatchSnapshots(
  tickers: string[],
  memoryContextMap?: Record<string, Parameters<typeof getMarketSnapshot>[1]>,
  concurrency = 5
): Promise<SnapshotMap> {
  const result: SnapshotMap = {};
  const unique = Array.from(new Set(tickers));

  // Process in batches to respect rate limits
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(ticker =>
        getMarketSnapshot(ticker, memoryContextMap?.[ticker])
      )
    );
    for (let j = 0; j < batch.length; j++) {
      const ticker = batch[j];
      const res = settled[j];
      if (res.status === "fulfilled") {
        result[ticker] = res.value;
      } else {
        // Create unavailable snapshot on total failure
        result[ticker] = {
          ticker,
          evaluated_at: Date.now(),
          is_real_data: false,
          data_source: "unavailable",
          fetch_errors: [res.reason instanceof Error ? res.reason.message : String(res.reason)],
        };
      }
    }
  }

  return result;
}

// ── Snapshot → TriggerInput adapter ──────────────────────────────────────────

/**
 * Convert a MarketSnapshot to a LEVEL4 TriggerInput.
 * This is the bridge between LEVEL5 real data and LEVEL4 trigger engine.
 */
export function snapshotToTriggerInput(snapshot: MarketSnapshot): import("./watchlistEngine").TriggerInput {
  return {
    current_price: snapshot.current_price,
    previous_price: snapshot.previous_price,
    current_valuation: snapshot.current_valuation,
    previous_valuation: snapshot.previous_valuation,
    earnings_event_detected: snapshot.earnings_event_detected ?? false,
    macro_change_detected: snapshot.macro_change_detected ?? false,
    macro_change_magnitude: snapshot.macro_change_magnitude,
    risk_score: snapshot.risk_score,
    previous_risk_score: snapshot.previous_risk_score,
    memory_contradiction: snapshot.memory_contradiction ?? false,
    memory_contradiction_type: snapshot.memory_contradiction_type,
    learning_threshold_breach: snapshot.learning_threshold_breach ?? false,
    failure_intensity_score: snapshot.failure_intensity_score,
    evaluated_at: snapshot.evaluated_at,
  };
}

// ── Snapshot quality assessment ───────────────────────────────────────────────

/**
 * Assess the quality of a snapshot.
 * Returns a quality score (0-1) and a list of missing fields.
 */
export function assessSnapshotQuality(snapshot: MarketSnapshot): {
  score: number;
  missing_fields: string[];
  is_usable: boolean;
} {
  const coreFields: (keyof MarketSnapshot)[] = [
    "current_price",
    "previous_price",
    "price_change_pct",
  ];
  const enrichedFields: (keyof MarketSnapshot)[] = [
    "day_high",
    "day_low",
    "volume",
    "pe_ratio",
    "market_cap_usd_m",
  ];

  const missingCore = coreFields.filter(f => snapshot[f] === undefined || snapshot[f] === null);
  const missingEnriched = enrichedFields.filter(f => snapshot[f] === undefined || snapshot[f] === null);
  const allMissing = [...missingCore, ...missingEnriched];

  // Core fields are required for trigger evaluation
  const coreScore = (coreFields.length - missingCore.length) / coreFields.length;
  const enrichedScore = (enrichedFields.length - missingEnriched.length) / enrichedFields.length;
  const score = coreScore * 0.7 + enrichedScore * 0.3;

  return {
    score: Math.round(score * 100) / 100,
    missing_fields: allMissing as string[],
    is_usable: missingCore.length === 0, // Usable only if all core fields present
  };
}

// ── Mock snapshot factory (for testing) ──────────────────────────────────────

/**
 * Create a mock MarketSnapshot for testing purposes.
 * Never use in production.
 */
export function createMockSnapshot(
  ticker: string,
  overrides: Partial<MarketSnapshot> = {}
): MarketSnapshot {
  return {
    ticker,
    current_price: 150.0,
    previous_price: 145.0,
    price_change: 5.0,
    price_change_pct: 3.45,
    day_high: 152.0,
    day_low: 148.0,
    open_price: 146.0,
    week52_high: 180.0,
    week52_low: 120.0,
    volume: 50_000_000,
    market_cap_usd_m: 2_400_000,
    pe_ratio: 28.5,
    eps_ttm: 5.26,
    is_market_open: true,
    exchange: "NASDAQ",
    currency: "USD",
    company_name: `Mock Corp (${ticker})`,
    industry: "Technology",
    current_valuation: 28.5,
    data_source: "mock",
    evaluated_at: Date.now(),
    is_real_data: false,
    ...overrides,
  };
}
