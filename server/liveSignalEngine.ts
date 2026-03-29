/**
 * DANTREE LEVEL8.2 — Live Signal Engine
 *
 * Replaces buildDemoSignals() with real market data from:
 * - Yahoo Finance (price momentum + volatility)
 * - Finnhub (news sentiment + event detection)
 * - FRED (macro exposure: Fed Funds Rate, 10Y yield)
 *
 * Rules:
 * - All signals normalized to -1..+1 or 0..1
 * - Missing data → fallback to neutral (0), NEVER crash
 * - Partial data → compute with available subset
 * - All failures logged with [SignalEngine] prefix
 */

import { ENV as env } from "./_core/env";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveSignal {
  ticker: string;
  signals: {
    price_momentum: number;   // -1 to +1: recent 20d return normalized
    volatility: number;       // 0 to 1: 20d std dev normalized
    valuation_proxy: number;  // 0 to 1: inverse PE ratio normalized (low PE = high score)
    news_sentiment: number;   // -1 to +1: avg Finnhub article sentiment
    macro_exposure: number;   // -1 to +1: rate sensitivity (negative = rate-sensitive)
  };
  event_signal: {
    type: "policy" | "tech" | "earnings" | "geopolitics" | "none";
    severity: number;         // 0 to 1
  };
  metadata: {
    timestamp: number;
    sources: string[];
    missing_fields: string[];
    fallback_used: boolean;
  };
}

interface YahooQuote {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  trailingPE?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketVolume?: number;
}

interface FinnhubNewsItem {
  headline?: string;
  summary?: string;
  sentiment?: number;
}

interface FredObservation {
  value: string;
  date: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Detection — keyword-based NLP (no ML, fast + cheap)
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_KEYWORDS: Record<string, string[]> = {
  policy:      ["fed", "rate", "interest rate", "central bank", "monetary", "fiscal", "regulation", "sec", "policy", "tariff", "sanction"],
  tech:        ["ai", "artificial intelligence", "chip", "semiconductor", "cloud", "software", "patent", "product launch", "innovation", "breakthrough"],
  earnings:    ["earnings", "revenue", "profit", "eps", "quarterly", "guidance", "beat", "miss", "outlook", "forecast"],
  geopolitics: ["war", "conflict", "trade war", "sanction", "geopolit", "election", "coup", "embargo", "military", "tension"],
};

function detectEventFromText(texts: string[]): { type: LiveSignal["event_signal"]["type"]; severity: number } {
  const combined = texts.join(" ").toLowerCase();
  const scores: Record<string, number> = { policy: 0, tech: 0, earnings: 0, geopolitics: 0 };

  for (const [type, keywords] of Object.entries(EVENT_KEYWORDS)) {
    for (const kw of keywords) {
      const count = (combined.match(new RegExp(kw, "g")) ?? []).length;
      scores[type] += count;
    }
  }

  const topEntry = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!topEntry || topEntry[1] === 0) return { type: "none", severity: 0 };

  const maxPossible = 8; // rough normalization cap
  const severity = Math.min(topEntry[1] / maxPossible, 1);
  return { type: topEntry[0] as LiveSignal["event_signal"]["type"], severity };
}

// ─────────────────────────────────────────────────────────────────────────────
// Yahoo Finance — price momentum + volatility + valuation proxy
// ─────────────────────────────────────────────────────────────────────────────

async function fetchYahooQuote(ticker: string): Promise<YahooQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DanTree/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json() as any;
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      regularMarketPrice: meta.regularMarketPrice,
      regularMarketChangePercent: meta.regularMarketChangePercent,
      trailingPE: meta.trailingPE,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    };
  } catch (err) {
    console.warn(`[SignalEngine] Yahoo Finance fetch failed for ${ticker}:`, (err as Error).message);
    return null;
  }
}

async function fetchYahooHistory(ticker: string): Promise<number[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DanTree/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json() as any;
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close as number[] | undefined;
    return (closes ?? []).filter((v) => typeof v === "number" && !isNaN(v));
  } catch {
    return [];
  }
}

function computeMomentum(closes: number[]): number {
  if (closes.length < 5) return 0;
  const first = closes[0];
  const last = closes[closes.length - 1];
  if (!first || first === 0) return 0;
  const ret = (last - first) / first; // e.g. +0.08 = +8%
  // Normalize: cap at ±30% → map to -1..+1
  return Math.max(-1, Math.min(1, ret / 0.30));
}

function computeVolatility(closes: number[]): number {
  if (closes.length < 5) return 0.5; // neutral fallback
  const returns = closes.slice(1).map((v, i) => (v - closes[i]) / closes[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  // Normalize: 0% std dev = 0, 5% std dev = 1 (cap)
  return Math.min(1, stdDev / 0.05);
}

function computeValuationProxy(pe: number | undefined): number {
  if (!pe || pe <= 0 || pe > 1000) return 0.5; // neutral
  // Inverse PE: low PE = high value score
  // PE 10 → 0.9, PE 25 → 0.6, PE 50 → 0.3, PE 100+ → 0.1
  return Math.max(0, Math.min(1, 1 - pe / 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// Finnhub — news sentiment + event detection
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFinnhubNews(ticker: string): Promise<FinnhubNewsItem[]> {
  try {
    const toDate = new Date().toISOString().split("T")[0];
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${fromDate}&to=${toDate}&token=${env.FINNHUB_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const items = await res.json() as any[];
    return (items ?? []).slice(0, 10).map((item: any) => ({
      headline: item.headline ?? "",
      summary: item.summary ?? "",
      sentiment: item.sentiment ?? null,
    }));
  } catch (err) {
    console.warn(`[SignalEngine] Finnhub news fetch failed for ${ticker}:`, (err as Error).message);
    return [];
  }
}

function computeNewsSentiment(items: FinnhubNewsItem[]): number {
  if (items.length === 0) return 0;
  // Use Finnhub's own sentiment if available, else keyword-based
  const withSentiment = items.filter((i) => typeof i.sentiment === "number");
  if (withSentiment.length > 0) {
    const avg = withSentiment.reduce((a, b) => a + (b.sentiment ?? 0), 0) / withSentiment.length;
    return Math.max(-1, Math.min(1, avg));
  }
  // Keyword fallback: positive/negative word count
  const positiveWords = ["beat", "growth", "record", "strong", "surge", "profit", "gain", "upgrade", "buy"];
  const negativeWords = ["miss", "decline", "loss", "weak", "cut", "downgrade", "sell", "risk", "concern", "drop"];
  let score = 0;
  for (const item of items) {
    const text = `${item.headline ?? ""} ${item.summary ?? ""}`.toLowerCase();
    for (const w of positiveWords) if (text.includes(w)) score += 0.1;
    for (const w of negativeWords) if (text.includes(w)) score -= 0.1;
  }
  return Math.max(-1, Math.min(1, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// FRED — macro exposure (Fed Funds Rate + 10Y yield)
// ─────────────────────────────────────────────────────────────────────────────

let _fredCache: { fedFunds: number; tenYear: number; ts: number } | null = null;
const FRED_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchFredSeries(seriesId: string): Promise<number | null> {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${env.FRED_API_KEY}&file_type=json&limit=5&sort_order=desc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json() as any;
    const obs: FredObservation[] = json?.observations ?? [];
    const latest = obs.find((o) => o.value !== "." && !isNaN(parseFloat(o.value)));
    return latest ? parseFloat(latest.value) : null;
  } catch (err) {
    console.warn(`[SignalEngine] FRED fetch failed for ${seriesId}:`, (err as Error).message);
    return null;
  }
}

async function getMacroContext(): Promise<{ fedFunds: number; tenYear: number }> {
  if (_fredCache && Date.now() - _fredCache.ts < FRED_CACHE_TTL_MS) {
    return { fedFunds: _fredCache.fedFunds, tenYear: _fredCache.tenYear };
  }
  const [fedFunds, tenYear] = await Promise.all([
    fetchFredSeries("FEDFUNDS"),
    fetchFredSeries("DGS10"),
  ]);
  const result = {
    fedFunds: fedFunds ?? 5.25, // fallback to recent known value
    tenYear: tenYear ?? 4.5,
  };
  _fredCache = { ...result, ts: Date.now() };
  console.log(`[SignalEngine] FRED macro: Fed Funds=${result.fedFunds}%, 10Y=${result.tenYear}%`);
  return result;
}

function computeMacroExposure(fedFunds: number, tenYear: number): number {
  // High rates = negative for rate-sensitive sectors
  // Normalize: Fed Funds 0% = +0.5 (supportive), 6% = -0.5 (restrictive)
  // Combined rate environment score
  const rateScore = (fedFunds + tenYear) / 2; // avg rate level
  // Map 0%→+1, 3%→0, 6%→-1
  return Math.max(-1, Math.min(1, 1 - rateScore / 3));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: buildSignalsFromLiveData
// ─────────────────────────────────────────────────────────────────────────────

export async function buildSignalsFromLiveData(tickers: string[]): Promise<LiveSignal[]> {
  console.log(`[SignalEngine] Building live signals for ${tickers.length} tickers: ${tickers.join(", ")}`);

  // Fetch macro once (shared across all tickers)
  let macroContext = { fedFunds: 5.25, tenYear: 4.5 };
  let macroSource = "fallback";
  try {
    macroContext = await getMacroContext();
    macroSource = "FRED";
  } catch {
    console.warn("[SignalEngine] FRED macro fetch failed, using fallback values");
  }

  // Fetch all tickers in parallel
  const results = await Promise.all(
    tickers.map(async (ticker): Promise<LiveSignal> => {
      const sources: string[] = [];
      const missingFields: string[] = [];
      let fallbackUsed = false;

      // --- Yahoo Finance ---
      let priceMomentum = 0;
      let volatility = 0.5;
      let valuationProxy = 0.5;

      const [quote, closes] = await Promise.all([
        fetchYahooQuote(ticker),
        fetchYahooHistory(ticker),
      ]);

      if (quote || closes.length > 0) {
        sources.push("Yahoo Finance");
        priceMomentum = closes.length >= 5 ? computeMomentum(closes) : 0;
        volatility = closes.length >= 5 ? computeVolatility(closes) : 0.5;
        valuationProxy = computeValuationProxy(quote?.trailingPE);
        if (closes.length < 5) { missingFields.push("price_history"); fallbackUsed = true; }
        if (!quote?.trailingPE) { missingFields.push("trailing_pe"); }
      } else {
        missingFields.push("yahoo_quote", "price_history");
        fallbackUsed = true;
        console.warn(`[SignalEngine] Yahoo Finance unavailable for ${ticker}, using neutral signals`);
      }

      // --- Finnhub News ---
      let newsSentiment = 0;
      let eventSignal: LiveSignal["event_signal"] = { type: "none", severity: 0 };

      const newsItems = await fetchFinnhubNews(ticker);
      if (newsItems.length > 0) {
        sources.push("Finnhub");
        newsSentiment = computeNewsSentiment(newsItems);
        const texts = newsItems.map((n) => `${n.headline ?? ""} ${n.summary ?? ""}`);
        eventSignal = detectEventFromText(texts);
        console.log(`[SignalEngine] ${ticker}: ${newsItems.length} news items, sentiment=${newsSentiment.toFixed(2)}, event=${eventSignal.type}(${eventSignal.severity.toFixed(2)})`);
      } else {
        missingFields.push("news_sentiment");
        fallbackUsed = true;
        console.warn(`[SignalEngine] Finnhub news unavailable for ${ticker}, sentiment=0`);
      }

      // --- Macro ---
      const macroExposure = computeMacroExposure(macroContext.fedFunds, macroContext.tenYear);
      sources.push(macroSource);

      console.log(`[SignalEngine] ${ticker} signals: momentum=${priceMomentum.toFixed(2)} vol=${volatility.toFixed(2)} val=${valuationProxy.toFixed(2)} news=${newsSentiment.toFixed(2)} macro=${macroExposure.toFixed(2)} fallback=${fallbackUsed}`);

      return {
        ticker,
        signals: {
          price_momentum: priceMomentum,
          volatility,
          valuation_proxy: valuationProxy,
          news_sentiment: newsSentiment,
          macro_exposure: macroExposure,
        },
        event_signal: eventSignal,
        metadata: {
          timestamp: Date.now(),
          sources,
          missing_fields: missingFields,
          fallback_used: fallbackUsed,
        },
      };
    })
  );

  const fallbackCount = results.filter((r) => r.metadata.fallback_used).length;
  console.log(`[SignalEngine] Complete: ${results.length} signals built, ${fallbackCount} used fallback`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert LiveSignal → SignalInput (for Level7 pipeline)
// ─────────────────────────────────────────────────────────────────────────────

export function liveSignalToSignalInput(
  live: LiveSignal,
  sector: string = "technology",
  themes: string[] = []
) {
  const s = live.signals;

  // Map live signals to Level7 SignalInput fields:
  // alpha_score: momentum + sentiment composite (higher = more bullish)
  // risk_score: volatility (higher = more risky)
  // trigger_score: event severity (higher = more urgent)
  // memory_score: valuation proxy (higher = better value)
  // danger_score: negative momentum + high volatility

  const alpha_score = Math.max(0, Math.min(1,
    (s.price_momentum + 1) / 2 * 0.5 +   // momentum: -1..+1 → 0..1, weight 50%
    (s.news_sentiment + 1) / 2 * 0.3 +    // sentiment: -1..+1 → 0..1, weight 30%
    (s.macro_exposure + 1) / 2 * 0.2      // macro: -1..+1 → 0..1, weight 20%
  ));

  const risk_score = Math.max(0, Math.min(1, s.volatility));

  const trigger_score = Math.max(0, Math.min(1,
    live.event_signal.severity * 0.6 +
    Math.max(0, s.price_momentum) * 0.4
  ));

  const memory_score = Math.max(0, Math.min(1, s.valuation_proxy));

  const danger_score = Math.max(0, Math.min(1,
    (s.volatility * 0.4) +
    Math.max(0, -s.price_momentum) * 0.4 +
    Math.max(0, -s.news_sentiment) * 0.2
  ));

  return {
    ticker: live.ticker,
    alpha_score,
    risk_score,
    trigger_score,
    memory_score,
    danger_score,
    sample_count: 10,
    sector: sector as any,
    themes: themes as any[],
    signal_age_days: 0, // fresh
  };
}
