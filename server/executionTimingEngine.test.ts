/**
 * executionTimingEngine.test.ts — DanTree Level 19.0-B
 *
 * TC-ETE-01: readiness_state derivation (including preflight guards)
 * TC-ETE-02: entry_quality derivation
 * TC-ETE-03: timing_risk derivation
 * TC-ETE-04: confirmation_state derivation (including G4 guard)
 * TC-ETE-05: action_bias derivation
 * TC-ETE-06: no_action_reason derivation
 * TC-ETE-07: basket_readiness conservative aggregation
 * TC-ETE-08: basket_action_bias plurality logic
 * TC-ETE-09: concentration_constraint derivation
 * TC-ETE-10: null/fallback handling
 * TC-ETE-11: advisory_only always true
 */

import { describe, it, expect } from "vitest";
import {
  buildExecutionTimingResult,
  buildBasketTimingResult,
  buildTimingSummary,
  buildBasketTimingSummary,
  BasketTimingValidationError,
  type EntityTimingInput,
  type ExecutionTimingResult,
  type BasketTimingInput,
} from "./executionTimingEngine";
import type { EntityThesisState } from "./thesisStateEngine";
import type { AlertSummary } from "./alertEngine";
import type { ConcentrationRiskResult } from "./portfolioAnalysisEngine";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeThesisState(overrides: Partial<EntityThesisState> = {}): EntityThesisState {
  return {
    entity: "AAPL",
    generated_at: new Date().toISOString(),
    advisory_only: true,
    current_stance: "bullish",
    stance_confidence: 0.72,
    evidence_state: "strong",
    evidence_score: 72,
    gate_state: "pass",
    gate_mode: "decisive",
    fragility_state: "low",
    fragility_score: 0.28,
    source_state: "healthy",
    top_source: "yahoo_finance",
    alert_count: 0,
    highest_alert_severity: null,
    thesis_change_marker: "stable",
    state_summary_text: "Test summary.",
    ...overrides,
  };
}

function makeAlertSummary(count: number, severity: "low" | "medium" | "high" | "critical" | null = null): AlertSummary {
  return {
    alerts: [],
    alert_count: count,
    highest_severity: count > 0 ? (severity ?? "medium") : null,
    summary_text: count > 0 ? `${count} alerts` : "No alerts",
    advisory_only: true,
  };
}

function makeConcentration(level: "low" | "moderate" | "high", hhi = 0.3): ConcentrationRiskResult {
  return { hhi_score: hhi, level, dominant_entity: level === "high" ? "AAPL" : null };
}

function makeInput(overrides: Partial<EntityTimingInput> = {}): EntityTimingInput {
  return {
    entity: "AAPL",
    thesisState: makeThesisState(),
    alertSummary: makeAlertSummary(0),
    semanticDirection: "positive",
    semanticFragility: 0.28,
    ...overrides,
  };
}

function makeTimingResult(overrides: Partial<ExecutionTimingResult> = {}): ExecutionTimingResult {
  const base = buildExecutionTimingResult(makeInput());
  return { ...base, ...overrides };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-01: readiness_state derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-01: readiness_state derivation", () => {
  it("ready when bullish + pass gate + stable marker + no alerts", () => {
    const result = buildExecutionTimingResult(makeInput());
    expect(result.readiness_state).toBe("ready");
  });

  it("blocked when critical alert", () => {
    const result = buildExecutionTimingResult(makeInput({
      alertSummary: makeAlertSummary(1, "critical"),
    }));
    expect(result.readiness_state).toBe("blocked");
  });

  it("blocked when gate=block + bearish stance", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ gate_state: "block", current_stance: "bearish" }),
    }));
    expect(result.readiness_state).toBe("blocked");
  });

  it("blocked when gate=block + reversal marker", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ gate_state: "block", thesis_change_marker: "reversal" }),
    }));
    expect(result.readiness_state).toBe("blocked");
  });

  // G1: synthetic fallback gate → conditional, not blocked
  it("G1: synthetic fallback gate → conditional (not blocked)", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ gate_state: "fallback", current_stance: "bullish" }),
    }));
    expect(result.readiness_state).toBe("conditional");
  });

  // G2: neutral stance → conditional, not blocked
  it("G2: neutral stance → conditional (not blocked)", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ current_stance: "neutral", gate_state: "pass" }),
    }));
    expect(result.readiness_state).toBe("conditional");
  });

  it("not_ready when thesisState is null", () => {
    const result = buildExecutionTimingResult(makeInput({ thesisState: null }));
    expect(result.readiness_state).toBe("not_ready");
  });

  it("not_ready when stance=unavailable", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ current_stance: "unavailable" }),
    }));
    expect(result.readiness_state).toBe("not_ready");
  });

  it("conditional when weakening marker", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ thesis_change_marker: "weakening", gate_state: "pass" }),
    }));
    expect(result.readiness_state).toBe("conditional");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-02: entry_quality derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-02: entry_quality derivation", () => {
  it("high when strong evidence + low fragility", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ evidence_state: "strong", fragility_state: "low" }),
      semanticFragility: 0.20,
    }));
    expect(result.entry_quality).toBe("high");
  });

  it("moderate when strong evidence + medium fragility", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ evidence_state: "strong", fragility_state: "medium" }),
      semanticFragility: 0.50,
    }));
    expect(result.entry_quality).toBe("moderate");
  });

  it("low when evidence=weak", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ evidence_state: "weak", fragility_state: "low" }),
    }));
    expect(result.entry_quality).toBe("low");
  });

  it("low when fragility=critical", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ fragility_state: "critical", evidence_state: "moderate" }),
    }));
    expect(result.entry_quality).toBe("low");
  });

  it("unavailable when evidence=insufficient", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ evidence_state: "insufficient" }),
    }));
    expect(result.entry_quality).toBe("unavailable");
  });

  it("unavailable when thesisState is null", () => {
    const result = buildExecutionTimingResult(makeInput({ thesisState: null }));
    expect(result.entry_quality).toBe("unavailable");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-03: timing_risk derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-03: timing_risk derivation", () => {
  it("critical when alert severity=critical", () => {
    const result = buildExecutionTimingResult(makeInput({
      alertSummary: makeAlertSummary(1, "critical"),
    }));
    expect(result.timing_risk).toBe("critical");
  });

  it("critical when fragility > 0.80", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticFragility: 0.85,
      alertSummary: makeAlertSummary(0),
    }));
    expect(result.timing_risk).toBe("critical");
  });

  it("high when fragility in (0.60, 0.80]", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticFragility: 0.70,
      alertSummary: makeAlertSummary(0),
    }));
    expect(result.timing_risk).toBe("high");
  });

  it("high when alert severity=high", () => {
    const result = buildExecutionTimingResult(makeInput({
      alertSummary: makeAlertSummary(1, "high"),
      semanticFragility: 0.30,
    }));
    expect(result.timing_risk).toBe("high");
  });

  it("medium when fragility in (0.40, 0.60]", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticFragility: 0.50,
      alertSummary: makeAlertSummary(0),
    }));
    expect(result.timing_risk).toBe("medium");
  });

  it("low when all conditions are safe", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticFragility: 0.20,
      alertSummary: makeAlertSummary(0),
    }));
    expect(result.timing_risk).toBe("low");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-04: confirmation_state derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-04: confirmation_state derivation", () => {
  it("confirmed when direction=positive + stance=bullish", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticDirection: "positive",
      thesisState: makeThesisState({ current_stance: "bullish" }),
    }));
    expect(result.confirmation_state).toBe("confirmed");
  });

  it("confirmed when direction=negative + stance=bearish", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticDirection: "negative",
      thesisState: makeThesisState({ current_stance: "bearish" }),
    }));
    expect(result.confirmation_state).toBe("confirmed");
  });

  it("conflicted when direction=positive + stance=bearish", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticDirection: "positive",
      thesisState: makeThesisState({ current_stance: "bearish" }),
    }));
    expect(result.confirmation_state).toBe("conflicted");
  });

  // G4: "unclear" → "unconfirmed" (not "conflicted")
  it("G4: unclear direction → unconfirmed (not conflicted)", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticDirection: "unclear",
      thesisState: makeThesisState({ current_stance: "bullish" }),
    }));
    expect(result.confirmation_state).toBe("unconfirmed");
  });

  it("unconfirmed when direction is null", () => {
    const result = buildExecutionTimingResult(makeInput({ semanticDirection: null }));
    expect(result.confirmation_state).toBe("unconfirmed");
  });

  it("partial when direction=neutral", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticDirection: "neutral",
      thesisState: makeThesisState({ current_stance: "bullish" }),
    }));
    expect(result.confirmation_state).toBe("partial");
  });

  it("conflicted when direction=mixed + bullish stance", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticDirection: "mixed",
      thesisState: makeThesisState({ current_stance: "bullish" }),
    }));
    expect(result.confirmation_state).toBe("conflicted");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-05: action_bias derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-05: action_bias derivation", () => {
  it("BUY when ready + confirmed + bullish", () => {
    const result = buildExecutionTimingResult(makeInput());
    expect(result.action_bias).toBe("BUY");
  });

  it("AVOID when readiness=blocked", () => {
    const result = buildExecutionTimingResult(makeInput({
      alertSummary: makeAlertSummary(1, "critical"),
    }));
    expect(result.action_bias).toBe("AVOID");
  });

  it("AVOID when timing_risk=critical", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticFragility: 0.90,
      alertSummary: makeAlertSummary(0),
    }));
    expect(result.action_bias).toBe("AVOID");
  });

  it("WAIT when confirmation=conflicted", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticDirection: "positive",
      thesisState: makeThesisState({ current_stance: "bearish", gate_state: "pass" }),
    }));
    expect(result.action_bias).toBe("WAIT");
  });

  it("WAIT when readiness=not_ready", () => {
    const result = buildExecutionTimingResult(makeInput({ thesisState: null }));
    expect(result.action_bias).toBe("WAIT");
  });

  it("NONE when stance=unavailable", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ current_stance: "unavailable" }),
    }));
    expect(result.action_bias).toBe("NONE");
  });

  it("HOLD when ready + partial confirmation + bullish", () => {
    const result = buildExecutionTimingResult(makeInput({
      semanticDirection: "neutral",
      thesisState: makeThesisState({ current_stance: "bullish", gate_state: "pass" }),
    }));
    expect(result.action_bias).toBe("HOLD");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-06: no_action_reason derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-06: no_action_reason derivation", () => {
  it("no_action_reason=null when BUY", () => {
    const result = buildExecutionTimingResult(makeInput());
    expect(result.action_bias).toBe("BUY");
    expect(result.no_action_reason).toBeNull();
  });

  it("no_action_reason is non-empty string when AVOID", () => {
    const result = buildExecutionTimingResult(makeInput({
      alertSummary: makeAlertSummary(1, "critical"),
    }));
    expect(result.action_bias).toBe("AVOID");
    expect(typeof result.no_action_reason).toBe("string");
    expect((result.no_action_reason ?? "").length).toBeGreaterThan(5);
  });

  it("no_action_reason is non-empty string when WAIT", () => {
    const result = buildExecutionTimingResult(makeInput({ thesisState: null }));
    expect(result.action_bias).toBe("WAIT");
    expect(typeof result.no_action_reason).toBe("string");
  });

  it("no_action_reason is non-empty string when NONE", () => {
    const result = buildExecutionTimingResult(makeInput({
      thesisState: makeThesisState({ current_stance: "unavailable" }),
    }));
    expect(result.action_bias).toBe("NONE");
    expect(typeof result.no_action_reason).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-07: basket_readiness conservative aggregation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-07: basket_readiness conservative aggregation", () => {
  it("basket_readiness=blocked when any entity is blocked", () => {
    const results = [
      makeTimingResult({ readiness_state: "ready" }),
      makeTimingResult({ readiness_state: "blocked" }),
    ];
    const basket = buildBasketTimingResult({ entities: ["AAPL", "MSFT"], entityResults: results });
    expect(basket.basket_readiness).toBe("blocked");
  });

  it("basket_readiness=not_ready when any entity is not_ready (no blocked)", () => {
    const results = [
      makeTimingResult({ readiness_state: "ready" }),
      makeTimingResult({ readiness_state: "not_ready" }),
    ];
    const basket = buildBasketTimingResult({ entities: ["AAPL", "MSFT"], entityResults: results });
    expect(basket.basket_readiness).toBe("not_ready");
  });

  it("basket_readiness=conditional when worst is conditional", () => {
    const results = [
      makeTimingResult({ readiness_state: "ready" }),
      makeTimingResult({ readiness_state: "conditional" }),
    ];
    const basket = buildBasketTimingResult({ entities: ["AAPL", "MSFT"], entityResults: results });
    expect(basket.basket_readiness).toBe("conditional");
  });

  it("basket_readiness=ready when all entities are ready", () => {
    const results = [
      makeTimingResult({ readiness_state: "ready" }),
      makeTimingResult({ readiness_state: "ready" }),
    ];
    const basket = buildBasketTimingResult({ entities: ["AAPL", "MSFT"], entityResults: results });
    expect(basket.basket_readiness).toBe("ready");
  });

  it("throws BasketTimingValidationError when entities < 2", () => {
    expect(() =>
      buildBasketTimingResult({ entities: ["AAPL"], entityResults: [makeTimingResult()] })
    ).toThrow(BasketTimingValidationError);
  });

  it("throws when entities is empty", () => {
    expect(() =>
      buildBasketTimingResult({ entities: [], entityResults: [] })
    ).toThrow(BasketTimingValidationError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-08: basket_action_bias plurality logic
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-08: basket_action_bias plurality logic", () => {
  it("plurality BUY when majority entities are BUY", () => {
    const results = [
      makeTimingResult({ action_bias: "BUY" }),
      makeTimingResult({ action_bias: "BUY" }),
      makeTimingResult({ action_bias: "HOLD" }),
    ];
    const basket = buildBasketTimingResult({ entities: ["A", "B", "C"], entityResults: results });
    expect(basket.basket_action_bias).toBe("BUY");
  });

  it("plurality WAIT when majority entities are WAIT", () => {
    const results = [
      makeTimingResult({ action_bias: "WAIT" }),
      makeTimingResult({ action_bias: "WAIT" }),
      makeTimingResult({ action_bias: "BUY" }),
    ];
    const basket = buildBasketTimingResult({ entities: ["A", "B", "C"], entityResults: results });
    expect(basket.basket_action_bias).toBe("WAIT");
  });

  it("NONE when no entity results", () => {
    const basket = buildBasketTimingResult({ entities: ["A", "B"], entityResults: [] });
    expect(basket.basket_action_bias).toBe("NONE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-09: concentration_constraint derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-09: concentration_constraint derivation", () => {
  it("concentration_constraint is non-empty when level=high", () => {
    const basket = buildBasketTimingResult({
      entities: ["AAPL", "MSFT"],
      entityResults: [makeTimingResult(), makeTimingResult()],
      concentrationResult: makeConcentration("high", 0.65),
    });
    expect(basket.concentration_constraint).toBeTruthy();
    expect(basket.concentration_constraint).toContain("High concentration");
  });

  it("concentration_constraint includes dominant entity when present", () => {
    const basket = buildBasketTimingResult({
      entities: ["AAPL", "MSFT"],
      entityResults: [makeTimingResult(), makeTimingResult()],
      concentrationResult: makeConcentration("high", 0.65),
    });
    expect(basket.concentration_constraint).toContain("AAPL");
  });

  it("concentration_constraint=null when level=moderate", () => {
    const basket = buildBasketTimingResult({
      entities: ["AAPL", "MSFT"],
      entityResults: [makeTimingResult(), makeTimingResult()],
      concentrationResult: makeConcentration("moderate", 0.35),
    });
    expect(basket.concentration_constraint).toBeNull();
  });

  it("concentration_constraint=null when concentration is null", () => {
    const basket = buildBasketTimingResult({
      entities: ["AAPL", "MSFT"],
      entityResults: [makeTimingResult(), makeTimingResult()],
      concentrationResult: null,
    });
    expect(basket.concentration_constraint).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-10: null/fallback handling
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-10: null/fallback handling", () => {
  it("does not throw with all-null entity inputs", () => {
    expect(() =>
      buildExecutionTimingResult({
        entity: "AAPL",
        thesisState: null,
        alertSummary: null,
        semanticDirection: null,
        semanticFragility: null,
      })
    ).not.toThrow();
  });

  it("entity is preserved in result", () => {
    const result = buildExecutionTimingResult({ entity: "TSLA" });
    expect(result.entity).toBe("TSLA");
  });

  it("timing_summary is non-empty string", () => {
    const result = buildExecutionTimingResult(makeInput());
    expect(typeof result.timing_summary).toBe("string");
    expect(result.timing_summary.length).toBeGreaterThan(20);
  });

  it("basket_timing_summary is non-empty string", () => {
    const basket = buildBasketTimingResult({
      entities: ["AAPL", "MSFT"],
      entityResults: [makeTimingResult(), makeTimingResult()],
    });
    expect(typeof basket.basket_timing_summary).toBe("string");
    expect(basket.basket_timing_summary.length).toBeGreaterThan(20);
  });

  it("buildTimingSummary matches result.timing_summary", () => {
    const result = buildExecutionTimingResult(makeInput());
    expect(buildTimingSummary(result)).toBe(result.timing_summary);
  });

  it("buildBasketTimingSummary matches result.basket_timing_summary", () => {
    const basket = buildBasketTimingResult({
      entities: ["AAPL", "MSFT"],
      entityResults: [makeTimingResult(), makeTimingResult()],
    });
    expect(buildBasketTimingSummary(basket)).toBe(basket.basket_timing_summary);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-ETE-11: advisory_only always true
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-ETE-11: advisory_only always true", () => {
  it("ExecutionTimingResult.advisory_only=true", () => {
    const result = buildExecutionTimingResult(makeInput());
    expect(result.advisory_only).toBe(true);
  });

  it("BasketTimingResult.advisory_only=true", () => {
    const basket = buildBasketTimingResult({
      entities: ["AAPL", "MSFT"],
      entityResults: [makeTimingResult(), makeTimingResult()],
    });
    expect(basket.advisory_only).toBe(true);
  });

  it("timing_summary contains advisory disclaimer", () => {
    const result = buildExecutionTimingResult(makeInput());
    expect(result.timing_summary.toLowerCase()).toContain("advisory");
  });

  it("basket_timing_summary contains advisory disclaimer", () => {
    const basket = buildBasketTimingResult({
      entities: ["AAPL", "MSFT"],
      entityResults: [makeTimingResult(), makeTimingResult()],
    });
    expect(basket.basket_timing_summary.toLowerCase()).toContain("advisory");
  });
});
