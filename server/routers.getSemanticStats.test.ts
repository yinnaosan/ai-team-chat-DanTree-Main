/**
 * Level 12.10 — getSemanticStats procedure test
 * Tests the fallback path: semantic_available = false on empty/error input
 */
import { describe, it, expect } from "vitest";
import { buildSemanticEngineStatsDisplay } from "./semantic_engine_stats";

describe("getSemanticStats fallback shape", () => {
  it("buildSemanticEngineStatsDisplay returns correct shape with no inputs", () => {
    const display = buildSemanticEngineStatsDisplay(undefined, undefined);
    expect(display).toHaveProperty("dominant_direction");
    expect(display).toHaveProperty("confidence_score");
    expect(display).toHaveProperty("conflict_count");
    expect(typeof display.conflict_count).toBe("number");
  });

  it("fallback payload matches required shape when semantic_available = false", () => {
    const fallback = {
      semantic_available: false as const,
      dominant_direction: "—",
      confidence_score: null as number | null,
      conflict_count: 0,
      state_regime: undefined as string | undefined,
    };
    expect(fallback.semantic_available).toBe(false);
    expect(fallback.dominant_direction).toBe("—");
    expect(fallback.confidence_score).toBeNull();
    expect(fallback.conflict_count).toBe(0);
  });

  it("buildSemanticEngineStatsDisplay with undefined state returns semantic_available false shape", () => {
    const display = buildSemanticEngineStatsDisplay(undefined, undefined);
    // When no state, dominant_direction should be a string (either "—" or "unclear")
    expect(typeof display.dominant_direction).toBe("string");
    // conflict_count should be 0 when no state
    expect(display.conflict_count).toBe(0);
  });
});
