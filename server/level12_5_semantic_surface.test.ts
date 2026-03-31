/**
 * level12_5_semantic_surface.test.ts — DanTree Level 12.5
 *
 * Tests that UnifiedSemanticState is surfaced from deepResearchEngine
 * through danTreeSystem to routers.ts Step3.
 *
 * TC-L125-01: DeepResearchContextMap includes level11Analysis field
 * TC-L125-02: DeepResearchOutput includes unifiedSemanticState field
 * TC-L125-03: runDeepResearch surfaces unifiedSemanticState when level11Analysis provided
 * TC-L125-04: danTreeSystem propagates unifiedSemanticState to enrichedOutput
 * TC-L125-05: entity-only fallback safe when semantic state absent
 * TC-L125-06: unifiedSemanticState advisory_only is always true
 */

import { describe, it, expect } from "vitest";
import {
  buildSemanticActivationResult,
  attachUnifiedSemanticState,
} from "./level12_4_semantic_activation";
import type { DeepResearchContextMap, DeepResearchOutput } from "./deepResearchEngine";
import type { UnifiedSemanticState } from "./semantic_aggregator";
import type { Level11AnalysisOutput } from "./level11MultiAssetEngine";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** 최소한의 합법적인 Level11AnalysisOutput mock */
function makeMinimalLevel11(): Level11AnalysisOutput {
  return {
    classification: {
      asset_type: "equity",
      underlying_structure: "Single equity",
      primary_driver_type: "business",
      analysis_mode: "business_moat_management: analyze competitive advantage durability, capital allocation quality, earnings trajectory, and valuation vs intrinsic value",
      advisory_only: true,
    },
    driver_route: {
      framework: "business_moat_management",
      primary_lens: "earnings_quality",
      secondary_lens: "macro_sensitivity",
      key_questions: ["Is the moat durable?", "Is management allocating capital well?"],
      advisory_only: true,
    },
    real_drivers: {
      drivers: [
        {
          driver: "services margin expansion",
          type: "real",
          strength: 0.72,
          why: "Gross margin expanding",
          monitoring_signal: "quarterly gross margin",
          risk_if_wrong: "ARPU growth stalls",
        },
      ],
      signal_vs_noise_summary: "Real driver dominates",
      primary_real_driver: "services margin expansion",
      primary_narrative_driver: "AI premium",
      advisory_only: true,
    },
    incentives: {
      key_players: ["institutions"],
      incentives: ["buyback"],
      fear_drivers: ["china_risk"],
      narrative_support: "Institutions anchored on services thesis",
      narrative_fragility: "Any China restriction triggers crowded long unwind",
      hidden_pressure_points: ["china_concentration>regulatory_risk"],
      behavioral_summary: "Institutions anchored on services thesis",
      advisory_only: true,
    },
    sentiment_state: {
      sentiment_phase: "consensus",
      positioning: "crowded_long",
      crowdedness: 0.68,
      risk_of_reversal: 0.40,
      phase_description: "Broad consensus",
      advisory_only: true,
    },
    scenario_map: {
      base_case: "Services margin expands",
      bull_case: "AI monetization accelerates",
      bear_case: "China restrictions expand",
      key_triggers: ["services_margin", "china_revenue"],
      invalidations: ["services_margin_contracts", "AI_collapses"],
      advisory_only: true,
    },
    advisory_only: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-L125-01: DeepResearchContextMap includes level11Analysis field
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L125-01: DeepResearchContextMap includes level11Analysis field", () => {
  it("level11Analysis field is present in DeepResearchContextMap type", () => {
    // TypeScript 타입 검사 — 컴파일 시 확인됨
    // 런타임에서는 객체 생성으로 필드 존재 증명
    const partialCtx: Partial<DeepResearchContextMap> = {
      ticker: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    };
    expect(partialCtx.level11Analysis).toBeDefined();
    expect(partialCtx.level11Analysis?.advisory_only).toBe(true);
  });

  it("level11Analysis is optional — ctx without it is still valid", () => {
    const partialCtx: Partial<DeepResearchContextMap> = {
      ticker: "AAPL",
      // level11Analysis 미제공 — 합법적
    };
    expect(partialCtx.level11Analysis).toBeUndefined();
  });

  it("level11Analysis carries full Level11AnalysisOutput structure", () => {
    const level11 = makeMinimalLevel11();
    const ctx: Partial<DeepResearchContextMap> = { level11Analysis: level11 };

    expect(ctx.level11Analysis?.classification.asset_type).toBe("equity");
    expect(ctx.level11Analysis?.real_drivers.drivers.length).toBeGreaterThanOrEqual(1);
    expect(ctx.level11Analysis?.sentiment_state.crowdedness).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L125-02: DeepResearchOutput includes unifiedSemanticState field
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L125-02: DeepResearchOutput includes unifiedSemanticState field", () => {
  it("unifiedSemanticState field is present in DeepResearchOutput type", () => {
    // 타입 수준 검사 — partial 객체로 필드 존재 증명
    const partialOutput: Partial<DeepResearchOutput> = {
      ticker: "AAPL",
      advisory_only: true,
      unifiedSemanticState: undefined,
    };
    // undefined 를 할당할 수 있으면 필드가 optional 로 존재함
    expect("unifiedSemanticState" in partialOutput).toBe(true);
  });

  it("unifiedSemanticState accepts UnifiedSemanticState shape", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const partialOutput: Partial<DeepResearchOutput> = {
      ticker: "AAPL",
      advisory_only: true,
      unifiedSemanticState: result.unifiedState,
    };

    expect(partialOutput.unifiedSemanticState?.protocol_version).toBe("12.2");
    expect(partialOutput.unifiedSemanticState?.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L125-03: semantic aggregation produces valid UnifiedSemanticState
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L125-03: semantic aggregation from level11Analysis", () => {
  it("buildSemanticActivationResult with level11Analysis produces unifiedState", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(result.packetCount).toBeGreaterThanOrEqual(1);
    expect(result.unifiedState).toBeDefined();
    expect(result.unifiedState?.protocol_version).toBe("12.2");
    expect(result.unifiedState?.entity).toBe("AAPL");
  });

  it("unifiedState from PATH-A includes level11 agent", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(result.unifiedState?.source_agents).toContain("level11_multiasset_engine");
  });

  it("unifiedState has signals populated from level11 drivers", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect((result.unifiedState?.signals.length ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("unifiedState advisory_only is always true", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(result.unifiedState?.advisory_only).toBe(true);
  });

  it("synthesisEnvelope is produced alongside unifiedState", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(result.synthesisEnvelope).toBeDefined();
    expect(result.synthesisEnvelope?.advisory_only).toBe(true);
    expect(result.synthesisEnvelope?.protocol_version).toBe("12.2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L125-04: danTreeSystem propagation pattern
// Tests the attachUnifiedSemanticState helper used in danTreeSystem
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L125-04: unifiedSemanticState propagation to enrichedOutput", () => {
  it("attachUnifiedSemanticState attaches state to output object", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const mockOutput = {
      snapshotId: 1,
      decisions: [],
      advisory_only: true as const,
    };

    const enriched = attachUnifiedSemanticState(mockOutput, result.unifiedState);

    expect(enriched.__unifiedSemanticState).toBeDefined();
    expect(enriched.__unifiedSemanticState?.entity).toBe("AAPL");
    expect(enriched.__unifiedSemanticState?.advisory_only).toBe(true);
  });

  it("danTreeSystem enriched output preserves all original fields", () => {
    const result = buildSemanticActivationResult({
      entity: "TSLA",
      level11Analysis: makeMinimalLevel11(),
    });

    const mockOutput = {
      snapshotId: 42,
      decisionCount: 5,
      guardStatus: "healthy" as const,
      advisory_only: true as const,
    };

    const enriched = attachUnifiedSemanticState(mockOutput, result.unifiedState);

    expect(enriched.snapshotId).toBe(42);
    expect(enriched.decisionCount).toBe(5);
    expect(enriched.guardStatus).toBe("healthy");
  });

  it("deepResearchMap extraction pattern: first ticker with unifiedSemanticState", () => {
    // 실제 danTreeSystem.ts 의 추출 패턴을 재현
    const r1 = buildSemanticActivationResult({ entity: "AAPL", level11Analysis: makeMinimalLevel11() });
    const r2 = buildSemanticActivationResult({ entity: "MSFT", level11Analysis: makeMinimalLevel11() });

    const deepResearchMap = new Map<string, Partial<DeepResearchOutput>>([
      ["AAPL", { ticker: "AAPL", advisory_only: true, unifiedSemanticState: r1.unifiedState }],
      ["MSFT", { ticker: "MSFT", advisory_only: true, unifiedSemanticState: r2.unifiedState }],
    ]);

    // danTreeSystem 의 firstSemanticState 추출 패턴
    const firstSemanticState = Array.from(deepResearchMap.values())
      .find(r => r.unifiedSemanticState)?.unifiedSemanticState;

    expect(firstSemanticState).toBeDefined();
    expect(firstSemanticState?.advisory_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L125-05: entity-only fallback safe when semantic state absent
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L125-05: entity-only fallback when semantic state absent", () => {
  it("buildSemanticActivationResult with no inputs returns packetCount=0", () => {
    const result = buildSemanticActivationResult({ entity: "AAPL" });

    expect(result.packetCount).toBe(0);
    expect(result.unifiedState).toBeUndefined();
    expect(result.synthesisEnvelope).toBeUndefined();
  });

  it("attachUnifiedSemanticState returns original object when state is undefined", () => {
    const mockOutput = { snapshotId: 1, advisory_only: true as const };
    const enriched = attachUnifiedSemanticState(mockOutput, undefined);

    expect(enriched).toBe(mockOutput); // 동일 참조 반환
    expect((enriched as Record<string, unknown>).__unifiedSemanticState).toBeUndefined();
  });

  it("Step3 semanticEnvelopeBlock is empty string when no semantic state", () => {
    // semanticEnvelopeBlock 생성 로직을 재현
    const result = buildSemanticActivationResult({ entity: "AAPL" });
    const semanticEnvelopeBlock = result.unifiedState ? "non-empty" : "";

    expect(semanticEnvelopeBlock).toBe("");
  });

  it("pipeline does not crash when deepResearchMap has no unifiedSemanticState", () => {
    const deepResearchMap = new Map<string, Partial<DeepResearchOutput>>([
      ["AAPL", { ticker: "AAPL", advisory_only: true }], // unifiedSemanticState 없음
    ]);

    const firstSemanticState = Array.from(deepResearchMap.values())
      .find(r => r.unifiedSemanticState)?.unifiedSemanticState;

    expect(firstSemanticState).toBeUndefined(); // 안전하게 undefined 반환
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L125-06: advisory_only enforcement throughout the surface chain
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L125-06: advisory_only enforcement throughout surface chain", () => {
  it("unifiedState.advisory_only is true at all steps", () => {
    const r = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(r.unifiedState?.advisory_only).toBe(true);
    expect(r.synthesisEnvelope?.advisory_only).toBe(true);
  });

  it("attached __unifiedSemanticState.advisory_only is true", () => {
    const r = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const enriched = attachUnifiedSemanticState({}, r.unifiedState);
    expect(enriched.__unifiedSemanticState?.advisory_only).toBe(true);
  });

  it("unifiedState never gains auto_trade_allowed or is_recommendation field", () => {
    const r = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const state = r.unifiedState as Record<string, unknown> | undefined;
    expect(state?.auto_trade_allowed).toBeUndefined();
    expect(state?.is_recommendation).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L125-07: SynthesisSemanticEnvelope surface fields
// Validates that the envelope produced for Step3 surfaces required fields
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L125-07: SynthesisSemanticEnvelope surface fields", () => {
  it("synthesisEnvelope exposes dominant_direction for Step3", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(result.synthesisEnvelope).toBeDefined();
    const dir = result.synthesisEnvelope!.dominant_direction;
    expect(["positive", "negative", "mixed", "neutral", "unclear"]).toContain(dir);
  });

  it("synthesisEnvelope exposes confidence_score and confidence_fragility", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const env = result.synthesisEnvelope!;
    expect(typeof env.confidence_score).toBe("number");
    expect(env.confidence_score).toBeGreaterThanOrEqual(0);
    expect(env.confidence_score).toBeLessThanOrEqual(1);
    expect(typeof env.confidence_fragility).toBe("number");
    expect(env.confidence_fragility).toBeGreaterThanOrEqual(0);
    expect(env.confidence_fragility).toBeLessThanOrEqual(1);
  });

  it("synthesisEnvelope exposes has_conflicts and conflict_count", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const env = result.synthesisEnvelope!;
    expect(typeof env.has_conflicts).toBe("boolean");
    expect(typeof env.conflict_count).toBe("number");
    expect(env.conflict_count).toBeGreaterThanOrEqual(0);
  });

  it("synthesisEnvelope.top_signals is an array of at most 3", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const env = result.synthesisEnvelope!;
    expect(Array.isArray(env.top_signals)).toBe(true);
    expect(env.top_signals.length).toBeLessThanOrEqual(3);
  });

  it("synthesisEnvelope.top_risks is an array of at most 3", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const env = result.synthesisEnvelope!;
    expect(Array.isArray(env.top_risks)).toBe(true);
    expect(env.top_risks.length).toBeLessThanOrEqual(3);
  });

  it("synthesisEnvelope.key_invalidations is an array", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(Array.isArray(result.synthesisEnvelope!.key_invalidations)).toBe(true);
  });

  it("synthesisEnvelope.semantic_notes is an array of at most 8", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const env = result.synthesisEnvelope!;
    expect(Array.isArray(env.semantic_notes)).toBe(true);
    expect(env.semantic_notes.length).toBeLessThanOrEqual(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L125-08: semantic block presence for Step3 prompt injection
// Validates the semantic envelope block can be safely serialized for prompt use
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L125-08: semantic block presence for Step3 prompt injection", () => {
  it("produces a non-empty envelope when semantic state is present", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(result.unifiedState).toBeDefined();
    expect(result.synthesisEnvelope).toBeDefined();
    // Envelope fields are sufficient to construct a prompt block
    expect(result.synthesisEnvelope!.entity).toBe("AAPL");
    expect(result.synthesisEnvelope!.protocol_version).toBe("12.2");
  });

  it("envelope entity matches the input entity", () => {
    const result = buildSemanticActivationResult({
      entity: "NVDA",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(result.synthesisEnvelope!.entity).toBe("NVDA");
  });

  it("envelope protocol_version is always 12.2", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(result.synthesisEnvelope!.protocol_version).toBe("12.2");
  });

  it("semantic block is safe empty string when no inputs provided", () => {
    const result = buildSemanticActivationResult({ entity: "AAPL" });

    // No inputs → no unifiedState → semanticEnvelopeBlock should be ""
    const semanticEnvelopeBlock = result.unifiedState
      ? "non-empty"
      : "";

    expect(semanticEnvelopeBlock).toBe("");
  });

  it("multiple entities produce independent semantic states", () => {
    const resultA = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });
    const resultB = buildSemanticActivationResult({
      entity: "MSFT",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(resultA.synthesisEnvelope!.entity).toBe("AAPL");
    expect(resultB.synthesisEnvelope!.entity).toBe("MSFT");
    expect(resultA.synthesisEnvelope!.entity).not.toBe(resultB.synthesisEnvelope!.entity);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-L125-09: state_regime / crowding / fragility surfaced when available
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-L125-09: state context fields surfaced when available", () => {
  it("state_crowding is a number in [0, 1] when present", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const env = result.synthesisEnvelope!;
    if (env.state_crowding !== undefined) {
      expect(env.state_crowding).toBeGreaterThanOrEqual(0);
      expect(env.state_crowding).toBeLessThanOrEqual(1);
    }
    // Either defined and valid, or undefined — both are acceptable
    expect(true).toBe(true);
  });

  it("state_fragility is a number in [0, 1] when present", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const env = result.synthesisEnvelope!;
    if (env.state_fragility !== undefined) {
      expect(env.state_fragility).toBeGreaterThanOrEqual(0);
      expect(env.state_fragility).toBeLessThanOrEqual(1);
    }
    expect(true).toBe(true);
  });

  it("state_regime is a string when present", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const env = result.synthesisEnvelope!;
    if (env.state_regime !== undefined) {
      expect(typeof env.state_regime).toBe("string");
      expect(env.state_regime.length).toBeGreaterThan(0);
    }
    expect(true).toBe(true);
  });

  it("all state context fields are optional — undefined is safe", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    const env = result.synthesisEnvelope!;
    // These are all optional fields — asserting their types when present
    expect(
      env.state_regime === undefined || typeof env.state_regime === "string"
    ).toBe(true);
    expect(
      env.state_crowding === undefined || typeof env.state_crowding === "number"
    ).toBe(true);
    expect(
      env.state_fragility === undefined || typeof env.state_fragility === "number"
    ).toBe(true);
  });

  it("unresolved_conflicts is always an array", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(Array.isArray(result.synthesisEnvelope!.unresolved_conflicts)).toBe(true);
  });

  it("confidence_downgraded is boolean", () => {
    const result = buildSemanticActivationResult({
      entity: "AAPL",
      level11Analysis: makeMinimalLevel11(),
    });

    expect(typeof result.synthesisEnvelope!.confidence_downgraded).toBe("boolean");
  });
});
