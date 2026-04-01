/**
 * thesisStateEngine.test.ts — DanTree Level 18.0-B
 *
 * TC-TSE-01: entity stance derivation
 * TC-TSE-02: entity evidence/gate/fragility/source state derivation
 * TC-TSE-03: entity thesis_change_marker derivation
 * TC-TSE-04: basket dominant thesis / overlap derivation
 * TC-TSE-05: basket concentration / fragility derivation
 * TC-TSE-06: basket change marker derivation
 * TC-TSE-07: null/fallback handling
 * TC-TSE-08: advisory_only always true
 * TC-TSE-09: summary text generation
 */

import { describe, it, expect } from "vitest";
import {
  buildEntityThesisState,
  buildBasketThesisState,
  buildThesisStateSummaryText,
  buildBasketStateSummaryText,
  type EntityThesisStateInput,
  type BasketThesisStateInput,
  type GateResultInput,
  type SemanticStatsInput,
} from "./thesisStateEngine";
import type { PortfolioAnalysisResult } from "./portfolioAnalysisEngine";
import type { AlertSummary } from "./alertEngine";
import type { SourceSelectionResult } from "./sourceSelectionEngine";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeSemanticStats(overrides: Partial<SemanticStatsInput> = {}): SemanticStatsInput {
  return {
    dominant_direction: "positive",
    confidence_score: 0.72,
    confidence_fragility: 0.30,
    confidence_downgraded: false,
    ...overrides,
  };
}

function makeGateResult(overrides: Partial<GateResultInput> = {}): GateResultInput {
  return {
    gate_passed: true,
    is_synthetic_fallback: false,
    evidence_score: 65,
    gate_mode: "decisive",
    ...overrides,
  };
}

function makeSourceResult(health: "active" | "degraded" | "error" = "active"): SourceSelectionResult {
  return {
    selected_sources: [{ source_name: "yahoo_finance", score: 0.92, category: "financial", reason: "top source" }],
    route_results: [{ field: "price.current", primary: "yahoo_finance", fallbacks: [], score: 0.92, health }],
    validation: { consistency: true, confidence_adjustment: "neutral", conflict_fields: [], note: "" },
    field_route_trace: {},
    selection_log: [],
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

function makePortfolioResult(opts: {
  direction?: string;
  overlapRatio?: number;
  concentrationLevel?: "low" | "moderate" | "high";
  hhi?: number;
  avgFragility?: number;
  fragilityFlag?: boolean;
} = {}): PortfolioAnalysisResult {
  const direction = (opts.direction ?? "positive") as any;
  const overlapRatio = opts.overlapRatio ?? 0.8;
  const concLevel = opts.concentrationLevel ?? "low";
  const hhi = opts.hhi ?? 0.2;
  const avgFragility = opts.avgFragility ?? 0.3;
  const fragilityFlag = opts.fragilityFlag ?? false;

  return {
    entities: ["AAPL", "MSFT", "GOOGL"],
    basket_size: 3,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    entity_snapshots: [],
    thesis_overlap: {
      value: { dominant_direction: direction, overlap_count: 3, basket_size: 3, overlap_ratio: overlapRatio, direction_distribution: { positive: 3, negative: 0, mixed: 0, neutral: 0, unclear: 0, unavailable: 0 } },
      label: "thesis_overlap", advisory_only: true,
    },
    concentration_risk: {
      value: { hhi_score: hhi, level: concLevel, dominant_entity: concLevel === "high" ? "AAPL" : null },
      label: "concentration_risk", advisory_only: true,
    },
    shared_fragility: {
      value: { avg_fragility: avgFragility, fragility_flag: fragilityFlag, high_fragility_count: fragilityFlag ? 2 : 0 },
      label: "shared_fragility", advisory_only: true,
    },
    evidence_dispersion: {
      value: { std_dev: 5, min_score: 60, max_score: 75, mean_score: 67, scored_entity_count: 3 },
      label: "evidence_dispersion", advisory_only: true,
    },
    gate_distribution: {
      value: { pass_count: 3, block_count: 0, unavailable_count: 0, basket_investable: true, entity_gates: {} },
      label: "gate_distribution", advisory_only: true,
    },
    basket_summary: "Test basket summary. Advisory only.",
  };
}

function makeEntityInput(overrides: Partial<EntityThesisStateInput> = {}): EntityThesisStateInput {
  return {
    entity: "AAPL",
    semantic_stats: makeSemanticStats(),
    gate_result: makeGateResult(),
    source_result: makeSourceResult(),
    alert_summary: makeAlertSummary(0),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-TSE-01: entity stance derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-TSE-01: entity stance derivation", () => {
  it("stance=bullish when dominant_direction=positive", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ dominant_direction: "positive" }) }));
    expect(state.current_stance).toBe("bullish");
  });

  it("stance=bearish when dominant_direction=negative", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ dominant_direction: "negative" }) }));
    expect(state.current_stance).toBe("bearish");
  });

  it("stance=neutral when dominant_direction=neutral", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ dominant_direction: "neutral" }) }));
    expect(state.current_stance).toBe("neutral");
  });

  it("stance=mixed when dominant_direction=mixed", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ dominant_direction: "mixed" }) }));
    expect(state.current_stance).toBe("mixed");
  });

  it("stance=unavailable when no semantic stats", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: null }));
    expect(state.current_stance).toBe("unavailable");
  });

  it("stance_confidence matches confidence_score from semantic stats", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ confidence_score: 0.77 }) }));
    expect(state.stance_confidence).toBeCloseTo(0.77, 3);
  });

  it("stance_confidence=null when no semantic stats", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: null }));
    expect(state.stance_confidence).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-TSE-02: evidence / gate / fragility / source state derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-TSE-02: evidence / gate / fragility / source state derivation", () => {
  it("evidence_state=strong when evidence_score >= 70", () => {
    const state = buildEntityThesisState(makeEntityInput({ gate_result: makeGateResult({ evidence_score: 75 }) }));
    expect(state.evidence_state).toBe("strong");
  });

  it("evidence_state=moderate when evidence_score in [50, 70)", () => {
    const state = buildEntityThesisState(makeEntityInput({ gate_result: makeGateResult({ evidence_score: 60 }) }));
    expect(state.evidence_state).toBe("moderate");
  });

  it("evidence_state=weak when evidence_score in [30, 50)", () => {
    const state = buildEntityThesisState(makeEntityInput({ gate_result: makeGateResult({ evidence_score: 35 }) }));
    expect(state.evidence_state).toBe("weak");
  });

  it("evidence_state=insufficient when evidence_score < 30", () => {
    const state = buildEntityThesisState(makeEntityInput({ gate_result: makeGateResult({ evidence_score: 20 }) }));
    expect(state.evidence_state).toBe("insufficient");
  });

  it("evidence_state=insufficient when evidence_score is null", () => {
    const state = buildEntityThesisState(makeEntityInput({ gate_result: makeGateResult({ evidence_score: null }) }));
    expect(state.evidence_state).toBe("insufficient");
  });

  it("gate_state=pass when gate_passed=true and not fallback", () => {
    const state = buildEntityThesisState(makeEntityInput({ gate_result: makeGateResult({ gate_passed: true }) }));
    expect(state.gate_state).toBe("pass");
  });

  it("gate_state=block when gate_passed=false and not fallback", () => {
    const state = buildEntityThesisState(makeEntityInput({ gate_result: makeGateResult({ gate_passed: false, is_synthetic_fallback: false }) }));
    expect(state.gate_state).toBe("block");
  });

  it("gate_state=fallback when is_synthetic_fallback=true", () => {
    const state = buildEntityThesisState(makeEntityInput({ gate_result: makeGateResult({ gate_passed: false, is_synthetic_fallback: true }) }));
    expect(state.gate_state).toBe("fallback");
  });

  it("gate_state=fallback when gate_result is null", () => {
    const state = buildEntityThesisState(makeEntityInput({ gate_result: null }));
    expect(state.gate_state).toBe("fallback");
  });

  it("fragility_state=critical when fragility > 0.85", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ confidence_fragility: 0.90 }) }));
    expect(state.fragility_state).toBe("critical");
  });

  it("fragility_state=high when fragility in (0.65, 0.85]", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ confidence_fragility: 0.75 }) }));
    expect(state.fragility_state).toBe("high");
  });

  it("fragility_state=medium when fragility in (0.40, 0.65]", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ confidence_fragility: 0.55 }) }));
    expect(state.fragility_state).toBe("medium");
  });

  it("fragility_state=low when fragility <= 0.40", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ confidence_fragility: 0.30 }) }));
    expect(state.fragility_state).toBe("low");
  });

  it("source_state=healthy when all routes are active", () => {
    const state = buildEntityThesisState(makeEntityInput({ source_result: makeSourceResult("active") }));
    expect(state.source_state).toBe("healthy");
  });

  it("source_state=degraded when any route is degraded", () => {
    const state = buildEntityThesisState(makeEntityInput({ source_result: makeSourceResult("degraded") }));
    expect(state.source_state).toBe("degraded");
  });

  it("source_state=unavailable when source_result is null", () => {
    const state = buildEntityThesisState(makeEntityInput({ source_result: null }));
    expect(state.source_state).toBe("unavailable");
  });

  it("top_source populated from first selected_source", () => {
    const state = buildEntityThesisState(makeEntityInput({ source_result: makeSourceResult("active") }));
    expect(state.top_source).toBe("yahoo_finance");
  });

  it("top_source=null when source_result is null", () => {
    const state = buildEntityThesisState(makeEntityInput({ source_result: null }));
    expect(state.top_source).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-TSE-03: entity thesis_change_marker derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-TSE-03: entity thesis_change_marker derivation", () => {
  it("marker=strengthening when strong evidence + low fragility + gate pass", () => {
    const state = buildEntityThesisState(makeEntityInput({
      gate_result: makeGateResult({ gate_passed: true, evidence_score: 75 }),
      semantic_stats: makeSemanticStats({ confidence_fragility: 0.25 }),
    }));
    expect(state.thesis_change_marker).toBe("strengthening");
  });

  it("marker=weakening when fragility=critical", () => {
    const state = buildEntityThesisState(makeEntityInput({
      semantic_stats: makeSemanticStats({ confidence_fragility: 0.90 }),
      gate_result: makeGateResult({ evidence_score: 55 }),
    }));
    expect(state.thesis_change_marker).toBe("weakening");
  });

  it("marker=weakening when evidence=insufficient", () => {
    const state = buildEntityThesisState(makeEntityInput({
      gate_result: makeGateResult({ evidence_score: 20 }),
      semantic_stats: makeSemanticStats({ confidence_fragility: 0.30 }),
    }));
    expect(state.thesis_change_marker).toBe("weakening");
  });

  it("marker=reversal when gate=block + high alert severity", () => {
    const state = buildEntityThesisState(makeEntityInput({
      gate_result: makeGateResult({ gate_passed: false, evidence_score: 65 }),
      alert_summary: makeAlertSummary(2, "high"),
    }));
    expect(state.thesis_change_marker).toBe("reversal");
  });

  it("marker=unknown when stance=unavailable", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: null }));
    expect(state.thesis_change_marker).toBe("unknown");
  });

  it("marker=stable for a balanced normal case", () => {
    const state = buildEntityThesisState(makeEntityInput({
      gate_result: makeGateResult({ gate_passed: true, evidence_score: 60 }),
      semantic_stats: makeSemanticStats({ confidence_fragility: 0.35 }),
      alert_summary: makeAlertSummary(0),
    }));
    expect(state.thesis_change_marker).toBe("stable");
  });

  it("alert_count and highest_alert_severity from alert_summary", () => {
    const state = buildEntityThesisState(makeEntityInput({
      alert_summary: makeAlertSummary(3, "critical"),
    }));
    expect(state.alert_count).toBe(3);
    expect(state.highest_alert_severity).toBe("critical");
  });

  it("alert_count=0 and highest_alert_severity=null when no alerts", () => {
    const state = buildEntityThesisState(makeEntityInput({ alert_summary: makeAlertSummary(0) }));
    expect(state.alert_count).toBe(0);
    expect(state.highest_alert_severity).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-TSE-04: basket dominant thesis / overlap derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-TSE-04: basket dominant thesis and overlap derivation", () => {
  it("dominant_basket_thesis=aligned_bullish when positive direction + high overlap", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ direction: "positive", overlapRatio: 0.9 }) });
    expect(state.dominant_basket_thesis).toBe("aligned_bullish");
  });

  it("dominant_basket_thesis=aligned_bearish when negative direction + high overlap", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ direction: "negative", overlapRatio: 0.8 }) });
    expect(state.dominant_basket_thesis).toBe("aligned_bearish");
  });

  it("dominant_basket_thesis=divergent when overlap_ratio < 0.5", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ direction: "positive", overlapRatio: 0.4 }) });
    expect(state.dominant_basket_thesis).toBe("divergent");
  });

  it("dominant_basket_thesis=mixed when direction=mixed", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ direction: "mixed", overlapRatio: 0.7 }) });
    expect(state.dominant_basket_thesis).toBe("mixed");
  });

  it("overlap_intensity=high when ratio >= 0.85", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ overlapRatio: 0.90 }) });
    expect(state.overlap_intensity).toBe("high");
  });

  it("overlap_intensity=medium when ratio in [0.60, 0.85)", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ overlapRatio: 0.70 }) });
    expect(state.overlap_intensity).toBe("medium");
  });

  it("overlap_intensity=low when ratio in [0.40, 0.60)", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ overlapRatio: 0.50 }) });
    expect(state.overlap_intensity).toBe("low");
  });

  it("overlap_intensity=none when ratio < 0.40", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ overlapRatio: 0.35 }) });
    expect(state.overlap_intensity).toBe("none");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-TSE-05: basket concentration / fragility derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-TSE-05: basket concentration and fragility derivation", () => {
  it("concentration_state=safe when level=low", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ concentrationLevel: "low" }) });
    expect(state.concentration_state).toBe("safe");
  });

  it("concentration_state=elevated when level=moderate", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ concentrationLevel: "moderate" }) });
    expect(state.concentration_state).toBe("elevated");
  });

  it("concentration_state=high when level=high and hhi <= 0.6", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ concentrationLevel: "high", hhi: 0.50 }) });
    expect(state.concentration_state).toBe("high");
  });

  it("concentration_state=critical when level=high and hhi > 0.6", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ concentrationLevel: "high", hhi: 0.70 }) });
    expect(state.concentration_state).toBe("critical");
  });

  it("basket_fragility_state=low when avg_fragility low and no flag", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ avgFragility: 0.25, fragilityFlag: false }) });
    expect(state.basket_fragility_state).toBe("low");
  });

  it("basket_fragility_state=medium when fragility_flag=true", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ avgFragility: 0.55, fragilityFlag: true }) });
    expect(state.basket_fragility_state).toBe("medium");
  });

  it("basket_fragility_state=high when flagged + avg_fragility > 0.75", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ avgFragility: 0.80, fragilityFlag: true }) });
    expect(state.basket_fragility_state).toBe("high");
  });

  it("shared_fragility_flag mirrors portfolio result", () => {
    const stateA = buildBasketThesisState({ portfolioResult: makePortfolioResult({ fragilityFlag: true }) });
    const stateB = buildBasketThesisState({ portfolioResult: makePortfolioResult({ fragilityFlag: false }) });
    expect(stateA.shared_fragility_flag).toBe(true);
    expect(stateB.shared_fragility_flag).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-TSE-06: basket change marker derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-TSE-06: basket change marker derivation", () => {
  it("marker=concentrating when concentration_state=critical", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ concentrationLevel: "high", hhi: 0.80, overlapRatio: 0.7 }) });
    expect(state.basket_change_marker).toBe("concentrating");
  });

  it("marker=diverging when dominant_thesis=divergent", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ overlapRatio: 0.30 }) });
    expect(state.basket_change_marker).toBe("diverging");
  });

  it("marker=stable for normal aligned basket", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult({ direction: "positive", overlapRatio: 0.85, concentrationLevel: "low" }) });
    expect(state.basket_change_marker).toBe("stable");
  });

  it("marker=unknown when portfolioResult is null", () => {
    const state = buildBasketThesisState({ portfolioResult: null });
    expect(state.basket_change_marker).toBe("unknown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-TSE-07: null/fallback handling
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-TSE-07: null/fallback handling", () => {
  it("buildEntityThesisState does not throw with all-null inputs", () => {
    expect(() => buildEntityThesisState({
      entity: "AAPL",
      semantic_stats: null,
      gate_result: null,
      source_result: null,
      alert_summary: null,
    })).not.toThrow();
  });

  it("buildBasketThesisState does not throw when portfolioResult=null", () => {
    expect(() => buildBasketThesisState({ portfolioResult: null })).not.toThrow();
  });

  it("fallback basket state has unavailable dominant_basket_thesis", () => {
    const state = buildBasketThesisState({ portfolioResult: null });
    expect(state.dominant_basket_thesis).toBe("unavailable");
    expect(state.basket_size).toBe(0);
    expect(state.entities).toHaveLength(0);
  });

  it("entities and basket_size match portfolio result", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult() });
    expect(state.entities).toEqual(["AAPL", "MSFT", "GOOGL"]);
    expect(state.basket_size).toBe(3);
  });

  it("entity name is preserved in entity state", () => {
    const state = buildEntityThesisState({ entity: "NVDA" });
    expect(state.entity).toBe("NVDA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-TSE-08: advisory_only always true
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-TSE-08: advisory_only always true", () => {
  it("EntityThesisState.advisory_only=true", () => {
    const state = buildEntityThesisState(makeEntityInput());
    expect(state.advisory_only).toBe(true);
  });

  it("BasketThesisState.advisory_only=true", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult() });
    expect(state.advisory_only).toBe(true);
  });

  it("BasketThesisState fallback.advisory_only=true", () => {
    const state = buildBasketThesisState({ portfolioResult: null });
    expect(state.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-TSE-09: summary text generation
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-TSE-09: summary text generation", () => {
  it("state_summary_text is a non-empty string", () => {
    const state = buildEntityThesisState(makeEntityInput());
    expect(typeof state.state_summary_text).toBe("string");
    expect(state.state_summary_text.length).toBeGreaterThan(20);
  });

  it("state_summary_text includes entity name", () => {
    const state = buildEntityThesisState(makeEntityInput({ entity: "TSLA" }));
    expect(state.state_summary_text).toContain("TSLA");
  });

  it("state_summary_text includes stance", () => {
    const state = buildEntityThesisState(makeEntityInput({ semantic_stats: makeSemanticStats({ dominant_direction: "positive" }) }));
    expect(state.state_summary_text).toContain("bullish");
  });

  it("state_summary_text contains advisory disclaimer", () => {
    const state = buildEntityThesisState(makeEntityInput());
    expect(state.state_summary_text.toLowerCase()).toContain("advisory");
  });

  it("basket_state_summary_text is a non-empty string", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult() });
    expect(typeof state.basket_state_summary_text).toBe("string");
    expect(state.basket_state_summary_text.length).toBeGreaterThan(20);
  });

  it("basket_state_summary_text includes entity names", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult() });
    expect(state.basket_state_summary_text).toContain("AAPL");
  });

  it("basket_state_summary_text contains advisory disclaimer", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult() });
    expect(state.basket_state_summary_text.toLowerCase()).toContain("advisory");
  });

  it("buildThesisStateSummaryText produces same text as state_summary_text", () => {
    const state = buildEntityThesisState(makeEntityInput());
    const rebuilt = buildThesisStateSummaryText(state);
    expect(rebuilt).toBe(state.state_summary_text);
  });

  it("buildBasketStateSummaryText produces same text as basket_state_summary_text", () => {
    const state = buildBasketThesisState({ portfolioResult: makePortfolioResult() });
    const rebuilt = buildBasketStateSummaryText(state);
    expect(rebuilt).toBe(state.basket_state_summary_text);
  });
});
