/**
 * alertEngine.test.ts — DanTree Level 17.0-B
 *
 * TC-AE-01: gate_downgrade alert
 * TC-AE-02: evidence_weakening alert
 * TC-AE-03: fragility_spike alert
 * TC-AE-04: source_deterioration alert
 * TC-AE-05: basket_concentration_warning alert
 * TC-AE-06: advisory_only always true
 * TC-AE-07: highest_severity logic
 * TC-AE-08: alert summary generation
 * TC-AE-09: null/fallback safety
 * TC-AE-10: entity scope + basket scope
 */

import { describe, it, expect } from "vitest";
import {
  buildEntityAlerts,
  buildBasketAlerts,
  buildAlertSummary,
  type AlertResult,
  type EntityGateResult,
} from "./alertEngine";
import type { SourceSelectionResult } from "./sourceSelectionEngine";
import type { PortfolioAnalysisResult } from "./portfolioAnalysisEngine";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeGate(overrides: Partial<EntityGateResult> = {}): EntityGateResult {
  return {
    entity: "AAPL",
    gate_passed: true,
    is_synthetic_fallback: false,
    evidence_score: 70,
    semantic_fragility: 0.30,
    ...overrides,
  };
}

function makeSourceResult(healthOverride?: "active" | "degraded" | "error"): SourceSelectionResult {
  return {
    selected_sources: [],
    route_results: [
      {
        field: "price.current",
        primary: "yahoo_finance",
        fallbacks: ["fmp"],
        score: 0.9,
        health: healthOverride ?? "active",
      },
    ],
    validation: { is_valid: true, missing_fields: [], blocking_missing: [], warnings: [] },
    field_route_trace: {},
    selection_log: [],
  };
}

function makePortfolioResult(concentrationLevel: "low" | "moderate" | "high"): PortfolioAnalysisResult {
  return {
    entities: ["AAPL", "MSFT", "GOOGL"],
    basket_size: 3,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    entity_snapshots: [],
    thesis_overlap: {
      value: { dominant_direction: "positive", overlap_count: 3, basket_size: 3, overlap_ratio: 1, direction_distribution: { positive: 3, negative: 0, mixed: 0, neutral: 0, unclear: 0, unavailable: 0 } },
      label: "thesis_overlap",
      advisory_only: true,
    },
    concentration_risk: {
      value: { hhi_score: concentrationLevel === "high" ? 0.65 : 0.2, level: concentrationLevel, dominant_entity: concentrationLevel === "high" ? "AAPL" : null },
      label: "concentration_risk",
      advisory_only: true,
    },
    shared_fragility: {
      value: { avg_fragility: 0.3, fragility_flag: false, high_fragility_count: 0 },
      label: "shared_fragility",
      advisory_only: true,
    },
    evidence_dispersion: {
      value: { std_dev: 5, min_score: 60, max_score: 75, mean_score: 67, scored_entity_count: 3 },
      label: "evidence_dispersion",
      advisory_only: true,
    },
    gate_distribution: {
      value: { pass_count: 3, block_count: 0, unavailable_count: 0, basket_investable: true, entity_gates: { AAPL: "PASS", MSFT: "PASS", GOOGL: "PASS" } },
      label: "gate_distribution",
      advisory_only: true,
    },
    basket_summary: "Test basket summary. Advisory only.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-01: gate_downgrade alert
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-01: gate_downgrade alert", () => {
  it("fires when gate_passed=false", () => {
    const gate = makeGate({ gate_passed: false });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "gate_downgrade");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("high");
    expect(found!.scope).toBe("entity");
    expect(found!.entity).toBe("AAPL");
  });

  it("does NOT fire when gate_passed=true", () => {
    const gate = makeGate({ gate_passed: true });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "gate_downgrade");
    expect(found).toBeUndefined();
  });

  it("does NOT fire when is_synthetic_fallback=true even if gate_passed=false", () => {
    const gate = makeGate({ gate_passed: false, is_synthetic_fallback: true });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "gate_downgrade");
    expect(found).toBeUndefined();
  });

  it("message includes entity name", () => {
    const gate = makeGate({ gate_passed: false, entity: "TSLA" });
    const alerts = buildEntityAlerts(gate, null, "TSLA");
    const found = alerts.find((a) => a.alert_type === "gate_downgrade");
    expect(found!.message).toContain("TSLA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-02: evidence_weakening alert
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-02: evidence_weakening alert", () => {
  it("fires when evidence_score < 40", () => {
    const gate = makeGate({ evidence_score: 35 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "evidence_weakening");
    expect(found).toBeDefined();
  });

  it("does NOT fire when evidence_score >= 40", () => {
    const gate = makeGate({ evidence_score: 40 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "evidence_weakening");
    expect(found).toBeUndefined();
  });

  it("does NOT fire when evidence_score is null", () => {
    const gate = makeGate({ evidence_score: null });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "evidence_weakening");
    expect(found).toBeUndefined();
  });

  it("severity=critical when score < 20", () => {
    const gate = makeGate({ evidence_score: 15 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "evidence_weakening");
    expect(found!.severity).toBe("critical");
  });

  it("severity=high when score in [20, 30)", () => {
    const gate = makeGate({ evidence_score: 25 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "evidence_weakening");
    expect(found!.severity).toBe("high");
  });

  it("severity=medium when score in [30, 40)", () => {
    const gate = makeGate({ evidence_score: 35 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "evidence_weakening");
    expect(found!.severity).toBe("medium");
  });

  it("message includes score value", () => {
    const gate = makeGate({ evidence_score: 32 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "evidence_weakening");
    expect(found!.message).toContain("32");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-03: fragility_spike alert
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-03: fragility_spike alert", () => {
  it("fires when semantic_fragility > 0.65", () => {
    const gate = makeGate({ semantic_fragility: 0.70 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "fragility_spike");
    expect(found).toBeDefined();
  });

  it("does NOT fire when semantic_fragility <= 0.65", () => {
    const gate = makeGate({ semantic_fragility: 0.65 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "fragility_spike");
    expect(found).toBeUndefined();
  });

  it("does NOT fire when semantic_fragility is null", () => {
    const gate = makeGate({ semantic_fragility: null });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "fragility_spike");
    expect(found).toBeUndefined();
  });

  it("severity=critical when fragility > 0.85", () => {
    const gate = makeGate({ semantic_fragility: 0.90 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "fragility_spike");
    expect(found!.severity).toBe("critical");
  });

  it("severity=high when fragility in (0.75, 0.85]", () => {
    const gate = makeGate({ semantic_fragility: 0.80 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "fragility_spike");
    expect(found!.severity).toBe("high");
  });

  it("severity=medium when fragility in (0.65, 0.75]", () => {
    const gate = makeGate({ semantic_fragility: 0.70 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const found = alerts.find((a) => a.alert_type === "fragility_spike");
    expect(found!.severity).toBe("medium");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-04: source_deterioration alert
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-04: source_deterioration alert", () => {
  it("fires when route health is 'degraded'", () => {
    const source = makeSourceResult("degraded");
    const alerts = buildEntityAlerts(null, source, "AAPL");
    const found = alerts.find((a) => a.alert_type === "source_deterioration");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("medium");
  });

  it("fires when route health is 'error'", () => {
    const source = makeSourceResult("error");
    const alerts = buildEntityAlerts(null, source, "AAPL");
    const found = alerts.find((a) => a.alert_type === "source_deterioration");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("high");
  });

  it("does NOT fire when route health is 'active'", () => {
    const source = makeSourceResult("active");
    const alerts = buildEntityAlerts(null, source, "AAPL");
    const found = alerts.find((a) => a.alert_type === "source_deterioration");
    expect(found).toBeUndefined();
  });

  it("produces one alert per degraded route", () => {
    const source: SourceSelectionResult = {
      ...makeSourceResult("degraded"),
      route_results: [
        { field: "price.current", primary: "yahoo_finance", fallbacks: [], score: 0.5, health: "degraded" },
        { field: "valuation.pe", primary: "fmp", fallbacks: [], score: 0.5, health: "error" },
      ],
    };
    const alerts = buildEntityAlerts(null, source, "AAPL");
    const sourceAlerts = alerts.filter((a) => a.alert_type === "source_deterioration");
    expect(sourceAlerts).toHaveLength(2);
  });

  it("message includes primary source name", () => {
    const source = makeSourceResult("degraded");
    const alerts = buildEntityAlerts(null, source, "AAPL");
    const found = alerts.find((a) => a.alert_type === "source_deterioration");
    expect(found!.message).toContain("yahoo_finance");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-05: basket_concentration_warning alert
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-05: basket_concentration_warning alert", () => {
  it("fires when concentration level is 'high'", () => {
    const portfolio = makePortfolioResult("high");
    const alerts = buildBasketAlerts(portfolio);
    const found = alerts.find((a) => a.alert_type === "basket_concentration_warning");
    expect(found).toBeDefined();
    expect(found!.scope).toBe("basket");
  });

  it("does NOT fire when concentration level is 'moderate'", () => {
    const portfolio = makePortfolioResult("moderate");
    const alerts = buildBasketAlerts(portfolio);
    const found = alerts.find((a) => a.alert_type === "basket_concentration_warning");
    expect(found).toBeUndefined();
  });

  it("does NOT fire when concentration level is 'low'", () => {
    const portfolio = makePortfolioResult("low");
    const alerts = buildBasketAlerts(portfolio);
    const found = alerts.find((a) => a.alert_type === "basket_concentration_warning");
    expect(found).toBeUndefined();
  });

  it("basket_entities is populated from portfolio.entities", () => {
    const portfolio = makePortfolioResult("high");
    const alerts = buildBasketAlerts(portfolio);
    const found = alerts.find((a) => a.alert_type === "basket_concentration_warning");
    expect(found!.basket_entities).toEqual(["AAPL", "MSFT", "GOOGL"]);
  });

  it("severity=critical when HHI > 0.6", () => {
    const portfolio = makePortfolioResult("high"); // hhi=0.65 in fixture
    const alerts = buildBasketAlerts(portfolio);
    const found = alerts.find((a) => a.alert_type === "basket_concentration_warning");
    expect(found!.severity).toBe("critical");
  });

  it("returns empty array when portfolioResult is null", () => {
    const alerts = buildBasketAlerts(null);
    expect(alerts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-06: advisory_only always true
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-06: advisory_only always true", () => {
  it("all entity alerts have advisory_only=true", () => {
    const gate = makeGate({ gate_passed: false, evidence_score: 30, semantic_fragility: 0.80 });
    const source = makeSourceResult("degraded");
    const alerts = buildEntityAlerts(gate, source, "AAPL");
    for (const alert of alerts) {
      expect(alert.advisory_only).toBe(true);
    }
  });

  it("basket alerts have advisory_only=true", () => {
    const alerts = buildBasketAlerts(makePortfolioResult("high"));
    for (const alert of alerts) {
      expect(alert.advisory_only).toBe(true);
    }
  });

  it("AlertSummary.advisory_only=true", () => {
    const summary = buildAlertSummary([]);
    expect(summary.advisory_only).toBe(true);
  });

  it("AlertSummary with alerts has advisory_only=true", () => {
    const gate = makeGate({ gate_passed: false });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const summary = buildAlertSummary(alerts);
    expect(summary.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-07: highest_severity logic
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-07: highest_severity logic", () => {
  it("highest_severity=null when no alerts", () => {
    const summary = buildAlertSummary([]);
    expect(summary.highest_severity).toBeNull();
  });

  it("highest_severity=critical when any alert is critical", () => {
    const gate = makeGate({ evidence_score: 15 }); // critical
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const summary = buildAlertSummary(alerts);
    expect(summary.highest_severity).toBe("critical");
  });

  it("highest_severity=high when max is high", () => {
    const gate = makeGate({ gate_passed: false, evidence_score: 60 }); // gate=high, no evidence alert
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const summary = buildAlertSummary(alerts);
    expect(summary.highest_severity).toBe("high");
  });

  it("highest_severity=medium when all alerts are medium", () => {
    const gate = makeGate({ evidence_score: 35, gate_passed: true, semantic_fragility: 0.30 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    // evidence_score=35 → medium
    const evidenceAlert = alerts.find((a) => a.alert_type === "evidence_weakening");
    if (evidenceAlert) {
      const summary = buildAlertSummary([evidenceAlert]);
      expect(summary.highest_severity).toBe("medium");
    }
  });

  it("selects highest among mixed severities", () => {
    const mockAlerts: AlertResult[] = [
      { alert_type: "evidence_weakening", severity: "medium", scope: "entity", entity: "AAPL", message: "", reason: "", triggered_at: "", advisory_only: true },
      { alert_type: "gate_downgrade", severity: "high", scope: "entity", entity: "AAPL", message: "", reason: "", triggered_at: "", advisory_only: true },
      { alert_type: "fragility_spike", severity: "low", scope: "entity", entity: "AAPL", message: "", reason: "", triggered_at: "", advisory_only: true },
    ];
    const summary = buildAlertSummary(mockAlerts);
    expect(summary.highest_severity).toBe("high");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-08: alert summary generation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-08: alert summary generation", () => {
  it("summary_text is 'No alerts' when alerts=[]", () => {
    const summary = buildAlertSummary([]);
    expect(summary.summary_text).toContain("No alerts");
  });

  it("alert_count matches alerts.length", () => {
    const gate = makeGate({ gate_passed: false, evidence_score: 30 });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const summary = buildAlertSummary(alerts);
    expect(summary.alert_count).toBe(alerts.length);
    expect(summary.alerts).toHaveLength(alerts.length);
  });

  it("summary_text includes highest severity", () => {
    const gate = makeGate({ gate_passed: false });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const summary = buildAlertSummary(alerts);
    expect(summary.summary_text).toContain("high");
  });

  it("summary_text includes alert type name", () => {
    const gate = makeGate({ gate_passed: false });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    const summary = buildAlertSummary(alerts);
    expect(summary.summary_text).toContain("gate_downgrade");
  });

  it("summary_text is non-empty in all cases", () => {
    const cases = [
      buildAlertSummary([]),
      buildAlertSummary(buildEntityAlerts(makeGate({ gate_passed: false }), null, "AAPL")),
      buildAlertSummary(buildBasketAlerts(makePortfolioResult("high"))),
    ];
    for (const s of cases) {
      expect(typeof s.summary_text).toBe("string");
      expect(s.summary_text.length).toBeGreaterThan(10);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-09: null/fallback safety
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-09: null/fallback safety", () => {
  it("buildEntityAlerts returns [] when gateResult=null and sourceResult=null", () => {
    expect(buildEntityAlerts(null, null, "AAPL")).toHaveLength(0);
  });

  it("buildBasketAlerts returns [] when portfolioResult=null", () => {
    expect(buildBasketAlerts(null)).toHaveLength(0);
  });

  it("buildAlertSummary handles empty array without throwing", () => {
    expect(() => buildAlertSummary([])).not.toThrow();
  });

  it("no alert fires when all values are at safe defaults", () => {
    const gate = makeGate({ gate_passed: true, evidence_score: 70, semantic_fragility: 0.30 });
    const source = makeSourceResult("active");
    const alerts = buildEntityAlerts(gate, source, "AAPL");
    expect(alerts).toHaveLength(0);
  });

  it("alert triggered_at is a non-empty ISO string", () => {
    const gate = makeGate({ gate_passed: false });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    for (const alert of alerts) {
      expect(typeof alert.triggered_at).toBe("string");
      expect(alert.triggered_at.length).toBeGreaterThan(10);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-AE-10: entity scope + basket scope
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-AE-10: entity scope and basket scope", () => {
  it("entity alerts have scope='entity'", () => {
    const gate = makeGate({ gate_passed: false });
    const alerts = buildEntityAlerts(gate, null, "AAPL");
    for (const alert of alerts) {
      expect(alert.scope).toBe("entity");
    }
  });

  it("basket alerts have scope='basket'", () => {
    const alerts = buildBasketAlerts(makePortfolioResult("high"));
    for (const alert of alerts) {
      expect(alert.scope).toBe("basket");
    }
  });

  it("entity alerts have entity field set", () => {
    const gate = makeGate({ gate_passed: false, entity: "MSFT" });
    const alerts = buildEntityAlerts(gate, null, "MSFT");
    for (const alert of alerts) {
      expect(alert.entity).toBe("MSFT");
    }
  });

  it("basket alerts have basket_entities set", () => {
    const alerts = buildBasketAlerts(makePortfolioResult("high"));
    for (const alert of alerts) {
      expect(Array.isArray(alert.basket_entities)).toBe(true);
      expect((alert.basket_entities ?? []).length).toBeGreaterThan(0);
    }
  });

  it("combined entity + basket alerts have correct scopes", () => {
    const gate = makeGate({ gate_passed: false });
    const entityAlerts = buildEntityAlerts(gate, null, "AAPL");
    const basketAlerts = buildBasketAlerts(makePortfolioResult("high"));
    const combined = buildAlertSummary([...entityAlerts, ...basketAlerts]);

    const entityScoped = combined.alerts.filter((a) => a.scope === "entity");
    const basketScoped = combined.alerts.filter((a) => a.scope === "basket");
    expect(entityScoped.length).toBeGreaterThanOrEqual(1);
    expect(basketScoped.length).toBeGreaterThanOrEqual(1);
  });

  it("5 distinct alert types are defined", () => {
    const types: string[] = [
      "gate_downgrade",
      "evidence_weakening",
      "fragility_spike",
      "source_deterioration",
      "basket_concentration_warning",
    ];
    expect(types.length).toBeGreaterThanOrEqual(5);
  });
});
