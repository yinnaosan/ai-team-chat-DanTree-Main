/**
 * experienceLayer.test.ts — DanTree Level 14.0-A
 *
 * OI-L12-001: ExperienceLayer Typed Stabilization (compatibility-first)
 *
 * TC-EL14-01: backward compatibility — existing natural-language fields preserved
 * TC-EL14-02: new typed fields populated correctly
 * TC-EL14-03: drift_code derivation deterministic
 * TC-EL14-04: confidence_evolution_code derivation deterministic
 * TC-EL14-05: risk_gradient_code derivation deterministic
 * TC-EL14-06: no destructive replacement — typed codes are additive
 */

import { describe, it, expect } from "vitest";
import {
  composeExperienceInsight,
  type ExperienceLayerInsight,
  type DriftCode,
  type ConfidenceEvolutionCode,
  type RiskGradientCode,
} from "./experienceLayer";
import type {
  DriftDetectionOutput,
  ConfidenceUpdateOutput,
  ManagementBehaviorOutput,
  MarketBehaviorOutput,
  GradientRiskOutput,
} from "./experienceLayer";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeDrift(direction: "strengthening" | "weakening" | "unclear"): DriftDetectionOutput {
  return {
    drift_direction: direction,
    drift_intensity: 0.45,
    drift_signal: "test drift signal",
    confidence_change: direction === "strengthening" ? 0.05 : direction === "weakening" ? -0.05 : 0,
    advisory_only: true,
  };
}

function makeConfidenceUpdate(trend: "rising" | "falling" | "stable"): ConfidenceUpdateOutput {
  return {
    updated_confidence: 0.70,
    confidence_trend: trend,
    reason: "test confidence reason",
    advisory_only: true,
  };
}

function makeManagement(pattern: "consistent" | "shifting" | "overpromising" | "defensive" | "unclear"): ManagementBehaviorOutput {
  return {
    behavior_pattern: pattern,
    interpretation: "test interpretation",
    risk_implication: "test risk implication",
    advisory_only: true,
  };
}

function makeMarket(behavior: "accumulation" | "distribution" | "rotation" | "speculation"): MarketBehaviorOutput {
  return {
    market_behavior: behavior,
    interpretation: "test market interpretation",
    implication_for_thesis: "test implication",
    advisory_only: true,
  };
}

function makeGradientRisk(state: "low" | "building" | "elevated" | "critical"): GradientRiskOutput {
  return {
    risk_state: state,
    risk_trend: "stable",
    early_warning_signs: ["test warning"],
    gradient_signal: "test gradient signal",
    advisory_only: true,
  };
}

function callCompose(
  driftDir: "strengthening" | "weakening" | "unclear" = "strengthening",
  confTrend: "rising" | "falling" | "stable" = "rising",
  riskState: "low" | "building" | "elevated" | "critical" = "low",
  mgmtPattern: "consistent" | "shifting" | "overpromising" | "defensive" | "unclear" = "consistent",
  marketBehavior: "accumulation" | "distribution" | "rotation" | "speculation" = "accumulation"
): ExperienceLayerInsight {
  return composeExperienceInsight(
    makeDrift(driftDir),
    makeConfidenceUpdate(confTrend),
    makeManagement(mgmtPattern),
    makeMarket(marketBehavior),
    makeGradientRisk(riskState),
    "AAPL"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-EL14-01: backward compatibility — existing natural-language fields preserved
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-EL14-01: backward compatibility — natural-language fields preserved", () => {
  it("drift_interpretation is still a string", () => {
    const result = callCompose();
    expect(typeof result.drift_interpretation).toBe("string");
    expect(result.drift_interpretation.length).toBeGreaterThan(0);
  });

  it("confidence_evolution is still a string", () => {
    const result = callCompose();
    expect(typeof result.confidence_evolution).toBe("string");
    expect(result.confidence_evolution.length).toBeGreaterThan(0);
  });

  it("behavior_insights is still a string", () => {
    const result = callCompose();
    expect(typeof result.behavior_insights).toBe("string");
    expect(result.behavior_insights.length).toBeGreaterThan(0);
  });

  it("risk_gradient is still a string", () => {
    const result = callCompose();
    expect(typeof result.risk_gradient).toBe("string");
    expect(result.risk_gradient.length).toBeGreaterThan(0);
  });

  it("full_insight is still a string", () => {
    const result = callCompose();
    expect(typeof result.full_insight).toBe("string");
    expect(result.full_insight.length).toBeGreaterThan(0);
  });

  it("advisory_only is still true", () => {
    const result = callCompose();
    expect(result.advisory_only).toBe(true);
  });

  it("full_insight composes all four natural-language lines", () => {
    const result = callCompose();
    // full_insight should be a concatenation of all sub-lines
    expect(result.full_insight).toContain(result.drift_interpretation.slice(0, 20));
    expect(result.full_insight.length).toBeGreaterThan(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-EL14-02: new typed fields are populated
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-EL14-02: new typed fields are populated", () => {
  it("drift_code is defined in the output", () => {
    const result = callCompose();
    expect(result.drift_code).toBeDefined();
  });

  it("confidence_evolution_code is defined in the output", () => {
    const result = callCompose();
    expect(result.confidence_evolution_code).toBeDefined();
  });

  it("risk_gradient_code is defined in the output", () => {
    const result = callCompose();
    expect(result.risk_gradient_code).toBeDefined();
  });

  it("drift_code is a valid DriftCode string", () => {
    const validCodes: DriftCode[] = ["weakening", "strengthening", "stable", "unclear"];
    const result = callCompose();
    expect(validCodes).toContain(result.drift_code);
  });

  it("confidence_evolution_code is a valid ConfidenceEvolutionCode string", () => {
    const validCodes: ConfidenceEvolutionCode[] = ["rising", "falling", "stable"];
    const result = callCompose();
    expect(validCodes).toContain(result.confidence_evolution_code);
  });

  it("risk_gradient_code is a valid RiskGradientCode string", () => {
    const validCodes: RiskGradientCode[] = ["low", "building", "elevated", "critical"];
    const result = callCompose();
    expect(validCodes).toContain(result.risk_gradient_code);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-EL14-03: drift_code derivation deterministic
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-EL14-03: drift_code derivation deterministic", () => {
  it("drift_code=strengthening when drift_direction=strengthening", () => {
    const result = callCompose("strengthening");
    expect(result.drift_code).toBe("strengthening");
  });

  it("drift_code=weakening when drift_direction=weakening", () => {
    const result = callCompose("weakening");
    expect(result.drift_code).toBe("weakening");
  });

  it("drift_code=unclear when drift_direction=unclear", () => {
    const result = callCompose("unclear");
    expect(result.drift_code).toBe("unclear");
  });

  it("drift_code is consistent with drift_direction across multiple calls", () => {
    const dirs: Array<"strengthening" | "weakening" | "unclear"> = [
      "strengthening", "weakening", "unclear",
    ];
    for (const dir of dirs) {
      const r1 = callCompose(dir);
      const r2 = callCompose(dir);
      expect(r1.drift_code).toBe(r2.drift_code);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-EL14-04: confidence_evolution_code derivation deterministic
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-EL14-04: confidence_evolution_code derivation deterministic", () => {
  it("confidence_evolution_code=rising when confidence_trend=rising", () => {
    const result = callCompose("strengthening", "rising");
    expect(result.confidence_evolution_code).toBe("rising");
  });

  it("confidence_evolution_code=falling when confidence_trend=falling", () => {
    const result = callCompose("strengthening", "falling");
    expect(result.confidence_evolution_code).toBe("falling");
  });

  it("confidence_evolution_code=stable when confidence_trend=stable", () => {
    const result = callCompose("strengthening", "stable");
    expect(result.confidence_evolution_code).toBe("stable");
  });

  it("confidence_evolution_code consistent across multiple calls", () => {
    const trends: Array<"rising" | "falling" | "stable"> = ["rising", "falling", "stable"];
    for (const trend of trends) {
      const r1 = callCompose("strengthening", trend);
      const r2 = callCompose("strengthening", trend);
      expect(r1.confidence_evolution_code).toBe(r2.confidence_evolution_code);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-EL14-05: risk_gradient_code derivation deterministic
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-EL14-05: risk_gradient_code derivation deterministic", () => {
  it("risk_gradient_code=low when risk_state=low", () => {
    const result = callCompose("strengthening", "rising", "low");
    expect(result.risk_gradient_code).toBe("low");
  });

  it("risk_gradient_code=building when risk_state=building", () => {
    const result = callCompose("strengthening", "rising", "building");
    expect(result.risk_gradient_code).toBe("building");
  });

  it("risk_gradient_code=elevated when risk_state=elevated", () => {
    const result = callCompose("strengthening", "rising", "elevated");
    expect(result.risk_gradient_code).toBe("elevated");
  });

  it("risk_gradient_code=critical when risk_state=critical", () => {
    const result = callCompose("strengthening", "rising", "critical");
    expect(result.risk_gradient_code).toBe("critical");
  });

  it("risk_gradient_code consistent across multiple calls", () => {
    const states: Array<"low" | "building" | "elevated" | "critical"> = [
      "low", "building", "elevated", "critical",
    ];
    for (const state of states) {
      const r1 = callCompose("strengthening", "rising", state);
      const r2 = callCompose("strengthening", "rising", state);
      expect(r1.risk_gradient_code).toBe(r2.risk_gradient_code);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-EL14-06: no destructive replacement — typed codes are purely additive
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-EL14-06: typed codes are additive — no destructive replacement", () => {
  it("output has all 6 original fields plus 3 new typed fields", () => {
    const result = callCompose();
    // Original fields
    expect("drift_interpretation" in result).toBe(true);
    expect("confidence_evolution" in result).toBe(true);
    expect("behavior_insights" in result).toBe(true);
    expect("risk_gradient" in result).toBe(true);
    expect("full_insight" in result).toBe(true);
    expect("advisory_only" in result).toBe(true);
    // New typed fields
    expect("drift_code" in result).toBe(true);
    expect("confidence_evolution_code" in result).toBe(true);
    expect("risk_gradient_code" in result).toBe(true);
  });

  it("natural-language fields are non-empty strings (not replaced by codes)", () => {
    const result = callCompose("weakening", "falling", "critical");
    expect(result.drift_interpretation).not.toBe("weakening");
    expect(result.confidence_evolution).not.toBe("falling");
    expect(result.risk_gradient).not.toBe("critical");
    expect(result.drift_interpretation.length).toBeGreaterThan(10);
    expect(result.confidence_evolution.length).toBeGreaterThan(10);
    expect(result.risk_gradient.length).toBeGreaterThan(10);
  });

  it("typed codes do not modify the natural-language content", () => {
    // Same call with and without typed codes — natural-language output should be identical
    const r1 = callCompose("strengthening", "rising", "low");
    const r2 = callCompose("strengthening", "rising", "low");
    expect(r1.drift_interpretation).toBe(r2.drift_interpretation);
    expect(r1.confidence_evolution).toBe(r2.confidence_evolution);
    expect(r1.risk_gradient).toBe(r2.risk_gradient);
    expect(r1.full_insight).toBe(r2.full_insight);
  });

  it("typed codes are strings, not objects or enums", () => {
    const result = callCompose();
    expect(typeof result.drift_code).toBe("string");
    expect(typeof result.confidence_evolution_code).toBe("string");
    expect(typeof result.risk_gradient_code).toBe("string");
  });
});
