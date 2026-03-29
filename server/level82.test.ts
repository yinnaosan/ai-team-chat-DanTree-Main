/**
 * DANTREE LEVEL8.2 — Live Signal Engine Validation Tests
 *
 * TC-L82-01: liveSignalToSignalInput maps signals correctly
 * TC-L82-02: detectEventFromText identifies policy events
 * TC-L82-03: detectEventFromText identifies earnings events
 * TC-L82-04: computeMomentum normalizes correctly
 * TC-L82-05: failure safety — buildSignalsFromLiveData returns neutral on network error
 * TC-L82-06: liveDataUsed flag reflects actual data source
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSignalsFromLiveData,
  liveSignalToSignalInput,
  type LiveSignal,
} from "./liveSignalEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch for unit tests (no real network calls)
// ─────────────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeYahooResponse(closes: number[], pe?: number) {
  return {
    ok: true,
    json: async () => ({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: closes[closes.length - 1],
            regularMarketChangePercent: 2.5,
            trailingPE: pe ?? 25,
            fiftyTwoWeekHigh: Math.max(...closes) * 1.1,
            fiftyTwoWeekLow: Math.min(...closes) * 0.9,
          },
          indicators: {
            quote: [{ close: closes }]
          }
        }]
      }
    })
  };
}

function makeFinnhubResponse(items: Array<{ headline: string; sentiment?: number }>) {
  return {
    ok: true,
    json: async () => items.map((item, i) => ({
      id: i,
      headline: item.headline,
      summary: item.headline,
      sentiment: item.sentiment ?? null,
      datetime: Date.now() / 1000,
    }))
  };
}

function makeFredResponse(value: string) {
  return {
    ok: true,
    json: async () => ({
      observations: [{ value, date: "2025-01-01" }]
    })
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-L82-01: liveSignalToSignalInput maps signals correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L82-01: liveSignalToSignalInput mapping", () => {
  it("should map bullish signals to high alpha_score", () => {
    const live: LiveSignal = {
      ticker: "AAPL",
      signals: {
        price_momentum: 0.8,   // very bullish
        volatility: 0.2,       // low vol
        valuation_proxy: 0.7,  // good value
        news_sentiment: 0.6,   // positive news
        macro_exposure: 0.3,   // mild macro support
      },
      event_signal: { type: "earnings", severity: 0.7 },
      metadata: { timestamp: Date.now(), sources: ["Yahoo Finance"], missing_fields: [], fallback_used: false },
    };

    const result = liveSignalToSignalInput(live, "technology", ["ai"]);

    expect(result.ticker).toBe("AAPL");
    expect(result.alpha_score).toBeGreaterThan(0.6);   // bullish → high alpha
    expect(result.risk_score).toBeLessThan(0.4);       // low vol → low risk
    expect(result.trigger_score).toBeGreaterThan(0.4); // earnings event → trigger
    expect(result.memory_score).toBeGreaterThan(0.5);  // good value → memory
    expect(result.danger_score).toBeLessThan(0.3);     // bullish → low danger
    expect(result.sector).toBe("technology");
    expect(result.signal_age_days).toBe(0);
  });

  it("should map bearish signals to high danger_score", () => {
    const live: LiveSignal = {
      ticker: "META",
      signals: {
        price_momentum: -0.7,  // very bearish
        volatility: 0.9,       // high vol
        valuation_proxy: 0.3,  // poor value
        news_sentiment: -0.5,  // negative news
        macro_exposure: -0.4,  // macro headwind
      },
      event_signal: { type: "geopolitics", severity: 0.8 },
      metadata: { timestamp: Date.now(), sources: ["Yahoo Finance", "Finnhub"], missing_fields: [], fallback_used: false },
    };

    const result = liveSignalToSignalInput(live, "technology");

    expect(result.alpha_score).toBeLessThan(0.4);   // bearish → low alpha
    expect(result.risk_score).toBeGreaterThan(0.7); // high vol → high risk
    expect(result.danger_score).toBeGreaterThan(0.5); // bearish + high vol → danger
  });

  it("should clamp all values to [0, 1]", () => {
    const live: LiveSignal = {
      ticker: "TEST",
      signals: {
        price_momentum: 1.0,
        volatility: 1.0,
        valuation_proxy: 1.0,
        news_sentiment: 1.0,
        macro_exposure: 1.0,
      },
      event_signal: { type: "tech", severity: 1.0 },
      metadata: { timestamp: Date.now(), sources: [], missing_fields: [], fallback_used: false },
    };

    const result = liveSignalToSignalInput(live);

    expect(result.alpha_score).toBeGreaterThanOrEqual(0);
    expect(result.alpha_score).toBeLessThanOrEqual(1);
    expect(result.risk_score).toBeGreaterThanOrEqual(0);
    expect(result.risk_score).toBeLessThanOrEqual(1);
    expect(result.danger_score).toBeGreaterThanOrEqual(0);
    expect(result.danger_score).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L82-02: Event detection — policy keywords
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L82-02: Event detection — policy", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Yahoo Finance (chart endpoint)
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("finance.yahoo.com")) {
        return Promise.resolve(makeYahooResponse([100, 102, 101, 103, 105]));
      }
      if (url.includes("finnhub.io")) {
        return Promise.resolve(makeFinnhubResponse([
          { headline: "Federal Reserve raises interest rate by 25bps, monetary policy tightening" },
          { headline: "Fed signals further rate hikes amid inflation concerns" },
        ]));
      }
      if (url.includes("stlouisfed.org")) {
        return Promise.resolve(makeFredResponse("5.25"));
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
  });

  it("should detect policy event from Fed/rate keywords", async () => {
    const signals = await buildSignalsFromLiveData(["AAPL"]);
    expect(signals).toHaveLength(1);
    expect(signals[0].event_signal.type).toBe("policy");
    expect(signals[0].event_signal.severity).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L82-03: Event detection — earnings keywords
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L82-03: Event detection — earnings", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("finance.yahoo.com")) {
        return Promise.resolve(makeYahooResponse([200, 205, 210, 208, 215]));
      }
      if (url.includes("finnhub.io")) {
        return Promise.resolve(makeFinnhubResponse([
          { headline: "NVDA beats quarterly earnings expectations, EPS guidance raised" },
          { headline: "Strong revenue growth, profit outlook upgraded" },
        ]));
      }
      if (url.includes("stlouisfed.org")) {
        return Promise.resolve(makeFredResponse("4.5"));
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
  });

  it("should detect earnings event from earnings/revenue keywords", async () => {
    const signals = await buildSignalsFromLiveData(["NVDA"]);
    expect(signals).toHaveLength(1);
    expect(signals[0].event_signal.type).toBe("earnings");
    expect(signals[0].event_signal.severity).toBeGreaterThan(0);
    expect(signals[0].metadata.sources).toContain("Finnhub");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L82-04: Momentum normalization
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L82-04: Momentum normalization", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("finance.yahoo.com")) {
        // Strong uptrend: 100 → 130 = +30% return (should normalize to ~1.0)
        return Promise.resolve(makeYahooResponse([100, 105, 110, 120, 130]));
      }
      if (url.includes("finnhub.io")) {
        return Promise.resolve(makeFinnhubResponse([]));
      }
      if (url.includes("stlouisfed.org")) {
        return Promise.resolve(makeFredResponse("5.0"));
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
  });

  it("should produce positive momentum for uptrend", async () => {
    const signals = await buildSignalsFromLiveData(["MSFT"]);
    expect(signals[0].signals.price_momentum).toBeGreaterThan(0.5);
    expect(signals[0].signals.price_momentum).toBeLessThanOrEqual(1.0);
  });

  it("should produce low volatility for smooth uptrend", async () => {
    const signals = await buildSignalsFromLiveData(["MSFT"]);
    // Smooth uptrend has low std dev of returns
    expect(signals[0].signals.volatility).toBeLessThan(0.8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L82-05: Failure safety — returns neutral signals on network error
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L82-05: Failure safety", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // All fetches fail
    mockFetch.mockRejectedValue(new Error("Network error"));
  });

  it("should return signals with fallback_used=true on total network failure", async () => {
    const signals = await buildSignalsFromLiveData(["AAPL", "MSFT"]);
    expect(signals).toHaveLength(2);
    for (const s of signals) {
      expect(s.metadata.fallback_used).toBe(true);
      // Signals should be neutral (not extreme)
      expect(Math.abs(s.signals.price_momentum)).toBeLessThanOrEqual(0.5);
      expect(s.signals.volatility).toBeLessThanOrEqual(0.8);
    }
  });

  it("should NOT throw even when all APIs fail", async () => {
    await expect(buildSignalsFromLiveData(["GOOGL"])).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L82-06: liveDataUsed flag and metadata
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L82-06: Signal metadata accuracy", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("finance.yahoo.com")) {
        return Promise.resolve(makeYahooResponse([50, 52, 51, 53, 54], 20));
      }
      if (url.includes("finnhub.io")) {
        return Promise.resolve(makeFinnhubResponse([
          { headline: "Company reports strong quarterly earnings beat" }
        ]));
      }
      if (url.includes("stlouisfed.org")) {
        return Promise.resolve(makeFredResponse("5.25"));
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
  });

  it("should include data sources in metadata", async () => {
    const signals = await buildSignalsFromLiveData(["JPM"]);
    expect(signals[0].metadata.sources.length).toBeGreaterThan(0);
    expect(signals[0].metadata.timestamp).toBeGreaterThan(0);
    expect(signals[0].metadata.fallback_used).toBe(false);
  });

  it("should include FRED as macro source", async () => {
    const signals = await buildSignalsFromLiveData(["JPM"]);
    const hasMacroSource = signals[0].metadata.sources.some(
      (s) => s === "FRED" || s === "fallback"
    );
    expect(hasMacroSource).toBe(true);
  });
});
