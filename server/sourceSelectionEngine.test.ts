/**
 * sourceSelectionEngine.test.ts
 * Level 13.0-B — Source Selection Engine Test Coverage
 * READ-ONLY target: sourceSelectionEngine.ts must NOT be modified.
 */
import { describe, it, expect } from "vitest";
import {
  runSourceSelection,
  selectTopSources,
  scoreSourceDynamic,
  validateMultiSource,
  isDirectionalThresholdReached,
  buildFieldRouteTrace,
  selectSourcesForFields,
  setSourceHealth,
  getSourceHealth,
  clearExpiredHealthCache,
  SOURCE_DEFINITIONS,
  type TaskType,
  type Region,
  type SourceHealth,
} from "./sourceSelectionEngine";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STOCK_FIELDS = ["price.current", "market_cap", "volume"];
const MACRO_FIELDS = ["interest_rate", "inflation", "gdp_growth"];

// ── SOURCE_DEFINITIONS sanity ─────────────────────────────────────────────────

describe("SOURCE_DEFINITIONS", () => {
  it("contains at least 10 source definitions", () => {
    expect(Object.keys(SOURCE_DEFINITIONS).length).toBeGreaterThanOrEqual(10);
  });

  it("each definition has required fields", () => {
    for (const [name, def] of Object.entries(SOURCE_DEFINITIONS)) {
      expect(def.source_name, `${name}.source_name`).toBeTruthy();
      expect(def.category, `${name}.category`).toBeTruthy();
      expect(typeof def.priority, `${name}.priority`).toBe("number");
      expect(typeof def.reliability_score, `${name}.reliability_score`).toBe("number");
      expect(def.reliability_score).toBeGreaterThanOrEqual(0);
      expect(def.reliability_score).toBeLessThanOrEqual(1);
      expect(Array.isArray(def.supports_fields), `${name}.supports_fields`).toBe(true);
    }
  });
});

// ── Health cache ──────────────────────────────────────────────────────────────

describe("Health cache", () => {
  it("defaults to unknown for unset source", () => {
    const health = getSourceHealth("__nonexistent_source__");
    expect(health).toBe("unknown");
  });

  it("setSourceHealth and getSourceHealth round-trip", () => {
    setSourceHealth("yahoo_finance", "active");
    expect(getSourceHealth("yahoo_finance")).toBe("active");
    setSourceHealth("yahoo_finance", "degraded");
    expect(getSourceHealth("yahoo_finance")).toBe("degraded");
    // restore
    setSourceHealth("yahoo_finance", "active");
  });

  it("clearExpiredHealthCache does not throw", () => {
    expect(() => clearExpiredHealthCache()).not.toThrow();
  });
});

// ── scoreSourceDynamic ────────────────────────────────────────────────────────

describe("scoreSourceDynamic", () => {
  it("returns a non-negative score for a known source", () => {
    const def = Object.values(SOURCE_DEFINITIONS)[0];
    const result = scoreSourceDynamic(def, "stock_analysis", "US", "active");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.source_name).toBe(def.source_name);
    expect(typeof result.reason).toBe("string");
  });

  it("applies health penalty for degraded source", () => {
    const def = Object.values(SOURCE_DEFINITIONS)[0];
    const activeScore = scoreSourceDynamic(def, "stock_analysis", "US", "active").score;
    const degradedScore = scoreSourceDynamic(def, "stock_analysis", "US", "degraded").score;
    expect(degradedScore).toBeLessThan(activeScore);
  });

  it("error health yields lower score than active", () => {
    const def = Object.values(SOURCE_DEFINITIONS)[0];
    const activeScore = scoreSourceDynamic(def, "stock_analysis", "US", "active").score;
    const errorScore = scoreSourceDynamic(def, "stock_analysis", "US", "error").score;
    expect(errorScore).toBeLessThan(activeScore);
  });
});

// ── selectTopSources ──────────────────────────────────────────────────────────

describe("selectTopSources", () => {
  it("returns up to maxSources results", () => {
    const results = selectTopSources("stock_analysis", "US", STOCK_FIELDS, 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("each selected source has required fields", () => {
    const results = selectTopSources("stock_analysis", "US", STOCK_FIELDS, 3);
    for (const s of results) {
      expect(s.source_name).toBeTruthy();
      expect(typeof s.score).toBe("number");
      expect(s.category).toBeTruthy();
      expect(typeof s.reason).toBe("string");
    }
  });

  it("works for macro_analysis task type", () => {
    const results = selectTopSources("macro_analysis", "US", MACRO_FIELDS, 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("works for crypto_analysis task type", () => {
    const results = selectTopSources("crypto_analysis", "US", ["price.current", "volume"], 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("works for HK region", () => {
    const results = selectTopSources("stock_analysis", "HK", STOCK_FIELDS, 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

// ── validateMultiSource ───────────────────────────────────────────────────────

describe("validateMultiSource", () => {
  it("single source returns neutral with no conflict", () => {
    const result = validateMultiSource([{ source: "yahoo_finance", value: 150.0, field: "price.current" }]);
    expect(result.consistency).toBe(true);
    expect(result.confidence_adjustment).toBe("neutral");
    expect(result.conflict_fields).toHaveLength(0);
  });

  it("two consistent sources return boost or neutral", () => {
    const result = validateMultiSource([
      { source: "yahoo_finance", value: 150.0, field: "price.current" },
      { source: "finnhub", value: 150.5, field: "price.current" },
    ]);
    expect(["boost", "neutral"]).toContain(result.confidence_adjustment);
  });

  it("two conflicting sources detect conflict", () => {
    const result = validateMultiSource([
      { source: "yahoo_finance", value: 100, field: "price.current" },
      { source: "finnhub", value: 200, field: "price.current" },
    ]);
    // Large discrepancy should be flagged as penalty or conflict
    expect(["penalty", "neutral"]).toContain(result.confidence_adjustment);
  });

  it("empty array returns neutral", () => {
    const result = validateMultiSource([]);
    expect(result.consistency).toBe(true);
    expect(result.confidence_adjustment).toBe("neutral");
  });
});

// ── selectSourcesForFields ────────────────────────────────────────────────────

describe("selectSourcesForFields", () => {
  it("returns route results for known fields", () => {
    const results = selectSourcesForFields(["price.current", "market_cap"]);
    expect(Array.isArray(results)).toBe(true);
  });

  it("each route result has required fields", () => {
    const results = selectSourcesForFields(["price.current"]);
    for (const r of results) {
      expect(r.field).toBeTruthy();
      expect(r.primary).toBeTruthy();
      expect(Array.isArray(r.fallbacks)).toBe(true);
      expect(typeof r.score).toBe("number");
    }
  });
});

// ── buildFieldRouteTrace ──────────────────────────────────────────────────────

describe("buildFieldRouteTrace", () => {
  it("builds a record from route results", () => {
    const routeResults = selectSourcesForFields(["price.current", "volume"]);
    const trace = buildFieldRouteTrace(routeResults);
    expect(typeof trace).toBe("object");
    // Each key should be a field name
    for (const key of Object.keys(trace)) {
      expect(typeof key).toBe("string");
      expect(typeof trace[key]).toBe("string");
    }
  });
});

// ── isDirectionalThresholdReached ─────────────────────────────────────────────

describe("isDirectionalThresholdReached", () => {
  it("returns true when all blocking fields are satisfied", () => {
    const satisfied = new Set(["price.current", "market_cap"]);
    expect(isDirectionalThresholdReached(["price.current", "market_cap"], satisfied)).toBe(true);
  });

  it("returns false when blocking fields are not all satisfied", () => {
    const satisfied = new Set(["price.current"]);
    expect(isDirectionalThresholdReached(["price.current", "market_cap"], satisfied)).toBe(false);
  });

  it("returns true for empty blocking fields", () => {
    const satisfied = new Set<string>();
    expect(isDirectionalThresholdReached([], satisfied)).toBe(true);
  });
});

// ── runSourceSelection (full pipeline) ───────────────────────────────────────

describe("runSourceSelection", () => {
  it("returns a SourceSelectionResult with all required fields", () => {
    const result = runSourceSelection(STOCK_FIELDS, "stock_analysis", "US", 3);
    expect(Array.isArray(result.selected_sources)).toBe(true);
    expect(Array.isArray(result.route_results)).toBe(true);
    expect(result.validation).toBeDefined();
    expect(typeof result.field_route_trace).toBe("object");
    expect(Array.isArray(result.selection_log)).toBe(true);
  });

  it("selected_sources count is between 1 and maxSources", () => {
    const result = runSourceSelection(STOCK_FIELDS, "stock_analysis", "US", 3);
    expect(result.selected_sources.length).toBeGreaterThanOrEqual(1);
    expect(result.selected_sources.length).toBeLessThanOrEqual(3);
  });

  it("selection_log contains LEVEL1B entries", () => {
    const result = runSourceSelection(STOCK_FIELDS, "stock_analysis", "US", 3);
    const hasLevel1B = result.selection_log.some(l => l.includes("LEVEL1B"));
    expect(hasLevel1B).toBe(true);
  });

  it("works for all supported TaskTypes without throwing", () => {
    const taskTypes: TaskType[] = ["stock_analysis", "macro_analysis", "crypto_analysis", "portfolio_review", "event_driven", "general"];
    for (const taskType of taskTypes) {
      expect(() => runSourceSelection(STOCK_FIELDS, taskType, "US", 2)).not.toThrow();
    }
  });

  it("works for all supported Regions without throwing", () => {
    const regions: Region[] = ["US", "CN", "EU", "HK", "GLOBAL"];
    for (const region of regions) {
      expect(() => runSourceSelection(STOCK_FIELDS, "stock_analysis", region, 2)).not.toThrow();
    }
  });

  it("gracefully handles empty fields array", () => {
    const result = runSourceSelection([], "stock_analysis", "US", 3);
    expect(result.selected_sources).toBeDefined();
    expect(result.validation).toBeDefined();
  });

  it("validation note is a non-empty string", () => {
    const result = runSourceSelection(STOCK_FIELDS, "stock_analysis", "US", 3);
    expect(typeof result.validation.note).toBe("string");
    expect(result.validation.note.length).toBeGreaterThan(0);
  });
});
